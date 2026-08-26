/**
 * Dấu sao trên biểu mẫu phải khớp ĐÚNG những gì máy chủ bắt buộc.
 *
 * Hai kiểu sai, hỏng theo hai cách khác nhau:
 *   - Máy chủ bắt buộc mà giao diện không đánh dấu → người dùng điền xong, bấm
 *     Lưu, nhận về `VALIDATION_FAILED` cho một ô không có gì báo là phải điền.
 *   - Giao diện đánh dấu mà máy chủ không bắt buộc → nút Lưu chết mà không ai
 *     hiểu vì sao, và cách duy nhất đi tiếp là điền bừa.
 *
 * Test đọc thẳng `*.controller.ts` thay vì gọi API: DTO là mã nguồn tĩnh, không
 * có endpoint nào bày nó ra, và dựng cả một service chỉ để hỏi "trường nào bắt
 * buộc" thì chậm hơn hai bậc mà không chắc hơn tí nào.
 *
 * Cùng cách làm với `mau-hop-dong.test.ts` (so `DINH_DANG` với `FORMATS` bên
 * document) và `quyen.test.ts` (quét mã giao diện tìm so sánh vai trò).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BAT_BUOC, CHAT_HON, batBuoc, thieuTruong, type TenBieuMau } from '@csbh/web/bat-buoc';

/**
 * Biểu mẫu nào đọc DTO nào. `neo` là dòng decorator, duy nhất trong từng tệp.
 *
 * `boQua` là trường bắt buộc của DTO nhưng KHÔNG phải ô trên biểu mẫu — nó đi
 * qua đường dẫn. Khai ra từng cái một, không lọc bằng luật chung, để thêm một
 * trường mới vào DTO thì test đỏ chứ không lặng lẽ rơi vào diện miễn trừ.
 */
const NGUON: Record<TenBieuMau, { tep: string; neo: string; boQua?: string[] }> = {
  'nguoi-dung': { tep: 'services/identity/src/admin/users.controller.ts', neo: '@Post()' },
  'khach-hang': { tep: 'services/customer/src/customers/customers.controller.ts', neo: '@Post()' },
  'san-pham': { tep: 'services/catalog/src/catalog.controller.ts', neo: "@Post('products')" },
  gia: { tep: 'services/catalog/src/catalog.controller.ts', neo: "@Post('products/:id/prices')" },
  'nhom-san-pham': { tep: 'services/catalog/src/catalog.controller.ts', neo: "@Post('product-groups')" },
  'chiet-khau': { tep: 'services/catalog/src/catalog.controller.ts', neo: "@Post('discount-rules')" },
  'ho-so': { tep: 'services/policy/src/policies/policies.controller.ts', neo: '@Post()' },
  'dong-san-pham': { tep: 'services/policy/src/policies/policies.controller.ts', neo: 'const lineShape =' },
  'ngay-ap-dung': { tep: 'services/policy/src/policies/policies.controller.ts', neo: "@Patch(':id')" },
};

/**
 * Trường bắt buộc trong khối `validate(…, { … })` đầu tiên sau `neo`.
 *
 * Bắt buộc = KHÔNG bọc `opt()`. Đó là toàn bộ quy ước của `validate.ts`: `opt()`
 * biến `undefined`/`null`/chuỗi rỗng thành `undefined`, mọi bộ kiểm khác ném lỗi.
 */
function batBuocODtos(tep: string, neo: string): string[] {
  const src = readFileSync(new URL(`../../${tep}`, import.meta.url), 'utf8');
  const tu = src.indexOf(neo);
  expect(tu, `không tìm thấy neo "${neo}" trong ${tep}`).toBeGreaterThanOrEqual(0);

  const khoi = neo.startsWith('const')
    ? trongNgoac(src, src.indexOf('{', tu)) // `lineShape` là const trần, không qua `validate(`
    : shapeCuaValidate(src, src.indexOf('validate(', tu));

  // Bỏ chú thích TRƯỚC khi cắt: một dòng `// …` đứng ngay trên trường làm đoạn
  // bắt đầu bằng chú thích chứ không bằng tên trường, và trường đó biến mất
  // khỏi kết quả — im lặng, vì khi đó test chỉ báo "thiếu một trường".
  return capNgoaiCung(khoi.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''))
    .map((doan) => /^\s*(\w+)\s*:\s*([\s\S]*)$/.exec(doan))
    .filter((m): m is RegExpExecArray => m !== null && !m[2]!.trimStart().startsWith('opt('))
    .map((m) => m[1]!);
}

/** Nội dung giữa `{` ở `mo` và dấu `}` khớp với nó. */
function trongNgoac(src: string, mo: number): string {
  expect(mo, 'không tìm thấy dấu ngoặc mở của khối kiểm dữ liệu').toBeGreaterThan(0);
  let sau = 0;
  for (let i = mo; i < src.length; i++) {
    if (src[i] === '{') sau++;
    else if (src[i] === '}' && --sau === 0) return src.slice(mo + 1, i);
  }
  throw new Error('khối kiểm dữ liệu không đóng ngoặc');
}

/**
 * Lược đồ của `validate(…)` là đối số CUỐI CÙNG, không phải đối số đầu.
 *
 * `catalog.controller.ts` gọi `validate({ kind, ...body }, { … })` — lấy khối
 * `{` đầu tiên sau `validate(` là đọc trúng đối tượng dữ liệu vào và kết luận
 * biểu mẫu không có trường bắt buộc nào.
 */
function shapeCuaValidate(src: string, goi: number): string {
  expect(goi, 'không tìm thấy lời gọi validate(').toBeGreaterThan(0);
  const mo = src.indexOf('(', goi);
  let sau = 0;
  let cuoi = -1;
  for (let i = mo; i < src.length; i++) {
    const c = src[i]!;
    if (c === '(' || c === '{' || c === '[') {
      if (c === '{' && sau === 1) cuoi = i; // khối ở cấp đối số
      sau++;
    } else if (c === ')' || c === '}' || c === ']') {
      if (--sau === 0) break;
    }
  }
  return trongNgoac(src, cuoi);
}

/** Cắt một khối theo dấu phẩy ở CẤP NGOÀI CÙNG — `opt(oneOf(a, b))` là một đoạn. */
function capNgoaiCung(khoi: string): string[] {
  const doan: string[] = [];
  let sau = 0;
  let dau = 0;
  for (let i = 0; i < khoi.length; i++) {
    const c = khoi[i]!;
    if ('({['.includes(c)) sau++;
    else if (')}]'.includes(c)) sau--;
    else if (c === ',' && sau === 0) {
      doan.push(khoi.slice(dau, i));
      dau = i + 1;
    }
  }
  doan.push(khoi.slice(dau));
  return doan.filter((d) => d.trim() !== '');
}

describe('bảng trường bắt buộc khớp DTO của máy chủ', () => {
  for (const ten of Object.keys(NGUON) as TenBieuMau[]) {
    it(`${ten} — không thừa, không thiếu trường nào`, () => {
      const { tep, neo, boQua } = NGUON[ten];
      const cuaMayChu = batBuocODtos(tep, neo).filter((t) => !(boQua ?? []).includes(t));
      const cuaGiaoDien = BAT_BUOC[ten].filter((t) => !(CHAT_HON[ten] ?? []).includes(t));
      expect([...cuaGiaoDien].sort()).toEqual(cuaMayChu.sort());
    });
  }

  it('mọi ô chặt hơn máy chủ đều thật sự nằm trong bảng bắt buộc', () => {
    // Khai một ngoại lệ cho ô không có trên biểu mẫu là tự cấp cho mình quyền
    // bỏ qua một trường máy chủ đang bắt buộc.
    for (const [ten, ds] of Object.entries(CHAT_HON)) {
      for (const t of ds ?? []) {
        expect(BAT_BUOC[ten as TenBieuMau], `${ten}: ${t}`).toContain(t);
      }
    }
  });

  it('mọi biểu mẫu trong bảng đều có nguồn để đối chiếu', () => {
    // Thêm một biểu mẫu vào `BAT_BUOC` mà quên khai nguồn thì nó không bao giờ
    // được kiểm, và bảng lặng lẽ lệch khỏi máy chủ.
    expect(Object.keys(NGUON).sort()).toEqual(Object.keys(BAT_BUOC).sort());
  });
});

describe('thiếu trường bắt buộc thì không gửi được', () => {
  const dayDu = {
    code: 'KH001',
    name: 'Nha thuoc A',
    customerType: 1,
    registeredAddress: '12 Ly Thuong Kiet',
    ownerName: 'Nguyen Van A',
  };

  it('điền đủ thì không thiếu gì', () => {
    expect(thieuTruong('khach-hang', dayDu)).toEqual([]);
  });

  it('bỏ trống một ô thì đúng ô đó bị nêu tên', () => {
    expect(thieuTruong('khach-hang', { ...dayDu, ownerName: '' })).toEqual(['ownerName']);
  });

  it('chuỗi chỉ có khoảng trắng KHÔNG tính là đã điền', () => {
    // Máy chủ `str()` cắt khoảng trắng rồi mới đo độ dài, nên "   " ở đây gửi đi
    // là chắc chắn nhận 400 — chặn ngay tại chỗ thay vì đi một vòng mạng.
    expect(thieuTruong('khach-hang', { ...dayDu, name: '   ' })).toEqual(['name']);
  });

  it('thiếu hẳn khoá cũng tính là trống', () => {
    expect(thieuTruong('khach-hang', {})).toEqual([...BAT_BUOC['khach-hang']]);
  });

  it('số 0 và giá trị false KHÔNG bị coi là trống', () => {
    // `customerType` là số; đo bằng phép kiểm falsy thì loại khách hàng 0 hoặc
    // một ô công nợ bằng 0 sẽ bị báo thiếu dù người dùng đã điền.
    expect(thieuTruong('khach-hang', { ...dayDu, customerType: 0 })).toEqual([]);
  });

  it('ô ngày bị xoá trắng bị bắt', () => {
    // Đây là lỗ đã có thật ở năm biểu mẫu: ô ngày có sẵn giá trị mặc định nên
    // nhìn như đã điền, mà xoá đi thì `<input type="date">` trả chuỗi rỗng.
    /*
     * `0123` bỏ `effectiveFrom` khỏi bảng: màn hình không còn ô chọn ngày, giá
     * luôn áp dụng từ hôm nay và máy chủ tự điền.
     */
    expect(thieuTruong('gia', { amount: '' })).toEqual(['amount']);
  });
});

describe('đánh dấu sao', () => {
  it('trường có trong bảng thì gắn sao', () => {
    expect(batBuoc('ho-so', 'customerId')).toBe(true);
  });

  it('trường không có trong bảng thì không gắn sao', () => {
    expect(batBuoc('ho-so', 'note')).toBe(false);
  });
});
