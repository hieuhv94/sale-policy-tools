/**
 * Một bình luận (`0264`) — gốc hay phản hồi, cùng một component.
 *
 * NỘI DUNG KHÔNG BAO GIỜ ĐI QUA HTML: các đoạn từ `doanBay` dựng thành phần tử React,
 * nên `<script>` hay `<img onerror>` trong chữ hiện ra đúng là chữ (yêu cầu §7). Có ca
 * quét cấm `dangerouslySetInnerHTML` trong cả thư mục này.
 */
import { useEffect, useRef, useState } from 'react';
import { CAM_XUC, MA_CAM_XUC, type MaCamXuc } from '@csbh/domain-policy';
import { layJson, xemTruoc } from '../../lib/api.js';
import { chuDau, ngayGio, NHAN_VAI_TRO } from '../../lib/format.js';
import { thoiGianTuongDoi } from '../../lib/thong-bao.js';
import {
  coChu,
  doanBay,
  loaiTep,
  NHAN_CAM_XUC,
  NHAN_LOAI_TEP,
  neoBinhLuan,
  type MucBinhLuan,
  type TepBinhLuan,
} from '../../lib/binh-luan.js';
import { XemTep } from '../XemTep.js';
import { BtBut, BtCuoi, BtLienKet, BtThem, BtTraLoi, BtXoa } from './BieuTuongBinhLuan.js';
import { OSoanBinhLuan } from './OSoanBinhLuan.js';

export type ThaoTacBinhLuan = {
  traLoi?: () => void;
  chepLienKet: () => void;
  /** Mở hộp hỏi lại — lượt xoá thật nằm ở `KhoiBinhLuan`, sau `HopThoaiXacNhan`. */
  hoiXoa: () => void;
  camXuc: (loai: MaCamXuc, bat: boolean) => Promise<void>;
  daSua: (r: { binhLuan: MucBinhLuan; ten: Record<string, string> }) => void;
};

export function DongBinhLuan({
  hoSoId,
  muc,
  ten,
  laPhanHoi,
  noi,
  tt,
}: {
  hoSoId: string;
  muc: MucBinhLuan;
  ten: Record<string, string>;
  laPhanHoi: boolean;
  /** Tô nổi chốc lát — bình luận mới tới, hoặc vừa mở bằng liên kết. */
  noi: boolean;
  tt: ThaoTacBinhLuan;
}) {
  const [dangSua, datDangSua] = useState(false);
  const [menu, datMenu] = useState(false);
  const khungMenu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const ngoai = (e: PointerEvent) => {
      if (!khungMenu.current?.contains(e.target as Node)) datMenu(false);
    };
    const phim = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') datMenu(false);
    };
    document.addEventListener('pointerdown', ngoai);
    document.addEventListener('keydown', phim);
    return () => {
      document.removeEventListener('pointerdown', ngoai);
      document.removeEventListener('keydown', phim);
    };
  }, [menu]);

  // Bình luận bị xoá (ở tab khác, hay qua lượt hỏi thay đổi) trong lúc đang sửa.
  useEffect(() => {
    if (muc.daXoa) datDangSua(false);
  }, [muc.daXoa]);

  const vaiTro = muc.tacGia.vaiTro ? NHAN_VAI_TRO[muc.tacGia.vaiTro] : null;
  const lop = `bl${muc.daXoa ? ' bl-da-xoa' : ''}${noi ? ' bl-moi' : ''}`;

  return (
    <article
      className={lop}
      id={neoBinhLuan(muc.id)}
      tabIndex={-1}
      data-bl-id={muc.id}
      data-cua-toi={muc.cuaToi ? '1' : undefined}
      aria-label={`Bình luận của ${muc.tacGia.ten}`}
    >
      <span className="anh-dai-dien" aria-hidden="true">
        {chuDau(muc.tacGia.ten)}
      </span>
      <div className="bl-cot">
        <div className="bl-dong-dau">
          <span className="bl-ten">{muc.tacGia.ten}</span>
          {vaiTro && !muc.daXoa && <span className="bl-vai">{vaiTro}</span>}
          <time className="bl-luc" dateTime={muc.taoLuc} title={ngayGio(muc.taoLuc)}>
            {thoiGianTuongDoi(muc.taoLuc)}
          </time>
          {muc.suaLuc && !muc.daXoa && (
            <span className="bl-sua" title={`Sửa lúc ${ngayGio(muc.suaLuc)}`}>
              · Đã sửa
            </span>
          )}
        </div>

        {muc.daXoa ? (
          <p className="bl-noi-dung">Bình luận này đã bị xoá.</p>
        ) : dangSua ? (
          <div className="bl-soan-sua">
            <OSoanBinhLuan
              hoSoId={hoSoId}
              che="sua"
              banDau={muc}
              ten={ten}
              tuFocus
              huy={() => datDangSua(false)}
              xong={(r) => {
                datDangSua(false);
                tt.daSua(r);
              }}
            />
          </div>
        ) : (
          <>
            {muc.noiDung && <NoiDung noiDung={muc.noiDung} ten={ten} />}
            {muc.tep.length > 0 && <DanhSachTep tep={muc.tep} />}
            <CamXuc muc={muc} thaTha={tt.camXuc} />
          </>
        )}
      </div>

      {!muc.daXoa && !dangSua && (
        <div className={`bl-thao-tac${menu ? ' mo' : ''}`} ref={khungMenu}>
          {!laPhanHoi && tt.traLoi && (
            <button
              type="button"
              className="nut-bieu-tuong"
              aria-label={`Trả lời ${muc.tacGia.ten}`}
              title="Trả lời"
              onClick={tt.traLoi}
            >
              <BtTraLoi />
            </button>
          )}
          <button
            type="button"
            className="nut-bieu-tuong"
            aria-label="Thao tác khác"
            title="Thao tác khác"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => datMenu((x) => !x)}
          >
            <BtThem />
          </button>
          {menu && (
            <div className="menu-so bl-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="menu-so-muc"
                onClick={() => {
                  datMenu(false);
                  tt.chepLienKet();
                }}
              >
                <BtLienKet />
                Sao chép liên kết
              </button>
              {muc.cuaToi && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-so-muc"
                    onClick={() => {
                      datMenu(false);
                      datDangSua(true);
                    }}
                  >
                    <BtBut />
                    Sửa
                  </button>
                  <hr className="bl-menu-ke" />
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-so-muc menu-so-thoat"
                    onClick={() => {
                      datMenu(false);
                      tt.hoiXoa();
                    }}
                  >
                    <BtXoa />
                    Xoá bình luận
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function NoiDung({ noiDung, ten }: { noiDung: string; ten: Record<string, string> }) {
  return (
    <p className="bl-noi-dung">
      {doanBay(noiDung, ten).map((d, i) =>
        d.loai === 'chu' ? (
          <span key={i}>{d.chu}</span>
        ) : d.loai === 'nhac' ? (
          <span key={i} className="bl-nhac">
            @{d.ten}
          </span>
        ) : (
          <a key={i} href={d.url} target="_blank" rel="noopener noreferrer">
            {d.url}
          </a>
        ),
      )}
    </p>
  );
}

// --- Cảm xúc ---------------------------------------------------------------------

function CamXuc({ muc, thaTha }: { muc: MucBinhLuan; thaTha: ThaoTacBinhLuan['camXuc'] }) {
  const [mo, datMo] = useState(false);
  const [dangGui, datDangGui] = useState<MaCamXuc | null>(null);
  const khung = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!mo) return;
    khung.current?.querySelector<HTMLButtonElement>('.bl-cx-bang button')?.focus();
    const ngoai = (e: PointerEvent) => {
      if (!khung.current?.contains(e.target as Node)) datMo(false);
    };
    const phim = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') datMo(false);
    };
    document.addEventListener('pointerdown', ngoai);
    document.addEventListener('keydown', phim);
    return () => {
      document.removeEventListener('pointerdown', ngoai);
      document.removeEventListener('keydown', phim);
    };
  }, [mo]);

  const bam = async (loai: MaCamXuc, bat: boolean) => {
    if (dangGui) return;
    datDangGui(loai);
    try {
      await thaTha(loai, bat);
    } finally {
      datDangGui(null);
    }
  };

  return (
    <div className="bl-hang-duoi">
      {muc.camXuc.map((c) => (
        <button
          key={c.loai}
          type="button"
          className="bl-cx"
          aria-pressed={c.cuaToi}
          title={c.nguoi.join(', ')}
          aria-label={`${NHAN_CAM_XUC[c.loai]}, ${c.so} người${c.cuaToi ? ', gồm bạn' : ''}`}
          disabled={dangGui !== null}
          onClick={() => void bam(c.loai, !c.cuaToi)}
        >
          <span aria-hidden="true">{CAM_XUC[c.loai]}</span>
          {c.so}
        </button>
      ))}
      <span className="bl-cx-boc" ref={khung}>
        <button
          type="button"
          className="bl-cx bl-cx-them"
          aria-label="Thả cảm xúc"
          aria-haspopup="menu"
          aria-expanded={mo}
          onClick={() => datMo((x) => !x)}
        >
          <BtCuoi />
        </button>
        {mo && (
          <div className="bl-cx-bang" role="menu" aria-label="Chọn cảm xúc">
            {MA_CAM_XUC.map((loai) => {
              const da = muc.camXuc.find((c) => c.loai === loai)?.cuaToi ?? false;
              return (
                <button
                  key={loai}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={da}
                  aria-label={NHAN_CAM_XUC[loai]}
                  title={NHAN_CAM_XUC[loai]}
                  onClick={() => {
                    datMo(false);
                    void bam(loai, !da);
                  }}
                >
                  {CAM_XUC[loai]}
                </button>
              );
            })}
          </div>
        )}
      </span>
    </div>
  );
}

// --- Tệp đính kèm -----------------------------------------------------------------

type DangXem = { duong: string; duongTai: string; ten: string };

/** Xin liên kết tải hai bước (`DOC-09`) — `xem=1` cho đường XEM, đường TẢI thì không. */
async function lienKet(id: string): Promise<DangXem> {
  const l = await layJson<{ url: string; fileName: string }>(`/files/${id}/link`);
  return { duong: `${l.url}&xem=1`, duongTai: l.url, ten: l.fileName };
}

function DanhSachTep({ tep }: { tep: TepBinhLuan[] }) {
  const [xem, datXem] = useState<DangXem | null>(null);
  const [loi, datLoi] = useState<string | null>(null);

  const mo = async (t: TepBinhLuan) => {
    datLoi(null);
    try {
      datXem({ ...(await lienKet(t.id)), ten: t.ten });
    } catch {
      // Tệp có thể vừa bị gỡ khỏi bình luận ở tab khác — nói ra tại chỗ, lượt hỏi
      // thay đổi kế tiếp sẽ cập nhật danh sách tệp.
      datLoi(`Không mở được tệp ${t.ten}. Tải lại trang rồi thử lại.`);
    }
  };

  return (
    <>
      <div className="bl-tep">
        {tep.map((t) => {
          const lt = loaiTep(t.loai);
          return lt === 'anh' ? (
            <button
              key={t.id}
              type="button"
              className="bl-tep-anh"
              aria-label={`Xem ảnh ${t.ten}, ${coChu(t.co)}`}
              title={t.ten}
              onClick={() => void mo(t)}
            >
              <AnhNho id={t.id} />
            </button>
          ) : (
            <button key={t.id} type="button" className="bl-tep-dong" title={t.ten} onClick={() => void mo(t)}>
              <span className={`bl-tep-loai loai-${lt}`} aria-hidden="true">
                {NHAN_LOAI_TEP[lt]}
              </span>
              <span className="bl-tep-ten">
                <b>{t.ten}</b>
                <small>
                  {NHAN_LOAI_TEP[lt]} · {coChu(t.co)}
                </small>
              </span>
            </button>
          );
        })}
      </div>
      {loi && (
        <p className="bl-loi-duoi" role="alert">
          {loi}
        </p>
      )}
      {xem && (
        <XemTep tieuDe={xem.ten} duong={xem.duong} duongTai={xem.duongTai} tenTep={xem.ten} dong={() => datXem(null)} />
      )}
    </>
  );
}

/**
 * Ảnh thu nhỏ: xin liên kết, tải về bộ nhớ, nhúng bằng `blob:` (thẻ `<img>` không gửi
 * header `Authorization`). Thu hồi URL khi tháo — như `AnhThuNho` của `TheTep`.
 *
 * ẢNH HỎNG THÌ IM LẶNG (`0089`, cùng lý do `TheTep`): ô ảnh vẫn bấm được để mở hộp xem,
 * nơi lỗi thật được nói ra. Báo lỗi ở đây là báo về một thứ trang trí.
 */
function AnhNho({ id }: { id: string }) {
  const [url, datUrl] = useState<string | null>(null);
  useEffect(() => {
    let song = true;
    let cu: string | null = null;
    lienKet(id)
      .then((l) => xemTruoc(l.duong))
      .then((x) => {
        cu = x.url;
        if (song) datUrl(x.url);
        else URL.revokeObjectURL(x.url);
      })
      .catch(() => undefined);
    return () => {
      song = false;
      if (cu) URL.revokeObjectURL(cu);
    };
  }, [id]);
  return url ? <img src={url} alt="" /> : <span className="bl-tep-anh-cho" aria-hidden="true" />;
}
