/**
 * Ô soạn bình luận (`0264`) — một component cho ba chỗ: ô chung ở cuối khối, ô trả
 * lời ở cuối một luồng, ô sửa ngay trong bình luận (chốt mockup: sửa và trả lời làm
 * TẠI CHỖ).
 *
 * Bốn điều khó, mỗi điều một chỗ trong tệp này:
 *
 *   1. NHẮC TÊN trong một `<textarea>` trơn — xem `lib/binh-luan.ts` (`NhacChon`).
 *   2. GỬI LẠI không sinh bình luận thứ hai: `maGui` giữ nguyên qua mọi lượt thử lại,
 *      chỉ đổi sau một lượt THÀNH CÔNG; máy chủ trả lại đúng bình luận đã có (`0261`).
 *   3. KHÔNG LƯU NHÁP (yêu cầu 3.6): còn chữ hay tệp thì trình duyệt hỏi trước khi
 *      tải lại/đóng tab (`beforeunload`) và ứng dụng hỏi trước khi chuyển màn hình
 *      (`dangKyChanRoi`). Không gì ghi vào `localStorage`.
 *   4. LỖI GỬI giữ nguyên chữ và tệp, câu lỗi ngay dưới ô, kèm *Thử lại*.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { demKyTu, GIOI_HAN_BINH_LUAN } from '@csbh/domain-policy';
import { dang, guiTep, layJson, LoiApi, va } from '../../lib/api.js';
import { useBaoLoi } from '../../lib/bao-loi.js';
import { docLoi } from '../../lib/loi.js';
import { chuDau, NHAN_VAI_TRO } from '../../lib/format.js';
import { dangKyChanRoi } from '../../lib/router.js';
import {
  chenNhac,
  coChu,
  duongTaiTep,
  kiemTepTruoc,
  loaiTep,
  NHAN_LOAI_TEP,
  sangNoiDung,
  TEP_NHAN,
  tachKhop,
  timNhacDangGo,
  tuNoiDung,
  xoaLuiNhac,
  type MucBinhLuan,
  type NhacChon,
} from '../../lib/binh-luan.js';
import { BtCanh, BtDong, BtKep } from './BieuTuongBinhLuan.js';

export type CheSoan = 'chinh' | 'tra-loi' | 'sua';

type TepCho = {
  khoa: string;
  ten: string;
  co: number;
  loai: string;
  trangThai: 'dang' | 'xong' | 'hong';
  id?: string;
  loi?: string;
  file?: File;
};

type NguoiGoiY = { id: string; ten: string; email: string; vaiTro: string };
/** `lan` đổi ở mỗi lượt *Thử lại* để effect tìm người chạy lại với cùng `q`. */
type GoiY = { batDau: number; q: string; chon: number; tt: 'tai' | 'loi' | 'ok'; ds: NguoiGoiY[]; lan: number };

/** Nhóm trước khi gọi máy chủ tìm người — đủ để không hỏi một lượt cho mỗi chữ gõ. */
export const CHO_TIM_MS = 250;

/** Thiết bị cảm ứng: Enter xuống dòng, chỉ nút Gửi mới gửi (yêu cầu 9.3). */
const laCamUng = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

const uuidMoi = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export function OSoanBinhLuan({
  hoSoId,
  che,
  parentId,
  banDau,
  ten,
  traLoiTen,
  gocDaXoa = false,
  xong,
  huy,
  tuFocus = false,
}: {
  hoSoId: string;
  che: CheSoan;
  parentId?: string;
  /** Bình luận đang sửa (`che = 'sua'`). */
  banDau?: MucBinhLuan;
  /** Bảng tên hiện tại — để mở bình luận cũ ra sửa với đúng tên người được nhắc. */
  ten: Record<string, string>;
  traLoiTen?: string;
  /** Bình luận đang trả lời vừa bị xoá (biết qua lượt hỏi thay đổi). */
  gocDaXoa?: boolean;
  xong: (r: { binhLuan: MucBinhLuan; ten: Record<string, string> }) => void;
  huy?: () => void;
  tuFocus?: boolean;
}) {
  const { bao } = useBaoLoi();
  const idO = useId();
  const [dauVao] = useState(() =>
    banDau?.noiDung ? tuNoiDung(banDau.noiDung, ten) : { chu: '', nhac: [] as NhacChon[] },
  );
  const [chu, datChu] = useState(dauVao.chu);
  const [nhac, datNhac] = useState<NhacChon[]>(dauVao.nhac);
  const [tep, datTep] = useState<TepCho[]>(() =>
    (banDau?.tep ?? []).map((t) => ({ khoa: t.id, ten: t.ten, co: t.co, loai: t.loai, trangThai: 'xong' as const, id: t.id })),
  );
  const [loi, datLoi] = useState<string | null>(null);
  const [dangGui, datDangGui] = useState(false);
  const [keo, datKeo] = useState(false);
  const [goiY, datGoiY] = useState<GoiY | null>(null);
  const maGui = useRef(uuidMoi());
  const khoaGui = useRef(false);
  const o = useRef<HTMLTextAreaElement>(null);
  const chonTep = useRef<HTMLInputElement>(null);
  const datCaret = useRef<number | null>(null);

  const noiDung = sangNoiDung(chu, nhac);
  const soKyTu = demKyTu(noiDung.trim());
  const quaDai = soKyTu > GIOI_HAN_BINH_LUAN.kyTuToiDa;
  const dangTai = tep.some((t) => t.trangThai === 'dang');
  const tepXong = tep.filter((t) => t.trangThai === 'xong');
  const rong = noiDung.trim() === '' && tepXong.length === 0;
  const khongDoi =
    che === 'sua' &&
    banDau !== undefined &&
    noiDung.trim() === (banDau.noiDung ?? '').trim() &&
    tepXong.map((t) => t.id).join() === banDau.tep.map((t) => t.id).join();
  const coSoan = che === 'sua' ? !khongDoi : chu.trim() !== '' || tep.length > 0;

  // --- Không lưu nháp: hỏi trước khi mất chữ -----------------------------------
  const coSoanRef = useRef(coSoan);
  coSoanRef.current = coSoan;
  useEffect(() => dangKyChanRoi(() => coSoanRef.current), []);
  useEffect(() => {
    if (!coSoan) return;
    const hoi = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', hoi);
    return () => window.removeEventListener('beforeunload', hoi);
  }, [coSoan]);

  // --- Tự giãn, tiêu điểm, con trỏ ---------------------------------------------
  useEffect(() => {
    const t = o.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 240)}px`;
    if (datCaret.current !== null) {
      t.setSelectionRange(datCaret.current, datCaret.current);
      datCaret.current = null;
    }
  }, [chu]);
  useEffect(() => {
    if (!tuFocus || !o.current) return;
    o.current.focus();
    const n = o.current.value.length;
    o.current.setSelectionRange(n, n);
  }, [tuFocus]);

  // --- Gợi ý nhắc tên ------------------------------------------------------------
  const q = goiY?.q;
  const lanTim = goiY?.lan ?? 0;
  useEffect(() => {
    if (q === undefined) return;
    let song = true;
    const h = setTimeout(() => {
      layJson<{ nguoi: NguoiGoiY[] }>(`/policies/${hoSoId}/binh-luan/nguoi-nhac?q=${encodeURIComponent(q)}`)
        .then((r) => {
          if (song) datGoiY((g) => (g && g.q === q ? { ...g, tt: 'ok', ds: r.nguoi, chon: 0 } : g));
        })
        .catch(() => {
          if (song) datGoiY((g) => (g && g.q === q ? { ...g, tt: 'loi', ds: [] } : g));
        });
    }, CHO_TIM_MS);
    return () => {
      song = false;
      clearTimeout(h);
    };
  }, [q, lanTim, hoSoId]);

  const capNhatGoiY = (gia: string, caret: number) => {
    const m = timNhacDangGo(gia, caret);
    if (!m) {
      datGoiY(null);
      return;
    }
    datGoiY((g) => (g && g.batDau === m.batDau && g.q === m.q ? g : { ...m, chon: 0, tt: 'tai', ds: g?.ds ?? [], lan: 0 }));
  };

  const chonNguoi = (n: NguoiGoiY) => {
    if (!goiY || !o.current) return;
    const r = chenNhac(chu, o.current.selectionStart, goiY.batDau, { id: n.id, ten: n.ten });
    datCaret.current = r.caret;
    datChu(r.chu);
    datNhac((ds) => (ds.some((x) => x.id === n.id) ? ds : [...ds, { id: n.id, ten: n.ten }]));
    datGoiY(null);
    o.current.focus();
  };

  // --- Tệp -----------------------------------------------------------------------
  const taiMot = useCallback(
    async (khoa: string, f: File) => {
      datTep((ds) =>
        ds.map((t) => {
          if (t.khoa !== khoa) return t;
          const { loi: _bo, ...con } = t;
          return { ...con, trangThai: 'dang' };
        }),
      );
      try {
        const form = new FormData();
        form.append('file', f, f.name);
        const r = await guiTep<{ id: string; fileName: string; contentType: string; sizeBytes: string }>(
          duongTaiTep(hoSoId, f.name),
          form,
        );
        datTep((ds) =>
          ds.map((t) =>
            t.khoa === khoa ? { ...t, trangThai: 'xong', id: r.id, loai: r.contentType, co: Number(r.sizeBytes) } : t,
          ),
        );
      } catch (e) {
        datTep((ds) => ds.map((t) => (t.khoa === khoa ? { ...t, trangThai: 'hong', loi: docLoi(e).cau } : t)));
      }
    },
    [hoSoId],
  );

  const themTep = (files: FileList | File[]) => {
    const ds = [...files];
    let cho = GIOI_HAN_BINH_LUAN.tepToiDa - tep.length;
    for (const f of ds) {
      if (cho <= 0) {
        datLoi(`Một bình luận đính kèm tối đa ${GIOI_HAN_BINH_LUAN.tepToiDa} tệp.`);
        break;
      }
      cho--;
      const khoa = uuidMoi();
      const sai = kiemTepTruoc(f);
      const moi: TepCho = { khoa, ten: f.name, co: f.size, loai: f.type || f.name, trangThai: sai ? 'hong' : 'dang', file: f, ...(sai ? { loi: sai } : {}) };
      datTep((x) => [...x, moi]);
      if (!sai) void taiMot(khoa, f);
    }
  };

  // --- Gửi ------------------------------------------------------------------------
  const gui = async () => {
    if (khoaGui.current || rong || dangTai || quaDai || khongDoi) return;
    khoaGui.current = true;
    datDangGui(true);
    datLoi(null);
    const ids = tepXong.map((t) => t.id!);
    try {
      const r =
        che === 'sua'
          ? await va<{ binhLuan: MucBinhLuan; ten: Record<string, string> }>(
              `/policies/${hoSoId}/binh-luan/${banDau!.id}`,
              { noiDung, tep: ids },
            )
          : await dang<{ binhLuan: MucBinhLuan; ten: Record<string, string> }>(`/policies/${hoSoId}/binh-luan`, {
              maGui: maGui.current,
              noiDung,
              ...(parentId ? { parentId } : {}),
              tep: ids,
            });
      maGui.current = uuidMoi();
      coSoanRef.current = false;
      datChu('');
      datNhac([]);
      datTep([]);
      xong(r);
    } catch (e) {
      const d = docLoi(e);
      if (d.dang === 'o-nhap') datLoi(d.cau);
      else if (d.laLoiMang || (e instanceof LoiApi && e.status >= 500)) {
        datLoi(`Không gửi được ${che === 'sua' ? 'nội dung đã sửa' : 'bình luận'}. Nội dung vẫn còn trong ô, bạn có thể thử lại.`);
      } else bao(e);
    } finally {
      khoaGui.current = false;
      datDangGui(false);
    }
  };

  // --- Bàn phím -------------------------------------------------------------------
  const phim = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (goiY) {
      const n = goiY.ds.length;
      if (e.key === 'Escape') {
        e.preventDefault();
        datGoiY(null);
        return;
      }
      if (goiY.tt === 'ok' && n > 0) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          datGoiY({ ...goiY, chon: (goiY.chon + (e.key === 'ArrowDown' ? 1 : n - 1)) % n });
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          chonNguoi(goiY.ds[goiY.chon % n]!);
          return;
        }
      }
    }
    if (e.key === 'Backspace' && o.current && o.current.selectionStart === o.current.selectionEnd) {
      const r = xoaLuiNhac(chu, o.current.selectionStart, nhac);
      if (r) {
        e.preventDefault();
        datCaret.current = r.caret;
        datChu(r.chu);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !laCamUng()) {
      e.preventDefault();
      void gui();
    }
  };

  const nhan = che === 'sua' ? 'Lưu' : che === 'tra-loi' ? 'Trả lời' : 'Gửi';
  const idDs = `${idO}-ds`;
  const moGoiY = goiY !== null;

  return (
    <div className="bl-soan-boc">
      {gocDaXoa && (
        <div className="bl-ghi-chu-xoa" role="status">
          <BtCanh />
          <span>
            Bình luận bạn đang trả lời vừa bị tác giả xoá. Nội dung bạn đã gõ vẫn còn bên dưới; bạn có thể chép lại hoặc huỷ.
          </span>
        </div>
      )}
      <div
        className={`bl-soan${keo ? ' keo' : ''}${loi ? ' loi' : ''}`}
        onDragOver={(e) => {
          if ([...e.dataTransfer.types].includes('Files')) {
            e.preventDefault();
            datKeo(true);
          }
        }}
        onDragLeave={() => datKeo(false)}
        onDrop={(e) => {
          if (e.dataTransfer.files.length === 0) return;
          e.preventDefault();
          datKeo(false);
          themTep(e.dataTransfer.files);
        }}
      >
        {che === 'tra-loi' && traLoiTen && (
          <div className="bl-soan-ngu-canh">
            Đang trả lời <b>{traLoiTen}</b>
            {huy && (
              <button type="button" className="nut-bieu-tuong" aria-label="Huỷ trả lời" onClick={huy}>
                <BtDong />
              </button>
            )}
          </div>
        )}
        <label className="chi-doc-man-hinh" htmlFor={idO}>
          {che === 'sua' ? 'Sửa bình luận' : che === 'tra-loi' ? 'Trả lời bình luận' : 'Viết bình luận'}
        </label>
        <textarea
          id={idO}
          ref={o}
          rows={2}
          value={chu}
          readOnly={dangGui}
          placeholder={che === 'tra-loi' ? 'Viết phản hồi…' : 'Viết bình luận… Gõ @ để nhắc tên'}
          aria-describedby={`${idO}-goi-y`}
          aria-invalid={loi ? true : undefined}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={moGoiY}
          aria-controls={moGoiY ? idDs : undefined}
          aria-activedescendant={goiY?.tt === 'ok' && goiY.ds.length ? `${idDs}-${goiY.chon % goiY.ds.length}` : undefined}
          onChange={(e) => {
            datChu(e.target.value);
            if (loi) datLoi(null);
            capNhatGoiY(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={phim}
          onClick={(e) => capNhatGoiY(chu, e.currentTarget.selectionStart)}
          onBlur={() => setTimeout(() => datGoiY(null), 150)}
        />
        {tep.length > 0 && (
          <div className="bl-soan-tep">
            {tep.map((t) => {
              const lt = loaiTep(t.loai);
              return (
                <div key={t.khoa} className={`bl-tep-cho${t.trangThai === 'hong' ? ' hong' : ''}`}>
                  <span className={`bl-tep-loai loai-${lt}`} aria-hidden="true">
                    {NHAN_LOAI_TEP[lt]}
                  </span>
                  <span className="bl-tep-ten">
                    <b title={t.ten}>{t.ten}</b>
                    <small>{t.trangThai === 'hong' ? t.loi : t.trangThai === 'dang' ? 'Đang tải lên…' : coChu(t.co)}</small>
                  </span>
                  {t.trangThai === 'hong' && t.file && !kiemTepTruoc(t.file) && (
                    <button type="button" className="nut-chu" onClick={() => void taiMot(t.khoa, t.file!)}>
                      Thử lại
                    </button>
                  )}
                  <button
                    type="button"
                    className="nut-bieu-tuong"
                    aria-label={`Gỡ tệp ${t.ten}`}
                    onClick={() => datTep((ds) => ds.filter((x) => x.khoa !== t.khoa))}
                  >
                    <BtDong />
                  </button>
                  {t.trangThai === 'dang' && <span className="bl-tien-do" aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        )}
        <div className="bl-soan-chan">
          <input
            ref={chonTep}
            type="file"
            multiple
            accept={TEP_NHAN}
            hidden
            onChange={(e) => {
              if (e.target.files) themTep(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="nut-bieu-tuong"
            aria-label="Đính kèm tệp"
            title={`Đính kèm tệp (ảnh, PDF, Word, Excel · tối đa ${GIOI_HAN_BINH_LUAN.tepToiDa} tệp, ${GIOI_HAN_BINH_LUAN.coTepToiDaByte / 1024 / 1024}MB mỗi tệp)`}
            disabled={dangGui || tep.length >= GIOI_HAN_BINH_LUAN.tepToiDa}
            onClick={() => chonTep.current?.click()}
          >
            <BtKep />
          </button>
          <span className="bl-goi-y" id={`${idO}-goi-y`}>
            {quaDai ? (
              <span className="bl-qua-dai">
                {soKyTu.toLocaleString('vi-VN')}/{GIOI_HAN_BINH_LUAN.kyTuToiDa.toLocaleString('vi-VN')} ký tự — quá dài
              </span>
            ) : (
              `Enter để ${che === 'sua' ? 'lưu' : 'gửi'} · Shift + Enter xuống dòng`
            )}
          </span>
          {huy && che !== 'chinh' && (
            <button type="button" className="nut nut-nhe" onClick={huy} disabled={dangGui}>
              Huỷ
            </button>
          )}
          <button
            type="button"
            className="nut nut-chinh"
            disabled={rong || dangTai || dangGui || quaDai || khongDoi}
            onClick={() => void gui()}
          >
            {dangGui ? 'Đang gửi…' : nhan}
          </button>
        </div>
      </div>
      {loi && (
        <p className="bl-loi-duoi" role="alert">
          <BtCanh />
          <span>{loi}</span>
          {!rong && !dangTai && (
            <button type="button" className="nut-chu" onClick={() => void gui()}>
              Thử lại
            </button>
          )}
        </p>
      )}
      {goiY && <DanhSachGoiY id={idDs} goiY={goiY} chon={chonNguoi} thuLai={() => datGoiY({ ...goiY, tt: 'tai', lan: goiY.lan + 1 })} />}
    </div>
  );
}

function DanhSachGoiY({
  id,
  goiY,
  chon,
  thuLai,
}: {
  id: string;
  goiY: GoiY;
  chon: (n: NguoiGoiY) => void;
  thuLai: () => void;
}) {
  return (
    <div className="bl-goi-y-nhac">
      {goiY.tt === 'tai' && goiY.ds.length === 0 ? (
        <div className="bl-goi-y-trang" role="status">
          Đang tải…
        </div>
      ) : goiY.tt === 'loi' ? (
        <div className="bl-goi-y-trang loi" role="alert">
          Không tải được danh sách.{' '}
          <button type="button" className="nut-chu" onMouseDown={(e) => e.preventDefault()} onClick={thuLai}>
            Thử lại
          </button>
        </div>
      ) : goiY.ds.length === 0 ? (
        <div className="bl-goi-y-trang">Không tìm thấy người dùng</div>
      ) : (
        <>
          <ul role="listbox" id={id} aria-label="Người có thể nhắc tên">
            {goiY.ds.map((n, i) => {
              const [a, b, c] = tachKhop(n.ten, goiY.q);
              return (
                <li
                  key={n.id}
                  id={`${id}-${i}`}
                  role="option"
                  aria-selected={i === goiY.chon % goiY.ds.length}
                  // `mousedown` chứ không `click`: `click` tới SAU `blur` của ô soạn, và
                  // `blur` đã đóng danh sách.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    chon(n);
                  }}
                >
                  <span className="anh-dai-dien" aria-hidden="true">
                    {chuDau(n.ten)}
                  </span>
                  <span className="bl-goi-y-nguoi">
                    <span className="ten">
                      {a}
                      {b && <mark>{b}</mark>}
                      {c}
                    </span>
                    <small>
                      {NHAN_VAI_TRO[n.vaiTro] ?? n.vaiTro} · {n.email}
                    </small>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="bl-goi-y-chan">↑ ↓ để chọn · Enter để chèn · Esc để đóng</div>
        </>
      )}
    </div>
  );
}
