/**
 * **Ô chọn nhiều** — gõ để tìm, bấm để chọn, chip để gỡ (`0077`).
 *
 * Thay cho ô gõ chữ của bốn tiêu chí lọc. Trước đợt này mã khách hàng, tên sản
 * phẩm, nhóm sản phẩm và TDV đều phải GÕ TAY một mã có thật trong danh mục —
 * gõ sai một ký tự thì kết quả rỗng, và không có gì phân biệt được "không có hồ
 * sơ nào" với "bạn gõ sai mã".
 *
 * MỘT THÀNH PHẦN, HAI CHẾ ĐỘ NGUỒN. Bốn ô ấy chia làm hai kiểu, và gộp lại từ
 * đầu là cách duy nhất để không có ba bản sao trôi khỏi nhau:
 *
 *   - `nguon` là MẢNG — danh sách nhỏ nạp sẵn, lọc tại chỗ (trạng thái, nhóm
 *     sản phẩm, TDV phụ trách). Vài chục dòng, không đáng một lượt mạng mỗi lần
 *     gõ một chữ.
 *   - `nguon` là HÀM — tìm ở máy chủ (khách hàng, sản phẩm). Hai danh mục này có
 *     thể lên hàng nghìn dòng; kéo hết về rồi lọc trên trình duyệt là đúng lỗi
 *     `0049` đã sửa một lần ở màn hình danh mục.
 *
 * DỰNG BẰNG THẺ THẬT. Ô tìm là `<input>`, mỗi kết quả là một `<button>`, mỗi chip
 * là một `<button>` bấm để gỡ — nên Tab tới được và Enter chọn được. Cùng lý do
 * đã ghi ở `VungTaiLen.tsx`: dựng bằng `<div onClick>` thì bàn phím không tới
 * được, và đó là kiểu hỏng không ai thấy cho tới khi có người không dùng chuột.
 */
import { useEffect, useId, useRef, useState } from 'react';

export type TuyChon = {
  /** Giá trị gửi lên máy chủ — mã, uuid, hoặc tên đầy đủ. */
  gia: string;
  /** Chữ hiện trên chip và trong danh sách. */
  nhan: string;
};

/** Nguồn tuỳ chọn: danh sách nạp sẵn, hoặc một phép tìm ở máy chủ. */
export type NguonChon = TuyChon[] | ((q: string) => Promise<TuyChon[]>);

/**
 * Nhãn của một giá trị đã chọn.
 *
 * Không tra được thì hiện CHÍNH GIÁ TRỊ, không hiện "(không rõ)". Mọi giá trị
 * lưu trong bộ lọc đều tự đọc được — mã khách hàng là mã, tên sản phẩm là tên —
 * nên trường hợp tra hụt duy nhất là danh sách chưa nạp xong, và lúc ấy hiện mã
 * vẫn đúng hơn là hiện một chỗ trống.
 *
 * Ngoại lệ nằm ở `tdvUserId`: giá trị là uuid, không đọc được. Danh sách của nó
 * nạp sẵn ngay khi mở bộ lọc nên gần như luôn tra được; khoảnh khắc chưa tra
 * được thì một chuỗi uuid vẫn nói cho người dùng biết "có một điều kiện ở đây".
 */
const nhanCua = (gia: string, biet: Map<string, string>): string => biet.get(gia) ?? gia;

export function ChonNhieu({
  id,
  nhan,
  giaTri,
  nguon,
  goiY = 'Gõ để tìm…',
  doi,
}: {
  id: string;
  nhan: string;
  /** Các giá trị đang chọn. */
  giaTri: string[];
  nguon: NguonChon;
  goiY?: string;
  doi: (v: string[]) => void;
}) {
  const [tim, datTim] = useState('');
  const [ketQua, datKetQua] = useState<TuyChon[]>([]);
  /*
   * Tra danh sách hỏng (`0089`).
   *
   * Nuốt lỗi ở đây cho ra một câu NÓI DỐI: hộp gợi ý hiện *"Không có mục nào
   * khớp"* trong khi sự thật là chưa hỏi được máy chủ. Người dùng kết luận mã
   * họ đang tìm không tồn tại và đi tạo một mã trùng.
   *
   * Không dùng thanh nổi: ô này gọi lại sau mỗi 250ms gõ, nên một thanh nổi
   * cho mỗi lượt hỏng là mưa thông báo. Câu này thay đúng chỗ câu sai kia.
   */
  const [loiTra, datLoiTra] = useState(false);
  const [mo, datMo] = useState(false);
  /** Mục đang được tô trong danh sách gợi ý (mũi tên ↑ ↓ di chuyển, Enter chọn). */
  const [cs, datCs] = useState(0);
  const maDs = useId();
  const khung = useRef<HTMLDivElement>(null);

  /*
   * Nhớ nhãn của MỌI tuỳ chọn từng thấy, không chỉ tuỳ chọn đang hiện.
   *
   * Chọn xong rồi gõ tiếp một từ khoá khác thì danh sách kết quả đổi hẳn, và
   * chip của lần chọn trước mất chỗ tra nhãn — nó sẽ nhảy từ tên sản phẩm về
   * chuỗi mã ngay dưới tay người dùng. `useRef` chứ không `useState`: đây là bộ
   * nhớ phụ, ghi thêm vào nó không phải lý do để vẽ lại màn hình.
   */
  const daBiet = useRef(new Map<string, string>());
  for (const t of ketQua) daBiet.current.set(t.gia, t.nhan);

  useEffect(() => {
    if (Array.isArray(nguon)) {
      for (const t of nguon) daBiet.current.set(t.gia, t.nhan);
      const q = tim.trim().toLowerCase();
      datKetQua(q === '' ? nguon : nguon.filter((t) => t.nhan.toLowerCase().includes(q)));
      return;
    }

    // Nguồn ở máy chủ: chờ người dùng ngừng gõ rồi mới hỏi. Gọi theo từng phím
    // là năm lượt mạng cho một từ khoá năm chữ, và bốn lượt đầu đều vô ích.
    const q = tim.trim();
    if (q === '') {
      datKetQua([]);
      return;
    }
    let song = true;
    const h = setTimeout(() => {
      void nguon(q)
        .then((ds) => {
          if (!song) return;
          for (const t of ds) daBiet.current.set(t.gia, t.nhan);
          datKetQua(ds);
          datLoiTra(false);
        })
        .catch(() => {
          if (!song) return;
          datKetQua([]);
          datLoiTra(true);
        });
    }, 250);
    return () => {
      song = false;
      clearTimeout(h);
    };
  }, [tim, nguon]);

  /*
   * Rời khỏi ô thì gập danh sách lại — HAI đường rời, và phải nghe cả hai.
   *
   * `mousedown` bắt người dùng chuột. `focusin` bắt người dùng bàn phím: Tab
   * sang ô kế tiếp không sinh cú bấm nào, nên chỉ nghe chuột là hai danh sách
   * cùng xoè và chồng lên nhau — đo trong Chrome thật mới thấy, vì với chuột thì
   * `mousedown` đã dọn hộ trước khi ai kịp nhận ra.
   */
  useEffect(() => {
    if (!mo) return;
    const ngoai = (e: Event) => {
      if (khung.current && !khung.current.contains(e.target as Node)) datMo(false);
    };
    document.addEventListener('mousedown', ngoai);
    document.addEventListener('focusin', ngoai);
    return () => {
      document.removeEventListener('mousedown', ngoai);
      document.removeEventListener('focusin', ngoai);
    };
  }, [mo]);

  const them = (t: TuyChon) => {
    daBiet.current.set(t.gia, t.nhan);
    if (!giaTri.includes(t.gia)) doi([...giaTri, t.gia]);
    // Xoá từ khoá sau khi chọn: gần như lần nào người dùng cũng đi tìm thứ TIẾP
    // THEO, và để nguyên từ khoá cũ là bắt họ xoá tay trước mỗi lần chọn.
    datTim('');
  };

  const go = (gia: string) => doi(giaTri.filter((x) => x !== gia));

  // Những mục CÒN CHỌN ĐƯỢC (bỏ mục đã chọn) — danh sách bày ra và danh sách mũi tên đi qua phải là một.
  const hien = ketQua.filter((t) => !giaTri.includes(t.gia));
  const dangMoDs = mo && !(typeof nguon === 'function' && tim.trim() === '');
  const csHopLe = Math.min(cs, Math.max(hien.length - 1, 0));

  return (
    <div className="truong chon-nhieu" ref={khung}>
      <label htmlFor={id}>{nhan}</label>

      {giaTri.length > 0 && (
        <div className="chon-nhieu-chip">
          {giaTri.map((g) => (
            <button
              key={g}
              type="button"
              className="the-loc"
              onClick={() => go(g)}
              aria-label={`Bỏ ${nhanCua(g, daBiet.current)}`}
            >
              <span>{nhanCua(g, daBiet.current)}</span>
              <span className="dau-go-loc" aria-hidden="true">
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Ô nhập và danh sách gợi ý chung MỘT khung định vị — danh sách bám mép dưới CỦA Ô NHẬP, không phải của
          cả `.truong` (nhãn, thẻ đã chọn): xem `.chon-nhieu-o` ở app.css. */}
      <div className="chon-nhieu-o">
        <input
          id={id}
          className="o-nhap"
          type="text"
          value={tim}
          placeholder={goiY}
          autoComplete="off"
          role="combobox"
          aria-expanded={mo}
          aria-controls={maDs}
          aria-autocomplete="list"
          aria-activedescendant={dangMoDs && hien[csHopLe] ? `${maDs}-${csHopLe}` : undefined}
          onFocus={() => datMo(true)}
          onChange={(e) => {
            datTim(e.target.value);
            datCs(0);
            datMo(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') datMo(false);
            // Mũi tên di chuyển trong danh sách gợi ý như mọi ô gợi ý khác; ↓ khi đang đóng thì mở ra.
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (!mo) datMo(true);
              else datCs(Math.min(csHopLe + 1, Math.max(hien.length - 1, 0)));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              datCs(Math.max(csHopLe - 1, 0));
            }
            // Enter chọn mục ĐANG TÔ — mặc định là mục đầu tiên, nên người gõ đúng tên rồi Enter vẫn
            // đi tiếp mà không phải rời tay khỏi bàn phím.
            if (e.key === 'Enter') {
              e.preventDefault();
              const dau = hien[csHopLe];
              if (dau) them(dau);
            }
          }}
        />

        {/*
          Chưa gõ gì mà nguồn ở máy chủ thì KHÔNG mở hộp rỗng ra (`0078`).

          Bản trước mở một hộp chứa đúng một dòng chữ *"Gõ vài chữ để tìm"* — một
          khung trống nói lại điều mà chỗ gợi ý trong ô nhập đã nói, và nó che mất
          ô ngay bên dưới. Không có gì để bày thì đừng bày gì cả.
        */}
        {dangMoDs && (
          <ul className="chon-nhieu-ds" id={maDs} role="listbox" aria-multiselectable="true">
            {hien.length === 0 ? (
              <li className="chon-nhieu-trong">
                {loiTra ? 'Không tra được danh sách. Kiểm tra kết nối rồi gõ lại.' : 'Không có mục nào khớp'}
              </li>
            ) : (
              hien.map((t, i) => (
                <li key={t.gia}>
                  <button
                    type="button"
                    id={`${maDs}-${i}`}
                    className="chon-nhieu-muc"
                    role="option"
                    aria-selected={i === csHopLe}
                    onMouseMove={() => i !== csHopLe && datCs(i)}
                    // `mousedown` + `preventDefault`: giữ tiêu điểm ở ô nhập, để chọn xong gõ tiếp được.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => them(t)}
                  >
                    {t.nhan}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
