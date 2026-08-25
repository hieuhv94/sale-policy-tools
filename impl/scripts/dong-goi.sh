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
# BA ẢNH, MỘT REPO (`0106`). Docker Hub chỉ có hai cấp `<tài khoản>/<repo>`, nên
# `hieuhv94/nutricare-csbh/csbh-service` là một tên bị từ chối. Ba ảnh phân biệt
# bằng THẺ, dạng `<thành phần>-<phiên bản>-<git sha>`:
#
#   hieuhv94/nutricare-csbh:service-1.0.0-a1b2c3d
#   hieuhv94/nutricare-csbh:web-1.0.0-a1b2c3d
#   hieuhv94/nutricare-csbh:ops-1.0.0-a1b2c3d
#
# Thành phần đứng TRƯỚC phiên bản để `docker images` xếp ba ảnh của cùng một thành
# phần cạnh nhau qua các bản. Và một repo riêng tư là đủ cho cả ba, thay vì ba.
#
# Phần phiên bản không bao giờ là `latest`. Xem chú thích đầu `compose.prod.yml`.
set -eu

cd "$(dirname "$0")/.."

VERSION="$(cat VERSION)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"
TAG="${CSBH_TAG:-${VERSION}-${SHA}}"
IMG="${CSBH_IMAGE:-hieuhv94/nutricare-csbh}"
RA="${CSBH_OUT:-../workspace/dong-goi}"

anh() {
  echo "==> dựng ${IMG}:service-${TAG}"
  docker build -f docker/Dockerfile -t "${IMG}:service-${TAG}" .

  echo "==> dựng ${IMG}:web-${TAG}"
  docker build -f docker/Dockerfile.web \
    --build-arg "APP_VERSION=${TAG}" \
    -t "${IMG}:web-${TAG}" .

  # SAU ảnh service, và dựng TỪ nó. Thứ tự này là bắt buộc, không phải sở thích.
  echo "==> dựng ${IMG}:ops-${TAG}"
  docker build -f docker/Dockerfile.ops \
    --build-arg "BASE=${IMG}:service-${TAG}" \
    -t "${IMG}:ops-${TAG}" .

  echo ""
  # Mọi mẫu phải đi qua `-e`. Trộn một mẫu trần với `-e` thì grep coi mẫu trần là
  # TÊN TỆP, và báo "No such file or directory" — một câu không nhắc gì tới grep.
  docker images --format '  {{.Repository}}:{{.Tag}}  {{.Size}}' \
    | grep -F -e ":service-${TAG}" -e ":web-${TAG}" -e ":ops-${TAG}" || true
}

# ĐẨY LÀ VIỆC CỦA NGƯỜI CÓ QUYỀN PUSH, không phải của lượt dựng.
#
# Tách khỏi `anh` và không nằm trong `tat-ca`, có chủ ý: `make anh` dựng xong thì
# in ra ba thẻ, còn ai đẩy và đẩy lúc nào là quyết định riêng.
day() {
  for tp in service web ops; do
    echo "==> đẩy ${IMG}:${tp}-${TAG}"
    docker push "${IMG}:${tp}-${TAG}"
  done
}

goi() {
  goc="${RA}/csbh-${TAG}"
  rm -rf "$goc"
  mkdir -p "$goc/deploy/postgres" "$goc/deploy/caddy" "$goc/tai-lieu"

  # --- Thứ máy chủ CẦN để chạy ----------------------------------------------
  cp deploy/compose.yml deploy/compose.prod.yml deploy/compose.tunnel.yml "$goc/deploy/"
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
  sed -e "s|__TAG__|${TAG}|" -e "s|__IMAGE__|${IMG}|" deploy/env.mau > "$goc/.env.mau"

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
