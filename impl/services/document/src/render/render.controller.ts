import { Controller, Get, Header, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, oneOf, opt, Roles, uuid, validate, type AuthUser } from '@csbh/http-kit';
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
       * Bỏ trống được: hộp xác nhận ký số dựng bản xem trước mà không có ô chọn
       * nào, và mọi liên kết cũ còn sót cũng phải ra được một bản đọc được chứ
       * không phải một lỗi. Máy chủ lấy mẫu đầu danh sách.
       */
      mauId: opt(uuid()),
      /*
       * `xem` VẪN NHẬN nhưng KHÔNG còn tác dụng gì (`0059`).
       *
       * Nó từng phân biệt xem với tải, để chỉ lượt tải mới ghi vào *Lịch sử*.
       * Bản mềm không ghi lịch sử nữa nên phép phân biệt ấy hết việc.
       *
       * Nhận mà bỏ qua chứ không TỪ CHỐI: `validate` gạt mọi khoá lạ, nên xoá
       * hẳn khoá này là mọi liên kết cũ — thư đã gửi đi, tab người dùng còn mở —
       * đổi từ "xem được" thành lỗi 400. Một tham số thừa không hại ai.
       */
      xem: opt(oneOf('1')),
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
