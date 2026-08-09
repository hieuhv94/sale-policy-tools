# Hướng dẫn chạy demo trên máy local

Một lệnh, từ máy trắng tới màn hình đăng nhập.

## Yêu cầu

- Docker và Docker Compose (bản có `docker compose`, không phải `docker-compose`)
- `make`, `openssl`
- Khoảng **6GB RAM trống** và 10GB đĩa
- Cổng **8080** còn trống

## Chạy

```bash
cd impl
make demo
```

Lần đầu mất khoảng **5–8 phút** (dựng ảnh Docker, cài phụ thuộc, dựng giao diện). Các lần sau khoảng
một phút.

Xong sẽ thấy:

```
  Giao diện:   http://localhost:8080
  Tài khoản:   tdv01 / tbp01 / kt01 / sa01 / bld01 / admin01 — mật khẩu Test@1234
```

Mở <http://localhost:8080> và đăng nhập.

## Sáu tài khoản mẫu

| Tài khoản | Vai trò | Làm được gì |
|---|---|---|
| `tdv01` | Trình dược viên | Lập khách hàng, lập hồ sơ CSBH, gửi duyệt |
| `tbp01` | Trưởng bộ phận | Ký số duyệt, trả lại, từ chối |
| `kt01` | Kế toán | Tiếp nhận L1 và L2, xuất hợp đồng, yêu cầu in lại |
| `sa01` | Sale Admin | Bàn giao, quản lý mẫu hợp đồng |
| `bld01` | Ban lãnh đạo | **Chỉ đọc** — xem báo cáo và nhật ký, không ghi được gì |
| `admin01` | Quản trị hệ thống | Danh mục sản phẩm, người dùng — **không** nằm trong luồng duyệt |

Mật khẩu chung: `Test@1234`.

> Mật khẩu mẫu này là lý do `make demo` chạy với `NODE_ENV=demo` chứ không phải `production`. Script
> nạp tài khoản mẫu **tự từ chối chạy** khi `NODE_ENV=production` (`SEC-14`) — cố ý, để không bao
> giờ có chuyện máy chủ thật lên với tài khoản `admin/Test@1234`.

## Đi thử một vòng nghiệp vụ

1. **`tdv01`** → *Khách hàng* → lập một khách hàng mới.
2. **`tdv01`** → *Hồ sơ CSBH* → lập hồ sơ, thêm sản phẩm, xem tỷ lệ chiết khấu tự tính → **Gửi duyệt**.
3. **`tbp01`** → *Việc của tôi* → mở hồ sơ → **Ký số duyệt**.
4. **`kt01`** → *Việc của tôi* → **Tiếp nhận lần 1** → **Xuất hợp đồng (PDF)**.
5. **`sa01`** → tải bản scan lên → **Bàn giao**.
6. **`kt01`** → **Tiếp nhận lần 2** → hồ sơ chuyển *Đang có hiệu lực*.
7. **`bld01`** → *Báo cáo* → xem tiến độ, tỷ lệ trả lại, SLA; thử **Xuất Excel**.

## Xem email hệ thống gửi

Mọi email đi vào **Mailpit**, không ra Internet. Mở nó ra ngoài:

```bash
make demo-mail    # rồi mở http://localhost:8025
```

Tách riêng thành một lệnh có chủ ý: nó mở thêm một cổng, mà bất biến *"chỉ Caddy mở cổng"*
(`SEC-10`) chỉ có nghĩa khi việc phá nó là một hành động rõ ràng.

## Lệnh hay dùng

```bash
make demo-logs                    # xem log tất cả service
make demo-down                    # dừng, giữ dữ liệu
make clean                        # xoá sạch cả dữ liệu
docker compose --env-file deploy/.env \
  -f deploy/compose.yml -f deploy/compose.demo.yml ps       # trạng thái từng container
curl -s http://localhost:8080/api/readyz | python3 -m json.tool   # sức khoẻ cả hệ
```

`/api/readyz` trả **503** khi có bất kỳ service nào không trả lời, và liệt kê rõ service nào. Đây là
chỗ nhìn đầu tiên khi có gì đó không chạy.

## Kiến trúc lúc chạy

17 container. **Chỉ `caddy` mở cổng ra ngoài** (8080); mười service Node và sáu thành phần hạ tầng
nằm trong mạng `internal`, không gọi thẳng từ máy thật được.

```
Trình duyệt → Caddy :8080 ──┬── /          → giao diện React (tệp tĩnh)
                            └── /api/*     → gateway :3000
                                              ├── identity     :3001
                                              ├── catalog      :3002
                                              ├── customer     :3003
                                              ├── policy       :3004
                                              ├── document     :3005 → Gotenberg, MinIO
                                              ├── notification :3006 → Mailpit
                                              ├── audit        :3007
                                              └── reporting    :3008
                            sla-worker (không mở cổng nào)
                            Postgres · Redis · RabbitMQ · MinIO
```

## Khi có trục trặc

**Cổng 8080 đã có người dùng.**

```bash
DEMO_PORT=9090 DEMO_URL=http://localhost:9090 make demo
```

**Một service `unhealthy`.** Xem log của đúng service đó:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml -f deploy/compose.demo.yml \
  logs document --tail=50
```

**Đăng nhập được nhưng mọi màn hình trả 502.** Nghĩa là gateway sống mà service phía sau chưa. Chờ
thêm (lần khởi động đầu mất tới 40 giây mỗi service) rồi kiểm `/api/readyz`.

**`password authentication failed`.** Mật khẩu của DB role lệch với file bí mật. `make demo` đồng bộ
lại ở mỗi lần chạy; nếu vẫn lỗi thì `make clean` rồi `make demo`.

## Khác biệt so với môi trường thật

Bản demo **không phải** bản production. Ba khác biệt có chủ ý:

| | Demo | Production |
|---|---|---|
| `NODE_ENV` | `demo` | `production` |
| Email | Mailpit, không ra Internet | SMTP công ty; hộp thư giả bị **từ chối khởi động** |
| Tài khoản | 10 tài khoản mẫu, mật khẩu chung | Không nạp tài khoản mẫu |
| TLS | Không, HTTP cổng 8080 | Caddy tự xin chứng chỉ Let's Encrypt |

Cam kết phục hồi (RPO 5 phút / RTO 60 phút) và những gì **không** được bảo vệ: xem
[`deploy/RPO-RTO.md`](../deploy/RPO-RTO.md).
