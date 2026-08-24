import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, opt, Roles, uuid, validate, type AuthUser } from '@csbh/http-kit';
import { RenderService } from './render.service.js';

const READERS = ['TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'BAN_LANH_DAO'];

@Controller('policies')
export class RenderController {
  constructor(private readonly render: RenderService) {}

  /**
   * `format=html` ĐÃ GỠ ở `0055`.
   *
   * Nó từng trả về chính chuỗi HTML mà bản PDF được dựng từ đó — cách bảo đảm
   * "file tải về khớp bản đang xem" bằng cấu trúc thay vì bằng lời hứa. Từ
   * `0055` bản mềm sinh từ MẪU .docx của Quản trị, và không có bản HTML nào để
   * trả về nữa. Lời bảo đảm ấy giờ đúng theo cách mạnh hơn: chỉ còn MỘT đường
   * dựng, nên không có hai bản để mà lệch.
   *
   * `0103` gỡ nốt `sheetHtml`: nó chỉ còn phục vụ bản lưu ký số, mà bản lưu ấy
   * đã bỏ. Giờ CHỈ CÒN MỘT đường dựng văn bản trong cả service — mẫu `.docx` đi
   * qua Gotenberg — nên "bản tải về khớp bản đang xem" đúng theo cấu trúc.
   */
  @Roles(...READERS)
  @Get(':id/render')
  async render_(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Query() q: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const b = validate(q, {
      /*
       * `mauId` — MẪU người xem chọn (`0058`), thay cho `size` cũ.
       *
       * Bỏ trống được, và từ `0098` đó là trường hợp THƯỜNG chứ không phải
       * ngoại lệ: hồ sơ đã gửi duyệt mang sẵn mẫu của nó, nên mọi vai trò sau
       * bước ấy — kể cả hộp ký số của Trưởng bộ phận, vốn không có ô chọn nào —
       * đều gọi không kèm tham số này.
       *
       * KHÔNG còn nhánh "bỏ trống thì lấy mẫu đầu danh sách" (câu ấy đúng tới
       * `0067` và đã sai từ `0098`). Bỏ trống nghĩa là *đọc mẫu từ chính hồ sơ*,
       * và hồ sơ chưa có mẫu thì `mauCua` ném lỗi CÓ TÊN chứ không đoán bừa một
       * bố cục.
       */
      /*
        `xem` ĐÃ BỎ HẲN (`0059`).

        Nó tồn tại để máy chủ phân biệt xem với tải, và chỉ ghi *Lịch sử* cho
        lượt tải. Bản mềm không ghi lịch sử nữa nên nó hết việc.

        Bỏ hẳn chứ không giữ lại cho tương thích: phần mềm chưa bàn giao nên
        không có liên kết cũ nào đang sống. `validate` bỏ qua khoá lạ chứ không
        từ chối, nên một địa chỉ còn mang `?xem=1` vẫn trả về đúng bản PDF.
      */
      mauId: opt(uuid()),
    });
    const { body, code } = await this.render.pdf(id, b.mauId, me);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="CSBH-${code}.pdf"`);
    res.end(body);
  }
}
