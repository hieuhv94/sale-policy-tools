-- =============================================================================
-- 0014_sla_schema_grant — Thiếu một nửa quyền ở 0013.
--
-- 0013 cấp `EXECUTE` trên `sys.run_retention()` cho `csbh_pol`, và điều đó đúng
-- nhưng chưa đủ: gọi một hàm còn cần `USAGE` trên SCHEMA chứa nó. Không có nó
-- thì lời gọi dừng ở "permission denied for schema sys" — trước cả khi tới phép
-- kiểm quyền trên hàm.
--
-- Hai lớp quyền cho một lời gọi là chỗ dễ quên nhất trong mô hình phân quyền của
-- Postgres, và `GRANT EXECUTE` thành công không hề cảnh báo rằng nó chưa đủ.
--
-- `USAGE` trên schema KHÔNG cho đọc bảng nào trong đó: `sys.schema_migration` và
-- `sys.app_release` vẫn ngoài tầm với của csbh_pol. Ranh giới AD-02 không nới ra.
-- =============================================================================

GRANT USAGE ON SCHEMA sys TO csbh_pol;
