#!/bin/sh
# =============================================================================
# Nén kho log theo tháng, kèm dấu thời gian và bản băm (`0092`)
# =============================================================================
#
# Chạy đầu mỗi tháng. Nén **tháng đã đóng**, không đụng tháng đang chạy: một tệp
# vừa được `luu-log.sh` ghi thêm vào mà đem nén là nén một nửa.
#
# Ba việc, và việc thứ ba mới là việc quan trọng:
#
#   1. `gzip` tệp tháng cũ  →  `<service>-YYYY-MM.log.gz`
#   2. Sinh `.sha256` đi kèm
#   3. **Kiểm ngay**: `gzip -t` đọc lại, và số dòng sau khi giải nén phải bằng
#      số dòng trước khi nén. Không kiểm thì chỉ biết bản nén hỏng vào đúng lúc
#      cần nó — cùng bài học với `backup.sh`, vốn tự chạy `pg_restore --list`
#      ngay sau khi ghi.
#
# Hỏng ở bước kiểm thì GIỮ NGUYÊN bản chưa nén và báo lỗi. Xoá bản gốc rồi mới
# phát hiện bản nén hỏng là mất hẳn.
# =============================================================================
set -eu

# Tháng TRƯỚC, tính bằng số học thay vì `date -d 'last month'`.
#
# `date -d` là của GNU; busybox trong ảnh alpine không có nó, và `date -v` là
# của BSD. Cả hai đều hỏng ở đúng một trong hai chỗ script này chạy — máy chủ
# và container postgres. Phép trừ tay thì chạy ở cả ba.
thang_truoc() {
  y=$(TZ=Asia/Ho_Chi_Minh date +%Y)
  m=$(TZ=Asia/Ho_Chi_Minh date +%m)
  m=${m#0}
  m=$((m - 1))
  if [ "$m" -eq 0 ]; then m=12; y=$((y - 1)); fi
  printf '%04d-%02d\n' "$y" "$m"
}

KHO="${KHO_LOG:-../logarchive}"
# Tháng cần nén: mặc định là tháng TRƯỚC, theo giờ Việt Nam.
THANG="${THANG_NEN:-$(thang_truoc)}"
DANG_CHAY=$(TZ=Asia/Ho_Chi_Minh date +%Y-%m)

if [ "$THANG" = "$DANG_CHAY" ]; then
  echo "nen-log: TỪ CHỐI nén tháng đang chạy ($THANG) — nó còn được ghi thêm"
  exit 1
fi

[ -d "$KHO/logs" ] || { echo "nen-log: chưa có kho $KHO/logs, không có gì để nén"; exit 0; }

manifest="$KHO/manifest"
mkdir -p "$manifest"
ra="$manifest/$THANG.json"
tmp="$ra.partial"

echo "{" > "$tmp"
printf '  "thang": "%s",\n' "$THANG" >> "$tmp"
printf '  "mui_gio_cat_ky": "Asia/Ho_Chi_Minh",\n' >> "$tmp"
printf '  "dau_thoi_gian_tung_dong": "UTC",\n' >> "$tmp"
printf '  "nen_luc": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$tmp"
printf '  "phien_ban": "%s",\n' "${APP_VERSION:-khong-ro}" >> "$tmp"
printf '  "tep": [\n' >> "$tmp"

dau=1
loi=0
for tep in "$KHO"/logs/*/*-"$THANG".log; do
  [ -f "$tep" ] || continue
  ten=$(basename "$tep")
  dong_truoc=$(wc -l < "$tep")
  byte_truoc=$(wc -c < "$tep")

  gzip -9 -c "$tep" > "$tep.gz.partial"
  mv "$tep.gz.partial" "$tep.gz"

  if ! gzip -t "$tep.gz" 2>/dev/null; then
    echo "nen-log: LỖI — $ten.gz không đọc được, giữ nguyên bản gốc"
    rm -f "$tep.gz"
    loi=1
    continue
  fi
  dong_sau=$(gzip -dc "$tep.gz" | wc -l)
  if [ "$dong_sau" != "$dong_truoc" ]; then
    echo "nen-log: LỖI — $ten lệch số dòng ($dong_truoc -> $dong_sau), giữ nguyên bản gốc"
    rm -f "$tep.gz"
    loi=1
    continue
  fi

  bam=$(sha256sum "$tep.gz" | cut -d' ' -f1)
  echo "$bam  $ten.gz" > "$tep.gz.sha256"
  byte_sau=$(wc -c < "$tep.gz")
  rm -f "$tep"

  [ $dau -eq 1 ] || echo "," >> "$tmp"
  dau=0
  printf '    { "ten": "%s.gz", "dong": %s, "byte_truoc": %s, "byte_sau": %s, "sha256": "%s" }' \
    "$ten" "$dong_truoc" "$byte_truoc" "$byte_sau" "$bam" >> "$tmp"
  echo "nen-log: $ten.gz — $dong_truoc dòng, $byte_truoc -> $byte_sau byte"
done

printf '\n  ]\n}\n' >> "$tmp"
mv "$tmp" "$ra"
echo "nen-log: manifest $ra"
exit $loi
