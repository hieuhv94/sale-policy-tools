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
/*
 * Tên Công ty ĐỌC TỪ HẰNG, không gõ lại (`0151`).
 *
 * Trước lượt này tệp này gõ tên ra bốn lần, và tên ấy còn nằm ở năm chỗ khác —
 * nên lượt khách hàng đổi pháp nhân là một lượt grep toàn repo. `dinh-dang.ts`
 * không mang phụ thuộc chạy nào (nó chỉ import một KIỂU), nên một script dựng
 * tệp import được nó mà không kéo theo Nest.
 */
import {
  COMPANY,
  COMPANY_ADDRESS_LINE,
} from '../services/document/src/contracts/dinh-dang.js';

/**
 * Khối đầu trang — giống nhau ở cả ba mẫu.
 *
 * Tên và địa chỉ Công ty gõ THẲNG, không còn ô trống (`0067`): ba giá trị ấy cố
 * định ở mọi hồ sơ, nên một ô trống cho chúng chỉ thêm một bước có thể quên —
 * và quên thì bản in ra mang chuỗi `{{cong_ty.ten}}` ngay dòng đầu.
 */
const dauTrang = [
  para(COMPANY.name),
  para(COMPANY_ADDRESS_LINE),
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
  para(`BÊN BÁN: ${COMPANY.name}`),
  /*
   * KHỐI BÊN MUA — một dòng nhận diện, rồi MỘT dòng gộp ba mục (`0135`, chốt
   * 27/08): người đại diện · địa chỉ · mã số thuế, ngăn bằng dấu gạch.
   *
   * Đây là cách khối bên mua được viết trên hợp đồng giấy, và nó đọc nhanh hơn
   * ba dòng có nhãn: mắt bắt cả ba mục trong một lượt thay vì dò xuống ba dòng.
   *
   * `dia_chi_dang_ky` là khoá mang **địa chỉ kinh doanh** — đó là địa chỉ đăng
   * ký của khách hàng. Khoá `noi_nhan_hang` là chỗ giao hàng, một mục khác hẳn,
   * nên nó ở lại dòng riêng bên dưới.
   *
   * Ba mục này đều CÓ NHÃN Ở HỘP THOẠI KHÁCH HÀNG, nên bỏ nhãn ở đây không làm
   * mất nghĩa — nhưng nó khiến một mục rỗng đọc thành hai dấu gạch dính nhau.
   * Cả ba đều thuộc nhóm chặn gửi duyệt (`0104`, `0128`) trừ địa chỉ, nên chuyện
   * ấy chỉ xảy ra với địa chỉ, và địa chỉ thì bắt buộc ngay ở hộp thoại lập
   * khách hàng.
   */
  para('BÊN MUA: {{ho_so.ten_khach_hang}} — mã {{ho_so.ma_khach_hang}}'),
  para('{{ho_so.nguoi_dai_dien}} - {{ho_so.dia_chi_dang_ky}} - {{ho_so.ma_so_thue}}'),
  para('Chức danh người đại diện: {{ho_so.chuc_danh_dai_dien}}'),
  // `0134` — số điện thoại chặn lượt gửi duyệt, nên nó phải in ra được.
  para('Điện thoại: {{ho_so.dien_thoai}}'),
  para('Nơi nhận hàng: {{ho_so.noi_nhan_hang}}'),
  // `0138` — công nợ là một ĐIỀU KHOẢN, không phải số tiền: bỏ chữ *đồng*.
  para('Công nợ: {{ho_so.cong_no}}'),
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
  para('Công nợ: {{ho_so.cong_no}}'),
  para('Người đề nghị: {{ho_so.nguoi_de_nghi}} — áp dụng từ {{ho_so.ngay_ap_dung}}'),
  para(''),
  para('{{bang_san_pham}}'),
  para(''),
  para('TBP {{ho_so.truong_bo_phan}} ký ngày {{ho_so.ngay_tbp_ky}}'),
  para('Kế toán {{ho_so.ke_toan}} tiếp nhận ngày {{ho_so.ngay_kt_nhan_l2}}'),
  para('File đính kèm: {{ho_so.tep_dinh_kem}}'),
  ...chuKy,
];

/**
 * Mẫu HỢP ĐỒNG — cùng cơ chế bảng với mẫu hồ sơ từ `0067`.
 *
 * `0058` cho nó một bảng VẼ TAY bốn cột, vì hợp đồng chỉ nêu giá thu về và tỷ
 * lệ chiết khấu — không cần luật số cột CPBH đổi theo hồ sơ của muc 7.1.
 *
 * `0067` đảo lại: cả hai loại mẫu đều đặt `{{bang_san_pham}}`, vì bảng do hệ
 * thống dựng cho phép **chọn cột theo từng mẫu**. Một hợp đồng gọn bốn cột giờ
 * là một tập cột đã khai, không phải một bố cục nằm cứng trong file — và người
 * soạn đổi được nó mà không phải vẽ lại bảng.
 */
const hopDong = [
  para(COMPANY.name),
  para(COMPANY_ADDRESS_LINE),
  para(''),
  para('HỢP ĐỒNG NGUYÊN TẮC BÁN HÀNG'),
  para('Căn cứ hồ sơ CSBH số {{ho_so.ma_ho_so}}, áp dụng từ {{ho_so.ngay_ap_dung}}.'),
  para(''),
  para(`BÊN BÁN (Bên A): ${COMPANY.name}`),
  para(''),
  para('BÊN MUA (Bên B): {{ho_so.ten_khach_hang}} — mã {{ho_so.ma_khach_hang}}'),
  // Cùng dòng gộp với hai mẫu hồ sơ (`0135`) — xem chú thích ở `dayDu`.
  para('{{ho_so.nguoi_dai_dien}} - {{ho_so.dia_chi_dang_ky}} - {{ho_so.ma_so_thue}}'),
  para('Chức danh người đại diện: {{ho_so.chuc_danh_dai_dien}}'),
  para('Điện thoại: {{ho_so.dien_thoai}}'),
  para('Nơi nhận hàng: {{ho_so.noi_nhan_hang}}'),
  para('Công nợ: {{ho_so.cong_no}}'),
  para(''),
  para('Điều 1. Danh mục sản phẩm và giá áp dụng'),
  /*
   * MỘT ô trống, hệ thống dựng cả bảng (`0067`).
   *
   * Tới `0066` chỗ này là một bảng VẼ TAY bốn cột, với một dòng thân mang khoá
   * `{{san_pham.*}}` được nhân bản cho từng sản phẩm. Cả nhóm khoá ấy lẫn cơ
   * chế nhân bản đã gỡ: bảng do hệ thống dựng cho phép CHỌN CỘT theo từng mẫu,
   * mà một bảng vẽ tay thì tập cột nằm cứng trong file.
   */
  para('{{bang_san_pham}}'),
  para(''),
  para('Điều 2. Giá tại Điều 1 là giá đã bao gồm các khoản hỗ trợ bán hàng theo hồ sơ CSBH nêu trên.'),
  para('Điều 3. Hợp đồng có hiệu lực kể từ ngày ký và thay thế các thoả thuận trước đó về giá.'),
  para(''),
  para('Ngày in: {{ngay_in}}'),
  para(''),
  para('ĐẠI DIỆN BÊN BÁN                                        ĐẠI DIỆN BÊN MUA'),
  para('(ký, ghi rõ họ tên, đóng dấu)                           (ký, ghi rõ họ tên, đóng dấu)'),
];

export const BO_MAU: {
  tep: string;
  ten: string;
  kho: 'a4p' | 'a4l';
  than: string[];
  /**
   * Bỏ trống là CÓ nạp. Hai mẫu đứng ngoài: mẫu HỢP ĐỒNG (`0058` — bản demo đã
   * có mẫu hợp đồng riêng) và mẫu RÚT GỌN (`0137` — khách hàng chốt bỏ).
   */
  napDemo?: boolean;
}[] = [
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
  /*
   * Mẫu RÚT GỌN — sinh ra file, nhưng KHÔNG nạp vào CSDL nào (`0137`).
   *
   * Khách hàng chốt 27/08: bỏ nó khỏi cả `make demo-mau` lẫn `./csbh
   * nap-danh-muc`. File vẫn ở lại `templates/` và vẫn có một ca kiểm canh —
   * nó trả lời câu hỏi *"ít nhất phải có những gì thì mẫu mới ban hành được"*,
   * và đó là câu hỏi của người SOẠN mẫu, không phải của người dùng bản demo.
   * Quản trị tải nó lên bằng tay khi cần.
   *
   * CÁI MẤT, ghi ra để không ai ngạc nhiên: đây là mẫu DUY NHẤT khai `cotBang`,
   * nên từ lượt này bản demo không còn chỗ nào bày ra tính năng *chọn tập cột
   * theo từng mẫu* (`0067`) đang hoạt động. Muốn xem thì tự tải mẫu này lên.
   */
  {
    tep: 'mau-ho-so-a4-doc-rut-gon.docx',
    ten: 'Mẫu hồ sơ CSBH rút gọn — A4 dọc',
    kho: 'a4p',
    than: rutGon,
    napDemo: false,
  },
  /*
   * MẪU HỢP ĐỒNG — sinh ra file, nhưng KHÔNG nạp vào CSDL demo (`0058`).
   *
   * Ba mẫu trên thuộc Quản trị hệ thống và `make demo-mau` nạp sẵn, vì không có
   * chúng thì không xem được bản mềm nào. Mẫu hợp đồng thuộc **Sale Admin** —
   * người khác, màn hình khác — và bản demo đã có mẫu hợp đồng riêng của nó.
   * Nạp thêm cái này vào là đặt hai mẫu vào ô chọn của kế toán mà không ai yêu
   * cầu; nó ở đây để người dùng tự tải lên khi cần.
   */
  {
    tep: 'mau-hop-dong-a4-doc.docx',
    ten: 'Mẫu hợp đồng nguyên tắc — A4 dọc',
    kho: 'a4p',
    than: hopDong,
    napDemo: false,
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
