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

Xoá hẳn CSDL chứ không dọn từng bảng: danh sách bảng phải giữ đồng bộ với 77 migration, mà quên một
bảng thì chỗ "sạch" đó lặng lẽ còn dữ liệu cũ — đúng thứ khó nhìn ra nhất khi đang thử nghiệp vụ.

> `make demo` **xoá luôn dữ liệu của bộ test** vì cả hai dùng chung một Postgres. Không sao:
> `make test` tự nạp lại 10 tài khoản mẫu trước khi chạy.

### Thứ tự dựng tài khoản

**Không còn ràng buộc thứ tự nào** — tài khoản không quan hệ với nhau, biểu mẫu tạo chỉ có bốn ô
giống hệt nhau cho cả sáu vai trò: họ tên, tên tài khoản, email, vai trò.

Nhưng vẫn nên dựng **Trưởng bộ phận, Kế toán và Sale Admin trước** Trình dược viên, vì lý do khác:
lúc gửi duyệt, TDV phải chọn được một Trưởng bộ phận và một Kế toán **đã kích hoạt tài khoản**. Chưa
có ai trong danh sách thì ô chọn rỗng và hồ sơ không gửi đi được — màn hình nói rõ điều đó ngay dưới
ô chọn.

Mỗi tài khoản mới nhận **thư mời kích hoạt**, và đó là **đường duy nhất** để nó có mật khẩu — không
có mật khẩu mặc định nào để bàn giao. Xem thư ở Mailpit (mục dưới) và đi qua liên kết để đặt mật
khẩu. Chưa đi qua liên kết thì tài khoản không đăng nhập được bằng bất cứ gì.

Sau đó, vẫn bằng `admin01`: *Sản phẩm* → thẻ **Nhóm sản phẩm** tạo nhóm trước, rồi quay lại thẻ
**Sản phẩm** tạo sản phẩm kèm giá.
*Chiết khấu* → tạo **quy định chiết khấu**. Ngưỡng chỉ phụ thuộc **nhóm sản phẩm × loại khách
hàng**, nên không có danh mục tra cứu nào phải khai trước.

> Tới `19/08` màn hình này còn ba danh mục tra cứu — tỉnh · bệnh viện · kênh — làm nguồn cho ba ô
> chọn trên biểu mẫu khách hàng. **Cả ba đã rời khỏi phần mềm** (`0026`) vì ngưỡng chiết khấu thôi
> phụ thuộc chúng; ô *Tỉnh/Thành phố* của khách hàng hôm nay lấy từ một **danh sách đóng 63 đơn vị
> dựng sẵn trong phần mềm** (`0205`), không phải từ một danh mục ai đó khai.

> `Test@1234` là lý do `make demo` chạy với `NODE_ENV=demo` chứ không phải `production`. Cả script
> tạo tài khoản lẫn script dựng lại CSDL đều **tự từ chối chạy** khi `NODE_ENV=production`
> (`SEC-14`) — cố ý, để không bao giờ có chuyện máy chủ thật lên với tài khoản `admin/Test@1234`,
> và để không ai xoá nhầm CSDL thật.

## Bộ dữ liệu mẫu — nếu muốn

Không cần dựng tay thì nạp bộ mẫu cũ vào bản demo đang chạy:

```bash
make demo-mau
```

**Chồng demo phải đang chạy.** Bộ mẫu nạp qua **API thật** chứ không chèn thẳng vào CSDL — dữ liệu
demo đi qua đúng máy trạng thái và đúng phép tính chiết khấu, nếu không nó sẽ nằm ở những trạng thái
mà phần mềm không tạo ra được. Chạy trên chồng đã hạ thì lệnh dừng ngay và nói phải làm gì; chưa
chạy `make demo` lần nào thì chạy nó trước (lưu ý: `make demo` **xoá sạch CSDL demo**).

Nó nạp 10 tài khoản gốc phủ đủ sáu vai trò (`tdv01` · `tbp01` · `kt01` · `sa01` · `bld01` ·
`admin01`, mật khẩu chung `Test@1234`) kèm dữ liệu nghiệp vụ mẫu mô tả ở mục dưới.

| Tài khoản | Vai trò | Làm được gì |
|---|---|---|
| `tdv01` | Trình dược viên | Lập khách hàng, lập hồ sơ CSBH, gửi duyệt |
| `tbp01` | Trưởng bộ phận | Ký số duyệt, trả lại, từ chối |
| `kt01` | Kế toán | Tiếp nhận L1 và L2, xuất hợp đồng, yêu cầu in lại |
| `sa01` | Sale Admin | Bàn giao, quản lý mẫu hợp đồng |
| `bld01` | Ban lãnh đạo | **Chỉ đọc** — xem báo cáo và nhật ký, không ghi được gì |
| `admin01` | Quản trị hệ thống | Danh mục sản phẩm, người dùng — **không** nằm trong luồng duyệt |

Ngoài mười tài khoản trên còn 16 tài khoản nữa (`sa02`, `tbp03`, `kt03`, `kt04`, `tdv04`…`tdv15`)
chỉ để danh sách Người dùng có đủ dòng mà thử phân trang. Chúng **chưa kích hoạt** nên không đăng
nhập được — và cũng vì thế không xuất hiện trong ô chọn người xử lý ở bước gửi duyệt.

Tài khoản **không có quan hệ quản lý** với nhau: chỉ có tên, email và vai trò. Việc ai xử lý hồ sơ
của ai do người gửi duyệt chọn tại chỗ.

### Dữ liệu nghiệp vụ trong bộ mẫu

**Phần đầu viết tay, phần đuôi sinh ra.** Những ca đáng nhìn được chọn tay và đứng đầu danh sách;
phần sinh ra chỉ để mỗi màn hình vượt 20 dòng — không có nó thì không thử được phân trang, mà 20
dòng viết tay cho mười màn hình là 200 dòng dữ liệu không ai giữ đúng được.

| | Số lượng | Vượt một trang? |
|---|---|---|
| Người dùng | 26 | ✓ |
| Nhóm sản phẩm | 24 | ✓ |
| Sản phẩm | 35, có giá thật | ✓ |
| Quy định chiết khấu | 27 | ✓ |
| Khách hàng | 28 — nhà thuốc, công ty, khoa bệnh viện | ✓ |
| Hồ sơ CSBH | 146, trải khắp 9 trạng thái | ✓ |
| Mẫu hợp đồng | 22 tệp `.docx` thật | ✓ |
| Thư hỏng chưa xử lý | 24 | ✓ |
| Nhật ký | ~670 dòng | ✓ |
| Hồ sơ cần cập nhật | 95 | ✓ |
| Hồ sơ **sắp quá hạn** | 5 — còn 3 đến 20 giờ | ✓ |
| Hồ sơ **đã quá hạn** | 4 — mỗi bước chờ một cái | ✓ |

Hộp việc của **cả bốn vai trò trong luồng** cũng vượt một trang — 22 hồ sơ chờ `tbp01`, 23 chờ
`kt01`, 21 chờ `sa01`, 22 hồ sơ bị trả lại về `tdv01`.

Năm hồ sơ đầu là năm ca viết tay, đặt ở năm trạng thái để mỗi vai trò đăng nhập vào là **có ngay
việc để xem**, và chúng vẫn đứng đầu danh sách:

| Hồ sơ | Trạng thái | Ai thấy việc |
|---|---|---|
| Nhà thuốc Minh Châu | Nháp | `tdv01` sửa tiếp |
| Nhà thuốc Minh Châu | Yêu cầu chỉnh sửa | `tdv01` — có dải **lý do trả lại** |
| Dược phẩm Hoàng Long | Chờ TBP duyệt | `tbp01` |
| Khoa Dinh dưỡng Bạch Mai | Chờ KT duyệt L1 | `kt01` — xuất được hợp đồng |
| Nhà thuốc Đông Á | Đang có hiệu lực | báo cáo, màn hình khách hàng |

Ba chi tiết được đặt có chủ ý:

- **Đúng một dòng vượt ngưỡng** trong chín dòng sản phẩm của các ca viết tay. Vượt ngưỡng phải là
  ngoại lệ thì dấu cảnh báo mới có nghĩa — một bảng dòng nào cũng đỏ thì người duyệt thôi không nhìn.
- **Nhà thuốc Đông Á thuộc `tdv02`**, và bốn khách cuối thuộc `tdv02`/`tdv03`. Đăng nhập bằng `tdv01`
  sẽ **không** thấy những khách đó. Thử tiếp bằng `tbp02`: họ không thấy hồ sơ nào cả, vì bộ mẫu giao
  hết cho `tbp01` — phạm vi đi theo phân công trên từng hồ sơ, nhìn thấy được ngay.
- **Giá và ngưỡng đổi ở bước cuối cùng**, sau khi mọi hồ sơ đã đóng băng. Đó là lý do box *Yêu cầu
  cập nhật* trên trang Tổng quan có nội dung: 95 hồ sơ đang giữ con số cũ trong khi danh mục đã đổi.

### Hồ sơ sắp quá hạn và đã quá hạn

Chín hồ sơ dựng riêng để hai thẻ cảnh báo trên trang Tổng quan có nội dung:

| Nhóm | Số lượng | Đặt ở đâu |
|---|---|---|
| **Sắp quá hạn** | 5 | Còn 3 · 6 · 9 · 11 · 20 giờ là tới hạn, rải trên cả bốn bước chờ |
| **Đã quá hạn** | 4 | Quá hạn 1–2 ngày, mỗi bước chờ đúng một cái |

Nhóm quá hạn giữ **dưới 3 ngày** có chủ ý: đúng 3 ngày là sla-worker tự chuyển *Đã xoá*, và một bản
demo mà dữ liệu tự biến mất sau vài phút là một bản demo khó tin.

Vòng quét SLA chạy 5 phút một lần, nên trong vòng năm phút sau khi nạp, `make demo-mail` có thêm
**5 thư nhắc** (chỉ tới người phải thao tác) và **4 thư quá hạn** (tới chủ bước và TDV lập hồ sơ).

Đăng nhập `sa01` sẽ thấy **2** ở mỗi thẻ chứ không phải 4 và 5 — và đó là đúng: hồ sơ chưa qua tay
Sale Admin thì cột `sale_admin_user_id` còn rỗng, nên nó nằm ngoài phạm vi dữ liệu của họ. Một chỗ
nữa nhìn thấy phạm vi hoạt động thật.

**Hai ngoại lệ của "nạp qua API thật".** Cả hai đều vì cùng một lẽ: không API nào tạo ra được thứ
đó, và giả lập cho "thật" thì mong manh hơn nhiều so với việc ghi thẳng rồi nói rõ ra đây.

1. **24 thư hỏng** chèn thẳng SQL — thư hỏng là hậu quả của một lần gửi thất bại, không phải thứ ai
   đó khai báo. Payload là sự kiện thật của hồ sơ thật, nên nút **Gửi lại** ở *Quản trị ▸ Hệ thống*
   gửi được thư và tự đánh dấu đã xử lý.
2. **Đồng hồ SLA của 9 hồ sơ trên** vặn thẳng bằng SQL — hạn 14 ngày do máy chủ tự đặt, còn trạng
   thái *Quá hạn duyệt* chỉ đến từ vòng quét khi đồng hồ thật đi qua mốc ấy. Muốn "thật" thì phải chờ
   hai tuần. Bản thân hồ sơ **vẫn lập qua API** và đẩy tới bước bằng đúng những hành động giao diện
   gọi, nên dòng sản phẩm, nhật ký và người được phân công đều là dữ liệu thật; chỉ mốc thời gian là
   vặn tay. Nhóm quá hạn còn phát kèm sự kiện `sla.overdue` đúng như sla-worker phát, nên read-model
   đồng bộ theo, nhật ký kiểm toán có vết và Mailpit có thư để xem.

Nạp mất khoảng **một phút rưỡi** — 137 hồ sơ đi qua đúng máy trạng thái là vài trăm lượt gọi API.
Mọi hồ sơ đều giao cho `tbp01` · `kt01` · `sa01`, nên đăng nhập bằng `tbp02` là thấy một hộp việc
rỗng — đúng theo thiết kế.

Nạp lại từ đầu bất cứ lúc nào (xoá sạch dữ liệu nghiệp vụ cũ, **giữ nguyên tài khoản**):

```bash
make demo-data
```

## Đi thử một vòng nghiệp vụ — trên bộ mẫu

1. **`tdv01`** → *Khách hàng* → lập một khách hàng mới.
2. **`tdv01`** → *Hồ sơ CSBH* → lập hồ sơ, thêm sản phẩm, xem tỷ lệ chiết khấu tự tính → **Gửi
   duyệt** → chọn **Trưởng bộ phận** và **Kế toán**, đọc lại **bản CSBH A4** hiện ngay trong hộp
   thoại, rồi mới bấm Xác nhận.
3. **`tbp01`** → *Tổng quan* → mở hồ sơ → **Ký số duyệt**. Đăng nhập `tbp02` thì **không thấy** hồ sơ
   này — chỉ người được chọn mới thấy.
4. **`kt01`** → *Tổng quan* → **Tiếp nhận lần 1**, chọn **Sale Admin** xử lý bước sau → **Xuất hợp
   đồng (PDF)**.
5. **`sa01`** → tải bản scan lên → **Bàn giao**.
6. **`kt01`** → **Tiếp nhận lần 2** → hồ sơ chuyển *Đang có hiệu lực*.
7. **`bld01`** → *Tổng quan* → xem tiến độ, tỷ lệ trả lại, SLA → *Thống kê* → đổi nhịp **Quý**, xem
   phễu duyệt và chiết khấu theo nhóm → cuộn xuống **Ai đang chạy tốt, ai đang chững**, bấm một
   trình dược viên để lọc tại chỗ → *Hồ sơ CSBH* → thử **Xuất Excel**.
8. **`tbp01`** → *Thống kê* → xem **cơ cấu chất lượng hồ sơ** của từng TDV gửi tới bàn mình, và
   **số ngày họ sửa lại** sau khi bị trả.

> **Dữ liệu mẫu trải ba năm** (`0095`). `make demo-mau` dựng cho một phần khách hàng cả một chuỗi
> CSBH từ 2024 tới nay — mỗi bản sau thay bản trước, đúng bất biến *một khách một CSBH hiệu lực*.
> Nhờ vậy đổi nhịp sang **Năm** ở trang *Thống kê* là thấy ngay khối lượng tăng dần và chiết khấu
> bình quân nhích lên qua từng năm. Mọi hồ sơ vẫn đi qua API và đủ mười bước; chỉ **mốc thời gian**
> là vặn tay — cùng cách bộ nạp đã làm với hồ sơ quá hạn.

## Email: cơ chế gửi

**Ở bản demo, không thư nào ra Internet.** Tất cả đi vào **Mailpit** chạy trong máy. Mở nó ra:

```bash
make demo-mail         # mở http://localhost:8025
make demo-mail-down    # đóng lại, thư đã nhận vẫn còn
```

Tách riêng thành một lệnh có chủ ý: nó mở thêm một cổng, mà bất biến *"chỉ Caddy mở cổng"*
(`SEC-10`) chỉ có nghĩa khi việc phá nó là một hành động rõ ràng. Giao diện Mailpit đọc được **mọi**
thư của hệ thống — kể cả liên kết kích hoạt và liên kết đặt lại mật khẩu, tức là chiếm được mọi tài
khoản — nên nó không mở thường trực.

Cổng khác 8025 thì `MAILPIT_PORT=9025 make demo-mail`.

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

Cam kết phục hồi (RPO một chu kỳ sao lưu / RTO 60 phút) và những gì **không** được bảo vệ: xem
[`deploy/RPO-RTO.md`](../deploy/RPO-RTO.md).
