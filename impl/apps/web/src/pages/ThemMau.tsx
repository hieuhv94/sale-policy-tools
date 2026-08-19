/**
 * Trang **thêm mẫu văn bản** — biểu mẫu bên trái, hướng dẫn bên phải (`0056`).
 *
 * Trước `0056` đây là một hộp thoại nhỏ chỉ có ba ô, còn cách đặt khoá trộn nằm
 * ở một tài liệu khác. Người soạn mẫu phải nhớ tên khoá, hoặc mở tài liệu ra ở
 * cửa sổ thứ hai — và khoá gõ sai thì không có gì báo cho tới lúc bảng ánh xạ
 * hiện ra thiếu mất một dòng.
 *
 * Giờ danh sách khoá nằm ngay cạnh ô chọn tệp, và **bấm một khoá là chép** —
 * không ai phải gõ lại `{{ho_so.ngay_kt_nhan_l2}}` bằng tay.
 *
 * TRANG chứ không phải hộp thoại (chốt C-03 ngày 19/08): hướng dẫn dài hơn biểu
 * mẫu vài lần, và một hộp thoại cao hơn màn hình thì phần cuộn được nằm trong
 * cái đang che phần còn lại của ứng dụng.
 */
import { useState } from 'react';
import { guiTep } from '../lib/api.js';
import {
  CAU_HINH_MAU,
  KHO_GIAY,
  NHAN_KHOA,
  NHAN_KHO,
  O_BANG_SAN_PHAM,
  oTrongCua,
  type KhoGiay,
  type LoaiMau,
  type MauHopDong as MauDto,
} from '../lib/mau-hop-dong.js';
import { BaoLoi, ChuThichBatBuoc, Truong } from '../components/Chung.js';

/**
 * Nhóm khoá hiện trên hướng dẫn, theo đúng thứ tự người soạn mẫu cần tới.
 *
 * Viết tay chứ không suy từ tiền tố: `ho_so.` gom cả ba nhóm — thông tin chung,
 * khách hàng, người xử lý — và đổ chúng thành một danh sách hai mươi dòng thì
 * mắt không tìm được gì. Có ca kiểm thử đối chiếu danh sách này với danh sách
 * khoá của máy chủ, nên bỏ sót một khoá là test đỏ chứ không phải im lặng.
 */
const NHOM_HUONG_DAN: { nhan: string; khoa: string[]; loai?: LoaiMau }[] = [
  {
    nhan: 'Thông tin chung của hồ sơ',
    khoa: [
      'ho_so.ma_ho_so',
      'ho_so.phien_ban',
      'ho_so.trang_thai',
      'ho_so.ngay_ap_dung',
      'ho_so.ngay_hieu_luc',
      'ho_so.tep_dinh_kem',
    ],
  },
  {
    nhan: 'Khách hàng trong hồ sơ',
    khoa: [
      'ho_so.ma_khach_hang',
      'ho_so.ten_khach_hang',
      'ho_so.ma_so_thue',
      'ho_so.dia_chi_dang_ky',
      'ho_so.noi_nhan_hang',
      'ho_so.nguoi_dai_dien',
      'ho_so.chuc_danh_dai_dien',
      'ho_so.cong_no',
    ],
  },
  {
    nhan: 'Người xử lý hồ sơ',
    khoa: [
      'ho_so.nguoi_de_nghi',
      'ho_so.truong_bo_phan',
      'ho_so.ke_toan',
      'ho_so.sale_admin',
      'ho_so.ngay_tbp_ky',
      'ho_so.ngay_kt_nhan_l1',
      'ho_so.ngay_kt_nhan_l2',
      'ho_so.chu_ky_so_TBP',
    ],
  },
  {
    nhan: 'Công ty và ngày in',
    khoa: ['cong_ty.ten', 'cong_ty.dia_chi', 'cong_ty.ma_so_thue', 'ngay_in'],
  },
  {
    // Chỉ mẫu HỢP ĐỒNG: bảng ở đó do người soạn vẽ tay, dòng bảng chứa khoá này
    // được nhân bản theo từng dòng sản phẩm. Mẫu hồ sơ dùng `{{bang_san_pham}}`
    // và không đụng tới nhóm này — bày ra là mời chọn nhầm.
    nhan: 'Dòng sản phẩm — nhân bản theo từng dòng',
    loai: 'HOP_DONG',
    khoa: [
      'san_pham.stt',
      'san_pham.ma_san_pham',
      'san_pham.ten_san_pham',
      'san_pham.gia_cong_ty',
      'san_pham.gia_ban_buon',
      'san_pham.cpbh_tong',
      'san_pham.gia_thu_ve',
      'san_pham.ty_le_ck',
    ],
  },
];

/** Mọi khoá bảng hướng dẫn nêu ra — dùng cho ca kiểm thử đối chiếu máy chủ. */
export const KHOA_HUONG_DAN = NHOM_HUONG_DAN.flatMap((n) => n.khoa);

function KhoaChep({ khoa }: { khoa: string }) {
  const [daChep, datDaChep] = useState(false);
  const o = oTrongCua(khoa);

  const chep = () => {
    // `navigator.clipboard` không có ở mọi ngữ cảnh (http, trình duyệt cũ). Hỏng
    // thì KHÔNG báo lỗi đỏ: khoá vẫn hiện nguyên trên màn hình để bôi đen chép
    // tay, nên đây là tiện ích chứ không phải đường duy nhất.
    void navigator.clipboard
      ?.writeText(o)
      .then(() => {
        datDaChep(true);
        setTimeout(() => datDaChep(false), 1200);
      })
      .catch(() => undefined);
  };

  return (
    <button type="button" className="khoa-chep" onClick={chep} title="Bấm để chép">
      <code>{o}</code>
      <span className="dau-chep" aria-hidden="true">
        {daChep ? 'đã chép' : 'chép'}
      </span>
    </button>
  );
}

export function ThemMau({
  loai,
  quayLai,
  xong,
}: {
  loai: LoaiMau;
  quayLai: () => void;
  xong: (t: MauDto) => void;
}) {
  const ch = CAU_HINH_MAU[loai];
  const [ten, datTen] = useState('');
  const [kho, datKho] = useState<KhoGiay>('a4p');
  const [tep, datTep] = useState<File | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tep) return;
    datLoi(null);
    datDangGui(true);
    try {
      const form = new FormData();
      form.append('file', tep);
      form.append('name', ten.trim() || tep.name.replace(/\.docx$/i, ''));
      if (ch.theoKhoGiay) form.append('paperSize', kho);
      xong(await guiTep<MauDto>(ch.duong, form));
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  const nhom = NHOM_HUONG_DAN.filter((n) => n.loai === undefined || n.loai === loai);

  return (
    <section className="trang">
      <div className="dau-trang">
        <div>
          <h1>{ch.nhanTaiLen}</h1>
          <p className="mo-ta-trang">
            Soạn văn bản trong Word, đặt khoá vào đúng chỗ muốn phần mềm điền dữ liệu.
          </p>
        </div>
        <div className="nhom-nut nhom-nut-dau">
          <button type="button" className="nut nut-nhe" onClick={quayLai}>
            Quay lại danh sách
          </button>
        </div>
      </div>

      <div className="them-mau">
        <form className="them-mau-form" onSubmit={gui}>
          <ChuThichBatBuoc />

          <Truong id="tm-ten" nhan="Tên mẫu">
            {(p) => (
              <input
                {...p}
                className="o-nhap"
                value={ten}
                placeholder="Để trống thì lấy tên file"
                onChange={(e) => datTen(e.target.value)}
              />
            )}
          </Truong>

          {ch.theoKhoGiay && (
            <Truong id="tm-kho" nhan="Khổ giấy" bắtBuộc>
              {(p) => (
                <select
                  {...p}
                  className="o-nhap"
                  value={kho}
                  onChange={(e) => datKho(e.target.value as KhoGiay)}
                >
                  {KHO_GIAY.map((k) => (
                    <option key={k} value={k}>
                      {NHAN_KHO[k]}
                    </option>
                  ))}
                </select>
              )}
            </Truong>
          )}

          <Truong id="tm-tep" nhan="Tệp mẫu" bắtBuộc>
            {(p) => (
              <input
                {...p}
                className="o-nhap"
                type="file"
                accept=".docx"
                onChange={(e) => datTep(e.target.files?.[0] ?? null)}
              />
            )}
          </Truong>

          {ch.theoKhoGiay && (
            <p className="ghi-chu">
              Khổ giấy phải khớp với chính file <code>.docx</code> — phần mềm không xoay được mẫu
              dọc thành ngang.
            </p>
          )}

          {loi !== null && <BaoLoi loi={loi} />}

          <div className="nhom-nut">
            <button type="submit" className="nut nut-chinh" disabled={dangGui || tep === null}>
              {dangGui ? 'Đang tải…' : 'Tải lên'}
            </button>
            <button type="button" className="nut nut-nhe" onClick={quayLai}>
              Huỷ
            </button>
          </div>
        </form>

        <div className="them-mau-huong-dan">
          <h2>Cách đặt chỗ điền dữ liệu</h2>
          <p className="ghi-chu">
            Trong file Word, gõ khoá vào đúng chỗ muốn phần mềm điền. Khoá viết trong hai cặp ngoặc
            nhọn, ví dụ <code>{'{{ho_so.ten_khach_hang}}'}</code>. Bấm một khoá dưới đây để chép.
          </p>

          {ch.theoKhoGiay && (
            <div className="hop-canh-bao" role="note">
              <p>
                <strong>Bảng sản phẩm: đặt {O_BANG_SAN_PHAM}, đừng vẽ bảng bằng tay.</strong>
              </p>
              <p className="ghi-chu">
                Phần mềm thay khoá ấy bằng <strong>cả cái bảng</strong>, với đúng số cột CPBH của
                từng hồ sơ. Cột: STT · Mã sản phẩm · Tên sản phẩm · Giá công ty · Giá bán buôn ·
                CPBH tổng · CPBH1…CPBHn · Giá thu về · Tỷ lệ CK · Ghi chú. Ghi chú dài thì tự xuống
                dòng, ô cao lên. Khoá này <strong>không cần ánh xạ</strong>.
              </p>
            </div>
          )}

          {nhom.map((n) => (
            <div key={n.nhan} className="nhom-khoa">
              <h3>{n.nhan}</h3>
              <div className="khung-cuon">
                <table className="bang-khoa">
                  <tbody>
                    {n.khoa.map((k) => (
                      <tr key={k}>
                        <td>
                          <KhoaChep khoa={k} />
                        </td>
                        <td className="ghi-chu">{NHAN_KHOA[k] ?? k}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <p className="ghi-chu">
            Word có thể tự cắt một khoá thành nhiều mảnh khi bạn sửa chữ giữa chừng. Khoá nào không
            xuất hiện ở bảng ánh xạ sau khi tải lên thì <strong>xoá đi và gõ lại liền một mạch</strong>.
          </p>
        </div>
      </div>
    </section>
  );
}
