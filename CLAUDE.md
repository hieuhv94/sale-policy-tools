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
| `impl/` | Kho mã sản phẩm: 10 service NestJS, web React + Vite (không dùng thư viện component), 68 migration SQL thuần, bộ test |
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

## Trạng thái hiện tại (10/09/2026)

Chặng gần nhất **P223** (`0195`): **bỏ nhãn bậc khỏi tiêu đề thông báo, hạ chói dải VIỆC, chấm chuông
thành ĐỎ**. Ba câu khách hàng gửi cùng lúc và chúng **KHÔNG rời nhau**: câu một làm màu thành thứ DUY
NHẤT còn nói ra bậc trên màn hình, nên câu hai (*hạ chói*) đụng thẳng vào chính thứ vừa được giao thêm
việc — đọc ba câu như ba lượt sửa độc lập là làm dòng VIỆC nhạt đi đúng lượt nó phải nói to hơn.
**VÌ SAO BỎ NHÃN ĐƯỢC MÀ KHÔNG MẤT GÌ** — lý do mạnh hơn *"cho gọn"*: hai bậc ĐÃ nói ra bằng **NGỮ
PHÁP**, ở ngay câu chữ `0192` dựng — bậc VIỆC là MỆNH LỆNH gọi tên việc của người đọc (*"Duyệt bản
mềm — Trưởng bộ phận đã ký"*), bậc TIN là CÂU KỂ (*"Trưởng bộ phận đã ký, hồ sơ sang Kế toán duyệt bản
mềm"*); nhãn chỉ dán tên cho một khác biệt đã có sẵn, và nó ăn mất ~14 ký tự đầu — đúng phần chủ đề
thư điện thoại còn hiện được. Lập luận thứ tự mảnh của `0192` **MẠNH LÊN**: phần biến thiên
(*Phiên bản 4*) tụt lên ký tự đầu tiên. **BẤT BIẾN THAY CHỖ CHO NHÃN, và là cách DUY NHẤT chặng này
hỏng**: `titleFor(e,'VIEC') !== titleFor(e,'TIN')` ở mọi hành động **có chủ bước** — nhãn bảo đảm điều
ấy rẻ tiền, bỏ nhãn là giao lại cho câu chữ. **Ca kiểm mới bắt đúng một chỗ tôi khái quát quá tay**:
bản đầu quét MỌI cặp và đỏ ở `KT_RECEIVE_L2` — đỏ đúng phép so, sai câu hỏi, vì `DANG_CO_HIEU_LUC`
không có chủ bước nên KHÔNG AI ở bậc VIỆC (mặt trái của chính cơ chế `0192`, một câu về HÀNH VI mà tôi
đọc thành câu về TẬP THAM SỐ HỢP LỆ). **BA CHỖ GIỮ LẠI CÓ CHỦ Ý**: hai câu riêng `Sắp quá hạn` (cắt
đuôi *"— cần bạn xử lý"*) và `Dừng xử lý` — chúng không phải nhãn bậc; **đoạn *"chỉ để bạn biết"*
trong thân thư** — **HỘP THƯ KHÔNG CÓ DẢI MÀU NÀO**, nên nó thôi là phần thừa kể từ đây; và `duongDan`
theo bậc. **Bộ kiểm mất phép đo bậc** (5 ca dò `Subject.includes('Cần bạn xử lý')`), tìm lại ở NGUỒN:
`bacCua()` đọc đường dẫn trong thân thư — chính cái boolean tiêu đề đọc. Màu: **CẶP TOKEN RIÊNG**
(`--mau-viec-dai`/`--mau-viec-nen`), không sửa `--mau-canh-bao` (cặp ấy còn tô CHỮ trên nền, cần tương
phản); chỗ chói là **mảng NỀN** trải hết bề ngang dòng nên nền nhạt hẳn còn **dải giữ nguyên độ đậm**.
Ca kiểm **đo trên HSL** (cùng sắc màu < 8°, độ bão hoà thấp hơn) chứ không ghim hex, ở **CẢ BA bảng
màu**. Chấm chuông ĐỎ **đảo lập luận `0192`** — vế thắng: hai hình LOẠI TRỪ NHAU nên không bao giờ
đứng cạnh nhau để so mức khẩn, còn chấm xanh trên nút xanh thương hiệu thì chìm; **chấm từng DÒNG vẫn
XANH** (câu khác: *chưa đọc*, không phải *có việc*). Bảy lượt phá lại, bảy đỏ đúng chỗ — **lượt hai
XANH ở lần đầu**: ca hỏi `startsWith(':')` trong khi mảnh rỗng ra `undefined:`, canh đúng lớp lỗi mà
sai đúng một ký tự của nó; đổi sang `/^\p{Lu}/u` + không chứa `undefined`. **2197/2197 xanh.**

Trước đó **P222** (`0194`): **khối *Yêu cầu cập nhật* hiện cả khi TDV đang sửa, kèm nút *Tự
động cập nhật***. Đo trước khi gõ: **BA cổng độc lập** cùng giấu khối này khỏi hồ sơ sửa được — consumer
chỉ ghi `policy_impact` cho `DA_DONG_BANG`, `byId` chỉ trả `lech` cho `DA_DONG_BANG`, và `lamMoiDong`
**ghi đè âm thầm ở MỖI lượt đọc**. Cổng thứ ba là cổng thật; hai cổng đầu là hệ quả của nó. Yêu cầu
thứ hai chỉ có nghĩa nếu bỏ phép ghi đè ấy (một nút không làm gì nhìn thấy được thì không phải một
nút), nên `0194` **ĐẢO phép làm mới ở đường ĐỌC** của `0029`. **An toàn nhờ một dữ kiện phải kiểm
trước khi quyết**: `lamMoiDong` vẫn chạy ở lượt GỬI DUYỆT kèm chốt `STALE_LINE`, nên bản nháp không
bao giờ vào luồng với số cũ — bất biến của `0029` (*số đọc được = số sẽ đóng băng*) còn nguyên, chỉ
đổi chỗ được bảo đảm. **Phép so dời sang `policies/lech.ts` thành hàm THUẦN `soSanhLech`**, consumer
và đường đọc cùng gọi: chênh lệch của bản nháp KHÔNG đọc được từ `policy_impact` (bảng ấy không có
dòng nào cho hồ sơ sửa được, và cũng không nên có — chênh lệch của nháp đổi theo từng lượt sửa dòng,
consumer chỉ chạy lúc danh mục đổi). Nút gọi **chính `lamMoiDong`** — chỉ dời THỜI ĐIỂM của một việc
vẫn luôn xảy ra, không thêm đường ghi thứ hai; khối tự biến mất vì máy chủ tính lại, **không có bước
ẩn khối nào ở giao diện** (ẩn tay sẽ nói dối ở ca có dòng không áp được). Ba ranh giới: `mustEdit` gác
cả ba vế (nút chỉ hiện khi sửa được là chốt THỨ HAI, không thay phép kiểm) · **không đụng giá bán buôn
và CPBH** · `hong` KHÔNG ném lỗi (khác gửi duyệt — ở đó dòng không kiểm được sắp đi vào văn bản ký).
**LỖI CÓ SẴN từ `0029`, sửa kèm**: `policy_impact` không ai dọn khi DÒNG được làm mới, nên chuỗi
*lệch → trả về → làm mới → gửi lại* đưa hồ sơ về luồng kèm khối cảnh báo nói về chênh lệch **đã sửa
xong**; dọn theo `product_id` ĐÃ ÁP DỤNG, dòng `hong` giữ dấu vết vì nó vẫn đúng. **5 ca cũ phải THAY**
(chúng khẳng định *"mở lại thì thấy số MỚI"* — câu về CƠ CHẾ). Gom kèm một **N+1** ở đường đọc. Ca kiểm
theo yêu cầu *"tất cả các trường hợp"*: **14 nhánh thuần · 21 ca HTTP · 6 ca giao diện**. Sáu lượt phá
lại, sáu đỏ đúng chỗ.

Trước đó **P221** (`0193`): **hộp thoại thêm dòng bày luôn bốn con số** — CPBH tổng · Giá thu về
· Tỷ lệ CK · QĐCK — thay vì phải thêm dòng rồi ra bảng nhìn. Yêu cầu này **đâm thẳng vào `FE-27`**
(*"giao diện KHÔNG TÍNH TOÁN"*, ghi ở đầu `format.ts`), và cách thoát nằm ở chỗ luật ấy sợ **một bản
CÀI ĐẶT thứ hai** của phép làm tròn: hộp thoại gọi **chính `computeLine` + `rate2ToNumeric`** mà
`upsertLine` gọi. Cái giá là `apps/web` có **phụ thuộc workspace đầu tiên** (`@csbh/domain-policy`) —
đo trước: gói 126,2KB / trần 250KB, và gói ấy không phụ thuộc gì (có ca kiểm giữ cả hai điều kiện).
**LỖI CÓ SẴN, và là điều kiện tiên quyết**: hộp thoại bày giá bán Công ty **HÔM NAY** lấy từ danh mục
(`0124`, khi ngày áp dụng còn là thuộc tính của HỒ SƠ), trong khi `0180` đưa ngày xuống TỪNG DÒNG và
máy chủ chụp giá theo ngày ấy — chú thích của chính `threshold-preview` viết ra điều phải tránh và máy
chủ **vẫn trả `companyPrice` theo ngày**, giao diện chỉ vứt nó đi; tỷ lệ CK chia cho con số ấy nên
không sửa thì cả khối mới hiện sai. Nhánh rơi về `dongCu.companyPrice` **gỡ hẳn** — nó che đúng lượt
tra HỎNG, chỗ bày ra con số đã đóng băng trong khi máy chủ sắp ghi con số của ngày mới. **BẢY bản chép
của `(x / 100).toFixed(2)`** gom về `rate2ToNumeric` ở `money.ts`; ca kiểm quét mã nguồn tìm ra bản
thứ bảy ở giao diện (`phanTramTuNguong`), một hàm có docstring *"Đổi ở đúng một chỗ"* — đúng trong
phạm vi gói giao diện, và đó chính là chỗ hở. **Ca đáng giá nhất**: giá 20.000 / thu về 17.531 →
`computeLine` cho **12,35%**, bản viết tay bằng số thực cho **12,34%** (12,345 không biểu diễn được
chính xác); ca quét mã nguồn KHÔNG bắt được lượt phá ấy và đúng ra là không nên — hai chốt, hai lớp
lỗi. **Giá thu về là thứ thêm ngoài yêu cầu, đã nêu**. **KHÔNG làm**: cảnh báo giá thu về âm — bảng
không đánh dấu nó ở đâu cả. Sáu lượt phá lại, sáu đỏ đúng chỗ. **2155/2155 xanh.**

Trước đó **P220** (`0192`): **tiêu đề thông báo nói rõ VIỆC CỦA AI**. Mười bảy tiêu đề cũ đều kể
*ai vừa làm gì*, trong khi cùng một tiêu đề đi tới 2–4 vai trò có việc khác hẳn nhau — *"Kế toán đã
tiếp nhận lần 1"* với Sale Admin là MỆNH LỆNH, với TBP và TDV là một mẩu tin. **BẬC là DẪN XUẤT**:
`vaiTroNguoiDoc === CHU_BUOC[toStatus]` → *Cần bạn xử lý*, còn lại → *Để bạn biết*. Bản đầu có BA bậc
và người dùng chỉ ra bậc ba cũng là tin; họ đúng, và lý do mạnh hơn "gộp cho gọn" — **bốn trạng thái
không có chủ bước trả `undefined`, mà `undefined` không bằng vai trò nào, nên sáu hành động ấy TỰ rơi
về TIN**; bậc ba là một nhánh viết tay dựng lại kết quả phép so đã cho sẵn. Gộp còn làm lằn ranh SLA
SẮC HƠN: *nhắc* là VIỆC, *quá hạn* là TIN — đúng thứ vừa xảy ra (`QUA_HAN_DUYET` là trạng thái kết
thúc từ `0047`, nên tiêu đề cũ đọc như lời giục suốt từ đó). `OWNER_ROLE` của `sla-worker` dời sang
`domain-policy` thành **`CHU_BUOC`**, thêm `YEU_CAU_CHINH_SUA: 'TDV'` — dòng khiến bảng này KHÔNG suy
ra được từ `WAITING` (`0155`: trạng thái ấy có việc mà không có hạn). Chỗ nặng nhất: **`CHINH` co về
đúng chủ bước**, người có tên mà không phải chủ bước chuyển sang lá "để biết" — **không `kind` mới,
không migration**. Ba bẫy: `nhomViec` rỗng là HỢP LỆ (giữ phép kiểm cũ là đẩy sáu hành động vào DLQ);
`0147` siết lại đúng NỬA của nó (Sale Admin vẫn nhận khi `RECIPIENTS` gọi tên — `KT_RECEIVE_L2` và
`TBP_RECALL`); lá TIN **ném thay vì nuốt** khi chưa có lá nào đi (`0037` đứng trên tiền đề vừa mất).
**Cái giá đã đo: 5 lá → 8 lá một vòng duyệt, số thư MỖI NGƯỜI không đổi** (13 lượt). Chuông: **con số
đếm VIỆC, dấu chấm cho tin** — không đảo quyết định 23/08 (*chấm THAY CHO số*) mà trả con số về đúng
câu khách hàng đặt cho nó (*"còn 12 VIỆC chưa xem"*); luật loại trừ nằm trong KIỂU DỮ LIỆU
(`dauChuong` trả `'so'|'cham'|'khong'`), máy chủ trả HAI con số vì nhãn trình đọc màn hình là đường
duy nhất dấu chấm tới được họ. Chip *để biết* **nghỉ** (đánh dấu cái không quan trọng, và tiêu đề đã
tự nói ra bậc), thay bằng dải hổ phách trên cả dòng. **26 đỏ ở lượt chạy đầu, chạy riêng thì xanh
hết**: `flush(n)` trả về sớm nên lá còn trên đường đáp xuống sau lượt dọn của ca kế — khoảng hở CÓ
SẴN, chỉ chưa cắn vì tới `0191` mỗi bước sinh một lá. Sáu lượt phá lại, sáu đỏ đúng chỗ.
**2140/2140 xanh.**

Trước đó **P219** (`0191`): **lập phiên bản mới ngay từ trang hồ sơ**, khỏi vòng qua trang khách
hàng. **KHÔNG có đường máy chủ mới** — gọi đúng `POST /policies` với `mode: NEW_VERSION` mà trang *Lập
hồ sơ* vẫn gọi, nên mọi chốt của `create` (phạm vi TDV · khách ngừng hợp tác · `NO_ACTIVE_POLICY`) giữ
nguyên; một đường thứ hai là một bản sao sẽ trôi. **Nút này KHÔNG thuộc máy trạng thái**:
`allowed-actions` liệt kê bước của MÁY TRẠNG THÁI trên chính hồ sơ này, còn đây là lượt LẬP MỘT HỒ SƠ
KHÁC — `DANG_CO_HIEU_LUC` không đi đâu tới khi bản mới duyệt xong, khai nó thành `Action` là dựng một
bước chuyển không có thật và bắt `RULES` ↔ `ACTION_OF` (`0185`) mang một dòng nói dối. Điều kiện bày
nút có HAI VẾ, cả hai đều cần (hồ sơ đang hiệu lực cũng mở ra với TBP · KT · SA vì họ ở trong bốn cột
người), mỗi vế có ca phá riêng. **THỨ THÊM NGOÀI YÊU CẦU, đã nêu**: `create` không chặn bản thứ hai
khi một bản mới đang dở — hành vi có sẵn, nhưng lối tắt làm nó dễ vấp hơn hẳn vì trang hồ sơ không bày
danh sách hồ sơ của khách. Không chặn (đó là luật nghiệp vụ mới), chỉ NÓI RA: `phienBanSau` +
cảnh báo kèm liên kết trong hộp xác nhận; câu `SELECT` ấy chỉ chạy ở `DANG_CO_HIEU_LUC`. **Bẫy đã
dính**: `db.one` trả `undefined` và `JSON.stringify` XOÁ HẲN khoá ấy — trường biến mất thay vì bằng
rỗng, nên giao diện không phân biệt được *"chưa có bản dở"* với *"máy chủ cũ không biết trường này"*;
chuẩn hoá `?? null` tại chỗ trả về. Bảy lượt phá lại, bảy đỏ đúng chỗ. **2112/2112 xanh.**

Trước đó **P218** (`0190`): **thông báo nói rõ CSBH MỚI hay BẢN THAY THẾ**. Đọc *"khách hàng
mới"* là **khách chưa có CSBH nào** (đã nêu giả định): thứ đổi việc của người duyệt là *hồ sơ này có
thay thế một CSBH đang hiệu lực không* — bản đầu không có gì để đối chiếu, bản thay thế thì duyệt
xong là bản cũ vô hiệu TOÀN BỘ. Phân biệt bằng `version_no`, **không thêm trường nào** (`create` đặt
nó cùng câu lệnh với `supersedes_id` nên hai vế không lệch được). Gửi **CON SỐ**, không phải cờ: *"Phiên
bản 4"* nói hồ sơ đã qua ba lần thay thế. Đặt ở `ctx` của `workflow` nên đi kèm MỌI sự kiện của luồng.
**BẪY `0128` LẦN ĐẦU Ở `notification`**: `notify.service` dựng `MailEvent` bằng cách LIỆT KÊ TỪNG
TRƯỜNG — quên một khoá thì dòng lặng lẽ vắng mặt trong thư, `tsc` im vì trường khai `?`; ba ca gọi
thẳng `bodyFor` đều XANH với đúng cái hỏng ấy, ca bắt được là ca đi HẾT ĐƯỜNG qua Mailpit thật.
**PHÁ LẠI XANH — hai nửa của một đường**: gỡ `versionNo` khỏi `policy` mà cả khối ca kiểm
`notification` vẫn xanh, vì chúng dựng payload BẰNG TAY nên chỉ canh phần ĐỌC VÀ IN. Bịt bằng ba ca
đọc thẳng outbox, ca rộng nhất quét MỌI sự kiện có `recipients` và đòi không cái nào thiếu trường ấy.
Dòng ấy chèn **ngay sau mã hồ sơ** (cụm định danh, không phải cụm trạng thái) và có ca đo VỊ TRÍ;
`splice` chứ không viết cứng, vì `policy.superseded` dùng chung khung thư mà nói về bản CŨ. Chuông
cũng nói, ở dạng NGẮN (`0096` — thư và chuông là hai mặt của một thông báo). **2100/2100 xanh.**

Trước đó **P217** (`0189`): **lý do trả về nói rõ AI và TỪ BƯỚC NÀO**. `last_reason` chỉ giữ
CÂU CHỮ, trong khi hồ sơ đi qua mười bước và có **bốn** hành động kèm lý do (`TBP_RETURN` ·
`TBP_RECALL` · `KT_RETURN_L1` · `KT_RETURN_L2`) ở ba bàn — cùng câu *"thiếu chứng từ"* từ hai bàn là
hai việc phải làm khác nhau, mà người đọc chỉ phân biệt được bằng cách tự mở Nhật ký ra dò.
**DẪN XUẤT, KHÔNG THÊM CỘT** (lối `0180`): ba vế còn thiếu đã nằm trên chính dòng `pol.policy_event`
đã ghi ra câu ấy. **Hai chi tiết quyết định đúng/sai**: lấy dòng cuối **CÓ LÝ DO** chứ không dòng cuối
— sau `RESUBMIT_AFTER_EDIT` (không mang lý do) thì khối rỗng trong khi `lastReason` bên cạnh vẫn còn
chữ, hai chỗ nói hai điều; và `ORDER BY seq` chứ không `at` (cùng transaction thì `at` giống hệt
nhau). Trả về **bước XUẤT PHÁT**, không phải bước hiện tại. **CA KIỂM ĐẦU TIÊN TÌM RA MỘT CHỖ LẶP và
bản sửa NHỎ ĐI vì nó**: nhãn hành động đã nói ra vai trò (*"Kế toán không tiếp nhận lần 1"*), và từ
`0185` mỗi hành động thuộc đúng MỘT vai trò — nên `actor_role` rời khỏi cả `SELECT`, DTO lẫn màn
hình. Cái được: hồ sơ không tra được tên **vẫn trả lời được** câu *"bàn nào trả về"*. Bảy lượt phá
lại, bảy đỏ đúng chỗ. **2090/2090 xanh.**

Trước đó **P216** (`0188`): **màu bốn nhãn trạng thái dòng** — *Đang áp dụng* **XANH**, *Đã
xoá* **XÁM**, *Chỉnh sửa* hổ phách, *Bổ sung* **chàm**. Một hàm ba dòng, và thứ đáng nhớ nằm ngoài
bản sửa. **`0180` KHÔNG SAI — khách hàng đảo TRỤC**: màu ở `0180` trả lời *"chỗ nào đáng soi"*, giờ
nó trả lời *"mặt hàng này đang thế nào"*; và họ đúng ở điểm cả `0180` lẫn `0186` bỏ qua — nhãn trạng
thái SẢN PHẨM trong danh mục đã dùng đúng quy ước ấy từ `0123`, nên hai bảng dùng chung chữ *Đang áp
dụng* mà tô hai màu ngược nhau. Chú thích tại chỗ **giữ lại lập luận cũ**, không xoá: bỏ đi là mời
người sau đề xuất lại bảng màu cũ với đúng lý lẽ ấy. **Vế khách hàng KHÔNG nêu và nó bắt buộc**:
*Đang áp dụng* lấy xanh thì *Bổ sung* phải rời khỏi xanh, nếu không hai trạng thái khác hẳn nhau
trông giống hệt nhau. *Đã xoá* cũng thôi mang màu LỖI — rút một mặt hàng là quyết định bình thường,
không phải sự cố, và đỏ ở đó tranh chỗ với hai cảnh báo thật của cột *Tỷ lệ CK*. **Bốn ca kiểm có
mặt vì một lượt PHÁ LẠI XANH ở `0187`**: hoàn tác cả bảng màu mà cả bộ vẫn xanh — màu bốn nhãn chưa
từng có ai canh. Ca đáng giá nhất canh đúng cái HỆ QUẢ khách hàng không nêu. **2082/2082 xanh.**

> **`0187` ĐÃ REVERT.** P215 làm cả ba yêu cầu của 08/09 — màu nhãn · bảng soạn thẳng · dấu cộng chèn
> dòng — rồi khách hàng cho lùi lại và chỉ giữ vế màu. Commit `2fa0b37` cùng commit revert `3aef6f5`
> **còn trong lịch sử**; muốn lấy lại phần bảng soạn thẳng thì `git revert 3aef6f5` cho phần mã, **và
> phải chạy lại `make migrate`** vì `0118` đã bị gỡ khỏi CSDL bằng tay (phần nghịch chạy trực tiếp,
> không qua migration — 720/720 dòng còn nguyên). Nhật ký P215 giữ lại: nó ghi bốn thứ vẫn đúng dù mã
> đã lùi — vì sao ô trống phải LƯU ĐƯỢC thì câu *"không cho gửi duyệt"* mới có nghĩa, vì sao dấu cộng
> đòi cột `thu_tu`, bẫy `viTri` đếm từ 0 còn `thu_tu` từ 1, và hai lượt phá lại xanh.

Trước đó **P214** (`0186`): **rút một mặt hàng khỏi phiên bản mới** — trạng thái dòng thứ TƯ
*Đã xoá*, và POL-08 bị **đảo hẳn**. Chặng bắt đầu từ một **bế tắc có thật**: mặt hàng bị vô hiệu hoá
trong danh mục làm dòng thừa kế thành `STALE_LINE`, mà câu lỗi của chính nó bảo *"xoá sản phẩm đó rồi
gửi lại"* — và `MISSING_INHERITED_PRODUCT` chặn đúng lượt xoá ấy. Hai chốt cách nhau **53 dòng trong
cùng một hàm**, cấm nhau tuyệt đối, hồ sơ chết hẳn ở *Nháp*. **Bỏ POL-08 một mình là sai**: nó là hệ
quả của ba câu ở `muc 5` (một CSBH hiệu lực · bản mới vô hiệu bản cũ TOÀN BỘ · hiệu lực ở cấp hồ sơ),
nên mặt hàng vắng mặt ở bản mới **không rơi về bản cũ** mà rơi khỏi mọi CSBH — một quyền lợi bị thu
hồi lặng lẽ. Thứ thay nó là **làm cho việc rút nhìn thấy được**: dòng nằm lại, làm mờ, đi hết luồng
duyệt, xoá hẳn ở `DANG_CO_HIEU_LUC`. **`da_xoa` là CỘT trong khi ba trạng thái kia là dẫn xuất** —
nó là một Ý ĐỊNH, không phải một phép so, và không vế thứ hai nào trong CSDL trả lời được nó.
`uq_policy_line_product` **giữ**, nên *thêm lại* khôi phục đúng dòng cũ — đường DUY NHẤT đưa về một
mặt hàng đã vô hiệu hoá. Đọc theo MỤC ĐÍCH một chỗ (đã nêu giả định): điều kiện là **dòng THỪA KẾ**,
không phải chữ *"đang áp dụng"* khách hàng viết — dòng *Chỉnh sửa* cũng đến từ bản trước, và đọc
nghĩa đen biến *sửa rồi mới xoá* thành đường vòng qua chính phép canh này. **Xoá hẳn ở bước có hiệu
lực là bắt buộc**: `create` chép dòng của bản đang hiệu lực, giữ lại là mặt hàng **mọc lại** ở bản
sau mãi mãi. Lọc ở **đúng một cửa** (`internal.controller`) nên bản mềm · hợp đồng · read-model đều
thôi thấy mà không service nào biết cột ấy tồn tại; đường đọc giao diện thì NGƯỢC LẠI. **PHÁ LẠI XANH
là phát hiện của cả chặng**: dựng lại POL-08 **y như cũ** → 10 xanh, vì `NOT EXISTS` vẫn khớp dòng
xoá mềm — **nó đã thành câu lệnh rỗng ngay khi xoá mềm ra đời**; viết đúng cho `0186` (`AND NOT
cur.da_xoa`) thì 3 đỏ. Hai câu đầu của khách hàng **không độc lập**. Ba ca phải THAY chứ không sửa
số, trong đó `0124` quét mã nguồn đỏ **mà không có gì hỏng** → chuyển sang đọc DOM. Bẫy **backtick
trong template literal lần thứ BA**. **2078/2078 xanh.**

Trước đó **P213** (`0185`): **Hoàn duyệt — Trưởng bộ phận rút lại chữ ký của chính mình**, đưa
hồ sơ về *Yêu cầu chỉnh sửa*. Danh sách trừ của khách hàng bỏ sót ba trạng thái, và **mệnh đề mở đầu
trả lời hộ**: *"những CSBH đang trong luồng duyệt"* cắt nốt `HET_HIEU_LUC`, `QUA_HAN_DUYET`, `DA_XOA`
— hai câu ghép lại ra **đúng ba** trạng thái (`CHO_KT_L1` · `SA_DANG_XU_LY` · `CHO_KT_L2`). Chỗ nặng
nhất là **một lỗ hổng phân quyền CÓ SẴN mà tính năng này mở ra**: `Rule` không mang tên hành động,
nên `transition` tra luật bằng `(from, to, by)` — đúng chỉ vì tới `0184` mỗi cặp `(from, to)` có đúng
MỘT hành động. Thêm *Hoàn duyệt* là `CHO_KT_L1` có hai, và đo được `transition({action:
'KT_RETURN_L1', role: 'TBP'})` **đi qua** — TBP làm được hành động của Kế toán, `allowedActionsFor`
bày ra đúng nút ấy. Chữa bằng `action: Action` trên `Rule` (kiểu bắt buộc, `tsc` chỉ ra đủ mười ba
luật cũ), kèm ca đối chiếu **`RULES` ↔ `ACTION_OF` hai chiều** — hai bản mô tả của cùng một máy trạng
thái thì trôi khỏi nhau được, và lượt trôi đầu tiên đã là một lỗ hổng. **Không một dòng nào ở
`workflow.service` phải xử chuyện xoá chữ ký**: `0101` viết luật ấy theo ĐÍCH ĐẾN chứ không theo tên
hành động; `da_qua_tbp` (`0142`) đứng ngoài nhánh xoá và đúng thế — hồ sơ đã từng qua bàn TBP thật.
**`RECIPIENTS` báo cho CẢ BA** (khác `TBP_RETURN` chỉ báo TDV: lúc hoàn duyệt hồ sơ đang nằm trên bàn
Kế toán hoặc Sale Admin), và bảng ấy là `Partial<Record<…>>` với `if (to)` ở chỗ dùng — **thiếu một
dòng thì `tsc` xanh, bước chuyển vẫn đúng, và không lá thư nào được gửi**; chín ca của `0185` bên
`policy.test.ts` xanh hết với đúng cái hỏng ấy, nên có thêm một ca THƯ. **Một phá lại xanh có lý do**:
đổi `hoanDuyet` thành `traLaiTbp` vẫn xanh vì hai khoá cấp cùng `['TBP']` — khoá riêng là quyết định
về **chỗ sửa sau này**, không phải về hành vi hôm nay. **2063/2063 xanh.**

Trước đó **P212** (`0184`): khối *bản mềm và bản cứng của phiên bản trước* mở thêm cho **TDV
trong lúc soạn và lúc sửa**. Đây là **hệ quả tôi đã nêu ra ở `0183` và khách hàng đảo lại** — bản
chốt đầu mở đúng bốn bàn duyệt nên khối tắt khi hồ sơ về tay TDV; họ đúng ở điểm cả hai bỏ qua lúc
chốt: *người đang soạn cần đối chiếu TRƯỚC người đang duyệt*, sửa cho khớp rồi mới gửi thì đỡ một
vòng trả lại. Hằng đổi cả TÊN: `DANG_TRONG_LUONG` → **`CHUA_DUYET_XONG`**, dựng **từ `SUA_DUOC`**
chứ không chép hai chuỗi, và MỘT hằng cho cả điều kiện bày khối lẫn phép nới quyền. Ca `0183` khẳng
định *"hồ sơ Nháp trả null"* nên phải **THAY chứ không sửa số**. **2036/2036 xanh.**

Trước đó **P211** (`0183`): **bản mềm và bản cứng của PHIÊN BẢN TRƯỚC** hiện trên hồ sơ đang
duyệt, chỉ đọc. Chốt chặn có thật làm chặng này không phải một lượt sửa giao diện: quyền đọc tệp tính
theo **bốn cột người của chính hồ sơ chủ tệp** (`0031`), mà `0141` cho mỗi phiên bản chọn người duyệt
riêng — nên đúng những lượt đổi người giữa hai bản, tức đúng lúc cần đối chiếu nhất, khối sẽ đầy thẻ
tệp mà bấm vào cái nào cũng 403. `assertCanRead` giờ có hai mức (`DAY_DU` · `BAN_TRUOC`) lấy trong
**một** lời gọi `policy` vốn đã có; khe siết bằng ba vế: chỉ ĐỌC (`assertCanWrite` đi đường riêng),
chỉ hai loại (`BAN_CSBH`/`SCAN`), và `listFor` **lọc danh sách** chứ không để giao diện tự giấu.
`purpose` phải đi cùng ở **ba** đường đọc — `meta`, `link`, **và `read`**. Component RIÊNG chứ không
thêm khối vào `TepDinhKem`: nó đóng đinh vào `hoSoId` ở sáu chỗ, và gọi nhầm id ở đường `go` là gỡ
mất tệp của bản đã ký. **Phá lại lộ một ca xanh vì lý do sai**: ca *"không gỡ được"* gọi `DELETE
/files/:id` bằng TBP, mà đường ấy chặn ở tầng VAI TRÒ trước khi tới phạm vi — bộ tài khoản mẫu không
dựng nổi người vừa ở mức `BAN_TRUOC` vừa có vai trò ghi, nên ca viết lại hỏi **thẳng hai hàm** qua
container Nest. **2034/2034 xanh.**

Trước đó **P210** (`0182`): dòng *Tên khách hàng* trên văn bản mẫu nối **năm phần** — *người
đại diện – tên pháp nhân – số nhà/phường xã – tỉnh thành phố – MST*. Hai phần thêm vào, và mỗi phần
**đảo lại một quyết định cũ ở đúng chỗ nó hết đúng**: `ten_khach_hang` quay lại tờ giấy (`0171` bỏ nó
vì khi ấy hai cái tên tranh MỘT chỗ; chuỗi năm phần cho cả hai một chỗ riêng, nên cái giá `0171` ghi
ra — *"bản CSBH thôi mang tên pháp nhân"* — biến mất theo), và địa chỉ tách HAI vì cột gộp do trigger
dựng bằng `', '` (`0175`) nên **tách ngược ở dấu phẩy là cắt sai chỗ**. Hai ảnh chụp `kh_so_nha_snap`/
`kh_tinh_thanh_snap` đã có từ `0177` mà **chưa ai đọc tới**; nối chúng ra tới tờ giấy phải qua bốn
mắt xích, và mắt thiếu đúng là `SELECT` liệt kê từng cột của `policy/internal.controller` — bẫy
`0128`/`0144` lần thứ ba. `khachHangCua` map hai ô mà **KHÔNG rơi về đọc sống** (hồ sơ gửi trước
`0177` in ra hai chỗ trống, và đó là câu đúng). Ca `0171` ghim TẬP ô trống nên **không thấy được thứ
tự**; ca mới đọc CHỮ của đoạn văn và đòi vị trí năm ô trống tăng dần. **2025/2025 xanh.**

Trước đó **P209** (`0181`): khối tệp trên trang hồ sơ đổi nhãn ***Bản cứng*** → ***File SCAN
bản cứng***. Một chuỗi, và cả chặng nằm ở câu hỏi **đổi ở đâu**: phần mềm gọi *bản cứng* theo HAI
nghĩa — **vật** (bước *KT duyệt bản cứng*, việc *Sale Admin bàn giao bản cứng*, khối *Bản cứng* của
màn hình Thống kê đếm lượt bàn giao) và **file** (khối tệp). Nhãn mới chỉ đúng ở nghĩa thứ hai, nên
phép đổi dừng ở đúng một hằng cộng câu "khối rỗng" của chính khối ấy. **Lỗi có sẵn tìm ra vì đi ngang
qua**: dòng nhắc của `0160` bảo *"tải bản scan lên ở khối **Tệp đính kèm**"* — một cái tên đã đổi từ
`0054`, tức câu chỉ đường sai suốt hai mươi ba chặng, và ca `0160` xanh vì nó chỉ đòi có chữ *"chưa
có bản scan"*. Ca mới canh **phép đối chiếu**, không canh chuỗi: mọi tên khối câu nhắc nhắc tới phải
là tên một khối thật sự dựng ra trên trang. **2024/2024 xanh.**

Trước đó **P208** (`0180`): **ngày áp dụng chuyển từ HỒ SƠ xuống TỪNG DÒNG sản phẩm**, ba trạng
thái cho mỗi dòng, cột *Tỷ lệ CK cũ*, cột QĐCK bày ngưỡng %, và hai nút *Bổ sung*/*Chỉnh sửa* gộp làm
một. Sáu câu khách hàng gửi cùng lúc, và **bốn chỗ phải hỏi lại trước khi gõ**: `applied_date` không
phải một ô trên màn hình — nó quyết định bảng giá được chụp (`0029`), chặn gửi duyệt (`0171`), in ra
cả năm mẫu `.docx`, và là bộ lọc báo cáo. Khách hàng chốt **gỡ hẳn**, ngược với đề xuất của tôi (giữ
một cột dẫn xuất bằng ngày sớm nhất) — và họ đúng ở điểm phương án kia không có: hồ sơ bốn dòng bốn
ngày thì *"ngày áp dụng của hồ sơ"* là câu **không có câu trả lời đúng**. **Trạng thái dòng và tỷ lệ
CK cũ là DẪN XUẤT, không thêm cột**: cả hai vế đã có sẵn trong CSDL (`supersedes_id` + `product_id`),
và vế bản trước là bất biến — nên phép so cho cùng câu trả lời mãi mãi, mà không phải giữ đồng bộ một
bản sao ở **bốn** đường ghi. Cái được: **sửa nhầm rồi sửa trả lại thì dòng quay về *Đang áp dụng***.
**Hai nút chưa bao giờ làm hai việc** — `mode` chỉ chọn CÂU HỎI, và máy chủ chọn câu ấy bằng cách dò
`input.lines` mà giao diện **luôn gửi rỗng**, nên câu hỏi trên thực tế luôn là *"chỉnh sửa"*. **Ba mẫu
mặc định KHÔNG tự nạp lại** (bộ nạp idempotent tính cả dòng đã vô hiệu — `0165`), nên migration phải
XOÁ ba dòng ấy. **Phá lại chín lượt, lượt XANH là lượt đáng giá nhất**: ca kiểm tập cột đọc `cot_bang`
đã nạp trong CSDL nên nó chỉ đo được ở lượt chạy đầu tiên — chữa bằng cách tách quyết định thành hàm
thuần `cotBangMauMacDinh(kind)`. **Một chẩn đoán sai đã hoàn tác**: `2,9994%` là làm tròn số nguyên
của `w:tcW` (tổng ra 5001), không phải `apDungSan` không hội tụ. **Bộ nạp demo hỏng ở BA chỗ** và
chỗ nguy hiểm nhất *không làm hỏng gì*: gửi `appliedDate` ở cấp hồ sơ thì trường ấy bị bỏ qua, bộ nạp
vẫn in *"199 hồ sơ"*, và ba năm lịch sử chụp bảng giá HÔM NAY — nên có `tests/db/bo-nap-demo.test.ts`
đối chiếu cột SQL thô của bộ nạp với `information_schema`. Nghiệm thu trên chồng demo thật: 713 dòng ·
0 thiếu ngày · **288 *Bổ sung* · 236 *Đang áp dụng* · 189 *Chỉnh sửa***, bản mềm hai mẫu mặc định
HTTP 200 và in đúng cột *Ngày áp dụng*. **2023/2023 xanh.**

Trước đó **P207** (`0179`): **cột nhãn khối *Khách hàng* trên trang hồ sơ đo TỪ NỘI DUNG**, để
*Tên Hộ kinh doanh/Tên Công ty* thôi xuống dòng. Đo trước khi sửa, trên Chromium thật (Gotenberg dựng
riêng **không** có `--chromium-disable-javascript`, nạp CHÍNH `tokens.css` + `app.css` của repo): nhãn
cần **191,6px**, `0177` đặt **11rem = 176px** — nên nó xuống hai dòng ở **MỌI** bề rộng thẻ (640 · 520
· 420 · 320px đều 2 dòng), không riêng màn hình hẹp; `0177` ghi nhầm nguyên nhân là *"khối này cần cột
rộng hơn"*. **Không nới thành 12rem**: `system-ui` là phông của MÁY người dùng (Segoe UI · Roboto ·
DejaVu), nên mọi con số ở đây là một phép **đo hộ trình duyệt**, đúng cho đúng một phông — `auto` để
nó tự đo, cùng lối `0172` bỏ hằng số bề rộng cột bảng sản phẩm. Chỗ tốn công: **`auto` chỉ nói được
*"rộng bằng nhãn dài nhất"* khi CẢ DANH SÁCH dùng chung MỘT lưới** — lưới cũ đặt ở TỪNG HÀNG nên mỗi
hàng tự đo cột của nó và khối thành hình răng cưa; lưới dời lên `dl`, hàng `<div>` mang
`display: contents`. **Ba mảnh ấy là một cơ chế, không phải ba lựa chọn rời**: bỏ mảnh nào thì hai
mảnh kia thành vô nghĩa mà trang vẫn dựng ra được. Kéo theo chú thích của `O` ở **cả hai** chỗ dùng —
chúng khẳng định `<div>` bọc dựng nên hàng, từ nay sai (giữ `<div>` vì bộ kiểm quét
`dt.parentElement`). Khổ điện thoại **giữ 7.5rem và đó là luật NGƯỢC LẠI**: `auto` không bao giờ chịu
xuống dòng nên trên thẻ rộng bằng màn hình nó lấy 192px; ở khổ ấy nhãn hai dòng dễ đọc hơn địa chỉ bị
bẻ vụn. Ca `0177` phải **THAY chứ không sửa số** — nó khẳng định *"lớn hơn 7.5rem"*, một câu về CON
SỐ, mà lượt này bỏ hẳn con số. **2002/2002 xanh.**

Trước đó **P206** (`0178`): **rà soát tài liệu theo triển khai thật**, và ba tệp trôi ba mức
khác hẳn nhau. `impl/docs/` **khớp** (theo kịp `0177` — vì mỗi chặng bắt sửa chúng), lệch đúng một CON
SỐ. `YEU-CAU-NGHIEP-VU-CSBH.md` có **một lệch nặng và nó TỰ MÂU THUẪN**: mục 4 vẫn liệt kê `Từ chối`
là trạng thái hiện hành trong khi Phụ lục B của chính nó viết *"BỎ HẲN"* — `0155` sửa Phụ lục B mà bỏ
sót thân bài, đúng nửa việc luật ở đây đã viết ra để chống. `KIEN-TRUC-CSBH.md` trôi theo **hai cách**:
phần thiết kế ban đầu chưa bao giờ sửa (**Prisma · Playwright + Chromium · BullMQ · docxtemplater ·
Ant Design · Testcontainers · k6 · Lighthouse — không gói nào có trong `package.json`**; cộng cây tổ
chức 12 chỗ, 14 tiêu chí lọc, `sign-file`), và **ngừng theo kịp từ `0129`** (nó CÓ được sửa 51 lần,
dừng ở `0128`). **Cái bẫy giải thích phần đầu nằm ngay ở đầu tệp**: ghi chú *"sinh tự động từ HTML
bằng `python3 tools/html2md.py`, đừng sửa tay"* — **script ấy không tồn tại** và HTML đông cứng ở
07/08; câu ấy chỉ người ta sang một quy trình không chạy được, đúng cái tệp duy nhất đang được đọc.
Chữa bằng cách **nói ra thứ đã đảo** (*"Đảo lựa chọn X của bản thiết kế"* kèm lý do), không xoá lặng
lẽ — bỏ câu hỏi *"sao không dùng Prisma?"* không trả lời là mời người sau đề xuất lại. Một chỗ ở §13
phải viết **ngược hẳn**: bản thiết kế dặn *"KHÔNG dùng chung CSDL"*, thực tế dùng CHUNG một Postgres
và chạy TUẦN TỰ. Chốt chặn `tests/http/tai-lieu.test.ts` đối chiếu **hai vế ở hai thế giới** — văn bản
tiếng Việt vs `STATUSES` và `package.json`; **tài liệu nằm ngoài `impl/`** nên compose phải mount
`../../agents` đọc-chỉ, và phép kiểm tồn tại tệp **ĐỎ chứ không skip** (bài học `0156`). Ba chỗ ca
kiểm tự sai, tìm ra lúc phá lại: quét theo DÒNG cắt đôi câu tiếng Việt (đơn vị đúng là ĐOẠN);
`Chromium` phải **ra khỏi** danh sách cấm vì nó vẫn chạy thật **bên trong Gotenberg**; và một ca
**XANH VÌ LÝ DO SAI** — đổi *"`pg` thuần"* thành *"Prisma 5"* vẫn xanh vì đoạn ấy còn cụm *"Đảo lựa
chọn"*, danh sách phủ định ban đầu có cả `sửa` và `thay`. **2002/2002 xanh.**

Trước đó **P205** (`0177`): **khối *Khách hàng* trên trang hồ sơ — bốn ô thành tám**, và
***"bỏ mục tên"* KHÔNG phải bỏ tên**: câu kế tiếp của cùng yêu cầu đòi *tên hộ kinh doanh/tên công
ty*, đúng dữ liệu ô ấy đang mang — `0175` đã đổi nhãn nó ở biểu mẫu, trang hồ sơ là chỗ còn sót. **Mô
-típ `0171` lần thứ hai.** Bốn trong năm trường đã có ảnh chụp từ `0101`; chỗ tốn công là **`0175` để
lại một nửa việc đóng băng** — nó biến `registered_address` thành cột DẪN XUẤT của
`street_ward`/`province`, mà `0101` đóng băng đúng cột dẫn xuất ấy, nên hệ thống **đóng băng cái bóng
mà không đóng băng cái nguồn**; không ai thấy tới khi màn hình đòi hai ô. Tách ngược chuỗi gộp ở dấu
phẩy cuối **chạy được hôm nay** và hỏng NGẦM ngày trigger đổi dấu ngăn → `0115` thêm
`kh_so_nha_snap`/`kh_tinh_thanh_snap`. **Không backfill** (đọc `cus` là lấy địa chỉ HÔM NAY, tức viết
lại một ảnh chụp), nên chỗ đọc có **BA nhánh** và nhánh ba là nhánh dễ viết sai vì bản sai TRÔNG ĐÚNG:
`?? khach?.streetWard` chỉ lộ ra với khách ĐÃ đổi địa chỉ. Hình dạng một-ô tự hết — `0101` chụp lại cả
khối ở MỖI lượt gửi. **Địa chỉ giao hàng tách ngược ĐƯỢC** (ràng buộc cấm `\n` của `0154`), địa chỉ
đăng ký thì không (`', '` là chuỗi hợp lệ giữa lòng một địa chỉ). Bẫy `0128` lại đúng chỗ cũ:
`province`/`street_ward` thiếu trong `SELECT` liệt kê từng cột của `customer/internal.controller` →
**2 đỏ**. Cột nhãn nới bằng biến trên KHỐI (`0176`), ca kiểm canh **BA vế** — vế thứ ba là *class có
mặt trên `<section>`*, thiếu nó thì hai vế kia thành mã chết. **1998/1998 xanh.**

Trước đó **P204** (`0176`): **nút *Xoá* của hàng địa chỉ tụt xuống 12px** — một dòng CSS, lý do
đáng nhớ hơn bản sửa. `.hang-dia-chi` căn `align-items: end` (chủ ý), `.truong` mang
`margin-bottom: var(--k3)` (cũng chủ ý) — và **flexbox căn theo HỘP CÓ LỀ**, nên nút thẳng mép dưới
của cái LỀ chứ không của ô nhập. Hai luật đều đúng ở chỗ của chúng; đọc CSS không thấy, nhìn thì thấy
ngay. Lỗi có từ `0154`, chỉ lộ ra khi `0175` bỏ nhóm ô địa chỉ đăng ký và còn mỗi *Địa chỉ giao hàng*.
Chữa ở HÀNG chứ không ở `.truong` (toàn cục là dịch mọi ô nhập của cả phần mềm). Ca kiểm đọc thẳng
`app.css` và canh CẢ HAI vế — lề 0 **và** `align-items: end` — vì đổi sang `center` cũng làm vế đầu
xanh mà lệch theo kiểu khác. **1988/1988 xanh.**

Trước đó **P203** (`0175`): **địa chỉ đăng ký thành HAI Ô và chỉ MỘT; mã số thuế BẮT BUỘC và
DUY NHẤT.** Sáu câu một lượt, và hai câu nặng nhất **khoá vào nhau đúng như `0154` đã viết trước**:
`0006` cho trùng MST vì *"một chủ hộ nhiều điểm bán"*, `0154` mở đường thay thế, lượt này thu địa chỉ
ĐĂNG KÝ về một (theo giấy ĐKKD) và đẩy nhiều điểm bán sang địa chỉ GIAO HÀNG — tới đó cấm trùng mới là
siết một đường thừa. `registered_address` **vẫn là cột dẫn xuất, chỉ đổi NGUỒN** (ba lý do của `0154`
còn nguyên); trigger dời sang `BEFORE INSERT/UPDATE` trên `cus.customer`, và `tr_gop_dia_chi` **phải
thôi đụng** cột ấy nếu không mỗi lượt sửa địa chỉ giao hàng ghi đè nó thành rỗng. **Migration DỪNG
LẠI** khi dữ liệu còn trùng MST, in ra danh sách mã khách — hệ thống không chọn hộ được. Chỉ mục là
chỉ mục PHẦN (`status <> 'NGUNG_HOP_TAC'`) và `findByIdNumber` **phải cùng phạm vi**. Tách địa chỉ cũ
thì **để trống chứ không đoán bừa**. Ô hỏi trùng ngay lúc gõ: `@Get('kiem-tra-mst')` **khai trước
`@Get(':id')`**, đợi 400ms, và **trừ chính mình**. **PHÁ LẠI TÌM RA MỘT CA XANH VÌ LÝ DO SAI**: ca
"khách đã ngừng không giữ chỗ MST" gọi đường xoá thật, mà khách chưa có hồ sơ thì `ngungHopTac` **xoá
hẳn dòng** (`0034`) — nên nó xanh dù có lọc trạng thái hay không. **1985/1985 xanh.**

Trước đó **P202** (`0174`): **mẫu hồ sơ ĐẦY ĐỦ bỏ ô *Phó Giám đốc*** — trả lời thẳng cho giả
định `0173` vừa nêu. Lập luận cũ (*"bản đầy đủ mới là tờ đem trình BLĐ ký"*) **suy từ quy trình chứ
không từ tờ giấy khách hàng đưa**; tờ mẫu họ gõ có ô ấy ở bản rút gọn và không có ở bản đầy đủ, và đó
đã là câu trả lời từ đầu — **lần thứ hai trong ba chặng** một suy luận "cho nhất quán" phải nhường lại
cho bản vẽ của họ (xem `0171`). Hai mẫu giờ hai dãy chức danh, ca kiểm khai thành **BẢNG TRA** chứ
không nới thành `toContain`. **Bỏ một `<w:tc>` thì phải bớt một `<w:gridCol>`**: ở `tblLayout=fixed`
trình xem nghe theo LƯỚI (`0135`), nên ba ô chia theo lưới bốn cột là cả khối dồn sang trái mà không
gì đỏ — ca kiểm đối chiếu số `gridCol` với số ô. **BẪY lần thứ HAI trong bốn chặng:** phá lại lượt một
không hề chạy (script ném `re.error`) rồi bộ kiểm in `14 passed` trên file nguyên vẹn — y hệt `0171`,
chỉ khác nguyên nhân. **1981/1981 xanh.**

Trước đó **P201** (`0173`): **khối chữ ký hai mẫu hồ sơ — một dòng bốn ô, không kẻ ô, chừa chỗ
ký tay.** Câu *"bỏ ô kẻ ở phần chữ ký"* **không nằm ở chỗ nó trông như đang nằm**: bảng chữ ký chưa
bao giờ khai `tblBorders`; nó DÍNH vào bảng sản phẩm — `mergeDocx` thay cả đoạn `{{bang_san_pham}}`
bằng một `<w:tbl>`, và **hai `<w:tbl>` liền nhau thì Word gộp làm một**, bảng gộp lấy đường kẻ của
bảng ĐẦU. Bẫy này `0165` đã ghi rồi vẫn cắn ở đúng file `0165` dựng. Chữa bằng **một đoạn văn ngăn
giữa**, không phải tắt thuộc tính — nên ca kiểm đọc KHOẢNG GIỮA hai chỗ, chứ ca chỉ kiểm `nil` sẽ
xanh với đúng tờ giấy đang hỏng. **Bản đầy đủ chưa từng có ô *Phó Giám đốc*** nên câu "chen Kế toán
vào giữa" đọc nghĩa đen chỉ áp được cho bản rút gọn; chọn cho hai mẫu dùng CHUNG một khối chữ ký vì
bản ĐẦY ĐỦ mới là tờ đem trình BLĐ ký ở B8 — đã nêu giả định. Ô ấy không mang ô trống dữ liệu nào nên
**tập 12 khoá của `0171` không đổi**. Khoảng trống ký tay **đo chứ không chọn**: 3×14pt và 4×14pt đều
tràn trang 2, chốt **2 đoạn × 18pt** — lớn nhất còn giữ một trang; giá là bản đầy đủ chứa **ít hơn ~2
dòng sản phẩm** ở trang một. Xoá `templates/mau-ho-so-a4-ngang-{day-du,rut-gon}.docx`: **không script
nào nạp, không ca kiểm nào đọc** — bản sao phải nhớ giữ đồng bộ bằng tay, mà `dong-goi.sh` vẫn gói
chúng đi. **1981/1981 xanh.**

Trước đó **P200** (`0172`): **bốn việc rời nhau trong một lượt phản hồi.** (1) **Bỏ khối *Giấy
tờ hồ sơ*** — và nó rộng hơn một khối bị ẩn: đó là chỗ DUY NHẤT giao diện đính được tệp `HO_SO`, nên
TDV thôi đính giấy tờ vào hồ sơ (đường máy chủ GIỮ, tệp cũ còn nguyên). Bỏ ở `KHOI` chứ không chỉ ở
trang, vì `ChiTietHoSo` là nơi duy nhất dựng component ấy. **`chiKhoi` của `0170` gỡ theo và đó là
khoản ĐƯỢC**: hai khối lại liền nhau → một lượt gọi → `/files` trở lại MỘT lần. Hai chỗ suýt nói sai:
câu cảnh báo lúc gỡ (nhánh "không phải SCAN" giờ là BẢN MỀM, mà gỡ bản mềm **có** chặn bàn giao), và
`NHAN_LOAI` là **mã chết từ `0097`** — hằng cấp mô-đun không ai đọc không làm `tsc` đỏ. (2) **Phóng
to ẢNH** (nút − · % · +, lăn chuột, kéo); **PDF cố ý KHÔNG thêm gì** — trình xem của trình duyệt đã
có, điều khiển nó từ ngoài phải qua `#zoom=` tức nạp lại tài liệu; có ca kiểm ghim ranh giới. **BẪY:**
`onWheel` của React là listener THỤ ĐỘNG nên `preventDefault` vô tác dụng — phải `addEventListener`
tay với `passive:false`; và để `ref.current` làm phụ thuộc `useEffect` là **listener không bao giờ
được gắn** (React so phụ thuộc lúc RENDER, ref gán lúc COMMIT). (3) **Đồng bộ tên cột** hai bảng —
khách hàng tìm ra ba cặp, có **cặp thứ tư** (*Mã SP*/*Mã sản phẩm*) họ không nêu; tên lấy từ tờ mẫu
họ gõ. Hai bảng không gộp được (gói giao diện vs mã service) nên chốt là ca ĐỐI CHIẾU **kèm chiều
ngược**; tên cột dời sang `lib/bang-cot.ts` vì `tests/http/` không bật `jsx`. (4) **Bề rộng cột đo từ
NỘI DUNG**, bỏ hẳn `trongSo` của `0135`: nhu cầu = ô dài nhất, **tiêu đề tính theo TỪ dài nhất** (nó
được xuống dòng giữa hai từ), hai cột chữ có `tran`. `apDungSan` phải LẶP và có lúc bó tay (số cột ×
3% > 100%). Cái mất: hai bản CSBH của hai khách **không còn khớp lưới cột**. **1978/1978 xanh.**

Trước đó **P199** (`0171`): **hai mẫu hồ sơ mặc định bỏ bốn dòng, và HAI CHỐT CHẶN gửi duyệt gỡ
theo**. *"Bỏ người đại diện"* KHÔNG phải bỏ người đại diện: câu kế tiếp bảo dòng *Tên khách hàng* in
chính tên ấy — hai câu nói về cùng một người, ngược chiều nhau, đọc riêng câu đầu là làm sai cả hai.
Khối thông tin còn **bốn dòng**; **bản CSBH thôi mang tên pháp nhân khách hàng** ở bất kỳ đâu (còn mã
khách và MST — khách hàng đã chốt khi được nêu). `NGUON_BAT_BUOC_HO_SO` mất ba mục, phép kiểm lúc lưu
mẫu còn **7/13** của muc 11.1 — và **hai trong ba là thứ chính tôi chèn vào ở `0165`** vì danh sách ấy
đòi, trong khi tờ mẫu họ gõ tay không có; nên **danh sách là thứ phải nhường**. Chỗ đắt nhất nằm ngoài
yêu cầu: `chuc_danh_dai_dien` (`0104`) và `dien_thoai` (`0128`) phải thôi chặn, vì `0134` đã viết ra
luật **trường nào chặn gửi duyệt thì phải in ra ở đâu đó** — giữ chặn mà bỏ khỏi tờ giấy là dựng lại
đúng cái hỏng `0134` sinh ra để chống. Đây là chỗ duy nhất dừng hỏi, khách hàng đáp *"thôi bắt buộc
luôn"*; còn **hai** trường chặn. Hai trường ấy cần **nhóm THỨ NĂM `de-trong`** chứ không chuyển vào
nhóm có sẵn: `dien-sau` khẳng định *"bước nào đó sau này điền"* — một câu **sai sự thật** ở đây, và
`0134`/`0104` đọc bảng ấy để trả lời hai câu hỏi khác nhau. Ca kiểm mới ghim **NỘI DUNG** hai mẫu (đọc
`placeholdersOf` trong zip, `toEqual` 12 khoá) vì hai vế ở hai thế giới — TypeScript và một file nhị
phân. **BẪY, suýt đọc nhầm:** phá lại lượt ba **không hề xảy ra** — `templates/default/` là `root:root`
nên script ném `PermissionError` rồi bộ kiểm chạy trên file NGUYÊN VẸN và in `11 passed`; **một phá lại
mà bản sửa không ghi được trông giống hệt một phá lại xanh**, phải `docker run -u 0`. **1967/1967
xanh.**

Trước đó **P198** (`0170`): ***Bản mềm* và *Bản cứng* xuống cuối trang hồ sơ**, ngay trên
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
- **NGÀY ÁP DỤNG THUỘC VỀ TỪNG DÒNG SẢN PHẨM** (`0180`, gỡ `pol.policy.applied_date`). Cột
  `pol.policy_line.ngay_ap_dung` `NOT NULL`, mặc định *hôm nay theo giờ Việt Nam* đặt ở MÁY CHỦ
  (`ngayVN()` của `@csbh/http-kit` — một hàm, ba đường ghi cộng bộ kiểm). Nó **quyết định bảng giá và
  ngưỡng chụp cho chính dòng ấy**, nên `create` gom dòng theo NGÀY và tra một lô cho mỗi ngày; `PATCH
  .../lines/:lineId` thiếu `ngayApDung` là **GIỮ NGUYÊN** (ngược với `note`, nơi vắng mặt là xoá — cột
  này `NOT NULL`, không có trạng thái rỗng để xoá về). Kéo theo: `PATCH /policies/:id` **gỡ hẳn**, ô
  *Thời gian áp dụng* rời khỏi năm mẫu `.docx` và khỏi `SCALAR` (mục bắt buộc còn **6/13**), phép chặn
  gửi duyệt còn **một** trường, `rpt.policy_row.applied_date` = **MIN của các dòng** dựng ở
  `internal.controller` chứ không lưu thành cột.
- **TRẠNG THÁI DÒNG và TỶ LỆ CK CŨ là DẪN XUẤT** (`0180`) — `SQL_TRANG_THAI_DONG` +
  `SQL_NOI_BAN_TRUOC` ở `policies.service.ts`, dùng CHUNG cho đường đọc giao diện và
  `internal.controller`. So với bản bị thay thế (`supersedes_id` + `product_id`) trên **bốn trường
  TDV nhập**: giá bán buôn · CPBH · ngày áp dụng · ghi chú. **KHÔNG so** `company_price_snap`,
  `threshold_snap`, `discount_rate` — chúng đến từ danh mục và `lamMoiDong` chụp lại ở mỗi lượt đọc,
  nên đưa vào là để danh mục đổi giá một mình cũng làm mọi dòng nhảy sang *Chỉnh sửa*. `IS DISTINCT
  FROM` chứ không `<>` (`note` NULL được). `discountRateTruoc` **chỉ trả về cho dòng *Chỉnh sửa***, và
  luật ấy nằm ở MÁY CHỦ — hai bảng (màn hình, tờ giấy) không được tự suy lại. Phiên bản đầu tiên:
  không có `supersedes_id` nên **mọi dòng là *Bổ sung***.
- **`COT_MAC_DINH` là *đủ mọi cột*, `COT_MAU_MAC_DINH` là tập của BA MẪU phần mềm tự nạp** (`0180`).
  Thêm một cột vào `COT_BANG` là âm thầm thêm nó vào ba tờ giấy ấy, trừ khi nó nằm trong
  `COT_NGUOI_DUYET`. Quyết định ở hàm thuần `cotBangMauMacDinh(kind)` — **không** ở trong vòng lặp
  nạp, vì ở đó chỉ bảng mẫu trong CSDL kiểm được nó, mà bộ nạp idempotent nên bảng ấy chỉ ghi ở lượt
  chạy đầu tiên.
- **Giá và ngưỡng đóng băng vào dòng hồ sơ lúc gửi duyệt**, không bao giờ ghi đè. Danh mục đổi về
  sau thì báo qua khối *Yêu cầu cập nhật* và email, chứ không sửa hồ sơ đang chờ chữ ký.
- **HỒ SƠ SỬA ĐƯỢC KHÔNG TỰ ĐỔI SỐ NỮA** (`0194`, đảo phép làm mới ở đường ĐỌC của `0029`).
  `lamMoiDong` giờ chỉ chạy ở HAI chỗ: nút *Tự động cập nhật* và lượt **gửi duyệt** — nên bản nháp
  vẫn không bao giờ vào luồng với số cũ (`STALE_LINE` giữ nguyên), và đó là lý do phép đảo này an
  toàn. Chênh lệch của hồ sơ sửa được **TÍNH tại chỗ** (`soSanhDong`), KHÔNG đọc `policy_impact`:
  bảng ấy chỉ ghi cho `DA_DONG_BANG`, và chênh lệch của bản nháp đổi theo từng lượt sửa dòng.
  **`soSanhLech` ở `policies/lech.ts` là bản DUY NHẤT của phép so** — consumer và đường đọc cùng gọi;
  chép nó sang chỗ thứ hai là dựng hai câu trả lời cho *"dòng này có lệch không"*. Nút chỉ của **TDV
  đang phụ trách** + hồ sơ **sửa được** (`mustEdit`), **không đụng giá bán buôn và CPBH**, và dòng
  `hong` thì **không ném lỗi** — khác lượt gửi duyệt, nơi nó là lý do chặn. **Làm mới xong thì XOÁ
  dấu vết `policy_impact`** của những dòng đã ghi lại được: thiếu bước này thì chuỗi *lệch → trả về →
  làm mới → gửi lại* bày ra một khối cảnh báo nói về chênh lệch đã sửa xong (lỗi có từ `0029`).
- **Sáu vai trò**: Kế toán L1 và L2 là một người (hai màn hình); TDV và QL là một vai trò.
- **Không có cây phân quyền** (bỏ hẳn `16/08`) — người dùng không quản lý lẫn nhau; mỗi bước, người
  đang cầm hồ sơ tự chọn người xử lý bước sau. Đổi *TDV phụ trách* là quyền của Quản trị hệ thống.
- **MÃ SỐ THUẾ duy nhất, và ĐỊA CHỈ ĐĂNG KÝ chỉ có một** (`0175`, đảo `0006`). Duy nhất **giữa khách
  ĐANG hợp tác** — chỉ mục phần `uq_customer_id_number`, và `findByIdNumber` phải lọc CÙNG điều kiện,
  nếu không thì một bên nói "lập được" rồi bên kia trả `23505` (mà khối `catch` đọc mọi `23505` là
  trùng MÃ KHÁCH). Địa chỉ đăng ký là hai cột `province`/`street_ward` trên `cus.customer`;
  `registered_address` **vẫn dẫn xuất** nhưng nguồn là hai cột ấy, dựng bởi trigger
  `tr_dung_dia_chi_dang_ky` (`BEFORE`, gán vào `NEW`). `cus.customer_address` **chỉ còn `NHAN_HANG`**
  — có ràng buộc `chi_noi_nhan_hang` chặn, và đó là chỗ "nhiều điểm bán" chuyển sang. **Nâng cấp một
  hệ đang chạy có thể DỪNG** ở migration nếu dữ liệu còn trùng MST; `docs/04-TRIEN-KHAI.md` có mục
  riêng. Mọi lượt lập khách hàng trong bộ kiểm phải dùng `mstDuyNhat()` của `tests/http/app.ts`.
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
- **BẬC của một thông báo là DẪN XUẤT, với TỪNG người đọc** (`0192`) —
  `vaiTroNguoiDoc === CHU_BUOC[toStatus]` là VIỆC, còn lại là TIN. **MỘT boolean cấp cho BA chỗ**:
  CÂU CHỮ của tiêu đề (`0195` — mệnh lệnh / lời kể; nhãn *Cần bạn xử lý* · *Để bạn biết* đã GỠ),
  `duongDan` (`/ho-so/:id` hay `.../nhat-ky`), và dải màu trên dòng chuông — không chỗ nào tự suy lại
  được. **Bậc KHÔNG còn viết ra thành chữ ở tiêu đề** (`0195`): trên màn hình đọc bằng MÀU, trong hộp
  thư đọc bằng ngữ pháp cộng đoạn *"chỉ để bạn biết"* của thân thư bậc TIN — **hộp thư không có dải
  màu nào**, nên đoạn ấy thôi là phần thừa, đừng gỡ kèm một lượt dọn câu chữ. Bất biến thay chỗ cho
  nhãn: **hai bậc phải cho HAI tiêu đề khác nhau** ở mọi hành động CÓ CHỦ BƯỚC (trạng thái không có
  chủ bước thì không ai ở bậc VIỆC, nên ở đó câu hỏi không có nghĩa). `MailEvent.chiDeBiet` **gỡ hẳn**: nó mang đúng
  nghĩa ấy nhưng là trường tuỳ chọn, nên quên đặt là lặng lẽ nói với người không có việc rằng họ có
  việc; bậc giờ là tham số BẮT BUỘC của cả ba hàm dựng chữ (`0143`). **`CHINH` = bậc VIỆC** — nghĩa
  của `kind` không đổi, chỉ tập người đủ tư cách đổi, nên không cần cột mới và dòng lịch sử vẫn đọc
  được. Bốn trạng thái không có chủ bước (`DANG_CO_HIEU_LUC`, `HET_HIEU_LUC`, `DA_XOA`,
  `QUA_HAN_DUYET`) làm sáu hành động **tự rơi về TIN** — đừng viết một nhánh `TERMINAL`, phép so đã
  cho sẵn kết quả ấy. Cái giá: **một bước sinh HAI lá thư** khi người nhận trải trên hai bậc (5→8 lá
  một vòng duyệt), nhưng số thư MỖI NGƯỜI không đổi — mọi ca kiểm đếm LÁ phải đếm lại, ca kiểm đếm
  NGƯỜI thì không.
- **`CHU_BUOC` là bảng chung, KHÁC `WAITING` đúng một dòng** (`0192`, ở `domain-policy`) —
  `YEU_CAU_CHINH_SUA → TDV` có việc mà **không có SLA** (`0155`). *Có việc* và *có hạn* là hai câu hỏi
  khác nhau, nên hai bảng khác nhau; `sla-worker` tra bảng này bằng `status` của hàng lấy từ `WAITING`
  nên khoá mới không bao giờ bị tra tới — và có ca kiểm nói thẳng ra điều đó thay vì tin là đúng.
- **Khách hàng và hai cái tên đóng băng lúc gửi duyệt** (`0101`, `0177`) — mười cột `kh_*_snap` cộng
  `nguoi_de_nghi_snap` trên `pol.policy`; `tbp_ky_ten_snap` chụp lúc KÝ. `0177` thêm
  `kh_so_nha_snap`/`kh_tinh_thanh_snap` **bên cạnh** `kh_dia_chi_dang_ky_snap` chứ không thay nó:
  `0175` biến `registered_address` thành cột DẪN XUẤT, nên từ đó `0101` đóng băng CÁI BÓNG mà không
  đóng băng CÁI NGUỒN. Cột gộp GIỮ — `document` in thẳng nó ra giấy; **đừng tách ngược nó** ở dấu phẩy
  cuối, phép ấy chạy được hôm nay và hỏng NGẦM ngày `tr_dung_dia_chi_dang_ky` đổi dấu ngăn. Hồ sơ gửi
  trước `0177` có hai cột mới NULL — **KHÔNG backfill và KHÔNG rơi về đọc sống** (địa chỉ hôm nay
  không phải địa chỉ lúc gửi); màn hình bày MỘT ô *Địa chỉ đăng ký* thay hai ô, và hình dạng ấy tự hết
  vì ảnh chụp làm mới ở mỗi lượt gửi. `kh_noi_nhan_hang_snap` **tách ngược ĐƯỢC** thành danh sách nhờ
  ràng buộc cấm `\n` của `0154` — hai cột gộp trông giống nhau mà chỉ một cái đảo ngược được. Cột rời
  chứ không jsonb, để
  thêm một trường về sau **buộc** phải viết migration, tức buộc phải trả lời "đóng băng hay đọc
  sống?". Vế đọc ở `khachHangCua`/`nguoiCua` (`render.service.ts`), quyết định theo **ảnh chụp có
  mặt hay không**, không theo trạng thái. *Kế toán* và *Sale Admin* KHÔNG đóng băng — câu chúng trả
  lời là "ai đang giữ hồ sơ". **Quay về `YEU_CAU_CHINH_SUA` thì xoá cả ba cột chữ ký** — sửa luôn
  một lỗ hổng `P0` mở từ P5: `tbp_signed_at` không bao giờ được xoá nên hồ sơ bị trả về sau khi ký
  thì `ALREADY_SIGNED` chặn lượt ký lại, và hồ sơ chết ở *Chờ TBP duyệt*.
- **HAI khối tệp trên trang hồ sơ, và BỀ RỘNG CỘT đo từ nội dung** (`0172`). Khối *Giấy tờ hồ sơ*
  (`kind: 'HO_SO'`) bỏ khỏi giao diện — đường máy chủ giữ nguyên, tệp cũ còn nguyên, nhưng **không
  màn hình nào đính hay bày nó nữa**. Bảng sản phẩm: nhãn cột của `apps/web/src/lib/bang-cot.ts` và
  của `document/contracts/bang-san-pham.ts` phải **khớp từng chữ**, canh bằng `tests/http/tieu-de-cot.test.ts`
  (có cả chiều ngược: cột mới ở một bên mà quên bên kia là đỏ). Bề rộng cột **không còn hằng số nào**
  — đo từ ô dài nhất, tiêu đề tính theo TỪ dài nhất, hai cột chữ có `tran`; nên hai hồ sơ khác nhau
  in ra hai lưới cột khác nhau, và đó là điều khách hàng yêu cầu.
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
  bị ép **7/13** (`0171`, trước là 9/13): *thông tin công ty* cố định, *CPBH* do người soạn quyết,
  *trạng thái* và *thời gian duyệt* **còn đang đổi** lúc dựng văn bản, còn *tên khách hàng* với *file
  đính kèm* thì **khách hàng đã bỏ khỏi tờ giấy của họ**. Bỏ ÉP không phải bỏ TRƯỜNG — mọi khoá vẫn
  trong `SCALAR`, và gỡ nhầm chúng ở đó thì ba mẫu bàn giao trả `400 SOURCE_UNKNOWN` lúc lưu.
- **Trường nào CHẶN gửi duyệt thì phải IN RA ở đâu đó** (`0134`, `0171`). Hai vế đi cùng nhau: `0128`
  thêm một trường chặn mà không mẫu nào in nó, và `0171` bỏ hai trường khỏi tờ giấy nên phải bỏ luôn
  phép chặn. Còn **hai** trường chặn — *Mã số thuế* và *Thời gian áp dụng*. `NHOM_TRUONG` vì thế có
  nhóm thứ NĂM `de-trong` (*rỗng lúc gửi là chấp nhận được, không ai chặn*): nhét chúng vào `dien-sau`
  là ghi vào bảng phân loại một câu sai sự thật — không bước nào sau này điền chúng.
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

**Một bảng luật tra bằng thứ KHÔNG phải khoá của nó thì đúng cho tới dòng thứ hai.** `RULES` của máy
trạng thái tra bằng `(from, to, by)` suốt mười ba luật — đúng chỉ vì mỗi cặp `(from, to)` tình cờ có
đúng MỘT hành động. `0185` thêm luật thứ mười bốn và ở `CHO_KT_L1` có hai hành động cùng về
`YEU_CAU_CHINH_SUA`: TBP thực hiện được hành động của Kế toán, và giao diện bày ra đúng nút ấy. Mã
tra luật không đổi một chữ; chỉ bảng dữ liệu dày thêm một dòng. Chốt chặn là **trường `action` bắt
buộc trên `Rule`** cộng ca đối chiếu `RULES` ↔ `ACTION_OF` hai chiều — hai bảng ấy mô tả cùng một máy
trạng thái nên chúng trôi khỏi nhau được.

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
