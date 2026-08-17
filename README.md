# Chính sách bán hàng (CSBH) — Nutricare

Phần mềm quản lý chính sách bán hàng cho Công ty TNHH Dược phẩm Nutricare: trình dược viên lập hồ sơ
CSBH cho từng khách hàng, hồ sơ đi qua **luồng duyệt 10 bước** (Trưởng bộ phận ký số → Kế toán tiếp
nhận L1 → Sale Admin bàn giao bản cứng → Kế toán tiếp nhận L2) rồi có hiệu lực vô thời hạn.

## Chạy thử

```bash
cd impl
make demo        # dựng toàn bộ, CSDL trống + tài khoản admin01
make demo-mau    # (tuỳ chọn) nạp dữ liệu mẫu: 6 vai trò, 28 khách, 137 hồ sơ
```

Giao diện http://localhost:8080 · mật khẩu mọi tài khoản mẫu là `Test@1234` · `make demo-mail` để mở
hộp thư thử. Chi tiết ở [impl/docs/02-CHAY-DEMO.md](impl/docs/02-CHAY-DEMO.md).

```bash
make test        # 1002 ca, chạy trên Postgres + RabbitMQ + MinIO thật
make typecheck
```

> `make test` và `make demo` dùng chung một Docker project — chạy `make demo-down` trước khi test.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `agents/` | Tài liệu nguồn: [yêu cầu nghiệp vụ](agents/YEU-CAU-NGHIEP-VU-CSBH.md) (bản có hiệu lực cao nhất), [kiến trúc](agents/KIEN-TRUC-CSBH.md), [nhật ký triển khai](agents/NHAT-KY-TRIEN-KHAI.md) |
| `impl/services/` | 10 service NestJS: identity · catalog · customer · policy · document · notification · audit · reporting · sla-worker · gateway |
| `impl/apps/web/` | Giao diện React + Vite, không dùng thư viện component |
| `impl/db/migrations/` | 34 migration SQL thuần — nguồn sự thật của lược đồ |
| `impl/docs/` | [Chạy test](impl/docs/01-CHAY-TEST.md) · [Chạy demo](impl/docs/02-CHAY-DEMO.md) · [Hướng dẫn sử dụng](impl/docs/03-HUONG-DAN-SU-DUNG.md) |

## Vài quyết định định hình lược đồ

Trái trực giác, dễ làm sai nếu không biết trước:

- **Mỗi khách hàng chỉ có đúng một CSBH còn hiệu lực**, và mọi CSBH đều **vô thời hạn** — không có
  ngày hết hạn, chỉ hết hiệu lực khi CSBH mới của cùng khách được duyệt.
- **Phiên bản mới phải chứa lại toàn bộ sản phẩm cũ.**
- **Giá và ngưỡng đóng băng vào dòng hồ sơ lúc gửi duyệt**, không bao giờ ghi đè. Danh mục đổi về
  sau thì báo qua khối *Yêu cầu cập nhật* và email, chứ không sửa hồ sơ đang chờ chữ ký.
- **Sáu vai trò**: Kế toán L1 và L2 là một người; TDV và QL là một vai trò. Không có cây tổ chức —
  mỗi bước người đang cầm hồ sơ tự chọn người xử lý bước sau.
- Không có nghiệp vụ **thu hồi**. Hồ sơ *Từ chối* và *Đã xoá* là trạng thái kết thúc, **không ai xoá
  được**, kể cả Quản trị hệ thống.

Toàn bộ tài liệu, mã nguồn, chú thích và thông báo trên màn hình đều bằng **tiếng Việt**.

## Giấy phép

**Độc quyền — mọi quyền được bảo lưu.** © 2026 hieuhv.

Phần mềm được phát triển riêng cho Công ty TNHH Dược phẩm Nutricare, cấp cho công ty quyền sử dụng
theo thoả thuận giữa hai bên. Không được sao chép, phân phối, công bố hay tạo sản phẩm phái sinh
ngoài phạm vi đó nếu không có văn bản cho phép của người giữ bản quyền.

Đây **không phải** phần mềm mã nguồn mở: repo không có file `LICENSE`, và hai `package.json` đều
đánh dấu `"private": true` để chặn việc lỡ tay phát hành lên npm.
