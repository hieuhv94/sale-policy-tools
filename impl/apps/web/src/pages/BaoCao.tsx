/**
 * Ba báo cáo tổng hợp. CHỈ ĐỂ ĐỌC — không có thao tác nào trên màn hình này.
 *
 * VIỆC XUẤT EXCEL ĐÃ CHUYỂN ĐI (`0077`), sang màn hình *Hồ sơ*. Nút ở đây gửi
 * lên một bộ lọc rỗng nên nó xuất cả phạm vi dữ liệu — trong khi thứ người ta
 * muốn xuất gần như luôn là *kết quả vừa tìm được*, mà bộ lọc thì nằm ở màn hình
 * kia. Một nút xuất đứng cách bộ lọc một màn hình là một nút không xuất được cái
 * người dùng đang nhìn.
 */
import { useBaoCao } from '../lib/bao-cao.js';
import { nhanTrangThai } from '../lib/format.js';
import { Lien } from '../lib/router.js';
import { BaoLoi, ChiSo, DangTai } from '../components/Chung.js';

export function BaoCao() {
  // Cùng ba endpoint mà trang Tổng quan đọc — kiểu và cách nạp khai một chỗ ở
  // `lib/bao-cao.ts`, xem lý do ở đầu tệp đó.
  const { bo, loi: loiBaoCao } = useBaoCao();

  if (loiBaoCao !== null) return <BaoLoi loi={loiBaoCao} />;
  if (bo === null) return <DangTai />;
  const { tienDo, traLai, sla } = bo;

  // Sắp giảm dần: trạng thái đông hồ sơ nhất là thứ người đọc muốn thấy trước,
  // và thứ tự cố định theo tên trạng thái thì cột nào cũng phải dò bằng mắt.
  const theoTrangThai = Object.entries(tienDo.byStatus).sort((a, b) => b[1] - a[1]);
  const donhat = Math.max(1, ...theoTrangThai.map(([, v]) => v));

  return (
    <section className="trang">
      <div className="dau-trang">
        <h1>Báo cáo</h1>
      </div>
      <p className="mo-ta-trang">
        {tienDo.total} hồ sơ trong phạm vi dữ liệu của bạn, tính tại thời điểm mở màn hình.
      </p>

      {/*
        Bốn con số đặt lên đầu là bốn câu hỏi người quản lý mở màn hình này để
        hỏi. Chúng nằm trên MỘT hàng, không phải rải trong ba danh sách phía
        dưới — muốn biết "có gì đang cháy không" mà phải cuộn ba lần thì lần sau
        họ thôi không mở nữa.
      */}
      <div className="luoi-chi-so">
        <ChiSo nhan="Tổng hồ sơ" giaTri={tienDo.total} phu="trong phạm vi của bạn" />
        <ChiSo nhan="Đang chờ xử lý" giaTri={sla.waiting} phu="ở mọi bước duyệt" kieu="cho" />
        <ChiSo
          nhan="Quá hạn"
          giaTri={sla.overdue}
          phu="quá 14 ngày ở một bước"
          kieu={sla.overdue > 0 ? 'loi' : 'tot'}
        />
        <ChiSo
          nhan="Tỷ lệ trả lại"
          giaTri={`${String(traLai.rate).replace('.', ',')}%`}
          phu={`${traLai.returned} trên ${traLai.submitted} hồ sơ đã gửi duyệt`}
          kieu={traLai.rate > 0 ? 'canh-bao' : 'tot'}
        />
      </div>

      <h2>Tiến độ theo trạng thái</h2>
      <div className="the">
        {theoTrangThai.length === 0 ? (
          <p className="trong-mo-ta">Chưa có hồ sơ nào.</p>
        ) : (
          <ul className="danh-sach-thanh">
            {theoTrangThai.map(([k, v]) => (
              <li key={k}>
                <span className="thanh-nhan">{nhanTrangThai(k)}</span>
                {/*
                  Thanh dài ngắn là thứ TRANG TRÍ cho con số bên cạnh, nên nó
                  `aria-hidden`. Trình đọc màn hình nghe "Nháp, 12" là đủ; đọc
                  thêm "thanh tiến trình 40%" chỉ làm dài ra mà không thêm nghĩa.
                */}
                <span className="thanh" aria-hidden="true">
                  <span className="thanh-day" style={{ width: `${(v / donhat) * 100}%` }} />
                </span>
                <strong className="so">{v}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2>Hạn xử lý (SLA)</h2>
      <div className="the">
        <ul className="danh-sach-so">
          <li><span>Đang chờ</span><strong className="so">{sla.waiting}</strong></li>
          <li><span>Quá hạn</span><strong className="so">{sla.overdue}</strong></li>
          <li><span>Đến hạn hôm nay</span><strong className="so">{sla.dueToday}</strong></li>
        </ul>
        {sla.excludedLegacy > 0 && (
          <p className="ghi-chu">
            Đã loại {sla.excludedLegacy} hồ sơ nhập từ dữ liệu cũ khỏi thống kê SLA — chúng không đi
            qua luồng duyệt nên không có mốc bắt đầu chờ.
          </p>
        )}
      </div>

      <h2>Xuất Excel</h2>
      <div className="the">
        {/*
          Chỉ đường, không dựng lại nút (`0077`).

          Bỏ hẳn mục này thì người đã quen bấm xuất ở đây sẽ đi tìm, không thấy,
          rồi kết luận là chức năng bị gỡ. Một câu chỉ chỗ rẻ hơn nhiều so với
          một cuộc gọi hỏi.
        */}
        <p className="trong-mo-ta">
          Xuất Excel nằm ở màn hình <Lien den="/ho-so">Hồ sơ CSBH</Lien>, góc trên bên phải. Đặt ở
          đó để file xuất ra đúng <strong>kết quả bộ lọc</strong> bạn đang xem, thay vì toàn bộ hồ
          sơ trong phạm vi.
        </p>
      </div>
    </section>
  );
}
