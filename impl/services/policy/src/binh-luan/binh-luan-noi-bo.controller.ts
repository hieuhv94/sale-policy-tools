/**
 * Đường NỘI BỘ của bình luận (`0263`) — `document` hỏi về tệp đính kèm.
 *
 * Tệp riêng chứ không thêm vào `internal.controller`: tệp ấy là cửa `document` và
 * `reporting` đọc HỒ SƠ, và có ca kiểm (`0261`) đòi nó không chạm tới bình luận —
 * nội dung bình luận không được lọt ra bản in hay read-model qua cửa ấy.
 *
 * Hai đường ở đây chỉ trả lời CÓ/KHÔNG và một danh sách id; không đường nào trả nội
 * dung bình luận.
 */
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ServiceOnly, str, uuid, validate } from '@csbh/http-kit';
import { BinhLuanService } from './binh-luan.service.js';

@ServiceOnly()
@Controller('internal/binh-luan')
export class BinhLuanNoiBoController {
  constructor(private readonly binhLuan: BinhLuanService) {}

  @Post('tep/xem-duoc')
  @HttpCode(200)
  async xemDuoc(@Body() body: unknown) {
    const b = validate(body, {
      fileId: uuid(),
      policyId: uuid(),
      nguoiTai: uuid(),
      userId: uuid(),
      role: str(1, 40),
    });
    return {
      duoc: await this.binhLuan.tepXemDuoc({
        fileId: b.fileId.toLowerCase(),
        policyId: b.policyId.toLowerCase(),
        nguoiTai: b.nguoiTai.toLowerCase(),
        userId: b.userId.toLowerCase(),
        role: b.role,
      }),
    };
  }

  @Post('tep/phan-loai')
  @HttpCode(200)
  async phanLoai(@Body() body: unknown) {
    const raw = (body ?? {}) as { tep?: unknown };
    const tep = Array.isArray(raw.tep)
      ? raw.tep.flatMap((t) => {
          const x = t as { id?: unknown; taoLuc?: unknown };
          return typeof x?.id === 'string' && /^[0-9a-f-]{36}$/i.test(x.id) && typeof x.taoLuc === 'string'
            ? [{ id: x.id.toLowerCase(), taoLuc: x.taoLuc }]
            : [];
        })
      : [];
    return { xoa: await this.binhLuan.phanLoaiTep(tep.slice(0, 1000)) };
  }
}
