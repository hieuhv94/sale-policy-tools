/**
 * Ai phải được chọn ở bước nào (`0031`).
 *
 * Bản sao của bảng `PHAN_CONG` bên `workflow.service.ts`, và đó là chủ ý — cùng
 * luật với mọi bảng vai trò khác trong ứng dụng: **giao diện dựng ô, máy chủ
 * chặn**. Máy chủ tin bảng của giao diện là tin một thứ người dùng sửa được.
 *
 * Ba dòng này thay cho toàn bộ cây tổ chức. Trước đây hồ sơ tự tìm đường qua
 * `approver_user_id` và chuỗi cấp trên, và người dùng không nhìn thấy đường ấy ở
 * đâu cả — hồ sơ chỉ đơn giản là "đi tiếp". Giờ mỗi lần chuyển tay là một lần
 * người đang cầm hồ sơ nói rõ mình giao cho ai.
 */
export type VaiTroChon = 'TBP' | 'KE_TOAN' | 'SALE_ADMIN';

export type OChon = {
  /** Tên trường gửi lên máy chủ. Phải khớp DTO của `POST /policies/:id/actions/:action`. */
  truong: 'tbpUserId' | 'keToanUserId' | 'saleAdminUserId';
  vaiTro: VaiTroChon;
  nhan: string;
  /** Câu giải thích dưới ô — vì sao người dùng phải chọn, không phải ô này là gì. */
  moTa: string;
};

const CHON_TBP: OChon = {
  truong: 'tbpUserId',
  vaiTro: 'TBP',
  nhan: 'Trưởng bộ phận duyệt',
  moTa: 'Người sẽ ký số duyệt hồ sơ này. Chỉ người được chọn nhìn thấy nó trong hộp việc.',
};

const CHON_KE_TOAN: OChon = {
  truong: 'keToanUserId',
  vaiTro: 'KE_TOAN',
  nhan: 'Kế toán tiếp nhận',
  moTa: 'Người tiếp nhận cả lần 1 và lần 2, và là người xuất hợp đồng.',
};

/**
 * Bước này hỏi NHỮNG AI — phụ thuộc cả hành động lẫn TRẠNG THÁI hồ sơ (`0141`).
 *
 * Bản sao phía giao diện của `phanCongCua` ở `policy/workflow.service.ts`, và nó
 * chỉ để **đừng bày ra một ô mà bấm vào chắc chắn bị từ chối**. Máy chủ vẫn là
 * chốt thật: gửi kèm một ô nó không hỏi thì nó bỏ qua, thiếu một ô nó hỏi thì nó
 * trả `ASSIGNEE_REQUIRED`.
 *
 * HAI luật, cả hai do khách hàng chốt 27/08:
 *
 *   - **Gửi lại sau khi sửa KHÔNG chọn lại ai.** Trưởng bộ phận và Kế toán đã
 *     chọn từ lượt gửi đầu, và đường trả về không xoá họ. Chọn lại được nghĩa là
 *     người vừa trả hồ sơ về có thể bị ghi đè khỏi cột `tbp_user_id` — mà phạm
 *     vi đọc tính theo đúng bốn cột ấy, nên họ mất quyền mở chính hồ sơ mình vừa
 *     trả lại.
 *   - **Tiếp nhận L1 chỉ hỏi Sale Admin ở lượt ĐẦU.** Hồ sơ đi vòng thứ hai thì
 *     người ấy đã có; hỏi lại là mời chọn khác đi, tức đẩy hồ sơ sang một người
 *     chưa từng thấy nó.
 */
export const oChonCua = (hanhDong: string, hoSo?: { daChonSaleAdmin?: boolean }): OChon[] => {
  if (hanhDong === 'SUBMIT') return [CHON_TBP, CHON_KE_TOAN];
  if (hanhDong === 'KT_RECEIVE_L1') return hoSo?.daChonSaleAdmin ? [] : [CHON_SALE_ADMIN];
  return [];
};

const CHON_SALE_ADMIN: OChon = {
  truong: 'saleAdminUserId',
  vaiTro: 'SALE_ADMIN',
  nhan: 'Sale Admin xử lý',
  moTa: 'Người in bản cứng, trình Ban lãnh đạo ký, scan và bàn giao lại.',
};

/*
 * `CAN_XEM_TRUOC` ĐÃ GỠ (`0163`).
 *
 * Nó khai hai hành động gửi duyệt là "có bản xem trước", vì `0098` bắt người gửi
 * chọn văn bản mẫu và `0140` tách việc đọc lại thành bước hai. Bản mềm giờ là
 * thao tác in của Sale Admin ở bước B8, nên lượt gửi duyệt không xem trước gì
 * cả và hộp thoại về đúng một bước.
 */

export type NguoiChon = { id: string; username: string; fullName: string };
