/**
 * Thẻ Quy định chiết khấu — ngưỡng cảnh báo khi lập hồ sơ.
 *
 * HAI ô phạm vi (nhóm sản phẩm · loại khách hàng) đều bỏ trống được, và bỏ
 * trống nghĩa là "mọi". Nhiều dòng cùng khớp một tình huống là chuyện BÌNH
 * THƯỜNG chứ không phải lỗi cấu hình: dòng cụ thể hơn thắng.
 *
 * Chiều thứ ba — kênh bán — đã bỏ ở `0026`: ngưỡng chỉ phụ thuộc bản chất hàng
 * hoá và loại khách hàng.
 *
 * Bảng KHÔNG còn cột "Độ cụ thể" `0023`. Nó là con số nội bộ máy chủ dùng để xếp
 * thứ tự, và bày ra thì người đọc phải tự học luật trọng số mới hiểu — trong khi
 * chính cột "Áp dụng cho" ngay bên cạnh đã nói rõ dòng nào hẹp hơn dòng nào.
 * Câu hỏi "vì sao hồ sơ này lấy ngưỡng 25% chứ không phải 30%" giờ trả lời bằng
 * cột **Id**: mỗi dòng hồ sơ mang mã của đúng quy định đã cho ra ngưỡng của nó,
 * dán mã ấy vào ô tìm kiếm ở đây là ra thẳng dòng cần xem.
 */
import { useState } from 'react';
import { dang, va, xoa } from '../../lib/api.js';
import { homNayVN, ngay } from '../../lib/format.js';
import {
  LOAI_KHACH_HANG,
  nhanLoaiKhach,
  doiSoThapPhan,
  nguongTuPhanTram,
  phamViChietKhau,
  tomTatLoaiKhach,
  phanTramTuNguong,
  type NhomSanPham,
  type QuyDinhChietKhau,
} from '../../lib/danh-muc.js';
import {
  BaoLoi,
  ChuThichBatBuoc,
  DangTai,
  HopThoai,
  HopThoaiXacNhan,
  ONhapNgay,
  ONhapPhanTram,
  Trong,
  Truong,
} from '../Chung.js';
import { ChonCoGo } from '../ChonCoGo.js';
import { thieuTruong } from '../../lib/bat-buoc.js';
import { PhanTrang } from '../PhanTrang.js';
import { useTrangMay } from '../../lib/phan-trang.js';
import { useBaoLoi } from '../../lib/bao-loi.js';

export function TheChietKhau({ nhom, chiXem = false }: { nhom: NhomSanPham[]; chiXem?: boolean }) {
  const [moTao, datMoTao] = useState(false);
  const [sua, datSua] = useState<QuyDinhChietKhau | null>(null);
  const [dangXoa, datDangXoa] = useState<string | null>(null);
  const [hoiXoa, datHoiXoa] = useState<QuyDinhChietKhau | null>(null);
  const [locNhom, datLocNhom] = useState('');
  const [locLoai, datLocLoai] = useState('');
  const [loiGo, datLoiGo] = useState<unknown>(null);

  /*
   * HAI Ô CHỌN thay cho ô gõ tự do (`0049`).
   *
   * Ô tìm chữ cũ khớp trên bốn thứ, và hai trong số đó là chuỗi do chính màn
   * hình dựng ra: câu mô tả phạm vi, và con số phần trăm đang hiển thị. Không
   * đưa xuống máy chủ được, mà giữ ở màn hình thì nó chỉ tìm trong 200 dòng đầu.
   *
   * Hai ô chọn hợp với dữ liệu hơn hẳn: nhóm sản phẩm và loại khách hàng đều là
   * tập giá trị ĐÓNG, người dùng chọn từ danh sách chứ không phải nhớ để gõ
   * đúng. Cả hai là cột thật, lọc bằng phép so bằng, chạy trên toàn bảng.
   */
  const truyVan = new URLSearchParams();
  if (locNhom !== '') truyVan.set('groupCode', locNhom);
  if (locLoai !== '') truyVan.set('customerType', locLoai);
  const duoi = truyVan.toString();

  const {
    muc: ds,
    tong,
    loi,
    trang,
    soTrang,
    doiTrang,
    taiLai,
  } = useTrangMay<QuyDinhChietKhau>(`/catalog/discount-rules${duoi ? `?${duoi}` : ''}`);

  const dangLoc = locNhom !== '' || locLoai !== '';

  const go = async (q: QuyDinhChietKhau) => {
    datLoiGo(null);
    datDangXoa(q.code);
    try {
      await xoa(`/catalog/discount-rules/${encodeURIComponent(q.code)}`, { confirm: q.code });
      taiLai();
    } catch (e) {
      datLoiGo(e);
    } finally {
      datDangXoa(null);
    }
  };

  if (loi !== null && ds === null) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (!ds) return <DangTai />;

  return (
    <>
      {!chiXem && (
        <div className="hang-thao-tac">
          <button type="button" className="nut nut-chinh" onClick={() => datMoTao(true)}>
            Thêm quy định
          </button>
        </div>
      )}

      <p className="ghi-chu">
        Ngưỡng chỉ để <strong>cảnh báo</strong>. Hồ sơ vượt ngưỡng vẫn gửi duyệt được — nó chỉ được
        đánh dấu để người duyệt nhìn thấy. Cột <em>Hiệu lực</em> là <strong>ngày bắt đầu</strong>:
        mọi quy định đều vô thời hạn, chạy từ ngày đó cho tới khi bị xoá hoặc bị một dòng cụ thể hơn
        đè lên.
      </p>

      {loi !== null && <BaoLoi loi={loi} thuLai={taiLai} />}
      {loiGo !== null && <BaoLoi loi={loiGo} />}

      <div className="hang-tim">
        <Truong id="loc-nhom-ck" nhan="Nhóm sản phẩm">
          {(p) => (
            <ChonCoGo {...p} giaTri={locNhom} doi={datLocNhom} mucRong="— Mọi nhóm —" ds={nhom.map((x) => ({ gia: x.code, nhan: `${x.name} (${x.code})` }))} />
          )}
        </Truong>
        <Truong id="loc-loai-ck" nhan="Loại khách hàng">
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={locLoai}
              onChange={(e) => datLocLoai(e.target.value)}
            >
              <option value="">— Mọi loại —</option>
              {LOAI_KHACH_HANG.map((l) => (
                <option key={l} value={String(l)}>
                  Loại {l}
                </option>
              ))}
            </select>
          )}
        </Truong>
        {dangLoc && (
          <span className="ghi-chu" role="status">
            {tong} quy định khớp
          </span>
        )}
      </div>

      {dangLoc && (
        <p className="ghi-chu">
          Danh sách gồm cả quy định <strong>chung</strong> — dòng áp cho mọi nhóm hoặc mọi loại
          khách vẫn áp cho lựa chọn này, nên giấu chúng đi là đưa ra một bức tranh thiếu đúng
          dòng đang có hiệu lực.
        </p>
      )}

      {ds.length === 0 ? (
        dangLoc ? (
          <Trong
            tieuDe="Không có quy định nào khớp"
            moTa="Không quy định nào áp cho nhóm và loại khách đang chọn. Mở một trong hai ô về “Mọi …” để xem rộng hơn."
          />
        ) : (
          <Trong
            tieuDe="Chưa có quy định chiết khấu nào"
            moTa="Chưa có quy định thì không sản phẩm nào bị đánh dấu vượt ngưỡng."
          />
        )
      ) : (
        <div className="khung-cuon" role="region" aria-label="Quy định chiết khấu" tabIndex={0}>
          <table className="bang">
            <thead>
              <tr>
                <th>Id</th>
                <th>Áp dụng cho</th>
                <th>Ngưỡng</th>
                <th>Hiệu lực</th>
                {/* Tiêu đề KHÔNG hiện ra mắt (`0132`), nhưng vẫn phải có: một
                    `<th>` rỗng thì trình đọc màn hình đọc ô nút là "cột trống",
                    và người dùng bàn phím không biết mình vừa Tab vào đâu. */}
                {!chiXem && (
                  <th>
                    <span className="chi-doc-man-hinh">Thao tác</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {ds.map((q) => (
                <tr key={q.code}>
                  <td className="ma-quy-dinh">{q.code}</td>
                  <td>{phamViChietKhau(q)}</td>
                  <td className="so">{phanTramTuNguong(q.thresholdRate2)}%</td>
                  {/* CHỈ ngày bắt đầu (`0028`). Chữ "– vô thời hạn" lặp lại y
                      nguyên ở mọi dòng nên nó không phân biệt dòng nào với dòng
                      nào; nó là một luật của CẢ BẢNG, và chỗ của luật ấy là câu
                      ghi chú trên đầu bảng — nơi nó được nói đúng một lần. */}
                  <td>{ngay(q.effectiveFrom)}</td>
                  {!chiXem && (
                    <td className="o-thao-tac-re-chuot">
                      <div className="nhom-nut nhom-nut-gon">
                        <button type="button" className="nut nut-nhe" onClick={() => datSua(q)}>
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="nut nut-canh-bao"
                          disabled={dangXoa === q.code}
                          onClick={() => datHoiXoa(q)}
                        >
                          Xoá
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PhanTrang
        trang={trang}
        soTrang={soTrang}
        tong={tong}
        doiTrang={doiTrang}
        nhan="quy định"
      />

      {hoiXoa && (
        /* `goLai` — gõ lại MÃ quy định (`0036`). Máy chủ đòi đúng chuỗi ấy
           trong thân request, nên đây không phải một hộp thoại lịch sự mà là
           một phần của lời gọi. */
        <HopThoaiXacNhan
          tieuDe="Xoá quy định chiết khấu"
          hauQua={
            <p>
              Ngưỡng riêng của tổ hợp này biến mất. Hồ sơ lập sau đó rơi về{' '}
              <strong>quy định rộng hơn</strong> nếu có; không có quy định nào khác phủ thì dòng sản
              phẩm sẽ <strong>không có ngưỡng nào để đối chiếu</strong> — vẫn lập được, vẫn duyệt
              được, chỉ là không đánh dấu vượt ngưỡng được nữa.
            </p>
          }
          nhanNut="Xoá quy định"
          goLai={hoiXoa.code}
          dangChay={dangXoa === hoiXoa.code}
          dong={() => datHoiXoa(null)}
          xacNhan={() => void go(hoiXoa).then(() => datHoiXoa(null))}
        />
      )}

      {moTao && (
        <HopThoaiTaoQuyDinh
          nhom={nhom}
          dong={() => datMoTao(false)}
          xong={() => {
            datMoTao(false);
            taiLai();
          }}
        />
      )}

      {sua && (
        <HopThoaiSuaQuyDinh
          q={sua}
          nhom={nhom}
          dong={() => datSua(null)}
          xong={() => {
            datSua(null);
            taiLai();
          }}
        />
      )}
    </>
  );
}

/**
 * Chọn TẬP loại khách của một quy định (`0280`) — ô tích, không phải ô chọn một.
 *
 * Không tích loại nào, hoặc tích đủ cả ba, đều nghĩa là *mọi loại*; câu dưới ô nói thẳng điều
 * ấy để người dùng không đi tìm một nút "mọi loại" riêng. Dựng bằng `fieldset` + `legend` để
 * trình đọc màn hình đọc nhóm như MỘT câu hỏi có ba đáp án.
 */
function NhomTichLoaiKhach({
  id,
  giaTri,
  doi,
}: {
  id: string;
  giaTri: number[];
  doi: (v: number[]) => void;
}) {
  const bat = (l: number, co: boolean) =>
    doi(co ? [...giaTri, l].sort((a, b) => a - b) : giaTri.filter((x) => x !== l));
  return (
    <fieldset className="nhom-tich" aria-describedby={`${id}-ghi`}>
      <legend>Loại khách hàng</legend>
      <div className="nhom-tich-lua-chon">
        {LOAI_KHACH_HANG.map((l) => (
          <label key={l} className="the-tich">
            <input
              type="checkbox"
              id={`${id}-${l}`}
              checked={giaTri.includes(l)}
              onChange={(e) => bat(l, e.target.checked)}
            />
            <span>{nhanLoaiKhach(l)}</span>
          </label>
        ))}
      </div>
      <p className="ghi-chu" id={`${id}-ghi`} role="status">
        Áp dụng cho <strong>{tomTatLoaiKhach(giaTri)}</strong>.
        {giaTri.length === 0 && ' Không tích loại nào nghĩa là mọi loại.'}
        {giaTri.length >= LOAI_KHACH_HANG.length && ' Tích đủ cả ba loại cũng là mọi loại.'}
      </p>
    </fieldset>
  );
}

/**
 * Sửa ngưỡng, ngày hiệu lực VÀ HAI ô phạm vi (`0279`, đảo `0028`).
 *
 * `0028` giữ nhóm · loại khách ở dạng chữ vì đổi chúng là đổi `specificity`, tức
 * thứ tự ưu tiên giữa các dòng cùng khớp (`CAT-11`). Khách hàng muốn sửa tại chỗ
 * thay vì xoá rồi khai lại — hậu quả ấy giờ được NÓI RA ở ghi chú dưới hai ô.
 *
 * Loại khách là ô tích giống hộp *Thêm* (`0280`: một quy định mang TẬP loại khách).
 */
function HopThoaiSuaQuyDinh({
  q,
  nhom,
  dong,
  xong,
}: {
  q: QuyDinhChietKhau;
  nhom: NhomSanPham[];
  dong: () => void;
  xong: () => void;
}) {
  const { bao } = useBaoLoi();
  const [nguong, datNguong] = useState(phanTramTuNguong(q.thresholdRate2));
  // Ô ngày chỉ nhận `yyyy-mm-dd`. Máy chủ trả về `date` của Postgres, mà `pg`
  // dựng nó thành chuỗi ISO có cả phần giờ — cắt lấy mười ký tự đầu, nếu không
  // ô ngày mở ra RỖNG và người dùng tưởng dữ liệu hỏng.
  //
  // `0208` — `ngayTuIso` cũng cắt được phần giờ, nhưng lượt cắt ở đây vẫn cần:
  // `tuNgay` là thứ gửi lên máy chủ, không chỉ là thứ bày ra màn hình.
  const [tuNgay, datTuNgay] = useState(String(q.effectiveFrom).slice(0, 10));
  const [maNhom, datMaNhom] = useState(q.productGroupCode ?? '');
  const [loaiKhach, datLoaiKhach] = useState<number[]>(q.customerTypes ?? []);
  const [dangGui, datDangGui] = useState(false);

  const n = doiSoThapPhan(nguong);
  const hopLe = nguong !== '' && Number.isFinite(n) && n >= 0 && n <= 100 && tuNgay !== '';

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datDangGui(true);
    try {
      // LUÔN gửi cả hai khoá phạm vi: ở máy chủ, vắng khoá là giữ nguyên còn
      // rỗng là "mọi giá trị" — biểu mẫu này trình bày đủ hai ô nên gửi đủ.
      await va(`/catalog/discount-rules/${encodeURIComponent(q.code)}`, {
        thresholdRate2: nguongTuPhanTram(nguong),
        effectiveFrom: tuNgay,
        productGroupCode: maNhom,
        customerTypes: loaiKhach,
      });
      xong();
    } catch (err) {
      bao(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe="Sửa quy định chiết khấu" dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        <p className="ghi-chu">
          Mã <strong>{q.code}</strong> <strong>không sửa được</strong> — hồ sơ đã lập ghi lại mã này.
        </p>

        <Truong id="ck-sua-nhom" nhan="Nhóm sản phẩm">
          {(p) => (
            <ChonCoGo
              {...p}
              giaTri={maNhom}
              doi={datMaNhom}
              mucRong="— Mọi nhóm —"
              ds={[
                // Nhóm của quy định có thể không còn trong danh sách (đã xoá): thêm thẳng một mục,
                // kẻo ô rơi về "Mọi nhóm" và lượt Lưu tiếp theo âm thầm nới phạm vi.
                ...(q.productGroupCode && !nhom.some((x) => x.code === q.productGroupCode)
                  ? [{ gia: q.productGroupCode, nhan: q.productGroupCode }]
                  : []),
                ...nhom.map((x) => ({ gia: x.code, nhan: `${x.name} (${x.code})` })),
              ]}
            />
          )}
        </Truong>

        <NhomTichLoaiKhach id="ck-sua-loai" giaTri={loaiKhach} doi={datLoaiKhach} />
        <p className="ghi-chu">
          Đổi nhóm hoặc loại khách là đổi <strong>thứ tự ưu tiên</strong> (cụ thể hơn thì thắng).
          Trùng phạm vi và ngày với quy định khác thì hệ thống từ chối.
        </p>

        <Truong
          id="ck-sua-nguong"
          nhan="Ngưỡng chiết khấu" donVi="phần trăm, hai chữ số thập phân"
          bắtBuộc
          loi={nguong !== '' && !hopLe ? 'Nhập một số từ 0 đến 100.' : undefined}
        >
          {(p) => <ONhapPhanTram {...p} giaTri={nguong} doi={datNguong} />}
        </Truong>

        <Truong id="ck-sua-tu" nhan="Hiệu lực từ" bắtBuộc>
          {(p) => (
            <ONhapNgay {...p} giaTri={tuNgay} doi={datTuNgay} />
          )}
        </Truong>
        <p className="ghi-chu">
          Sửa <strong>không</strong> làm đổi hồ sơ đã lập: mỗi dòng hồ sơ giữ ngưỡng đã chụp lúc
          lập.
        </p>

        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || !hopLe}>
            {dangGui ? 'Đang lưu…' : 'Lưu'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}

function HopThoaiTaoQuyDinh({
  nhom,
  dong,
  xong,
}: {
  nhom: NhomSanPham[];
  dong: () => void;
  xong: () => void;
}) {
  const { bao } = useBaoLoi();
  const [ma, datMa] = useState('');
  const [maNhom, datMaNhom] = useState('');
  const [loaiKhach, datLoaiKhach] = useState<number[]>([]);
  /*
   * `homNayVN()` chứ KHÔNG `new Date().toISOString().slice(0, 10)` (`0208`).
   *
   * Bản cũ lấy ngày theo giờ UTC, nên **từ 00:00 tới 07:00 giờ Việt Nam nó điền
   * sẵn NGÀY HÔM QUA** — và không có gì đỏ, vì ngày hôm qua cũng là một ngày
   * hợp lệ. Đúng lớp lỗi `0128` đã đo: `current_date` của Postgres theo giờ Việt
   * Nam, `toISOString()` theo UTC, hai bên lệch nhau đúng khung giờ ấy.
   */
  const [tuNgay, datTuNgay] = useState(() => homNayVN());
  const [nguong, datNguong] = useState('');
  const [dangGui, datDangGui] = useState(false);

  const n = doiSoThapPhan(nguong);
  const thieu = thieuTruong('chiet-khau', {
    code: ma,
    effectiveFrom: tuNgay,
    thresholdRate2: nguong,
  });
  const hopLe = thieu.length === 0 && Number.isFinite(n) && n >= 0 && n <= 100;

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datDangGui(true);
    try {
      await dang('/catalog/discount-rules', {
        code: ma.trim(),
        ...(maNhom ? { productGroupCode: maNhom } : {}),
        customerTypes: loaiKhach,
        effectiveFrom: tuNgay,
        thresholdRate2: nguongTuPhanTram(nguong),
      });
      xong();
    } catch (err) {
      bao(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe="Thêm quy định chiết khấu" dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        {/* MÃ đứng đầu biểu mẫu vì nó là thứ người dùng sẽ nhìn thấy lại: cột
            *Id* ở bảng này, cột *QĐCK* trên từng dòng hồ sơ, và là thứ họ gõ vào
            ô tìm kiếm. Đặt cuối thì nó trông như một trường phụ. */}
        <Truong id="ck-ma" nhan="Mã quy định" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              autoComplete="off"
              placeholder="VD: CK-SUA-L1"
              value={ma}
              onChange={(e) => datMa(e.target.value)}
            />
          )}
        </Truong>
        <p className="ghi-chu">
          Mã <strong>không sửa được sau khi tạo</strong> và không phân biệt hoa thường (
          <code>CK-01</code> = <code>ck-01</code>).
        </p>

        <Truong id="ck-nhom" nhan="Nhóm sản phẩm">
          {(p) => (
            <ChonCoGo {...p} giaTri={maNhom} doi={datMaNhom} mucRong="— Mọi nhóm —" ds={nhom.map((x) => ({ gia: x.code, nhan: `${x.name} (${x.code})` }))} />
          )}
        </Truong>

        <NhomTichLoaiKhach id="ck-loai" giaTri={loaiKhach} doi={datLoaiKhach} />
        <p className="ghi-chu">
          Để trống nhóm hoặc loại khách là áp cho mọi giá trị; điền cả hai thì quy định{' '}
          <strong>cụ thể hơn</strong> và thắng khi nhiều dòng cùng khớp.
        </p>

        <Truong
          id="ck-nguong"
          nhan="Ngưỡng chiết khấu" donVi="phần trăm, hai chữ số thập phân"
          bắtBuộc
          loi={nguong !== '' && !hopLe ? 'Nhập một số từ 0 đến 100.' : undefined}
        >
          {(p) => <ONhapPhanTram {...p} giaTri={nguong} doi={datNguong} />}
        </Truong>

        <Truong id="ck-tu" nhan="Hiệu lực từ" bắtBuộc>
          {(p) => (
            <ONhapNgay {...p} giaTri={tuNgay} doi={datTuNgay} />
          )}
        </Truong>
        <p className="ghi-chu">
          <strong>Vô thời hạn</strong> kể từ ngày trên. Muốn dừng thì xoá dòng, hoặc khai một dòng
          cụ thể hơn đè lên.
        </p>

        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || !hopLe}>
            {dangGui ? 'Đang tạo…' : 'Tạo'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}
