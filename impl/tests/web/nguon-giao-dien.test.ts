/**
 * FE-19 · FE-21 — hai bất biến kiểm bằng cách QUÉT MÃ NGUỒN.
 *
 * Không kiểm được bằng cách mở màn hình: cái sai là sự CÓ MẶT của một dòng mã,
 * ở một màn hình mà người kiểm có thể không nghĩ tới.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const GOC = 'apps/web/src';

function moiTep(thuMuc: string, duoi: string[]): string[] {
  const ra: string[] = [];
  for (const t of readdirSync(thuMuc)) {
    const d = join(thuMuc, t);
    if (statSync(d).isDirectory()) ra.push(...moiTep(d, duoi));
    else if (duoi.some((x) => d.endsWith(x))) ra.push(d);
  }
  return ra;
}

describe('FE-19 mọi màu đến từ bảng token', () => {
  it('không có mã màu viết thẳng ngoài tokens.css', () => {
    const lac: string[] = [];
    for (const tep of moiTep(GOC, ['.ts', '.tsx', '.css'])) {
      if (tep.endsWith('tokens.css')) continue;
      const noiDung = readFileSync(tep, 'utf8');
      for (const [i, dong] of noiDung.split('\n').entries()) {
        // #abc, #aabbcc, #aabbccdd
        if (/#[0-9a-fA-F]{3,8}\b/.test(dong)) lac.push(`${tep}:${i + 1}  ${dong.trim()}`);
        if (/\b(rgb|hsl)a?\s*\(/.test(dong) && !dong.includes('rgb(27 37 48')) {
          lac.push(`${tep}:${i + 1}  ${dong.trim()}`);
        }
      }
    }
    expect(lac, `màu nằm ngoài bảng token:\n${lac.join('\n')}`).toEqual([]);
  });

  it('`0050` mọi biến CSS được dùng đều CÓ THẬT trong tokens.css', () => {
    /*
     * Lỗ hổng mà `FE-19` không bịt, và nó đã lọt suốt từ `0029`.
     *
     * `FE-19` cấm mã màu viết thẳng, nên `background: var(--mau-chinh)` đi qua
     * sạch sẽ — trông y hệt một biến hợp lệ. Nhưng `--mau-chinh` chưa bao giờ
     * được khai. Trình duyệt bỏ qua cả khai báo hỏng, nhãn *Giá* không có nền,
     * mà chữ thì `color: var(--mau-nen)` — trắng trên nền trắng.
     *
     * Không màn hình nào đỏ, không test nào đỏ; nhãn chỉ đơn giản là vô hình.
     * Quét ngược từ chỗ DÙNG về chỗ KHAI là cách duy nhất bắt được.
     */
    const tokens = readFileSync(join(GOC, 'styles/tokens.css'), 'utf8');
    const daKhai = new Set([...tokens.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));

    const thieu: string[] = [];
    for (const tep of moiTep(GOC, ['.css', '.tsx'])) {
      if (tep.endsWith('tokens.css')) continue;
      for (const [i, dong] of readFileSync(tep, 'utf8').split('\n').entries()) {
        for (const m of dong.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
          // `var(--x, giá-trị-lùi)` thì thiếu cũng không sao — đã có đường lùi.
          const coDuongLui = dong.slice(m.index ?? 0).includes(',');
          if (!daKhai.has(m[1]!) && !coDuongLui) thieu.push(`${tep}:${i + 1} ${m[1]}`);
        }
      }
    }
    expect(thieu, thieu.join('\n')).toEqual([]);
  });

  it('tokens.css khai đủ nhóm màu có nghĩa nghiệp vụ', () => {
    const css = readFileSync(join(GOC, 'styles/tokens.css'), 'utf8');
    for (const bien of [
      '--mau-thuong-hieu',
      '--mau-loi',
      '--mau-tot',
      '--mau-canh-bao',
      '--mau-cho',
      '--vung-cham',
    ]) {
      expect(css, `thiếu token ${bien}`).toContain(bien);
    }
  });
});

describe('FE-21 không có chức năng in phía máy người dùng', () => {
  it('không lời gọi window.print, không @media print, không nút In', () => {
    const viPham: string[] = [];
    for (const tep of moiTep(GOC, ['.ts', '.tsx', '.css'])) {
      const noiDung = readFileSync(tep, 'utf8');
      for (const [i, dong] of noiDung.split('\n').entries()) {
        const s = dong.trim();
        if (s.startsWith('*') || s.startsWith('//')) continue;
        // Bản in A4 sinh Ở MÁY CHỦ và tải về dạng PDF (muc 11.1). In từ trình
        // duyệt cho ra file khác nhau trên từng máy — chính thứ FE-20 cấm.
        if (/window\s*\.\s*print\s*\(/.test(dong)) viPham.push(`${tep}:${i + 1} window.print`);
        if (/@media\s+print/.test(dong)) viPham.push(`${tep}:${i + 1} @media print`);
      }
    }
    expect(viPham, viPham.join('\n')).toEqual([]);
  });
});

describe('FE-08 vùng chạm tối thiểu', () => {
  it('mọi lớp nút và ô nhập đều đặt chiều cao tối thiểu bằng token', () => {
    const css = readFileSync(join(GOC, 'styles/app.css'), 'utf8');
    for (const lop of ['.nut {', '.o-nhap {', '.nut-menu {', '.cpbh-nut {']) {
      const i = css.indexOf(lop);
      expect(i, `không tìm thấy lớp ${lop}`).toBeGreaterThan(-1);
      const khoi = css.slice(i, css.indexOf('}', i));
      expect(khoi, `${lop} thiếu min-height: var(--vung-cham)`).toContain('var(--vung-cham)');
    }
  });
});

describe('FE-11 không đặt cỡ chữ tuyệt đối', () => {
  it('không dùng px cho font-size — cỡ chữ hệ thống 200% phải phóng được', () => {
    const css = readFileSync(join(GOC, 'styles/app.css'), 'utf8');
    const tokens = readFileSync(join(GOC, 'styles/tokens.css'), 'utf8');
    for (const [ten, noiDung] of [['app.css', css], ['tokens.css', tokens]] as const) {
      const xau = noiDung
        .split('\n')
        .filter((d) => /font-size\s*:\s*\d+px/.test(d))
        .map((d) => `${ten}: ${d.trim()}`);
      expect(xau, xau.join('\n')).toEqual([]);
    }
  });
});
