#!/bin/sh
# Sao lưu VẬT LÝ + dọn WAL đã lưu trữ.
#
# TẠI SAO CẦN CẢ HAI KIỂU SAO LƯU:
#   pg_dump  — sao lưu LOGIC. Phục hồi được từng bảng, mang sang máy chủ Postgres
#              phiên bản khác được. Nhưng KHÔNG ghép với WAL, nên điểm phục hồi
#              sớm nhất là lúc chạy dump — mất tối đa 24 giờ.
#   pg_basebackup — sao lưu VẬT LÝ. Ghép với WAL đã lưu trữ thành phục hồi theo
#              thời điểm (PITR), điểm mất dữ liệu rút xuống còn ~5 phút.
#
# Bản đầu của P5.5 chỉ có pg_dump kèm archive_mode=on, tức là WAL chất đống mà
# không dùng được vào việc gì. Hai thứ đó không tự ghép thành PITR.
set -eu
: "${PGHOST:=postgres}" "${PGUSER:=postgres}"
: "${BACKUP_DIR:=/backup}" "${ARCHIVE_DIR:=/archive}" "${KEEP_BASE:=3}"
export PGHOST PGUSER PGPASSWORD

base_root="$BACKUP_DIR/base"
mkdir -p "$base_root"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dest="$base_root/$stamp"

echo "basebackup: đang ghi $dest"
mkdir -p "$dest.partial"
pg_basebackup -D "$dest.partial" -Ft -z -Xstream -c fast -P
mv "$dest.partial" "$dest"
echo "basebackup: xong $dest ($(du -sh "$dest" | cut -f1))"

# Giữ KEEP_BASE bản gần nhất.
ls -1d "$base_root"/*/ 2>/dev/null | sort | head -n "-$KEEP_BASE" | while read -r old; do
  echo "basebackup: xoá bản cũ $old"
  rm -rf "$old"
done
rm -rf "$base_root"/*.partial 2>/dev/null || true

# --- Dọn WAL ---------------------------------------------------------------
# WAL cũ hơn bản sao lưu vật lý CÒN GIỮ sớm nhất thì không phục hồi được gì nữa.
# Không dọn thì thư mục lưu trữ phình vô hạn và làm đầy ổ — và ổ đầy thì Postgres
# DỪNG GHI, tức là cơ chế bảo vệ dữ liệu tự tay giết hệ thống.
oldest=$(ls -1d "$base_root"/*/ 2>/dev/null | sort | head -1)
if [ -n "$oldest" ]; then
  # File .backup trong thư mục lưu trữ đánh dấu điểm bắt đầu của bản sao lưu đó.
  cutoff=$(ls -1 "$ARCHIVE_DIR" 2>/dev/null | grep '\.backup$' | sort | head -1 || true)
  if [ -n "$cutoff" ]; then
    echo "basebackup: dọn WAL cũ hơn $cutoff"
    pg_archivecleanup "$ARCHIVE_DIR" "$cutoff"
  else
    echo "basebackup: chưa có nhãn .backup nào trong $ARCHIVE_DIR, chưa dọn WAL"
  fi
fi

echo "basebackup: thư mục lưu trữ còn $(ls -1 "$ARCHIVE_DIR" | wc -l) file, $(du -sh "$ARCHIVE_DIR" | cut -f1)"

# --- Nhân bản ra ngoài Docker volume ---------------------------------------
# Bản sao lưu nằm cùng ổ với dữ liệu thì chỉ chống được lỗi người dùng (xoá
# nhầm), KHÔNG chống được lỗi phần cứng. Ở production biến này bắt buộc phải trỏ
# tới một ổ khác hoặc một điểm gắn NAS.
if [ -n "${BACKUP_MIRROR_DIR:-}" ]; then
  echo "basebackup: nhân bản sang $BACKUP_MIRROR_DIR"
  mkdir -p "$BACKUP_MIRROR_DIR"
  cp -r "$base_root"/*/ "$BACKUP_MIRROR_DIR/" 2>/dev/null || true
  cp "$BACKUP_DIR"/csbh-*.dump "$BACKUP_MIRROR_DIR/" 2>/dev/null || true
  echo "basebackup: bản sao ngoài có $(ls -1 "$BACKUP_MIRROR_DIR" | wc -l) mục"
elif [ "${NODE_ENV:-}" = "production" ]; then
  echo "basebackup: LỖI — production bắt buộc đặt BACKUP_MIRROR_DIR ra ngoài ổ chứa dữ liệu"
  exit 1
else
  echo "basebackup: CẢNH BÁO — chưa đặt BACKUP_MIRROR_DIR, bản sao lưu vẫn nằm cùng ổ với dữ liệu"
fi
