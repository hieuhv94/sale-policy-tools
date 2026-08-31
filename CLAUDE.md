# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo này là gì

Phần mềm **Chính sách bán hàng (CSBH)** của Công ty TNHH Dược phẩm Nutricare: trình dược viên lập hồ
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

## Trạng thái hiện tại (30/08/2026)

Chặng gần nhất **P198** (`0170`): ***Bản mềm* và *Bản cứng* xuống cuối trang hồ sơ**, ngay trên
*Lịch sử*. `TepDinhKem` dựng CẢ BA khối trong một lượt gọi, nên việc này là **tách component ra hai
chỗ trên trang** (prop `chiKhoi`). Có đường rẻ hơn — đẩy *Hồ sơ pháp lý* lên trên cả cụm, giữ một lượt
gọi — nhưng nó **lặng lẽ đẩy *Giấy tờ hồ sơ* xuống theo**, một khối khách hàng không nhắc tới; và chỗ
tách đúng theo nghĩa: *Giấy tờ hồ sơ* là thứ TDV đính LÚC LẬP, hai khối kia là **sản phẩm của bước
B8**. **Cảnh báo *bản scan cũ* phải ĐI THEO** — câu của nó là *"bản scan DƯỚI ĐÂY"*, để lại chỗ cũ là
trỏ vào một khối không còn ở đó, và không test nào bắt được vì không có gì hỏng. **Suýt dựng ra vòng
lặp gọi mạng**: mảng lọc `tepCua` tính thẳng trong thân component là tham chiếu mới mỗi render, mà nó
nằm trong deps của `useEffect` dựng ảnh thu nhỏ → gọi `/files` → `setState` → render → lặp vô hạn, và
**không ca kiểm nào đỏ**; `useMemo` với khoá `chiKhoi?.join(',')` vì `chiKhoi` cũng khai tại chỗ. Cái
giá chấp nhận: hai lượt gọi `/files` khi cả hai nhóm có ảnh. Ca `0167` đọc `.khoi-tep h2` nên **mù với
mục xen giữa** — ca mới đọc CẢ DÃY `<h2>` của trang; **lần thứ BA** một yêu cầu TRÌNH BÀY rơi vào vùng
chưa ai canh (`0152`, `0153`). **1966/1966 xanh.**

Trước đó **P197** (`0169`): **thứ tự menu riêng cho Quản trị hệ thống** — Tổng quan · Người
dùng · Khách hàng · Sản phẩm · Chiết khấu · Văn bản mẫu · Thống kê · Nhật ký; năm vai trò trong luồng
giữ nguyên `0152`. Nghe như phải có **thứ tự theo vai trò**, và đó là suy sai đắt nhất: nó dựng ra một
bảng thứ hai phải giữ đồng bộ. Ba mục *Người dùng* · *Văn bản mẫu* · *Nhật ký* CHỈ Quản trị thấy, nên
xê dịch chúng không chạm ai khác — chen vào giữa những mục chung thì **MỘT mảng cho ra cả hai thứ tự**,
không thêm một dòng logic nào, `dieuHuongCho` vẫn là một `filter`. Giới hạn đã ghi: cách này sống được
chừng nào yêu cầu chỉ đụng vị trí của mục RIÊNG; đòi đổi thứ tự tương đối của hai mục CHUNG theo vai
trò thì phải đổi cấu trúc. **Ca kiểm `slice(0, 6)` phải THAY chứ không sửa số** — nó khẳng định sáu
mục chung nằm ở sáu vị trí đầu MẢNG GỐC, một tính chất tình cờ đúng chứ chưa bao giờ là luật; ca mới
canh bất biến thật mà cả cơ chế đứng lên: **menu của mọi vai trò là một DÃY CON của `DIEU_HUONG`**
(chỉ số tăng dần). Phá lại `dieuHuongCho` bằng một `sort` cho **3 đỏ**, kể cả hai ca có từ `0152`.
**1965/1965 xanh.**

Trước đó **P196** (`0168`): **`make demo-mau` chạy lại được**, và một lỗ hổng gateway lộ ra.
`make demo` không hỏng; `make demo-mau` hỏng ở BA chỗ chồng lên nhau. (1) `0167` thêm chốt
`BAN_MEM_REQUIRED` và tôi vá 22 chỗ trong **bộ kiểm** mà quên `seed-demo.ts` — nơi cũng đẩy hồ sơ qua
B8. Bản mềm của demo dựng bằng **đường API thật** (88 lượt Gotenberg), không chèn con trỏ giả như bản
scan: không API nào sinh ra được bản giấy đã ký, còn bản mềm thì phần mềm dựng ra nó. (2) **Gateway
không định tuyến `render/luu`** — mẫu `chiTiet` kết thúc bằng `render)$` nên lượt gọi rơi xuống
`policy` và nhận `404 "Cannot POST …"`, một câu không nhắc gì tới gateway. **Bộ kiểm không thể bắt
được**: mọi ca http gọi thẳng `http(doc)`. Chú thích ở `routes.ts` đã ghi đúng điều này từ `0055` và
vẫn không ngăn được lần thứ hai — nên giờ có `tests/http/gateway.test.ts` **quét decorator** của hai
controller `@Controller('policies')` rồi đối chiếu với mẫu, kèm ca chiều ngược cấm nới mẫu thành `.*`.
(3) `CSBH-CSBH-2026-000020` — `policy.code` đã mang tiền tố, ba chỗ ghép thêm; lỗi có từ lâu, chỉ lộ
khi `0167` bắt đầu LƯU cái tên ấy, và ca kiểm cũ `toMatch(/^CSBH-.+/)` **xanh với cả tên hỏng**.
**BẪY:** chồng demo chạy từ ẢNH ĐÃ DỰNG, không bind-mount — sửa `routes.ts` rồi `docker restart`
không đổi gì, phải `up -d --build`. Nghiệm thu thật: `kt01` tải bản mềm qua gateway — 200, 34.711
byte, `%PDF-`. **1965/1965 xanh.**

Trước đó **P195** (`0167`): **bản mềm thành một TỆP của hồ sơ, đóng băng như bản cứng**. Câu
thứ nhất của khách hàng đã đúng sẵn từ `0165` (ô chọn bày cả hai loại hồ sơ) — lượt này chỉ thêm nhãn
*đầy đủ*/*rút gọn*. **KHÔNG phải `0098` quay lại**: `0098` đóng băng **id của MẪU**, `0167` đóng băng
**chính tờ giấy** — byte PDF trên kho, nên vô hiệu hết mẫu thì lượt DỰNG MỚI trả 404 còn tệp ĐÃ LƯU
vẫn tải được (có ca kiểm nói thẳng ra). `BAN_CSBH` của `doc.file_purpose` có từ `0011` mà **chưa từng
ai dùng** — đây đúng là chỗ nó chờ. Bản lưu **chỉ nhận mẫu ĐẦY ĐỦ** (`chon('HO_SO', …)`, không
`LOAI_HO_SO`), vì nó là bản trình ký và bàn giao. **Bàn giao đòi CẢ HAI tệp, hai MÃ LỖI riêng**:
thiếu scan → nút XÁM (việc ngoài phần mềm); thiếu bản mềm → nút VẪN SÁNG, mở hộp tạo trước rồi hỏi
xác nhận (việc phần mềm làm được). Gộp một mã là mất đúng sự phân biệt ấy. **`purpose=BAN_CSBH` cố ý
đứng ngoài `oneOf` của `POST /files`** — mở ra là cho đính bất kỳ PDF nào dưới nhãn bản mềm.
**`loaiTepGhiDuoc` lần đầu trả HAI phần tử**, và giao diện đang đọc `loaiGhiDuoc[0]` — tệp thả ở khối
*Bản cứng* bị ghi dưới nhãn khối kia, im lặng; giờ lấy loại từ CHÍNH KHỐI đang bấm, và ca kiểm ghim
cả thứ tự. **70 ca đỏ trong một lượt** khi thêm chốt — không ca nào sai, chúng nói đúng rằng luật vừa
đổi; vá bằng lượt chèn có kịch bản 22 chỗ, cộng ba ca phải sửa tay vì đọc `attachments[0]` hoặc đếm
`toHaveLength(1)` trên cả mảng — câu hỏi đúng là *"có mấy tệp LOẠI SCAN"*. **1962/1962 xanh.**

Trước đó **P194** (`0166`): **`make demo-mau` thôi cuốn theo ba mẫu mặc định** — hồi quy do
chính `0165` sinh ra. `xoaDuLieuCu()` của `seed-demo` quét sạch `doc.contract_template` từ lâu và
**vô hại cho tới `0165`**: bộ nạp dựng lại ngay một bộ mẫu của riêng nó, xoá rồi tạo là một cặp cân
bằng. `0165` bỏ vế TẠO nên lượt xoá thành một chiều — bảng trống tới khi ai đó khởi động lại
`document`. **Không tệp nào một mình nhìn thấy cái lệch này.** Ranh giới đúng có sẵn ngay trong khối
ấy: nó không đụng `idn.app_user`, vì tài khoản là hệ thống chứ không phải dữ liệu demo — ba mẫu mặc
định cùng nhóm. Bản sửa là một mệnh đề `WHERE` đọc từ `MAU_MAC_DINH`, không phải một bước nạp lại.
Ba chỗ phải để ý: **tham số buộc tách khỏi khối nhiều câu lệnh** (node-pg chỉ cho tham số ở giao thức
mở rộng — giữ MỘT transaction bằng cách khối trên thôi `COMMIT`, khối dưới đóng); **`NOT EXISTS` chứ
không `NOT IN`** (gặp NULL là trả rỗng cho mọi dòng, không xoá gì và không báo gì); và tệp xoá SAU
mẫu vì `file_id` có khoá ngoại. Nghiệm thu trên **chồng demo thật**: `make demo` → 3 mẫu,
`make demo-mau` → vẫn 3 mẫu, rồi `sa01` dựng bản mềm bằng mẫu rút gọn qua gateway — HTTP 200, PDF
34.842 byte. **Hệ nào đã lỡ chạy `make demo-mau` của bản `0165` thì phải khởi động lại `document`.**
**1948/1948 xanh.**

Trước đó **P193** (`0165`): **loại mẫu thứ ba, ba mẫu mặc định đi cùng hệ thống, bảng sản phẩm
đúng màu**. `HO_SO_RUT_GON` là một LOẠI chứ không phải một cờ, vì `cot_bang` không nói được ba thứ:
một **thẻ riêng**, một **mẫu mặc định riêng** (khoá idempotent `(kind, name)`), và **tập cột suy từ
loại**. Chỗ nguy hiểm nhất: `tsc` chỉ ra mọi chỗ khai `Loai` thiếu nhánh nhưng **không chỉ ra một
truy vấn viết `kind = 'HO_SO'`** — vẫn dịch, vẫn chạy, chỉ là mẫu rút gọn **vô hình** với Sale Admin;
nên có hằng `LOAI_HO_SO` và một ca đi hết đường thật (dựng mẫu → tìm trong ô chọn `sa01` → dựng PDF).
**MỘT controller** cho hai loại hồ sơ: lý do tách `PolicyTemplates` khỏi `ContractTemplates` là *"hai
tập vai trò khác hẳn"*, không áp được ở đây. **Hai lỗi thật tìm ra bằng cách IN RA GIẤY**: `textOf`
khớp `<w:t[^>]*>` nên nuốt luôn `<w:tabs>`/`<w:tab/>` rồi trả cả khối markup về dưới dạng "chữ" —
**mọi mẫu Word có tab stop đều in ra XML**, lỗi nằm đó từ `0051`, và `setParagraphText` cách đó mười
lăm dòng vốn đã viết đúng; và `setParagraphText` dồn cả đoạn vào `<w:t>` đầu, nên **một đoạn văn chỉ
mang được MỘT vị trí chữ** — khối chỗ ký phải là một BẢNG, mỗi cột một ô. Hai `<w:tbl>` liền nhau thì
Word **gộp làm một**. `0134` bắt được lỗ hổng thật ở hai mẫu mới: thiếu `chuc_danh_dai_dien` và
`dien_thoai`, hai trường `chan-moi`. **Đảo một nửa `0150`**: vẫn không TỰ DỰNG thân mẫu bằng mã, chỉ
NẠP ba file `.docx`; và không mọc lại sau khi vô hiệu, vì câu hỏi là *"đã từng nạp chưa"* (tính cả
dòng đã tắt) chứ không phải *"còn mẫu dùng được không"*. Hai lượt phá lại XANH: bỏ chốt "đã nạp chưa"
(vì `uq_template_ten` mới là chốt thật — nhưng `luu()` tải file lên MinIO TRƯỚC khi ghi CSDL, nên mỗi
lượt để lại ba object mồ côi), và **đổi tên một mẫu mặc định** — một lỗ thật, đã thêm ca ghim tên.
**1947/1947 xanh.**

Trước đó **P192** (`0164`): **hộp xem văn bản phóng to gần hết màn hình, ảnh thì vừa cỡ thật**.
Năm câu trong một yêu cầu, và chúng không cùng một việc. Vế *"đè lên thanh bar bên trái"* **đã đúng
sẵn** — `.lop-phu` là `fixed; inset: 0; z-index: 50` còn thanh bên ở 40 — nên lượt này chỉ viết ra
một bất biến chưa ai canh; cái làm hộp TRÔNG nhỏ là trần `--cao-khung` và bề rộng cố định 900px.
Trần chiều cao **bỏ hẳn** (`clamp()` → `max()`, và đó chính là phép kiểm: `max()` chỉ nhận hai đối),
khoản trừ 19rem → **14rem** = 157px khung hộp + 32px lề + 2px viền + 33px biên. Bề rộng lấy **phần
LỚN HƠN** của `cao × tỷ lệ` và sàn 900px: bỏ hẳn sàn là quay về luật `0073`, thứ cho tờ A4 dọc ra
315px trên laptop — đúng cái `0145` vừa chữa. Vế tỷ lệ là mức **tối ưu chứ không phải tối đa**, vì
`#view=FitH` khớp trang theo BỀ RỘNG: rộng hơn `cao × tỷ lệ` là trình xem phóng trang cao hơn khung
rồi sinh thanh cuộn dọc BÊN TRONG khung. Khổ ngang trên 1920×1080 ra 1210px, trên 2560×1440 ra
1720px; khổ dọc sàn thắng, tức không thua bản trước ở đâu. **Ảnh chặn ở cỡ THẬT** —
`min(var(--cao-kha-dung), var(--cao-anh, 99999px))`, và **giá trị lùi LÀ cơ chế**: React không đặt
`--cao-anh` cho PDF nên `min()` không chặn gì; đặt chuỗi rỗng hoặc quên `px` đều làm `--cao-khung`
rỗng và hộp co về bề rộng nội dung. **Ca kiểm của `0130` phải ĐẢO CHIỀU chứ không nới ngưỡng** — nó
đòi hộp *chừa khoảng hở*, mà chính khách hàng vừa đảo câu ấy. Ca xanh lúc phá lại: *"khổ ngang rộng
thêm thật"* dựng lại công thức bằng JavaScript nên nó đo **công thức của chính nó**, không đo CSS;
chữa bằng một dòng neo đòi `.hop-thoai-giay` còn nhắc `--ty-le`. **1934/1934 xanh.**

Trước đó **P191** (`0163`): **bản mềm thôi đóng băng, và thôi là việc của người duyệt**. Ba câu
khách hàng gửi cùng lúc là **một câu**: `0098` đóng băng mẫu vì tin bản mềm là văn bản đi qua luồng
duyệt; khách hàng nói lại nó là **thao tác IN của Sale Admin ở B8**. Khi nó chỉ còn là thao tác của
MỘT người ở MỘT bước thì chỉ người ấy cần nút, chỉ người ấy chọn mẫu, và không còn gì để đóng băng —
ba câu tự suy ra nhau. Cột `mau_ho_so_id` **gỡ hẳn** (`0111`), và `mauCua()` co từ ~106 dòng xuống
một dòng: ba trong bốn nhánh của cây quyết định ấy thôi tồn tại. **Cái mất, khách hàng chấp nhận**:
hồ sơ đã ký in lại hôm nay có thể ra tờ giấy KHÁC, và vô hiệu hết mẫu thì không hồ sơ nào in được.
**`0150` đảo một nửa** — gửi duyệt thôi cần mẫu, nên thiếu mẫu chặn ở B8 chứ không ở B3, tức **hỏng
muộn hơn và khó thấy hơn** (`docs/04-TRIEN-KHAI.md` giữ `nap-danh-muc` là bước bắt buộc, vì lý do mới).
Chỗ tự dính đắt nhất: gán tắt `sale_admin_user_id` ngay trong `draft()` làm **DOC-27 — một ca về ĐỊA
CHỈ KHÁCH HÀNG — đỏ với 403**, vì `0141` chỉ hỏi Sale Admin khi cột còn rỗng, nên gán sẵn là bước ấy
thôi bắn sự kiện dựng `cus.customer_access`: `sa01` giữ quyền đọc HỒ SƠ mà mất quyền sửa KHÁCH HÀNG.
**Một phép gán tắt phải đứng ngoài đường đi thật.** Hai chỗ nữa: một `export` lọt vào giữa khối
`import` (`tsc` **xanh** — import được hoisted), và `nguoi-xu-ly.test.ts` có HAI `describe` giống hệt
nhau — **xanh cả hai lượt**, nên không tín hiệu nào; dấu vết của một lượt sửa file-wide bằng regex,
cùng loại đã ghi ở P182 và P183. Quyền mới **không vào `QUYEN_XEM`** (bảng ấy khớp một-một với
`DIEU_HUONG`) mà là hằng riêng `XEM_BAN_MEM` trong `can.ts`: ranh giới `quyen.test.ts` canh là **tệp**,
không phải bảng. **1928/1928 xanh.**

Trước đó **P190** (`0162`): **hồ sơ pháp lý của khách hàng hiện ngay trên trang hồ sơ CSBH**,
chỉ đọc. **Không một dòng máy chủ nào** — `0148` đã mở quyền đọc, DTO đã mang `customerId` ở cấp trên
cùng (tôi kịp viết một bản vá thêm `id` vào khối `khachHang` rồi mới thấy `tsc` chỉ ra nó có sẵn), và
`grantCustomerAccess` chạy từ lượt gửi duyệt nên không có khe 403. **Dùng lại `HoSoPhapLy`** với
`choPhepGhi={false}`, thêm prop `tieuDe` vì trang ấy đã có hai khối tệp khác. Hai điều đáng nhớ: mang
một khối sang trang thứ hai **làm lộ một mong manh có sẵn** — trả sai hình dạng thì `ds.map` ném lỗi
lúc dựng và React tháo CẢ CÂY, chấp nhận được ở trang khách hàng nhưng không ở trang hồ sơ, nên thêm
một phép kiểm hình dạng (không nuốt lỗi, vẫn vào `BaoLoi`); và ca kiểm *"chỉ đọc"* bản đầu tìm một
nút tên tôi ĐOÁN nên **phá lại vẫn xanh** — `VungTaiLen` dựng chữ *Thêm giấy tờ*. **1941/1941 xanh.**

Trước đó **P188–P189**. **P188** (`0160`): **nút *Bàn giao* xám khi chưa có bản scan**. Nửa đầu
của yêu cầu ĐÃ XONG TỪ LÂU — chốt `SCAN_REQUIRED` (WF-14) trả 409 từ đầu; lượt này bù **nửa còn
thiếu**, đúng nguyên tắc `can.ts` đã viết cho 403. Câu *"có bản scan chưa"* dùng CHUNG một hằng
`SQL_CO_BAN_SCAN` giữa chốt chặn và cờ vẽ nút — hai bản là hai bản sẽ lệch. **Không lọc
`allowed-actions`**: danh sách ấy còn đi vào thân lỗi `INVALID_TRANSITION`, lọc nó là câu trả lời ấy
nói sai; dùng cờ riêng `banGiaoDuoc` như `xuatHopDongDuoc`. **Xám chứ không ẩn**, vì việc phải làm nằm
ngay dưới trên cùng màn hình — và `title` một mình không đủ (trình đọc màn hình không đọc nó trên nút
`disabled`), nên có thêm một dòng chữ thật.

**P189** (`0161`): `waitEntries(d.id, 5)` đợi năm **DÒNG** trong khi số 5 suy từ năm **HÀNH ĐỘNG** —
quên `CREATED`. Ca kiểm đọc bảng trước khi dòng cuối kịp về. **Ba lượt chạy mới đủ kết luận** (đỏ ở
lượt đầy đủ, xanh khi cô lập, xanh lại ở lượt đầy đủ sau); hai lượt đầu đủ để gọi là "chập chờn" và
bỏ qua — đó chính là cách một lỗi thật sống sót. **1937/1937 xanh.**

Trước đó **P187** (`0159`): **dọn nốt hồ sơ và khách hàng** — `0156` mới dọn sản phẩm, và lỗ
hổng hiện ra ở bảng kế tiếp ba chặng sau, theo cách khó chịu nhất: một ca kiểm về **THƯ** hết giờ 30
giây, không chữ nào nhắc tới danh mục hay hiệu năng. **Nợ N-09 vừa cắn thật** — `CLAUDE.md` ghi *"ở
quy mô hiện tại chưa cắn"*, đúng với dữ liệu thật, sai với CSDL bộ kiểm (5469 hồ sơ, **1702 đóng
băng**); dọn xuống 199 thì xanh trong 44 giây. Nợ để nguyên, chặng này chỉ dọn rác. Hai điều đáng
nhớ: **`git stash` rồi chạy trên bản đã commit** là cách rẻ và dứt điểm nhất để trả lời *"tôi có gây
ra không"* — chắc hơn mọi phép đọc mã; và **0 trong 5469 hồ sơ mang tiền tố `ZZ`** vì
`pol.next_policy_code()` sinh mã ở máy chủ, nên bốn tệp kiểm viết `DELETE FROM pol.policy WHERE code
LIKE 'ZZ…%'` đều là **lệnh rỗng, và đã rỗng từ đầu** — không ai thấy, vì `DELETE` xoá 0 dòng không
báo gì. Đường đúng là xoá **qua khách hàng**.

Trước đó **P185–P186**. **P186** (`0158`): *KT duyệt bản mềm* → ***Chờ KT duyệt L1***, ba bảng
nhãn cộng nhãn thẻ Tổng quan. ***KT duyệt bản cứng* GIỮ NGUYÊN** — khách hàng chốt riêng khi được
hỏi, nên hai nhãn thôi cùng lối đặt tên; đừng "sửa cho đồng bộ".

**P185** (`0157`): **Kế toán chỉ thấy hồ sơ ĐÃ TỪNG TỚI BÀN MÌNH**, ở mọi trạng thái. Bản sửa là
**XOÁ một mệnh đề, không thêm cột**: `TBP_SIGN` là đường DUY NHẤT vào `CHO_KT_L1` và cũng là chỗ duy
nhất bật `da_qua_tbp`, nên cột ấy — dù tên nói về TBP — đã trả lời đúng câu *"đã từng nằm trên bàn Kế
toán chưa"*. `0142` gắn thêm vế `status = 'CHO_TBP_DUYET'` thừa, nên TBP trả hồ sơ về là chốt tắt.
`status` rời khỏi cả kiểu tham số `assertPolicyInScope`. Hai điều đáng nhớ: câu khách hàng viết —
*"đã từng được kế toán TÁC ĐỘNG"* — **đọc nghĩa đen thì không dựng được** (Kế toán sẽ không thấy hồ
sơ đang chờ chính mình); và **một fixture vặn thẳng CSDL phải tự dựng ra trạng thái ĐẾN ĐƯỢC** — ca
`0142` cũ khẳng định hành vi cho `CHO_KT_L1` + `da_qua_tbp: false`, một tổ hợp không tồn tại, và nằm
đó xanh suốt hai chặng. Kế toán giờ nhận **403 chứ không 409** trên hồ sơ chưa qua TBP: chốt phạm vi
trả lời trước máy trạng thái, và đó là câu mạnh hơn.

Trước đó **P184** (`0156`): **bộ kiểm thôi tự đầu độc CSDL của nó**. `cat.product` không có
đường xoá qua API (`0121`), nên chín trong mười hai tệp kiểm tạo sản phẩm mà không gỡ được — đo được
**~690 dòng mỗi lượt chạy**, tức **bảy lượt là chạm trần 5000** của lượt nhập Excel và bốn ca danh mục
đỏ ở chỗ vô can. Chẩn đoán khớp đến từng tiền tố: bảy tiền tố còn rác đúng bằng bảy tệp không có bước
dọn. Bước dọn nằm ở **`globalSetup`** (`tests/don-rac-truoc-luot.ts`), dọn ĐẦU lượt chứ không cuối —
lượt hỏng giữa chừng vẫn để lại dữ liệu cho người gỡ lỗi soi.

> **BÀI HỌC ĐẮT NHẤT của chặng, và tôi đặt sai lần đầu:** bản đầu để bước dọn trong `withAdminDb` gác
> bằng một cờ mô-đun, với lý lẽ *"chạy tuần tự trong một tiến trình nên một lần mỗi tiến trình là một
> lần mỗi lượt"*. **Đo ra: chạy TÁM lần, một lần mỗi tệp** — vitest cấp lại đồ thị mô-đun cho từng
> tệp. Tệ hơn, giữa lượt nó xoá sản phẩm của tệp chạy TRƯỚC trong CÙNG lượt. **`fileParallelism: false`
> nói về THỨ TỰ, không nói về việc dùng chung mô-đun** — tôi suy từ vế đầu ra vế sau và không kiểm,
> trong khi một dòng `console.log` trả lời ngay ở lượt chạy đầu.

Phản đối ban đầu với `globalSetup` — *"chạy cả cho `tests/web` vốn không có Postgres, nên phải bọc
`try/catch` im lặng, và một bước dọn im lặng bỏ qua sẽ có ngày im lặng không chạy"* — tự tan: nó
được bịt bằng chính ca kiểm **ĐẾM** số dòng còn lại. **Một chốt chặn ồn ào làm cho một bước im lặng
trở nên an toàn**; không cần cả hai đều ồn. Ngưỡng đếm đặt ở **nửa trần**, vì đặt sát trần thì nó chỉ
đỏ cùng lúc với chính lỗi nó sinh ra để tránh.

> **BẪY TỰ DÍNH:** chạy `vitest` một tệp trong lúc `make test` đang chạy nền là hai lượt dùng chung
> một Postgres — junit ghi 6 đỏ trong khi `make test` thoát mã 0. Đúng cái `CLAUDE.md` cảnh báo cho
> cặp demo/test, chỉ khác là hai lượt TEST với nhau.

Trước đó **P183** (`0155`): **bỏ hẳn trạng thái `TU_CHOI`**, và bỏ luôn nút — TBP chỉ còn *Ký*
hoặc *Trả lại*. Đường kết thúc không mất mà **đổi tay**: TBP trả lại, TDV tự xoá → `DA_XOA`, khớp
luật `0099` *chỉ TDV xoá hồ sơ của mình*. Cái mất: TBP không tự kết thúc được hồ sơ, và
`YEU_CAU_CHINH_SUA` **không có SLA** nên hồ sơ nằm đó vô thời hạn. Bỏ một giá trị enum là **dựng lại
cả kiểu** (công thức `0048`). Hai cột `rejected_at`/`rejected_by` và nhãn `NHAN_HANH_DONG.TBP_REJECT`
**GIỮ LẠI** — nhật ký kể chuyện đã xảy ra. Chỗ suýt hỏng lặng lẽ nhất: bốn lát còn lại của biểu đồ cơ
cấu kết cục lọc `rejected_at IS NULL` để không trùng lát; bỏ lát `tu_choi` mà giữ phép lọc ấy thì hồ
sơ cũ **rơi khỏi MỌI lát** và tổng ngắn đi mà không gì đỏ. Ba chỗ tự dính: **backtick trong template
literal lần thứ HAI trong hai chặng**; thay `TU_CHOI` bằng `YEU_CAU_CHINH_SUA` ở ba ca về trạng thái
KẾT THÚC (nó không phải trạng thái kết thúc); và phải kiểm `createsNewVersion` trước khi đổi
`TBP_REJECT` → `TBP_RETURN`. **1926/1926 xanh.**

> **NGOÀI CHẶNG, đã đo:** CSDL kiểm **tự đầu độc mình** — 5159 sản phẩm `ZZ*` tích qua nhiều lượt
> chạy, vượt trần 5000 dòng của lượt nhập Excel, làm bốn ca danh mục đỏ ở chỗ chẳng liên quan. Sản
> phẩm không xoá được qua API và bước dọn không quét chúng. Dọn tay thì xanh, nhưng khoảng ba mươi
> lượt `make test` nữa là đỏ lại. **Chưa sửa.**

Trước đó **P182** (`0154`): **một khách hàng có nhiều địa chỉ** — bảng `cus.customer_address`
là nguồn, hai cột cũ thành **bản gộp do trigger dựng**, ngăn bằng `\n`. Điểm quan trọng nhất là hai
yêu cầu của khách **khoá vào nhau**: `0006` cho trùng MST có chủ ý với đúng lý do *"một chủ hộ nhiều
điểm bán"*, nên nhiều-địa-chỉ phải đi TRƯỚC cấm-trùng-MST (`0155`), nếu không là bịt đường đi mà chưa
mở đường thay thế. Giữ tên hai cột cũ khiến `policy`/`document`/`reporting` **không sửa dòng nào**
(khuôn `0138`), và `setParagraphText` **đã** đổi `\n` → `<w:br/>` từ trước — chú thích của nó viết
đúng chữ *"địa chỉ nhiều dòng"*. Ràng buộc **cấm `\n` trong một địa chỉ** là thứ khiến cột gộp tách
ngược ra được, nên đọc mảng không cần truy vấn thêm. Ba chỗ tự dính: **backtick trong chú thích giữa
template literal** (`CLAUDE.md` đã ghi, vẫn dính); **bỏ trống `$4`/`$5` để khỏi đánh số lại** — kèm cả
một chú thích biện minh, mà Postgres đếm theo tham số cao nhất nên mọi `PATCH` trả 500; và
`registered_address` `NOT NULL` **không có mặc định** nên thiếu `SET DEFAULT ''` là mọi lượt lập khách
đều hỏng. Lộ thêm một khoảng hở có sẵn: `trong()` không biết mảng nên `[]` và `['']` lọt thành *"đã
điền"*. Phá lại `DROP TRIGGER` cho **10 đỏ, gồm một ca TÌM KIẾM có sẵn từ trước** — chứng minh cột gộp
đúng là thứ chỉ mục GIN đang dùng. **1930/1930 xanh.**

Trước đó **P181** (`0153`): **khối thông tin khách hàng** → *Mã số thuế · Người đại diện · Số
điện thoại · Công nợ · Loại khách hàng*, và **địa chỉ ra khỏi khối**. Điểm cả chặng: *"bỏ phần địa
chỉ"* là bỏ khỏi **CHỖ BÀY**, không phải khỏi hệ thống — địa chỉ hiện ở HAI chỗ trên trang này, và
**thẻ danh sách phải giữ** (hai khách trùng tên chỉ phân biệt được bằng nó, và ô tìm kiếm ngay trên
đó khai *"tìm theo tên, địa chỉ hoặc mã số thuế"*). Có một ca kiểm canh đúng cách hiểu sai ấy. Khối
`dl.the-so` **chưa từng có ca kiểm nào** dù ba tệp dựng `ChiTietKhachHang` thật — lần thứ hai liên
tiếp một yêu cầu về TRÌNH BÀY chạm vào vùng không ai canh (`0152` là thứ tự thanh bên), nên đáng rà
xem còn danh sách hiển thị nào cùng loại đang trống. Ca mới **dựng DOM thật**: quét chuỗi chỉ đúng
với thứ tự CHỮ trong tệp, tách khỏi thứ tự người dùng THẤY ngay khi một ô bị bọc vào nhánh điều kiện.
**1918/1918 xanh.**

Trước đó **P180** (`0152`): **thứ tự mục trên thanh bên** → Tổng quan · Khách hàng · Hồ sơ
CSBH · Sản phẩm · Chiết khấu · Thống kê (theo trình tự công việc, không theo tần suất). Việc nhỏ,
điều đáng ghi là **thứ tự chưa từng được canh**: mọi ca cũ dùng `toContain`/`find` — hỏi *"có mặt
không"* chứ không hỏi *"đứng thứ mấy"* — nên đảo hai mục vẫn xanh cả bộ. Ca mới khẳng định **cả dãy**
bằng `toEqual` (kiểm từng cặp lân cận thì chèn một mục vào giữa vẫn lọt), kèm **chiều đối chiếu qua
bảng ĐÃ LỌC**: ca đọc mảng gốc sẽ xanh khi một mục quản trị bị chuyển lên chen vào giữa. Đo được lúc
phá lại: đảo *Khách hàng* ↔ *Hồ sơ* chỉ 2 đỏ chứ không 3 — ca Quản trị xanh vì `0133` đã gỡ *Hồ sơ*
khỏi họ. **1915/1915 xanh.**

Trước đó **P179** (`0151`): **tên công ty đổi pháp nhân** → *Công ty TNHH Dược phẩm Nutricare*
(địa chỉ và MST giữ nguyên). Nghe như một lượt tìm-và-thay, thực ra tên cũ nằm ở **sáu chỗ trong mã
cộng bốn tệp `.docx` nhị phân** — mà tệp nhị phân thì không công cụ tìm kiếm văn bản nào thấy, và
chính chúng mới là thứ đi lên tờ giấy. Hằng `COMPANY` **đã là mã chết từ `0150`**: `ensureDefault`
bị gỡ nhưng dòng `import` ở lại, và **một import không ai dùng không làm `tsc` đỏ** — nên hệ thống có
một hằng mang tên công ty mà không ai đọc, trong khi tên thật gõ tay ở năm chỗ. Giờ nó là nguồn sự
thật; còn đúng một bản chép tay là màn hình đăng nhập (giao diện là gói riêng, `FE-38` chặn 250KB),
canh bằng ca kiểm hai chiều. Ca đáng giá nhất **đọc vào trong tệp zip** (`documentXml`) — phá lại
bằng cách giữ hằng mới mà hoàn tác một `.docx` cho **1 đỏ nêu đúng tên tệp**. Ba bẫy đã ghi: **chuẩn
hoá NFC trước khi so nội dung** (bẫy `CLAUDE.md` ghi cho tên tệp, đúng y hệt cho nội dung); tên cũ
trong ca kiểm phải **dựng từ hai mảnh** vì phép quét đọc cả tệp chính nó; và **phạm vi quét là mã
nguồn, không phải cả repo** — nhật ký phải giữ được tên cũ. Cái giá trên hệ đang chạy: mẫu đã nằm
trong CSDL **không đổi theo** (đúng — hồ sơ đã ký giữ tên lúc ký), phải tải tay bốn mẫu mới, và vì
`0150` cấm trùng tên nên **bản mới phải mang tên khác**. **1912/1912 xanh.**

Trước đó **P171** (`0143`): **bịt ba lỗ hổng của chính P169–P170**. Đáng nhớ nhất:
`0142` khai hai trường của luật Kế toán là **tuỳ chọn** ("chọn phía nới"), và `attach`/`detach` liệt
kê từng cột trong `SELECT` nên chốt chặn **không bao giờ nổ ở hai đường ấy** — đúng bẫy `0128` đã
ghi, lặp lại ở chính người viết ra dòng ấy. Chữa bằng cách khai **BẮT BUỘC** rồi để `tsc` chỉ chỗ (nó
chỉ ra ba, một ngoài dự đoán). Bài học: **một ca kiểm quét mã nguồn không bao giờ mạnh bằng một kiểu
dữ liệu bắt buộc** — ca quét bị một cách viết mới lách qua, kiểu bắt buộc thì không dịch được. Hai
chỗ nữa: ba ca của `0142` mô tả CÁCH VIẾT (đổi `=== false` thành `!` là đỏ, đổi `&&` thành `||` vẫn
xanh) — thay bằng năm ca **gọi thẳng hàm**, trong đó ca **chiều dương** là ca `0142` thiếu hẳn; và
docstring của `nguoi-xu-ly.test.ts` hứa có ca đối chiếu hai bảng phân công **suốt từ `0031` mà ca ấy
chưa bao giờ tồn tại** — giờ có thật, quét 11 hành động × 2 trạng thái.

Trước đó **P169–P170**, hai luật về PHẠM VI hồ sơ (chốt 27/08):

**P170** (`0142`) **Kế toán chưa thấy hồ sơ ở lượt chờ TBP ĐẦU TIÊN**; bị trả lại từ các bước sau
thì vẫn thấy. Điều kiện là *"đã từng qua TBP"* — và **không cột nào có sẵn trả lời được**:
`tbp_signed_at` bị xoá mỗi lượt trả về, `kt_l1_received_at` còn NULL khi Kế toán trả ở L1,
`so_lan_tbp_tra_lai` đếm lượt TRẢ chứ không đếm lượt KÝ. Nên thêm **`da_qua_tbp`, cột KHÔNG BAO GIỜ
bị xoá** — nó đứng cạnh ba cột chữ ký nhưng hỏi ngược lại về thời gian (*"đã từng ký chưa"* thay vì
*"bây giờ có chữ ký không"*); gom nó vào nhánh xoá chữ ký là lấy lại quyền đọc của Kế toán mà không
ca kiểm nào đỏ. Chặn ở **hai** đường: `thuocPhamVi` (danh sách) và `assertPolicyInScope` (mở một hồ
sơ), cả hai mặc định phía NỚI. **Vế `reporting` CHƯA làm** — cột đã có trong migration và bộ đồng bộ
đã ghi, nhưng mệnh đề lọc chưa nối, nên thẻ *Sắp quá hạn* của Kế toán còn đếm cả hồ sơ vừa bị giấu.

**P169** (`0141`) **chọn người MỘT LẦN**: gửi lại sau khi sửa thôi chọn lại TBP/Kế toán, và tiếp
nhận L1 chỉ hỏi Sale Admin ở lượt đầu. `0031` cho chọn lại và bỏ sót cái giá: lượt ghi là
`coalesce($2, tbp_user_id)` tức GHI ĐÈ, nên **người vừa trả hồ sơ về mất quyền đọc chính hồ sơ ấy** —
trong khi vẫn nhận thư (`daTacDong` đọc từ nhật ký, không từ bốn cột). Bảng tra `PHAN_CONG` thành hàm
`phanCongCua(action, before)`; giao diện nhận một **CỜ** `daChonSaleAdmin`, không nhận id.

Trước đó **P168** (`0140`): **gửi duyệt tách làm hai bước** — bước một chọn TBP · Kế toán ·
văn bản mẫu, bước hai là một hộp RIÊNG **cỡ hộp xem bản mềm** và nút gửi thật nằm ở đó. Cỡ ấy đặt
bằng **`tyLe`, KHÔNG bằng `co`**: `tyLe` bật `.hop-thoai-xem` (bề rộng suy từ `--cao-khung × tỷ lệ
tờ giấy`, `0073`) và `.khung-xem` đọc lại chính hai biến ấy — nhờ vậy hộp với khung luôn cùng hình,
và khung cao hết màn hình thay vì bị kẹp ở `min(52dvh, 560px)`. Kéo theo: ca kiểm `0129` phải viết
lại, vì `--ty-le` chuyển từ **khung** sang **hộp thoại**. Bẫy nguy hiểm nhất: nút bước một đổi việc
nó làm — đấu nhầm vào `gui` thì **hồ sơ đi ngay lúc người dùng tưởng mình bấm để XEM**, không lùi
được; có một ca kiểm chỉ canh chuyện ấy. `chuaXem` gỡ hẳn: hai điều kiện tách ra hai nút.
Bẫy ca kiểm: `getByRole('button', {name:'Gửi duyệt'})` khớp **hai** phần tử — nút dải thao tác phía
sau và nút bước hai; phải tìm trong `role="dialog"`.

Trước đó **P164–P167**, một lượt phản hồi 27/08 làm thành bốn chặng:

**P167** (`0139`) ba loại khách hàng có **tên thật** — giữ chữ *Loại n* ở đầu vì con số là thứ quy
định chiết khấu khai theo. Chú thích cũ ở `nhanLoaiKhach` đã đoán trước đúng lượt này.

**P166** (`0138`) — lớn nhất: **công nợ là một ĐIỀU KHOẢN, không phải số tiền**. Hai cột
(`debt_term` + `debt_note`), cột `debt bigint` **gỡ hẳn** và số tiền mất theo (không có phép chuyển
đổi nào đúng; mọi khách nhận phương án 1 — thận trọng nhất vì nó KHÔNG cho nợ). **`customer` dựng
sẵn CÂU CHỮ** và trả qua trường `debt`, nên `policy` với `document` chỉ thấy một chuỗi và không phải
sửa dòng logic nào. **Ảnh chụp chụp CÂU CHỮ, không chụp mã** — sửa câu chữ về sau không được đổi nội
dung tờ đã ký. Luật *Khác thì bắt buộc gõ, hai phương án kia thì cấm* là luật **hai chiều**, nên nó
rời khỏi service về `dieu-khoan.ts` thành hàm thuần — ca kiểm thuần mới với tới được. Ba chỗ suýt
quên: `internal.controller` liệt kê từng cột (bẫy `0128`), mẫu văn bản in `{{ho_so.cong_no}} đồng`,
và `debt_note` không được dùng `coalesce`.

**P165** (`0137`) mẫu A4 rút gọn ra khỏi `make demo-mau` lẫn `nap-danh-muc`; file ở lại `templates/`.
Cái mất: đó là mẫu DUY NHẤT khai `cotBang`, nên demo hết chỗ bày tính năng chọn tập cột.

**P164** (`0136`) nút hộp lỗi *Đã hiểu* → ***Đóng***, và **`str(10, 10)` không phải một phép kiểm
ngày**: năm chỗ, ba service. `khong-phai` đúng mười ký tự nên nó ĐI QUA rồi Postgres ném `22007` →
**HTTP 500**; câu lỗi thì nói *"phải có tối thiểu 10 ký tự"* với người đang nhập một cái ngày. Thêm
`ngayIso()` vào `http-kit`. `new Date('2026-02-31')` KHÔNG ném lỗi — nó trôi sang 03/03, nên phải
dựng ngày rồi in ngược ra so lại, và phải dùng `Date.UTC` (họ bẫy `current_date`/`toISOString`).

> **HAI BẪY CỦA CHÍNH LƯỢT NÀY, đọc trước khi phá lại:**
> **Chú thích trong template literal không được dùng backtick** — cả khối SQL nằm trong một template
> literal, và một backtick cắt đứt chuỗi (triệu chứng: bảy lỗi cú pháp ở dòng chẳng liên quan).
> **Phá lại thì sao lưu TỪNG TỆP, không sao lưu cả thư mục** — `impl/services/*/node_modules` là
> liên kết do root tạo nên `rm -rf` một thư mục service không bao giờ chạy trọn, và `set -e` dừng
> giữa chừng để lại cây làm việc mất `apps/web/src`.

**703/705 ca chạy được ngoại tuyến xanh; `make test` đầy đủ CHƯA chạy — chồng demo vẫn bật.**

Trước đó **P163** (`0135`): **bề rộng cột bảng sản phẩm** và **phông Times New Roman**. Đo
trước khi sửa (docx → Gotenberg → PDF, đọc vị trí đường kẻ dọc) và con số nói hết: **mười một cột,
mỗi cột đúng 43,8pt — bằng nhau tăm tắp**. Bộ `trongSo` của `0055` **chưa bao giờ có tác dụng**, vì
`table()` phát `<w:tblGrid>` chia ĐỀU trong khi ô mang `w:tcW` theo tỷ lệ — và ở `tblLayout=fixed`
LibreOffice nghe theo LƯỚI (chú thích tại chỗ nói `tblGrid` "chỉ là gợi ý" — đúng với `autofit`, sai
với `fixed`). Sửa: lưới mang cùng tỷ lệ. Tên sản phẩm 9,1% → **25,6%** (2,82×). Kèm **lề trong ô**
0,19cm → 0,1cm: mười một cột thì lề ăn mất **4,2cm**, một phần tư bề ngang A4 dọc. Phông: gói `.docx`
**không có `word/styles.xml`** nào — đo được qua tên phông nhúng trong PDF (`Carlito` = thay thế của
Calibri → `LiberationSerif` = thay thế của Times New Roman). Ảnh Gotenberg **không có TNR thật** (phông
bản quyền), nên bản in máy chủ dùng Liberation Serif — cùng số đo, khác nét. Phải khai `hAnsi` (tiếng
Việt có dấu rơi vào đó) và khai styles ở **cả** `Content_Types` lẫn `document.xml.rels`, thiếu một chỗ
thì **Word không mở được file** còn LibreOffice vẫn mở.
`templates/*.docx` là **ĐẦU RA** của `scripts/tao-mau-ho-so.ts` — `0134` vá thẳng vào file, và lượt
sinh lại này suýt nuốt mất bản vá ấy.

> **SỰ CỐ, lần thứ hai:** chồng demo bật thì **không gõ BẤT KỲ lệnh `compose … -f compose.test.yml`
> nào** — không riêng `vitest`. Hai tệp compose dùng CÙNG tên project `csbh`, nên `compose run` đưa
> project về tập service của bản test: nó **hạ mười service ứng dụng của demo** và chạy `pg-init` +
> `migrate` trên chính CSDL ấy. Cần chạy gì thì `docker run` một ảnh rời gắn repo vào, `--network
> none` (hoặc `--network csbh_internal` nếu cần Gotenberg). Lần trước (`0134`) đã xoá sạch bảng mẫu
> văn bản của demo — 177/177 hồ sơ mất mẫu đã đóng băng.

Trước đó **P162** (`0134`): **mẫu văn bản in được số điện thoại**, và tài liệu triển khai theo
kịp. `0128` thêm một trường **chặn gửi duyệt** rồi thêm khoá ánh xạ, nhưng **không mẫu nào kèm theo
phần mềm in nó** — bản chạy thử bắt điền một trường không xuất hiện trên tờ giấy nào. Không ca kiểm
nào bắt được vì **hai vế ở hai thế giới**: bảng phân loại trong TypeScript, và bốn file zip nhị phân.
Ca kiểm mới đọc danh sách `.docx` **từ chính `nap-danh-muc.ts`** rồi đòi in đủ mọi trường `chan-moi`.
Còn một chỗ cùng loại CHƯA sửa: `ensureDefault` dựng mẫu mặc định **bằng mã** và cũng không in ba
trường ấy — trên production không ai chạy `nap-danh-muc` thì đó là mẫu DUY NHẤT.
`impl/templates/` là **`root:root`**, sửa phải qua một container `-u 0`.

> **SỰ CỐ, đọc trước khi chạy test:** chồng demo bật thì `make test` dừng ở `check-demo-down`. Né
> chốt ấy bằng cách gọi thẳng `vitest run tests/http/…` đã **xoá sạch bảng mẫu văn bản của bản
> demo** — 177/177 hồ sơ mất mẫu đã đóng băng, không mở được bản mềm nữa. **Demo bật thì CHỈ chạy
> `tests/web`** (jsdom, chặn `fetch`, không nối Postgres). Gọi vitest thẳng không phải cách chạy
> "nhẹ hơn", nó là cách bỏ qua chốt duy nhất canh chuyện này.

Trước đó **P161** (`0133`): nốt **bốn bảng thao tác còn lại** (đủ bảy), và **Hồ sơ CSBH ra
khỏi Quản trị hệ thống**. Nửa sau nghe như đổi luật, thực ra **luật đã có sẵn**: YCNV muc 2.1 viết
*"Quản trị đứng ngoài luồng duyệt, không có phạm vi hồ sơ nào"*, và máy chủ làm đúng thế từ đầu
(`scope_user_ids` rỗng → `403 OUT_OF_SCOPE`) — chỉ mục menu là chưa ai gỡ. **Không một dòng máy chủ
nào.** Ba bẫy: **Tổng quan đi nhờ khoá `hoSo`** (mục `/` khai `muc: 'hoSo'` từ P22) nên gỡ là mất
luôn màn hình đầu tiên sau đăng nhập — tách khoá `tongQuan`; **Khách hàng phải GIỮ** vì
`doiTdvPhuTrach` chỉ của Quản trị (`0031`) và nút nằm ở đó, nên hai khối CSBH trên trang ấy nói
*"không khả dụng"* — **gác bằng chính cờ `xem(role,'hoSo')`, KHÔNG gọi API rồi bắt 403**; và ca kiểm
`0132` **liệt kê ba tên tệp** nên bốn bảng kia lọt — giờ có thêm một ca **quét toàn bộ**. Bài học ca
kiểm: bản đầu hỏi *"tệp này có ô nào mang lớp không"* → gỡ lớp khỏi **một trong ba** ô của bảng Người
dùng vẫn xanh; phải **đếm từng ô**.
**650/650 ca giao diện xanh; `make test` đầy đủ chưa chạy — chồng demo đang bật.**

Trước đó **P160** (`0132`): **thao tác trong danh mục hiện khi rê chuột**, và cột *Thao tác*
thôi có tên nhìn thấy được — ba bảng danh mục (sản phẩm · nhóm · chiết khấu), bốn bảng còn lại giữ
nguyên. **BA điều kiện chứ không một**: `tr:hover` · `tr:focus-within` · `@media (hover: none)` —
thiếu vế hai thì bàn phím mất hẳn thao tác, thiếu vế ba thì cảm ứng mất, và **cả hai đều không lộ ra
khi thử bằng chuột trên máy để bàn**. Bẫy im lặng nhất: **`visibility: hidden` không nhận được tiêu
điểm**, nên nó tự khoá mất `:focus-within` của chính nó — luật vẫn còn nguyên trong CSS mà đã thành
mã chết; dùng `opacity` (`display: none` thì cột co ra co vào, bảng nhảy ngang). Cột không tên vẫn
phải có tên: `.chi-doc-man-hinh`, `<th>` rỗng thì trình đọc màn hình đọc là "cột trống".
**641/641 ca giao diện xanh; `make test` đầy đủ CHƯA chạy — chồng demo đang bật, xem nhật ký P160.**

Trước đó **P159** (`0131`): **hai khoảng hở ở *Lịch sử giá*** — tiêu đề dính bảng, nhãn *Đang
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
- **BẢN MỀM ĐÃ LƯU là một tệp của hồ sơ** (`0167`) — `pol.attachment_kind` thêm `BAN_MEM` (`0113`),
  `doc.file_purpose` dùng `BAN_CSBH` vốn có sẵn từ `0011`. Khác `0098` ở chỗ căn bản: đóng băng
  **byte PDF**, không phải id của mẫu — nên mẫu đổi hay bị vô hiệu đều không chạm tới nó. Chỉ Sale
  Admin tạo/gỡ; chỉ nhận **mẫu ĐẦY ĐỦ**; **không tải lên từ máy được** (`purpose=BAN_CSBH` đứng ngoài
  `oneOf` của `POST /files`). Lưu đi HAI BƯỚC như bản scan — `document` dựng+ghi tệp, `policy` gắn —
  để `attach` vẫn là chỗ duy nhất quyết định một tệp có vào hồ sơ hay không. `SA_HANDOVER` đòi cả
  `SCAN_REQUIRED` lẫn `BAN_MEM_REQUIRED`, **hai mã riêng** vì màn hình xử hai ca khác hẳn nhau.
- **BA loại văn bản mẫu** (`0165`): `HO_SO` (đầy đủ) · `HO_SO_RUT_GON` · `HOP_DONG`. Hai loại hồ sơ
  khác nhau **đúng một chuyện — tập cột bảng sản phẩm** — và tập ấy **suy từ loại** (`COT_RUT_GON`,
  sáu cột), không do người soạn khai. Ba thẻ của Quản trị là ba danh sách rời; **ô chọn của Sale
  Admin trộn chung hai loại hồ sơ**, nên mọi đường tra một mẫu hồ sơ nhận `LOAI_HO_SO` chứ không
  `'HO_SO'` — `tsc` không bắt được chỗ sót ấy. **Ba mẫu MẶC ĐỊNH nạp lúc khởi động** từ
  `templates/default/`, idempotent theo `(kind, name)` **tính cả dòng đã vô hiệu hoá**; tên mẫu bị
  ghim bằng ca kiểm, vì đổi tên là nạp thêm một bản thứ hai trên mọi hệ đang chạy. `nap-danh-muc` và
  `seed-demo` **thôi tạo mẫu nào**.
- **Một đoạn văn của mẫu chỉ mang được MỘT vị trí chữ** (`0165`). `setParagraphText` dồn toàn bộ chữ
  vào `<w:t>` ĐẦU TIÊN rồi làm rỗng các `<w:t>` còn lại, nên nhiều ô trống trong một đoạn — dù cách
  nhau bằng tab — trộn xong đều về một chỗ. Muốn nhiều cột thì dùng **bảng**, mỗi cột một ô. Kèm hai
  bẫy đo được: hai `<w:tbl>` liền nhau thì Word **gộp làm một bảng**, và thứ tự trong `<w:tcPr>` là
  `xsd:sequence` (`tcW` → `shd` → `vAlign`) — sai thứ tự thì **Word không mở được file còn
  LibreOffice vẫn mở**, nên bản PDF máy chủ dựng không lộ ra gì.
- **Mẫu bản mềm KHÔNG đóng băng, và bản mềm CHỈ của Sale Admin** (`0163`, đảo `0098`). Cột
  `pol.policy.mau_ho_so_id` **gỡ hẳn** (`0111`). Bản mềm không phải văn bản đi qua luồng duyệt — nó
  là **thao tác IN của Sale Admin ở B8**; cái được duyệt là dữ liệu hồ sơ, và dữ liệu ấy vẫn đóng
  băng nguyên vẹn (`0022`, `0101`). Nên `mauId` **bắt buộc** ở `render.controller`, `READERS` thu về
  `['SALE_ADMIN']`, và `NGUOI_XEM_HO_SO` của `contracts.controller` phải khớp — bất biến là *ai dựng
  được bản mềm thì thấy được danh sách mẫu*, có ca đối chiếu ở `document.test.ts` **cộng** một ca gọi
  thật bằng bốn tài khoản (nới một hằng chỉ làm đỏ ca đối chiếu, và người sửa vội sẽ nới nốt hằng
  kia). Giao diện gác bằng `xemBanMemDuoc()` trong `can.ts`, **không** bằng một khoá `QUYEN_XEM` —
  bảng ấy khớp một-một với `DIEU_HUONG`. **Mẫu vẫn không xoá được, chỉ vô hiệu hoá**, nhưng vì lý do
  MỚI và rộng hơn: xoá một mẫu là lấy đi một cách in của MỌI hồ sơ, không riêng hồ sơ đã gắn nó.
  **Gửi duyệt thôi cần mẫu** — đảo một nửa `0150`, nên thiếu mẫu chặn ở B8 chứ không ở B3.
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
