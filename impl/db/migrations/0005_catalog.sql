-- =============================================================================
-- 0005_catalog — Danh mục sản phẩm, giá, chiết khấu quy định, danh mục tra cứu
-- và người ký (YCNV muc 6.2, 6.3, 6.4).
-- =============================================================================

DO $$ BEGIN
  -- Đúng HAI trạng thái, không hơn (CAT-06).
  CREATE TYPE cat.product_status AS ENUM ('DANG_AP_DUNG', 'DA_VO_HIEU_HOA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- Đúng HAI loại giá. Giá bán lẻ niêm yết CHÍNH LÀ Giá bán Công ty, không phải
  -- loại thứ ba — enum ở tầng CSDL chặn luôn mọi cách gọi tên khác (CAT-03).
  CREATE TYPE cat.price_type AS ENUM ('GIA_BAN_CONG_TY', 'GIA_BAN_BUON');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS cat.product_group (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cat.product (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code     text NOT NULL,
  name     text NOT NULL,
  -- Nhóm sản phẩm BẮT BUỘC: chiết khấu quy định và báo cáo đều tra theo nó,
  -- cho phép trống là sinh ra sản phẩm không tra được ngưỡng (CAT-09).
  group_id uuid NOT NULL REFERENCES cat.product_group(id),
  status   cat.product_status NOT NULL DEFAULT 'DANG_AP_DUNG',

  -- Ngưỡng mặc định theo loại khách hàng, dùng khi KHÔNG có dòng chiết khấu
  -- quy định nào khớp (CAT-12). Lưu dạng Rate2: 12,35% là 1235.
  default_rate2_type1 int,
  default_rate2_type2 int,
  default_rate2_type3 int,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Mã vật tư so sánh sau khi chuẩn hoá, để 'sp-01', 'SP-01 ' không thành ba
-- sản phẩm khác nhau (CAT-02).
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_code_norm
  ON cat.product (upper(btrim(code)));
CREATE INDEX IF NOT EXISTS ix_product_group ON cat.product(group_id);

-- --- Lịch sử giá -------------------------------------------------------------
-- Đổi giá là THÊM MỘT DÒNG, không sửa dòng cũ. Hồ sơ đã đóng băng giá theo
-- phiên bản vẫn phải tra lại đúng giá tại thời điểm đó (CAT-04).
CREATE TABLE IF NOT EXISTS cat.product_price (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES cat.product(id) ON DELETE CASCADE,
  price_type     cat.price_type NOT NULL,
  amount         bigint NOT NULL CHECK (amount > 0),
  effective_from date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  UNIQUE (product_id, price_type, effective_from)
);
CREATE INDEX IF NOT EXISTS ix_price_lookup
  ON cat.product_price(product_id, price_type, effective_from DESC);

-- --- Chiết khấu quy định -----------------------------------------------------
-- NGUỒN DUY NHẤT kiểm vượt ngưỡng (muc 6.3). Ba chiều đều cho phép để trống,
-- trống nghĩa là "áp dụng cho mọi giá trị".
CREATE TABLE IF NOT EXISTS cat.discount_rule (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_group_id uuid REFERENCES cat.product_group(id) ON DELETE CASCADE,
  customer_type    smallint CHECK (customer_type IN (1, 2, 3)),
  channel_code     text,
  effective_from   date NOT NULL,
  effective_to     date,
  threshold_rate2  int NOT NULL CHECK (threshold_rate2 >= 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rule_period_sane CHECK (effective_to IS NULL OR effective_to >= effective_from),

  -- Điểm cụ thể, để hai dòng cùng khớp thì chọn được dòng cụ thể hơn một cách
  -- TẤT ĐỊNH (CAT-11). Trọng số 4/2/1 xếp hạng ưu tiên nhóm SP > loại KH > kênh:
  -- ngưỡng gắn với bản chất hàng hoá nên nhóm sản phẩm là chiều mạnh nhất.
  -- Cột sinh sẵn chứ không tính lúc truy vấn, để thứ tự này chỉ định nghĩa một chỗ.
  specificity int GENERATED ALWAYS AS (
    (CASE WHEN product_group_id IS NOT NULL THEN 4 ELSE 0 END) +
    (CASE WHEN customer_type    IS NOT NULL THEN 2 ELSE 0 END) +
    (CASE WHEN channel_code     IS NOT NULL THEN 1 ELSE 0 END)
  ) STORED
);
CREATE INDEX IF NOT EXISTS ix_rule_match
  ON cat.discount_rule(product_group_id, customer_type, channel_code);

-- --- Danh mục tra cứu --------------------------------------------------------
-- Khoá chính là MÃ, không phải id sinh tự động: đổi tên tỉnh thì mã giữ nguyên
-- nên hồ sơ và bộ lọc cũ vẫn đúng (CAT-16).
CREATE TABLE IF NOT EXISTS cat.province (
  code text PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS cat.hospital (
  code text PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS cat.channel (
  code text PRIMARY KEY,
  name text NOT NULL
);

-- --- Người ký ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cat.signer (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  text NOT NULL,
  title      text NOT NULL,
  unit       text NOT NULL,
  sign_scope text NOT NULL,
  valid_from date NOT NULL,
  valid_to   date,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signer_period_sane CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- --- Outbox ------------------------------------------------------------------
-- Ghi nghiệp vụ và ghi sự kiện trong CÙNG một transaction (AD-03). Nhật ký cũng
-- đi đường này: role csbh_cat không có quyền ghi vào schema aud, nên "ghi nhật
-- ký giá trị trước và sau" (CAT-13) là phát sự kiện chứ không phải INSERT chéo.
CREATE TABLE IF NOT EXISTS cat.outbox (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_key  text NOT NULL,
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX IF NOT EXISTS ix_outbox_pending
  ON cat.outbox(created_at) WHERE published_at IS NULL;
