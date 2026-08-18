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

### 2.1. Phạm vi dữ liệu — theo PHÂN CÔNG trên từng hồ sơ `sửa 16/08`

**Người dùng không quản lý lẫn nhau.** Tài khoản chỉ có tên, email và vai trò; không có ô "Trưởng bộ
phận quản lý", không có ô "cấp trên", không có cây tổ chức.

Việc *ai xử lý hồ sơ của ai* là thuộc tính của **hồ sơ**, quyết định tại đúng lúc chuyển tay:

| Bước | Người đang cầm hồ sơ chọn |
|---|---|
| Gửi duyệt (B3) | **Trưởng bộ phận** duyệt · **Kế toán** tiếp nhận |
| Tiếp nhận lần 1 (B6) | **Sale Admin** xử lý |
| Tiếp nhận lần 2 (B10) | *không chọn* — đúng người đã nhận L1 |

Từ đó suy ra phạm vi đọc: **một hồ sơ thuộc phạm vi của tôi khi tên tôi nằm ở một trong bốn ô người
lập / TBP / Kế toán / Sale Admin của chính hồ sơ ấy** — kể cả những bước đã qua, để còn tra lại việc
mình đã làm. Ban lãnh đạo đọc toàn bộ; Quản trị hệ thống đứng ngoài luồng duyệt, không có phạm vi hồ
sơ nào.

> **Vì sao bỏ cây tổ chức.** Cây trả lời câu "ai nhìn thấy dữ liệu của ai" bằng một quan hệ nhân sự
> cố định, và nó trả lời sai ở một chỗ căn bản: cùng một TDV có hồ sơ này cần Trưởng bộ phận A duyệt
> và hồ sơ kia cần Trưởng bộ phận B, mà cây chỉ có một câu trả lời cho cả hai. Cây còn đẻ ra một
> kiểu hỏng im lặng — TDV chưa được gán người duyệt thì hồ sơ gửi đi nằm ở *Chờ TBP duyệt* mà không
> vào hộp việc của ai, đứng im tới lúc quá hạn và không màn hình nào nói vì sao.

**Khách hàng**: TDV phụ trách thấy khách của mình; TBP, Kế toán và Sale Admin thấy khách của những
CSBH đã giao cho họ; Ban lãnh đạo thấy toàn bộ. **Quản trị hệ thống thấy toàn bộ khách hàng** — một
ngoại lệ có chủ ý, vì họ là người **đổi TDV phụ trách** khi một TDV nghỉ việc, mà khách cần chuyển
thường chưa có hồ sơ nào nên không đường nào khác với tới.

- **Đổi TDV phụ trách là quyền của Quản trị hệ thống** `sửa 16/08`, không phải Sale Admin. Yêu cầu
  nghiệp vụ chưa bao giờ cấp quyền ấy cho Sale Admin; căn cứ duy nhất của bản trước là Sale Admin
  đứng ở gốc nhánh cây chứa TDV đó.
- **TDV và QL là một vai trò duy nhất**, không tách.
- **Kế toán L1 và L2 là một vai trò**, cùng một người xử lý cả hai lần tiếp nhận.

### 2.2. TDV · người đề nghị

| | |
|---|---|
| **Phạm vi** | Chỉ khách hàng và hồ sơ của chính mình |

**Được làm**

- Tạo khách hàng, nhập thông tin và tải hồ sơ pháp lý. Mã khách hàng do kế toán cấp bên ngoài
  phần mềm; hệ thống chỉ chặn tạo mới trùng mã đã có.
- Lập CSBH: chọn khách hàng, chọn sản phẩm từ danh mục, nhập giá bán buôn và các khoản chi phí bán
  hàng. **Số khoản CPBH tuỳ từng dòng sản phẩm**, không cố định bốn `sửa 15/08`.
- **Sửa một dòng đã có** `mới 15/08`: đổi giá bán buôn và các khoản chi phí. Sản phẩm của dòng thì
  không đổi được — đổi sản phẩm là xoá dòng này rồi thêm dòng khác.
- Xem bản CSBH trước khi gửi duyệt; sửa và gửi lại khi bị trả về.
- Khi bổ sung hoặc chỉnh sửa chính sách: đưa lại **toàn bộ** sản phẩm cũ vào hồ sơ mới.

**Không được làm** — sửa danh mục sản phẩm, giá bán Công ty, ngưỡng chiết khấu; sửa hồ sơ sau khi
đã gửi duyệt; xóa hồ sơ đã bị từ chối.

**Nhận email** — khi hồ sơ chuyển bước, bị trả lại, và khi giá sản phẩm thay đổi làm ảnh hưởng
CSBH mình phụ trách.

### 2.3. Trưởng bộ phận

| | |
|---|---|
| **Phạm vi** | Những hồ sơ được TDV chọn mình duyệt lúc gửi `sửa 16/08` |

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
| **Phạm vi** | Những hồ sơ được Kế toán giao cho mình ở bước tiếp nhận lần 1 `sửa 16/08` |

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
  **chưa làm**, và *Người ký* đã xoá hẳn — xem mục 6.4.
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
| B5 | Hệ thống | KT duyệt bản mềm | — | Phát hành liên kết “CSBH đã ký số” tại bàn kế toán |
| B6A | Kế toán — nhận L1 | Sale Admin đang xử lý | SA, TBP, TDV | Tiếp nhận file mềm và **chọn Sale Admin xử lý bước sau** `sửa 16/08`; khách hàng đủ điều kiện xuất hàng và xuất VAT |
| B6B | Kế toán — không nhận L1 | Yêu cầu chỉnh sửa → B3 | TBP, TDV | Bắt buộc nhập lý do; duyệt và ký lại từ đầu |
| B7 | Kế toán **hoặc** Sale Admin | — | — | Xuất file hợp đồng (xem mục 8) |
| B8 | Sale Admin | Sale Admin đang xử lý | KT, TBP, TDV | In, trình BLĐ ký, nhận lại, scan, tải file lên |
| B9 | Sale Admin | KT duyệt bản cứng | KT, TBP, TDV | Bàn giao bản cứng |
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
| `KT duyệt bản mềm` | Chờ tiếp nhận file mềm — tên hiển thị đổi `18/08`, trước là *Chờ Kế toán L1* | 14 ngày |
| `Sale Admin đang xử lý` | In, trình ký, scan | 14 ngày |
| `KT duyệt bản cứng` | Chờ tiếp nhận bản cứng — tên hiển thị đổi `18/08`, trước là *Chờ Kế toán L2* | 14 ngày |
| `Đang có hiệu lực` | CSBH đang áp dụng, vô thời hạn | — |
| `Hết hiệu lực` | Bị thay bởi một CSBH mới của cùng khách hàng | — |
| `Yêu cầu chỉnh sửa` | Bị trả lại, chờ TDV sửa | — |
| `Từ chối` | Trưởng bộ phận từ chối — **trạng thái kết thúc**, hồ sơ bị bỏ | — |
| `Quá hạn duyệt` | Quá 14 ngày ở một trạng thái chờ. **Trạng thái kết thúc** `sửa 18/08` — không ai thao tác được nữa, và sau **3 ngày** hệ thống tự chuyển sang `Đã xóa` | — |
| `Đã xóa` | Người lập bỏ hẳn một hồ sơ bị trả lại — **trạng thái kết thúc** | — |

**Quy tắc**

- Mỗi trạng thái có một mã kỹ thuật và một nhãn hiển thị; danh sách trên là danh sách đóng.
- Không dùng các tên cũ: “Bản Demo”, “Đang duyệt”, “Đã chuyển bước sau”, “Đang áp dụng”.
- Hồ sơ ở `Từ chối` **không ai xóa được DÒNG**, kể cả người tạo — giữ nguyên trong lịch sử và trong
  báo cáo tỷ lệ hồ sơ bị trả lại. `sửa 18/08`: TDV đang phụ trách **bỏ được nó khỏi màn hình của
  mình** bằng cách chuyển sang `Đã xóa`, và đó không mâu thuẫn với điều trên — dòng dữ liệu còn
  nguyên, nhật ký dài thêm một dòng, và báo cáo đếm theo **mốc `rejected_at`** chứ không theo trạng
  thái hiện tại nên con số không đổi. Cái mất đi đúng bằng cái người dùng muốn mất: hồ sơ thôi nằm
  trong thẻ đếm *Từ chối* trên trang tổng quan của người lập.
- **TDV xóa được hồ sơ ở ba trạng thái**: `Nháp`, `Yêu cầu chỉnh sửa` (gồm cả ba đường bị trả về:
  TBP yêu cầu chỉnh sửa, Kế toán không tiếp nhận L1, Kế toán không tiếp nhận L2), và `Từ chối`
  (`thêm 18/08`).
  Hai kết cục, hệ thống chọn theo trạng thái chứ không hỏi người dùng:
  - `Nháp` → **xóa hẳn, không ghi lịch sử**. Hồ sơ chưa gửi duyệt thì chưa ai ngoài người lập nhìn
    thấy; ghi một dòng "đã xóa" cho mỗi lần lập nhầm là biến nhật ký thành bãi rác và làm người lập
    ngại mở bản nháp.
  - `Yêu cầu chỉnh sửa` → chuyển `Đã xóa`, **ghi vào lịch sử hồ sơ y như `Từ chối`**. Hồ sơ đã qua
    tay người khác và đã bị trả lại kèm lý do; xóa sạch dấu vết là làm biến mất phần việc của họ.
    Người đã trả hồ sơ lại nhận thư báo.
  Chỉ **TDV đang phụ trách** hồ sơ xóa được, không phải người đã lập ra nó — hai thứ khác nhau sau
  một lần bàn giao. Vai trò khác không xóa được gì, kể cả Quản trị hệ thống.
- Hồ sơ ở `Đã xóa` cũng **không ai xóa được** và không hành động nào đi ra được, giống `Từ chối`.
  Nó không chặn việc xóa khách hàng và không được bàn giao khi một tài khoản bị vô hiệu hóa.
- `Quá hạn duyệt` áp dụng chung cho mọi trạng thái chờ. **Là trạng thái KẾT THÚC** `sửa 18/08`:
  không vai trò nào thao tác được lên hồ sơ nữa, và sau **3 ngày** hệ thống tự chuyển nó sang
  `Đã xóa` — vẫn giữ nguyên toàn bộ nhật ký, y như mọi đường vào `Đã xóa` khác. Muốn tiếp tục thì
  lập một CSBH mới cho khách hàng đó.

  > **Đảo ngược quyết định cũ.** Bản trước chốt rằng bản ghi lưu kèm **bước đang chờ** để "khi người
  > phụ trách xử lý muộn thì hồ sơ đi tiếp đúng nhánh cũ" — tiêu chí `NTF-11`. Từ 18/08 không còn
  > việc xử lý muộn. Bước đang chờ **vẫn lưu**, nhưng để trả lời "hồ sơ chết ở bước nào": nó vào thư
  > báo và vào nhật ký, không còn dùng để định tuyến.

- **Thư nhắc trước 24 giờ chỉ gửi cho người phải thao tác** `sửa 18/08`, không gửi cho mọi người
  liên quan. Đó là một cú huých tới người còn kịp làm gì đó; gửi rộng thì phần lớn người nhận không
  làm gì được với nó và sẽ học cách bỏ qua cả loại thư này. Thư **đã quá hạn** và thư **hệ thống đã
  xóa** thì ngược lại, vẫn gửi rộng: lúc ấy là tin phải báo, không còn là việc phải làm.
- Không có nghiệp vụ **thu hồi**. Muốn thay đổi thì lập CSBH mới.
- **Mỗi lần đổi trạng thái báo cho MỌI người đã tác động lên hồ sơ**, không chỉ người phải xử lý bước
  hiện tại. Hai nhóm nhận hai lá thư khác nhau: người phải xử lý nhận liên kết mở **hồ sơ**, người
  chỉ cần biết nhận liên kết mở **nhật ký hồ sơ**. Không gửi cho người vừa bấm nút, người vừa nhận
  thư chính, và tài khoản đã vô hiệu hoá.
- **Nhật ký của một hồ sơ đọc được ở mọi trạng thái**, kể cả ba trạng thái kết thúc — đó là lúc cần
  nó nhất, vì không còn màn hình nào khác nói chuyện gì đã xảy ra. Phạm vi xem giống hệt phạm vi mở
  hồ sơ.

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

**Sửa một dòng sản phẩm** `mới 15/08` — khi hồ sơ còn ở trạng thái sửa được, người lập đổi được
**giá bán buôn** và **các khoản chi phí** của một dòng đã có, không phải xoá rồi thêm lại.

- **Sản phẩm của dòng không đổi được.** Đổi sản phẩm là xoá dòng này và thêm dòng khác — hai việc có
  ý nghĩa nghiệp vụ khác nhau và để lại vết khác nhau trong nhật ký.
- Giá bán Công ty và ngưỡng chiết khấu **chụp lại theo danh mục tại thời điểm sửa**, đúng như lúc
  thêm dòng. Hồ sơ chưa gửi duyệt thì con số của nó phải là con số hiện hành.

### 5.1. Kiểm tra khi thêm sản phẩm

- Trùng ngay trong hồ sơ đang lập: không cho tạo dòng trùng, hiện thông báo. **Thêm và sửa là hai
  đường riêng** `sửa 15/08` — trùng sản phẩm lúc *thêm* là một nhầm lẫn (người dùng tưởng mình đang
  thêm mặt hàng mới), nên nó bị chặn chứ không âm thầm ghi đè dòng cũ.
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
| Loại khách hàng | Loại 1: HKD của KH · Loại 2: HKD cộng tác · Loại 3: HKD/công ty là điểm bán hoặc cơ sở y tế. **Sửa được sau khi lưu** `sửa 15/08` — xem dưới bảng |
| Địa chỉ đăng ký / Nơi nhận hàng | Cho phép khác nhau; hiển thị đúng trên hợp đồng; dùng lọc |
| Chủ hộ / Người đại diện | Họ tên, chức vụ, thông tin định danh |
| Công nợ | Trường dữ liệu bình thường, hiển thị khi lập CSBH. **Không tích hợp** với hệ thống kế toán |
| **TDV phụ trách** | Liên kết tới tài khoản TDV |
| **Trạng thái** `16/08` | Bình thường · **Đã xoá**. Khách đã xoá biến khỏi ô chọn lúc lập hồ sơ và **không lập CSBH mới được**, nhưng vẫn tra cứu được hồ sơ cũ |
| Hồ sơ đính kèm | GPKD, GPP, giấy phép hoạt động, ảnh nhà thuốc, tài liệu khác; bấm tên file để xem |

> **Ba trường Tỉnh/thành · Bệnh viện–điểm bán · Kênh đã BỎ HẲN** `sửa 16/08`. Chúng từng là danh
> mục có mã, phục vụ lọc và báo cáo, và kênh còn là một chiều của quy định chiết khấu. Nghiệp vụ chốt
> ngưỡng chỉ phụ thuộc **nhóm sản phẩm và loại khách hàng**, nên chiều kênh mất chỗ đứng; hai trường
> còn lại thì cả vòng đời chỉ là gõ vào rồi đọc lại, không dẫn tới quyết định nào. Bỏ cả ba, cùng ba
> danh mục tra cứu, ba tiêu chí lọc và ba cột trong file Excel xuất ra.
>
> Trường **TDV phụ trách** in đậm là bổ sung so với v3.1. Việc **kiểm tra tính hợp lệ và
> hạn của hồ sơ pháp lý nằm ngoài hệ thống** — người dùng tự kiểm tra, phần mềm không cấu hình
> giấy tờ bắt buộc và không cảnh báo hết hạn.
>
> Bỏ khái niệm “Tên mã khách”. Muốn tìm khách hàng thì lọc theo Tên khách hàng, Địa chỉ đăng ký
> hoặc Mã số thuế.

**Loại khách hàng sửa được** `sửa 15/08`. Trước đây khoá lại vì nó quyết định ngưỡng chiết khấu — lý
do ấy không đủ: khách hàng có đổi hạng thật, và cách duy nhất còn lại là lập một khách hàng mới với
mã mới, tức là **cắt đôi lịch sử CSBH của cùng một khách**. Ô nằm trong hộp thoại *Sửa*, và chỉ khi
thật sự đổi giá trị thì một khối cảnh báo mới hiện ra nói rõ hệ quả.

| Hồ sơ | Sau khi đổi loại `sửa 16/08` |
|---|---|
| Nháp · Yêu cầu chỉnh sửa | **Tự nhận ngưỡng mới** ngay lần mở tiếp theo |
| Đã gửi duyệt trở đi | **Giữ nguyên** ngưỡng đã đóng băng; hiện trong box *Yêu cầu cập nhật* |

Bản trước chốt ngược lại — hồ sơ Nháp giữ nguyên ngưỡng cũ, với lý do "một con số tự đổi dưới tay
người đang xem là thứ khó tin". Lý do ấy nghe đúng nhưng dẫn tới điều tệ hơn: người lập đọc một con
số rồi bấm *Gửi duyệt*, và thứ được đóng băng là một con số **khác**. Con số vẫn đổi dưới tay họ,
chỉ là đổi muộn hơn và ở chỗ họ không nhìn thấy. Xem 7.2.

**Loại khách hàng hiển thị ở cả hai màn hình** `sửa 15/08`: cạnh mã trên từng thẻ ở danh sách, và
trong khối thông tin ở màn hình chi tiết. Trước đây không hiện ở đâu cả, nên người lập hồ sơ không
có cách nào biết khách thuộc loại mấy — trong khi chính con số ấy quyết định ngưỡng chiết khấu của
mọi dòng sản phẩm họ sắp nhập.

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

Theo **hai yếu tố** `sửa 16/08` — nhóm sản phẩm và loại khách hàng — cùng ngày bắt đầu hiệu lực.
Kênh/khu vực **không còn là một chiều khớp**: ngưỡng gắn với bản chất hàng hoá và với loại khách
hàng, không gắn với nơi bán.
**Đây là nguồn DUY NHẤT để kiểm tra vượt ngưỡng** — và từ `sửa 15/08` thì đúng nghĩa duy nhất: ba
cột “CSBH loại 1/2/3” trong danh mục sản phẩm **đã bỏ hẳn**. Chúng là một nguồn ngưỡng thứ hai song
song, lại vô hình vì không có màn hình nhập — chỉ vào hệ thống qua nhập Excel và script, rồi âm thầm
thắng ở những sản phẩm chưa khai quy định. Không quy định nào phủ thì dòng sản phẩm **không có ngưỡng
để đối chiếu**, xem 6.3.2.

**Mỗi quy định có một MÃ do Quản trị đặt** `mới 15/08`, không sinh tự động. Mã là khoá định danh:
cột *Id* trên bảng quy định, cột *QĐCK* trên từng dòng hồ sơ, và là thứ gõ vào ô tìm kiếm. Trùng mã
thì hệ thống **từ chối tạo**, tính cả khi chỉ khác hoa thường hoặc thừa khoảng trắng — `CK-01` và
`ck-01` là một mã. Mã **không sửa được** sau khi tạo; đặt nhầm thì xoá dòng rồi khai lại.

**Quy định VÔ THỜI HẠN** `sửa 15/08`. Không còn ngày kết thúc — cùng luật với chính CSBH (muc 5).
Cột *Hiệu lực* trên bảng quy định vì thế chỉ hiện **ngày bắt đầu** `sửa 16/08`: chữ "vô thời hạn"
đứng sau mọi dòng là một luật của cả bảng, không phải dữ liệu phân biệt dòng này với dòng kia, nên
nó được nói đúng một lần ở câu ghi chú đầu bảng.
Một dòng có hiệu lực từ ngày khai cho tới khi bị xoá, hoặc cho tới khi một dòng **cụ thể hơn** khớp
và thắng nó.

Hệ quả cho người dùng: cách “cho một quy định thôi áp dụng từ ngày X” không còn. Muốn dừng thì **xoá
dòng**. Xoá không làm đổi hồ sơ đã lập — mỗi dòng hồ sơ giữ ngưỡng đã chụp lúc lập.

**Sửa được NGÀY BẮT ĐẦU HIỆU LỰC** `mới 16/08`, cùng với ngưỡng. Hai ô phạm vi thì vẫn không —
chúng quyết định thứ tự ưu tiên của cả bảng. Ngày hiệu lực không đổi phạm vi của dòng nào, nó chỉ
đổi thứ tự giữa các dòng **cùng** phạm vi, tức đúng cái cơ chế “khai ngày muộn hơn để đè lên” ở
trên. Trước đây gõ nhầm một ngày nghĩa là xoá dòng rồi khai lại, và giữa hai thao tác ấy mọi hồ sơ
lập ra đều mất ngưỡng. Dời vào đúng ngày của một dòng cùng phạm vi thì hệ thống **từ chối** — hai
dòng như vậy không phân xử được, đúng luật ở 6.3.1.

#### 6.3.1. Một sản phẩm khớp nhiều quy định `bổ sung 15/08`

Chuyện bình thường, không phải lỗi cấu hình: dòng chung cho cả nhóm và dòng riêng cho một loại khách
đều đúng. Hệ thống chọn đúng một dòng, theo thứ tự:

1. **Cụ thể hơn thì thắng.** Trọng số `sửa 16/08`: nhóm sản phẩm **2** · loại khách hàng **1**. Nhóm
   sản phẩm là chiều mạnh hơn vì ngưỡng gắn với bản chất hàng hoá. Hai trọng số này là luỹ thừa của
   hai, nên **hai phạm vi khác nhau không bao giờ hoà điểm**.
2. **Mới hơn thì thắng.** Hai dòng bằng điểm bắt buộc phải trùng phạm vi, và khi đó dòng có ngày hiệu
   lực muộn hơn thắng. Từ khi quy định vô thời hạn, đây là **cách đổi ngưỡng duy nhất**: khai một
   dòng mới cùng phạm vi, ngày muộn hơn — dòng cũ tự bị che.

**Không có tầng thứ ba.** Hai quy định trùng đúng phạm vi *và* đúng ngày hiệu lực **không tồn tại
được**: hệ thống từ chối ngay lúc khai, kèm thông báo chỉ ra hai cách đi tiếp (sửa ngưỡng dòng đang
có, hoặc khai ngày muộn hơn). “Trùng phạm vi” tính cả các ô **để trống**: hai dòng cùng bỏ trống ô
nhóm sản phẩm đều nói “mọi nhóm”, nên chúng trùng nhau.

Lý do chặn thay vì tự phân xử: trước đây hệ thống vẫn chọn được một dòng, nhưng bằng một thứ tự nội
bộ không có nghĩa nghiệp vụ. Người khai hai dòng 15% và 20% không có cách nào biết trước dòng nào ăn,
và màn hình bày cả hai cạnh nhau mà không nói dòng nào đang có hiệu lực.

#### 6.3.2. Khi không quy định nào khớp `bổ sung 15/08`

Hồ sơ **vẫn lập được**, và dòng ấy đơn giản **không có ngưỡng nào để đối chiếu** — mọi con số khác
vẫn đủ, và nó không bao giờ bị đánh dấu vượt ngưỡng. Người lập được báo ngay lúc chọn sản phẩm,
trước khi nhập giá:

> ◆ **Chưa có quy định chiết khấu cho sản phẩm này.** Không quy định nào phủ nó với loại khách hàng
> của khách hàng này, nên dòng này sẽ **không có ngưỡng nào để đối chiếu** — cột Tỷ lệ CK vẫn
> tính, chỉ là không đánh dấu vượt ngưỡng được. Vẫn lập hồ sơ được; báo Quản trị hệ thống nếu cần một
> ngưỡng cho sản phẩm này.

Báo trước chứ không báo sau vì ngưỡng **đóng băng vào dòng hồ sơ ngay khi lưu**; biết sau thì phải
xoá dòng, nhờ Quản trị khai quy định, rồi nhập lại từ đầu.

> Bản trước **chặn** tình huống này `sửa 15/08`. Cái chặn ấy sai: ngưỡng chỉ để cảnh báo — vượt ngưỡng
> còn không chặn gửi duyệt — nên thiếu ngưỡng không thể là lý do từ chối. Nó còn đẩy người lập vào ngõ
> cụt, vì TDV không có quyền khai quy định chiết khấu.

Dòng đã lập trong tình huống này mang **con số Tỷ lệ CK màu vàng**, để người duyệt biết con số ngưỡng
ấy không đến từ chính sách chiết khấu đã ban hành. Dòng vừa vượt ngưỡng vừa thiếu quy định thì con số
là **đỏ** — vượt ngưỡng là thứ phải xử lý — và dấu `?` nói **cả hai** lý do.

> **Màu chỉ nằm trên con số tỷ lệ, không phủ cả dòng** `sửa 16/08`. Bản trước tô nền cả dòng. Nền ấy
> phủ lên Giá bán Công ty và các khoản CPBH — những con số hoàn toàn bình thường — trong khi thứ duy
> nhất đáng ngờ là tỷ lệ chiết khấu, và nó còn làm mọi ô trên dòng khó đọc hơn đúng lúc người duyệt
> cần đọc chúng kỹ nhất.
>
> Cạnh con số có thêm một **dấu `?` nhỏ**: rê chuột hoặc bấm vào để đọc lý do đầy đủ — vượt ngưỡng
> bao nhiêu so với ngưỡng nào, hay không tìm thấy quy định chiết khấu nào áp dụng. Là **nút** chứ
> không phải chữ có `title`, vì `title` chỉ hiện khi có chuột: trên điện thoại và với người dùng bàn
> phím, một dấu hỏi không bao giờ trả lời được là một dấu hỏi hỏng.
>
> **Dấu `?` là ký hiệu duy nhất trong ô** `sửa 16/08`. Dấu chấm than `!` trước con số và hình thoi
> `◆` sau nó đã bỏ: hai ký hiệu chen vào giữa một cột số làm con số hết thẳng hàng, mà trong bảng
> tiền thì thế thẳng hàng của cột số chính là thứ giúp dò nhanh. Luật "không bao giờ chỉ dùng màu"
> vẫn giữ — dấu `?` hiện đúng ở dòng có màu và biến mất ở dòng thường, nên nó vừa là lời giải thích
> vừa là dấu hiệu không phải màu.
>
> **Khối chú thích màu dưới bảng cũng bỏ** `sửa 16/08`. Nó chiếm bốn dòng chữ dưới mọi hồ sơ, kể cả
> hồ sơ không có dòng nào mang màu, và trên điện thoại thì đẩy nút thao tác xuống dưới màn hình. Lời
> giải thích không mất — nó nằm trong dấu `?`, tức là đúng chỗ người dùng đang nhìn khi thắc mắc.

#### 6.3.3. Truy vết: cột QĐCK và cột Id `bổ sung 15/08`

Mỗi dòng hồ sơ ghi lại **đúng quy định nào** đã cho ra ngưỡng của nó, và mã ấy hiện thành cột
**QĐCK** trong bảng dòng sản phẩm — ô trống khi không có quy định nào. Bảng *Quy định chiết khấu*
có cột **Id** mang cùng mã đó, và **ô tìm kiếm khớp cả mã**: chép mã từ hồ sơ, dán vào ô tìm, ra
thẳng dòng quy định cần xem. Xoá quy định không xoá dấu vết ấy trong hồ sơ đã lập.

Cột **“Độ cụ thể”** đã **gỡ khỏi bảng** quy định. Nó là con số nội bộ để xếp thứ tự, và bày ra thì
người đọc phải tự học luật trọng số mới hiểu — trong khi cột *Áp dụng cho* ngay bên cạnh đã
nói rõ dòng nào hẹp hơn dòng nào.

### 6.4. Giấy tờ mẫu và người ký

| Loại mẫu | Ai quản lý | Tình trạng |
|---|---|---|
| **Mẫu hồ sơ CSBH** | Quản trị hệ thống | **Chưa làm** — bản A4 hiện do hệ thống tự dựng bố cục, xem dưới |
| **Mẫu hợp đồng** | **Sale Admin** | Đã làm. Văn bản riêng, soạn sẵn, có ô trống ánh xạ tới trường dữ liệu — mục 8 |

**Bản CSBH A4 hiện KHÔNG sinh từ mẫu tải lên** `làm rõ 15/08`. Hệ thống tự dựng bố cục trong mã, vì
mục 8.2 chốt 13 mục bắt buộc và bố cục ấy do hệ thống định nghĩa. Cho tải mẫu lên là một hạng mục
riêng chưa làm — và khi làm thì phải trả lời trước một câu: **nếu mẫu do người dùng soạn, hệ thống
không còn bảo đảm được 13 mục kia có mặt.**

**Người ký — ĐÃ XOÁ HẲN** `sửa 16/08`. Bản trước gỡ màn hình nhập liệu (15/08) nhưng giữ lược đồ và
API, chờ làm rõ yêu cầu. Trạng thái nửa vời ấy có hệ quả thật: **không màn hình nào tạo được người
ký**, nên ba ô trộn `{{signer.name}}` · `{{signer.title}}` · `{{signer.unit}}` của mẫu hợp đồng luôn
rỗng — và nếu Sale Admin đánh dấu chúng là bắt buộc thì xuất hợp đồng trả 422 mà không ai sửa được.

Chốt: **hợp đồng không cần in tên người ký của Công ty.** Xoá bảng `cat.signer`, toàn bộ API, ba ô
trộn và các ca kiểm thử. Ba chỗ ký trên hợp đồng vẫn còn — chúng là **chỗ trống để ký tay trên
giấy**, và vốn dĩ luôn là như vậy: phần mềm không có bước nào cho việc Ban lãnh đạo ký bản cứng
(muc 2.6).

### 6.5. Ba mục menu thay cho "Danh mục" `sửa 15/08`

"Danh mục" không còn là một mục menu. Ba mục ngang hàng:

| Mục menu | Ai thấy | Nội dung |
|---|---|---|
| **Sản phẩm** | Mọi vai trò | Bảng sản phẩm có **tìm kiếm theo tên hoặc mã**. Quản trị thấy hai thẻ: *Sản phẩm* và *Nhóm sản phẩm* |
| **Chiết khấu** | Mọi vai trò | Bảng ngưỡng theo nhóm sản phẩm × loại khách hàng; Quản trị thêm phần tạo/sửa |
| **Giấy tờ mẫu** | Chỉ Quản trị | Xem 6.4 |

Vì sao bỏ dải thẻ "Danh mục": nó là **một tầng điều hướng thứ hai nằm trong tầng thứ nhất** — bấm
"Danh mục" rồi vẫn phải bấm tiếp mới tới thứ mình cần, và thanh bên không cho biết mình đang đứng ở
đâu.

Nhóm sản phẩm và danh mục tra cứu **không mất chức năng**: nhóm sản phẩm là thẻ thứ hai trong màn
hình Sản phẩm, danh mục tra cứu là khối trong màn hình Chiết khấu. Cả hai đều **chỉ Quản trị thấy**.

Tìm kiếm **bỏ dấu**: gõ `sua` ra "Sữa" — gõ đủ dấu trên bàn phím điện thoại giữa lúc ngồi với khách
hàng là thứ không ai làm.

### 6.6. Nhập số tiền và tỷ lệ `mới 15/08`

- Mọi ô nhập tiền ghi rõ **đơn vị ngay trên ô** ("Tiền tệ đơn vị đồng"), và hiện **dấu phân nhóm
  nghìn ngay khi đang gõ**. Đếm số 0 bằng mắt là chỗ sai tiền nhiều nhất, và nó sai theo bội số
  của mười.
- Ô nhập tỷ lệ cắt còn **hai chữ số thập phân ngay lúc gõ**, dấu thập phân là **dấu phẩy**. Nhận cả
  dấu chấm vì bàn phím số trên laptop chỉ có dấu chấm.

---

## 7. Quy tắc tính toán

| Chỉ tiêu | Công thức |
|---|---|
| Các khoản CPBH | Nhập tay, **đơn vị Việt Nam đồng** — không có phương án nhập theo tỷ lệ. **Số khoản tuỳ từng dòng sản phẩm** `sửa 15/08` |
| CPBH tổng | Tổng mọi khoản CPBH của dòng đó. Dòng không có khoản nào thì tổng bằng 0 |
| Giá thu về | `Giá bán buôn − CPBH tổng` |
| Tỷ lệ CK | `(Giá bán Công ty − Giá thu về) / Giá bán Công ty`, tính theo phần trăm |
| Ghi chú | `mới 16/08` Chữ tự do người lập gõ cho **riêng dòng ấy**, tối đa 500 ký tự. Không tham gia phép tính nào, hiện thành cột cuối của bảng dòng sản phẩm và **in ra bản CSBH A4**. Để trống thì ô trống — không có ghi chú mặc định nào |

**Làm tròn** — tiền là số nguyên đồng; tỷ lệ CK làm tròn **hai chữ số thập phân**. Con số hiển thị
và con số dùng để so ngưỡng phải là một: so sánh **sau khi** đã làm tròn.

**Vượt ngưỡng** — cột tỷ lệ hiện đỏ ngay khi nhập. Khi bấm duyệt và gửi, hiện hộp thoại cảnh báo
vượt chiết khấu; người dùng đồng ý thì **vẫn cho gửi**. Đây là cảnh báo mềm, không chặn.

### 7.1. Ảnh chụp lấy theo NGÀY ÁP DỤNG `mới 16/08`

Giá bán Công ty và ngưỡng chiết khấu đều có ngày hiệu lực. Con số chụp vào một dòng hồ sơ là con số
có hiệu lực **tại Thời gian áp dụng của hồ sơ ấy**, không phải tại ngày lập.

Hồ sơ áp dụng từ 01/09 thì mang bảng giá của 01/09, kể cả khi được lập từ tháng 8. Đổi *Thời gian áp
dụng* thì mọi dòng **chụp lại** theo bảng giá của ngày mới. Bỏ trống Thời gian áp dụng thì lấy giá
hôm nay.

### 7.2. Đóng băng: đúng một lần, ở đúng lúc gửi duyệt `sửa 16/08`

| Hồ sơ | Khi danh mục đổi giá hoặc đổi quy định chiết khấu |
|---|---|
| **Nháp · Yêu cầu chỉnh sửa** | **Sống theo danh mục.** Mỗi lần mở hồ sơ, giá và ngưỡng chụp lại; lúc bấm *Gửi duyệt* chụp lại lần cuối rồi mới đóng băng |
| **Đã gửi duyệt → Đang có hiệu lực** | **Không bao giờ ghi đè.** Hiện trong box *Yêu cầu cập nhật* (muc 9.3); riêng hồ sơ đang hiệu lực còn có **email tới TDV phụ trách** |
| **Từ chối · Hết hiệu lực** | Không theo dõi nữa |

Giá bán buôn và các khoản CPBH **không bao giờ** bị làm mới — đó là con số người lập nhập, không phải
ảnh chụp danh mục. Làm mới chỉ tính lại ba thứ đến từ danh mục: Giá bán Công ty, ngưỡng, và mã quy
định đã cho ra ngưỡng ấy.

**Làm mới hỏng thì giữ số cũ, và chặn ở lúc gửi.** Sản phẩm đã vô hiệu hoá, hoặc chưa khai giá tại
ngày áp dụng, thì dòng ấy giữ nguyên số cũ khi mở hồ sơ — chặn ở đó là nhốt người lập ngoài chính hồ
sơ họ cần vào để xoá dòng hỏng. Bấm *Gửi duyệt* thì bị chặn, kèm tên sản phẩm: đó mới là lúc con số
đi vào một văn bản sắp ký.

---

## 8. Hợp đồng

Thuộc **giai đoạn 1**.

### 7.1. Bản CSBH in ra — số cột CPBH `mới 15/08`

Mỗi dòng sản phẩm có số khoản CPBH riêng, nhưng một bảng in ra giấy phải có **số cột đều nhau** —
cột so le thì không đọc theo hàng dọc được và người ký không đối chiếu nổi.

- Số cột CPBH của cả bảng = **dòng nhiều khoản nhất**.
- Dòng ít khoản hơn để **ô trống**, KHÔNG điền số 0. Số 0 là một con số có nghĩa ("khoản này bằng
  không"); ô trống nói đúng điều cần nói là dòng ấy không có khoản thứ mấy đó.
- Không dòng nào có khoản nào thì bảng **không có cột CPBH**.

Luật này áp cho cả bản in A4 lẫn bảng trên màn hình — hai chỗ phải ra cùng một con số, nếu không thì
bản người dùng xem khác bản đem ký.

---

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
- SLA: 14 ngày cho mọi trạng thái chờ, **tính cả cuối tuần**.
- **Đúng một** email nhắc trước 24 giờ `sửa 18/08`, và **chỉ gửi cho người phải thao tác**.
- Quá hạn thì hồ sơ chuyển `Quá hạn duyệt` — **trạng thái kết thúc** — và có email báo cho người phụ
  trách bước ấy, TDV lập hồ sơ, cùng mọi người đã tác động lên hồ sơ.
- Sau **3 ngày** ở `Quá hạn duyệt`, hệ thống **tự chuyển sang `Đã xóa`** và báo cho TDV lập hồ sơ
  cùng người phụ trách bước hồ sơ chết ở đó `sửa 18/08`.
- **Trang tổng quan có thẻ *Sắp quá hạn*** cho mọi vai trò nhìn thấy hồ sơ `sửa 18/08`: hồ sơ còn
  dưới 24 giờ là tới hạn, ở **bất kỳ bước nào** trong phạm vi người đang xem — không riêng bước của
  chính họ. Người đang giữ hồ sơ chính là người đã không xử lý suốt 13 ngày qua.

### 9.2. Bộ lọc và báo cáo

Bộ lọc tối thiểu, cho phép kết hợp nhiều điều kiện, xóa bộ lọc, xuất Excel và giữ điều kiện lọc
trong phiên làm việc:

> thời gian áp dụng · thời gian duyệt · mã khách hàng · tên khách hàng · địa chỉ đăng ký ·
> mã số thuế · tên sản phẩm · người đề nghị · trạng thái · TDV phụ trách · nhóm sản phẩm

Báo cáo: tiến độ hồ sơ theo trạng thái, bước và người xử lý; nhật ký người dùng theo số lần xem,
ký, tiếp nhận, xuất file và tải tài liệu.

### 9.3. Box "Yêu cầu cập nhật" trên trang Tổng quan `mới 16/08`

Có ở **bốn vai trò trong luồng**: TDV, Trưởng bộ phận, Sale Admin, Kế toán. Liệt kê những hồ sơ **đã
đóng băng** của phạm vi người đó mà giá hoặc ngưỡng đã lệch so với danh mục hôm nay — từ *Chờ TBP
duyệt* cho tới *Đang có hiệu lực*.

Mỗi dòng nói **con số**, không nói "bị ảnh hưởng": lệch cái gì, sản phẩm nào, từ đâu sang đâu. Không
kèm con số thì người đọc phải mở hồ sơ ra, mở danh mục ra rồi tự so — đúng cái việc box này sinh ra
để khỏi phải làm.

**BA loại lệch** `sửa 17/08`:

| Loại | Sinh ra khi |
|---|---|
| `Giá` | Giá bán Công ty của sản phẩm đổi |
| `Ngưỡng` | Quy định chiết khấu áp cho dòng đó đổi, **hoặc bị xoá** — khi đó ngưỡng mới là rỗng |
| `Sản phẩm` | Sản phẩm **bị vô hiệu hoá**, hoặc **bị xoá** khỏi danh mục |

Loại thứ ba là bổ sung của `17/08`. Trước đó vô hiệu hoá một sản phẩm lọt qua sạch — nó không đổi giá
mà phép rà chỉ so giá và ngưỡng — dù đó là loại lệch **nặng nhất**: một CSBH đang có hiệu lực cho mặt
hàng không còn bán nữa là một điều khoản không thực hiện được, không cùng hạng với chênh lệch vài
đồng. Nhãn của nó tô đỏ, hai loại kia thì không.

Cả ba loại đều **gửi email tới TDV phụ trách** khi hồ sơ đang *Đang có hiệu lực*, đúng như quy tắc đã
có ở muc 7.2.

**Box không có nút nào.** Việc phải làm khác nhau theo vai trò và theo bước — trả lại để sửa, cứ
duyệt vì chênh lệch không đáng kể, hay lập một CSBH mới — và đó là quyết định của người.

**Ẩn hẳn khi không có gì lệch.** Đây là màn hình mở mỗi sáng; một khối rỗng lặp lại mỗi ngày là khối
người dùng ngừng nhìn, và đúng hôm nó có nội dung thì họ cũng không nhìn.

Ban lãnh đạo và Quản trị hệ thống **không có box này**: cả hai nằm ngoài luồng duyệt.

> **Lưu ý khi dựng:** địa chỉ đăng ký là text tự do nên chỉ lọc được kiểu “có chứa” — và từ
> `sửa 16/08` đó là cách lọc theo địa bàn DUY NHẤT còn lại, vì trường Tỉnh/thành đã bỏ.

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

### 11.3. Phân trang `mới 16/08`

**Mọi danh sách đều phân trang, tối đa 20 mục một trang.** Một cỡ trang cho cả phần mềm — hồ sơ,
khách hàng, sản phẩm, quy định chiết khấu, người dùng, nhật ký, thư hỏng, mẫu hợp đồng, hộp việc và
box *Yêu cầu cập nhật*.

Thanh phân trang nói **trang mấy trên mấy** và **tổng bao nhiêu mục**, chỉ có nút *Trước* và *Sau*,
và **ẩn hẳn khi chỉ có một trang**. Không có dãy số trang: danh sách hồ sơ phân trang bằng con trỏ
nên không nhảy thẳng tới trang 9 được, và một thanh có số bấm được ở chỗ này còn chỗ kia thì không là
hai thanh khác nhau đội lốt một.

Ba luật đi kèm, mỗi luật bịt một cách làm người dùng mất phương hướng:

- **Đổi bộ lọc thì về trang 1.** Đứng ở trang 7 của kết quả cũ mà lọc lại thì trang 7 của kết quả mới
  thường rỗng, và màn hình trắng ngay sau khi gõ từ khoá đọc ra là "không tìm thấy gì".
- **Xoá mục cuối của trang cuối thì tự lùi** về trang còn dữ liệu.
- **Ô tìm kiếm tìm trên toàn bộ dữ liệu**, rồi mới cắt trang — không phải tìm trong 20 dòng đang hiện.

Vấn đề nó giải quyết không phải là hiệu năng mà là **sự im lặng**: trước đây mỗi màn hình tự chọn một
con số (50, 100, 200) và không màn hình nào nói cho người dùng biết họ đang nhìn một phần hay toàn bộ
— mà với danh sách bị cắt trong im lặng, người dùng luôn tin mình đang nhìn toàn bộ.

**Không phân trang**: bảng dòng sản phẩm trong một hồ sơ CSBH, lịch sử giá của một sản phẩm, tệp đính
kèm của một hồ sơ. Chúng là **nội dung của một hồ sơ**, không phải danh sách để duyệt — và bản A4 in
ra phải khớp đúng bản trên màn hình (muc 11.1), nên cắt trang ở đó là làm người ký nhìn thiếu dòng.
Các ô chọn trong biểu mẫu cũng không: một ô chọn phân trang là một ô chọn không dùng được.

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

70 quyết định chốt trong các phiên 04/08, 05/08, 06/08, 07/08 và 16/08/2026, nhóm theo chủ đề. Sáu
quyết định của phiên 04/08 đã bị phiên 05/08 thay thế nên không còn trong danh sách — chỉ giữ bản mới
nhất.

**Vai trò** — Kế toán L1 và L2 là một · Ban lãnh đạo là một người, chỉ đọc · TDV và QL là một ·
khách hàng do TDV tự tạo · danh mục sản phẩm, giá và chiết khấu do Quản trị hệ thống nhập ·
**người dùng không quản lý lẫn nhau, bỏ hẳn cây phân quyền** `16/08` · **đổi TDV phụ trách là quyền
của Quản trị hệ thống**, không phải Sale Admin `16/08`.

**Khách hàng** `16/08` — **xoá khách hàng chỉ do TDV phụ trách** chính khách đó, không phải mọi vai
trò ghi · **một nút duy nhất mang nhãn *Xoá***: chỉ làm được khi **không CSBH nào đang chờ**, mọi
CSBH đang hiệu lực chuyển **Hết hiệu lực**, khách chưa có hồ sơ nào thì xoá hẳn dòng còn khách đã có
lịch sử thì giữ lại kèm nhãn *Đã xoá* để tra cứu hồ sơ cũ.

**Tài khoản** `16/08` — **không đổi được vai trò** sau khi tạo; cần đổi thì vô hiệu hoá tài khoản cũ
rồi tạo mới · vô hiệu hoá phải **gõ lại tên đăng nhập** (`sửa 17/08` — trước là họ tên, mà họ tên
không duy nhất nên nó không chứng minh được người quản trị đang nhìn đúng dòng) và **chọn người nhận
bàn giao cùng vai trò**, không
chọn thì không vô hiệu hoá được · bàn giao chuyển mọi hồ sơ chưa kết thúc, kể cả Nháp và Đang có
hiệu lực, giữ nguyên trạng thái, và ghi vết vào **nhật ký của từng hồ sơ** · với TDV thì **khách
hàng chuyển cùng hồ sơ**, kể cả khách chưa có hồ sơ nào · **KHÔNG hỗ trợ giao lại một hồ sơ lẻ** khi
người phụ trách vẫn đang làm việc — đổi người chỉ có ở hai chỗ: lúc chọn người trong luồng, và lúc
vô hiệu hoá tài khoản.

**Xoá đối tượng trong danh mục** `17/08` — mọi thao tác phá huỷ đòi **gõ lại mã nghiệp vụ** của
chính đối tượng ấy: mã nhóm khi xoá nhóm sản phẩm, mã quy định khi xoá quy định chiết khấu, mã vật tư
khi **vô hiệu hoá** sản phẩm (sản phẩm không có đường xoá hẳn, nên vô hiệu hoá là thao tác phá huỷ
của nó), tên đăng nhập khi vô hiệu hoá tài khoản · dùng **mã nghiệp vụ chứ không dùng uuid**: uuid
không ai gõ, người dùng sẽ sao chép, mà sao chép cũng phản xạ y như bấm nút · phép kiểm nằm ở **máy
chủ**, không chỉ ở hộp thoại — script dọn dữ liệu và lệnh `curl` cũng phải nói ra thứ mình định xoá ·
thao tác **không phá huỷ** thì không đòi gì: đổi tên sản phẩm, bật lại sản phẩm đã vô hiệu hoá.

**Thông báo và nhật ký** `17/08` — mỗi lần đổi trạng thái báo cho **mọi người đã tác động** lên hồ
sơ, không chỉ người phải xử lý bước hiện tại · hai nhóm nhận **hai lá thư khác nhau**, khác ở đường
dẫn: người phải xử lý mở **hồ sơ**, người chỉ cần biết mở **nhật ký hồ sơ** · **màn hình nhật ký hồ
sơ** liệt kê đủ mọi bước kể cả bước hệ thống tự chạy, đọc được ở mọi trạng thái, phạm vi xem giống
hệt phạm vi mở hồ sơ.

**Nút Thao tác trên hồ sơ** `18/08` — dải nút chỉ hiện **việc vai trò đang đăng nhập làm được**,
không hiện mọi việc của trạng thái · `/policies/:id/allowed-actions` lọc theo vai trò ngay ở máy chủ,
suy thẳng từ máy trạng thái chứ không khai thêm bảng vai trò thứ hai · hai hành động của **hệ thống**
(`PUBLISH_SIGNED` sau khi ký, `SUPERSEDE` khi bản mới có hiệu lực) không hiện cho ai · Ban lãnh đạo
và Quản trị hệ thống mở được hồ sơ ở mọi bước mà **không có nút nào** · thông báo lỗi
`INVALID_TRANSITION` thì NGƯỢC LẠI, vẫn liệt kê đủ hành động của trạng thái để người bấm nhầm biết
hồ sơ đang chờ ai.

**Phân công và phạm vi** `16/08` — TDV chọn Trưởng bộ phận và Kế toán lúc gửi duyệt · Kế toán chọn
Sale Admin lúc tiếp nhận lần 1 · tiếp nhận lần 2 về đúng người đã nhận lần 1, không chọn lại · phạm
vi đọc suy từ bốn ô người trên chính hồ sơ · gửi duyệt phải xem bản CSBH A4 dạng PDF rồi mới xác nhận.

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
nhập trên từng dòng hồ sơ · "Danh mục" tách thành **ba mục menu** (Sản phẩm · Chiết khấu · Giấy tờ
mẫu), có tìm kiếm sản phẩm bỏ dấu · **gỡ màn hình Người ký** vì yêu cầu chưa rõ, rồi **xoá hẳn đối
tượng Người ký** ngày 16/08 vì hợp đồng không cần in tên người ký của Công ty.

**Hồ sơ và chiết khấu** (15/08) — **quy định chiết khấu vô thời hạn**, bỏ ngày kết thúc · **số khoản
CPBH tuỳ từng dòng sản phẩm**, không cố định bốn; bản in lấy số cột của dòng nhiều khoản nhất, dòng
ít hơn để ô trống · **sửa được dòng sản phẩm** chứ không chỉ xoá, nhưng không đổi được sản phẩm của
dòng · bỏ dòng "Tổng giá thu về" dưới bảng vì cộng dồn giá thu về của nhiều mặt hàng không có nghĩa
nghiệp vụ · ô nhập tiền ghi rõ đơn vị và định dạng ngay khi gõ.

**Trùng và thiếu quy định chiết khấu** (15/08) — **một phạm vi × một ngày hiệu lực = tối đa một quy
định**; khai trùng thì hệ thống từ chối thay vì tự phân xử, và "trùng" tính cả các ô để trống · nhiều
quy định cùng khớp vẫn là chuyện bình thường, phân xử bằng **cụ thể hơn thắng, rồi mới hơn thắng** ·
**cảnh báo ngay lúc chọn sản phẩm** khi không quy định nào khớp, kèm con số ngưỡng mặc định sẽ dùng ·
dòng ấy mang **nền vàng và dấu ◆** trong bảng, có chú thích màu đi kèm · mỗi dòng hồ sơ **ghi lại quy
định nào** đã cho ra ngưỡng của nó · **sản phẩm không có ngưỡng nào vẫn đưa vào hồ sơ được**, chỉ là
không đối chiếu được — bản trước chặn, và cái chặn đó đã gỡ · cột **QĐCK** trên bảng dòng sản phẩm và
cột **Id** trên bảng quy định mang cùng một mã, **ô tìm kiếm khớp cả mã** · **gỡ cột "Độ cụ thể"**.

**Mã quy định và nguồn ngưỡng duy nhất** (15/08) — **mã quy định chiết khấu do Quản trị đặt**, không
sinh tự động; trùng mã thì từ chối tạo, tính cả khác hoa thường và khoảng trắng thừa · **bỏ hẳn ba cột
“CSBH loại 1/2/3”** trên sản phẩm — bảng Chiết khấu quy định là nguồn ngưỡng duy nhất, không quy định
nào phủ thì dòng hồ sơ không có ngưỡng để đối chiếu.

**Khách hàng** (15/08) — **loại khách hàng hiển thị** trên cả danh sách lẫn màn hình chi tiết ·
**sửa được sau khi lưu**, có cảnh báo hệ quả khi đổi; hồ sơ đã lập giữ nguyên ngưỡng đã chụp, chỉ hồ
sơ lập sau hoặc dòng được ghi lại mới nhận ngưỡng mới.

**Phân trang** (16/08) — **mọi danh sách tối đa 20 mục một trang**, một cỡ trang cho cả phần mềm ·
thanh phân trang nói trang mấy trên mấy và tổng bao nhiêu, ẩn khi chỉ có một trang · đổi bộ lọc thì
về trang 1 · ô tìm kiếm vẫn tìm trên toàn bộ dữ liệu · nội dung của một hồ sơ (dòng sản phẩm, lịch sử
giá, tệp đính kèm) **không** phân trang.

**Giá theo ngày áp dụng, hồ sơ Nháp sống theo danh mục** (16/08) — ảnh chụp giá và ngưỡng lấy theo
**Thời gian áp dụng** của hồ sơ, không phải ngày lập · hồ sơ **Nháp và Yêu cầu chỉnh sửa không đóng
băng**: chụp lại mỗi lần mở và một lần cuối lúc gửi duyệt · **đóng băng đúng một lần**, ở đúng lúc
gửi duyệt · dòng không làm mới được thì giữ số cũ khi mở, **chặn khi gửi** · **đổi quy định chiết
khấu cũng gửi email** tới TDV của CSBH đang hiệu lực, đúng như đổi giá · thêm box **"Yêu cầu cập
nhật"** ở trang Tổng quan của bốn vai trò trong luồng, liệt kê hồ sơ đã đóng băng đang lệch kèm con
số cũ và mới.

**Sửa ngày hiệu lực của quy định** (16/08) — quy định chiết khấu **sửa được ngày bắt đầu hiệu lực**,
không chỉ ngưỡng; trùng phạm vi và trùng ngày với một dòng khác thì từ chối · cột *Hiệu lực* trên
bảng quy định **bỏ chữ "vô thời hạn"**, chỉ hiện ngày bắt đầu.

**Ghi chú dòng sản phẩm, và màu đúng chỗ** (16/08) — mỗi dòng sản phẩm trong hồ sơ có một ô **ghi
chú** tự do 500 ký tự, in ra cả bản A4 · **màu cảnh báo chỉ tô con số Tỷ lệ CK**, không phủ nền cả
dòng · thêm **dấu `?`** cạnh con số, rê chuột hoặc bấm để đọc lý do đầy đủ · **bỏ dấu `!` và hình
thoi `◆`** cạnh con số, và **bỏ khối chú thích màu** dưới bảng — dấu `?` gánh cả hai việc.

**Hai yếu tố, và ba danh mục địa lý biến mất** (16/08) — **ngưỡng chiết khấu chỉ phụ thuộc nhóm sản
phẩm và loại khách hàng**; chiều **kênh bán** rời khỏi quy định · **bỏ hẳn ba trường Tỉnh/thành ·
Bệnh viện–điểm bán · Kênh** khỏi khách hàng, cùng ba danh mục tra cứu, ba tiêu chí lọc và ba cột
trong file Excel — bộ lọc còn **11 tiêu chí** · dữ liệu đã nhập của ba trường ấy **mất theo**, có chủ
ý: giữ lại cột là giữ lại màn hình nhập, và dữ liệu nhập vào sẽ có người tin là có nghĩa.

**Khác** — chữ ký điện tử nội bộ · SLA 14 ngày tính cả cuối tuần · một luồng email cho mỗi khách hàng.
