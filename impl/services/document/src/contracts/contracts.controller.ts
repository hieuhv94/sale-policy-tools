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
import {
  CurrentUser,
  Roles,
  str,
  uuid,
  validate,
  xacNhanGoLai,
  type AuthUser,
} from '@csbh/http-kit';

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
   * CHI TIẾT một mẫu — bảng ánh xạ và tập cột, chỉ đọc (`0150`).
   *
   * Đường RIÊNG, không nới `GET :id` sẵn có. Đường kia mở cho năm vai trò để ô
   * chọn đọc được cái tên, còn đây là dữ liệu quản trị: ô trống nào lấy trường
   * nào, mẫu in ra mấy cột. Nhét chung là mở một cửa rộng hơn hẳn cho một tiện
   * ích của đúng một vai trò.
   *
   * Trả về cả mẫu ĐÃ VÔ HIỆU — xem `chiTiet`.
   */
  @Roles('QUAN_TRI')
  @Get(':id/chi-tiet')
  chiTietHopDong(@Param('id') id: string) {
    return this.templates.chiTiet(id, 'HOP_DONG');
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
   * VÔ HIỆU HOÁ — và KHÔNG có `@Delete` nào bên cạnh (`0098`).
   *
   * Đường xoá đã gỡ hẳn, không phải giấu đi: một mẫu xoá được là một hồ sơ đã
   * gắn nó hỏng được, mà hồ sơ thì khoá sửa từ lúc gửi duyệt. `DOC-28` quét bảng
   * định tuyến; thêm lại một `DELETE /contract-templates/:id` là ca kiểm đỏ.
   *
   * Gõ lại TÊN MẪU, kiểm ở máy chủ chứ không chỉ ở hộp thoại (luật `17/08`).
   */
  @Roles('QUAN_TRI')
  @Post(':id/vo-hieu')
  @HttpCode(200)
  async voHieu(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { confirm?: string },
  ) {
    const t = await this.templates.byId(id);
    xacNhanGoLai(body?.confirm, t.name, { viec: 'vô hiệu hoá mẫu này' });
    return this.templates.voHieu(id, me);
  }

  /** Dùng lại — không đòi gõ gì, vì bật lại không phá huỷ gì (`0098`). */
  @Roles('QUAN_TRI')
  @Post(':id/mo-lai')
  @HttpCode(200)
  moLai(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.templates.moLai(id, me);
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

  /**
   * Tên mẫu ĐÃ ĐÓNG BĂNG vào một hồ sơ, cho người xem hồ sơ đọc (`0098`).
   *
   * Mở cho năm vai trò như `available`, và trả cả mẫu ĐÃ VÔ HIỆU: hồ sơ gắn mẫu
   * nào thì màn hình phải nói được tên mẫu ấy, kể cả sau khi Quản trị rút nó
   * khỏi ô chọn. Giấu đi thì đúng lúc người ta hỏi "sao bản này khác bản kia"
   * lại là lúc không còn câu trả lời.
   *
   * ĐỨNG SAU `available` trong tệp này là bắt buộc: Nest khớp route theo thứ tự
   * khai, nên `:id` đặt trước sẽ nuốt luôn đường `/available`.
   *
   * KÈM CẢ `QUAN_TRI`, khác `available` ngay trên. `available` loại Quản trị ra
   * có lý — họ không phải người chọn mẫu để xem. Lý do ấy không áp được cho
   * đường này: nó chỉ trả một cái tên, và Quản trị là người QUẢN mẫu. Đo được
   * trên chồng demo: thiếu vai trò này thì chính họ gọi `/policy-templates/:id`
   * ăn 403 — một lỗ không màn hình nào lộ ra, vì màn hình quản trị đọc tên từ
   * danh sách chứ không từ đây.
   */
  /**
   * CHI TIẾT một mẫu — bảng ánh xạ và tập cột, chỉ đọc (`0150`).
   *
   * Đường RIÊNG, không nới `GET :id` sẵn có. Đường kia mở cho năm vai trò để ô
   * chọn đọc được cái tên, còn đây là dữ liệu quản trị: ô trống nào lấy trường
   * nào, mẫu in ra mấy cột. Nhét chung là mở một cửa rộng hơn hẳn cho một tiện
   * ích của đúng một vai trò.
   *
   * Trả về cả mẫu ĐÃ VÔ HIỆU — xem `chiTiet`.
   */
  @Roles('QUAN_TRI')
  @Get(':id/chi-tiet')
  chiTietHoSo(@Param('id') id: string) {
    return this.templates.chiTiet(id, 'HO_SO');
  }

  @Roles(...NGUOI_XEM_HO_SO, 'QUAN_TRI')
  @Get(':id')
  ten(@Param('id') id: string) {
    return this.templates.ten(id, 'HO_SO');
  }

  /**
   * Vô hiệu hoá — cùng luật với mẫu hợp đồng, hệ quả thì khác hẳn.
   *
   * Mẫu hợp đồng rút khỏi ô chọn thì lần xuất sau chọn cái khác là xong. Mẫu HỒ
   * SƠ thì đã đóng băng vào những hồ sơ đã gửi duyệt, nên vô hiệu hoá KHÔNG đụng
   * được tới chúng — và đó là điều phải bảo đảm, không phải điều phải chặn.
   */
  @Roles('QUAN_TRI')
  @Post(':id/vo-hieu')
  @HttpCode(200)
  async voHieu(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { confirm?: string },
  ) {
    const t = await this.templates.byId(id);
    xacNhanGoLai(body?.confirm, t.name, { viec: 'vô hiệu hoá mẫu này' });
    return this.templates.voHieu(id, me);
  }

  @Roles('QUAN_TRI')
  @Post(':id/mo-lai')
  @HttpCode(200)
  moLai(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.templates.moLai(id, me);
  }
}

@Controller('policies')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  /*
   * `mauId` BẮT BUỘC ở cả hai đường hợp đồng (`0098`).
   *
   * Tới `0097` nó là tuỳ chọn, và thiếu thì `chon()` lấy mẫu đầu danh sách. Cái
   * mặc định ngầm ấy đã bỏ: mỗi mẫu có tập cột riêng, nên "bản đầy đủ nội bộ" và
   * "bản gọn đưa khách hàng" là hai văn bản khác hẳn nhau — và người xuất hợp
   * đồng không được nhận về bản đầu tiên phần mềm nghĩ ra, mà phải nhận đúng bản
   * họ chọn. Giao diện chặn trước bằng nút xám; đây là chốt thứ hai, cho lượt
   * gọi thẳng API.
   */
  /** Xem trước: trả về dữ liệu đã trộn, KHÔNG sinh file và không ghi gì (DOC-14). */
  @Roles('KE_TOAN', 'SALE_ADMIN')
  @Get(':id/contract/preview')
  preview(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Query() q: Record<string, string>,
  ) {
    return this.contracts.preview(id, me, validate(q, { mauId: uuid() }).mauId);
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
    const b = validate(q, { mauId: uuid() });
    const { pdf, fileName } = await this.contracts.export(id, me, b.mauId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.end(pdf);
  }
}
