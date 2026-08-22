# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo này là gì

Phần mềm **Chính sách bán hàng (CSBH)** của Công Ty Cổ Phần Dinh Dưỡng Nutricare: trình dược viên lập hồ
sơ CSBH cho từng khách hàng, hồ sơ đi qua **luồng duyệt 10 bước** rồi có hiệu lực vô thời hạn.

Bản 1.0.0 đã viết xong (chặng P1–P8) và đang trong **vòng sửa theo phản hồi khách hàng** — mỗi lượt
là một chặng `P<số>` mang một **mã thay đổi** `00xx`. Toàn bộ mã nguồn, chú thích, tài liệu và câu
chữ trên màn hình đều bằng **tiếng Việt**.

Repo cũng giữ lại phần tài liệu tiền lập trình (`agents/`, `artifacts/`, `tai-lieu-goc/`) — giai
đoạn rà soát hợp nhất ba tài liệu `.docx` mâu thuẫn nhau của khách hàng.

| Thư mục | Nội dung |
|---|---|
| `impl/` | Kho mã sản phẩm: 10 service NestJS, web React + Vite (không dùng thư viện component), 46 migration SQL thuần, bộ test |
| `agents/` | Tài liệu nguồn: yêu cầu nghiệp vụ · kiến trúc · nhật ký triển khai |
| `impl/docs/` | Ba tài liệu bàn giao: chạy test · dựng demo · hướng dẫn sử dụng |
| `workspace/` | Log, dump, báo cáo, file tải về khi chạy thử — trong `.gitignore`, **không bao giờ commit** |
| `tai-lieu-goc/` · `artifacts/` | Ba `.docx` gốc của khách hàng và hai bản web đã publish |
| `ui-templates/` | Bộ mẫu Bootstrap admin của bên thứ ba, chỉ để tham khảo giao diện |

## Thứ tự hiệu lực của tài liệu

| File | Vai trò |
|---|---|
| `agents/YEU-CAU-NGHIEP-VU-CSBH.md` | **Bản hợp nhất v4.1, hiệu lực cao nhất.** Mâu thuẫn với bất kỳ nguồn nào thì bản này thắng. Phụ lục B là nhật ký 70+ quyết định của khách hàng, có ghi ngày chốt |
| `agents/KIEN-TRUC-CSBH.md` | Kiến trúc, mô hình dữ liệu, máy trạng thái, danh mục test case |
| `agents/NHAT-KY-TRIEN-KHAI.md` | Nhật ký triển khai theo chặng: **lệch so với thiết kế ở đâu và vì sao**, vướng gì, gỡ ra sao. Đọc chặng gần nhất trước khi động vào vùng liên quan |
| `impl/db/migrations/*.sql` | **Nguồn sự thật của lược đồ.** Tên file mang chính mã thay đổi (`0080_rpt_dong_san_pham.sql`) |
| `tai-lieu-goc/*.docx` | YCNV v3.0/v3.1 và Quy trình — nguồn lịch sử, chỉ để tra dẫn chứng |

## Lệnh

Mọi thứ chạy **trong Docker**. Không lệnh nào chạy Node native trên máy.

```bash
cd impl
make up          # hạ tầng: Postgres, Redis, RabbitMQ, MinIO, Mailpit, Gotenberg + migration
make install     # cài phụ thuộc vào volume
make test        # toàn bộ bộ test — tự chạy migrate + seed trước
make typecheck
make demo        # http://localhost:8080 — CSDL trống, chỉ có admin01
make demo-mau    # nạp thêm 10 tài khoản mẫu + dữ liệu nghiệp vụ; mật khẩu Test@1234
make demo-down
```

**Bọc mọi lệnh docker trong `sg docker -c '…'`.** Phiên shell không tương tác không kế thừa nhóm
`docker` dù `/etc/group` đã liệt kê đúng; `sg` xin lại quyền ngay trong tiến trình hiện tại.

**Chồng demo và bộ test dùng chung một Postgres/RabbitMQ/MinIO.** Chạy đồng thời thì hỏng theo kiểu
khó đoán nhất (test đỏ ở bốn tệp không tệp nào có lỗi thật) — `make test` có chốt chặn, báo dừng và
bảo chạy `make demo-down`. Chạy demo rồi chạy test cũng xoá sạch 10 tài khoản mẫu, nên `make test`
luôn kéo theo `migrate` + `seed`.

Test chạy **tuần tự** (`fileParallelism: false`) vì dùng chung một Postgres thật — chậm hơn, nhưng
mọi lần đỏ đều là lỗi thật.

## Một chặng làm việc

Người dùng đưa một phản hồi, thường bằng lời khách hàng. Mỗi chặng phải làm đủ:

1. Sửa mã **ở nguồn**, không vá cái bóng — nếu hai chỗ trả lời khác nhau về cùng một câu hỏi thì đặt
   luật ở nguồn thay vì cho chỗ thứ hai suy lại (xem `0085`).
2. Viết ca kiểm, rồi **phá lại**: hoàn tác đúng bản sửa và xác nhận ca kiểm đỏ **ở đúng tầng**. Ca
   nào vẫn xanh lúc phá thì ghi ra và nói vì sao — ca dựng trên stub chỉ đúng chừng nào có một ca
   đối chiếu giữ cho stub không trôi.
3. Nếu luật nghiệp vụ đổi: đồng bộ `agents/YEU-CAU-NGHIEP-VU-CSBH.md` (thân bài **và** Phụ lục B) và
   `impl/docs/03-HUONG-DAN-SU-DUNG.md`.
4. **Thêm một mã lỗi ở máy chủ thì khai câu cho nó ở `impl/apps/web/src/lib/loi.ts`** trong cùng
   lượt — câu tiếng Việt và dạng hiển thị (`0088`). `tests/web/loi.test.tsx` quét mã nguồn máy chủ
   nên bỏ sót là đỏ; mã nội bộ không dành cho người dùng thì khai `dang: 'im'`.
5. Thêm một mục `## P<số> — …` vào `agents/NHAT-KY-TRIEN-KHAI.md`, kết bằng dòng `**N/N xanh.**`.
   Ghi thứ mà sáu tháng sau đọc mã nguồn sẽ không tự suy ra được, không phải danh sách công việc.
6. Commit sau khi test xanh, thông điệp `P<số>: <mô tả không dấu>`. Nhánh `v1.0`, **không push**.

Nghi ngờ một lỗi thì **dựng lại trên chồng demo thật** và dán con số đo được vào nhật ký, đừng mô tả
suông — hai lỗi của `0085` đều tìm ra theo đường này.

## Trạng thái hiện tại (22/08/2026)

Chặng gần nhất **P115** (`0089`): rà 15 chỗ nuốt lỗi im lặng — ba trong số đó khiến màn hình nói
một câu sai sự thật. **1418/1418 xanh**, cây làm việc sạch.

Trước đó **P114** (`0088`): chuẩn hoá báo lỗi — một bảng tra câu chữ cho 96 mã lỗi, bốn dạng hiển
thị, và một phép quét bắt mọi mã máy chủ phải có câu.

## Quyết định nghiệp vụ định hình lược đồ dữ liệu

Trái trực giác, dễ làm sai nếu không nhớ:

- **Mỗi khách hàng chỉ có đúng một CSBH còn hiệu lực**, và mọi CSBH đều **vô thời hạn** — không có
  trường ngày hết hiệu lực. Chỉ hết hiệu lực khi CSBH mới của cùng khách hàng được duyệt.
- **Phiên bản mới phải chứa lại toàn bộ sản phẩm cũ.** Hiệu lực quản lý ở cấp hồ sơ, không phải cấp
  dòng khách hàng × sản phẩm.
- **Giá và ngưỡng đóng băng vào dòng hồ sơ lúc gửi duyệt**, không bao giờ ghi đè. Danh mục đổi về
  sau thì báo qua khối *Yêu cầu cập nhật* và email, chứ không sửa hồ sơ đang chờ chữ ký.
- **Sáu vai trò**: Kế toán L1 và L2 là một người (hai màn hình); TDV và QL là một vai trò.
- **Không có cây phân quyền** (bỏ hẳn `16/08`) — người dùng không quản lý lẫn nhau; mỗi bước, người
  đang cầm hồ sơ tự chọn người xử lý bước sau. Đổi *TDV phụ trách* là quyền của Quản trị hệ thống.
- **Đổi tay khách hàng thì mọi hồ sơ của khách ấy sang tay theo** (`0085`, trừ `DA_XOA`) — cả đường
  bàn giao lúc vô hiệu hoá tài khoản lẫn đường sửa một khách.
- **Hợp đồng do Kế toán hoặc Sale Admin xuất** (bước B7), không phải Trưởng bộ phận. TBP ký xong là
  không tham gia bước nào nữa.
- Không có nghiệp vụ thu hồi. *Từ chối* và *Đã xoá* là trạng thái kết thúc, **không ai xoá được**,
  kể cả Quản trị hệ thống.
- Tỷ lệ chiết khấu = `1 − Giá thu về / Giá bán Công ty`, phần trăm làm tròn hai chữ số; so ngưỡng
  **sau khi** làm tròn để con số hiển thị và con số dùng so sánh là một.
- SLA 14 ngày cho mọi trạng thái chờ, tính cả cuối tuần. *Quá hạn duyệt* là **trạng thái kết thúc**
  (`18/08`) — không ai thao tác được nữa, sau 3 ngày tự chuyển *Đã xoá*.
- **Câu báo lỗi khai ở một chỗ** (`0088`): `impl/apps/web/src/lib/loi.ts`. Lỗi của một THAO TÁC ra
  hộp thoại hoặc thanh nổi; lỗi của một Ô nằm dưới ô ấy; lỗi TẢI màn hình ở lại trên trang. Không
  câu nào được lộ tên trường trong mã, mã trạng thái, hay chữ tiếng Việt không dấu.
- **404 là câu trả lời, mọi lỗi khác thì không** (`0089`). Vài đường đọc coi 404 là dữ liệu ("khách
  chưa có CSBH nào"); `catch` bắt tất thì mất mạng cũng thành cùng câu ấy — dùng `la404()`. Thêm
  một chỗ nuốt lỗi thì phải khai ở `NUOT_CO_LY_DO` trong `tests/web/nuot-loi.test.tsx`.

## Bẫy kỹ thuật

**Tên file tiếng Việt không truyền được qua bash.** Ba `.docx` trong `tai-lieu-goc/` có dấu trong
tên; truyền tên đó làm tham số cho lệnh bash luôn báo `FileNotFoundError` dù `ls` vẫn thấy file
(khác biệt chuẩn hoá Unicode NFC/NFD). Cách vòng qua: để Python tự tìm bằng `glob`, đừng gõ tên file.

**`.gitignore` loại `*.docx`, trừ `impl/templates/*.docx`.** Ba mẫu hồ sơ ở đó là **đầu vào** của
`make demo-mau` và là thứ Quản trị tải về sửa — không commit thì bản demo không có mẫu nào để nạp.

**Bí mật và `workspace/` không bao giờ vào git.** `impl/deploy/secrets/` chỉ giữ `.gitkeep`.

## Publish lại artifact

Hai bản web đã publish — gọi `Artifact` kèm `url` cũ, thiếu `url` sẽ tạo link mới:

| File | URL |
|---|---|
| `artifacts/ra-soat-csbh.html` | `https://claude.ai/code/artifact/0daad399-bd08-4cc6-a281-27b751124ca0` |
| `artifacts/kien-truc-csbh.html` | `https://claude.ai/code/artifact/d9e72525-6df5-475d-8b76-52f8a3202aea` |
