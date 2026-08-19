/**
 * Chọn VAI TRÒ nào của một hồ sơ được nhận thư, sau khi đã trừ những người
 * chắc chắn sẽ nhận một lá thư khác về cùng một chuyện (`0066`).
 *
 * Vì sao lọc ở NƠI PHÁT sự kiện chứ không ở `notification`: chỉ nơi này biết
 * lá thư kia gửi cho ai. `notification` xử lý từng sự kiện một cách độc lập —
 * nó không có cách nào biết rằng hai sự kiện vừa ghi vào cùng một transaction
 * sẽ tới cùng một hộp thư trong cùng một giây.
 *
 * Đây đúng là loại lỗi đã bắt hệ thống trả giá một lần: Kế toán nhận HAI thư
 * mỗi lần Trưởng bộ phận ký, vì hai sự kiện phát cùng lúc đều có tên họ. Lần ấy
 * phải gỡ hẳn một trạng thái khỏi máy trạng thái mới dứt được.
 *
 * `notification` dịch vai trò sang người bằng bốn id đi kèm sự kiện, nên trả về
 * TÊN VAI TRÒ là đủ — miễn là sự kiện mang theo bốn id của ĐÚNG hồ sơ này.
 */

/** Bốn người của một hồ sơ, theo đúng thứ tự vai trò ở bảng muc 3. */
export type BonNguoi = {
  tdv_user_id: string | null;
  tbp_user_id: string | null;
  ke_toan_user_id: string | null;
  sale_admin_user_id: string | null;
};

const THU_TU: [string, keyof BonNguoi][] = [
  ['TDV', 'tdv_user_id'],
  ['TBP', 'tbp_user_id'],
  ['KE_TOAN', 'ke_toan_user_id'],
  ['SALE_ADMIN', 'sale_admin_user_id'],
];

/**
 * Vai trò của `hoSo` mà người giữ nó KHÔNG nằm trong `daBaoRoi`.
 *
 * Ô trống bị bỏ qua: hồ sơ chưa đi hết luồng thì chưa có Sale Admin, và một vai
 * trò không có người là một vai trò không gửi thư được.
 *
 * Trả về mảng RỖNG là một câu trả lời hợp lệ, không phải lỗi — nghĩa là mọi
 * người liên quan đều đã được báo bằng lá thư kia. Nơi gọi phải hiểu đó là
 * "đừng phát sự kiện thư nào cả".
 */
export function vaiTroConLai(hoSo: BonNguoi, daBaoRoi: (string | null)[] = []): string[] {
  const bo = new Set(daBaoRoi.filter((x): x is string => !!x));
  const ra: string[] = [];
  for (const [vaiTro, cot] of THU_TU) {
    const id = hoSo[cot];
    // Cùng một người giữ hai vai trò trên một hồ sơ là chuyện không xảy ra ở
    // đây (bốn vai trò, bốn tài khoản khác nhau), nhưng `notification` vẫn khử
    // trùng theo địa chỉ thư lần nữa nên có lỡ trùng cũng không thành hai thư.
    if (id && !bo.has(id)) ra.push(vaiTro);
  }
  return ra;
}
