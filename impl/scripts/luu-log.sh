#!/bin/sh
# =============================================================================
# Thu gom log của mọi container vào kho lưu trữ (`0092`)
# =============================================================================
#
# VÌ SAO CẦN. Docker `json-file` giữ tối đa `max-size × max-file` cho mỗi
# container rồi **xoá phần cũ**. Với cấu hình trước `0092` là 10m × 5 = 50MB,
# service bận nhất chỉ giữ được một cửa sổ trượt vài ngày — nên yêu cầu "lưu lại
# đầy đủ để maintain và debug" không có gì để dựa vào. Đây không phải việc thêm
# một bước nén, mà là dựng một kho lưu trữ chưa từng có.
#
# CON TRỎ MỐC, không phải `--since 24h`.
#
#   Một mốc cố định hỏng theo cả hai chiều: job chạy trễ mười phút thì mười phút
#   ấy bị thu hai lần, và job lỡ hẳn một lượt thì cả ngày hôm đó biến mất. Con
#   trỏ ghi lại dòng cuối cùng đã thu, nên lượt sau tiếp đúng chỗ — chạy trễ,
#   chạy bù, chạy hai lần liền đều ra cùng một kết quả.
#
# GHI THEO THÁNG, cắt theo GIỜ VIỆT NAM.
#
#   Tên tệp mang tháng ICT cho khớp với mọi quy ước kỳ khác của phần mềm; dấu
#   thời gian trong từng dòng thì là UTC vì Docker `--timestamps` chỉ cho ra
#   UTC. Hai thứ khác nhau, nên `manifest` ghi cả hai mốc và đầu mỗi tệp có một
#   dòng tiêu đề nói rõ — không có nó thì người đọc thấy dòng đầu tháng 8 mang
#   nhãn `2026-07-31T17:00:00Z` và tưởng tệp bị lẫn.
#
# Chạy TỪ MÁY CHỦ, không chạy trong container: nó gọi `docker compose logs`, tức
# là phải nói chuyện với daemon.
# =============================================================================
set -eu

KHO="${KHO_LOG:-../logarchive}"
COMPOSE="${COMPOSE_CMD:-docker compose -f deploy/compose.yml -f deploy/compose.demo.yml}"
DICH_VU="${DICH_VU:-identity catalog customer policy document notification audit reporting sla-worker gateway caddy postgres rabbitmq redis minio}"

# Tháng theo giờ Việt Nam. `date` của busybox lẫn GNU đều nhận `TZ=`.
THANG=$(TZ=Asia/Ho_Chi_Minh date +%Y-%m)
BAY_GIO=$(date -u +%Y-%m-%dT%H:%M:%SZ)

mkdir -p "$KHO/logs"

tong=0
for svc in $DICH_VU; do
  thu_muc="$KHO/logs/$svc"
  mkdir -p "$thu_muc"
  tep="$thu_muc/$svc-$THANG.log"
  moc_tep="$thu_muc/.moc"

  # Lượt đầu tiên lấy tất cả những gì Docker còn giữ; các lượt sau tiếp từ mốc.
  if [ -f "$moc_tep" ]; then
    tu=$(cat "$moc_tep")
    since="--since $tu"
  else
    since=""
  fi

  tam="$tep.partial"
  # `--no-log-prefix`: tên service đã nằm ở tên tệp, lặp lại trên từng dòng chỉ
  # làm tệp to thêm mà không thêm nghĩa.
  # shellcheck disable=SC2086
  if ! $COMPOSE logs --no-color --no-log-prefix --timestamps $since "$svc" > "$tam" 2>/dev/null; then
    echo "luu-log: bỏ qua $svc (không chạy)"
    rm -f "$tam"
    continue
  fi

  if [ ! -s "$tam" ]; then
    rm -f "$tam"
    continue
  fi

  if [ ! -f "$tep" ]; then
    {
      echo "# Nhật ký container: $svc"
      echo "# Tháng $THANG theo giờ Việt Nam (UTC+7); dấu thời gian từng dòng là UTC."
      echo "# Sinh bởi scripts/luu-log.sh — không sửa tay."
    } > "$tep"
  fi
  cat "$tam" >> "$tep"

  # Mốc = dấu thời gian của dòng CUỐI, CỘNG MỘT NANO GIÂY.
  #
  # `--since` của Docker là "lớn hơn HOẶC BẰNG", nên lưu thẳng mốc ấy thì lượt
  # sau thu lại đúng dòng cuối cùng — đo được: chạy hai lượt liền nhau cho ra
  # đúng một dòng trùng ở MỌI service, và một tệp lưu trữ có dòng trùng là một
  # tệp không đếm được.
  #
  # Tràn 999999999 thì giữ nguyên mốc: một dòng trùng trong một tỷ lần còn hơn
  # một khoảng trống, và khoảng trống là thứ chỉ lộ ra lúc cần điều tra.
  cuoi=$(tail -n 1 "$tam" | cut -d' ' -f1)
  if [ -n "$cuoi" ]; then
    awk -v t="$cuoi" 'BEGIN {
      n = split(t, a, ".");
      if (n < 2) { print t; exit }
      giay = a[1]; le = a[2]; sub(/Z$/, "", le);
      moi = le + 1;
      if (length(moi) > length(le)) { print t; exit }
      # Đệm số 0 bằng tay: `%0*d` của printf KHÔNG có ở awk trong ảnh alpine —
      # nó chạy trên gawk của máy chủ rồi chết ở container, đúng loại lệch mà
      # chỉ bộ kiểm chạy trong container mới thấy.
      p = "" moi;
      while (length(p) < length(le)) p = "0" p;
      printf "%s.%sZ\n", giay, p
    }' > "$moc_tep"
  fi

  n=$(wc -c < "$tam")
  tong=$((tong + n))
  rm -f "$tam"
  echo "luu-log: $svc +$n byte"
done

echo "luu-log: xong lúc $BAY_GIO, thêm $tong byte vào $KHO/logs/*/[service]-$THANG.log"
