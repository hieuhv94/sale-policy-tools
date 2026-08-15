-- =============================================================================
-- 0020_chiet_khau_vo_thoi_han — quy định chiết khấu không còn ngày hết hiệu lực.
--
-- Cùng một lối nghĩ với chính CSBH: mọi CSBH đều vô thời hạn, chỉ hết hiệu lực
-- khi có bản mới của cùng khách hàng được duyệt (muc 5). Ngưỡng chiết khấu giờ
-- theo đúng luật đó — một dòng có hiệu lực từ ngày khai cho tới khi bị xoá hoặc
-- bị một dòng cụ thể hơn thắng.
--
-- XOÁ CỘT chứ không để lại NULL. Một cột luôn NULL là một cột người đọc mã phải
-- dừng lại để hỏi "cái này còn dùng không", và câu trả lời chỉ nằm trong lịch sử
-- git. Dữ liệu mất đi là ngày kết thúc của các dòng đã khai — chấp nhận được:
-- hồ sơ đã lập giữ `threshold_snap` của riêng nó, nên không hồ sơ nào tính lại.
--
-- Hệ quả cho người dùng, đã ghi vào tài liệu: cách "cho một quy định thôi áp
-- dụng từ ngày X" không còn. Muốn dừng thì XOÁ dòng, hoặc khai một dòng cụ thể
-- hơn đè lên.
-- =============================================================================

ALTER TABLE cat.discount_rule
  DROP CONSTRAINT IF EXISTS rule_period_sane;

ALTER TABLE cat.discount_rule
  DROP COLUMN IF EXISTS effective_to;

COMMENT ON COLUMN cat.discount_rule.effective_from IS
  'Có hiệu lực từ ngày này, VÔ THỜI HẠN. Muốn dừng thì xoá dòng (0020).';
