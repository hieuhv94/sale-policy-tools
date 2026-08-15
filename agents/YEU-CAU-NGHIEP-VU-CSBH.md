# Yêu cầu nghiệp vụ — Phần mềm Chính sách bán hàng

| | |
|---|---|
| **Đơn vị yêu cầu** | Công ty TNHH Dược phẩm Nutricare |
| **Phiên bản** | 4.2 — hợp nhất sau ba phiên rà soát, bổ sung quy trình tạo tài khoản ngày 07/08 |
| **Ngày** | 07/08/2026 |
| **Nguồn** | `01.08. QUY TRÌNH CSBH.docx` (QT) · `01.08. Yêu cầu nghiệp vụ.docx` (v3.0) · `05.08. Yêu cầu nghiệp vụ.docx` (v3.1) · 42 quyết định chốt trong các phiên 04/08, 05/08, 06/08 và 07/08 |
| **Trạng thái** | Đủ điều kiện khởi công. Không còn câu hỏi nghiệp vụ chờ trả lời; hai hạng mục đã thống nhất hoãn sang giai đoạn 2. |

Tài liệu này là bản hợp nhất, thay thế cho việc đọc song song ba tài liệu trên. Khi có mâu thuẫn,
**bản này có hiệu lực**. Bản rà soát chi tiết kèm biểu đồ và trích dẫn nguồn: `ra-soat-csbh.html`.

---

## 1. Mục tiêu

Số hóa toàn bộ vòng đời Chính sách bán hàng (CSBH): lập, duyệt, ký số nội bộ, xử lý bản cứng,
tiếp nhận kế toán hai lần, phát hành hợp đồng, theo dõi hiệu lực và lưu trữ.

- Mỗi vai trò chỉ nhận hồ sơ khi bước trước đã hoàn thành và đủ dữ liệu.
- Chiết khấu được tính tự động, hạn chế sai giá và sai chính sách.
- Ban lãnh đạo tra được ngay khách hàng nào đang áp dụng chính sách nào, sản phẩm gì, mức chiết khấu bao nhiêu.
- Lưu tập trung, tìm nhanh, giữ toàn bộ lịch sử thao tác.

---

## 2. Vai trò người dùng và phân quyền

### 2.1. Cây phân quyền dữ liệu

Phạm vi hồ sơ mỗi người nhìn thấy **suy ra từ cây tổ chức**, không cấu hình tay từng người.

```
Sale Admin ──┬── Kế toán A ──┬── TDV 1
             │               └── TDV 2
             └── Kế toán B ──┬── TDV 3
                             └── TDV 4

Trưởng bộ phận ──── nhiều TDV        (nhánh duyệt, độc lập với nhánh trên)
Ban lãnh đạo ────── toàn bộ, chỉ đọc
Quản trị hệ thống ─ danh mục và cấu hình, ngoài luồng duyệt
```

- Một Sale Admin phụ trách nhiều kế toán; mỗi kế toán phụ trách nhiều TDV.
- Trưởng bộ phận quản lý nhiều TDV, là nhánh riêng. **Gán thẳng TDV → Trưởng bộ phận**, không qua
  khái niệm "bộ phận" — xem 2.9.
- **TDV và QL là một vai trò duy nhất**, không tách.
- **Kế toán L1 và L2 là một vai trò**, cùng một người xử lý cả hai lần tiếp nhận.

### 2.2. TDV · người đề nghị

| | |
|---|---|
| **Phạm vi** | Chỉ khách hàng và hồ sơ của chính mình |

**Được làm**

- Tạo khách hàng, nhập thông tin và tải hồ sơ pháp lý. Mã khách hàng do kế toán cấp bên ngoài
  phần mềm; hệ thống chỉ chặn tạo mới trùng mã đã có.
- Lập CSBH: chọn khách hàng, chọn sản phẩm từ danh mục, nhập giá bán buôn và CPBH1–4.
- Xem bản CSBH trước khi gửi duyệt; sửa và gửi lại khi bị trả về.
- Khi bổ sung hoặc chỉnh sửa chính sách: đưa lại **toàn bộ** sản phẩm cũ vào hồ sơ mới.

**Không được làm** — sửa danh mục sản phẩm, giá bán Công ty, ngưỡng chiết khấu; sửa hồ sơ sau khi
đã gửi duyệt; xóa hồ sơ đã bị từ chối.

**Nhận email** — khi hồ sơ chuyển bước, bị trả lại, và khi giá sản phẩm thay đổi làm ảnh hưởng
CSBH mình phụ trách.

### 2.3. Trưởng bộ phận

| | |
|---|---|
| **Phạm vi** | Hồ sơ của các TDV thuộc quyền |

- Mở hồ sơ, xem bản CSBH và tài liệu đính kèm.
- **Duyệt và ký số** bằng chữ ký điện tử nội bộ. Sau khi ký, nút đổi trạng thái và không cho ký lặp;
  ô chữ ký hiện họ tên và ngày giờ.
- Không duyệt: bắt buộc nhập lý do, hồ sơ quay về Bước 3.
- Không sửa nội dung hồ sơ, không tham gia các bước sau khi đã ký, **không xuất hợp đồng**.

> **Đã thay bằng gán trực tiếp** (xem 2.9). Bản gốc yêu cầu cấu hình theo bộ phận và có người duyệt
> thay; thực tế nghiệp vụ chỉ nhìn thấy quan hệ "TDV này do ai duyệt", nên một ô chọn Trưởng bộ phận
> ngay trên tài khoản TDV thay cho ba thao tác quản trị. Cơ chế người duyệt thay **chưa làm** — TDV
> chỉ có một Trưởng bộ phận tại một thời điểm, đổi được bất cứ lúc nào.

### 2.4. Kế toán

| | |
|---|---|
| **Phạm vi** | Hồ sơ của các TDV mình phụ trách |

**Tiếp nhận lần 1 (L1)** — xem CSBH đã ký số, mở thông tin khách hàng của hồ sơ để đối chiếu.
Công nợ tự kiểm tra bên ngoài phần mềm. Tiếp nhận thì hồ sơ sang Sale Admin; không tiếp nhận thì
bắt buộc nhập lý do và hồ sơ về Bước 3.

**Xuất hợp đồng** — sau khi tiếp nhận lần 1. **Kế toán và Sale Admin đều xuất được**; ai xuất trước
thì hợp đồng thuộc về người đó, hệ thống ghi rõ người xuất và thời điểm. Trưởng bộ phận vẫn không
xuất được.

**Tiếp nhận lần 2 (L2)** — nhận bản cứng do Sale Admin bàn giao, đối chiếu với những gì đã duyệt ở
lần 1. Tiếp nhận thì CSBH chuyển **Đang có hiệu lực** ngay lúc đó. Không tiếp nhận thì chọn một
trong hai:

1. **Trả về Bước 3** — mặc định, khi lỗi thuộc về dữ liệu hoặc chính sách.
2. **Yêu cầu in lại bản cứng** — hồ sơ về Sale Admin, bản scan trước đó bị xóa khỏi hệ thống.

**Ngoài phần mềm** — cấp mã khách hàng cho TDV.

### 2.5. Sale Admin

| | |
|---|---|
| **Phạm vi** | Toàn bộ hồ sơ của các kế toán mình phụ trách |

- Nhận hồ sơ **sau khi** kế toán tiếp nhận lần 1.
- **Tạo và duy trì mẫu hợp đồng** — soạn sẵn văn bản mẫu, tải lên hệ thống, đặt ánh xạ giữa các ô
  trống trên mẫu với trường dữ liệu trong hồ sơ CSBH và hồ sơ khách hàng. Tại một thời điểm chỉ có
  một mẫu đang dùng.
- **Xuất hợp đồng** — quyền dùng chung với kế toán, cùng điều kiện: chỉ xuất được sau tiếp nhận
  lần 1. Xuất được nhiều lần; hệ thống không lưu lại hợp đồng.
- In bản cứng, trình Ban lãnh đạo ký, nhận lại, scan và tải file lên hệ thống.
- Bấm bàn giao bản cứng để chuyển sang kế toán lần 2.
- Khi kế toán yêu cầu in lại: nhận lại hồ sơ và làm lại bản cứng.
- Không sửa nội dung CSBH, không bỏ qua bước tiếp nhận lần 1.

### 2.6. Ban lãnh đạo

Một người. Toàn quyền đọc, **không có thao tác nào trên hồ sơ**.

- Xem mọi CSBH ở mọi trạng thái, lịch sử duyệt, file đã ký và nhật ký.
- Lọc và xuất Excel theo mọi tiêu chí ở mục 9.2.
- Ký bản cứng là thao tác giấy do Sale Admin trình lên — phần mềm không có bước nào cho việc này.

### 2.7. Quản trị hệ thống

- Nhập và duy trì danh mục sản phẩm và giá, nhóm sản phẩm, chiết khấu quy định, danh mục tra cứu.
  **Mẫu hợp đồng không thuộc vai trò này** — xem mục 2.5. Mẫu hồ sơ CSBH thuộc vai trò này nhưng
  **chưa làm**, và màn hình *Người ký* đã gỡ vì yêu cầu chưa rõ — xem mục 6.4.
- Quản lý tài khoản, vai trò và cây phân quyền ở mục 2.1 — quy trình tạo tài khoản ở mục 2.8.
- Cấu hình SLA, mẫu email; xem nhật ký hệ thống.
- Giai đoạn 2: nhập dữ liệu CSBH cũ từ Excel — chỉ vai trò này được thực hiện.
- Không tham gia luồng duyệt. Mọi thay đổi danh mục vào nhật ký kèm giá trị trước và sau.

### 2.8. Tạo tài khoản và kích hoạt `mới 07/08`

**Người dùng không tự đăng ký.** Không có màn hình đăng ký công khai; tài khoản chỉ ra đời từ thao
tác của Quản trị hệ thống.

| Bước | Người thực hiện | Việc |
|---|---|---|
| A1 | Quản trị hệ thống | Nhập email, họ tên, vai trò, người quản lý. **Không đặt mật khẩu** |
| A2 | Hệ thống | Tạo tài khoản ở trạng thái **Chờ kích hoạt**, sinh liên kết kích hoạt dùng một lần |
| A3 | Hệ thống | Gửi email tới địa chỉ vừa nhập: lời mời, liên kết kích hoạt, hạn dùng |
| A4 | Người dùng | Mở liên kết, đặt mật khẩu → tài khoản **Đang hoạt động**, email được xác nhận |

- **Email là định danh đăng nhập** và là duy nhất trên toàn hệ thống. Trùng email thì báo lỗi, không
  tạo tài khoản thứ hai.
- **KHÔNG CÒN mật khẩu mặc định** `sửa 12/08`. Bản trước cho Quản trị tự đặt một mật khẩu và bàn
  giao tay; đường đó bị bỏ vì mật khẩu đi qua tin nhắn, giấy nhớ hoặc lời nói là mật khẩu người thứ
  ba biết được, và không có cách nào biết nó đã đi tới đâu. Tài khoản mới **không có mật khẩu nào
  dùng được** cho tới khi chủ tài khoản tự đặt qua liên kết trong thư.
- Hệ quả phải chấp nhận: **email hỏng thì không ai vào được**. Không còn đường dự phòng. Bù lại,
  màn hình tạo tài khoản báo ngay khi thư không gửi được, kèm nút *Gửi lại thư mời*.
- **Quên mật khẩu** `mới 12/08` — người dùng tự yêu cầu liên kết đặt lại, gửi vào email đã đăng ký.
  Câu trả lời **giống hệt nhau** dù tài khoản có thật hay không, để đường này không thành máy dò xem
  địa chỉ nào đang có trong hệ thống.
- Đổi mật khẩu bằng đường nào cũng kích hoạt tài khoản. Nhưng **chỉ đi qua liên kết trong email mới
  được tính là đã xác nhận email** — danh sách tài khoản của Quản trị hệ thống hiện rõ cột này, để
  biết địa chỉ nào chưa từng chứng minh là có thật.
- Liên kết kích hoạt **hạn 72 giờ, dùng một lần**. Hết hạn thì Quản trị hệ thống gửi lại; lần gửi lại
  huỷ hiệu lực mọi liên kết cũ của người đó.
- Mật khẩu mới tối thiểu 10 ký tự, có chữ và số.
- Đổi mật khẩu thành công thì **thu hồi toàn bộ phiên đăng nhập đang mở** của người đó.
- Mọi bước ở trên vào nhật ký. Nhật ký ghi ai tạo, tạo lúc nào, gửi lại mấy lần — **không bao giờ ghi
  mật khẩu hay nội dung liên kết kích hoạt**.

### 2.9. Sửa tài khoản đã tạo `mới 12/08`

Bản gốc chỉ mô tả việc TẠO tài khoản. Ba câu hỏi phát sinh khi dùng thật — ai sửa được gì, đổi vai
trò có được không, và người dùng tự làm được đến đâu — trả lời ở đây.

**Quản trị hệ thống**

| Việc | Quy tắc |
|---|---|
| Đổi **vai trò** | Được, nhưng **chặn khi tài khoản còn hồ sơ dở dang**. Báo lỗi kèm danh sách mã hồ sơ |
| Gán **người quản lý** | Được, ở thẻ *Xem* của tài khoản. Cần cho người chưa kích hoạt hoặc đã nghỉ việc |
| Xem thông tin | Thẻ *Xem*: họ tên, tài khoản, email, vai trò, Trưởng bộ phận, người quản lý, trạng thái |
| Sửa **họ tên** | **Không**. Chủ tài khoản tự sửa |
| Đổi **email**, **tên tài khoản** | **Không ai đổi được** qua giao diện |
| Xoá tài khoản | **Không có**. Nhật ký kiểm toán tham chiếu tới người dùng; chỉ vô hiệu hoá |

Vì sao chặn đổi vai trò khi còn hồ sơ dở dang: hộp việc suy ra từ vai trò và cây tổ chức, nên đổi
vai trò giữa chừng là **bỏ rơi** những hồ sơ đang chờ đúng bước của vai trò cũ — không ai khác nhận
được chúng, và chúng đứng im tới khi quá hạn. Đổi vai trò xong, liên kết cây nào không còn hợp lệ
sẽ tự gỡ.

**Người dùng tự sửa** — màn hình *Thông tin của tôi*, vào bằng cách bấm thẻ tên ở thanh trên cùng.

| Trường | Tự sửa được |
|---|---|
| Họ và tên | Có |
| **Người quản lý** (TDV và Kế toán) | Có — chọn từ danh sách người đang giữ vai trò tương ứng |
| Mật khẩu | Có, qua đổi mật khẩu |
| Email · tên tài khoản · vai trò | **Không** |

Hệ quả của việc cho tự đổi người quản lý, **đã cân nhắc và chấp nhận**: định tuyến suy từ liên kết
này, nên hồ sơ đang chờ duyệt **chuyển sang hộp việc của người mới ngay lập tức**, và người quản lý
cũ không còn nhìn thấy dữ liệu của người đó. Màn hình nói thẳng điều này trước khi lưu.

Ba trường không cho tự đổi, mỗi trường một lý do khác nhau: **email** là đường nhận liên kết đặt lại
mật khẩu — tự đổi được nghĩa là ai mượn được máy lúc đang đăng nhập cũng chuyển được đường khôi phục
sang hộp thư của họ; **tên tài khoản** đi vào nhật ký kiểm toán và phải đối chiếu được với chữ ký
trên bản giấy; **vai trò** thì khỏi bàn.

**Trưởng bộ phận quản lý không bắt buộc lúc tạo TDV** `sửa 12/08`. Lúc tạo thường chưa biết ai sẽ
duyệt. Nhưng TDV chưa gán thì **không gửi được hồ sơ** — chặn ở lúc gửi, nơi hồ sơ vẫn là bản nháp
và chưa mất gì, chứ không chặn ở lúc tạo tài khoản. Danh sách tài khoản đánh dấu rõ ai đang thiếu.

---

## 3. Quy trình nghiệp vụ

Luồng **tuần tự**, không có bước nào chạy song song.

| Bước | Người thực hiện | Trạng thái sau bước | Email tới | Nội dung |
|---|---|---|---|---|
| B1 | TDV | Nháp | — | Tạo hồ sơ: khách hàng, sản phẩm, CPBH, ngày áp dụng, file đính kèm |
| B2 | Hệ thống | Nháp | — | Tự tính, đối chiếu danh mục, kiểm tra trùng sản phẩm và CSBH hiện có, cảnh báo lỗi |
| B3 | TDV | Chờ TBP duyệt | TBP | Xem bản CSBH, chốt và gửi duyệt. Hồ sơ khóa sửa |
| B4 | TBP — duyệt | TBP đã ký số | KT, TDV | Duyệt và ký số; file hiện người ký và ngày giờ ký |
| B4B | TBP — không duyệt | Yêu cầu chỉnh sửa → B3 | TDV | Bắt buộc nhập lý do; hồ sơ mở khóa, tạo phiên bản mới |
| B5 | Hệ thống | Chờ Kế toán L1 | — | Phát hành liên kết “CSBH đã ký số” tại bàn kế toán |
| B6A | Kế toán — nhận L1 | Sale Admin đang xử lý | SA, TBP, TDV | Tiếp nhận file mềm; khách hàng đủ điều kiện xuất hàng và xuất VAT |
| B6B | Kế toán — không nhận L1 | Yêu cầu chỉnh sửa → B3 | TBP, TDV | Bắt buộc nhập lý do; duyệt và ký lại từ đầu |
| B7 | Kế toán **hoặc** Sale Admin | — | — | Xuất file hợp đồng (xem mục 8) |
| B8 | Sale Admin | Sale Admin đang xử lý | KT, TBP, TDV | In, trình BLĐ ký, nhận lại, scan, tải file lên |
| B9 | Sale Admin | Chờ Kế toán L2 | KT, TBP, TDV | Bàn giao bản cứng |
| B10A | Kế toán — nhận L2 | **Đang có hiệu lực** | KT, TBP, SA, TDV | Đối chiếu bản cứng với lần 1; CSBH có hiệu lực ngay lúc này |
| B10B | Kế toán — không nhận L2 | Yêu cầu chỉnh sửa → B3 | KT, TBP, SA, TDV | Bắt buộc nhập lý do |
| B10C | Kế toán — yêu cầu in lại | Sale Admin đang xử lý → B8 | SA, TBP, TDV | Bản scan cũ bị xóa; Sale Admin làm lại bản cứng |

**Mọi lần trả lại đều tạo phiên bản mới.** Trả về Bước 3 nghĩa là đi lại toàn bộ vòng duyệt,
kể cả bước ký số của Trưởng bộ phận. File đã ký của phiên bản cũ giữ nguyên trong lịch sử.

---

## 4. Trạng thái hồ sơ

| Trạng thái | Ý nghĩa | SLA |
|---|---|---|
| `Nháp` | Trạng thái đầu tiên, sửa tự do | — |
| `Chờ TBP duyệt` | Đã gửi duyệt, hồ sơ khóa sửa | 14 ngày |
| `TBP đã ký số` | Có file ký và dấu thời gian | — |
| `Chờ Kế toán L1` | Chờ tiếp nhận file mềm | 14 ngày |
| `Sale Admin đang xử lý` | In, trình ký, scan | 14 ngày |
| `Chờ Kế toán L2` | Chờ tiếp nhận bản cứng | 14 ngày |
| `Đang có hiệu lực` | CSBH đang áp dụng, vô thời hạn | — |
| `Hết hiệu lực` | Bị thay bởi một CSBH mới của cùng khách hàng | — |
| `Yêu cầu chỉnh sửa` | Bị trả lại, chờ TDV sửa | — |
| `Từ chối` | Trưởng bộ phận từ chối — **trạng thái kết thúc**, hồ sơ bị bỏ | — |
| `Quá hạn duyệt` | Quá 14 ngày ở một trạng thái chờ | — |

**Quy tắc**

- Mỗi trạng thái có một mã kỹ thuật và một nhãn hiển thị; danh sách trên là danh sách đóng.
- Không dùng các tên cũ: “Bản Demo”, “Đang duyệt”, “Đã chuyển bước sau”, “Đang áp dụng”.
- Hồ sơ ở `Từ chối` **không ai xóa được**, kể cả người tạo — giữ nguyên trong lịch sử và trong
  báo cáo tỷ lệ hồ sơ bị trả lại.
- `Quá hạn duyệt` áp dụng chung cho mọi trạng thái chờ. Bản ghi phải lưu kèm **bước đang chờ**
  để khi người phụ trách xử lý muộn thì hồ sơ đi tiếp đúng nhánh cũ.
- Không có nghiệp vụ **thu hồi**. Muốn thay đổi thì lập CSBH mới.

---

## 5. Hiệu lực và phiên bản

Đây là phần chi phối lược đồ dữ liệu, cần đọc kỹ.

1. **Mỗi khách hàng chỉ có đúng một CSBH còn hiệu lực tại một thời điểm.**
2. **Mọi CSBH đều vô thời hạn.** Không có trường ngày hết hiệu lực, không có cảnh báo sắp hết hạn.
   Một CSBH chỉ hết hiệu lực khi một CSBH mới của cùng khách hàng được duyệt xong.
3. **CSBH có hiệu lực ngay khi kế toán tiếp nhận lần 2**, thời điểm đó cũng là ngày duyệt.
   *Ngày áp dụng* ghi trên CSBH chỉ là thông tin hiển thị, không chi phối trạng thái. Nếu ngày áp
   dụng rơi vào trước lúc duyệt xong thì không cần xử lý gì, vì CSBH cũ vẫn còn hiệu lực tới đúng
   thời điểm bản mới được duyệt.
4. **Phiên bản mới phải chứa lại toàn bộ sản phẩm cũ.** Bổ sung hay chỉnh sửa đều tạo một CSBH mới
   đầy đủ và ký duyệt lại từ đầu; khi bản mới được duyệt thì bản cũ vô hiệu lực toàn bộ. Hiệu lực
   quản lý ở **cấp hồ sơ**, không cần mô hình cấp dòng.
5. **CSBH cũ vẫn giữ hiệu lực trong lúc bản mới chờ duyệt.** Hệ thống lưu quan hệ bản cũ – bản thay
   thế, thời điểm và người thao tác.
6. Mã phiên bản tự sinh theo số lần cập nhật CSBH của khách hàng đó và hiển thị trên bản in.

### 5.1. Kiểm tra khi thêm sản phẩm

- Trùng ngay trong hồ sơ đang lập: không cho tạo dòng trùng, hiện thông báo.
- Khách hàng đã có CSBH nhưng chưa có chính sách cho sản phẩm vừa chọn:
  *“CSBH cho sản phẩm này chưa có. Bạn có muốn BỔ SUNG không?”*
- Khách hàng đã có chính sách cho sản phẩm đó:
  *“CSBH cho sản phẩm này đã có. Bạn có muốn CHỈNH SỬA không?”*

Cả hai trường hợp, nếu chọn Có thì hệ thống dựng hồ sơ mới chứa toàn bộ danh mục sản phẩm hiện
hành của khách hàng, giữ liên kết với CSBH gốc và quay lại quy trình duyệt từ Bước 3.

---

## 6. Danh mục dữ liệu

### 6.1. Khách hàng — do TDV tạo

| Trường | Quy tắc |
|---|---|
| Mã khách hàng | **Khóa định danh.** Kế toán cấp bên ngoài phần mềm; hệ thống chặn trùng khi tạo mới |
| Tên khách hàng / hộ kinh doanh / công ty | Nhập tay, dùng tra cứu và lọc |
| CCCD / Mã số thuế | Kiểm tra định dạng, cảnh báo trùng, dùng lọc |
| Loại khách hàng | Loại 1: HKD của KH · Loại 2: HKD cộng tác · Loại 3: HKD/công ty là điểm bán hoặc cơ sở y tế |
| Địa chỉ đăng ký / Nơi nhận hàng | Cho phép khác nhau; hiển thị đúng trên hợp đồng; dùng lọc |
| Chủ hộ / Người đại diện | Họ tên, chức vụ, thông tin định danh |
| Công nợ | Trường dữ liệu bình thường, hiển thị khi lập CSBH. **Không tích hợp** với hệ thống kế toán |
| **Tỉnh/thành** | Danh mục có mã |
| **Bệnh viện / điểm bán** | Danh mục có mã |
| **Kênh** | Danh mục có mã |
| **TDV phụ trách** | Liên kết tới tài khoản TDV |
| Hồ sơ đính kèm | GPKD, GPP, giấy phép hoạt động, ảnh nhà thuốc, tài liệu khác; bấm tên file để xem |

> Bốn trường in đậm là bổ sung so với v3.1, phục vụ lọc và báo cáo. Việc **kiểm tra tính hợp lệ và
> hạn của hồ sơ pháp lý nằm ngoài hệ thống** — người dùng tự kiểm tra, phần mềm không cấu hình
> giấy tờ bắt buộc và không cảnh báo hết hạn.
>
> Bỏ khái niệm “Tên mã khách”. Muốn tìm khách hàng thì lọc theo Tên khách hàng, Địa chỉ đăng ký
> hoặc Mã số thuế.

### 6.2. Sản phẩm và giá — do Quản trị hệ thống nhập

| Trường | Quy tắc |
|---|---|
| Mã vật tư | Duy nhất, người đề nghị không sửa được |
| Tên vật tư | Chọn từ danh sách xổ xuống |
| Giá bán Công ty | Theo danh mục và ngày hiệu lực. **Chính là giá bán lẻ niêm yết** — và là loại giá **duy nhất** trong danh mục `sửa 15/08` |
| Giá bán buôn | Người đề nghị nhập **trên từng dòng của từng hồ sơ**, KHÔNG có trong danh mục sản phẩm |
| **Nhóm sản phẩm** | Danh mục có mã, dùng cho chiết khấu quy định và báo cáo |
| Trạng thái | Đang áp dụng · Đã vô hiệu hóa — chỉ hai giá trị |
| Lịch sử giá | Đóng băng theo phiên bản khi hồ sơ được gửi duyệt |

### 6.3. Chiết khấu quy định — nguồn kiểm soát ngưỡng

Theo nhóm sản phẩm, loại khách hàng, kênh/khu vực, thời gian hiệu lực và giới hạn.
**Đây là nguồn duy nhất để kiểm tra vượt ngưỡng.** Cột “CSBH loại 1/2/3” trong danh mục sản phẩm
chỉ còn là giá trị mặc định khi không có dòng cấu hình nào khớp.

### 6.4. Giấy tờ mẫu và người ký

| Loại mẫu | Ai quản lý | Tình trạng |
|---|---|---|
| **Mẫu hồ sơ CSBH** | Quản trị hệ thống | **Chưa làm** — bản A4 hiện do hệ thống tự dựng bố cục, xem dưới |
| **Mẫu hợp đồng** | **Sale Admin** | Đã làm. Văn bản riêng, soạn sẵn, có ô trống ánh xạ tới trường dữ liệu — mục 8 |

**Bản CSBH A4 hiện KHÔNG sinh từ mẫu tải lên** `làm rõ 15/08`. Hệ thống tự dựng bố cục trong mã, vì
mục 8.2 chốt 13 mục bắt buộc và bố cục ấy do hệ thống định nghĩa. Cho tải mẫu lên là một hạng mục
riêng chưa làm — và khi làm thì phải trả lời trước một câu: **nếu mẫu do người dùng soạn, hệ thống
không còn bảo đảm được 13 mục kia có mặt.**

**Người ký — đã gỡ khỏi giao diện** `sửa 15/08`. Yêu cầu cho nó chưa đủ rõ: không có mô tả nào nói
người ký dùng ở đâu trong luồng, ai gán cho hồ sơ nào, và đổi người giữ chức thì hồ sơ đã ký chịu
ảnh hưởng gì. API và lược đồ dữ liệu vẫn còn; màn hình nhập liệu thì không, vì một màn hình mà người
dùng điền vào cũng không biết để làm gì thì tệ hơn là không có. **Cần làm rõ yêu cầu rồi mới dựng
lại.**

### 6.5. Màn hình Danh mục `sửa 15/08`

Ba thẻ, không phải năm:

| Thẻ | Ai thấy | Nội dung |
|---|---|---|
| **Sản phẩm** | Mọi vai trò | Bảng sản phẩm có **tìm kiếm theo tên hoặc mã**; Quản trị thêm phần tạo/sửa, đặt giá, nhập Excel, và quản lý **nhóm sản phẩm** |
| **Quy định chiết khấu** | Mọi vai trò | Bảng ngưỡng; Quản trị thêm phần tạo/sửa và quản lý **danh mục tra cứu** (tỉnh · bệnh viện · kênh) |
| **Giấy tờ mẫu** | Chỉ Quản trị | Xem 6.4 |

Nhóm sản phẩm và danh mục tra cứu **không mất chức năng**, chúng thành khối bên trong hai thẻ đầu.
Tìm kiếm **bỏ dấu**: gõ `sua` ra "Sữa" — gõ đủ dấu trên bàn phím điện thoại giữa lúc ngồi với khách
hàng là thứ không ai làm.

---

## 7. Quy tắc tính toán

| Chỉ tiêu | Công thức |
|---|---|
| CPBH1–4 | Nhập tay, **đơn vị Việt Nam đồng** — không có phương án nhập theo tỷ lệ |
| CPBH tổng | Tổng CPBH1 → CPBH4 |
| Giá thu về | `Giá bán buôn − CPBH tổng` |
| Tỷ lệ CK | `(Giá bán Công ty − Giá thu về) / Giá bán Công ty`, tính theo phần trăm |

**Làm tròn** — tiền là số nguyên đồng; tỷ lệ CK làm tròn **hai chữ số thập phân**. Con số hiển thị
và con số dùng để so ngưỡng phải là một: so sánh **sau khi** đã làm tròn.

**Vượt ngưỡng** — cột tỷ lệ hiện đỏ ngay khi nhập. Khi bấm duyệt và gửi, hiện hộp thoại cảnh báo
vượt chiết khấu; người dùng đồng ý thì **vẫn cho gửi**. Đây là cảnh báo mềm, không chặn.

**Khi giá thay đổi**

- Hồ sơ đang lập: hệ thống tự tính lại CPBH tổng, giá thu về, tỷ lệ CK và hiển thị phần dữ liệu
  thay đổi để người dùng kiểm tra trước khi gửi duyệt.
- Hồ sơ đã ký: **không bao giờ ghi đè**. Hệ thống rà các CSBH đang có hiệu lực, xác định hồ sơ bị
  ảnh hưởng và **gửi email cho TDV phụ trách** yêu cầu cập nhật. Việc cập nhật là lập CSBH mới
  theo đúng luồng duyệt.

---

## 8. Hợp đồng

Thuộc **giai đoạn 1**.

### 8.1. Hợp đồng không phải là hồ sơ CSBH

Đây là hai văn bản khác nhau, đừng gộp chung khi dựng dữ liệu:

| | Hồ sơ CSBH | Hợp đồng |
|---|---|---|
| Là gì | Bản ghi nghiệp vụ chạy qua 10 bước duyệt | **Văn bản pháp lý riêng**, soạn theo một mẫu có sẵn |
| Bố cục | Bảng sản phẩm, CPBH, tỷ lệ chiết khấu | Điều khoản hợp đồng, do Sale Admin soạn |
| Sinh ra khi nào | TDV lập ở Bước 1 | Xuất ở Bước 7, sau khi kế toán tiếp nhận lần 1 |
| Vòng đời | Lưu vĩnh viễn, có phiên bản, có lịch sử | **Sinh ra rồi trả về ngay, không lưu trong hệ thống** |
| Trạng thái | 11 trạng thái ở mục 4 | Không có trạng thái — chỉ là một file PDF |

Hợp đồng **lấy dữ liệu từ** hồ sơ CSBH và hồ sơ khách hàng để điền vào ô trống trên mẫu. Nó không
phải một cách in khác của hồ sơ.

### 8.2. Mẫu hợp đồng — do Sale Admin tạo sẵn

- Sale Admin soạn văn bản mẫu bên ngoài, tải lên hệ thống, rồi **ánh xạ** từng ô trống trên mẫu với
  một trường dữ liệu: tên và mã khách hàng, người đại diện, địa chỉ đăng ký, nơi nhận hàng, mã số
  thuế, công nợ, danh sách sản phẩm và giá trong CSBH, mã CSBH, ngày duyệt.
- Hệ thống **cảnh báo trường thiếu** trước khi xuất và cho **xem trước** bản đã trộn.
- Tại một thời điểm chỉ có **một mẫu đang dùng**. Sửa mẫu là thay mẫu đang dùng; file mẫu cũ giữ lại
  để quay lui khi cần, ngoài ra không có ràng buộc phiên bản nào.
- Khi triển khai, hệ thống **có sẵn một mẫu hợp đồng mặc định** để chạy thử ngay, không phải chờ
  Sale Admin soạn mẫu thật.
- Quản trị hệ thống không quản lý mẫu này (xem mục 6.4).

### 8.3. Xuất hợp đồng — thao tác tức thời, không lưu bản ghi

- Xuất được **sau khi kế toán tiếp nhận lần 1**; **người xuất là kế toán hoặc Sale Admin**.
- Bấm nút xuất thì hệ thống lấy dữ liệu **của chính hồ sơ CSBH đang mở** cùng hồ sơ khách hàng của
  nó, trộn vào mẫu đang dùng, đẩy ra một file **PDF** và trả về cho người bấm.
- **Hệ thống không lưu lại hợp đồng.** Không có bảng hợp đồng, không có mã hợp đồng, không có trạng
  thái hợp đồng, không có bản scan hợp đồng. Bản giấy in ra mới là bản lưu.
- Xuất được **nhiều lần**, mỗi lần sinh lại từ dữ liệu tại thời điểm bấm. Hai vai trò cùng bấm thì
  cả hai đều nhận file, không có xung đột.
- **Hệ quả đã chấp nhận:** vì không lưu, hai lần xuất ở hai thời điểm khác nhau có thể ra nội dung
  khác nhau nếu dữ liệu nguồn đã đổi; và hệ thống không trả lời được câu hỏi “hợp đồng nào đã ký”.
  Nếu sau này cần theo dõi việc ký hợp đồng thì phải bổ sung lưu trữ.
- Dấu vết duy nhất giữ lại: **nhật ký ghi ai xuất, lúc nào, cho hồ sơ nào** (mục 10), kèm hai cột
  `ngày xuất hợp đồng` và `người xuất` trên hồ sơ để biết hồ sơ đã xuất hợp đồng hay chưa.

---

## 9. Thông báo, báo cáo và bộ lọc

### 9.1. Thông báo

- **Email** tới đúng người phụ trách ở từng bước theo bảng mục 3.
- Nội dung email tối thiểu: mã khách hàng, tên khách hàng, trạng thái, tên bước đang duyệt, thời
  điểm, lý do trả lại nếu có, và liên kết mở trực tiếp hồ sơ.
- **Gộp một luồng email cho mỗi khách hàng.** Vì mỗi khách hàng chỉ có một CSBH còn hiệu lực nên
  gộp theo khách hàng hay theo CSBH là như nhau.
- **Trang chủ** vẫn hiển thị danh sách CSBH đang chờ chính người đang đăng nhập xử lý.
- SLA: 14 ngày cho mọi trạng thái chờ, **tính cả cuối tuần**. Email nhắc trước một ngày. Quá hạn thì
  hồ sơ chuyển sang trạng thái `Quá hạn duyệt`.

### 9.2. Bộ lọc và báo cáo

Bộ lọc tối thiểu, cho phép kết hợp nhiều điều kiện, xóa bộ lọc, xuất Excel và giữ điều kiện lọc
trong phiên làm việc:

> thời gian áp dụng · thời gian duyệt · mã khách hàng · tên khách hàng · địa chỉ đăng ký ·
> mã số thuế · tên sản phẩm · người đề nghị · trạng thái · TDV phụ trách · tỉnh/thành ·
> bệnh viện hoặc điểm bán · kênh · nhóm sản phẩm

Báo cáo: tiến độ hồ sơ theo trạng thái, bước và người xử lý; nhật ký người dùng theo số lần xem,
ký, tiếp nhận, xuất file và tải tài liệu.

> **Lưu ý khi dựng:** địa chỉ đăng ký là text tự do nên chỉ lọc được kiểu “có chứa”. Muốn lọc theo
> địa bàn thì dùng trường Tỉnh/thành vì đó là danh mục có mã.

---

## 10. Nhật ký, phiên bản và bảo mật

- Lưu người tạo, sửa, xem file, ký số, tiếp nhận, trả lại, xuất hợp đồng, in và tải scan.
- Lưu giá trị **trước và sau** của dữ liệu quan trọng, kèm lý do thay đổi.
- **Nhật ký chỉ ghi thêm** — chặn sửa và xóa ở tầng cơ sở dữ liệu, không chỉ ở ứng dụng.
- Mỗi mốc thời gian là **một cột riêng** trên hồ sơ kèm người thực hiện; báo cáo và SLA truy vấn
  trực tiếp từ các cột này, nhật ký chỉ dùng để truy vết.
- Mỗi lần trả lại, bổ sung sản phẩm, chỉnh sửa sản phẩm hoặc thay đổi giá đều tạo phiên bản mới;
  không ghi đè file đã ký.
- Khi kế toán yêu cầu in lại, **bản scan cũ bị xóa khỏi hệ thống**, không giữ bản sao ảnh. Nhật ký
  vẫn ghi lại việc đã có một bản scan bị hủy: ai hủy, lúc nào, lý do gì.
- Cơ chế ký: **chữ ký điện tử nội bộ**. Không dùng chứng thư số pháp lý.
- Phân quyền theo vai trò, bộ phận và trạng thái hồ sơ; không cho thao tác vượt bước.

---

## 11. Yêu cầu hiển thị file

### 11.1. Bản CSBH

- Bản xem và bản đã ký hỗ trợ đúng khổ A4 ngang và A4 dọc, không co sai tỷ lệ, không cắt nội dung.
- **Phần mềm không có chức năng in.** Chỉ có nút **Tải PDF**; máy chủ sinh file rồi trả về. Muốn có
  bản giấy thì người dùng tự mở file và in bằng máy in của mình — thao tác ngoài phần mềm.
- File PDF tải về phải **khớp đúng bản đang xem** trên màn hình. Nút Đóng luôn hiển thị ở màn hình xem.
- File đã ký hiện chữ ký, họ tên và vai trò người ký, dấu thời gian.
- File sau khi TBP ký lưu thành phiên bản riêng, không ghi đè bản nháp.
- Bấm trực tiếp tên file để mở xem.
- Bảng CSBH xem tối thiểu có: thông tin công ty, người đề nghị, thời gian áp dụng, công nợ, mã và
  tên khách hàng, tên sản phẩm, CPBH, trạng thái, file đính kèm, Trưởng bộ phận, kế toán, thời gian duyệt.

### 11.2. Giao diện trên máy tính và điện thoại

- Toàn bộ giao diện phải **dùng được trên cả máy tính và điện thoại**. Không có màn hình nào chỉ mở
  được trên một loại thiết bị.
- Hai màn hình được tối ưu cho điện thoại trước: **duyệt và ký số của Trưởng bộ phận** và **tra cứu
  của Ban lãnh đạo** — đây là hai vai trò làm việc ngoài bàn giấy nhiều nhất.
- Bảng nhiều cột trên điện thoại chuyển thành thẻ. **Không được ẩn cột dữ liệu tiền**, chỉ được gấp
  lại và bấm để mở.
- Cảnh báo vượt ngưỡng chiết khấu phải nhận ra được **không chỉ bằng màu đỏ** — kèm dấu hiệu và chữ.
- **Logo công ty** xuất hiện trên thanh tiêu đề, trang đăng nhập, bản CSBH in A4, hợp đồng, email
  thông báo và favicon.
- Máy tính và điện thoại dùng **chung một nút Tải PDF** gọi cùng một máy chủ, nên file tải về ở hai
  thiết bị giống hệt nhau. Bố cục A4 trong file luôn cố định theo mục 11.1, không responsive.

> **Cần từ phía Nutricare:** file logo hiện có (`logo.png`) là ảnh gần vuông, **nền trắng đặc**, nên
> chỉ dùng được cho trang đăng nhập và bản in. Cần bổ sung bản **nền trong suốt** và bản **nằm ngang**
> cho thanh tiêu đề; tốt nhất là file gốc SVG để bản in A4 không vỡ hạt.

---

## 12. Giai đoạn 2

| Hạng mục | Ghi chú |
|---|---|
| Nhập dữ liệu CSBH cũ từ Excel | Chỉ Quản trị hệ thống được thực hiện |

Cấu trúc dữ liệu của giai đoạn 1 **phải chấp nhận được** bản ghi thiếu file ký, thiếu người duyệt và
thiếu mốc thời gian — cần cờ nguồn `legacy` và mã lô nhập, báo cáo SLA loại trừ nhóm này. Nếu không
chuẩn bị từ đầu thì giai đoạn 2 sẽ phải đổi lược đồ.

---

## Phụ lục A — Những chỗ cần sửa trong YCNV v3.1

1. Nút xuất hợp đồng đang đặt ở màn hình Trưởng bộ phận — phải chuyển sang **Kế toán và Sale
   Admin** (cập nhật 06/08; trước đó chốt là chỉ Kế toán).
2. Mục 6 vẫn nhắc “thu hồi” — bỏ, vì không còn nghiệp vụ này.
3. Mục 6 vẫn nhắc “file pháp lý bắt buộc” — bỏ, vì việc kiểm tra nằm ngoài hệ thống.
4. Mục 3 gán cứng tên một cá nhân cho vai trò Trưởng bộ phận — chuyển thành cấu hình theo bộ phận.
5. Bộ trạng thái chưa có mục riêng — đưa bảng ở mục 4 tài liệu này vào.
6. Bỏ cách diễn đạt “chuyển file sang trang 2” và khái niệm “Tên mã khách”.
7. Mục 8 mô tả hợp đồng như một cách in khác của hồ sơ — phải tách thành **văn bản riêng có mẫu
   riêng**, và người quản lý mẫu là **Sale Admin**, không phải Quản trị hệ thống (cập nhật 06/08).
8. Mục 8 yêu cầu hợp đồng có **trạng thái riêng và bản scan** — bỏ. Hợp đồng không được lưu trong hệ
   thống; bấm xuất là sinh PDF trả về ngay (cập nhật 06/08).
9. YCNV **không mô tả tài khoản ra đời bằng cách nào** — chỉ nói Quản trị hệ thống “quản lý tài
   khoản”. Bổ sung mục 2.8: tạo tài khoản bằng email, mật khẩu mặc định do quản trị đặt, người dùng
   phải xác nhận qua email và đổi mật khẩu (mới 07/08).

## Phụ lục B — Nhật ký quyết định

42 quyết định chốt trong các phiên 04/08, 05/08, 06/08 và 07/08/2026, nhóm theo chủ đề. Sáu quyết
định của phiên 04/08 đã bị phiên 05/08 thay thế nên không còn trong danh sách — chỉ giữ bản mới nhất.

**Vai trò** — Kế toán L1 và L2 là một · Ban lãnh đạo là một người, chỉ đọc · TDV và QL là một, cây
phân quyền Sale Admin → kế toán → TDV · khách hàng do TDV tự tạo · danh mục sản phẩm, giá và chiết
khấu do Quản trị hệ thống nhập.

**Luồng** — tuần tự, không song song · kế toán từ chối lần 2 có hai lựa chọn · quy tắc bổ sung và
chỉnh sửa CSBH · trả lại bắt buộc nhập lý do · bản scan cũ bị xóa khi yêu cầu in lại.

**Trạng thái** — dùng bộ đã hợp nhất · Từ chối là trạng thái kết thúc · không cho xóa hồ sơ bị từ
chối · “Quá hạn duyệt” là trạng thái riêng · đổi tên “Đang áp dụng” thành “Đang có hiệu lực”.

**Hiệu lực** — có hiệu lực ngay khi kế toán duyệt lần 2 · mọi CSBH vô thời hạn · không có nghiệp vụ
thu hồi · phiên bản mới phải chứa lại toàn bộ sản phẩm cũ.

**Tính toán** — sửa công thức tỷ lệ chiết khấu · giá bán lẻ niêm yết chính là Giá bán Công ty ·
CPBH là số tiền VNĐ · tỷ lệ theo phần trăm làm tròn hai chữ số · ngưỡng lấy từ bảng Chiết khấu quy
định · đóng băng giá khi gửi duyệt, tính lại chỉ khi đang lập · khi bảng giá đổi thì báo cho TDV.

**Dữ liệu** — mốc thời gian là cột riêng · bổ sung các trường phân loại · bỏ khái niệm “Tên mã
khách” · nhật ký chỉ ghi thêm.

**Phạm vi** — công nợ không tích hợp nhưng vẫn là trường dữ liệu · kiểm tra hồ sơ pháp lý nằm ngoài
hệ thống · hợp đồng đưa trở lại giai đoạn 1 · hai hạng mục hoãn sang giai đoạn 2 · **xuất hợp đồng
do kế toán và Sale Admin cùng thực hiện** (06/08, mở rộng quyết định trước đó vốn chỉ giao kế toán).

**Hợp đồng** (06/08) — hợp đồng là **văn bản riêng có mẫu riêng**, không phải một cách in khác của
hồ sơ CSBH · **mẫu hợp đồng do Sale Admin soạn sẵn và tự ánh xạ trường dữ liệu**, chuyển khỏi Quản
trị hệ thống · **xuất hợp đồng là thao tác tức thời sinh ra PDF, hệ thống không lưu lại hợp đồng** —
không bảng, không trạng thái, không bản scan, không phiên bản.

**Tài khoản** (07/08) — **không có đăng ký công khai**, tài khoản chỉ do Quản trị hệ thống tạo bằng
email · hệ thống gửi email mời kèm liên kết kích hoạt hạn 72 giờ, dùng một lần · người dùng phải đặt
mật khẩu mới dùng được hệ thống · chỉ đi qua liên kết trong email mới tính là đã xác nhận email.

**Tài khoản, đợt sửa sau khi dựng** (12/08 – 15/08) — **bỏ mật khẩu mặc định**, không còn đường bàn
giao mật khẩu bằng tay · thêm **quên mật khẩu** tự phục vụ · **bỏ khái niệm "bộ phận"**, TDV gán
thẳng vào một Trưởng bộ phận · Trưởng bộ phận **không bắt buộc lúc tạo**, chặn ở lúc gửi hồ sơ ·
Quản trị **đổi được vai trò** nhưng bị chặn khi còn hồ sơ dở dang · người dùng **tự sửa họ tên và tự
đổi người quản lý** (TDV, Kế toán), không đổi được email · vai trò · tên tài khoản.

**Danh mục** (15/08) — danh mục sản phẩm chỉ còn **một loại giá** là Giá bán Công ty; giá bán buôn
nhập trên từng dòng hồ sơ · màn hình Danh mục còn **ba thẻ**, có tìm kiếm sản phẩm bỏ dấu · **gỡ
màn hình Người ký** vì yêu cầu chưa rõ.

**Khác** — chữ ký điện tử nội bộ · SLA 14 ngày tính cả cuối tuần · một luồng email cho mỗi khách hàng.
