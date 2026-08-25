#!/bin/sh
# Cài đặt LẦN ĐẦU trên máy chủ khách hàng (`0105`).
#
# Hỏi từng thứ phải khai, sinh bí mật tại chỗ, rồi dựng. Không thay tài liệu
# triển khai — nó chỉ thay phần gõ tay, và nó DỪNG ở mọi chỗ cần một quyết định
# của con người thay vì đoán hộ.
#
# Chạy lại được: những gì đã có thì giữ nguyên.
set -eu

cd "$(dirname "$0")"

hoi() { # hoi <câu hỏi> <mặc định>
  if [ -n "${2:-}" ]; then printf '%s [%s]: ' "$1" "$2"; else printf '%s: ' "$1"; fi
  read -r tl
  [ -n "$tl" ] || tl="${2:-}"
  printf '%s' "$tl"
}

echo ""
echo "  Cài đặt Chính sách bán hàng"
echo "  Đọc tai-lieu/04-TRIEN-KHAI.md trước nếu chưa chuẩn bị DNS và SMTP."
echo ""

# --- 1. Kiểm điều kiện -------------------------------------------------------
command -v docker >/dev/null || { echo "Chưa có docker." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Chưa có docker compose v2." >&2; exit 1; }

# --- 2. Bí mật ---------------------------------------------------------------
#
# Sinh TẠI CHỖ, trên chính máy chủ này. Bí mật đi kèm bộ cài là bí mật mà mọi
# bản cài dùng chung, và nó đã đi qua ít nhất một lần chép tệp.
mkdir -p secrets
if [ -f secrets/jwt-private.pem ]; then
  echo "==> secrets/ đã có, giữ nguyên"
else
  echo "==> sinh bí mật"
  # `--user` là BẮT BUỘC, không phải cẩn thận thừa.
  #
  # Không có nó thì container ghi bí mật với chủ sở hữu `root` và quyền 600, và
  # bước ngay dưới — đọc `pg_password.txt` để điền vào `.env` — hỏng với
  # "Permission denied". Đã dính đúng lỗi này lúc chạy thử bản đóng gói đầu tiên.
  docker run --rm --user "$(id -u):$(id -g)" -v "$(pwd)/secrets:/run/secrets" \
    "$(grep -E '^CSBH_IMAGE=' .env.mau | cut -d= -f2-):ops-$(grep -E '^CSBH_TAG=' .env.mau | cut -d= -f2-)" \
    gen-secrets /run/secrets
fi

# --- 3. Bản khai môi trường --------------------------------------------------
if [ -f .env ]; then
  echo "==> .env đã có, giữ nguyên. Sửa tay nếu cần rồi chạy ./csbh len"
else
  cp .env.mau .env
  chmod 600 .env

  echo ""
  echo "  Bốn thứ phải khai. Bỏ trống là lấy giá trị trong ngoặc."
  echo ""
  ten=$(hoi "  Tên miền (DNS đã trỏ về máy này)" "csbh.nutricare.vn")
  acme=$(hoi "  Thư nhận cảnh báo hết hạn chứng chỉ" "it@nutricare.vn")
  smtp=$(hoi "  Máy chủ SMTP" "smtp.nutricare.vn")
  tu=$(hoi   "  Địa chỉ gửi thư (From)" "csbh-noreply@nutricare.vn")
  echo ""
  echo "  Tên miền được phép NHẬN thư. Nhiều miền thì ngăn bằng dấu phẩy;"
  echo "  miền con tự động được chấp nhận."
  cho=$(hoi  "  Tên miền nhận thư" "nutricare.vn")
  echo ""
  smtpu=$(hoi "  Tài khoản SMTP (bỏ trống nếu relay không đòi xác thực)" "")

  sed -i \
    -e "s|^SITE_ADDRESS=.*|SITE_ADDRESS=${ten}|" \
    -e "s|^SITE_URL=.*|SITE_URL=https://${ten}|" \
    -e "s|^ACME_EMAIL=.*|ACME_EMAIL=${acme}|" \
    -e "s|^MAIL_HOST=.*|MAIL_HOST=${smtp}|" \
    -e "s|^MAIL_FROM=.*|MAIL_FROM=${tu}|" \
    -e "s|^MAIL_ALLOWLIST=.*|MAIL_ALLOWLIST=${cho}|" \
    -e "s|^MAIL_USER=.*|MAIL_USER=${smtpu}|" \
    .env

  if [ -n "$smtpu" ]; then
    echo ""
    stty -echo 2>/dev/null || true
    printf '  Mật khẩu SMTP: '; read -r smtpp; echo ""
    stty echo 2>/dev/null || true
    printf '%s' "$smtpp" > secrets/mail_password.txt
    chmod 600 secrets/mail_password.txt
  else
    # Không xác thực: để trống đường dẫn file, nếu không compose truyền một
    # đường dẫn không tồn tại và service dừng ở bước đọc bí mật.
    sed -i "s|^MAIL_PASSWORD_FILE=.*|MAIL_PASSWORD_FILE=|" .env
  fi
fi

# --- 4. Dựng -----------------------------------------------------------------
echo ""
echo "==> kéo ảnh và dựng hệ thống"
./csbh len

# --- 5. Tài khoản đầu tiên ---------------------------------------------------
echo ""
echo "  Còn một bước: tạo tài khoản Quản trị đầu tiên."
echo "  Chạy:  ./csbh mo-tai-khoan"
echo ""
echo "  Rồi đọc tai-lieu/05-VAN-HANH.md để đặt lịch sao lưu."
echo ""
