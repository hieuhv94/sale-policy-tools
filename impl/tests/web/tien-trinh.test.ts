/**
 * `0257` — cột TIẾN TRÌNH DUYỆT của trang hồ sơ (`lib/tien-trinh.ts`).
 *
 * Phủ MỌI trạng thái của `STATUSES`: một trạng thái mới thêm vào máy trạng thái mà
 * quên khai ở `DANG_O` sẽ rơi vào nhánh DỪNG — hồ sơ đang đi trong luồng hiện chữ
 * *"Dừng"* màu đỏ. Ca cuối đòi bảng tra phủ đủ để điều ấy đỏ ngay.
 */
import { describe, expect, it } from 'vitest';
import { STATUSES } from '@csbh/domain-policy';
import { tienTrinh, type NguoiDuyet } from '@csbh/web/tien-trinh';

const ky = (ten: string): { ten: string; luc: string } => ({ ten, luc: '2026-11-01T02:00:00.000Z' });
const tinhTrang = (st: string, nd: NguoiDuyet = {}) => tienTrinh(st, nd, 'Lê Thu Hà').buoc.map((b) => b.tinhTrang);

describe('`0257` tiến trình duyệt', () => {
  it.each([
    ['NHAP', ['dang', 'chua', 'chua', 'chua', 'chua', 'chua']],
    ['YEU_CAU_CHINH_SUA', ['dang', 'chua', 'chua', 'chua', 'chua', 'chua']],
    ['CHO_TBP_DUYET', ['xong', 'dang', 'chua', 'chua', 'chua', 'chua']],
    ['CHO_KT_L1', ['xong', 'xong', 'dang', 'chua', 'chua', 'chua']],
    ['SA_DANG_XU_LY', ['xong', 'xong', 'xong', 'dang', 'chua', 'chua']],
    ['SA_SUA_BAN_CUNG', ['xong', 'xong', 'xong', 'dang', 'chua', 'chua']],
    ['CHO_KT_L2', ['xong', 'xong', 'xong', 'xong', 'dang', 'chua']],
    ['DANG_CO_HIEU_LUC', ['xong', 'xong', 'xong', 'xong', 'xong', 'xong']],
    ['HET_HIEU_LUC', ['xong', 'xong', 'xong', 'xong', 'xong', 'xong']],
  ])('%s', (st, mong) => {
    expect(tinhTrang(st)).toEqual(mong);
    expect(tienTrinh(st, {}, null).dung).toBe(false);
  });

  it('bước đang ở nói ĐANG LÀM GÌ: soạn · sửa theo yêu cầu · sửa bản cứng · chờ', () => {
    const ghi = (st: string) => tienTrinh(st, {}, null).buoc.find((b) => b.tinhTrang === 'dang')?.ghiChu;
    expect(ghi('NHAP')).toBe('Đang soạn');
    expect(ghi('YEU_CAU_CHINH_SUA')).toBe('Đang sửa theo yêu cầu');
    expect(ghi('SA_SUA_BAN_CUNG')).toBe('Đang sửa bản cứng');
    expect(ghi('CHO_KT_L1')).toBe('Đang chờ');
  });

  it('bước đã xong mang TÊN + MỐC của đúng người ký; bước gửi mang người đề nghị', () => {
    const { buoc } = tienTrinh('SA_DANG_XU_LY', { tbp: ky('Phạm Quốc Minh'), keToanL1: ky('Đỗ Thanh Hương') }, 'Lê Thu Hà');
    expect(buoc[0]).toMatchObject({ khoa: 'gui', nguoi: 'Lê Thu Hà' });
    expect(buoc[1]).toMatchObject({ khoa: 'tbp', nguoi: 'Phạm Quốc Minh', luc: '2026-11-01T02:00:00.000Z' });
    expect(buoc[2]).toMatchObject({ khoa: 'keToanL1', nguoi: 'Đỗ Thanh Hương' });
    // Tên tra không ra thì nói thành lời — như dải "đã duyệt" cũ.
    expect(tienTrinh('CHO_KT_L1', { tbp: { ten: null, luc: 'x' } }, null).buoc[1]!.nguoi).toBe('không tra được tên');
  });

  it('hồ sơ DỪNG (quá hạn, đã xoá): không bước nào "đang", bước có chữ ký vẫn là "xong"', () => {
    for (const st of ['QUA_HAN_DUYET', 'DA_XOA']) {
      const r = tienTrinh(st, { tbp: ky('Phạm Quốc Minh') }, null);
      expect(r.dung).toBe(true);
      expect(r.buoc.map((b) => b.tinhTrang)).toEqual(['xong', 'xong', 'chua', 'chua', 'chua', 'chua']);
    }
    expect(tienTrinh('DA_XOA', {}, null).buoc.every((b) => b.tinhTrang === 'chua')).toBe(true);
  });

  it('mọi trạng thái của máy trạng thái đều được khai — chỉ hai trạng thái DỪNG rơi vào nhánh dừng', () => {
    const dung = STATUSES.filter((st) => tienTrinh(st, {}, null).dung);
    expect([...dung].sort()).toEqual(['DA_XOA', 'QUA_HAN_DUYET']);
  });
});
