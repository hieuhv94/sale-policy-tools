import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ACTIONS, type Action } from '@csbh/domain-policy';
import {
  CurrentUser,
  danhSach,
  int,
  money,
  moneyKhongAm,
  oneOf,
  opt,
  pageOf,
  Roles,
  ngayIso,
  str,
  uuid,
  validate,
  type AuthUser,
} from '@csbh/http-kit';
import { PoliciesService, type LineInput } from './policies.service.js';
import { WorkflowService } from './workflow.service.js';

/**
 * TDV KHÔNG gửi được Giá bán Công ty hay ngưỡng chiết khấu: hai giá trị đó lấy
 * từ danh mục và đóng băng vào hồ sơ. Từ chối thẳng thay vì im lặng bỏ qua —
 * im lặng thì người dùng tưởng số mình gửi đã được dùng (POL-12).
 */
const FORBIDDEN_FIELDS = [
  'companyPrice',
  'companyPriceSnap',
  'thresholdRate2',
  'threshold',
  'discountRate',
];

const rejectForbidden = (body: unknown): void => {
  if (typeof body !== 'object' || body === null) return;
  const present = FORBIDDEN_FIELDS.filter((f) => f in (body as Record<string, unknown>));
  if (present.length > 0) {
    throw new BadRequestException({
      code: 'FIELD_NOT_ALLOWED',
      fields: present,
      message: `Không được gửi ${present.join(', ')} — giá và ngưỡng lấy từ danh mục`,
    });
  }
};

const lineShape = {
  productId: str(1, 60),
  wholesalePrice: money(),
  /**
   * Các khoản chi phí bán hàng — SỐ LƯỢNG TUỲ DÒNG, không cố định bốn.
   *
   * `moneyKhongAm` chứ không `money`: một khoản chi phí bằng 0 là chuyện bình
   * thường (khoản đó không phát sinh), còn `money()` đòi lớn hơn 0 và sẽ chặn
   * đúng trường hợp ấy.
   *
   * Bọc `opt()` dù `danhSach()` tự trả mảng rỗng khi thiếu trường: `opt()` là
   * DẤU HIỆU DUY NHẤT của "không bắt buộc" trong cả kho mã, và `bat-buoc.test`
   * đọc chính dấu hiệu đó để đối chiếu dấu sao trên biểu mẫu với DTO. Bỏ nó đi
   * thì giao diện gắn sao cho một ô không bắt buộc, và nút Lưu chết mà không ai
   * hiểu vì sao.
   */
  cpbh: opt(danhSach(moneyKhongAm())),
  /**
   * Ghi chú tự do cho riêng dòng này (`0027`).
   *
   * 500 ký tự là chỗ cho vài câu, không phải chỗ cho một phụ lục — ô này in
   * thẳng vào bản CSBH A4 và một đoạn văn ở đó sẽ đẩy vỡ bảng mười cột.
   */
  note: opt(str(1, 500)),
  /**
   * NGÀY ÁP DỤNG của riêng dòng này (`0180`).
   *
   * `opt` dù biểu mẫu bắt buộc gõ: chỗ quyết định "không khai thì là ngày nào"
   * là MÁY CHỦ (`0104`), và nó điền hôm nay theo giờ Việt Nam. Bắt buộc ở DTO
   * thì mọi bộ nạp dữ liệu và mọi lượt gọi API đều phải tự tính "hôm nay" —
   * tức chép công thức múi giờ ra khắp nơi, đúng thứ `0128` đã trả giá.
   */
  ngayApDung: opt(ngayIso()),
};

const WRITERS = ['TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN'];

@Controller('policies')
export class PoliciesController {
  constructor(
    private readonly policies: PoliciesService,
    private readonly workflow: WorkflowService,
  ) {}

  @Get()
  list(
    @CurrentUser() me: AuthUser,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.policies.list(me, { customerId, status }, pageOf({ limit, offset }));
  }

  @Get('current')
  current(@CurrentUser() me: AuthUser, @Query('customerId') customerId: string) {
    const q = validate({ customerId }, { customerId: str(1, 60) });
    return this.policies.current(q.customerId, me);
  }
  /** Trang chủ: chỉ hồ sơ đang chờ CHÍNH người đăng nhập xử lý (NTF-07). */
  @Get('inbox')
  inbox(
    @CurrentUser() me: AuthUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.policies.inbox(me, pageOf({ limit, offset }));
  }


  /**
   * Hồ sơ đã đóng băng đang lệch so với danh mục (`0029`).
   *
   * ĐỨNG TRƯỚC `@Get(':id')`: Nest khớp route theo thứ tự khai báo, nên đặt sau
   * thì `/policies/impacted` rơi vào `:id` và trả 404 cho một chuỗi không phải
   * uuid — lỗi chỉ lộ ra khi mở đúng trang Tổng quan.
   */
  @Get('impacted')
  impacted(
    @CurrentUser() me: AuthUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.policies.impacted(me, pageOf({ limit, offset }));
  }

  @Get(':id')
  byId(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.policies.byId(id, me);
  }

  @Get(':id/versions')
  chain(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.policies.chain(id, me);
  }

  @Get(':id/events')
  events(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.policies.events(id, me);
  }

  /**
   * Xem trước ngưỡng chiết khấu của một sản phẩm với khách hàng của hồ sơ này.
   *
   * Không gắn `@Roles`: đây là đường ĐỌC, và nó không lộ ra thứ gì mà
   * `/catalog/thresholds/resolve` chưa lộ cho mọi vai trò. Phạm vi vẫn siết —
   * `thresholdPreview` gọi `assertInScope` như mọi đường đọc hồ sơ khác.
   */
  @Get(':id/threshold-preview')
  thresholdPreview(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Query('productId') productId: string,
    /**
     * NGÀY ÁP DỤNG người lập vừa gõ trong hộp thoại thêm dòng (`0180`).
     *
     * Bắt buộc phải nhận từ ngoài chứ không tự lấy hôm nay: ngưỡng và giá phụ
     * thuộc ngày (`0029`), nên xem trước bằng ngày khác ngày sắp ghi là bày ra
     * một con số rồi ghi một con số khác. Thiếu thì hôm nay — đúng mặc định mà
     * `upsertLine` sẽ dùng.
     */
    @Query('ngayApDung') ngayApDung?: string,
  ) {
    const q = validate(
      { productId, ...(ngayApDung ? { ngayApDung } : {}) },
      { productId: str(1, 60), ngayApDung: opt(ngayIso()) },
    );
    return this.policies.thresholdPreview(id, q.productId, me, q.ngayApDung);
  }

  @Get(':id/allowed-actions')
  allowed(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.workflow.allowed(id, me);
  }

  @Roles('TDV')
  @Post()
  @HttpCode(201)
  create(@CurrentUser() me: AuthUser, @Body() body: unknown) {
    rejectForbidden(body);
    const b = body as { lines?: unknown[] };
    (b.lines ?? []).forEach(rejectForbidden);

    const head = validate(body, {
      customerId: str(1, 60),
      // `0180` — MỘT giá trị thay cho `SUPPLEMENT`/`AMEND`; xem
      // `NEW_VERSION_MESSAGE`. `oneOf` giữ nguyên chứ không đổi sang cờ boolean:
      // một tên gọi được nói ra là thứ đọc được trong log và trong thân lỗi.
      mode: opt(oneOf('NEW_VERSION')),
    });
    const lines = (Array.isArray(b.lines) ? b.lines : []).map(
      (l) => validate(l, lineShape) as LineInput,
    );
    return this.policies.create({ ...head, lines }, me);
  }

  @Roles('TDV')
  @Post(':id/lines')
  @HttpCode(201)
  addLine(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    rejectForbidden(body);
    return this.policies.addLine(id, validate(body, lineShape) as LineInput, me);
  }

  /**
   * CHÈN MỘT DÒNG TRỐNG ở vị trí `viTri` (`0187`).
   *
   * Đường riêng, không gộp vào `POST :id/lines`: đường kia nhận một dòng ĐÃ ĐỦ
   * và nối vào cuối bảng, còn đường này nhận đúng một con số và không nhận gì
   * khác. Gộp lại thì thân yêu cầu có mọi trường tuỳ chọn, và *"thêm dòng trống"*
   * với *"thêm dòng đã điền"* thành cùng một lượt gọi mà chỉ hình dạng thân mới
   * phân biệt được — chỗ mà một trường gõ sai tên biến thành lượt chèn dòng trắng.
   */
  @Roles('TDV')
  @Post(':id/lines/chen')
  @HttpCode(201)
  chenDong(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    rejectForbidden(body);
    const b = validate(body, { viTri: int(0, 500) });
    return this.policies.themDongTrong(id, b.viTri, me);
  }

  /**
   * Sửa MỘT Ô của một dòng, trên bảng soạn thẳng (`0187`).
   *
   * BA TRẠNG THÁI của mỗi trường, và `opt()` một mình KHÔNG diễn đạt được: nó
   * gộp `undefined`, `null` và chuỗi rỗng về cùng một `undefined`. Bảng soạn
   * thẳng cần phân biệt *"không đụng tới ô này"* với *"vừa xoá trống ô này"* —
   * hai lượt gọi khác hẳn nhau, và lượt sau là lượt phải ghi `NULL` xuống cột.
   *
   * Nên phép kiểm sự CÓ MẶT của khoá đọc thẳng từ thân yêu cầu (`Object.hasOwn`),
   * còn `opt()` chỉ lo phần giá trị. Sửa `opt()` cho nhận `null` là đổi hành vi
   * của hàng trăm chỗ dùng khác để phục vụ đúng một đường.
   */
  @Roles('TDV')
  @Patch(':id/lines/:lineId')
  suaDong(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
  ) {
    rejectForbidden(body);
    const b = validate(body, {
      productId: opt(str(1, 60)),
      wholesalePrice: opt(moneyKhongAm()),
      cpbh: opt(danhSach(moneyKhongAm())),
      note: opt(str(1, 500)),
      ngayApDung: opt(ngayIso()),
    });
    const than = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
    const co = (k: string) => Object.hasOwn(than, k);
    return this.policies.updateLine(
      id,
      lineId,
      {
        // `co(k)` mà `b[k]` là `undefined` nghĩa là khoá có mặt với giá trị rỗng
        // — đó là lệnh XOÁ TRỐNG, nên nó thành `null`. Khoá vắng mặt thì để
        // `undefined`, và `updateLine` hiểu là giữ nguyên.
        ...(co('productId') ? { productId: b.productId ?? null } : {}),
        ...(co('wholesalePrice') ? { wholesalePrice: b.wholesalePrice ?? null } : {}),
        // `cpbh` KHÔNG có trạng thái `null`: mảng rỗng đã là "không khoản nào",
        // và `danhSach()` vốn trả mảng rỗng cho cả hai cách viết.
        ...(co('cpbh') ? { cpbh: b.cpbh ?? [] } : {}),
        ...(co('note') ? { note: b.note ?? null } : {}),
        ...(co('ngayApDung') ? { ngayApDung: b.ngayApDung ?? null } : {}),
      },
      me,
    );
  }

  /**
   * `@Roles('TDV')` ở đây RƠI MẤT suốt từ P26 tới `0099`: nó vốn đứng trên
   * đường này, rồi `suaDong` được chèn vào ngay dưới nó nên nó thành decorator
   * của phương thức mới — và `suaDong` sẵn có `@Roles(...WRITERS)` của riêng
   * mình, bị cái rơi xuống ghi đè lặng lẽ. Đường xoá dòng còn lại không khai vai
   * trò nào, tức mọi vai trò đã đăng nhập đều qua được chốt chặn.
   *
   * Luật thật giờ nằm ở `mustEdit`; dòng này là lớp thứ hai, và SEC-13 canh cho
   * không đường ghi nào của `policies` lại rơi mất lần nữa.
   */
  @Roles('TDV')
  @Delete(':id/lines/:lineId')
  removeLine(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ) {
    return this.policies.removeLine(id, lineId, me);
  }

  /**
   * THÊM LẠI một dòng đã rút (`0186`).
   *
   * `POST` chứ không `PATCH .../lines/:lineId`: đường `PATCH` nhận nguyên nội
   * dung một dòng và vắng mặt một trường ở đó CÓ NGHĨA (`cpbh`, `note` là xoá).
   * Nhét thêm một cờ `daXoa` vào đấy là để cùng một lượt gọi vừa khôi phục vừa
   * ghi đè bốn con số — đúng thứ `khoiPhucDong` phải không làm.
   *
   * Không có thân yêu cầu, nên không có gì để `validate`: khôi phục là một
   * ĐỘNG TÁC, mọi dữ liệu của dòng đã nằm sẵn trong CSDL.
   *
   * `@Roles('TDV')` đứng ngay trên phương thức của nó — xem bẫy decorator ghi ở
   * `removeLine` ngay trên, và SEC-13 canh chuyện ấy cho cả mười service.
   */
  @Roles('TDV')
  @Post(':id/lines/:lineId/khoi-phuc')
  @HttpCode(200)
  khoiPhucDong(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ) {
    return this.policies.khoiPhucDong(id, lineId, me);
  }

  /*
   * `PATCH /policies/:id` GỠ HẲN ở `0180`.
   *
   * Nó chỉ đổi được đúng một trường — ngày áp dụng của hồ sơ — và trường ấy vừa
   * chuyển xuống dòng sản phẩm. Giữ lại một đường `PATCH` không sửa được gì là
   * để lại một cánh cửa mà lần sau ai đó sẽ nhét vào một trường bất kỳ, ngoài
   * mọi phép kiểm của luồng duyệt.
   */

  /**
   * Xoá hồ sơ — CHỈ TDV đang phụ trách, và chỉ khi hồ sơ còn sửa được (`0035`).
   *
   * Vai trò thu từ `WRITERS + QUAN_TRI` xuống còn `TDV`. Bốn vai trò kia chưa
   * bao giờ xoá được gì: `remove()` luôn đòi hồ sơ ở trạng thái của người lập và
   * đúng người phụ trách, nên với họ đường này chỉ có một kết quả là 403. Bày ra
   * một quyền không dùng được là mời người đọc bảng phân quyền hiểu sai.
   *
   * Hồ sơ Từ chối vẫn không ai xoá được, kể cả Quản trị hệ thống (POL-14) — nó
   * không nằm trong `EDITABLE`, và trigger ở CSDL chặn thêm một lần nữa.
   */
  @Roles('TDV')
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.policies.remove(id, me);
  }

  @Roles(...WRITERS)
  @Post(':id/actions/:action')
  @HttpCode(200)
  act(@CurrentUser() me: AuthUser, @Param('id') id: string, @Param('action') action: string, @Body() body: unknown) {
    const a = validate({ action }, { action: oneOf(...ACTIONS) });
    const b = validate(body ?? {}, {
      reason: opt(str(1, 2000)),
      rowVersion: opt(int(0, 1_000_000)),
      // Người được chọn ở bước này (`0031`). `opt()` ở đây chứ không bắt buộc:
      // chỉ ba hành động cần chúng, và bắt buộc ở tầng DTO thì mọi hành động
      // khác cũng phải gửi kèm. Ai cần thì `doiPhanCong` đòi, kèm câu nói rõ
      // thiếu ô nào.
      tbpUserId: opt(str(36, 36)),
      keToanUserId: opt(str(36, 36)),
      saleAdminUserId: opt(str(36, 36)),
      // Mẫu bản mềm, đóng băng lúc gửi duyệt (`0098`). `opt()` cùng lý do như
      // ba ô trên: chỉ hai hành động cần nó. Bắt buộc thật sự thì `workflow`
      // đòi, kèm câu nói rõ phải chọn cái gì.
    });
    return this.workflow.act(id, a.action as Action, me, b);
  }

  @Roles(...WRITERS)
  @Post(':id/attachments')
  @HttpCode(201)
  attach(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, {
      kind: oneOf('HO_SO', 'SCAN', 'BAN_MEM'),
      fileName: str(1, 300),
      objectKey: str(1, 500),
      sizeBytes: opt(money()),
    });
    return this.workflow.attach(
      id,
      { kind: b.kind, fileName: b.fileName, objectKey: b.objectKey, sizeBytes: b.sizeBytes ?? 1n },
      me,
    );
  }

  @Roles(...WRITERS)
  @Delete(':id/attachments/:attachmentId')
  detach(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.workflow.detach(id, attachmentId, me);
  }
}
