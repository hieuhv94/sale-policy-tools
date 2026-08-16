/**
 * "Người này còn hồ sơ nào dở dang không" — `identity` hỏi trước khi đổi vai trò.
 *
 * Vì sao câu hỏi nằm ở ĐÂY chứ không ở identity: chỉ `policy` đọc được schema
 * `pol` (AD-02). identity tự truy vấn là phá đúng ranh giới sở hữu dữ liệu mà cả
 * hệ thống dựng theo.
 *
 * `scopeUserIds` KHÔNG còn dùng tới từ `0031` — identity vẫn gửi, policy vẫn
 * nhận cho tương thích, nhưng câu trả lời giờ nằm gọn trong `pol.policy`: hồ sơ
 * ghi thẳng id của bốn người xử lý nó. Không phải hỏi ai cây tổ chức nữa, vì
 * không còn cây.
 */
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ServiceOnly, str, validate } from '@csbh/http-kit';
import { Db } from './infra/db.js';

/**
 * Trạng thái KẾT THÚC — hồ sơ ở đây không còn chờ ai làm gì nữa.
 *
 * `DANG_CO_HIEU_LUC` nằm trong danh sách này: nó là đích của luồng, không phải
 * một bước chờ. `QUA_HAN_DUYET` thì KHÔNG — quá hạn vẫn là đang chờ, chỉ là chờ
 * lâu quá (§4), và đó chính là loại hồ sơ dễ mắc kẹt nhất nếu đổi vai trò.
 */
const XONG = ['DANG_CO_HIEU_LUC', 'HET_HIEU_LUC', 'TU_CHOI'];

/** Cột nào trên hồ sơ ghi người của vai trò nào (`0031`). */
const COT_CUA_VAI_TRO: Record<string, string> = {
  TDV: 'tdv_user_id',
  TBP: 'tbp_user_id',
  KE_TOAN: 'ke_toan_user_id',
  SALE_ADMIN: 'sale_admin_user_id',
};

/** Bước nào đang chờ vai trò nào. Cùng bảng với hộp việc ở `policies.service`. */
const CHO_VAI_TRO: Record<string, string[]> = {
  TDV: ['YEU_CAU_CHINH_SUA'],
  TBP: ['CHO_TBP_DUYET'],
  KE_TOAN: ['CHO_KT_L1', 'CHO_KT_L2'],
  SALE_ADMIN: ['SA_DANG_XU_LY'],
};

/**
 * Hồ sơ QUÁ HẠN giấu trạng thái thật của nó trong `pending_step`, nên phải tra
 * theo bước chứ không theo trạng thái — bỏ sót nhánh này là bỏ sót đúng những
 * hồ sơ đã chờ lâu nhất (NTF-11).
 */
const BUOC_VAI_TRO: Record<string, string[]> = {
  TDV: ['B3_GUI_DUYET'],
  TBP: ['B4_TBP_DUYET'],
  KE_TOAN: ['B6_KT_L1', 'B10_KT_L2'],
  SALE_ADMIN: ['B8_SA_XU_LY'],
};

@ServiceOnly()
@Controller('internal/dang-do')
export class DangDoController {
  constructor(private readonly db: Db) {}

  @Post()
  @HttpCode(200)
  async dangDo(@Body() body: unknown) {
    const b = validate(body, { userId: str(36, 36), role: str(1, 30) });

    // Hai nguồn mắc kẹt khác nhau, gộp lại vì người quản trị chỉ cần biết "có
    // hay không, và những hồ sơ nào":
    //
    //   1. Hồ sơ do CHÍNH người này lập mà chưa kết thúc. Đổi vai trò khỏi TDV
    //      thì `tdv_user_id` trỏ vào một người không còn là TDV — hồ sơ vẫn
    //      chạy nhưng không màn hình nào của họ mở ra được nữa.
    //   2. Hồ sơ đang chờ ĐÚNG BƯỚC mà vai trò hiện tại của người này xử lý, và
    //      GIAO ĐÍCH DANH cho họ. Đổi vai trò là bỏ rơi đúng những hồ sơ đó —
    //      không ai khác nhận được, vì hồ sơ chỉ nằm ở hộp việc của người được
    //      chọn. Từ `0031` điều này chặt hơn hẳn bản cũ: trước đây một đồng
    //      nghiệp cùng nhánh cây còn nhìn thấy, giờ thì không.
    const cho = CHO_VAI_TRO[b.role] ?? [];
    const buoc = BUOC_VAI_TRO[b.role] ?? [];
    // Tên cột lấy từ bảng tra, KHÔNG ghép từ `b.role` — `b.role` là chuỗi do bên
    // gọi gửi, và ghép thẳng nó vào SQL là mở một đường tiêm.
    const cot = COT_CUA_VAI_TRO[b.role] ?? 'tdv_user_id';

    // Sắp theo MỚI NHẤT TRƯỚC và cắt ở 20. Hai chi tiết, cả hai đều có lý do:
    //
    //   * Cắt, vì một TDV lâu năm có thể còn hàng trăm hồ sơ chưa kết thúc và
    //     đổ hết vào một thông báo lỗi thì không ai đọc.
    //   * Mới nhất trước, vì đó là những hồ sơ người quản trị đang phải xử lý.
    //     Sắp theo mã thì danh sách cắt ra là hai mươi hồ sơ cũ nhất — đúng
    //     những cái ít liên quan nhất tới việc vừa bị chặn.
    //
    // `count` là TỔNG THẬT, không phải số dòng trả về: nói "còn 3 hồ sơ" trong
    // khi thực tế còn 300 là nói sai với người đang phải quyết định.
    const rows = await this.db.q<{
      code: string;
      status: string;
      ly_do: string;
      tong: string;
    }>(
      `WITH mac AS (
         SELECT code, status::text AS status, created_at, 'nguoi lap' AS ly_do
           FROM pol.policy
          WHERE tdv_user_id = $1 AND status::text <> ALL($2::text[])
         UNION
         SELECT code, status::text AS status, created_at, 'dang cho xu ly' AS ly_do
           FROM pol.policy
          WHERE ${cot} = $1
            AND (status::text = ANY($3::text[])
                 OR (status = 'QUA_HAN_DUYET' AND pending_step::text = ANY($4::text[])))
       )
       SELECT code, status, ly_do, count(*) OVER() AS tong
         FROM mac ORDER BY created_at DESC LIMIT 20`,
      [b.userId, XONG, cho, buoc],
    );

    return {
      userId: b.userId,
      count: rows.length === 0 ? 0 : Number(rows[0]!.tong),
      policies: rows.map((r) => ({ code: r.code, status: r.status, reason: r.ly_do })),
    };
  }
}
