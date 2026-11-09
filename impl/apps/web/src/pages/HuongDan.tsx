/**
 * Trang *Hướng dẫn* (`0273`) — mọi vai trò vào được, mỗi người CHỈ thấy hướng
 * dẫn của vai trò mình (khách hàng chốt) cộng phần chung.
 *
 * Chỉ giao diện: nội dung là dữ liệu tĩnh ở `lib/huong-dan.ts`, không gọi API
 * nào. Vì thế không có trạng thái tải hay lỗi mạng để xử lý, và trang mở được
 * cả khi máy chủ đang bận.
 *
 * Ảnh nằm ở `public/huong-dan/`. Ảnh vắng mặt thì ẩn ảnh đi chứ không để hiện
 * biểu tượng ảnh hỏng — người đọc vẫn có đủ chữ; ca kiểm đòi mọi ảnh được nhắc
 * tới phải có thật, nên trường hợp này chỉ xảy ra khi bản dựng bị cắt bớt tệp.
 */
import { useState } from 'react';
import '../styles/huong-dan.css';
import { usePhien } from '../lib/auth.js';
import { NHAN_VAI_TRO } from '../lib/format.js';
import {
  HUONG_DAN_CHUNG,
  LUONG_DUYET,
  huongDanCua,
  type AnhHuongDan,
  type TrangHuongDan,
} from '../lib/huong-dan.js';
import { Lien } from '../lib/router.js';

function Anh({ anh }: { anh: AnhHuongDan }) {
  const [hong, datHong] = useState(false);
  if (hong) return null;
  return (
    <figure className="hd-anh">
      <img
        src={`/huong-dan/${anh.tep}`}
        alt={anh.chuThich}
        loading="lazy"
        onError={() => datHong(true)}
      />
      <figcaption>{anh.chuThich}</figcaption>
    </figure>
  );
}

/** Xuất ra để ca kiểm dựng được một trang `chiTiet: false` — mọi vai trò hiện đã viết đủ. */
export function MotTrang({ t, stt }: { t: TrangHuongDan; stt: number }) {
  return (
    <article className="hd-trang" id={`trang-${t.id}`} aria-labelledby={`tieu-de-${t.id}`}>
      <header className="hd-trang-dau">
        <h3 id={`tieu-de-${t.id}`}>
          <span className="hd-so">{stt}</span> {t.ten}
        </h3>
        {t.duong ? (
          <Lien den={t.duong} className="nut hd-mo-trang">
            Mở trang này
          </Lien>
        ) : null}
      </header>
      <p className="hd-muc-dich">{t.mucDich}</p>

      {t.khoi && t.khoi.length > 0 ? (
        <div className="hd-khoi">
          <h4>Trên trang này có</h4>
          <ul>
            {t.khoi.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!t.chiTiet ? (
        <p className="hd-chua-viet" role="note">
          Hướng dẫn từng bước cho trang này đang được biên soạn và sẽ có ở bản cập nhật sau.
        </p>
      ) : null}

      {t.buoc?.map((b, i) => (
        <section className="hd-buoc" key={b.tieuDe}>
          <h4>
            <span className="hd-buoc-so">{i + 1}</span> {b.tieuDe}
          </h4>
          {b.noiDung.map((d) => (
            <p key={d}>{d}</p>
          ))}
          {b.anh ? <Anh anh={b.anh} /> : null}
        </section>
      ))}

      {t.loiThuong && t.loiThuong.length > 0 ? (
        <div className="hd-hoi-dap">
          <h4>Hay gặp</h4>
          {t.loiThuong.map((q) => (
            <details key={q.hoi}>
              <summary>{q.hoi}</summary>
              <p>{q.traLoi}</p>
            </details>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function HuongDan() {
  const { nguoiDung } = usePhien();
  const hd = huongDanCua(nguoiDung?.role);
  const nhanVaiTro = nguoiDung ? (NHAN_VAI_TRO[nguoiDung.role] ?? nguoiDung.role) : '';

  return (
    <section className="trang hd">
      <div className="dau-trang">
        <h1>Hướng dẫn</h1>
      </div>
      <p className="hd-gioi-thieu">
        {hd
          ? `Hướng dẫn sử dụng phần mềm dành cho vai trò ${nhanVaiTro} của bạn.`
          : 'Hướng dẫn chung khi sử dụng phần mềm.'}
      </p>

      <nav className="hd-muc-luc" aria-label="Mục lục hướng dẫn">
        <ul>
          {hd ? (
            <li>
              <a href="#vai-tro">{hd.tieuDe}</a>
              <ul>
                {hd.trang.map((t) => (
                  <li key={t.id}>
                    <a href={`#trang-${t.id}`}>{t.ten}</a>
                  </li>
                ))}
              </ul>
            </li>
          ) : null}
          <li>
            <a href="#chung">Dành cho mọi người dùng</a>
            <ul>
              {HUONG_DAN_CHUNG.map((m) => (
                <li key={m.id}>
                  <a href={`#chung-${m.id}`}>{m.ten}</a>
                </li>
              ))}
            </ul>
          </li>
        </ul>
      </nav>

      {hd ? (
        <section id="vai-tro" className="hd-vai-tro" aria-labelledby="hd-vai-tro-tieu-de">
          <h2 id="hd-vai-tro-tieu-de">{hd.tieuDe}</h2>
          <p>{hd.gioiThieu}</p>

          <div className="hd-hai-cot">
            <div className="hd-khoi">
              <h4>Bạn làm gì</h4>
              <ul>
                {hd.lamGi.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div className="hd-khoi">
              <h4>Bạn không làm gì</h4>
              <ul>
                {hd.khongLam.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="hd-khoi">
            <h4>Một ngày làm việc điển hình</h4>
            <ol>
              {hd.ngayLamViec.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
          </div>

          <h2 className="hd-tieu-de-nhom">Hướng dẫn từng trang</h2>
          {hd.trang.map((t, i) => (
            <MotTrang key={t.id} t={t} stt={i + 1} />
          ))}
        </section>
      ) : null}

      <section id="chung" className="hd-chung" aria-labelledby="hd-chung-tieu-de">
        <h2 id="hd-chung-tieu-de">Dành cho mọi người dùng</h2>

        {HUONG_DAN_CHUNG.map((m) => (
          <article key={m.id} id={`chung-${m.id}`} className="hd-muc-chung">
            <h3>{m.ten}</h3>
            {m.noiDung.map((d) => (
              <p key={d}>{d}</p>
            ))}
            {m.id === 'luong-duyet' ? (
              <ol className="hd-luong" aria-label="Các chặng của luồng duyệt">
                {LUONG_DUYET.map((b) => (
                  <li key={b.ten}>
                    <strong>{b.ten}</strong>
                    <span>{b.ai}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </article>
        ))}
      </section>
    </section>
  );
}
