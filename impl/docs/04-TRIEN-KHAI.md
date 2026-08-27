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
| 10 | Nạp dữ liệu ban đầu | tự khai, **hoặc** `./csbh nap-danh-muc` | 8 | lệnh nạp đòi tài khoản đã đổi mật khẩu, và từ chối khi danh mục đã có sản phẩm |
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

### Đường nhanh — cho bản chạy thử

```sh
./csbh nap-danh-muc
```

| Nạp gì | Bao nhiêu |
| --- | --- |
| Nhóm sản phẩm | 3 |
| Sản phẩm kèm giá bán Công ty | 9 |
| Quy định chiết khấu | 3 |
| Văn bản mẫu | 2 mẫu hồ sơ (A4 dọc · ngang) + 1 mẫu hợp đồng |

Ba quy định cố tình bày ra **luật khó nhất** của màn hình ấy: dòng cụ thể hơn
thắng. Khách loại 1 mua sữa bột lấy ngưỡng 18%; khách loại 2 và 3 mua đúng sản
phẩm ấy lấy 15%.

Ba điều kiện: cần tài khoản Quản trị **đã đổi mật khẩu lần đầu**; **từ chối nếu
danh mục đã có sản phẩm**; và nó **không tạo tài khoản nào** — đó là ranh giới
khiến nó được phép chạy ở `production` trong khi các script seed khác thì không.

> **Đây là SỐ MINH HOẠ.** Trước khi hệ đi vào dùng thật, sửa hoặc vô hiệu hoá
> chúng. Một bảng giá minh hoạ để nguyên sẽ thành bảng giá công ty, và không có
> gì trên màn hình nói ra điều đó.

### Về văn bản mẫu

Hệ thống **tự nạp sẵn một mẫu hồ sơ mỗi khổ và một mẫu hợp đồng** lúc khởi động,
nên gửi duyệt và xuất hợp đồng chạy được ngay từ phút đầu — không cần tải gì lên.

Bốn file trong `mau-van-ban/` là **điểm khởi đầu đẹp hơn** để Quản trị tải lên
rồi sửa câu chữ trong Word. Sau khi chạy `nap-danh-muc`, ô chọn có **4 mẫu hồ sơ
và 2 mẫu hợp đồng**; muốn gọn lại thì vô hiệu hoá hai mẫu mặc định ở màn hình
*Văn bản mẫu*.

> Lệnh nạp lấy **ba** trong bốn file: hai mẫu hồ sơ A4 dọc/ngang và một mẫu hợp
> đồng. File thứ tư — `mau-ho-so-a4-doc-rut-gon.docx` — **không nạp** `sửa 27/08`.
> Nó là bản chỉ có đúng những mục bắt buộc, để trả lời câu *"ít nhất mẫu phải có
> những gì"*; tải lên bằng tay khi cần.

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
./csbh nang-cap 1.0.1
```

Sao lưu trước → đổi thẻ trong `.env` → kéo ảnh → chạy migration → dựng lại. Lệnh
in ra thẻ cũ khi xong; lùi bản là chạy lại với thẻ ấy.

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

**Không có nghiệp vụ thu hồi.** *Từ chối*, *Đã xoá* và *Quá hạn duyệt* là trạng
thái kết thúc — không ai sửa được, kể cả Quản trị hệ thống. Người dùng thử nên
biết trước, vì trong lúc thử người ta hay bấm nhầm rồi đi tìm nút hoàn tác.

**Mẫu văn bản chỉ bị ép 9 trên 13 mục** của yêu cầu hiển thị. *Thông tin công ty*
do người soạn gõ thẳng vào Word; *CPBH* do người soạn quyết; *trạng thái* và
*thời gian duyệt* còn đang đổi lúc dựng văn bản nên không ép được. Một bảo đảm
9/13 mà tưởng là 13/13 thì tệ hơn hẳn một bảo đảm 9/13 đã biết.
