/**
 * API nội bộ của policy. `document` cần biết hồ sơ thuộc TDV nào để kiểm phạm
 * vi, và cần toàn bộ nội dung hồ sơ để dựng bản CSBH A4 và trộn hợp đồng.
 *
 * Trả về DỮ LIỆU THÔ, không định dạng: tiền vẫn là số nguyên đồng, tỷ lệ vẫn là
 * numeric. Định dạng theo bảng ánh xạ là việc của `document` (muc 8.2), và làm
 * sẵn ở đây thì hai service cùng định dạng tiền theo hai kiểu.
 */
import { Controller, Get, NotFoundException, Param, Post, Body } from '@nestjs/common';
import { oneOf, ServiceOnly, str, validate } from '@csbh/http-kit';
import { Db } from './infra/db.js';
import { PoliciesService } from './policies/policies.service.js';
import {
  CHUA_DUYET_XONG,
  SQL_NOI_BAN_TRUOC,
  SQL_TRANG_THAI_DONG,
  SQL_TY_LE_CK_TRUOC,
} from './policies/policies.service.js';

/**
 * Loại văn bản vừa sinh ra → tên hành động trong *Lịch sử* (`0052`, `0053`).
 *
 * BẢNG TRA chứ không phải một chuỗi `?:` nối nhau: bốn loại rồi, và mỗi lần
 * thêm một loại mà quên sửa nhánh cuối thì nó âm thầm rơi vào nhãn của loại
 * khác — một dòng lịch sử SAI còn tệ hơn không có dòng nào.
 */
/**
 * Loại văn bản → hành động ghi vào *Lịch sử*.
 *
 * Chỉ còn hai (`0059`). `HO_SO` và `HOP_DONG` rời khỏi bảng này cùng lúc với
 * yêu cầu ghi lịch sử cho chúng — xem `daSinhVanBan` phía dưới. Bảng tra thay
 * cho `'TAI_' + loai`: một phép suy như thế đúng cho tới ngày ai đó thêm một
 * loại có tên khác, và khi ấy nó sai IM LẶNG — dòng lịch sử mang một mã hành
 * động không có nhãn nào, và màn hình in ra chính cái mã ấy.
 */
const HANH_DONG_TAI: Record<string, string> = {
  BAN_SCAN: 'TAI_BAN_SCAN',
  TEP_DINH_KEM: 'TAI_TEP_DINH_KEM',
};

@ServiceOnly()
@Controller('internal/policies')
export class PolicyInternalController {
  constructor(
    private readonly db: Db,
    private readonly policies: PoliciesService,
  ) {}

  /**
   * Trong một lô hồ sơ, những hồ sơ nào một người CÒN mở được (`0262`).
   *
   * `notification` hỏi lúc trả hộp thông báo: dòng thông báo về một bình luận chỉ
   * mang mã hồ sơ, tên khách và trích đoạn khi người nhận còn trong phạm vi — mất
   * phạm vi thì chỉ còn tiêu đề (yêu cầu 6.3). Luật là `coTrongPhamVi`, đúng luật
   * của trang hồ sơ.
   *
   * KHAI TRƯỚC `@Get(':id')` không cần — khác phương thức — nhưng đứng đầu cho
   * người đọc thấy ngay: đây là đường duy nhất của controller này nhận một lô.
   */
  @Post('trong-pham-vi')
  async trongPhamVi(@Body() body: unknown) {
    const b = (body ?? {}) as { userId?: unknown; role?: unknown; policyIds?: unknown };
    const ids = Array.isArray(b.policyIds)
      ? b.policyIds.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200)
      : [];
    if (typeof b.userId !== 'string' || typeof b.role !== 'string') return { coQuyen: [] };
    return {
      coQuyen: await this.policies.trongPhamVi(
        { id: b.userId, role: b.role, mustChangePassword: false },
        ids,
      ),
    };
  }

  @Get(':id')
  async byId(@Param('id') id: string) {
    const p = await this.db.one<Record<string, unknown>>(
      // Nhóm cột thứ hai (từ `pending_step` trở đi) thêm ở P7b cho read-model
      // báo cáo: nó dựng lại toàn bộ dòng từ đây chứ không đọc schema pol.
      `SELECT id, code, customer_id, version_no, status::text AS status,
              -- 0180 — NGÀY ÁP DỤNG SỚM NHẤT của các dòng, dựng tại chỗ chứ
              -- không còn là một cột. Chỉ read-model báo cáo đọc nó, cho bộ lọc
              -- "CSBH áp dụng từ … đến …"; tờ giấy thì in ngày của TỪNG DÒNG.
              -- Hồ sơ chưa có dòng nào trả NULL, và rpt vốn đã nhận NULL được.
              -- 0186 — NOT da_xoa: dòng đã rút không được quyết định ngày áp
              -- dụng của hồ sơ trên báo cáo. Rút đúng mặt hàng có ngày sớm nhất
              -- mà bộ lọc "CSBH áp dụng từ … đến …" vẫn xếp hồ sơ theo ngày ấy
              -- là một câu sai, và là loại sai không ai đi tìm.
              (SELECT min(ngay_ap_dung) FROM pol.policy_line
                WHERE policy_id = pol.policy.id AND NOT da_xoa) AS applied_date,
              effective_from, tdv_user_id,
              tbp_user_id, ke_toan_user_id, sale_admin_user_id,
              created_at, submitted_at, tbp_signed_at,
              tbp_signed_by, kt_l1_received_at, sa_handover_at, kt_l2_received_at,
              contract_issued_at, contract_issued_by, last_reason, row_version,
              pending_step::text AS pending_step, source::text AS source,
              created_by, returned_at, rejected_at, deactivated_at,
              sla_due_at, sla_started_at,
              -- 0144: PHẢI có tên ở đây. Câu SELECT này liệt kê từng cột, nên
              -- một cột mới không tự đi theo: reporting nhận undefined, ghi
              -- false vào read-model, và phạm vi của Kế toán ở Tổng quan lệch
              -- khỏi phạm vi ở màn hình Hồ sơ đúng tại những hồ sơ đã qua TBP
              -- rồi quay lại CHO_TBP_DUYET. Cùng cái bẫy đã mất 14 ca ở 0128.
              da_qua_tbp,
              -- 0098: mẫu đã đóng băng lúc gửi duyệt. document dựng bản mềm
              -- bằng đúng cột này chứ không hỏi người xem nữa.
              -- 0101: khách hàng và hai cái tên, đóng băng lúc gửi duyệt.
              -- Rỗng nghĩa là chưa gửi duyệt hoặc lập trước 0101 — khi ấy
              -- document đọc sống, xem khachHangCua.
              kh_ma_snap, kh_ten_snap, kh_ma_so_thue_snap, kh_dia_chi_dang_ky_snap,
              -- 0182: HAI Ô địa chỉ đăng ký. Chúng đã đóng băng từ 0177 nhưng
              -- chưa ai đọc tới: tờ giấy in cột GỘP. Từ 0182 dòng Tên khách
              -- hàng in "số nhà/phường xã – tỉnh thành phố" thành hai phần, nên
              -- document cần đúng hai cột này. Câu SELECT liệt kê từng cột, nên
              -- thiếu tên ở đây là document nhận undefined và in ra hai ô trống
              -- — bẫy 0128 và 0144 đã ghi hai lần.
              kh_so_nha_snap, kh_tinh_thanh_snap,
              kh_noi_nhan_hang_snap, kh_nguoi_dai_dien_snap, kh_chuc_danh_dai_dien_snap,
              kh_dien_thoai_snap,
              -- bigint qua JSON mất chữ số, nên trả về dạng CHUOI (0061).
              kh_cong_no_snap::text AS kh_cong_no_snap,
              nguoi_de_nghi_snap, tbp_ky_ten_snap
         FROM pol.policy WHERE id = $1`,
      [id],
    );
    if (!p) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });

    /*
     * Hai con số CHẤT LƯỢNG, suy từ nhật ký hồ sơ (`0094`).
     *
     * Trả về từ ĐÂY chứ không để read-model tự tính, vì `pol.policy_event` là
     * bảng của service này và `csbh_rpt` không có quyền đọc nó (AD-02). Đây cũng
     * là chỗ đúng theo nghĩa nghiệp vụ: số lần trả lại là chuyện đã xảy ra với
     * hồ sơ, không phải một chỉ số báo cáo.
     *
     * `soLanTbpTraLai` CHỈ đếm lần trả của Trưởng bộ phận. Màn hình dùng nó là
     * màn hình của họ, và gộp thêm lần trả của Kế toán là trộn công của người
     * khác vào một con số mang tên mình.
     */
    const cl = await this.db.one<{ so_lan: string; sua_lai_ngay: string | null }>(
      `WITH cap AS (
         SELECT EXTRACT(EPOCH FROM (g.at - e.at)) / 86400 AS ngay
           FROM pol.policy_event e
           JOIN LATERAL (
             SELECT at FROM pol.policy_event g2
              WHERE g2.policy_id = e.policy_id
                AND g2.action = 'RESUBMIT_AFTER_EDIT'
                AND g2.at > e.at
              ORDER BY g2.at
              LIMIT 1
           ) g ON true
          WHERE e.policy_id = $1 AND e.action = 'TBP_RETURN'
       )
       SELECT (SELECT count(*)::text FROM pol.policy_event
                WHERE policy_id = $1 AND action = 'TBP_RETURN') AS so_lan,
              (SELECT avg(ngay)::numeric(6,2)::text FROM cap) AS sua_lai_ngay`,
      [id],
    );

    /*
     * BA TRƯỜNG MỚI CỦA DÒNG (`0180`) — và câu SELECT này liệt kê TỪNG CỘT.
     *
     * Đúng cái bẫy `0128` và `0144` đã ghi hai lần: một cột mới không tự đi
     * theo, bên nhận đọc ra `undefined`, TypeScript im vì trường khai `?`, và
     * triệu chứng lộ ra ở chỗ khác hẳn — ở đây là cột *Ngày áp dụng* trống rỗng
     * trên bản CSBH đem ký.
     *
     * `trang_thai` và `ty_le_ck_truoc` dựng bằng cùng một biểu thức với đường
     * đọc của giao diện (`SQL_TRANG_THAI_DONG`), nhập từ `policies.service`.
     * Hai bảng — trên màn hình và trên tờ giấy — phải nói cùng một câu về cùng
     * một dòng, và cách rẻ nhất để bảo đảm điều đó là chúng dùng chung một
     * biểu thức chứ không phải hai bản chép.
     */
    const lines = await this.db.q<Record<string, unknown>>(
      `SELECT l.product_id, l.product_code_snap, l.product_name_snap,
              l.company_price_snap::text AS company_price,
              l.wholesale_price::text AS wholesale_price,
              l.cpbh::text[] AS cpbh,
              l.cpbh_total::text AS cpbh_total, l.net_price::text AS net_price,
              l.discount_rate::text AS discount_rate,
              l.threshold_snap::text AS threshold_snap,
              l.over_threshold, l.note,
              l.ngay_ap_dung,
              ${SQL_TRANG_THAI_DONG} AS trang_thai,
              ${SQL_TY_LE_CK_TRUOC} AS ty_le_ck_truoc
         FROM pol.policy_line l
         ${SQL_NOI_BAN_TRUOC}
        /*
         * DÒNG ĐÃ XOÁ KHÔNG RA KHỎI CỬA NÀY (0186).
         *
         * Khách hàng chốt "bản mềm cũng không hiện sản phẩm đã xoá", và chốt ấy
         * được thi hành ĐÚNG MỘT CHỖ: đây. Cửa này là đường duy nhất document
         * và reporting đọc được hồ sơ (AD-02), nên lọc tại nguồn thì bản mềm,
         * hợp đồng, read-model báo cáo và mọi biểu đồ dựng trên nó đều thôi thấy
         * dòng đã rút — mà không service nào phải biết cột da_xoa có tồn tại.
         *
         * Lọc ở document thay vì ở đây thì reporting vẫn đếm mặt hàng đã rút vào
         * doanh số của bản mới, và không có gì đỏ.
         */
        WHERE l.policy_id = $1 AND NOT l.da_xoa ORDER BY l.product_code_snap`,
      [id],
    );

    const attachments = await this.db.q<Record<string, unknown>>(
      `SELECT id, kind::text AS kind, file_name, object_key, size_bytes::text AS size_bytes
         FROM pol.policy_attachment WHERE policy_id = $1 ORDER BY uploaded_at`,
      [id],
    );

    /*
     * NGƯỜI ĐƯỢC XEM TỆP CỦA HỒ SƠ NÀY VỚI TƯ CÁCH "BẢN TRƯỚC" (`0183`).
     *
     * Bốn cột người của mọi hồ sơ KẾ NHIỆM **chưa duyệt xong** — tức những
     * người đang làm hoặc đang duyệt một phiên bản thay thế chính hồ sơ này, và
     * vì thế cần đọc được bản mềm với file scan của nó để so.
     *
     * CÙNG một hằng với điều kiện bày khối (`CHUA_DUYET_XONG`), không phải một
     * bản chép: hai chỗ trả lời khác nhau thì hoặc khối hiện ra mà mỗi tệp trong
     * nó trả 403, hoặc quyền mở rộng hơn thứ màn hình bày.
     *
     * Trả về từ ĐÂY chứ không để `document` tự tra: `superseded_by_id` là cột
     * của `pol`, và `document` chỉ được hỏi qua đúng một cửa. Nó cũng đi CÙNG
     * lượt gọi mà `assertCanRead` vốn đã thực hiện, nên phép nới quyền không
     * thêm một vòng mạng nào.
     *
     * NHIỀU hồ sơ có thể cùng trỏ về một bản: `supersedes_id` đặt lúc lập, và
     * hai bản nháp lập cùng lúc cho một khách đều trỏ về bản đang hiệu lực.
     */
    const keNhiem = await this.db.q<{ nguoi: string | null }>(
      `SELECT unnest(ARRAY[tdv_user_id, tbp_user_id, ke_toan_user_id, sale_admin_user_id])
                AS nguoi
         FROM pol.policy
        WHERE supersedes_id = $1
          AND status::text = ANY($2::text[])`,
      [id, CHUA_DUYET_XONG],
    );

    return {
      ...p,
      nguoi_xem_ban_truoc: [...new Set(keNhiem.map((x) => x.nguoi).filter(Boolean))],
      so_lan_tbp_tra_lai: Number(cl?.so_lan ?? 0),
      sua_lai_ngay: cl?.sua_lai_ngay ?? null,
      lines,
      attachments,
    };
  }

  /**
   * `document` báo về: vừa sinh xong một văn bản của hồ sơ này cho ai đó (`0052`).
   *
   * Gộp HAI việc từng nằm hai chỗ, vì chúng luôn xảy ra cùng lúc và cùng lý do:
   *
   *   1. **Đóng dấu lần xuất hợp đồng** — hai cột `contract_issued_*`. Đây là
   *      dấu vết DUY NHẤT của việc xuất hợp đồng: không có bảng hợp đồng nào cả
   *      (muc 8.3). Cột nằm ở `pol` chứ không ở `doc` vì chúng thuộc về hồ sơ —
   *      mở hồ sơ ra là thấy ngay "đã xuất hợp đồng lúc nào, ai xuất".
   *   2. **Ghi một dòng LỊCH SỬ** khi có người tải BẢN CỨNG xuống (N-01, muc 10).
   *      Trước `0052` không đường tải nào để lại vết nào cả, nên câu "ai đã lấy
   *      bản scan có chữ ký của khách hàng này ra khỏi hệ thống" không trả lời
   *      được.
   *
   * `loai` QUYẾT ĐỊNH TẤT CẢ (`0059`) — mỗi loại làm đúng một trong hai việc:
   *
   *   - `HOP_DONG` → chỉ đóng dấu. Xem hay tải thì máy chủ đều đã trộn xong bản
   *     hợp đồng đầy đủ và đưa nó tới mắt người ấy; câu hỏi của muc 8.3 là "hồ
   *     sơ này đã có hợp đồng chưa", không phải "ai giữ file".
   *   - `BAN_SCAN` · `TEP_DINH_KEM` → chỉ ghi lịch sử.
   *
   * `HO_SO` và cờ `ghiLichSu` ĐÃ BỎ (`0059`). Khách hàng bỏ yêu cầu ghi lịch sử
   * cho bản mềm và hợp đồng ngày 20/08, và bỏ có lý: chúng là thứ người ta mở ra
   * ĐỌC — kế toán xem lại hồ sơ ba lần một buổi là chuyện thường, nên những dòng
   * ấy chỉ làm dày lịch sử và dìm mất thứ nó sinh ra để kể. Bản scan thì khác:
   * nó là bản cứng có chữ ký, và "ai đã lấy nó ra" là một câu hỏi khác hẳn.
   *
   * Những dòng `TAI_HO_SO`/`TAI_HOP_DONG` đã ghi thì migration `0059` XOÁ HẲN,
   * và nhãn của chúng cũng gỡ khỏi giao diện. Cân nhắc ban đầu là để lại vì
   * "nhật ký chỉ ghi thêm" — đúng cho một hệ thống đang chạy thật, nhưng phần
   * mềm này chưa bàn giao nên mọi dòng như thế đều do bộ nạp demo hoặc các lượt
   * chạy kiểm thử sinh ra. Giữ lại là bày ra ở bản demo một loại dòng mà phần
   * mềm không còn sinh nữa. Ràng buộc chỉ-ghi-thêm của AUD-03/04 nằm ở
   * `aud.audit_log`, không nằm ở bảng này.
   */
  @Post(':id/da-sinh-van-ban')
  async daSinhVanBan(@Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, {
      loai: oneOf('HOP_DONG', 'BAN_SCAN', 'TEP_DINH_KEM'),
      actorId: str(36, 36),
      actorRole: str(1, 40),
    });

    const p = await this.db.one<{ status: string }>(
      `SELECT status::text AS status FROM pol.policy WHERE id = $1`,
      [id],
    );
    if (!p) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });

    if (b.loai === 'HOP_DONG') {
      await this.db.q(
        `UPDATE pol.policy SET contract_issued_at = now(), contract_issued_by = $2 WHERE id = $1`,
        [id, b.actorId],
      );
      return { ok: true };
    }

    {
      /*
       * `from_status` NULL, `to_status` = trạng thái ĐANG CÓ.
       *
       * Đây không phải một bước chuyển — hồ sơ không đi đâu cả. Cột `to_status`
       * là NOT NULL nên phải điền gì đó, và điền trạng thái hiện tại là câu đúng
       * duy nhất: dòng lịch sử nói "lúc ấy hồ sơ đang ở đây, và người này lấy
       * văn bản ra". `from_status` để trống thì màn hình không vẽ mũi tên
       * chuyển trạng thái cho dòng này.
       *
       * KHOÁ DÒNG HỒ SƠ TRƯỚC KHI CẤP `seq`, và đây là chỗ bản đầu làm sai.
       *
       * `coalesce(max(seq), 0) + 1` nằm ngay trong câu INSERT nhìn như đã đủ an
       * toàn — nhưng `max(seq)` chỉ thấy dòng ĐÃ COMMIT. Năm lượt tải song song
       * cùng một hồ sơ thì cả năm đọc ra cùng một con số, và bốn lượt vỡ ở ràng
       * buộc `UNIQUE (policy_id, seq)` — người dùng nhận 500 cho một thao tác
       * đọc thuần tuý. Ca `DOC-20` bắt được đúng chuyện này.
       *
       * `FOR UPDATE` xếp chúng thành hàng. Khoá giữ trong đúng một lệnh INSERT
       * nên không cản bước duyệt nào: bước duyệt cũng khoá cùng dòng ấy, và
       * phần chậm của việc tải (Gotenberg dựng PDF) đã xong từ trước khi gọi
       * tới đây.
       *
       * Không dùng vòng thử lại: nó biến một phép xếp hàng tất định thành một
       * phép may rủi, và với năm lượt cùng lúc thì lượt cuối phải thử năm lần.
       */
      await this.db.tx(async (c) => {
        await c.query(`SELECT 1 FROM pol.policy WHERE id = $1 FOR UPDATE`, [id]);
        await c.query(
          `INSERT INTO pol.policy_event
             (policy_id, seq, from_status, to_status, action, actor_id, actor_role)
           VALUES ($1,
                   coalesce((SELECT max(seq) FROM pol.policy_event WHERE policy_id = $1), 0) + 1,
                   NULL, $2::pol.policy_status, $3, $4, $5)`,
          [id, p.status, HANH_DONG_TAI[b.loai], b.actorId, b.actorRole],
        );
      });
    }
    return { ok: true };
  }
}
