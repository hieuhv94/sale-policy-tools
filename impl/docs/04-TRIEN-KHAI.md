# Triển khai Chính sách bán hàng lên máy chủ

Từ một máy chủ trắng tới màn hình đăng nhập, theo đúng thứ tự phải làm.

**Đọc hết mục 1 trước khi đụng tới máy chủ.** Sáu thứ trong đó cần người khác
quyết, và thiếu một thứ là dừng ở giữa chừng.

| Xong rồi thì đọc tiếp | |
| --- | --- |
| [05-VAN-HANH.md](05-VAN-HANH.md) | sao lưu, phục hồi, sự cố, nâng cấp |
| [03-HUONG-DAN-SU-DUNG.md](03-HUONG-DAN-SU-DUNG.md) | dành cho người dùng cuối |
| [RPO-RTO.md](../deploy/RPO-RTO.md) | cam kết mất bao nhiêu dữ liệu, bao lâu chạy lại |

---

## Trình tự — làm từ trên xuống, không đảo

Mười ba bước. Cột cuối nói bước ấy **bắt buộc phải sau bước nào**, và vì sao —
đảo thứ tự ở những chỗ ấy thì hỏng, chứ không phải chỉ bất tiện.

### Trước khi đụng tới máy chủ

| # | Bước | Phải sau | Vì sao |
| --- | --- | --- | --- |
| 1 | Chốt sáu thứ ở [mục 1](#1-chuẩn-bị) | — | mỗi thứ thiếu là dừng ở một chỗ khác nhau |
| 2 | Trỏ **DNS** về IP máy chủ | 1 | Caddy xin chứng chỉ ở bước 6; DNS chưa trỏ thì không có HTTPS, và Let's Encrypt có hạn mức theo tuần nên thử lại nhiều lần là bị khoá |
| 3 | Dựng máy chủ: Docker, múi giờ, NTP, tường lửa, đĩa | — | có thể làm song song với 2 |

### Trên máy chủ

| # | Bước | Lệnh | Phải sau | Vì sao |
| --- | --- | --- | --- | --- |
| 4 | Giải nén, đăng nhập registry | `docker login` | 3 | |
| 5 | Khai cấu hình và sinh bí mật | `./cai-dat.sh` | 4 | hỏi tên miền, SMTP, tên miền nhận thư |
| 6 | Kéo ảnh, migration, dựng hệ | *(bước 5 tự gọi)* | **2**, 5 | cấu hình thư sai thì service **không khởi động** — sửa `.env` rồi `./csbh len` |
| 7 | Tài khoản Quản trị đầu tiên | `./csbh mo-tai-khoan` | 6 | **chỉ chạy được một lần**: nó từ chối khi CSDL đã có tài khoản |
| 8 | Đăng nhập giao diện, **đổi mật khẩu** | *(trên màn hình)* | 7 | cho tới lúc này **mọi đường API trả 403** — bước 9 và 10 đều chặn |
| 9 | Kiểm thư đầu-cuối: tạo một tài khoản thật, nhận thư mời, kích hoạt | *(trên màn hình)* | 8 | bước hay bị bỏ nhất và hỏng nhiều nhất |
| 10 | Nạp danh mục ban đầu | tự khai, **hoặc** `./csbh nap-danh-muc` | 8 | lệnh nạp đòi tài khoản đã đổi mật khẩu, và từ chối khi danh mục đã có sản phẩm. **Văn bản mẫu KHÔNG cần nạp** `sửa 30/08` |
| 11 | Nghiệm thu: vòng mười bước, xuất hợp đồng, `pg_stat_archiver`, `dien-tap` | | 10 | phải có sản phẩm mới lập được hồ sơ |
| 12 | Cài lịch tự động | `cp deploy/cron.mau /etc/cron.d/csbh` | 6 | làm được sớm hơn, nhưng **đừng giao khi chưa làm** |
| 13 | *(tuỳ chọn)* mở đường hầm cho người khác xem | `./csbh mo-thu-nghiem` | 10 | hệ trống trơn thì không có gì để xem |

### Bốn chỗ đảo thứ tự là hỏng

- **DNS sau khi dựng** (2 sau 6) — Caddy đã thử xin chứng chỉ và thất bại; mỗi
  lần dựng lại là một lần thử nữa vào hạn mức của Let's Encrypt
- **Nạp dữ liệu trước khi đổi mật khẩu** (10 trước 8) — `nap-danh-muc` dừng và
  nói ra, nhưng nếu tự khai bằng tay thì mọi thao tác trả 403 mà màn hình chỉ nói
  "không có quyền"
- **Tạo tài khoản quản trị lần hai** (7 sau khi đã có tài khoản) — lệnh từ chối;
  quên mật khẩu thì dùng *Quên mật khẩu*, không phải chạy lại lệnh mồi
- **Giao cho người dùng trước khi cài cron** (giao trước 12) — hệ chạy bình
  thường, và bản sao lưu không chạy suốt nhiều tháng mà không ai biết

---

## 1. Chuẩn bị

### Sáu thứ phải có trước

| Cần | Thiếu thì sao |
| --- | --- |
| **Tên miền**, DNS đã trỏ về IP máy chủ | Caddy không xin được chứng chỉ; không có HTTPS |
| **Máy chủ SMTP**: địa chỉ, cổng, tài khoản, mật khẩu | **Không ai đăng nhập được** ngoài tài khoản quản trị đầu tiên — thư mời kích hoạt là đường duy nhất để một tài khoản có mật khẩu |
| Tên miền gửi thư có **SPF · DKIM · DMARC** | Thư mời rơi vào spam, và triệu chứng giống hệt "hệ thống hỏng" |
| **Tên miền được phép nhận thư** | Hệ thống không khởi động — xem mục 4 |
| Ai là **Quản trị hệ thống đầu tiên** | Không tạo được tài khoản nào |
| Tài khoản đăng nhập **registry** | Không kéo được ảnh |

### Nếu tên miền nằm trên Cloudflare

Cloudflare có hai chế độ cho mỗi bản ghi DNS, và chúng khác nhau hẳn về hệ quả.

| | Đám mây **xám** (DNS only) | Đám mây **cam** (Proxied) |
| --- | --- | --- |
| Cloudflare làm gì | chỉ trả lời DNS | đứng chắn trước máy chủ, kết thúc TLS |
| Chứng chỉ | Caddy tự xin Let's Encrypt, chạy như tài liệu | hai lớp TLS, phải khai thêm ở Cloudflare |
| IP người dùng | máy chủ thấy **IP thật** | máy chủ thấy IP của Cloudflare |
| Giới hạn đăng nhập theo IP | đúng | **hỏng** — xem dưới |
| Bản này hỗ trợ | **có, và đã chạy thử** | chưa |

**Khuyến nghị: để đám mây XÁM (DNS only).** Khai một bản ghi và không gì khác:

| Type | Name | Content | Proxy status |
| --- | --- | --- | --- |
| A | `csbh` | IP máy chủ | **DNS only** |

Mọi thứ còn lại trong tài liệu này đúng nguyên văn. Caddy xin chứng chỉ trực tiếp
từ Let's Encrypt, thấy IP thật của người dùng, và không có lớp nào ở giữa để đi
tìm khi có sự cố.

#### Bật đám mây cam thì ba thứ đổi

Ghi ra để ai cần thì biết mình đang chọn gì. **Bản này chưa chạy thử chế độ ấy.**

1. **`SSL/TLS mode` phải là `Full (strict)`.** `Flexible` nghĩa là Cloudflare nói
   HTTPS với người dùng rồi nói **HTTP trần** với máy chủ — mật khẩu và token đi
   qua Internet dạng rõ ở chặng ấy.
2. **Cổng 80 phải tới được từ Cloudflare**, nếu không Caddy không xin và không
   gia hạn được chứng chỉ (thử thách HTTP-01 đi vào cổng 80).
3. **Giới hạn đăng nhập theo IP hỏng.** Mọi request tới từ dải IP của Cloudflare,
   nên hai mươi lượt đăng nhập mỗi phút bị gom theo IP biên chứ không theo người
   dùng thật. IP thật nằm ở header `CF-Connecting-IP`, nhưng bản này **chưa đọc
   header ấy** — cần sửa Caddyfile (`trusted_proxies` + `client_ip`) và chặn
   tường lửa chỉ cho dải Cloudflare vào, nếu không header ấy giả mạo được và chốt
   chặn còn tệ hơn hiện tại.

Khoá tài khoản sau 5 lần sai trong 15 phút **không đổi** — nó đếm theo tài khoản,
không theo IP, nên lớp chống dò mật khẩu vẫn nguyên ở cả hai chế độ.

Hai giới hạn nữa của lớp proxy, cả hai đều **không cắn** ở quy mô hiện tại: tệp
tải lên tối đa 20 MB (Cloudflare cho 100 MB), và một request quá 100 giây thì
Cloudflare trả `524` — dựng bản mềm của một hồ sơ rất dài dưới tải nặng là chỗ
duy nhất có thể chạm tới.

### Máy chủ

- Linux 64-bit · Docker Engine 24+ · Docker Compose v2
- **4 CPU · 8 GB RAM** trở lên — Chromium trong Gotenberg ngốn nhất
- **50 GB đĩa** trở lên. Có đĩa thứ hai thì để bản sao lưu ở đó: sao lưu nằm cùng
  đĩa với dữ liệu gốc thì hỏng đĩa là mất cả hai
- Tường lửa **chỉ mở 80 và 443**. Không mở 5432 · 6379 · 9000 · 5672 — mọi thành
  phần hạ tầng nằm trong mạng nội bộ Docker và không có đường vào từ ngoài
- `timedatectl set-timezone Asia/Ho_Chi_Minh` — kỳ thống kê và ngày áp dụng của
  hồ sơ cắt theo giờ Việt Nam
- Đồng bộ giờ qua NTP. Giờ lệch làm chữ ký JWT và mốc SLA sai

### Bản giao gồm gì

Một tệp nén `csbh-<phiên bản>.tar.gz`, khoảng 70 KB. Nó **không chứa ảnh Docker**
— máy chủ kéo ảnh từ registry.

```
csbh-1.0.0/
  README.md            Điểm bắt đầu, một trang
  cai-dat.sh           Cài lần đầu
  csbh                 Lệnh vận hành hằng ngày:  ./csbh help
  .env.mau             Bản khai môi trường
  deploy/              Ba tệp compose + cấu hình Postgres. KHÔNG sửa.
  deploy/cron.mau      Lịch sao lưu và dọn dữ liệu
  mau-van-ban/         Bốn mẫu .docx để tải lên nếu muốn
  tai-lieu/            Bốn tài liệu
```

Ba ảnh nằm chung **một repo**, phân biệt bằng **thẻ** — registry chỉ có hai cấp
`<tài khoản>/<repo>` nên không lồng thêm tên được:

| Thẻ | Là gì | Tải về thực tế |
| --- | --- | --- |
| `service-<phiên bản>` | Mười service Node. **Một ảnh cho cả mười** — service nào chạy do biến `SERVICE` quyết định lúc chạy | ~530 MB |
| `web-<phiên bản>` | Giao diện đã dựng + Caddy + cấu hình biên mạng | ~50 MB |
| `ops-<phiên bản>` | Migration, sao lưu, phục hồi, mồi tài khoản. Dựng **từ** ảnh service nên dùng lại toàn bộ lớp của nó | **+10 MB** |

Tổng khoảng **590 MB**, không phải tổng ba con số trên.

**Mỗi ảnh có HAI thẻ trên registry** `mới 21/09`: `service-1.0.3` và
`service-latest` trỏ tới cùng một ảnh. **`.env` luôn ghi CON SỐ** (`CSBH_TAG=1.0.3`)
— `latest` chỉ để `./csbh upgrade` của bản chạy thử biết bản mới nhất là bản nào,
và lệnh ấy cũng ghim con số vào `.env` chứ không ghi chữ `latest`. Mỗi ảnh mang
sẵn số phiên bản của nó trong một nhãn, nên `docker image inspect` trả lời được
*"ảnh này là bản nào"* mà không cần nhìn thẻ.

---

## 2. Cài đặt

```sh
tar -xzf csbh-1.0.0.tar.gz
cd csbh-1.0.0
docker login <registry>
./cai-dat.sh
```

`cai-dat.sh` làm bốn việc rồi dừng lại ở việc thứ năm:

1. Kiểm Docker và Compose
2. **Sinh bí mật ngay trên máy chủ này** vào `secrets/` — mật khẩu Postgres,
   MinIO, RabbitMQ và khoá ký JWT
3. Hỏi tên miền, SMTP, tên miền nhận thư; ghi vào `.env`
4. Kéo ảnh, chạy migration, dựng mười service và biên mạng
5. Dừng lại, nhắc bạn tạo tài khoản quản trị

Chạy lại được: những gì đã có thì giữ nguyên.

> **Bí mật sinh tại chỗ, không đi kèm bản giao.** Một bộ bí mật đóng gói sẵn là
> bộ bí mật mà mọi bản cài dùng chung, và nó đã đi qua ít nhất một lần chép tệp.
>
> **`.env` KHÔNG chứa mật khẩu nào.** Postgres và MinIO đọc thẳng từ
> `secrets/*.txt`. Chép mật khẩu sang `.env` nữa là dựng ra bản sao thứ hai của
> cùng một bí mật, và chúng sẽ lệch nhau vào ngày ai đó đổi một bên.
>
> **Trên máy đã từng chạy bản demo**, `.env` khai `COMPOSE_PROJECT_NAME=csbh-prod`
> — nó quyết định tên volume dữ liệu. Trùng tên với chồng khác nghĩa là dùng
> chung volume `pgdata`, mà **Postgres đặt mật khẩu chỉ ở lần khởi tạo đầu tiên**:
> volume cũ giữ mật khẩu cũ, và mọi lệnh chạm CSDL hỏng với
> `password authentication failed`. Giữ nguyên dòng ấy.

---

## 3. Tài khoản Quản trị đầu tiên

```sh
./csbh mo-tai-khoan
```

Hỏi tên đăng nhập, thư, họ tên, mật khẩu. Mật khẩu **không hiện ra màn hình** và
không vào lịch sử shell.

Bốn chốt chặn:

- Không có giá trị mặc định nào — thiếu một thứ thì dừng
- Mật khẩu phải qua **đúng luật của phần mềm**: tối thiểu 10 ký tự, có chữ và số
- **Từ chối nếu CSDL đã có tài khoản.** Đây là lệnh mồi, không phải lệnh tạo
  người dùng — chạy lần hai trên hệ đang sống là một cách đặt lại mật khẩu quản
  trị mà không màn hình nào ghi lại
- **Bắt buộc đổi mật khẩu ở lần đăng nhập đầu**, vì mật khẩu này vừa đi qua dòng lệnh

> **Lệnh này KHÔNG gửi thư nào.** Mọi tài khoản khác nhận một thư mời kèm liên
> kết kích hoạt — đó là đường duy nhất để chúng có mật khẩu. Tài khoản mồi thì
> ngược lại: không có ai ở trên nó để gửi thư mời, nên nó nhận mật khẩu thẳng từ
> dòng lệnh và được đánh dấu đã kích hoạt luôn.
>
> Đăng nhập bằng chính mật khẩu vừa nhập. Đường thư được kiểm ở **bước 9**, khi
> bạn tạo tài khoản thứ hai trên giao diện.

Quên mật khẩu quản trị về sau thì dùng *Quên mật khẩu* trên màn hình đăng nhập.

> Cho tới khi đổi mật khẩu lần đầu, **mọi đường API trả 403** — kể cả danh mục.
> Đăng nhập trên giao diện và đổi trước khi làm mục 5.

---

## 4. Cấu hình thư — phần dễ hỏng nhất

Hệ thống có **ba chốt chặn lúc khởi động**: cấu hình sai thì service **không
chạy**, thay vì chạy êm rồi gửi thư vào hư vô.

| Biến | Bắt buộc | Nghĩa |
| --- | --- | --- |
| `MAIL_HOST` | có | Máy chủ SMTP. Không được là `mailpit`/`localhost` |
| `MAIL_PORT` | | Mặc định 587 |
| `MAIL_FROM` | có | Địa chỉ ở ô *From*. Tên miền này phải có SPF/DKIM/DMARC |
| `MAIL_ALLOWLIST` | **có** | Tên miền được phép **nhận** thư |
| `MAIL_USER` | | Tài khoản SMTP. Bỏ trống nếu relay không đòi xác thực |
| `MAIL_PASSWORD_FILE` | | Đường dẫn file chứa mật khẩu SMTP |
| `MAIL_SECURE` | | `1` = TLS ngay từ đầu (cổng 465) |
| `MAIL_STARTTLS` | | `false` = tắt STARTTLS, chỉ cho relay nội bộ không hỗ trợ TLS |

Mật khẩu SMTP để trong **file**, không để trong `.env`: giá trị trong `.env` hiện
ra ở `docker inspect` của mọi container dùng nó.

```sh
printf '%s' 'mat-khau' > secrets/mail_password.txt && chmod 600 secrets/mail_password.txt
```

### Tên miền nhận thư — nhiều miền

```
MAIL_ALLOWLIST=nutricare.vn,nutricare.com.vn
```

- Ngăn bằng **dấu phẩy**. Dấu `@` đứng đầu và khoảng trắng thừa đều được bỏ qua
- **Miền con tự động được chấp nhận**: khai `nutricare.vn` thì
  `tdv@hn.nutricare.vn` cũng nhận được thư
- Một mục gõ sai chính tả làm **service không khởi động**, kèm câu chỉ đúng mục sai

Địa chỉ ngoài mọi miền đã khai **bị loại khỏi danh sách người nhận**. Đây là thứ
chặn một địa chỉ cá nhân gõ nhầm vào hồ sơ tài khoản rồi nhận toàn bộ thông báo
nghiệp vụ — công nợ, giá thu về, tên khách hàng.

Danh sách này còn quyết định **tài khoản nào mở được**: Quản trị hệ thống nhập
một email ngoài danh sách thì màn hình từ chối ngay, và `bootstrap-admin` cũng
từ chối một `ADMIN_EMAIL` ngoài danh sách. Lý do là cùng một chuyện — thư mời là
đường duy nhất để một tài khoản có mật khẩu, nên một địa chỉ không nhận được thư
là một tài khoản không dùng được. Mở tài khoản cho người ngoài công ty thì phải
khai thêm tên miền của họ vào đây trước.

Đổi danh sách về sau: sửa `.env` rồi `./csbh len`. Không cần dựng lại ảnh.

### TLS: mặc định nghiêng về an toàn

STARTTLS **bật sẵn** với mọi máy chủ SMTP thật, không cần ai nhớ đặt biến. Gửi
mật khẩu SMTP qua kết nối chưa mã hoá là chuyện không nên xảy ra chỉ vì quên một
dòng cấu hình. Relay nội bộ không hỗ trợ TLS thì tắt **tường minh** bằng
`MAIL_STARTTLS=false`.

### Dùng Gmail thì có ba ràng buộc riêng

- `MAIL_USER` phải là **địa chỉ đầy đủ** (`ten@gmail.com`), không phải phần trước dấu `@`
- `MAIL_FROM` phải **trùng** tài khoản đã xác thực, trừ khi bí danh đã được xác minh
- Mật khẩu phải là **App Password 16 ký tự**, và tài khoản phải bật xác thực hai
  bước. Dán liền, bỏ hết khoảng trắng Google chèn vào

### Kiểm thư ngay sau khi cài

Bước hay bị bỏ nhất và hỏng nhiều nhất:

1. Vào phần mềm bằng tài khoản quản trị, tạo một tài khoản thật cho đồng nghiệp
2. Hỏi họ có nhận được thư mời không — **kiểm cả hộp thư rác**
3. Bấm liên kết trong thư và đặt mật khẩu

Không có thư nào tới thì xem [05-VAN-HANH.md](05-VAN-HANH.md), mục *Thư không tới*.

---

### Đăng nhập bằng Google — **tuỳ chọn** `mới 04/11`

Bỏ trống `GOOGLE_CLIENT_ID` là **tắt**: màn hình đăng nhập không bày nút Google, mọi
thứ khác chạy như cũ. Muốn bật, làm ở [Google Cloud Console](https://console.cloud.google.com/)
bằng tài khoản quản trị Google Workspace của Công ty:

1. *APIs & Services → OAuth consent screen*: loại **Internal** (chỉ người trong
   Workspace thấy được màn hình xin quyền), phạm vi `openid`, `email`, `profile`.
2. *Credentials → Create credentials → OAuth client ID*, loại **Web application**.
   **Authorized redirect URIs** khai **đúng nguyên văn**:
   ```
   https://<SITE_URL>/api/auth/google/callback
   ```
   Lệch một ký tự (thiếu `/api`, `http` thay `https`, dư dấu `/` cuối) thì Google
   từ chối với `redirect_uri_mismatch` trước khi người dùng kịp chọn tài khoản.
3. Chép client secret vào **file**, client id vào `.env`:
   ```sh
   printf '%s' '<client secret>' > secrets/google_client_secret.txt && chmod 600 secrets/google_client_secret.txt
   ```
   ```
   GOOGLE_CLIENT_ID=<…>.apps.googleusercontent.com
   GOOGLE_HOSTED_DOMAIN=nutricare.vn
   GOOGLE_CLIENT_SECRET_FILE=/run/secrets/google_client_secret.txt
   ```
4. `./csbh nang-cap <thẻ hiện tại>` (hoặc khởi động lại `identity`) để nạp biến mới.

| Biến | Nghĩa |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Bật tính năng. Khai mà thiếu secret thì `identity` **không khởi động** |
| `GOOGLE_HOSTED_DOMAIN` | Miền Workspace — tài khoản Google ngoài miền này bị **từ chối**. Bỏ trống là nhận mọi tài khoản Google, vẫn phải trùng email đã cấp |
| `GOOGLE_CLIENT_SECRET_FILE` | File chứa client secret |

- Chỉ tài khoản Google có **email trùng** một tài khoản Quản trị đã cấp mới vào
  được; phần mềm **không tự tạo tài khoản**.
- Máy chủ phải **ra được Internet** tới `oauth2.googleapis.com` (cổng 443) — lượt
  đổi mã chạy từ `identity`, không từ trình duyệt.
- **Không phải sửa CSP** của Caddy: trình duyệt chỉ *điều hướng* sang Google, không
  tải script nào của Google.

## 5. Nạp dữ liệu ban đầu

Hệ mới cài có **CSDL trống**, chỉ một tài khoản quản trị. Có hai đường, chọn theo
việc đang làm.

### Đường thật — khách hàng tự khai

Thứ tự bắt buộc, vì mỗi bước dựa vào bước trước:

1. **Quản trị** tạo tài khoản cho từng người, đủ sáu vai trò
2. **Quản trị** khai nhóm sản phẩm, rồi sản phẩm — **giá bán Công ty nhập ngay ở
   hộp thoại tạo**, không còn bước đặt giá riêng `sửa 27/08`. Nhiều sản phẩm thì
   dùng *Nhập từ Excel*: tải file mẫu, điền, tải lên, xem trước rồi mới ghi
3. **Quản trị** khai quy định chiết khấu
4. **Trình dược viên** lập khách hàng — **điền đủ ba trường ở khối cảnh báo bên
   dưới**, không thì bước 5 dừng ở lượt gửi duyệt
5. **Trình dược viên** lập hồ sơ CSBH đầu tiên

Đây là thứ đáng nghiệm thu: cả đường onboarding chạy được hay không.

> **BA TRƯỜNG CỦA KHÁCH HÀNG CHẶN LƯỢT GỬI DUYỆT** `sửa 27/08` — mã số thuế,
> chức danh người đại diện, và **số điện thoại**. Thiếu bất kỳ trường nào thì hồ
> sơ lập được, sửa được, nhưng **không rời khỏi *Nháp***; câu báo lỗi kể đúng
> trường nào thiếu và chỉ sang hồ sơ khách hàng.
>
> Đây là chỗ vòng nghiệm thu hay dừng nhất: lập một khách hàng nhanh với mỗi tên
> và địa chỉ thì tới bước gửi duyệt mới biết. Ba trường ấy đều in ra tờ CSBH, nên
> chúng bắt buộc chứ không phải tuỳ chọn.
>
> **Nâng cấp một bản chạy thử đã có dữ liệu**: khách hàng lập trước 27/08 chưa có
> số điện thoại, và **hồ sơ MỚI của họ chưa gửi duyệt được** cho tới khi ai đó bổ
> sung. Hồ sơ đã gửi duyệt từ trước không bị ảnh hưởng — chúng đã đóng băng dữ
> liệu khách hàng tại thời điểm gửi.

### Nạp danh mục mẫu — **tuỳ chọn** `sửa 30/08`

```sh
./csbh nap-danh-muc
```

> **Ba văn bản mẫu đi CÙNG hệ thống, không cần chạy lệnh nào** `sửa 30/08`.
> Service `document` nạp chúng ở lượt khởi động đầu tiên, từ ba file `.docx` nằm
> sẵn trong ảnh (`templates/default/`). Lệnh này vì thế **thôi là bước cài đặt
> bắt buộc** — nó chỉ còn nạp DANH MỤC: nhóm, sản phẩm, giá, quy định chiết khấu.
>
> Đây là lượt đảo thứ hai của cùng một câu, nên ghi rõ cả ba mốc: `28/08` bỏ mẫu
> mặc định (*"hệ thống không bao giờ tự tạo văn bản mẫu"*) và biến lệnh này thành
> bước bắt buộc; `29/08` bỏ việc gửi duyệt kèm mẫu, nên thiếu mẫu chỉ chặn ở B8;
> `30/08` mẫu mặc định quay lại — nhưng nó **NẠP FILE** bàn giao chứ không **DỰNG**
> thân mẫu bằng mã, và **không mọc lại** sau khi Quản trị vô hiệu hoá nó.

| Nạp gì | Bao nhiêu |
| --- | --- |
| Nhóm sản phẩm | 3 |
| Sản phẩm kèm giá bán Công ty | 9 |
| Quy định chiết khấu | 3 |
| Văn bản mẫu | **không nạp** `sửa 30/08` — đã có sẵn từ lượt khởi động |

Ba quy định cố tình bày ra **luật khó nhất** của màn hình ấy: dòng cụ thể hơn
thắng. Khách loại 1 mua sữa bột lấy ngưỡng 18%; khách loại 2 và 3 mua đúng sản
phẩm ấy lấy 15%.

Ba điều kiện: cần tài khoản Quản trị **đã đổi mật khẩu lần đầu**; **từ chối nếu
danh mục đã có sản phẩm**; và nó **không tạo tài khoản nào** — đó là ranh giới
khiến nó được phép chạy ở `production` trong khi các script seed khác thì không.

> **Đây là SỐ MINH HOẠ.** Trước khi hệ đi vào dùng thật, sửa hoặc vô hiệu hoá
> chúng. Một bảng giá minh hoạ để nguyên sẽ thành bảng giá công ty, và không có
> gì trên màn hình nói ra điều đó.

### Về văn bản mẫu `sửa 30/08`

Hệ thống vừa cài xong đã có **ba mẫu**, mỗi loại một cái:

| Thẻ trên màn hình Quản trị | Tên mẫu | File nguồn trong ảnh |
| --- | --- | --- |
| Hồ sơ mẫu đầy đủ | `Hồ sơ mẫu đầy đủ (bản mặc định)` | `templates/default/ho-so-day-du.docx` |
| Hồ sơ mẫu rút gọn | `Hồ sơ mẫu rút gọn (bản mặc định)` | `templates/default/ho-so-rut-gon.docx` |
| Mẫu hợp đồng | `Hợp đồng (bản mặc định)` | `templates/default/hop-dong.docx` |

Chúng nạp **một lần duy nhất**, ở lượt khởi động đầu tiên nào thấy chưa có mẫu
mang đúng tên ấy. Vô hiệu hoá một mẫu mặc định thì nó **nằm im** — lượt khởi
động sau không dựng lại. Muốn nó về thì bấm *Dùng lại* trên màn hình Quản trị.

Bốn file trong `mau-van-ban/` là **điểm khởi đầu** để Quản trị tải lên rồi sửa
câu chữ trong Word.

**Tên mẫu không được trùng** `mới 28/08`, tính cả mẫu đã vô hiệu hoá. Ô chọn chỉ
hiện đúng một cột — cái tên — nên hai mẫu trùng tên là hai dòng người chọn không
phân biệt được. Hệ quả khi sửa một mẫu: tải bản mới lên phải đặt **tên khác**,
rồi vô hiệu hoá bản cũ; tên cũ không dùng lại được.

### Nâng cấp lên bản MỘT HỒ SƠ ĐANG XỬ LÝ MỖI KHÁCH HÀNG `mới 26/09`

**Bước migration `0119` DỪNG LẠI nếu còn khách hàng đang có nhiều hơn một hồ sơ
chưa duyệt xong** — ở một trong sáu trạng thái *Nháp*, *Yêu cầu chỉnh sửa*, *Chờ
TBP duyệt*, *Chờ KT duyệt L1*, *Sale Admin đang xử lý*, *Chờ KT duyệt L2*. Mở rộng
luật của mục *Một bản Nháp mỗi khách hàng* bên dưới, và dừng theo cùng một kiểu:
in danh sách, không tự chọn hộ.

Kiểm TRƯỚC khi nâng cấp, trên bản đang chạy:

```sh
./csbh psql -c "SELECT c.code, c.name, string_agg(p.code || ' (' || p.status || ')', ', ')
  FROM pol.policy p JOIN cus.customer c ON c.id = p.customer_id
  WHERE p.status::text IN ('NHAP','YEU_CAU_CHINH_SUA','CHO_TBP_DUYET','CHO_KT_L1','SA_DANG_XU_LY','CHO_KT_L2')
  GROUP BY c.code, c.name HAVING count(*) > 1;"
```

| | |
| --- | --- |
| Rỗng | Nâng cấp được |
| Có dòng | Mỗi khách giữ đúng một hồ sơ đang xử lý: TDV phụ trách xoá bản Nháp/bản bị trả về thừa, hoặc cho một bản đi hết luồng duyệt |
| Lỡ chạy rồi | Không mất gì — migration chạy trong một transaction. Dọn xong thì chạy lại `./csbh nang-cap <thẻ>` |

---

### Nâng cấp lên bản CHỌN TỈNH/THÀNH TỪ DANH SÁCH `mới 13/09`

**Không chặn nâng cấp, không có migration nào.** Ô *Tỉnh/Thành phố* của khách hàng
đổi từ ô gõ tự do thành **ô chọn 63 đơn vị**; cột trong CSDL vẫn là chữ, và không
có bước quy đổi dữ liệu cũ nào.

Việc tay phát sinh, và nó lộ ra dần chứ không lộ ra một lượt:

| | |
| --- | --- |
| Vì sao có | Tới `13/09` ô ấy là chữ tự do, nên cùng một thành phố nằm trong dữ liệu dưới nhiều lối viết — `Hà Nội` · `TP Hồ Chí Minh` · `Thành phố Hà Nội`. Không bộ lọc nào, không báo cáo nào gom chúng lại được, mà chuỗi ấy đi thẳng ra dòng địa chỉ trên bản CSBH hai bên ký |
| Phần mềm làm gì | Khách hàng đang giữ một tên ngoài danh sách thì ô chọn **vẫn bày tên ấy ra**, ở dạng không chọn lại được — dữ liệu cũ không bao giờ hiện thành ô trống |
| Phải làm | **Lượt sửa tiếp theo của khách hàng đó bị chặn** tới khi người dùng chọn lại một tên trong danh sách. Câu lỗi nói rõ ô nào |
| Vì sao chấp nhận cái giá ấy | Cho qua thì một lượt Lưu bất kỳ — kể cả lượt chỉ sửa số điện thoại — sẽ **âm thầm ghi đè địa chỉ pháp nhân**. Một câu lỗi đọc được thì hơn |

Lối viết chốt là lối **NGẮN**: `Hà Nội`, `Hồ Chí Minh`, `Cần Thơ` — không tiền tố
*Tỉnh* hay *Thành phố*.

---

### Nâng cấp lên bản MỘT BẢN NHÁP MỖI KHÁCH HÀNG `mới 10/09`

**Bước migration của bản này DỪNG LẠI nếu còn khách hàng đang có nhiều hơn một
bản Nháp.** Cùng lẽ với mục ngay dưới: hệ thống không chọn được giữ bản nào — chỉ
Trình dược viên đang soạn mới biết — nên nó in ra danh sách rồi dừng.

```
ERROR: Còn khách hàng có NHIỀU HƠN MỘT bản Nháp, không tạo được ràng buộc duy nhất.
Trình dược viên phụ trách phải xoá bớt, giữ lại đúng một bản, rồi chạy lại:
  KH-0001 — Nhà thuốc Minh Châu: CSBH-2026-000001, CSBH-2026-000075
```

| | |
| --- | --- |
| Vì sao có | Tới `10/09` phần mềm không giới hạn số bản Nháp trên một khách hàng |
| Phải làm | Với mỗi khách trong danh sách: mở từng hồ sơ, **giữ lại đúng một bản**, xoá những bản còn lại. Bản Nháp xoá đi biến mất hẳn, không để lại vết |
| Ai làm được | **Trình dược viên phụ trách** khách hàng đó — chỉ họ xoá được hồ sơ của mình |
| Làm ở đâu | Trên giao diện, trước khi nâng cấp — bản đang chạy vẫn cho xoá bình thường |
| Chạy lại | `docker compose … up -d` lần nữa |

> Muốn **giữ** cả hai bản thì cách hợp lệ là **gửi duyệt** một bản: hồ sơ rời khỏi
> *Nháp* là ràng buộc thôi tính tới nó.

---

### Nâng cấp lên bản CẤM TRÙNG MÃ SỐ THUẾ `mới 05/09`

**Bước migration của bản này DỪNG LẠI nếu dữ liệu đang có còn hai khách hàng
trùng mã số thuế.** Nó không tự sửa gì — hệ thống không chọn được giữ bản nào,
đó là quyết định nghiệp vụ — mà in ra đúng danh sách phải xử lý:

```
ERROR: Còn khách hàng TRÙNG mã số thuế, không tạo được ràng buộc duy nhất.
Sửa hoặc ngừng hợp tác bớt những khách sau rồi chạy lại:
  0101234567 (KH-0012, KH-0031)
```

| | |
| --- | --- |
| Vì sao có | Tới `29/08` phần mềm **cho phép** trùng có chủ ý, để một chủ hộ khai nhiều điểm bán. Đường ấy nay là **nhiều địa chỉ giao hàng trên một khách hàng** |
| Phải làm | Với mỗi nhóm trùng: giữ MỘT khách hàng, chuyển địa chỉ của những bản kia thành *địa chỉ giao hàng* của bản giữ lại, rồi **Ngừng hợp tác** những bản thừa |
| Làm ở đâu | Trên giao diện, trước khi nâng cấp — bản đang chạy vẫn cho sửa bình thường |
| Chạy lại | `docker compose … up -d` lần nữa; migration đã áp dụng dở không để lại trạng thái lỡ dở, nó chạy trong một transaction |

> **Khách đã ngừng hợp tác KHÔNG tính là trùng** — chốt chặn chỉ nhìn khách đang
> hợp tác. Nên "ngừng hợp tác bản thừa" là cách xử lý hợp lệ và đủ.

Hai việc tay nữa, nhỏ hơn, và **không chặn nâng cấp**:

- **Ô *Tỉnh/Thành phố* có thể trống** ở khách hàng cũ. Phần mềm tách địa chỉ cũ
  ra hai ô khi đoạn cuối mở đầu bằng *Thành phố*, *Tỉnh* hay *TP*; không khớp thì
  cả chuỗi vào ô *Số nhà, Phường xã* và ô tỉnh/thành để trống. Ô ấy bắt buộc, nên
  lượt sửa tiếp theo của khách hàng đó là lượt lấp chỗ trống.
- **Khách hàng cũ chưa khai mã số thuế thì vẫn trống.** Chốt bắt buộc chỉ áp cho
  lượt lập mới; biểu mẫu khai ô ấy bắt buộc nên bất kỳ lượt sửa nào cũng lấp nốt.

---

### Nâng cấp lên bản có tên Công ty mới `mới 29/08`

Tên pháp nhân đổi thành **Công ty TNHH Dược phẩm Nutricare**. Với một hệ **vừa
cài**, không phải làm gì: `nap-danh-muc` nạp bốn file đã mang tên mới.

Với hệ **đang chạy** thì có một việc tay, và bỏ qua nó là bản in vẫn ra tên cũ:

| | |
| --- | --- |
| Vì sao | Mẫu nằm trong CSDL và trên kho lưu trữ từ lượt tải lên đầu tiên. Nâng cấp ảnh **không** đụng tới chúng — và không được đụng, vì mẫu đã đóng băng vào những hồ sơ đã ký |
| Phải làm | Quản trị tải bốn file trong `mau-van-ban/` lên lại, rồi **vô hiệu hoá** bản cũ |
| Bẫy | **Tên mẫu không được trùng**, kể cả với bản đã vô hiệu. Bản mới phải mang tên khác — ví dụ thêm hậu tố `(2026)` |

> **Hồ sơ đã duyệt vẫn in tên cũ, và đó là đúng.** Chúng gắn với mẫu có hiệu lực
> lúc chúng được ký. Không có đường nào sửa ngược một tờ đã ký, và cũng không nên
> có — sửa được nghĩa là nội dung tờ giấy người ta đã ký thay đổi sau lưng họ.
>
> Địa chỉ và mã số thuế **không đổi** trong lượt này.

---

### Nâng cấp lên bản có NGÀY ÁP DỤNG THEO TỪNG SẢN PHẨM `mới 07/09`

Ngày áp dụng chuyển từ **hồ sơ** xuống **từng dòng sản phẩm**. Migration
`0116` làm phần lớn việc, và nó **an toàn với dữ liệu đang có**: mọi dòng của
mọi hồ sơ nhận đúng ngày áp dụng mà hồ sơ ấy đang mang — trước lượt này ngày của
hồ sơ ĐÃ LÀ ngày dùng để chụp giá cho mọi dòng, nên đây là chép xuống chứ không
phải đoán.

Ba việc còn lại phải biết:

| | |
| --- | --- |
| **Ba mẫu mặc định tự nạp lại** | Migration **xoá ba dòng mẫu mặc định** (`Hồ sơ mẫu đầy đủ (bản mặc định)`, `… rút gọn …`, `Hợp đồng (bản mặc định)`) để bộ nạp dựng lại từ ba tệp mới lúc `document` khởi động. Không phải làm gì bằng tay — nhưng **phải để `document` khởi động xong** trước khi ai đó in bản mềm |
| **Mẫu do người dùng tải lên KHÔNG tự đổi** | Mẫu nào còn ô `{{ho_so.ngay_ap_dung}}` sẽ in ra **ô rỗng** — nguồn ấy đã gỡ. Bản in không hỏng, không lộ `{{...}}`, chỉ là dòng *Thời gian áp dụng* trống. Chữa bằng cách tải lên một bản mẫu đã bỏ dòng ấy, rồi vô hiệu bản cũ (cùng cách làm với lượt đổi tên Công ty ở trên, kể cả bẫy trùng tên) |
| **Bộ lọc báo cáo đổi nghĩa** | *"CSBH áp dụng từ … đến …"* ở màn hình Thống kê giờ so với **ngày áp dụng sớm nhất trong các dòng** của hồ sơ. Cột cùng nghĩa trên bảng danh sách hồ sơ đổi nhãn thành *Áp dụng từ* |

> **Đường `PATCH /policies/:id` đã gỡ.** Nó chỉ đổi được ngày áp dụng của hồ sơ,
> và trường ấy không còn. Tích hợp nào đang gọi nó sẽ nhận `404`; đường thay thế
> là `PATCH /policies/:id/lines/:lineId` với trường `ngayApDung`.

> **`mode` khi lập phiên bản mới đổi giá trị.** `SUPPLEMENT` và `AMEND` gộp
> thành **`NEW_VERSION`**, và hai mã lỗi `SUPPLEMENT_REQUIRED`/`AMEND_REQUIRED`
> gộp thành `NEW_VERSION_REQUIRED`. Cả hai giá trị cũ chưa bao giờ dẫn tới hai
> hành vi khác nhau ở máy chủ.

---

## 6. Nghiệm thu trước khi giao cho người dùng

```sh
./csbh trang-thai
./csbh psql -c "SELECT archived_count, failed_count FROM pg_stat_archiver"
./csbh dien-tap
```

- [ ] Mở `https://<tên miền>` — có ổ khoá, chứng chỉ hợp lệ
- [ ] Đăng nhập bằng tài khoản quản trị; đổi mật khẩu ở màn hình bắt buộc
      — *(menu của vai trò này **không có mục Hồ sơ CSBH** `sửa 27/08`: họ đứng
      ngoài luồng duyệt nên không hồ sơ nào thuộc phạm vi của họ. Mục **Khách
      hàng** thì vẫn còn, vì đây là chỗ đổi TDV phụ trách.)*
- [ ] Tạo một tài khoản thật, **nhận được thư mời**, kích hoạt được
- [ ] *(Nếu bật Google)* Đăng xuất, bấm **Đăng nhập bằng Google**, chọn tài khoản
      Workspace trùng email vừa tạo — vào thẳng trang Tổng quan
- [ ] Lập một khách hàng **có đủ mã số thuế, chức danh người đại diện và số điện
      thoại** — thiếu một trường thì bước dưới dừng ở lượt gửi duyệt `sửa 27/08`
- [ ] Chạy **hết một vòng mười bước** bằng tài khoản thật: TDV lập hồ sơ → gửi
      duyệt → TBP ký → Kế toán nhận L1 → Sale Admin bàn giao → Kế toán nhận L2
- [ ] Xuất một hợp đồng và mở file ra xem
- [ ] `archived_count` **phải tăng** — đây là điều kiện để cam kết RPO 5 phút
      đúng, và nó từng hỏng lặng lẽ một lần: CSDL xanh, healthcheck xanh, chỉ có
      WAL không được lưu
- [ ] `dien-tap` chạy xong — đo thời gian thật, đừng ước lượng

---

## 7. Lịch tự động — bắt buộc cài

```sh
sudo cp deploy/cron.mau /etc/cron.d/csbh
sudo chmod 644 /etc/cron.d/csbh
sudo sed -i 's|/opt/csbh|<đường dẫn thật>|' /etc/cron.d/csbh
```

Sao lưu hằng đêm · dọn dữ liệu và trích nhật ký kiểm toán hằng tháng · diễn tập
phục hồi ngày 8 hằng tháng.

> **Không cài cron là bỏ mất một nửa cam kết phục hồi.** Các lệnh chạy được từ
> lúc bàn giao, nhưng chúng chỉ chạy khi có người gõ. Một cam kết RPO mà phụ
> thuộc vào việc ai đó nhớ gõ lệnh là một cam kết không có thật.

Chi tiết ở [05-VAN-HANH.md](05-VAN-HANH.md).

---

## 8. Nâng cấp

```sh
./csbh nang-cap 1.0.3
```

Sao lưu trước → đổi thẻ trong `.env` → kéo ảnh → chạy migration → dựng lại. Lệnh
in ra thẻ cũ khi xong; lùi bản là chạy lại với thẻ ấy.

> **Từ `1.0.x` lên `1.1.0`** `mới 05/11`. **Không có migration nào**, nên lượt nâng chỉ là
> đổi ảnh: `./csbh nang-cap 1.1.0`. Bản này mang đăng nhập bằng Google, chân trang, che kín
> màn hình khi hết phiên, và các bản sửa sao lưu/phục hồi của `0240` (nằm trong ảnh `ops`).
>
> - **Đăng nhập Google tắt sẵn** — `.env` cũ không có `GOOGLE_CLIENT_ID` thì nút không hiện,
>   không gì hỏng. Muốn bật thì **chép `deploy/compose.prod.yml` và `.env.mau` từ bộ cài
>   `1.1.0`** sang máy (giữ nguyên `.env` và `secrets/` của máy), rồi làm theo mục
>   *Đăng nhập bằng Google* ở §4. `nang-cap` chỉ đổi ảnh, KHÔNG thay tệp compose: tệp cũ
>   không chuyển biến `GOOGLE_*` vào `identity`, nên khai vào `.env` mà không chép tệp mới
>   là bật không lên.
> - Chép luôn **tệp `csbh` mới** — nó có đường vòng khi ảnh MinIO không kéo được (`0235`),
>   và các lệnh `sao-luu-tep` · `phuc-hoi-tep` · `xuat-chuyen-may` · `nhap-chuyen-may` (`0246`).
>   Phần chạy trong ảnh của chúng đi theo ảnh `ops` mới; KHÔNG phải sửa `compose.prod.yml`.
> - Từ `1.0.3`/`1.0.4` thì vẫn theo đoạn ngay dưới: đổi thẻ TRƯỚC rồi mới `nang-cap`.
> - **Ảnh bên ngoài đã GHIM** (`0248`): chép cả `deploy/compose.yml` lẫn `deploy/compose.prod.yml` mới
>   thì Postgres, Redis, RabbitMQ, Gotenberg chạy ĐÚNG bản đã qua bộ kiểm thay vì bản mà thẻ trôi
>   đang trỏ tới hôm cài. Máy cài từ lâu có thể đang chạy một bản 16.x khác của Postgres — lượt
>   `len` đầu tiên sau khi chép sẽ thay container Postgres bằng bản ghim (cùng major 16, dữ liệu
>   giữ nguyên); sao lưu trước như mọi lần nâng.

> **Từ `1.0.3` hoặc `1.0.4` lên bản mới: đổi thẻ TRƯỚC, rồi mới `nang-cap`** `mới 29/09`.
> Bước sao lưu chạy bằng ảnh `ops` của thẻ đang ghi trong `.env`, và ảnh `ops` tới
> `1.0.4` thiếu `pg_archivecleanup` — lượt sao lưu chết ở dòng
> `pg_archivecleanup: not found` và `nang-cap` dừng ngay đó (hệ chưa bị đụng gì).
> Đi vòng bằng cách để chính ảnh MỚI làm lượt sao lưu:
>
> ```sh
> ./csbh phien-ban                                  # ghi lại thẻ cũ để lùi nếu cần
> sed -i 's/^CSBH_TAG=.*/CSBH_TAG=1.0.5/' .env
> ./csbh nang-cap 1.0.5
> ```
>
> Dòng *"Lùi lại: …"* in ra lúc xong sẽ ghi `1.0.5` — thẻ cũ là thẻ bạn vừa ghi lại.
>
> **Hệ đã chạy cron sao lưu hằng đêm cũng dính cùng lỗi**: mỗi đêm `pg_dump` và bản
> nền vẫn ghi xong, nhưng hai bước sau không bao giờ chạy — **WAL lưu trữ không
> được dọn** (thư mục ấy lớn dần), và **bản sao ra `BACKUP_MIRROR_DIR` không bao giờ
> được chép**. Xem `/var/log/csbh-sao-luu.log`. Lên `1.0.5` là đêm sau hai bước ấy
> chạy lại; kiểm `BACKUP_MIRROR_DIR` có bản sao lưu mới.

> **`pull access denied for minio/minio`** `mới 29/09`. Kho `minio/minio` đã biến khỏi
> Docker Hub, kể cả thẻ ghim của ta. Máy chủ đang chạy vẫn giữ ảnh ấy, nên:
>
> - Đang dở một lượt `nang-cap` chết ở lỗi này (thẻ trong `.env` đã đổi, sao lưu đã
>   xong, hệ vẫn chạy bản cũ): chạy **`./csbh len`** — kéo hỏng mà đủ ảnh trên máy thì
>   nó đi tiếp: migration rồi dựng lại.
> - Tệp `csbh` từ bản đóng gói sau `29/09` thì `nang-cap` tự làm đúng thế; thiếu ảnh
>   thật thì nó dừng và trả `CSBH_TAG` về thẻ cũ.
> - Từ bộ cài sau `05/11` (`0247`), `compose.prod.yml` kéo MinIO từ **kho của ta**
>   (`<CSBH_IMAGE>:minio-RELEASE.2024-09-22T00-33-43Z`), nên lỗi này không còn. Máy đang
>   chạy muốn dùng nó thì chép `deploy/compose.prod.yml` mới sang (giữ `.env`).

> **Ảnh bên ngoài ghim bằng THẺ PHIÊN BẢN + DIGEST** `mới 05/11` (`0248`) — Postgres 16.15, Redis
> 7.4.10, RabbitMQ 3.13.7, Gotenberg 8.34.0, Caddy 2.8.4, Node 22.9.0, cloudflared 2026.8.2, cộng
> MinIO nhân bản. Docker kéo theo DIGEST (bỏ qua thẻ), nên mọi máy cài vào bất kỳ ngày nào chạy
> đúng một bản, từng byte. **Nâng một ảnh ngoài là việc có chủ ý**: đổi thẻ + digest ở MỌI chỗ
> dùng nó (ca `ghim-anh.test.ts` đòi mọi chỗ trùng nhau), `make test`, dựng thật, rồi giao bản mới.
> Cái giá: không còn bản vá bảo mật nào tự tới — phải chủ động rà và nâng.

> **Thẻ ảnh không bao giờ là `latest`.** Với `latest` thì một lượt kéo ảnh vài
> tháng sau đổi thứ đang chạy mà không ai chủ ý, và không có cách nào nói máy chủ
> đang chạy bản nào.
>
> **Migration không lùi được.** Lùi ảnh về bản cũ trong khi CSDL đã đi tới lược đồ
> mới là một trạng thái không được kiểm thử. Nâng cấp hỏng ở phần CSDL thì đường
> đúng là **phục hồi từ bản sao lưu ngay trước đó** — chính vì vậy `nang-cap` sao
> lưu trước khi đụng vào bất cứ thứ gì.

---

## 9. Cho người khác xem thử khi chưa có tên miền

```sh
./csbh mo-thu-nghiem      # in ra một địa chỉ công khai dùng ngay được
./csbh dong-thu-nghiem
```

Mở một đường hầm Cloudflare: không cần mở cổng tường lửa, không cần tên miền,
không cần chứng chỉ. **Không phải đường triển khai** — ba điều phải biết trước khi
mở nằm ở [05-VAN-HANH.md](05-VAN-HANH.md), mục *Chạy thử qua Internet*.

---

## 10. Giới hạn của bản này — nói rõ với khách hàng

**Đây là bản một máy.** RPO ≤ 5 phút, RTO ≤ 60 phút; xem
[RPO-RTO.md](../deploy/RPO-RTO.md). Máy chết là hệ thống dừng cho tới khi dựng
lại từ bản sao lưu. Không có máy dự phòng, không có tự chuyển đổi.

**MinIO chạy từ ảnh NHÂN BẢN trong kho của ta** `sửa 05/11`. MinIO ngừng phát hành ảnh
Community từ 10/2025 và xoá hẳn kho `minio/minio` khỏi Docker Hub khoảng 11–14/09/2026,
kể cả thẻ ghim `RELEASE.2024-09-22T00-33-43Z`. Từ `0247` ta giữ đúng ảnh ấy — chép nguyên
từng lớp, chỉ đổi tên — ở `<CSBH_IMAGE>:minio-RELEASE.2024-09-22T00-33-43Z`, nên cài mới
và chuyển máy kéo được như mọi ảnh khác. Cái giá: **bản MinIO đứng yên**, không có bản vá
bảo mật mới nào tới nữa; về lâu dài phải chọn tự dựng từ mã nguồn hoặc chuyển sang một kho
tương thích S3 khác. MinIO là AGPLv3 — mã nguồn đúng bản đang phân phối:
https://github.com/minio/minio/tree/RELEASE.2024-09-22T00-33-43Z

**Không có nghiệp vụ thu hồi.** *Từ chối*, *Đã xoá* và *Quá hạn duyệt* là trạng
thái kết thúc — không ai sửa được, kể cả Quản trị hệ thống. Người dùng thử nên
biết trước, vì trong lúc thử người ta hay bấm nhầm rồi đi tìm nút hoàn tác.

**Mẫu văn bản chỉ bị ép 9 trên 13 mục** của yêu cầu hiển thị. *Thông tin công ty*
do người soạn gõ thẳng vào Word; *CPBH* do người soạn quyết; *trạng thái* và
*thời gian duyệt* còn đang đổi lúc dựng văn bản nên không ép được. Một bảo đảm
9/13 mà tưởng là 13/13 thì tệ hơn hẳn một bảo đảm 9/13 đã biết.
