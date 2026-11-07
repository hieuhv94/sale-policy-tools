-- `0261` — bình luận trên hồ sơ CSBH (yêu cầu `agents/comment_system_requirements.md`,
-- kế hoạch `agents/KE-HOACH-BINH-LUAN.md`, mockup đã duyệt 07/11/2026).
--
-- Ba bảng, cùng schema `pol` với hồ sơ: quyền đọc/viết bình luận LÀ phạm vi hồ sơ (yêu cầu 2.2),
-- và luật phạm vi đã nằm ở service `policy` — tách sang service khác là phải hỏi chéo ở mọi lượt.
--
-- ## Mốc thay đổi `stt_doi` và khoá theo hồ sơ
--
-- Giao diện tự cập nhật bằng cách hỏi *"có gì đổi sau mốc X"* (yêu cầu 5). Mốc là một số lấy
-- từ sequence ở MỌI lượt ghi (tạo, sửa, xoá, đổi cảm xúc) — không dùng `now()`: hai bình luận
-- ghi trong cùng transaction có `now()` giống hệt nhau (bẫy `0126`).
--
-- Sequence một mình CHƯA ĐỦ: hai transaction lấy số 10 và 11, transaction 11 commit trước, lượt
-- hỏi thấy 11 rồi đặt mốc 11 — số 10 commit sau sẽ không bao giờ được hỏi tới. Nên mọi lượt
-- ghi bình luận của MỘT hồ sơ đi qua `pg_advisory_xact_lock` theo hồ sơ (ở service) TRƯỚC khi
-- lấy số: trong một hồ sơ, thứ tự số trùng thứ tự commit; lượt hỏi luôn theo từng hồ sơ.
--
-- ## Xoá mềm
--
-- `xoa_luc` khác NULL = đã xoá. Nội dung GIỮ trong bảng (yêu cầu 3.4: không ai xem lại được trên
-- giao diện — đường đọc trả `noiDung: null`), dòng giữ chỗ trong luồng để reply không mồ côi.
-- Bản Nháp bị xoá hẳn (`0035`) thì `ON DELETE CASCADE` kéo bình luận đi theo.

CREATE SEQUENCE IF NOT EXISTS pol.binh_luan_stt_seq;

CREATE TABLE IF NOT EXISTS pol.binh_luan (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id   uuid NOT NULL REFERENCES pol.policy(id) ON DELETE CASCADE,
  -- NULL = bình luận gốc. Một cấp reply: cha phải là gốc và cùng hồ sơ — trigger dưới đây chốt,
  -- service kiểm trước để trả mã lỗi dễ hiểu.
  parent_id   uuid REFERENCES pol.binh_luan(id) ON DELETE CASCADE,
  tac_gia_id  uuid NOT NULL,
  -- Chữ thuần đã chuẩn hoá NFC; nhắc tên nằm trong chữ dạng `@{<uuid>}` (`binh-luan.ts`).
  -- Trần ở đây rộng hơn trần nghiệp vụ (5.000 ký tự hiển thị): mỗi dấu nhắc chiếm 39 ký tự.
  noi_dung    text NOT NULL DEFAULT '' CHECK (length(noi_dung) <= 6000),
  -- Khoá chống gửi trùng do client sinh (yêu cầu 9.3 + lượt thử lại sau mất mạng): gửi lại cùng
  -- `ma_gui` thì nhận lại đúng bình luận đã có, không sinh dòng thứ hai.
  ma_gui      uuid NOT NULL UNIQUE,
  -- Thứ tự TẠO (phân trang) và mốc ĐỔI (tự cập nhật) — cùng một sequence.
  -- `stt_doi` KHÔNG mặc định bằng `currval(...)`: Postgres không hứa thứ tự tính mặc định giữa
  -- hai cột, nên `currval` có thể chạy trước `nextval` của chính dòng ấy. Trigger đặt nó.
  stt         bigint NOT NULL DEFAULT nextval('pol.binh_luan_stt_seq'),
  stt_doi     bigint NOT NULL DEFAULT 0,
  tao_luc     timestamptz NOT NULL DEFAULT now(),
  sua_luc     timestamptz,
  xoa_luc     timestamptz
);

CREATE INDEX IF NOT EXISTS ix_binh_luan_goc ON pol.binh_luan (policy_id, stt) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS ix_binh_luan_phan_hoi ON pol.binh_luan (parent_id, stt) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_binh_luan_doi ON pol.binh_luan (policy_id, stt_doi);

-- Cảm xúc: mỗi người tối đa một lần MỖI LOẠI trên một bình luận (yêu cầu 8) — khoá chính chốt,
-- nên bấm đúp hay hai tab cùng bấm cũng chỉ ra một dòng.
CREATE TABLE IF NOT EXISTS pol.binh_luan_cam_xuc (
  binh_luan_id uuid NOT NULL REFERENCES pol.binh_luan(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  loai         text NOT NULL CHECK (loai IN ('THICH', 'YEU', 'MUNG', 'XEM', 'TIEN', 'VUI')),
  tao_luc      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (binh_luan_id, user_id, loai)
);

-- Một cấp reply, ở tầng CSDL: lượt gọi API sai hình dạng không dựng được reply lồng nhau.
CREATE OR REPLACE FUNCTION pol.kiem_cha_binh_luan() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE cha pol.binh_luan;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO cha FROM pol.binh_luan WHERE id = NEW.parent_id;
  IF cha.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'bình luận % là reply, không nhận reply', NEW.parent_id USING ERRCODE = 'check_violation';
  END IF;
  IF cha.policy_id <> NEW.policy_id THEN
    RAISE EXCEPTION 'bình luận cha thuộc hồ sơ khác' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_kiem_cha_binh_luan ON pol.binh_luan;
CREATE TRIGGER tr_kiem_cha_binh_luan BEFORE INSERT ON pol.binh_luan
  FOR EACH ROW EXECUTE FUNCTION pol.kiem_cha_binh_luan();

-- Mọi lượt SỬA dòng bình luận (sửa nội dung, xoá mềm, hay chỉ "chạm" khi cảm xúc đổi) lấy mốc
-- mới. Ở trigger chứ không ở từng câu UPDATE: quên một chỗ là thay đổi ấy không bao giờ tới
-- người đang xem, và không gì đỏ.
CREATE OR REPLACE FUNCTION pol.danh_moc_binh_luan() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stt_doi := NEW.stt;
  ELSE
    NEW.stt_doi := nextval('pol.binh_luan_stt_seq');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_danh_moc_binh_luan ON pol.binh_luan;
CREATE TRIGGER tr_danh_moc_binh_luan BEFORE INSERT OR UPDATE ON pol.binh_luan
  FOR EACH ROW EXECUTE FUNCTION pol.danh_moc_binh_luan();

COMMENT ON TABLE pol.binh_luan IS
  'Bình luận trên hồ sơ CSBH (0261). Xoá mềm bằng xoa_luc; stt_doi là mốc cho đường hỏi thay đổi.';
