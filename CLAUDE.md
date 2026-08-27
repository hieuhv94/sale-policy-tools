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
| `impl/` | Kho mã sản phẩm: 10 service NestJS, web React + Vite (không dùng thư viện component), 50 migration SQL thuần, bộ test |
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

make anh          # dựng ba ảnh bản giao
make day-anh      # đẩy lên registry (cần docker login)
make goi          # gói tệp nén -> workspace/dong-goi/
make dong-goi     # dựng ảnh + gói, một lượt
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

## Trạng thái hiện tại (27/08/2026)

Chặng gần nhất **P159** (`0131`): **hai khoảng hở ở *Lịch sử giá*** — tiêu đề dính bảng, nhãn *Đang
áp dụng* dính ngày. Hai bẫy đáng nhớ: **`h3 { margin: 0 }` là chủ ý** (mỗi chỗ dùng tự khai khoảng
hở nó cần, như `.tieu-de-nhom-xem-truoc`), nên chữa ở `h3` là dịch mọi tiêu đề cấp ba trong ứng dụng
mà không ca nào đỏ; và **`display: flex` KHÔNG được đặt thẳng lên `<td>`** — ô ấy thôi là ô bảng,
trình duyệt bọc nó trong một ô ẩn và bề rộng của nó thôi tham gia phép chia cột. Lớp nằm trên một
`<span>` bọc trong ô, ca kiểm canh cả chiều cấm. Ghi thêm hai điều: JSX **nuốt khoảng trắng** giữa
hai biểu thức xuống dòng nên ngày và nhãn dính liền — chữa bằng `gap`, không bằng dấu cách gõ tay;
và `LichSuGia` không nằm trong `exports` của `apps/web/package.json`, tức **màn hình danh mục sản
phẩm chưa có ca kiểm nào dựng DOM thật** — một chỗ trống, không phải một quyết định.
**1782/1782 xanh.**

Trước đó **P158** (`0130`): **kéo lại cỡ hộp thoại** sau khi khách hàng xem bản `0129` —
ba bậc hạ một phần ba (**700 · 1000 · 1200px**), hộp xem bản mềm hạ chiều cao (`--cao-khung`: trừ
15rem → **19rem**, trần → 1400px), và **hộp gửi duyệt về bậc thường**. Ba thứ đáng nhớ: bậc `rong`
phải hạ theo dù khách hàng không nêu tên nó, nếu không nó **rộng hơn cả bậc `to`** và cái thang gãy
lặng lẽ; *"giảm chiều cao một chút"* có ngưỡng đọc ra được — khoản trừ phải > **189px** (khung hộp
157 + lề lớp phủ 32) mới không cắt hộp, và > ~289px mới còn thấy trang phía sau; và **bề rộng hộp
không quyết định tờ CSBH to hay nhỏ** (`.khung-pdf` chặn bằng chiều cao), nên `0129` xếp hộp gửi
duyệt vào bậc `to` là một suy luận nghe hợp lý mà sai. Bài học về ca kiểm: `0129` viết
`expect(thuong).toBe(520 * 2)` — canh CON SỐ nên lượt này nó đỏ ở chỗ chẳng có gì sai trong khi cái
thang gãy thì lọt; canh **quan hệ** (`thuong < rong < to`, sàn < thuong) mới bắt được.
**1780/1780 xanh.**

Trước đó **P157** (`0129`): **nới bề rộng hộp thoại**, ba bậc chọn theo VIỆC (`co` của
`HopThoai`, con số ở `tokens.css`). Chỗ dễ sửa nhầm: hộp **xem bản mềm/hợp đồng KHÔNG nhận bề
rộng** — từ `0073` nó tính rộng TỪ `--cao-khung × tỷ lệ tờ giấy`, nên "gần full màn hình" nằm ở
**trần `--cao-khung`**, không ở một dòng `width`. Kèm hai thứ lộ ra vì hộp rộng thêm: `.khung-pdf`
là `width: 100%` nên tờ A4 dọc có hàng trăm pixel xám mỗi bên — giờ chặn rộng bằng `cao × --ty-le`
như `.khung-xem`, `--ty-le` lấy từ khổ giấy của mẫu đang chọn; và **sàn hộp xem cắt khỏi bề rộng hộp
thường** (`--san-hop-thoai` riêng) vì hai con số trả lời hai câu hỏi khác nhau.

Trước đó **P156** (`0128`): **số điện thoại khách hàng**, kèm một khoá mới trong bảng ánh xạ
văn bản mẫu. Chạm bốn tầng, và hai chặng cũ đã dựng sẵn câu hỏi cho nó: `0101` (cột rời chứ không
jsonb → **buộc** trả lời *"đóng băng hay đọc sống"* → **đóng băng**, thêm `kh_dien_thoai_snap`) và
`0104` (`NHOM_TRUONG` → nhóm **`chan-moi`**, tức **khách cũ chưa khai số thì hồ sơ mới không gửi
duyệt được**). Bẫy mất 14 ca kiểm: **`internal.controller` của `customer` liệt kê từng cột** trong
`SELECT` và không biết `phone` — `policy` với `document` đều đọc qua đó, nhận `undefined`, TypeScript
im vì trường khai `?`, và triệu chứng lộ ra ở chỗ khác hẳn (hồ sơ không rời được *Nháp*). **Thêm một
trường vào khách hàng thì phải rà cả `internal.controller`, không chỉ `customers.service`.**
Lượt chạy này còn bắt được một lỗi **không liên quan**: `current_date` của Postgres theo giờ Việt
Nam, còn `new Date().toISOString()` theo UTC — **từ 00:00 tới 07:00 giờ VN hai bên lệch một ngày**,
nên lỗi từ `0123` ngủ yên tới giờ. Ba chỗ hỏng; nặng nhất là `products.service` **dựng lại ngày ở
tầng Node** cho sự kiện `catalog.price_changed` trong khi dòng giá ghi bằng `current_date` — chữa
bằng `RETURNING` ngày vừa ghi. Bài học: **đừng dựng lại ở tầng Node một giá trị mà CSDL vừa sinh
ra.** P155 (`0127`) chỉ gỡ một đoạn chú thích ở hộp thoại thêm dòng sản phẩm. **1771/1771 xanh.**

Trước đó **P154** (`0126`): **lịch sử giá giữ đủ mọi lần sửa**, kể cả nhiều lần trong một
ngày — gỡ `UNIQUE (product_id, price_type, effective_from)`, bỏ hai chỗ `ON CONFLICT DO UPDATE`, và
thêm cột **`stt bigserial`** làm khoá phân xử (`id` là uuid ngẫu nhiên; `created_at` là `now()`, tức
giờ MỞ transaction). Bốn chỗ tự viết `ORDER BY effective_from DESC LIMIT 1` gom thành hằng
`THU_TU_GIA_MOI_NHAT`. Lịch sử đổi sang **mới nhất trước** (thứ tự cũ sắp theo `price_type` trước —
lộ ra ở sản phẩm còn dòng `GIA_BAN_BUON`), kèm cột *Ghi lúc*; khung tự cuộn dọc. Bẫy đã ghi: ca kiểm
tie-break **không bắt được việc bỏ `stt` khỏi `ORDER BY`** vì chỉ mục `ix_price_lookup` đã mang sẵn
thứ tự ấy — ca bắt được là ca đọc CẢ danh sách, không có `LIMIT 1`. **1769/1769 xanh.**

Trước đó **P153** (`0125`): khách hàng báo *"mở Sửa là lịch sử tự hiện giá hiện tại dù chưa
Lưu"*. **Đo trên Postgres thật: KHÔNG có lượt ghi nào** — dòng ấy do lượt TẠO sinh ra (`0123`) và nó
đúng. Nhưng đo xong lộ hai chỗ sai thật: **`seed-demo` để lại một dòng giá thừa ngày hôm nay** (hồi
quy của `0123` — nó tạo kèm `price` rồi đặt thêm mốc 2024, thành hai dòng cùng số tiền), và **bảng
lịch sử không nói dòng nào đang có hiệu lực**. Thêm `donGiaTao()` xoá **có điều kiện** (`EXISTS` một
mốc khác — xoá trần theo ngày sẽ cuốn cả `nap-danh-muc`), và nhãn *Đang áp dụng* / *Chưa hiệu lực*.
Bẫy đã ghi: ba ca mới **đếm số dòng** nên `ON CONFLICT DO UPDATE` qua mặt được — ca bắt được là ca
đếm SỰ KIỆN của `0123`. **1766/1766 xanh.**

Trước đó **P152** (`0124`): **giá bán Công ty hiện ngay TRÊN ô giá bán buôn** trong hộp thoại
thêm dòng, và **Sửa · Xoá cùng một hàng**. Việc đầu không cần một dòng mã máy chủ nào — `0123` đã đưa
`price` vào chính API mà ô chọn đang gọi. **Vị trí là một phần của yêu cầu**: đọc con số ấy sau khi
đã gõ xong giá bán buôn thì quá muộn, nên ca kiểm đo bằng `compareDocumentPosition`. Nút xếp chồng là
do `.nhom-nut-gon` có `flex-wrap: wrap` — **không nới lớp ấy** (danh sách thẻ trên điện thoại cần
wrap), thêm `.nhom-nut-hang` riêng cho ô bảng. Bẫy: một ca quét mã nguồn **xanh nhờ chính dòng chú
thích của nó** — phải khớp thuộc tính `className="…"`, không khớp chuỗi trần. **1759/1759 xanh.**

Trước đó **P151** (`0123`): **giá là một phần của sản phẩm, không phải một bước sau**. Tạo sản
phẩm BẮT BUỘC có giá (cùng transaction), cột giá trong Excel hết được để trống, nút *Giá* bỏ hẳn —
sửa giá ngay ở hộp thoại *Sửa*, và **mọi lượt sửa đòi gõ lại mã** (tiền đề của `0036` mất: màn hình
này giờ đổi được giá). **Ngày áp dụng luôn là hôm nay**, ô chọn ngày bỏ khỏi giao diện — `effectiveFrom`
ở lại API cho `seed-demo`. Bảng sản phẩm của **cả sáu vai trò** có cột giá, và nhãn trạng thái có màu
(dùng lại hai khoá của nhãn hồ sơ). Rà soát tìm ra: consumer xử lý `price_changed` đúng, nhưng **giá
đặt cho ngày TƯƠNG LAI thì lượt rà chạy lúc nó chưa hiệu lực và không có gì chạy lại** — bỏ ô chọn
ngày là bịt lỗ ấy khỏi tay người dùng, không phải sửa nó. Bẫy đã dính: dòng giá của lượt tạo mang
ngày hôm nay nên **thắng mọi mốc quá khứ** — 12 ca kiểm đỏ, chữa ở fixture. **1753/1753 xanh.**

Trước đó **P150** (`0122`): **ngừng bán hàng loạt qua file Excel**. Cột 5 thôi chỉ-để-xem, nó
là **ô chọn** `Đang bán`/`Ngừng bán` (`dataValidation` kiểu `list` — dạng checkbox DUY NHẤT dựng
được và đọc lại được; Form/ActiveX là đối tượng nổi không thuộc ô nào). **Hai đường ngừng bán**: đổi
ô, hoặc **bỏ dòng khỏi file** — đảo lại quyết định chặn của `0121`. Bảng xem trước **tách hai khối
theo `lyDo`** (`O_CHON` / `VANG_MAT`) và liệt kê đủ, vì sự vắng mặt không mang ý định. **Ô trống là
LỖI** chứ không phải ngừng bán: dòng sản phẩm mới gõ thêm luôn trống ô ấy. Cái mất, đã ghi: chốt gõ
lại mã vật tư không còn phủ đường này. Đo được: **`allowBlank: false` đọc lại ra `undefined`** vì nó
là mặc định của OOXML. **1744/1744 xanh.**

Trước đó **P149** (`0121`): **nhập danh mục từ Excel là GHI ĐÈ, và phải xem trước**. File 5 cột
(mã · tên · mã nhóm · giá · *đang có hiệu lực*), phải chứa **đủ mọi mã đang có**, kiểm bảy bước rồi
hiện **bảng thay đổi**, gõ lại `GHI DE` mới ghi. Bốn thứ KHÔNG làm được qua đường nhập: xoá sản
phẩm (kể cả bằng cách bỏ dòng), ngừng bán (cột 5 chỉ để xem), xoá giá (ô trống = giữ nguyên), đổi
ngày áp dụng (luôn là hôm nay). `excel.ts` chỉ đọc · `nhap.ts` là **hàm thuần** chạy HAI lần — một
lần xem trước, một lần **trong transaction ghi**. **Trùng tên chỉ chặn phần MỚI phát sinh**: danh
mục không cấm trùng tên (đo được 19 sản phẩm cùng tên), mà file phải đủ — chặn cứng thì danh mục ấy
không bao giờ nhập lại được. Giá dùng `ON CONFLICT DO UPDATE`, **giữ** unique index; màn hình *Đặt
giá* bỏ `PRICE_ALREADY_SET_FOR_DATE` theo. **Chỉ phát sự kiện cho dòng thật sự đổi** (nợ N-09).
**1736/1736 xanh.**

Trước đó **P148** (`0120`): file Excel mẫu mang **toàn bộ danh mục hiện tại** (kể cả hàng đã
vô hiệu hoá), và *Tải file mẫu* thành một **nút** thật — lớp `.lien-trong-dong` của `0119` gỡ hẳn vì
hết chỗ dùng. Hệ quả phải nhớ: **file này KHÔNG tải lên lại nguyên trạng được** — trùng mã chặn cả
lô nên nó hỏng ở dòng 2; cách dùng là xoá dòng cũ rồi điền dòng mới, và **có một ca kiểm canh chính
hệ quả ấy** để câu hướng dẫn ở hộp thoại không nói sai. Dòng dữ liệu ghi theo `HEADERS` chứ không
viết thẳng ba tên trường: lệch cột thì file vẫn nhập được và nạp tên sản phẩm vào ô mã nhóm.
**1722/1722 xanh.**

Trước đó **P147** (`0119`): **file Excel mẫu** tải từ hộp thoại *Nhập từ Excel*. `dungFileMau`
nằm cạnh `parseProductSheet` trong `products/excel.ts` và dựng tiêu đề **TỪ chính mảng `HEADERS`** mà
bộ đọc đối chiếu — hai bên trôi khỏi nhau là dựng ra đúng thứ hỏng mà file mẫu sinh ra để chống.
**Không có dòng ví dụ** (một dòng sót lại thành sản phẩm ma); chú thích cột nằm ở ghi chú ô tiêu đề
vì một hàng chú thích thật sẽ bị đọc thành sản phẩm. **Trang thứ hai liệt kê mã nhóm đang có** —
`parseProductSheet` chỉ lấy `worksheets[0]` nên nó không vào dữ liệu. Ca kiểm chính là **vòng tròn**:
tải mẫu → điền vào chính nó → nhập lại phải xong. **1720/1720 xanh.**

Trước đó **P146** (`0118`): **số phiên bản hiện ở chân thanh bên**, và **thẻ ảnh bỏ git sha**.
Chân thanh bên ghi cứng `Phiên bản demo` — hiện y hệt trên production thật — trong khi **VER-05 đã
có trong danh mục ca kiểm** và P7d đã dựng sẵn `apps/web/src/lib/phien-ban.ts` (`PHIEN_BAN`, Vite
nhúng từ tệp `VERSION`). Hằng ấy **chưa từng có ai import**. Dùng số NHÚNG LÚC BUILD chứ không phải
header `x-app-version`: ô này trả lời *"trình duyệt đang chạy bản nào"*, và hai số lệch nhau đúng lúc
tab mở từ sáng gặp máy chủ nâng cấp lúc trưa (so hai số để mời tải lại là VER-07, chưa làm). Thẻ ảnh
`1.0.0-a1b2c3d` → **`1.0.0`**; cái giá nằm NGOÀI mã: **mỗi lần giao phải là một số mới trong
`VERSION`**, dựng lại cùng số thì thẻ trên registry bị ghi đè và máy chủ không phát hiện được.
**1715/1715 xanh.**

Trước đó **P145** (`0117`): **email ngoài `MAIL_ALLOWLIST` thì không tạo được tài khoản**.
Tìm ra khi gỡ lỗi chồng production thật — ba tài khoản mở bằng `@nutricare.com.vn` trong khi danh
sách khai `nutricare.vn` (**`com.vn` KHÔNG phải miền con của `vn`**). Tài khoản vẫn được tạo, chỉ lá
thư mời hỏng ở chỗ cố tình nuốt lỗi, để lại **một tài khoản có thật, chiếm mất tên đăng nhập và địa
chỉ, không bao giờ đăng nhập được**. Chốt nằm ở `UsersService.create` — email đặt được đúng một lần
nên đó là chỗ duy nhất phải canh. Kéo theo hai việc: `identity/mailer.ts` vẫn so bằng
`endsWith` — **đúng phép so mà `0105` đã bỏ ở `notification`**, lệch suốt mười một chặng, giờ cả hai
gọi chung `thuocMienThu`; và `bootstrap-admin` cũng từ chối, kèm **một dòng `MAIL_ALLOWLIST` trong
khối `ops` của `compose.prod.yml`** vì khối ấy không kế thừa `&node-env`. **1710/1710 xanh.**

## Trạng thái trước đó (24/08/2026)

Chặng gần nhất **P133–P134** (`0106`, `0107`). `0106` sửa **ba lỗi của lượt cài thật đầu tiên**:
mật khẩu Postgres/MinIO nằm ở hai chỗ (giờ đọc thẳng từ `secrets/*.txt` bằng biến `*_FILE`); chồng
production dùng chung volume với demo (`COMPOSE_PROJECT_NAME=csbh-prod`) — **Postgres đặt mật khẩu
CHỈ ở lần khởi tạo đầu tiên**; và ba ảnh phải chung MỘT repo phân biệt bằng thẻ vì registry chỉ có
hai cấp. `0107` thêm **đường hầm Cloudflare** để chạy thử qua Internet, ở một tệp compose riêng —
kèm việc bịt một lỗ hổng của chính SEC-10: nó quét `ports:`, mà `cloudflared` không mở cổng nào.
`0108` sửa **bẫy gộp map lần thứ ba**: khai `*_FILE` mà không đặt biến trực tiếp về rỗng thì Postgres
DỪNG, còn MinIO **âm thầm dùng mật khẩu mặc định** trong khi mười service đọc từ file. Đã chạy thử
đầu-cuối qua đường hầm Cloudflare với Gmail SMTP thật. `0109` thêm `nap-danh-muc` — bộ nạp danh mục
cho bản chạy thử (3 nhóm · 9 sản phẩm · 3 quy định chiết khấu · 3 văn bản mẫu), và là script nạp dữ
liệu **duy nhất không có chốt `NODE_ENV`**: nó không đụng tới tài khoản, và có năm ca kiểm quét
chính mã nguồn của nó để ranh giới ấy không trôi. `0110`: lệnh mồi bắt mã `42P01` và nói ra việc
phải làm thay vì ném vết ngăn xếp `pg`; `0111`: `pg_isready` KHÔNG kiểm được mật khẩu, nên migrate
thêm một lượt `SELECT 1` và nói ra nguyên nhân; `0112`: lời nhắc của `cai-dat.sh` in ra stdout nên
nó LỌT VÀO chính câu trả lời — `$( )` bắt toàn bộ stdout; `0113`: `cai-dat.sh` chặn tổ hợp "bí mật
mới + volume cũ", tức chặn ở chỗ hỏng SINH RA thay vì ba chỗ nó lộ ra; `0114`: lệnh mồi KHÔNG gửi
thư (ngoại lệ duy nhất của luật "thư mời là đường duy nhất") và giờ nói ra điều đó.
**1698/1698 xanh**, cây làm việc sạch.

Trước đó **P132** (`0105`): **đóng gói bản giao**. Ba ảnh —
`csbh-service` · `csbh-web` · `csbh-ops` — đẩy lên registry riêng, cộng **một tệp nén** chép lên
máy chủ khách (compose + `.env.mau` + `cai-dat.sh` + `csbh` + cron + bốn tài liệu; **không chứa
ảnh**). Bốn việc chặn cứng đã xong: lệnh mồi tài khoản quản trị chạy được ở `production`, SMTP có
xác thực và TLS, `compose.prod.yml` không có `build:` nào, cron sao lưu. Tên miền nhận thư khai lúc
chạy, **nhiều miền**, và **bắt buộc ở production**. Đã dựng thử toàn chồng production đầu-cuối.
**1679/1679 xanh**, cây làm việc sạch.

Trước đó **P131** (`0104`): **đủ trường mới gửi duyệt được**. Đọc yêu cầu theo nghĩa đen thì
nó chặn MỌI lượt gửi — bảy trong hai mươi ba trường của bảng ánh xạ do chính các bước B3…B10 sinh
ra. Nên sản phẩm chính là **bảng phân loại `NHOM_TRUONG`** (`document/contracts/sources.ts`), và
`policy` chỉ chặn 3 trường: MST · chức danh người đại diện · thời gian áp dụng. Bảy trường *điền
sau* **ở lại** danh mục — chúng là khối phê duyệt của tờ CSBH. Kèm: ngày áp dụng mặc định hôm nay
**ở máy chủ**, và màn hình soạn mẫu thôi im lặng về mục bắt buộc. **1661/1661 xanh**, cây làm việc
sạch.

Trước đó **P130** (`0103`): **gỡ bản lưu ký số**. `POST /policies/:id/sign-file` sinh hai
object PDF nối qua `signed_from_id`, có DOC-04/DOC-05 canh, và **chưa ai gọi bao giờ** — 197 hồ sơ
đã ký, 3 file `BAN_DA_KY`, cả ba của bộ test. Khách hàng chốt 24/08: **dữ liệu đóng băng `0101` là
đủ**. Bỏ BẢN LƯU, **không** bỏ KÝ. Kéo theo `render/sheet.ts` biến mất (đường dựng văn bản thứ hai),
còn lại dời sang `contracts/dinh-dang.ts`.

Trước đó **P129** (`0102`): **mẫu bản mềm thôi bị ép có *trạng thái* và *thời gian duyệt***.
Hai mục ấy còn ĐANG ĐỔI lúc dựng văn bản, nên ép có mặt là ép in một câu sai ở mọi hồ sơ chưa tới
B10. Gốc rễ: mười ba mục của muc 11.1 là yêu cầu của **bảng XEM** — màn hình chi tiết hồ sơ —
`0067` đem áp sang **mẫu do Quản trị vẽ**. Bỏ ÉP chứ không bỏ TRƯỜNG — hai khoá vẫn
trong `SCALAR`. Phép kiểm lúc lưu mẫu còn **9/13**. Kèm **DOC-36**, ca kiểm chưa từng có.
**1647/1647 xanh**, cây làm việc sạch.

Trước đó **P128** (`0101`): **thông tin khách hàng và hai cái tên đóng băng vào hồ sơ** lúc
gửi duyệt — tám trường khách hàng (kể cả công nợ) cộng *người đề nghị*; *TBP đã ký* chụp lúc ký.
Ảnh chụp làm mới ở mỗi lượt gửi, nên hồ sơ bị trả lại vẫn sửa được. Trên đường lộ ra một lỗ hổng
`P0`: **hồ sơ bị trả về SAU khi TBP ký thì không ký lại được** (`ALREADY_SIGNED`) và chết ở *Chờ TBP
duyệt* — `tbp_signed_at` chưa bao giờ được xoá.

Trước đó **P127** (`0100`): tách `POLICY_TEMPLATE_PENDING` khỏi `POLICY_TEMPLATE_NOT_SET` —
`0098` gộp hai chuyện vào một câu, nên Ban lãnh đạo mở hồ sơ *Nháp* của người khác bị báo rằng hồ sơ
lập trước `0098` và nên lập lại cái mới. Phân biệt bằng **trạng thái**: còn `SUA_DUOC` mà cột mẫu
rỗng là bình thường; ngoài `SUA_DUOC` mới là dữ liệu cũ. **1634/1634 xanh**, cây làm việc sạch.

Trước đó **P126** (`0099`), lượt rà toàn hệ thống: bịt một **lỗ phân quyền** đã mở từ P26 —
`DELETE /policies/:id/lines/:lineId` mất `@Roles('TDV')`, nên Ban lãnh đạo xoá được dòng sản phẩm
khỏi hồ sơ *Nháp* của người khác, còn Kế toán và Trưởng bộ phận xoá được khỏi hồ sơ họ vừa trả về.
Kèm theo: viết **SEC-13**, ca kiểm `P0` trong danh mục kiến trúc chưa từng được viết — quét mọi
đường ghi của mười service và gọi thật bằng `bld01`. **1632/1632 xanh**, cây làm việc sạch.

Trước đó **P125** (`0098`): **mẫu bản mềm đóng băng vào hồ sơ** lúc TDV gửi duyệt — chỉ TDV chọn,
các vai trò sau chỉ xem; và **mẫu thôi xoá được, chỉ vô hiệu hoá**.

## Nợ đã HOÃN có chủ ý

Chốt 24/08 — **không đụng tới trước khi bản dùng thử tới tay khách hàng**:

| Món | Vì sao hoãn được |
|---|---|
| **N-09** rà danh mục O(n) — đổi một quy định chiết khấu quét mọi hồ sơ đã đóng băng × mọi dòng, kèm gọi REST sang `customer` và `catalog` | có chia lô `SONG_SONG`; ở quy mô hiện tại chưa cắn |
| **N-10** không có unique index `(customer_id, version_no)` — số lấy bằng `active.version_no + 1` | chỉ va khi hai lượt lập song song cho CÙNG khách, mà một khách chỉ có một TDV |

Cả hai **có thật và đã đo**, không phải nghi ngờ. Đừng gỡ chúng khỏi danh sách nợ, và đừng lặng lẽ
sửa nửa vời — N-10 sửa đúng là một migration thêm unique index cộng đường xử lý va chạm.

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
- **Thông báo trên web = người nhận thư, không hơn không kém** (`0096`). Dòng thông báo ghi ngay
  trong `notify.service.handle()`, dùng chính mảng `targets` mà `mailer.send` sắp lấy địa chỉ ra —
  không có bảng tra hành động nào, nên không lá thư nào lỡ thiếu thông báo. Liên kết dựng bằng
  `templates.duongDan()`, một hàm cho cả thư lẫn chuông. Hai lá thư của `identity` (kích hoạt, đặt
  lại mật khẩu) **không** sinh thông báo: chúng mang token thô, mà `ONB-15` cấm token thô nằm trong
  CSDL. Ghi thông báo **trước** khi gửi thư — SMTP chết là lúc cái chuông thành đường duy nhất.
- **Khách hàng và hai cái tên đóng băng lúc gửi duyệt** (`0101`) — tám cột `kh_*_snap` cộng
  `nguoi_de_nghi_snap` trên `pol.policy`; `tbp_ky_ten_snap` chụp lúc KÝ. Cột rời chứ không jsonb, để
  thêm một trường về sau **buộc** phải viết migration, tức buộc phải trả lời "đóng băng hay đọc
  sống?". Vế đọc ở `khachHangCua`/`nguoiCua` (`render.service.ts`), quyết định theo **ảnh chụp có
  mặt hay không**, không theo trạng thái. *Kế toán* và *Sale Admin* KHÔNG đóng băng — câu chúng trả
  lời là "ai đang giữ hồ sơ". **Quay về `YEU_CAU_CHINH_SUA` thì xoá cả ba cột chữ ký** — sửa luôn
  một lỗ hổng `P0` mở từ P5: `tbp_signed_at` không bao giờ được xoá nên hồ sơ bị trả về sau khi ký
  thì `ALREADY_SIGNED` chặn lượt ký lại, và hồ sơ chết ở *Chờ TBP duyệt*.
- **Mẫu bản mềm CSBH đóng băng vào hồ sơ lúc gửi duyệt** (`0098`) — cột `pol.policy.mau_ho_so_id`,
  tham chiếu logic sang `doc`, không FK. Chỉ TDV chọn, đúng hai hành động `SUBMIT` và
  `RESUBMIT_AFTER_EDIT` ghi cột ấy; mọi vai trò sau chỉ xem. Kéo theo hai luật khoá lẫn nhau: **mẫu
  không xoá được nữa, chỉ vô hiệu hoá** — và vô hiệu hoá **không đụng tới hồ sơ đã gắn**, nên
  `templates.khaDung()` (ô chọn, có lọc) và `templates.theoId()` (dựng văn bản, không lọc) phải
  tách rời. **Hợp đồng KHÔNG đóng băng** — không lưu bản ghi nào thì không có gì để gắn vào — nhưng
  người xuất vẫn **bắt buộc chọn**: không còn mẫu mặc định ngầm ở bất kỳ đâu.
- **Bảng CSBH XEM và MẪU bản mềm là hai thứ khác nhau** (`0102`). Mười ba mục tối thiểu của muc 11.1
  là yêu cầu của **màn hình chi tiết hồ sơ** (`ChiTietHoSo.tsx`) — DOC-03 đọc chúng ra từ PDF dựng
  bằng `mau-ho-so-a4-doc.docx`, không từ một đường dựng nào của hệ thống (`0103` sửa lại câu này:
  bản `0102` chỉ sai chỗ `render/sheet.ts`, thứ chỉ phục vụ bản lưu ký số). Mẫu do Quản trị vẽ chỉ
  bị ép **9/13**: *thông tin công ty* cố định, *CPBH* do người soạn quyết, còn *trạng thái* và
  *thời gian duyệt* thì **còn đang đổi** lúc dựng văn bản. Bỏ ÉP không phải bỏ TRƯỜNG — hai khoá vẫn
  trong `SCALAR`, và gỡ nhầm chúng ở đó thì ba mẫu bàn giao trả `400 SOURCE_UNKNOWN` lúc lưu.
- **"Chưa biết lúc gửi" và "không được phép in" là HAI câu hỏi** (`0104`). `NHOM_TRUONG` chỉ trả lời
  câu thứ nhất: bảy trường `dien-sau` rỗng lúc gửi duyệt là đúng, nhưng chúng **vẫn ở lại** danh mục
  ánh xạ vì chúng là khối phê duyệt của tờ CSBH. Gỡ khỏi `SCALAR` thì ba mẫu bàn giao trả
  `400 SOURCE_UNKNOWN`, `ho_so.ke_toan` biến khỏi 13 mục của muc 11.1, và bản đã duyệt không còn chỗ
  nào nói ai duyệt. Chốt chặn ở `policy`, bảng phân loại ở `document`, một ca đối chiếu hai chiều.
- **Chốt chặn gửi duyệt KHÔNG hỏi `document`** (`0104`). Luật là *"đủ trường"*, không phải *"đủ
  trường mà mẫu vừa chọn có in"* — nên nó không phụ thuộc mẫu. Giữ nguyên quyết định `0098`: buộc
  service nặng nhất vào đường gửi duyệt là nó chết thì không ai gửi được hồ sơ nào, và còn dựng ra
  vòng đồng bộ `policy → document → policy` giữa transaction.
- **Mười service chạy từ MỘT ảnh** (`0105`). `ARG SERVICE`/`ENV SERVICE` là hai lớp cuối của
  `Dockerfile`, còn `CMD` đọc `${SERVICE}` bằng shell lúc chạy — nên compose chọn service bằng biến
  môi trường. Đo được: `csbh-audit` và `csbh-policy` trùng hoàn toàn từng lớp. `csbh-ops` dựng TỪ
  `csbh-service` (chỉ +10MB); dựng lại từ `node:alpine` là tạo bản sao thứ hai của cùng những tệp,
  và hai bản sẽ lệch nhau.
- **Compose GỘP `volumes` và `environment`, không thay thế** (`0105`, `0106`, `0108` — ba lần dính).
  Không có cách nào GỠ một mục bằng lớp phủ: bind mount thì phải tắt service bằng `profiles` rồi đặt
  service tên khác; biến môi trường thì phải **đặt rỗng** (`POSTGRES_PASSWORD: ""`), và cả Postgres
  lẫn MinIO đều coi chuỗi rỗng là chưa đặt. Postgres dừng hẳn khi lệch; **MinIO thì không** — nó
  lặng lẽ dùng mật khẩu mặc định và chỉ lộ ra ở một lỗi chữ ký S3.
- **Một thay đổi ở tệp compose KHÔNG được bộ test kiểm.** `0106` sửa cấu hình rồi chạy 1682 ca xanh;
  lỗi chỉ lộ ở lượt `docker compose up` thật đầu tiên, hai chặng sau đó. Đụng `deploy/*.yml` thì phải
  dựng thật.
- **Đường dẫn tương đối trong compose tính theo thư mục của TỆP COMPOSE**, không theo nơi gõ lệnh
  (`0105`). Hai tệp compose ở `deploy/`, bộ cài ở thư mục cha — nên `../secrets`, không phải
  `./secrets`. Và compose **gộp** danh sách `volumes` chứ không thay thế: ghi đè một service để bỏ
  bind mount là không làm được, phải tắt nó bằng `profiles` rồi đặt service tên khác.
- **Câu báo lỗi khai ở một chỗ** (`0088`): `impl/apps/web/src/lib/loi.ts`. Lỗi của một THAO TÁC ra
  hộp thoại hoặc thanh nổi; lỗi của một Ô nằm dưới ô ấy; lỗi TẢI màn hình ở lại trên trang. Không
  câu nào được lộ tên trường trong mã, mã trạng thái, hay chữ tiếng Việt không dấu.
- **`make demo-mau` dựng ba năm lịch sử** (`0095`) — chuỗi phiên bản THẬT qua API rồi vặn đồng hồ về
  quá khứ. Hệ quả phải nhớ khi sửa bộ nạp: giá và quy định chiết khấu hiệu lực từ `2024-01-01`; hồ
  sơ lập cho khách đã có CSBH hiệu lực phải khai *bổ sung* hay *chỉnh sửa*; `cpbh_total`,
  `net_price`, `over_threshold` là **cột sinh**, chỉ ghi được `cpbh` và `discount_rate`.
- **Thống kê là BIỂU ĐỒ, không phải bảng số** (`0094`). Sáu dạng hình, mỗi dạng một câu hỏi; không
  có biểu đồ tròn. Phép toán vẽ tách ở `apps/web/src/components/bieu-do/ve.ts` — đó là chỗ duy nhất
  sai được im lặng. Ban lãnh đạo và Trưởng bộ phận soi được **từng TDV**; phạm vi "TDV của tôi" đọc
  từ chính phạm vi dữ liệu (*phương án A*, chốt 23/08) vì hệ thống không có cây tổ chức. Danh sách
  người lấy theo **cả cửa sổ** để người ngừng gửi hẳn vẫn hiện với số 0.
- **Hai màn hình số liệu, hai loại con số** (`0093`). *Tổng quan* nói **tồn tại thời điểm** (đang
  chờ, quá hạn, đang hiệu lực) — không cộng theo kỳ được. *Thống kê* nói **dòng chảy trong kỳ**, gom
  theo tuần/tháng/quý/năm. Mỗi chỉ số neo vào đúng một cột mốc (bảng `NEO`), kỳ cắt theo giờ Việt
  Nam, và kỳ đang chạy chỉ so với **cùng số ngày** của kỳ trước. Phép cắt kỳ dùng chung
  `packages/http-kit/src/ky.ts` cho cả `reporting` lẫn `audit`.
- **404 là câu trả lời, mọi lỗi khác thì không** (`0089`). Vài đường đọc coi 404 là dữ liệu ("khách
  chưa có CSBH nào"); `catch` bắt tất thì mất mạng cũng thành cùng câu ấy — dùng `la404()`. Thêm
  một chỗ nuốt lỗi thì phải khai ở `NUOT_CO_LY_DO` trong `tests/web/nuot-loi.test.tsx`.

## Bẫy kỹ thuật

**`tsc` không bắt được một import bị gỡ, nếu tên ấy trùng một kiểu toàn cục.** `0103` gỡ
`import { Storage }` khỏi `render.service.ts` nhưng để nguyên `private readonly storage: Storage`
trong constructor. Typecheck **xanh** — `Storage` là interface của `lib.dom` — và chỉ DI của Nest bắt
được lúc chạy. `Response`, `Request`, `Event`, `File` là bẫy cùng loại.

**Chèn một phương thức vào giữa khối decorator là cướp decorator của phương thức bên dưới.** P26
thêm `suaDong` ngay dưới `@Roles('TDV')` của `removeLine`; decorator sang tay phương thức mới, ghi
đè lặng lẽ cái `@Roles` mà phương thức mới vừa khai, và đường xoá dòng còn lại không chốt chặn nào —
mở suốt tới `0099`. **SEC-13** ở `tests/http/security.test.ts` canh cả lớp lỗi này: `@Roles` khai
hai lần trong một khối là đỏ, đường ghi không khai vai trò là đỏ, và `bld01` nhận gì khác 403 cũng
đỏ. Thêm một đường ghi công khai có lý do thì khai vào `KHONG_PHAI_GHI_NGHIEP_VU` kèm lý do.

**Ca kiểm bất đồng bộ xanh ở lượt đầu chưa nói lên gì.** Bộ test chạy tuần tự trong một tiến trình
và dùng chung Postgres/RabbitMQ, nên một tệp có thể xanh nhờ hạ tầng tệp khác để lại. `OUTBOX_AUTO_PUMP=0`
trong `deploy/compose.test.yml` — **không relay nào tự chạy trong bộ test**, phải `pumpOnce()` tay —
và tệp nào đợi một dòng nhật ký thì phải tự dựng `createAuditApp()`. Ca nhật ký của `0098` thiếu cả
hai và vẫn xanh một lượt (`0099` bắt được nó đỏ).

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
