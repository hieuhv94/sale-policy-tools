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
 *     Bốn ô CPBH gấp vào một dòng tổng, bấm mới mở.
 *
 * Điều dễ làm sai nhất ở đây là "ẩn bớt cột cho vừa màn hình". Bốn ô CPBH là
 * thứ quyết định giá thu về, và giá thu về quyết định tỷ lệ chiết khấu — ẩn đi
 * là làm người duyệt ký vào một con số họ không kiểm được.
 *
 * Cả ba cách bố trí dùng CÙNG MỘT cây DOM, chỉ khác CSS. Dựng ba cây theo
 * `window.innerWidth` thì xoay ngang điện thoại giữa lúc đang gõ sẽ tháo và dựng
 * lại ô nhập — mất nội dung và mất tiêu điểm (`FE-06`).
 */
import { useState } from 'react';
import { tien, tyLe } from '../lib/format.js';

export type DongSanPham = {
  id: string;
  productCode: string;
  productName: string;
  companyPrice: string;
  wholesalePrice: string;
  cpbh1: string;
  cpbh2: string;
  cpbh3: string;
  cpbh4: string;
  cpbhTotal: string;
  netPrice: string;
  discountRate: string;
  threshold: string | null;
  overThreshold: boolean;
};

export const COT = [
  { khoa: 'productCode', nhan: 'Mã SP' },
  { khoa: 'productName', nhan: 'Tên sản phẩm' },
  { khoa: 'companyPrice', nhan: 'Giá bán Công ty' },
  { khoa: 'wholesalePrice', nhan: 'Giá bán buôn' },
  { khoa: 'cpbh1', nhan: 'CPBH 1' },
  { khoa: 'cpbh2', nhan: 'CPBH 2' },
  { khoa: 'cpbh3', nhan: 'CPBH 3' },
  { khoa: 'cpbh4', nhan: 'CPBH 4' },
  { khoa: 'netPrice', nhan: 'Giá thu về' },
  { khoa: 'discountRate', nhan: 'Tỷ lệ CK' },
] as const;

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
    </span>
  );
}

function CpbhGop({ d }: { d: DongSanPham }) {
  const [mo, datMo] = useState(false);
  const co = [d.cpbh1, d.cpbh2, d.cpbh3, d.cpbh4];
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
      {mo && (
        <dl className="cpbh-chi-tiet">
          {co.map((v, i) => (
            <div key={i}>
              <dt>CPBH {i + 1}</dt>
              <dd className="so">{tien(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * `xoaDong` chỉ truyền khi hồ sơ đang sửa được. Cột thao tác là cột THÊM VÀO,
 * không thay chỗ cột nào — chú thích đầu tệp cấm ẩn bớt cột, và bốn ô CPBH vẫn
 * là thứ quyết định giá thu về dù màn hình đang ở chế độ sửa.
 */
export function BangSanPham({
  dong,
  xoaDong,
  dangXoa,
}: {
  dong: DongSanPham[];
  xoaDong?: ((id: string) => void) | undefined;
  dangXoa?: string | null | undefined;
}) {
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
              {COT.map((c) => (
                <th key={c.khoa} className={c.khoa === 'productName' ? 'cot-khoa' : undefined}>
                  {c.nhan}
                </th>
              ))}
              {xoaDong && <th>Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {dong.map((d) => (
              <tr key={d.id} className={d.overThreshold ? 'vuot-nguong' : undefined}>
                <td>{d.productCode}</td>
                <th scope="row" className="cot-khoa">
                  {d.productName}
                </th>
                <td className="so">{tien(d.companyPrice)}</td>
                <td className="so">{tien(d.wholesalePrice)}</td>
                <td className="so">{tien(d.cpbh1)}</td>
                <td className="so">{tien(d.cpbh2)}</td>
                <td className="so">{tien(d.cpbh3)}</td>
                <td className="so">{tien(d.cpbh4)}</td>
                <td className="so">{tien(d.netPrice)}</td>
                <td className="so">
                  <OTyLe d={d} />
                </td>
                {xoaDong && (
                  <td>
                    <button
                      type="button"
                      className="nut nut-canh-bao"
                      disabled={dangXoa === d.id}
                      onClick={() => xoaDong(d.id)}
                    >
                      Xoá dòng
                    </button>
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
          <li key={d.id} className={d.overThreshold ? 'the vuot-nguong' : 'the'}>
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
            </dl>
            <CpbhGop d={d} />
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
          </li>
        ))}
      </ul>
    </>
  );
}
