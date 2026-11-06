-- `0254` — tác tử vận hành trên máy chủ (chặng B4).
--
-- Tác tử là vòng lặp shell (`./csbh tac-tu`) chạy NGOÀI container, dưới systemd, có quyền
-- docker của máy chủ — để không container nào phải cầm `docker.sock` (chốt 05/11). Nó nói
-- chuyện với ứng dụng CHỈ QUA CSDL: `docker compose exec postgres psql`, không cổng mạng nào.
--
-- MỌI câu SQL của tác tử là một lời gọi HÀM ở đây. Shell chỉ chuyển nguyên văn đầu ra của
-- docker vào; phân tích JSON, đổi đơn vị, lọc theo dự án đều ở SQL — nên bộ kiểm gọi đúng
-- những hàm tác tử gọi, và có ca đối chiếu mọi tên `ops.*(` trong `scripts/csbh` với `pg_proc`.

-- Nhịp tim: một dòng. Quá 60 giây không nhịp = mất liên lạc (giao diện xám mọi nút cần tác tử).
CREATE TABLE IF NOT EXISTS ops.tac_tu (
  id         boolean PRIMARY KEY DEFAULT true CHECK (id),
  lan_cuoi   timestamptz NOT NULL,
  phien_ban  text,
  may        text
);

-- Việc Quản trị bấm trên web ("Sao lưu ngay"). DANH SÁCH TRẮNG ở hai chỗ: `CHECK` ở đây và
-- `case` trong tác tử — không trường nào của dòng đi vào dòng lệnh dưới dạng tham số.
CREATE TABLE IF NOT EXISTS ops.viec_tay (
  id          bigserial PRIMARY KEY,
  loai        text NOT NULL CHECK (loai IN ('SAO_LUU_CSDL', 'SAO_LUU_KHO_TEP')),
  trang_thai  text NOT NULL DEFAULT 'CHO' CHECK (trang_thai IN ('CHO', 'DANG_CHAY', 'THANH_CONG', 'LOI')),
  nguoi_tao   uuid,
  tao_luc     timestamptz NOT NULL DEFAULT now(),
  bat_dau     timestamptz,
  ket_thuc    timestamptz,
  chi_tiet    text
);
-- Một việc dở mỗi loại: bấm hai lần (hai tab) thì lượt hai va chỉ mục → `JOB_RUNNING`.
CREATE UNIQUE INDEX IF NOT EXISTS uq_viec_tay_dang_do ON ops.viec_tay (loai) WHERE trang_thai IN ('CHO', 'DANG_CHAY');

-- Ảnh chụp trạng thái container (thay trọn mỗi lượt) và cỡ volume / ảnh Docker (mỗi giờ).
CREATE TABLE IF NOT EXISTS ops.container (
  service     text PRIMARY KEY,
  trang_thai  text NOT NULL,        -- running · exited · restarting …
  suc_khoe    text,                 -- healthy · unhealthy · starting · NULL (không khai healthcheck)
  mo_ta       text,                 -- "Up 3 hours (healthy)"
  luc         timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ops.do_docker (
  ten   text PRIMARY KEY,           -- tên volume NGẮN (`pgdata`) hoặc 'anh-docker'
  loai  text NOT NULL CHECK (loai IN ('VOLUME', 'ANH')),
  co    bigint NOT NULL CHECK (co >= 0),
  luc   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON ops.tac_tu, ops.container, ops.do_docker TO csbh_ops;
GRANT SELECT, INSERT ON ops.viec_tay TO csbh_ops;
GRANT USAGE ON SEQUENCE ops.viec_tay_id_seq TO csbh_ops;

-- Cỡ kiểu Docker ("53.2MB", "2.463kB", "0B") → byte. Docker dùng đơn vị THẬP PHÂN (1 kB =
-- 1000 B). Chuỗi lạ → NULL, người gọi bỏ dòng ấy chứ không ghi số sai.
CREATE OR REPLACE FUNCTION ops.co_docker(p text) RETURNS bigint
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN m IS NULL THEN NULL
    ELSE round(m[1]::numeric * CASE m[2] WHEN 'B' THEN 1 WHEN 'kB' THEN 1e3 WHEN 'KB' THEN 1e3
                                          WHEN 'MB' THEN 1e6 WHEN 'GB' THEN 1e9 WHEN 'TB' THEN 1e12 END)::bigint
  END
  FROM (SELECT regexp_match(btrim(p), '^([0-9]+(?:\.[0-9]+)?)\s*(B|kB|KB|MB|GB|TB)$') AS m) x
$$;

-- Nhịp tim + nhận MỘT việc đang chờ (nếu tác tử rảnh). Trả "id loai" hoặc rỗng.
-- `FOR UPDATE SKIP LOCKED`: hai tác tử lỡ chạy song song không nhận trùng một việc.
CREATE OR REPLACE FUNCTION ops.tac_tu_nhip(p_phien_ban text, p_may text, p_ranh boolean)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v ops.viec_tay;
BEGIN
  INSERT INTO ops.tac_tu (id, lan_cuoi, phien_ban, may) VALUES (true, now(), p_phien_ban, p_may)
  ON CONFLICT (id) DO UPDATE SET lan_cuoi = now(), phien_ban = EXCLUDED.phien_ban, may = EXCLUDED.may;
  IF NOT p_ranh THEN RETURN ''; END IF;
  UPDATE ops.viec_tay SET trang_thai = 'DANG_CHAY', bat_dau = now()
   WHERE id = (SELECT id FROM ops.viec_tay WHERE trang_thai = 'CHO' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING * INTO v;
  IF v.id IS NULL THEN RETURN ''; END IF;
  RETURN v.id || ' ' || v.loai || ' ' || coalesce(v.nguoi_tao::text, '-');
END $$;

CREATE OR REPLACE FUNCTION ops.tac_tu_xong(p_id bigint, p_thanh_cong boolean, p_chi_tiet text)
RETURNS void LANGUAGE sql AS $$
  UPDATE ops.viec_tay SET trang_thai = CASE WHEN p_thanh_cong THEN 'THANH_CONG' ELSE 'LOI' END,
         ket_thuc = now(), chi_tiet = right(p_chi_tiet, 8000)
   WHERE id = p_id AND trang_thai = 'DANG_CHAY'
$$;

-- Tác tử vừa khởi động: không việc nào của nó còn chạy. Việc "đang chạy" là lượt bị bỏ dở
-- (máy khởi động lại, systemd giết tiến trình) — đánh LỖI để nút của loại ấy mở lại.
CREATE OR REPLACE FUNCTION ops.tac_tu_khoi_dong() RETURNS int
LANGUAGE sql AS $$
  WITH x AS (
    UPDATE ops.viec_tay SET trang_thai = 'LOI', ket_thuc = now(),
           chi_tiet = coalesce(chi_tiet || E'\n', '') || 'Tác tử khởi động lại khi việc này đang chạy dở.'
     WHERE trang_thai = 'DANG_CHAY' RETURNING 1)
  SELECT count(*)::int FROM x
$$;

-- `docker compose ps -a --format json`: compose v2.21+ in MỘT đối tượng mỗi dòng; bản cũ in
-- một mảng. Nhận cả hai. Thay TRỌN ảnh chụp — container đã gỡ khỏi compose thì biến khỏi bảng.
CREATE OR REPLACE FUNCTION ops.ghi_container(p text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int; mang jsonb;
BEGIN
  mang := CASE WHEN left(btrim(p), 1) = '[' THEN btrim(p)::jsonb
               ELSE ('[' || coalesce(array_to_string(ARRAY(
                       SELECT l FROM regexp_split_to_table(p, '\n') l WHERE btrim(l) <> ''), ','), '') || ']')::jsonb END;
  DELETE FROM ops.container;
  INSERT INTO ops.container (service, trang_thai, suc_khoe, mo_ta)
  SELECT DISTINCT ON (j->>'Service') j->>'Service', coalesce(j->>'State', 'unknown'), nullif(j->>'Health', ''), j->>'Status'
    FROM jsonb_array_elements(mang) j
   -- Việc chạy MỘT LẦN thoát mã 0 là đúng — không được thành một dòng đỏ trên thẻ Sức khoẻ.
   WHERE coalesce(j->>'Service', '') NOT IN ('', 'pg-init', 'migrate', 'ops')
   ORDER BY j->>'Service', (j->>'State' = 'running') DESC;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- `docker system df --format json` (mỗi loại một dòng) + `docker system df -v --format json`
-- (một đối tượng). Chỉ giữ volume mang nhãn `com.docker.compose.project=<p_du_an>` — máy chủ
-- có thể chạy dự án khác, và `df -v` liệt kê MỌI volume của máy.
CREATE OR REPLACE FUNCTION ops.ghi_docker(p_du_an text, p_df text, p_df_v text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int := 0; anh bigint;
BEGIN
  DELETE FROM ops.do_docker;
  INSERT INTO ops.do_docker (ten, loai, co)
  SELECT DISTINCT ON (ten) ten, 'VOLUME', co FROM (
    SELECT coalesce(
             (SELECT substr(l, length('com.docker.compose.volume=') + 1)
                FROM regexp_split_to_table(v->>'Labels', ',') l WHERE l LIKE 'com.docker.compose.volume=%' LIMIT 1),
             v->>'Name') AS ten,
           ops.co_docker(v->>'Size') AS co
      FROM jsonb_array_elements(coalesce(nullif(btrim(p_df_v), '')::jsonb -> 'Volumes', '[]')) v
     WHERE ('com.docker.compose.project=' || p_du_an) IN (SELECT regexp_split_to_table(v->>'Labels', ','))
  ) x WHERE co IS NOT NULL ORDER BY ten;
  GET DIAGNOSTICS n = ROW_COUNT;
  SELECT ops.co_docker(l::jsonb->>'Size') INTO anh
    FROM regexp_split_to_table(p_df, '\n') l
   WHERE btrim(l) <> '' AND l::jsonb->>'Type' = 'Images' LIMIT 1;
  IF anh IS NOT NULL THEN
    INSERT INTO ops.do_docker (ten, loai, co) VALUES ('anh-docker', 'ANH', anh);
    n := n + 1;
  END IF;
  RETURN n;
END $$;
