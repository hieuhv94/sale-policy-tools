# Hướng dẫn chạy test

Toàn bộ test chạy **trong Docker**. Không có bước nào chạy Node trực tiếp trên máy thật — máy chỉ
cần Docker và `make`.

## Chạy lần đầu

```bash
cd impl
make up        # dựng Postgres, Redis, RabbitMQ, MinIO, Mailpit, Gotenberg + chạy migration
make install   # cài phụ thuộc (vào volume, không đụng máy thật)
make seed      # nạp 10 tài khoản mẫu và danh mục tối thiểu
make test      # chạy toàn bộ
```

Lần chạy đầu mất khoảng 3–5 phút vì phải kéo ảnh Docker và cài phụ thuộc. Các lần sau khoảng
**4–6 phút** cho toàn bộ bộ test.

## Kết quả mong đợi

```
 Test Files  68 passed (68)
      Tests  1541 passed (1541)
```

Báo cáo JUnit ghi ra `workspace/reports/junit.xml`. Thư mục `workspace/` nằm ngoài mã nguồn và
**không được commit** — nó là chỗ chạy thử, xoá lúc nào cũng được.

## Chạy một phần

```bash
# Một tệp
docker compose -f deploy/compose.yml -f deploy/compose.test.yml run --rm test \
  pnpm vitest run tests/http/policy.test.ts

# Một nhóm theo tên
docker compose -f deploy/compose.yml -f deploy/compose.test.yml run --rm test \
  pnpm vitest run -t 'WF-13'

# Chỉ test giao diện (không cần CSDL)
docker compose -f deploy/compose.yml -f deploy/compose.test.yml run --rm test \
  pnpm vitest run tests/web
```

## Bố cục bộ test

| Thư mục | Nội dung | Cần gì |
|---|---|---|
| `tests/db/` | Ràng buộc ở tầng CSDL: 9 role, partial unique index, trigger chặn xoá, nhật ký chỉ ghi thêm | Postgres |
| `tests/http/` | Toàn bộ nghiệp vụ: đăng nhập, danh mục, khách hàng, luồng duyệt 10 bước, tài liệu, hợp đồng, SLA, nhật ký, báo cáo, an ninh | Tất cả hạ tầng |
| `tests/web/` | Giao diện: định dạng số, bảng quyền, bảng sản phẩm, ô nhập, ngân sách gói | Không cần gì |
| `packages/*/src/*.test.ts` | Thuần logic: công thức chiết khấu, máy trạng thái | Không cần gì |

## Vì sao test chạy tuần tự

`vitest.config.ts` đặt `fileParallelism: false`. Các tệp test dùng **chung một Postgres thật**, nên
chạy song song thì hai tệp cùng chèn vào một bảng rồi đổ lỗi cho nhau. Chậm hơn, nhưng mọi lần đỏ
đều là lỗi thật.

### Sản phẩm thì bộ kiểm tự dọn `mới 29/08`

**Danh mục sản phẩm là ngoại lệ, và nó từng làm hỏng một lượt chạy.** `cat.product` không có đường
xoá qua API (`0121`), nên chín trong mười hai tệp kiểm tạo sản phẩm mà không gỡ được chúng đi. Đo
được: **~690 dòng mỗi lượt chạy**, và tới 5000 dòng thì các ca *nhập Excel* đỏ với
`IMPORT_TOO_MANY_ROWS` — ở một chỗ chẳng liên quan gì tới nguyên nhân.

Từ `0156`, `withAdminDb` xoá mọi sản phẩm mang tiền tố `ZZ` **ở lượt dùng CSDL đầu tiên** của mỗi
lượt chạy. Không phải làm gì cả; dòng `bộ kiểm: dọn N sản phẩm còn lại của lượt chạy trước` trong
log là bình thường.

> Dọn ở ĐẦU lượt, không phải cuối: một lượt chạy hỏng giữa chừng vẫn để lại dữ liệu cho người gỡ lỗi
> soi, và lượt sau tự dọn hộ.

`don-rac.test.ts` canh chuyện này. Nếu nó đỏ, câu lỗi nói luôn cách dọn tay.

## Ba điều dễ vấp

**1. Test đỏ vì trạng thái sót lại từ lượt chạy trước.**
CSDL và MinIO sống qua các lượt chạy. Phần lớn test tự dọn, nhưng nếu một lượt chạy bị ngắt giữa
chừng thì có thể còn rác. Dọn sạch:

```bash
make clean   # xoá container + volume dữ liệu + thư mục workspace
make up && make install && make seed
```

**2. `make test` báo "tài khoản bị khoá".**
Bộ test an ninh cố tình gõ sai mật khẩu nhiều lần. Nó tự gỡ khoá ở đầu mỗi tệp, nhưng nếu bạn vừa
ngắt giữa chừng thì gỡ tay:

```bash
make psql
UPDATE idn.app_user SET failed_attempts = 0, locked_until = NULL;
```

**3. Không chạy test khi bản demo đang bật.**
Hai bên dùng chung một Postgres, một RabbitMQ, một MinIO. `make test` tự phát hiện và dừng lại với
lời nhắc; chạy `make demo-down` rồi thử lại. Bỏ qua cảnh báo đó thì khoảng 18 test đỏ ở bốn tệp
khác nhau mà không tệp nào có lỗi thật.

**4. Đừng sửa file migration đã chạy.**
`scripts/migrate.sh` so md5 từng file và **dừng hẳn** khi nội dung đổi — kể cả đổi một dòng chú
thích. Muốn đổi lược đồ thì thêm file mới `00NN_....sql`.

## Chạy lại nhiều lần

Sau khi sửa bất kỳ thứ gì, chạy **ba lượt liên tiếp**:

```bash
make test && make test && make test
```

Không phải nghi thức. Một số lỗi chỉ lộ ra ở lượt thứ hai hoặc thứ ba, vì chúng phụ thuộc vào dữ
liệu mà lượt trước để lại — và đó là loại lỗi sẽ xảy ra trên máy chủ thật sau vài tuần chạy. Nhật ký
triển khai ghi lại bốn lỗi thật đã tìm ra đúng theo cách này.
