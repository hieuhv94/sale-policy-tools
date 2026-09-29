/**
 * Thẻ Sản phẩm: tạo, sửa, đặt giá, nhập từ Excel.
 *
 * Giá là phần dễ làm sai nhất ở đây. Giá KHÔNG phải một ô trên sản phẩm — nó là
 * một chuỗi dòng có ngày hiệu lực, và giá hiện hành là dòng mới nhất có ngày
 * KHÔNG ở tương lai (`CAT-05`). Nên màn hình không có ô "sửa giá"; nó có nút
 * "Đặt giá mới", và bảng lịch sử để thấy giá nào áp dụng từ bao giờ.
 */
import { useEffect, useState } from 'react';
import { dang, guiTep, layJson, taiVe, va } from '../../lib/api.js';
import { homNayVN, ngay, ngayGio, tien } from '../../lib/format.js';
import {
  NHAN_LOAI_GIA,
  NHAN_TRANG_THAI_SAN_PHAM,
  TRANG_THAI_SAN_PHAM,
  type DongGia,
  type NhomSanPham,
  type SanPham,
  type TrangThaiSanPham,
} from '../../lib/danh-muc.js';
import {
  BaoLoi,
  ChuThichBatBuoc,
  DangTai,
  HopThoai,
  NhanSanPham,
  ONhapTien,
  OTimKiem,
  Trong,
  Truong,
} from '../Chung.js';
import { thieuTruong } from '../../lib/bat-buoc.js';
import { PhanTrang } from '../PhanTrang.js';
import { useTrangMay } from '../../lib/phan-trang.js';
import { useBaoLoi } from '../../lib/bao-loi.js';

export function TheSanPham({ nhom }: { nhom: NhomSanPham[] }) {
  const [tim, datTim] = useState('');
  const [locNhom, datLocNhom] = useState('');
  const [mo, datMo] = useState<
    { kieu: 'tao' } | { kieu: 'sua'; sp: SanPham } | { kieu: 'excel' } | null
  >(null);

  /*
   * TÌM VÀ LỌC Ở MÁY CHỦ, nên phân trang cũng ở máy chủ (`0049`).
   *
   * Trước đó màn hình lấy 200 dòng đầu rồi lọc bằng `locSanPham` ngay trên trình
   * duyệt. Chú thích cũ ở chỗ này lập luận rằng cắt ở máy chủ sẽ biến ô tìm
   * thành "tìm trong 20 dòng đang hiện" — đúng với một máy chủ KHÔNG biết tìm,
   * và đó mới là chỗ phải sửa. Giờ `?q=` và `?groupCode=` chạy trên toàn bảng,
   * máy chủ trả về đúng một trang, và ô tìm phủ mọi sản phẩm chứ không phải 200
   * dòng đầu (muc 11.3).
   *
   * Đổi từ khoá hay đổi nhóm là đổi `duongCoSo`, và `useTrangMay` tự đưa về
   * trang 1 — luật "đổi bộ lọc thì về trang 1" của muc 11.3, không phải nhớ làm.
   */
  const truyVan = new URLSearchParams();
  if (tim.trim() !== '') truyVan.set('q', tim.trim());
  if (locNhom !== '') truyVan.set('groupCode', locNhom);
  const duoi = truyVan.toString();

  const {
    muc: ds,
    tong,
    loi,
    trang,
    soTrang,
    doiTrang,
    taiLai,
  } = useTrangMay<SanPham>(`/catalog/products${duoi ? `?${duoi}` : ''}`);

  /** Có đang lọc gì không — quyết định câu nói khi bảng rỗng. */
  const dangLoc = tim.trim() !== '' || locNhom !== '';

  if (loi !== null && ds === null) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (!ds) return <DangTai />;

  const dong = () => datMo(null);
  const xong = () => {
    datMo(null);
    taiLai();
  };

  return (
    <>
      {/* Góc trên bên phải của THẺ (`0071`): tiêu đề trang bị dải thẻ ngăn cách,
          nên hàng thao tác đứng ngay đầu phần nội dung mà nó tác động. */}
      <div className="hang-thao-tac">
        <button type="button" className="nut nut-nhe" onClick={() => datMo({ kieu: 'excel' })}>
          Nhập từ Excel
        </button>
        <button
          type="button"
          className="nut nut-chinh"
          disabled={nhom.length === 0}
          onClick={() => datMo({ kieu: 'tao' })}
        >
          Thêm sản phẩm
        </button>
      </div>

      {nhom.length === 0 && (
        <p className="giai-thich">
          Chưa có nhóm sản phẩm nào. Mỗi sản phẩm phải thuộc một nhóm — tạo nhóm ở thẻ{' '}
          <strong>Nhóm sản phẩm</strong> trước.
        </p>
      )}

      {loi !== null && <BaoLoi loi={loi} thuLai={taiLai} />}

      <div className="hang-tim">
        <OTimKiem
          id="tim-san-pham-qt"
          // Nhãn nói ĐÚNG phạm vi tìm. Ô này không khớp mã vật tư nữa, và một ô
          // tìm im lặng về phạm vi của nó là ô tìm khiến người dùng kết luận sai
          // rằng sản phẩm không tồn tại.
          nhan="Tìm theo tên sản phẩm"
          giaTri={tim}
          doi={datTim}
        />
        <Truong id="loc-nhom-sp" nhan="Nhóm sản phẩm">
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={locNhom}
              onChange={(e) => datLocNhom(e.target.value)}
            >
              <option value="">— Mọi nhóm —</option>
              {nhom.map((x) => (
                <option key={x.id} value={x.code}>
                  {x.name} ({x.code})
                </option>
              ))}
            </select>
          )}
        </Truong>
        {dangLoc && (
          <span className="ghi-chu" role="status">
            {tong} sản phẩm khớp
          </span>
        )}
      </div>

      {ds.length === 0 ? (
        dangLoc ? (
          <Trong
            tieuDe="Không có sản phẩm nào khớp"
            moTa="Ô tìm chỉ khớp TÊN sản phẩm, không khớp mã vật tư. Thử bỏ bớt chữ, hoặc mở lại nhóm về “Mọi nhóm”."
          />
        ) : (
          <Trong tieuDe="Danh mục chưa có sản phẩm nào" />
        )
      ) : (
        <div className="khung-cuon" role="region" aria-label="Danh mục sản phẩm" tabIndex={0}>
          <table className="bang">
            <thead>
              <tr>
                <th>Mã vật tư</th>
                <th>Tên sản phẩm</th>
                <th>Nhóm</th>
                <th className="so">Giá bán Công ty</th>
                <th>Trạng thái</th>
                {/* Tiêu đề KHÔNG hiện ra mắt (`0132`), nhưng vẫn phải có: một
                    `<th>` rỗng thì trình đọc màn hình đọc ô nút là "cột trống",
                    và người dùng bàn phím không biết mình vừa Tab vào đâu. */}
                <th>
                  <span className="chi-doc-man-hinh">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ds.map((s) => (
                <tr key={s.id}>
                  <td className="ma-phu">{s.code}</td>
                  <td>{s.name}</td>
                  <td>{s.groupCode}</td>
                  {/* Dấu gạch, không phải ô trống: dữ liệu cũ có sản phẩm chưa
                      từng đặt giá, và một ô rỗng đọc như một lỗi hiển thị. */}
                  <td className="so">{s.price === null ? '—' : tien(s.price)}</td>
                  <td>
                    <NhanSanPham trangThai={s.status} />
                  </td>
                  <td className="o-thao-tac-re-chuot">
                    {/* Chỉ còn MỘT nút (`0123`). Giá sửa ngay trong hộp thoại
                        Sửa, nên một nút riêng cho nó là chia đôi cùng một việc
                        thành hai chỗ bấm. */}
                    <button type="button" className="nut nut-nhe" onClick={() => datMo({ kieu: 'sua', sp: s })}>
                      Sửa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PhanTrang trang={trang} soTrang={soTrang} tong={tong} doiTrang={doiTrang} nhan="sản phẩm" />

      {mo?.kieu === 'tao' && <HopThoaiTao nhom={nhom} dong={dong} xong={xong} />}
      {mo?.kieu === 'sua' && <HopThoaiSua sp={mo.sp} nhom={nhom} dong={dong} xong={xong} />}
      {mo?.kieu === 'excel' && <HopThoaiExcel dong={dong} xong={xong} />}
    </>
  );
}

// --- Tạo ---------------------------------------------------------------------

function HopThoaiTao({
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
  const [ten, datTen] = useState('');
  const [maNhom, datMaNhom] = useState(nhom[0]?.code ?? '');
  const [gia, datGia] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await dang('/catalog/products', {
        code: ma.trim(),
        name: ten.trim(),
        groupCode: maNhom,
        price: gia,
      });
      xong();
    } catch (err) {
      bao(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe="Thêm sản phẩm" dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        <Truong id="sp-ma" nhan="Mã vật tư" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={ma} onChange={(e) => datMa(e.target.value)} />}
        </Truong>
        <Truong id="sp-ten" nhan="Tên sản phẩm" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={ten} onChange={(e) => datTen(e.target.value)} />}
        </Truong>
        {/*
          GIÁ NẰM NGAY TRONG BIỂU MẪU TẠO (`0123`).

          Trước đó giá là một bước riêng sau khi tạo, và hệ quả là sản phẩm sinh
          ra ở trạng thái không dùng được: nó hiện trong ô chọn lúc lập hồ sơ rồi
          chặn ở "chưa có giá" đúng lúc Trình dược viên đã gõ xong dòng.
        */}
        <Truong id="sp-nhom" nhan="Nhóm" bắtBuộc>
          {(p) => (
            <select {...p} className="o-nhap" value={maNhom} onChange={(e) => datMaNhom(e.target.value)}>
              {nhom.map((n) => (
                <option key={n.id} value={n.code}>
                  {n.name} ({n.code})
                </option>
              ))}
            </select>
          )}
        </Truong>
        <Truong id="sp-gia" nhan="Giá bán Công ty" bắtBuộc>
          {(p) => <ONhapTien {...p} giaTri={gia} doi={datGia} />}
        </Truong>
        <p className="ghi-chu">
          Giá áp dụng <strong>từ hôm nay</strong>. Đổi giá về sau ở nút <strong>Sửa</strong>; mỗi lần
          đổi là một dòng mới trong lịch sử giá, hồ sơ CSBH đã lập giữ nguyên giá đã đóng băng.
        </p>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button
            type="submit"
            className="nut nut-chinh"
            disabled={dangGui || ma.trim() === '' || ten.trim() === '' || gia.trim() === ''}
          >
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

// --- Sửa ---------------------------------------------------------------------

function HopThoaiSua({
  sp,
  nhom,
  dong,
  xong,
}: {
  sp: SanPham;
  nhom: NhomSanPham[];
  dong: () => void;
  xong: () => void;
}) {
  const { bao } = useBaoLoi();
  const [ten, datTen] = useState(sp.name);
  // `0238` — nhóm sửa được. Giá trị đầu là nhóm ĐANG có, kể cả khi danh sách
  // nhóm chưa tải xong: ô chọn thiếu mục ấy thì trình duyệt tự chọn mục đầu tiên
  // và một lượt Lưu chỉ để sửa tên sẽ lặng lẽ đổi nhóm (lối `0205`).
  const [maNhom, datMaNhom] = useState(sp.groupCode);
  const [trangThai, datTrangThai] = useState<TrangThaiSanPham>(sp.status);
  const [gia, datGia] = useState(sp.price ?? '');
  const [go, datGo] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  /*
   * GÕ LẠI MÃ Ở MỌI LƯỢT SỬA (`0123`), không riêng lượt vô hiệu hoá.
   *
   * `0036` chỉ đòi khi bật sang vô hiệu hoá, và lập luận lúc ấy là: bắt gõ cho
   * một thao tác hằng ngày thì làm mòn chính chốt chặn ấy. Lập luận đó đúng khi
   * màn hình này chỉ đổi được TÊN.
   *
   * Từ `0123` nó đổi được cả GIÁ — con số đóng băng vào mọi hồ sơ gửi duyệt kể
   * từ lúc ấy, cộng một dòng trong khối *Yêu cầu cập nhật* của mọi TDV đang giữ
   * CSBH chứa sản phẩm này. Không còn thao tác nhẹ nào ở đây để mà làm mòn.
   */
  const dangVoHieu = trangThai === 'DA_VO_HIEU_HOA' && sp.status !== 'DA_VO_HIEU_HOA';
  const doiGia = gia.trim() !== '' && gia.trim() !== (sp.price ?? '');
  const doiNhom = maNhom !== sp.groupCode;

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await va(`/catalog/products/${sp.id}`, {
        name: ten.trim(),
        status: trangThai,
        // Chỉ gửi khi ĐỔI: gửi lại đúng giá đang có thì máy chủ bỏ qua, nhưng
        // để giao diện quyết chuyện ấy là dựng chỗ thứ hai cho cùng một luật.
        ...(doiGia ? { price: gia.trim() } : {}),
        // Cùng lẽ với giá: chỉ gửi khi ĐỔI, để một lượt sửa tên không kéo theo một
        // dòng *"đổi nhóm"* rỗng trong nhật ký.
        ...(doiNhom ? { groupCode: maNhom } : {}),
        confirm: go.trim(),
      });
      xong();
    } catch (err) {
      bao(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe={`Sửa ${sp.code}`} dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        {/* Mã vật tư không sửa được — cùng lý do với mã khách hàng: hồ sơ cũ
            đóng băng mã sản phẩm, sửa mã là mọi hồ sơ cũ lặng lẽ trỏ sang thứ khác. */}
        <p className="ghi-chu">
          Mã vật tư <strong>{sp.code}</strong> không sửa được. Hồ sơ CSBH đã lập đóng băng mã này.
        </p>
        <Truong id="sp-sua-ten" nhan="Tên sản phẩm" bắtBuộc>
          {(p) => <input {...p} className="o-nhap" value={ten} onChange={(e) => datTen(e.target.value)} />}
        </Truong>
        {/*
          GIÁ SỬA NGAY TẠI ĐÂY (`0123`), thay cho nút *Giá* riêng ở từng dòng.

          Ngày áp dụng luôn là hôm nay — màn hình không còn ô chọn ngày. Đặt giá
          cho một ngày tương lai vẫn làm được qua API, nhưng lượt rà *Yêu cầu cập
          nhật* chạy NGAY lúc gọi, lúc giá mới chưa hiệu lực, và không có gì chạy
          lại vào ngày hiệu lực. Bỏ ô chọn ngày là bịt luôn lỗ ấy khỏi tay người
          dùng.
        */}
        <Truong id="sp-sua-gia" nhan="Giá bán Công ty" bắtBuộc>
          {(p) => <ONhapTien {...p} giaTri={gia} doi={datGia} />}
        </Truong>
        {doiGia && (
          <p className="ghi-chu">
            Giá mới áp dụng <strong>từ hôm nay</strong>. Hồ sơ CSBH đã gửi duyệt giữ nguyên giá đã
            đóng băng; hồ sơ <strong>đang có hiệu lực</strong> chứa sản phẩm này sẽ hiện trong khối{' '}
            <strong>Yêu cầu cập nhật</strong> của người phụ trách.
          </p>
        )}
        {/*
          NHÓM SỬA ĐƯỢC (`0238`, khách hàng 29/09). Tới `0237` nhóm cố định từ
          lúc tạo. Nhóm là thứ quy định chiết khấu khai theo, nên câu hậu quả nói
          đúng điều ấy — cùng chỗ đứng với câu của ô giá ngay trên.
        */}
        <Truong id="sp-sua-nhom" nhan="Nhóm" bắtBuộc>
          {(p) => (
            <select {...p} className="o-nhap" value={maNhom} onChange={(e) => datMaNhom(e.target.value)}>
              {!nhom.some((n) => n.code === sp.groupCode) && (
                <option value={sp.groupCode}>{sp.groupCode}</option>
              )}
              {nhom.map((n) => (
                <option key={n.id} value={n.code}>
                  {n.name} ({n.code})
                </option>
              ))}
            </select>
          )}
        </Truong>
        {doiNhom && (
          <p className="ghi-chu">
            Đổi nhóm là đổi <strong>quy định chiết khấu</strong> áp cho sản phẩm này. Hồ sơ CSBH chứa
            sản phẩm mà ngưỡng hoặc quy định khác đi sẽ hiện trong khối{' '}
            <strong>Yêu cầu cập nhật</strong> của người phụ trách.
          </p>
        )}
        <Truong id="sp-sua-tt" nhan="Trạng thái">
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={trangThai}
              onChange={(e) => datTrangThai(e.target.value as TrangThaiSanPham)}
            >
              {TRANG_THAI_SAN_PHAM.map((t) => (
                <option key={t} value={t}>
                  {NHAN_TRANG_THAI_SAN_PHAM[t]}
                </option>
              ))}
            </select>
          )}
        </Truong>
        <p className="ghi-chu">
          Vô hiệu hoá chỉ chặn <strong>hồ sơ lập mới</strong>. Hồ sơ đã lập vẫn giữ nguyên sản phẩm
          và giá đã đóng băng.
        </p>

        {dangVoHieu && (
          /* Nói HẬU QUẢ THẬT thay vì một câu hỏi rỗng nghĩa: vô hiệu hoá một sản
             phẩm gỡ nó khỏi mọi hồ sơ lập mới, và người bấm nút cần biết điều đó
             TRƯỚC khi bấm. */
          <div className="hop-canh-bao" role="note">
            Mọi CSBH <strong>đang có hiệu lực</strong> còn chứa sản phẩm này sẽ hiện trong khối{' '}
            <strong>Yêu cầu cập nhật</strong> của người phụ trách. Sản phẩm cũng biến khỏi ô chọn
            khi lập hồ sơ mới.
          </div>
        )}

        <Truong id="sp-sua-xn" nhan={`Gõ lại mã "${sp.code}" để xác nhận`} bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              autoComplete="off"
              value={go}
              onChange={(e) => datGo(e.target.value)}
            />
          )}
        </Truong>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button
            type="submit"
            className="nut nut-chinh"
            disabled={
              dangGui ||
              ten.trim() === '' ||
              gia.trim() === '' ||
              go.trim().toUpperCase() !== sp.code.toUpperCase()
            }
          >
            {dangGui ? 'Đang lưu…' : 'Lưu'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>

      <LichSuGia id={sp.id} />
    </HopThoai>
  );
}

/**
 * Lịch sử giá của một sản phẩm (`0123`).
 *
 * Nằm TRONG hộp thoại Sửa, không phải một hộp thoại riêng: từ `0123` đổi giá là
 * một ô của biểu mẫu ấy, và lịch sử là thứ người ta đọc để quyết định gõ số nào.
 * Tách ra hai chỗ bấm thì phải mở hộp này, ghi nhớ con số, đóng lại, mở hộp kia.
 *
 * CHỈ ĐỌC. Đường ghi duy nhất là ô *Giá bán Công ty* ở trên, và nó luôn ghi cho
 * ngày hôm nay — nên bảng này không có nút nào.
 */
function LichSuGia({ id }: { id: string }) {
  const [ls, datLs] = useState<DongGia[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);

  useEffect(() => {
    const huy = new AbortController();
    layJson<DongGia[]>(`/catalog/products/${id}/prices`, huy.signal)
      .then(datLs)
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [id]);

  /*
   * ĐÁNH DẤU DÒNG ĐANG ÁP DỤNG (`0125`).
   *
   * Không có nó thì bảng này gây hiểu nhầm đúng theo cách khách hàng đã báo:
   * sản phẩm vừa tạo hiện MỘT dòng mang ngày hôm nay và đúng con số đang ở ô
   * giá ngay trên — đọc như thể mở hộp thoại ra là hệ thống tự ghi một lần đổi
   * giá, dù chưa ai bấm Lưu.
   *
   * Dòng ấy có thật và đúng: từ `0123` lượt tạo sản phẩm ghi luôn một dòng giá
   * cho ngày hôm nay. Thứ thiếu là câu trả lời cho *"dòng nào đang có hiệu
   * lực"* — và với danh mục chỉ còn một loại giá thì đó là dòng mới nhất có
   * ngày không ở tương lai, đúng luật của `currentPrice`.
   */
  const homNay = homNayVN();
  /*
   * Dòng ĐẦU TIÊN đã hiệu lực trong thứ tự MÁY CHỦ trả về, không tự sắp lại.
   *
   * Từ `0126` nhiều dòng dùng chung một ngày hiệu lực, và thứ phân xử giữa chúng
   * là cột `stt` — một con số giao diện không nhận được. Sắp lại ở đây theo
   * `effectiveFrom` thì hai dòng cùng ngày bằng nhau, `sort` giữ thứ tự nào tuỳ
   * bản trình duyệt, và nhãn *Đang áp dụng* rơi vào dòng nào cũng được.
   *
   * Máy chủ đã sắp đúng bằng `THU_TU_GIA_MOI_NHAT`; việc còn lại chỉ là bỏ qua
   * những dòng chưa tới ngày.
   */
  const dangApDung = (ls ?? []).find(
    (d) => d.priceType === 'GIA_BAN_CONG_TY' && d.effectiveFrom.slice(0, 10) <= homNay,
  );

  return (
    <>
      <h3 className="tieu-de-lich-su-gia">Lịch sử giá</h3>
      {loi !== null ? (
        <BaoLoi loi={loi} />
      ) : !ls ? (
        <DangTai />
      ) : ls.length === 0 ? (
        <p className="trong">Chưa đặt giá nào.</p>
      ) : (
        <>
          {ls.length === 1 && (
            /* MỘT dòng thì không có "lịch sử" nào để đọc — nói thẳng ra, thay vì
               để người dùng tự hỏi dòng ấy từ đâu ra. */
            <p className="ghi-chu">
              Sản phẩm này chưa đổi giá lần nào. Dòng dưới đây là giá đặt lúc tạo sản phẩm.
            </p>
          )}
          {/*
            KHUNG CUỘN DỌC, cao tối đa vài dòng (`0126`).

            Lịch sử chỉ dài ra chứ không bao giờ ngắn lại, và nó nằm ở CUỐI hộp
            thoại Sửa — dài quá thì ô gõ xác nhận và nút Lưu bị đẩy khỏi tầm
            nhìn, người dùng phải cuộn ngược lên để bấm. Cuộn trong chính khung
            này giữ hai thứ ấy đứng yên.
          */}
          <div
            className="khung-cuon khung-lich-su-gia"
            role="region"
            aria-label="Lịch sử giá"
            tabIndex={0}
          >
            <table className="bang bang-lech">
              <thead>
                <tr>
                  <th>Loại giá</th>
                  <th className="so">Số tiền</th>
                  <th>Áp dụng từ</th>
                  {/* Từ `0126` nhiều lần sửa dùng chung một ngày — chỉ hiện ngày
                      thì chúng trông y hệt nhau và không xếp được bằng mắt. */}
                  <th>Ghi lúc</th>
                </tr>
              </thead>
              <tbody>
                {ls.map((d, i) => (
                  <tr key={`${d.priceType}-${d.effectiveFrom}-${i}`}>
                    <td>{NHAN_LOAI_GIA[d.priceType] ?? d.priceType}</td>
                    <td className="so">{tien(d.amount)}</td>
                    <td>
                      {/*
                        Bọc trong một `<span>` chứ KHÔNG đặt `display: flex` thẳng
                        lên `<td>` (`0131`): một ô bảng nhận `display: flex` thì
                        thôi là ô bảng, trình duyệt bọc nó trong một ô ẩn, và bề
                        rộng của nó thôi tham gia phép chia cột — cột *Áp dụng từ*
                        lệch khỏi tiêu đề của chính nó.
                      */}
                      <span className="o-ngay-hieu-luc">
                        {ngay(d.effectiveFrom)}
                        {d === dangApDung && (
                          <span className="nhan nhan-hieu-luc">Đang áp dụng</span>
                        )}
                        {/* Ngày ở TƯƠNG LAI: chưa có tác dụng gì, và không nói ra
                            thì nó đọc y hệt dòng đang áp dụng. Chỉ đặt được qua
                            API — màn hình bỏ ô chọn ngày ở `0123`. */}
                        {d.effectiveFrom.slice(0, 10) > homNay && (
                          <span className="nhan nhan-nhap">Chưa hiệu lực</span>
                        )}
                      </span>
                    </td>
                    <td className="ma-phu">{ngayGio(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

// --- Nhập Excel --------------------------------------------------------------

/**
 * Nhập danh mục từ Excel — BA BƯỚC, không phải một cú bấm (`0121`).
 *
 *   chọn tệp → **xem trước** → gõ xác nhận rồi ghi đè
 *
 * Bước giữa mới là lý do cả màn hình này tồn tại. Lượt nhập GHI ĐÈ danh mục —
 * đổi tên, đổi nhóm, đổi giá của những sản phẩm đã có — nên nó là lượt ghi có
 * bán kính lớn nhất của phần mềm, và một file dán lệch cột trông y hệt một file
 * đúng cho tới lúc đã ghi xong.
 *
 * Bảng xem trước KHÔNG liệt kê nội dung file. Nó liệt kê **thay đổi**: thêm mới,
 * sửa gì (cũ → mới), và một con số cho phần không đổi. Một bảng 500 dòng giống
 * hệt nhau thì không ai đọc — người dùng bấm Đồng ý mà không nhìn, và bước xem
 * trước thành một nút Tiếp theo có trang trí.
 *
 * Máy chủ kiểm LẠI từ đầu lúc ghi. Kết quả xem trước là ảnh chụp: giữa hai lượt,
 * ai đó có thể vừa thêm một sản phẩm hoặc đổi một cái giá.
 */

type ODoi = { truoc: string | null; sau: string };

type DongSua = {
  rowNumber: number;
  code: string;
  ten?: ODoi;
  nhom?: ODoi;
  gia?: ODoi;
  canhBaoGia?: number;
};

type DoiTrangThai = { code: string; name: string; lyDo: 'O_CHON' | 'VANG_MAT' };

type KeHoach = {
  themMoi: {
    rowNumber: number;
    code: string;
    name: string;
    groupCode: string;
    price: string | null;
    conBan: boolean;
  }[];
  sua: DongSua[];
  ngungBan: DoiTrangThai[];
  banLai: DoiTrangThai[];
  khongDoi: number;
};

/** Người dùng phải gõ đúng chuỗi này. Máy chủ kiểm lại, đây chỉ là ô nhập. */
const CHUOI_XAC_NHAN = 'GHI DE';

function HopThoaiExcel({ dong, xong }: { dong: () => void; xong: () => void }) {
  const { bao } = useBaoLoi();
  const [tep, datTep] = useState<File | null>(null);
  const [ke, datKe] = useState<KeHoach | null>(null);
  const [goLai, datGoLai] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangChay, datDangChay] = useState(false);
  const [dangTaiMau, datDangTaiMau] = useState(false);

  /*
   * Tải qua `taiVe()`, KHÔNG phải một thẻ `<a href>` (`0119`).
   *
   * Đường này nằm sau `@Roles('QUAN_TRI')`, mà thẻ neo không gửi header
   * `Authorization` — nó sẽ nhận 401 và trình duyệt hiện một trang lỗi thay vì
   * tải file. Đúng cái bẫy mà `NutXuatExcel` đã dính một lần và `taiVe` sinh ra
   * để bịt.
   */
  const taiMau = () => {
    datDangTaiMau(true);
    taiVe('/catalog/products/import/mau', 'mau-danh-muc-san-pham.xlsx')
      .catch(bao)
      .finally(() => datDangTaiMau(false));
  };

  const goiVoiTep = async <T,>(duong: string, them?: Record<string, string>): Promise<T> => {
    const form = new FormData();
    form.append('file', tep!);
    for (const [k, v] of Object.entries(them ?? {})) form.append(k, v);
    return guiTep<T>(duong, form);
  };

  /*
   * Lỗi của lượt XEM TRƯỚC hiện NGAY TRONG hộp thoại, không qua `bao()`.
   *
   * Sáu mã lỗi của lượt nhập mang theo danh sách dòng hỏng, và người dùng cần
   * đọc danh sách ấy trong lúc file Excel đang mở ở cửa sổ bên cạnh. Một hộp
   * thoại lỗi đè lên hộp thoại này thì đóng nó đi là mất luôn danh sách.
   */
  const xemTruoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tep) return;
    datLoi(null);
    datDangChay(true);
    try {
      datKe(await goiVoiTep<KeHoach>('/catalog/products/import/xem-truoc'));
    } catch (err) {
      datLoi(err);
    } finally {
      datDangChay(false);
    }
  };

  const ghiDe = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangChay(true);
    try {
      await goiVoiTep('/catalog/products/import', { confirm: goLai });
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangChay(false);
    }
  };

  /** Quay về bước chọn tệp — sửa file xong thì xem trước lại từ đầu. */
  const lamLai = () => {
    datKe(null);
    datGoLai('');
    datLoi(null);
  };

  if (ke) {
    /*
     * Hộp TO (`0129`). Bảng này là chỗ duy nhất người dùng đọc được lượt ghi đè
     * trước khi nó xảy ra, và mỗi dòng sửa mang cột *cũ → mới* — ở bề rộng hộp
     * thường thì một tên sản phẩm đủ dài xuống ba dòng, và so hai cột với nhau
     * thành việc dò theo con mắt chứ không phải nhìn một cái là thấy.
     */
    return (
      <HopThoai tieuDe="Xem trước thay đổi danh mục" co="to" dong={dong}>
        <form onSubmit={ghiDe}>
          <BangXemTruoc ke={ke} />

          <p className="giai-thich">
            Bấm <strong>Ghi đè</strong> thì {ke.themMoi.length + ke.sua.length} dòng được ghi
            {ke.ngungBan.length > 0 && (
              <>
                {' '}
                và <strong>{ke.ngungBan.length} sản phẩm chuyển sang ngừng bán</strong>
              </>
            )}
            , trong <strong>một lượt</strong> — hỏng ở giữa thì không dòng nào được ghi. Danh mục
            hiện tại <strong>không lùi lại được</strong> sau khi ghi; muốn giữ một bản thì tải file
            mẫu về trước.
          </p>

          <Truong id="excel-xac-nhan" nhan={`Gõ "${CHUOI_XAC_NHAN}" để xác nhận`} bắtBuộc>
            {(p) => (
              <input
                {...p}
                className="o-nhap"
                autoComplete="off"
                value={goLai}
                onChange={(e) => datGoLai(e.target.value)}
              />
            )}
          </Truong>

          {loi !== null && <BaoLoi loi={loi} />}
          <div className="nhom-nut">
            <button
              type="submit"
              className="nut nut-canh-bao"
              disabled={dangChay || goLai.trim().toUpperCase() !== CHUOI_XAC_NHAN}
            >
              {dangChay ? 'Đang ghi…' : 'Ghi đè danh mục'}
            </button>
            <button type="button" className="nut nut-nhe" onClick={lamLai}>
              Chọn tệp khác
            </button>
            {/* `0237` — hộp DUY NHẤT tới lúc ấy không có nút đóng: *Chọn tệp khác*
                chỉ lùi về bước chọn tệp, và thoát hẳn phải nhờ bấm ra ngoài — đường
                vừa bị bỏ. */}
            <button type="button" className="nut nut-nhe" onClick={dong}>
              Huỷ
            </button>
          </div>
        </form>
      </HopThoai>
    );
  }

  return (
    <HopThoai tieuDe="Nhập sản phẩm từ Excel" dong={dong}>
      <form onSubmit={xemTruoc}>
        <ChuThichBatBuoc />

        <p className="ghi-chu">
          File cần đủ <strong>5 cột</strong>: mã vật tư, tên sản phẩm, mã nhóm, giá bán Công ty, và{' '}
          <em>đang có hiệu lực</em>. Ô cột cuối là <strong>ô chọn</strong> — bấm vào để xổ{' '}
          <em>Đang bán</em> / <em>Ngừng bán</em>, không được để trống.
        </p>

        {/*
          FILE MẪU tải ngay tại đây (`0119`), và là một NÚT (`0120`).

          Nút nằm TRONG hộp thoại chứ không ở thanh công cụ của trang: người ta
          nghĩ tới file mẫu đúng vào lúc chuẩn bị nhập, không phải lúc đang xem
          danh sách. Và nó đứng TRƯỚC ô chọn tệp, theo đúng thứ tự việc phải làm:
          tải file về, sửa, rồi mới chọn lên.
        */}
        <div className="nhom-nut">
          <button type="button" className="nut nut-nhe" disabled={dangTaiMau} onClick={taiMau}>
            {dangTaiMau ? 'Đang tải…' : 'Tải file mẫu'}
          </button>
        </div>

        <p className="giai-thich">
          File mẫu chứa <strong>toàn bộ danh mục hiện tại</strong> kèm giá và trạng thái. Sửa ngay
          trên đó rồi tải lên. <strong>Bỏ một dòng khỏi file nghĩa là ngừng bán sản phẩm ấy</strong>{' '}
          — muốn ngừng bán thì nên đổi ô <em>Đang có hiệu lực</em> cho rõ ràng, và bảng xem trước
          liệt kê cả hai đường trước khi ghi.
        </p>
        <p className="giai-thich">
          Ô <strong>giá để trống</strong> nghĩa là giữ nguyên giá cũ. Giá có điền thì áp dụng{' '}
          <strong>từ hôm nay</strong>. Muốn ngừng bán một sản phẩm thì làm trên bảng danh mục, không
          phải bằng cách bỏ dòng khỏi file.
        </p>

        <Truong id="excel-tep" nhan="Tệp Excel" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => datTep(e.target.files?.[0] ?? null)}
            />
          )}
        </Truong>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangChay || tep === null}>
            {dangChay ? 'Đang kiểm…' : 'Xem trước'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}

/** Một ô đổi giá trị, dạng *cũ → mới*. Ô chưa từng có giá trị thì hiện dấu gạch. */
function Doi({ o, tienTe = false }: { o: ODoi; tienTe?: boolean }) {
  const ve = (x: string | null) => (x === null ? '—' : tienTe ? tien(x) : x);
  return (
    <>
      <span className="gia-tri-cu">{ve(o.truoc)}</span> <span aria-hidden="true">→</span>{' '}
      <strong>{ve(o.sau)}</strong>
    </>
  );
}

/**
 * Bảng xem trước — ba khối, mỗi khối có số đếm ở tiêu đề.
 *
 * Khối *Không đổi* chỉ có một con số. Vẽ ra 400 dòng y nguyên là đẩy phần đáng
 * đọc xuống dưới màn hình thứ ba.
 */
function BangXemTruoc({ ke }: { ke: KeHoach }) {
  const canhBao = ke.sua.filter((d) => d.canhBaoGia !== undefined);

  return (
    <>
      <p className="ghi-chu">
        <strong>{ke.themMoi.length}</strong> thêm mới · <strong>{ke.sua.length}</strong> sửa ·{' '}
        <strong>{ke.khongDoi}</strong> không đổi
      </p>

      {canhBao.length > 0 && (
        /*
          CẢNH BÁO GIÁ LỆCH LỚN, đứng TRÊN cả hai bảng.

          Gõ thừa một số 0 trong Excel là chuyện thường, và sau khi ghi đè thì
          không có đường lùi nào ngoài phục hồi từ bản sao lưu. Đây là thứ duy
          nhất trên màn hình này đáng để người dùng dừng lại nhìn.
        */
        <p className="hop-canh-bao" role="alert">
          <strong className="hop-tieu-de">{canhBao.length} sản phẩm đổi giá quá 50%</strong>
          {canhBao
            .slice(0, 5)
            .map((d) => d.code)
            .join(', ')}
          {canhBao.length > 5 ? ` và ${canhBao.length - 5} mã nữa` : ''}. Kiểm lại trước khi ghi —
          gõ thừa một số 0 là chuyện thường, và ghi xong thì không lùi lại được.
        </p>
      )}

      {ke.themMoi.length > 0 && (
        <>
          <h3 className="tieu-de-nhom-xem-truoc">Thêm mới ({ke.themMoi.length})</h3>
          <div className="khung-cuon" role="region" aria-label="Sản phẩm thêm mới" tabIndex={0}>
            <table className="bang">
              <thead>
                <tr>
                  <th>Dòng</th>
                  <th>Mã vật tư</th>
                  <th>Tên sản phẩm</th>
                  <th>Nhóm</th>
                  <th className="so">Giá</th>
                </tr>
              </thead>
              <tbody>
                {ke.themMoi.map((d) => (
                  <tr key={d.code}>
                    <td className="so">{d.rowNumber}</td>
                    <td className="ma-phu">{d.code}</td>
                    <td>{d.name}</td>
                    <td>{d.groupCode}</td>
                    <td className="so">{d.price === null ? '—' : tien(d.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {ke.sua.length > 0 && (
        <>
          <h3 className="tieu-de-nhom-xem-truoc">Sửa ({ke.sua.length})</h3>
          <div className="khung-cuon" role="region" aria-label="Sản phẩm được sửa" tabIndex={0}>
            <table className="bang">
              <thead>
                <tr>
                  <th>Dòng</th>
                  <th>Mã vật tư</th>
                  <th>Tên sản phẩm</th>
                  <th>Nhóm</th>
                  <th>Giá</th>
                </tr>
              </thead>
              <tbody>
                {ke.sua.map((d) => (
                  <tr key={d.code} className={d.canhBaoGia === undefined ? undefined : 'dong-lech'}>
                    <td className="so">{d.rowNumber}</td>
                    <td className="ma-phu">{d.code}</td>
                    {/* Ô KHÔNG đổi để trống hẳn — chỉ vẽ thứ sắp thay đổi. */}
                    <td>{d.ten ? <Doi o={d.ten} /> : null}</td>
                    <td>{d.nhom ? <Doi o={d.nhom} /> : null}</td>
                    <td>{d.gia ? <Doi o={d.gia} tienTe /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/*
        HAI KHỐI NGỪNG BÁN, TÁCH THEO LÝ DO (`0122`).

        `O_CHON` là câu khẳng định của người soạn file. `VANG_MAT` là suy ra từ
        sự vắng mặt — mà một dòng biến mất vì lọc rồi chép phần đang hiện, vì sắp
        xếp rồi xoá nhầm, hay vì dán đè một vùng ngắn hơn thì trông y hệt một
        quyết định ngừng bán. Gộp hai khối lại là bắt người duyệt tự đoán xem
        dòng nào là ý định của mình.

        LIỆT KÊ ĐỦ, không gấp lại như khối *Không đổi*: đây là phần phá huỷ.
      */}
      <KhoiNgungBan
        ds={ke.ngungBan.filter((d) => d.lyDo === 'O_CHON')}
        tieuDe="Ngừng bán — bạn chọn trong file"
        moTa='Ô "Đang có hiệu lực" của những dòng này ghi Ngừng bán.'
      />
      <KhoiNgungBan
        ds={ke.ngungBan.filter((d) => d.lyDo === 'VANG_MAT')}
        tieuDe="Ngừng bán — vắng mặt trong file"
        moTa="Những mã này đang có trong danh mục nhưng KHÔNG có dòng nào trong file. Nếu bạn không cố ý bỏ chúng đi, hãy huỷ và kiểm lại file."
      />

      {ke.banLai.length > 0 && (
        <>
          <h3 className="tieu-de-nhom-xem-truoc">Bán lại ({ke.banLai.length})</h3>
          <p className="ghi-chu">
            {ke.banLai.map((d) => `${d.code} — ${d.name}`).join(' · ')}
          </p>
        </>
      )}

      {ke.themMoi.length === 0 &&
        ke.sua.length === 0 &&
        ke.ngungBan.length === 0 &&
        ke.banLai.length === 0 && (
          <p className="giai-thich">
            File khớp hoàn toàn với danh mục hiện tại — không có gì để ghi.
          </p>
        )}
    </>
  );
}

/** Một khối ngừng bán. Rỗng thì không vẽ gì — không có "0 sản phẩm" nào cả. */
function KhoiNgungBan({
  ds,
  tieuDe,
  moTa,
}: {
  ds: DoiTrangThai[];
  tieuDe: string;
  moTa: string;
}) {
  if (ds.length === 0) return null;
  return (
    <div className="hop-canh-bao" role="alert">
      <strong className="hop-tieu-de">
        {tieuDe} ({ds.length})
      </strong>
      <p className="ghi-chu">{moTa}</p>
      <div className="khung-cuon" role="region" aria-label={tieuDe} tabIndex={0}>
        <table className="bang bang-lech">
          <thead>
            <tr>
              <th>Mã vật tư</th>
              <th>Tên sản phẩm</th>
            </tr>
          </thead>
          <tbody>
            {ds.map((d) => (
              <tr key={d.code}>
                <td className="ma-phu">{d.code}</td>
                <td>{d.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
