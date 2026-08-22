/**
 * *Thống kê* — hoạt động theo tuần · tháng · quý · năm (`0093`).
 *
 * ĐỔI TÊN TỪ *Báo cáo*, và đổi cả nội dung (chốt 22/08). Bản cũ bày bốn ô đếm,
 * một biểu đồ thanh theo trạng thái và một khối SLA — tức là bày lại đúng những
 * con số của trang *Tổng quan* dưới một cái tên khác. Người dùng mở nó ra sau
 * khi vừa xem Tổng quan thì không thấy gì mới, nên lần sau họ không mở nữa.
 *
 * Trang này chỉ nói về DÒNG CHẢY TRONG KỲ: bao nhiêu hồ sơ đi qua từng bước
 * trong tuần vừa rồi, quý vừa rồi, và so với kỳ trước thì nhanh hơn hay chậm đi.
 * Không con số nào ở đây trả lời "bây giờ đang có bao nhiêu hồ sơ chờ" — câu ấy
 * ở Tổng quan, và để nó ở đúng một chỗ là cách duy nhất để hai chỗ không lệch
 * nhau.
 *
 * Màn hình không tự quyết gì: nó đọc bốn bảng tra ở `lib/thong-ke.ts`.
 */
import { useState } from 'react';
import { usePhien } from '../lib/auth.js';
import type { VaiTro } from '../lib/can.js';
import { ngay, tien, tyLe } from '../lib/format.js';
import {
  COT,
  COT_THEO_VAI_TRO,
  KHOI_CAN_SO_LIEU,
  KHOI_THEO_VAI_TRO,
  KY_MAC_DINH,
  LY_DO_KHONG_CO_SO,
  MOI_KY,
  NHAN_KY,
  soCua,
  THE_THEO_VAI_TRO,
  useHoatDong,
  useThongKe,
  useThongKeNhom,
  type BoHoatDong,
  type BoTheoNhom,
  type BoThongKe,
  type Ky,
  type TenKhoiTk,
} from '../lib/thong-ke.js';
import { Trong } from '../components/Chung.js';
import { Khoi, ViSaoKhongCoViec } from '../components/khoi/Khung.js';

export function ThongKe() {
  const { nguoiDung } = usePhien();
  const vaiTro = (nguoiDung?.role ?? '') as VaiTro;

  const khoi = KHOI_THEO_VAI_TRO[vaiTro] ?? [];
  const cot = COT_THEO_VAI_TRO[vaiTro] ?? [];
  const the = THE_THEO_VAI_TRO[vaiTro] ?? [];

  /*
   * Nhịp là TRẠNG THÁI CỦA MÀN HÌNH, không lưu xuống máy chủ.
   *
   * Bộ lọc của màn hình Hồ sơ có lưu (RPT-04) vì nó là một biểu mẫu chín ô mà
   * người ta điền công phu. Nhịp thống kê thì một cú bấm là đổi xong, và điểm
   * bắt đầu đúng đã có sẵn ở `KY_MAC_DINH` theo vai trò.
   */
  const [ky, datKy] = useState<Ky>(KY_MAC_DINH[vaiTro] ?? 'thang');

  const canSoLieu = khoi.some((k) => KHOI_CAN_SO_LIEU.includes(k));
  const { du: bo, loi } = useThongKe(ky, canSoLieu);
  const { du: nhom, loi: loiNhom } = useThongKeNhom(ky, khoi.includes('theo-nhom'));
  const { du: hoatDong, loi: loiHoatDong } = useHoatDong(ky, khoi.includes('hoat-dong'));

  const veKhoi = (ten: TenKhoiTk) => {
    switch (ten) {
      // Dựng riêng ở trên, trước bộ chọn nhịp — xem chỗ gọi.
      case 'vi-sao-khong-co-so':
        return null;

      case 'so-sanh':
        return (
          <Khoi key={ten} tieuDe="Kỳ này so với kỳ trước" loi={loi} dangTai={bo === null}>
            {bo && <SoSanh bo={bo} the={the} />}
          </Khoi>
        );

      case 'chuoi-ky':
        return (
          <Khoi key={ten} tieuDe={`Theo ${NHAN_KY[ky].toLowerCase()}`} loi={loi} dangTai={bo === null}>
            {bo && <BangKy bo={bo} cot={cot} />}
          </Khoi>
        );

      case 'theo-nhom':
        return (
          <Khoi
            key={ten}
            tieuDe="Chiết khấu bình quân theo nhóm sản phẩm"
            loi={loiNhom}
            dangTai={nhom === null}
          >
            {nhom && <BangNhom bo={nhom} />}
          </Khoi>
        );

      case 'hoat-dong':
        return (
          <Khoi
            key={ten}
            tieuDe="Hoạt động của hệ thống"
            loi={loiHoatDong}
            dangTai={hoatDong === null}
          >
            {hoatDong && <BangHoatDong bo={hoatDong} />}
          </Khoi>
        );
    }
  };

  return (
    <section className="trang">
      <div className="dau-trang">
        <h1>Thống kê</h1>
      </div>
      <p className="mo-ta-trang">
        Hoạt động theo kỳ, trong phạm vi dữ liệu của bạn. Tình trạng hiện tại của hồ sơ nằm ở trang{' '}
        <strong>Tổng quan</strong>.
      </p>

      {khoi.includes('vi-sao-khong-co-so') && (
        <ViSaoKhongCoViec ly_do={LY_DO_KHONG_CO_SO[vaiTro] ?? ''} />
      )}

      <ChonNhip ky={ky} datKy={datKy} />

      {khoi.map(veKhoi)}
    </section>
  );
}

/**
 * Bộ chọn nhịp — bốn nút, không phải ô chọn xổ xuống.
 *
 * Bốn lựa chọn cố định, và người dùng đổi qua đổi lại giữa chúng để so: một ô xổ
 * xuống bắt hai cú bấm mỗi lần đổi, còn bốn nút thì thấy hết lựa chọn mà không
 * phải mở ra xem có gì.
 */
function ChonNhip({ ky, datKy }: { ky: Ky; datKy: (k: Ky) => void }) {
  return (
    <div className="chon-nhip" role="group" aria-label="Nhịp thống kê">
      {MOI_KY.map((k) => (
        <button
          key={k}
          type="button"
          className={k === ky ? 'nut nut-nhip nut-nhip-chon' : 'nut nut-nhip'}
          aria-pressed={k === ky}
          onClick={() => datKy(k)}
        >
          {NHAN_KY[k]}
        </button>
      ))}
    </div>
  );
}

/** In một con số theo đúng dạng của cột nó thuộc về. */
function inSo(cot: string, v: number | null): string {
  if (v === null) return '—';
  switch (COT[cot]?.dang) {
    case 'tien':
      return tien(v);
    case 'tyLe':
      return tyLe(v);
    case 'ngay':
      // Số ngày, không phải một ngày tháng — dấu phẩy thập phân như mọi số lẻ
      // khác trong hệ.
      return String(v).replace('.', ',');
    default:
      return String(v);
  }
}

/**
 * Dải thẻ so sánh kỳ này với kỳ trước.
 *
 * KỲ TRƯỚC CẮT CÙNG SỐ NGÀY, và câu chú thích nói ra điều đó. Ngày 22 mà đặt
 * tháng này cạnh cả tháng trước là so 22 ngày với 31 ngày: mọi chỉ số đều
 * "giảm", và người đọc kết luận sai về chính công việc của mình.
 */
function SoSanh({ bo, the }: { bo: BoThongKe; the: string[] }) {
  const { kyNay, kyTruoc } = bo.soSanh;
  if (kyNay === null) return <Trong tieuDe="Chưa có số liệu cho kỳ này" />;

  return (
    <>
      <div className="luoi-chi-so">
        {the.map((c) => {
          const nay = soCua(kyNay, c);
          const truoc = soCua(kyTruoc, c);
          return (
            <article key={c} className={`chi-so chi-so-${huong(c, nay, truoc)}`}>
              <span className="chi-so-nhan">{COT[c]?.nhan ?? c}</span>
              <strong className="chi-so-gia-tri so">{inSo(c, nay)}</strong>
              <span className="chi-so-phu">
                {truoc === null
                  ? 'kỳ trước chưa có số liệu'
                  : `kỳ trước ${inSo(c, truoc)}${chenhLech(c, nay, truoc)}`}
              </span>
            </article>
          );
        })}
      </div>
      <p className="ghi-chu">
        {kyNay.nhan} mới đi được {ngayCua(bo.soSanh.daQua)} nên {kyTruoc?.nhan ?? 'kỳ trước'} cũng
        chỉ tính tới {ngay(bo.soSanh.denKyTruoc)} — so cùng số ngày.
      </p>
    </>
  );
}

/** Số ngày đã trôi của kỳ đang chạy, nói thành câu. */
function ngayCua(ms: number): string {
  const so = Math.floor(ms / 86_400_000);
  if (so < 1) return 'chưa tới một ngày';
  return `${so} ngày`;
}

/**
 * Chênh lệch so với kỳ trước, NÓI THÀNH CHỮ.
 *
 * Màu của thẻ đã nói hướng tốt/xấu, nhưng màu không phải là thông tin: người
 * không phân biệt được màu, và bản in đen trắng, đều mất sạch. Một chữ "tăng"
 * hay "giảm" thì không.
 *
 * Cột phần trăm dùng chữ **điểm** chứ không phải "%": từ 10% lên 12% là tăng 2
 * điểm, không phải tăng 2% — và 2% của 10 thì lại là một con số khác hẳn.
 */
function chenhLech(cot: string, nay: number | null, truoc: number | null): string {
  if (nay === null || truoc === null || nay === truoc) return '';
  const lech = Math.round((nay - truoc) * 100) / 100;
  const huong = lech > 0 ? 'tăng' : 'giảm';
  const so = inSo(cot, Math.abs(lech));
  return COT[cot]?.dang === 'tyLe'
    ? ` · ${huong} ${so.replace('%', '')} điểm`
    : ` · ${huong} ${so}`;
}

/**
 * Cột này tăng lên là tốt hay xấu.
 *
 * Bảng `COT` khai `tot: 'thap'` cho những cột mà tăng là xấu — trả lại, quá hạn,
 * số ngày duyệt. Không khai thì không tô màu: phần lớn chỉ số ở đây là khối
 * lượng công việc, và "lập mới nhiều hơn" tự nó không tốt cũng không xấu.
 */
function huong(cot: string, nay: number | null, truoc: number | null): string {
  const tot = COT[cot]?.tot;
  if (tot === undefined || nay === null || truoc === null || nay === truoc) return 'thuong';
  const tang = nay > truoc;
  const xau = tot === 'thap' ? tang : !tang;
  return xau ? 'canh-bao' : 'tot';
}

/**
 * Bảng theo kỳ — MỚI NHẤT LÊN ĐẦU.
 *
 * Ngược thứ tự máy chủ trả về, cố ý: dữ liệu trả về cũ-trước-mới-sau vì đó là
 * thứ tự để vẽ đường, còn người đọc bảng thì hỏi "kỳ vừa rồi thế nào" trước khi
 * hỏi "so với năm ngoái".
 */
function BangKy({ bo, cot }: { bo: BoThongKe; cot: string[] }) {
  const dong = [...bo.chuoi].reverse();
  // Thanh nền của cột ĐẦU TIÊN — cột việc chính của vai trò này. Một bảng số
  // thuần không cho thấy hình dạng của xu hướng, mà đó chính là thứ người ta mở
  // trang này ra để nhìn.
  const cotThanh = cot[0];
  const donhat = Math.max(1, ...dong.map((k) => soCua(k, cotThanh ?? '') ?? 0));

  return (
    <>
      <div className="khung-cuon" role="region" aria-label="Thống kê theo kỳ" tabIndex={0}>
        <table className="bang bang-thong-ke">
          <thead>
            <tr>
              <th scope="col">Kỳ</th>
              {cot.map((c) => (
                <th key={c} scope="col" className="so">
                  {COT[c]?.nhan ?? c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dong.map((k) => (
              <tr key={k.ma} className={k.dangChay ? 'dong-dang-chay' : undefined}>
                <th scope="row">
                  {/* Thanh nền chạy sau chữ, không phải một cột riêng: bảng đã
                      nhiều cột số, thêm một cột đồ hoạ nữa là đẩy phần bên phải
                      ra khỏi màn hình. */}
                  <span
                    className="thanh-nen"
                    aria-hidden="true"
                    style={{ width: `${((soCua(k, cotThanh ?? '') ?? 0) / donhat) * 100}%` }}
                  />
                  <span className="thanh-nen-chu">
                    {k.nhan}
                    {k.dangChay && <em className="ghi-chu-nho"> đang chạy</em>}
                  </span>
                </th>
                {cot.map((c) => (
                  <td key={c} className="so">
                    {inSo(c, soCua(k, c))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        CHÚ GIẢI MỐC — bắt buộc, không phải trang trí.

        "Tháng này có bao nhiêu CSBH" là câu chưa đủ nghĩa: lập trong tháng, gửi
        duyệt trong tháng, hay có hiệu lực trong tháng? Ba con số khác nhau, và
        bảng ở trên chỉ có chỗ cho một cái tên cột. Chỗ nói ra là đây.
      */}
      <details className="chu-giai">
        <summary>Mỗi cột tính theo mốc nào</summary>
        <dl className="chu-giai-moc">
          {cot.map((c) => (
            <div key={c}>
              <dt>{COT[c]?.nhan ?? c}</dt>
              <dd>{COT[c]?.neo ?? ''}</dd>
            </div>
          ))}
        </dl>
      </details>

      <p className="ghi-chu">
        Kỳ cắt theo giờ Việt Nam.
        {bo.loaiTruLegacy > 0 &&
          ` Đã loại ${bo.loaiTruLegacy} hồ sơ nhập từ dữ liệu cũ — chúng không đi qua luồng duyệt nên không có mốc nào để tính vào kỳ.`}
      </p>
    </>
  );
}

/** Chiết khấu bình quân theo nhóm sản phẩm — khối riêng của Ban lãnh đạo. */
function BangNhom({ bo }: { bo: BoTheoNhom }) {
  if (bo.dong.length === 0) {
    return <Trong tieuDe="Chưa có hồ sơ nào có hiệu lực trong khoảng này" />;
  }

  const nhom = [...new Set(bo.dong.map((d) => d.nhom))].sort();
  const tra = new Map(bo.dong.map((d) => [`${d.nhom}|${d.maKy}`, d]));
  // Chỉ SÁU kỳ gần nhất: bảng này rộng theo kỳ, và mười hai cột phần trăm thì
  // không so được bằng mắt nữa. Xu hướng dài hơn nằm ở bảng phía trên.
  const ky = bo.chuoi.slice(-6);

  return (
    <div className="khung-cuon" role="region" aria-label="Chiết khấu theo nhóm sản phẩm" tabIndex={0}>
      <table className="bang bang-thong-ke">
        <thead>
          <tr>
            <th scope="col">Nhóm sản phẩm</th>
            {ky.map((k) => (
              <th key={k.ma} scope="col" className="so">
                {k.nhan}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nhom.map((n) => (
            <tr key={n}>
              {/* Sản phẩm chưa gán nhóm vẫn phải có mặt — một dòng biến mất khỏi
                  bảng chiết khấu là một dòng không ai đi tìm. */}
              <th scope="row">{n === '' ? 'Chưa gán nhóm' : n}</th>
              {ky.map((k) => {
                const o = tra.get(`${n}|${k.ma}`);
                return (
                  <td key={k.ma} className="so">
                    {o === undefined ? '—' : tyLe(o.chietKhauTb)}
                    {o !== undefined && o.vuotNguong > 0 && (
                      <em className="ghi-chu-nho"> {o.vuotNguong} vượt ngưỡng</em>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Hoạt động hệ thống theo kỳ — khối duy nhất của Quản trị hệ thống.
 *
 * Đếm dòng nhật ký, vì đó là thứ duy nhất vai trò này có toàn bộ. Cửa sổ nhật ký
 * là sáu tháng, nên chuỗi kỳ có thể bị cắt ngắn — và bị cắt thì phải nói ra.
 */
function BangHoatDong({ bo }: { bo: BoHoatDong }) {
  if (bo.chuoi.length === 0) return <Trong tieuDe="Không có hoạt động nào trong cửa sổ nhật ký" />;
  const dong = [...bo.chuoi].reverse();
  const donhat = Math.max(1, ...dong.map((k) => k.tong));

  return (
    <>
      <div className="khung-cuon" role="region" aria-label="Hoạt động hệ thống theo kỳ" tabIndex={0}>
        <table className="bang bang-thong-ke">
          <thead>
            <tr>
              <th scope="col">Kỳ</th>
              <th scope="col" className="so">
                Số việc đã ghi
              </th>
              <th scope="col" className="so">
                Người thao tác
              </th>
            </tr>
          </thead>
          <tbody>
            {dong.map((k) => (
              <tr key={k.ma} className={k.dangChay ? 'dong-dang-chay' : undefined}>
                <th scope="row">
                  <span
                    className="thanh-nen"
                    aria-hidden="true"
                    style={{ width: `${(k.tong / donhat) * 100}%` }}
                  />
                  <span className="thanh-nen-chu">
                    {k.nhan}
                    {k.dangChay && <em className="ghi-chu-nho"> đang chạy</em>}
                  </span>
                </th>
                <td className="so">{k.tong}</td>
                {/* "Ít nhất": số người của một kỳ lấy theo đối tượng đông nhất,
                    vì cùng một người chạm hai đối tượng thì cộng lại sẽ đếm hai
                    lần. Nói ra còn hơn in một con số cao hơn sự thật. */}
                <td className="so">{k.nguoi === 0 ? '—' : `≥ ${k.nguoi}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ghi-chu">
        Nhật ký chỉ tra được {bo.window.months} tháng gần nhất.
        {bo.kyBiCat !== undefined &&
          bo.kyBiCat > 0 &&
          ` Đã bỏ ${bo.kyBiCat} kỳ nằm ngoài khoảng đó.`}
      </p>
    </>
  );
}
