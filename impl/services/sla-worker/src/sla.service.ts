/**
 * Vòng quét SLA: nhắc trước một ngày, và chuyển *Quá hạn duyệt* khi hết hạn.
 *
 * Ba tính chất phải giữ, và mỗi cái hỏng theo một kiểu riêng:
 *
 *   1. **Idempotent theo (hồ sơ, ngày).** Cron chạy 5 phút một lần nên trong
 *      ngày thứ 13 nó gặp cùng một hồ sơ 288 lần. Chống trùng bằng khoá chính
 *      trong CSDL chứ không bằng biến trong tiến trình — biến mất khi restart,
 *      và restart giữa vòng quét là chuyện bình thường (NTF-09, NTF-14).
 *
 *   2. **Chỉ một bản thực thi.** Chạy hai bản sla-worker để chịu tải hoặc trong
 *      lúc triển khai lăn là chuyện thường. Khoá phân tán Redis giữ cho chỉ một
 *      bản quét, và bản kia thoát ngay chứ không chờ (NTF-15).
 *
 *   3. **Lưu bước đang chờ.** *Quá hạn duyệt* là một cái nhãn, không phải một
 *      chặng mới. Không lưu `pending_step` thì sau khi quá hạn không ai biết hồ
 *      sơ đang chờ ai, và nó chỉ còn đường quay về đầu (NTF-10, NTF-11).
 */
import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { REDIS_URL } from '@csbh/http-kit';
import { Db, Clients } from '@csbh/policy/infra';
import { STEP_OF_STATUS, WAITING, type Status } from '@csbh/domain-policy';
import { Clock } from './clock.js';

const LOCK_KEY = 'csbh:sla:scan';
const LOCK_TTL_MS = 60_000;

/** Ai phải xử lý ở mỗi bước chờ — cũng chính là người nhận thư nhắc và thư quá hạn. */
const OWNER_ROLE: Record<string, string> = {
  CHO_TBP_DUYET: 'TBP',
  CHO_KT_L1: 'KE_TOAN',
  SA_DANG_XU_LY: 'SALE_ADMIN',
  CHO_KT_L2: 'KE_TOAN',
};

type WaitingRow = {
  id: string;
  code: string;
  status: Status;
  customer_id: string;
  tdv_user_id: string | null;
  /** Ba người được phân công (`0031`) — thư nhắc phải tới đúng người đang giữ hồ sơ. */
  tbp_user_id: string | null;
  ke_toan_user_id: string | null;
  sale_admin_user_id: string | null;
  sla_due_at: Date;
  row_version: number;
};

export type ScanResult = {
  skipped?: boolean;
  scanned: number;
  reminded: number;
  overdue: number;
};

@Injectable()
export class SlaService {
  private readonly log = new Logger(SlaService.name);
  private readonly redis = new Redis(REDIS_URL);

  constructor(
    private readonly db: Db,
    private readonly clients: Clients,
    private readonly clock: Clock,
  ) {}

  async slaDays(): Promise<number> {
    const r = await this.db.one<{ days: number }>(`SELECT days FROM pol.sla_config`);
    return r?.days ?? 14;
  }

  /**
   * Một vòng quét. Trả về `skipped: true` nếu bản khác đang giữ khoá.
   *
   * Khoá lấy bằng `SET ... NX PX`, và **chỉ bản giữ khoá mới được xoá nó** —
   * so token trước khi xoá. Không so thì một vòng quét chạy quá TTL sẽ xoá khoá
   * mà bản sau vừa lấy được, và hai bản chạy song song đúng lúc dữ liệu nhiều nhất.
   */
  async scan(): Promise<ScanResult> {
    const token = randomUUID();
    const got = await this.redis.set(LOCK_KEY, token, 'PX', LOCK_TTL_MS, 'NX');
    if (got !== 'OK') {
      this.log.debug('bản khác đang quét, bỏ lượt này');
      return { skipped: true, scanned: 0, reminded: 0, overdue: 0 };
    }

    try {
      return await this.doScan();
    } finally {
      const held = await this.redis.get(LOCK_KEY);
      if (held === token) await this.redis.del(LOCK_KEY);
    }
  }

  private async doScan(): Promise<ScanResult> {
    const now = this.clock.now();

    // `$1` là mốc thời gian của ĐỒNG HỒ TIÊM, không phải `now()` của Postgres.
    // Viết `now()` ở đây thì test đẩy giờ không có tác dụng và hai con số 13/14
    // ngày vĩnh viễn không kiểm được.
    const rows = await this.db.q<WaitingRow>(
      `SELECT id, code, status, customer_id, tdv_user_id,
              tbp_user_id, ke_toan_user_id, sale_admin_user_id, sla_due_at, row_version
         FROM pol.policy
        WHERE status::text = ANY($2::text[])
          AND sla_due_at IS NOT NULL
          AND sla_due_at <= $1::timestamptz + interval '1 day'
        ORDER BY sla_due_at`,
      [now.toISOString(), [...WAITING]],
    );

    let reminded = 0;
    let overdue = 0;
    for (const p of rows) {
      if (p.sla_due_at.getTime() <= now.getTime()) {
        if (await this.markOverdue(p, now)) overdue++;
      } else if (await this.remind(p, now)) {
        reminded++;
      }
    }
    return { scanned: rows.length, reminded, overdue };
  }

  // --- Nhắc trước một ngày --------------------------------------------------

  private async remind(p: WaitingRow, now: Date): Promise<boolean> {
    const forDate = now.toISOString().slice(0, 10);
    const claimed = await this.db.q<{ policy_id: string }>(
      `INSERT INTO pol.sla_reminder (policy_id, kind, for_date)
       VALUES ($1, 'SLA_REMINDER', $2::date)
       ON CONFLICT DO NOTHING
       RETURNING policy_id`,
      [p.id, forDate],
    );
    // Đã nhắc hồ sơ này hôm nay rồi. `ON CONFLICT DO NOTHING` là chốt chặn thật
    // sự: kiểm bằng SELECT rồi INSERT thì hai bản chạy song song đều thấy "chưa
    // có" — và khoá Redis ở trên cũng không cứu được nếu nó vừa hết TTL.
    if (claimed.length === 0) return false;

    await this.emit(p, 'sla.reminder', 'SLA_REMINDER', {
      'Hạn xử lý': p.sla_due_at.toISOString(),
    });
    return true;
  }

  // --- Chuyển Quá hạn duyệt -------------------------------------------------

  private async markOverdue(p: WaitingRow, now: Date): Promise<boolean> {
    const step = STEP_OF_STATUS[p.status];
    if (!step) return false;

    return this.db.tx(async (c) => {
      // `row_version` trong điều kiện: người phụ trách vừa bấm duyệt đúng lúc
      // vòng quét đang chạy thì hồ sơ đã sang bước khác, và đánh dấu quá hạn lúc
      // đó là ghi đè lên việc họ vừa làm xong.
      const upd = await c.query<{ id: string }>(
        `UPDATE pol.policy
            SET status = 'QUA_HAN_DUYET',
                pending_step = $2::pol.policy_step,
                row_version = row_version + 1
          WHERE id = $1 AND row_version = $3 AND status::text = ANY($4::text[])
          RETURNING id`,
        [p.id, step, p.row_version, [...WAITING]],
      );
      if (upd.rowCount === 0) return false;

      await c.query(
        `INSERT INTO pol.policy_event (policy_id, seq, from_status, to_status, action, actor_role)
         VALUES ($1, (SELECT coalesce(max(seq), 0) + 1 FROM pol.policy_event WHERE policy_id = $1),
                 $2::pol.policy_status, 'QUA_HAN_DUYET', 'SLA_OVERDUE', 'SYSTEM')`,
        [p.id, p.status],
      );

      const cus = await this.clients.customer(p.customer_id).catch(() => undefined);
      await c.query(`INSERT INTO pol.outbox (routing_key, payload) VALUES ($1, $2::jsonb)`, [
        'sla.overdue',
        JSON.stringify({
          policyId: p.id,
          policyCode: p.code,
          customerId: p.customer_id,
          customerCode: cus?.code,
          customerName: cus?.name,
          tdvUserId: p.tdv_user_id,
          tbpUserId: p.tbp_user_id,
          keToanUserId: p.ke_toan_user_id,
          saleAdminUserId: p.sale_admin_user_id,
          action: 'SLA_OVERDUE',
          toStatus: 'QUA_HAN_DUYET',
          // Bước đang chờ đi kèm THÔNG BÁO chứ không chỉ nằm trong CSDL: người
          // nhận thư cần biết ngay việc đang tắc ở đâu.
          pendingStep: p.status,
          recipients: [OWNER_ROLE[p.status] ?? 'TDV', 'TDV'],
          at: now.toISOString(),
          extra: { 'Hạn xử lý': p.sla_due_at.toISOString() },
        }),
      ]);
      return true;
    });
  }

  private async emit(
    p: WaitingRow,
    routingKey: string,
    action: string,
    extra: Record<string, string>,
  ): Promise<void> {
    const cus = await this.clients.customer(p.customer_id).catch(() => undefined);
    await this.db.q(`INSERT INTO pol.outbox (routing_key, payload) VALUES ($1, $2::jsonb)`, [
      routingKey,
      JSON.stringify({
        policyId: p.id,
        policyCode: p.code,
        customerId: p.customer_id,
        customerCode: cus?.code,
        customerName: cus?.name,
        tdvUserId: p.tdv_user_id,
        tbpUserId: p.tbp_user_id,
        keToanUserId: p.ke_toan_user_id,
        saleAdminUserId: p.sale_admin_user_id,
        action,
        toStatus: p.status,
        pendingStep: p.status,
        recipients: [OWNER_ROLE[p.status] ?? 'TDV', 'TDV'],
        at: this.clock.now().toISOString(),
        extra,
      }),
    ]);
  }

  // --- Dọn dữ liệu hết vòng đời ---------------------------------------------

  /**
   * Gọi `sys.run_retention()`. Hàm là SECURITY DEFINER nên nó xoá được ở cả bốn
   * schema mà role csbh_pol không có quyền — xem chú thích ở migration 0013.
   */
  async runRetention(): Promise<Record<string, unknown>> {
    const r = await this.db.one<{ run_retention: Record<string, unknown> }>(
      `SELECT sys.run_retention()`,
    );
    return r?.run_retention ?? {};
  }

  async close(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
