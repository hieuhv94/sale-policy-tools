#!/bin/sh
# Chạy migration theo thứ tự tên file, ghi lại vào sys.schema_migration.
# Chạy trong container, không chạy native.
set -eu
: "${PGHOST:=postgres}" "${PGUSER:=postgres}" "${PGDATABASE:=csbh}"
export PGHOST PGUSER PGDATABASE PGPASSWORD

echo "migrate: chờ Postgres tại $PGHOST..."
for i in $(seq 1 60); do
  pg_isready -q && break
  [ "$i" = 60 ] && { echo "migrate: Postgres không sẵn sàng"; exit 1; }
  sleep 1
done

psql -v ON_ERROR_STOP=1 -q -c "
  CREATE SCHEMA IF NOT EXISTS sys;
  CREATE TABLE IF NOT EXISTS sys.schema_migration (
    filename text PRIMARY KEY, checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now());"

applied=0; skipped=0
for f in /migrations/*.sql; do
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
  for role in csbh_idn csbh_cat csbh_cus csbh_pol csbh_doc \
              csbh_ntf csbh_rpt csbh_aud csbh_sys; do
    echo "ALTER ROLE $role PASSWORD :'pwd';"
  done | psql -v ON_ERROR_STOP=1 -q -v pwd="$ROLE_PASSWORD"
  echo "migrate: đã đồng bộ mật khẩu 9 DB role"
fi

echo "migrate: xong — áp dụng $applied, bỏ qua $skipped (đã có)"
