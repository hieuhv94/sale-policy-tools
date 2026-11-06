-- `0253` — ổ đĩa và sức khoẻ cho trang Vận hành (chặng B3b).
--
-- `csbh_ops` chỉ thấy schema `ops` (`0252`). Ba con số thẻ Sức khoẻ cần nằm ở schema
-- KHÁC — sự kiện chưa phát ở sáu bảng outbox, thư hỏng chưa xử lý, cỡ kho tệp — nên
-- đọc qua hàm SECURITY DEFINER trả về ĐÚNG con số, không mở quyền đọc bảng.

-- Ngưỡng cảnh báo ổ đĩa: MỘT ngưỡng (chốt 05/11). `dang_vuot` là trạng thái của lượt
-- đo trước — thư chỉ gửi khi đi từ dưới lên trên ngưỡng, không mỗi giờ một lá.
CREATE TABLE IF NOT EXISTS ops.cau_hinh_o_dia (
  id            boolean PRIMARY KEY DEFAULT true CHECK (id),
  nguong        int NOT NULL DEFAULT 80 CHECK (nguong BETWEEN 1 AND 99),
  gui_thu       boolean NOT NULL DEFAULT true,
  dang_vuot     boolean NOT NULL DEFAULT false,
  cap_nhat_luc  timestamptz NOT NULL DEFAULT now(),
  cap_nhat_boi  uuid
);
INSERT INTO ops.cau_hinh_o_dia (id) VALUES (true) ON CONFLICT DO NOTHING;

-- Mẫu đo, mỗi giờ một lượt cho mỗi ổ. Đủ cho biểu đồ 30 ngày và dự báo ngày đầy.
CREATE TABLE IF NOT EXISTS ops.mau_o_dia (
  luc   timestamptz NOT NULL DEFAULT now(),
  o     text NOT NULL,           -- 'du-lieu' · 'ban-sao-ngoai'
  tong  bigint NOT NULL CHECK (tong > 0),
  dung  bigint NOT NULL CHECK (dung >= 0),
  PRIMARY KEY (o, luc)
);

GRANT SELECT, UPDATE ON ops.cau_hinh_o_dia TO csbh_ops;
GRANT SELECT, INSERT, DELETE ON ops.mau_o_dia TO csbh_ops;

-- Sự kiện chưa phát theo nguồn — mọi bảng tên `outbox` có cột `published_at`, hỏi
-- `information_schema` chứ không chép danh sách (bảng outbox thứ bảy tự vào).
CREATE OR REPLACE FUNCTION ops.dem_outbox_chua_phat()
RETURNS TABLE (nguon text, so bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_schema FROM information_schema.columns
     WHERE table_name = 'outbox' AND column_name = 'published_at' ORDER BY 1
  LOOP
    nguon := r.table_schema;
    EXECUTE format('SELECT count(*) FROM %I.outbox WHERE published_at IS NULL', r.table_schema) INTO so;
    RETURN NEXT;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION ops.dem_thu_hong() RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT count(*) FROM ntf.dead_letter WHERE resolved_at IS NULL
$$;

-- Cỡ kho tệp theo CSDL — tổng `size_bytes`. Không phải cỡ trên đĩa (MinIO có phần
-- phụ), nhưng đúng là thứ người dùng tải lên, và không đòi gắn volume MinIO vào đây.
CREATE OR REPLACE FUNCTION ops.co_kho_tep() RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(sum(size_bytes), 0)::bigint FROM doc.stored_file
$$;

REVOKE EXECUTE ON FUNCTION ops.dem_outbox_chua_phat(), ops.dem_thu_hong(), ops.co_kho_tep() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.dem_outbox_chua_phat(), ops.dem_thu_hong(), ops.co_kho_tep() TO csbh_ops;
