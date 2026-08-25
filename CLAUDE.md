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

## Trạng thái hiện tại (24/08/2026)

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
chính mã nguồn của nó để ranh giới ấy không trôi. **1688/1688 xanh**, cây làm việc sạch.

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
