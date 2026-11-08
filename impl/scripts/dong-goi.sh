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
# bằng THẺ, dạng `<thành phần>-<phiên bản>`:
#
#   hieuhv94/nutricare-csbh:service-1.0.0
#   hieuhv94/nutricare-csbh:web-1.0.0
#   hieuhv94/nutricare-csbh:ops-1.0.0
#
# Thành phần đứng TRƯỚC phiên bản để `docker images` xếp ba ảnh của cùng một thành
# phần cạnh nhau qua các bản. Và một repo riêng tư là đủ cho cả ba, thay vì ba.
#
# KHÔNG CÒN `-<git sha>` sau phiên bản (`0118`). Bản trước gắn cả sha vào thẻ để
# hai lượt dựng từ hai commit khác nhau không bao giờ trùng thẻ. Đổi lại, thẻ dài
# và không đọc được: người vận hành phải chép `1.0.0-a1b2c3d` từ email vào `.env`,
# và `./csbh phien-ban` trả về một chuỗi không nói lên bản nào.
#
# Cái giá của việc bỏ nó là THẬT, và nó dồn hết vào một luật: **mỗi lần giao là
# một số phiên bản mới trong `VERSION`**. Dựng lại cùng số mà nội dung đã khác
# thì thẻ cũ trên registry bị ghi đè, và một máy chủ `docker compose pull` sau đó
# nhận nội dung khác mà `./csbh phien-ban` vẫn in ra đúng con số cũ — không có
# cách nào phát hiện từ máy chủ. Sha trong thẻ trước đây chặn đúng chuyện này.
#
# `latest` — ĐẢO MỘT NỬA ở `0218`, rồi ĐẢO NỐT ở `0270`.
#
# `0218`: `latest` có trên registry như một CON TRỎ, nhưng không bao giờ vào `.env`.
# `0270` (yêu cầu 08/11): máy chủ CHẠY thẻ `-latest`, cập nhật bằng `./csbh cap-nhat`.
# Hai lý do cũ chống `latest` được giữ bằng cơ chế khác — ảnh tự mang số phiên bản
# (`--build-arg APP_VERSION` + nhãn OCI ở `anh`), và chỉ `cap-nhat` kéo ảnh. Thẻ số
# vẫn đẩy TRƯỚC `latest`: nó là đường về một bản cụ thể (chuyển máy kéo đúng thẻ số).
set -eu

cd "$(dirname "$0")/.."

VERSION="$(cat VERSION)"
TAG="${CSBH_TAG:-${VERSION}}"
IMG="${CSBH_IMAGE:-hieuhv94/nutricare-csbh}"
RA="${CSBH_OUT:-../workspace/dong-goi}"

# ẢNH MINIO NHÂN BẢN (`0247`).
#
# MinIO ngừng phát hành ảnh Community từ 23/10/2025 và XOÁ HẲN kho `minio/minio`
# khỏi Docker Hub khoảng 11–14/09/2026, kể cả thẻ ghim của ta (đo 29/09: `pull
# access denied`). Máy đang chạy vẫn giữ ảnh; máy MỚI thì kẹt ở bước dựng hạ tầng
# — cài mới lẫn `nhap-chuyen-may` (`0246`). Nên ta giữ một bản NHÂN BẢN trong kho
# của chính mình: CÙNG ảnh, chép nguyên từng lớp, chỉ đổi tên (`docker tag`) —
# không dựng lại, không đổi phiên bản MinIO, và `mc` mà sao lưu kho tệp cần vẫn ở
# trong nó.
#
# Thẻ MANG số bản MinIO, KHÔNG mang số phiên bản phần mềm: MinIO không đổi theo
# mỗi lần giao, và đẩy lại cùng một ảnh dưới mỗi thẻ phần mềm là lãng phí.
# `MINIO_GOC` là chỗ DUY NHẤT khai bản MinIO; ca kiểm đòi `compose.yml` và
# `compose.prod.yml` khớp nó.
#
# Giấy phép: MinIO là AGPLv3 — phân phối lại bản nhị phân KHÔNG sửa đổi thì kèm
# đường tới mã nguồn đúng bản ấy: https://github.com/minio/minio/tree/RELEASE.2024-09-22T00-33-43Z
MINIO_GOC="minio/minio:RELEASE.2024-09-22T00-33-43Z"
MINIO_BAN="${IMG}:minio-${MINIO_GOC##*:}"

# NHÃN PHIÊN BẢN trên CẢ BA ảnh (`0218`).
#
# Hai trong ba ảnh KHÔNG tự biết mình là bản nào: `service` và `ops` nhận
# `APP_VERSION` từ `.env` lúc chạy, chỉ `web` nướng sẵn con số vào gói. Tới
# `0217` điều đó không sao, vì thẻ kéo về luôn là một con số. Từ khi registry có
# `latest`, một ảnh kéo về bằng `latest` phải TỰ nói được mình là bản nào — nếu
# không thì `./csbh upgrade` chỉ còn cách ghi `latest` vào `.env`, và mười
# service sẽ tự báo phiên bản là `latest`.
#
# Nhãn OCI chuẩn chứ không một biến `ENV`: đọc nó bằng `docker image inspect` là
# đủ, không phải chạy container nào, và nó không lọt vào môi trường của tiến trình.
NHAN="org.opencontainers.image.version=${TAG}"

anh() {
  echo "==> dựng ${IMG}:service-${TAG}"
  # `APP_VERSION` NƯỚNG VÀO ẢNH (`0270`) — máy chủ chạy `-latest`, compose không còn
  # đặt biến ấy; thiếu dòng này thì mười một service tự báo `0.0.0-dev`.
  docker build -f docker/Dockerfile --label "$NHAN" --build-arg "APP_VERSION=${TAG}" \
    -t "${IMG}:service-${TAG}" .

  echo "==> dựng ${IMG}:web-${TAG}"
  docker build -f docker/Dockerfile.web --label "$NHAN" \
    --build-arg "APP_VERSION=${TAG}" \
    -t "${IMG}:web-${TAG}" .

  # SAU ảnh service, và dựng TỪ nó. Thứ tự này là bắt buộc, không phải sở thích.
  echo "==> dựng ${IMG}:ops-${TAG}"
  docker build -f docker/Dockerfile.ops --label "$NHAN" \
    --build-arg "BASE=${IMG}:service-${TAG}" \
    -t "${IMG}:ops-${TAG}" .

  # Nhân bản MinIO (`0247`): gắn thẻ từ ảnh GỐC trên máy. Máy không còn ảnh gốc mà
  # đã có bản nhân bản (kéo từ kho ta về) thì thôi — không có gì để làm.
  if docker image inspect "$MINIO_GOC" > /dev/null 2>&1; then
    echo "==> gắn thẻ nhân bản ${MINIO_BAN}  (từ ${MINIO_GOC})"
    docker tag "$MINIO_GOC" "$MINIO_BAN"
  elif ! docker image inspect "$MINIO_BAN" > /dev/null 2>&1; then
    echo "THIẾU ảnh MinIO: không có ${MINIO_GOC}, cũng không có ${MINIO_BAN}." >&2
    echo "Kéo bản nhân bản về: docker pull ${MINIO_BAN}" >&2
    exit 1
  fi

  echo ""
  # Mọi mẫu phải đi qua `-e`. Trộn một mẫu trần với `-e` thì grep coi mẫu trần là
  # TÊN TỆP, và báo "No such file or directory" — một câu không nhắc gì tới grep.
  docker images --format '  {{.Repository}}:{{.Tag}}  {{.Size}}' \
    | grep -F -e ":service-${TAG}" -e ":web-${TAG}" -e ":ops-${TAG}" -e ":minio-" || true
}

# ĐẨY LÀ VIỆC CỦA NGƯỜI CÓ QUYỀN PUSH, không phải của lượt dựng.
#
# Tách khỏi `anh` và không nằm trong `tat-ca`, có chủ ý: `make anh` dựng xong thì
# in ra ba thẻ, còn ai đẩy và đẩy lúc nào là quyết định riêng.
#
# ĐẨY CẢ HAI THẺ: số phiên bản, rồi `latest` (`0218`). Thẻ số đẩy TRƯỚC, có chủ ý:
# lượt đẩy hỏng giữa chừng thì registry có một bản số mà `latest` chưa trỏ tới —
# vô hại. Ngược lại thì `latest` trỏ tới một bản mà thẻ số của nó không tồn tại,
# và `./csbh upgrade` sẽ ghim một con số không kéo lại được.
# Đẩy RIÊNG ảnh MinIO nhân bản (`0247`). Tách khỏi `day` để đẩy được nó mà không
# đẩy ảnh phần mềm nào — nó không theo số phiên bản, đẩy lại là không đổi gì.
day_minio() {
  docker image inspect "$MINIO_BAN" > /dev/null 2>&1 || {
    echo "Chưa có ${MINIO_BAN} trên máy — chạy: sh scripts/dong-goi.sh anh" >&2; exit 1; }
  echo "==> đẩy ${MINIO_BAN}"
  docker push "$MINIO_BAN"
  # `minio-latest` (`0270`): máy chủ chạy thẻ `-latest` cho MỌI ảnh của kho ta.
  echo "==> đẩy ${IMG}:minio-latest  (trỏ tới ${MINIO_BAN##*:})"
  docker tag "$MINIO_BAN" "${IMG}:minio-latest"
  docker push "${IMG}:minio-latest"
}

day() {
  # MinIO TRƯỚC: bản cài mới kéo nó ngay ở bước dựng hạ tầng.
  day_minio
  for tp in service web ops; do
    echo "==> đẩy ${IMG}:${tp}-${TAG}"
    docker push "${IMG}:${tp}-${TAG}"
  done
  for tp in service web ops; do
    echo "==> đẩy ${IMG}:${tp}-latest  (trỏ tới ${TAG})"
    docker tag "${IMG}:${tp}-${TAG}" "${IMG}:${tp}-latest"
    docker push "${IMG}:${tp}-latest"
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
  # `0254` — tác tử vận hành, cài bằng systemd (cách cài ghi ngay trong tệp).
  mkdir -p "$goc/deploy/systemd"
  cp deploy/systemd/csbh-tac-tu.service "$goc/deploy/systemd/"
  chmod +x "$goc/csbh" "$goc/cai-dat.sh"

  # --- Ba mẫu .docx ---------------------------------------------------------
  #
  # KHÔNG bắt buộc — `ensureDefault` đã nạp sẵn một mẫu hồ sơ và một mẫu hợp đồng
  # lúc `document` khởi động. Ba file này là điểm khởi đầu ĐẸP HƠN để Quản trị
  # tải về sửa câu chữ, nên chúng đi kèm bản giao chứ không nằm trong ảnh nào.
  mkdir -p "$goc/mau-van-ban"
  cp templates/*.docx "$goc/mau-van-ban/"

  # --- Bản khai môi trường --------------------------------------------------
  sed -e "s|__IMAGE__|${IMG}|" deploy/env.mau > "$goc/.env.mau"

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
| \`deploy/cron.mau\` | Đánh thức việc sao lưu theo lịch (hỏi mỗi 15 phút) và diễn tập phục hồi. |
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
  day-minio) day_minio ;;
  goi) goi ;;
  tat-ca) anh; goi ;;
  *) echo "dùng: $0 [anh|day|goi|tat-ca]" >&2; exit 2 ;;
esac
