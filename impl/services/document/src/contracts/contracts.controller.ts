/**
 * API văn bản mẫu (Quản trị hệ thống) và xuất hợp đồng (Kế toán · Sale Admin).
 *
 * CHÚ Ý VỚI NGƯỜI SỬA VỀ SAU: ở đây KHÔNG có và không được thêm
 * `GET /contracts/:id`. Hợp đồng không phải một tài nguyên có định danh — nó là
 * kết quả của một phép biến đổi trên hồ sơ CSBH (muc 8.3). Test `DOC-28` quét
 * bảng định tuyến và sẽ đỏ nếu một route như vậy xuất hiện.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser, opt, Roles, str, uuid, validate, type AuthUser } from '@csbh/http-kit';

/**
 * Ai được XEM bản mềm CSBH — và vì thế ai được thấy danh sách mẫu để chọn (`0058`).
 *
 * Cùng danh sách với `render.controller.ts`. Chép sang đây thay vì nhập từ đó
 * vì hai controller nằm hai mô-đun và chiều phụ thuộc đang là render → contracts;
 * đảo lại để dùng chung một hằng số là đổi kiến trúc cho một mảng năm chuỗi.
 * `document.test.ts` đối chiếu hai danh sách để chúng không lệch nhau.
 */
export const NGUOI_XEM_HO_SO = ['TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'BAN_LANH_DAO'];
import { MAX_BYTES } from '../files/files.service.js';
import { TemplatesService, type MappingInput } from './templates.service.js';
import { ContractsService } from './contracts.service.js';
import { KNOWN_SOURCES, NGUON_BAT_BUOC_HO_SO } from './sources.js';
import { O_BANG_SAN_PHAM } from './docx.js';
import { COT_BANG, COT_BAT_BUOC } from './bang-san-pham.js';

/**
 * Đọc bảng ánh xạ từ một trường FORM (chuỗi JSON) — dùng chung hai loại mẫu.
 *
 * Đi trong multipart cùng file, vì từ `0067` cả mẫu và ánh xạ lưu MỘT LƯỢT: một
 * lời gọi, một giao dịch, không có trạng thái nửa vời nào ở giữa.
 *
 * Mỗi dòng chỉ còn HAI trường. `format` và `required` đã bỏ — định dạng đi theo
 * trường nguồn, còn mục bắt buộc thì kiểm theo muc 11.1 chứ không theo cờ người
 * dùng tự đánh.
 */
function docAnhXa(raw: string | undefined): MappingInput[] {
  let list: unknown;
  try {
    list = JSON.parse(raw ?? '[]');
  } catch {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      field: 'mapping',
      message: 'mapping phải là JSON hợp lệ',
    });
  }
  if (!Array.isArray(list)) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      field: 'mapping',
      message: 'mapping phải là một mảng',
    });
  }
  return list.map((m) => validate(m, { placeholder: str(1, 200), source: str(1, 200) }));
}

/** Tập cột bảng sản phẩm, cũng đi trong form dưới dạng JSON. `undefined` = mặc định. */
function docCotBang(raw: string | undefined): unknown {
  if (raw === undefined || raw === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      field: 'cotBang',
      message: 'cotBang phải là JSON hợp lệ',
    });
  }
}

@Controller('contract-templates')
export class ContractTemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /*
   * QUẢN TRỊ HỆ THỐNG, không phải Sale Admin (`0060`).
   *
   * DOC-26 giao mẫu hợp đồng cho Sale Admin vì nó là "văn bản nghiệp vụ của
   * người bán". Khách hàng chốt lại ngày 20/08: gộp về Quản trị, cùng chỗ với
   * mẫu hồ sơ CSBH.
   *
   * Lý do gộp không phải là "cho gọn". Hai loại mẫu dùng CHUNG một bộ máy — tải
   * .docx lên, đọc ô trống, ánh xạ trường, ban hành — và bộ máy ấy là việc kỹ
   * thuật: nó đòi hiểu khoá trộn, hiểu vì sao Word cắt rời một ô trống, hiểu
   * `{{bang_san_pham}}` khác gì `{{san_pham.*}}`. Chia đôi cho hai vai trò nghĩa
   * là hai người phải học cùng một thứ, và người học ít dùng hơn sẽ quên.
   *
   * Sale Admin KHÔNG mất gì trong luồng nghiệp vụ: họ vẫn xuất hợp đồng, và vẫn
   * CHỌN mẫu nào lúc xuất — xem `available` phía dưới.
   */
  @Roles('QUAN_TRI')
  @Post('o-trong')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES + 1 } }))
  oTrong(@UploadedFile() file: { buffer: Buffer } | undefined) {
    if (!file) throw new BadRequestException({ code: 'FILE_MISSING', message: 'Thiếu phần file' });
    return this.templates.doOTrong(file.buffer);
  }

  @Roles('QUAN_TRI')
  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES + 1 } }))
  async luu(
    @CurrentUser() me: AuthUser,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body() body: { name?: string; mapping?: string; cotBang?: string },
  ) {
    if (!file) throw new BadRequestException({ code: 'FILE_MISSING', message: 'Thiếu phần file' });
    const b = validate({ name: body?.name ?? 'Mẫu hợp đồng' }, { name: str(1, 200) });
    return this.templates.luu(
      {
        name: b.name,
        buffer: file.buffer,
        kind: 'HOP_DONG',
        mapping: docAnhXa(body?.mapping),
        cotBang: docCotBang(body?.cotBang),
      },
      me,
    );
  }

  @Roles('QUAN_TRI')
  @Get()
  list() {
    return this.templates.list();
  }

  /**
   * Mẫu dùng được, cho ô chọn lúc xuất hợp đồng (`0058`).
   *
   * Đây là đường DUY NHẤT của `/contract-templates` mà Quản trị KHÔNG vào được,
   * và ngược lại là đường duy nhất Kế toán với Sale Admin vào được (`0060`).
   * Không mâu thuẫn: nó phục vụ người XUẤT hợp đồng, không phục vụ người quản lý
   * mẫu — Quản trị không xuất hợp đồng bao giờ.
   */
  @Roles('KE_TOAN', 'SALE_ADMIN')
  @Get('available')
  available() {
    return this.templates.khaDung('HOP_DONG');
  }

  @Roles('QUAN_TRI')
  @Get('sources')
  sources() {
    return { knownSources: KNOWN_SOURCES };
  }

  /**
   * XOÁ, và không có đường SỬA nào bên cạnh (`0067`).
   *
   * Muốn đổi một mẫu thì xoá đi rồi thêm mẫu mới — xem `TemplatesService.xoa`.
   */
  @Roles('QUAN_TRI')
  @Delete(':id')
  @HttpCode(200)
  xoa(@Param('id') id: string) {
    return this.templates.xoa(id);
  }
}

/**
 * Mẫu HỒ SƠ CSBH — của **Quản trị hệ thống** (muc 6.4, `0055`).
 *
 * VẪN TÁCH CONTROLLER dù từ `0060` cả hai loại mẫu cùng một chủ, và hai lý do
 * cũ mất đi một:
 *
 *   1. ~~Vai trò khác~~ — không còn: cả hai là `QUAN_TRI`.
 *   2. **Luật khác nhau, không phải cấu hình khác nhau.** Mẫu hồ sơ có 13 mục
 *      bắt buộc kiểm lúc ban hành, và có `{{bang_san_pham}}` do hệ thống dựng.
 *      Mẫu hợp đồng không có mục bắt buộc nào và vẽ bảng bằng tay. Gộp lại là
 *      một controller đầy nhánh `if (kind === 'HO_SO')`.
 *   3. **Đường dẫn nói đúng thứ nó quản.** Và đó không chỉ là chuyện thẩm mỹ:
 *      `available` của hai loại mở cho hai tập vai trò khác hẳn nhau, nên gộp
 *      đường dẫn là gộp luôn hai phép kiểm quyền không gộp được.
 */
@Controller('policy-templates')
export class PolicyTemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Roles('QUAN_TRI')
  @Post('o-trong')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES + 1 } }))
  oTrong(@UploadedFile() file: { buffer: Buffer } | undefined) {
    if (!file) throw new BadRequestException({ code: 'FILE_MISSING', message: 'Thiếu phần file' });
    return this.templates.doOTrong(file.buffer);
  }

  @Roles('QUAN_TRI')
  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES + 1 } }))
  async luu(
    @CurrentUser() me: AuthUser,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body() body: { name?: string; mapping?: string; cotBang?: string },
  ) {
    if (!file) throw new BadRequestException({ code: 'FILE_MISSING', message: 'Thiếu phần file' });
    const b = validate({ name: body?.name ?? 'Mẫu hồ sơ CSBH' }, { name: str(1, 200) });
    return this.templates.luu(
      {
        name: b.name,
        buffer: file.buffer,
        kind: 'HO_SO',
        mapping: docAnhXa(body?.mapping),
        cotBang: docCotBang(body?.cotBang),
      },
      me,
    );
  }

  @Roles('QUAN_TRI')
  @Get()
  list() {
    return this.templates.list('HO_SO');
  }

  /**
   * Mẫu dùng được, cho Ô CHỌN lúc xem bản mềm (`0058`).
   *
   * MỞ CHO NĂM VAI TRÒ ĐỌC, không riêng Quản trị — và đó là chủ ý: người chọn
   * mẫu là kế toán, TDV, Trưởng bộ phận. Họ cần biết có những mẫu nào, chứ không
   * cần quyền thêm hay xoá mẫu nào.
   */
  @Roles(...NGUOI_XEM_HO_SO)
  @Get('available')
  available() {
    return this.templates.khaDung('HO_SO');
  }

  @Roles('QUAN_TRI')
  @Get('sources')
  sources() {
    // Kèm danh sách mục BẮT BUỘC và danh mục CỘT của bảng sản phẩm: màn hình
    // thêm mẫu cần cả hai để dựng hướng dẫn và ô chọn cột.
    return {
      knownSources: KNOWN_SOURCES,
      batBuoc: NGUON_BAT_BUOC_HO_SO,
      oBangSanPham: O_BANG_SAN_PHAM,
      cotBang: COT_BANG,
      cotBatBuoc: COT_BAT_BUOC,
    };
  }

  @Roles('QUAN_TRI')
  @Delete(':id')
  @HttpCode(200)
  xoa(@Param('id') id: string) {
    return this.templates.xoa(id);
  }
}

@Controller('policies')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  /** Xem trước: trả về dữ liệu đã trộn, KHÔNG sinh file và không ghi gì (DOC-14). */
  @Roles('KE_TOAN', 'SALE_ADMIN')
  @Get(':id/contract/preview')
  preview(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Query() q: Record<string, string>,
  ) {
    return this.contracts.preview(id, me, validate(q, { mauId: opt(uuid()) }).mauId);
  }

  /**
   * `xem` ĐÃ BỎ HẲN (`0059`) — hợp đồng không ghi *Lịch sử* nữa nên phép phân
   * biệt xem với tải hết việc, còn con dấu *đã xuất hợp đồng* thì vốn đã đóng ở
   * cả hai đường. Một địa chỉ còn mang `?xem=1` vẫn trả về đúng bản PDF:
   * `validate` bỏ qua khoá lạ chứ không từ chối.
   */
  @Roles('KE_TOAN', 'SALE_ADMIN')
  @Get(':id/contract.pdf')
  async pdf(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Query() q: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const b = validate(q, { mauId: opt(uuid()) });
    const { pdf, fileName } = await this.contracts.export(id, me, b.mauId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.end(pdf);
  }
}
