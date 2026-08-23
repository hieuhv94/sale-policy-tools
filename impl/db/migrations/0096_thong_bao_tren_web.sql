-- =============================================================================
-- 0096 — Thông báo trên web: cái chuông ở thanh trên cùng.
--
-- Luật khách hàng chốt gọn một câu: **mọi hành động dẫn tới gửi email cho một
-- người đều là một thông báo của người ấy, ngoài ra không có thông báo nào
-- khác** (chốt 23/08).
--
-- Câu ấy có một cách cài đặt đúng và một cách sai. Cách sai là dựng ở đây một
-- danh sách hành động sinh thông báo — nó trôi khỏi danh sách thư ngay lần đầu
-- ai đó thêm một lá thư mới, và không có gì báo. Cách đúng là GHI THÔNG BÁO
-- NGAY TẠI CHỖ ĐÃ TÍNH RA NGƯỜI NHẬN THƯ (`notify.service.handle`), dùng chính
-- biến `targets` mà `mailer.send` sắp nhận. Không tồn tại đường nào gửi thư mà
-- không đi qua đó, nên quy tắc thành bất biến chứ không phải quy ước.
--
-- HAI LÁ THƯ CỦA `identity` — kích hoạt tài khoản và đặt lại mật khẩu — KHÔNG có
-- mặt ở đây, và đó không phải một lựa chọn thẩm mỹ. Chúng mang token thô trong
-- thân thư; `ONB-15` cho phép token thô tồn tại đúng hai chỗ là bộ nhớ tiến
-- trình và thân email, còn CSDL chỉ giữ bản băm. Bảng này đọc được qua API, nên
-- một liên kết kích hoạt nằm trong `duong_dan` là đúng cái rò rỉ mà đường gửi
-- thư thứ hai của identity dựng ra để tránh (xem đầu `identity/infra/mailer.ts`).
-- Trùng hợp may mắn: người chưa kích hoạt tài khoản cũng chưa đăng nhập được để
-- nhìn thấy cái chuông.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ntf.thong_bao (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  event_id    uuid NOT NULL,
  -- Soi gương `ntf.sent_mail.kind`: CHINH là lá thư của người phải xử lý,
  -- THEO_DOI là lá "để biết" của người đã từng thao tác (`0036`). Hai loại dẫn
  -- đi HAI CHỖ khác nhau, nên chúng phải phân biệt được ở đây.
  kind        text NOT NULL,
  action      text,
  tieu_de     text NOT NULL,
  mo_ta       text,
  duong_dan   text NOT NULL,
  policy_id   uuid,
  customer_id uuid,
  xay_ra_luc  timestamptz NOT NULL,
  da_doc_luc  timestamptz
);

COMMENT ON TABLE ntf.thong_bao IS
  'Một dòng cho mỗi NGƯỜI NHẬN của mỗi lá thư nghiệp vụ. Ghi cùng chỗ tính người nhận thư (0096).';
COMMENT ON COLUMN ntf.thong_bao.duong_dan IS
  'Đường dẫn TƯƠNG ĐỐI, bằng đúng đường trong thân thư. Dựng từ templates.duongDan() (0096).';
COMMENT ON COLUMN ntf.thong_bao.xay_ra_luc IS
  'Mốc của SỰ KIỆN, không phải lúc ghi dòng này. Xem chú thích chỉ mục bên dưới (0096).';

-- --- Chống trùng --------------------------------------------------------------
--
-- Cùng vai trò với `uq_sent_mail_event_kind` của `0037`, và cần vì đúng lý do
-- đó: hàng đợi giao ít nhất một lần.
--
-- Nhưng ở đây còn một đường thứ hai mà `sent_mail` không có. Nhánh hỏng của
-- `handle` XOÁ chỗ đã giữ trong `sent_mail` để lần gửi lại từ DLQ chạy lại được
-- — nghĩa là đoạn ghi thông báo cũng chạy lại. Không có chỉ mục này thì mỗi lần
-- Quản trị bấm *Gửi lại* là một bản sao nữa của cùng một thông báo, và người
-- dùng không có cách nào dọn.
CREATE UNIQUE INDEX IF NOT EXISTS uq_thong_bao_event_kind_user
  ON ntf.thong_bao (event_id, kind, user_id);

-- --- Hai đường đọc ------------------------------------------------------------
--
-- Sắp theo `xay_ra_luc` chứ không theo lúc ghi dòng, nên chỉ mục cũng phải theo
-- cột ấy. Một sự kiện nằm trong DLQ ba tiếng rồi mới được gửi lại vẫn phải đứng
-- đúng chỗ của nó trong dòng thời gian — `now()` sẽ đẩy nó lên đầu danh sách và
-- nói dối ở đúng chỗ người dùng đang tin.
--
-- `id DESC` đi kèm để hai thông báo cùng một mốc (rất thường: một hành động sinh
-- thư cho bốn người, và bản "để biết" mang y hệt `at`) có thứ tự ổn định giữa
-- các trang. Thiếu nó thì phân trang lặp dòng.
CREATE INDEX IF NOT EXISTS ix_thong_bao_hop
  ON ntf.thong_bao (user_id, xay_ra_luc DESC, id DESC);

-- Đếm chưa đọc chạy mỗi 60 giây cho MỌI người đang mở phần mềm — đường nóng
-- nhất của cả bảng. Chỉ mục một phần: hộp đã đọc hết thì không có dòng nào ở
-- đây, và con số 0 trả về mà không chạm tới dữ liệu.
CREATE INDEX IF NOT EXISTS ix_thong_bao_chua_doc
  ON ntf.thong_bao (user_id) WHERE da_doc_luc IS NULL;

-- Không cần `GRANT` cho `csbh_ntf`: `ALTER DEFAULT PRIVILEGES` ở `0002` đã áp cho
-- mọi bảng dựng sau trong schema `ntf`.
--
-- KHÔNG có khoá ngoại sang `idn.app_user`, đúng luật đang áp cho `ntf.sent_mail`:
-- notification không đọc schema `idn`, nó hỏi identity qua HTTP. Hệ quả phải
-- biết: xoá một tài khoản không tự dọn thông báo của người ấy — mà hệ này không
-- xoá tài khoản, chỉ vô hiệu hoá.

-- --- Dọn theo vòng đời --------------------------------------------------------
--
-- SÁU THÁNG, khớp với cửa sổ tra của *Nhật ký* (`0090`). Một con số chung cho
-- hai chỗ thì người dùng chỉ phải nhớ một câu: quá sáu tháng thì tra ở đâu cũng
-- không còn.
--
-- Hàm riêng thay vì thêm một câu `DELETE` vào `sys.run_retention()`, đúng lối
-- `sys.don_idn_outbox()` của `0091`: `CREATE OR REPLACE` đòi cả thân hàm, và
-- chép lại một hàm 40 dòng chỉ để thêm một câu là cách chắc chắn để hai bản
-- trôi khỏi nhau.
--
-- `SECURITY DEFINER` vì người gọi là `sla-worker`, chạy dưới `csbh_pol` — role
-- không có quyền nào trên schema `ntf` (AD-02). `search_path` cố định là bắt
-- buộc với mọi hàm như vậy: thiếu nó, người gọi trỏ được tên bảng sang bảng của
-- mình và hàm sẽ xoá nhầm dưới quyền chủ sở hữu.
CREATE OR REPLACE FUNCTION sys.don_thong_bao(p_keep_days int DEFAULT 180)
RETURNS bigint AS $$
DECLARE n bigint;
BEGIN
  DELETE FROM ntf.thong_bao
   WHERE xay_ra_luc < now() - (p_keep_days || ' days')::interval;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$ LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = pg_catalog, ntf, sys;

COMMENT ON FUNCTION sys.don_thong_bao(int) IS
  'Dọn thông báo cũ hơn 6 tháng. Gọi từ sla-worker cùng nhịp run_retention() (0096).';

REVOKE EXECUTE ON FUNCTION sys.don_thong_bao(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sys.don_thong_bao(int) TO csbh_pol;
