/**
 * Danh sách hồ sơ, có bộ lọc 14 tiêu chí (muc 9.2).
 *
 * Trên điện thoại bộ lọc nằm trong TẤM TRƯỢT LÊN, và đóng lại vẫn giữ điều kiện
 * đã chọn cùng số kết quả (`FE-10`). Điều kiện lưu ở máy chủ theo phiên, nên
 * chuyển màn hình rồi quay lại vẫn còn (`RPT-04`).
 */
import { useCallback, useEffect, useState } from 'react';
import { dang, dat, layJson } from '../lib/api.js';
import { ngay } from '../lib/format.js';
import { Lien, useDuong } from '../lib/router.js';
import { BaoLoi, DangTai, Nhan, OTimKiem, Trong } from '../components/Chung.js';

type Dong = {
  policyId: string;
  code: string;
  status: string;
  customerCode: string;
  customerName: string;
  appliedDate: string | null;
  approvedAt: string | null;
  tdvName: string | null;
  lineCount: number;
};

type BoLoc = Record<string, string>;

const TIEU_CHI: { khoa: string; nhan: string; kieu?: 'date' }[] = [
  { khoa: 'appliedFrom', nhan: 'Áp dụng từ', kieu: 'date' },
  { khoa: 'appliedTo', nhan: 'Áp dụng đến', kieu: 'date' },
  { khoa: 'approvedFrom', nhan: 'Duyệt từ', kieu: 'date' },
  { khoa: 'approvedTo', nhan: 'Duyệt đến', kieu: 'date' },
  { khoa: 'customerCode', nhan: 'Mã khách hàng' },
  { khoa: 'customerName', nhan: 'Tên khách hàng' },
  { khoa: 'address', nhan: 'Địa chỉ đăng ký' },
  { khoa: 'taxId', nhan: 'Mã số thuế' },
  { khoa: 'productName', nhan: 'Tên sản phẩm' },
  { khoa: 'status', nhan: 'Trạng thái' },
  { khoa: 'provinceCode', nhan: 'Tỉnh/thành' },
  { khoa: 'hospitalCode', nhan: 'Bệnh viện / điểm bán' },
  { khoa: 'channelCode', nhan: 'Kênh' },
  { khoa: 'productGroupCode', nhan: 'Nhóm sản phẩm' },
];

/**
 * Tiêu chí đặt được TỪ LIÊN KẾT nhưng KHÔNG có ô nhập trong biểu mẫu.
 *
 * `tdvUserId` nhận một uuid, không phải chuỗi người ta gõ ra được — nó chỉ đến
 * từ việc bấm vào một dòng trên trang tổng quan. Vì không có ô nào để bỏ nó đi,
 * màn hình phải hiện một dải "đang lọc thêm theo…" có nút gỡ; thiếu dải đó thì
 * người dùng thấy danh sách ngắn bất thường mà không biết vì sao.
 */
const TIEU_CHI_AN: Record<string, string> = {
  tdvUserId: 'Trình dược viên',
  requesterId: 'Người đề nghị',
};

const KHOA_NHAN_TU_LIEN_KET = [...TIEU_CHI.map((t) => t.khoa), ...Object.keys(TIEU_CHI_AN)];

export function DanhSachHoSo() {
  const { truyVan } = useDuong();
  const tuLienKet = truyVan.toString();

  const [boLoc, datBoLoc] = useState<BoLoc>({});
  const [dong, datDong] = useState<Dong[] | null>(null);
  const [tong, datTong] = useState<number | null>(null);
  const [conTrỏ, datConTrỏ] = useState<string | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [moLoc, datMoLoc] = useState(false);
  const [lan, datLan] = useState(0);

  /**
   * Điều kiện lọc lúc mở màn hình. Hai nguồn, và LIÊN KẾT THẮNG.
   *
   * Bấm ô "Chờ TBP duyệt: 12" trên trang tổng quan mà lại ra danh sách theo bộ
   * lọc của phiên trước thì con số vừa bấm và danh sách vừa hiện không khớp
   * nhau — người dùng sẽ tin vào cái sai trong hai cái. Nên liên kết ghi đè, và
   * ghi luôn vào bộ lọc của phiên (RPT-04) để nó vẫn còn khi quay lại.
   */
  useEffect(() => {
    const q = new URLSearchParams(tuLienKet);
    const tuDuong: BoLoc = {};
    for (const khoa of KHOA_NHAN_TU_LIEN_KET) {
      const v = q.get(khoa);
      if (v !== null && v.trim() !== '') tuDuong[khoa] = v.trim();
    }

    if (Object.keys(tuDuong).length > 0) {
      datBoLoc(tuDuong);
      void dat('/reports/filters/ho-so', tuDuong).catch(() => undefined);
      return;
    }

    layJson<{ filter: BoLoc }>('/reports/filters/ho-so')
      .then((r) => datBoLoc(r.filter ?? {}))
      .catch(() => undefined);
  }, [tuLienKet]);

  const chuoiTruyVan = useCallback(
    (them: Record<string, string> = {}) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries({ ...boLoc, ...them })) if (v) q.set(k, v);
      return q.toString();
    },
    [boLoc],
  );

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    const qs = chuoiTruyVan({ limit: '50' });
    Promise.all([
      layJson<{ items: Dong[]; nextCursor: string | null }>(`/reports/policies?${qs}`, huy.signal),
      layJson<{ total: number }>(`/reports/policies/count?${chuoiTruyVan()}`, huy.signal),
    ])
      .then(([ds, dem]) => {
        datDong(ds.items);
        datConTrỏ(ds.nextCursor);
        datTong(dem.total);
      })
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [chuoiTruyVan, lan]);

  const datMot = (k: string, v: string) => {
    const moi = { ...boLoc, [k]: v };
    if (!v) delete moi[k];
    datBoLoc(moi);
    void dat('/reports/filters/ho-so', moi).catch(() => undefined);
  };

  const xoaLoc = async () => {
    datBoLoc({});
    await dang('/reports/filters/ho-so/clear', {}).catch(() => undefined);
  };

  const themTrang = async () => {
    if (!conTrỏ) return;
    const qs = chuoiTruyVan({ limit: '50', cursor: conTrỏ });
    const r = await layJson<{ items: Dong[]; nextCursor: string | null }>(`/reports/policies?${qs}`);
    datDong((cu) => [...(cu ?? []), ...r.items]);
    datConTrỏ(r.nextCursor);
  };

  const soDieuKien = Object.values(boLoc).filter(Boolean).length;
  const locAn = Object.keys(TIEU_CHI_AN).filter((k) => boLoc[k]);

  return (
    <section className="trang">
      <div className="dau-trang">
        <h1>Hồ sơ CSBH</h1>
        <button
          type="button"
          className="nut nut-loc"
          aria-expanded={moLoc}
          onClick={() => datMoLoc((x) => !x)}
        >
          Bộ lọc{soDieuKien > 0 && <span className="dem-loc">{soDieuKien}</span>}
        </button>
      </div>

      <p className="mo-ta-trang" aria-live="polite">
        {tong === null ? 'Đang đếm…' : `${tong} hồ sơ khớp điều kiện`}
      </p>

      {/* Tiêu chí đến từ liên kết mà biểu mẫu không có ô nào để gỡ — xem TIEU_CHI_AN. */}
      {locAn.length > 0 && (
        <div className="loc-them">
          {locAn.map((k) => (
            /*
              CẢ dải là nút, không phải chỉ dấu × bên trong nó. Một dấu × rộng
              24px là mục tiêu chạm quá nhỏ (`FE-08`), mà bọc riêng nó trong một
              vùng 44px thì dải chip cao gấp đôi cần thiết.
            */
            <button
              key={k}
              type="button"
              className="the-loc"
              onClick={() => datMot(k, '')}
              aria-label={`Bỏ lọc theo ${TIEU_CHI_AN[k]}`}
            >
              <span>
                Đang lọc theo <strong>{TIEU_CHI_AN[k]}</strong>
              </span>
              <span className="dau-go-loc" aria-hidden="true">
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      <div className={moLoc ? 'tam-loc mo' : 'tam-loc'}>
        <div className="tam-loc-trong">
          <h2>Bộ lọc</h2>
          <div className="luoi-loc">
            {TIEU_CHI.map((t) =>
              t.kieu === 'date' ? (
                <div className="truong" key={t.khoa}>
                  <label htmlFor={`loc-${t.khoa}`}>{t.nhan}</label>
                  <input
                    id={`loc-${t.khoa}`}
                    className="o-nhap"
                    type="date"
                    value={boLoc[t.khoa] ?? ''}
                    onChange={(e) => datMot(t.khoa, e.target.value)}
                  />
                </div>
              ) : (
                <OTimKiem
                  key={t.khoa}
                  id={`loc-${t.khoa}`}
                  nhan={t.nhan}
                  giaTri={boLoc[t.khoa] ?? ''}
                  doi={(v) => datMot(t.khoa, v)}
                />
              ),
            )}
          </div>
          <div className="nhom-nut">
            <button type="button" className="nut nut-nhe" onClick={xoaLoc}>
              Xoá bộ lọc
            </button>
            <button type="button" className="nut nut-chinh" onClick={() => datMoLoc(false)}>
              Xong
            </button>
          </div>
        </div>
      </div>

      {loi !== null && <BaoLoi loi={loi} thuLai={() => datLan((x) => x + 1)} />}
      {dong === null && loi === null && <DangTai />}

      {dong?.length === 0 && (
        <Trong
          tieuDe="Không có hồ sơ nào khớp"
          moTa="Thử bỏ bớt điều kiện lọc, hoặc bấm Xoá bộ lọc để xem lại toàn bộ."
        />
      )}

      {dong && dong.length > 0 && (
        <>
          <div className="khung-cuon" role="region" aria-label="Danh sách hồ sơ" tabIndex={0}>
            <table className="bang">
              <thead>
                <tr>
                  <th>Mã hồ sơ</th>
                  <th>Khách hàng</th>
                  <th>Trạng thái</th>
                  <th>Ngày áp dụng</th>
                  <th>TDV phụ trách</th>
                  <th className="so">Số dòng</th>
                </tr>
              </thead>
              <tbody>
                {dong.map((d) => (
                  <tr key={d.policyId}>
                    <td>
                      <Lien den={`/ho-so/${d.policyId}`}>{d.code}</Lien>
                    </td>
                    <td>
                      <span className="ma-phu">{d.customerCode}</span> {d.customerName}
                    </td>
                    <td>
                      <Nhan trangThai={d.status} />
                    </td>
                    <td>{ngay(d.appliedDate)}</td>
                    <td>{d.tdvName ?? '—'}</td>
                    <td className="so">{d.lineCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {conTrỏ && (
            <button type="button" className="nut nut-rong" onClick={themTrang}>
              Tải thêm
            </button>
          )}
        </>
      )}
    </section>
  );
}
