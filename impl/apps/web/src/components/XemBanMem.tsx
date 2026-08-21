/**
 * *Xem bản mềm* và *Xem hợp đồng* — chọn MẪU rồi xem trước (`0058`).
 *
 * Ba đời của cùng một hộp, và mỗi lần đổi đều là bỏ bớt một câu hỏi sai:
 *
 *   - Tới `0053`: ba nút rời giữa trang — xem khổ dọc, tải khổ dọc, tải khổ
 *     ngang. Ba nút cho một việc.
 *   - `0054`: một nút, hộp hỏi **khổ giấy** trước khi xem.
 *   - `0058`: hộp hỏi **mẫu nào**, vì khổ giấy chưa bao giờ là thứ người dùng
 *     thật sự muốn chọn. Họ muốn chọn *bản trình bày* — và khổ giấy chỉ là một
 *     thuộc tính của bản trình bày ấy, nằm sẵn trong file .docx do Quản trị
 *     soạn. Hỏi khổ giấy là bắt người dùng ghép hai mảnh mà phần mềm ghép được.
 *
 * Dùng chung cho CẢ hồ sơ lẫn hợp đồng: cùng một việc — chọn một mẫu trong danh
 * sách mẫu đang dùng rồi xem thử — chỉ khác đường API và cách gọi tên.
 */
import { useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { NHAN_KHO, TY_LE_KHO, type MauChon } from '../lib/mau-hop-dong.js';
import { BaoLoi, DangTai, HopThoai } from './Chung.js';
import { XemTep } from './XemTep.js';

export type LoaiVanBan = 'HO_SO' | 'HOP_DONG';

const CAU_HINH: Record<
  LoaiVanBan,
  { duongMau: string; nhan: string; nguoiSoan: string; duong: (id: string) => string }
> = {
  HO_SO: {
    duongMau: '/policy-templates/available',
    nhan: 'bản mềm',
    nguoiSoan: 'Quản trị hệ thống',
    duong: (id) => `/policies/${id}/render`,
  },
  HOP_DONG: {
    duongMau: '/contract-templates/available',
    nhan: 'hợp đồng',
    // Từ `0060` cả hai loại mẫu đều của Quản trị hệ thống — người xuất hợp đồng
    // chọn mẫu, nhưng không tải mẫu lên được nữa.
    nguoiSoan: 'Quản trị hệ thống',
    duong: (id) => `/policies/${id}/contract.pdf`,
  },
};

/** Nhãn phụ của một mẫu: khổ giấy đọc từ chính file, hoặc không nói gì. */
const phuDe = (m: MauChon): string => (m.khoGiay ? NHAN_KHO[m.khoGiay] : '');

export function XemBanMem({
  loai = 'HO_SO',
  hoSoId,
  maHoSo,
  dong,
}: {
  loai?: LoaiVanBan;
  hoSoId: string;
  maHoSo: string;
  dong: () => void;
}) {
  const ch = CAU_HINH[loai];
  const [ds, datDs] = useState<MauChon[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [chon, datChon] = useState<string | null>(null);

  useEffect(() => {
    const huy = new AbortController();
    layJson<MauChon[]>(ch.duongMau, huy.signal)
      .then(datDs)
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [ch.duongMau]);

  if (chon === null) {
    /*
      HỎI MẪU TRƯỚC KHI XEM (`0067`).

      `0058` mở sẵn mẫu đầu danh sách để bấm một nút là thấy nội dung. Khách hàng
      chốt lại ngày 20/08: bắt chọn mẫu trước.

      Lý do đứng về phía họ. Từ `0067` mỗi mẫu có TẬP CỘT riêng, nên hai mẫu của
      cùng một hồ sơ ra hai bản giấy khác hẳn nhau — bản đủ mười cột cho nội bộ
      và bản bốn cột đưa khách hàng. Mở sẵn một cái nghĩa là phần lớn người dùng
      không bao giờ biết cái kia tồn tại, và họ gửi đi bản đầu tiên phần mềm đưa
      ra chứ không phải bản họ định gửi.
    */
    return (
      <HopThoai tieuDe={`Xem ${ch.nhan} ${maHoSo}`} dong={dong}>
        {loi !== null ? (
          <BaoLoi loi={loi} />
        ) : ds === null ? (
          <DangTai />
        ) : ds.length === 0 ? (
          /*
            Danh sách rỗng KHÔNG phải lỗi của người đang đứng đây, và câu chữ
            phải nói ra điều đó: chỉ người soạn mẫu chữa được. Nói "chưa có mẫu"
            rồi để họ tự đoán là đẩy một việc không làm được sang cho họ.
          */
          <p className="ghi-chu">
            Chưa có văn bản mẫu nào cho {ch.nhan}. Đề nghị <strong>{ch.nguoiSoan}</strong> thêm một
            mẫu, rồi mở lại.
          </p>
        ) : (
          <>
            <p className="ghi-chu">
              Chọn văn bản mẫu để xem trước. Mỗi mẫu có bố cục và tập cột riêng.
            </p>
            <div className="chon-mau-truoc">
              {ds.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="nut nut-nhe"
                  onClick={() => datChon(m.id)}
                >
                  {m.ten}
                  {phuDe(m) ? ` · ${phuDe(m)}` : ''}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="nhom-nut">
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Đóng
          </button>
        </div>
      </HopThoai>
    );
  }

  const mau = ds?.find((m) => m.id === chon);
  const q = `mauId=${chon}`;

  return (
    <XemTep
      tieuDe={`${loai === 'HO_SO' ? 'Bản mềm' : 'Hợp đồng'} ${maHoSo}${
        mau ? ` — ${mau.ten}` : ''
      }`}
      /*
        MỘT đường cho cả xem lẫn tải (`0059`).

        Tới `0058` đường xem mang `xem=1` để máy chủ đừng ghi một dòng tải xuống
        vào *Lịch sử*. Bản mềm và hợp đồng không ghi lịch sử nữa, nên hai đường
        gộp lại làm một. Bản scan thì VẪN tách — xem `TepDinhKem`.
      */
      duong={`${ch.duong(hoSoId)}?${q}`}
      tenTep={`${loai === 'HO_SO' ? 'CSBH' : 'HopDong'}-${maHoSo}.pdf`}
      /*
        Khổ giấy của MẪU ĐANG CHỌN, để khung xem mang đúng hình tờ giấy (`0073`).

        Không phải một lời gọi mới: `khoGiay` đã đi kèm mỗi mẫu trong danh sách
        chọn từ `0058`, đọc từ chính file .docx lúc Quản trị lưu mẫu. Đổi mẫu
        giữa chừng thì khung đổi hình theo — dọc sang ngang thấy ngay.

        Đây cũng là chỗ DUY NHẤT biết được khổ của một PDF: nội dung nằm trong
        trình xem PDF của trình duyệt, không hỏi được từ JavaScript.
      */
      tyLe={mau?.khoGiay ? TY_LE_KHO[mau.khoGiay] : undefined}
      truoc={
        // Ô chọn để ĐỔI mẫu mà không phải đóng hộp ra chọn lại. Một mẫu thì
        // không có gì để đổi — ô chọn một dòng là một câu hỏi giả.
        ds && ds.length > 1 ? (
          <div className="hang-kho-giay">
            <label className="ghi-chu" htmlFor="chon-mau">
              Mẫu
            </label>
            <select
              id="chon-mau"
              className="o-nhap"
              value={chon}
              onChange={(e) => datChon(e.target.value)}
            >
              {ds.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.ten}
                  {phuDe(m) ? ` · ${phuDe(m)}` : ''}
                </option>
              ))}
            </select>
          </div>
        ) : undefined
      }
      dong={dong}
    />
  );
}
