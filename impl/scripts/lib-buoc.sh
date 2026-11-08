# shellcheck shell=sh
# Thư viện hiển thị BƯỚC, nạp bằng `. lib-buoc.sh` — `csbh` và `cai-dat.sh` dùng CHUNG
# (một định nghĩa, hai người gọi; `scripts/ban-cai.sh` chép nó cạnh `csbh`).
# Lệnh dài (cài, cập nhật, lùi) phải nói rõ bước nào ĐANG chạy và bước nào ĐÃ XONG:
#
#   [2/7] ▶ Sao lưu CSDL trước khi kéo ảnh…
#   [2/7] ✔ Sao lưu CSDL trước khi kéo ảnh  (14 giây)
#   [3/7] ✘ Kéo ảnh mới — HỎNG sau 3 giây
#
# `buoc_tong N` đặt tổng số bước; `buoc "tên"` đóng bước trước (✔) rồi mở bước mới;
# `buoc_xong` đóng bước cuối; `buoc_bo "lý do"` đóng bước hiện tại là BỎ QUA (–).
# Bước đang mở mà lệnh thoát với mã khác 0 thì `trap` in ✘ — không có bước nào
# "treo" ở ▶ trên màn hình khi script đã chết. Ra STDOUT, không màu khi không phải
# terminal (log cron/tệp nhật ký đọc được).
if [ -t 1 ]; then _X=$(printf '\033[32m'); _D=$(printf '\033[31m'); _V=$(printf '\033[33m'); _H=$(printf '\033[1m'); _0=$(printf '\033[0m')
else _X=''; _D=''; _V=''; _H=''; _0=''; fi
BUOC_TONG=0; BUOC_SO=0; BUOC_TEN=''; BUOC_LUC=0
# Bắt cả INT và TERM: `dash` KHÔNG chạy trap EXIT khi tiến trình chết vì tín hiệu, nên
# Ctrl-C giữa một lượt kiểm nghiệm từng để lại cả chồng kiểm (3 container, 2 volume, 2 mạng
# — đo 08/11 trên chồng thật; bộ kiểm với docker giả không thấy được). `exit` từ trong trap
# tín hiệu thì trap EXIT CÓ chạy, với mã 130/143.
buoc_tong() { BUOC_TONG=$1; BUOC_SO=0; BUOC_TEN=''; trap '_buoc_thoat $?' EXIT; trap 'exit 130' INT; trap 'exit 143' TERM; }
_buoc_dong() {
  [ -n "$BUOC_TEN" ] || return 0
  printf '%s[%s/%s] %s %s%s  (%s giây)\n' "$1" "$BUOC_SO" "$BUOC_TONG" "$2" "$BUOC_TEN" "$_0" "$(( $(date +%s) - BUOC_LUC ))"
  BUOC_TEN=''
}
buoc() {
  _buoc_dong "$_X" '✔'
  BUOC_SO=$((BUOC_SO + 1)); BUOC_TEN=$1; BUOC_LUC=$(date +%s)
  printf '\n%s[%s/%s] ▶ %s…%s\n' "$_H" "$BUOC_SO" "$BUOC_TONG" "$BUOC_TEN" "$_0"
}
buoc_xong() { _buoc_dong "$_X" '✔'; }
buoc_bo() { BUOC_TEN="$BUOC_TEN — bỏ qua: $1"; _buoc_dong "$_V" '–'; }
# `BUOC_KHI_THOAT`: một lệnh chạy SAU khi đóng bước, dù xanh hay đỏ — chỗ để dọn
# (chồng kiểm nghiệm, tệp tạm). Một trap EXIT duy nhất cho cả hai việc: hai lời gọi
# `trap … EXIT` thì cái sau đè cái trước, và bên bị đè lặng lẽ không chạy.
_buoc_thoat() {
  if [ "$1" != 0 ] && [ -n "$BUOC_TEN" ]; then BUOC_TEN="$BUOC_TEN — HỎNG"; _buoc_dong "$_D" '✘'
  else _buoc_dong "$_X" '✔'; fi
  if [ -n "${BUOC_KHI_THOAT:-}" ]; then eval "$BUOC_KHI_THOAT" || true; fi
}
