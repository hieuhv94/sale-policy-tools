-- =============================================================================
-- 0006_customer — Khách hàng do TDV tạo (YCNV muc 6.1).
-- =============================================================================

CREATE TABLE IF NOT EXISTS cus.customer (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- KHOÁ ĐỊNH DANH. Kế toán cấp bên ngoài phần mềm; hệ thống chỉ chặn trùng.
  code text NOT NULL,
  name text NOT NULL,

  -- CCCD hoặc mã số thuế. Trùng thì CẢNH BÁO chứ không chặn (CUST-05): một chủ
  -- hộ mở nhiều điểm bán là chuyện có thật, chặn cứng là chặn nhầm nghiệp vụ.
  id_number text,

  customer_type smallint NOT NULL CHECK (customer_type IN (1, 2, 3)),

  registered_address text NOT NULL,
  delivery_address   text,        -- để trống nghĩa là trùng địa chỉ đăng ký

  owner_name      text NOT NULL,
  owner_title     text,
  owner_id_number text,

  -- Trường số bình thường. KHÔNG tích hợp hệ thống kế toán (CUST-09).
  debt bigint NOT NULL DEFAULT 0,

  -- Bốn trường phân loại, đều là danh mục có mã bên schema cat. Không đặt khoá
  -- ngoại sang cat: customer không có quyền đọc schema đó, và mã danh mục do
  -- catalog kiểm qua API nội bộ (CUST-08).
  province_code text,
  hospital_code text,
  channel_code  text,

  tdv_user_id uuid NOT NULL,      -- mặc định là người tạo
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- So sánh sau khi chuẩn hoá, để 'kh-01', 'KH-01 ' không thành hai khách hàng
-- khác nhau mang cùng một mã trên giấy (CUST-02, CUST-03).
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_code_norm
  ON cus.customer (upper(btrim(code)));
CREATE INDEX IF NOT EXISTS ix_customer_tdv ON cus.customer(tdv_user_id);
CREATE INDEX IF NOT EXISTS ix_customer_id_number ON cus.customer(id_number)
  WHERE id_number IS NOT NULL;

-- Mã khách hàng là khoá định danh: sửa được nó là mọi hồ sơ CSBH cũ trỏ vào một
-- khách hàng khác trong im lặng. Chặn ở tầng CSDL chứ không chỉ ở tầng ứng dụng,
-- vì đây là loại lỗi không sửa lại được sau khi đã xảy ra (CUST-15).
CREATE OR REPLACE FUNCTION cus.forbid_code_change() RETURNS trigger AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'Khong duoc doi ma khach hang (% -> %)', OLD.code, NEW.code
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_code_immutable ON cus.customer;
CREATE TRIGGER trg_customer_code_immutable
  BEFORE UPDATE ON cus.customer
  FOR EACH ROW EXECUTE FUNCTION cus.forbid_code_change();

-- Siêu dữ liệu hồ sơ pháp lý đính kèm. File thật do service `document` giữ trên
-- MinIO; bảng này chỉ trỏ tới. Không có giấy tờ nào là BẮT BUỘC và hệ thống
-- không cảnh báo hết hạn — việc đó nằm ngoài phần mềm (CUST-13).
CREATE TABLE IF NOT EXISTS cus.customer_document (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES cus.customer(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  file_name   text NOT NULL,
  object_key  text NOT NULL,
  size_bytes  bigint NOT NULL,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_cusdoc_customer ON cus.customer_document(customer_id);

CREATE TABLE IF NOT EXISTS cus.outbox (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_key  text NOT NULL,
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX IF NOT EXISTS ix_cus_outbox_pending
  ON cus.outbox(created_at) WHERE published_at IS NULL;

-- --- Khoá ngoại pol.policy -> cus.customer -----------------------------------
--
-- ĐI CHỆCH nguyên tắc "không ràng buộc chéo schema", có chủ ý.
--
-- "Không xoá được khách hàng đã có hồ sơ CSBH" (CUST-16) là ràng buộc toàn vẹn
-- cứng. Cách thuần microservice — customer giữ một cờ do sự kiện policy.* cập
-- nhật — chỉ nhất quán cuối cùng: hồ sơ lập trước lệnh xoá vài mili giây vẫn
-- lọt. Khoá ngoại thì không bao giờ lọt.
--
-- Cái giá: hai schema này buộc phải ở chung một instance Postgres. Bản thiết kế
-- đã chốt đúng mô hình đó (một Postgres, nhiều schema), nên cái giá bằng không
-- ở hiện tại; muốn tách CSDL sau này thì phải bỏ ràng buộc này trước.
--
-- Quyền: Postgres kiểm khoá ngoại bằng quyền của chủ bảng, nên csbh_pol KHÔNG
-- cần quyền SELECT trên cus.customer. Ranh giới đọc ở AD-02 vẫn nguyên vẹn.
DO $$ BEGIN
  ALTER TABLE pol.policy
    ADD CONSTRAINT fk_policy_customer
    FOREIGN KEY (customer_id) REFERENCES cus.customer(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
