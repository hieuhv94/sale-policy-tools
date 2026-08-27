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
 *   - `0145`: bước chọn mẫu là một **ô chọn**, không phải một danh sách nút.
 *     Cùng một câu hỏi với ô đổi mẫu ở màn hình sau, nên cùng một hình dạng — và
 *     nó cao bằng một dòng dù danh mục mẫu có dài tới đâu.
 *
 *   - `0098`: HAI LOẠI RẼ ĐÔI. Hợp đồng giữ nguyên bước chọn mẫu; bản mềm CSBH
 *     thì mẫu đã gắn vào hồ sơ từ lúc gửi duyệt, nên hộp mở thẳng nội dung và
 *     chỉ NÓI RA tên mẫu.
 *
 * Vẫn dùng chung một thành phần, và ranh giới là `mauDaGan`: có giá trị thì
 * không hỏi gì, không có thì hỏi như cũ. Hai loại thôi cùng một việc, nhưng phần
 * còn lại — khung xem, tỷ lệ khổ giấy, nút tải — vẫn giống hệt nhau; tách đôi là
 * chép lại chúng để khác nhau đúng một câu hỏi.
 */
import { useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { NHAN_KHO, TY_LE_KHO, type MauChon } from '../lib/mau-hop-dong.js';
import { BaoLoi, DangTai, HopThoai, Truong } from './Chung.js';
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
  mauDaGan,
  dong,
}: {
  loai?: LoaiVanBan;
  hoSoId: string;
  maHoSo: string;
  /**
   * Mẫu đã ĐÓNG BĂNG vào hồ sơ (`0098`) — chỉ bản mềm CSBH mới có.
   *
   * Có giá trị thì hộp này KHÔNG hỏi mẫu nào cả: nó mở thẳng bản mềm dựng bằng
   * đúng mẫu ấy, và chỉ nói ra tên mẫu. Đó là cả nội dung của yêu cầu — sau khi
   * TDV gửi duyệt thì không vai trò nào chọn lại bản trình bày nữa.
   *
   * Hợp đồng KHÔNG BAO GIỜ truyền trường này: nó không lưu bản ghi nào (muc
   * 8.3) nên không có gì để đóng băng vào, và người xuất vẫn chọn ở mỗi lượt.
   */
  mauDaGan?: string | null | undefined;
  dong: () => void;
}) {
  const ch = CAU_HINH[loai];
  const [ds, datDs] = useState<MauChon[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [chon, datChon] = useState<string | null>(null);
  /**
   * Mẫu đang chọn trong Ô CHỌN của bước một — chưa phải mẫu đang XEM (`0145`).
   *
   * Hai state chứ không một, và đó là cả cơ chế giữ luật `0067` khi bước một
   * chuyển từ danh sách nút sang một ô chọn: một cái nút vừa là lựa chọn vừa là
   * lượt xác nhận, còn một ô chọn thì không. Gộp lại thành một state nghĩa là
   * `chon` có giá trị ngay lúc người dùng vừa rê qua danh sách, và hộp nhảy sang
   * bản xem trước của mẫu họ chưa kịp đọc tên.
   */
  const [dinhChon, datDinhChon] = useState('');
  /** Mẫu đã gắn — chỉ để hiện tên và lấy khổ giấy, không để chọn. */
  const [mauGan, datMauGan] = useState<MauChon | null>(null);

  useEffect(() => {
    if (!mauDaGan) return;
    const huy = new AbortController();
    /*
     * Tên mẫu HỎNG THÌ IM LẶNG, và người dùng không mất gì (`0089`).
     *
     * Bản mềm vẫn dựng được — máy chủ đọc mẫu từ chính cột trên hồ sơ, không
     * cần lời gọi này. Thứ mất đi chỉ là một dòng chữ nói tên mẫu ở tiêu đề.
     * Ném lỗi ở đây là chặn cả bản mềm vì một cái nhãn.
     */
    layJson<MauChon>(`/policy-templates/${mauDaGan}`, huy.signal)
      .then(datMauGan)
      .catch(() => undefined);
    return () => huy.abort();
  }, [mauDaGan]);

  useEffect(() => {
    // Hồ sơ đã gắn mẫu thì không có ô chọn nào để dựng, nên không hỏi danh sách.
    if (mauDaGan) return;
    const huy = new AbortController();
    layJson<MauChon[]>(ch.duongMau, huy.signal)
      .then(datDs)
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [ch.duongMau, mauDaGan]);

  if (chon === null && !mauDaGan) {
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
            {/*
              Ô CHỌN, không phải danh sách nút (`0145`).

              Danh sách nút của `0067` đọc được khi có ba mẫu; danh mục mẫu thì
              chỉ dài thêm, và mười nút xếp dọc đẩy nút *Đóng* xuống dưới tầm
              nhìn ngay trên laptop. Ô chọn cao bằng một dòng dù có bao nhiêu
              mẫu, và nó khớp với ô chọn ĐỔI MẪU ở màn hình sau — cùng một câu
              hỏi thì nên cùng một hình dạng.
            */}
            <Truong id="chon-mau-truoc" nhan="Văn bản mẫu" bắtBuộc>
              {(o) => (
                <select
                  {...o}
                  className="o-nhap"
                  value={dinhChon}
                  onChange={(e) => datDinhChon(e.target.value)}
                >
                  {/*
                    DÒNG RỖNG ĐỨNG ĐẦU, và nó là chỗ giữ nguyên luật `0067`.

                    Bỏ nó đi thì ô chọn tự mang mẫu đầu danh sách, tức quay lại
                    đúng cái `0058` làm và khách hàng đã bác ngày 20/08: phần lớn
                    người dùng không bao giờ biết mẫu thứ hai tồn tại, và họ gửi
                    đi bản đầu tiên phần mềm đưa ra chứ không phải bản họ định
                    gửi. Nút *Xem* khoá theo dòng rỗng ấy.
                  */}
                  <option value="">— Chọn văn bản mẫu —</option>
                  {ds.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.ten}
                      {phuDe(m) ? ` · ${phuDe(m)}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </Truong>
          </>
        )}
        <div className="nhom-nut">
          {ds !== null && ds.length > 0 && (
            <button
              type="button"
              className="nut nut-chinh"
              disabled={dinhChon === ''}
              onClick={() => datChon(dinhChon)}
            >
              Xem
            </button>
          )}
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Đóng
          </button>
        </div>
      </HopThoai>
    );
  }

  const mau = ds?.find((m) => m.id === chon);
  /*
   * Hồ sơ đã gắn mẫu thì KHÔNG gửi `mauId` (`0098`).
   *
   * Máy chủ đọc mẫu từ chính cột trên hồ sơ, và nó TỪ CHỐI một `mauId` khác
   * (`TEMPLATE_LOCKED`). Gửi kèm cho "chắc" là dựng ra một đường mà mỗi lần đổi
   * cột mẫu ở máy chủ lại phải nhớ sửa theo — trong khi đúng ở đây là không nói
   * gì cả, để một chỗ duy nhất biết câu trả lời.
   */
  const q = mauDaGan ? '' : `mauId=${chon}`;
  const dangDung = mauDaGan ? mauGan : (mau ?? null);
  const tenMau = dangDung?.ten ?? null;

  return (
    <XemTep
      tieuDe={`${loai === 'HO_SO' ? 'Bản mềm' : 'Hợp đồng'} ${maHoSo}${
        tenMau ? ` — ${tenMau}` : ''
      }`}
      /*
        MỘT đường cho cả xem lẫn tải (`0059`).

        Tới `0058` đường xem mang `xem=1` để máy chủ đừng ghi một dòng tải xuống
        vào *Lịch sử*. Bản mềm và hợp đồng không ghi lịch sử nữa, nên hai đường
        gộp lại làm một. Bản scan thì VẪN tách — xem `TepDinhKem`.
      */
      duong={q ? `${ch.duong(hoSoId)}?${q}` : ch.duong(hoSoId)}
      tenTep={`${loai === 'HO_SO' ? 'CSBH' : 'HopDong'}-${maHoSo}.pdf`}
      /*
        Khổ giấy của MẪU ĐANG CHỌN, để khung xem mang đúng hình tờ giấy (`0073`).

        Không phải một lời gọi mới: `khoGiay` đã đi kèm mỗi mẫu trong danh sách
        chọn từ `0058`, đọc từ chính file .docx lúc Quản trị lưu mẫu. Đổi mẫu
        giữa chừng thì khung đổi hình theo — dọc sang ngang thấy ngay.

        Đây cũng là chỗ DUY NHẤT biết được khổ của một PDF: nội dung nằm trong
        trình xem PDF của trình duyệt, không hỏi được từ JavaScript.
      */
      tyLe={dangDung?.khoGiay ? TY_LE_KHO[dangDung.khoGiay] : undefined}
      truoc={
        // Ô chọn để ĐỔI mẫu mà không phải đóng hộp ra chọn lại. Một mẫu thì
        // không có gì để đổi — ô chọn một dòng là một câu hỏi giả.
        //
        // Hồ sơ đã gắn mẫu thì cũng không có gì để đổi, và đó là điểm của
        // `0098`: ô chọn biến mất ở mọi vai trò sau bước gửi duyệt.
        !mauDaGan && ds && ds.length > 1 ? (
          <div className="hang-kho-giay">
            <label className="ghi-chu" htmlFor="chon-mau">
              Mẫu
            </label>
            <select
              id="chon-mau"
              className="o-nhap"
              value={chon ?? ''}
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
