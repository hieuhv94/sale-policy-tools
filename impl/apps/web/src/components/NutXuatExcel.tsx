/**
 * **Xuất Excel** — xem trước, chọn dòng nào vào file, rồi tải (`0077`, làm lại ở `0283`).
 *
 * Bấm nút KHÔNG tải ngay: nó mở một hộp thoại xem trước các dòng sẽ có trong file, kèm hai con số của cả lượt
 * (*N hồ sơ · M dòng sản phẩm*) và một ô tích. Nút tải nằm dưới bảng.
 *
 * HAI CÁCH CHỌN DÒNG, và mặc định là cách hẹp (khách hàng chốt 12/11/2026):
 *   - mặc định: chỉ các DÒNG SẢN PHẨM khớp tiêu chí về sản phẩm (tên · nhóm · khoảng chiết khấu) — đúng câu
 *     người dùng vừa hỏi bằng bộ lọc;
 *   - ô tích *Thêm mọi sản phẩm trong CSBH*: mọi dòng của các hồ sơ khớp, kể cả dòng không khớp.
 * Không tiêu chí sản phẩm nào đang bật thì hai cách cho cùng một kết quả, và ô tích tắt kèm một câu nói vì sao.
 *
 * TẢI ĐÚNG THEO LỰA CHỌN. Bản xem trước và lượt xuất đi qua cùng một câu lệnh ở máy chủ (`all()`), và lượt xuất
 * mang đúng `tatCaSanPham` mà người dùng đang thấy. Đổi ô tích hay bộ lọc là VỨT việc đang có — không thì
 * người dùng xem bản hẹp rồi bấm tải và nhận file của một lựa chọn khác.
 *
 * KHÔNG CHẶN MÀN HÌNH (`RPT-08`): file dựng ở máy chủ, đóng hộp thoại giữa chừng cũng không hỏng.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { dang, layJson, taiVe } from '../lib/api.js';
import { BaoLoi, DangTai, HopThoai } from './Chung.js';
import { useBaoLoi } from '../lib/bao-loi.js';
import { nhanTrangThai, tien, tyLe } from '../lib/format.js';

type ViecXuat = {
  jobId: string;
  status: string;
  rowCount: number | null;
  downloadUrl: string | null;
};

type DongXem = {
  code: string;
  customerName: string;
  status: string;
  productCode: string | null;
  productName: string | null;
  groupCode: string | null;
  netPrice: string | null;
  discountRate: string | null;
  overThreshold: boolean | null;
};

type XemTruoc = {
  soHoSo: number;
  soDong: number;
  dong: DongXem[];
  daCat: boolean;
  tran: number;
};

/** Ba khoá của bộ lọc nói về MỘT dòng sản phẩm — khớp `build()` của máy chủ. */
const KHOA_SAN_PHAM = ['productName', 'productGroupCode', 'discountFrom', 'discountTo'] as const;
/** Số dòng bản xem trước lấy về. Đủ để thấy hình dạng của file, không đủ để kéo cả danh mục. */
const SO_DONG_XEM = 50;

export function NutXuatExcel({
  boLoc,
  tenTep = 'CSBH.xlsx',
}: {
  /** Bộ lọc gửi lên máy chủ. Rỗng nghĩa là cả phạm vi dữ liệu của người dùng. */
  boLoc: Record<string, string>;
  /**
   * Tên dùng khi máy chủ KHÔNG đặt tên — đường lùi, không phải tên thật. Tên thật là
   * `CSBH_20260821_143012.xlsx` do máy chủ đặt trong `Content-Disposition` (`0078`).
   */
  tenTep?: string;
}) {
  const [mo, datMo] = useState(false);
  return (
    <>
      <button type="button" className="nut" onClick={() => datMo(true)}>
        Xuất Excel
      </button>
      {mo && <HopXemTruocXuat boLoc={boLoc} tenTep={tenTep} dong={() => datMo(false)} />}
    </>
  );
}

function HopXemTruocXuat({
  boLoc,
  tenTep,
  dong,
}: {
  boLoc: Record<string, string>;
  tenTep: string;
  dong: () => void;
}) {
  const { bao } = useBaoLoi();
  const coTieuChiSanPham = KHOA_SAN_PHAM.some((k) => Boolean(boLoc[k]));
  const [tatCa, datTatCa] = useState(false);
  const [xem, datXem] = useState<XemTruoc | null>(null);
  const [loiXem, datLoiXem] = useState<unknown>(null);
  const [lan, datLan] = useState(0);
  const [viec, datViec] = useState<ViecXuat | null>(null);
  const [dangTai, datDangTai] = useState(false);
  /*
   * Đếm số lượt hỏi tiến độ hỏng liên tiếp (`0089`). Nuốt lỗi ở đây để lại một nút quay tròn VĨNH VIỄN:
   * vòng hỏi vẫn chạy, mỗi lượt vẫn hỏng, và người dùng ngồi chờ một file không bao giờ tới. Ba lượt là đủ
   * để loại trừ một cú vấp mạng; quá đó thì dừng hỏi và nói ra.
   */
  const hong = useRef(0);

  // Không tiêu chí sản phẩm nào thì ô tích không có nghĩa — hai cách cho cùng một file. Ép về `false` để
  // lượt xuất không mang một cờ mà người dùng không còn thấy.
  const tatCaHieuLuc = coTieuChiSanPham && tatCa;

  const khoaBoLoc = JSON.stringify(boLoc);
  const truyVan = useCallback(() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(boLoc)) if (v) q.set(k, v);
    q.set('limit', String(SO_DONG_XEM));
    if (tatCaHieuLuc) q.set('tatCaSanPham', '1');
    return q.toString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [khoaBoLoc, tatCaHieuLuc]);

  // Bản xem trước: tải lại mỗi khi bộ lọc hay ô tích đổi.
  useEffect(() => {
    const huy = new AbortController();
    datXem(null);
    datLoiXem(null);
    datViec(null);
    layJson<XemTruoc>(`/reports/exports/preview?${truyVan()}`, huy.signal)
      .then(datXem)
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoiXem(e);
      });
    return () => huy.abort();
  }, [truyVan, lan]);

  // Hỏi tiến độ việc xuất tới khi xong.
  useEffect(() => {
    if (!viec || viec.status === 'XONG' || viec.status === 'LOI') return;
    const h = setTimeout(() => {
      void layJson<ViecXuat>(`/reports/exports/${viec.jobId}`)
        .then((v) => {
          hong.current = 0;
          datViec(v);
        })
        .catch((e: unknown) => {
          hong.current += 1;
          if (hong.current < 3) {
            // Đụng lại chính `viec` để `useEffect` chạy vòng sau — hỏng một lượt giữa chừng thì thử tiếp.
            datViec({ ...viec });
            return;
          }
          hong.current = 0;
          datViec({ ...viec, status: 'LOI' });
          bao(e);
        });
    }, 700);
    return () => clearTimeout(h);
  }, [viec, bao]);

  const tai = useCallback(
    (url: string) => {
      datDangTai(true);
      /*
       * Tải qua `taiVe()`, KHÔNG phải `<a href>`: thẻ neo không gửi header `Authorization`, và đường tải file
       * nằm sau `@Roles(...)` nên nó trả về 401 (cùng lỗi nút *Xuất hợp đồng* từng mắc).
       */
      taiVe(url, tenTep)
        .catch(bao)
        .finally(() => datDangTai(false));
    },
    [bao, tenTep],
  );

  // File dựng xong thì tải luôn: người dùng đã bấm *Tải file* một lần, không bắt họ bấm lần hai.
  const daTaiTuDong = useRef<string | null>(null);
  useEffect(() => {
    if (viec?.status === 'XONG' && viec.downloadUrl && daTaiTuDong.current !== viec.jobId) {
      daTaiTuDong.current = viec.jobId;
      tai(viec.downloadUrl);
    }
  }, [viec, tai]);

  const xuat = async () => {
    try {
      datViec(
        await dang<ViecXuat>('/reports/exports', { ...boLoc, ...(tatCaHieuLuc ? { tatCaSanPham: true } : {}) }),
      );
    } catch (e) {
      bao(e);
    }
  };

  const dangChay = viec !== null && viec.status !== 'XONG' && viec.status !== 'LOI';
  const quaTran = xem !== null && xem.soDong > xem.tran;
  const rong = xem !== null && xem.soHoSo === 0;

  return (
    <HopThoai tieuDe="Xuất Excel" dong={dong} co="to">
      {loiXem !== null && <BaoLoi loi={loiXem} thuLai={() => datLan((x) => x + 1)} />}
      {loiXem === null && xem === null && <DangTai nhan="Đang dựng bản xem trước…" />}

      {xem !== null && (
        <>
          <p className="mo-ta-trang" aria-live="polite">
            <strong>{xem.soHoSo}</strong> hồ sơ · <strong>{xem.soDong}</strong> dòng sản phẩm trong file.
          </p>

          <label className="the-tich the-tich-rong">
            <input
              type="checkbox"
              checked={tatCaHieuLuc}
              disabled={!coTieuChiSanPham}
              onChange={(e) => datTatCa(e.target.checked)}
            />
            <span>
              Thêm mọi sản phẩm trong CSBH
              <small className="ghi-chu">
                {coTieuChiSanPham
                  ? tatCaHieuLuc
                    ? 'File gồm cả các sản phẩm không khớp tiêu chí của mỗi hồ sơ.'
                    : 'File chỉ gồm các sản phẩm khớp tiêu chí về sản phẩm (tên, nhóm, tỷ lệ chiết khấu).'
                  : 'Bộ lọc không có tiêu chí về sản phẩm nên file luôn gồm mọi sản phẩm của hồ sơ.'}
              </small>
            </span>
          </label>

          {quaTran && (
            <p className="bao-loi" role="alert">
              File sẽ có {xem.soDong} dòng, vượt trần {xem.tran} dòng. Hãy thu hẹp bộ lọc rồi xuất lại.
            </p>
          )}

          {rong ? (
            <p className="ghi-chu">Không có hồ sơ nào khớp bộ lọc, nên chưa có gì để xuất.</p>
          ) : (
            <div className="khung-cuon" role="region" aria-label="Bản xem trước file" tabIndex={0}>
              <table className="bang">
                <thead>
                  <tr>
                    <th>Mã hồ sơ</th>
                    <th>Khách hàng</th>
                    <th>Trạng thái</th>
                    <th>Mã sản phẩm</th>
                    <th>Tên sản phẩm</th>
                    <th>Nhóm SP</th>
                    <th className="so">Giá thu về</th>
                    <th className="so">Chiết khấu</th>
                  </tr>
                </thead>
                <tbody>
                  {xem.dong.map((d, i) => (
                    <tr key={`${d.code}|${d.productCode ?? ''}|${i}`}>
                      <td>{d.code}</td>
                      <td>{d.customerName}</td>
                      <td>{nhanTrangThai(d.status)}</td>
                      <td>{d.productCode ?? '—'}</td>
                      <td>{d.productName ?? '—'}</td>
                      <td>{d.groupCode ?? '—'}</td>
                      <td className="so">{d.netPrice === null ? '—' : tien(d.netPrice)}</td>
                      <td className="so">
                        {d.discountRate === null ? (
                          '—'
                        ) : (
                          <span className={`ty-le${d.overThreshold ? ' vuot' : ''}`}>{tyLe(d.discountRate)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {xem.daCat && (
            <p className="ghi-chu">
              Đang hiện {xem.dong.length} dòng đầu trong {xem.soDong} dòng. File tải về có đủ.
            </p>
          )}

          {viec?.status === 'LOI' && (
            <p className="bao-loi" role="alert">
              Dựng file hỏng. Bấm <strong>Tải file Excel</strong> để thử lại.
            </p>
          )}
          <div className="nhom-nut">
            {viec?.status === 'XONG' && viec.downloadUrl ? (
              <button
                type="button"
                className="nut nut-chinh"
                disabled={dangTai}
                onClick={() => tai(viec.downloadUrl!)}
              >
                {dangTai ? 'Đang tải…' : `Đã dựng xong. Tải lại (${viec.rowCount} dòng)`}
              </button>
            ) : (
              <button
                type="button"
                className="nut nut-chinh"
                disabled={dangChay || rong || quaTran}
                onClick={() => void xuat()}
              >
                {dangChay ? 'Đang dựng file…' : `Tải file Excel (${xem.soDong} dòng)`}
              </button>
            )}
            <button type="button" className="nut nut-nhe" onClick={dong}>
              Đóng
            </button>
          </div>
        </>
      )}
    </HopThoai>
  );
}
