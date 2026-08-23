/**
 * Chuông thông báo ở thanh trên cùng (`0096`).
 *
 * DÙNG LẠI ĐÚNG MẪU CỦA `MenuTaiKhoan`, không dựng mẫu thứ hai: `aria-expanded`,
 * đóng bằng `mousedown` ngoài khung, `Escape` trả tiêu điểm về nút đã mở. Hai
 * khối sổ xuống đứng cạnh nhau trên cùng một thanh mà đóng mở theo hai luật khác
 * nhau là thứ người dùng cảm thấy trước khi kịp gọi tên.
 *
 * `mousedown` chứ không `click` — lý do đầy đủ ở `BoCuc.tsx`: nghe `click` thì
 * trên phần tử vừa bị đóng đè lên, thứ tự sự kiện đổi theo trình duyệt và có máy
 * nuốt mất cú bấm đầu tiên.
 */
import { useEffect, useRef, useState } from 'react';
import { layJson } from '../lib/api.js';
import { ngayGio } from '../lib/format.js';
import { Lien, useDuong } from '../lib/router.js';
import {
  danhDauDaDoc,
  danhDauDaDocHet,
  datSoChuaDoc,
  duongHop,
  MOI_TRANG_CHUONG,
  nhanChuong,
  nhanHuyHieu,
  thoiGianTuongDoi,
  useDemThongBao,
  useSoChuaDoc,
  type HopThongBao,
  type ThongBao,
} from '../lib/thong-bao.js';
import { BieuTuongChuong } from './BieuTuong.js';

/**
 * Một dòng trong bảng.
 *
 * Là `<a>` thật chứ không phải `<div onClick>`: mở tab mới, sao chép liên kết,
 * và di chuyển bằng bàn phím đều phải chạy — đây là một liên kết dẫn đi chỗ
 * khác, đúng nghĩa đen.
 */
function Dong({ tb, chon }: { tb: ThongBao; chon: (tb: ThongBao) => void }) {
  return (
    <li>
      <Lien
        den={tb.duongDan}
        className={tb.daDocLuc ? 'tb-dong' : 'tb-dong tb-chua-doc'}
        truocKhiDi={() => chon(tb)}
      >
        {/* Chấm chỉ đánh dấu DÒNG chưa đọc — khác hẳn con số trên chuông, thứ
            khách hàng đã chốt là phải có số. Ở đây không có gì để đếm. */}
        <span className="tb-cham" aria-hidden="true" />
        <span className="tb-than">
          <span className="tb-tieu-de">
            {tb.tieuDe}
            {tb.kind === 'THEO_DOI' && (
              /*
                Nhãn *để biết* (`0036`).

                Lá thư tương ứng có hẳn một đoạn nói "bạn KHÔNG phải xử lý gì ở
                bước này". Mất đoạn đó thì hai loại thông báo trông giống hệt
                nhau, và người dùng mất khả năng phân biệt VIỆC CỦA TÔI với
                CHUYỆN TÔI NÊN BIẾT — đúng thứ phân biệt mà `0036` dựng ra.
              */
              <span className="tb-de-biet">để biết</span>
            )}
          </span>
          {tb.moTa && <span className="tb-mo-ta">{tb.moTa}</span>}
          {/* Giờ tuyệt đối trong `title`: câu tương đối dễ đọc nhưng không đối
              chiếu được với nhật ký hồ sơ. */}
          <span className="tb-luc" title={ngayGio(tb.xayRaLuc)}>
            {thoiGianTuongDoi(tb.xayRaLuc)}
          </span>
        </span>
      </Lien>
    </li>
  );
}

export function ChuongThongBao() {
  const [mo, datMo] = useState(false);
  const [hop, datHop] = useState<HopThongBao | null>(null);
  const [loi, datLoi] = useState(false);
  const khung = useRef<HTMLDivElement>(null);
  const nut = useRef<HTMLButtonElement>(null);
  const { duong } = useDuong();
  const soChuaDoc = useSoChuaDoc();

  useDemThongBao(true);

  // Chuyển màn hình thì đóng — kể cả khi chính cú bấm vào một dòng gây ra nó.
  useEffect(() => datMo(false), [duong]);

  useEffect(() => {
    if (!mo) return;
    const ngoai = (e: MouseEvent) => {
      if (!khung.current?.contains(e.target as Node)) datMo(false);
    };
    const phim = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      datMo(false);
      nut.current?.focus();
    };
    document.addEventListener('mousedown', ngoai);
    document.addEventListener('keydown', phim);
    return () => {
      document.removeEventListener('mousedown', ngoai);
      document.removeEventListener('keydown', phim);
    };
  }, [mo]);

  /*
   * Tải LẠI mỗi lần mở, không nhớ lần trước.
   *
   * Bảng này nói "có gì mới", nên một danh sách đọng từ mười phút trước là câu
   * trả lời sai cho đúng câu hỏi người dùng vừa bấm vào để hỏi. Rẻ: mười dòng.
   */
  useEffect(() => {
    if (!mo) return;
    const huy = new AbortController();
    datLoi(false);
    layJson<HopThongBao>(duongHop(MOI_TRANG_CHUONG), huy.signal)
      .then((r) => {
        datHop(r);
        // Con số đi kèm danh sách là con số MỚI NHẤT — dùng luôn, khỏi chờ lượt
        // đếm định kỳ kế tiếp.
        datSoChuaDoc(r.soChuaDoc);
      })
      .catch((e: unknown) => {
        // KHÔNG báo lỗi ra hộp thoại: bảng này là thứ phụ, và một hộp thoại ở
        // đây che mất màn hình người dùng đang làm việc. Câu báo nằm trong chính
        // bảng, nơi họ vừa bấm để mở (`0088`, dạng *trang*).
        if (!huy.signal.aborted) datLoi(true);
        void e;
      });
    return () => huy.abort();
  }, [mo]);

  /** Bấm một dòng: đánh dấu đã đọc rồi để `Lien` điều hướng như thường. */
  const chon = (tb: ThongBao) => {
    if (tb.daDocLuc) return;
    // Tô lại NGAY tại chỗ, không chờ máy chủ: màn hình đang chuyển đi nơi khác,
    // và một dòng còn đậm trong nửa giây cuối là thứ người dùng vẫn kịp thấy.
    datHop((h) =>
      h === null
        ? h
        : {
            ...h,
            items: h.items.map((x) =>
              x.id === tb.id ? { ...x, daDocLuc: new Date().toISOString() } : x,
            ),
            soChuaDoc: Math.max(0, h.soChuaDoc - 1),
          },
    );
    datSoChuaDoc(Math.max(0, soChuaDoc - 1));
    // Cùng lý do với lượt đếm định kỳ: hỏng thì lượt hỏi sau chữa lại con số,
    // và người dùng lúc ấy đã sang màn hình khác (`0089`).
    void danhDauDaDoc(tb.id).catch(() => undefined);
  };

  const docHet = () => {
    void danhDauDaDocHet()
      .then(() => {
        datHop((h) =>
          h === null
            ? h
            : {
                ...h,
                items: h.items.map((x) => ({
                  ...x,
                  daDocLuc: x.daDocLuc ?? new Date().toISOString(),
                })),
                soChuaDoc: 0,
              },
        );
      })
      .catch(() => datLoi(true));
  };

  const huyHieu = nhanHuyHieu(soChuaDoc);

  return (
    <div className="chuong" ref={khung}>
      <button
        type="button"
        ref={nut}
        className="nut-bieu-tuong nut-chuong"
        aria-expanded={mo}
        title={nhanChuong(soChuaDoc)}
        onClick={() => datMo((x) => !x)}
      >
        <span className="chi-doc-man-hinh">{nhanChuong(soChuaDoc)}</span>
        <BieuTuongChuong />
        {/*
          `aria-hidden` vì câu đọc lên đã có ở nhãn ẩn phía trên, và nó nói con
          số THẬT chứ không nói `99+`.
        */}
        {huyHieu !== '' && (
          <span className="tb-huy-hieu" aria-hidden="true">
            {huyHieu}
          </span>
        )}
      </button>

      {mo && (
        <div className="menu-so tb-bang">
          <div className="tb-dau">
            <strong>Thông báo</strong>
            {soChuaDoc > 0 && (
              <button type="button" className="tb-doc-het" onClick={docHet}>
                Đánh dấu đã đọc hết
              </button>
            )}
          </div>

          {loi && (
            <p className="tb-trong">Không tải được thông báo. Đóng rồi mở lại để thử lần nữa.</p>
          )}
          {!loi && hop === null && <p className="tb-trong">Đang tải…</p>}
          {!loi && hop !== null && hop.items.length === 0 && (
            <p className="tb-trong">Chưa có thông báo nào.</p>
          )}
          {!loi && hop !== null && hop.items.length > 0 && (
            <ul className="tb-danh-sach">
              {hop.items.map((tb) => (
                <Dong key={tb.id} tb={tb} chon={chon} />
              ))}
            </ul>
          )}

          <div className="tb-chan">
            <Lien den="/thong-bao" className="tb-xem-tat-ca">
              Xem tất cả
            </Lien>
          </div>
        </div>
      )}
    </div>
  );
}
