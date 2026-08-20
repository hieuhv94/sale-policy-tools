/**
 * Văn bản mẫu — cấu hình hai loại mẫu, phép nhóm nguồn, điều kiện lưu.
 *
 * Khẳng định đáng giá nhất ở đây là các phép ĐỐI CHIẾU HAI PHÍA giữa giao diện
 * và máy chủ: khổ giấy, và bảng định dạng theo trường. Chỗ nào giao diện phải
 * giữ một bản sao thì chỗ ấy sẽ lệch, và lệch trong im lặng.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CAU_HINH_MAU,
  KHO_GIAY,
  NHAN_KHO,
  O_BANG_SAN_PHAM,
  luuDuoc,
  nhomNguon,
} from '@csbh/web/mau-hop-dong';

describe('`0067` định dạng và nhóm khoá không còn là lựa chọn của người dùng', () => {
  it('giao diện KHÔNG giữ bản sao nào của bảng định dạng nữa', () => {
    /*
     * Tới `0066` giao diện giữ `DINH_DANG` — bản sao của `FORMATS` phía máy chủ
     * — để dựng ô chọn định dạng cho từng dòng ánh xạ. Bản sao ấy là chỗ dễ
     * lệch, và ca kiểm thử cũ tồn tại chỉ để canh nó.
     *
     * `0067` bỏ cả ô chọn lẫn bản sao: định dạng gắn cứng vào TRƯỜNG NGUỒN. Ca
     * này thay ca cũ và canh chiều ngược lại — không ai được dựng lại bản sao
     * ấy, vì nó sẽ lệch mà không có gì báo.
     */
    const ma = readFileSync('apps/web/src/lib/mau-hop-dong.ts', 'utf8');
    expect(ma).not.toMatch(/export const DINH_DANG\b/);
    expect(ma).not.toMatch(/export const TIEN_TO_DONG\b/);
  });

  it('máy chủ giữ định dạng theo TRƯỜNG, và mọi giá trị đều nằm trong kiểu Format', () => {
    // Đối chiếu hai phía vẫn còn, chỉ đổi chỗ: bảng `DINH_DANG_NGUON` phải chỉ
    // dùng những giá trị mà `applyFormat` biết xử lý — một giá trị lạ ở đó thì
    // trường ấy in ra nguyên chuỗi thô, không lỗi nào báo.
    const ma = readFileSync('services/document/src/contracts/sources.ts', 'utf8');
    const kieu = /export type Format = ([^;]+);/.exec(ma);
    expect(kieu, 'không tìm thấy kiểu Format').not.toBeNull();
    const chapNhan = [...kieu![1]!.matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]!);

    const bang = ma.slice(ma.indexOf('DINH_DANG_NGUON'));
    const dung = [...bang.slice(0, bang.indexOf('};')).matchAll(/: '([a-z_0-9]+)'/g)].map((x) => x[1]!);
    expect(dung.length, 'bảng định dạng không được rỗng').toBeGreaterThan(0);
    for (const d of dung) expect(chapNhan, `định dạng lạ: ${d}`).toContain(d);
  });
});

describe('nhóm nguồn dữ liệu cho ô chọn', () => {
  const nguon = ['ho_so.ma_khach_hang', 'ho_so.ten_khach_hang', 'ho_so.ma_ho_so', 'ngay_in'];

  it('gom theo tiền tố, không bỏ sót nguồn nào', () => {
    const nhom = nhomNguon(nguon);
    expect(nhom.flatMap((n) => n.nguon).sort()).toEqual([...nguon].sort());
  });

  it('nhóm nào cũng có nhãn đọc được, không phải mã trần', () => {
    for (const n of nhomNguon(nguon)) {
      expect(n.nhan).not.toMatch(/^[a-z_]+$/);
    }
  });
});

describe('`0067` điều kiện LƯU', () => {
  it('còn một ô chưa ánh xạ thì chưa lưu được', () => {
    expect(luuDuoc(['a', 'b'], new Set(['a']))).toBe(false);
  });

  it('ánh xạ hết thì lưu được', () => {
    expect(luuDuoc(['a', 'b'], new Set(['a', 'b']))).toBe(true);
  });

  it('mẫu không có ô trống nào cũng lưu được', () => {
    expect(luuDuoc([], new Set())).toBe(true);
  });

  it('ô BẢNG SẢN PHẨM không tính — nó không trỏ tới trường nào', () => {
    // Bắt người dùng chọn một trường cho ô bảng là bắt họ chọn một nguồn không
    // tồn tại; máy chủ cũng bỏ qua nó khi kiểm.
    expect(luuDuoc(['a', O_BANG_SAN_PHAM], new Set(['a']))).toBe(true);
  });
});

// =============================================================================
// `0055` — hai loại mẫu dùng CHUNG một màn hình
// =============================================================================

describe('`0055` cấu hình hai loại mẫu', () => {
  it('mỗi loại một đường API riêng, không loại nào dùng nhầm của loại kia', () => {
    expect(CAU_HINH_MAU.HOP_DONG.duong).toBe('/contract-templates');
    expect(CAU_HINH_MAU.HO_SO.duong).toBe('/policy-templates');
  });

  it('`0067` CHỈ mẫu hồ sơ có mục bắt buộc theo muc 11.1', () => {
    /*
     * Cả hai loại mẫu đều dùng `{{bang_san_pham}}` từ `0067`, nên cờ này không
     * còn nói về bảng. Cái còn khác nhau thật là phép kiểm lúc lưu: bản A4 phải
     * có đủ mục của muc 11.1, hợp đồng thì không có mục nào bắt buộc.
     */
    expect(CAU_HINH_MAU.HO_SO.bangDoHeThongDung).toBe(true);
    expect(CAU_HINH_MAU.HOP_DONG.bangDoHeThongDung).toBe(false);
  });

  it('hai khổ giấy khớp đúng enum của máy chủ', () => {
    // Bản sao thứ hai của một danh sách đóng — cùng loại rủi ro với `DINH_DANG`
    // ở đầu tệp, nên cùng cách canh: đọc thẳng mã nguồn máy chủ.
    const ma = readFileSync('db/migrations/0050_mau_ho_so_csbh.sql', 'utf8');
    for (const k of KHO_GIAY) {
      expect(ma, `enum doc.paper_size thiếu ${k}`).toContain(`'${k}'`);
    }
    expect(KHO_GIAY).toHaveLength(2);
  });

  it('mỗi khổ có nhãn tiếng Việt, không bày mã ra màn hình', () => {
    for (const k of KHO_GIAY) {
      expect(NHAN_KHO[k]).toMatch(/^A4 /);
    }
  });
});

// =============================================================================
// `0060` — cả hai loại mẫu về một chủ
// =============================================================================

describe('`0060` hai loại mẫu, một người quản lý', () => {
  it('hai đường API vẫn TÁCH RIÊNG dù chung chủ', () => {
    /*
     * Gộp chủ sở hữu KHÔNG có nghĩa là gộp đường API. Luật của hai loại khác
     * nhau thật: mẫu hồ sơ có 13 mục bắt buộc và `{{bang_san_pham}}` do hệ thống
     * dựng; mẫu hợp đồng không có mục bắt buộc nào và vẽ bảng bằng tay. Gộp lại
     * là một controller đầy nhánh `if (kind === ...)`.
     */
    expect(CAU_HINH_MAU.HO_SO.duong).toBe('/policy-templates');
    expect(CAU_HINH_MAU.HOP_DONG.duong).toBe('/contract-templates');
    expect(CAU_HINH_MAU.HO_SO.duong).not.toBe(CAU_HINH_MAU.HOP_DONG.duong);
  });

  it('mỗi loại có tiêu đề riêng để làm nhãn thẻ', () => {
    // Hai thẻ của một trang thì nhãn phải nói được loại nào — "Mẫu hợp đồng" và
    // "Giấy tờ mẫu" cạnh nhau thì cái thứ hai không nói lên điều gì.
    expect(CAU_HINH_MAU.HOP_DONG.tieuDe).toBe('Mẫu hợp đồng');
    expect(CAU_HINH_MAU.HO_SO.tieuDe).not.toBe(CAU_HINH_MAU.HOP_DONG.tieuDe);
  });
});
