#!/bin/sh
# Chạy migration theo thứ tự tên file, ghi lại vào sys.schema_migration.
# Chạy trong container, không chạy native.
set -eu
: "${PGHOST:=postgres}" "${PGUSER:=postgres}" "${PGDATABASE:=csbh}"
# Thư mục migration KHÁC NHAU giữa hai cách chạy (`0105`): chồng dev gắn
# `db/migrations` vào `/migrations`, còn ảnh vận hành đã mang sẵn chúng ở
# `/app/db/migrations`. Một biến, hai chỗ, không phải hai bản script.
: "${MIGRATIONS_DIR:=/migrations}"
export PGHOST PGUSER PGDATABASE PGPASSWORD

echo "migrate: chờ Postgres tại $PGHOST..."
for i in $(seq 1 60); do
  pg_isready -q && break
  [ "$i" = 60 ] && { echo "migrate: Postgres không sẵn sàng"; exit 1; }
  sleep 1
done

# `pg_isready` KHÔNG kiểm được mật khẩu (`0111`).
#
# Nó chỉ hỏi "máy chủ có nhận kết nối không", và trả 0 kể cả khi mọi lượt đăng
# nhập đều bị từ chối. Nên vòng chờ ở trên qua được, rồi câu lệnh đầu tiên chết
# với một dòng của psql không nhắc gì tới nguyên nhân thật:
#
#   FATAL: password authentication failed for user "postgres"
#
# Nguyên nhân gần như luôn là một chuyện: **Postgres đặt mật khẩu superuser CHỈ ở
# lần khởi tạo thư mục dữ liệu đầu tiên**. Volume `pgdata` đã dựng từ trước giữ
# nguyên mật khẩu cũ, còn `secrets/pg_password.txt` thì đã mang giá trị khác —
# đổi file về sau không đụng gì tới CSDL đã dựng.
if ! psql -q -c 'SELECT 1' > /dev/null 2>/tmp/migrate-thu.err; then
  if grep -qi 'password authentication failed' /tmp/migrate-thu.err; then
    cat >&2 <<'HET'

migrate: Postgres từ chối mật khẩu.

  Postgres đặt mật khẩu superuser CHỈ ở lần khởi tạo dữ liệu đầu tiên. Volume
  dữ liệu đang dùng đã được dựng bằng một mật khẩu khác, và đổi file bí mật về
  sau không sửa được điều đó.

  CSDL chưa có gì đáng giữ — dựng lại từ đầu:
      docker compose --env-file .env -f deploy/compose.yml -f deploy/compose.prod.yml down -v
      ./csbh len

  CSDL ĐÃ CÓ dữ liệu — đổi mật khẩu bên trong Postgres cho khớp file:
      xem tai-lieu/05-VAN-HANH.md, mục "password authentication failed"

  Cũng kiểm COMPOSE_PROJECT_NAME trong .env: nó quyết định volume nào được dùng,
  và trùng tên với một chồng khác là dùng chung volume của chồng ấy.

HET
    exit 1
  fi
  cat /tmp/migrate-thu.err >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 -q -c "
  CREATE SCHEMA IF NOT EXISTS sys;
  CREATE TABLE IF NOT EXISTS sys.schema_migration (
    filename text PRIMARY KEY, checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now());"

applied=0; skipped=0
for f in "$MIGRATIONS_DIR"/*.sql; do
  name=$(basename "$f")
  sum=$(md5sum "$f" | cut -d' ' -f1)
  prev=$(psql -tAc "SELECT checksum FROM sys.schema_migration WHERE filename='$name'")
  if [ -n "$prev" ]; then
    if [ "$prev" != "$sum" ]; then
      echo "migrate: LỖI — $name đã áp dụng nhưng nội dung đã đổi (checksum lệch)"
      exit 1
    fi
    skipped=$((skipped+1)); continue
  fi
  echo "migrate: áp dụng $name"
  # --single-transaction: cả file và dòng ghi nhận PHẢI cùng một transaction.
  #
  # Thiếu nó thì migration hỏng giữa chừng để lại CSDL nửa vời và KHÔNG được ghi
  # nhận, nên lần chạy sau áp dụng lại từ đầu lên một lược đồ đã đổi một nửa —
  # rất khó gỡ vì không nhìn ra được đã tới đâu. Đã dính đúng lỗi này ở 0008.
  psql -v ON_ERROR_STOP=1 -q --single-transaction \
    -f "$f" \
    -c "INSERT INTO sys.schema_migration(filename, checksum) VALUES ('$name', '$sum')"
  applied=$((applied+1))
done
# --- Đồng bộ mật khẩu của chín DB role -------------------------------------
#
# CHẠY MỖI LẦN, không phải một migration. Migration chạy đúng một lần rồi được
# ghi nhận, nên nó không thể là chỗ giữ cho mật khẩu role khớp với file bí mật
# đang dùng — xoay mật khẩu là việc vận hành lặp lại, không phải đổi lược đồ.
#
# Không có bước này thì triệu chứng rất khó đọc: migration chạy sạch, CSDL vẫn
# khoẻ, mà cả mười service chết ngay lúc khởi động với
# "password authentication failed" — và không có gì trong log của migrate gợi ý
# vì sao.
if [ -n "${ROLE_PASSWORD_FILE:-}" ] && [ -f "$ROLE_PASSWORD_FILE" ]; then
  ROLE_PASSWORD=$(cat "$ROLE_PASSWORD_FILE")
fi

if [ -n "${ROLE_PASSWORD:-}" ]; then
  # Mật khẩu đi qua BIẾN CỦA PSQL (`:'pwd'`), không nội suy bằng shell.
  #
  # Đưa câu lệnh qua STDIN, không qua `-c` và không gói trong `DO $$ … $$`.
  # psql chỉ thay biến ở đầu vào dạng tệp/stdin: `-c` gửi thẳng chuỗi xuống máy
  # chủ, còn bên trong chuỗi trích dẫn kiểu dollar thì nó không đụng tới. Cả hai
  # cách kia đều báo `syntax error at or near ":"` — đã dính đủ cả hai.
  #
  # `0240` — TẠO role nếu thiếu, không chỉ đổi mật khẩu. Cụm Postgres MỚI nạp
  # một bản dump có sẵn `sys.schema_migration`, nên `0002` không bao giờ chạy
  # lại và role không bao giờ có — `ALTER ROLE` hỏng, mười service không đăng
  # nhập được. Quyền trên bảng đã nằm trong bản dump; thứ thiếu chỉ là role.
  for role in csbh_idn csbh_cat csbh_cus csbh_pol csbh_doc \
              csbh_ntf csbh_rpt csbh_aud csbh_sys; do
    echo "SELECT format('CREATE ROLE %I LOGIN', '$role')
          WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$role') \\gexec"
    echo "ALTER ROLE $role PASSWORD :'pwd';"
  done | psql -v ON_ERROR_STOP=1 -q -v pwd="$ROLE_PASSWORD"
  echo "migrate: đã đồng bộ mật khẩu 9 DB role"
fi

echo "migrate: xong — áp dụng $applied, bỏ qua $skipped (đã có)"
