/**
 * Danh tính của những thứ do chính hệ thống sinh ra, không phải người thật.
 *
 * Tệp này TỪNG là chỗ seed mẫu mặc định lúc khởi động (`TemplateBootstrap`).
 * `0150` bỏ hẳn khái niệm ấy: **hệ thống không bao giờ tự tạo một văn bản mẫu**.
 * Không mẫu nào thì không xem trước được, và đó là câu trả lời đúng — thà nói ra
 * rằng chưa có mẫu, còn hơn đưa ra một tờ giấy không ai duyệt nội dung.
 *
 * Cái giá đi kèm, ghi ở migration `0108`: hệ thống vừa cài xong KHÔNG dùng được
 * cho tới khi Quản trị có mẫu — `0098` bắt chọn mẫu lúc gửi duyệt, nên hồ sơ
 * không rời được *Nháp*. `./csbh nap-danh-muc` thành bước cài đặt bắt buộc.
 *
 * Hằng dưới đây ở lại vì nó không thuộc về chuyện seed: nó là `uploaded_by` của
 * mọi tệp do hệ thống dựng ra.
 */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
