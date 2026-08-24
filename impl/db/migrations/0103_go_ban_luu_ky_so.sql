-- 0103 — gỡ bản lưu ký số.
--
-- `POST /policies/:id/sign-file` sinh hai object PDF cho mỗi lượt ký: bản chưa ký
-- và bản đã ký, nối nhau qua `signed_from_id`, kèm `signature` jsonb ghi họ tên ·
-- vai trò · dấu thời gian. Nó có ca kiểm DOC-04 và DOC-05, và KHÔNG AI GỌI —
-- không màn hình nào, không `policy`, không consumer nào. Đo ở `0099`: 197 hồ sơ
-- đã qua bước TBP ký, ba file `BAN_DA_KY` trong kho, cả ba do bộ test sinh ra.
--
-- Khách hàng chốt 24/08: DỮ LIỆU ĐÓNG BĂNG LÀ ĐỦ. Từ `0101` hồ sơ giữ ảnh chụp
-- tám trường khách hàng, người đề nghị và tên TBP đã ký, nên câu hỏi mà bản lưu
-- sinh ra để trả lời — "văn bản lúc ký nói gì" — nay trả lời được bằng chính hồ
-- sơ. Một object PDF thứ hai chỉ để đối chiếu là thứ đắt hơn mà nói ít hơn.
--
-- CÒN LẠI, có chủ ý:
--   * `tbp_signed_at` · `tbp_signed_by` · `tbp_ky_ten_snap` trên `pol.policy` —
--     bước ký trong luồng duyệt KHÔNG bỏ, chỉ bản lưu bỏ.
--   * `{{ho_so.chu_ky_so_TBP}}` vẫn in khối "TBP đã ký số" lên bản mềm.
--   * `sha256` của `doc.stored_file` — nó phục vụ DOC-06 (phát hiện file bị sửa
--     ngoài đường ứng dụng), không phải bản lưu ký số.
--   * Hai giá trị `BAN_CSBH` và `BAN_DA_KY` trong enum `doc.file_purpose`.
--     Postgres không có `DROP VALUE`; đổi kiểu của một cột đang dùng chỉ để bỏ
--     hai nhãn chết là lượt migration rủi ro hơn hẳn thứ nó dọn. Chốt chặn nằm ở
--     kiểu `Purpose` trong `files.service.ts`: không đường nào ghi được nữa.

ALTER TABLE doc.stored_file DROP COLUMN IF EXISTS signed_from_id;
ALTER TABLE doc.stored_file DROP COLUMN IF EXISTS signature;
