/**
 * API nội bộ của `document` cho tệp — `policy` gọi, người dùng không (`0148`).
 *
 * Đúng MỘT việc: nhân bản tệp *Giấy tờ hồ sơ* sang một hồ sơ khác, dùng khi
 * Trình dược viên lập phiên bản CSBH mới.
 */
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ServiceOnly } from '@csbh/http-kit';
import { FilesService } from './files.service.js';

@ServiceOnly()
@Controller('internal/files')
export class FilesInternalController {
  constructor(private readonly files: FilesService) {}

  /**
   * Nhân bản tệp `HO_SO` của một hồ sơ sang hồ sơ khác.
   *
   * VÌ SAO `policy` KHÔNG TỰ LÀM ĐƯỢC: bảng `doc.stored_file` là của service
   * này, và `csbh_pol` không có quyền ghi vào lược đồ `doc` (AD-02). `policy`
   * chép được con trỏ của chính nó (`pol.policy_attachment`), nhưng con trỏ ấy
   * trỏ vào một tệp mà `document` vẫn ghi là của hồ sơ CŨ — và lượt kiểm quyền
   * lúc tải xuống đọc đúng cột `owner_id` ấy. Kết quả sẽ là một dòng tệp hiện
   * trên màn hình mà bấm vào thì 403: đúng cái hỏng mà lượt này sinh ra để chữa,
   * chỉ đổi hình dạng.
   *
   * CHỈ `HO_SO`, KHÔNG chép `SCAN`. Bản scan là tờ giấy đã ký của phiên bản CŨ;
   * mang nó sang bản mới thì `SA_HANDOVER` đi qua được chốt `SCAN_REQUIRED`
   * (WF-14) bằng chữ ký của một bản khác — không ai scan gì cả mà hệ thống tin
   * là đã có bản cứng. Đó là một lỗ hổng, không phải một tiện ích.
   */
  @Post('sao-chep')
  @HttpCode(200)
  async saoChep(@Body() body: { from?: unknown; to?: unknown; objectKeys?: unknown }) {
    const from = typeof body?.from === 'string' ? body.from : '';
    const to = typeof body?.to === 'string' ? body.to : '';
    const khoa = Array.isArray(body?.objectKeys)
      ? body.objectKeys.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [];
    if (!from || !to || khoa.length === 0) return { tep: [] };
    return { tep: await this.files.saoChepGiayToHoSo(from, to, khoa) };
  }

  /**
   * Gỡ hẳn một tệp — gọi khi con trỏ ở service kia vừa bị xoá (`0149`).
   *
   * VÌ SAO ĐƯỜNG NÀY PHẢI CÓ. `DELETE /files/:id` mở cho người dùng, và chú
   * thích ở `workflow.detach` nêu đúng lý do không gọi nó từ `policy`: vai trò
   * được gỡ đính kèm không nhất thiết là vai trò được xoá tệp.
   *
   * Nhưng lập luận ấy đã CŨ. Từ `0069`, gỡ `HO_SO` chỉ TDV làm được và gỡ `SCAN`
   * chỉ Sale Admin — đúng hai vai trò trong danh sách xoá tệp. Câu chú thích kia
   * tả thế giới trước `0069`, nơi mọi vai trò gỡ được; nó đúng lúc viết ra và
   * thành sai ngay chặng sau, không ai đọc lại.
   *
   * Đường nội bộ chứ không dùng lại đường của người dùng: đây là hệ quả tự động
   * của một thao tác đã được cho phép ở service kia, không phải một lượt xoá do
   * ai đó bấm — nên nó không đi qua chốt vai trò lần thứ hai.
   */
  @Post('go-bo')
  @HttpCode(200)
  async goBo(@Body() body: { objectKey?: unknown; lyDo?: unknown }) {
    const khoa = typeof body?.objectKey === 'string' ? body.objectKey : '';
    if (!khoa) return { removed: false };
    const lyDo = typeof body?.lyDo === 'string' && body.lyDo ? body.lyDo : 'gỡ khỏi hồ sơ';
    return { removed: await this.files.goBoTheoKhoa(khoa, lyDo) };
  }
}
