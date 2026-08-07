#!/bin/sh
# Sao lưu CSDL. Chạy trong container postgres, không chạy native.
#
# Định dạng `custom` (-Fc) chứ không phải SQL thuần: nén sẵn, phục hồi được từng
# bảng, và pg_restore đọc được mục lục mà không phải giải nén cả file.
set -eu
: "${PGHOST:=postgres}" "${PGUSER:=postgres}" "${PGDATABASE:=csbh}"
: "${BACKUP_DIR:=/backup}" "${KEEP_DAYS:=14}"
export PGHOST PGUSER PGDATABASE PGPASSWORD

stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="$BACKUP_DIR/csbh-$stamp.dump"

echo "backup: đang ghi $file"
pg_dump -Fc -Z6 --file="$file.partial"

# Đổi tên sau khi ghi XONG. Job dọn hoặc job phục hồi chạy chen vào giữa chừng sẽ
# thấy file .partial và bỏ qua, thay vì tưởng một file dở dang là bản sao lưu tốt.
mv "$file.partial" "$file"

# Kiểm ngay: đọc được mục lục nghĩa là file không hỏng. Không kiểm thì chỉ biết
# bản sao lưu hỏng vào đúng lúc cần dùng nó.
if ! pg_restore --list "$file" > /dev/null 2>&1; then
  echo "backup: LỖI — $file không đọc được, đã xoá"
  rm -f "$file"
  exit 1
fi

size=$(wc -c < "$file")
echo "backup: xong $file ($size byte), mục lục đọc được"

echo "backup: xoá bản cũ hơn $KEEP_DAYS ngày"
find "$BACKUP_DIR" -name 'csbh-*.dump' -mtime "+$KEEP_DAYS" -print -delete || true
find "$BACKUP_DIR" -name '*.partial' -mmin +120 -print -delete || true

ls -1t "$BACKUP_DIR"/csbh-*.dump 2>/dev/null | head -5
