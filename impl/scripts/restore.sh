#!/bin/sh
# Phục hồi CSDL từ một bản sao lưu.
#
# MẶC ĐỊNH phục hồi vào CSDL NHÁP (csbh_restore_check), không đè lên CSDL đang
# chạy. Muốn đè thật thì phải truyền RESTORE_DB=csbh một cách có ý thức — phục
# hồi nhầm lên CSDL sống là cách mất dữ liệu nhanh nhất trong lúc đang hoảng.
set -eu
: "${PGHOST:=postgres}" "${PGUSER:=postgres}" "${BACKUP_DIR:=/backup}"
: "${RESTORE_DB:=csbh_restore_check}"
export PGHOST PGUSER PGPASSWORD

file="${1:-}"
[ -n "$file" ] || file=$(ls -1t "$BACKUP_DIR"/csbh-*.dump 2>/dev/null | head -1)
[ -n "$file" ] || { echo "restore: không tìm thấy bản sao lưu nào trong $BACKUP_DIR"; exit 1; }

if [ "$RESTORE_DB" = "csbh" ]; then
  echo "restore: ĐANG ĐÈ LÊN CSDL ĐANG CHẠY từ $file"
else
  echo "restore: phục hồi thử vào $RESTORE_DB từ $file"
fi

psql -d postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\" WITH (FORCE)"
psql -d postgres -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"$RESTORE_DB\""

# --no-owner: DB role của service do 0002 tạo ở cấp cụm nên đã có sẵn; giữ nguyên
# chủ sở hữu cũ sẽ hỏng khi phục hồi sang cụm khác.
pg_restore --dbname="$RESTORE_DB" --no-owner --exit-on-error --jobs=2 "$file"

echo "restore: xong. Đối chiếu số dòng:"
psql -d "$RESTORE_DB" -v ON_ERROR_STOP=1 -c "
  SELECT 'app_user' t, count(*) FROM idn.app_user
  UNION ALL SELECT 'customer', count(*) FROM cus.customer
  UNION ALL SELECT 'policy',   count(*) FROM pol.policy
  UNION ALL SELECT 'product',  count(*) FROM cat.product
  UNION ALL SELECT 'audit_log',count(*) FROM aud.audit_log
  ORDER BY 1"
