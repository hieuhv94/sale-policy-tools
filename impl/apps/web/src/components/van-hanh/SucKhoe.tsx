/**
 * Thẻ Sức khoẻ (`0255`) — mở trang là thấy ngay "hệ thống có ổn không".
 *
 * Trên cùng là danh sách VIỆC CẦN CHÚ Ý (dựng ở `canhBao`, mỗi dòng dẫn tới đúng thẻ để xử
 * lý), rồi bốn ô số, rồi bảng thành phần. Không có dải trạng thái trên đầu trang (chốt
 * 05/11) — danh sách cảnh báo rỗng chính là câu "mọi thứ bình thường".
 */
import { ngayGio } from '../../lib/format.js';
import { HA_TANG, NHAN_THANH_PHAN, canhBao, type SucKhoe as DuLieu, type The } from '../../lib/van-hanh.js';
import { ChiSo } from '../Chung.js';

type DongThanhPhan = { service: string; loai: 'Phần mềm' | 'Nền tảng'; tot: boolean | null; nhan: string };

function thanhPhan(sk: DuLieu): DongThanhPhan[] {
  const ds: DongThanhPhan[] = sk.thanhPhan.services.map((s) => ({
    service: s.service,
    loai: 'Phần mềm',
    tot: s.ok,
    nhan: s.ok ? 'sẵn sàng' : 'không trả lời',
  }));
  for (const ten of HA_TANG) {
    const c = sk.container.find((x) => x.service === ten);
    if (!c) {
      // Tác tử chưa từng gửi số liệu (chưa cài, hoặc mất liên lạc từ lâu).
      ds.push({ service: ten, loai: 'Nền tảng', tot: null, nhan: 'chưa có số liệu' });
      continue;
    }
    const chay = c.trangThai === 'running';
    const tot = chay && c.sucKhoe !== 'unhealthy' && c.sucKhoe !== 'starting';
    ds.push({
      service: ten,
      loai: 'Nền tảng',
      tot: chay && c.sucKhoe === 'starting' ? null : tot,
      nhan: !chay ? 'không chạy' : c.sucKhoe === 'unhealthy' ? 'trục trặc' : c.sucKhoe === 'starting' ? 'đang khởi động' : 'sẵn sàng',
    });
  }
  return ds;
}

export function TheSucKhoe({ sk, moThe }: { sk: DuLieu; moThe: (t: The) => void }) {
  const cb = canhBao(sk);
  const sl = (v: string) => sk.saoLuu.find((s) => s.viec === v);
  const csdl = sl('SAO_LUU_CSDL');
  const tep = sl('SAO_LUU_KHO_TEP');
  const loiHangDoi = sk.hangDoiLoi.reduce((t, h) => t + (h.so ?? 0), 0);

  return (
    <>
      {cb.length === 0 ? (
        <p className="tom-tat-tot" role="status">
          Mọi thứ đang hoạt động bình thường.
        </p>
      ) : (
        <ul className="ds-canh-bao-vh" aria-label="Việc cần chú ý">
          {cb.map((c) => (
            <li key={c.cau} className={c.muc === 'do' ? 'muc-do' : 'muc-vang'}>
              <span>{c.cau}</span>
              <button type="button" className="nut nut-nhe" onClick={() => moThe(c.the)}>
                Xem
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="luoi-chi-so">
        <ChiSo
          nhan="Sao lưu cơ sở dữ liệu gần nhất"
          giaTri={csdl?.lanThanhCong ? ngayGio(csdl.lanThanhCong) : 'chưa có'}
          kieu={csdl && (csdl.quaHan || csdl.lanGanNhat === 'LOI') ? 'loi' : 'tot'}
        />
        <ChiSo
          nhan="Sao lưu kho tệp gần nhất"
          giaTri={tep?.lanThanhCong ? ngayGio(tep.lanThanhCong) : 'chưa có'}
          kieu={tep && (tep.quaHan || tep.lanGanNhat === 'LOI') ? 'loi' : 'tot'}
        />
        <ChiSo nhan="Thư gửi hỏng" giaTri={sk.thuHong} kieu={sk.thuHong > 0 ? 'canh-bao' : 'tot'} />
        <ChiSo nhan="Sự kiện xử lý hỏng" giaTri={loiHangDoi} kieu={loiHangDoi > 0 ? 'canh-bao' : 'tot'} />
      </div>

      <section className="khoi">
        <h2>Thành phần hệ thống</h2>
        <div className="khung-cuon" role="region" aria-label="Thành phần hệ thống" tabIndex={0}>
          <table className="bang">
            <thead>
              <tr>
                <th>Thành phần</th>
                <th>Loại</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {thanhPhan(sk).map((t) => (
                <tr key={t.service}>
                  <td>
                    {NHAN_THANH_PHAN[t.service] ?? t.service} <span className="ma-phu">{t.service}</span>
                  </td>
                  <td>{t.loai}</td>
                  <td>
                    <span className={`nhan ${t.tot === null ? 'nhan-thuong' : t.tot ? 'nhan-tot' : 'nhan-loi'}`}>{t.nhan}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
