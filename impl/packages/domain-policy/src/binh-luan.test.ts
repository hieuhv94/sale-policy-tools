/**
 * `0261` — phần thuần của bình luận: chuẩn hoá, đếm, kiểm, đọc nhắc tên, tách đoạn.
 *
 * Mỗi nhóm ca canh một cách mà phần này có thể nói dối mà không gì khác đỏ:
 * đếm sai độ dài (giao diện và máy chủ cãi nhau ở ký tự thứ 5.000), đọc trùng
 * người được nhắc (thông báo gửi hai lần), và tách liên kết lỏng (một
 * `javascript:` thành chỗ bấm được).
 */
import { describe, expect, it } from 'vitest';
import {
  CAM_XUC,
  GIOI_HAN_BINH_LUAN,
  MA_CAM_XUC,
  chuanNoiDung,
  dauNhac,
  demKyTu,
  kiemNoiDung,
  laMaCamXuc,
  nguoiDuocNhac,
  tachDoan,
  trichDoan,
} from './binh-luan.js';

const A = '11111111-2222-3333-4444-555555555555';
const B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('chuanNoiDung', () => {
  it('cắt khoảng trắng và dòng trống ở hai đầu, giữ nguyên ở giữa', () => {
    expect(chuanNoiDung('  \n\n Chào  anh\n\nem gửi \n  ')).toBe('Chào  anh\n\nem gửi');
  });
  it('đưa NFD về NFC — hai dạng của cùng một chữ ra cùng một chuỗi', () => {
    const nfd = 'Hà Nội'.normalize('NFD');
    expect(nfd).not.toBe('Hà Nội');
    expect(chuanNoiDung(nfd)).toBe('Hà Nội');
  });
  it('xuống dòng kiểu Windows (\\r\\n) và kiểu cũ (\\r) về \\n', () => {
    expect(chuanNoiDung('a\r\nb\rc')).toBe('a\nb\nc');
  });
});

describe('demKyTu', () => {
  it('đếm code point: một emoji là MỘT ký tự dù chiếm hai đơn vị UTF-16', () => {
    expect('😄'.length).toBe(2);
    expect(demKyTu('😄')).toBe(1);
  });
  it('mỗi dấu nhắc tính một ký tự, không tính 39 ký tự của id', () => {
    expect(demKyTu(`chào ${dauNhac(A)}`)).toBe(6);
  });
});

describe('kiemNoiDung', () => {
  it('rỗng → BINH_LUAN_RONG; rỗng mà có tệp → hợp lệ', () => {
    expect(kiemNoiDung('')).toBe('BINH_LUAN_RONG');
    expect(kiemNoiDung('', true)).toBeNull();
  });
  it('chỉ khoảng trắng: sau chuẩn hoá là rỗng', () => {
    expect(kiemNoiDung(chuanNoiDung(' \n\t '))).toBe('BINH_LUAN_RONG');
  });
  it('đúng trần thì được, quá một ký tự thì không', () => {
    const n = GIOI_HAN_BINH_LUAN.kyTuToiDa;
    expect(kiemNoiDung('a'.repeat(n))).toBeNull();
    expect(kiemNoiDung('a'.repeat(n + 1))).toBe('BINH_LUAN_QUA_DAI');
  });
  it('trần tính theo code point: 5.000 emoji vẫn được dù dài 10.000 đơn vị UTF-16', () => {
    expect(kiemNoiDung('😄'.repeat(GIOI_HAN_BINH_LUAN.kyTuToiDa))).toBeNull();
  });
  it('nhắc 20 người thì được, 21 người thì không; nhắc MỘT người nhiều lần tính một', () => {
    const id = (i: number) => `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000`;
    const hai_muoi = Array.from({ length: 20 }, (_, i) => dauNhac(id(i))).join(' ');
    expect(kiemNoiDung(hai_muoi)).toBeNull();
    expect(kiemNoiDung(`${hai_muoi} ${dauNhac(id(20))}`)).toBe('QUA_NHIEU_NHAC_TEN');
    expect(kiemNoiDung(Array.from({ length: 30 }, () => dauNhac(A)).join(' '))).toBeNull();
  });
});

describe('nguoiDuocNhac', () => {
  it('không trùng, đúng thứ tự xuất hiện lần đầu', () => {
    expect(nguoiDuocNhac(`${dauNhac(B)} rồi ${dauNhac(A)} và lại ${dauNhac(B)}`)).toEqual([B, A]);
  });
  it('chữ "@tên" gõ tay KHÔNG phải nhắc tên — chỉ dấu có id mới là', () => {
    expect(nguoiDuocNhac('@Nguyễn Văn An xem giúp')).toEqual([]);
  });
  it('id viết HOA hoặc sai dạng không được đọc là nhắc tên', () => {
    // B có chữ cái — A toàn chữ số nên viết hoa vẫn y nguyên và ca này sẽ đo nhầm.
    expect(B.toUpperCase()).not.toBe(B);
    expect(nguoiDuocNhac(`@{${B.toUpperCase()}} @{khong-phai-uuid}`)).toEqual([]);
    expect(dauNhac(B.toUpperCase())).toBe(`@{${B}}`);
  });
});

describe('tachDoan', () => {
  it('chữ · nhắc tên · liên kết theo đúng thứ tự', () => {
    expect(tachDoan(`Chào ${dauNhac(A)}, xem https://a.vn/x nhé`)).toEqual([
      { loai: 'chu', chu: 'Chào ' },
      { loai: 'nhac', userId: A },
      { loai: 'chu', chu: ', xem ' },
      { loai: 'lien-ket', url: 'https://a.vn/x' },
      { loai: 'chu', chu: ' nhé' },
    ]);
  });
  it('dấu câu dính cuối liên kết không thuộc liên kết', () => {
    const d = tachDoan('(xem https://a.vn/x).');
    expect(d).toContainEqual({ loai: 'lien-ket', url: 'https://a.vn/x' });
    expect(d[d.length - 1]).toEqual({ loai: 'chu', chu: ').' });
  });
  it('javascript:, data:, www. không có giao thức → chỉ là chữ', () => {
    for (const s of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'www.nutricare.vn', 'ftp://a.vn']) {
      expect(tachDoan(s).every((d) => d.loai === 'chu'), s).toBe(true);
    }
  });
  it('"https://" trơn không có tên miền thì không thành liên kết', () => {
    expect(tachDoan('gõ https:// rồi thôi').every((d) => d.loai === 'chu')).toBe(true);
  });
  it('chữ HTML đi nguyên văn trong đoạn chữ — không có đoạn nào khác được sinh ra', () => {
    expect(tachDoan('<script>alert(1)</script>')).toEqual([
      { loai: 'chu', chu: '<script>alert(1)</script>' },
    ]);
  });
  it('ghép lại các đoạn chữ thì ra đúng nội dung gốc (không mất ký tự nào)', () => {
    const s = `a ${dauNhac(A)} https://x.vn/y?z=1, b`;
    const ghep = tachDoan(s)
      .map((d) => (d.loai === 'chu' ? d.chu : d.loai === 'nhac' ? dauNhac(d.userId) : d.url))
      .join('');
    expect(ghep).toBe(s);
  });
});

describe('trichDoan', () => {
  it('thay dấu nhắc bằng @tên, gộp khoảng trắng, cắt ở trần kèm dấu ba chấm', () => {
    const ten = (id: string) => (id === A ? 'Lê Hoàng Minh' : undefined);
    expect(trichDoan(`Nhờ ${dauNhac(A)}\n\nxem   giúp`, ten)).toBe('Nhờ @Lê Hoàng Minh xem giúp');
    const dai = trichDoan('x'.repeat(300), ten);
    expect([...dai]).toHaveLength(GIOI_HAN_BINH_LUAN.trichDoan + 1);
    expect(dai.endsWith('…')).toBe(true);
  });
  it('người không tra được tên vẫn ra một chữ đọc được, không lộ id', () => {
    expect(trichDoan(dauNhac(B), () => undefined)).toBe('@người dùng');
  });
});

describe('CAM_XUC', () => {
  it('đúng sáu cảm xúc của yêu cầu, mã chữ đi được trên địa chỉ', () => {
    expect(Object.values(CAM_XUC)).toEqual(['👍', '❤️', '🎉', '👀', '🚀', '😄']);
    for (const m of MA_CAM_XUC) expect(m).toMatch(/^[A-Z]+$/);
    expect(laMaCamXuc('THICH')).toBe(true);
    expect(laMaCamXuc('👍')).toBe(false);
  });
});
