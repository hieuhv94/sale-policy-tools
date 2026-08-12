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
  Tài khoản:   admin01 / Test@1234 — CSDL trống, tự tạo phần còn lại
```

Mở <http://localhost:8080> và đăng nhập.

## CSDL trống, một tài khoản quản trị

**`make demo` xoá và dựng lại CSDL từ đầu ở mỗi lần chạy**, rồi tạo đúng một tài khoản:
`admin01` / `Test@1234`, vai trò Quản trị hệ thống. Không có tài khoản nào khác, không có sản phẩm,
không có khách hàng, không có hồ sơ.

Đó là chủ ý: thứ đáng thử nhất chính là **đường onboarding thật** — quản trị dựng cây tài khoản,
khai danh mục và quy định chiết khấu, rồi Trình dược viên lập khách hàng và hồ sơ. Nạp sẵn dữ liệu
thì không phân biệt được cái mình vừa nhập với cái có sẵn, và cả nhánh onboarding không bao giờ được
chạy thử.

Xoá hẳn CSDL chứ không dọn từng bảng: danh sách bảng phải giữ đồng bộ với 17 migration, mà quên một
bảng thì chỗ "sạch" đó lặng lẽ còn dữ liệu cũ — đúng thứ khó nhìn ra nhất khi đang thử nghiệp vụ.

> `make demo` **xoá luôn dữ liệu của bộ test** vì cả hai dùng chung một Postgres. Không sao:
> `make test` tự nạp lại 10 tài khoản mẫu trước khi chạy.

### Thứ tự dựng tài khoản

Cây phân quyền có hai nhánh độc lập, và **thứ tự có ràng buộc**: không tạo được Trình dược viên khi
chưa có Trưởng bộ phận nào để chọn.

1. **Trưởng bộ phận** — không có trường nào thêm.
2. **Sale Admin** — gốc của cây xem dữ liệu.
3. **Kế toán** — chọn *Cấp trên* là Sale Admin vừa tạo.
4. **Trình dược viên** — chọn *Trưởng bộ phận quản lý* (**bắt buộc**) và *Cấp trên* là Kế toán.
5. **Ban lãnh đạo** — nếu muốn xem phần chỉ đọc.

Mỗi tài khoản mới nhận **thư mời kích hoạt**, và đó là **đường duy nhất** để nó có mật khẩu — không
có mật khẩu mặc định nào để bàn giao. Xem thư ở Mailpit (mục dưới) và đi qua liên kết để đặt mật
khẩu. Chưa đi qua liên kết thì tài khoản không đăng nhập được bằng bất cứ gì.

Sau đó, vẫn bằng `admin01`: *Danh mục* → tạo **nhóm sản phẩm**, **sản phẩm** kèm giá, **quy định
chiết khấu**, và ba danh mục tra cứu (tỉnh · bệnh viện · kênh) — ba cái này là nguồn của ba ô chọn
trên biểu mẫu khách hàng.

> `Test@1234` là lý do `make demo` chạy với `NODE_ENV=demo` chứ không phải `production`. Cả script
> tạo tài khoản lẫn script dựng lại CSDL đều **tự từ chối chạy** khi `NODE_ENV=production`
> (`SEC-14`) — cố ý, để không bao giờ có chuyện máy chủ thật lên với tài khoản `admin/Test@1234`,
> và để không ai xoá nhầm CSDL thật.

## Bộ dữ liệu mẫu — nếu muốn

Không cần dựng tay thì nạp bộ mẫu cũ vào bản demo đang chạy:

```bash
make demo-mau
```

Nó nạp 10 tài khoản phủ đủ sáu vai trò (`tdv01` · `tbp01` · `kt01` · `sa01` · `bld01` · `admin01`,
mật khẩu chung `Test@1234`) kèm dữ liệu nghiệp vụ mẫu mô tả ở mục dưới.

| Tài khoản | Vai trò | Làm được gì |
|---|---|---|
| `tdv01` | Trình dược viên | Lập khách hàng, lập hồ sơ CSBH, gửi duyệt |
| `tbp01` | Trưởng bộ phận | Ký số duyệt, trả lại, từ chối |
| `kt01` | Kế toán | Tiếp nhận L1 và L2, xuất hợp đồng, yêu cầu in lại |
| `sa01` | Sale Admin | Bàn giao, quản lý mẫu hợp đồng |
| `bld01` | Ban lãnh đạo | **Chỉ đọc** — xem báo cáo và nhật ký, không ghi được gì |
| `admin01` | Quản trị hệ thống | Danh mục sản phẩm, người dùng — **không** nằm trong luồng duyệt |

### Dữ liệu nghiệp vụ trong bộ mẫu

Cố ý **nhỏ** — vừa đủ để thử, không phải một đống dữ liệu không ai đọc nổi:

| | Số lượng |
|---|---|
| Sản phẩm | 6, chia 2 nhóm, có giá thật |
| Khách hàng | 4 — nhà thuốc, công ty, khoa bệnh viện |
| Hồ sơ CSBH | 5, mỗi hồ sơ một trạng thái khác nhau |
| Danh mục | 3 tỉnh/thành, 2 bệnh viện, 2 kênh, 1 người ký |

Năm hồ sơ đặt ở năm trạng thái để mỗi vai trò đăng nhập vào là **có ngay việc để xem**:

| Hồ sơ | Trạng thái | Ai thấy việc |
|---|---|---|
| Nhà thuốc Minh Châu | Nháp | `tdv01` sửa tiếp |
| Nhà thuốc Minh Châu | Yêu cầu chỉnh sửa | `tdv01` — có dải **lý do trả lại** |
| Dược phẩm Hoàng Long | Chờ TBP duyệt | `tbp01` |
| Khoa Dinh dưỡng Bạch Mai | Chờ Kế toán L1 | `kt01` — xuất được hợp đồng |
| Nhà thuốc Đông Á | Đang có hiệu lực | báo cáo, màn hình khách hàng |

Hai chi tiết được đặt có chủ ý:

- **Đúng một dòng vượt ngưỡng** trong tổng số chín dòng sản phẩm. Vượt ngưỡng phải là ngoại lệ thì
  dấu cảnh báo mới có nghĩa — một bảng dòng nào cũng đỏ thì người duyệt thôi không nhìn nữa.
- **Nhà thuốc Đông Á thuộc `tdv02`**, ba khách còn lại thuộc `tdv01`. Đăng nhập bằng `tdv01` sẽ
  **không** thấy khách hàng đó — phạm vi dữ liệu theo cây tổ chức, nhìn thấy được ngay.

Dữ liệu này nạp **qua API thật**, không chèn thẳng vào CSDL: nó đi qua đúng máy trạng thái và đúng
phép tính chiết khấu, nên không thể ở một trạng thái mà phần mềm không tạo ra được.

Nạp lại từ đầu bất cứ lúc nào (xoá sạch dữ liệu nghiệp vụ cũ, **giữ nguyên tài khoản**):

```bash
make demo-data
```

## Đi thử một vòng nghiệp vụ — trên bộ mẫu

1. **`tdv01`** → *Khách hàng* → lập một khách hàng mới.
2. **`tdv01`** → *Hồ sơ CSBH* → lập hồ sơ, thêm sản phẩm, xem tỷ lệ chiết khấu tự tính → **Gửi duyệt**.
3. **`tbp01`** → *Tổng quan* → mở hồ sơ → **Ký số duyệt**.
4. **`kt01`** → *Tổng quan* → **Tiếp nhận lần 1** → **Xuất hợp đồng (PDF)**.
5. **`sa01`** → tải bản scan lên → **Bàn giao**.
6. **`kt01`** → **Tiếp nhận lần 2** → hồ sơ chuyển *Đang có hiệu lực*.
7. **`bld01`** → *Báo cáo* → xem tiến độ, tỷ lệ trả lại, SLA; thử **Xuất Excel**.

## Email: cơ chế gửi

**Ở bản demo, không thư nào ra Internet.** Tất cả đi vào **Mailpit** chạy trong máy. Mở nó ra:

```bash
make demo-mail    # rồi mở http://localhost:8025
```

Tách riêng thành một lệnh có chủ ý: nó mở thêm một cổng, mà bất biến *"chỉ Caddy mở cổng"*
(`SEC-10`) chỉ có nghĩa khi việc phá nó là một hành động rõ ràng.

### Địa chỉ người gửi

`MAIL_FROM`, đặt ở `deploy/compose.demo.yml`, hiện là **`csbh-noreply@nutricare.test`**.

`.test` là tên miền dành riêng cho thử nghiệm (RFC 6761) — nó **không bao giờ tồn tại** trên
Internet thật. Lên máy chủ thật phải đổi thành địa chỉ trên tên miền của công ty, và tên miền đó
phải khai **SPF · DKIM · DMARC**; thiếu thì máy chủ nhận sẽ chặn hoặc ném vào thư rác.

### Hai đường gửi thư, tách nhau

| | Thư kích hoạt · đặt lại mật khẩu | Thông báo luồng duyệt |
|---|---|---|
| Ai gửi | `identity`, gọi SMTP thẳng trong request | `notification`, qua RabbitMQ |
| Thử lại | 3 lần (0,2s · 1s · 3s) trong tiến trình | 3 lần (1s · 3s · 9s) |
| Hỏng hẳn | Ghi log, API báo `inviteMailSent: false` | Vào **hàng thư hỏng**, gửi lại được ở màn hình *Hệ thống* |

**Vì sao thư mời không đi qua hàng đợi như phần còn lại**: hàng thư hỏng lưu nguyên thân sự kiện
(`ntf.dead_letter.payload`) và người quản trị đọc được nó. Đẩy thư mời qua đó là đưa **token kích
hoạt thô** vào một bảng có người đọc — ai mở được màn hình thư hỏng là chiếm được tài khoản chưa
kích hoạt. Hiện tại token thô chỉ tồn tại trong bộ nhớ và trong thân email; CSDL chỉ giữ bản băm.

Đổi lại, thư mời hỏng thì **không có hàng chờ để gửi lại tự động** — cách cứu là bấm *Gửi lại thư
mời*, và nút đó **sinh token mới** chứ không phát lại token cũ.

### Biến môi trường

Cả hai service đọc **cùng một bộ**, qua `loadMailConfig` ở `@csbh/http-kit`:

| Biến | Việc |
|---|---|
| `MAIL_HOST` · `MAIL_PORT` | Máy chủ SMTP. Mặc định `mailpit:1025` |
| `MAIL_FROM` | Địa chỉ ô *From* |
| `MAIL_REDIRECT_ALL` | Dồn **mọi** thư về một hộp thư; người nhận gốc ghi ở header `X-Original-To` |
| `MAIL_ALLOWLIST` | Chỉ gửi tới các tên miền này, cách nhau bằng dấu phẩy |

Hai chốt an toàn chạy **lúc khởi động**, không lúc gửi — service cấu hình sai thì không chạy nổi,
và một service không chạy thì ai cũng thấy ngay:

- `NODE_ENV=production` mà `MAIL_HOST` là hộp thư giả (`mailpit`, `localhost`…) → **chặn**. Không có
  nó thì mọi thông báo rơi vào hư vô mà không ai báo lỗi.
- Môi trường khác production trỏ vào SMTP thật mà chưa đặt `MAIL_REDIRECT_ALL` → **chặn**. Không có
  nó thì thư thử nghiệm bay thẳng tới Trưởng bộ phận thật.

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
