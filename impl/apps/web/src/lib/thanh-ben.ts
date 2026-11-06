/**
 * Thanh bên THU GỌN (`0257`) — chỉ còn cột biểu tượng.
 *
 * Nhớ bằng `localStorage`, theo đúng lối `giao-dien.ts`: đây là tiện ích của
 * MỘT người trên MỘT máy (người dùng màn hình nhỏ thu lại để bảng sản phẩm có
 * thêm chỗ), không phải dữ liệu nghiệp vụ — nên không lên máy chủ.
 *
 * Mọi lượt đọc/ghi bọc `try`: cửa sổ ẩn danh hay trình duyệt chặn lưu trữ thì
 * `localStorage` NÉM lỗi chứ không trả `null`, và một tiện ích hiển thị không
 * được làm sập cả khung ứng dụng. Không đọc được thì coi như đang MỞ RỘNG — trạng
 * thái mặc định, trạng thái người mới vào cần.
 *
 * Dưới 1024px thanh bên là ngăn kéo; ở đó CSS bỏ qua lớp `thu-gon` hoàn toàn và
 * nút thu gọn không hiện — trạng thái đã nhớ vẫn nằm nguyên, chờ màn hình rộng.
 */
import { useCallback, useState } from 'react';

const KHOA = 'csbh:thanh-ben-gon';

function docGon(): boolean {
  try {
    return localStorage.getItem(KHOA) === '1';
  } catch {
    return false;
  }
}

export function useThanhBenGon(): { gon: boolean; doi: () => void } {
  const [gon, datGon] = useState(docGon);
  const doi = useCallback(() => {
    datGon((cu) => {
      const moi = !cu;
      try {
        if (moi) localStorage.setItem(KHOA, '1');
        else localStorage.removeItem(KHOA);
      } catch {
        /* Không ghi được: vẫn đổi trong phiên này, chỉ là không nhớ sang lần sau. */
      }
      return moi;
    });
  }, []);
  return { gon, doi };
}
