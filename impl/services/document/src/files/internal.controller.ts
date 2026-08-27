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
  async saoChep(@Body() body: { from?: unknown; to?: unknown }) {
    const from = typeof body?.from === 'string' ? body.from : '';
    const to = typeof body?.to === 'string' ? body.to : '';
    if (!from || !to) return { tep: [] };
    return { tep: await this.files.saoChepGiayToHoSo(from, to) };
  }
}
