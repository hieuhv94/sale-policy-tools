#!/bin/sh
# Dựng ảnh, đẩy lên registry, và gói một tệp nén để chép lên máy chủ khách (`0105`).
#
# Ba việc, tách bằng tham số, vì chúng có nhịp khác nhau: `anh` chạy mỗi lần sửa
# mã, `day` chỉ khi ảnh đã chạy đúng, `goi` khi giao bản cho khách.
#
# BA ẢNH, không phải mười hai:
#
#   csbh-service  mười service Node. MỘT ảnh cho cả mười — `CMD` của Dockerfile
#                 đọc `${SERVICE}` lúc chạy, nên compose chọn service bằng biến
#                 môi trường chứ không bằng ảnh riêng. Đo được ở `0104`:
#                 `csbh-audit` và `csbh-policy` trùng HOÀN TOÀN từng lớp.
#   csbh-web      giao diện đã dựng + Caddy + Caddyfile, nướng sẵn.
#   csbh-ops      migration, sao lưu, phục hồi, mồi tài khoản. Dựng TỪ
#                 `csbh-service` nên nó dùng lại toàn bộ lớp của ảnh kia.
#
# THẺ luôn là `<phiên bản>-<git sha>`, không bao giờ `latest`. Xem chú thích đầu
# `deploy/compose.prod.yml`.
set -eu

cd "$(dirname "$0")/.."

VERSION="$(cat VERSION)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"
TAG="${CSBH_TAG:-${VERSION}-${SHA}}"
REG="${CSBH_REGISTRY:-csbh}"
RA="${CSBH_OUT:-../workspace/dong-goi}"

anh() {
  echo "==> dựng csbh-service:${TAG}"
  docker build -f docker/Dockerfile -t "${REG}/csbh-service:${TAG}" .

  echo "==> dựng csbh-web:${TAG}"
  docker build -f docker/Dockerfile.web \
    --build-arg "APP_VERSION=${TAG}" \
    -t "${REG}/csbh-web:${TAG}" .

  # SAU csbh-service, và dựng TỪ nó. Thứ tự này là bắt buộc, không phải sở thích.
  echo "==> dựng csbh-ops:${TAG}"
  docker build -f docker/Dockerfile.ops \
    --build-arg "BASE=${REG}/csbh-service:${TAG}" \
    -t "${REG}/csbh-ops:${TAG}" .

  echo ""
  docker images --format '  {{.Repository}}:{{.Tag}}  {{.Size}}' \
    | grep -F "${TAG}" || true
}

day() {
  for a in csbh-service csbh-web csbh-ops; do
    echo "==> đẩy ${REG}/${a}:${TAG}"
    docker push "${REG}/${a}:${TAG}"
  done
}

goi() {
  goc="${RA}/csbh-${TAG}"
  rm -rf "$goc"
  mkdir -p "$goc/deploy/postgres" "$goc/deploy/caddy" "$goc/tai-lieu"

  # --- Thứ máy chủ CẦN để chạy ----------------------------------------------
  cp deploy/compose.yml deploy/compose.prod.yml "$goc/deploy/"
  cp deploy/postgres/postgresql.conf deploy/postgres/pg_hba.conf "$goc/deploy/postgres/"
  # Caddyfile đã nướng trong ảnh; chép thêm một bản để người vận hành ĐỌC ĐƯỢC
  # cấu hình biên mạng mà không phải mở ảnh ra.
  cp deploy/caddy/Caddyfile "$goc/deploy/caddy/Caddyfile.tham-khao"

  # --- Tài liệu -------------------------------------------------------------
  cp docs/04-TRIEN-KHAI.md docs/05-VAN-HANH.md docs/03-HUONG-DAN-SU-DUNG.md "$goc/tai-lieu/"
  cp deploy/RPO-RTO.md "$goc/tai-lieu/"
  # Trong kho mã, `RPO-RTO.md` nằm ở `deploy/` nên tài liệu trỏ tới `../deploy/`.
  # Trong bản giao, cả bốn tài liệu nằm chung một thư mục. Một liên kết chết
  # trong tài liệu vận hành là chỗ người ta bỏ cuộc đi tìm.
  sed -i 's|\.\./deploy/RPO-RTO\.md|RPO-RTO.md|g' "$goc/tai-lieu/"*.md

  # --- Thứ người vận hành chạy ----------------------------------------------
  cp scripts/csbh "$goc/csbh"
  cp scripts/cai-dat.sh "$goc/cai-dat.sh"
  cp deploy/cron/csbh.cron "$goc/deploy/cron.mau"
  chmod +x "$goc/csbh" "$goc/cai-dat.sh"

  # --- Ba mẫu .docx ---------------------------------------------------------
  #
  # KHÔNG bắt buộc — `ensureDefault` đã nạp sẵn một mẫu hồ sơ và một mẫu hợp đồng
  # lúc `document` khởi động. Ba file này là điểm khởi đầu ĐẸP HƠN để Quản trị
  # tải về sửa câu chữ, nên chúng đi kèm bản giao chứ không nằm trong ảnh nào.
  mkdir -p "$goc/mau-van-ban"
  cp templates/*.docx "$goc/mau-van-ban/"

  # --- Bản khai môi trường --------------------------------------------------
  sed -e "s|__TAG__|${TAG}|" -e "s|__REG__|${REG}|" deploy/env.mau > "$goc/.env.mau"

  cat > "$goc/README.md" <<HET
# Chính sách bán hàng (CSBH) — bản ${TAG}

Bắt đầu ở **tai-lieu/04-TRIEN-KHAI.md**. Nó dẫn từ máy chủ trắng tới màn hình
đăng nhập, và nói rõ những gì phải chuẩn bị TRƯỚC khi đụng tới máy chủ.

| Tệp | Là gì |
|---|---|
| \`cai-dat.sh\` | Cài lần đầu. Hỏi từng thứ cần khai rồi tự dựng. |
| \`csbh\` | Lệnh vận hành hằng ngày: \`./csbh help\` |
| \`.env.mau\` | Bản khai môi trường. Chép thành \`.env\` rồi điền. |
| \`deploy/\` | Hai tệp compose và cấu hình Postgres. Không sửa. |
| \`deploy/cron.mau\` | Lịch sao lưu và dọn dữ liệu. |
| \`mau-van-ban/\` | Ba mẫu .docx để Quản trị tải lên nếu muốn. |
| \`tai-lieu/\` | Triển khai · Vận hành · Hướng dẫn sử dụng · Cam kết phục hồi. |

Bản này KHÔNG chứa ảnh Docker — máy chủ kéo chúng về từ registry. Cần đăng nhập
registry trước khi cài; xem tài liệu triển khai.
HET

  mkdir -p "$RA"
  tep="${RA}/csbh-${TAG}.tar.gz"
  tar -czf "$tep" -C "$RA" "csbh-${TAG}"
  rm -rf "$goc"

  echo ""
  echo "  Gói xong: $(cd "$(dirname "$tep")" && pwd)/$(basename "$tep")"
  echo "  Kích thước: $(du -h "$tep" | cut -f1)"
  echo ""
  echo "  Chép lên máy chủ rồi:  tar -xzf csbh-${TAG}.tar.gz && cd csbh-${TAG} && ./cai-dat.sh"
  echo ""
}

case "${1:-tat-ca}" in
  anh) anh ;;
  day) day ;;
  goi) goi ;;
  tat-ca) anh; goi ;;
  *) echo "dùng: $0 [anh|day|goi|tat-ca]" >&2; exit 2 ;;
esac
