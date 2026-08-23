/**
 * Vòng quét SLA: nhắc trước một ngày, chuyển *Quá hạn duyệt* khi hết hạn, rồi
 * tự xoá hồ sơ quá hạn đã đủ 3 ngày (`0047`).
 *
 * Ba tính chất phải giữ, và mỗi cái hỏng theo một kiểu riêng:
 *
 *   1. **Idempotent theo (hồ sơ, MỐC HẠN).** Cron chạy 5 phút một lần nên trong
 *      ngày cuối nó gặp cùng một hồ sơ 288 lần. Chống trùng bằng khoá chính
 *      trong CSDL chứ không bằng biến trong tiến trình — biến mất khi restart,
 *      và restart giữa vòng quét là chuyện bình thường (NTF-09, NTF-14).
 *
 *      Khoá là mốc hạn, KHÔNG phải ngày lịch (`0046`). Cửa sổ nhắc rộng đúng 24
 *      giờ nên nó luôn vắt qua một nửa đêm, và khoá theo ngày mở lại đúng lúc
 *      đó — người nhận được hai lá thư nói y hệt nhau. Đổi múi giờ không cứu
 *      được: ranh giới chỉ dời đi chứ không biến mất.
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
import { STATUS_OF_STEP, STEP_OF_STATUS, WAITING, type Status, type Step } from '@csbh/domain-policy';
import { Clock } from './clock.js';

const LOCK_KEY = 'csbh:sla:scan';
const LOCK_TTL_MS = 60_000;

/**
 * Bao lâu sau khi quá hạn thì hồ sơ tự chuyển *Đã xoá* (`0047`).
 *
 * Để ở biến môi trường chứ không ở `pol.sla_config` như số ngày SLA: cột kia có
 * màn hình cho Quản trị sửa (NTF-12), còn con số này chưa có, và một cột CSDL
 * không ai sửa được qua giao diện chỉ tạo cảm giác sai rằng nó sửa được.
 */
const DISCARD_DAYS = Number(process.env.SLA_DISCARD_DAYS ?? 3);

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
  /** Hồ sơ quá hạn đã đủ 3 ngày và vừa bị tự chuyển *Đã xoá* (`0047`). */
  discarded: number;
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
      return { skipped: true, scanned: 0, reminded: 0, overdue: 0, discarded: 0 };
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
      } else if (await this.remind(p)) {
        reminded++;
      }
    }
    return { scanned: rows.length, reminded, overdue, discarded: await this.discardOverdue(now) };
  }

  // --- Nhắc trước một ngày --------------------------------------------------

  private async remind(p: WaitingRow): Promise<boolean> {
    /*
     * Khoá theo MỐC HẠN của chính lần chờ này (`0046`), không theo ngày gửi.
     *
     * `sla_due_at` chắc chắn không rỗng ở đây — vòng quét đã lọc `IS NOT NULL`.
     *
     * Nó nhận diện "lần chờ này", điều mà một ngày lịch không làm được: hồ sơ bị
     * trả lại rồi gửi lại trong cùng một ngày có hai mốc hạn khác nhau (khác giờ,
     * trùng ngày), và lần chờ thứ hai phải có thư nhắc riêng của nó.
     */
    const claimed = await this.db.q<{ policy_id: string }>(
      `INSERT INTO pol.sla_reminder (policy_id, kind, due_at)
       VALUES ($1, 'SLA_REMINDER', $2::timestamptz)
       ON CONFLICT DO NOTHING
       RETURNING policy_id`,
      [p.id, p.sla_due_at.toISOString()],
    );
    // Đã nhắc cho đúng cái hạn này rồi. `ON CONFLICT DO NOTHING` là chốt chặn
    // thật sự: kiểm bằng SELECT rồi INSERT thì hai bản chạy song song đều thấy
    // "chưa có" — và khoá Redis ở trên cũng không cứu được nếu nó vừa hết TTL.
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
                -- Mốc đếm 3 ngày (0047). Lấy từ ĐỒNG HỒ TIÊM, không phải
                -- now() của Postgres — bằng không test đẩy giờ không kiểm được
                -- hạn xoá, y như chuyện đã xảy ra với hạn 14 ngày.
                overdue_at = $5::timestamptz,
                row_version = row_version + 1
          WHERE id = $1 AND row_version = $3 AND status::text = ANY($4::text[])
          RETURNING id`,
        [p.id, step, p.row_version, [...WAITING], now.toISOString()],
      );
      if (upd.rowCount === 0) return false;

      await c.query(
        `INSERT INTO pol.policy_event (policy_id, seq, from_status, to_status, action, actor_role)
         VALUES ($1, (SELECT coalesce(max(seq), 0) + 1 FROM pol.policy_event WHERE policy_id = $1),
                 $2::pol.policy_status, 'QUA_HAN_DUYET', 'SLA_OVERDUE', 'SYSTEM')`,
        [p.id, p.status],
      );

      const cus = await this.clients.customer(p.customer_id).catch(() => undefined);
      /*
       * Ai đã từng thao tác lên hồ sơ này (`0036`).
       *
       * Quá hạn CŨNG là một lần đổi trạng thái, nên nó cũng phải báo cho những
       * người đã đi qua hồ sơ — và ở đây nó còn đáng báo hơn các bước khác: hồ
       * sơ đang TẮC, và người tắc nó không nhất thiết là người biết vì sao.
       */
      const daDong = await c.query<{ actor_id: string }>(
        `SELECT DISTINCT actor_id FROM pol.policy_event
          WHERE policy_id = $1 AND actor_id IS NOT NULL`,
        [p.id],
      );
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
          observers: daDong.rows.map((x) => x.actor_id),
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
        /*
         * CHỈ người phải thao tác, không phải mọi người liên quan (`0047`).
         *
         * Thư nhắc là một cú huých tới đúng người còn kịp làm gì đó. Gửi kèm
         * TDV và những người đã đi qua hồ sơ thì ba phần tư số người nhận không
         * làm gì được với nó, và học rất nhanh cách bỏ qua cả loại thư này —
         * kể cả lá thư *đã quá hạn* sau đó, lá mà họ thật sự cần đọc.
         *
         * Thư QUÁ HẠN thì ngược lại, vẫn gửi rộng: lúc ấy là tin phải báo, không
         * còn là việc phải làm.
         */
        recipients: [OWNER_ROLE[p.status] ?? 'TDV'],
        at: this.clock.now().toISOString(),
        extra,
      }),
    ]);
  }

  // --- Tự xoá hồ sơ quá hạn đã đủ 3 ngày (`0047`) ---------------------------

  /**
   * Hồ sơ quá hạn quá `DISCARD_DAYS` ngày thì chuyển *Đã xoá*.
   *
   * "Xoá" ở đây KHÔNG xoá dòng nào — đúng nghĩa như `0035` và `0039`: đổi trạng
   * thái, ghi thêm một dòng nhật ký. Toàn bộ nội dung hồ sơ, mọi dòng sản phẩm,
   * mọi mốc thời gian và cả chuỗi sự kiện đều còn nguyên, tra lại được mãi mãi.
   * Cái mất đi chỉ là chỗ đứng của nó trên các màn hình đếm việc.
   *
   * Có THƯ BÁO, và đó không phải việc thêm ngoài yêu cầu: `0036` đã chốt rằng
   * mọi lần đổi trạng thái đều báo cho những người đã đi qua hồ sơ. Đây là lần
   * đổi trạng thái cuối cùng của nó, và là lần duy nhất mà người lập cần biết
   * ngay — công sức của họ vừa mất, việc phải làm là lập lại từ đầu.
   */
  private async discardOverdue(now: Date): Promise<number> {
    const han = new Date(now.getTime() - DISCARD_DAYS * 24 * 60 * 60 * 1000);

    // Đọc trước, đổi sau — mỗi hồ sơ một transaction riêng. Gộp cả lô vào một
    // câu UPDATE thì nhanh hơn, nhưng một hồ sơ hỏng sẽ kéo đổ cả lô, và vòng
    // quét sau lại thử lại đúng cả lô ấy.
    const rows = await this.db.q<WaitingRow & { pending_step: string | null }>(
      `SELECT id, code, status, customer_id, tdv_user_id,
              tbp_user_id, ke_toan_user_id, sale_admin_user_id,
              sla_due_at, row_version, pending_step::text AS pending_step
         FROM pol.policy
        WHERE status = 'QUA_HAN_DUYET'
          AND overdue_at IS NOT NULL
          AND overdue_at <= $1::timestamptz`,
      [han.toISOString()],
    );

    let n = 0;
    for (const p of rows) {
      if (await this.discardOne(p, now)) n++;
    }
    return n;
  }

  private async discardOne(
    p: WaitingRow & { pending_step: string | null },
    now: Date,
  ): Promise<boolean> {
    return this.db.tx(async (c) => {
      const upd = await c.query<{ id: string }>(
        `UPDATE pol.policy
            SET status = 'DA_XOA', row_version = row_version + 1
          WHERE id = $1 AND row_version = $2 AND status = 'QUA_HAN_DUYET'
          RETURNING id`,
        [p.id, p.row_version],
      );
      if (upd.rowCount === 0) return false;

      await c.query(
        `INSERT INTO pol.policy_event (policy_id, seq, from_status, to_status, action, actor_role)
         VALUES ($1, (SELECT coalesce(max(seq), 0) + 1 FROM pol.policy_event WHERE policy_id = $1),
                 'QUA_HAN_DUYET', 'DA_XOA', 'SLA_DISCARDED', 'SYSTEM')`,
        [p.id],
      );

      const cus = await this.clients.customer(p.customer_id).catch(() => undefined);
      const daDong = await c.query<{ actor_id: string }>(
        `SELECT DISTINCT actor_id FROM pol.policy_event
          WHERE policy_id = $1 AND actor_id IS NOT NULL`,
        [p.id],
      );

      // Người phụ trách bước hồ sơ chết ở đó, cộng người lập. Suy từ
      // `pending_step` chứ không từ `status` — status giờ là `QUA_HAN_DUYET`,
      // nó không nói được ai đã để hồ sơ này chết.
      const bucKet = p.pending_step ? STATUS_OF_STEP[p.pending_step as Step] : undefined;
      const chuBuoc = bucKet ? OWNER_ROLE[bucKet] : undefined;

      await c.query(`INSERT INTO pol.outbox (routing_key, payload) VALUES ($1, $2::jsonb)`, [
        'policy.sla_discarded',
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
          action: 'SLA_DISCARDED',
          fromStatus: 'QUA_HAN_DUYET',
          toStatus: 'DA_XOA',
          pendingStep: bucKet ?? null,
          recipients: [...new Set(['TDV', ...(chuBuoc ? [chuBuoc] : [])])],
          observers: daDong.rows.map((x) => x.actor_id),
          at: now.toISOString(),
          extra: { 'Số ngày quá hạn': String(DISCARD_DAYS) },
        }),
      ]);
      return true;
    });
  }

  // --- Dọn dữ liệu hết vòng đời ---------------------------------------------

  /**
   * Gọi `sys.run_retention()`. Hàm là SECURITY DEFINER nên nó xoá được ở cả bốn
   * schema mà role csbh_pol không có quyền — xem chú thích ở migration 0013.
   *
   * HAI HÀM CON gọi kèm ngay sau, vì `CREATE OR REPLACE` của Postgres đòi cả
   * thân hàm nên `run_retention()` không nối thêm được từ một migration sau
   * (`0091` giải thích đầy đủ). Cả hai đều SECURITY DEFINER và đều cấp EXECUTE
   * riêng cho `csbh_pol`.
   *
   * `sys.don_idn_outbox()` đáng lẽ đã phải nằm ở đây từ `0091` — migration ấy
   * viết rõ "sla-worker gọi ngay sau `run_retention()`" và không lượt nào nối
   * dây. Hàm nằm im trong CSDL suốt từ đó, và `idn.outbox` chưa từng được dọn
   * một dòng nào. Tìm ra khi dựng `sys.don_thong_bao()` theo đúng khuôn ấy.
   */
  async runRetention(): Promise<Record<string, unknown>> {
    const r = await this.db.one<{ run_retention: Record<string, unknown> }>(
      `SELECT sys.run_retention()`,
    );
    const them = await this.db.one<{ idn_outbox: string; thong_bao: string }>(
      `SELECT sys.don_idn_outbox() AS idn_outbox, sys.don_thong_bao() AS thong_bao`,
    );
    return {
      ...(r?.run_retention ?? {}),
      idn_outbox: Number(them?.idn_outbox ?? 0),
      thong_bao: Number(them?.thong_bao ?? 0),
    };
  }

  async close(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
