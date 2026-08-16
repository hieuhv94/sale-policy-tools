-- =============================================================================
-- 0029_yeu_cau_cap_nhat — dấu vết "hồ sơ đã đóng băng này đã lệch so với danh mục".
--
-- KHÔNG CÓ 0028, và đó không phải thiếu sót: `0028` là nhãn của một đợt sửa chỉ
-- đụng giao diện và tầng ứng dụng (gỡ dấu `!`/`◆`, sửa được ngày hiệu lực của
-- quy định), không cần một dòng DDL nào. Chú thích trong mã dẫn `0028` là dẫn
-- tới đợt sửa ấy, không phải tới một tệp migration.
--
-- Nền: giá và ngưỡng đóng băng vào từng dòng hồ sơ lúc lập. Đó là luật đúng —
-- không ai được sửa một văn bản đã có chữ ký. Nhưng hệ quả là một hồ sơ đang
-- chờ duyệt có thể mang con số đã lỗi thời mà KHÔNG AI BIẾT, kể cả người sắp ký
-- vào nó.
--
-- Bảng này trả lời đúng một câu: "hồ sơ nào đang cầm con số khác với danh mục
-- hôm nay, và khác bao nhiêu". Trang Tổng quan đọc thẳng nó.
--
-- VÌ SAO LÀ BẢNG DẤU VẾT chứ không tính tại chỗ lúc mở Tổng quan: tính tại chỗ
-- thì mỗi lần bất kỳ ai mở trang phải tra lại giá và ngưỡng cho MỌI dòng của MỌI
-- hồ sơ trong phạm vi họ — một màn hình ai cũng mở mỗi sáng. Ghi lúc có sự kiện
-- thì việc nặng chạy đúng lúc danh mục đổi, mà đó là việc hiếm.
--
-- VÌ SAO KHÔNG KHỚP THEO MÃ QUY ĐỊNH: một quy định MỚI, cụ thể hơn, sẽ thắng
-- quy định đã chụp — mà hồ sơ không hề nhắc tới mã của nó. Nên consumer phải
-- TRA LẠI toàn bộ rồi so, không được lọc theo `rule_code_snap`.
-- =============================================================================

CREATE TABLE IF NOT EXISTS pol.policy_impact (
  policy_id    uuid NOT NULL REFERENCES pol.policy(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL,

  -- PRICE: Giá bán Công ty đã khác. RULE: ngưỡng chiết khấu đã khác.
  -- Một dòng có thể lệch cả hai, và đó là hai việc khác nhau với người đọc —
  -- nên hai bản ghi chứ không phải một bản ghi hai cột.
  kind         text NOT NULL CHECK (kind IN ('PRICE', 'RULE')),

  -- Mã và tên chép sẵn: trang Tổng quan không được join sang `cat` (AD-02), và
  -- cũng không nên join sang `policy_line` chỉ để lấy hai chuỗi.
  product_code text NOT NULL,

  -- Dạng CHỮ, không phải số: giá là bigint còn ngưỡng là numeric(5,2), mà cả hai
  -- chỉ đi tới một chỗ duy nhất là câu chữ trên màn hình. Một cột text đọc được
  -- cho cả hai loại, không phải hai cột mà mỗi bản ghi bỏ trống một.
  -- `new_value` NULL nghĩa là "không còn giá trị nào" — không quy định nào phủ.
  snap_value   text NOT NULL,
  new_value    text,

  detected_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (policy_id, product_id, kind)
);

-- Trang Tổng quan hỏi theo hồ sơ, luôn luôn.
CREATE INDEX IF NOT EXISTS ix_impact_policy ON pol.policy_impact(policy_id);

COMMENT ON TABLE pol.policy_impact IS
  'Hồ sơ đã đóng băng đang lệch so với danh mục hôm nay. Consumer ghi, Tổng quan đọc (0029).';
COMMENT ON COLUMN pol.policy_impact.new_value IS
  'Giá trị hiện hành trong danh mục. NULL = không còn quy định nào phủ (0029).';
