/**
 * API xem hàng đợi lỗi, và hộp thông báo của chính mình.
 *
 * Thư hỏng phải NHÌN THẤY ĐƯỢC, nếu không thì "đã gửi thông báo rồi" là câu
 * không ai kiểm chứng được (NTF-05).
 *
 * BỐN ĐƯỜNG `cua-toi` của `0096` KHÔNG có `@Roles`, khác hẳn ba đường trên
 * chúng. Đó không phải sơ sót: **chính dòng dữ liệu là quyền**. Một thông báo
 * thuộc về đúng một người, nên câu hỏi "vai trò nào được xem" không có nghĩa —
 * Ban lãnh đạo cũng chỉ xem được hộp của Ban lãnh đạo.
 *
 * Đổi lại, mệnh đề `user_id = $me` thành thứ DUY NHẤT chặn người này đọc hộp
 * người kia, nên nó phải có mặt ở cả bốn — kể cả hai câu `UPDATE`, chỗ dễ quên
 * nhất. `tests/http/thong-bao.test.ts` có ca đối chiếu riêng cho từng câu.
 */
import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles, pageOf, paged, pageSql, type AuthUser } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { NotifyService } from './notify.service.js';
import { PolicyClient } from '../infra/policy.client.js';

@Controller('notifications')
export class NotifyController {
  constructor(
    private readonly db: Db,
    private readonly notify: NotifyService,
    private readonly policy: PolicyClient,
  ) {}

  /**
   * Hộp thông báo của người đang đăng nhập (`0096`).
   *
   * Sắp theo `xay_ra_luc`, không theo lúc ghi dòng: một sự kiện nằm trong DLQ ba
   * tiếng rồi mới gửi lại vẫn phải đứng đúng chỗ của nó trong dòng thời gian.
   * `id DESC` đi kèm để một hành động sinh thư cho bốn người — bốn dòng cùng
   * `xay_ra_luc` — có thứ tự ổn định giữa các trang.
   *
   * Hai con số chưa đọc trả về CẢ HỘP, không phải phần chưa đọc trong trang này.
   * Cái chuông cần con số thật; một huy hiệu đếm theo trang thì mở sang trang hai
   * là nó đổi số mà chẳng có gì xảy ra.
   */
  @Get('cua-toi')
  async cuaToi(
    @CurrentUser() me: AuthUser,
    @Query() q: { limit?: string; offset?: string; chuaDoc?: string },
  ) {
    const p = pageOf(q);
    const rows = await this.db.q<Record<string, unknown>>(
      `SELECT id, kind, action, tieu_de AS "tieuDe", mo_ta AS "moTa",
              duong_dan AS "duongDan", policy_id AS "policyId", customer_id AS "customerId",
              xay_ra_luc AS "xayRaLuc", da_doc_luc AS "daDocLuc",
              binh_luan_id AS "binhLuanId", trich_doan AS "trichDoan",
              count(*) OVER() AS total_count
         FROM ntf.thong_bao
        WHERE user_id = $1
          AND ($2::boolean IS NOT TRUE OR da_doc_luc IS NULL)
        ORDER BY xay_ra_luc DESC, id DESC ${pageSql(3)}`,
      [me.id, q.chuaDoc === 'true', p.limit, p.offset],
    );
    await this.giauKhiMatQuyen(rows, me);
    const dem = await this.demChuaDocCua(me.id);
    return { ...paged(rows, p), soViecChuaDoc: dem.viec, soTinChuaDoc: dem.tin };
  }

  /**
   * Dòng thông báo BÌNH LUẬN của hồ sơ người đọc không còn mở được: chỉ còn tiêu
   * đề (`0262`, yêu cầu 6.3). Mã hồ sơ, tên khách và trích đoạn bị giấu; `matQuyen`
   * để giao diện nói *"bạn không còn quyền xem hồ sơ này"*.
   *
   * Kiểm LÚC ĐỌC, không lúc ghi: phạm vi đổi sau khi thông báo đã ghi (đổi người
   * duyệt, đổi TDV phụ trách) là chuyện thường. Chỉ dòng bình luận — thông báo luồng
   * duyệt là bản chụp của một lá thư đã gửi, không thuộc luật này.
   *
   * `policy` không trả lời thì GIẤU (xem `PolicyClient`).
   */
  private async giauKhiMatQuyen(rows: Record<string, unknown>[], me: AuthUser): Promise<void> {
    const bl = rows.filter((r) => r['binhLuanId']);
    for (const r of rows) r['matQuyen'] = false;
    if (bl.length === 0) return;
    const con = await this.policy.trongPhamVi(me, bl.map((r) => String(r['policyId'])));
    for (const r of bl) {
      if (con.has(String(r['policyId']))) continue;
      r['moTa'] = null;
      r['trichDoan'] = null;
      r['matQuyen'] = true;
    }
  }

  /**
   * Đánh dấu đã đọc mọi thông báo của MÌNH gắn với những bình luận vừa hiện trên
   * màn hình (`0262`, chốt 06/11): đang trao đổi trên trang hồ sơ thì con số trên
   * chuông không tăng vô ích. Giao diện biết id bình luận, không biết id thông báo.
   *
   * `user_id = $me` là chốt duy nhất — id bình luận của người khác chỉ làm không gì
   * đổi. Trả hai con số mới để chuông cập nhật ngay, như `da-doc`.
   */
  @Post('da-doc-binh-luan')
  async daDocBinhLuan(@CurrentUser() me: AuthUser, @Body() body: unknown) {
    const ids = (body as { binhLuanIds?: unknown } | null)?.binhLuanIds;
    if (
      !Array.isArray(ids) ||
      ids.length > 100 ||
      !ids.every((x) => typeof x === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x))
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        field: 'binhLuanIds',
        message: 'binhLuanIds: phải là danh sách tối đa 100 định danh hợp lệ',
      });
    }
    const rows =
      ids.length === 0
        ? []
        : await this.db.q<{ id: string }>(
            `UPDATE ntf.thong_bao SET da_doc_luc = now()
              WHERE user_id = $1 AND binh_luan_id = ANY($2::uuid[]) AND da_doc_luc IS NULL
              RETURNING id`,
            [me.id, ids],
          );
    const dem = await this.demChuaDocCua(me.id);
    return { soDaDanhDau: rows.length, soViecChuaDoc: dem.viec, soTinChuaDoc: dem.tin };
  }

  /**
   * Chỉ con số trên huy hiệu — đường NÓNG NHẤT của cả service.
   *
   * Mọi phiên đang mở hỏi lại mỗi 60 giây, nên nó tách riêng khỏi `cua-toi`:
   * kéo về 10 dòng dữ liệu chỉ để lấy một con số là nhân lưu lượng ấy lên vài
   * chục lần mà không ai đọc phần còn lại.
   *
   * KHÔNG chặn trên ở 99. Giao diện hiện `99+`, nhưng đó là chuyện của giao
   * diện; một API trả số đã bị cắt là một API mà chỗ gọi thứ hai sẽ đọc sai.
   * Chỉ mục một phần `ix_thong_bao_chua_doc` làm phép đếm này không chạm tới
   * dòng đã đọc.
   */
  @Get('cua-toi/dem')
  async demCuaToi(@CurrentUser() me: AuthUser) {
    const dem = await this.demChuaDocCua(me.id);
    return { soViecChuaDoc: dem.viec, soTinChuaDoc: dem.tin };
  }

  /**
   * Đánh dấu một thông báo đã đọc. Gọi lúc người dùng bấm vào nó.
   *
   * `coalesce(da_doc_luc, now())` chứ không `SET da_doc_luc = now()`: bấm lại
   * một thông báo đã đọc là chuyện thường (mở lại hồ sơ từ danh sách đầy đủ), và
   * nó không được phép dời mốc đã đọc.
   *
   * Không tìm thấy và không phải của mình trả về CÙNG một 404. Cố ý: tách hai
   * câu ra là để lộ rằng một id nào đó có tồn tại trong hệ thống.
   */
  @Post(':id/da-doc')
  async daDoc(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() _b: unknown) {
    const row = await this.db.one<{ id: string }>(
      `UPDATE ntf.thong_bao SET da_doc_luc = coalesce(da_doc_luc, now())
        WHERE id = $1 AND user_id = $2
        RETURNING id`,
      [id, me.id],
    );
    if (!row) throw new NotFoundException({ code: 'THONG_BAO_NOT_FOUND' });
    const dem = await this.demChuaDocCua(me.id);
    return { soViecChuaDoc: dem.viec, soTinChuaDoc: dem.tin };
  }

  /** Đánh dấu đã đọc CẢ HỘP, không riêng phần đang hiện trên màn hình. */
  @Post('da-doc-het')
  async daDocHet(@CurrentUser() me: AuthUser, @Body() _b: unknown) {
    const rows = await this.db.q<{ id: string }>(
      `UPDATE ntf.thong_bao SET da_doc_luc = now()
        WHERE user_id = $1 AND da_doc_luc IS NULL
        RETURNING id`,
      [me.id],
    );
    return { soDaDanhDau: rows.length, soViecChuaDoc: 0, soTinChuaDoc: 0 };
  }

  /**
   * HAI con số, không một (`0192`).
   *
   * Huy hiệu trên chuông đếm VIỆC; tin thì chỉ làm hiện một dấu chấm. Tách ở đây
   * chứ không để giao diện tự lọc: giao diện chỉ có mười dòng của trang đầu, mà
   * hai con số này nói về CẢ HỘP.
   *
   * VÌ SAO ĐẾM CẢ HAI thay vì trả một cờ `coTin`: nhãn cho trình đọc màn hình
   * nói con số thật (*"12 tin mới"*), và dấu chấm hoàn toàn vô hình với họ — nhãn
   * ấy là đường DUY NHẤT họ biết có gì. Đúng lối `nhanChuong()` đang làm với
   * `99+`: huy hiệu cắt số, câu đọc lên thì không.
   *
   * `kind` là chỗ lưu BẬC (`0192`): `CHINH` là lá thư của người phải xử lý —
   * đúng nghĩa bậc VIỆC — nên không cần cột mới, và dòng lịch sử vẫn đọc được.
   * Chỉ mục một phần `ix_thong_bao_chua_doc` vẫn gánh mệnh đề `da_doc_luc IS
   * NULL`; `FILTER` chỉ chạy trên số dòng đã lọc ra.
   */
  private async demChuaDocCua(userId: string): Promise<{ viec: number; tin: number }> {
    const r = await this.db.one<{ viec: string; tin: string }>(
      `SELECT count(*) FILTER (WHERE kind = 'CHINH')  AS viec,
              count(*) FILTER (WHERE kind <> 'CHINH') AS tin
         FROM ntf.thong_bao
        WHERE user_id = $1 AND da_doc_luc IS NULL`,
      [userId],
    );
    return { viec: Number(r?.viec ?? 0), tin: Number(r?.tin ?? 0) };
  }

  @Roles('QUAN_TRI')
  @Get('dead-letters')
  async deadLetters(@Query() q: { limit?: string; offset?: string; open?: string }) {
    const p = pageOf(q);
    const rows = await this.db.q<Record<string, unknown>>(
      // Đặt bí danh camelCase như mọi endpoint khác. Trước P11b nhóm này trả
      // thẳng tên cột snake_case — không sai, nhưng là endpoint DUY NHẤT làm
      // vậy, và giao diện đọc nó sẽ phải mang một DTO đi ngược cả ứng dụng.
      `SELECT id, event_id AS "eventId", routing_key AS "routingKey", attempts,
              last_error AS "lastError", failed_at AS "failedAt", resolved_at AS "resolvedAt",
              count(*) OVER() AS total_count
         FROM ntf.dead_letter
        WHERE ($1::boolean IS NOT TRUE OR resolved_at IS NULL)
        ORDER BY failed_at DESC, id DESC ${pageSql(2)}`,
      [q.open === 'true', p.limit, p.offset],
    );
    return paged(rows, p);
  }

  @Roles('QUAN_TRI')
  @Get('sent')
  async sent(@Query() q: { limit?: string; offset?: string; policyId?: string }) {
    const p = pageOf(q);
    const rows = await this.db.q<Record<string, unknown>>(
      `SELECT id, event_id, routing_key, policy_id, to_addresses, subject, thread_key, sent_at,
              count(*) OVER() AS total_count
         FROM ntf.sent_mail
        WHERE ($1::uuid IS NULL OR policy_id = $1)
        ORDER BY sent_at DESC, id DESC ${pageSql(2)}`,
      [q.policyId ?? null, p.limit, p.offset],
    );
    return paged(rows, p);
  }

  /**
   * Gửi lại một thư trong DLQ. Chạy lại đúng đường xử lý cũ, kể cả bước chống
   * trùng — sự kiện đã gửi thành công ở lần khác thì lần này trả `duplicate`.
   */
  @Roles('QUAN_TRI')
  @Post('dead-letters/:id/retry')
  async retry(@CurrentUser() _me: AuthUser, @Param('id') id: string, @Body() _b: unknown) {
    const row = await this.db.one<{ event_id: string; routing_key: string; payload: unknown }>(
      `SELECT event_id, routing_key, payload FROM ntf.dead_letter WHERE id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException({ code: 'DEAD_LETTER_NOT_FOUND' });

    const outcome = await this.notify.handle({
      eventId: row.event_id,
      routingKey: row.routing_key,
      payload: row.payload as Record<string, unknown>,
    });
    if (outcome === 'sent' || outcome === 'duplicate') {
      await this.db.q(`UPDATE ntf.dead_letter SET resolved_at = now() WHERE id = $1`, [id]);
    }
    return { outcome };
  }
}
