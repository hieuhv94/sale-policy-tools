# Triển khai Chính sách bán hàng lên máy chủ

Tài liệu này dẫn từ một máy chủ trắng tới màn hình đăng nhập. Đọc hết phần
**Chuẩn bị** trước khi đụng tới máy chủ — bốn thứ trong đó cần người khác quyết,
và thiếu chúng thì dừng ở giữa chừng.

Phần vận hành hằng ngày ở [05-VAN-HANH.md](05-VAN-HANH.md). Phần hướng dẫn cho
người dùng cuối ở [03-HUONG-DAN-SU-DUNG.md](03-HUONG-DAN-SU-DUNG.md).

---

## 0. Bản giao gồm những gì

Bản giao là **một tệp nén** `csbh-<phiên bản>.tar.gz`. Nó **không chứa ảnh
Docker** — máy chủ kéo ảnh về từ registry. Bên trong:

```
csbh-1.0.0-a1b2c3d/
  README.md            Điểm bắt đầu, một trang
  cai-dat.sh           Cài lần đầu — hỏi từng thứ rồi tự dựng
  csbh                 Lệnh vận hành hằng ngày:  ./csbh help
  .env.mau             Bản khai môi trường
  deploy/              Hai tệp compose + cấu hình Postgres. KHÔNG sửa.
  deploy/cron.mau      Lịch sao lưu và dọn dữ liệu
  mau-van-ban/         Ba mẫu .docx (tuỳ chọn, xem mục 7)
  tai-lieu/            Triển khai · Vận hành · Hướng dẫn sử dụng · RPO-RTO
```

Ba ảnh được kéo về:

| Ảnh | Là gì | Cỡ |
|---|---|---|
| `csbh-service` | Mười service Node. **Một ảnh cho cả mười** — service nào chạy do biến `SERVICE` quyết định lúc chạy. | ~530 MB |
| `csbh-web` | Giao diện đã dựng + Caddy + cấu hình biên mạng | ~50 MB |
| `csbh-ops` | Migration, sao lưu, phục hồi, mồi tài khoản. Dựng **từ** `csbh-service` nên dùng lại toàn bộ lớp của nó. | +10 MB |

Tổng dung lượng tải về thực tế khoảng **590 MB**, không phải tổng ba con số trên.

---

## 1. Chuẩn bị — quyết trước, làm sau

| Cần | Vì sao |
|---|---|
| **Tên miền** và DNS đã trỏ về IP máy chủ | Caddy tự xin chứng chỉ TLS theo tên miền này. DNS chưa trỏ thì lần dựng đầu tiên không có HTTPS. |
| **Máy chủ SMTP**: địa chỉ, cổng, tài khoản, mật khẩu | Thư mời kích hoạt là **đường duy nhất** để một tài khoản có mật khẩu. Không có SMTP thì không ai đăng nhập được ngoài tài khoản quản trị đầu tiên. |
| Tên miền gửi thư có **SPF · DKIM · DMARC** | Thiếu thì thư mời rơi vào spam, và triệu chứng giống hệt "hệ thống hỏng". |
| **Tên miền được phép nhận thư** | Bắt buộc. Nhiều miền thì ngăn bằng dấu phẩy. Xem mục 4. |
| **Ai là Quản trị hệ thống đầu tiên** | Tài khoản mồi, tạo bằng một lệnh chạy đúng một lần. |
| Tài khoản đăng nhập **registry** | Ảnh nằm ở kho riêng. |

### Máy chủ

- Linux 64-bit, Docker Engine 24+ và Docker Compose v2.
- **4 CPU · 8 GB RAM** trở lên. Chromium trong Gotenberg là thành phần ngốn nhất.
- **50 GB đĩa** trở lên. Nếu có đĩa thứ hai thì để bản sao lưu ở đó — bản sao lưu
  nằm cùng đĩa với dữ liệu gốc thì hỏng đĩa là mất cả hai.
- Tường lửa **chỉ mở 80 và 443**. Không mở 5432, 6379, 9000, 5672 — mọi thành
  phần hạ tầng nằm trong mạng nội bộ của Docker và không có đường vào từ ngoài.
- **Đặt múi giờ về Việt Nam**: `timedatectl set-timezone Asia/Ho_Chi_Minh`. Kỳ
  thống kê và ngày áp dụng của hồ sơ cắt theo giờ Việt Nam.
- Đồng bộ giờ qua NTP. Giờ lệch làm chữ ký JWT và mốc SLA sai.

---

## 2. Cài đặt

```sh
tar -xzf csbh-1.0.0-a1b2c3d.tar.gz
cd csbh-1.0.0-a1b2c3d
docker login <registry>
./cai-dat.sh
```

`cai-dat.sh` làm bốn việc và dừng lại ở việc thứ năm:

1. Kiểm Docker và Compose.
2. **Sinh bí mật ngay trên máy chủ này** vào `secrets/` — mật khẩu Postgres,
   MinIO, RabbitMQ, và khoá ký JWT. Chúng không đi kèm bản giao, và không bao
   giờ được chép đi đâu.
3. Hỏi tên miền, SMTP, tên miền nhận thư; ghi vào `.env`.
4. Kéo ảnh, chạy migration, dựng mười service và biên mạng.
5. Dừng lại và nhắc bạn chạy `./csbh mo-tai-khoan`.

Chạy lại được: những gì đã có thì giữ nguyên.

> **Bí mật sinh tại chỗ, không đi kèm bản giao.** Một bộ bí mật đóng gói sẵn là
> bộ bí mật mà mọi bản cài dùng chung, và nó đã đi qua ít nhất một lần chép tệp.

---

## 3. Tài khoản Quản trị đầu tiên

```sh
./csbh mo-tai-khoan
```

Lệnh hỏi tên đăng nhập, thư, họ tên, mật khẩu. Mật khẩu **không hiện ra màn hình**
và không vào lịch sử shell.

Bốn chốt chặn của lệnh này:

- Không có giá trị mặc định nào. Thiếu một thứ thì dừng.
- Mật khẩu phải qua **đúng luật của phần mềm**: tối thiểu 10 ký tự, có chữ và số.
- **Từ chối nếu CSDL đã có tài khoản.** Nó là lệnh mồi, không phải lệnh tạo người
  dùng — chạy lần hai trên hệ đang sống sẽ là một cách đặt lại mật khẩu quản trị
  mà không màn hình nào ghi lại.
- **Bắt buộc đổi mật khẩu ở lần đăng nhập đầu**, vì mật khẩu này vừa đi qua dòng lệnh.

Quên mật khẩu quản trị về sau thì dùng *Quên mật khẩu* trên màn hình đăng nhập —
lệnh mồi sẽ từ chối.

---

## 4. Cấu hình thư

Đây là phần dễ hỏng nhất, và hỏng theo kiểu im lặng. Hệ thống có **ba chốt chặn
lúc khởi động**: cấu hình sai thì service **không chạy**, thay vì chạy êm rồi gửi
thư vào hư vô.

| Biến | Bắt buộc | Nghĩa |
|---|---|---|
| `MAIL_HOST` | có | Máy chủ SMTP. Không được là `mailpit`/`localhost` — chốt chặn số 1. |
| `MAIL_PORT` | | Mặc định 587. |
| `MAIL_FROM` | có | Địa chỉ ở ô *From*. Tên miền này phải có SPF/DKIM/DMARC. |
| `MAIL_ALLOWLIST` | **có** | Tên miền được phép **nhận** thư — chốt chặn số 3. |
| `MAIL_USER` | | Tài khoản SMTP. Bỏ trống nếu relay không đòi xác thực. |
| `MAIL_PASSWORD_FILE` | | Đường dẫn file chứa mật khẩu SMTP. |
| `MAIL_SECURE` | | `1` = TLS ngay từ đầu (cổng 465). |
| `MAIL_STARTTLS` | | `false` = tắt STARTTLS. Chỉ dùng cho relay nội bộ không hỗ trợ TLS. |

### Tên miền nhận thư — nhiều miền

```
MAIL_ALLOWLIST=nutricare.vn,nutricare.com.vn
```

- Ngăn bằng **dấu phẩy**. Dấu `@` đứng đầu và khoảng trắng thừa đều được bỏ qua.
- **Miền con tự động được chấp nhận**: khai `nutricare.vn` thì
  `tdv@hn.nutricare.vn` cũng nhận được thư. Không phải liệt kê từng chi nhánh.
- Một mục gõ sai chính tả làm **service không khởi động**, kèm câu chỉ đúng mục
  sai — chứ không bị bỏ qua lặng lẽ.

Địa chỉ ngoài mọi miền đã khai **bị loại khỏi danh sách người nhận**. Đây là thứ
chặn một địa chỉ cá nhân gõ nhầm vào hồ sơ tài khoản rồi nhận toàn bộ thông báo
nghiệp vụ — công nợ, giá thu về, tên khách hàng.

Đổi danh sách miền về sau: sửa `.env` rồi `./csbh len`. Không cần dựng lại ảnh.

### TLS: mặc định nghiêng về an toàn

STARTTLS **bật sẵn** với mọi máy chủ SMTP thật, không cần ai nhớ đặt biến. Gửi
mật khẩu SMTP qua kết nối chưa mã hoá là chuyện không nên xảy ra chỉ vì quên một
dòng cấu hình. Relay nội bộ không hỗ trợ TLS thì tắt **tường minh** bằng
`MAIL_STARTTLS=false`.

### Kiểm thư ngay sau khi cài

Đây là bước hay bị bỏ nhất và hỏng nhiều nhất:

1. Vào phần mềm bằng tài khoản quản trị, tạo một tài khoản thật cho một đồng nghiệp.
2. Hỏi họ có nhận được thư mời không, **và kiểm cả hộp thư rác**.
3. Bấm liên kết trong thư và đặt mật khẩu.

Không có thư nào tới thì xem [05-VAN-HANH.md](05-VAN-HANH.md), mục *Thư không tới*.

---

## 5. Nghiệm thu trước khi giao cho người dùng

- [ ] Mở `https://<tên miền>` — có ổ khoá, chứng chỉ hợp lệ.
- [ ] Đăng nhập bằng tài khoản quản trị; đổi mật khẩu ở màn hình bắt buộc.
- [ ] Tạo một tài khoản thật, nhận được thư mời, kích hoạt được.
- [ ] Chạy **hết một vòng mười bước** bằng tài khoản thật: TDV lập hồ sơ → gửi
      duyệt → TBP ký → Kế toán nhận L1 → Sale Admin bàn giao → Kế toán nhận L2.
- [ ] Xuất một hợp đồng và mở file ra xem.
- [ ] `./csbh dien-tap` — diễn tập phục hồi, đo thời gian thật.
- [ ] `./csbh psql -c "SELECT archived_count, failed_count FROM pg_stat_archiver"`
      — `archived_count` phải tăng. Đây là điều kiện để cam kết RPO 5 phút đúng;
      nó từng hỏng lặng lẽ một lần, CSDL vẫn xanh mà WAL không được lưu.
- [ ] Cài lịch cron (xem [05-VAN-HANH.md](05-VAN-HANH.md)).

---

## 6. Nạp dữ liệu ban đầu

Hệ mới cài có **CSDL trống**, chỉ một tài khoản quản trị. Đó là chủ ý: thứ đáng
nghiệm thu chính là đường onboarding thật.

Thứ tự bắt buộc, vì mỗi bước dựa vào bước trước:

1. **Quản trị** tạo tài khoản cho từng người, đủ sáu vai trò.
2. **Quản trị** khai nhóm sản phẩm → sản phẩm → giá.
3. **Quản trị** khai quy định chiết khấu.
4. **Trình dược viên** lập khách hàng.
5. **Trình dược viên** lập hồ sơ CSBH đầu tiên.

---

## 7. Ba mẫu văn bản trong `mau-van-ban/`

**Không bắt buộc.** Hệ thống tự nạp sẵn một mẫu hồ sơ và một mẫu hợp đồng lúc
khởi động, nên gửi duyệt và xuất hợp đồng chạy được ngay từ phút đầu.

Ba file `.docx` này là **điểm khởi đầu đẹp hơn** để Quản trị tải lên rồi sửa câu
chữ trong Word: A4 dọc, A4 ngang, và một bản rút gọn. Tải lên ở màn hình *Văn bản
mẫu*.

---

## 8. Nâng cấp

```sh
./csbh nang-cap 1.0.1-9f3ab2c
```

Lệnh này **sao lưu trước**, rồi đổi thẻ trong `.env`, kéo ảnh, chạy migration,
dựng lại. Lùi về bản cũ: chạy lại với thẻ cũ (lệnh in ra thẻ cũ khi chạy xong).

> **Thẻ ảnh không bao giờ là `latest`.** Với `latest` thì một lượt kéo ảnh vài
> tháng sau đổi thứ đang chạy mà không ai chủ ý, và không có cách nào nói máy
> chủ đang chạy bản nào.

---

## 9. Giới hạn của bản này — nói rõ với khách hàng

**Đây là bản một máy.** RPO ≤ 5 phút, RTO ≤ 60 phút; xem
[RPO-RTO.md](../deploy/RPO-RTO.md). Máy chết là hệ thống dừng cho tới khi dựng
lại từ bản sao lưu. Không có máy dự phòng, không có tự chuyển đổi.

**Không có nghiệp vụ thu hồi.** *Từ chối*, *Đã xoá* và *Quá hạn duyệt* là trạng
thái kết thúc — không ai sửa được, kể cả Quản trị hệ thống. Người dùng thử nên
biết trước, vì trong lúc thử người ta hay bấm nhầm rồi đi tìm nút hoàn tác.
