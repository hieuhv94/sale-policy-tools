/**
 * Xử lý một sự kiện: dịch vai trò sang người, dựng thư, gửi, ghi lại.
 *
 * Thứ tự "GIỮ CHỖ trước, gửi sau" là quyết định đáng cân nhắc nhất ở đây.
 *
 * Hàng đợi giao ít nhất một lần, nên cùng một sự kiện tới hai lần là chuyện
 * thường. Ghi trước rồi gửi thì mất thư nếu tiến trình chết đúng giữa hai bước;
 * gửi trước rồi ghi thì gửi trùng nếu chết đúng giữa hai bước. Chọn vế thứ nhất:
 *
 *   - Gửi trùng là thứ NGƯỜI DÙNG thấy và không sửa được — bốn thư giống hệt
 *     nhau làm họ mất tin vào mọi thông báo sau đó.
 *   - Mất một thư thì hồ sơ vẫn nằm nguyên trong danh sách "chờ tôi xử lý" ở
 *     trang chủ (NTF-07), tức là vẫn còn một đường thấy việc.
 *
 * Gửi hỏng thì chỗ đã giữ được TRẢ LẠI và sự kiện vào DLQ, nên gửi lại được.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Db } from '../infra/db.js';
import { Mailer } from '../infra/mailer.js';
import { RecipientsClient } from './recipients.js';
import { bodyFor, subjectFor, type MailEvent } from './templates.js';

export type Incoming = {
  eventId: string;
  routingKey: string;
  payload: Record<string, unknown>;
};

export type Outcome = 'sent' | 'duplicate' | 'ignored' | 'dead';

const s = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

@Injectable()
export class NotifyService {
  private readonly log = new Logger(NotifyService.name);

  constructor(
    private readonly db: Db,
    private readonly mailer: Mailer,
    private readonly recipients: RecipientsClient,
  ) {}

  async handle(ev: Incoming): Promise<Outcome> {
    const p = ev.payload;
    const roles = Array.isArray(p['recipients']) ? (p['recipients'] as string[]) : [];
    const tdvUserId = s(p['tdvUserId']);

    // Sự kiện không có danh sách người nhận là sự kiện dành cho service khác
    // (`policy.superseded` cho reporting, `catalog.changed` cho audit). Bỏ qua
    // trong im lặng chứ không coi là lỗi — hàng đợi này nghe cả `policy.#`.
    if (roles.length === 0 || !tdvUserId) return 'ignored';

    const claimed = await this.claim(ev, s(p['policyId']), s(p['customerId']));
    if (!claimed) return 'duplicate';

    try {
      // Bốn người của hồ sơ đi kèm sự kiện (`0031`). Sự kiện cũ trong hàng đợi
      // hoặc trong bảng thư hỏng không có ba khoá này — chúng rơi về `undefined`
      // và người nhận thu về còn mỗi TDV. Đúng hơn là ném lỗi: một lá thư thiếu
      // người nhận vẫn tới được người lập, còn ném lỗi thì không ai nhận gì.
      const targets = this.recipients.pick(
        await this.recipients.targetsFor(tdvUserId, {
          tbp: s(p['tbpUserId']),
          keToan: s(p['keToanUserId']),
          saleAdmin: s(p['saleAdminUserId']),
        }),
        roles,
      );
      if (targets.length === 0) throw new Error(`không tìm được người nhận cho vai trò ${roles}`);

      const mail: MailEvent = {
        eventId: ev.eventId,
        routingKey: ev.routingKey,
        action: s(p['action']),
        policyId: s(p['policyId']),
        policyCode: s(p['policyCode']),
        customerId: s(p['customerId']),
        customerCode: s(p['customerCode']),
        customerName: s(p['customerName']),
        toStatus: s(p['toStatus']),
        pendingStep: s(p['pendingStep']),
        at: s(p['at']),
        reason: s(p['reason']) ?? null,
        extra: isRecord(p['extra']) ? (p['extra'] as Record<string, string>) : {},
      };

      const threadKey = s(p['customerCode']) ?? s(p['customerId']) ?? ev.eventId;
      const subject = subjectFor(mail);
      const sent = await this.withRetry(ev, () =>
        this.mailer.send({
          eventId: ev.eventId,
          to: targets.map((t) => t.email),
          subject,
          text: bodyFor(mail, this.mailer.cfg.webBaseUrl),
          threadKey,
        }),
      );

      await this.db.q(
        `UPDATE ntf.sent_mail
            SET message_id = $2, to_addresses = $3, subject = $4, thread_key = $5, attempts = $6
          WHERE event_id = $1`,
        [ev.eventId, sent.messageId, sent.to, subject, threadKey, sent.attempts],
      );
      return 'sent';
    } catch (e) {
      // Trả lại chỗ đã giữ. Không làm bước này thì sự kiện vĩnh viễn bị coi là
      // "đã gửi" và lần gửi lại từ DLQ nào cũng bị chặn vì trùng event_id.
      await this.db.q(`DELETE FROM ntf.sent_mail WHERE event_id = $1`, [ev.eventId]);
      await this.db.q(
        `INSERT INTO ntf.dead_letter (event_id, routing_key, payload, attempts, last_error)
         VALUES ($1,$2,$3::jsonb,$4,$5)`,
        [
          ev.eventId,
          ev.routingKey,
          JSON.stringify(ev.payload),
          this.mailer.cfg.retryBackoffMs.length + 1,
          String(e instanceof Error ? e.message : e),
        ],
      );
      this.log.error(`sự kiện ${ev.eventId} vào DLQ: ${String(e)}`);
      return 'dead';
    }
  }

  /**
   * Giữ chỗ bằng chính ràng buộc UNIQUE của CSDL, không bằng SELECT rồi INSERT.
   *
   * Hai bản notification chạy song song cùng nhận một sự kiện thì cả hai đều
   * thấy "chưa có" ở câu SELECT, và cả hai đều gửi. `ON CONFLICT DO NOTHING`
   * thì đúng một bản thắng, không cần khoá phân tán nào (NTF-06).
   */
  private async claim(ev: Incoming, policyId?: string, customerId?: string): Promise<boolean> {
    const r = await this.db.q<{ id: string }>(
      `INSERT INTO ntf.sent_mail (event_id, routing_key, policy_id, customer_id, message_id, to_addresses, subject)
       VALUES ($1,$2,$3,$4,'','{}','')
       ON CONFLICT (event_id) DO NOTHING
       RETURNING id`,
      [ev.eventId, ev.routingKey, policyId ?? null, customerId ?? null],
    );
    return r.length > 0;
  }

  /** Thử lại có giãn cách; hết lượt thì ném ra để người gọi ghi DLQ (NTF-05). */
  private async withRetry<T extends object>(
    ev: Incoming,
    fn: () => Promise<T>,
  ): Promise<T & { attempts: number }> {
    const backoff = this.mailer.cfg.retryBackoffMs;
    let last: unknown;
    for (let i = 0; i <= backoff.length; i++) {
      try {
        return { ...(await fn()), attempts: i + 1 };
      } catch (e) {
        last = e;
        this.log.warn(`gửi thư hỏng lần ${i + 1} cho ${ev.eventId}: ${String(e)}`);
        const wait = backoff[i];
        if (wait !== undefined) await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw last;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
