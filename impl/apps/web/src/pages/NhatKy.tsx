/**
 * Nhật ký hệ thống — chỉ Quản trị đọc (muc 10, `0086`).
 *
 * `0090` ĐỔI VAI của màn hình này: từ một danh sách để nhìn thành một công cụ
 * để tra. Bản trước có sáu cột và một thanh phân trang, **không một bộ lọc
 * nào** — dù API đã nhận sẵn bốn tiêu chí. Với bảng lớn nhanh nhất hệ thống,
 * một danh sách không lọc được là một danh sách không tra được.
 *
 * Và cột đáng giá nhất thì vắng mặt: màn hình hiện VAI TRÒ chứ không hiện
 * NGƯỜI. Câu hỏi đầu tiên của mọi cuộc kiểm toán — "ai" — là câu duy nhất nó
 * không trả lời được.
 *
 * KHÔNG có nút xuất file (chốt 22/08). Đổi lại, bộ lọc phải đủ để tra tại chỗ.
 */
import { useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { ngayGio } from '../lib/format.js';
import { BaoLoi, DangTai, ONhapNgay, Trong, Truong } from '../components/Chung.js';
import { PhanTrang } from '../components/PhanTrang.js';
import { useTrangMay } from '../lib/phan-trang.js';

type Dong = {
  id: string;
  occurredAt: string;
  actorId: string | null;
  actorRole: string | null;
  actorName: string | null;
  actorUsername: string | null;
  actorIp: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  targetLabel: string | null;
  outcome: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  traceId: string | null;
};

type Facet = { value: string; label?: string | null; count: number };
type Facets = { actions: Facet[]; entities: Facet[]; actors: Facet[] };

type BoLoc = {
  from: string;
  to: string;
  actorId: string;
  action: string;
  entity: string;
  ip: string;
  traceId: string;
};

/** Cửa sổ audit đã chốt 22/08 — màn hình không cho chọn xa hơn máy chủ nhận. */
const CUA_SO_THANG = 6;

/*
 * HÔM NAY theo giờ VIỆT NAM, không theo UTC (`0208`).
 *
 * Bản cũ là `d.toISOString().slice(0, 10)`, và nó dựng ra một chặn trên SAI đúng
 * bảy tiếng mỗi ngày: từ 00:00 tới 07:00 giờ Việt Nam, `max` của hai ô lọc là
 * NGÀY HÔM QUA, nên người dùng không chọn được hôm nay trên lịch — đúng lúc họ
 * đang tìm việc vừa xảy ra. Lớp lỗi `0128`.
 *
 * Tham số `d` giữ lại: `somNhat()` gọi hàm này với một ngày khác hôm nay.
 */
const ngayISO = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

/** Mốc sớm nhất chọn được. Cộng một ngày để không chạm đúng mép máy chủ từ chối. */
function somNhat(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - CUA_SO_THANG);
  d.setDate(d.getDate() + 1);
  return ngayISO(d);
}

/** Mặc định mở ra là THÁNG NÀY, không phải cả cửa sổ sáu tháng. */
function dauThang(): string {
  const d = new Date();
  return ngayISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

const rong: BoLoc = {
  from: dauThang(),
  to: '',
  actorId: '',
  action: '',
  entity: '',
  ip: '',
  traceId: '',
};

const chuoiLoc = (b: BoLoc): string => {
  const q = new URLSearchParams();
  if (b.from) q.set('from', new Date(`${b.from}T00:00:00`).toISOString());
  // `to` là NGÀY, mà người dùng hiểu là "tới hết ngày đó". Cộng một ngày rồi so
  // `<` — không cộng thì chọn cùng một ngày cho hai ô ra danh sách rỗng.
  if (b.to) {
    const d = new Date(`${b.to}T00:00:00`);
    d.setDate(d.getDate() + 1);
    q.set('to', d.toISOString());
  }
  if (b.actorId) q.set('actorId', b.actorId);
  if (b.action) q.set('action', b.action);
  if (b.entity) q.set('entity', b.entity);
  if (b.ip) q.set('ip', b.ip.trim());
  if (b.traceId) q.set('traceId', b.traceId);
  return q.toString();
};

export function NhatKy() {
  const [boLoc, datBoLoc] = useState<BoLoc>(rong);
  const [facets, datFacets] = useState<Facets | null>(null);
  const [mo, datMo] = useState<string | null>(null);

  useEffect(() => {
    const huy = new AbortController();
    layJson<Facets>('/audit/facets', huy.signal)
      .then(datFacets)
      // Ô chọn thiếu tuỳ chọn thì bộ lọc vẫn gõ tay được; đây không phải lý do
      // để dỡ cả màn hình.
      .catch(() => datFacets({ actions: [], entities: [], actors: [] }));
    return () => huy.abort();
  }, []);

  const { muc: ds, tong, loi, trang, soTrang, doiTrang } = useTrangMay<Dong>(
    `/audit/entries?${chuoiLoc(boLoc)}`,
  );

  const dat = (k: keyof BoLoc, v: string) => datBoLoc((cu) => ({ ...cu, [k]: v }));

  return (
    <section className="trang">
      <div className="dau-trang">
        <div>
          <h1>Nhật ký</h1>
          <p className="mo-ta-trang">
            Tra được <strong>{CUA_SO_THANG} tháng gần nhất</strong>. Nhật ký chỉ ghi thêm — không
            ai sửa hay xoá được dòng nào, kể cả Quản trị hệ thống.
          </p>
        </div>
      </div>

      <div className="bo-loc-nhat-ky">
        <Truong id="nk-tu" nhan="Từ ngày">
          {(p) => (
            <ONhapNgay
              {...p}
              min={somNhat()}
              max={ngayISO(new Date())}
              giaTri={boLoc.from}
              doi={(v) => dat('from', v)}
            />
          )}
        </Truong>
        <Truong id="nk-den" nhan="Đến ngày">
          {(p) => (
            <ONhapNgay
              {...p}
              min={boLoc.from || somNhat()}
              max={ngayISO(new Date())}
              giaTri={boLoc.to}
              doi={(v) => dat('to', v)}
            />
          )}
        </Truong>
        <Truong id="nk-nguoi" nhan="Người thực hiện">
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={boLoc.actorId}
              onChange={(e) => dat('actorId', e.target.value)}
            >
              <option value="">Bất kỳ</option>
              {(facets?.actors ?? []).map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label ?? a.value} ({a.count})
                </option>
              ))}
            </select>
          )}
        </Truong>
        <Truong id="nk-hanh-dong" nhan="Hành động">
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={boLoc.action}
              onChange={(e) => dat('action', e.target.value)}
            >
              <option value="">Bất kỳ</option>
              {(facets?.actions ?? []).map((a) => (
                <option key={a.value} value={a.value}>
                  {a.value} ({a.count})
                </option>
              ))}
            </select>
          )}
        </Truong>
        <Truong id="nk-doi-tuong" nhan="Đối tượng">
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={boLoc.entity}
              onChange={(e) => dat('entity', e.target.value)}
            >
              <option value="">Bất kỳ</option>
              {(facets?.entities ?? []).map((a) => (
                <option key={a.value} value={a.value}>
                  {a.value} ({a.count})
                </option>
              ))}
            </select>
          )}
        </Truong>
        <Truong id="nk-ip" nhan="Địa chỉ IP">
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              placeholder="10.4.19.7"
              value={boLoc.ip}
              onChange={(e) => dat('ip', e.target.value)}
            />
          )}
        </Truong>
        <button type="button" className="nut nut-nhe" onClick={() => datBoLoc(rong)}>
          Xoá bộ lọc
        </button>
      </div>

      {/*
        Lọc theo mã tra cứu KHÔNG có ô riêng trong biểu mẫu — nó tới từ cú bấm
        vào một dòng. Nhưng phải NÓI RA là đang lọc: không có dải này thì danh
        sách đột nhiên còn ba dòng và người dùng tưởng nhật ký hỏng.
      */}
      {boLoc.traceId !== '' && (
        <div className="hop-canh-bao" role="note">
          Đang xem cả chuỗi của mã tra cứu <strong>{boLoc.traceId}</strong>.{' '}
          <button type="button" className="lien-phu" onClick={() => datBoLoc(rong)}>
            Bỏ lọc theo chuỗi
          </button>
        </div>
      )}

      {loi !== null && <BaoLoi loi={loi} />}
      {loi === null && !ds && <DangTai />}
      {ds && ds.length === 0 && (
        <Trong
          tieuDe="Không có dòng nào khớp"
          moTa="Nới khoảng thời gian, hoặc bỏ bớt điều kiện lọc."
        />
      )}

      {ds && ds.length > 0 && (
        <>
          <div className="khung-cuon" role="region" aria-label="Nhật ký" tabIndex={0}>
            <table className="bang">
              <thead>
                <tr>
                  <th>Thời điểm</th>
                  <th>Người thực hiện</th>
                  <th>Hành động</th>
                  <th>Đối tượng</th>
                  <th>Kết quả</th>
                  <th>Địa chỉ IP</th>
                  <th>Mã tra cứu</th>
                </tr>
              </thead>
              <tbody>
                {ds.map((d) => {
                  const coChiTiet =
                    d.before !== null || d.after !== null || (d.reason ?? '') !== '';
                  return (
                    <tr key={d.id}>
                      <td>{ngayGio(d.occurredAt)}</td>
                      {/*
                        Tên TRƯỚC, tên đăng nhập và vai trò xuống dòng phụ. Dòng
                        cũ không có tên — hiện đúng như thế chứ không tra bù từ
                        bảng tài khoản hôm nay, vì tên hôm nay không phải tên
                        lúc việc ấy xảy ra.
                      */}
                      <td>
                        {d.actorName ?? d.actorUsername ?? <span className="phu">—</span>}
                        {(d.actorUsername || d.actorRole) && (
                          <span className="phu duoi">
                            {[d.actorUsername, d.actorRole].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </td>
                      <td>
                        {d.action}
                        {coChiTiet && (
                          <button
                            type="button"
                            className="lien-phu"
                            onClick={() => datMo(mo === d.id ? null : d.id)}
                          >
                            {mo === d.id ? 'Ẩn thay đổi' : 'Xem thay đổi'}
                          </button>
                        )}
                        {mo === d.id && (
                          <div className="nk-chi-tiet">
                            {d.reason && (
                              <p className="nk-ly-do">
                                <strong>Lý do:</strong> {d.reason}
                              </p>
                            )}
                            <div className="nk-truoc-sau">
                              <div>
                                <span className="nk-nhan">Trước</span>
                                <pre>{d.before === null ? '—' : JSON.stringify(d.before, null, 2)}</pre>
                              </div>
                              <div>
                                <span className="nk-nhan">Sau</span>
                                <pre>{d.after === null ? '—' : JSON.stringify(d.after, null, 2)}</pre>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                      <td>
                        {d.targetLabel ?? d.entity}
                        {d.targetLabel && <span className="phu duoi">{d.entity}</span>}
                      </td>
                      <td>
                        {d.outcome === null ? (
                          <span className="phu">—</span>
                        ) : (
                          <span className={d.outcome === 'FAILED' ? 'nk-bai' : 'nk-thanh'}>
                            {d.outcome === 'FAILED' ? 'Thất bại' : 'Thành công'}
                          </span>
                        )}
                      </td>
                      <td>{d.actorIp ?? '—'}</td>
                      <td className="ma-phu">
                        {d.traceId ? (
                          // Bấm mã là lọc theo chính nó: một thao tác của người
                          // dùng sinh ra nhiều dòng ở nhiều service, và đây là
                          // cách duy nhất nối chúng lại.
                          <button
                            type="button"
                            className="lien-phu"
                            onClick={() =>
                              datBoLoc({ ...rong, from: '', to: '', traceId: d.traceId! })
                            }
                            title="Xem cả chuỗi"
                          >
                            {d.traceId}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PhanTrang trang={trang} soTrang={soTrang} tong={tong} doiTrang={doiTrang} nhan="dòng" />
        </>
      )}
    </section>
  );
}
