/**
 * "Dòng hồ sơ này lấy bảng giá của NGÀY NÀO" — một câu trả lời, một chỗ.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO KHÔNG PHẢI LÀ CHÍNH `ngay_ap_dung` (`0201`)
 * ---------------------------------------------------------------------------
 *
 * `0180` cho mỗi dòng một ngày áp dụng riêng, và ngày ấy quyết định bảng giá
 * được chụp (`0029`). Đường đối chiếu của `0194` dùng lại đúng ngày ấy, và ở đó
 * nó làm phép so thành một câu hỏi rỗng: ảnh chụp lấy ra từ bảng giá của ngày X,
 * rồi lại đem so với bảng giá của ngày X. Bảng giá của một ngày ĐÃ QUA thì không
 * đổi nữa — `0123` bắt mọi lượt đổi giá hiệu lực TỪ HÔM NAY — nên **một dòng đề
 * ngày quá khứ không bao giờ nhìn thấy được lượt đổi giá nào**.
 *
 * Chỗ nó cắn, đo được trên chồng kiểm: lập phiên bản mới cho một CSBH đang hiệu
 * lực. Dòng thừa kế giữ nguyên ngày của bản cũ (cố ý — xem lượt chép ở `create`),
 * nên nó luôn mang một ngày quá khứ. Cùng một khách, cùng một sản phẩm, cùng một
 * danh mục:
 *
 *   bản đang hiệu lực (đóng băng, so với HÔM NAY) → PRICE 100.000 → 130.000
 *   bản mới          (sửa được, so với ngày dòng) → không lệch gì
 *
 * Và nó không dừng ở một câu cảnh báo mất tích: `lamMoiDong` đọc cùng bộ số ấy,
 * nên nút *Tự động cập nhật* trả `conLai: 0`, lượt gửi duyệt chụp lại đúng con số
 * cũ, `STALE_LINE` không có gì để chặn — **bản CSBH mới được ký với giá đã lỗi
 * thời**.
 *
 * `max(ngày áp dụng, hôm nay)` chứ không phải "luôn hôm nay": dòng đề ngày TƯƠNG
 * LAI vẫn phải tra bảng giá của ngày ấy, nếu không thì phép so báo lệch ngược và
 * nút cập nhật ghi đè giá tương lai bằng giá hôm nay. Đây cũng chính là điều
 * `0029` sinh ra để bảo đảm: ví dụ của nó là *"dòng áp dụng từ 01/09 mang bảng
 * giá của 01/09, kể cả khi được lập từ tháng 8"* — một ngày ở TƯƠNG LAI so với
 * lúc lập. Phép quy đổi này giữ nguyên ý ấy và chỉ cắt đi cái hệ quả chưa ai
 * yêu cầu.
 *
 * ---------------------------------------------------------------------------
 * AI DÙNG, VÀ AI KHÔNG (`0203`)
 * ---------------------------------------------------------------------------
 *
 * DÙNG — mọi đường mà TDV đang soạn một dòng của hồ sơ CÒN SỬA ĐƯỢC:
 *
 *   * `soSanhDong` / `lamMoiDong` (qua `docDongVaAnh`) — đối chiếu và làm mới;
 *   * `addLine` · `updateLine` — thêm và sửa một dòng;
 *   * `thresholdPreview` — hộp thoại xem trước, và nó BẮT BUỘC phải khớp với hai
 *     đường trên: bày một con số rồi ghi một con số khác là đúng lỗi mà `0193`
 *     sinh ra để chống.
 *
 * KHÔNG DÙNG — `create` khi thân request mang sẵn `lines`. Đường ấy tra ảnh chụp
 * CẢ LÔ theo ngày trước khi vào `upsertLine` (`0180`), và giao diện **không bao
 * giờ đi qua nó**: cả *Lập hồ sơ* lẫn *Lập phiên bản mới* đều gửi `lines: []` rồi
 * thêm từng dòng bằng `addLine`. Người dùng vì thế không có chỗ nào nhìn thấy hai
 * câu trả lời. Nếu có ngày giao diện gửi `lines` lúc lập, chỗ ấy phải theo luật
 * này — có ca kiểm ghim rằng nó đang KHÔNG theo, để lượt đổi là một quyết định
 * chứ không phải một hệ quả.
 */
export const ngayTraDanhMuc = (ngayApDung: string, homNay: string): string =>
  ngayApDung > homNay ? ngayApDung : homNay;
