#!/bin/sh
# Phục hồi CSDL từ một bản sao lưu.
#
# MẶC ĐỊNH phục hồi vào CSDL NHÁP (csbh_restore_check), không đè lên CSDL đang
# chạy. Muốn đè thật thì phải truyền RESTORE_DB=csbh một cách có ý thức — phục
# hồi nhầm lên CSDL sống là cách mất dữ liệu nhanh nhất trong lúc đang hoảng.
#
# `0240` — CSDL ĐANG CHẠY KHÔNG BAO GIỜ BỊ XOÁ TRƯỚC KHI BẢN MỚI ĐÃ NẠP XONG.
#
# Bản cũ `DROP` CSDL đích rồi mới gọi `pg_restore`, nên một tệp gõ sai đường dẫn
# — đo được trên diễn tập: `/b/…` thay vì `/backup/…` — để lại một CSDL TRỐNG và
# một dòng "No such file or directory". Bản dump hỏng giữa chừng cũng thế. Giờ:
#
#   1. kiểm tệp (có mặt, đọc được mục lục) TRƯỚC mọi việc;
#   2. nạp vào một CSDL TẠM;
#   3. chỉ khi nạp xong mới đổi tên: `csbh` → `csbh_truoc_phuc_hoi_<giờ>` (GIỮ
#      lại, không xoá), CSDL tạm → `csbh`.
#
# Cái giá: cần chỗ trống cho HAI bản CSDL trong lúc phục hồi, và bản cũ nằm lại
# tới khi người vận hành tự xoá — câu lệnh xoá in ra ở cuối.
set -eu
: "${PGHOST:=postgres}" "${PGUSER:=postgres}" "${BACKUP_DIR:=/backup}"
: "${RESTORE_DB:=csbh_restore_check}"
# Tên CSDL ĐANG CHẠY. Chỉ bộ kiểm đổi nó (để thử nhánh đổi chỗ mà không đụng `csbh`
# của chính bộ kiểm); trên máy chủ thật luôn là `csbh`.
: "${CSDL_SONG:=csbh}"
export PGHOST PGUSER PGPASSWORD

file="${1:-}"
[ -n "$file" ] || file=$(ls -1t "$BACKUP_DIR"/csbh-*.dump 2>/dev/null | head -1)
[ -n "$file" ] || { echo "restore: không tìm thấy bản sao lưu nào trong $BACKUP_DIR"; exit 1; }
# Tên trần (không có `/`) là tên trong thư mục sao lưu — đúng thứ `ls` của
# người vận hành in ra. Đường dẫn trên MÁY CHỦ không có nghĩa trong container.
case "$file" in */*) ;; *) file="$BACKUP_DIR/$file" ;; esac

if [ ! -f "$file" ]; then
  echo "restore: KHÔNG THẤY tệp $file — chưa đụng tới CSDL nào."
  echo "restore: các bản sao lưu đang có (gõ đúng tên trong danh sách):"
  ls -1t "$BACKUP_DIR"/csbh-*.dump 2>/dev/null | head -10 | sed 's#.*/#  #'
  exit 1
fi
if ! pg_restore --list "$file" > /dev/null 2>&1; then
  echo "restore: tệp $file KHÔNG ĐỌC ĐƯỢC (hỏng hoặc không phải bản pg_dump) — chưa đụng tới CSDL nào."
  exit 1
fi

stamp=$(date -u +%Y%m%dT%H%M%SZ)
if [ "$RESTORE_DB" = "$CSDL_SONG" ]; then
  echo "restore: ĐANG ĐÈ LÊN CSDL ĐANG CHẠY từ $file"
  nap="${CSDL_SONG}_phuc_hoi_$stamp"
else
  echo "restore: phục hồi thử vào $RESTORE_DB từ $file"
  nap="$RESTORE_DB"
fi

sql() { psql -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

sql -c "DROP DATABASE IF EXISTS \"$nap\" WITH (FORCE)"
sql -c "CREATE DATABASE \"$nap\""

# --- DB role -----------------------------------------------------------------
# Role là đối tượng của CỤM, không nằm trong bản dump. Phục hồi lên một cụm
# MỚI (mất máy) thì mọi `GRANT … TO csbh_idn` hỏng, và `migrate` chạy sau cũng
# không cứu được: bản dump mang theo `sys.schema_migration`, nên `0002` (chỗ tạo
# role) bị bỏ qua — cụm kẹt hẳn, đo được ở diễn tập `0240`.
#
# Danh sách role đọc TỪ CHÍNH BẢN DUMP (mọi đích của `… TO <role>;`), không chép
# danh sách chín role sang đây lần thứ ba. Mật khẩu: `migrate` đồng bộ mỗi lần
# chạy; ở đây đặt luôn nếu có sẵn tệp bí mật.
if [ -n "${ROLE_PASSWORD_FILE:-}" ] && [ -f "$ROLE_PASSWORD_FILE" ]; then
  ROLE_PASSWORD=$(cat "$ROLE_PASSWORD_FILE")
fi
roles=$(pg_restore --schema-only --file=- "$file" \
  | sed -n 's/.* TO \([a-z_][a-z0-9_]*\);$/\1/p' | grep -v '^postgres$' | sort -u)
for role in $roles; do
  if [ -n "${ROLE_PASSWORD:-}" ]; then
    echo "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', '$role', :'pwd')
          WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$role') \\gexec"
  else
    echo "SELECT format('CREATE ROLE %I LOGIN', '$role')
          WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$role') \\gexec"
  fi
done | psql -d postgres -v ON_ERROR_STOP=1 -q -v pwd="${ROLE_PASSWORD:-}"

# --no-owner: giữ nguyên chủ sở hữu cũ sẽ hỏng khi phục hồi sang cụm khác.
if ! pg_restore --dbname="$nap" --no-owner --exit-on-error --jobs=2 "$file"; then
  if [ "$RESTORE_DB" = "$CSDL_SONG" ]; then
    sql -c "DROP DATABASE IF EXISTS \"$nap\" WITH (FORCE)"
    echo "restore: LỖI khi nạp — CSDL đang chạy GIỮ NGUYÊN, không mất gì. Bản nạp dở đã xoá."
  else
    echo "restore: LỖI khi nạp vào $nap"
  fi
  exit 1
fi

# Quyền ở mức DATABASE không nằm trong bản dump (pg_dump chỉ mang nó khi có
# `--create`). Thiếu bước này thì CSDL phục hồi về mặc định — PUBLIC kết nối
# được — tức lớp chặn của `0002` mất lặng lẽ.
{
  echo "REVOKE ALL ON DATABASE \"$nap\" FROM PUBLIC;"
  for role in $roles; do echo "GRANT CONNECT ON DATABASE \"$nap\" TO \"$role\";"; done
} | sql

echo "restore: xong. Đối chiếu số dòng:"
psql -d "$nap" -v ON_ERROR_STOP=1 -c "
  SELECT 'app_user' t, count(*) FROM idn.app_user
  UNION ALL SELECT 'customer', count(*) FROM cus.customer
  UNION ALL SELECT 'policy',   count(*) FROM pol.policy
  UNION ALL SELECT 'product',  count(*) FROM cat.product
  UNION ALL SELECT 'audit_log',count(*) FROM aud.audit_log
  ORDER BY 1"

[ "$RESTORE_DB" = "$CSDL_SONG" ] || exit 0

# --- Đổi chỗ -------------------------------------------------------------------
# Chặn kết nối MỚI trước khi cắt kết nối cũ: service tự nối lại ngay, và một kết
# nối chen vào giữa hai câu lệnh làm `RENAME` hỏng. Bản cũ giữ cờ chặn sau khi
# đổi tên — không service nào lỡ nối vào nó.
cu="${CSDL_SONG}_truoc_phuc_hoi_$stamp"
sql -c "ALTER DATABASE \"$CSDL_SONG\" ALLOW_CONNECTIONS false"
sql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$CSDL_SONG' AND pid <> pg_backend_pid()" > /dev/null
if ! sql -c "ALTER DATABASE \"$CSDL_SONG\" RENAME TO \"$cu\""; then
  sql -c "ALTER DATABASE \"$CSDL_SONG\" ALLOW_CONNECTIONS true"
  echo "restore: LỖI khi đổi tên — CSDL đang chạy GIỮ NGUYÊN. Bản vừa nạp còn ở $nap."
  exit 1
fi
sql -c "ALTER DATABASE \"$nap\" RENAME TO \"$CSDL_SONG\""

echo "restore: CSDL đang chạy đã thay bằng bản phục hồi."
echo "restore: bản CŨ giữ lại dưới tên $cu (chặn kết nối). Xoá khi đã chắc chắn:"
echo "  ./csbh psql -d postgres -c 'DROP DATABASE \"$cu\"'"
