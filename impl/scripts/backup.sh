#!/bin/sh
# Sao lưu CSDL. Chạy trong container (ảnh `ops` trên máy khách, container `test`
# ở bộ kiểm), không chạy native.
#
# Định dạng `custom` (-Fc) chứ không phải SQL thuần: nén sẵn, phục hồi được từng
# bảng, và pg_restore đọc được mục lục mà không phải giải nén cả file.
#
# `0250` — ĐÂY LÀ ĐƯỜNG SAO LƯU DUY NHẤT. Bản nền vật lý (`basebackup.sh`) và lưu
# trữ WAL đã gỡ (chốt 05/11: khách hàng chấp nhận mất tối đa một chu kỳ sao lưu
# thay vì 5 phút, đổi lấy một hệ gọn hơn nhiều GB). Bản dump chứa TOÀN BỘ CSDL
# `csbh`: hồ sơ, khách hàng, danh mục, tài khoản + mật khẩu băm + phiên, nhật ký.
#
# GIỮ TỐI ĐA N BẢN — đếm SỐ BẢN, không đếm ngày (`GIU_TOI_DA`, mặc định 7; trang
# Vận hành cấu hình được). Hai luật, cả hai có ca kiểm:
#
#   1. Chỉ dọn SAU KHI bản mới đã ghi xong VÀ đọc lại được. Lượt hỏng thì không
#      xoá bản nào — không bao giờ bớt một bản tốt khi chưa có bản thay.
#   2. Hạ giới hạn (10 → 5) thì phần thừa đi ở lượt kế tiếp, cũ nhất trước — cùng
#      một phép dọn, không có việc dọn riêng.
#
# Tên `csbh-<UTC>.dump` sắp theo chữ cái = sắp theo thời gian, nên "cũ nhất" là
# `sort | head`, không phụ thuộc mtime (mtime đổi khi chép sang bản sao ngoài).
set -eu
: "${PGHOST:=postgres}" "${PGUSER:=postgres}" "${PGDATABASE:=csbh}"
: "${BACKUP_DIR:=/backup}" "${GIU_TOI_DA:=7}"
export PGHOST PGUSER PGDATABASE PGPASSWORD

case "$GIU_TOI_DA" in
  ''|*[!0-9]*) echo "backup: LỖI — GIU_TOI_DA phải là số nguyên dương, đang là '$GIU_TOI_DA'" >&2; exit 2 ;;
esac
[ "$GIU_TOI_DA" -ge 1 ] || { echo "backup: LỖI — GIU_TOI_DA phải ≥ 1" >&2; exit 2; }

mkdir -p "$BACKUP_DIR"
# `CSBH_MOC` chỉ bộ kiểm đặt: hai lượt trong cùng một giây sẽ đè tên nhau.
stamp="${CSBH_MOC:-$(date -u +%Y%m%dT%H%M%SZ)}"
case "$stamp" in
  [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z) ;;
  *) echo "backup: LỖI — mốc '$stamp' sai dạng" >&2; exit 2 ;;
esac
file="$BACKUP_DIR/csbh-$stamp.dump"

echo "backup: đang ghi $file"
# pg_dump hỏng giữa chừng (CSDL không tới được, đĩa đầy) để lại tệp dở dang; dọn
# ngay thay vì chờ lượt sau — đĩa đầy là lúc mỗi MB đáng giá nhất.
if ! pg_dump -Fc -Z6 --file="$file.partial"; then
  rm -f "$file.partial"
  echo "backup: LỖI — pg_dump hỏng; KHÔNG dọn bản cũ nào" >&2
  exit 1
fi

# Đổi tên sau khi ghi XONG. Job dọn hoặc job phục hồi chạy chen vào giữa chừng sẽ
# thấy file .partial và bỏ qua, thay vì tưởng một file dở dang là bản sao lưu tốt.
mv "$file.partial" "$file"

# Kiểm ngay: đọc được mục lục nghĩa là file không hỏng. Không kiểm thì chỉ biết
# bản sao lưu hỏng vào đúng lúc cần dùng nó.
if ! pg_restore --list "$file" > /dev/null 2>&1; then
  echo "backup: LỖI — $file không đọc được, đã xoá; KHÔNG dọn bản cũ nào"
  rm -f "$file"
  exit 1
fi

size=$(wc -c < "$file")
echo "backup: xong $file ($size byte), mục lục đọc được"

# Giữ `GIU_TOI_DA` bản mới nhất trong một thư mục, xoá phần còn lại, cũ nhất trước.
giu_toi_da() {
  ls -1 "$1"/csbh-*.dump 2>/dev/null | LC_ALL=C sort | head -n "-$GIU_TOI_DA" | while read -r cu; do
    echo "backup: giữ tối đa $GIU_TOI_DA bản — xoá $(basename "$cu")"
    rm -f "$cu"
  done
}
giu_toi_da "$BACKUP_DIR"
find "$BACKUP_DIR" -maxdepth 1 -name '*.partial' -mmin +120 -print -delete || true

# --- Bản sao ngoài ------------------------------------------------------------
#
# Một bản sao lưu nằm cùng ổ với dữ liệu thì chết cùng ổ. Chép mọi bản tại chỗ
# mà bản sao ngoài chưa có (bù cả những đêm thư mục ấy chưa gắn), qua tên tạm rồi
# đổi tên — lượt chép đứt giữa chừng không để lại một tệp trông như bản tốt. Dọn
# bên ấy bằng CÙNG luật giữ tối đa.
if [ -n "${BACKUP_MIRROR_DIR:-}" ] && [ -d "$BACKUP_MIRROR_DIR" ]; then
  m="$BACKUP_MIRROR_DIR"
  for f in "$BACKUP_DIR"/csbh-*.dump; do
    [ -f "$f" ] || continue
    [ -f "$m/$(basename "$f")" ] || { cp "$f" "$m/.dang-chep" && mv "$m/.dang-chep" "$m/$(basename "$f")"; }
  done
  giu_toi_da "$m"
  echo "backup: bản sao ngoài $m có $(ls -1 "$m"/csbh-*.dump 2>/dev/null | wc -l) bản"
elif [ "${NODE_ENV:-}" = "production" ]; then
  echo "backup: LỖI — production bắt buộc đặt BACKUP_MIRROR_DIR ra ngoài ổ chứa dữ liệu"
  exit 1
else
  echo "backup: CẢNH BÁO — chưa đặt BACKUP_MIRROR_DIR, bản sao lưu vẫn nằm cùng ổ với dữ liệu"
fi

# Máy nâng cấp từ bản có bản nền (`0250`): nói ra, KHÔNG tự xoá — đó là dữ liệu
# người vận hành có thể còn muốn giữ, và xoá hàng GB là quyết định của người.
for cu in "$BACKUP_DIR/base" "${BACKUP_MIRROR_DIR:-/khong-co}/base" "${BACKUP_MIRROR_DIR:-/khong-co}/wal"; do
  [ -d "$cu" ] && echo "backup: GHI CHÚ — còn thư mục cũ $cu (bản nền/WAL đã thôi dùng từ 0250), xoá tay được: rm -rf $cu"
done

ls -1 "$BACKUP_DIR"/csbh-*.dump 2>/dev/null | LC_ALL=C sort -r | head -5
