/**
 * Đường bình luận trên hồ sơ (`0261`). Cùng tiền tố `policies` nên gateway đã chuyển
 * về `policy` sẵn — không sửa `routes.ts`.
 *
 * ĐỌC không khai `@Roles`: ai mở được hồ sơ thì đọc được (phạm vi chốt ở service).
 *
 * GHI khai đủ năm vai trò trong luồng, **kể cả `BAN_LANH_DAO`** (chốt 06/11/2026) —
 * ngoại lệ có chủ ý của luật "Ban lãnh đạo chỉ đọc". SEC-13 ở
 * `tests/http/security.test.ts` canh luật ấy bằng một danh sách miễn trừ ghi lý do;
 * thêm một đường ghi mới vào tệp này là phải khai thêm ở đó, không tự lọt.
 * Quản trị hệ thống KHÔNG có ở đây: họ không có phạm vi hồ sơ nào.
 */
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { laMaCamXuc } from '@csbh/domain-policy';
import { CurrentUser, int, opt, Roles, str, uuid, validate, type AuthUser } from '@csbh/http-kit';
import { BinhLuanService } from './binh-luan.service.js';

/*
 * Vai trò khai BẰNG CHỮ ở từng `@Roles(...)`, không qua một hằng: SEC-13 đọc vai trò
 * từ chính chuỗi trong ngoặc. `@Roles(...MOT_HANG)` thì phép quét thấy một danh sách
 * RỖNG, và ngoại lệ Ban lãnh đạo — thứ cần được nhìn thấy nhất — lọt qua im lặng.
 */

/** Id trên đường dẫn: sai dạng là 404 của đúng thứ đang tìm, không phải 500 từ `22P02`. */
const idHoSo = (v: string) => {
  try {
    return uuid().parse(v, 'id').toLowerCase();
  } catch {
    throw new BadRequestException({ code: 'VALIDATION_FAILED', field: 'id', message: 'id: phải là một định danh hợp lệ' });
  }
};
const idBinhLuan = (v: string) => {
  try {
    return uuid().parse(v, 'binhLuanId').toLowerCase();
  } catch {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      field: 'binhLuanId',
      message: 'binhLuanId: phải là một định danh hợp lệ',
    });
  }
};
const loaiCamXuc = (v: string) => {
  if (!laMaCamXuc(v)) {
    throw new BadRequestException({ code: 'CAM_XUC_KHONG_HOP_LE', message: 'Cảm xúc này không có trong bộ cảm xúc.' });
  }
  return v;
};
const mocSo = (v: string | undefined, field: string) =>
  validate({ [field]: v }, { [field]: opt(int(0, Number.MAX_SAFE_INTEGER)) })[field] as number | undefined;

@Controller('policies')
export class BinhLuanController {
  constructor(private readonly binhLuan: BinhLuanService) {}

  @Get(':id/binh-luan')
  trang(@CurrentUser() me: AuthUser, @Param('id') id: string, @Query('truoc') truoc?: string) {
    return this.binhLuan.trang(idHoSo(id), mocSo(truoc, 'truoc'), me);
  }

  @Get(':id/binh-luan/thay-doi')
  thayDoi(@CurrentUser() me: AuthUser, @Param('id') id: string, @Query('tu') tu?: string) {
    return this.binhLuan.thayDoi(idHoSo(id), mocSo(tu, 'tu') ?? 0, me);
  }

  @Get(':id/binh-luan/nguoi-nhac')
  nguoiNhac(@CurrentUser() me: AuthUser, @Param('id') id: string, @Query('q') q?: string) {
    return this.binhLuan.nguoiNhac(idHoSo(id), (q ?? '').slice(0, 100), me);
  }

  @Get(':id/binh-luan/:bid/phan-hoi')
  phanHoi(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Param('bid') bid: string,
    @Query('truoc') truoc?: string,
  ) {
    return this.binhLuan.phanHoi(idHoSo(id), idBinhLuan(bid), mocSo(truoc, 'truoc'), me);
  }

  @Roles('TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'BAN_LANH_DAO')
  @Post(':id/binh-luan')
  @HttpCode(201)
  tao(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(body, {
      maGui: uuid(),
      // `str` cắt khoảng trắng hai đầu; chuẩn hoá đầy đủ (NFC, xuống dòng) ở service.
      // Trần ở đây là trần THÔ của lượt gửi, rộng hơn trần nghiệp vụ.
      noiDung: str(0, 30000),
      parentId: opt(uuid()),
    });
    return this.binhLuan.tao(
      idHoSo(id),
      { maGui: b.maGui.toLowerCase(), noiDung: b.noiDung, parentId: b.parentId?.toLowerCase() },
      me,
    );
  }

  @Roles('TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'BAN_LANH_DAO')
  @Patch(':id/binh-luan/:bid')
  sua(@CurrentUser() me: AuthUser, @Param('id') id: string, @Param('bid') bid: string, @Body() body: unknown) {
    const b = validate(body, { noiDung: str(0, 30000) });
    return this.binhLuan.sua(idHoSo(id), idBinhLuan(bid), b, me);
  }

  @Roles('TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'BAN_LANH_DAO')
  @Delete(':id/binh-luan/:bid')
  xoa(@CurrentUser() me: AuthUser, @Param('id') id: string, @Param('bid') bid: string) {
    return this.binhLuan.xoa(idHoSo(id), idBinhLuan(bid), me);
  }

  @Roles('TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'BAN_LANH_DAO')
  @Put(':id/binh-luan/:bid/cam-xuc/:loai')
  tha(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Param('bid') bid: string,
    @Param('loai') loai: string,
  ) {
    return this.binhLuan.camXuc(idHoSo(id), idBinhLuan(bid), loaiCamXuc(loai), true, me);
  }

  @Roles('TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'BAN_LANH_DAO')
  @Delete(':id/binh-luan/:bid/cam-xuc/:loai')
  go(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Param('bid') bid: string,
    @Param('loai') loai: string,
  ) {
    return this.binhLuan.camXuc(idHoSo(id), idBinhLuan(bid), loaiCamXuc(loai), false, me);
  }
}
