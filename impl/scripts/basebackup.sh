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
#
# `0240` — MỐC DỌN LẤY TỪ CHÍNH BẢN NỀN CŨ NHẤT CÒN GIỮ, đọc `backup_label`
# trong `base.tar.gz` của nó.
#
# Bản trước lấy tệp `.backup` cũ nhất trong thư mục lưu trữ. Nhưng
# `pg_archivecleanup` của Postgres 16 KHÔNG xoá tệp `.backup` (cờ `-b` chỉ có từ
# 17), nên tệp của bản nền ĐẦU TIÊN nằm đó mãi, và mốc dọn đứng yên ở đó từ đêm
# đầu tiên: diễn tập sáu đêm đo được 16MB → 176MB, không lúc nào giảm. Mốc ấy
# đúng ở đêm đầu, nên không gì đỏ.
mon_cua() { # $1 = thư mục một bản nền → tên segment WAL nó bắt đầu
  tar -xzOf "$1/base.tar.gz" backup_label 2>/dev/null \
    | sed -n 's/^START WAL LOCATION: .*(file \([0-9A-F]\{24\}\))$/\1/p'
}
oldest=$(ls -1d "$base_root"/*/ 2>/dev/null | grep -v '\.partial/$' | sort | head -1)
cutoff=""
[ -n "$oldest" ] && cutoff=$(mon_cua "${oldest%/}")
don_wal() { # $1 = thư mục WAL cần dọn
  pg_archivecleanup "$1" "$cutoff"
  # Tệp nhãn `.backup` của những bản nền đã xoá: Postgres 16 không tự dọn.
  ls -1 "$1" 2>/dev/null | grep '\.backup$' \
    | awk -v c="$cutoff" 'substr($0, 1, 24) < c' \
    | while read -r f; do rm -f "$1/$f"; done
}
if [ -n "$cutoff" ]; then
  echo "basebackup: dọn WAL cũ hơn $cutoff (điểm bắt đầu của bản nền cũ nhất còn giữ)"
  don_wal "$ARCHIVE_DIR"
else
  echo "basebackup: LỖI — không đọc được điểm bắt đầu của bản nền ${oldest:-?}, KHÔNG dọn WAL"
fi

echo "basebackup: thư mục lưu trữ còn $(ls -1 "$ARCHIVE_DIR" | wc -l) file, $(du -sh "$ARCHIVE_DIR" | cut -f1)"

# --- Nhân bản ra ngoài Docker volume ---------------------------------------
# Bản sao lưu nằm cùng ổ với dữ liệu thì chỉ chống được lỗi người dùng (xoá
# nhầm), KHÔNG chống được lỗi phần cứng. Ở production biến này bắt buộc phải trỏ
# tới một ổ khác hoặc một điểm gắn NAS.
#
# `0240` — chỉ chép thứ CHƯA có, và DỌN theo cùng luật giữ với bản gốc. Bản
# trước chép lại mọi thứ mỗi đêm và không xoá gì, nên bản sao ngoài lớn mãi (đo:
# sáu đêm = sáu bản nền + sáu dump, trong khi bản gốc giữ ba). Kèm theo WAL:
# thiếu nó thì bản sao ngoài chỉ phục hồi được về đúng giờ chụp bản nền.
if [ -n "${BACKUP_MIRROR_DIR:-}" ]; then
  echo "basebackup: nhân bản sang $BACKUP_MIRROR_DIR"
  m="$BACKUP_MIRROR_DIR"
  mkdir -p "$m/base" "$m/wal"
  for d in "$base_root"/*/; do
    n=$(basename "$d")
    case "$n" in *.partial) continue ;; esac
    [ -d "$m/base/$n" ] || { cp -r "$d" "$m/base/$n.partial" && mv "$m/base/$n.partial" "$m/base/$n"; }
  done
  for f in "$BACKUP_DIR"/csbh-*.dump; do
    [ -f "$f" ] || continue
    [ -f "$m/$(basename "$f")" ] || { cp "$f" "$m/.dang-chep" && mv "$m/.dang-chep" "$m/$(basename "$f")"; }
  done
  for f in "$ARCHIVE_DIR"/*; do
    [ -f "$f" ] || continue
    [ -f "$m/wal/$(basename "$f")" ] || cp -p "$f" "$m/wal/"
  done
  # Bố cục trước `0240` chép bản nền thẳng vào gốc bản sao (`<giờ>/`). Chúng là
  # bản trùng của những bản nền cũ hơn bản gốc còn giữ, và không ai dọn được.
  ls -1d "$m"/2*Z/ 2>/dev/null | while read -r old; do rm -rf "$old"; done
  # Dọn theo cùng luật: KEEP_BASE bản nền, KEEP_DAYS ngày dump, WAL theo mốc trên.
  ls -1d "$m/base"/*/ 2>/dev/null | sort | head -n "-$KEEP_BASE" | while read -r old; do rm -rf "$old"; done
  find "$m" -maxdepth 1 -name 'csbh-*.dump' -mtime "+${KEEP_DAYS:-14}" -delete || true
  [ -z "$cutoff" ] || don_wal "$m/wal"
  echo "basebackup: bản sao ngoài có $(ls -1 "$m/base" | wc -l) bản nền, $(ls -1 "$m"/csbh-*.dump 2>/dev/null | wc -l) dump, $(ls -1 "$m/wal" | wc -l) tệp WAL"
elif [ "${NODE_ENV:-}" = "production" ]; then
  echo "basebackup: LỖI — production bắt buộc đặt BACKUP_MIRROR_DIR ra ngoài ổ chứa dữ liệu"
  exit 1
else
  echo "basebackup: CẢNH BÁO — chưa đặt BACKUP_MIRROR_DIR, bản sao lưu vẫn nằm cùng ổ với dữ liệu"
fi

# Không đọc được mốc dọn là hỏng thật — báo cho cron biết bằng mã thoát, SAU khi
# đã nhân bản xong (bản sao lưu đêm nay vẫn tốt).
[ -n "$cutoff" ] || exit 1
