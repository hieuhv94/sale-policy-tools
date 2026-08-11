#!/bin/sh
# =============================================================================
# Xoá và dựng lại CSDL `csbh` từ đầu. Chỉ dùng cho bản chạy thử.
#
# XOÁ HẲN CSDL chứ không TRUNCATE từng bảng, và đó là một quyết định:
# danh sách bảng phải giữ đồng bộ với 17 migration, mà quên một bảng thì chỗ
# "sạch" đó lặng lẽ còn dữ liệu cũ — đúng thứ khó nhìn ra nhất khi đang thử
# nghiệp vụ. `DROP DATABASE` không có danh sách nào để quên.
#
# Chặn ở NODE_ENV=production, cùng lý do với `seed.ts` (test SEC-14).
# =============================================================================
set -eu

if [ "${NODE_ENV:-}" = "production" ]; then
  echo "reset-db: TỪ CHỐI chạy ở môi trường production"
  exit 1
fi

: "${PGHOST:=postgres}" "${PGUSER:=postgres}"
TARGET="${PGDATABASE:-csbh}"
# Mọi lệnh dưới đây nối vào `postgres`, KHÔNG vào CSDL sắp xoá — không ai xoá
# được cái CSDL mà chính mình đang nối vào.
export PGHOST PGUSER PGPASSWORD
PGDATABASE=postgres
export PGDATABASE

echo "reset-db: chờ Postgres tại $PGHOST..."
for i in $(seq 1 60); do
  pg_isready -q && break
  [ "$i" = 60 ] && { echo "reset-db: Postgres không sẵn sàng"; exit 1; }
  sleep 1
done

# Ngắt mọi kết nối còn sót. Một service của lượt chạy trước còn mở kết nối là
# `DROP DATABASE` hỏng với "is being accessed by other users" — và thông báo đó
# không nói cho biết ai đang giữ.
psql -v ON_ERROR_STOP=1 -q -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
    WHERE datname = '$TARGET' AND pid <> pg_backend_pid();" > /dev/null

psql -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $TARGET;"
psql -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE $TARGET OWNER $PGUSER;"

# Chín DB role nằm ở CẤP CỤM nên sống sót qua DROP DATABASE, còn quyền của
# chúng thì không — quyền gắn với đối tượng trong CSDL vừa bị xoá. `0002_roles`
# cấp lại toàn bộ ở lượt migrate ngay sau đây, nên ở đây không phải làm gì.
echo "reset-db: đã dựng lại CSDL $TARGET, trống hoàn toàn"
