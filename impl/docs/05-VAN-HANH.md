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
./csbh nang-cap 1.0.1
```

Sao lưu → đổi thẻ → kéo ảnh → migration → dựng lại. Lệnh in ra thẻ cũ khi xong;
lùi bản là chạy lại với thẻ ấy.

**Migration không lùi được.** Lùi ảnh về bản cũ trong khi CSDL đã đi tới lược đồ
mới là một trạng thái không được kiểm thử. Nếu một lượt nâng cấp hỏng ở phần
CSDL thì đường đúng là **phục hồi từ bản sao lưu ngay trước đó** — chính vì vậy
`nang-cap` sao lưu trước khi đụng vào bất cứ thứ gì.

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
| Tệp đính kèm, bản mềm, mẫu văn bản | volume `miniodata` | hồ sơ còn, file mở ra báo lỗi có tên |
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
