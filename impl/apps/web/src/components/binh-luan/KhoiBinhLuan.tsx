/**
 * Khối *Bình luận* trên trang hồ sơ (`0264`), ngay trên *Lịch sử* — mockup đã duyệt
 * 07/11 (`artifacts/binh-luan-mockup.html`).
 *
 * TỰ CẬP NHẬT ≤ 30 GIÂY BẰNG HỎI ĐỊNH KỲ (yêu cầu 5): mỗi 15 giây hỏi
 * `thay-doi?tu=<mốc>` — máy chủ trả mọi bình luận đổi sau mốc (`0261`, mốc không có
 * khe hở nhờ khoá theo hồ sơ). Dừng khi tab ẩn, hỏi ngay khi quay lại. Lượt hỏi hỏng
 * vì mạng thì IM (lượt sau hỏi bù từ đúng mốc cũ — không mất gì); 403/404 thì khối
 * chuyển sang *mất quyền* và thôi hỏi.
 *
 * KHÔNG ĐỔI CHỖ THỨ NGƯỜI ĐỌC ĐANG NHÌN: bình luận mới tới khi người đọc đang ở cuối
 * khối thì hiện tại chỗ và tô nổi; đang cuộn lên đọc cái cũ thì chỉ hiện nút *N bình
 * luận mới* — không tự cuộn.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { GIOI_HAN_BINH_LUAN, type MaCamXuc } from '@csbh/domain-policy';
import { dat, layJson, LoiApi, xoa } from '../../lib/api.js';
import { useBaoLoi } from '../../lib/bao-loi.js';
import { danhDauDaDocBinhLuan } from '../../lib/thong-bao.js';
import {
  demTatCa,
  hopNhat,
  idTuNeo,
  lienKetBinhLuan,
  neoBinhLuan,
  nhanCapNhat,
  thayMot,
  timMuc,
  type Luong,
  type MucBinhLuan,
  type PhanHoiVe,
  type ThayDoiVe,
  type TrangVe,
} from '../../lib/binh-luan.js';
import { BaoLoi, HopThoaiXacNhan } from '../Chung.js';
import { BtKhoa, BtLen, BtXuong } from './BieuTuongBinhLuan.js';
import { DongBinhLuan } from './DongBinhLuan.js';
import { OSoanBinhLuan } from './OSoanBinhLuan.js';

type TrangThai = 'tai' | 'loi' | 'mat-quyen' | 'ok';

/** Bao lâu thì vệt tô nổi tắt — khớp `@keyframes bl-noi-moi` (2,4 giây) ở `app.css`. */
const NOI_MS = 2400;
/** Gom các bình luận vừa lọt vào khung nhìn rồi mới báo đã đọc — một lượt gọi cho cả lô. */
const GOM_DA_DOC_MS = 800;
/** Liên kết tới một bình luận ngoài trang đầu: tải thêm tối đa bấy nhiêu lượt rồi thôi. */
const TRAN_TIM_NEO = 60;

/**
 * Máy chủ trả ĐÚNG hình dạng không. Sai hình dạng thì `ds.map` ném lỗi lúc dựng và
 * React tháo CẢ CÂY — cả trang hồ sơ mất vì khối phụ ở cuối trang (bài học `0162`).
 * Sai thì khối báo *không tải được*, trang còn nguyên.
 */
const dungHinh = (r: unknown, khoa: 'binhLuan' | 'thayDoi' | 'phanHoi'): boolean =>
  typeof r === 'object' && r !== null && Array.isArray((r as Record<string, unknown>)[khoa]);

const laMatQuyen = (e: unknown) => e instanceof LoiApi && (e.status === 403 || e.status === 404);

export function KhoiBinhLuan({ hoSoId }: { hoSoId: string }) {
  const { bao } = useBaoLoi();
  const [tt, datTt] = useState<TrangThai>('tai');
  const [loiTai, datLoiTai] = useState<unknown>(null);
  const [ds, datDsState] = useState<Luong[]>([]);
  const dsRef = useRef<Luong[]>([]);
  const datDs = useCallback((f: Luong[] | ((d: Luong[]) => Luong[])) => {
    const v = typeof f === 'function' ? f(dsRef.current) : f;
    dsRef.current = v;
    datDsState(v);
  }, []);
  const [ten, datTen] = useState<Record<string, string>>({});
  const themTen = useCallback((t: Record<string, string>) => datTen((cu) => ({ ...cu, ...t })), []);
  const [conCu, datConCu] = useState(false);
  const conCuRef = useRef(false);
  const moc = useRef(0);
  const [capNhatLuc, datCapNhatLuc] = useState<number | null>(null);
  const [, datNhip] = useState(0);
  const [moi, datMoi] = useState<string[]>([]);
  const [noi, datNoi] = useState<string | null>(null);
  const [dangTraLoi, datDangTraLoi] = useState<string | null>(null);
  const [hoiXoa, datHoiXoa] = useState<MucBinhLuan | null>(null);
  const [dangXoa, datDangXoa] = useState(false);
  const [dangTaiCu, datDangTaiCu] = useState(false);
  const [dangTaiPh, datDangTaiPh] = useState<string | null>(null);
  const [docThay, datDocThay] = useState('');
  const oCuoi = useRef(true);
  const khoi = useRef<HTMLElement>(null);
  const moc_cuoi = useRef<HTMLDivElement>(null);

  // --- Tải trang đầu --------------------------------------------------------------
  const taiDau = useCallback(async () => {
    datTt('tai');
    datLoiTai(null);
    try {
      const r = await layJson<TrangVe>(`/policies/${hoSoId}/binh-luan`);
      if (!dungHinh(r, 'binhLuan')) throw new Error('Danh sách bình luận sai hình dạng');
      moc.current = Number(r.moc) || 0;
      datDs(r.binhLuan);
      datTen(r.ten);
      datConCu(r.conCu);
      conCuRef.current = r.conCu;
      datCapNhatLuc(Date.now());
      datTt('ok');
    } catch (e) {
      if (laMatQuyen(e)) datTt('mat-quyen');
      else {
        datLoiTai(e);
        datTt('loi');
      }
    }
  }, [hoSoId, datDs]);
  useEffect(() => {
    void taiDau();
  }, [taiDau]);

  // --- Hỏi thay đổi -----------------------------------------------------------------
  const nhan = useCallback(
    (doi: MucBinhLuan[]) => {
      const r = hopNhat(dsRef.current, doi);
      datDs(r.ds);
      if (r.moi.length === 0) return;
      if (oCuoi.current) {
        datNoi(r.moi[r.moi.length - 1]!);
        datDocThay(r.moi.length === 1 ? 'Có 1 bình luận mới' : `Có ${r.moi.length} bình luận mới`);
      } else datMoi((cu) => [...cu, ...r.moi.filter((id) => !cu.includes(id))]);
    },
    [datDs],
  );

  const dangHoi = useRef(false);
  const hoi = useCallback(async () => {
    if (dangHoi.current || document.visibilityState !== 'visible') return;
    dangHoi.current = true;
    try {
      for (let lan = 0; lan < 10; lan++) {
        const r = await layJson<ThayDoiVe>(`/policies/${hoSoId}/binh-luan/thay-doi?tu=${moc.current}`);
        if (!dungHinh(r, 'thayDoi')) return;
        moc.current = r.moc;
        themTen(r.ten);
        nhan(r.thayDoi);
        if (!r.conNua) break;
      }
      datCapNhatLuc(Date.now());
    } catch (e) {
      // Mất quyền thì nói ra và thôi hỏi. Lỗi khác (mạng chập, máy chủ bận) KHÔNG báo:
      // lượt sau hỏi lại từ đúng mốc cũ nên không mất thay đổi nào, và một dải đỏ mỗi
      // 15 giây là đè lỗi của thứ người dùng không yêu cầu lên việc họ đang làm.
      if (laMatQuyen(e)) datTt('mat-quyen');
    } finally {
      dangHoi.current = false;
    }
  }, [hoSoId, nhan, themTen]);

  useEffect(() => {
    if (tt !== 'ok') return;
    const h = setInterval(() => {
      void hoi();
      datNhip((n) => n + 1);
    }, GIOI_HAN_BINH_LUAN.nhipHoiTrangMs);
    const doiTam = () => {
      if (document.visibilityState === 'visible') void hoi();
    };
    document.addEventListener('visibilitychange', doiTam);
    return () => {
      clearInterval(h);
      document.removeEventListener('visibilitychange', doiTam);
    };
  }, [tt, hoi]);

  // --- Có đang ở cuối khối không -----------------------------------------------------
  useEffect(() => {
    const el = moc_cuoi.current;
    if (tt !== 'ok' || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => {
      oCuoi.current = e?.isIntersecting ?? true;
      if (oCuoi.current) datMoi([]);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [tt]);

  // --- Thông báo tự thành đã đọc khi bình luận hiện trên màn hình (yêu cầu 6.3) ------
  const daBao = useRef(new Set<string>());
  const hang = useRef(new Set<string>());
  const henGui = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guiDaDoc = useCallback(() => {
    henGui.current = null;
    const ids = [...hang.current].slice(0, 100);
    for (const id of ids) hang.current.delete(id);
    if (ids.length === 0) return;
    // NUỐT CÓ LÝ DO (`0089`): đánh dấu đã đọc là việc phụ — hỏng thì dòng thông báo
    // còn chưa đọc, người dùng vẫn bấm vào được, chuông tự đúng lại ở nhịp 30 giây.
    danhDauDaDocBinhLuan(ids).catch(() => undefined);
    if (hang.current.size > 0) henGui.current = setTimeout(guiDaDoc, GOM_DA_DOC_MS);
  }, []);
  const daThay = useCallback(
    (id: string) => {
      if (daBao.current.has(id)) return;
      daBao.current.add(id);
      hang.current.add(id);
      if (!henGui.current) henGui.current = setTimeout(guiDaDoc, GOM_DA_DOC_MS);
    },
    [guiDaDoc],
  );
  useEffect(() => () => {
    if (henGui.current) clearTimeout(henGui.current);
  }, []);
  useEffect(() => {
    const k = khoi.current;
    if (tt !== 'ok' || !k) return;
    const cac = [...k.querySelectorAll<HTMLElement>('article[data-bl-id]:not([data-cua-toi])')];
    if (typeof IntersectionObserver === 'undefined') {
      // Trình duyệt không đo được khung nhìn: coi như đã thấy mọi thứ đã bày ra.
      for (const el of cac) daThay(el.dataset['blId']!);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) if (e.isIntersecting) daThay((e.target as HTMLElement).dataset['blId']!);
      },
      { threshold: 0.5 },
    );
    for (const el of cac) if (!daBao.current.has(el.dataset['blId']!)) io.observe(el);
    return () => io.disconnect();
  }, [tt, ds, daThay]);

  // --- Tô nổi -----------------------------------------------------------------------
  useEffect(() => {
    if (!noi) return;
    const h = setTimeout(() => datNoi(null), NOI_MS);
    return () => clearTimeout(h);
  }, [noi]);

  const cuonToi = useCallback((id: string, tieuDiem = true) => {
    // Một nhịp sau khi React vẽ xong — bình luận vừa tải thêm mới có trên trang.
    setTimeout(() => {
      const el = document.getElementById(neoBinhLuan(id));
      if (!el) return;
      el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      if (tieuDiem) el.focus({ preventScroll: true });
      datNoi(id);
    }, 0);
  }, []);

  // --- Tải thêm ------------------------------------------------------------------------
  const taiCu = useCallback(async (): Promise<boolean> => {
    const dau = dsRef.current[0];
    if (!dau || !conCuRef.current) return false;
    datDangTaiCu(true);
    try {
      const r = await layJson<TrangVe>(`/policies/${hoSoId}/binh-luan?truoc=${dau.stt}`);
      if (!dungHinh(r, 'binhLuan')) return false;
      themTen(r.ten);
      datDs((d) => [...r.binhLuan.filter((g) => !d.some((x) => x.id === g.id)), ...d]);
      datConCu(r.conCu);
      conCuRef.current = r.conCu;
      return true;
    } catch (e) {
      bao(e);
      return false;
    } finally {
      datDangTaiCu(false);
    }
  }, [hoSoId, bao, datDs, themTen]);

  const taiPhanHoi = useCallback(
    async (gocId: string): Promise<boolean> => {
      const g = dsRef.current.find((x) => x.id === gocId);
      if (!g) return false;
      const dau = g.phanHoi[0];
      datDangTaiPh(gocId);
      try {
        const r = await layJson<PhanHoiVe>(
          `/policies/${hoSoId}/binh-luan/${gocId}/phan-hoi${dau ? `?truoc=${dau.stt}` : ''}`,
        );
        if (!dungHinh(r, 'phanHoi')) return false;
        themTen(r.ten);
        datDs((d) =>
          d.map((x) =>
            x.id === gocId ? { ...x, phanHoi: [...r.phanHoi.filter((p) => !x.phanHoi.some((y) => y.id === p.id)), ...x.phanHoi] } : x,
          ),
        );
        return r.phanHoi.length > 0;
      } catch (e) {
        bao(e);
        return false;
      } finally {
        datDangTaiPh(null);
      }
    },
    [hoSoId, bao, datDs, themTen],
  );

  // --- Liên kết tới một bình luận (`#binh-luan-<id>`, yêu cầu 9.6) ---------------------
  const dangTimNeo = useRef(false);
  const moNeo = useCallback(async () => {
    const id = idTuNeo(window.location.hash);
    if (!id || dangTimNeo.current) return;
    dangTimNeo.current = true;
    try {
      for (let lan = 0; lan < TRAN_TIM_NEO; lan++) {
        if (timMuc(dsRef.current, id)) {
          cuonToi(id);
          return;
        }
        if (conCuRef.current) {
          if (!(await taiCu())) return;
          continue;
        }
        // Mọi gốc đã tải; còn lại là phản hồi cũ chưa mở — mở từng luồng, gốc mới trước.
        const conPh = [...dsRef.current]
          .reverse()
          .find((g) => (g.soPhanHoi ?? 0) > g.phanHoi.length);
        if (!conPh || !(await taiPhanHoi(conPh.id))) return;
      }
    } finally {
      dangTimNeo.current = false;
    }
  }, [cuonToi, taiCu, taiPhanHoi]);
  useEffect(() => {
    if (tt !== 'ok') return;
    void moNeo();
    const doi = () => void moNeo();
    window.addEventListener('hashchange', doi);
    return () => window.removeEventListener('hashchange', doi);
  }, [tt, moNeo]);

  // --- Thao tác --------------------------------------------------------------------------
  const nhanMot = useCallback(
    (r: { binhLuan: MucBinhLuan; ten: Record<string, string> }) => {
      themTen(r.ten);
      datDs((d) => thayMot(d, r.binhLuan));
    },
    [datDs, themTen],
  );

  const chepLienKet = async (id: string) => {
    try {
      await navigator.clipboard.writeText(lienKetBinhLuan(window.location.origin, hoSoId, id));
      datDocThay('Đã sao chép liên kết tới bình luận');
    } catch {
      datDocThay('Không sao chép được liên kết. Trình duyệt chặn truy cập bộ nhớ tạm.');
    }
  };

  const camXuc = async (id: string, loai: MaCamXuc, bat: boolean) => {
    const duong = `/policies/${hoSoId}/binh-luan/${id}/cam-xuc/${loai}`;
    try {
      nhanMot(
        bat
          ? await dat<{ binhLuan: MucBinhLuan; ten: Record<string, string> }>(duong, {})
          : await xoa<{ binhLuan: MucBinhLuan; ten: Record<string, string> }>(duong),
      );
    } catch (e) {
      bao(e);
    }
  };

  const xacNhanXoa = async () => {
    if (!hoiXoa) return;
    datDangXoa(true);
    try {
      nhanMot(await xoa<{ binhLuan: MucBinhLuan; ten: Record<string, string> }>(`/policies/${hoSoId}/binh-luan/${hoiXoa.id}`));
      if (dangTraLoi === hoiXoa.id) datDangTraLoi(null);
      datHoiXoa(null);
      datDocThay('Đã xoá bình luận');
    } catch (e) {
      datHoiXoa(null);
      bao(e);
    } finally {
      datDangXoa(false);
    }
  };

  const daGui = (r: { binhLuan: MucBinhLuan; ten: Record<string, string> }) => {
    nhanMot(r);
    datNoi(r.binhLuan.id);
    datDocThay(r.binhLuan.parentId ? 'Đã gửi phản hồi' : 'Đã gửi bình luận');
    void hoi();
  };

  const xuongMoi = () => {
    const dau = moi[0];
    datMoi([]);
    if (dau) cuonToi(dau, false);
  };

  // --- Dựng ------------------------------------------------------------------------------
  const tong = demTatCa(ds);
  const thaoTac = (m: MucBinhLuan, goc?: Luong) => ({
    ...(goc === undefined && !m.daXoa
      ? {
          traLoi: () => {
            datDangTraLoi(m.id);
          },
        }
      : {}),
    chepLienKet: () => void chepLienKet(m.id),
    hoiXoa: () => datHoiXoa(m),
    camXuc: (loai: MaCamXuc, bat: boolean) => camXuc(m.id, loai, bat),
    daSua: (r: { binhLuan: MucBinhLuan; ten: Record<string, string> }) => {
      nhanMot(r);
      datDocThay('Đã lưu bình luận');
    },
  });

  return (
    <section className="khoi-bl" aria-labelledby="tieu-de-bl" ref={khoi}>
      <div className="bl-dau">
        <h2 id="tieu-de-bl">Bình luận</h2>
        {tt === 'ok' && tong > 0 && <span className="bl-dem">{tong}</span>}
        {tt === 'ok' && <span className="bl-cap-nhat">{nhanCapNhat(capNhatLuc)}</span>}
      </div>
      <div className="bl-than">
        {tt === 'tai' && (
          <div aria-busy="true" aria-label="Đang tải bình luận">
            {[0, 1, 2].map((i) => (
              <div className="bl-xuong" key={i} aria-hidden="true">
                <i />
                <div>
                  <span style={{ width: '30%' }} />
                  <span style={{ width: `${70 + i * 8}%` }} />
                  <span style={{ width: '45%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {tt === 'loi' && (
          <div className="bl-bao-loi">
            <BaoLoi loi={loiTai} thuLai={() => void taiDau()} />
          </div>
        )}

        {tt === 'mat-quyen' && (
          <div className="bl-khoa" role="status">
            <BtKhoa />
            <div>
              <b>Bạn không còn quyền xem hồ sơ này.</b>
              Người phụ trách hoặc người duyệt của hồ sơ đã thay đổi. Bình luận ngừng tự cập nhật.
            </div>
          </div>
        )}

        {tt === 'ok' && (
          <>
            {ds.length === 0 ? (
              <div className="bl-trong">
                <b>Chưa có bình luận nào.</b>
                Hãy bắt đầu trao đổi về hồ sơ này. Gõ @ để nhắc người cần xem.
              </div>
            ) : (
              conCu && (
                <div className="bl-xem-cu">
                  <button type="button" className="nut-chu" disabled={dangTaiCu} onClick={() => void taiCu()}>
                    {dangTaiCu ? 'Đang tải…' : 'Xem bình luận cũ hơn'}
                  </button>
                </div>
              )
            )}

            {ds.map((g) => {
              const con = Math.max(0, (g.soPhanHoi ?? 0) - g.phanHoi.length);
              const coPhanHoi = g.phanHoi.length > 0 || con > 0;
              const traLoiO = dangTraLoi === g.id;
              return (
                <div className="bl-luong" key={g.id}>
                  <DongBinhLuan hoSoId={hoSoId} muc={g} ten={ten} laPhanHoi={false} noi={noi === g.id} tt={thaoTac(g)} />
                  {coPhanHoi && (
                    <div className="bl-phan-hoi">
                      {con > 0 ? (
                        <div className="bl-xem-them-ph">
                          <button
                            type="button"
                            className="nut-chu"
                            disabled={dangTaiPh === g.id}
                            onClick={() => void taiPhanHoi(g.id)}
                          >
                            <BtLen />
                            {dangTaiPh === g.id
                              ? 'Đang tải…'
                              : `Xem ${Math.min(con, GIOI_HAN_BINH_LUAN.trangPhanHoi)} phản hồi trước${
                                  con > GIOI_HAN_BINH_LUAN.trangPhanHoi ? ` (còn ${con} phản hồi)` : ''
                                }`}
                          </button>
                        </div>
                      ) : (
                        g.phanHoi.length > GIOI_HAN_BINH_LUAN.phanHoiXemTruoc && (
                          <div className="bl-xem-them-ph">
                            <button
                              type="button"
                              className="nut-chu"
                              onClick={() => {
                                datDs((d) =>
                                  d.map((x) =>
                                    x.id === g.id ? { ...x, phanHoi: x.phanHoi.slice(-GIOI_HAN_BINH_LUAN.phanHoiXemTruoc) } : x,
                                  ),
                                );
                                document.getElementById(neoBinhLuan(g.id))?.scrollIntoView?.({ block: 'start' });
                              }}
                            >
                              Thu gọn, chỉ hiện {GIOI_HAN_BINH_LUAN.phanHoiXemTruoc} phản hồi mới nhất
                            </button>
                          </div>
                        )
                      )}
                      {g.phanHoi.map((p) => (
                        <DongBinhLuan
                          key={p.id}
                          hoSoId={hoSoId}
                          muc={p}
                          ten={ten}
                          laPhanHoi
                          noi={noi === p.id}
                          tt={thaoTac(p, g)}
                        />
                      ))}
                    </div>
                  )}
                  {traLoiO && (
                    <div className="bl-soan-tra-loi">
                      <OSoanBinhLuan
                        hoSoId={hoSoId}
                        che="tra-loi"
                        parentId={g.id}
                        ten={ten}
                        traLoiTen={g.tacGia.ten}
                        gocDaXoa={g.daXoa}
                        tuFocus
                        huy={() => datDangTraLoi(null)}
                        xong={(r) => {
                          datDangTraLoi(null);
                          daGui(r);
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {moi.length > 0 && (
              <div className="bl-chi-bao-moi">
                <button type="button" className="nut nut-chinh" onClick={xuongMoi}>
                  <BtXuong />
                  {moi.length} bình luận mới
                </button>
              </div>
            )}

            <div className="bl-soan-chinh">
              <OSoanBinhLuan hoSoId={hoSoId} che="chinh" ten={ten} xong={daGui} />
            </div>
            <div ref={moc_cuoi} className="bl-moc-cuoi" aria-hidden="true" />
          </>
        )}
      </div>

      <p className="chi-doc-man-hinh" aria-live="polite">
        {docThay}
      </p>

      {hoiXoa && (
        <HopThoaiXacNhan
          tieuDe="Xoá bình luận?"
          hauQua={
            <p>
              Mọi người sẽ thấy “Bình luận này đã bị xoá.” thay cho nội dung.
              {hoiXoa.parentId === null && ' Các phản hồi vẫn được giữ.'}
              {hoiXoa.tep.length > 0 && ' Tệp đính kèm sẽ bị xoá khỏi hệ thống.'} Không khôi phục được.
            </p>
          }
          nhanNut="Xoá bình luận"
          dangChay={dangXoa}
          dong={() => datHoiXoa(null)}
          xacNhan={() => void xacNhanXoa()}
        />
      )}
    </section>
  );
}
