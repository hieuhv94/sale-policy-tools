-- `0251` — Lịch tự động cấu hình được (chặng B2 của trang Vận hành).
--
-- Tới `0250` lịch nằm cứng ở `deploy/cron/csbh.cron` (sao lưu 01:15 hằng đêm) và số
-- bản giữ lại nằm ở biến môi trường. Chốt 05/11: Quản trị đặt được GIỜ CHẠY và SỐ BẢN
-- GIỮ TỐI ĐA của từng việc định kỳ trên trang Vận hành.
--
-- CRON VẪN LÀ BỘ ĐẾM GIỜ — nó gọi `./csbh sao-luu --neu-den-han` mỗi 15 phút, và câu
-- hỏi "đến hạn chưa" trả lời Ở ĐÂY, bằng `ops.den_han`. Một hàm cho mọi người hỏi:
-- cron (qua `./csbh`), `sla-worker` (dọn dữ liệu), và trang web (dòng "lần tới").
-- Ba bản cài đặt của cùng một phép tính lịch là ba câu trả lời sẽ lệch nhau.
--
-- Không để tác tử lập lịch sao lưu: sao lưu không được phụ thuộc vào tác tử.

CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE IF NOT EXISTS ops.cau_hinh_viec (
  viec            text PRIMARY KEY
                  CHECK (viec IN ('SAO_LUU_CSDL', 'SAO_LUU_KHO_TEP', 'NEN_LOG', 'DON_DU_LIEU')),
  tan_suat        text NOT NULL
                  CHECK (tan_suat IN ('MOI_6_GIO', 'MOI_12_GIO', 'HANG_NGAY', 'HANG_TUAN')),
  -- Giờ VIỆT NAM. Với MOI_N_GIO là mốc đầu trong ngày (01:15 → 01:15, 07:15, 13:15, 19:15).
  gio_chay        time NOT NULL CHECK (date_part('second', gio_chay) = 0),
  -- ISO: 1 = Thứ Hai … 7 = Chủ nhật. Chỉ có khi HANG_TUAN, và bắt buộc khi ấy.
  thu_trong_tuan  smallint CHECK (thu_trong_tuan BETWEEN 1 AND 7),
  giu_toi_da      int,
  cap_nhat_luc    timestamptz NOT NULL DEFAULT now(),
  cap_nhat_boi    uuid,
  CONSTRAINT thu_di_cung_hang_tuan CHECK ((tan_suat = 'HANG_TUAN') = (thu_trong_tuan IS NOT NULL)),
  -- Luật của TỪNG việc nằm ở CSDL chứ không chỉ ở API: một dòng sai ở đây là một
  -- đêm sao lưu hỏng, và `UPDATE` tay qua psql cũng phải bị chặn.
  --
  -- `coalesce(…, false)`: `NULL BETWEEN 1 AND 60` cho NULL, mà CHECK coi NULL là ĐẠT —
  -- bản đầu để lọt một dòng sao lưu không có số bản giữ (ca kiểm bắt được).
  CONSTRAINT luat_tung_viec CHECK (coalesce(
       (viec IN ('SAO_LUU_CSDL', 'SAO_LUU_KHO_TEP') AND giu_toi_da BETWEEN 1 AND 60)
    OR (viec = 'NEN_LOG'     AND tan_suat = 'HANG_NGAY' AND giu_toi_da BETWEEN 1 AND 90)
    OR (viec = 'DON_DU_LIEU' AND tan_suat = 'HANG_NGAY' AND giu_toi_da IS NULL),
  false))
);

INSERT INTO ops.cau_hinh_viec (viec, tan_suat, gio_chay, giu_toi_da) VALUES
  ('SAO_LUU_CSDL',    'HANG_NGAY', '01:15', 7),
  ('SAO_LUU_KHO_TEP', 'HANG_NGAY', '02:00', 7),
  ('NEN_LOG',         'HANG_NGAY', '00:15', 30),
  ('DON_DU_LIEU',     'HANG_NGAY', '03:00', NULL)
ON CONFLICT (viec) DO NOTHING;

-- Mỗi lượt chạy một dòng — tự động hay bấm tay. Trang Vận hành đọc "lần gần nhất",
-- `den_han` đọc "đã chạy cho mốc này chưa".
CREATE TABLE IF NOT EXISTS ops.lan_chay (
  id          bigserial PRIMARY KEY,
  viec        text NOT NULL REFERENCES ops.cau_hinh_viec(viec),
  bat_dau     timestamptz NOT NULL DEFAULT now(),
  ket_thuc    timestamptz,
  ket_qua     text NOT NULL DEFAULT 'DANG_CHAY' CHECK (ket_qua IN ('DANG_CHAY', 'THANH_CONG', 'LOI')),
  tu_dong     boolean NOT NULL DEFAULT true,
  nguoi_chay  uuid,
  chi_tiet    text,
  CONSTRAINT ket_thuc_di_cung_ket_qua CHECK ((ket_qua = 'DANG_CHAY') = (ket_thuc IS NULL))
);
CREATE INDEX IF NOT EXISTS ix_lan_chay_viec ON ops.lan_chay (viec, bat_dau DESC);

-- Bước nhảy giữa hai mốc liền nhau của một tần suất.
CREATE OR REPLACE FUNCTION ops.buoc(p_tan_suat text) RETURNS interval
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_tan_suat
    WHEN 'MOI_6_GIO'  THEN interval '6 hours'
    WHEN 'MOI_12_GIO' THEN interval '12 hours'
    WHEN 'HANG_NGAY'  THEN interval '1 day'
    WHEN 'HANG_TUAN'  THEN interval '7 days'
  END
$$;

-- Mốc lịch GẦN NHẤT không muộn hơn p_luc. Tính trên giờ Việt Nam (không có giờ mùa
-- hè, nên cộng giờ trên `timestamp` không lệch), rồi đổi về `timestamptz`.
CREATE OR REPLACE FUNCTION ops.moc_truoc(p_viec text, p_luc timestamptz) RETURNS timestamptz
LANGUAGE plpgsql STABLE AS $$
DECLARE
  c     ops.cau_hinh_viec;
  dia   timestamp := p_luc AT TIME ZONE 'Asia/Ho_Chi_Minh';
  goc   timestamp;
  b     interval;
BEGIN
  SELECT * INTO c FROM ops.cau_hinh_viec WHERE viec = p_viec;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ops.moc_truoc: không có việc %', p_viec;
  END IF;
  b := ops.buoc(c.tan_suat);

  IF c.tan_suat = 'HANG_TUAN' THEN
    goc := (dia::date - ((extract(isodow FROM dia)::int - c.thu_trong_tuan + 7) % 7)) + c.gio_chay;
  ELSE
    goc := dia::date + c.gio_chay;
  END IF;
  IF goc > dia THEN
    goc := goc - CASE WHEN c.tan_suat = 'HANG_TUAN' THEN interval '7 days' ELSE interval '1 day' END;
  END IF;
  -- MOI_N_GIO: từ mốc đầu ngày, nhảy N giờ một lần tới mốc cuối không vượt p_luc.
  IF c.tan_suat IN ('MOI_6_GIO', 'MOI_12_GIO') THEN
    goc := goc + b * floor(extract(epoch FROM (dia - goc)) / extract(epoch FROM b));
  END IF;
  RETURN goc AT TIME ZONE 'Asia/Ho_Chi_Minh';
END $$;

CREATE OR REPLACE FUNCTION ops.moc_ke_tiep(p_viec text, p_luc timestamptz) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT ops.moc_truoc(p_viec, p_luc) + ops.buoc(tan_suat)
    FROM ops.cau_hinh_viec WHERE viec = p_viec
$$;

-- Đến hạn khi: CHƯA có lượt THÀNH CÔNG nào bắt đầu từ mốc gần nhất trở đi, VÀ không
-- có lượt nào (kể cả hỏng hay đang chạy) bắt đầu trong 60 phút qua.
--
-- Vế hai là nhịp thử lại: lượt hỏng (ổ đầy, CSDL bận) được thử lại sau một giờ chứ
-- không phải sau một chu kỳ — sao lưu hỏng một đêm là thứ phải sửa trong đêm ấy —
-- nhưng cũng không dội mỗi 15 phút một lần vào chỗ đang hỏng. Lượt chết giữa chừng
-- để lại `DANG_CHAY` mãi mãi; vế này cho nó hết chặn sau một giờ.
--
-- Máy tắt qua nhiều mốc: một lượt, không chạy bù từng mốc — mốc gần nhất là thứ duy
-- nhất cần có bản sao lưu.
CREATE OR REPLACE FUNCTION ops.den_han(p_viec text, p_luc timestamptz) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (
           SELECT 1 FROM ops.lan_chay
            WHERE viec = p_viec AND ket_qua = 'THANH_CONG'
              AND bat_dau >= ops.moc_truoc(p_viec, p_luc))
     AND NOT EXISTS (
           SELECT 1 FROM ops.lan_chay
            WHERE viec = p_viec AND bat_dau > p_luc - interval '1 hour')
$$;

-- `sla-worker` (role csbh_pol) tự hẹn giờ việc dọn dữ liệu và ghi lượt chạy của nó.
GRANT USAGE ON SCHEMA ops TO csbh_pol;
GRANT SELECT ON ops.cau_hinh_viec TO csbh_pol;
GRANT SELECT, INSERT, UPDATE ON ops.lan_chay TO csbh_pol;
GRANT USAGE, SELECT ON SEQUENCE ops.lan_chay_id_seq TO csbh_pol;
GRANT EXECUTE ON FUNCTION ops.buoc(text), ops.moc_truoc(text, timestamptz),
                          ops.moc_ke_tiep(text, timestamptz), ops.den_han(text, timestamptz) TO csbh_pol;

-- Dọn `doc.outbox` — bảng outbox DUY NHẤT chưa từng được dọn (đo 06/11: không hàm nào
-- xoá nó). Cùng khuôn `sys.don_idn_outbox` (`0091`): SECURITY DEFINER vì csbh_pol không
-- có quyền trên `doc`.
CREATE OR REPLACE FUNCTION sys.don_doc_outbox(p_keep_days int DEFAULT 30) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, doc AS $$
DECLARE n bigint;
BEGIN
  DELETE FROM doc.outbox
   WHERE published_at IS NOT NULL
     AND published_at < now() - (p_keep_days || ' days')::interval;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION sys.don_doc_outbox(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sys.don_doc_outbox(int) TO csbh_pol;
