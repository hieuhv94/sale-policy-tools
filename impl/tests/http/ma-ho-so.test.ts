/**
 * `0198` — MÃ HỒ SƠ: phép kiểm hình dạng, và phép dựng header tải tệp.
 *
 * Hai hàm THUẦN, nên tệp này không chạm CSDL và không chạm mạng. Chúng là hai
 * nửa của cùng một bản sửa: `chuanHoaMa` chặn mã bẩn ở đường VÀO, `tenTepTaiVe`
 * dựng header đúng dù tên tệp tới từ đâu.
 *
 * Vì sao cả hai đều cần, dù mỗi cái một mình nghe đã đủ: mã cũ lập trước `0198`
 * chưa từng đi qua `chuanHoaMa`, và tên tệp ở `document` còn dựng từ những
 * trường khác ngoài mã hồ sơ.
 */
import { describe, expect, it } from 'vitest';
import { chuanHoaMa, CAU_LOI_MA, DAI_TOI_DA_MA } from '@csbh/policy/testing';
import { tenTepTaiVe } from '@csbh/http-kit';

const ma = (s: string): string | null => {
  const r = chuanHoaMa(s);
  return 'ma' in r ? r.ma : null;
};
const loi = (s: string): string | null => {
  const r = chuanHoaMa(s);
  return 'loi' in r ? r.loi : null;
};

describe('`0198` mã hồ sơ — hình dạng', () => {
  it('mã hệ thống sinh ra vẫn đi qua được', () => {
    // Ca đối chiếu quan trọng nhất: phép kiểm mới KHÔNG được từ chối chính thứ
    // `pol.next_policy_code()` đang sinh, nếu không thì mọi lượt lập đều hỏng.
    expect(ma('CSBH-2026-000123')).toBe('CSBH-2026-000123');
  });

  it('cắt khoảng trắng hai đầu, giữ nguyên phần giữa', () => {
    expect(ma('  CSBH-2026-000123  ')).toBe('CSBH-2026-000123');
    // KHÔNG bóp khoảng trắng giữa chuỗi: đó là thứ người dùng cố ý gõ, và sửa hộ
    // là làm mã hiện ra khác mã họ vừa nhìn.
    expect(ma('CSBH 2026 000123')).toBe('CSBH 2026 000123');
  });

  it('KHÔNG viết hoa hộ, KHÔNG bỏ dấu hộ', () => {
    // Mã là thứ người dùng đối chiếu bằng mắt với một tờ giấy. Đổi chữ của họ mà
    // không nói là cách chắc chắn nhất để hai bên thôi khớp nhau.
    expect(ma('csbh-2026-abc')).toBe('csbh-2026-abc');
    expect(ma('CSBH-Đợt-1')).toBe('CSBH-Đợt-1');
  });

  it('rỗng hoặc chỉ khoảng trắng thì từ chối', () => {
    expect(loi('')).toBe('RONG');
    expect(loi('   ')).toBe('RONG');
  });

  it('quá dài thì từ chối, và ranh giới đo ĐÚNG ở trần', () => {
    // Hai ca sát nhau: `<=` viết nhầm thành `<` thì chỉ ca đầu bắt được.
    expect(ma('x'.repeat(DAI_TOI_DA_MA))).toBe('x'.repeat(DAI_TOI_DA_MA));
    expect(loi('x'.repeat(DAI_TOI_DA_MA + 1))).toBe('DAI');
  });

  it('độ dài đo SAU khi cắt khoảng trắng', () => {
    // Ngược lại thì một chuỗi hợp lệ kèm vài dấu cách thừa bị từ chối, với một
    // câu lỗi nói về thứ người dùng không nhìn thấy.
    expect(ma(`  ${'x'.repeat(DAI_TOI_DA_MA)}  `)).toBe('x'.repeat(DAI_TOI_DA_MA));
  });

  it('chặn đúng tập ký tự phá tên tệp và phá header', () => {
    /*
     * Đây là ca canh chính LỖ HỔNG mà chặng này bịt: tới `0197` mã hồ sơ do máy
     * sinh, nên `Content-Disposition: attachment; filename="${code}.pdf"` an
     * toàn nhờ một tiền đề không ai viết ra. `0198` cho TDV gõ và tiền đề ấy mất.
     */
    for (const c of ['"', '\\', '/', ':', '*', '?', '<', '>', '|']) {
      expect(loi(`CSBH${c}2026`), `ký tự ${c} phải bị chặn`).toBe('KY_TU');
    }
  });

  it('chặn ký tự ĐIỀU KHIỂN, kể cả xuống dòng và tab', () => {
    // `\r\n` trong một header là chèn được cả một header mới. Ba ca chứ không
    // một: dãy thoát trong regex rất dễ viết hụt một đầu.
    for (const c of ['\r', '\n', '\t', '\u0000', '\u007f']) {
      expect(loi(`CSBH${c}2026`), `ký tự ${JSON.stringify(c)} phải bị chặn`).toBe('KY_TU');
    }
  });

  it('mỗi lý do một CÂU RIÊNG, và không câu nào lộ tên trường trong mã', () => {
    // `0088` — câu lỗi không được lộ tên trường, mã trạng thái, hay chữ tiếng
    // Việt không dấu.
    const cau = Object.values(CAU_LOI_MA);
    expect(new Set(cau).size, 'ba lý do phải cho ba câu khác nhau').toBe(cau.length);
    for (const c of cau) {
      expect(c).not.toContain('code');
      expect(c.length).toBeGreaterThan(10);
    }
  });
});

describe('`0198` header tải tệp không cho tên tệp thoát ra ngoài', () => {
  /** Phần trong ngoặc kép của `filename="…"`. */
  const trongNgoac = (h: string): string => /filename="([^"]*)"/.exec(h)?.[1] ?? '';

  it('tên thường thì giữ nguyên ở cả hai dạng', () => {
    const h = tenTepTaiVe('CSBH-2026-000123.pdf');
    expect(trongNgoac(h)).toBe('CSBH-2026-000123.pdf');
    expect(h).toContain("filename*=UTF-8''CSBH-2026-000123.pdf");
  });

  it('dấu nháy kép KHÔNG thoát ra khỏi chuỗi', () => {
    /*
     * Ca đắt nhất của tệp này. Bản cũ dựng header bằng nội suy chuỗi trần, nên
     * một tên tệp chứa `"` cho ra một header có BA dấu nháy — phần sau dấu thứ
     * ba là chữ trình duyệt đọc như tham số mới.
     */
    const h = tenTepTaiVe('a".pdf');
    expect(trongNgoac(h)).not.toContain('"');
    expect(h.split('"').length - 1, 'chỉ được có đúng hai dấu nháy').toBe(2);
  });

  it('xuống dòng KHÔNG chèn được header thứ hai', () => {
    const h = tenTepTaiVe('a\r\nX-Ac-Y: 1.pdf');
    expect(h).not.toContain('\r');
    expect(h).not.toContain('\n');
  });

  it('dấu gạch chéo không cắt được thành đường dẫn ở phần ASCII', () => {
    expect(trongNgoac(tenTepTaiVe('../../etc/passwd'))).not.toContain('/');
  });

  it('tên tiếng Việt đi ở `filename*`, và phần ASCII vẫn tải về được', () => {
    // Vế thứ hai là lý do `filename` vẫn còn: trình duyệt cũ chỉ đọc nó, và một
    // chuỗi rỗng ở đó là một tệp không có tên.
    const h = tenTepTaiVe('Hồ sơ CSBH.pdf');
    expect(h).toContain("filename*=UTF-8''");
    expect(trongNgoac(h).length).toBeGreaterThan(0);
  });

  it('tên toàn ký tự lạ vẫn cho ra một tên tải về được', () => {
    // Lọc sạch thành rỗng là một tệp trình duyệt không biết đặt tên gì.
    expect(trongNgoac(tenTepTaiVe('???'))).not.toBe('');
  });
});
