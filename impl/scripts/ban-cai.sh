#!/bin/sh
# Dựng THƯ MỤC CHƯƠNG TRÌNH của một bản cài (`0270`): `sh ban-cai.sh <gốc mã> <đích> [<kho ảnh>]`.
#
# MỘT định nghĩa cho hai người gọi, và đó là lý do tệp này tồn tại:
#
#   * `dong-goi.sh goi` — trên máy đóng gói, dựng bộ cài nén lần đầu giao cho khách;
#   * `csbh-ops ban-cai` — TRONG ảnh `ops`, để `./csbh cap-nhat` bung đúng compose và
#     `csbh` đi kèm ảnh mới vào `/opt/csbh/releases/<bản>/`.
#
# Tới `0269` chỉ có người gọi thứ nhất, và `nang-cap` chỉ đổi ẢNH — compose mới phải
# chép tay, ghi lại ở `0241`, `0250`, `0251` và bản `1.3.0`. Hai danh sách tệp gõ tay ở
# hai chỗ sẽ trôi khỏi nhau đúng như thế; nên chỉ có danh sách này.
#
# Ảnh `ops` dựng TỪ ảnh service (`COPY . .`), nên `/app` trong ảnh có đủ `scripts/`,
# `deploy/`, `docs/` và `VERSION` — `.dockerignore` chỉ loại `tests/` và `deploy/secrets`.
set -eu

goc="$1"; dich="$2"; kho="${3:-__IMAGE__}"
[ -f "$goc/VERSION" ] || { echo "ban-cai: $goc không phải gốc mã (thiếu VERSION)" >&2; exit 1; }

mkdir -p "$dich/deploy/postgres" "$dich/deploy/caddy" "$dich/deploy/cron" "$dich/deploy/systemd" "$dich/tai-lieu"

# --- Thứ máy chủ CẦN để chạy ------------------------------------------------
for t in compose.yml compose.prod.yml compose.du-lieu.yml compose.tunnel.yml compose.kiem.yml; do
  [ -f "$goc/deploy/$t" ] && cp "$goc/deploy/$t" "$dich/deploy/"
done
cp "$goc/deploy/postgres/postgresql.conf" "$goc/deploy/postgres/pg_hba.conf" "$dich/deploy/postgres/"
# Caddyfile đã nướng trong ảnh `web`; bản này chỉ để người vận hành ĐỌC được cấu hình biên mạng.
cp "$goc/deploy/caddy/Caddyfile" "$dich/deploy/caddy/Caddyfile.tham-khao"
# Mẫu lịch tự động + tác tử: `cai-dat.sh` ghi chúng ra `/etc/` với đường tuyệt đối.
cp "$goc/deploy/cron/csbh.cron" "$dich/deploy/cron/"
cp "$goc/deploy/systemd/csbh-tac-tu.service" "$dich/deploy/systemd/"

# --- Thứ người vận hành chạy ------------------------------------------------
cp "$goc/scripts/csbh" "$dich/csbh"
cp "$goc/scripts/cai-dat.sh" "$dich/cai-dat.sh"
cp "$goc/scripts/lib-buoc.sh" "$dich/lib-buoc.sh"
chmod 755 "$dich/csbh" "$dich/cai-dat.sh"
cp "$goc/VERSION" "$dich/VERSION"
sed -e "s|__IMAGE__|${kho}|" "$goc/deploy/env.mau" > "$dich/csbh.env.mau"

# --- Tài liệu ---------------------------------------------------------------
cp "$goc/docs/06-CAI-DAT-VPS.md" "$goc/docs/04-TRIEN-KHAI.md" "$goc/docs/05-VAN-HANH.md" "$goc/docs/03-HUONG-DAN-SU-DUNG.md" "$dich/tai-lieu/"
cp "$goc/deploy/RPO-RTO.md" "$dich/tai-lieu/"
# Trong kho mã `RPO-RTO.md` nằm ở `deploy/`, nên tài liệu trỏ tới `../deploy/`. Trong bản
# cài cả bốn tài liệu nằm chung một thư mục — một liên kết chết là chỗ người ta bỏ cuộc.
sed -i 's|\.\./deploy/RPO-RTO\.md|RPO-RTO.md|g' "$dich/tai-lieu/"*.md
