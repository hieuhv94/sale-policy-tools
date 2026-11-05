# Vận hành Chính sách bán hàng

Dành cho người giữ máy chủ. Cài đặt lần đầu ở [04-TRIEN-KHAI.md](04-TRIEN-KHAI.md).

Mọi lệnh chạy từ thư mục bộ cài (`/opt/csbh` hoặc nơi bạn giải nén).
`./csbh help` liệt kê đầy đủ.

---

## 1. Việc hằng ngày

```sh
./csbh trang-thai      # service nào đang sống
./csbh log             # 200 dòng cuối, theo dõi tiếp
./csbh log policy      # chỉ một service
./csbh phien-ban       # thẻ ảnh đang chạy
```

Hệ khoẻ thì `trang-thai` cho mọi service `running (healthy)`, trừ `ops` — nó
chạy migration rồi thoát, và `Exited (0)` là đúng.

---

## 2. Lịch tự động — bắt buộc cài

```sh
sudo cp deploy/cron.mau /etc/cron.d/csbh
sudo chmod 644 /etc/cron.d/csbh
sudo sed -i 's|/opt/csbh|<đường dẫn thật>|' /etc/cron.d/csbh
```

| Việc | Khi nào | Vì sao |
|---|---|---|
| `sao-luu` | hằng đêm 01:15 | pg_dump + bản nền |
| `don-du-lieu` | ngày 1 hằng tháng | xoá dữ liệu quá hạn lưu trữ, dọn outbox đã gửi |
| `luu-audit` | ngày 1 hằng tháng | trích nhật ký kiểm toán tháng cũ ra kho |
| `dien-tap` | ngày 8 hằng tháng | phục hồi thử vào CSDL nháp |

> **Không cài cron là bỏ mất một nửa cam kết phục hồi.** Các lệnh chạy được từ
> lúc bàn giao, nhưng chúng chỉ chạy khi có người gõ. Một cam kết RPO mà phụ
> thuộc vào việc ai đó nhớ gõ lệnh là một cam kết không có thật.

Kết quả ghi vào `/var/log/csbh-*.log`, **không gửi thư**. Cron gửi thư mỗi khi
lệnh in ra bất cứ thứ gì, kể cả lượt chạy đúng — nên hộp thư sẽ ngập, rồi người
ta lọc chúng đi, rồi lượt hỏng thật cũng bị lọc theo.

**Việc phải làm bằng mắt, mỗi tuần một lần:** xem tuổi của tệp sao lưu mới nhất.
Một bản sao lưu ba tuần tuổi trông giống hệt một bản sao lưu tối qua, cho tới
lúc cần dùng.

---

## 3. Sao lưu và phục hồi

```sh
./csbh sao-luu               # thủ công, ngoài lịch
./csbh dien-tap              # phục hồi vào CSDL NHÁP — an toàn, chạy lúc nào cũng được
./csbh phuc-hoi <tệp>        # ĐÈ lên dữ liệu đang chạy — hỏi lại trước khi làm
```

**Cam kết**: mất tối đa **5 phút** dữ liệu (RPO), chạy lại trong **60 phút**
(RTO). Chi tiết ở [RPO-RTO.md](../deploy/RPO-RTO.md).

Con số RPO 5 phút đến từ WAL archiving, **không** từ bản sao lưu hằng đêm. Điều
kiện để nó đúng là `archive_command` thật sự chạy:

```sh
./csbh psql -c "SELECT archived_count, last_archived_time, failed_count, last_failed_time FROM pg_stat_archiver"
```

`failed_count` khác 0, hoặc `last_archived_time` cũ hơn 10 phút trên một hệ đang
dùng, là **hỏng**. Nó từng hỏng lặng lẽ một lần: CSDL vẫn xanh, healthcheck vẫn
xanh, chỉ có WAL không được lưu.

`phuc-hoi` hỏi lại và bắt gõ `PHUC-HOI` để tiếp tục. Mọi hồ sơ lập sau thời điểm
sao lưu sẽ mất — nên gần như luôn luôn thứ bạn muốn là `dien-tap`.

**`<tệp>` là TÊN tệp trong thư mục sao lưu**, ví dụ `csbh-20261024T011500Z.dump` —
không phải đường dẫn trên máy chủ. Gõ `./csbh phuc-hoi` không kèm gì để xem danh
sách. Từ `0240`, `phuc-hoi` an toàn theo ba nghĩa, đều đã diễn tập:

- tệp sai tên, không phải bản dump, hay hỏng giữa lúc nạp → **dừng, CSDL đang chạy
  không bị đụng tới**;
- bản sao lưu nạp vào một CSDL tạm, xong mới **đổi chỗ** — phần mềm gián đoạn vài giây,
  service tự nối lại;
- CSDL cũ **giữ lại** dưới tên `csbh_truoc_phuc_hoi_<giờ>` (chặn kết nối). Cần chỗ
  trống cho hai bản CSDL trong lúc phục hồi. Xoá bản cũ khi đã chắc chắn — câu lệnh
  in ra ở cuối.

Máy chủ MỚI (mất máy): `./csbh len` như cài mới rồi `phuc-hoi` — role của các service
tự dựng lại nếu thiếu.

### Bản sao lưu nằm ở đâu, giữ bao lâu

| | Chỗ | Giữ |
|---|---|---|
| Bản dump (`csbh-*.dump`) | volume `pgbackup` và `CSBH_BACKUP_MIRROR` | 14 ngày |
| Bản nền (PITR) | `pgbackup/base` và `CSBH_BACKUP_MIRROR/base` | 3 bản gần nhất |
| WAL | volume `pgarchive` và `CSBH_BACKUP_MIRROR/wal` | từ bản nền cũ nhất còn giữ |

`CSBH_BACKUP_MIRROR` phải nằm trên **ổ khác** (hoặc NAS). Bản sao ngoài được chép mỗi
đêm, nên chỉ với nó thì phục hồi được về **lúc sao lưu đêm gần nhất**; WAL trong ngày
chỉ nằm ở volume `pgarchive`.

### Phục hồi về một THỜI ĐIỂM (PITR)

Dùng khi cần lùi về **trước một thao tác sai** (xoá nhầm, sửa nhầm hàng loạt) mà bản
dump đêm qua thì quá xa. Chưa có lệnh `./csbh` riêng; các bước dưới đây **đã chạy
nguyên văn trên bản diễn tập** (`0240`). Ý tưởng: dựng một Postgres TẠM từ bản nền +
WAL, dừng đúng mốc, xuất ra một bản dump, rồi đưa bản dump ấy qua `phuc-hoi` — nên
mọi chốt an toàn ở trên vẫn áp dụng, và CSDL đang chạy không bị đụng tới cho tới bước
cuối.

```sh
P=csbh-prod                         # COMPOSE_PROJECT_NAME trong .env
MOC='2026-10-24 10:15:00+07'        # thời điểm muốn lùi về — TRƯỚC thao tác sai
NEN=$(docker run --rm -v ${P}_pgbackup:/b alpine ls -1 /b/base | sort | tail -1)
#   ^ bản nền phải CŨ HƠN mốc; nếu bản mới nhất mới hơn mốc, chọn bản trước nó.

# 1. Bung bản nền vào một volume tạm. Phải chown về uid 70 (Postgres).
docker run --rm -v ${P}_pgbackup:/b:ro -v ${P}_pitr:/d postgres:16-alpine sh -ec "
  mkdir -p /d/pg && cd /d/pg
  tar -xzf /b/base/$NEN/base.tar.gz && tar -xzf /b/base/$NEN/pg_wal.tar.gz -C pg_wal
  touch recovery.signal && chown -R 70:70 /d/pg && chmod 700 /d/pg"

# 2. Chạy Postgres TẠM, đọc WAL từ kho, dừng ở mốc. archive_mode=off: không ghi gì
#    vào kho WAL thật. max_connections KHÔNG được thấp hơn máy chính (200, xem
#    deploy/postgres/postgresql.conf) — thấp hơn thì Postgres TỪ CHỐI phục hồi.
docker run -d --name csbh-pitr -e PGDATA=/d/pg -v ${P}_pitr:/d \
  -v ${P}_pgarchive:/wal:ro -v ${P}_pgbackup:/backup postgres:16-alpine \
  postgres -c max_connections=200 -c archive_mode=off -c "restore_command=cp /wal/%f %p" \
  -c "recovery_target_time=$MOC" -c recovery_target_action=promote

# 3. Đợi Postgres tạm đọc xong WAL (vài giây tới vài phút tuỳ lượng WAL), rồi
#    KIỂM trước khi tin: phải có dòng "recovery stopping before …".
until docker exec csbh-pitr psql -U postgres -tAc 'select not pg_is_in_recovery()' 2>/dev/null | grep -q t; do
  docker ps -q -f name=csbh-pitr | grep -q . || { echo "Postgres tạm đã DỪNG — đọc log dưới"; break; }
  sleep 2
done
docker logs csbh-pitr 2>&1 | grep -E 'recovery stopping|recovery aborted|FATAL|DETAIL|Permission denied'
```

> **Không có dòng `recovery stopping`** nghĩa là Postgres hết WAL TRƯỚC mốc — và nó
> **không báo lỗi**: một tệp WAL không đọc được (sai quyền, thiếu tệp) bị coi như hết
> WAL, Postgres mở CSDL ra ở chỗ dừng sớm. Đo được ở diễn tập: WAL chép bằng root
> (`0600`) làm mất hai đêm dữ liệu mà lượt phục hồi vẫn "xong". Đừng đi tiếp.

```sh
# 4. Xuất bản dump của thời điểm ấy vào thư mục sao lưu, rồi dọn Postgres tạm.
docker exec csbh-pitr sh -c 'pg_dump -U postgres -Fc -d csbh -f /backup/csbh-pitr.dump'
docker rm -f csbh-pitr && docker volume rm ${P}_pitr

# 5. Kiểm bằng diễn tập, rồi mới đè.
docker compose --env-file .env -f deploy/compose.yml -f deploy/compose.prod.yml \
  run --rm ops restore-drill csbh-pitr.dump
./csbh phuc-hoi csbh-pitr.dump
```

Lấy WAL từ **bản sao ngoài** (khi volume hỏng): thay `${P}_pgarchive` bằng
`$CSBH_BACKUP_MIRROR/wal` và `${P}_pgbackup` ở bước 1 bằng `$CSBH_BACKUP_MIRROR`.

### Kho tệp — có lệnh, CHƯA chạy định kỳ `sửa 05/11`

**Kho tệp MinIO** (bản scan đã ký, bản mềm, giấy tờ pháp lý, văn bản mẫu) KHÔNG nằm
trong `sao-luu` hằng đêm. Có lệnh riêng, gõ tay:

```sh
./csbh sao-luu-tep      # chép phần mới vào /backup/tep và CSBH_BACKUP_MIRROR/tep
./csbh phuc-hoi-tep     # chép từ bản sao lưu trở lại kho — không xoá gì; hỏi lại trước
```

`sao-luu-tep` in ra số **khoá tệp CSDL trỏ tới mà bản sao lưu không có** — phải là 0.

> **Cái giá của việc chưa gắn vào cron** (chốt 05/11): mất máy đột ngột thì tệp chỉ
> phục hồi được tới lần `sao-luu-tep` gần nhất. CSDL thì vẫn về được 5 phút trước —
> nên có thể có hồ sơ mà bản scan của nó không còn ở đâu. Gắn vào cron là thêm một
> dòng vào `cron.mau` ngay sau dòng `sao-luu`.

### Chuyển sang máy khác `mới 05/11`

Hai lệnh, một ở mỗi máy. Xong là máy mới có **đúng y** dữ liệu của máy cũ — và lệnh
nhập **tự đối chiếu** trước khi bật phần mềm: từng bảng (số dòng + md5 nội dung),
từng sequence, từng tệp trong kho (sha256, đọc lại từ chính MinIO của máy mới), và
mọi khoá tệp mà CSDL trỏ tới. Lệch một thứ là nó **không bật phần mềm** và in ra chỗ
lệch.

**Máy cũ:**

```sh
./csbh xuat-chuyen-may
```

Hỏi `CHUYEN-MAY` và một mật khẩu cho gói bí mật (tối thiểu 12 ký tự, gõ hai lần). Rồi:

1. chặn lối vào (`caddy`, `gateway`, `sla-worker`) — từ đây không ai ghi được gì;
2. **chờ xả**: mọi sự kiện còn trong outbox và mọi tin trong hàng đợi RabbitMQ phải
   về 0 (thư sắp gửi, nhật ký sắp ghi). Quá 3 phút thì DỪNG, chưa xuất gì;
3. dừng các service còn lại, xuất CSDL, xuất kho tệp, chép nhật ký kiểm toán đã trích
   (`logarchive`), dựng bảng kê;
4. ra hai tệp trong `./chuyen-may/<giờ>/`:
   - `chuyen-may-<giờ>.tar` + `.sha256` — dữ liệu;
   - `bi-mat-<giờ>.enc` — `.env` + `secrets/`, **mã hoá** (AES-256, PBKDF2 600.000 vòng).

Máy cũ **để tắt** phần mềm sau đó — thứ gì ghi thêm sau mốc xuất sẽ không có trên máy
mới. Thôi chuyển thì `./csbh len`.

**Chép hai tệp sang máy mới**, theo hai đường khác nhau nếu được. **Mất mật khẩu là
không mở được gói bí mật**, và không có nó thì máy mới không mở được CSDL — cất mật
khẩu vào nơi cất mật khẩu của công ty.

**Máy mới** — giải nén bộ cài **CÙNG phiên bản** với máy cũ, **KHÔNG** chạy `cai-dat.sh`:

```sh
tar -xzf csbh-<bản>.tar.gz && cd csbh-<bản>
docker login <registry>
./csbh nhap-chuyen-may <đường-dẫn>/chuyen-may-<giờ>.tar <đường-dẫn>/bi-mat-<giờ>.enc
```

Lệnh từ chối khi: thư mục đã có `.env` hay `secrets/`; máy đã có CSDL của dự án ấy;
bộ cài khác phiên bản máy cũ (nâng bản là việc RIÊNG, làm SAU khi chuyển xong); sai
mật khẩu; gói dữ liệu không khớp `.sha256` (chép hỏng giữa đường).

Đi nguyên qua lượt chuyển: tài khoản và mật khẩu · mã hồ sơ đề xuất tiếp theo
(sequence) · mọi tệp · nhật ký kiểm toán cả phần đã trích · cấu hình thư và Google ·
**phiên đăng nhập đang mở** — một phiên chỉ cần khoá JWT và bảng phiên, và diễn tập
05/11 đo được cả hai trùng nhau (khoá trùng từng byte, bảng `idn.refresh_token` trùng
md5); chưa thử bằng một phiên thật trên trình duyệt.

Sau khi nhập: trỏ DNS về máy mới; địa chỉ đổi thì sửa `SITE_URL` và redirect URI ở
Google Console; **cài lại cron** (nó nằm ở `/etc/cron.d` của máy cũ, không đi theo gói);
**tắt hẳn máy cũ** — hai máy cùng chạy là hai máy cùng gửi thư nhắc hạn.

Không đi theo gói, có chủ ý: bản sao lưu cũ (`pgbackup`, `CSBH_BACKUP_MIRROR`) — máy mới
bắt đầu chuỗi sao lưu của nó từ đêm đầu tiên; chứng chỉ TLS — Caddy xin lại.

> **Ảnh MinIO**: kho `minio/minio` đã biến khỏi Docker Hub (`0235`). Máy mới chưa từng
> có ảnh ấy thì `nhap-chuyen-may` dừng ở bước dựng hạ tầng — chép ảnh từ máy cũ bằng
> `docker save minio/minio:RELEASE.2024-09-22T00-33-43Z | gzip > minio.tar.gz` rồi
> `docker load` ở máy mới, trước khi nhập.

---

## 4. Thư không tới — tra theo thứ tự này

Thư mời kích hoạt là **đường duy nhất** để một tài khoản mới có mật khẩu, nên
"không nhận được thư" và "không đăng nhập được" là cùng một sự cố.

**1. Service có sống không?**

```sh
./csbh trang-thai
```

`notification` hoặc `identity` không chạy thì gần như chắc chắn là cấu hình thư.
Ba chốt chặn dừng service **ngay lúc khởi động**, và log nói rõ chốt nào:

```sh
./csbh log notification | grep -i mail
```

| Câu trong log | Sửa gì |
|---|---|
| `Production trỏ vào hộp thư giả` | `MAIL_HOST` đang là mailpit/localhost |
| `chưa khai MAIL_ALLOWLIST` | khai tên miền nhận thư |
| `có mục không phải tên miền` | một mục trong `MAIL_ALLOWLIST` gõ sai |
| `Thiếu bí mật` | `MAIL_PASSWORD_FILE` trỏ tới file không tồn tại |

**2. Thư có được nhận rồi bị loại không?** Địa chỉ người nhận ngoài
`MAIL_ALLOWLIST` bị loại. Đó là hành vi đúng, nhưng nếu công ty vừa thêm một tên
miền thì phải khai thêm:

```sh
# sửa MAIL_ALLOWLIST trong .env, nhiều miền ngăn bằng dấu phẩy
./csbh len
```

Cùng danh sách ấy chặn ở **màn hình tạo tài khoản**: email ngoài danh sách thì
Quản trị không tạo được tài khoản, và câu báo kể ra các tên miền đang được phép.
Nghe "không tạo được tài khoản cho người mới" thì kiểm biến này trước tiên —
`nutricare.com.vn` **không** phải miền con của `nutricare.vn`, phải khai riêng.

**3. Thư có rời khỏi hệ thống không?** Xem hộp *Thư hỏng* trong phần mềm (màn
hình Quản trị). Thư gửi ba lần không được thì vào đó kèm nguyên văn lỗi SMTP.

**4. Thư đi rồi mà không tới?** Gần như luôn là SPF/DKIM/DMARC của tên miền
`MAIL_FROM`. Kiểm hộp thư rác trước, rồi nhờ bên quản trị thư kiểm ba bản ghi ấy.

---

## 5. Nâng cấp và lùi bản

```sh
./csbh nang-cap 1.0.3
```

Sao lưu → đổi thẻ → kéo ảnh → migration → dựng lại. Lệnh in ra thẻ cũ khi xong;
lùi bản là chạy lại với thẻ ấy.

**Migration không lùi được.** Lùi ảnh về bản cũ trong khi CSDL đã đi tới lược đồ
mới là một trạng thái không được kiểm thử. Nếu một lượt nâng cấp hỏng ở phần
CSDL thì đường đúng là **phục hồi từ bản sao lưu ngay trước đó** — chính vì vậy
`nang-cap` sao lưu trước khi đụng vào bất cứ thứ gì.

### Lên bản mới nhất cho bản chạy thử, và làm sạch dữ liệu `mới 21/09`

```sh
./csbh upgrade
```

Không nhận thẻ nào: lệnh kéo **bản mới nhất** bên đóng gói đã đẩy lên (thẻ
`…-latest`), cho bạn thấy nó là bản số mấy, rồi mới hỏi xác nhận. Giống
`nang-cap`, **cộng thêm một việc không hoàn tác được**: CSDL bị xoá hẳn rồi dựng
lại từ trống, và kho tệp dọn sạch. Dùng khi bản chạy thử cần thử lại từ đầu trên
mã mới — **không dùng cho hệ đã có dữ liệu thật**.

| | |
| --- | --- |
| Mất gì | Mọi hồ sơ · khách hàng · danh mục · quy định chiết khấu · **mọi tài khoản, kể cả Quản trị** · mọi tệp đã tải lên · toàn bộ nhật ký kiểm toán |
| Giữ gì | Tệp `.env` (trừ dòng `CSBH_TAG`), bí mật trong `secrets/`, volume dữ liệu Postgres, và **đường hầm Cloudflare đang mở** |
| Hỏi lại | Có — in ra *"Bản đang chạy / Sẽ lên bản"*, rồi phải gõ `XOA-SACH`. Và lệnh **sao lưu trước** khi xoá |
| Sau đó phải làm | `./csbh mo-tai-khoan` → đăng nhập một lần để đổi mật khẩu → `./csbh nap-danh-muc` |
| Lấy lại dữ liệu vừa xoá | `./csbh phuc-hoi <tệp sao lưu>` — bản sao lưu nằm ngay trước lượt xoá |
| Về lại bản cũ | `./csbh nang-cap <thẻ cũ>` — lệnh in ra thẻ ấy khi xong |

**`./csbh phien-ban` vẫn in ra một CON SỐ, không phải `latest`.** Lệnh kéo ảnh
bằng thẻ `latest`, đọc số phiên bản thật ghi trong ảnh, rồi ghim **con số ấy**
vào `.env`. Nên sau lượt này hệ thống vẫn nói được nó đang chạy bản nào, và một
lượt `./csbh len` về sau không tự đổi sang bản mới hơn mà không ai chủ ý.

**Địa chỉ công khai KHÔNG đổi**, và đó là điểm khác `xuong` rồi `len`. Địa chỉ
của một quick tunnel chết theo tiến trình `cloudflared`, nên lệnh này cố ý không
đụng tới container ấy: nó **không kéo ảnh `cloudflared`** (thẻ `latest` của
Cloudflare đổi là container bị dựng lại) và **không ép dựng lại** container nào.
Xong việc nó **đo lại id container** và nói ra nếu id đã đổi — để người vận hành
biết ngay thay vì biết khi có người báo liên kết chết.

> **Lệnh dừng với *"ops-latest KHÔNG mang nhãn phiên bản"*?** Ảnh trên registry
> được dựng trước khi phần mềm biết ghi số vào ảnh. Bên đóng gói chạy lại
> `make dong-goi` rồi `make day-anh`; trong lúc chờ, dùng `./csbh nang-cap <thẻ>`.

> **`nang-cap` hay `upgrade`?** `nang-cap <thẻ>` giữ dữ liệu, nhận một thẻ cụ
> thể, và là lệnh dùng cho hệ thật. `upgrade` chỉ dành cho bản chạy thử, và câu
> hỏi để phân biệt là: *"sau lượt này có phải tạo lại tài khoản Quản trị không?"*
> — `upgrade` thì có.

---

## 5b. Chạy thử qua Internet — đường hầm Cloudflare

Dùng khi cần người ở nơi khác nhìn thấy màn hình mà **không** mở cổng trên tường
lửa và **không** cần tên miền.

```sh
./csbh mo-thu-nghiem      # hỏi lại một lần, rồi in ra địa chỉ công khai
./csbh dong-thu-nghiem    # đóng, trả cấu hình về như cũ
```

**Đây không phải đường triển khai.** Bàn giao thật vẫn là Caddy + tên miền +
chứng chỉ như [04-TRIEN-KHAI.md](04-TRIEN-KHAI.md).

Ba điều phải biết trước khi mở:

**1. Ai có địa chỉ là tới được màn hình đăng nhập.** Không có lớp chặn nào trước
nó. Đừng mở khi trong hệ đã có dữ liệu khách hàng thật.

**2. Địa chỉ ĐỔI mỗi lần mở lại.** Quick tunnel cấp một tên ngẫu nhiên
`*.trycloudflare.com`. Liên kết trong những lá thư đã gửi **chết** sau mỗi lần mở
lại — mà thư kích hoạt là đường duy nhất để một tài khoản mới có mật khẩu. Cần
địa chỉ cố định thì phải dùng named tunnel: tài khoản Cloudflare, một tên miền
trên đó, và một token.

**3. Giới hạn đăng nhập gộp về một xô chung.** Qua đường hầm mọi request tới từ
cùng một địa chỉ nội bộ, nên hạn mức theo IP không còn phân biệt được ai với ai.
Lớp phủ tự nới hạn mức ấy lên. **Khoá tài khoản sau 5 lần sai trong 15 phút vẫn
nguyên** — đó mới là lớp chống dò mật khẩu, và nó đếm theo tài khoản chứ không
theo IP.

Lệnh mở làm bốn việc, theo đúng thứ tự này: đặt Caddy về cổng 80 (thôi tự xin
chứng chỉ — TLS do biên Cloudflare lo), dựng đường hầm, đợi Cloudflare cấp địa
chỉ, rồi dựng lại `gateway` · `identity` · `notification` để CORS và liên kết
email trỏ đúng địa chỉ ấy. Cấu hình cũ cất trong tệp `.thu-nghiem`, và
`dong-thu-nghiem` trả lại nguyên văn.

---

## 6. Chỗ dữ liệu nằm

| Thứ | Ở đâu | Mất thì sao |
|---|---|---|
| CSDL | volume `pgdata` | mất hết. Phục hồi từ sao lưu. |
| Tệp đính kèm, bản mềm, mẫu văn bản | volume `miniodata` | hồ sơ còn, file mở ra báo lỗi có tên — trừ phần đã `sao-luu-tep` |
| WAL archive | volume `pgarchive` | RPO tụt từ 5 phút về 24 giờ |
| Bản sao lưu | `backup-mirror/` và volume `pgbackup` | không phục hồi được |
| Chứng chỉ TLS | volume `caddy_data` | Caddy xin lại; Let's Encrypt có hạn mức theo tuần |
| Bí mật | `secrets/` | **không dựng lại được** — mất khoá JWT là mọi phiên chết, mất mật khẩu Postgres là không mở được CSDL |

> `secrets/` **không** nằm trong bản sao lưu tự động, có chủ ý: bản sao lưu được
> chép đi nơi khác, còn bí mật thì không nên. Sao lưu nó **một lần, thủ công**,
> cất vào nơi cất mật khẩu của công ty.

---

## 7. Sự cố thường gặp

**Một service cứ khởi động lại.** `./csbh log <tên>`. Gần như luôn là thiếu một
file bí mật hoặc một biến bắt buộc — ở production hệ thống **dừng** thay vì chạy
tiếp bằng giá trị mặc định, và đó là hành vi đúng.

**Xem bản mềm hoặc xuất hợp đồng báo lỗi.** Kiểm `gotenberg`: nó chạy Chromium
và LibreOffice, và nó là thành phần ngốn bộ nhớ nhất. Máy hết RAM thì nó bị giết
trước tiên.

**Trang không mở được, chứng chỉ báo sai.** Kiểm DNS còn trỏ đúng IP không, và
`./csbh log caddy`. Caddy tự gia hạn chứng chỉ; nó chỉ hỏng khi cổng 80 bị chặn
— Let's Encrypt cần cổng ấy để xác minh.

**`relation "idn.app_user" does not exist`** khi chạy `./csbh mo-tai-khoan`. CSDL
chưa chạy migration. `docker compose run` tự khởi động Postgres, nên gọi lệnh mồi
trước `./csbh len` sẽ dựng một CSDL trống rồi chạy luôn. Tra:

```sh
./csbh psql -c "SELECT count(*) FROM sys.schema_migration"
```

Báo `does not exist` thì chạy `./csbh len` rồi gọi lại. Ra một con số thì lệnh mồi
đang nối tới CSDL **khác** — kiểm `COMPOSE_PROJECT_NAME` trong `.env`.

**`password authentication failed for user "postgres"`.** Xuất hiện ở bước migrate
hoặc ở bất kỳ lệnh nào chạm CSDL.

**Postgres đặt mật khẩu superuser CHỈ ở lần khởi tạo thư mục dữ liệu đầu tiên.**
Volume `pgdata` đã dựng từ trước giữ nguyên mật khẩu của lúc ấy; sinh lại
`secrets/pg_password.txt` hay sửa nó về sau **không đụng gì tới CSDL đã dựng**.

Ba nguyên nhân, theo thứ tự hay gặp:

1. Volume dựng ở một lượt cài trước, rồi `secrets/` được sinh lại
2. `COMPOSE_PROJECT_NAME` trùng một chồng khác trên cùng máy — dùng chung volume
   của chồng ấy, và mật khẩu của chồng ấy thắng
3. Volume dựng khi mật khẩu còn nằm trong `.env`, trước khi chuyển sang đọc file

**CSDL chưa có gì đáng giữ** — dựng lại từ đầu:

```sh
docker compose --env-file .env -f deploy/compose.yml -f deploy/compose.prod.yml down -v
./csbh len
```

> `down -v` **xoá sạch dữ liệu**, và nó nhắm vào đúng dự án ghi trong
> `COMPOSE_PROJECT_NAME`. Kiểm dòng ấy trước khi gõ.

**CSDL ĐÃ CÓ dữ liệu** — đổi mật khẩu bên trong Postgres cho khớp file, không xoá
gì:

```sh
# 1. Mở psql bằng đúng mật khẩu CŨ mà volume đang giữ
docker compose --env-file .env -f deploy/compose.yml -f deploy/compose.prod.yml \
  exec -e PGPASSWORD='<mật khẩu cũ>' postgres psql -U postgres -d csbh \
  -c "ALTER USER postgres PASSWORD '$(cat secrets/pg_password.txt)'"

# 2. Rồi dựng lại
./csbh len
```

Không nhớ mật khẩu cũ thì đường còn lại là phục hồi từ bản sao lưu vào một chồng
mới: `./csbh sao-luu` không chạy được (nó cũng cần mật khẩu), nên phải dùng bản
sao lưu gần nhất đã có.

**Đĩa đầy.** Ba thứ lớn dần: WAL archive, bản sao lưu, và log container. Log đã
giới hạn 50 MB × 10 tệp mỗi service. `don-du-lieu` hằng tháng dọn dữ liệu quá hạn
trong CSDL nhưng **không** dọn bản sao lưu cũ — đó là việc phải quyết theo chính
sách lưu trữ của công ty.

---

## 8. Việc KHÔNG làm được, để khỏi mất công đi tìm

- **Không có nút thu hồi.** *Từ chối*, *Đã xoá*, *Quá hạn duyệt* là trạng thái
  kết thúc. Quản trị hệ thống cũng không sửa được.
- **Không giao lại một hồ sơ lẻ.** Đổi người phụ trách chỉ xảy ra ở hai chỗ: lúc
  chọn người trong luồng, và lúc vô hiệu hoá tài khoản.
- **Không xoá được tài khoản**, chỉ vô hiệu hoá kèm bàn giao.
- **Không đổi được vai trò** của một tài khoản. Cần đổi thì vô hiệu hoá rồi tạo mới.
- **Nhật ký kiểm toán chỉ ghi thêm**, chặn ở tầng CSDL. Không ai sửa hay xoá được
  một dòng, kể cả người có quyền quản trị CSDL.
