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
  str,
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
  ) {
    const q = validate({ productId }, { productId: str(1, 60) });
    return this.policies.thresholdPreview(id, q.productId, me);
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
      appliedDate: opt(str(10, 10)),
      mode: opt(oneOf('SUPPLEMENT', 'AMEND')),
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

  @Roles('TDV')
  /**
   * Sửa một dòng đã có. Sản phẩm KHÔNG nằm trong DTO — đổi sản phẩm là xoá dòng
   * rồi thêm dòng khác, xem chú thích ở `PoliciesService.updateLine`.
   */
  @Roles(...WRITERS)
  @Patch(':id/lines/:lineId')
  suaDong(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
  ) {
    rejectForbidden(body);
    const b = validate(body, {
      wholesalePrice: money(),
      cpbh: opt(danhSach(moneyKhongAm())),
      // Vắng mặt là XOÁ ghi chú, không phải "giữ nguyên": biểu mẫu sửa dòng gửi
      // lên toàn bộ nội dung dòng, cùng luật với `cpbh` ngay trên.
      note: opt(str(1, 500)),
    });
    return this.policies.updateLine(id, lineId, b, me);
  }

  @Delete(':id/lines/:lineId')
  removeLine(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ) {
    return this.policies.removeLine(id, lineId, me);
  }

  @Roles('TDV')
  @Patch(':id')
  update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    rejectForbidden(body);
    const b = validate(body, { appliedDate: str(10, 10) });
    return this.policies.updateAppliedDate(id, b.appliedDate, me);
  }

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
    });
    return this.workflow.act(id, a.action as Action, me, b);
  }

  @Roles(...WRITERS)
  @Post(':id/attachments')
  @HttpCode(201)
  attach(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, {
      kind: oneOf('HO_SO', 'SCAN'),
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
