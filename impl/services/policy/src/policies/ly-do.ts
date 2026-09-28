/**
 * "Lý do gần nhất còn là VIỆC của ai đó không" — một câu trả lời, một chỗ (`0221`).
 *
 * Khách hàng chốt 25/09: khối lý do trên trang hồ sơ **chỉ hiện ở hai lúc** —
 * hồ sơ đang *Yêu cầu chỉnh sửa* (TDV phải sửa theo nó), hoặc Kế toán vừa *Yêu
 * cầu in lại* và hồ sơ nằm ở bàn Sale Admin (SA phải tải lên bản cứng mới theo
 * nó). Ngoài hai lúc ấy lý do đã được xử lý xong, và bày nó ra là bày một việc
 * đã làm như thể còn phải làm.
 *
 * Điều này ĐẢO một ca của `0189` (*"gửi lại sau khi sửa vẫn giữ lý do cũ"*):
 * lập luận khi ấy là người đọc cần nhớ mình bị trả về vì cái gì. Lập luận ấy
 * đúng cho TDV đang sửa — và đúng là lúc hồ sơ còn ở `YEU_CAU_CHINH_SUA`; gửi
 * lại rồi thì người đang cầm hồ sơ là TBP, và câu hỏi của họ không phải câu ấy.
 * Nhật ký vẫn giữ nguyên mọi lý do.
 *
 * Tới `0224` vế thứ hai phải hỏi cả HÀNH ĐỘNG: *"`SA_DANG_XU_LY` và lý do gần
 * nhất là `KT_REQUEST_REPRINT`"*, vì `SA_DANG_XU_LY` còn là bước bình thường
 * ngay sau Kế toán tiếp nhận L1. Từ `0225` ca in lại có trạng thái RIÊNG
 * (`SA_SUA_BAN_CUNG`), và mọi lượt vào trạng thái ấy đều mang lý do của chính
 * lượt yêu cầu in lại — nên câu này chỉ còn hỏi TRẠNG THÁI. Cặp điều kiện cũ
 * là một phép suy ngược lên đường đi của hồ sơ; giờ trạng thái nói thẳng.
 *
 * Luật đặt ở MÁY CHỦ, không ở giao diện: giao diện chỉ bày `lyDoTraLai` khi nó
 * khác `null`, nên không có chỗ thứ hai tự suy lại câu này.
 */
export const lyDoConCanBay = (status: string): boolean =>
  status === 'YEU_CAU_CHINH_SUA' || status === 'SA_SUA_BAN_CUNG';
