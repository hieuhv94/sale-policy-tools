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

# hoi <câu hỏi> <mặc định> — LỜI NHẮC RA `stderr`, câu trả lời ra `stdout`.
#
# `>&2` ở hai dòng printf đầu là bắt buộc, không phải cẩn thận thừa (`0112`).
#
# Hàm này luôn được gọi trong `$( )`, mà command substitution BẮT TOÀN BỘ stdout.
# In lời nhắc ra stdout thì hỏng hai lần cùng lúc:
#
#   * màn hình không hiện câu hỏi nào — script trông như treo, trong khi nó đang
#     đứng ở `read` chờ người gõ;
#   * và lời nhắc trở thành MỘT PHẦN của câu trả lời. Bấm Enter lấy mặc định thì
#     `.env` nhận nguyên chuỗi
#     `  Tên miền (DNS đã trỏ về máy này) [csbh.nutricare.vn]: csbh.nutricare.vn`.
#
# Cái thứ hai không lộ ra ngay: nó chỉ hiện thành một lỗi của Caddy hoặc của
# compose ở vài bước sau, và không dòng nào nhắc tới hàm này.
hoi() {
  if [ -n "${2:-}" ]; then printf '%s [%s]: ' "$1" "$2" >&2; else printf '%s: ' "$1" >&2; fi
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

# BÍ MẬT MỚI + VOLUME CŨ = HỎNG CHẮC CHẮN (`0113`).
#
# Postgres đặt mật khẩu superuser CHỈ ở lần khởi tạo thư mục dữ liệu đầu tiên.
# Nên nếu `secrets/` chưa có (bộ cài vừa giải nén, hoặc ai đó xoá đi) mà volume
# dữ liệu thì ĐÃ CÓ từ một lượt cài trước, mật khẩu sắp sinh ra ở đây chắc chắn
# không khớp cái mà CSDL đang giữ — và lượt `len` ngay sau sẽ chết ở migrate.
#
# Đã xảy ra ba lần (`0106`, `0111`, và lượt cài này). Ba lần ấy đều báo lỗi ở ba
# chỗ khác nhau, không chỗ nào ở đây — chỗ DUY NHẤT còn ngăn được.
if [ ! -f secrets/pg_password.txt ]; then
  du_an=$(grep -hE '^COMPOSE_PROJECT_NAME=' .env .env.mau 2>/dev/null | head -1 | cut -d= -f2-)
  if [ -n "$du_an" ] && docker volume inspect "${du_an}_pgdata" >/dev/null 2>&1; then
    cat >&2 <<HET

  DỪNG: đã có dữ liệu CSDL cũ, mà bộ bí mật thì chưa có.

  Volume "${du_an}_pgdata" tồn tại từ một lượt cài trước. Postgres đặt mật khẩu
  CHỈ ở lần khởi tạo đầu tiên, nên mật khẩu sắp sinh ra sẽ không khớp cái CSDL ấy
  đang giữ, và bước migrate sẽ hỏng.

  CSDL cũ KHÔNG có gì đáng giữ — xoá nó rồi cài lại:
      docker compose --env-file .env.mau -f deploy/compose.yml -f deploy/compose.prod.yml down -v
      ./cai-dat.sh

  CSDL cũ CÓ dữ liệu — đừng xoá. Tìm lại bộ "secrets/" của lượt cài ấy và chép
  về đây; không còn thì xem tai-lieu/05-VAN-HANH.md, mục
  "password authentication failed".

HET
    exit 1
  fi
fi

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
