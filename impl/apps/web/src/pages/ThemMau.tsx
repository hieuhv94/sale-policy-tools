/**
 * Trang **thêm văn bản mẫu** — một lượt lưu, không có bước nào ở giữa (`0067`).
 *
 * Bố cục: chọn file → bảng ánh xạ mở ra trong một **hộp thoại riêng** (`0068`) →
 * hướng dẫn đứng cạnh, tự cuộn trong hộp của nó. Nút **Lưu** ở góc trên bên
 * phải, và nó hỏi lại một lần trước khi ghi.
 *
 * Bảng ánh xạ tách ra hộp riêng vì với mẫu hai mươi ô trống, để thẳng vào cột
 * trái thì cột ấy dài gấp ba phần còn lại — và hai thứ đáng chú ý nhất, ô chọn
 * cột bảng và nút Lưu, bị đẩy khỏi tầm mắt.
 *
 * BA THỨ ĐÃ BỎ so với `0056`, và cả ba đều là bỏ một câu hỏi sai:
 *
 *   - **Ô chọn định dạng** cho từng dòng ánh xạ. *"Công nợ hiển thị kiểu tiền
 *     hay kiểu chữ?"* chỉ có một câu trả lời đúng, và nó đi theo TRƯỜNG chứ
 *     không theo mẫu — giờ gắn cứng ở `sources.ts`.
 *   - **Cột "bắt buộc"**. Nó chỉ đổi thời điểm báo lỗi, và báo cho người không
 *     sửa được. Mục bắt buộc của muc 11.1 kiểm ngay lúc lưu.
 *   - **Bấm khoá để chép**. Người soạn gõ khoá trong Word chứ không dán từ
 *     trình duyệt, nên nút chép chỉ là một thứ bấm được mà không dẫn tới đâu.
 */
import { useState } from 'react';
import { guiTep, layJson } from '../lib/api.js';
import {
  CAU_HINH_MAU,
  NHAN_KHOA,
  O_BANG_SAN_PHAM,
  luuDuoc,
  type CotBang,
  type DanhMucNguon,
  type LoaiMau,
  type MauHopDong as MauDto,
  type ThongTinOTrong,
  type TruongAnhXa,
} from '../lib/mau-hop-dong.js';
import { BaoLoi, ChuThichBatBuoc, HopThoai, HopThoaiXacNhan, Truong } from '../components/Chung.js';
import { useBaoLoi } from '../lib/bao-loi.js';

/**
 * Nhóm khoá hiện trên hướng dẫn, theo đúng thứ tự người soạn mẫu cần tới.
 *
 * Viết tay chứ không suy từ tiền tố: `ho_so.` gom cả ba nhóm — thông tin chung,
 * khách hàng, người xử lý — và đổ chúng thành một danh sách hai mươi dòng thì
 * mắt không tìm được gì. Có ca kiểm thử đối chiếu danh sách này với danh sách
 * khoá của máy chủ, nên bỏ sót một khoá là test đỏ chứ không phải im lặng.
 *
 * Hai nhóm `cong_ty.` và `san_pham.` đã bỏ ở `0067`: thông tin Công ty cố định
 * nên gõ thẳng vào file, còn dòng sản phẩm thì nằm trong bảng do hệ thống dựng.
 */
const NHOM_HUONG_DAN: { nhan: string; khoa: string[] }[] = [
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
  { nhan: 'Khác', khoa: ['ngay_in'] },
];

/** Mọi khoá bảng hướng dẫn nêu ra — dùng cho ca kiểm thử đối chiếu máy chủ. */
export const KHOA_HUONG_DAN = NHOM_HUONG_DAN.flatMap((n) => n.khoa);

export function ThemMau({
  loai,
  quayLai,
  xong,
}: {
  loai: LoaiMau;
  quayLai: () => void;
  xong: (t: MauDto) => void;
}) {
  const { bao } = useBaoLoi();
  const ch = CAU_HINH_MAU[loai];
  const [ten, datTen] = useState('');
  const [tep, datTep] = useState<File | null>(null);
  const [oTrong, datOTrong] = useState<ThongTinOTrong | null>(null);
  const [anhXa, datAnhXa] = useState<Record<string, string>>({});
  const [danhMuc, datDanhMuc] = useState<DanhMucNguon | null>(null);
  /*
   * Chỉ giữ lỗi TẢI danh mục nguồn (`0088`).
   *
   * Không có nó thì cả trang không dựng nổi bảng ánh xạ, nên đây là dạng
   * `trang`: khối ở lại trên màn hình. Lỗi của các nút bấm trong trang này đi
   * qua `bao()` và bảng tra.
   */
  const [loiTai, datLoiTai] = useState<unknown>(null);
  const [cot, datCot] = useState<string[] | null>(null);
  const [dangDoc, datDangDoc] = useState(false);
  const [dangLuu, datDangLuu] = useState(false);
  const [hoi, datHoi] = useState(false);
  const [moAnhXa, datMoAnhXa] = useState(false);

  /*
   * Danh mục nguồn tải MỘT LẦN, lúc trang mở — không đợi chọn file.
   *
   * Nó là thứ dựng nên cả ô chọn trường lẫn danh sách cột, nên tải muộn thì bảng
   * ánh xạ hiện ra với những ô chọn rỗng đúng vào lúc người dùng bắt đầu điền.
   */
  useState(() => {
    layJson<DanhMucNguon>(`${ch.duong}/sources`)
      .then((d) => {
        datDanhMuc(d);
        datCot((c) => c ?? (d.cotBang ?? []).map((x) => x.khoa));
      })
      .catch(datLoiTai);
    return undefined;
  });

  /** Chọn file → đọc ô trống ngay, và điền sẵn ánh xạ máy chủ đoán được. */
  const chonTep = async (f: File | null) => {
    datTep(f);
    datOTrong(null);
    datAnhXa({});
    if (!f) return;
    datDangDoc(true);
    try {
      const form = new FormData();
      form.append('file', f);
      const tt = await guiTep<ThongTinOTrong>(`${ch.duong}/o-trong`, form);
      datOTrong(tt);
      datAnhXa(Object.fromEntries(tt.goiY.map((g) => [g.placeholder, g.source])));
      if (ten.trim() === '') datTen(f.name.replace(/\.docx$/i, ''));
      // Mở bảng ánh xạ NGAY: đọc xong ô trống mà không bày ra thì người dùng
      // phải đoán rằng có một bước nữa và phải tự đi tìm nút mở nó.
      datMoAnhXa(tt.placeholders.length > 0);
    } catch (e) {
      bao(e);
    } finally {
      datDangDoc(false);
    }
  };

  const luu = async () => {
    if (!tep) return;
    datDangLuu(true);
    try {
      const mapping: TruongAnhXa[] = Object.entries(anhXa)
        .filter(([, source]) => source !== '')
        .map(([placeholder, source]) => ({ placeholder, source }));
      const form = new FormData();
      form.append('file', tep);
      form.append('name', ten.trim() || tep.name.replace(/\.docx$/i, ''));
      form.append('mapping', JSON.stringify(mapping));
      if (cot) form.append('cotBang', JSON.stringify(cot));
      xong(await guiTep<MauDto>(ch.duong, form));
    } catch (e) {
      bao(e);
    } finally {
      datDangLuu(false);
      datHoi(false);
    }
  };

  const daChon = new Set(Object.entries(anhXa).filter(([, v]) => v !== '').map(([k]) => k));
  const duLuu = tep !== null && oTrong !== null && luuDuoc(oTrong.placeholders, daChon);
  const coBang = oTrong?.placeholders.includes(O_BANG_SAN_PHAM) ?? false;
  const cotBatBuoc = new Set(danhMuc?.cotBatBuoc ?? []);

  /*
   * Câu "cột nào không tắt được" ĐỌC TỪ MÁY CHỦ, không viết cứng (`0084`).
   *
   * Trước đó nó là một câu chữ chép tay nêu đích danh *Tên sản phẩm* và *CPBH
   * tổng*. Lúc khách hàng mở CPBH tổng ra cho tắt, ô chọn ngoan ngoãn bật lên
   * còn câu chữ ngay trên nó vẫn dạy điều ngược lại — và người dùng tin câu chữ
   * chứ không tin cái ô, vì câu chữ mới là thứ giải thích.
   */
  const nhanBatBuoc = (danhMuc?.cotBang ?? [])
    .filter((c) => cotBatBuoc.has(c.khoa))
    .map((c) => c.nhan);

  /** Ô trống PHẢI ánh xạ — ô bảng sản phẩm không trỏ tới trường nào nên đứng ngoài. */
  const phaiAnhXa = (oTrong?.placeholders ?? []).filter((o) => o !== O_BANG_SAN_PHAM);
  const soPhaiAnhXa = phaiAnhXa.length;
  const thieu = phaiAnhXa.filter((o) => !daChon.has(o));

  return (
    <section className="trang">
      <div className="dau-trang">
        <div>
          <h1>{ch.nhanTaiLen}</h1>
          <p className="mo-ta-trang">
            Soạn văn bản trong Word, đặt khoá vào đúng chỗ muốn phần mềm điền dữ liệu.
          </p>
        </div>
        {/*
          NÚT LƯU Ở GÓC TRÊN BÊN PHẢI (`0067`) — cùng chỗ với mọi nút chính khác
          của phần mềm, nên mắt tìm nó ở đúng nơi đã quen.

          Nó xám cho tới khi mọi ô trống đều đã chọn trường: máy chủ chặn lưu
          (`TEMPLATE_INCOMPLETE`), và một nút bấm được rồi mới báo lỗi thì tệ hơn
          một nút nói trước rằng chưa tới lượt.
        */}
        <div className="nhom-nut nhom-nut-dau">
          <button
            type="button"
            className="nut nut-chinh"
            disabled={!duLuu || dangLuu}
            onClick={() => datHoi(true)}
          >
            {dangLuu ? 'Đang lưu…' : 'Lưu'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={quayLai}>
            Quay lại danh sách
          </button>
        </div>
      </div>

      {loiTai !== null && <BaoLoi loi={loiTai} />}

      <div className="them-mau">
        <div className="them-mau-form">
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

          <Truong id="tm-tep" nhan="Tệp mẫu" bắtBuộc>
            {(p) => (
              <input
                {...p}
                className="o-nhap"
                type="file"
                accept=".docx"
                onChange={(e) => void chonTep(e.target.files?.[0] ?? null)}
              />
            )}
          </Truong>

          <p className="ghi-chu">
            Khổ giấy lấy từ chính file <code>.docx</code> — soạn ngang thì bản mềm ra ngang. Phần
            mềm không hỏi và không xoay được mẫu dọc thành ngang.
          </p>

          {dangDoc && <p className="ghi-chu">Đang đọc ô trống trong file…</p>}

          {/*
            BẢNG ÁNH XẠ nằm trong HỘP THOẠI RIÊNG (`0068`).

            `0067` đặt nó thẳng vào cột trái, ngay dưới ô chọn tệp. Với mẫu hai
            mươi ô trống thì cột ấy dài gấp ba phần còn lại, và hai thứ đáng chú
            ý nhất — ô chọn cột bảng, nút Lưu — bị đẩy khỏi tầm mắt.

            Ở đây chỉ còn một dòng TÓM TẮT: đã ánh xạ mấy trên mấy, và một nút mở
            lại hộp. Dòng ấy đủ để biết còn việc hay đã xong.
          */}
          {oTrong && (
            <div className="tom-tat-anh-xa">
              <p className={thieu.length > 0 ? 'ghi-chu canh-bao' : 'ghi-chu'}>
                Ô trống: <strong>{daChon.size}</strong>/{soPhaiAnhXa} đã chọn trường
                {thieu.length > 0 ? ` — còn ${thieu.length} ô chưa chọn` : ''}
              </p>
              <button type="button" className="nut nut-nhe" onClick={() => datMoAnhXa(true)}>
                {thieu.length > 0 ? 'Chọn trường cho các ô còn lại' : 'Xem lại ánh xạ'}
              </button>
            </div>
          )}

          {/*
            CHỌN CỘT chỉ hiện khi file THẬT SỰ có ô bảng — hỏi về một cái bảng
            không tồn tại trong mẫu là hỏi một câu không có hệ quả nào.
          */}
          {coBang && danhMuc?.cotBang && (
            <>
              <h2 className="tieu-de-nho">Cột của bảng sản phẩm</h2>
              <p className="ghi-chu">
                Bỏ bớt cột thì bảng hẹp lại và vừa khổ dọc dễ hơn.{' '}
                {nhanBatBuoc.length > 0 && (
                  <>
                    Cột{' '}
                    {nhanBatBuoc.map((n, i) => (
                      <span key={n}>
                        {i > 0 ? ' và ' : ''}
                        <strong>{n}</strong>
                      </span>
                    ))}{' '}
                    không tắt được — muc 11.1 đòi bản A4 phải có.
                  </>
                )}
              </p>
              {/*
                CPBH là con số NỘI BỘ, và đây là câu nói cho người soạn mẫu biết
                họ vừa được trao quyền gì (`0084`): tắt hai cột CPBH đi là ra
                đúng bản đưa cho khách hàng xem.
              */}
              <p className="ghi-chu">
                CPBH là chi phí nội bộ. Bản đưa khách hàng thì tắt cả{' '}
                <strong>CPBH tổng</strong> lẫn <strong>từng khoản CPBH</strong>; bản lưu nội bộ thì
                bật.
              </p>
              <div className="chon-cot">
                {danhMuc.cotBang.map((c: CotBang) => {
                  const buoc = cotBatBuoc.has(c.khoa);
                  return (
                    <label key={c.khoa}>
                      <input
                        type="checkbox"
                        checked={buoc || (cot ?? []).includes(c.khoa)}
                        disabled={buoc}
                        onChange={(e) =>
                          datCot((cu) => {
                            const co = new Set(cu ?? []);
                            if (e.target.checked) co.add(c.khoa);
                            else co.delete(c.khoa);
                            return (danhMuc.cotBang ?? [])
                              .map((x) => x.khoa)
                              .filter((k) => co.has(k));
                          })
                        }
                      />
                      {c.nhan}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="them-mau-huong-dan">
          <h2>Cách đặt chỗ điền dữ liệu</h2>
          <p className="ghi-chu">
            Trong file Word, gõ khoá vào đúng chỗ muốn phần mềm điền. Khoá viết trong hai cặp ngoặc
            nhọn, ví dụ <code className="the-khoa">{'{{ten_khach_hang}}'}</code>.
          </p>

          <div className="hop-canh-bao" role="note">
            <p>
              <strong>Bảng sản phẩm: đặt {O_BANG_SAN_PHAM}, đừng vẽ bảng bằng tay.</strong>
            </p>
            <p className="ghi-chu">
              Phần mềm thay khoá ấy bằng <strong>cả cái bảng</strong>, với đúng số cột CPBH của từng
              hồ sơ và đúng những cột bạn chọn bên trái. Ghi chú dài thì tự xuống dòng, ô cao lên.
              Khoá này <strong>không cần ánh xạ</strong>.
            </p>
          </div>

          {NHOM_HUONG_DAN.map((n) => (
            <div key={n.nhan} className="nhom-khoa">
              <h3>{n.nhan}</h3>
              <div className="khung-cuon">
                <table className="bang-khoa">
                  <tbody>
                    {n.khoa.map((k) => (
                      <tr key={k}>
                        <td>
                          {/*
                            TÊN KHOÁ TRẦN, không có `{{ }}` (`0068`).

                            Hai cặp ngoặc lặp lại ở hai mươi dòng chỉ làm cột đầu
                            dài thêm mà không nói gì mới — câu ngay trên đã dạy
                            cách viết chúng rồi. Thẻ nền xám thay ngoặc để mắt
                            vẫn nhận ra đây là thứ phải gõ y nguyên.
                          */}
                          <code className="the-khoa">{k}</code>
                        </td>
                        <td className="ghi-chu">{NHAN_KHOA[k] ?? k}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/*
        HỘP ÁNH XẠ (`0068`) — rộng, và nội dung KHÔNG tràn ra ngoài khung.

        Hai thứ gây tràn ở một hộp thoại hẹp, và cả hai đã chặn ở CSS chứ không
        ở đây: khoá dài không có khoảng trắng thì trình duyệt không tìm được chỗ
        ngắt, còn `<select>` thì mặc định rộng bằng mục dài nhất của nó.
      */}
      {moAnhXa && oTrong && (
        <HopThoai tieuDe="Ánh xạ ô trống với trường dữ liệu" rong dong={() => datMoAnhXa(false)}>
          <p className="ghi-chu">
            Mỗi ô trống trong file lấy dữ liệu từ một trường của hồ sơ. Phần mềm đã đoán sẵn theo
            tên ô; soát lại và chọn nốt những ô còn trống.
          </p>

          <div className="khung-cuon">
            <table className="bang bang-anh-xa">
              <thead>
                <tr>
                  <th>Ô trống trong file</th>
                  <th>Lấy dữ liệu từ</th>
                </tr>
              </thead>
              <tbody>
                {oTrong.placeholders.map((o) =>
                  o === O_BANG_SAN_PHAM ? (
                    <tr key={o}>
                      <td>
                        <code className="the-khoa">{o}</code>
                      </td>
                      <td className="ghi-chu">Cả bảng sản phẩm — không cần chọn trường</td>
                    </tr>
                  ) : (
                    <tr key={o}>
                      <td>
                        <code className="the-khoa">{o}</code>
                      </td>
                      <td>
                        <select
                          className="o-nhap"
                          aria-label={`Trường dữ liệu cho ${o}`}
                          value={anhXa[o] ?? ''}
                          onChange={(e) => datAnhXa((cu) => ({ ...cu, [o]: e.target.value }))}
                        >
                          <option value="">— chưa chọn —</option>
                          {/*
                            Hiện TÊN KHOÁ, không hiện chú thích (`0068`).

                            Người dùng vừa đọc tên ô trống ở cột bên trái và đang
                            đi tìm cái trùng với nó. Bày chú thích tiếng Việt ra
                            đây là bắt họ dịch hai chiều giữa hai cách gọi tên
                            cho từng dòng một.
                          */}
                          {(danhMuc?.knownSources ?? []).map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          <div className="nhom-nut">
            <button type="button" className="nut nut-chinh" onClick={() => datMoAnhXa(false)}>
              Xong
            </button>
          </div>
        </HopThoai>
      )}

      {hoi && (
        <HopThoaiXacNhan
          tieuDe={`Lưu mẫu "${ten.trim() || tep?.name}"`}
          nguyHiem={false}
          hauQua={
            <>
              <p>
                Mẫu vào <strong>ngay danh sách chọn</strong> của người xem — không có bước ban hành
                nào nữa.
              </p>
              <p>
                Mẫu <strong>không sửa được</strong> sau khi lưu. Muốn đổi thì xoá đi và thêm mẫu
                mới, nên hãy soát lại bảng ánh xạ trước khi bấm.
              </p>
            </>
          }
          nhanNut="Lưu mẫu"
          dangChay={dangLuu}
          dong={() => datHoi(false)}
          xacNhan={() => void luu()}
        />
      )}
    </section>
  );
}
