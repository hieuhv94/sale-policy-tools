/**
 * Các khối KHÔNG đọc báo cáo hồ sơ: mẫu hợp đồng, thư hỏng, người dùng, danh
 * mục, nhật ký.
 *
 * Mỗi khối tự gọi endpoint của nó và tự hỏng riêng. Đây là chỗ cần điều đó nhất:
 * bộ khối của Quản trị hệ thống chạm bốn service khác nhau, và `notification`
 * chết thì ba khối kia vẫn phải hiện.
 */
import { ngayGio } from '../../lib/format.js';
import { useTai } from '../../lib/tai.js';
import { ChiSo, Trong } from '../Chung.js';
import { Khoi } from './Khung.js';

type TrangCoTong = { total: number };

/**
 * Cảnh báo mẫu hợp đồng — CHỈ Sale Admin.
 *
 * Không có bản đang áp dụng thì mọi lần Kế toán bấm *Xuất hợp đồng* đều hỏng, mà
 * Kế toán không có quyền vào sửa và cũng không đoán ra nguyên nhân. Người duy
 * nhất chữa được là Sale Admin, nên cảnh báo phải nằm trên màn hình của họ và
 * phải nằm TRÊN hộp việc.
 */
export function CanhBaoMauHopDong() {
  // Endpoint này trả về MẢNG trần, không bọc `{ items }` như phần lớn endpoint
  // khác (`templates.service.ts:84`).
  const { du } = useTai<{ id: string; name: string; isActive: boolean }[]>('/contract-templates');
  // Chưa tải xong, hoặc gọi hỏng: KHÔNG cảnh báo. Một dải đỏ hiện ra chớp nhoáng
  // rồi biến mất còn tệ hơn là không có dải nào.
  if (du === null) return null;
  if (du.some((m) => m.isActive)) return null;

  return (
    <div className="bao-loi" role="alert">
      <p className="bao-loi-chinh">Chưa có mẫu hợp đồng nào đang áp dụng.</p>
      <p className="bao-loi-phu">
        Kế toán sẽ không xuất được hợp đồng cho bất kỳ hồ sơ nào. Vào mục{' '}
        <em>Mẫu hợp đồng</em> để tải mẫu lên và bấm áp dụng.
      </p>
    </div>
  );
}

/** Cảnh báo thư hỏng — CHỈ Quản trị hệ thống. */
export function CanhBaoThuHong() {
  const { du } = useTai<TrangCoTong>('/notifications/dead-letters?open=true&limit=1');
  if (du === null || du.total === 0) return null;

  return (
    <div className="bao-loi" role="alert">
      <p className="bao-loi-chinh">
        {du.total} thư chưa gửi được và chưa ai xử lý.
      </p>
      <p className="bao-loi-phu">
        Người phụ trách ở những bước đó KHÔNG nhận được thông báo — họ sẽ không biết có hồ sơ đang
        chờ mình cho tới khi tự mở phần mềm ra xem.
      </p>
    </div>
  );
}

type NguoiDung = { id: string; isActive: boolean; activatedAt: string | null };

/**
 * Bốn ô sức khoẻ hệ thống, thay cho dải thẻ trạng thái mà Quản trị không có.
 *
 * Đếm người dùng ở phía giao diện từ một trang 200 dòng: danh sách người dùng
 * của công ty này là hàng chục, không phải hàng nghìn, và `/admin/users` không
 * có đường nào trả về số đã lọc sẵn.
 */
export function OHeThong() {
  const thu = useTai<TrangCoTong>('/notifications/dead-letters?open=true&limit=1');
  const nd = useTai<{ items: NguoiDung[]; total: number }>('/admin/users?limit=200');
  // `forNewPolicy=true` là cách DUY NHẤT lọc bỏ sản phẩm đã vô hiệu hoá —
  // `/catalog/products` không nhận tham số `status` (products.service.ts:161).
  const sp = useTai<TrangCoTong>('/catalog/products?limit=1&forNewPolicy=true');

  const loi = thu.loi ?? nd.loi ?? sp.loi;
  const dangTai = thu.dangTai || nd.dangTai || sp.dangTai;
  if (loi !== null && loi !== undefined) return <Khoi tieuDe="Sức khoẻ hệ thống" loi={loi} />;
  if (dangTai) return <Khoi tieuDe="Sức khoẻ hệ thống" dangTai />;

  const chuaKichHoat = nd.du?.items.filter((u) => u.activatedAt === null).length ?? 0;
  const biKhoa = nd.du?.items.filter((u) => !u.isActive).length ?? 0;

  return (
    <Khoi tieuDe="Sức khoẻ hệ thống">
      <div className="luoi-chi-so">
        <ChiSo
          nhan="Thư hỏng chưa xử lý"
          giaTri={thu.du?.total ?? 0}
          phu="thông báo không tới được người nhận"
          kieu={(thu.du?.total ?? 0) > 0 ? 'loi' : 'tot'}
          den="/van-hanh#thu-hang-doi"
        />
        <ChiSo nhan="Người dùng" giaTri={nd.du?.total ?? 0} phu="tổng số tài khoản" />
        <ChiSo
          nhan="Chưa kích hoạt"
          giaTri={chuaKichHoat}
          phu="đã mời nhưng chưa đặt mật khẩu"
          kieu={chuaKichHoat > 0 ? 'canh-bao' : 'thuong'}
        />
        <ChiSo
          nhan="Đang bị khoá"
          giaTri={biKhoa}
          phu="không đăng nhập được"
          kieu={biKhoa > 0 ? 'canh-bao' : 'thuong'}
        />
        <ChiSo
          nhan="Sản phẩm đang áp dụng"
          giaTri={sp.du?.total ?? 0}
          phu="trong danh mục"
        />
      </div>
    </Khoi>
  );
}

/** Nửa đêm hôm nay theo giờ Việt Nam, dạng ISO — mốc đầu của "hôm nay". */
function dauNgayIct(bayGio = new Date()): string {
  // `en-CA` cho ra YYYY-MM-DD; ghép `T00:00:00+07:00` để mốc là nửa đêm ICT chứ
  // không phải nửa đêm UTC — hai cái lệch nhau bảy tiếng, đủ để "hôm nay" của
  // báo cáo và "hôm nay" của người đọc là hai ngày khác nhau (OPS-09).
  const d = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(bayGio);
  return `${d}T00:00:00+07:00`;
}

export function HoatDongHomNay() {
  const { du, loi, dangTai } = useTai<{ byAction: Record<string, number>; total: number }>(
    `/audit/user-activity?from=${encodeURIComponent(dauNgayIct())}`,
  );

  return (
    <Khoi tieuDe="Hoạt động hôm nay" loi={loi} dangTai={dangTai}>
      {du === null || du.total === 0 ? (
        <Trong tieuDe="Chưa có thao tác nào hôm nay" />
      ) : (
        <div className="the">
          <ul className="danh-sach-so">
            {Object.entries(du.byAction)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([hanhDong, n]) => (
                <li key={hanhDong}>
                  <span className="ma-phu">{hanhDong}</span>
                  <strong className="so">{n}</strong>
                </li>
              ))}
          </ul>
        </div>
      )}
    </Khoi>
  );
}

type DongNhatKy = {
  id: string;
  occurredAt: string;
  actorRole: string | null;
  action: string;
  entity: string;
};

export function NhatKyGon() {
  const { du, loi, dangTai } = useTai<{ items: DongNhatKy[] }>('/audit/entries?limit=8');

  return (
    <Khoi tieuDe="Hoạt động gần đây" loi={loi} dangTai={dangTai}>
      {du === null || du.items.length === 0 ? (
        <Trong tieuDe="Nhật ký chưa có dòng nào" />
      ) : (
        <div className="khung-cuon" role="region" aria-label="Hoạt động gần đây" tabIndex={0}>
          <table className="bang">
            <thead>
              <tr>
                <th>Thời điểm</th>
                <th>Hành động</th>
                <th>Đối tượng</th>
                <th>Vai trò</th>
              </tr>
            </thead>
            <tbody>
              {du.items.map((d) => (
                <tr key={d.id}>
                  <td>{ngayGio(d.occurredAt)}</td>
                  <td>{d.action}</td>
                  <td>{d.entity}</td>
                  <td>{d.actorRole ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Khoi>
  );
}
