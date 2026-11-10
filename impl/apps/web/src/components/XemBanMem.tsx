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
 *   - `0098` cho bản mềm CSBH rẽ một nhánh riêng: mẫu đã gắn vào hồ sơ từ lúc
 *     gửi duyệt nên hộp mở thẳng nội dung và chỉ NÓI RA tên mẫu.
 *   - `0163` GỠ nhánh ấy. Bản mềm thôi đóng băng theo hồ sơ, và người duy nhất
 *     mở được nó — Sale Admin — chọn mẫu ở mỗi lượt in. Hai loại văn bản lại
 *     hỏi cùng một câu, nên thành phần này về đúng một đường đi.
 */
import { useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { NHAN_KHO, TY_LE_KHO, type LoaiMau, type MauChon } from '../lib/mau-hop-dong.js';
import { BaoLoi, DangTai, HopThoai, Truong } from './Chung.js';
import { ChonCoGo } from './ChonCoGo.js';
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

/**
 * Nhãn phụ của một mẫu: LOẠI mẫu và khổ giấy đọc từ chính file.
 *
 * `0167` thêm vế loại, và nó cần thật: từ `0165` ô chọn lúc xem trộn chung mẫu
 * *đầy đủ* với mẫu *rút gọn*, mà hai bản ấy in ra hai bảng sản phẩm khác hẳn
 * nhau — sáu cột và mười cột. Hai cái tên do Quản trị đặt không bắt buộc nói ra
 * điều đó, nên ô chọn phải tự nói.
 */
const NHAN_LOAI_MAU: Partial<Record<LoaiMau, string>> = {
  HO_SO: 'đầy đủ',
  HO_SO_RUT_GON: 'rút gọn',
};

const phuDe = (m: MauChon): string =>
  [m.loai ? NHAN_LOAI_MAU[m.loai] : '', m.khoGiay ? NHAN_KHO[m.khoGiay] : '']
    .filter((x) => x !== '' && x !== undefined)
    .join(' · ');

export function XemBanMem({
  loai = 'HO_SO',
  hoSoId,
  maHoSo,
  chiLoaiMau,
  khiLuu,
  dong,
}: {
  loai?: LoaiVanBan;
  hoSoId: string;
  maHoSo: string;
  /**
   * Chỉ cho chọn MỘT loại mẫu (`0167`) — hộp *Tạo bản mềm* truyền `'HO_SO'`.
   *
   * Khách hàng chốt 31/08: bản mềm đem lưu *"chỉ được lấy từ mẫu hồ sơ đầy đủ"*.
   * Bỏ trống là không lọc gì — hộp XEM THỬ vẫn bày cả mẫu đầy đủ lẫn rút gọn,
   * đúng như `0165`.
   *
   * Lọc ở đây chứ không gọi một đường API riêng: cùng một danh sách, một lời
   * gọi, và không có bản thứ hai để lệch. Máy chủ VẪN chặn — `luuBanMem` tra
   * `chon('HO_SO', …)` nên một mẫu rút gọn gửi thẳng vào đó nhận 404.
   */
  chiLoaiMau?: LoaiMau;
  /**
   * Có hàm này thì bản xem trước mọc thêm nút **Lưu** (`0167`).
   *
   * Bỏ trống là hộp XEM THỬ thuần: đọc rồi đóng, không để lại gì — đúng `0163`.
   * Đây là chỗ duy nhất phân biệt hai hộp, và hai hộp ấy dùng chung mọi thứ còn
   * lại: ô chọn mẫu, khung xem, khổ giấy, nút tải xuống.
   */
  khiLuu?: (mauId: string) => Promise<void>;
  dong: () => void;
}) {
  const ch = CAU_HINH[loai];
  const [dangLuu, datDangLuu] = useState(false);
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

  useEffect(() => {
    const huy = new AbortController();
    layJson<MauChon[]>(ch.duongMau, huy.signal)
      // Lọc SAU khi nhận, không lọc bằng tham số: máy chủ trả một danh sách cho
      // cả hai hộp, nên chúng không thể nhìn thấy hai thế giới khác nhau.
      .then((x) => datDs(chiLoaiMau === undefined ? x : x.filter((m) => m.loai === chiLoaiMau)))
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [ch.duongMau, chiLoaiMau]);

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
      <HopThoai tieuDe={`${khiLuu ? 'Tạo bản mềm' : `Xem ${ch.nhan}`} ${maHoSo}`} dong={dong}>
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
            Chưa có văn bản mẫu nào {khiLuu ? 'loại hồ sơ đầy đủ' : `cho ${ch.nhan}`}. Đề nghị{' '}
            <strong>{ch.nguoiSoan}</strong> thêm một mẫu, rồi mở lại.
          </p>
        ) : (
          <>
            <p className="ghi-chu">
              {khiLuu
                ? 'Chọn văn bản mẫu để dựng bản mềm. Chỉ mẫu hồ sơ ĐẦY ĐỦ dùng được ở đây — bản mềm đã lưu là bản đem trình ký và bàn giao cho Kế toán.'
                : 'Chọn văn bản mẫu để xem trước. Mỗi mẫu có bố cục và tập cột riêng.'}
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
                <ChonCoGo
                  {...o}
                  giaTri={dinhChon}
                  doi={datDinhChon}
                  // DÒNG RỖNG ĐỨNG ĐẦU là chỗ giữ nguyên luật `0067`: bỏ nó thì ô tự mang mẫu đầu
                  // danh sách — đúng cái `0058` làm và khách hàng đã bác ngày 20/08. Nút *Xem* khoá
                  // theo giá trị rỗng ấy.
                  mucRong="— Chọn văn bản mẫu —"
                  ds={ds.map((m) => ({ gia: m.id, nhan: m.ten, ...(phuDe(m) ? { phu: phuDe(m) } : {}) }))}
                />
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
              {khiLuu ? 'Xem trước' : 'Xem'}
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
  const q = `mauId=${chon}`;
  const dangDung = mau ?? null;
  const tenMau = dangDung?.ten ?? null;

  return (
    <XemTep
      tieuDe={`${khiLuu ? 'Tạo bản mềm' : loai === 'HO_SO' ? 'Bản mềm' : 'Hợp đồng'} ${maHoSo}${
        tenMau ? ` — ${tenMau}` : ''
      }`}
      /*
        NÚT LƯU chỉ mọc ra ở hộp TẠO (`0167`).

        Đặt trong hàng nút của `XemTep` chứ không ở `truoc`: nó là một HÀNH ĐỘNG
        trên thứ đang xem, cùng loại với *Tải xuống*, và người dùng tìm hành động
        ở hàng nút. Ô chọn đổi mẫu thì vẫn ở trên khung — nó đổi thứ đang xem chứ
        không làm gì với nó.
      */
      them={
        khiLuu && (
          <button
            type="button"
            className="nut nut-chinh"
            disabled={dangLuu}
            onClick={() => {
              datDangLuu(true);
              void khiLuu(chon).finally(() => datDangLuu(false));
            }}
          >
            {dangLuu ? 'Đang lưu…' : 'Lưu bản mềm'}
          </button>
        )
      }
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
        ds && ds.length > 1 ? (
          <div className="hang-kho-giay">
            <label className="ghi-chu" htmlFor="chon-mau">
              Mẫu
            </label>
            <ChonCoGo
              id="chon-mau"
              giaTri={chon ?? ''}
              doi={datChon}
              ds={ds.map((m) => ({ gia: m.id, nhan: m.ten, ...(phuDe(m) ? { phu: phuDe(m) } : {}) }))}
            />
          </div>
        ) : undefined
      }
      dong={dong}
    />
  );
}
