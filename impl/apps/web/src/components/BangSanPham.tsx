/**
 * Bảng dòng sản phẩm — màn hình khó nhất của cả ứng dụng.
 *
 * Mười cột số phải đọc được trên màn hình rộng 360px. Ba yêu cầu, ba cách bố
 * trí khác nhau, và điều quan trọng là chúng KHÔNG phải ba mức độ của cùng một
 * thứ:
 *
 *   - **≥1024px (`FE-05`)** — đủ 10 cột, không cắt chữ.
 *   - **640–1023px (`FE-04`)** — cuộn ngang TRONG KHUNG RIÊNG, cột Tên sản phẩm
 *     khoá cố định bên trái. Không có cột khoá thì cuộn sang phải là mất dấu
 *     đang đọc dòng nào — với bảng tiền thì đó là đọc nhầm số của sản phẩm khác.
 *   - **<640px (`FE-03`)** — mỗi dòng thành một THẺ. **Không cột nào biến mất.**
 *     Các ô CPBH gấp vào một dòng tổng, bấm mới mở.
 *
 * Điều dễ làm sai nhất ở đây là "ẩn bớt cột cho vừa màn hình". Các ô CPBH là
 * thứ quyết định giá thu về, và giá thu về quyết định tỷ lệ chiết khấu — ẩn đi
 * là làm người duyệt ký vào một con số họ không kiểm được.
 *
 * SỐ CỘT CPBH KHÔNG CỐ ĐỊNH (0021). Mỗi dòng có số khoản riêng; bảng lấy số cột
 * của dòng nhiều khoản nhất, dòng ít hơn để ô TRỐNG. Không điền số 0 thay: số 0
 * là một con số có nghĩa ("khoản này bằng không"), ô trống nói đúng điều cần nói
 * là dòng ấy không có khoản thứ mấy đó.
 *
 * Cả ba cách bố trí dùng CÙNG MỘT cây DOM, chỉ khác CSS. Dựng ba cây theo
 * `window.innerWidth` thì xoay ngang điện thoại giữa lúc đang gõ sẽ tháo và dựng
 * lại ô nhập — mất nội dung và mất tiêu điểm (`FE-06`).
 */
import { useState } from 'react';
import { tien, tyLe } from '../lib/format.js';

export type DongSanPham = {
  id: string;
  /** Cần cho việc SỬA dòng: máy chủ nhận diện dòng theo sản phẩm, không theo id. */
  productId: string;
  productCode: string;
  productName: string;
  companyPrice: string;
  wholesalePrice: string;
  /** Các khoản chi phí bán hàng, số lượng tuỳ dòng. */
  cpbh: string[];
  cpbhTotal: string;
  netPrice: string;
  discountRate: string;
  threshold: string | null;
  overThreshold: boolean;
  /**
   * Ngưỡng của dòng này từ đâu ra (`0022`, `0023`).
   *
   * `PRODUCT_DEFAULT` và `KHONG_CO` đều nghĩa là **không có quy định chiết khấu
   * nào phủ** sản phẩm này với loại khách và kênh của khách hàng. Khác nhau ở
   * chỗ rơi về đâu: mặc định khai trong danh mục sản phẩm, hay không có ngưỡng
   * nào để đối chiếu. Cả hai đều không phải lỗi, và cả hai đều là thứ người
   * duyệt cần biết — con số ấy không đến từ chính sách chiết khấu đã ban hành.
   *
   * `null` là dòng lập trước 0022, không rõ nguồn — KHÔNG tô cảnh báo.
   */
  thresholdSource?: 'RULE' | 'PRODUCT_DEFAULT' | 'KHONG_CO' | null | undefined;
  /** Mã quy định đã cho ra ngưỡng. `null` với hai nguồn còn lại (`0023`). */
  ruleId?: string | null | undefined;
};

/** Dòng KHÔNG có quy định chiết khấu nào phủ — dù có rơi về mặc định hay không. */
export const thieuQuyDinh = (d: DongSanPham): boolean =>
  d.thresholdSource === 'PRODUCT_DEFAULT' || d.thresholdSource === 'KHONG_CO';

/**
 * Lớp CSS của một dòng. Hai cảnh báo có thể cùng đúng trên một dòng, mà một dòng
 * chỉ tô được một nền — nên VƯỢT NGƯỠNG THẮNG: nó là thứ chặn hồ sơ đi tiếp,
 * còn thiếu quy định chỉ là thông tin về nguồn con số. Dấu hiệu thiếu quy định
 * không mất đi khi đó: nó nằm trong ô Tỷ lệ CK, ngoài nền.
 */
export const lopDong = (d: DongSanPham): string | undefined =>
  d.overThreshold ? 'vuot-nguong' : thieuQuyDinh(d) ? 'thieu-quy-dinh' : undefined;

/** Cột cố định, KHÔNG kể các cột CPBH — số cột CPBH tuỳ dữ liệu. */
export const COT_TRUOC = [
  { khoa: 'productCode', nhan: 'Mã SP' },
  { khoa: 'productName', nhan: 'Tên sản phẩm' },
  { khoa: 'companyPrice', nhan: 'Giá bán Công ty' },
  { khoa: 'wholesalePrice', nhan: 'Giá bán buôn' },
] as const;

export const COT_SAU = [
  { khoa: 'netPrice', nhan: 'Giá thu về' },
  { khoa: 'discountRate', nhan: 'Tỷ lệ CK' },
  /*
   * Mã quy định chiết khấu đã cho ra ngưỡng của dòng này (`0023`).
   *
   * Đứng NGAY SAU Tỷ lệ CK vì nó trả lời chính câu hỏi mà con số ấy gợi ra —
   * "ngưỡng đem so là ngưỡng nào, ai khai". Dán mã này vào ô tìm kiếm ở màn hình
   * Chiết khấu là ra đúng dòng quy định.
   *
   * Ô TRỐNG khi không có: dòng rơi về mặc định của sản phẩm, hoặc không có ngưỡng
   * nào. Ba dấu chấm hay chữ "không có" ở đây chỉ làm bảng ồn thêm — cột kế bên
   * đã mang dấu ◆ nói đúng điều đó rồi.
   */
  { khoa: 'ruleId', nhan: 'QĐCK' },
] as const;

/**
 * Số cột CPBH của cả bảng = dòng NHIỀU KHOẢN NHẤT.
 *
 * Một bảng phải có số cột đều nhau, nếu không thì không đọc theo hàng dọc được.
 * Cùng luật với bản in A4 (`sheet.ts:soCotCpbh`) — hai chỗ phải ra cùng một con
 * số, nếu không thì bản trên màn hình và bản ký tên khác nhau.
 */
export const soCotCpbh = (dong: readonly DongSanPham[]): number =>
  dong.reduce((max, d) => Math.max(max, d.cpbh?.length ?? 0), 0);

/** Nhãn đủ cho mọi cột, dựng theo số cột CPBH thật. Dùng cho test bố cục. */
export const cotCho = (dong: readonly DongSanPham[]) => [
  ...COT_TRUOC,
  ...Array.from({ length: soCotCpbh(dong) }, (_, i) => ({
    khoa: `cpbh${i + 1}`,
    nhan: `CPBH ${i + 1}`,
  })),
  ...COT_SAU,
];

/**
 * Dấu hiệu vượt ngưỡng KHÔNG chỉ là màu đỏ (`FE-28`).
 *
 * Khoảng 8% nam giới mù màu đỏ-lục; với họ ô đỏ và ô thường trông giống nhau.
 * Nên vượt ngưỡng mang cả ba: một dấu chấm than, chữ "vượt ngưỡng" cho trình
 * đọc màn hình, và màu. Bỏ bất kỳ cái nào thì có một nhóm người dùng không thấy.
 */
function OTyLe({ d }: { d: DongSanPham }) {
  return (
    <span className={d.overThreshold ? 'ty-le vuot' : 'ty-le'}>
      {d.overThreshold && (
        <span className="dau-vuot" aria-hidden="true">
          !
        </span>
      )}
      {tyLe(d.discountRate)}
      {d.overThreshold && (
        <span className="chi-doc-man-hinh">
          {' '}
          vượt ngưỡng {tyLe(d.threshold)}
        </span>
      )}
      {/*
        Dấu thiếu quy định đi CÙNG chỗ với dấu vượt ngưỡng và theo cùng ba lớp
        (`FE-28`): một ký hiệu nhìn thấy, một câu cho trình đọc màn hình, và màu
        nền của dòng. Nó vẫn hiện khi dòng đang đỏ vì vượt ngưỡng — hai chuyện
        khác nhau, mất một cái là mất một nửa câu trả lời.
      */}
      {thieuQuyDinh(d) && (
        <>
          <span className="dau-mac-dinh" aria-hidden="true">
            ◆
          </span>
          {/* Cùng một ký hiệu, HAI câu khác nhau: rơi về mặc định là còn một con
              số để đối chiếu, còn không có ngưỡng nào thì không. Người dùng
              trình đọc màn hình không thấy được sự khác biệt ấy qua màu. */}
          <span className="chi-doc-man-hinh">
            {d.thresholdSource === 'KHONG_CO'
              ? ' chưa có quy định chiết khấu nào áp dụng, và sản phẩm cũng không có ngưỡng mặc định'
              : ' ngưỡng mặc định của sản phẩm, chưa có quy định chiết khấu nào áp dụng'}
          </span>
        </>
      )}
    </span>
  );
}

/**
 * Chú thích màu — bảng tô màu mà không nói màu nghĩa là gì thì màu chỉ là trang trí.
 *
 * Hiện CẢ HAI mục ngay cả khi bảng chưa có dòng nào mang màu ấy. Người dùng gặp
 * dòng đỏ đầu tiên vào lúc đang lập hồ sơ dở, và đó là lúc tệ nhất để đi tìm xem
 * màu đỏ nghĩa là gì.
 */
export function ChuThichMau() {
  return (
    <ul className="chu-thich-mau">
      <li>
        <span className="o-mau o-mau-loi" aria-hidden="true" />
        <span className="dau-vuot" aria-hidden="true">
          !
        </span>{' '}
        <strong>Vượt ngưỡng</strong> — tỷ lệ chiết khấu cao hơn ngưỡng cho phép. Hồ sơ vẫn gửi được
        nhưng người duyệt sẽ thấy dấu này.
      </li>
      <li>
        <span className="o-mau o-mau-canh-bao" aria-hidden="true" />
        <span className="dau-mac-dinh" aria-hidden="true">
          ◆
        </span>{' '}
        <strong>Chưa có quy định chiết khấu</strong> — không quy định nào phủ sản phẩm này với loại
        khách và kênh của khách hàng. Ngưỡng lấy từ mặc định khai trong danh mục sản phẩm, hoặc
        không có ngưỡng nào để đối chiếu. Hồ sơ vẫn lập và vẫn duyệt được; báo Quản trị hệ thống nếu
        cần một ngưỡng cho sản phẩm này.
      </li>
      <li>
        <span className="o-mau" aria-hidden="true" />
        Cột <strong>QĐCK</strong> là mã quy định đã cho ra ngưỡng của dòng. Dán mã đó vào ô tìm kiếm
        ở màn hình <em>Chiết khấu</em> để xem chính quy định ấy. Ô trống nghĩa là không có quy định
        nào — đúng những dòng mang dấu ◆.
      </li>
    </ul>
  );
}

function CpbhGop({ d }: { d: DongSanPham }) {
  const [mo, datMo] = useState(false);
  const co = d.cpbh ?? [];
  return (
    <div className="cpbh-gop">
      <button
        type="button"
        className="cpbh-nut"
        aria-expanded={mo}
        onClick={() => datMo((x) => !x)}
      >
        <span>Tổng CPBH</span>
        <span className="so">{tien(d.cpbhTotal)}</span>
        <span className="mui-ten" aria-hidden="true">
          {mo ? '▲' : '▼'}
        </span>
      </button>
      {mo &&
        (co.length === 0 ? (
          <p className="ghi-chu">Dòng này không có khoản chi phí bán hàng nào.</p>
        ) : (
          <dl className="cpbh-chi-tiet">
            {co.map((v, i) => (
              <div key={i}>
                <dt>CPBH {i + 1}</dt>
                <dd className="so">{tien(v)}</dd>
              </div>
            ))}
          </dl>
        ))}
    </div>
  );
}

/**
 * `xoaDong` và `suaDong` chỉ truyền khi hồ sơ đang sửa được. Cột thao tác là cột THÊM VÀO,
 * không thay chỗ cột nào — chú thích đầu tệp cấm ẩn bớt cột, và bốn ô CPBH vẫn
 * là thứ quyết định giá thu về dù màn hình đang ở chế độ sửa.
 */
export function BangSanPham({
  dong,
  xoaDong,
  suaDong,
  dangXoa,
}: {
  dong: DongSanPham[];
  xoaDong?: ((id: string) => void) | undefined;
  /**
   * Sửa một dòng đã có.
   *
   * Trước đây chỉ có Xoá, nên đổi một con số nghĩa là xoá dòng rồi thêm lại từ
   * đầu — gõ lại cả giá bán buôn lẫn mọi khoản chi phí, và trong khoảng giữa hai
   * thao tác thì hồ sơ thiếu mất một sản phẩm.
   */
  suaDong?: ((d: DongSanPham) => void) | undefined;
  dangXoa?: string | null | undefined;
}) {
  const coThaoTac = xoaDong !== undefined || suaDong !== undefined;
  if (dong.length === 0) {
    return (
      <p className="trong">
        Hồ sơ chưa có dòng sản phẩm nào. Thêm sản phẩm để tính được tỷ lệ chiết khấu.
      </p>
    );
  }

  return (
    <>
      {/* ≥640px: bảng thật, cuộn ngang trong khung riêng ở 640–1023px. */}
      <div className="khung-cuon" role="region" aria-label="Bảng dòng sản phẩm" tabIndex={0}>
        <table className="bang-san-pham">
          <thead>
            <tr>
              {cotCho(dong).map((c) => (
                <th key={c.khoa} className={c.khoa === 'productName' ? 'cot-khoa' : undefined}>
                  {c.nhan}
                </th>
              ))}
              {coThaoTac && <th>Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {dong.map((d) => (
              <tr key={d.id} className={lopDong(d)}>
                <td>{d.productCode}</td>
                <th scope="row" className="cot-khoa">
                  {d.productName}
                </th>
                <td className="so">{tien(d.companyPrice)}</td>
                <td className="so">{tien(d.wholesalePrice)}</td>
                {/* Ô TRỐNG cho dòng ít khoản hơn, không phải số 0 — xem chú
                    thích đầu tệp. */}
                {Array.from({ length: soCotCpbh(dong) }, (_, k) => (
                  <td key={k} className="so">
                    {d.cpbh?.[k] === undefined ? '' : tien(d.cpbh[k])}
                  </td>
                ))}
                <td className="so">{tien(d.netPrice)}</td>
                <td className="so">
                  <OTyLe d={d} />
                </td>
                <td className="ma-quy-dinh">{d.ruleId ?? ''}</td>
                {coThaoTac && (
                  <td>
                    <div className="nhom-nut nhom-nut-gon">
                      {suaDong && (
                        <button type="button" className="nut nut-nhe" onClick={() => suaDong(d)}>
                          Sửa
                        </button>
                      )}
                      {xoaDong && (
                        <button
                          type="button"
                          className="nut nut-canh-bao"
                          disabled={dangXoa === d.id}
                          onClick={() => xoaDong(d.id)}
                        >
                          Xoá dòng
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* <640px: thẻ. Đủ MỌI cột, bốn ô CPBH gấp lại. */}
      <ul className="the-san-pham">
        {dong.map((d) => (
          <li key={d.id} className={['the', lopDong(d)].filter(Boolean).join(' ')}>
            <div className="the-dau">
              <span className="ma">{d.productCode}</span>
              <h3>{d.productName}</h3>
            </div>
            <dl className="the-so">
              <div>
                <dt>Giá bán Công ty</dt>
                <dd className="so">{tien(d.companyPrice)}</dd>
              </div>
              <div>
                <dt>Giá bán buôn</dt>
                <dd className="so">{tien(d.wholesalePrice)}</dd>
              </div>
              <div>
                <dt>Giá thu về</dt>
                <dd className="so">{tien(d.netPrice)}</dd>
              </div>
              <div>
                <dt>Tỷ lệ CK</dt>
                <dd className="so">
                  <OTyLe d={d} />
                </dd>
              </div>
              {/* Chỉ hiện khi CÓ. Bố trí thẻ dành cho màn hình hẹp nhất; một ô
                  rỗng mang nhãn "QĐCK" ở đó là một dòng chữ không nói gì. */}
              {d.ruleId && (
                <div>
                  <dt>QĐCK</dt>
                  <dd className="ma-quy-dinh">{d.ruleId}</dd>
                </div>
              )}
            </dl>
            <CpbhGop d={d} />
            {coThaoTac && (
              <div className="nhom-nut nhom-nut-gon">
                {suaDong && (
                  <button type="button" className="nut nut-nhe" onClick={() => suaDong(d)}>
                    Sửa
                  </button>
                )}
                {xoaDong && (
                  <button
                    type="button"
                    className="nut nut-canh-bao"
                    disabled={dangXoa === d.id}
                    onClick={() => xoaDong(d.id)}
                  >
                    Xoá dòng
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Nằm TRONG component chứ không ở trang gọi: mọi chỗ bày bảng này đều
          bày cùng bộ màu, nên chú thích phải đi theo bảng. Để trang tự thêm thì
          sớm muộn có một trang quên. */}
      <ChuThichMau />
    </>
  );
}
