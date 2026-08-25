#!/bin/sh
# Cửa vào DUY NHẤT của ảnh vận hành (`0105`).
#
# Một lệnh con cho mỗi việc, thay cho việc người vận hành phải nhớ đường dẫn
# tuyệt đối của từng script bên trong ảnh. Trên máy chủ khách không có mã nguồn
# để tra, nên `csbh-ops help` là tài liệu tra cứu gần nhất mà họ có.
#
# Lệnh KHÔNG BIẾT thì báo lỗi và liệt kê lệnh đúng, chứ không im lặng thoát 0:
# một lệnh gõ sai trong cron mà thoát 0 nghĩa là bản sao lưu không chạy suốt
# nhiều tháng và không ai biết.
set -eu

# `psql`, `pg_dump` và `pg_basebackup` chỉ biết `PGPASSWORD`, không biết
# `PGPASSWORD_FILE` (`0106`). Đọc hộ ở đây để `.env` thôi phải mang mật khẩu —
# một bí mật nằm ở hai chỗ là một bí mật sẽ lệch nhau.
if [ -n "${PGPASSWORD_FILE:-}" ] && [ -f "${PGPASSWORD_FILE}" ]; then
  PGPASSWORD="$(cat "${PGPASSWORD_FILE}")"
  export PGPASSWORD
fi

usage() {
  cat <<'HET'
csbh-ops — công cụ vận hành Chính sách bán hàng

  migrate            Chạy migration CSDL. An toàn khi chạy lại.
  bootstrap-admin    Tạo tài khoản Quản trị ĐẦU TIÊN. Chỉ chạy được khi CSDL
                     chưa có tài khoản nào. Cần ADMIN_USERNAME, ADMIN_EMAIL,
                     ADMIN_PASSWORD (hoặc ADMIN_PASSWORD_FILE).
  backup             Sao lưu logic (pg_dump) + bản nền (pg_basebackup).
  restore-drill      DIỄN TẬP phục hồi vào CSDL nháp. KHÔNG đụng CSDL đang chạy.
  restore <file>     Phục hồi ĐÈ lên CSDL đang chạy. Phải đặt RESTORE_DB=csbh.
  retention          Dọn dữ liệu quá hạn lưu trữ và outbox đã gửi.
  luu-audit          Trích nhật ký kiểm toán của một tháng ra kho lưu trữ.
  psql [...]         Mở psql vào CSDL, hoặc chạy câu lệnh truyền vào.
  gen-secrets [dir]  Sinh bí mật cho một lần triển khai. Mặc định /run/secrets.
  version            In phiên bản ảnh.
  help               Bảng này.
HET
}

case "${1:-help}" in
  migrate)         shift; MIGRATIONS_DIR=/app/db/migrations exec /bin/sh /app/scripts/migrate.sh "$@" ;;
  bootstrap-admin) shift; exec pnpm --dir /app bootstrap-admin "$@" ;;
  backup)
    /bin/sh /app/scripts/backup.sh
    exec /bin/sh /app/scripts/basebackup.sh
    ;;
  restore-drill)   shift; exec /bin/sh /app/scripts/restore.sh "$@" ;;
  restore)
    shift
    # Đè lên CSDL đang chạy là việc không hoàn tác được. `RESTORE_DB` phải do
    # người gọi gõ ra, không có mặc định — xem `restore.sh`.
    [ "${RESTORE_DB:-}" = "csbh" ] || {
      echo "csbh-ops restore: phải đặt RESTORE_DB=csbh một cách có ý thức." >&2
      echo "Muốn kiểm tra bản sao lưu mà không đụng dữ liệu: dùng restore-drill." >&2
      exit 1
    }
    exec /bin/sh /app/scripts/restore.sh "$@"
    ;;
  retention)
    psql -v ON_ERROR_STOP=1 -q -c "SELECT sys.run_retention()"
    exec psql -v ON_ERROR_STOP=1 -q -c "SELECT sys.don_idn_outbox()"
    ;;
  luu-audit)       shift; exec /bin/sh /app/scripts/luu-audit-thang.sh "$@" ;;
  psql)            shift; exec psql "$@" ;;
  gen-secrets)     shift; exec /bin/sh /app/scripts/gen-secrets.sh "${1:-/run/secrets}" ;;
  version)         echo "${APP_VERSION:-0.0.0-dev}" ;;
  help|-h|--help)  usage ;;
  *)
    echo "csbh-ops: không có lệnh \"$1\"." >&2
    echo "" >&2
    usage >&2
    exit 2
    ;;
esac
