#!/bin/sh
# Chuyển máy và sao lưu kho tệp — phần chạy TRONG ẢNH `ops` (`0246`).
#
# `./csbh` điều phối (dừng service, gọi `mc` trong container MinIO, hỏi mật
# khẩu); script này làm những việc cần `psql`, `find`, `sha256sum`, `openssl`,
# `tar` — đúng những thứ ảnh MinIO KHÔNG có (đo 05/11: nó chỉ có `mc`,
# `sha256sum`, `sort`).
#
# CÂU HỎI CẢ CHẶNG PHẢI TRẢ LỜI ĐƯỢC: *"máy mới có đúng y như máy cũ không"*. Nên
# lõi của script là `ban-ke` — một BẢNG KÊ dựng lại được ở cả hai đầu và so từng
# dòng: mỗi bảng của mọi schema (số dòng + md5 nội dung), mỗi sequence (giá trị
# hiện tại — mã hồ sơ đề xuất đọc từ đó), mỗi tệp của kho (sha256), và mọi
# `object_key` trong CSDL mà kho không có tệp.
set -eu

q() { psql -X -Atq -v ON_ERROR_STOP=1 "$@"; }

# Dạng in của phiên dựng bảng kê, đặt TƯỜNG MINH bằng `SET` ở đầu chính phiên ấy.
# `t::text` của `timestamptz` in theo múi giờ CỦA PHIÊN, nên hai máy hai múi giờ
# là hai md5 khác nhau cho cùng dữ liệu. Bản đầu đặt bằng `PGOPTIONS` và ca kiểm
# bắt được nó THUA biến `PGTZ` — libpq gửi `PGTZ` thành một tham số khởi động
# riêng, đè lên `options`. `SET` thì không gì đè được.
DINH_DANG="SET TimeZone TO 'UTC'; SET DateStyle TO 'ISO, YMD'; SET IntervalStyle TO 'postgres';
SET extra_float_digits TO 1; SET bytea_output TO 'hex';"

ban_ke() {
  d="$1"
  mkdir -p "$d"
  # --- CSDL: mọi bảng thường và bảng phân vùng, trừ của hệ thống ---------------
  # `ORDER BY t::text COLLATE "C"`: thứ tự KHÔNG phụ thuộc khoá chính (có bảng
  # không có) và không phụ thuộc collation của cụm.
  { echo "$DINH_DANG"; q -c "
    SELECT format(
      'SELECT %L, count(*), md5(coalesce(string_agg(t::text, E''\\n'' ORDER BY t::text COLLATE \"C\"), '''')) FROM %I.%I t;',
      n.nspname || '.' || c.relname, n.nspname, c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_toast%'
    ORDER BY 1"; } | q -F'|' > "$d/csdl.txt"
  # Sequence: `pg_dump` mang giá trị hiện tại theo, và mã hồ sơ đề xuất đọc từ
  # đây — một sequence tụt về 1 là mã TRÙNG ở hồ sơ kế tiếp.
  q -c "
    SELECT format('SELECT %L, last_value, is_called FROM %I.%I;',
                  'seq:' || schemaname || '.' || sequencename, schemaname, sequencename)
    FROM pg_sequences ORDER BY 1" | q -F'|' >> "$d/csdl.txt"

  # --- Kho tệp: sha256 từng tệp, đường dẫn tương đối, xếp theo byte ------------
  : > "$d/tep.txt"
  if [ -d "$d/tep" ]; then
    ( cd "$d/tep" && find . -type f | LC_ALL=C sort | while IFS= read -r f; do sha256sum "$f"; done ) > "$d/tep.txt"
  fi

  # --- Khoá CSDL trỏ tới mà kho không có -----------------------------------------
  # Mọi cột tên `object_key`, ở mọi schema — hỏi `information_schema`, không chép
  # danh sách bảng sang đây (thêm một bảng tệp về sau là tự được kiểm).
  # So với tệp ở MỌI bucket, không ghép theo `MINIO_BUCKET`: service `ops` không
  # mang biến ấy, và bản đầu chỉ đúng nhờ giá trị mặc định tình cờ trùng (ca kiểm
  # bắt được ở chồng kiểm, nơi bucket tên `csbh-test`).
  : > "$d/khoa-thieu.txt"
  co="$d/.khoa-co.txt"
  : > "$co"
  if [ -d "$d/tep" ]; then
    ( cd "$d/tep" && find . -type f | sed 's#^\./[^/]*/##' ) | LC_ALL=C sort -u > "$co"
  fi
  q -c "
    SELECT coalesce(string_agg(
      format('SELECT object_key FROM %I.%I WHERE object_key IS NOT NULL', table_schema, table_name),
      ' UNION '), 'SELECT NULL::text WHERE false')
    FROM information_schema.columns
    WHERE column_name = 'object_key' AND table_schema NOT IN ('pg_catalog', 'information_schema')" \
    | q | LC_ALL=C sort -u | LC_ALL=C comm -23 - "$co" > "$d/khoa-thieu.txt"
  rm -f "$co"
  echo "ban-ke: $(wc -l < "$d/csdl.txt") dòng CSDL, $(wc -l < "$d/tep.txt") tệp, $(wc -l < "$d/khoa-thieu.txt") khoá thiếu tệp"
}

# So hai bảng kê. In `KHỚP` hoặc từng dòng lệch; thoát 1 khi lệch.
so_sanh() {
  a="$1"; b="$2"; lech=0
  for t in csdl.txt tep.txt khoa-thieu.txt; do
    if ! diff -u "$a/$t" "$b/$t" > /tmp/so-sanh.diff 2>&1; then
      lech=1
      echo "LỆCH ở $t:"
      sed -n '3,60p' /tmp/so-sanh.diff | grep '^[-+]' || true
    fi
  done
  [ "$lech" = 0 ] && { echo "KHỚP — CSDL, kho tệp và khoá tệp giống hệt máy cũ."; return 0; }
  return 1
}

# Tổng số sự kiện còn nằm trong mọi outbox (`published_at IS NULL`).
cho_xa() {
  q -c "
    SELECT 'SELECT coalesce(sum(n), 0) FROM (' || coalesce(string_agg(
      format('SELECT count(*) AS n FROM %I.%I WHERE published_at IS NULL', table_schema, table_name),
      ' UNION ALL '), 'SELECT 0 AS n') || ') x'
    FROM information_schema.columns
    WHERE table_name = 'outbox' AND column_name = 'published_at'" | q
}

can_mat_khau() {
  [ -n "${CSBH_MAT_KHAU:-}" ] || { echo "chuyen-may: thiếu CSBH_MAT_KHAU" >&2; exit 2; }
}

# Mã hoá: AES-256-CBC, khoá dẫn xuất PBKDF2 600.000 vòng (mức OWASP 2023 cho
# SHA-256). Mật khẩu đọc từ BIẾN MÔI TRƯỜNG (`-pass env:`), không từ dòng lệnh —
# dòng lệnh lộ ra ở `ps` của mọi người dùng trên máy.
MA_HOA="-aes-256-cbc -pbkdf2 -iter 600000 -md sha256"

case "${1:-}" in
  ban-ke)     ban_ke "${2:?thư mục}" ;;
  so-sanh)    so_sanh "${2:?thư mục máy cũ}" "${3:?thư mục máy mới}" ;;
  cho-xa)     cho_xa ;;
  xuat-csdl)
    ra="${2:?thư mục}"
    pg_dump -Fc -Z6 --file="$ra/csdl.dump.partial"
    mv "$ra/csdl.dump.partial" "$ra/csdl.dump"
    pg_restore --list "$ra/csdl.dump" > /dev/null
    echo "xuat-csdl: $(wc -c < "$ra/csdl.dump") byte, mục lục đọc được"
    ;;
  dong-goi)
    # tar KHÔNG nén: bản dump đã nén sẵn, còn tệp scan/PDF nén thêm không được bao nhiêu.
    vao="${2:?thư mục}"; ra="${3:?tệp ra}"
    tar -C "$vao" -cf "$ra.partial" .
    mv "$ra.partial" "$ra"
    ( cd "$(dirname "$ra")" && sha256sum "$(basename "$ra")" > "$(basename "$ra").sha256" )
    echo "dong-goi: $ra ($(wc -c < "$ra") byte)"
    ;;
  mo-goi)
    vao="${2:?tệp}"; ra="${3:?thư mục}"
    if [ -f "$vao.sha256" ]; then
      ( cd "$(dirname "$vao")" && sha256sum -c "$(basename "$vao").sha256" > /dev/null ) || {
        echo "mo-goi: gói $vao KHÔNG khớp tệp .sha256 đi kèm — chép hỏng giữa đường." >&2; exit 1; }
    fi
    mkdir -p "$ra"
    tar -C "$ra" -xf "$vao"
    ;;
  bi-mat-dong)
    can_mat_khau
    cai="${2:?thư mục cài}"; ra="${3:?tệp ra}"
    # shellcheck disable=SC2086
    tar -C "$cai" -cf - .env secrets | openssl enc $MA_HOA -salt -pass env:CSBH_MAT_KHAU -out "$ra"
    # Mở thử ngay: một gói bí mật không mở được thì chỉ biết lúc đã mất máy cũ.
    # shellcheck disable=SC2086
    openssl enc -d $MA_HOA -pass env:CSBH_MAT_KHAU -in "$ra" | tar -tf - | grep -qx '\.env' || {
      rm -f "$ra"; echo "bi-mat-dong: gói vừa ghi không mở lại được — đã xoá." >&2; exit 1; }
    echo "bi-mat-dong: $ra"
    ;;
  bi-mat-mo)
    can_mat_khau
    vao="${2:?tệp}"; ra="${3:?thư mục}"
    mkdir -p "$ra"
    # shellcheck disable=SC2086
    openssl enc -d $MA_HOA -pass env:CSBH_MAT_KHAU -in "$vao" 2>/dev/null | tar -C "$ra" -xf - 2>/dev/null || {
      echo "bi-mat-mo: SAI mật khẩu, hoặc gói bí mật hỏng." >&2; exit 1; }
    [ -f "$ra/.env" ] || { echo "bi-mat-mo: gói không chứa .env." >&2; exit 1; }
    ;;
  *)
    echo "chuyen-may.sh: ban-ke | so-sanh | cho-xa | xuat-csdl | dong-goi | mo-goi | bi-mat-dong | bi-mat-mo" >&2
    exit 2
    ;;
esac
