/**
 * API nhật ký — CHỈ ĐỌC.
 *
 * Không có `POST`, `PUT`, `PATCH` hay `DELETE` ở đây, và đó không phải chuyện
 * tình cờ: nhật ký chỉ vào bằng đường sự kiện. Test `AUD-05` quét bảng định
 * tuyến và đỏ ngay nếu một route ghi xuất hiện.
 *
 * KHÔNG có đường xuất ra file (`0090`, chốt 22/08). Nhật ký đọc trên màn hình;
 * đổi lại, bộ lọc dưới đây phải đủ để tra tại chỗ.
 */
import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { pageOf, paged, pageSql, Roles } from '@csbh/http-kit';
import { Db } from '../infra/db.js';

/** Chỉ Quản trị hệ thống đọc nhật ký (`0086`). */
const READERS = ['QUAN_TRI'];

/**
 * **Cửa sổ audit: 6 tháng gần nhất** (`0090`, chốt 22/08).
 *
 * Chặn ở ĐÂY chứ không chỉ ở ô chọn trên màn hình: một cửa sổ chặn ở giao diện
 * mà API vẫn nhận là cửa sổ chỉ chặn người dùng thật thà.
 *
 * Sáu tháng là BẢO ĐẢM, không phải giới hạn — dòng cũ hơn vẫn nằm nguyên trong
 * bảng. Xoá chúng đòi tắt chính trigger đang giữ cho nhật ký không sửa được, và
 * đổi lấy một chút dung lượng đĩa thì không đáng.
 */
export const CUA_SO_THANG = 6;

const NGAY = 24 * 60 * 60 * 1000;

/** Mốc sớm nhất còn tra được, tính từ bây giờ. */
export const somNhat = (bayGio = new Date()): Date => {
  const d = new Date(bayGio);
  d.setMonth(d.getMonth() - CUA_SO_THANG);
  return d;
};

const thoiDiem = (v: string | undefined, ten: string): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      field: ten,
      message: `${ten}: phải là mốc thời gian hợp lệ`,
    });
  }
  return d;
};

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
      from?: string;
      to?: string;
      entityId?: string;
      entity?: string;
      actorId?: string;
      action?: string;
      ip?: string;
      traceId?: string;
    },
  ) {
    const p = pageOf(q);
    const gioi = somNhat();
    const tu = thoiDiem(q.from, 'from');
    const den = thoiDiem(q.to, 'to');

    if (tu && tu.getTime() < gioi.getTime() - NGAY) {
      /*
       * Trừ hao MỘT NGÀY trước khi từ chối.
       *
       * Màn hình dựng mốc "sáu tháng trước" ở máy người dùng, máy chủ dựng lại
       * ở đây, và hai chiếc đồng hồ lệch nhau vài giây là chuyện thường. Không
       * trừ hao thì đúng cái mốc mà giao diện vừa bày ra lại bị chính máy chủ
       * từ chối — người dùng không bấm sai gì cả.
       */
      throw new BadRequestException({
        code: 'AUDIT_WINDOW_EXCEEDED',
        field: 'from',
        message: `Nhật ký chỉ tra được ${CUA_SO_THANG} tháng gần nhất.`,
      });
    }

    // Không khai `from` thì tự chặn ở mép cửa sổ. Một màn hình nhật ký mở ra đã
    // quét cả bảng là một màn hình chậm mà không ai cần — và nó cũng đọc ra
    // ngược với điều vừa cam kết.
    const tuThat = tu ?? gioi;

    const rows = await this.db.q<Record<string, unknown>>(
      `SELECT id, occurred_at AS "occurredAt", actor_id AS "actorId", actor_role AS "actorRole",
              actor_name AS "actorName", actor_username AS "actorUsername",
              host(actor_ip) AS "actorIp", action, entity, entity_id AS "entityId",
              target_label AS "targetLabel", outcome,
              before_data AS "before", after_data AS "after", reason,
              trace_id AS "traceId", app_version AS "appVersion",
              count(*) OVER() AS total_count
         FROM aud.audit_log
        WHERE occurred_at >= $1::timestamptz
          AND ($2::timestamptz IS NULL OR occurred_at < $2)
          AND ($3::uuid IS NULL OR entity_id = $3)
          AND ($4::uuid IS NULL OR actor_id = $4)
          AND ($5::text IS NULL OR action = $5)
          AND ($6::text IS NULL OR entity = $6)
          AND ($7::text IS NULL OR host(actor_ip) = $7)
          AND ($8::text IS NULL OR trace_id = $8)
        ORDER BY occurred_at DESC, id DESC ${pageSql(9)}`,
      [
        tuThat.toISOString(),
        den?.toISOString() ?? null,
        q.entityId ?? null,
        q.actorId ?? null,
        q.action ?? null,
        q.entity ?? null,
        q.ip ?? null,
        q.traceId ?? null,
        p.limit,
        p.offset,
      ],
    );
    return { ...paged(rows, p), window: { from: tuThat.toISOString(), months: CUA_SO_THANG } };
  }

  /**
   * Những giá trị CÓ THẬT trong cửa sổ, để dựng ô chọn của bộ lọc (`0090`).
   *
   * Không khai cứng danh sách hành động ở giao diện: mã hành động sinh ra từ
   * khoá định tuyến của sự kiện, nên một danh sách chép tay sẽ lệch ngay lượt
   * thêm sự kiện tiếp theo — và lệch theo hướng im lặng, vì ô chọn vẫn đầy.
   */
  @Roles(...READERS)
  @Get('facets')
  async facets() {
    const tu = somNhat().toISOString();
    const hanhDong = await this.db.q<{ v: string; n: string }>(
      `SELECT action AS v, count(*)::text AS n FROM aud.audit_log
        WHERE occurred_at >= $1::timestamptz GROUP BY action ORDER BY count(*) DESC`,
      [tu],
    );
    const doiTuong = await this.db.q<{ v: string; n: string }>(
      `SELECT entity AS v, count(*)::text AS n FROM aud.audit_log
        WHERE occurred_at >= $1::timestamptz GROUP BY entity ORDER BY count(*) DESC`,
      [tu],
    );
    const nguoi = await this.db.q<{ v: string; ten: string | null; n: string }>(
      `SELECT actor_id::text AS v, max(coalesce(actor_name, actor_username)) AS ten,
              count(*)::text AS n
         FROM aud.audit_log
        WHERE occurred_at >= $1::timestamptz AND actor_id IS NOT NULL
        GROUP BY actor_id ORDER BY count(*) DESC LIMIT 200`,
      [tu],
    );
    return {
      window: { from: tu, months: CUA_SO_THANG },
      actions: hanhDong.map((r) => ({ value: r.v, count: Number(r.n) })),
      entities: doiTuong.map((r) => ({ value: r.v, count: Number(r.n) })),
      actors: nguoi.map((r) => ({ value: r.v, label: r.ten, count: Number(r.n) })),
    };
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
    const gioi = somNhat();
    const tu = thoiDiem(q.from, 'from');
    // Cùng cửa sổ với `/entries`: một con số thống kê vượt ra ngoài sáu tháng
    // là một cánh cửa sau cho đúng thứ vừa đóng ở cửa trước.
    const tuThat = tu && tu.getTime() > gioi.getTime() ? tu : gioi;
    const rows = await this.db.q<{ action: string; n: string }>(
      `SELECT action, count(*)::text AS n
         FROM aud.audit_log
        WHERE ($1::uuid IS NULL OR actor_id = $1)
          AND occurred_at >= $2::timestamptz
          AND ($3::timestamptz IS NULL OR occurred_at < $3)
        GROUP BY action
        ORDER BY count(*) DESC`,
      [q.actorId ?? null, tuThat.toISOString(), thoiDiem(q.to, 'to')?.toISOString() ?? null],
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
  async trace(@Param('traceId') _traceId: string) {
    return { hint: 'dùng /audit/entries?traceId=...' };
  }
}
