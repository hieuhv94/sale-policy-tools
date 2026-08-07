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
echo "migrate: xong — áp dụng $applied, bỏ qua $skipped (đã có)"
