/**
 * Sinh ba file `.docx` mẫu hồ sơ CSBH vào thư mục `templates/` (`0057`).
 *
 * VÌ SAO LÀ FILE THẬT NẰM TRONG REPO, không phải dựng lúc chạy demo:
 *
 *   - Quản trị **tải chúng về sửa được**. Soạn một mẫu từ trang giấy trắng đòi
 *     nhớ hai mươi khoá; mở một mẫu có sẵn ra đổi câu chữ thì không.
 *   - Chúng là **đầu vào của `make demo-mau`**, nên bản demo dùng đúng thứ mà
 *     người dùng thật sẽ dùng — không phải một bố cục chỉ tồn tại trong mã seed.
 *
 * Chạy lại khi đổi bố cục mẫu:
 *
 *   docker compose -f deploy/compose.yml -f deploy/compose.test.yml run --rm -T \
 *     test pnpm tsx scripts/tao-mau-ho-so.ts
 *
 * Tên file KHÔNG DẤU: tên có dấu truyền qua bash sinh lỗi `FileNotFoundError`
 * dù `ls` vẫn thấy file — khác biệt chuẩn hoá NFC/NFD giữa hai lớp.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { makeDocx, para } from '../services/document/src/contracts/docx.js';

/** Khối đầu trang — giống nhau ở cả ba mẫu. */
const dauTrang = [
  para('{{cong_ty.ten}}'),
  para('{{cong_ty.dia_chi}} — MST {{cong_ty.ma_so_thue}}'),
  para(''),
  para('CHÍNH SÁCH BÁN HÀNG'),
];

/**
 * Khối chữ ký — đứng CUỐI mọi mẫu.
 *
 * `{{ho_so.chu_ky_so_TBP}}` in ra hai dòng: "TBP đã ký số" và ngày ký. Hồ sơ
 * chưa ký thì chỗ này để trống, nên đặt nó ở cuối là an toàn — không để lại một
 * khoảng trắng giữa văn bản.
 */
const chuKy = [
  para(''),
  para('{{ho_so.chu_ky_so_TBP}}'),
];

/** Mẫu ĐẦY ĐỦ — bố cục dùng cho cả khổ dọc và khổ ngang. */
const dayDu = [
  ...dauTrang,
  para('Số {{ho_so.ma_ho_so}} · phiên bản {{ho_so.phien_ban}} · {{ho_so.trang_thai}}'),
  para(''),
  para('BÊN BÁN: {{cong_ty.ten}}'),
  para('BÊN MUA: {{ho_so.ten_khach_hang}} — mã {{ho_so.ma_khach_hang}}'),
  para('Mã số thuế: {{ho_so.ma_so_thue}}'),
  para('Địa chỉ đăng ký: {{ho_so.dia_chi_dang_ky}}'),
  para('Nơi nhận hàng: {{ho_so.noi_nhan_hang}}'),
  para('Người đại diện: {{ho_so.nguoi_dai_dien}} — {{ho_so.chuc_danh_dai_dien}}'),
  para('Công nợ tại thời điểm lập: {{ho_so.cong_no}} đồng'),
  para(''),
  para('Người đề nghị: {{ho_so.nguoi_de_nghi}}'),
  para('Thời gian áp dụng: {{ho_so.ngay_ap_dung}}'),
  para(''),
  para('DANH SÁCH SẢN PHẨM VÀ CHÍNH SÁCH GIÁ'),
  para('{{bang_san_pham}}'),
  para(''),
  para('QUÁ TRÌNH DUYỆT'),
  para('Trưởng bộ phận: {{ho_so.truong_bo_phan}} — ký ngày {{ho_so.ngay_tbp_ky}}'),
  para('Kế toán tiếp nhận lần 1: {{ho_so.ke_toan}} — ngày {{ho_so.ngay_kt_nhan_l1}}'),
  para('Kế toán tiếp nhận lần 2: {{ho_so.ke_toan}} — ngày {{ho_so.ngay_kt_nhan_l2}}'),
  para('Sale Admin: {{ho_so.sale_admin}}'),
  para('File đính kèm: {{ho_so.tep_dinh_kem}}'),
  ...chuKy,
];

/**
 * Mẫu RÚT GỌN — đúng những mục BẮT BUỘC, không hơn.
 *
 * Để trong bộ mẫu vì nó trả lời một câu hỏi thật của người soạn mẫu: "ít nhất
 * phải có những gì thì mới ban hành được". Mở file này ra là thấy đáp án.
 */
const rutGon = [
  ...dauTrang,
  para('Số {{ho_so.ma_ho_so}} · {{ho_so.trang_thai}}'),
  para(''),
  para('Khách hàng: {{ho_so.ten_khach_hang}} ({{ho_so.ma_khach_hang}})'),
  para('Công nợ: {{ho_so.cong_no}} đồng'),
  para('Người đề nghị: {{ho_so.nguoi_de_nghi}} — áp dụng từ {{ho_so.ngay_ap_dung}}'),
  para(''),
  para('{{bang_san_pham}}'),
  para(''),
  para('TBP {{ho_so.truong_bo_phan}} ký ngày {{ho_so.ngay_tbp_ky}}'),
  para('Kế toán {{ho_so.ke_toan}} tiếp nhận ngày {{ho_so.ngay_kt_nhan_l2}}'),
  para('File đính kèm: {{ho_so.tep_dinh_kem}}'),
  ...chuKy,
];

export const BO_MAU: { tep: string; ten: string; kho: 'a4p' | 'a4l'; than: string[] }[] = [
  {
    tep: 'mau-ho-so-a4-doc.docx',
    ten: 'Mẫu hồ sơ CSBH — A4 dọc',
    kho: 'a4p',
    than: dayDu,
  },
  {
    tep: 'mau-ho-so-a4-ngang.docx',
    ten: 'Mẫu hồ sơ CSBH — A4 ngang',
    kho: 'a4l',
    than: dayDu,
  },
  {
    tep: 'mau-ho-so-a4-doc-rut-gon.docx',
    ten: 'Mẫu hồ sơ CSBH rút gọn — A4 dọc',
    kho: 'a4p',
    than: rutGon,
  },
];

export const THU_MUC = 'templates';

if (process.argv[1]?.endsWith('tao-mau-ho-so.ts')) {
  mkdirSync(THU_MUC, { recursive: true });
  for (const m of BO_MAU) {
    writeFileSync(`${THU_MUC}/${m.tep}`, makeDocx(m.than.join(''), m.kho));
    console.log(`tao-mau-ho-so: ${THU_MUC}/${m.tep} — ${m.ten}`);
  }
}
