import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  danhSach,
  int,
  money,
  oneOf,
  opt,
  pageOf,
  Roles,
  str,
  validate,
  type AuthUser,
} from '@csbh/http-kit';
import { CustomersService } from './customers.service.js';
import { taxId } from './tax-id.js';
import { soDienThoai } from './so-dien-thoai.js';
import { DIEU_KHOAN_NO } from './dieu-khoan.js';

/** Ban lãnh đạo chỉ đọc; mọi endpoint ghi ở đây đều loại vai trò đó ra (AUTH-13). */
const WRITERS = ['TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'QUAN_TRI'];

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  search(
    @CurrentUser() me: AuthUser,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    /** `true` = giấu khách đã ngừng hợp tác. Dùng cho ô chọn lúc lập hồ sơ (`0034`). */
    @Query('forNewPolicy') forNewPolicy?: string,
  ) {
    return this.customers.search(q, me, pageOf({ limit, offset }), {
      forNewPolicy: forNewPolicy === 'true',
    });
  }

  /**
   * Ô mã số thuế hỏi NGAY LÚC GÕ, chưa ghi gì (`0175`).
   *
   * PHẢI KHAI TRƯỚC `@Get(':id')`. Nest khớp route theo THỨ TỰ KHAI BÁO, nên đặt
   * sau thì `kiem-tra-mst` rơi vào `:id` và thành một lượt tra khách hàng theo
   * một uuid không hợp lệ — 404, chứ không phải một lỗi nói ra chuyện gì.
   *
   * `tru` = id khách đang sửa: lượt sửa nào cũng gửi lại chính mã số thuế đang
   * có, và không trừ ra thì màn hình báo trùng với chính nó.
   */
  @Get('kiem-tra-mst')
  kiemTraMst(@Query('mst') mst: string, @Query('tru') tru?: string) {
    const b = validate({ mst, ...(tru === undefined ? {} : { tru }) }, {
      mst: taxId(),
      tru: opt(str(36, 36)),
    });
    return this.customers.kiemTraMst(b.mst, b.tru);
  }

  @Get(':id')
  byId(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.customers.byId(id, me);
  }

  @Get(':id/documents')
  documents(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.customers.listDocuments(id, me);
  }

  @Roles(...WRITERS)
  @Post(':id/documents')
  @HttpCode(201)
  attachDocument(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, {
      kind: str(1, 60),
      fileName: str(1, 300),
      objectKey: str(1, 500),
      sizeBytes: money(),
    });
    return this.customers.attachDocument(id, b, me);
  }
  /**
   * Gỡ một hồ sơ pháp lý (`0069`).
   *
   * `@Roles(...WRITERS)` chỉ là cửa ngoài; phép kiểm thật — **đúng TDV phụ
   * trách khách hàng ấy** — nằm ở service, vì nó cần đọc dòng khách hàng ra mới
   * trả lời được.
   */
  @Roles(...WRITERS)
  @Delete(':id/documents/:documentId')
  removeDocument(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.customers.removeDocument(id, documentId, me);
  }


  @Roles(...WRITERS)
  @Post()
  @HttpCode(201)
  create(@CurrentUser() me: AuthUser, @Body() body: unknown) {
    const b = validate(body, {
      code: str(1, 60),
      name: str(1, 300),
      // Loại khách hàng chỉ có ba giá trị (CUST-06).
      customerType: int(1, 3),
      /*
       * ĐỊA CHỈ ĐĂNG KÝ: HAI Ô, CHỈ MỘT (`0175`, chốt 05/09) — trước là một
       * danh sách (`0154`).
       *
       * `str(1, …)` chứ không `str(0, …)`: hai ô này bắt buộc, và ô trống không
       * còn là một trạng thái trung gian hợp lệ của biểu mẫu — không có nút
       * *Thêm* nào sinh ra chúng nữa. Câu lỗi tiếng Việt nói rõ ô nào vẫn ở
       * service (`assertDiaChiDangKy`), vì nó là chỗ duy nhất phân biệt được
       * *"vắng mặt"* với *"gửi lên chuỗi rỗng"*.
       */
      province: str(1, 200),
      streetWard: str(1, 500),
      ownerName: str(1, 200),
      /*
       * MÃ SỐ THUẾ BẮT BUỘC từ `0175` — trước là `opt(taxId())`.
       *
       * Khách hàng cũ chưa khai thì cột vẫn `NULL` ở CSDL; chốt này chỉ áp cho
       * lượt LẬP MỚI. Lượt sửa vẫn `opt`, vì `PATCH` không gửi kèm thì nghĩa là
       * không đụng tới — nhưng biểu mẫu khai ô ấy bắt buộc, nên bất kỳ lượt sửa
       * nào cũng lấp chỗ trống của một khách hàng cũ.
       */
      idNumber: taxId(),
      deliveryAddresses: opt(danhSach(str(0, 500))),
      ownerTitle: opt(str(1, 120)),
      // `0223` — đúng 10 chữ số; trả về bản chuẩn (bỏ dấu cách, chấm, gạch).
      phone: opt(soDienThoai()),
      ownerIdNumber: opt(str(1, 60)),
      /*
       * ĐIỀU KHOẢN thanh toán (`0138`) — thay cho `debt: opt(moneyKhongAm())`.
       *
       * `debtNote` khai `str(1, 500)` chứ không bắt buộc: ràng buộc thật là
       * *"bắt buộc KHI VÀ CHỈ KHI chọn Khác"*, một luật hai chiều mà bộ kiểm
       * theo từng trường không phát biểu được. Nó nằm ở `assertDieuKhoan`.
       */
      debtTerm: opt(oneOf(...DIEU_KHOAN_NO)),
      debtNote: opt(str(1, 500)),
    });
    return this.customers.create(b, me);
  }

  @Roles(...WRITERS)
  @Patch(':id')
  update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, {
      /*
       * MÃ KHÁCH HÀNG SỬA ĐƯỢC (`0226`, khách hàng chốt 28/09) — tới `0225` trường
       * này không có ở đây và trigger `0006` chặn ở CSDL (CUST-15). Ai được sửa
       * là luật của SERVICE (`assertChinhTdv`, chỉ TDV phụ trách), không phải
       * của `@Roles` ở cửa: Kế toán, Sale Admin, Quản trị vẫn gửi lại ĐÚNG mã
       * đang có được — chỉ ĐỔI mới bị chặn.
       *
       * `str(0, …)` chứ không `str(1, …)`, cùng lẽ với `province` bên dưới:
       * `str()` tự cắt khoảng trắng, nên với `str(1, …)` mã toàn dấu cách bị chặn
       * NGAY Ở ĐÂY bằng câu *"phải có tối thiểu 1 ký tự"*, và nhánh
       * `CUSTOMER_CODE_REQUIRED` ở service thành mã chết — lượt chạy đầu của
       * `0226` bắt đúng chỗ ấy.
       */
      code: opt(str(0, 60)),
      name: opt(str(1, 300)),
      /*
       * Loại khách hàng SỬA ĐƯỢC (`0023`).
       *
       * Trước đây chỉ đặt được lúc lập. Lý do cũ nghe hợp lý — nó quyết định
       * ngưỡng chiết khấu — nhưng thực tế khách hàng ĐỔI hạng, và cách duy nhất
       * còn lại là lập một khách hàng mới với mã mới, tức là cắt đôi lịch sử
       * CSBH của cùng một khách.
       *
       * An toàn với hồ sơ đã lập: mỗi dòng giữ `threshold_snap` của riêng nó, và
       * ngưỡng chỉ tra lại khi dòng được ghi lại. Hồ sơ đang chờ duyệt không
       * khoá sửa được nên chúng không đổi số dưới tay người duyệt.
       */
      customerType: opt(int(1, 3)),
      /*
       * `0154` — vắng mặt = không đụng tới; mảng RỖNG = xoá hết.
       *
       * Hai nghĩa khác nhau, và `opt()` giữ được cả hai vì nó phân biệt "vắng
       * mặt" với "có mặt mà rỗng". Gộp chúng lại là mất khả năng xoá dòng cuối —
       * đúng lỗi `0138` đã phải chữa cho `debtNote`.
       *
       * CHỈ CÒN ĐỊA CHỈ GIAO HÀNG ở dạng danh sách (`0175`).
       */
      deliveryAddresses: opt(danhSach(str(0, 500))),
      /*
       * `str(0, …)` chứ không `str(1, …)`: chuỗi rỗng phải ĐI QUA được tới
       * service, nơi nó thành `CUSTOMER_PROVINCE_REQUIRED` — một câu nói đúng
       * việc phải làm. Chặn ở đây thì người dùng xoá trắng ô rồi bấm Lưu sẽ nhận
       * *"phải có tối thiểu 1 ký tự"*, một câu về độ dài chuỗi.
       */
      province: opt(str(0, 200)),
      streetWard: opt(str(0, 500)),
      ownerName: opt(str(1, 200)),
      ownerTitle: opt(str(1, 120)),
      // `0223` — đúng 10 chữ số; trả về bản chuẩn (bỏ dấu cách, chấm, gạch).
      phone: opt(soDienThoai()),
      ownerIdNumber: opt(str(1, 60)),
      idNumber: opt(taxId()),
      /*
       * ĐIỀU KHOẢN thanh toán (`0138`) — thay cho `debt: opt(moneyKhongAm())`.
       *
       * `debtNote` khai `str(1, 500)` chứ không bắt buộc: ràng buộc thật là
       * *"bắt buộc KHI VÀ CHỈ KHI chọn Khác"*, một luật hai chiều mà bộ kiểm
       * theo từng trường không phát biểu được. Nó nằm ở `assertDieuKhoan`.
       */
      debtTerm: opt(oneOf(...DIEU_KHOAN_NO)),
      debtNote: opt(str(1, 500)),
      tdvUserId: opt(str(36, 36)),
    });
    return this.customers.update(id, b, me);
  }

  /**
   * Xem trước hậu quả của *Ngừng hợp tác* (`0034`).
   *
   * `@Roles('TDV')` chứ không phải `WRITERS`: chỉ TDV phụ trách bấm được, và
   * service còn kiểm đúng người nữa (`assertChinhTdv`).
   */
  @Roles('TDV')
  @Get(':id/ngung-hop-tac')
  xemTruocNgung(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.customers.xemTruocNgung(id, me);
  }

  /**
   * MỘT thao tác thay cho *Xoá* và *Ngừng hợp tác* (`0034`).
   *
   * Giữ động từ HTTP `DELETE` vì với khách chưa có hồ sơ nào thì nó xoá thật;
   * còn khách đã có lịch sử thì nó chuyển trạng thái. Người gọi không phải chọn
   * — xem `CustomersService.ngungHopTac`.
   */
  @Roles('TDV')
  @Delete(':id')
  remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.customers.ngungHopTac(id, me);
  }
}
