-- 0051 — Khoá trộn mẫu viết bằng TIẾNG VIỆT, cho cả hai loại mẫu.
--
-- Trước đó khoá là `customer.name`, `policy.applied_date`, `person.tdv` — tên
-- bảng dữ liệu, không phải tên thứ mà người soạn mẫu đang đi tìm. Khách hàng
-- chốt ngày 19/08: đổi sang tiếng Việt, và đổi cho CẢ mẫu hợp đồng.
--
-- MỘT NHÓM `ho_so.` CHO TẤT CẢ, kể cả thông tin khách hàng và người xử lý.
-- Người soạn mẫu nghĩ theo câu hỏi "trong hồ sơ này có gì", không nghĩ theo lược
-- đồ CSDL. `cong_ty.` đứng riêng vì nó không thuộc hồ sơ — giống nhau ở mọi hồ sơ.
--
-- ĐỔI TÊN CHỨ KHÔNG THÊM BÍ DANH. Giữ cả hai cách gọi nghĩa là hai bảng khoá
-- cùng đúng, và người soạn mẫu thứ hai sẽ chép nhầm bảng của người thứ nhất —
-- rồi hỏi vì sao mẫu của mình không ánh xạ được. Một cách gọi tên, một bảng.

-- --------------------------------------------------------------------------
-- Bảng ánh xạ của MẪU ĐÃ TẢI LÊN: đổi tên nguồn tại chỗ
-- --------------------------------------------------------------------------
--
-- `placeholder` KHÔNG đổi — nó là chuỗi nằm trong chính file .docx, và phần mềm
-- không sửa được file người dùng đã tải lên. Mẫu cũ vẫn chạy đúng: ô trống tên
-- `{{customer.name}}` trong file giờ trỏ tới nguồn `ho_so.ten_khach_hang`.
--
-- Hơi lệch giữa tên ô và tên nguồn, nhưng đó là cái giá RẺ NHẤT có thể: cách
-- duy nhất để chúng khớp lại là bắt Sale Admin soạn lại mọi mẫu đã có.
UPDATE doc.contract_template_field SET source = t.moi
  FROM (VALUES
    ('customer.code',            'ho_so.ma_khach_hang'),
    ('customer.name',            'ho_so.ten_khach_hang'),
    ('customer.id_number',       'ho_so.ma_so_thue'),
    ('customer.registered_address', 'ho_so.dia_chi_dang_ky'),
    ('customer.delivery_address',   'ho_so.noi_nhan_hang'),
    ('customer.owner_name',      'ho_so.nguoi_dai_dien'),
    ('customer.owner_title',     'ho_so.chuc_danh_dai_dien'),
    ('customer.debt',            'ho_so.cong_no'),
    ('policy.code',              'ho_so.ma_ho_so'),
    ('policy.version_no',        'ho_so.phien_ban'),
    ('policy.status',            'ho_so.trang_thai'),
    ('policy.applied_date',      'ho_so.ngay_ap_dung'),
    ('policy.effective_from',    'ho_so.ngay_hieu_luc'),
    ('policy.attachments',       'ho_so.tep_dinh_kem'),
    ('policy.tbp_signed_at',     'ho_so.ngay_tbp_ky'),
    ('policy.kt_l1_received_at', 'ho_so.ngay_kt_nhan_l1'),
    ('policy.kt_l2_received_at', 'ho_so.ngay_kt_nhan_l2'),
    ('person.tdv',               'ho_so.nguoi_de_nghi'),
    ('person.tbp',               'ho_so.truong_bo_phan'),
    ('person.ke_toan',           'ho_so.ke_toan'),
    ('person.sale_admin',        'ho_so.sale_admin'),
    ('company.name',             'cong_ty.ten'),
    ('company.address',          'cong_ty.dia_chi'),
    ('company.tax_code',         'cong_ty.ma_so_thue'),
    ('today',                    'ngay_in'),
    ('policy.lines[].index',           'san_pham.stt'),
    ('policy.lines[].product_code',    'san_pham.ma_san_pham'),
    ('policy.lines[].product_name',    'san_pham.ten_san_pham'),
    ('policy.lines[].company_price',   'san_pham.gia_cong_ty'),
    ('policy.lines[].wholesale_price', 'san_pham.gia_ban_buon'),
    ('policy.lines[].cpbh_total',      'san_pham.cpbh_tong'),
    ('policy.lines[].net_price',       'san_pham.gia_thu_ve'),
    ('policy.lines[].discount_rate',   'san_pham.ty_le_ck')
  ) AS t(cu, moi)
 WHERE doc.contract_template_field.source = t.cu;

/*
 * `policy.lines[].threshold` KHÔNG có tên mới — cột *Ngưỡng* bị bỏ khỏi bản A4
 * theo yêu cầu 19/08, và trường nguồn theo dòng cũng rút theo.
 *
 * Dòng ánh xạ nào còn trỏ tới nó thì XOÁ HẲN, không để lại một nguồn không tồn
 * tại: `setMapping` kiểm nguồn ở lúc lưu, nên một dòng như thế làm mọi lần sửa
 * ánh xạ sau đó của chính mẫu ấy bị từ chối — mà người dùng không hề đụng vào nó.
 *
 * Hệ quả đã chấp nhận: ô trống ấy trong file .docx thành ô CHƯA ÁNH XẠ, và mẫu
 * không ban hành lại được cho tới khi Sale Admin trỏ nó sang trường khác hoặc
 * xoá nó khỏi file. Đó là điều đúng phải xảy ra — cột ngưỡng không còn nữa.
 */
DELETE FROM doc.contract_template_field WHERE source = 'policy.lines[].threshold';

-- --------------------------------------------------------------------------
-- MẪU MẶC ĐỊNH: dựng lại hẳn
-- --------------------------------------------------------------------------
--
-- Khác mẫu người dùng tải lên ở một điểm quyết định: mẫu mặc định do CHÍNH HỆ
-- THỐNG sinh ra và dựng lại được y hệt, nên không có gì để mất. Xoá đi thì
-- `ensureDefault` dựng lại ở lần khởi động ngay sau đó, với file .docx mang ô
-- trống tên tiếng Việt — khớp luôn với tên nguồn.
--
-- Chỉ xoá dòng mẫu, KHÔNG xoá `doc.stored_file`: file cũ ở lại như mọi file đã
-- thay thế khác, và `sys.run_retention()` dọn theo vòng đời chung.
DELETE FROM doc.contract_template_field f
 USING doc.contract_template t
 WHERE f.template_id = t.id AND t.is_default;
DELETE FROM doc.contract_template WHERE is_default;
