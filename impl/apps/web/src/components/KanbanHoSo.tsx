/**
 * KANBAN HỒ SƠ (`0257`) — cách xem mặc định của trang *Hồ sơ CSBH*.
 *
 * Mỗi trạng thái một cột, không kéo thả (đổi trạng thái chỉ đi qua các nút thao
 * tác trên trang hồ sơ — máy trạng thái không có bước "kéo sang cột kia"). Mức hiển
 * thị theo vai trò và luật ẩn cột trống ở `lib/kanban.ts`.
 *
 * DỮ LIỆU: không đường máy chủ nào mới. Trang đếm cả mười một trạng thái bằng
 * `/reports/policies/count` (cùng bộ lọc của trang, thay riêng `status`), rồi MỖI
 * CỘT ĐANG MỞ tự tải thẻ của nó qua `/reports/policies` với con trỏ cho *Tải thêm*.
 * Cột gập chỉ cần con số — không tải thẻ nào. Phạm vi theo vai trò là việc của máy
 * chủ, như ở dạng bảng.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Status } from '@csbh/domain-policy';
import { layJson } from '../lib/api.js';
import { ngay, nhanTrangThai, nhomTrangThai } from '../lib/format.js';
import { Lien } from '../lib/router.js';
import { BaoLoi, DangTai, Trong } from './Chung.js';
import { BieuTuongThanhBen } from './BieuTuong.js';
import {
  LUONG,
  cotHien,
  docChonTay,
  ghiChonTay,
  type ChonTay,
  type Cot,
  type VaiTroKanban,
} from '../lib/kanban.js';

export type TheHoSo = {
  policyId: string;
  code: string;
  status: string;
  customerCode: string;
  customerName: string;
  appliedDate: string | null;
  tdvName: string | null;
  sapQuaHan: boolean;
};

const MOI_COT = 20;

function CotMo({
  cot,
  truyVan,
  gap,
}: {
  cot: Cot;
  truyVan: (them: Record<string, string>) => string;
  gap: (() => void) | null;
}) {
  const [the, datThe] = useState<TheHoSo[] | null>(null);
  const [conTro, datConTro] = useState<string | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangTaiThem, datDangTaiThem] = useState(false);
  const qs = truyVan({ status: cot.trangThai, limit: String(MOI_COT) });

  useEffect(() => {
    const huy = new AbortController();
    datThe(null);
    datLoi(null);
    layJson<{ items: TheHoSo[]; nextCursor: string | null }>(`/reports/policies?${qs}`, huy.signal)
      .then((r) => {
        datThe(r.items);
        datConTro(r.nextCursor);
      })
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [qs]);

  const taiThem = () => {
    if (conTro === null) return;
    datDangTaiThem(true);
    layJson<{ items: TheHoSo[]; nextCursor: string | null }>(
      `/reports/policies?${qs}&cursor=${encodeURIComponent(conTro)}`,
    )
      .then((r) => {
        datThe((cu) => [...(cu ?? []), ...r.items]);
        datConTro(r.nextCursor);
      })
      .catch(datLoi)
      .finally(() => datDangTaiThem(false));
  };

  const ten = nhanTrangThai(cot.trangThai);
  const viec = cot.muc === 'V';
  const conLai = cot.dem - (the?.length ?? 0);
  return (
    <section className={`kb-cot${viec ? ' kb-cua-ban' : ''}`} aria-label={`${ten}, ${cot.dem} hồ sơ`}>
      <div className="kb-dau">
        <span className="kb-ten">
          <span className={`kb-cham nhan-${nhomTrangThai(cot.trangThai)}`} aria-hidden="true" />
          {ten}
        </span>
        <span className="kb-dem">{cot.dem}</span>
        {/* Cột *Việc của bạn* không gập được — thứ người dùng phải làm không được giấu. */}
        {gap && (
          <button type="button" className="kb-nut-gap" onClick={gap} title="Gập cột">
            <span className="chi-doc-man-hinh">Gập cột {ten}</span>
            <BieuTuongThanhBen gon={false} />
          </button>
        )}
      </div>
      {viec && <p className="kb-viec">Việc của bạn</p>}
      {loi !== null && <BaoLoi loi={loi} />}
      {the === null && loi === null && <DangTai />}
      <ul className="kb-ds">
        {the?.map((t) => (
          <li key={t.policyId}>
            <Lien den={`/ho-so/${t.policyId}`} className="kb-the">
              <strong className="kb-ma">{t.code}</strong>
              <span className="kb-kh">{t.customerName}</span>
              <span className="kb-phu">
                {t.customerCode}
                {t.tdvName ? ` · ${t.tdvName}` : ''}
              </span>
              <span className="kb-chan">
                {t.sapQuaHan && <span className="nhan nhan-gap">Sắp quá hạn</span>}
                <span>{t.appliedDate ? `Áp dụng từ ${ngay(t.appliedDate)}` : 'Chưa có ngày áp dụng'}</span>
              </span>
            </Lien>
          </li>
        ))}
      </ul>
      {the !== null && conTro !== null && (
        <button type="button" className="kb-them" onClick={taiThem} disabled={dangTaiThem}>
          {dangTaiThem ? 'Đang tải…' : `Tải thêm · còn ${conLai}`}
        </button>
      )}
    </section>
  );
}

export function KanbanHoSo({
  vaiTro,
  truyVan,
  locTrangThai,
  lan,
}: {
  vaiTro: VaiTroKanban;
  /** Chuỗi truy vấn của bộ lọc trang, với các khoá thay thế. */
  truyVan: (them: Record<string, string>) => string;
  locTrangThai: readonly string[];
  /** Tăng lên để tải lại (nút *Thử lại* của trang). */
  lan: number;
}) {
  const [dem, datDem] = useState<Partial<Record<Status, number>> | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [chonTay, datChonTay] = useState<ChonTay>(() => docChonTay(vaiTro));
  const khoaLoc = truyVan({});

  useEffect(() => {
    const huy = new AbortController();
    datDem(null);
    datLoi(null);
    const canDem = LUONG.filter((st) => locTrangThai.length === 0 || locTrangThai.includes(st));
    Promise.all(
      canDem.map((st) =>
        layJson<{ total: number }>(`/reports/policies/count?${truyVan({ status: st })}`, huy.signal).then(
          (r) => [st, r.total] as const,
        ),
      ),
    )
      .then((ds) => datDem(Object.fromEntries(ds)))
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
    // `khoaLoc` đại diện cho `truyVan` (hàm dựng lại mỗi lượt đổi bộ lọc).
  }, [khoaLoc, locTrangThai.join(','), lan]);

  const doiCot = useCallback(
    (st: Status, moi: 'mo' | 'gap') => {
      datChonTay((cu) => {
        const ra = { ...cu, [st]: moi };
        ghiChonTay(vaiTro, ra);
        return ra;
      });
    },
    [vaiTro],
  );
  const veMacDinh = () => {
    ghiChonTay(vaiTro, {});
    datChonTay({});
  };

  const { cot, anVITrong } = useMemo(
    () => cotHien(vaiTro, dem ?? {}, locTrangThai, chonTay),
    [vaiTro, dem, locTrangThai, chonTay],
  );

  if (loi !== null) return <BaoLoi loi={loi} />;
  if (dem === null) return <DangTai />;
  if (cot.length === 0) {
    return (
      <Trong
        tieuDe="Không có hồ sơ nào khớp"
        moTa="Thử bỏ bớt điều kiện lọc, hoặc bấm Xoá bộ lọc để xem lại toàn bộ."
      />
    );
  }

  return (
    <>
      <div className="kb-tren">
        {anVITrong.length > 0 && (
          <p className="kb-an">
            Đang ẩn {anVITrong.length} cột không có hồ sơ: {anVITrong.map(nhanTrangThai).join(', ')}.
          </p>
        )}
        {Object.keys(chonTay).length > 0 && (
          <button type="button" className="nut nut-nhe kb-mac-dinh" onClick={veMacDinh}>
            Về bộ cột mặc định
          </button>
        )}
      </div>
      <div className="kb" role="region" aria-label="Hồ sơ theo trạng thái" tabIndex={0}>
        {cot.map((c) =>
          c.gap ? (
            <section key={c.trangThai} className="kb-cot kb-gap" aria-label={`${nhanTrangThai(c.trangThai)}, ${c.dem} hồ sơ, đang gập`}>
              <button
                type="button"
                className="kb-mo"
                aria-expanded="false"
                onClick={() => doiCot(c.trangThai, 'mo')}
                title={`Mở cột ${nhanTrangThai(c.trangThai)}`}
              >
                <span className={`kb-cham nhan-${nhomTrangThai(c.trangThai)}`} aria-hidden="true" />
                <span className="kb-dem">{c.dem}</span>
                <span className="kb-doc">{nhanTrangThai(c.trangThai)}</span>
              </button>
            </section>
          ) : (
            <CotMo
              key={c.trangThai}
              cot={c}
              truyVan={truyVan}
              gap={c.muc === 'V' ? null : () => doiCot(c.trangThai, 'gap')}
            />
          ),
        )}
      </div>
    </>
  );
}
