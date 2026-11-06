/**
 * `0257` — kanban hồ sơ: ma trận vai trò × trạng thái ĐÃ DUYỆT trong mockup
 * (https://claude.ai/artifact/6iodETdNwHXXsYMj5gohpd, mục *Ma trận*), và hai luật
 * đứng trên nó: cột trống thì ẩn ở mọi mức; mức `A` không bao giờ giấu hồ sơ.
 */
import { describe, expect, it } from 'vitest';
import { CHU_BUOC, STATUSES, type Status } from '@csbh/domain-policy';
import { LUONG, cotHien, laVaiTroKanban, mucCot, type VaiTroKanban } from '@csbh/web/kanban';

/* Ma trận chép NGUYÊN từ mockup — đổi một ô là đổi một quyết định khách hàng đã duyệt. */
const MA_TRAN: Record<VaiTroKanban, string> = {
  //            NHAP YCCS TBP KT1 SA SASUA KT2 HL HET QH XOA
  TDV:          'V    V    M   M   M  G     M   G  G   G  G',
  TBP:          'A    M    V   M   M  M     M   G  G   G  G',
  KE_TOAN:      'A    G    G   V   M  M     V   G  G   G  G',
  SALE_ADMIN:   'A    G    G   G   V  V     M   G  G   G  G',
  BAN_LANH_DAO: 'G    G    M   M   M  M     M   G  G   M  G',
};

describe('`0257` ma trận cột kanban theo vai trò', () => {
  it('LUONG là đủ 11 trạng thái của máy trạng thái, theo thứ tự luồng', () => {
    expect([...LUONG].sort()).toEqual([...STATUSES].sort());
    expect(LUONG.slice(0, 7)).toEqual([
      'NHAP', 'YEU_CAU_CHINH_SUA', 'CHO_TBP_DUYET', 'CHO_KT_L1', 'SA_DANG_XU_LY', 'SA_SUA_BAN_CUNG', 'CHO_KT_L2',
    ]);
  });

  it.each(Object.keys(MA_TRAN) as VaiTroKanban[])('%s khớp ma trận đã duyệt', (vt) => {
    expect(LUONG.map((st) => mucCot(vt, st)).join(' ')).toBe(MA_TRAN[vt].split(/\s+/).join(' '));
  });

  it('"Việc của bạn" = CHU_BUOC của domain-policy (cùng nguồn với chuông) + Nháp của TDV', () => {
    for (const vt of Object.keys(MA_TRAN) as VaiTroKanban[]) {
      for (const st of LUONG) {
        const laViec = CHU_BUOC[st] === vt || (st === 'NHAP' && vt === 'TDV');
        expect(mucCot(vt, st) === 'V', `${vt} × ${st}`).toBe(laViec);
      }
    }
  });

  it('Quản trị không có kanban — họ không có trang hồ sơ', () => {
    expect(laVaiTroKanban('QUAN_TRI')).toBe(false);
    expect(laVaiTroKanban(undefined)).toBe(false);
    expect(laVaiTroKanban('TDV')).toBe(true);
  });
});

const dem = (o: Partial<Record<Status, number>>) => Object.fromEntries(LUONG.map((s) => [s, o[s] ?? 0]));

describe('`0257` cột nào hiện', () => {
  it('cột TRỐNG ẩn ở MỌI mức, kể cả Việc của bạn; ghi tên vào danh sách ẩn', () => {
    const r = cotHien('TDV', dem({ YEU_CAU_CHINH_SUA: 2, CHO_TBP_DUYET: 1 }), [], {});
    expect(r.cot.map((c) => c.trangThai)).toEqual(['YEU_CAU_CHINH_SUA', 'CHO_TBP_DUYET']);
    expect(r.anVITrong).toContain('NHAP');
    expect(r.anVITrong).toHaveLength(9);
  });

  it('mức A có hồ sơ thì HIỆN, ở dạng gập — không bao giờ giấu hồ sơ', () => {
    const r = cotHien('KE_TOAN', dem({ NHAP: 1 }), [], {});
    expect(r.cot).toEqual([{ trangThai: 'NHAP', muc: 'A', gap: true, dem: 1 }]);
  });

  it('M mở sẵn, G gập sẵn; lựa chọn tay thắng mặc định — trừ cột Việc của bạn', () => {
    const d = dem({ NHAP: 1, CHO_TBP_DUYET: 1, DANG_CO_HIEU_LUC: 5 });
    const gapOf = (chon = {}) => Object.fromEntries(cotHien('TDV', d, [], chon).cot.map((c) => [c.trangThai, c.gap]));
    expect(gapOf()).toEqual({ NHAP: false, CHO_TBP_DUYET: false, DANG_CO_HIEU_LUC: true });
    expect(gapOf({ DANG_CO_HIEU_LUC: 'mo', CHO_TBP_DUYET: 'gap', NHAP: 'gap' })).toEqual({
      NHAP: false, // Việc của bạn: không gập được
      CHO_TBP_DUYET: true,
      DANG_CO_HIEU_LUC: false,
    });
  });

  it('lọc theo Trạng thái: chỉ còn cột trong bộ lọc, cột ngoài bộ lọc KHÔNG tính là "ẩn vì trống"', () => {
    const r = cotHien('BAN_LANH_DAO', dem({ CHO_TBP_DUYET: 3, CHO_KT_L1: 0 }), ['CHO_TBP_DUYET', 'CHO_KT_L1'], {});
    expect(r.cot.map((c) => c.trangThai)).toEqual(['CHO_TBP_DUYET']);
    expect(r.anVITrong).toEqual(['CHO_KT_L1']);
  });

  it('chưa đếm xong thì không hiện cột nào — không đoán', () => {
    expect(cotHien('TDV', {}, [], {})).toEqual({ cot: [], anVITrong: [] });
  });
});
