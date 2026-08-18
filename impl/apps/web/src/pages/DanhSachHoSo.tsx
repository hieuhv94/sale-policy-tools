/**
 * Danh sách hồ sơ, có bộ lọc 11 tiêu chí (muc 9.2).
 *
 * Ba tiêu chí tỉnh/thành · bệnh viện · kênh rời khỏi phần mềm ở `0026` cùng ba
 * cột nguồn của chúng bên khách hàng.
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
import { PhanTrang } from '../components/PhanTrang.js';
import { MOI_TRANG, soTrangCua } from '../lib/phan-trang.js';
import { usePhien } from '../lib/auth.js';
import { can } from '../lib/can.js';

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
  // Hai tiêu chí của trang tổng quan (`0045`). `pendingStep` là cách DUY NHẤT để
  // một thẻ mở ra đúng tập hồ sơ nó vừa đếm: thẻ đếm cả hồ sơ quá hạn ở bước ấy,
  // mà chúng mang `QUA_HAN_DUYET` nên `status` lọc không ra.
  pendingStep: 'Bước đang chờ',
  reprint: 'Việc của Sale Admin',
};

const KHOA_NHAN_TU_LIEN_KET = [...TIEU_CHI.map((t) => t.khoa), ...Object.keys(TIEU_CHI_AN)];

export function DanhSachHoSo() {
  const { nguoiDung } = usePhien();
  const { truyVan } = useDuong();
  const tuLienKet = truyVan.toString();

  const [boLoc, datBoLoc] = useState<BoLoc>({});
  const [dong, datDong] = useState<Dong[] | null>(null);
  const [tong, datTong] = useState<number | null>(null);
  /*
   * NGĂN XẾP CON TRỎ, không phải `offset` (`0030`).
   *
   * Danh sách này phân trang bằng con trỏ neo vào `(createdAt, policyId)` — với
   * `offset`, một hồ sơ mới lập giữa lúc người dùng bấm Sau sẽ đẩy mọi dòng
   * xuống một bậc, và họ nhận lại một dòng đã đọc trong khi một dòng khác biến
   * mất. Con trỏ không có chuyện đó, nhưng nó chỉ đi TỚI được.
   *
   * Nên giữ lại con trỏ mở đầu MỖI trang đã qua: `moTrang[i]` là con trỏ để lấy
   * trang thứ `i+1`. Lùi là đọc lại phần tử trước trong ngăn xếp. Đây là cái giá
   * của con trỏ, và nó rẻ hơn nhiều so với một danh sách trượt dưới tay người
   * đang đọc.
   */
  const [moTrang, datMoTrang] = useState<(string | null)[]>([null]);
  const [trang, datTrang] = useState(1);
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
    const mo = moTrang[trang - 1] ?? null;
    const qs = chuoiTruyVan({
      limit: String(MOI_TRANG),
      ...(mo === null ? {} : { cursor: mo }),
    });
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
  }, [chuoiTruyVan, lan, trang, moTrang]);

  // Đổi bộ lọc là đổi hẳn tập kết quả: mọi con trỏ đã ghi lại đều trỏ vào tập
  // cũ, nên phải vứt cả ngăn xếp chứ không chỉ về trang 1.
  useEffect(() => {
    datMoTrang([null]);
    datTrang(1);
  }, [chuoiTruyVan]);

  const doiTrang = (n: number) => {
    if (n === trang) return;
    if (n < trang) {
      datTrang(Math.max(1, n));
      return;
    }
    // Chỉ đi tới ĐÚNG MỘT trang: thanh phân trang không có nút nhảy, nên `n`
    // luôn là `trang + 1`. Ghi con trỏ mở đầu trang mới nếu chưa có.
    if (conTrỏ === null) return;
    datMoTrang((cu) => (cu.length > n - 1 ? cu : [...cu, conTrỏ]));
    datTrang(n);
  };

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

  const soDieuKien = Object.values(boLoc).filter(Boolean).length;
  const locAn = Object.keys(TIEU_CHI_AN).filter((k) => boLoc[k]);

  return (
    <section className="trang">
      <div className="dau-trang">
        <h1>Hồ sơ CSBH</h1>
        {can(nguoiDung?.role, 'lapHoSo') && (
          <Lien den="/ho-so/moi" className="nut nut-chinh">
            Lập hồ sơ
          </Lien>
        )}
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
          <PhanTrang
            trang={trang}
            soTrang={tong === null ? trang : soTrangCua(tong)}
            {...(tong === null ? {} : { tong })}
            doiTrang={doiTrang}
            nhan="hồ sơ"
          />
        </>
      )}
    </section>
  );
}
