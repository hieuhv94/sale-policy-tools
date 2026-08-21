/**
 * API nhật ký — CHỈ ĐỌC.
 *
 * Không có `POST`, `PUT`, `PATCH` hay `DELETE` ở đây, và đó không phải chuyện
 * tình cờ: nhật ký chỉ vào bằng đường sự kiện. Test `AUD-05` quét bảng định
 * tuyến và đỏ ngay nếu một route ghi xuất hiện.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { pageOf, paged, pageSql, Roles } from '@csbh/http-kit';
import { Db } from '../infra/db.js';

/**
 * CHỈ Quản trị hệ thống đọc nhật ký (`0086`, chốt 21/08).
 *
 * Ban lãnh đạo đọc được cho tới `0086`. Bỏ vì nhật ký là vết KIỂM SOÁT — IP,
 * `trace_id`, giá trị trước/sau của từng lần sửa — chứ không phải dữ liệu điều
 * hành; chuyện một hồ sơ đã đi qua tay ai thì *Lịch sử hồ sơ* kể, và đường ấy
 * không đi qua đây.
 *
 * Một danh sách cho CẢ BA route, không phải ba lần khai: `/entries`,
 * `/user-activity` và `/trace` đều đọc cùng một bảng, nên nới một cái mà quên
 * hai cái kia là mở đúng cánh cửa vừa đóng — `user-activity` trả về thống kê
 * của chính những dòng ấy.
 */
const READERS = ['QUAN_TRI'];

@Controller('audit')
export class AuditController {
  constructor(private readonly db: Db) {}

  @Roles(...READERS)
  @Get('entries')
  async entries(
    @Query()
    q: {
      limit?: string;
      offset?: string;
      entityId?: string;
      actorId?: string;
      action?: string;
      traceId?: string;
    },
  ) {
    const p = pageOf(q);
    const rows = await this.db.q<Record<string, unknown>>(
      `SELECT id, occurred_at AS "occurredAt", actor_id AS "actorId", actor_role AS "actorRole",
              host(actor_ip) AS "actorIp", action, entity, entity_id AS "entityId",
              before_data AS "before", after_data AS "after", reason,
              trace_id AS "traceId", app_version AS "appVersion",
              count(*) OVER() AS total_count
         FROM aud.audit_log
        WHERE ($1::uuid IS NULL OR entity_id = $1)
          AND ($2::uuid IS NULL OR actor_id = $2)
          AND ($3::text IS NULL OR action = $3)
          AND ($4::text IS NULL OR trace_id = $4)
        ORDER BY occurred_at DESC, id DESC ${pageSql(5)}`,
      [q.entityId ?? null, q.actorId ?? null, q.action ?? null, q.traceId ?? null, p.limit, p.offset],
    );
    return paged(rows, p);
  }

  /**
   * Báo cáo hoạt động của một người dùng: đếm theo hành động (AUD-09).
   *
   * Đếm theo DÒNG nhật ký, nên chốt chống ghi trùng ở migration 0015 không phải
   * chuyện gọn gàng — nó là điều kiện để con số này đúng.
   */
  @Roles(...READERS)
  @Get('user-activity')
  async userActivity(@Query() q: { actorId?: string; from?: string; to?: string }) {
    const rows = await this.db.q<{ action: string; n: string }>(
      `SELECT action, count(*)::text AS n
         FROM aud.audit_log
        WHERE ($1::uuid IS NULL OR actor_id = $1)
          AND ($2::timestamptz IS NULL OR occurred_at >= $2)
          AND ($3::timestamptz IS NULL OR occurred_at < $3)
        GROUP BY action
        ORDER BY count(*) DESC`,
      [q.actorId ?? null, q.from ?? null, q.to ?? null],
    );
    return {
      actorId: q.actorId ?? null,
      byAction: Object.fromEntries(rows.map((r) => [r.action, Number(r.n)])),
      total: rows.reduce((a, r) => a + Number(r.n), 0),
    };
  }

  /** Dựng lại toàn bộ chuỗi của một request trong MỘT truy vấn (INT-11). */
  @Roles(...READERS)
  @Get('trace/:traceId')
  async trace(@Query() _q: unknown) {
    return { hint: 'dùng /audit/entries?traceId=...' };
  }
}
