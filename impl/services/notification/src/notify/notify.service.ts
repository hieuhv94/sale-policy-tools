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
import {
  bodyBanGiao,
  bodyFor,
  subjectBanGiao,
  subjectFor,
  type MailEvent,
} from './templates.js';

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
    // Bàn giao khách hàng rẽ NGAY ở đây (`0085`): nó là sự kiện duy nhất không
    // nói về một hồ sơ, nên cả khung thư lẫn cách tra người nhận đều khác.
    if (ev.routingKey === 'customer.handover') return this.banGiao(ev);

    const roles = Array.isArray(p['recipients']) ? (p['recipients'] as string[]) : [];
    const tdvUserId = s(p['tdvUserId']);

    // Sự kiện không có danh sách người nhận là sự kiện dành cho service khác
    // (`policy.superseded` cho reporting, `catalog.changed` cho audit). Bỏ qua
    // trong im lặng chứ không coi là lỗi — hàng đợi này nghe cả `policy.#`.
    if (roles.length === 0 || !tdvUserId) return 'ignored';

    const claimed = await this.claim(ev, s(p['policyId']), s(p['customerId']));
    if (!claimed) return 'duplicate';

    /** Lá thư chính đã bay đi chưa — quyết định nhánh dọn dẹp ở `catch`. */
    let daGuiChinh = false;
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
          WHERE event_id = $1 AND kind = 'CHINH'`,
        [ev.eventId, sent.messageId, sent.to, subject, threadKey, sent.attempts],
      );
      daGuiChinh = true;

      await this.baoNguoiDaTacDong(ev, mail, targets, threadKey);
      return 'sent';
    } catch (e) {
      /*
       * Trả lại chỗ đã giữ. Không làm bước này thì sự kiện vĩnh viễn bị coi là
       * "đã gửi" và lần gửi lại từ DLQ nào cũng bị chặn vì trùng khoá.
       *
       * NHƯNG CHỈ KHI LÁ THƯ CHÍNH CHƯA ĐI (`0037`). Nếu nó đã gửi rồi thì hỏng
       * ở đây là hỏng của thứ khác, và trả lại chỗ là biến một lỗi phụ thành
       * một lá thư trùng ở lần gửi lại. Đã dính đúng lỗi này: lá thư "để biết"
       * ném lỗi kiểu dữ liệu và kéo theo cả sự kiện đã gửi xong vào DLQ.
       */
      if (!daGuiChinh) {
        await this.db.q(`DELETE FROM ntf.sent_mail WHERE event_id = $1 AND kind = 'CHINH'`, [
          ev.eventId,
        ]);
      }
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
   * Thư BÀN GIAO KHÁCH HÀNG (`0085`).
   *
   * Người nhận bàn giao trước đây **không được báo gì cả**. Đo trên chồng demo
   * trước khi sửa: bàn giao 23 khách hàng và 140 hồ sơ từ `tdv01` sang `tdv02`,
   * số thư trong `ntf.sent_mail` đứng yên ở 342. Sự kiện `policy.handover` có
   * bay đi, nhưng nó không mang `recipients` lẫn `tdvUserId` nên `handle` bỏ qua
   * trong im lặng — đúng nhánh dành cho sự kiện của service khác. Người nhận
   * sáng hôm sau mở hộp việc lên và thấy thêm 140 hồ sơ lạ, có cái sắp quá hạn.
   *
   * MỘT lá thư cho MỘT lượt bàn giao, không phải một lá cho mỗi khách. Và nội
   * dung dừng ở đúng chỗ khách hàng đã chốt: *bạn được bàn giao chừng này khách,
   * từ ai*, kèm danh sách. Không kể hồ sơ — người vừa nhận 140 hồ sơ không đọc
   * hết một danh sách 140 mã trong thư, còn hộp việc thì nói con số ấy chính xác
   * và luôn cập nhật.
   *
   * KHÔNG có thư "để biết" đi kèm: người bàn giao vừa bị vô hiệu hoá tài khoản,
   * và Quản trị thì vừa tự tay bấm nút.
   */
  private async banGiao(ev: Incoming): Promise<Outcome> {
    const p = ev.payload;
    const nhan = s(p['tdvUserId']);
    const count = typeof p['count'] === 'number' ? p['count'] : 0;
    if (!nhan || count === 0) return 'ignored';

    if (!(await this.claim(ev))) return 'duplicate';

    try {
      // `byIds` chứ không `targetsFor`: người nhận đã biết đích danh, không có
      // vai trò nào phải dịch. Nó cũng lọc sẵn tài khoản đã vô hiệu hoá — người
      // nhận bàn giao thì không thể ở trạng thái đó, nhưng để identity trả lời
      // vẫn hơn là ở đây tự tin rằng không thể.
      const targets = await this.recipients.byIds([nhan]);
      if (targets.length === 0) throw new Error(`không tra được địa chỉ thư của ${nhan}`);

      const thu = {
        fromName: s(p['fromName']) ?? null,
        count,
        customers: Array.isArray(p['customers'])
          ? (p['customers'] as { code: string; name: string }[])
          : [],
        at: s(p['at']),
      };
      const subject = subjectBanGiao(thu);
      const sent = await this.withRetry(ev, () =>
        this.mailer.send({
          eventId: ev.eventId,
          to: targets.map((t) => t.email),
          subject,
          text: bodyBanGiao(thu, this.mailer.cfg.webBaseUrl),
          // Không gộp vào luồng thư của khách hàng nào: một lượt bàn giao nói
          // về cả tập khách, gộp nó vào hộp thoại của một khách là chôn nó ở
          // giữa một chuỗi thư về hồ sơ.
          threadKey: ev.eventId,
        }),
      );
      await this.db.q(
        `UPDATE ntf.sent_mail
            SET message_id = $2, to_addresses = $3, subject = $4, attempts = $5
          WHERE event_id = $1 AND kind = 'CHINH'`,
        [ev.eventId, sent.messageId, sent.to, subject, sent.attempts],
      );
      return 'sent';
    } catch (e) {
      await this.db
        .q(`DELETE FROM ntf.sent_mail WHERE event_id = $1 AND kind = 'CHINH'`, [ev.eventId])
        .catch(() => undefined);
      await this.db.q(
        `INSERT INTO ntf.dead_letter (event_id, routing_key, payload, attempts, last_error)
         VALUES ($1,$2,$3::jsonb,$4,$5)`,
        [
          ev.eventId,
          ev.routingKey,
          JSON.stringify(ev.payload),
          this.mailer.cfg.retryBackoffMs.length + 1,
          String(e instanceof Error ? e.message : e).slice(0, 2000),
        ],
      );
      this.log.error(`thư bàn giao ${ev.eventId} vào DLQ: ${String(e)}`);
      return 'dead';
    }
  }

  /**
   * Thư THỨ HAI: "để biết", gửi cho mọi người đã từng thao tác lên hồ sơ (`0036`).
   *
   * Vì sao là hai lá thư chứ không phải một lá gửi cho nhiều người hơn: HAI
   * NHÓM CẦN HAI ĐƯỜNG DẪN KHÁC NHAU. Người phải xử lý cần mở thẳng hồ sơ để
   * bấm nút; người chỉ cần biết thì mở hồ sơ ra chẳng có nút nào, nên liên kết
   * của họ trỏ vào NHẬT KÝ — nơi trả lời đúng câu họ đang hỏi: "từ lúc tôi rời
   * tay, hồ sơ này đã đi qua những đâu". Một lá thư chỉ mang được một liên kết.
   *
   * TRỪ BA NHÓM khỏi danh sách:
   *   * Người đã nhận lá thư thứ nhất — nhận hai thư cho một sự kiện là cách
   *     nhanh nhất khiến người ta ngừng đọc cả hai.
   *   * Người vừa bấm nút — họ vừa nhìn thấy kết quả trên màn hình.
   *   * Tài khoản đã vô hiệu hoá — lọc ở identity (`users/mail-targets`).
   *
   * HỎNG THÌ NUỐT. Đây là thư phụ; để nó kéo cả sự kiện vào DLQ là biến một
   * tiện ích thành một điểm hỏng cho lá thư chính — mà lá thư chính đã gửi
   * xong rồi, gửi lại từ DLQ sẽ thành thư trùng.
   */
  private async baoNguoiDaTacDong(
    ev: Incoming,
    mail: MailEvent,
    daNhan: { userId: string }[],
    threadKey: string,
  ): Promise<void> {
    const p = ev.payload;
    const ids = Array.isArray(p['observers']) ? (p['observers'] as string[]) : [];
    if (ids.length === 0) return;

    const bo = new Set([...daNhan.map((t) => t.userId), s(p['actorId']) ?? '']);
    const conLai = [...new Set(ids)].filter((id) => typeof id === 'string' && !bo.has(id));
    if (conLai.length === 0) return;

    /*
     * CÙNG `event_id`, khác `kind` (`0037`).
     *
     * Bản đầu tôi nhét hậu tố vào chính `event_id` (`<uuid>:theo-doi`) và cột
     * kiểu `uuid` từ chối — ở đúng chỗ tệ nhất, SAU khi lá thư chính đã gửi.
     * Khoá chống trùng giờ là cặp `(event_id, kind)`.
     */
    try {
      const targets = await this.recipients.byIds(conLai);
      if (targets.length === 0) return;
      if (
        !(await this.claim(ev, s(p['policyId']), s(p['customerId']), 'THEO_DOI'))
      ) {
        return;
      }

      // `eventId` của LÁ THƯ, dùng làm `Message-ID` — phải khác lá thư chính,
      // nếu không trình khách gộp hai thư thành một.
      const eventId = `${ev.eventId}:theo-doi`;
      const theoDoi: MailEvent = { ...mail, eventId, chiDeBiet: true };
      const subject = subjectFor(theoDoi);
      const sent = await this.mailer.send({
        eventId,
        to: targets.map((t) => t.email),
        subject,
        text: bodyFor(theoDoi, this.mailer.cfg.webBaseUrl),
        threadKey,
      });
      await this.db.q(
        `UPDATE ntf.sent_mail
            SET message_id = $2, to_addresses = $3, subject = $4, thread_key = $5, attempts = 1
          WHERE event_id = $1 AND kind = 'THEO_DOI'`,
        [ev.eventId, sent.messageId, sent.to, subject, threadKey],
      );
    } catch (e) {
      await this.db
        .q(`DELETE FROM ntf.sent_mail WHERE event_id = $1 AND kind = 'THEO_DOI'`, [ev.eventId])
        .catch(() => undefined);
      this.log.warn(`không gửi được thư "để biết" cho ${ev.eventId}: ${String(e)}`);
    }
  }

  /**
   * Giữ chỗ bằng chính ràng buộc UNIQUE của CSDL, không bằng SELECT rồi INSERT.
   *
   * Hai bản notification chạy song song cùng nhận một sự kiện thì cả hai đều
   * thấy "chưa có" ở câu SELECT, và cả hai đều gửi. `ON CONFLICT DO NOTHING`
   * thì đúng một bản thắng, không cần khoá phân tán nào (NTF-06).
   */
  private async claim(
    ev: Incoming,
    policyId?: string,
    customerId?: string,
    /** `0037` — một sự kiện có hai lá thư, nên khoá chống trùng là CẶP. */
    kind: 'CHINH' | 'THEO_DOI' = 'CHINH',
  ): Promise<boolean> {
    const r = await this.db.q<{ id: string }>(
      `INSERT INTO ntf.sent_mail
         (event_id, kind, routing_key, policy_id, customer_id, message_id, to_addresses, subject)
       VALUES ($1,$5,$2,$3,$4,'','{}','')
       ON CONFLICT (event_id, kind) DO NOTHING
       RETURNING id`,
      [ev.eventId, ev.routingKey, policyId ?? null, customerId ?? null, kind],
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
