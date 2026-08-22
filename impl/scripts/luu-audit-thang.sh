#!/bin/sh
# =============================================================================
# Bản trích nguyệt của nhật ký kiểm toán (`0092`)
# =============================================================================
#
# "Thư mục audit được lưu lại đầy đủ" — mà audit không phải thư mục, nó là bảng
# `aud.audit_log`. Bản trích này là cách đáp ứng yêu cầu ấy mà không đụng tới
# bảng: mỗi tháng một tệp `audit-YYYY-MM.jsonl.gz` kèm bản băm.
#
# KHÔNG `DETACH`, KHÔNG xoá dòng nào. Đây là bản SAO để soi ngoài giờ, không
# phải cách dọn bảng — quyết định 22/08 nói rõ: sáu tháng là *bảo đảm tra được*,
# không phải *giới hạn lưu trữ*, và xoá khỏi bảng đòi tắt chính cái trigger đang
# giữ cho nhật ký không sửa được.
#
# Bản trích này cũng KHÔNG mâu thuẫn với "nhật ký không có đường xuất file": đó
# là một tính năng trên màn hình cho người dùng bấm. Đây là việc của máy chủ,
# chạy theo lịch, ra một tệp nằm lại trên máy chủ — cùng loại với `pg_dump`.
#
# Chọn `jsonl` chứ không `csv`: hai cột `before_data` và `after_data` là JSON,
# và nhét JSON vào một ô CSV là chuỗi thoát lồng nhau mà công cụ nào đọc cũng ra
# một kiểu khác.
# =============================================================================
set -eu

# Tháng TRƯỚC, tính bằng số học thay vì `date -d 'last month'`.
#
# `date -d` là của GNU; busybox trong ảnh alpine không có nó, và `date -v` là
# của BSD. Cả hai đều hỏng ở đúng một trong hai chỗ script này chạy — máy chủ
# và container postgres. Phép trừ tay thì chạy ở cả ba.
thang_truoc() {
  y=$(TZ=Asia/Ho_Chi_Minh date +%Y)
  m=$(TZ=Asia/Ho_Chi_Minh date +%m)
  m=${m#0}
  m=$((m - 1))
  if [ "$m" -eq 0 ]; then m=12; y=$((y - 1)); fi
  printf '%04d-%02d\n' "$y" "$m"
}
: "${PGHOST:=postgres}" "${PGUSER:=postgres}" "${PGDATABASE:=csbh}"
: "${KHO_LOG:=/logarchive}"
export PGHOST PGUSER PGDATABASE PGPASSWORD

THANG="${THANG_TRICH:-$(thang_truoc)}"
DANG_CHAY=$(TZ=Asia/Ho_Chi_Minh date +%Y-%m)

if [ "$THANG" = "$DANG_CHAY" ]; then
  echo "luu-audit: TỪ CHỐI trích tháng đang chạy ($THANG) — nó còn nhận dòng mới"
  exit 1
fi

thu_muc="$KHO_LOG/audit"
mkdir -p "$thu_muc"
ra="$thu_muc/audit-$THANG.jsonl.gz"

# Mốc cắt theo GIỜ VIỆT NAM, đúng quy ước kỳ của cả phần mềm. `occurred_at` lưu
# UTC nên phép so phải đổi múi giờ ở đây chứ không ở chỗ đọc.
dau="$THANG-01 00:00:00+07"
cuoi_sql="(timestamptz '$dau' + interval '1 month')"

so_dong=$(psql -At -c "SELECT count(*) FROM aud.audit_log
  WHERE occurred_at >= timestamptz '$dau' AND occurred_at < $cuoi_sql")

if [ "$so_dong" = "0" ]; then
  echo "luu-audit: tháng $THANG không có dòng nào, bỏ qua"
  exit 0
fi

psql -At -c "COPY (
  SELECT row_to_json(t) FROM (
    SELECT id, occurred_at, actor_id, actor_role, actor_name, actor_username,
           host(actor_ip) AS actor_ip, action, entity, entity_id, target_label,
           outcome, before_data, after_data, reason, trace_id, app_version
      FROM aud.audit_log
     WHERE occurred_at >= timestamptz '$dau' AND occurred_at < $cuoi_sql
     ORDER BY occurred_at, id
  ) t
) TO STDOUT" | gzip -9 > "$ra.partial"

mv "$ra.partial" "$ra"

# Kiểm ngay, đúng nếp `backup.sh`: đọc lại được, và đủ số dòng.
if ! gzip -t "$ra" 2>/dev/null; then
  echo "luu-audit: LỖI — $ra không đọc được, đã xoá"
  rm -f "$ra"
  exit 1
fi
dem=$(gzip -dc "$ra" | wc -l)
if [ "$dem" != "$so_dong" ]; then
  echo "luu-audit: LỖI — trích $dem dòng nhưng bảng có $so_dong, đã xoá"
  rm -f "$ra"
  exit 1
fi

sha256sum "$ra" | cut -d' ' -f1 > "$ra.sha256"
echo "luu-audit: $ra — $so_dong dòng, $(wc -c < "$ra") byte"
