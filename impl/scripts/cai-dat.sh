#!/usr/bin/env bash
# =============================================================================
# CÀI ĐẶT hệ Chính sách bán hàng trên MỘT VPS bằng MỘT lệnh (`0270`).
#
#   sudo ./cai-dat.sh                  lần đầu: tạo /etc/csbh/csbh.env rồi dừng để điền;
#                                      lần sau: cài / áp lại cấu hình (KHÔNG đụng dữ liệu)
#   sudo ./cai-dat.sh --env <tệp>      dùng một tệp cấu hình đã điền sẵn (chép vào /etc/csbh/)
#   sudo ./cai-dat.sh --bo-kiem-dns    bỏ kiểm DNS (đứng sau proxy Cloudflare, NAT 1:1…)
#   sudo ./cai-dat.sh --cap-nhat       = sudo csbh cap-nhat
#   sudo ./cai-dat.sh --lui-lai        = sudo csbh lui-lai
#
# KHÔNG HỎI GÌ: mọi thông tin đọc từ MỘT tệp, /etc/csbh/csbh.env (mẫu: csbh.env.mau).
# Tới `0269` bộ cài hỏi từng câu, rồi còn 12 bước tay (cài Docker, docker login, mồi tài
# khoản, chép cron, chép unit tác tử, sửa đường dẫn bằng sed). Giờ là một lệnh.
#
# CHẠY LẠI ĐƯỢC: mỗi bước kiểm trạng thái trước — đã có thì bỏ qua và NÓI RA là bỏ qua.
# Chạy lại sau khi sửa csbh.env là cách áp cấu hình mới. Không bước nào xoá dữ liệu.
#
# Mỗi bước in `[i/N] ▶ …` lúc bắt đầu và `[i/N] ✔ … (N giây)` lúc xong (`lib-buoc.sh`);
# toàn bộ đầu ra ghi kèm vào <workspace>/logs/cai-dat/<giờ>.log.
#
# BIẾN ĐÈ chỉ dành cho bộ kiểm (chạy được không cần root, với lệnh giả trên PATH):
# CSBH_ENV · CSBH_CHUONG_TRINH · CSBH_BIN · CSBH_ETC_CRON · CSBH_ETC_SYSTEMD ·
# CSBH_OS_RELEASE · CSBH_BO_KIEM_ROOT · CSBH_KIEM_KHOI_LAN.
# =============================================================================
set -euo pipefail

NGUON="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
ENV_TEP="${CSBH_ENV:-/etc/csbh/csbh.env}"
ETC_CSBH="$(dirname "$ENV_TEP")"
GOC_CT="${CSBH_CHUONG_TRINH:-/opt/csbh}"
BIN="${CSBH_BIN:-/usr/local/bin}"
ETC_CRON="${CSBH_ETC_CRON:-/etc/cron.d}"
ETC_SYSTEMD="${CSBH_ETC_SYSTEMD:-/etc/systemd/system}"
OS_RELEASE="${CSBH_OS_RELEASE:-/etc/os-release}"
NGUOI_CHAY=csbh

# shellcheck source=lib-buoc.sh
. "$NGUON/lib-buoc.sh"

loi() { printf '\n  %s\n\n' "$*" >&2; exit 1; }
doc_env() { grep -E "^$1=" "$ENV_TEP" 2>/dev/null | tail -1 | cut -d= -f2- || true; }

# --- Tham số -------------------------------------------------------------------
BO_KIEM_DNS=0; ENV_VAO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --env) ENV_VAO="${2:?--env cần đường tệp}"; shift 2 ;;
    --bo-kiem-dns) BO_KIEM_DNS=1; shift ;;
    --cap-nhat) exec "$BIN/csbh" cap-nhat ;;
    --lui-lai) exec "$BIN/csbh" lui-lai ;;
    -h|--help) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) loi "Không hiểu tham số '$1'. Xem: ./cai-dat.sh --help" ;;
  esac
done

[ "$(id -u)" = 0 ] || [ "${CSBH_BO_KIEM_ROOT:-0}" = 1 ] || loi "Phải chạy bằng quyền root:  sudo ./cai-dat.sh"

# --- Tệp cấu hình: có chưa? --------------------------------------------------------
#
# Trước mọi bước: chưa có tệp cấu hình thì TẠO từ mẫu rồi DỪNG — bộ cài không đoán hộ
# tên miền hay máy chủ thư.
if [ -n "$ENV_VAO" ]; then
  [ -f "$ENV_VAO" ] || loi "Không thấy tệp $ENV_VAO."
  mkdir -p "$ETC_CSBH"
  if [ -f "$ENV_TEP" ] && ! cmp -s "$ENV_VAO" "$ENV_TEP"; then
    cp -p "$ENV_TEP" "$ENV_TEP.truoc-$(date +%Y%m%d%H%M%S)"
    echo "  (Tệp cấu hình cũ cất ở $ENV_TEP.truoc-<giờ>)"
  fi
  [ "$(readlink -f "$ENV_VAO")" = "$(readlink -f "$ENV_TEP" 2>/dev/null || true)" ] || cp "$ENV_VAO" "$ENV_TEP"
fi
if [ ! -f "$ENV_TEP" ]; then
  mkdir -p "$ETC_CSBH"
  ( umask 077; cp "$NGUON/csbh.env.mau" "$ENV_TEP" )
  cat <<HET

  Đã tạo tệp cấu hình:  $ENV_TEP

  Điền tệp ấy (mọi dòng ghi THAY_… là bắt buộc), rồi chạy lại:

      sudo nano $ENV_TEP
      sudo ./cai-dat.sh

  Đọc tai-lieu/04-TRIEN-KHAI.md nếu chưa chuẩn bị DNS, SMTP và token registry.

HET
  exit 0
fi

buoc_tong 14

# =============================================================================
buoc "Kiểm máy chủ: quyền root, hệ điều hành"
# =============================================================================
. "$OS_RELEASE" 2>/dev/null || loi "Không đọc được $OS_RELEASE."
case "${ID:-}:${VERSION_ID:-}" in
  ubuntu:22.04|ubuntu:24.04|debian:12) echo "  ${PRETTY_NAME:-$ID $VERSION_ID}" ;;
  *) loi "Hệ điều hành ${PRETTY_NAME:-không rõ} chưa được hỗ trợ. Dùng Ubuntu 22.04/24.04 hoặc Debian 12." ;;
esac

# =============================================================================
buoc "Kiểm tệp cấu hình $ENV_TEP"
# =============================================================================
# Mọi lỗi gom lại rồi in MỘT LẦN — người điền sửa hết trong một lượt, không phải chạy
# lại mười lần để thấy mười lỗi.
kiem_env() {
  local sai=() k v ws
  for k in CSBH_WORKSPACE COMPOSE_PROJECT_NAME CSBH_IMAGE REGISTRY_USER REGISTRY_TOKEN SITE_ADDRESS \
           ACME_EMAIL MAIL_HOST MAIL_PORT MAIL_FROM MAIL_ALLOWLIST; do
    v="$(doc_env "$k")"
    if [ -z "$v" ]; then sai+=("$k: còn trống")
    elif [[ "$v" == THAY_* ]] || [[ "$v" == __*__ ]]; then sai+=("$k: còn giá trị mẫu ($v)"); fi
  done
  ws="$(doc_env CSBH_WORKSPACE)"
  case "$ws" in
    /|"") ;;
    /opt/csbh|/opt/csbh/*) sai+=("CSBH_WORKSPACE: không được nằm trong thư mục chương trình /opt/csbh") ;;
    /*) ;;
    *) sai+=("CSBH_WORKSPACE: phải là đường tuyệt đối (bắt đầu bằng /)") ;;
  esac
  [ "$ws" != "/" ] || sai+=("CSBH_WORKSPACE: không được là /")
  [ "$(doc_env COMPOSE_PROJECT_NAME)" != csbh ] || sai+=("COMPOSE_PROJECT_NAME: không được là 'csbh' (tên của chồng demo/bộ kiểm)")
  v="$(doc_env SITE_ADDRESS)"; case "$v" in *://*|*/*) sai+=("SITE_ADDRESS: chỉ ghi tên miền, không kèm https:// hay đường dẫn") ;; esac
  v="$(doc_env MAIL_HOST)"
  if printf '%s' "$v" | grep -qiE '^(mailpit|mailhog|localhost|127\.|::1)'; then sai+=("MAIL_HOST: phải là máy chủ SMTP thật, không phải $v"); fi
  [[ "$(doc_env MAIL_PORT)" =~ ^[0-9]+$ ]] || sai+=("MAIL_PORT: phải là một con số")
  for k in ACME_EMAIL MAIL_FROM; do
    v="$(doc_env "$k")"; [ -z "$v" ] || [[ "$v" == THAY_* ]] || [[ "$v" == *@*.* ]] || sai+=("$k: không giống một địa chỉ thư")
  done
  if [ -n "$(doc_env MAIL_USER)" ] && [ -z "$(doc_env MAIL_PASSWORD)" ]; then sai+=("MAIL_PASSWORD: có MAIL_USER mà thiếu mật khẩu"); fi
  if [ -n "$(doc_env GOOGLE_CLIENT_ID)" ] && [ -z "$(doc_env GOOGLE_CLIENT_SECRET)" ]; then sai+=("GOOGLE_CLIENT_SECRET: có GOOGLE_CLIENT_ID mà thiếu secret"); fi
  # Tài khoản Quản trị đầu: chỉ BẮT BUỘC khi đây là lần cài đầu (chưa có dữ liệu CSDL).
  if [ ! -d "$ws/data/postgres" ] || [ -z "$(ls -A "$ws/data/postgres" 2>/dev/null)" ]; then
    for k in ADMIN_TEN_DANG_NHAP ADMIN_EMAIL ADMIN_HO_TEN ADMIN_MAT_KHAU; do
      v="$(doc_env "$k")"
      if [ -z "$v" ]; then sai+=("$k: cần cho lần cài đầu (tạo tài khoản Quản trị)")
      elif [[ "$v" == THAY_* ]]; then sai+=("$k: còn giá trị mẫu ($v)"); fi
    done
    v="$(doc_env ADMIN_MAT_KHAU)"
    if [ -n "$v" ] && [[ "$v" != THAY_* ]] && { [ "${#v}" -lt 10 ] || ! [[ "$v" =~ [A-Za-z] ]] || ! [[ "$v" =~ [0-9] ]]; }; then
      sai+=("ADMIN_MAT_KHAU: tối thiểu 10 ký tự, có cả chữ và số")
    fi
  fi
  [ -z "$(doc_env CSBH_TAG)" ] || echo "  Ghi chú: dòng CSBH_TAG không còn dùng (máy chạy thẻ -latest) — xoá được."
  if [ ${#sai[@]} -gt 0 ]; then
    printf '\n  Tệp %s còn %s chỗ phải sửa:\n\n' "$ENV_TEP" "${#sai[@]}" >&2
    printf '    · %s\n' "${sai[@]}" >&2
    printf '\n  Sửa xong chạy lại:  sudo ./cai-dat.sh\n\n' >&2
    return 1
  fi
  echo "  Đủ và đúng dạng."
}
kiem_env

WS="$(doc_env CSBH_WORKSPACE)"
DU_AN="$(doc_env COMPOSE_PROJECT_NAME)"
# LẦN CÀI ĐẦU = chưa có dữ liệu CSDL. Đo MỘT lần ở đây, trước khi bước 4 tạo thư mục rỗng:
# nó quyết định cả lượt kiểm nghiệm (bước 10) lẫn việc bắt buộc khai ADMIN_* (bước 2).
LAN_DAU=1
[ -n "$(ls -A "$WS/data/postgres" 2> /dev/null)" ] && LAN_DAU=0
KHO="$(doc_env CSBH_IMAGE)"
SITE="$(doc_env SITE_ADDRESS)"

# =============================================================================
buoc "Chuẩn bị máy: Docker, múi giờ, đồng bộ giờ, tường lửa, tài khoản $NGUOI_CHAY"
# =============================================================================
if command -v docker > /dev/null 2>&1 && docker compose version > /dev/null 2>&1 && docker buildx version > /dev/null 2>&1; then
  echo "  Docker: đã có ($(docker --version 2>/dev/null | head -1))"
else
  echo "  Docker: chưa có — cài Docker Engine + compose + buildx từ kho chính thức của Docker"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg > /dev/null
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin > /dev/null
  systemctl enable --now docker
fi
# Múi giờ và giờ: lịch sao lưu, SLA 14 ngày và mọi mốc trên màn hình tính theo giờ VN.
timedatectl set-timezone Asia/Ho_Chi_Minh 2> /dev/null || true
timedatectl set-ntp true 2> /dev/null || true
echo "  Múi giờ: Asia/Ho_Chi_Minh, đồng bộ giờ: bật"
# TƯỜNG LỬA — KHÔNG tự bật ufw: bật trên một máy SSH ở cổng khác 22 là tự khoá mình ở
# ngoài. ufw đang chạy thì chỉ MỞ THÊM 80/443; chưa chạy thì nói ra, không đụng.
if command -v ufw > /dev/null 2>&1 && ufw status 2> /dev/null | grep -q '^Status: active'; then
  ufw allow 80/tcp > /dev/null; ufw allow 443/tcp > /dev/null
  echo "  Tường lửa ufw: đang bật — đã mở 80/tcp và 443/tcp"
else
  echo "  Tường lửa ufw: KHÔNG bật — nên chỉ mở 22, 80, 443 (xem tai-lieu/04-TRIEN-KHAI.md §1)"
fi
if ! id "$NGUOI_CHAY" > /dev/null 2>&1; then
  useradd --system --create-home --home-dir "/var/lib/$NGUOI_CHAY" --shell /usr/sbin/nologin "$NGUOI_CHAY"
  echo "  Tài khoản $NGUOI_CHAY: đã tạo"
else
  echo "  Tài khoản $NGUOI_CHAY: đã có"
fi
usermod -aG docker "$NGUOI_CHAY"

# =============================================================================
buoc "Dựng thư mục làm việc $WS"
# =============================================================================
# ĐỔI WORKSPACE SAU KHI ĐÃ CÀI: dừng, hướng dẫn dời. KHÔNG tự dời (dữ liệu sống), và
# KHÔNG dựng một workspace trống thứ hai — một CSDL trống mới trông y như "mất hết".
CU="$(cat "$ETC_CSBH/.workspace-hien-tai" 2>/dev/null || true)"
if [ -n "$CU" ] && [ "$CU" != "$WS" ] && [ -e "$CU/data/postgres" ] && [ ! -f "$WS/.csbh-workspace" ]; then
  loi "CSBH_WORKSPACE đổi từ $CU sang $WS, mà dữ liệu đang ở $CU.
  Bộ cài không tự dời dữ liệu. Muốn dời:
      sudo csbh xuong
      sudo mv $CU $WS
      sudo ./cai-dat.sh
  Muốn giữ chỗ cũ: sửa CSBH_WORKSPACE=$CU trong $ENV_TEP."
fi
mkdir -p "$WS"/{secrets,data/postgres,data/redis,data/rabbitmq,data/minio,data/caddy,data/caddy-config,backup,run,tmp} \
         "$WS"/logs/{cai-dat,kiem-nghiem,cron}
duong_ws() { local v; v="$(doc_env "$1")"; [ -n "$v" ] || v="$2"; case "$v" in /*) echo "$v" ;; *) echo "$WS/$v" ;; esac; }
GUONG="$(duong_ws CSBH_BACKUP_MIRROR backup-mirror)"
LOG_DIR="$(duong_ws CSBH_LOG_DIR logs)"
LOG_ARCHIVE="$(duong_ws CSBH_LOG_ARCHIVE logarchive)"
mkdir -p "$GUONG" "$LOG_DIR" "$LOG_ARCHIVE"
# Chủ sở hữu: workspace và phần `csbh` ghi là của tài khoản chạy; `data/` và `backup/`
# KHÔNG `chown -R` — Postgres/Redis/RabbitMQ đã tự chuyển chủ thư mục dữ liệu của chúng
# (đo 08/11), đổi lại là chúng không khởi động được nữa.
chown "$NGUOI_CHAY:$NGUOI_CHAY" "$WS"
chown -R "$NGUOI_CHAY:$NGUOI_CHAY" "$WS/secrets" "$WS/run" "$WS/tmp" "$WS/logs" "$GUONG" "$LOG_DIR" "$LOG_ARCHIVE"
chmod 750 "$WS"; chmod 700 "$WS/secrets"
[ -f "$WS/.csbh-workspace" ] || echo "id=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s) tao=$(date -Is)" > "$WS/.csbh-workspace"
echo "$WS" > "$ETC_CSBH/.workspace-hien-tai"
# Tệp cấu hình: root ghi, tài khoản csbh (cron, tác tử) đọc, không ai khác.
chown "root:$NGUOI_CHAY" "$ENV_TEP"; chmod 640 "$ENV_TEP"
case "$GUONG" in "$WS"/*) echo "  CHÚ Ý: bản sao lưu ra ngoài ($GUONG) nằm CÙNG ổ với dữ liệu — hỏng ổ là mất cả hai. Nên trỏ CSBH_BACKUP_MIRROR sang ổ khác." ;; esac
# Toàn bộ đầu ra từ đây ghi kèm vào tệp nhật ký của lượt cài.
TEP_NHAT_KY="$WS/logs/cai-dat/$(date +%Y%m%d-%H%M%S).log"
# Hai luồng riêng: câu báo lỗi vẫn ra STDERR (công cụ gọi bộ cài phân biệt được), cả
# hai cùng chép vào tệp nhật ký.
exec > >(tee -a "$TEP_NHAT_KY") 2> >(tee -a "$TEP_NHAT_KY" >&2)
echo "  Nhật ký lượt cài: $TEP_NHAT_KY"

# =============================================================================
buoc "Kiểm DNS: $SITE trỏ về máy này"
# =============================================================================
# Caddy xin chứng chỉ ngay lúc dựng, và Let's Encrypt khoá theo tuần nếu hỏng nhiều
# lần — nên kiểm TRƯỚC. So bằng địa chỉ của chính máy (`hostname -I`), không hỏi một
# dịch vụ bên ngoài.
if [ "$BO_KIEM_DNS" = 1 ]; then
  buoc_bo "--bo-kiem-dns"
else
  ip_ten="$(getent ahostsv4 "$SITE" 2> /dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
  ip_may=" $(hostname -I 2> /dev/null) "
  khop=0
  for ip in $ip_ten; do case "$ip_may" in *" $ip "*) khop=1 ;; esac; done
  [ -n "$ip_ten" ] || loi "Tên miền $SITE chưa phân giải ra IP nào. Trỏ bản ghi A về máy này rồi chạy lại (DNS có thể mất vài phút)."
  [ "$khop" = 1 ] || loi "$SITE trỏ về ${ip_ten}nhưng máy này mang:${ip_may}
  Sửa bản ghi DNS rồi chạy lại. Đứng sau proxy (Cloudflare cam) hoặc NAT 1:1 thì: sudo ./cai-dat.sh --bo-kiem-dns"
  echo "  $SITE → $ip_ten— khớp."
fi

# =============================================================================
buoc "Đăng nhập registry"
# =============================================================================
# Token qua STDIN, không qua dòng lệnh (dòng lệnh hiện ở `ps` của mọi người dùng).
may_kho="$(printf '%s' "$KHO" | cut -d/ -f1)"
case "$may_kho" in *.*|*:*|localhost) ;; *) may_kho="" ;; esac
# shellcheck disable=SC2086
printf '%s' "$(doc_env REGISTRY_TOKEN)" | docker login -u "$(doc_env REGISTRY_USER)" --password-stdin $may_kho > /dev/null \
  || loi "Đăng nhập registry hỏng. Kiểm REGISTRY_USER / REGISTRY_TOKEN trong $ENV_TEP."
echo "  Đã đăng nhập ${may_kho:-Docker Hub} bằng ${REGISTRY_USER:-$(doc_env REGISTRY_USER)}"

# =============================================================================
buoc "Kéo ảnh phần mềm (chỉ khi máy chưa có)"
# =============================================================================
# Chỉ lần cài đầu (và `csbh cap-nhat`) được kéo ảnh — chạy lại bộ cài KHÔNG đổi bản (`0270`).
thieu=""
for tp in service web ops minio; do
  docker image inspect "$KHO:$tp-latest" > /dev/null 2>&1 || thieu="$thieu $tp"
done
if [ -z "$thieu" ]; then
  buoc_bo "đã có đủ ảnh — lên bản mới bằng: sudo csbh cap-nhat"
else
  for tp in $thieu; do
    echo "  kéo $KHO:$tp-latest"
    docker pull "$KHO:$tp-latest" > /dev/null || loi "Không kéo được $KHO:$tp-latest."
  done
fi
SO="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.version"}}' "$KHO:ops-latest" 2> /dev/null || true)"
[ -n "$SO" ] || loi "Ảnh $KHO:ops-latest không mang nhãn phiên bản — bên đóng gói cần dựng lại (make dong-goi) và đẩy lại."
echo "  Phiên bản: $SO"

# =============================================================================
buoc "Cài chương trình bản $SO vào $GOC_CT"
# =============================================================================
# Chương trình (csbh · compose · tài liệu) lấy TỪ ẢNH ops, không từ gói vừa giải nén:
# ảnh `-latest` có thể mới hơn gói, và compose phải đi cùng đúng ảnh của nó.
mkdir -p "$GOC_CT/releases"
if [ -L "$GOC_CT/current" ] && [ "$(basename "$(readlink "$GOC_CT/current")")" = "$SO" ] && [ -x "$GOC_CT/releases/$SO/csbh" ]; then
  buoc_bo "bản $SO đã cài"
else
  rm -rf "$GOC_CT/releases/$SO.partial"; mkdir -p "$GOC_CT/releases/$SO.partial"
  docker run --rm -e CSBH_IMAGE="$KHO" -v "$GOC_CT/releases/$SO.partial:/ra" "$KHO:ops-latest" ban-cai /ra > /dev/null \
    || loi "Không bung được chương trình từ ảnh $KHO:ops-latest."
  rm -rf "$GOC_CT/releases/$SO"; mv "$GOC_CT/releases/$SO.partial" "$GOC_CT/releases/$SO"
  ln -sfn "releases/$SO" "$GOC_CT/current.tam"; mv -T "$GOC_CT/current.tam" "$GOC_CT/current"
  chown -R root:root "$GOC_CT" 2> /dev/null || true
  chmod -R go-w "$GOC_CT"
  echo "  $GOC_CT/current → releases/$SO"
fi
ln -sfn "$GOC_CT/current/csbh" "$BIN/csbh"
cp "$GOC_CT/current/cai-dat.sh" "$GOC_CT/cai-dat.sh" 2> /dev/null || true
CSBH="$GOC_CT/current/csbh"
# `csbh` đọc cấu hình từ $ENV_TEP — chỉ ca kiểm mới đặt CSBH_ENV khác mặc định.
export CSBH_ENV="$ENV_TEP"
# Chạy `csbh` bằng tài khoản csbh khi đang là root: tệp nó tạo trong workspace thuộc
# đúng chủ. (Bộ kiểm chạy không root: gọi thẳng.)
csbh_() {
  if [ "$(id -u)" = 0 ] && [ "${CSBH_BO_KIEM_ROOT:-0}" != 1 ]; then
    runuser -u "$NGUOI_CHAY" -- env CSBH_ENV="$ENV_TEP" "$CSBH" "$@"
  else
    "$CSBH" "$@"
  fi
}

# =============================================================================
buoc "Bí mật: sinh mật khẩu nội bộ, ghi bí mật từ tệp cấu hình"
# =============================================================================
# BÍ MẬT MỚI + DỮ LIỆU CŨ = HỎNG CHẮC CHẮN (`0113`). Postgres đặt mật khẩu CHỈ ở lần
# khởi tạo đầu, nên sinh mật khẩu mới trên một CSDL cũ là migrate chết ngay sau đó.
if [ ! -f "$WS/secrets/pg_password.txt" ]; then
  if [ -n "$(ls -A "$WS/data/postgres" 2> /dev/null)" ] || docker volume inspect "${DU_AN}_pgdata" > /dev/null 2>&1; then
    loi "DỪNG: đã có dữ liệu CSDL ($WS/data/postgres hoặc volume ${DU_AN}_pgdata) mà chưa có bộ bí mật.
  Mật khẩu sinh mới sẽ không mở được CSDL ấy. CSDL có dữ liệu: tìm lại thư mục secrets/
  của lượt cài trước và chép vào $WS/secrets/. Không có gì đáng giữ: xoá $WS/data/postgres
  (và volume ${DU_AN}_pgdata nếu có) rồi chạy lại."
  fi
  docker run --rm --user "$(id -u "$NGUOI_CHAY"):$(id -g "$NGUOI_CHAY")" -v "$WS/secrets:/run/secrets" \
    "$KHO:ops-latest" gen-secrets /run/secrets > /dev/null
  echo "  Đã sinh mật khẩu Postgres · MinIO · RabbitMQ · role · khoá JWT"
else
  echo "  Bộ bí mật đã có — giữ nguyên"
fi
# Hai bí mật người dùng khai (mật khẩu SMTP, secret Google) → secrets/ — `csbh len`
# làm việc này ở bước đầu của nó.

# =============================================================================
buoc "Kiểm nghiệm đủ chức năng trên chồng kiểm riêng (dữ liệu giả, dọn sạch sau)"
# =============================================================================
# Yêu cầu 08/11: hệ production khi dựng lên phải qua một lượt kiểm thử đủ chức năng với
# dữ liệu giả, rồi dọn sạch dù xanh hay đỏ. Chạy trên CHỒNG KIỂM RIÊNG (`csbh kiem-nghiem`,
# dự án `csbh-kiem`) TRƯỚC khi chồng thật được dựng — nên chồng thật chưa bao giờ chứa một
# dòng dữ liệu giả, và "trạng thái như lần khởi chạy đầu" được bảo đảm bằng cấu trúc.
# Đỏ thì DỪNG: không dựng chồng thật, không tạo Quản trị.
if [ "$LAN_DAU" = 1 ]; then
  csbh_ kiem-nghiem 2>&1 | sed 's/^/    /'
else
  buoc_bo "không phải lần cài đầu — chạy tay khi cần: csbh kiem-nghiem"
fi

# =============================================================================
buoc "Dựng hệ thống (migration + các service)"
# =============================================================================
csbh_ len 2>&1 | sed 's/^/    /'

# =============================================================================
buoc "Tài khoản Quản trị đầu tiên"
# =============================================================================
so="$(csbh_ so-tai-khoan 2> /dev/null | tr -cd '0-9')"
[ -n "$so" ] || loi "Không hỏi được CSDL số tài khoản — xem: csbh trang-thai, csbh log identity"
if [ "$so" != 0 ]; then
  buoc_bo "CSDL đã có $so tài khoản"
else
  csbh_ tao-quan-tri-dau 2>&1 | sed 's/^/    /'
  # Mật khẩu đã dùng xong và đằng nào cũng bị buộc đổi ở lần đăng nhập đầu: xoá trắng
  # khỏi tệp cấu hình, đừng để nó nằm đó.
  sed -i 's|^ADMIN_MAT_KHAU=.*|ADMIN_MAT_KHAU=|' "$ENV_TEP"
  echo "  Đã tạo '$(doc_env ADMIN_TEN_DANG_NHAP)' và xoá ADMIN_MAT_KHAU khỏi $ENV_TEP"
fi

# =============================================================================
buoc "Lịch tự động (cron) và tác tử vận hành (systemd)"
# =============================================================================
sed -e "s|__CSBH__|$BIN/csbh|g" -e "s|__LOG__|$WS/logs/cron|g" "$GOC_CT/current/deploy/cron/csbh.cron" > "$ETC_CRON/csbh.tam"
chmod 644 "$ETC_CRON/csbh.tam"; mv "$ETC_CRON/csbh.tam" "$ETC_CRON/csbh"
echo "  $ETC_CRON/csbh: sao lưu CSDL + kho tệp theo lịch (hỏi mỗi 15 phút), diễn tập ngày 8"
sed -e "s|__CSBH__|$GOC_CT/current/csbh|g" -e "s|__WS__|$WS|g" -e "s|^User=.*|User=$NGUOI_CHAY|" \
  "$GOC_CT/current/deploy/systemd/csbh-tac-tu.service" > "$ETC_SYSTEMD/csbh-tac-tu.service"
systemctl daemon-reload
systemctl enable csbh-tac-tu > /dev/null 2>&1
systemctl restart csbh-tac-tu
echo "  csbh-tac-tu: đã bật và khởi động lại"

# =============================================================================
buoc "Kiểm khói: HTTPS và máy chủ thư (không ghi dữ liệu)"
# =============================================================================
url="$(doc_env SITE_URL)"; url="${url:-https://$SITE}"
ok=0
for _ in $(seq 1 "${CSBH_KIEM_KHOI_LAN:-30}"); do
  if curl -fsS --max-time 10 "$url/api/readyz" > /dev/null 2>&1; then ok=1; break; fi
  sleep 4
done
[ "$ok" = 1 ] || loi "$url/api/readyz chưa trả lời sau 2 phút. Xem: csbh trang-thai · csbh log caddy (chứng chỉ HTTPS?)"
echo "  $url/api/readyz: trả lời"
mh="$(doc_env MAIL_HOST)"; mp="$(doc_env MAIL_PORT)"
if timeout 8 bash -c "exec 3<>/dev/tcp/$mh/$mp" 2> /dev/null; then
  echo "  Máy chủ thư $mh:$mp: mở kết nối được"
else
  echo "  CẢNH BÁO: không mở được kết nối tới $mh:$mp — thư mời sẽ không đi. Kiểm tường lửa ra ngoài của VPS." >&2
fi
buoc_xong

cat <<HET

  ============================================================
  XONG — Chính sách bán hàng bản $SO đang chạy ở:  $url
  ============================================================

  Việc còn lại:
    1. Đăng nhập bằng '$(doc_env ADMIN_TEN_DANG_NHAP)' và ĐỔI MẬT KHẨU (bắt buộc ở lần đầu).
    2. Tạo một tài khoản thật cho chính bạn, kiểm thư mời tới hộp thư.

  Vận hành:   csbh help        Cập nhật:  sudo csbh cap-nhat
  Cấu hình:   $ENV_TEP   (sửa xong: sudo ./cai-dat.sh)
  Dữ liệu:    $WS
  Nhật ký:    $TEP_NHAT_KY

HET
