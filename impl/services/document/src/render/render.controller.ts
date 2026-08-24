import { Controller, Get, Header, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
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
   * `sheetHtml` vẫn còn, nhưng chỉ phục vụ BẢN LƯU KÝ SỐ (`sign`) — bản ấy cần
   * khối "ĐÃ KÝ SỐ" và cần khác bản nháp từng byte để đối chiếu trước–sau
   * (DOC-05), hai điều một mẫu người dùng soạn không tả được.
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

  @Roles('TBP')
  @Post(':id/sign-file')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async sign(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const { draft, signed } = await this.render.sign(id, me);
    return {
      draftFileId: draft.id,
      signedFileId: signed.id,
      draftSha256: draft.sha256,
      signedSha256: signed.sha256,
      signature: signed.signature,
    };
  }
}
