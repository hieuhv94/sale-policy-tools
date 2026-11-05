# Kế hoạch: trang **Vận hành** cho Quản trị hệ thống

## Context

Hiện mọi thao tác vận hành chỉ chạy được bằng `./csbh <lệnh>` trên máy chủ (`impl/scripts/csbh`) hoặc `make`
trên máy phát triển, nên người vận hành phía khách hàng phải SSH vào máy và biết docker. Mục tiêu: một trang
**Vận hành** riêng trên thanh bên của tài khoản Quản trị, gồm sức khoẻ hệ thống, ổ đĩa, sao lưu, tệp log, thư và
hàng đợi, lịch tự động.

Lỗ đã đo được trong phiên này: không service nào ghi **tệp log** (chỉ stdout; Docker giữ cửa sổ 500MB mỗi
container, mất khi dựng lại), production không lưu log lâu dài, log không mang `trace_id`; lịch sao lưu nằm cứng
trong `deploy/cron/`, số bản giữ lại nằm cứng trong script (`KEEP_DAYS=14`, `KEEP_BASE=3`); không có gì theo dõi
dung lượng ổ đĩa.

**Đã chốt khi hỏi (05/11):**

1. Thao tác cần docker chạy qua **tác tử trên máy chủ**, không gắn `docker.sock` vào container.
2. **Phục hồi CSDL / kho tệp giữ ở dòng lệnh** — trang chỉ giải thích phạm vi và cho chép câu lệnh.
3. **Bỏ khỏi trang**: đường hầm, khởi động lại service, nâng cấp, nạp danh mục, gửi thư thử, diễn tập phục hồi.
4. **Tệp log**: mọi service ghi tệp riêng vào cùng một thư mục; hết ngày **toàn bộ log của ngày nén chung vào MỘT
   tệp**; **chỉ giữ 30 tệp nén gần nhất** — tạo tệp mới thì xoá tệp cũ nhất; web liệt kê, tải về, xoá.
5. **Sao lưu CSDL**: web liệt kê các bản sao lưu, tải về, xoá; **cấu hình được lịch sao lưu tự động**.
6. **Theo dõi dung lượng ổ đĩa**.

> **Nhật ký kiểm toán** (`aud.audit_log`, màn hình *Nhật ký*) giữ nguyên — bảng chỉ-ghi-thêm có trigger chặn
> xoá, khác về bản chất với tệp log/bản sao lưu được phép xoá. Mọi lượt tải về/xoá trên trang Vận hành đều ghi một
> dòng vào nhật ký kiểm toán.

## Phạm vi

| Lệnh `./csbh` | Trên trang? | Ai làm |
|---|---|---|
| `trang-thai`, `phien-ban` | ✅ chỉ xem | ứng dụng (`Readiness` — `services/gateway/src/infra/readiness.ts`) + tác tử (container hạ tầng) |
| `log` / `luu-log` / `nen-log` | ✅ thẻ **Tệp log** | service `van-hanh` + tác tử |
| `sao-luu` | ✅ thẻ **Sao lưu**: chạy ngay, danh sách, tải, xoá, cấu hình lịch | tác tử chạy; `van-hanh` liệt kê/tải/xoá |
| `sao-luu-tep` | ✅ chạy ngay + theo lịch | tác tử |
| `don-du-lieu` | ✅ **chỉ xem kết quả**, không nút chạy | `sla-worker` đã tự dọn mỗi 24 giờ; trang đọc `sys.retention_run` |
| `luu-audit` | ❌ **gỡ hẳn** (chốt 05/11) — xem mục *Bỏ trích kiểm toán* | — |
| (mới) theo dõi ổ đĩa | ✅ thẻ **Ổ đĩa** | `van-hanh` (`statfs`, `pg_database_size`) + tác tử (cỡ từng volume) |
| `phuc-hoi`, `phuc-hoi-tep` | ❌ CLI — trang giải thích + chép lệnh | — |
| `dien-tap`, `nang-cap`, `upgrade`, `mo/dong-thu-nghiem`, `nap-danh-muc`, `thu-thu`, `mo-tai-khoan`, `xuat/nhap-chuyen-may`, `xuong`, `psql` | ❌ CLI | — (`dien-tap` vẫn chạy bằng cron như cũ) |

Thẻ **Hệ thống** ở trang *Người dùng* (`apps/web/src/components/quan-tri/HeThong.tsx`: hạn xử lý + thư hỏng)
**dời sang** trang Vận hành.

## Thiết kế: sao lưu CSDL

Hiện trạng (`scripts/backup.sh`, `scripts/basebackup.sh`): mỗi lượt `./csbh sao-luu` ghi **hai loại** vào volume
`pgbackup` — bản logic `csbh-<giờ>.dump` (giữ `KEEP_DAYS=14` ngày) và bản nền vật lý `base/<giờ>/` (giữ
`KEEP_BASE=3` bản, mốc dọn WAL đọc từ bản nền cũ nhất) — rồi nhân bản sang `CSBH_BACKUP_MIRROR` (ổ khác).

**Danh sách / tải / xoá** — service `van-hanh` gắn volume `pgbackup` và thư mục bản sao ngoài:

| Đường | Việc |
|---|---|
| `GET /ops/sao-luu` | danh sách: thời điểm, loại (dump / bản nền), cỡ, có ở bản sao ngoài không, đã kiểm mục lục chưa |
| `GET /ops/sao-luu/:ten/tai` | tải: dump → tệp; bản nền → tar dựng tại chỗ, phát dạng luồng |
| `DELETE /ops/sao-luu/:ten?caBanSaoNgoai=1` | xoá bản tại chỗ, tuỳ chọn xoá cả bản ở bản sao ngoài |
| `POST /ops/sao-luu/chay-ngay` | tạo việc cho tác tử |

Luật xoá (đặt ở máy chủ, có ca kiểm):

- **Không xoá được bản dump mới nhất và bản nền mới nhất** (`SAO_LUU_CUOI_CUNG`) — luôn còn ít nhất một đường
  phục hồi.
- Xoá bản nền **cũ nhất** làm hẹp cửa sổ phục hồi theo thời điểm; hộp xác nhận nói rõ *"sau khi xoá chỉ phục hồi
  được về thời điểm từ <mốc bản nền kế tiếp>"*. Thư mục WAL dọn ở lượt sao lưu sau (logic hiện có).
- Đang có lượt sao lưu chạy thì từ chối xoá (`JOB_RUNNING`).
- `:ten` khớp `^csbh-\d{8}-\d{4}\.dump$` hoặc `^base/\d{8}T\d{6}Z$` — không đường dẫn tuỳ ý.

**Cấu hình — HAI lịch độc lập, mỗi lịch có số bản tối đa** (chốt 05/11: *"bản sao kho tệp cũng như bản sao CSDL
đều có thể được người dùng cấu hình thời điểm sao lưu cũng như số bản sao lưu tối đa sẽ giữ lại"*). Bảng
`ops.cau_hinh_sao_luu`, một dòng cho `CSDL`, một dòng cho `KHO_TEP`:

| Trường | Mặc định CSDL | Mặc định kho tệp | Ràng buộc |
|---|---|---|---|
| `tan_suat` | `HANG_NGAY` | `HANG_NGAY` | `MOI_6_GIO` · `MOI_12_GIO` · `HANG_NGAY` · `HANG_TUAN` |
| `gio_chay` | `01:15` | `02:00` | giờ VN; với `MOI_N_GIO` là mốc đầu |
| `thu_trong_tuan` | — | — | chỉ khi `HANG_TUAN` |
| `giu_toi_da` (bản) | 7 | 7 | 1–60 |

- **CSDL**: một *bản* = một lượt sao lưu (bản dump + bản nền cùng mốc). `giu_toi_da` thay cả `KEEP_DAYS` (đang tính
  theo NGÀY) lẫn `KEEP_BASE` của `scripts/backup.sh` / `basebackup.sh` — đổi sang **đếm số bản**: sau lượt mới, xoá
  bản cũ nhất cho tới khi còn `giu_toi_da`. WAL tiếp tục dọn theo bản nền cũ nhất còn giữ, nên cửa sổ phục hồi
  theo thời điểm = `giu_toi_da` chu kỳ. Áp đúng luật ấy cho bản sao ngoài.
- **Kho tệp**: hiện chỉ có MỘT bản sao cộng dồn (`mc mirror --overwrite`, không `--remove`) — tệp đã xoá khỏi hệ
  thống nằm lại mãi, và không có "bản" nào để đếm. Đổi thành **bản chụp theo mốc** `tep/<giờ>/`: tạo bằng
  `cp -al` bản chụp trước (liên kết cứng — tệp không đổi không tốn thêm chỗ) rồi `mc mirror --remove` vào đó. Đối
  tượng trong kho tệp **không bao giờ bị ghi đè** (khoá theo id), nên bỏ `--overwrite` để không lượt nào sửa vào
  một inode dùng chung với bản chụp cũ. Giữ `giu_toi_da` bản chụp, xoá bản cũ nhất; tệp đã xoá khỏi hệ thống biến
  khỏi bản sao lưu khi bản chụp cuối cùng còn chứa nó bị xoá. Làm y hệt ở bản sao ngoài (`cp -al` cần cùng một ổ —
  mỗi phía tự liên kết trong ổ của nó). `./csbh phuc-hoi-tep [bản]` nhận tên bản chụp, mặc định bản mới nhất;
  `chuyen-may ban-ke` kiểm trên bản chụp mới nhất.
- Bỏ cờ `sao_luu_kho_tep` (*"chạy ngay sau sao lưu CSDL"*) — kho tệp có lịch riêng.

Cơ chế: **cron vẫn là bộ đếm giờ** — `deploy/cron/` đổi thành `*/15 * * * * ./csbh sao-luu --neu-den-han` và
`*/15 * * * * ./csbh sao-luu-tep --neu-den-han`; mỗi lệnh đọc dòng cấu hình của nó, so với lần thành công gần nhất
(`ops.cron_run`), chỉ chạy khi đến hạn và truyền `giu_toi_da`. Không để tác tử lập lịch: **sao lưu không được phụ
thuộc vào tác tử**. Đọc CSDL hỏng thì dùng mặc định và vẫn sao lưu. Hai lịch không chạy chồng nhau (khoá tệp
`flock`). Thẻ Sức khoẻ báo đỏ khi lần thành công gần nhất cũ hơn một chu kỳ + 2 giờ.

**Danh sách bản chụp kho tệp** trên trang: thời điểm, số tệp, cỡ thật chiếm thêm (phần không liên kết cứng), có ở
bản sao ngoài không; **xoá** được (trừ bản mới nhất). **Không tải về qua trình duyệt** — một bản chụp là toàn bộ
kho tệp, hàng chục GB.

Ngoài hai loại bản sao lưu này, các nơi khác lớn lên không giới hạn (ảnh Docker cũ, gói chuyển máy, CSDL cũ sau
phục hồi, log cron, vài bảng kỹ thuật) **chưa xử lý ở đợt này** (chốt 05/11); thẻ Ổ đĩa vẫn đo và cảnh báo.

## [ĐÃ LÀM — P281] Bỏ bản nền + WAL, chỉ còn bản sao lưu hằng ngày (chốt 05/11 — ĐÈ lên phần bản nền ở mục trên)

Khách hàng chốt *"Bỏ, dump hằng ngày"* sau khi được giải thích: bản dump chứa đủ dữ liệu nghiệp vụ, tài khoản,
mật khẩu băm, phiên, nhật ký kiểm toán; thứ mất là **cam kết RPO ≤ 5 phút** (`deploy/RPO-RTO.md`) — giờ mất tối
đa bằng chu kỳ sao lưu (mặc định 24 giờ, vẫn cấu hình được tần suất). Gỡ:

- `scripts/basebackup.sh`, nhánh gọi nó ở `docker/ops-entrypoint.sh` (`backup`), mọi chỗ nhắc `base/` ở `scripts/csbh`,
  `restore.sh`, `chuyen-may.sh`;
- `archive_mode = off` + bỏ `archive_command`/`archive_timeout` ở `deploy/postgres/postgresql.conf` (đổi `archive_mode`
  cần **khởi động lại** Postgres — ghi vào `04-TRIEN-KHAI` §8 cho lượt nâng cấp); volume `pgarchive` gỡ khỏi compose,
  volume cũ trên máy đang chạy để nguyên, tài liệu chỉ lệnh xoá tay;
- quy trình PITR ở `05-VAN-HANH` §3; cảnh báo `pg_stat_archiver` khỏi kế hoạch; hạng mục *WAL lưu trữ* khỏi thẻ Ổ đĩa;
- ảnh `ops` hết cần `pg_archivecleanup` (`tests/http/anh-ops.test.ts` sửa theo), các ca OPS về archive;
- `deploy/RPO-RTO.md` viết lại: RPO = chu kỳ sao lưu; ghi rõ cái mất.

`backup.sh` đổi sang **đếm số bản** (`giu_toi_da`), bỏ `KEEP_DAYS`. Bảng sao lưu trên trang: một dòng mỗi bản.

**Trang KHÔNG nhắc tới phục hồi** (chốt 05/11: *"admin không có chuyên môn IT"*): bỏ hẳn khối *Phục hồi — chỉ làm ở
máy chủ*, câu lệnh để chép và thao tác bấm dòng để điền lệnh. Phục hồi là việc của người vận hành kỹ thuật, tài liệu
ở `05-VAN-HANH` §3. Phần dưới về mốc của `./csbh phuc-hoi` vẫn làm (cho người vận hành), chỉ không hiện trên web.

**Không dùng chữ "dump" trên giao diện** (chốt 05/11: *"gây khó hiểu cho người dùng"*): trang chỉ nói *bản sao lưu
lúc …*. Tên tệp không hiện ra. (Ý định cho `./csbh phuc-hoi` nhận mốc đã BỎ ở P281 — khối phục hồi rời trang.) Đầu ra việc định kỳ hiện trên trang cũng viết
bằng lời thường. Tệp tải về đặt tên `csbh-sao-luu-<mốc>.backup`.

## Dọn dữ liệu hết hạn (chốt 05/11: chỉ hiện kết quả)

`sla-worker` gọi `sys.run_retention()` + `sys.don_idn_outbox()` + `sys.don_thong_bao()` mỗi 24 giờ
(`services/sla-worker/src/scheduler.ts`). Xoá: phiên đăng nhập và mã kích hoạt hết hạn > 7 ngày, outbox đã phát >
30 ngày, nội dung tệp Excel báo cáo hết hạn, thông báo web > 180 ngày; kèm tạo trước partition nhật ký kiểm toán 3
tháng tới. Không đụng dữ liệu nghiệp vụ. Trang chỉ hiện lượt gần nhất + số dòng từng loại (đọc `sys.retention_run`).

Sửa kèm hai lỗ đã tìm ra:

- **`doc.outbox` chưa bao giờ được dọn** → migration thêm `sys.don_doc_outbox()` (cùng khuôn `don_idn_outbox`,
  SECURITY DEFINER, GRANT cho `csbh_pol`), `sla-worker` gọi kèm, và ghi cả hai hàm con vào `sys.retention_run`.
- **`./csbh don-du-lieu` thiếu `don_thong_bao()`** (`docker/ops-entrypoint.sh`, `make retention`) → gọi đủ;
  dòng cron hằng tháng của `don-du-lieu` **gỡ** khỏi `deploy/cron/` (thừa vì `sla-worker` đã chạy hằng ngày), lệnh
  CLI giữ để chạy tay.

## Bỏ trích kiểm toán (chốt 05/11)

`luu-audit` chép mỗi tháng của `aud.audit_log` ra `logarchive/audit/audit-YYYY-MM.jsonl.gz`, không ai dọn. Khách
hàng chốt **bỏ hẳn**: bản gốc trong CSDL (chỉ ghi thêm, không bao giờ xoá) + sao lưu CSDL là đủ. Gỡ:
`scripts/luu-audit-thang.sh`, nhánh `luu-audit` ở `scripts/csbh` và `docker/ops-entrypoint.sh`, đích `luu-audit` /
`luu-thang` ở `Makefile`, dòng cron ở `deploy/cron/`, các câu nhắc ở `docs/05-VAN-HANH.md` §2 và §6. **Tệp đã trích
trên máy đang chạy giữ nguyên** — không lệnh nào xoá chúng; người vận hành tự xoá nếu muốn.

Cái mất, ghi vào tài liệu: (1) dòng nhật ký cũ hơn 6 tháng chỉ đọc được bằng `./csbh psql` (màn hình *Nhật ký* vẫn
giới hạn 6 tháng); (2) phục hồi CSDL làm nhật ký lùi về mốc sao lưu và không còn bản ngoài CSDL nào giữ phần sau
mốc — bản cũ vẫn nằm trong `csbh_truoc_phuc_hoi_<giờ>` cho tới khi bị xoá tay.

## Thiết kế: tệp log

Thư mục `CSBH_LOG_DIR` (mặc định `../logs` cạnh bộ cài, bind mount), gắn vào mọi container ứng dụng tại
`/var/log/csbh`:

```text
logs/
  hom-nay/                     ← ngày đang chạy: mỗi service một tệp, đang ghi
    gateway.log identity.log policy.log … (10 service)
    caddy.log postgres.log rabbitmq.log redis.log minio.log gotenberg.log
  log-2026-11-04.tar.gz        ← MỘT tệp nén cho cả ngày, chứa mọi tệp service
  log-2026-11-04.tar.gz.sha256
  log-2026-11-03.tar.gz
  …                            ← tối đa 30 tệp nén
```

- **10 service Node ghi trực tiếp**: logger dùng chung ở `packages/http-kit` (gắn bằng `app.useLogger` ở từng
  `main.ts`), mỗi dòng JSON `{t, muc, service, traceId, actor, msg, stack?}` lấy từ `currentContext()`
  (`request-context.ts`); vẫn in stdout. Ngày theo giờ VN. Kèm **exception filter toàn cục** ghi mọi 5xx kèm stack.
- **Hạ tầng**: tác tử thu `docker logs` mỗi 5 phút bằng con trỏ mốc (cơ chế `scripts/luu-log.sh`, đổi đích).
- **Đổi ngày** (logger): sang 00:00 giờ VN mỗi service ghi vào tệp mang ngày mới; tệp của ngày cũ đóng lại.
  Thực tế thư mục đang ghi chứa tệp dạng `hom-nay/<service>-<ngày>.log` để hai ngày không lẫn trong vài giây chuyển.
- **Nén** 00:15 giờ VN do `van-hanh` chạy (khoá `pg_advisory_lock`): mọi tệp của một ngày đã qua → **một**
  `log-<ngày>.tar.gz`; kiểm đọc lại được và đủ mọi tệp thành viên rồi mới xoá các tệp gốc; ghi `.sha256`. Chạy bù
  được (máy tắt qua đêm thì lượt sau nén từng ngày còn sót, mỗi ngày một tệp).
- **Giữ 30 tệp nén** (đếm SỐ TỆP, không đếm ngày lịch — máy tắt vài ngày vẫn giữ đủ 30): ngay sau khi tạo một tệp
  nén mới, nếu số tệp > 30 thì xoá tệp **cũ nhất** cho tới khi còn 30. Mỗi tệp bị xoá tự động ghi vào đầu ra của
  lượt nén (thẻ Lịch tự động). Số tệp giữ lại (mặc định 30, 1–90) và giờ nén
  **cấu hình được trên web** — xem *Cấu hình việc định kỳ* dưới đây.

### Cấu hình việc định kỳ (bổ sung 05/11 sau khi xem mockup)

Bảng `ops.cau_hinh_viec` (thay `ops.cau_hinh_sao_luu`), một dòng mỗi việc, sửa được ở thẻ **Lịch tự động** (nút
*Sửa* từng dòng) **và** ở khối *Lịch tự động* đặt ngay trong thẻ Sao lưu / Tệp log — hai chỗ cùng sửa một dòng:

| Việc | Tần suất | Giờ chạy | Giữ tối đa |
|---|---|---|---|
| Sao lưu CSDL | 6 giờ · 12 giờ · ngày · tuần (+ thứ) | ✓ (mặc định 01:15) | 1–60 bản (7) |
| Sao lưu kho tệp | như trên | ✓ (02:00) | 1–60 bản chụp (7) |
| Nén log ngày trước | hằng ngày | ✓ (00:15) | 1–90 tệp (30) |
| Dọn dữ liệu hết hạn | hằng ngày | ✓ (03:00) — `sla-worker` đổi từ "mỗi 24 giờ kể từ lúc khởi động" sang giờ cố định | — |
| Thu log hạ tầng · đo ổ đĩa · nhịp tim tác tử | cố định | — | — |

Giảm số giữ lại thì phần thừa xoá ở lượt chạy kế tiếp, cũ nhất trước (trang nói ra điều này lúc lưu). **Chốt 05/11:
không xoá ngay lúc Lưu, không có việc dọn riêng** — chính lượt sao lưu / nén log dọn, và **chỉ dọn SAU khi bản mới
đã ghi xong và kiểm đọc được**; lượt hỏng thì không xoá bản nào (không bao giờ bớt bản tốt khi chưa có bản thay).
Ví dụ 10 → 5: Lưu xong vẫn 10; lượt kế tạo bản 11 → xoá 6 bản cũ nhất → còn 5. Cái giá đã nêu: lịch hằng tuần thì
đợi tới 7 ngày; ổ đầy làm lượt kế hỏng thì phần thừa không được dọn — Quản trị xoá tay (nút Xoá xoá ngay), và thẻ
Ổ đĩa đã cảnh báo trước. Ca kiểm: lượt hỏng giữa chừng sau khi hạ N → số bản KHÔNG đổi.
- **Xoá tay**: Quản trị xoá được một tệp nén bất kỳ; thư mục đang ghi của hôm nay không xoá được (`LOG_DANG_GHI`).
- API: `GET /ops/logs` (danh sách tệp nén + tệp đang ghi) · `GET /ops/logs/:ten/tai` · `DELETE /ops/logs/:ten` ·
  `GET /ops/logs/hom-nay/:service/xem?muc=&traceId=` (xem tệp đang ghi). `:ten` khớp
  `^log-\d{4}-\d{2}-\d{2}\.tar\.gz$`, `:service` khớp danh sách tên cố định — không đường dẫn tuỳ ý.
- `xuat-chuyen-may` / `nhap-chuyen-may` mang theo thư mục log.

## Thiết kế: theo dõi ổ đĩa

- **Theo ổ (filesystem)** — `van-hanh` gọi `fs.statfs` trên các điểm gắn nó có: thư mục log, `pgbackup`,
  `pgarchive`, bản sao ngoài. Gom theo thiết bị (các volume Docker thường cùng một ổ; bản sao ngoài nên là ổ
  khác — nếu **cùng ổ** thì hiện cảnh báo *"bản sao ngoài nằm cùng ổ với dữ liệu"*).
- **Theo hạng mục** — CSDL (`pg_database_size`), WAL lưu trữ, bản sao lưu, kho tệp MinIO, log, ảnh Docker. Cỡ
  từng volume do tác tử đo mỗi giờ (`docker system df -v`) → `ops.mau_o_dia`; `van-hanh` không gắn volume dữ liệu
  Postgres/MinIO chỉ để đo.
- **Lịch sử 30 ngày** + **dự báo** "đầy sau khoảng N ngày" (hồi quy tuyến tính trên mẫu 7 ngày gần nhất).
- **Ngưỡng**: **MỘT ngưỡng** (chốt 05/11), mặc định 80%, cấu hình 1–99; vượt ngưỡng → cảnh báo trên thẻ Sức khoẻ **và một thư** tới
  các tài khoản Quản trị (qua `notification`, một lần mỗi lần vượt, không lặp mỗi giờ).

## Mockup (bản duyệt — ASCII; bản HTML dựng ở bước 0)

Đường dẫn `/van-hanh`, mục **Vận hành** cuối menu Quản trị. Sáu thẻ.

### Thẻ 1 — Sức khoẻ (mặc định)

```text
┌ Vận hành ───────────────────────────────────────────────────────────────────┐
│ [Sức khoẻ]  Ổ đĩa  Sao lưu  Tệp log  Thư & hàng đợi  Lịch tự động            │
├──────────────────────────────────────────────────────────────────────────────┤
│ ● Hệ thống phục vụ bình thường     Phiên bản 1.1.0 · Tác tử: ● 5 giây trước   │
│ ┌ Cảnh báo cần xử lý (3) ────────────────────────────────────────────────┐   │
│ │ ▲ Ổ dữ liệu đã dùng 84% — đầy sau khoảng 41 ngày                     → │   │
│ │ ▲ Lưu WAL hỏng 3 lần, lần cuối 02:14                                 → │   │
│ │ ▲ 4 thư gửi hỏng chưa xử lý                                         → │   │
│ └────────────────────────────────────────────────────────────────────────┘   │
│ Thành phần      Trạng thái          Phản hồi   Chạy từ                       │
│ gateway         ● sẵn sàng           12 ms     03/11 08:00                   │
│ notification    ✕ không trả lời       —        —                             │
│ … 10 service + postgres · redis · rabbitmq · minio · gotenberg · caddy       │
│ Sao lưu gần nhất 01:15 ✓ │ Sự kiện chờ phát 0 │ Hàng đợi lỗi 0 │ WAL ✓ 09:41 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Thẻ 2 — Ổ đĩa

```text
 Ổ dữ liệu  /dev/sda1   ███████████████████████████████████░░░░░░  84%  168 / 200 GB
            ▲ vượt ngưỡng 80% · đầy sau khoảng 41 ngày
 Ổ bản sao ngoài /dev/sdb1  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░  22%  110 / 500 GB

 Hạng mục              Cỡ        30 ngày qua
 Kho tệp (MinIO)       96 GB     ▁▂▂▃▃▄▅▅▆▇  +8,2 GB
 CSDL                  4,1 GB    ▁▁▁▂▂▂▂▃▃▃  +0,3 GB
 WAL lưu trữ           18 GB     ▃▅▂▆▃▅▂▆▃▅
 Bản sao lưu           31 GB     ▂▂▃▃▃▃▄▄▄▄  +2,0 GB   → Sao lưu
 Tệp log               1,8 GB    ▁▁▂▂▃▃▄▄▅▅  +0,9 GB   → Tệp log
 Ảnh Docker            9,6 GB    ▅▅▅▅▅▅▅▅▅▅

 Cảnh báo khi ổ dùng từ [80]%   ☑ gửi thư cho Quản trị khi vượt   [Lưu]
```

### Thẻ 3 — Sao lưu

```text
 ── Cơ sở dữ liệu ─────────────────────────────────────────────────────────────
 Lịch: hằng ngày lúc 01:15 · giữ tối đa 7 bản (đang có 7)                [Sửa lịch]
 Lần gần nhất: 05/11 01:15 ✓ · lần tới: 06/11 01:15                      [Sao lưu ngay]

 Thời điểm            Loại      Cỡ      Bản sao ngoài  Kiểm   Thao tác
 05/11/2026 01:15     Dump      42 MB   ✓              ✓     [Tải]  — (mới nhất)
 05/11/2026 01:15     Bản nền   1,2 GB  ✓              ✓     [Tải]  — (mới nhất)
 04/11/2026 01:15     Dump      41 MB   ✓              ✓     [Tải] [Xoá]
 04/11/2026 01:15     Bản nền   1,2 GB  ✓              ✓     [Tải] [Xoá]
 …
 30/10/2026 01:15     Bản nền   1,1 GB  ✓              ✓     [Tải] [Xoá]  ← tự xoá ở lượt tới
 Phục hồi theo thời điểm được từ 30/10/2026 01:15 tới hiện tại.

 ── Kho tệp (bản scan, bản mềm, giấy tờ, mẫu) ────────────────────────────────
 Lịch: hằng ngày lúc 02:00 · giữ tối đa 7 bản chụp (đang có 7)          [Sửa lịch]
 Lần gần nhất: 05/11 02:00 ✓ · lần tới: 06/11 02:00                 [Sao lưu kho tệp ngay]

 Bản chụp             Số tệp    Chiếm thêm*   Bản sao ngoài   Thao tác
 05/11/2026 02:00     18.402    96 GB         ✓               — (mới nhất)
 04/11/2026 02:00     18.384    140 MB        ✓               [Xoá]
 …
 * bản đầu tiên chiếm trọn kho; các bản sau chỉ chiếm phần tệp mới (liên kết cứng).
   Không tải về qua trình duyệt — mỗi bản là toàn bộ kho tệp.

 ┌ Phục hồi — chỉ làm ở máy chủ ──────────────────────────────────────────┐
 │ Thay TOÀN BỘ dữ liệu nghiệp vụ, tài khoản, phiên đăng nhập và nhật ký   │
 │ kiểm toán về mốc sao lưu; không đụng kho tệp, bí mật, log. [Xem chi tiết]│
 │ ./csbh phuc-hoi csbh-20261104-0115.dump               [Chép lệnh]      │
 │ ./csbh phuc-hoi-tep 20261105T020000Z                  [Chép lệnh]      │
 └────────────────────────────────────────────────────────────────────────┘

 Hộp [Sửa lịch] (giống nhau cho CSDL và kho tệp):
   Tần suất ( ) Mỗi 6 giờ  ( ) Mỗi 12 giờ  (•) Hằng ngày  ( ) Hằng tuần [Thứ 2 ▾]
   Giờ chạy [01:15]   Giữ tối đa [7] bản
   ⓘ Giảm số bản thì các bản thừa bị xoá ở lượt sao lưu kế tiếp.      [Huỷ] [Lưu]

 Hộp [Xoá] bản nền cũ nhất:
   "Xoá bản nền 03/11/2026 01:15 (1,2 GB)? Sau khi xoá chỉ phục hồi theo thời
    điểm được từ 04/11/2026 01:15."   ☐ Xoá cả bản ở bản sao ngoài   [Huỷ] [Xoá]
```

### Thẻ 4 — Tệp log

```text
 Hôm nay (đang ghi, chưa nén) · 48 MB                Tra mã tra cứu [__________] [Tra]
   Service [policy ▾]  Mức [Lỗi + Cảnh báo ▾]                              [Xem]

 Tệp log đã nén: 30 / 30 · tổng 182 MB   ⓘ Chỉ giữ 30 tệp gần nhất; tệp cũ nhất
                                            tự xoá khi có tệp mới.
 Tệp                         Ngày          Cỡ       Thao tác
 log-2026-11-04.tar.gz       04/11/2026    6,1 MB   [Tải] [Xoá]
 log-2026-11-03.tar.gz       03/11/2026    5,8 MB   [Tải] [Xoá]
 …
 log-2026-10-06.tar.gz       06/10/2026    5,2 MB   [Tải] [Xoá]   ← sẽ tự xoá đêm nay

 [Xem] mở ngăn: 500 dòng cuối của service đã chọn (chỉ tệp đang ghi hôm nay), dòng LỖI
 tô đỏ, bấm trace_id → mở Nhật ký kiểm toán lọc đúng mã ấy. Log ngày cũ: tải tệp nén.
```

### Thẻ 5 — Thư & hàng đợi

```text
 Thư hỏng chưa xử lý (4)       → bảng hiện có, giữ nút "Gửi lại"
 Sự kiện chờ phát theo nguồn:  policy 0 · customer 0 · catalog 0 · document 0 · identity 0
 Hàng đợi lỗi RabbitMQ:        ntf 0 · doc 0 · pol 0 · aud 0 · rpt 0
 Hạn xử lý hồ sơ: 14 ngày      → khối cấu hình hiện có, dời từ trang Người dùng
```

### Thẻ 6 — Lịch tự động & lịch sử thao tác

```text
 Việc định kỳ        Lịch                    Lần chạy cuối    Kết quả
 Sao lưu CSDL        theo cấu hình (01:15)   05/11 01:15      ✓
 Sao lưu kho tệp     theo cấu hình (02:00)   05/11 02:00      ✓
 Nén log ngày trước  00:15 hằng ngày         05/11 00:15      ✓ 1 tệp, xoá 1 tệp cũ
 Thu log hạ tầng     5 phút một lần          05/11 09:40      ✓
 Đo ổ đĩa            hằng giờ                05/11 09:00      ✓
 Dọn dữ liệu hết hạn mỗi 24 giờ (sla-worker) 05/11 03:00      ✓ [Chi tiết]
   └ phiên đăng nhập 41 · mã kích hoạt 2 · outbox 1.204 · tệp Excel 3 · thông báo 88
 (dòng đỏ khi quá một chu kỳ không chạy)

 Lịch sử thao tác (ai · lúc nào · việc · kết quả · [Xem đầu ra])
```

## Các bước thực thi (sau khi mockup được duyệt)

0. **Mockup HTML tương tác** dựng bằng `apps/web/src/styles/tokens.css` + `app.css`, publish Artifact để duyệt.
1. **Chặng A — tệp log**: logger JSON + exception filter ở `packages/http-kit`, gắn vào `main.ts` của 10 service;
   bind mount `CSBH_LOG_DIR` ở `deploy/compose.yml` / `compose.prod.yml` / `compose.demo.yml` (quyền ghi của user
   trong ảnh); `deploy/env.mau` thêm biến; `scripts/luu-log.sh` đổi đích cho hạ tầng.
2. **Chặng B — nền vận hành**: migration schema `ops` (`job`, `job_log`, `agent_heartbeat`, `cron_run`,
   `cau_hinh_sao_luu`, `mau_o_dia`, `cau_hinh_o_dia`); service `van-hanh` (service thứ 11, cùng ảnh
   `csbh-service`) gắn log + `pgbackup` + `pgarchive` + bản sao ngoài, API `/ops/*`, việc nén log, đo ổ; đường
   gateway ở `services/gateway/src/proxy/routes.ts` (+ `tests/http/gateway.test.ts`); tác tử
   `scripts/tac-tu-van-hanh.sh` + unit systemd, danh sách trắng (`sao-luu`, `sao-luu-tep`,
   `thu-log-ha-tang`, `do-volume`, `trang-thai-container`); `./csbh sao-luu --neu-den-han` + `backup.sh` /
   `basebackup.sh` nhận `KEEP_*` từ cấu hình; cron mới ở `deploy/cron/`; `cai-dat.sh` cài tác tử; `dong-goi.sh`;
   `xuat/nhap-chuyen-may` mang thư mục log.
3. **Chặng C — giao diện**: `apps/web/src/pages/VanHanh.tsx` + `components/van-hanh/*` (biểu đồ nhỏ dùng lại
   `components/bieu-do/ve.ts`); khoá `vanHanh` ở `QUYEN_XEM` + mục cuối `DIEU_HUONG` (`apps/web/src/lib/can.ts`);
   dời `TheHeThong` khỏi `NguoiDung.tsx`; mã lỗi mới (`AGENT_OFFLINE`, `JOB_RUNNING`, `JOB_NOT_ALLOWED`,
   `LOG_DANG_GHI`, `LOG_KHONG_CO`, `SAO_LUU_CUOI_CUNG`, `SAO_LUU_KHONG_CO`, `LICH_SAO_LUU_SAI`) ở
   `apps/web/src/lib/loi.ts`.
4. Đồng bộ `docs/05-VAN-HANH.md` (§1, §2 cron, §3 sao lưu, §6 chỗ dữ liệu nằm), `04-TRIEN-KHAI.md`, HDSD phần
   Quản trị, nhật ký từng chặng.

## Bộ kiểm (chốt 05/11: phủ HẾT thao tác người dùng và bảo đảm mọi việc định kỳ chạy đúng)

Hai công cụ dựng chung, dùng cho mọi ca dưới đây:

- **Đồng hồ giả**: mọi script và việc định kỳ đọc giờ qua MỘT chỗ (`CSBH_BAY_GIO` cho script, `bayGio()` ở
  `http-kit` cho service) — bộ kiểm đặt giờ tuỳ ý để thử nửa đêm, chạy bù, đến hạn/chưa đến hạn. Có ca quét mã
  nguồn cấm `date`/`new Date()` trần trong các tệp ấy (lối `0208`).
- **`docker` giả** đặt đầu `PATH` (khuôn `tests/http/csbh-keo-anh.test.ts`): chạy CHÍNH `scripts/csbh` và
  `scripts/tac-tu-van-hanh.sh`, ghi mọi lượt gọi ra tệp để đọc lại; `pg_dump`/`mc` chạy thật trong thư mục tạm khi
  ca cần tệp thật.

### A. Mỗi thao tác của người dùng — một ca HTTP (máy chủ) + một ca giao diện (`tests/web`)

| Thẻ | Thao tác | Các nhánh phải có ca |
|---|---|---|
| (chung) | mở trang | chỉ Quản trị thấy mục menu; 5 vai trò khác gọi mọi `/ops/*` → 403; `QUYEN_XEM` ↔ `DIEU_HUONG`; tải trang khi `van-hanh` chết → câu lỗi tải, không trang trắng |
| Sức khoẻ | xem | mọi thành phần sống → xanh; một service không trả lời → đỏ đúng dòng ấy; tác tử mất nhịp tim > 60 s → "mất liên lạc" + mọi nút cần tác tử xám; mỗi cảnh báo dẫn đúng thẻ |
| Ổ đĩa | xem / sửa ngưỡng / bật-tắt thư | ngưỡng hợp lệ lưu được; ngoài 1–99, không phải số → 400 + lỗi dưới ô; dự báo hiện "chưa đủ dữ liệu" khi < 7 mẫu; bản sao ngoài cùng ổ → cảnh báo |
| Sao lưu CSDL | Sao lưu ngay | tạo việc → tác tử chạy → bản mới ở đầu bảng; bấm hai lần → lần hai 409 `JOB_RUNNING`; tác tử chết → nút xám, gọi thẳng API → 409 `AGENT_OFFLINE`; lượt hỏng → việc đỏ kèm đầu ra, không để tệp `.partial` |
| | Tải | dump: đúng byte (so sha256), `Content-Disposition` an toàn; bản nền: tar luồng giải ra đủ `base.tar.gz` + `pg_wal.tar.gz`; tên không tồn tại → 404 |
| | Xoá | bản cũ → biến mất; kèm/không kèm bản sao ngoài đúng hai nơi; bản mới nhất → 409 `SAO_LUU_CUOI_CUNG`; đang sao lưu → 409; tên độc hại (`../`, `%2e%2e`, `base/../..`, tên lạ) → 400; câu "cửa sổ phục hồi còn từ…" trong hộp xác nhận đúng mốc |
| | Sửa lịch | bốn tần suất lưu và đọc lại đúng; `HANG_TUAN` thiếu thứ → 400; giờ sai dạng → 400; N ngoài 1–60 → 400; câu "lần tới" tính đúng cho từng tần suất |
| Sao lưu kho tệp | Sao lưu ngay / Xoá bản chụp / Sửa lịch | như CSDL (trừ Tải — không có nút, gọi API → 404); xoá bản chụp cũ không làm hỏng bản mới (đọc lại mọi tệp của bản mới) |
| | Chép lệnh phục hồi | chọn dòng → câu lệnh mang ĐÚNG tên tệp/bản chụp ấy; hai khối không có nút chạy nào |
| Tệp log | xem hôm nay | lọc service, mức, `traceId` cho đúng dòng; tệp chưa có (service chưa ghi gì) → "chưa có dòng nào", không 500 |
| | Tải tệp nén | đúng byte; giải nén ra đủ 16 tệp |
| | Xoá tệp nén | biến mất; tên độc hại → 400; xoá thư mục hôm nay → 409 `LOG_DANG_GHI` |
| | Tra mã | `trace_id` có trong log → hiện dòng; bấm → màn hình Nhật ký lọc đúng mã |
| Thư & hàng đợi | Gửi lại thư hỏng · sửa hạn xử lý | dời nguyên các ca hiện có của `TheHeThong` sang trang mới, không bớt ca nào (đếm số ca trước/sau) |
| Lịch tự động | xem · Xem đầu ra | mỗi việc định kỳ một dòng; quá một chu kỳ không chạy → đỏ; đầu ra cuộn đúng thứ tự `job_log` |

Kèm cho mọi thao tác ghi: **một dòng nhật ký kiểm toán** đúng người, đúng đối tượng (ca quét mọi đường `POST`/
`DELETE`/`PUT` của `/ops/*`); **mã lỗi mới khai ở `lib/loi.ts`** (ca `tests/web/loi.test.tsx` có sẵn sẽ bắt); mọi
hộp xác nhận có nút đóng (ca `0237` có sẵn).

### B. Mỗi việc định kỳ — sáu tính chất, mỗi tính chất một ca

| Việc | Ai chạy | Chu kỳ |
|---|---|---|
| Sao lưu CSDL | cron → `./csbh sao-luu --neu-den-han` | 15 phút kiểm hạn |
| Sao lưu kho tệp | cron → `./csbh sao-luu-tep --neu-den-han` | 15 phút kiểm hạn |
| Nén log ngày trước + giữ 30 tệp | `van-hanh` | 00:15 |
| Thu log hạ tầng | tác tử | 5 phút |
| Đo ổ đĩa (+ thư vượt ngưỡng) | `van-hanh` + tác tử | hằng giờ |
| Nhịp tim tác tử | tác tử | vài giây |
| Dọn dữ liệu hết hạn | `sla-worker` | 24 giờ |

Với **mỗi** việc trên:

1. **Đúng giờ**: đồng hồ giả trước hạn 1 phút → không chạy; đúng/qua hạn → chạy. Với hai lịch sao lưu: đủ bốn tần
   suất, cả mốc nửa đêm và đổi tuần.
2. **Làm đúng việc**: kiểm KẾT QUẢ chứ không kiểm "đã gọi" — có tệp/bản ghi mới, nội dung đọc lại được (dump
   `pg_restore --list`, tar giải nén được, số dòng log khớp, số dòng xoá khớp `sys.retention_run`).
3. **Giới hạn**: sau lượt chạy số bản/tệp đúng bằng giới hạn, bản bị xoá là bản cũ nhất (sao lưu: N; log: 30).
4. **Chạy lại không hỏng** (idempotent): chạy hai lần liền → lần hai không tạo bản trùng, không xoá thêm.
5. **Chạy bù**: bỏ lỡ k chu kỳ (máy tắt) → lượt sau làm đủ phần còn thiếu (log: nén từng ngày sót) hoặc đúng một
   lượt (sao lưu: không chạy k lượt dồn).
6. **Hỏng giữa chừng không mất dữ liệu**: giết tiến trình giữa lượt → không còn `.partial`, bản cũ còn nguyên,
   `ops.cron_run` ghi `LOI` kèm câu lỗi, thẻ Lịch tự động hiện đỏ; lượt sau tự lành.

Thêm ba ca đối chiếu: mỗi dòng trong `deploy/cron/*` gọi một lệnh con **có thật** của `./csbh` (lệnh gõ sai tên
thì cron chạy lặng lẽ không làm gì); mỗi việc định kỳ khai ở mã nguồn có **đúng một** dòng trên thẻ Lịch tự động
và ngược lại; hai lịch sao lưu và lượt nén log không chạy chồng nhau (`flock` / `pg_advisory_lock`).

### C. Phá lại

Theo luật chặng: hoàn tác từng chốt (luật xoá bản mới nhất, regex tên, giới hạn N/30, `--neu-den-han`, kiểm trước
khi xoá bản gốc, `flock`, quyền `ADMIN`) và ghi ca nào đỏ ở tầng nào; ca nào vẫn xanh thì ghi lý do.

## Kiểm chứng

- `make test` xanh, **ghi tổng số ca trước/sau** (bài học P257 — đọc số ca, không chỉ chữ "xanh"); ca mới:
  - logger: đúng thư mục ngày theo giờ VN (23:59 → 00:00), mang `traceId` của request, 5xx có stack;
  - nén log: một ngày → đúng một `tar.gz` chứa đủ mọi tệp service, tệp gốc chỉ xoá sau khi kiểm, chạy hai lần
    không hỏng, không đụng hôm nay; có 30 tệp rồi tạo tệp thứ 31 → tệp cũ nhất bị xoá, còn đúng 30; máy tắt 3 ngày
    → lượt bù tạo 3 tệp và vẫn còn 30;
  - sao lưu: không xoá được bản dump/bản nền mới nhất (409), tên độc hại (`../`, `%2e%2e`, tên lạ) → 400, xoá
    khi đang chạy → 409, `caBanSaoNgoai` xoá đúng hai nơi;
  - lịch: `--neu-den-han` chạy/không chạy đúng theo bốn tần suất và lần thành công gần nhất, cho CẢ HAI lịch;
    CSDL không đọc được → vẫn sao lưu theo mặc định; giá trị ngoài khoảng → 400; hai lịch không chạy chồng nhau;
  - giữ tối đa N: có N bản rồi chạy lượt N+1 → còn đúng N, bản bị xoá là bản cũ nhất, ở cả tại chỗ lẫn bản sao
    ngoài; hạ N từ 7 xuống 3 → lượt sau còn 3; WAL dọn theo bản nền cũ nhất còn giữ;
  - bản chụp kho tệp: tệp không đổi dùng chung inode với bản trước (đếm `stat -c %h`); tệp xoá khỏi MinIO vắng ở
    bản chụp mới nhưng còn ở bản cũ; xoá bản cũ không làm hỏng bản mới; `phuc-hoi-tep <bản>` chép đúng bản ấy;
  - ổ đĩa: dự báo đúng trên chuỗi mẫu dựng sẵn; vượt ngưỡng gửi thư đúng một lần;
  - quyền: `bld01`/TDV gọi `/ops/*` → 403 (SEC-13 phủ); mọi tải/xoá có dòng nhật ký kiểm toán;
  - tác tử: danh sách trắng từ chối `; rm -rf`, tháng sai dạng; `QUYEN_XEM` ↔ `DIEU_HUONG`.
- Phá lại từng chốt theo luật chặng.
- **Dựng thật** chồng production + tác tử: mười service sinh đủ tệp log; qua nửa đêm → một tệp nén cho cả ngày, tệp cũ nhất
  ngoài 30 biến mất; đổi lịch sang mỗi 6
  giờ → cron chạy đúng giờ mới; Sao lưu ngay → bản mới ở đầu bảng; tải một dump rồi `pg_restore --list` đọc được;
  xoá một bản cũ (cả bản sao ngoài) → biến mất ở cả hai nơi; tạo tệp lớn để ổ vượt ngưỡng → cảnh báo + một lá thư;
  dừng tác tử → nút xám nhưng sao lưu theo lịch **vẫn chạy**.
