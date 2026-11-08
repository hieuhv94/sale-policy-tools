#!/bin/sh
# Cửa vào DUY NHẤT của ảnh vận hành (`0105`).
#
# Một lệnh con cho mỗi việc, thay cho việc người vận hành phải nhớ đường dẫn
# tuyệt đối của từng script bên trong ảnh. Trên máy chủ khách không có mã nguồn
# để tra, nên `csbh-ops help` là tài liệu tra cứu gần nhất mà họ có.
#
# Lệnh KHÔNG BIẾT thì báo lỗi và liệt kê lệnh đúng, chứ không im lặng thoát 0:
# một lệnh gõ sai trong cron mà thoát 0 nghĩa là bản sao lưu không chạy suốt
# nhiều tháng và không ai biết.
set -eu

# `psql`, `pg_dump` và `pg_basebackup` chỉ biết `PGPASSWORD`, không biết
# `PGPASSWORD_FILE` (`0106`). Đọc hộ ở đây để `.env` thôi phải mang mật khẩu —
# một bí mật nằm ở hai chỗ là một bí mật sẽ lệch nhau.
if [ -n "${PGPASSWORD_FILE:-}" ] && [ -f "${PGPASSWORD_FILE}" ]; then
  PGPASSWORD="$(cat "${PGPASSWORD_FILE}")"
  export PGPASSWORD
fi

usage() {
  cat <<'HET'
csbh-ops — công cụ vận hành Chính sách bán hàng

  migrate            Chạy migration CSDL. An toàn khi chạy lại.
  bootstrap-admin    Tạo tài khoản Quản trị ĐẦU TIÊN. Chỉ chạy được khi CSDL
                     chưa có tài khoản nào. Cần ADMIN_USERNAME, ADMIN_EMAIL,
                     ADMIN_PASSWORD (hoặc ADMIN_PASSWORD_FILE).
  nap-danh-muc       Nạp DỮ LIỆU MẪU cho bản chạy thử: nhóm sản phẩm, sản phẩm
                     kèm giá, ba quy định chiết khấu, ba văn bản mẫu. Từ chối
                     khi danh mục đã có sản phẩm. Cần ADMIN_USERNAME và
                     ADMIN_PASSWORD của một tài khoản Quản trị đã đổi mật khẩu.
  backup             Sao lưu CSDL (pg_dump), giữ tối đa GIU_TOI_DA bản.
  restore-drill      DIỄN TẬP phục hồi vào CSDL nháp. KHÔNG đụng CSDL đang chạy.
  restore <tệp>      Phục hồi ĐÈ lên CSDL đang chạy. Phải đặt RESTORE_DB=csbh.
                     <tệp> là TÊN trong /backup (vd csbh-20261024T011500Z.dump).
                     Kiểm tệp trước, nạp vào CSDL tạm, rồi mới đổi chỗ; bản
                     cũ giữ lại dưới tên csbh_truoc_phuc_hoi_<giờ>.
  lam-sach           XOÁ HẲN CSDL rồi dựng lại TRỐNG. Chỉ cho bản CHẠY THỬ.
                     Phải đặt XAC_NHAN_XOA_SACH=XOA-SACH.
  retention          Dọn dữ liệu quá hạn lưu trữ và outbox đã gửi.
  chuyen-may <việc>  Phần chạy trong ảnh của chuyển máy và sao lưu kho tệp
                     (`0246`): ban-ke · so-sanh · cho-xa · xuat-csdl · dong-goi ·
                     mo-goi · bi-mat-dong · bi-mat-mo. Gọi qua ./csbh, không gõ tay.
  psql [...]         Mở psql vào CSDL, hoặc chạy câu lệnh truyền vào.
  gen-secrets [dir]  Sinh bí mật cho một lần triển khai. Mặc định /run/secrets.
  kiem-nghiem        Bộ kiểm nghiệm đủ chức năng qua API thật (`0270`). CHỈ chạy trong
                     chồng kiểm (CSBH_KIEM_NGHIEM=1). Gọi qua ./csbh kiem-nghiem.
  ban-cai <thư mục>  Dựng thư mục CHƯƠNG TRÌNH đi kèm ảnh này (csbh · deploy/ ·
                     tai-lieu/) vào thư mục gắn vào (`0270`). Gọi qua ./csbh cap-nhat.
  version            In phiên bản ảnh.
  help               Bảng này.
HET
}

case "${1:-help}" in
  migrate)         shift; MIGRATIONS_DIR=/app/db/migrations exec /bin/sh /app/scripts/migrate.sh "$@" ;;
  bootstrap-admin) shift; exec pnpm --dir /app bootstrap-admin "$@" ;;
  nap-danh-muc)    shift; exec pnpm --dir /app nap-danh-muc "$@" ;;
  backup)
    exec /bin/sh /app/scripts/backup.sh
    ;;
  restore-drill)   shift; exec /bin/sh /app/scripts/restore.sh "$@" ;;
  restore)
    shift
    # Đè lên CSDL đang chạy là việc không hoàn tác được. `RESTORE_DB` phải do
    # người gọi gõ ra, không có mặc định — xem `restore.sh`.
    [ "${RESTORE_DB:-}" = "csbh" ] || {
      echo "csbh-ops restore: phải đặt RESTORE_DB=csbh một cách có ý thức." >&2
      echo "Muốn kiểm tra bản sao lưu mà không đụng dữ liệu: dùng restore-drill." >&2
      exit 1
    }
    exec /bin/sh /app/scripts/restore.sh "$@"
    ;;
  lam-sach)
    # ================================================================
    # XOÁ HẲN CSDL — lối đi CÓ Ý THỨC DUY NHẤT tới `reset-db.sh` (`0218`).
    # ================================================================
    #
    # `reset-db.sh` từ chối chạy ở `NODE_ENV=production`, và SEC-14 canh đúng
    # điều đó — *"chạy nhầm nó trên máy chủ thật là mất tất cả"*. Chồng
    # production đặt `NODE_ENV: production` cho `ops`, nên chốt ấy chặn mọi
    # đường tới nó ở đây.
    #
    # Bản chạy thử thì cần đúng việc ấy: nâng bản mới rồi dựng lại từ CSDL
    # trống, để người dùng thử đi lại từ bước tạo tài khoản Quản trị. Nên có
    # một lối đi, và nó phải **khó gõ nhầm hơn** cái chốt nó đi vòng qua:
    #
    #   * `XAC_NHAN_XOA_SACH=XOA-SACH` không có mặc định, phải do người gọi gõ
    #     ra — cùng khuôn `RESTORE_DB=csbh` ở lệnh `restore` ngay trên;
    #   * `./csbh upgrade` còn hỏi lại một lần nữa bằng bàn phím, và **sao lưu
    #     trước** khi gọi tới đây.
    #
    # KHÔNG chép phép xoá sang đây: `reset-db.sh` vẫn là bản DUY NHẤT, vì
    # `DROP DATABASE` viết hai chỗ là hai chỗ sẽ lệch — và chỗ lệch ấy chỉ lộ
    # ra ở lượt người ta cần nó chạy đúng nhất. Chốt `NODE_ENV` của nó giữ
    # nguyên cho mọi người gọi khác; `env NODE_ENV=` ở đây là lời khai rằng
    # lượt gọi này đã đi qua hai cổng khác.
    [ "${XAC_NHAN_XOA_SACH:-}" = "XOA-SACH" ] || {
      echo "csbh-ops lam-sach: phải đặt XAC_NHAN_XOA_SACH=XOA-SACH một cách có ý thức." >&2
      echo "Việc này XOÁ HẲN mọi dữ liệu. Muốn cập nhật mà GIỮ dữ liệu: ./csbh cap-nhat." >&2
      exit 1
    }
    shift
    exec env NODE_ENV= /bin/sh /app/scripts/reset-db.sh "$@"
    ;;
  retention)
    psql -v ON_ERROR_STOP=1 -q -c "SELECT sys.run_retention()"
    # Đủ BA hàm con mà sla-worker gọi — tới `0251` lệnh tay thiếu `don_thong_bao` và
    # chưa ai dọn `doc.outbox`.
    exec psql -v ON_ERROR_STOP=1 -q -c "SELECT sys.don_idn_outbox(), sys.don_thong_bao(), sys.don_doc_outbox()"
    ;;
  chuyen-may)      shift; exec /bin/sh /app/scripts/chuyen-may.sh "$@" ;;
  psql)            shift; exec psql "$@" ;;
  gen-secrets)     shift; exec /bin/sh /app/scripts/gen-secrets.sh "${1:-/run/secrets}" ;;
  kiem-nghiem)     shift; exec pnpm --dir /app --silent kiem-nghiem "$@" ;;
  ban-cai)         shift; exec /bin/sh /app/scripts/ban-cai.sh /app "${1:?ban-cai: thiếu thư mục đích}" "${CSBH_IMAGE:-__IMAGE__}" ;;
  version)         echo "${APP_VERSION:-0.0.0-dev}" ;;
  help|-h|--help)  usage ;;
  *)
    echo "csbh-ops: không có lệnh \"$1\"." >&2
    echo "" >&2
    usage >&2
    exit 2
    ;;
esac
