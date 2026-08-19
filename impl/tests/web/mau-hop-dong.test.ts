/**
 * Mẫu hợp đồng — bảng định dạng và phép nhóm nguồn dữ liệu.
 *
 * Khẳng định quan trọng nhất ở đây là một phép ĐỐI CHIẾU HAI PHÍA: danh sách
 * định dạng phía giao diện phải khớp `FORMATS` của máy chủ. Máy chủ không có
 * endpoint nào trả danh sách này ra nên giao diện phải giữ một bản sao, và bản
 * sao là chỗ lệch. Thêm một định dạng ở máy chủ mà quên ở đây thì Sale Admin
 * không chọn được nó — không lỗi nào báo, chỉ là một mục vắng mặt trong ô chọn.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CAU_HINH_MAU,
  DINH_DANG,
  KHO_GIAY,
  NHAN_DINH_DANG,
  NHAN_KHO,
  TIEN_TO_DONG,
  banHanhDuoc,
  nhomNguon,
} from '@csbh/web/mau-hop-dong';

describe('bảng định dạng khớp máy chủ', () => {
  it('DINH_DANG trùng đúng FORMATS trong sources.ts', () => {
    const ma = readFileSync('services/document/src/contracts/sources.ts', 'utf8');
    const m = /export const FORMATS: Format\[\] = \[([^\]]*)\]/.exec(ma);
    expect(m, 'không tìm thấy FORMATS trong sources.ts').not.toBeNull();
    const cua_may_chu = [...m![1]!.matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]);
    expect([...DINH_DANG].sort()).toEqual(cua_may_chu.sort());
  });

  it('TIEN_TO_DONG trùng LINE_PREFIX của máy chủ', () => {
    const ma = readFileSync('services/document/src/contracts/sources.ts', 'utf8');
    const m = /export const LINE_PREFIX = '([^']+)'/.exec(ma);
    expect(m).not.toBeNull();
    expect(TIEN_TO_DONG).toBe(m![1]);
  });

  it('mọi định dạng đều có nhãn tiếng Việt', () => {
    expect(Object.keys(NHAN_DINH_DANG).sort()).toEqual([...DINH_DANG].sort());
  });
});

describe('nhóm nguồn dữ liệu cho ô chọn', () => {
  const nguon = [
    'customer.code',
    'customer.name',
    'policy.code',
    'company.name',
    'policy.lines[].product_name',
    'policy.lines[].net_price',
  ];

  it('gom theo tiền tố, không bỏ sót nguồn nào', () => {
    const nhom = nhomNguon(nguon);
    expect(nhom.flatMap((n) => n.nguon).sort()).toEqual([...nguon].sort());
  });

  it('trường theo dòng tách thành nhóm riêng, không lẫn vào nhóm hồ sơ', () => {
    // Hai thứ khác hẳn nhau: trường đơn cho ra một giá trị, trường theo dòng làm
    // NHÂN BẢN cả dòng bảng trong file Word. Trộn chung là mời người dùng chọn
    // nhầm và nhận về một hợp đồng thiếu dòng.
    const nhom = nhomNguon(nguon);
    const dong = nhom.find((n) => n.nguon.some((s) => s.startsWith(TIEN_TO_DONG)));
    expect(dong!.nguon).toHaveLength(2);
    expect(dong!.nguon.every((s) => s.startsWith(TIEN_TO_DONG))).toBe(true);

    const hoSo = nhom.find((n) => n.nguon.includes('policy.code'));
    expect(hoSo!.nguon.some((s) => s.startsWith(TIEN_TO_DONG))).toBe(false);
  });

  it('nhóm nào cũng có nhãn đọc được, không phải mã trần', () => {
    for (const n of nhomNguon(nguon)) {
      expect(n.nhan).not.toMatch(/^[a-z_]+$/);
    }
  });
});

describe('điều kiện ban hành', () => {
  it('còn một ô chưa ánh xạ thì chưa ban hành được', () => {
    expect(banHanhDuoc(['a', 'b'], new Set(['a']))).toBe(false);
  });

  it('ánh xạ hết thì ban hành được', () => {
    expect(banHanhDuoc(['a', 'b'], new Set(['a', 'b']))).toBe(true);
  });

  it('mẫu không có ô trống nào cũng ban hành được', () => {
    expect(banHanhDuoc([], new Set())).toBe(true);
  });

  it('đọc TẬP ĐANG CHỌN trên bảng, không đọc ảnh chụp lúc mở', () => {
    // Người dùng vừa điền xong cả bảng thì `unmapped` của lần tải đầu vẫn còn
    // nguyên. Tính theo nó là nút Ban hành mãi xám dù bảng đã đầy.
    const oTrong = ['a', 'b', 'c'];
    expect(banHanhDuoc(oTrong, new Set(oTrong))).toBe(true);
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

  it('CHỈ mẫu hồ sơ đi theo khổ giấy', () => {
    /*
     * File .docx tự mang khổ giấy của nó, nên mẫu hồ sơ cần một bản cho mỗi khổ.
     * Hợp đồng thì không: khổ nào là việc của chính file ấy, phần mềm không hỏi.
     */
    expect(CAU_HINH_MAU.HO_SO.theoKhoGiay).toBe(true);
    expect(CAU_HINH_MAU.HOP_DONG.theoKhoGiay).toBe(false);
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
