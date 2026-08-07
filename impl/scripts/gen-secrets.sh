#!/bin/sh
# Sinh bí mật cho một lần triển khai. Chạy MỘT LẦN khi dựng môi trường mới.
# Thư mục secrets bị .gitignore loại khỏi git — không bao giờ commit.
set -eu
dir="${1:-deploy/secrets}"
mkdir -p "$dir"

rnd() { head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32; }

for name in pg_password role_password minio_password rabbit_password; do
  f="$dir/$name.txt"
  if [ -f "$f" ]; then echo "giữ nguyên $f"; else rnd > "$f"; echo "đã sinh $f"; fi
done

key="$dir/jwt-private.pem"
if [ -f "$key" ]; then
  echo "giữ nguyên $key"
else
  # RS256: mười service chỉ cần public key để XÁC MINH; chỉ identity giữ khoá ký.
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$key" 2>/dev/null
  echo "đã sinh $key"
fi
chmod 600 "$dir"/*.txt "$key"
echo "xong. KHÔNG commit thư mục $dir."
