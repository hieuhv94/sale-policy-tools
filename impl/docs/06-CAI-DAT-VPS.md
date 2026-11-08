# Cài Chính sách bán hàng lên VPS — một lệnh, một tệp cấu hình

Hướng dẫn này dành cho **người cài đặt máy chủ**: từ một VPS trắng tới màn hình đăng nhập.
Cả hệ thống chạy bằng Docker; người cài chỉ chạy **một script** (`cai-dat.sh`), và mọi thông tin
cấu hình nằm trong **một tệp** (`/etc/csbh/csbh.env`).

Tài liệu sâu hơn: [04-TRIEN-KHAI.md](04-TRIEN-KHAI.md) (thư · Google · Cloudflare · nâng cấp từ bản
cũ) · [05-VAN-HANH.md](05-VAN-HANH.md) (sao lưu · phục hồi · chuyển máy · sự cố).

---

## 1. Chuẩn bị trước (không đụng máy chủ)

| Cần | Ghi chú |
| --- | --- |
| **VPS** Ubuntu 22.04/24.04 hoặc Debian 12, **4 CPU · 8 GB RAM · 50 GB đĩa** trở lên | quyền `sudo`. Có ổ thứ hai thì dùng cho bản sao lưu |
| **Tên miền** (vd. `csbh.congty.vn`) và bản ghi **A trỏ về IP của VPS** | làm TRƯỚC khi cài — bộ cài kiểm điều này, và Let's Encrypt khoá theo tuần nếu xin chứng chỉ hỏng nhiều lần |
| **Máy chủ SMTP**: địa chỉ, cổng, tài khoản, mật khẩu | thư mời kích hoạt là đường duy nhất để người dùng có mật khẩu |
| Tên miền gửi thư có **SPF · DKIM · DMARC** | thiếu thì thư mời rơi vào spam |
| **Tài khoản đọc registry** (Docker Hub: tên + *Access Token* quyền Read-only) | bên giao phần mềm cấp |
| **Ai là Quản trị hệ thống đầu tiên**: tên đăng nhập, email, họ tên | email phải thuộc miền được phép nhận thư |

Tường lửa của nhà cung cấp VPS: **chỉ mở 22, 80, 443**.

---

## 2. Cài đặt

### 2.1 Chép bộ cài lên VPS và chạy lần đầu

```sh
scp csbh-<phiên bản>.tar.gz quan-tri@<IP-VPS>:~
ssh quan-tri@<IP-VPS>
tar -xzf csbh-<phiên bản>.tar.gz
cd csbh-<phiên bản>
sudo ./cai-dat.sh
```

Lần đầu, bộ cài **chỉ tạo tệp cấu hình** `/etc/csbh/csbh.env` từ mẫu rồi dừng.

### 2.2 Điền tệp cấu hình

```sh
sudo nano /etc/csbh/csbh.env
```

Mọi dòng ghi `THAY_…` là bắt buộc:

| Khoá | Điền gì |
| --- | --- |
| `CSBH_WORKSPACE` | thư mục chứa **mọi dữ liệu** của hệ (mặc định `/srv/csbh`; nên đặt trên ổ dữ liệu, vd. `/data/csbh`) |
| `REGISTRY_USER` · `REGISTRY_TOKEN` | tài khoản đọc registry |
| `SITE_ADDRESS` | tên miền, **không** kèm `https://` |
| `ACME_EMAIL` | email nhận cảnh báo chứng chỉ HTTPS |
| `MAIL_HOST` · `MAIL_PORT` · `MAIL_FROM` | máy chủ SMTP, cổng (587 hoặc 465), địa chỉ người gửi |
| `MAIL_USER` · `MAIL_PASSWORD` | tài khoản SMTP (bỏ trống cả hai nếu relay không đòi xác thực) |
| `MAIL_ALLOWLIST` | tên miền được phép nhận thư, ngăn bằng dấu phẩy (vd. `congty.vn`) |
| `ADMIN_TEN_DANG_NHAP` · `ADMIN_EMAIL` · `ADMIN_HO_TEN` · `ADMIN_MAT_KHAU` | Quản trị đầu tiên. Mật khẩu ≥ 10 ký tự, có chữ và số — **bộ cài xoá dòng mật khẩu sau khi dùng**, và lần đăng nhập đầu bắt buộc đổi |
| `CSBH_BACKUP_MIRROR` *(tuỳ chọn)* | nơi chép thêm một bản sao lưu — nên trỏ sang **ổ khác** |
| `GOOGLE_*` *(tuỳ chọn)* | đăng nhập bằng Google — xem `04-TRIEN-KHAI.md` §4 |

Mật khẩu trong tệp này **không đi vào container qua biến môi trường**: bộ cài ghi chúng thành tệp
trong `<workspace>/secrets/` và container đọc tệp. Mật khẩu nội bộ (Postgres, MinIO, RabbitMQ, khoá
JWT) do bộ cài **tự sinh** — không cần điền.

### 2.3 Chạy lại bộ cài

```sh
sudo ./cai-dat.sh
```

Bộ cài không hỏi gì. Màn hình hiện từng bước, `▶` khi bắt đầu, `✔` khi xong:

```text
[1/12] ▶ Kiểm máy chủ: quyền root, hệ điều hành…
[1/12] ✔ Kiểm máy chủ: quyền root, hệ điều hành  (0 giây)
[2/12] ▶ Kiểm tệp cấu hình /etc/csbh/csbh.env…
…
[12/12] ✔ Kiểm khói: HTTPS và máy chủ thư (không ghi dữ liệu)  (6 giây)
```

| Bước | Làm gì |
| --- | --- |
| 1 | Kiểm quyền root và hệ điều hành |
| 2 | Kiểm tệp cấu hình — **mọi lỗi in ra một lần**, sửa hết rồi chạy lại |
| 3 | Cài Docker nếu thiếu · múi giờ `Asia/Ho_Chi_Minh` · đồng bộ giờ · tạo tài khoản hệ thống `csbh`. Tường lửa `ufw` đang bật thì mở thêm 80/443; **chưa bật thì không tự bật** (tránh tự khoá SSH) |
| 4 | Dựng thư mục làm việc (`CSBH_WORKSPACE`) |
| 5 | Kiểm DNS: tên miền trỏ về chính máy này |
| 6 | Đăng nhập registry (token đi qua stdin, không lộ ở dòng lệnh) |
| 7 | Kéo ảnh phần mềm — **chỉ khi máy chưa có** |
| 8 | Cài chương trình đi kèm ảnh vào `/opt/csbh/releases/<bản>` |
| 9 | Sinh mật khẩu nội bộ |
| 10 | Chạy migration CSDL và dựng các service |
| 11 | Tạo tài khoản Quản trị đầu tiên (chỉ khi CSDL chưa có tài khoản nào) |
| 12 | Cài lịch sao lưu tự động (cron) và tác tử vận hành (systemd) · kiểm HTTPS và kết nối tới máy chủ thư |

Toàn bộ đầu ra được ghi kèm vào `<workspace>/logs/cai-dat/<giờ>.log`.

### 2.4 Việc còn lại sau khi cài

1. Mở `https://<tên miền>`, đăng nhập bằng tài khoản Quản trị vừa khai và **đổi mật khẩu**.
2. Tạo một tài khoản thật cho chính bạn, **kiểm thư mời tới hộp thư** và kích hoạt được — đây là
   phép kiểm duy nhất cho đường thư đầu-cuối.
3. Khai danh mục (nhóm sản phẩm, sản phẩm, quy định chiết khấu) trên giao diện.

---

## 3. Thư mục trên VPS

```text
/etc/csbh/csbh.env          TỆP CẤU HÌNH DUY NHẤT (root:csbh 640)
/opt/csbh/                  CHƯƠNG TRÌNH — thay ở mỗi lần cập nhật, đừng sửa tay
  releases/<bản>/           csbh · deploy/ · tai-lieu/
  current -> releases/<bản>
/usr/local/bin/csbh         lệnh vận hành:  csbh help
<CSBH_WORKSPACE>/           DỮ LIỆU CỦA MÁY NÀY — sống qua mọi lần cập nhật
  data/                     CSDL · tệp đã tải lên · hàng đợi · chứng chỉ HTTPS
  backup/                   bản sao lưu CSDL và kho tệp
  secrets/                  mật khẩu nội bộ (700)
  logs/                     log từng service · nhật ký cài đặt · log cron
```

Sao lưu cả máy = sao lưu `/etc/csbh/` và `<CSBH_WORKSPACE>/`. Chuyển sang máy khác: dùng
`csbh xuat-chuyen-may` (`05-VAN-HANH.md`).

---

## 4. Vận hành thường ngày

| Việc | Lệnh |
| --- | --- |
| Xem trạng thái các service | `csbh trang-thai` |
| Xem log | `csbh log [service]` |
| Phiên bản đang chạy | `csbh phien-ban` |
| Sao lưu ngay | `csbh sao-luu` (cron đã tự chạy theo lịch đặt trên trang *Vận hành*) |
| Đổi cấu hình (SMTP, tên miền…) | sửa `/etc/csbh/csbh.env` rồi `sudo ./cai-dat.sh` — **không đụng dữ liệu** |
| Dừng / bật lại | `csbh xuong` · `csbh len` |

### Cập nhật lên bản mới

```sh
sudo csbh cap-nhat
```

Hỏi registry có bản mới không (không kéo gì nếu đã mới nhất) → **sao lưu** → giữ ảnh cũ làm đường
lùi → kéo bản mới → migration → dựng lại. Mỗi bước hiện `▶` / `✔`. Máy **không bao giờ tự đổi
bản** — `csbh len`, khởi động lại máy hay chạy lại bộ cài đều dùng ảnh đã có.

Lùi về bản trước (chỉ được khi bản mới chưa thêm migration — lệnh tự kiểm và nói ra):

```sh
sudo csbh lui-lai
```

---

## 5. Khi một bước hỏng

Bước hỏng hiện `✘` kèm câu nói việc phải làm. Sửa rồi chạy lại `sudo ./cai-dat.sh` — các bước đã
xong được bỏ qua.

| Bước | Thường do | Làm gì |
| --- | --- | --- |
| 2 | còn dòng `THAY_…`, email sai dạng, `MAIL_HOST` là `localhost` | sửa đúng dòng được nêu |
| 5 | DNS chưa trỏ, hoặc tên miền đứng sau proxy Cloudflare (cam) / NAT | đợi DNS; đứng sau proxy thì `sudo ./cai-dat.sh --bo-kiem-dns` |
| 6 | sai `REGISTRY_USER` / `REGISTRY_TOKEN` | tạo lại token Read-only |
| 9 | có dữ liệu CSDL cũ mà mất thư mục `secrets/` | chép lại `secrets/` của lượt cài trước; không có gì đáng giữ thì xoá `<workspace>/data/postgres` |
| 10 | cấu hình thư sai làm service không khởi động | `csbh log notification`, sửa tệp cấu hình |
| 12 | HTTPS chưa lên (chứng chỉ) | `csbh log caddy` — thường là DNS hoặc cổng 80 bị chặn |

Đổi `CSBH_WORKSPACE` sau khi đã cài: bộ cài **dừng và hướng dẫn dời** dữ liệu, không tự dời và không
dựng một hệ trống mới.

---

## 6. Phía bên giao phần mềm: dựng và đẩy bản mới

Trên máy phát triển (thư mục `impl/`):

```sh
# 1. Tăng số trong tệp VERSION (mỗi lần giao là một số MỚI)
make dong-goi        # dựng ba ảnh + gói workspace/dong-goi/csbh-<bản>.tar.gz
docker login         # tài khoản có quyền đẩy
make day-anh         # đẩy thẻ số TRƯỚC, rồi -latest; kèm minio-latest
```

Sau `make day-anh`, máy khách lên bản mới bằng `sudo csbh cap-nhat`. Gói `.tar.gz` chỉ cần cho lần
cài đầu — chương trình (compose, `csbh`, tài liệu) đi kèm ảnh `ops` và được bung ra ở mỗi lượt cập nhật.
