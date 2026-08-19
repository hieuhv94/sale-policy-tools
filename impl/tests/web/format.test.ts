/**
 * FE-27 · FE-29 — con số hiển thị phải KHỚP TUYỆT ĐỐI con số API trả về.
 */
import { describe, expect, it } from 'vitest';
import { ngay, ngayGio, nhanTrangThai, nhomTrangThai, tien, tyLe } from '@csbh/web/format';

describe('FE-29 hiển thị tiền', () => {
  it('phân nhóm nghìn, không có phần thập phân', () => {
    expect(tien('1234567')).toBe('1.234.567');
    expect(tien('100000')).toBe('100.000');
    expect(tien('999')).toBe('999');
    expect(tien('0')).toBe('0');
  });

  it('giữ nguyên độ chính xác của số vượt 2^53', () => {
    // API trả bigint dạng chuỗi. Đi qua Number() là mất chữ số trong im lặng —
    // đúng chỗ không được sai một đồng nào.
    const to = '9007199254740993';
    expect(tien(to)).toBe('9.007.199.254.740.993');
    expect(String(Number(to))).not.toBe(to);
  });

  it('rỗng thành gạch ngang, không thành số 0', () => {
    // "0 đồng" và "chưa có số liệu" là hai điều khác hẳn nhau.
    expect(tien(null)).toBe('—');
    expect(tien(undefined)).toBe('—');
    expect(tien('')).toBe('—');
  });
});

describe('FE-27 tỷ lệ chiết khấu', () => {
  it('in NGUYÊN con số API trả về, chỉ đổi dấu thập phân', () => {
    expect(tyLe('12.34')).toBe('12,34%');
    expect(tyLe('0.00')).toBe('0,00%');
    expect(tyLe('100.00')).toBe('100,00%');
  });

  it('KHÔNG làm tròn lại ở giao diện', () => {
    // Máy chủ đã chốt con số và đã dùng chính nó để so ngưỡng. Gọi toFixed(2) ở
    // đây sẽ cho 12,35 trong khi máy chủ ghi 12,34 — con số hiển thị và con số
    // đem so ngưỡng phải là MỘT.
    expect(tyLe('12.345')).toBe('12,345%');
    expect(tyLe('12.345')).not.toBe('12,35%');
  });
});

describe('Ngày theo múi giờ Việt Nam', () => {
  it('23:00 UTC ngày 7 đọc ra ngày 8 (OPS-09)', () => {
    expect(ngay('2026-08-07T23:00:00Z')).toBe('08/08/2026');
    expect(ngayGio('2026-08-07T23:00:00Z')).toBe('08/08/2026 06:00');
  });

  it('giá trị rỗng hoặc hỏng thành gạch ngang', () => {
    expect(ngay(null)).toBe('—');
    expect(ngay('khong-phai-ngay')).toBe('—');
  });
});

describe('Nhãn trạng thái', () => {
  it('phủ đủ 11 trạng thái của muc 4, `0035` và `0064`', () => {
    const tatCa = [
      'NHAP', 'CHO_TBP_DUYET', 'CHO_KT_L1', 'SA_DANG_XU_LY',
      'CHO_KT_L2', 'DANG_CO_HIEU_LUC', 'HET_HIEU_LUC', 'YEU_CAU_CHINH_SUA',
      'TU_CHOI', 'QUA_HAN_DUYET', 'DA_XOA',
    ];
    for (const t of tatCa) {
      expect(nhanTrangThai(t), `thiếu nhãn cho ${t}`).not.toBe(t);
      expect(nhomTrangThai(t)).toBeTruthy();
    }
  });
});
