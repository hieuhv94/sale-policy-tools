/**
 * `0071` — nút hành động của một màn hình nằm ở GÓC TRÊN BÊN PHẢI.
 *
 * Quy ước chỉ có giá trị khi nó đúng ở MỌI màn hình: người dùng học nó một lần
 * rồi thôi không đọc nữa, và một màn hình lệch khỏi quy ước là một màn hình họ
 * đứng nhìn mà không thấy nút mình biết chắc là có.
 *
 * Ca này quét MÃ NGUỒN chứ không dựng từng màn hình: dựng đủ mười bảy trang đòi
 * mười bảy bộ dữ liệu giả, và cái sai cần bắt — một nút hành động nằm giữa
 * trang — nhìn thấy được ngay ở cấu trúc JSX.
 *
 * HAI CHỖ ĐÚNG, không phải một:
 *
 *   - `.dau-trang` — trang có tiêu đề riêng.
 *   - `.hang-thao-tac` — nội dung nằm trong một THẺ của dải thẻ, nơi tiêu đề
 *     trang đã bị dải thẻ ngăn cách nên nút phải đứng đầu chính thẻ ấy.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const doc = (p: string) => readFileSync(`apps/web/src/${p}`, 'utf8');

/**
 * Những khối `nhom-nut` KHÔNG phải hàng thao tác của màn hình, và vì sao.
 *
 * Không phải ngoại lệ cho qua chuyện — mỗi dòng là một loại nút khác hẳn về
 * bản chất, và gom chúng lên đầu trang sẽ làm hỏng đúng thứ chúng đang làm tốt.
 */
const NGOAI_LE = [
  // Chân hộp thoại: Lưu/Huỷ của một hộp thoại thuộc về hộp thoại ấy.
  'components/Chung.tsx',
  'components/SuaHoSo.tsx',
  'components/SuaKhachHang.tsx',
  'components/XemTep.tsx',
  'components/XemBanMem.tsx',
  'components/HoSoPhapLy.tsx',
  /*
   * Biểu mẫu MỘT Ô, nút đứng ngay cạnh ô: cấu hình SLA là một con số và một nút
   * Lưu. Đẩy nút lên góc trên là tách nó khỏi đúng cái ô nó lưu, và người dùng
   * phải nhìn hai chỗ cho một việc.
   */
  'components/quan-tri/HeThong.tsx',
  // Trang xác thực: một thẻ giữa màn hình, không có tiêu đề trang để mà căn.
  'pages/DangNhap.tsx',
  'pages/DoiMatKhau.tsx',
  'pages/DatMatKhau.tsx',
  'pages/QuenMatKhau.tsx',
];

describe('`0071` nút hành động ở góc trên bên phải', () => {
  it('mọi trang có tiêu đề đều dùng `.dau-trang` hoặc `.hang-thao-tac`', () => {
    /*
     * Danh sách này là hợp đồng: thêm một màn hình mới mà quên hàng thao tác thì
     * ca kiểm thử không bắt được — nó chỉ bắt được màn hình ĐÃ CÓ bị sửa lệch
     * đi. Đó là giới hạn thật của phép quét mã nguồn, nói ra ở đây thay vì để
     * người đọc sau tưởng nó canh nhiều hơn thực tế.
     */
    const CO_HANG_THAO_TAC = [
      'pages/KhachHang.tsx',
      'pages/DanhSachHoSo.tsx',
      'pages/ChiTietHoSo.tsx',
      'pages/MauHopDong.tsx',
      'pages/ThemMau.tsx',
      'pages/BaoCao.tsx',
      'pages/ThongTin.tsx',
      'components/danh-muc/SanPham.tsx',
      'components/danh-muc/Nhom.tsx',
      'components/danh-muc/ChietKhau.tsx',
      'pages/NguoiDung.tsx',
    ];
    for (const f of CO_HANG_THAO_TAC) {
      // Đọc THẲNG, không bọc try: tệp đổi tên mà ca này lặng lẽ bỏ qua thì nó
      // xanh trong khi chẳng canh gì nữa.
      expect(
        /dau-trang|hang-thao-tac/.test(doc(f)),
        `${f} không có hàng thao tác nào ở đầu`,
      ).toBe(true);
    }
  });

  it('KHÔNG màn hình nào còn nút hành động nằm giữa trang', () => {
    /*
     * `nhom-nut` trần — không kèm `nhom-nut-dau` hay `nhom-nut-gon` — là dấu
     * hiệu của một hàng nút đứng giữa dòng chảy nội dung. Nó hợp lệ trong hộp
     * thoại và trên trang xác thực; ngoài hai chỗ ấy thì nó là thứ `0071` dọn.
     */
    const soT = (ma: string) =>
      [...ma.matchAll(/className="nhom-nut"/g)].length;

    const con: string[] = [];
    for (const f of [
      'pages/NguoiDung.tsx',
      'pages/BaoCao.tsx',
      'pages/ThongTin.tsx',
      'components/danh-muc/SanPham.tsx',
      'components/danh-muc/Nhom.tsx',
      'components/danh-muc/ChietKhau.tsx',
    ]) {
      const ma = doc(f);
      // Trừ những khối nằm trong hộp thoại — nhận ra bằng `HopThoai` bao quanh.
      const ngoaiHopThoai = ma.split('HopThoai')[0] ?? '';
      if (soT(ngoaiHopThoai) > 0) con.push(f);
    }
    expect(con, `còn nút giữa trang ở: ${con.join(', ')}`).toEqual([]);
  });

  it('danh sách ngoại lệ nói rõ VÌ SAO, không phải một danh sách cho qua', () => {
    // Ca này canh chính ca kiểm thử: một ngoại lệ thêm vào mà không có lý do
    // viết ra là cách êm ái nhất để quy ước chết dần.
    const ma = readFileSync('tests/web/nut-hanh-dong.test.tsx', 'utf8');
    const khoi = ma.slice(ma.indexOf('const NGOAI_LE'), ma.indexOf('];', ma.indexOf('const NGOAI_LE')));
    expect(NGOAI_LE.length).toBeGreaterThan(0);
    expect(khoi).toMatch(/Chân hộp thoại/);
    expect(khoi).toMatch(/Trang xác thực/);
  });
});
