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
  datChuaDoc,
  dauChuong,
  duongHop,
  lopDong,
  MOI_TRANG_CHUONG,
  nhanChuong,
  thoiGianTuongDoi,
  truMot,
  useChuaDoc,
  ngheTabKhac,
  useDemThongBao,
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
      <Lien den={tb.duongDan} className={lopDong(tb)} truocKhiDi={() => chon(tb)}>
        {/* Chấm chỉ đánh dấu DÒNG chưa đọc — khác hẳn con số trên chuông, thứ
            khách hàng đã chốt là phải có số. Ở đây không có gì để đếm. */}
        <span className="tb-cham" aria-hidden="true" />
        <span className="tb-than">
          {/* Bậc nằm ở LỚP của cả dòng (`0192`), không ở một chip cạnh tiêu đề —
              xem `lopDong`. Tiêu đề đã tự nói ra bậc bằng chữ. */}
          <span className="tb-tieu-de">{tb.tieuDe}</span>
          {tb.moTa && <span className="tb-mo-ta">{tb.moTa}</span>}
          {/* Trích đoạn bình luận (`0262`): in nghiêng để tách khỏi dòng mã hồ sơ — chốt mockup. */}
          {tb.trichDoan && <span className="tb-trich">“{tb.trichDoan}”</span>}
          {/* Giờ tuyệt đối trong `title`: câu tương đối dễ đọc nhưng không đối
              chiếu được với nhật ký hồ sơ. */}
          <span className="tb-luc" title={ngayGio(tb.xayRaLuc)}>
            {thoiGianTuongDoi(tb.xayRaLuc)}
            {tb.matQuyen && ' · bạn không còn quyền xem hồ sơ này'}
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
  const chuaDoc = useChuaDoc();

  useDemThongBao(true);
  useEffect(ngheTabKhac, []);

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
        datChuaDoc({ viec: r.soViecChuaDoc, tin: r.soTinChuaDoc });
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
    datHop((h) => {
      if (h === null) return h;
      const con = truMot({ viec: h.soViecChuaDoc, tin: h.soTinChuaDoc }, tb);
      return {
        ...h,
        items: h.items.map((x) =>
          x.id === tb.id ? { ...x, daDocLuc: new Date().toISOString() } : x,
        ),
        soViecChuaDoc: con.viec,
        soTinChuaDoc: con.tin,
      };
    });
    datChuaDoc(truMot(chuaDoc, tb));
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
                soViecChuaDoc: 0,
                soTinChuaDoc: 0,
              },
        );
      })
      .catch(() => datLoi(true));
  };

  const dau = dauChuong(chuaDoc);
  const nhan = nhanChuong(chuaDoc);

  return (
    <div className="chuong" ref={khung}>
      <button
        type="button"
        ref={nut}
        className="nut-bieu-tuong nut-chuong"
        aria-expanded={mo}
        title={nhan}
        onClick={() => datMo((x) => !x)}
      >
        <span className="chi-doc-man-hinh">{nhan}</span>
        <BieuTuongChuong />
        {/*
          `aria-hidden` cho CẢ HAI dạng: câu đọc lên đã có ở nhãn ẩn phía trên,
          và nó nói con số THẬT chứ không nói `99+`. Dấu chấm thì không có chữ
          nào để đọc, nên nhãn ấy là đường duy nhất nó tới được người dùng trình
          đọc màn hình (`0192`).

          Hai nhánh loại trừ nhau vì `dauChuong` trả một kiểu phân biệt — không
          có tổ hợp nào vẽ ra cả số lẫn chấm.
        */}
        {dau.dang === 'so' && (
          <span className="tb-huy-hieu" aria-hidden="true">
            {dau.nhan}
          </span>
        )}
        {dau.dang === 'cham' && <span className="tb-cham-chuong" aria-hidden="true" />}
      </button>

      {mo && (
        <div className="menu-so tb-bang">
          <div className="tb-dau">
            <strong>Thông báo</strong>
            {dau.dang !== 'khong' && (
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
