/**
 * Tên pháp nhân ở phía giao diện — bản chép DUY NHẤT (`0151`, `0244`).
 *
 * Bản gốc là hằng `COMPANY` của `document` (`contracts/dinh-dang.ts`), thứ in lên
 * tờ CSBH. Giao diện không import được nó: kéo một service vào gói trình duyệt là
 * kéo cả cây phụ thuộc máy chủ theo, và `FE-38` chặn gói ở 250KB. Nên đây là bản
 * chép, và `tests/http/ten-cong-ty.test.ts` đòi nó khớp `COMPANY.name` TỪNG CHỮ
 * (chỉ khác dạng chữ hoa/thường). Màn hình đăng nhập và chân trang cùng đọc từ
 * đây — trước `0244` cái tên gõ thẳng trong `DangNhap.tsx`, và chỗ dùng thứ hai
 * sẽ là bản chép thứ hai.
 */
export const TEN_CONG_TY = 'Công ty TNHH Dược phẩm Nutricare';

export const TEN_PHAN_MEM = 'Phần mềm Chính sách bán hàng';
