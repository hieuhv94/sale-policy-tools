/**
 * MÀN HÌNH CẢM ỨNG (`0266`) — ô nhập 16px và vùng chạm 44px, chỉ khi con trỏ
 * chính là ngón tay (`@media (pointer: coarse)` ở cuối `app.css`).
 *
 * jsdom không tính cascade theo media query, nên các ca ở đây đọc CSS. Phép đo
 * THẬT (Chrome giả lập iPhone 390×844 và máy tính bảng 768×1024 trên chồng demo,
 * đọc khung bao + lớp `::after` của từng phần tử bấm được) nằm ở nhật ký P302.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync('apps/web/src/styles/app.css', 'utf8');
const KHONG_CHU_THICH = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** Thân một khối `@media` (đếm ngoặc), tính trên CSS đã gỡ chú thích. */
function khoiMedia(dau: string): { than: string; viTri: number } {
  const i = KHONG_CHU_THICH.indexOf(dau);
  expect(i, `thiếu khối ${dau}`).toBeGreaterThan(-1);
  const mo = KHONG_CHU_THICH.indexOf('{', i);
  let sau = 0;
  for (let j = mo; j < KHONG_CHU_THICH.length; j++) {
    if (KHONG_CHU_THICH[j] === '{') sau++;
    if (KHONG_CHU_THICH[j] === '}' && --sau === 0) return { than: KHONG_CHU_THICH.slice(mo + 1, j), viTri: i };
  }
  throw new Error(`khối ${dau} không đóng`);
}

/** Các luật trong một đoạn CSS phẳng: danh sách bộ chọn + thân. */
function luat(css: string): { chon: string[]; than: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    chon: m[1]!.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean),
    than: m[2]!,
  }));
}

const CAM_UNG = khoiMedia('@media (pointer: coarse) {');
const LUAT_CAM_UNG = luat(CAM_UNG.than);
const coBoChon = (sel: string, dieuKien: (than: string) => boolean) =>
  LUAT_CAM_UNG.some((l) => l.chon.includes(sel) && dieuKien(l.than));

describe('`0266` ô nhập 16px trên màn hình cảm ứng — Safari iPhone thôi tự phóng to', () => {
  const oNhap = LUAT_CAM_UNG.find((l) => l.chon.some((s) => /\binput\b/.test(s) && /\bselect\b/.test(s) && /\btextarea\b/.test(s)));

  it('một luật phủ cả input, select, textarea với cỡ chữ 1rem', () => {
    expect(oNhap, 'thiếu luật cỡ chữ ô nhập trong khối pointer: coarse').toBeDefined();
    expect(oNhap!.than).toMatch(/font-size:\s*1rem;/);
  });

  it('không đụng ô đánh dấu, nút chọn, thanh trượt, ô chọn tệp', () => {
    const chon = oNhap!.chon.join(',');
    for (const loai of ['checkbox', 'radio', 'range', 'file']) expect(chon).toContain(`[type='${loai}']`);
  });

  it('đứng SAU mọi luật đặt chữ cho ô nhập (`.o-nhap`, `.bl-soan textarea`) — cùng độ đặc hiệu thì luật sau thắng', () => {
    for (const sel of ['\n.o-nhap {', '\n.bl-soan textarea {']) {
      const i = KHONG_CHU_THICH.indexOf(sel);
      expect(i, sel).toBeGreaterThan(-1);
      expect(i).toBeLessThan(CAM_UNG.viTri);
    }
  });

  it('không luật nào sau khối cảm ứng đặt lại cỡ chữ ô nhập', () => {
    const sau = KHONG_CHU_THICH.slice(CAM_UNG.viTri + CAM_UNG.than.length);
    const dat = luat(sau).filter((l) => l.chon.some((s) => /\b(input|select|textarea)\b|\.o-nhap/.test(s)) && /font(-size)?:/.test(l.than));
    expect(dat).toEqual([]);
  });
});

describe('`0266` vùng chạm 44px trên màn hình cảm ứng', () => {
  /** Nút có chỗ: phóng to THẬT bằng `--vung-cham`. */
  const PHONG_TO_THAT = [
    '.kb-nut-gap',
    '.bl-soan-chan .nut-bieu-tuong',
    '.bl-soan-ngu-canh .nut-bieu-tuong',
    '.bl-tep-cho .nut-bieu-tuong',
    '.bl-cx-bang button',
  ];
  it.each(PHONG_TO_THAT)('%s rộng và cao bằng --vung-cham', (sel) => {
    expect(coBoChon(sel, (t) => /width:\s*var\(--vung-cham\)/.test(t) && /height:\s*var\(--vung-cham\)/.test(t))).toBe(true);
  });

  it.each(['.bl-soan-chan .nut', '.xep-hang-dong', '.logo-lien', '.the-nguoi-dung'])('%s cao tối thiểu --vung-cham', (sel) => {
    expect(coBoChon(sel, (t) => /min-height:\s*var\(--vung-cham\)/.test(t))).toBe(true);
  });

  it('dải cột gập của kanban đủ chỗ cho nút bên trong (viền 1px mỗi bên)', () => {
    expect(coBoChon('.kb-gap', (t) => /flex-basis:\s*calc\(var\(--vung-cham\) \+ 2px\)/.test(t))).toBe(true);
  });

  /** Dấu và chữ GIỮA DÒNG: chỉ nới vùng nhận chạm, hình vẽ đứng yên. */
  const NOI_VUNG = [
    '.dau-hoi',
    '.dau-doi',
    '.lien-phu',
    '.khoi-bl .nut-chu',
    '.cach-tinh > summary',
    '.bl-cx',
    'a.thanh-nhan',
    '.dau-trang > a[href]',
    ':is(td, dd) a[href]',
  ];
  it.each(NOI_VUNG)('%s: là khối chứa và có lớp ::after nới tới --vung-cham', (sel) => {
    expect(coBoChon(sel, (t) => /position:\s*relative/.test(t)), 'thiếu position: relative').toBe(true);
    expect(
      coBoChon(`${sel}::after`, (t) => /content:\s*''/.test(t) && /--noi:\s*calc\(\(100% - var\(--vung-cham\)\) \/ 2\)/.test(t) && /top:\s*min\(0px, var\(--noi\)\)/.test(t)),
      'thiếu lớp ::after nới vùng chạm',
    ).toBe(true);
  });

  it('trong ô bảng phần nới bị chặn ở lề ô — không làm khung cuộn của bảng mọc thanh cuộn lẻ', () => {
    const r = LUAT_CAM_UNG.find((l) => l.chon.some((s) => s.startsWith('td ') && s.endsWith('::after')));
    expect(r, 'thiếu luật chặn trong ô bảng').toBeDefined();
    expect(r!.than).toMatch(/--chan:\s*calc\(-1 \* var\(--k3\)\)/);
    for (const canh of ['top', 'bottom', 'left', 'right']) expect(r!.than).toMatch(new RegExp(`${canh}:\\s*max\\(var\\(--chan\\)`));
  });

  it('nút Trả lời / Thao tác của bình luận trên màn hình không rê chuột dùng --vung-cham, không số cứng 40px', () => {
    const k = khoiMedia('@media (hover: none) {\n  .bl-thao-tac');
    expect(k.than).toMatch(/\.bl-thao-tac \.nut-bieu-tuong \{ width: var\(--vung-cham\); height: var\(--vung-cham\); \}/);
    expect(k.than).toMatch(/padding-right: calc\(2 \* var\(--vung-cham\) \+ 2px\)/);
  });

  /*
   * CHỐT CHO NÚT MỚI: mọi luật NGOÀI khối cảm ứng thu một nút biểu tượng xuống
   * dưới 44px (đơn vị px hoặc rem) thì CHÍNH bộ chọn ấy phải được phóng lại ở
   * khối cảm ứng hoặc khối `hover: none`. Thêm một nút nhỏ mà quên vế này là đỏ.
   */
  it('nút biểu tượng thu nhỏ ở đâu thì được phóng lại trên màn hình cảm ứng', () => {
    const KHONG_RE = khoiMedia('@media (hover: none) {\n  .bl-thao-tac').than;
    const phongLai = new Set([...LUAT_CAM_UNG, ...luat(KHONG_RE)].filter((l) => /var\(--vung-cham\)/.test(l.than)).flatMap((l) => l.chon));
    const ngoai = KHONG_CHU_THICH.replace(CAM_UNG.than, '').replace(KHONG_RE, '');
    const nho = luat(ngoai)
      .filter((l) => {
        const w = /(?:^|;|\s)width:\s*([\d.]+)(px|rem)/.exec(l.than);
        return w && (w[2] === 'rem' ? +w[1]! * 16 : +w[1]!) < 44;
      })
      .flatMap((l) => l.chon)
      .filter((s) => /nut-bieu-tuong|kb-nut-gap|bl-cx-bang button/.test(s));
    expect(nho.filter((s) => !phongLai.has(s))).toEqual([]);
  });
});
