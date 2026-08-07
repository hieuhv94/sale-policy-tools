-- =============================================================================
-- 0016_reporting — Read-model phẳng cho 14 tiêu chí lọc, ba báo cáo và việc xuất
-- Excel chạy nền (YCNV muc 9.2).
--
-- VÌ SAO PHẢI CÓ BẢNG RIÊNG. Mười bốn tiêu chí lọc trải trên dữ liệu của ba
-- service: hồ sơ ở `pol`, khách hàng ở `cus`, nhóm sản phẩm ở `cat`. Ba lối đi:
--
--   1. JOIN chéo schema — phá đúng ranh giới sở hữu dữ liệu ở AD-02, và role
--      csbh_rpt cũng không có quyền đọc ba schema kia.
--   2. Gọi vòng qua REST rồi lọc trong bộ nhớ — mỗi lần mở màn hình là kéo về
--      toàn bộ hồ sơ để lọc, và không phân trang được ở tầng CSDL.
--   3. Read-model dựng từ sự kiện — bảng này.
--
-- Cái giá của lối 3 là dữ liệu TRỄ vài giây so với nguồn. Trả giá đó ở đâu là
-- một quyết định nghiệp vụ, không phải kỹ thuật: màn hình *báo cáo* trễ vài giây
-- thì không ai thiệt, còn màn hình *việc đang chờ tôi xử lý* thì có — nên
-- `/policies/inbox` đọc thẳng pol.policy và KHÔNG bao giờ đi qua đây (RPT-14).
-- =============================================================================

CREATE TABLE IF NOT EXISTS rpt.policy_row (
  policy_id       uuid PRIMARY KEY,
  code            text NOT NULL,
  version_no      int  NOT NULL,

  -- Trạng thái và bước lưu dạng TEXT chứ không phải enum của pol.
  -- Kiểu enum thuộc schema pol; dùng lại nó ở đây là buộc csbh_rpt phải có
  -- USAGE trên schema pol, tức là mở đúng ranh giới mà read-model sinh ra để
  -- khỏi phải mở. Giá trị vẫn được kiểm ở nguồn trước khi đi vào sự kiện.
  status          text NOT NULL,
  pending_step    text,
  source          text NOT NULL DEFAULT 'NORMAL',

  -- --- Hai mốc thời gian lọc được (tiêu chí 1 và 2) --------------------------
  applied_date    date,
  -- "Thời gian duyệt" = thời điểm hồ sơ CÓ HIỆU LỰC (`effective_from`), tức là
  -- lúc kế toán tiếp nhận L2 xong ở bước B10. Không dùng `tbp_signed_at`: hồ sơ
  -- được Trưởng bộ phận ký nhưng sau đó bị trả lại thì chưa hề "duyệt xong".
  -- Cột `tbp_signed_at` vẫn nằm ngay dưới đây, nên nếu khách hàng muốn hiểu
  -- theo nghĩa B4 thì đổi một dòng SQL trong bộ lọc, không phải nạp lại dữ liệu.
  approved_at     timestamptz,
  tbp_signed_at   timestamptz,

  created_at      timestamptz NOT NULL,
  submitted_at    timestamptz,
  returned_at     timestamptz,
  rejected_at     timestamptz,
  deactivated_at  timestamptz,
  sla_due_at      timestamptz,
  sla_started_at  timestamptz,

  -- --- Khách hàng (tiêu chí 3, 4, 5, 6, 11, 12, 13) --------------------------
  customer_id        uuid NOT NULL,
  customer_code      text NOT NULL,
  customer_name      text NOT NULL,
  customer_name_norm text NOT NULL DEFAULT '',
  registered_address text NOT NULL DEFAULT '',
  -- Bản đã bỏ dấu và hạ chữ thường của địa chỉ. Xem lý do không dùng extension
  -- `unaccent` ở services/reporting/src/reports/normalize.ts.
  address_norm       text NOT NULL DEFAULT '',
  tax_id             text,
  province_code      text,
  hospital_code      text,
  channel_code       text,

  -- --- Người (tiêu chí 8, 10) ------------------------------------------------
  -- Người đề nghị là người LẬP hồ sơ; TDV phụ trách là người sở hữu khách hàng.
  -- Hai người này khác nhau khi hồ sơ được lập hộ, và bộ lọc phải tách được.
  requester_id    uuid,
  requester_name  text,
  tdv_user_id     uuid NOT NULL,
  tdv_name        text,

  -- --- Sản phẩm (tiêu chí 7, 14) --------------------------------------------
  -- Mảng chứ không bảng con: mỗi truy vấn lọc đều hỏi "hồ sơ này CÓ sản phẩm
  -- nào tên chứa X không", trả lời bằng một chỉ mục GIN trên mảng là một lần
  -- tra, còn bảng con là một phép nối và một DISTINCT trên mọi truy vấn.
  product_codes       text[] NOT NULL DEFAULT '{}',
  product_names       text[] NOT NULL DEFAULT '{}',
  product_names_norm  text[] NOT NULL DEFAULT '{}',
  product_group_codes text[] NOT NULL DEFAULT '{}',

  line_count      int    NOT NULL DEFAULT 0,
  total_net       bigint NOT NULL DEFAULT 0,
  max_discount    numeric(5,2),

  -- Phiên bản dòng ở NGUỒN tại lần đồng bộ này. Sự kiện tới trễ hoặc tới lặp
  -- (bảo đảm "ít nhất một lần" của outbox) mang phiên bản cũ hơn thì bỏ qua,
  -- nếu không một lần giao lại sẽ ghi đè trạng thái mới bằng trạng thái cũ.
  src_row_version int NOT NULL DEFAULT 0,
  synced_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_rpt_scope    ON rpt.policy_row (tdv_user_id);
CREATE INDEX IF NOT EXISTS ix_rpt_page     ON rpt.policy_row (created_at DESC, policy_id DESC);
CREATE INDEX IF NOT EXISTS ix_rpt_status   ON rpt.policy_row (status);
CREATE INDEX IF NOT EXISTS ix_rpt_applied  ON rpt.policy_row (applied_date);
CREATE INDEX IF NOT EXISTS ix_rpt_approved ON rpt.policy_row (approved_at);
CREATE INDEX IF NOT EXISTS ix_rpt_customer ON rpt.policy_row (customer_code);
CREATE INDEX IF NOT EXISTS ix_rpt_geo      ON rpt.policy_row (province_code, hospital_code, channel_code);

-- Lọc "có chứa" trên chuỗi đã bỏ dấu — B-tree vô dụng với `LIKE '%x%'`.
CREATE INDEX IF NOT EXISTS ix_rpt_addr_trgm
  ON rpt.policy_row USING gin (address_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_rpt_cusname_trgm
  ON rpt.policy_row USING gin (customer_name_norm gin_trgm_ops);

-- `&&` (giao nhau) trên mảng dùng được chỉ mục GIN; `= ANY(...)` thì không.
CREATE INDEX IF NOT EXISTS ix_rpt_groups ON rpt.policy_row USING gin (product_group_codes);
CREATE INDEX IF NOT EXISTS ix_rpt_pnames ON rpt.policy_row USING gin (product_names_norm);

-- --- Việc xuất Excel chạy nền (RPT-08) ---------------------------------------
--
-- File nằm trong CSDL dạng bytea chứ không trên MinIO, có chủ ý: kho đối tượng
-- do `document` sở hữu và mọi đường ghi vào đó đều đi kèm luật nghiệp vụ về hồ
-- sơ (ai được tải, file có bị huỷ chưa). Một file kết xuất tạm sống vài giờ
-- không thuộc luật đó. Đổi lại phải có hạn dọn, nếu không bảng này phình mãi —
-- `expires_at` bên dưới và một nhánh trong sys.run_retention lo việc đó.
CREATE TABLE IF NOT EXISTS rpt.export_job (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL,
  requested_role text NOT NULL,
  -- Bộ lọc lưu nguyên văn: người dùng hỏi lại "file này lọc theo gì" ba ngày sau.
  filter       jsonb NOT NULL,
  status       text  NOT NULL DEFAULT 'CHO_XU_LY'
                 CHECK (status IN ('CHO_XU_LY', 'DANG_CHAY', 'XONG', 'LOI')),
  row_count    int,
  file_name    text,
  content      bytea,
  byte_size    bigint,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX IF NOT EXISTS ix_export_pending ON rpt.export_job (created_at)
  WHERE status = 'CHO_XU_LY';
CREATE INDEX IF NOT EXISTS ix_export_owner   ON rpt.export_job (requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_export_expiry  ON rpt.export_job (expires_at);

-- --- Dọn file kết xuất hết hạn ----------------------------------------------
-- Thêm một nhánh vào hàm dọn dẹp đã có ở 0008 thay vì dựng lịch riêng: một chỗ
-- chạy, một chỗ ghi lại kết quả, một chỗ để đọc khi ổ đầy.
CREATE OR REPLACE FUNCTION sys.run_retention(
  p_outbox_keep_days int DEFAULT 30,
  p_token_grace_days int DEFAULT 7
) RETURNS jsonb AS $$
DECLARE
  n_refresh int; n_activation int; n_cat int; n_cus int; n_pol int; n_export int;
  detail jsonb;
BEGIN
  DELETE FROM idn.refresh_token
   WHERE expires_at < now() - (p_token_grace_days || ' days')::interval;
  GET DIAGNOSTICS n_refresh = ROW_COUNT;

  DELETE FROM idn.activation_token
   WHERE expires_at < now() - (p_token_grace_days || ' days')::interval;
  GET DIAGNOSTICS n_activation = ROW_COUNT;

  DELETE FROM cat.outbox WHERE published_at IS NOT NULL
     AND published_at < now() - (p_outbox_keep_days || ' days')::interval;
  GET DIAGNOSTICS n_cat = ROW_COUNT;

  DELETE FROM cus.outbox WHERE published_at IS NOT NULL
     AND published_at < now() - (p_outbox_keep_days || ' days')::interval;
  GET DIAGNOSTICS n_cus = ROW_COUNT;

  DELETE FROM pol.outbox WHERE published_at IS NOT NULL
     AND published_at < now() - (p_outbox_keep_days || ' days')::interval;
  GET DIAGNOSTICS n_pol = ROW_COUNT;

  -- File kết xuất hết hạn. Bản ghi công việc GIỮ LẠI, chỉ bỏ phần nặng: người
  -- dùng vẫn tra được "tôi đã xuất file gì hôm qua", chỉ không tải lại được.
  UPDATE rpt.export_job
     SET content = NULL, status = CASE WHEN status = 'XONG' THEN 'XONG' ELSE status END
   WHERE expires_at < now() AND content IS NOT NULL;
  GET DIAGNOSTICS n_export = ROW_COUNT;

  PERFORM aud.ensure_partition((current_date + (i || ' months')::interval)::date)
     FROM generate_series(0, 3) AS i;

  detail := jsonb_build_object(
    'refreshToken', n_refresh, 'activationToken', n_activation,
    'catOutbox', n_cat, 'cusOutbox', n_cus, 'polOutbox', n_pol,
    'exportFiles', n_export);
  INSERT INTO sys.retention_run (detail) VALUES (detail);
  RETURN detail;
END $$ LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = pg_catalog, idn, cat, cus, pol, rpt, aud, sys;

GRANT SELECT, INSERT, UPDATE, DELETE ON rpt.policy_row  TO csbh_rpt;
GRANT SELECT, INSERT, UPDATE, DELETE ON rpt.export_job  TO csbh_rpt;
