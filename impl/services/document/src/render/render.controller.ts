import { Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles, uuid, validate, type AuthUser } from '@csbh/http-kit';
import { RenderService } from './render.service.js';

/**
 * CHỈ SALE ADMIN dựng được bản mềm (`0163`, chốt 29/08).
 *
 * Năm vai trò cũ mất quyền này, kể cả **Ban lãnh đạo** — hỏi lại và khách hàng
 * chốt đúng chữ *"chỉ giữ ở SA"*.
 *
 * Bản mềm thôi là văn bản đi qua luồng duyệt; nó là thao tác IN của Sale Admin ở
 * bước B8. Người duyệt đọc dữ liệu hồ sơ trên màn hình chi tiết — vốn đã mang đủ
 * mười ba mục của muc 11.1 — chứ không đọc bản dựng ra giấy.
 *
 * Chặn Ở ĐÂY chứ không chỉ ẩn nút: giấu một nút không ngăn được ai gọi thẳng
 * đường này.
 */
const READERS = ['SALE_ADMIN'];

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
      /*
       * BẮT BUỘC từ `0163` — trước là `opt(uuid())`.
       *
       * Bỏ trống từng nghĩa là *"đọc mẫu đã gắn vào hồ sơ"*, và không còn mẫu
       * nào gắn vào hồ sơ nữa. Người gọi duy nhất là hộp *Xem bản mềm* của Sale
       * Admin, và ở đó ô chọn mẫu luôn có giá trị.
       */
      mauId: uuid(),
    });
    const { body, code } = await this.render.pdf(id, b.mauId, me);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="CSBH-${code}.pdf"`);
    res.end(body);
  }

  /**
   * DỰNG BẢN MỀM RỒI LƯU thành một tệp của hồ sơ (`0167`).
   *
   * `POST` chứ không `GET`: đường trên trả về một tờ giấy để đọc rồi quên, đường
   * này **ghi** — một dòng `doc.stored_file` và một object trên kho. Trả cùng
   * hình dạng với `POST /files` để lượt gắn tệp phía sau đi đúng đường mà bản
   * scan đang đi.
   *
   * `mauId` bắt buộc, và chỉ nhận **mẫu hồ sơ đầy đủ** — xem `luuBanMem`.
   */
  @Roles(...READERS)
  @Post(':id/render/luu')
  @HttpCode(201)
  async luu(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Query() q: Record<string, string>,
  ) {
    const b = validate(q, { mauId: uuid() });
    return this.render.luuBanMem(id, b.mauId, me);
  }
}
