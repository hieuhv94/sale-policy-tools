# Yêu cầu nghiệp vụ — Phần mềm Chính sách bán hàng

| | |
|---|---|
| **Đơn vị yêu cầu** | Công Ty Cổ Phần Dinh Dưỡng Nutricare |
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

- Tạo khách hàng, nhập thông tin và tải hồ sơ pháp lý — **chỉ TDV phụ trách khách hàng ấy mới thêm
  và gỡ được giấy tờ** `sửa 20/08`; vai trò khác xem và tải. Mã khách hàng do kế toán cấp bên ngoài
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
2. **Yêu cầu in lại bản cứng** — hồ sơ về Sale Admin, **bản scan trước đó được giữ nguyên** `sửa 19/08`.

**Ngoài phần mềm** — cấp mã khách hàng cho TDV.

### 2.5. Sale Admin

| | |
|---|---|
| **Phạm vi** | Những hồ sơ được Kế toán giao cho mình ở bước tiếp nhận lần 1 `sửa 16/08` |

- Nhận hồ sơ **sau khi** kế toán tiếp nhận lần 1.
- ~~Tạo và duy trì mẫu hợp đồng~~ **đã chuyển sang Quản trị hệ thống** `sửa 20/08` — xem mục 8.2.
  Sale Admin vẫn **chọn mẫu nào** lúc xuất hợp đồng, chỉ không tải mẫu lên và không ban hành nữa.
- **Xuất hợp đồng** — quyền dùng chung với kế toán, cùng điều kiện: chỉ xuất được sau tiếp nhận
  lần 1. Xuất được nhiều lần; hệ thống không lưu lại hợp đồng.
- In bản cứng, trình Ban lãnh đạo ký, nhận lại, scan và tải file lên hệ thống.
- Bấm bàn giao bản cứng để chuyển sang kế toán lần 2.
- Khi kế toán yêu cầu in lại: nhận lại hồ sơ, in lại bản cứng, rồi **gỡ bản scan cũ và tải bản
  scan mới lên** `sửa 19/08`. Hệ thống giữ bản cũ lại để đối chiếu chứ không tự xóa.
- Không sửa nội dung CSBH, không bỏ qua bước tiếp nhận lần 1.

### 2.6. Ban lãnh đạo

Một người. Toàn quyền đọc **dữ liệu nghiệp vụ** `sửa 21/08`, **không có thao tác nào trên hồ sơ**.

- Xem mọi CSBH ở mọi trạng thái, lịch sử duyệt và file đã ký.
- **KHÔNG xem nhật ký hệ thống** `sửa 21/08`. Bản trước cho xem, theo đúng câu "toàn quyền đọc" ở
  ngay trên. Bỏ vì nhật ký hệ thống là **vết kiểm soát** — IP, mã tra cứu, giá trị trước và sau của
  từng lần sửa — phục vụ việc truy vết sự cố, không phục vụ việc điều hành. Khối *Hoạt động gần đây*
  trên trang tổng quan của vai trò này cũng gỡ cùng lượt.
  > Điều Ban lãnh đạo cần thì không mất: *Lịch sử hồ sơ* nằm trong từng hồ sơ, kể đủ ai đã ký, ai đã
  > tiếp nhận, ai đã trả lại và vì sao — và họ vẫn mở được mọi hồ sơ. Nhật ký hệ thống chỉ còn của
  > Quản trị hệ thống (mục 2.7).
- Lọc và xuất Excel theo mọi tiêu chí ở mục 9.2 — xuất ra đúng kết quả bộ lọc đang xem.
- Ký bản cứng là thao tác giấy do Sale Admin trình lên — phần mềm không có bước nào cho việc này.

### 2.7. Quản trị hệ thống

- Nhập và duy trì danh mục sản phẩm và giá, nhóm sản phẩm, chiết khấu quy định, danh mục tra cứu.
  **Cả hai loại văn bản mẫu thuộc vai trò này** `sửa 20/08` — mẫu hồ sơ CSBH và mẫu hợp đồng, ở màn
  hình *Văn bản mẫu*, hai thẻ. Bản trước giao mẫu hợp đồng cho Sale Admin (mục 8.2); khách hàng gộp
  về một chủ ngày 20/08. *Người ký* đã xoá hẳn — xem mục 6.4.
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
| B3 | TDV | Chờ TBP duyệt | TBP | **Chọn văn bản mẫu** `sửa 23/08`, xem bản CSBH dựng bằng chính mẫu ấy, chốt và gửi duyệt. Hồ sơ khóa sửa; giá, ngưỡng và **mẫu** đóng băng |
| B4 | TBP — duyệt | **KT duyệt bản mềm** `sửa 19/08` | KT, TDV | Duyệt và ký số; file hiện người ký và ngày giờ ký. Hồ sơ sang thẳng bàn kế toán |
| B4B | TBP — không duyệt | Yêu cầu chỉnh sửa → B3 | TDV | Bắt buộc nhập lý do; hồ sơ mở khóa, tạo phiên bản mới |
| ~~B5~~ | ~~Hệ thống~~ | — | — | **Bỏ `19/08`** — xem ghi chú dưới bảng |
| B6A | Kế toán — nhận L1 | Sale Admin đang xử lý | SA, TBP, TDV | Tiếp nhận file mềm và **chọn Sale Admin xử lý bước sau** `sửa 16/08`; khách hàng đủ điều kiện xuất hàng và xuất VAT |
| B6B | Kế toán — không nhận L1 | Yêu cầu chỉnh sửa → B3 | TBP, TDV | Bắt buộc nhập lý do; duyệt và ký lại từ đầu |
| B7 | Kế toán **hoặc** Sale Admin | — | — | Xuất file hợp đồng (xem mục 8) |
| B8 | Sale Admin | Sale Admin đang xử lý | KT, TBP, TDV | In, trình BLĐ ký, nhận lại, scan, tải file lên |
| B9 | Sale Admin | KT duyệt bản cứng | KT, TBP, TDV | Bàn giao bản cứng |
| B10A | Kế toán — nhận L2 | **Đang có hiệu lực** | KT, TBP, SA, TDV | Đối chiếu bản cứng với lần 1; CSBH có hiệu lực ngay lúc này |
| B10B | Kế toán — không nhận L2 | Yêu cầu chỉnh sửa → B3 | KT, TBP, SA, TDV | Bắt buộc nhập lý do |
| B10C | Kế toán — yêu cầu in lại | Sale Admin đang xử lý → B8 | SA, TBP, TDV | Bản scan cũ **giữ nguyên**; Sale Admin chủ động gỡ và thay `sửa 19/08` |

**Bước B5 và trạng thái `TBP đã ký số` đã bỏ** `19/08`. Chúng chưa bao giờ hiện ra với người dùng:
hệ thống chuyển tiếp ngay trong cùng một giao dịch với lần TBP ký, nên không hồ sơ nào từng dừng lại
ở đó. Nhưng đó là **hai** lần chuyển bước, tức hai email, và **kế toán có tên trong cả hai** — mỗi
lần Trưởng bộ phận ký, kế toán nhận hai thư trong cùng một giây. Nay B4 sang thẳng *KT duyệt bản
mềm*: một bước, một thư, một dòng lịch sử. Chữ ký số và dấu thời gian vẫn được ghi y như cũ.

**Mọi lần trả lại đều tạo phiên bản mới.** Trả về Bước 3 nghĩa là đi lại toàn bộ vòng duyệt,
kể cả bước ký số của Trưởng bộ phận. File đã ký của phiên bản cũ giữ nguyên trong lịch sử.

---

## 4. Trạng thái hồ sơ

| Trạng thái | Ý nghĩa | SLA |
|---|---|---|
| `Nháp` | Trạng thái đầu tiên, sửa tự do | — |
| `Chờ TBP duyệt` | Đã gửi duyệt, hồ sơ khóa sửa | 14 ngày |
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

7. **Văn bản mẫu của bản mềm cũng đóng băng lúc gửi duyệt** `mới 23/08`, cùng lằn ranh với giá và
   ngưỡng. Xem mục 6.4.

8. **Thông tin khách hàng và hai cái tên cũng đóng băng lúc gửi duyệt** `mới 24/08`, vẫn cùng lằn
   ranh ấy. Tám trường của khách hàng in trên bản CSBH — mã, tên, mã số thuế, địa chỉ đăng ký, nơi
   nhận hàng, người đại diện, chức danh, **công nợ** — chụp lại vào hồ sơ, cùng với **họ tên người
   đề nghị**. Họ tên **Trưởng bộ phận đã ký** chụp lúc ký. Từ đó, sửa hồ sơ khách hàng hay đổi họ
   tên tài khoản **không làm đổi nội dung một hồ sơ đã gửi duyệt**.

   > **Vì sao cần.** Trước đó những trường ấy đọc trực tiếp từ hồ sơ khách hàng ở mỗi lần mở, nên
   > sửa công nợ hôm nay là đổi con số trên bản CSBH đã ký từ tuần trước — lặng lẽ, và không ai
   > đối chiếu lại được. Giá và ngưỡng vốn đã đóng băng từ đầu; đây là nốt phần còn lại của cùng
   > một tờ giấy.

   **Hồ sơ bị trả lại thì mở ra sửa được.** Ảnh chụp làm mới ở **mỗi lượt gửi duyệt**, kể cả lượt
   gửi lại — nên trả lại vì *sai thông tin khách hàng* là một việc chữa được: TDV sửa hồ sơ khách
   hàng rồi gửi lại, bản CSBH mang số mới. Cùng lúc ấy **chữ ký của Trưởng bộ phận bị huỷ** và hồ
   sơ phải ký lại từ đầu, đúng như quy trình đã quy định.

   **Hai trường KHÔNG đóng băng, có chủ ý**: họ tên *Kế toán* và *Sale Admin* vẫn đọc theo người
   đang phụ trách, vì câu chúng trả lời là *"ai đang giữ hồ sơ"*. *Loại khách hàng* và nhãn *đã
   ngừng hợp tác* cũng đọc theo hiện tại — nhãn ấy là tin của hôm nay, và nó có mặt để người mở một
   hồ sơ cũ nhìn thấy.

**Sửa một dòng sản phẩm** `mới 15/08` — khi hồ sơ còn ở trạng thái sửa được, người lập đổi được
**giá bán buôn** và **các khoản chi phí** của một dòng đã có, không phải xoá rồi thêm lại.

- **Sản phẩm của dòng không đổi được.** Đổi sản phẩm là xoá dòng này và thêm dòng khác — hai việc có
  ý nghĩa nghiệp vụ khác nhau và để lại vết khác nhau trong nhật ký.
- Giá bán Công ty và ngưỡng chiết khấu **chụp lại theo danh mục tại thời điểm sửa**, đúng như lúc
  thêm dòng. Hồ sơ chưa gửi duyệt thì con số của nó phải là con số hiện hành.
- **Chỉ TDV đang phụ trách hồ sơ** thêm, sửa, xoá được một dòng sản phẩm, và đổi được ngày áp dụng
  `nói rõ 23/08`. Luật này không mới — nó là mặt còn lại của quy tắc xoá hồ sơ ở mục 4 — nhưng
  trước đây chỉ ghi ngầm bằng chữ *"người lập"*, và phần mềm đã hiểu ngầm sai một chỗ (xem Phụ lục B,
  `0099`). Nói rõ vì ba vai trò khác **có tên trên hồ sơ**: hồ sơ bị trả lại vẫn mang tên Trưởng bộ
  phận và Kế toán đã xử lý nó, mà "có tên trên hồ sơ" chỉ cho quyền **xem lại việc mình đã làm** —
  không cho quyền sửa nội dung người khác đang chịu trách nhiệm.

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
| Hồ sơ đính kèm | GPKD, GPP, giấy phép hoạt động, ảnh nhà thuốc, tài liệu khác. Hiện thành **thẻ có ảnh thu nhỏ**, rê chuột ra nút xem và tải, dấu ✕ để gỡ `sửa 20/08` |

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

### 6.4. Văn bản mẫu và người ký

| Loại mẫu | Ai quản lý | Tình trạng |
|---|---|---|
| **Mẫu hồ sơ CSBH** | Quản trị hệ thống | **Đã làm** `19/08` — màn hình *Văn bản mẫu*, thẻ đầu |
| **Mẫu hợp đồng** | Quản trị hệ thống `sửa 20/08` | Đã làm — cùng màn hình, thẻ thứ hai. Văn bản riêng, có ô trống ánh xạ tới trường dữ liệu — mục 8 |

**Bản CSBH A4 sinh từ mẫu Quản trị tải lên** `sửa 19/08`. Trước đó hệ thống tự dựng bố cục trong mã.

- **TDV chọn mẫu MỘT LẦN lúc gửi duyệt, rồi mẫu ĐÓNG BĂNG vào hồ sơ** `sửa 23/08`. Ô chọn nằm trong
  hộp *Gửi duyệt*, ngay trên bản A4 xem trước; đổi mẫu thì bản xem trước dựng lại. Từ lúc bấm gửi,
  **không vai trò nào chọn lại được** — Trưởng bộ phận, Kế toán, Sale Admin và Ban lãnh đạo mở bản
  mềm ra là thấy đúng bản người gửi đã chọn, kèm tên mẫu ở tiêu đề. Khổ giấy đi theo file `.docx` của
  mẫu — phần mềm đọc nó từ `w:orient` chứ không hỏi người tải lên, vì một ô nhập tay không còn hậu
  quả gì là một ô sẽ nói dối.
  > **Đảo quyết định `20/08`** — *"người xem chọn mẫu, phải chọn trước khi xem"*. Luật ấy đúng chừng
  > nào mẫu chỉ là bản trình bày của người đang đọc. Nhưng bản mềm CSBH là **thứ đem đi ký**, nên bản
  > trình bày của nó là một phần của cái được duyệt, không phải sở thích của từng người mở ra xem —
  > và mỗi mẫu có tập cột riêng, nên hai người mở cùng một hồ sơ có thể thấy hai bảng giá khác nhau.
  > Lý do cũ (*"mở sẵn một cái thì phần lớn người dùng không biết cái kia tồn tại"*) vẫn được giữ, chỉ
  > dời chỗ: nó thành lý do buộc **TDV** phải chọn, chứ không còn là lý do hỏi lại mọi người xem.
  >
  > Kéo theo: **gửi duyệt bắt buộc chọn mẫu**, chặn ở máy chủ — chưa chọn thì không gửi được, và hồ
  > sơ vẫn là bản nháp nên chưa mất gì (cùng lối với *TDV chưa gán Trưởng bộ phận thì không gửi
  > được*, mục 2.9). Hồ sơ bị trả lại rồi gửi lại thì **chọn lại**, ghi đè mẫu cũ.
  >
  > **Hợp đồng KHÔNG đóng băng** — Kế toán và Sale Admin vẫn chọn mẫu ở mỗi lượt xuất, vì hệ thống
  > không lưu hợp đồng (mục 8.3) nên không có gì để gắn mẫu vào. Nhưng họ cũng **phải chọn**: không
  > còn mẫu mặc định ngầm ở bất kỳ đâu, và nút *Xem* xám cho tới khi chọn.
  > *Ban hành* nghĩa là **thêm vào danh sách chọn**, không phải thay mẫu cũ. Nhiều mẫu
  > cùng áp dụng là trạng thái bình thường, và *"chưa có văn bản mẫu"* chỉ còn nghĩa là danh sách
  > RỖNG. Bản trước chốt "mỗi khổ giấy một mẫu riêng" — luật ấy sinh ra từ việc hệ thống tự tra mẫu
  > theo khổ, và nó mất nghĩa khi chính người dùng chọn.
- **KHÔNG xoá và KHÔNG sửa một mẫu — chỉ VÔ HIỆU HOÁ** `sửa 23/08`, và bật lại được bất cứ lúc nào.
  Vô hiệu hoá rút mẫu khỏi ô chọn, **không đụng tới hồ sơ đã gắn nó**: những hồ sơ ấy vẫn xem được
  bản mềm bình thường. Vô hiệu hoá đòi **gõ lại tên mẫu**; bật lại thì không đòi gì.
  > Đây là **hệ quả bắt buộc** của việc đóng băng, không phải một yêu cầu rời. Một mẫu xoá được là
  > bản mềm của mọi hồ sơ đã gắn nó hỏng vĩnh viễn — mà hồ sơ thì khoá sửa ngay từ lúc gửi duyệt, nên
  > không ai chữa được, và người bấm xoá cũng không có màn hình nào cho biết mẫu ấy đang được bao
  > nhiêu hồ sơ dùng.
  >
  > Lý do `20/08` bỏ *sửa* — *"sửa một mẫu đang dùng thì bản mềm hôm nay và hôm qua khác nhau mà
  > không chỗ nào ghi lại"* — nay được chính cột mẫu trên hồ sơ trả lời. Nhưng *sửa* vẫn không quay
  > lại, vì lý do đã đổi: sửa một mẫu đã gắn vào hồ sơ đã ký là **sửa chính văn bản đã duyệt**. Cách
  > đúng là thêm mẫu mới rồi vô hiệu mẫu cũ — hồ sơ cũ giữ nguyên bản của nó, hồ sơ mới dùng bản mới.
- **Bảng sản phẩm vẫn do hệ thống dựng.** Mẫu đặt một ô trống duy nhất `{{bang_san_pham}}`, và hệ
  thống thay nó bằng cả cái bảng với **đúng số cột CPBH của từng hồ sơ** (mục 7.1). Một bảng vẽ sẵn
  trong Word có số cột cố định, nên nó không tả được luật ấy — mỗi dòng nhận tới 50 khoản.
- **Khoá trộn viết bằng tiếng Việt** `sửa 19/08`, cho cả mẫu hồ sơ lẫn mẫu hợp đồng. Một nhóm
  `ho_so.` gom tất cả — thông tin chung, khách hàng, người xử lý; `cong_ty.` đứng riêng vì nó không
  thuộc hồ sơ. Ví dụ: `{{ho_so.ten_khach_hang}}`, `{{ho_so.ngay_ap_dung}}`, `{{cong_ty.ten}}`.
- **Trang thêm mẫu hiện luôn hướng dẫn** `mới 19/08`, trong một hộp **tự cuộn** để nút *Lưu* ở góc
  trên bên phải luôn trong tầm mắt `sửa 20/08`.
- **Một lượt lưu, không vòng đời** `sửa 20/08`: chọn file → soát bảng ánh xạ (phần mềm đoán sẵn) →
  chọn cột bảng → *Lưu*. Không còn *ban hành*, không còn *nháp*, không còn *sửa* — **lưu được là
  dùng được**, và muốn đổi thì **xoá đi rồi thêm mẫu mới**.
- **Chọn cột bảng sản phẩm theo từng mẫu** `mới 20/08`. Tập cột là thuộc tính của bản trình bày, nên
  nó đi theo mẫu: Quản trị soạn được *"bản đầy đủ cho nội bộ"* và *"bản gọn đưa khách hàng"*. Chỉ
  *Tên sản phẩm* không tắt được — một bảng giá không nói mình đang nói về mặt hàng nào thì không còn
  là bảng giá; *từng khoản CPBH* là **một** lựa chọn nở ra thành CPBH1…CPBHn.
- **CPBH tổng TẮT ĐƯỢC** `sửa 21/08`. CPBH là chi phí bán hàng — con số **nội bộ**, và *"bản gọn đưa
  khách hàng"* chính là chỗ không muốn đưa nó ra ngoài. Khoá cột ấy lại là dùng muc 11.1 chặn đúng
  việc mà tập cột theo mẫu vốn sinh ra để làm. Kéo theo: mục *CPBH* của muc 11.1 do **người soạn mẫu
  tự chịu trách nhiệm**, và một mẫu ra bản A4 không có chữ CPBH nào là **hợp lệ**.
- **Bỏ nhóm khoá `cong_ty.`** `sửa 20/08` — ba giá trị ấy cố định ở mọi hồ sơ, người soạn gõ thẳng
  vào file Word. Kéo theo: mục *thông tin công ty* do người soạn tự chịu trách nhiệm.
- **Mẫu bản mềm KHÔNG bắt buộc có *trạng thái* và *thời gian duyệt*** `mới 24/08`. Hai mục này khác
  hẳn những mục còn lại: chúng **còn đang đổi**. Bản mềm dựng lúc TBP ký in ra *Chờ kế toán duyệt
  lần 1* và một ô *thời gian duyệt* rỗng — ép có mặt tức là ép in ra một câu sai ở mọi hồ sơ chưa
  tới B10. *Ngày KT nhận lần 1* cũng vậy, và nó vốn chưa bao giờ bắt buộc.
  Hai trường vẫn **đặt ô được**: mẫu nào muốn in thì in, hệ thống chỉ thôi ép — và ba mẫu bàn giao
  kèm phần mềm vẫn in cả hai.
  > Cộng bốn mục tự chịu trách nhiệm ấy, phép kiểm tự động lúc lưu mẫu còn **9 trên 13 mục**
  > `sửa 24/08`. Nói ra vì một bảo đảm 9/13 mà tưởng là 13/13 thì tệ hơn hẳn một bảo đảm 9/13 đã
  > biết — cái tưởng ấy chỉ vỡ ra trên một bản đã đem đi ký.
  >
  > **13 mục của muc 11.1 là yêu cầu của bảng CSBH XEM**, tức bảng do hệ thống dựng — bảng ấy vẫn
  > đủ cả mười ba, kể cả năm cột mốc thời gian duyệt. Đem nguyên yêu cầu của bản hệ thống dựng áp
  > sang bản người dùng vẽ là chỗ `20/08` đọc quá lời.
- **Bỏ nhóm khoá `san_pham.`** `sửa 20/08` — mẫu hợp đồng cũng dùng `{{bang_san_pham}}`, nên cơ chế
  nhân bản dòng bảng không còn ai dùng.
- **Định dạng không phải chọn** `sửa 20/08`: nó gắn theo TRƯỜNG, không theo mẫu. Cờ *bắt buộc* theo
  từng ô trống cũng bỏ — nó chỉ đổi thời điểm báo lỗi, và báo cho người không sửa được.
- **Hệ thống seed sẵn một mẫu mặc định cho mỗi khổ**, để chạy được ngay từ khi triển khai. Đường báo
  lỗi vẫn tới được: Quản trị ngừng dùng mẫu của một khổ là khổ ấy báo lỗi.
- **Bàn giao kèm bốn file `.docx` soạn sẵn** `mới 20/08`, trong thư mục `templates/`: mẫu hồ sơ A4
  dọc, A4 ngang, một bản **rút gọn** chứa đúng các mục bắt buộc, và một **mẫu hợp đồng** (của Sale
  Admin, bản demo không nạp sẵn). Chúng là điểm khởi đầu để Quản trị sửa
  câu chữ chứ không phải soạn lại từ đầu, và bản rút gọn trả lời bằng chính nó câu hỏi *"tối thiểu
  phải có gì mới lưu được"*. Bản demo nạp sẵn cả ba.
  > Từ `24/08` bản rút gọn **rộng hơn mức tối thiểu đúng hai ô**: nó vẫn in *trạng thái* và *thời
  > gian duyệt*, hai mục vừa thôi bị ép. Giữ nguyên file chứ không cắt bớt — một bản rút gọn in
  > thừa hai dòng vẫn lưu được và vẫn dùng được, còn cắt đi là bỏ mất bằng chứng duy nhất kèm theo
  > phần mềm rằng hai trường ấy còn dựng được thật.

> **Câu hỏi bỏ ngỏ trước đây đã có lời giải.** Bản trước ghi: *"nếu mẫu do người dùng soạn, hệ thống
> không còn bảo đảm được 13 mục kia có mặt"*. Giải bằng phép kiểm **lúc PHÁT HÀNH**: mẫu thiếu mục
> bắt buộc thì không ban hành được, và thông báo nói rõ thiếu mục nào. Kiểm lúc phát hành chứ không
> lúc xem, vì người sửa được là Quản trị và họ đang đứng ở màn hình mẫu — báo lúc kế toán mở bản A4
> là báo cho người không sửa được gì.

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
| **Văn bản mẫu** | Chỉ Quản trị | Cả hai loại mẫu, hai thẻ; người xem chọn mẫu lúc xem bản mềm — xem 6.4 |

Vì sao bỏ dải thẻ "Danh mục": nó là **một tầng điều hướng thứ hai nằm trong tầng thứ nhất** — bấm
"Danh mục" rồi vẫn phải bấm tiếp mới tới thứ mình cần, và thanh bên không cho biết mình đang đứng ở
đâu.

Nhóm sản phẩm và danh mục tra cứu **không mất chức năng**: nhóm sản phẩm là thẻ thứ hai trong màn
hình Sản phẩm, danh mục tra cứu là khối trong màn hình Chiết khấu. Cả hai đều **chỉ Quản trị thấy**.

Tìm kiếm **bỏ dấu**: gõ `sua` ra "Sữa" — gõ đủ dấu trên bàn phím điện thoại giữa lúc ngồi với khách
hàng là thứ không ai làm.

### 6.6. Nhập số tiền và tỷ lệ `mới 15/08`

- Mọi ô nhập tiền ghi rõ **đơn vị ngay trên ô** ("Tiền tệ đơn vị đồng"), và số đã **phân nhóm nghìn
  luôn đọc được ngay trong lúc gõ**. Đếm số 0 bằng mắt là chỗ sai tiền nhiều nhất, và nó sai theo
  bội số của mười.
- **Nhưng ô nhập KHÔNG tự chèn dấu phân nhóm vào chữ người dùng đang gõ** `sửa 22/08`. Đang gõ thì ô
  hiện đúng chuỗi số trần, con số phân nhóm nằm ở dòng chú thích ngay dưới ô; rời ô thì chính ô hiện
  số đã phân nhóm.
  > Bản trước chèn dấu chấm ngay giữa lúc gõ, và nó **hỏng khi người dùng bật bộ gõ tiếng Việt**: bộ
  > gõ giữ bộ đệm riêng cho chữ đang gõ và sửa chữ bằng phím xoá lùi, nên ô nhập chèn thêm ký tự vào
  > giữa là bộ đệm lệch khỏi màn hình và lượt xoá lùi kế tiếp ăn nhầm **chữ số** — người dùng gõ đủ
  > bảy phím mà số tiền ra thiếu hoặc thừa số, ở mọi ô tiền. Việc cần bảo vệ vẫn được bảo vệ, chỉ
  > đổi CHỖ ĐẶT con số đã phân nhóm.
- Ô nhập tỷ lệ cắt còn **hai chữ số thập phân ngay lúc gõ**, dấu thập phân là **dấu phẩy**. Nhận cả
  dấu chấm vì bàn phím số trên laptop chỉ có dấu chấm.

### 6.7. Báo lỗi trên giao diện `mới 22/08`

**Mọi lỗi phải nói đúng việc vừa hỏng, và hiện ở chỗ hợp với việc người dùng phải làm tiếp.** Câu
chữ của từng mã lỗi khai ở **một bảng tra duy nhất** trong giao diện; thêm một mã lỗi ở máy chủ mà
không khai câu cho nó là **ca kiểm đỏ**, không phải một thiếu sót âm thầm.

| Dạng | Dùng khi | Ví dụ |
|---|---|---|
| **Hộp thoại** | Thao tác vừa bấm không thành, phải biết trước khi làm tiếp | Hồ sơ vừa bị người khác cập nhật · Chưa tải bản scan |
| **Thanh nổi** | Việc phụ hỏng, không mất dữ liệu, không phải quyết định gì | File Excel đang dựng · Thao tác quá nhanh |
| **Dưới ô nhập** | Lỗi thuộc đúng **một trường** | Sai mật khẩu · Mã khách hàng trùng |
| **Ở lại trên trang** | Không tải được dữ liệu để dựng màn hình | Hồ sơ không tồn tại · Ngoài phạm vi |
| **Không hiện** | Lỗi giữa các service, hoặc lớp phủ phiên đã lo | Thiếu token nội bộ |

> Bản trước để mỗi màn hình tự vẽ một khối đỏ ở chỗ nó thấy tiện — 60 chỗ, 15 trong số đó thay hẳn
> cả trang. Hai hệ quả đo được ngày 22/08: **35 trên 96 mã lỗi không có câu nào**, nên chúng rơi vào
> bảy câu mặc định suy từ mã HTTP (gõ sai mật khẩu ra *"Yêu cầu không hợp lệ."*, mười bốn mã "không
> tìm thấy" khác nhau ra **cùng một câu**); và khối đỏ nằm cuối một biểu mẫu dài thì người dùng bấm
> Lưu, không thấy gì đổi, tưởng phần mềm treo.
>
> Ba dạng không phải hộp thoại đều có lý do đứng vững: lỗi tải trang mà hiện hộp thoại thì đóng nó
> xong còn lại trang trắng; lỗi của một ô mà hiện hộp thoại thì đóng xong người dùng vẫn phải tự đi
> tìm ô sai; còn mã nội bộ giữa các service thì không nói được gì cho người dùng.

**Việc hỏng thì không được im lặng nếu người dùng mất gì.** `sửa 22/08` Một lượt gọi phụ hỏng mà
màn hình vẫn trả lời dứt khoát là câu **sai sự thật**, và người dùng không có cách nào nghi ngờ:
tra CSBH đang áp dụng hỏng thì màn hình nói *"khách hàng chưa có CSBH nào"*; tra danh sách gợi ý
hỏng thì nói *"không có mục nào khớp"*; tra danh sách người nhận bàn giao hỏng thì nói *"không có
ai cùng vai trò"* — trong khi việc chọn người nhận là bắt buộc.

> **404 là câu trả lời, mọi lỗi khác thì không.** Hỏi "khách này đang áp dụng CSBH nào" mà nhận 404
> nghĩa là *chưa có bản nào* — đó là dữ liệu, không phải lỗi. Mất mạng hay 500 thì phải nói ra.
>
> Chỗ nào **cố ý** im lặng thì phải nói được người dùng không mất gì: ảnh thu nhỏ hỏng vẫn còn tên
> tệp và hai nút xem/tải; lời gọi đăng xuất hỏng thì trình duyệt đã đăng xuất xong rồi.

**Không câu lỗi nào được lộ tên trường trong mã, mã trạng thái, hay chữ không dấu.** Bản trước hiện
nguyên văn *"wholesalePrice: phải là số nguyên không âm"* và *"Khong the thuc hien "TBP_SIGN" khi ho
so dang o "CHO_KT_L1""* — câu thứ hai là câu dùng cho log, đi thẳng ra màn hình.

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
| **Đã gửi duyệt → Đang có hiệu lực** | **Không bao giờ ghi đè.** Hiện trong box *Yêu cầu cập nhật* (muc 9.3) và trong khối cảnh báo ngay trên màn hình hồ sơ `18/08`. **Không gửi email** `sửa 18/08` |
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

- Cột của bảng, chốt `19/08`: **STT · Mã sản phẩm · Tên sản phẩm · Giá công ty · Giá bán buôn ·
  CPBH tổng · CPBH1…CPBHn · Giá thu về · Tỷ lệ CK · Ghi chú**. Cột *Ngưỡng* đã **bỏ hẳn** — bản giấy
  không còn nói mức chiết khấu tối đa cho phép, nên hồ sơ vượt ngưỡng và hồ sơ đúng ngưỡng trông
  giống nhau trên giấy; khách hàng biết và chấp nhận.
- **Ghi chú tự xuống dòng**, ô cao lên theo. Bảng dùng bố cục bề rộng cố định: để cột tự co theo nội
  dung thì một ghi chú dài đẩy cả bảng ra ngoài mép giấy, và cột cuối cùng biến mất khỏi bản in.
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

### 8.2. Mẫu hợp đồng — do Quản trị hệ thống tạo sẵn `sửa 20/08`

> **Đổi chủ sở hữu.** Bản trước giao mục này cho Sale Admin, vì mẫu hợp đồng là "văn bản nghiệp vụ
> của người bán". Khách hàng chốt ngày 20/08: gộp về Quản trị hệ thống, cùng màn hình với mẫu hồ sơ
> CSBH. Lý do là **bộ máy giống hệt nhau** — tải `.docx` lên, đọc ô trống, ánh xạ trường, ban hành —
> và bộ máy ấy là việc kỹ thuật: nó đòi hiểu khoá trộn, hiểu vì sao Word cắt rời một ô trống, hiểu
> `{{bang_san_pham}}` khác gì `{{san_pham.*}}`. Chia đôi cho hai vai trò là bắt hai người học cùng
> một thứ, và người ít dùng hơn sẽ quên.
>
> Sale Admin **không mất gì trong luồng nghiệp vụ**: họ vẫn xuất hợp đồng, và vẫn chọn mẫu nào lúc
> xuất, ngay trên màn hình hồ sơ.

- Quản trị soạn văn bản mẫu bên ngoài, tải lên hệ thống, rồi **ánh xạ** từng ô trống trên mẫu với
  một trường dữ liệu: tên và mã khách hàng, người đại diện, địa chỉ đăng ký, nơi nhận hàng, mã số
  thuế, công nợ, danh sách sản phẩm và giá trong CSBH, mã CSBH, ngày duyệt.
- Hệ thống **cảnh báo trường thiếu** trước khi xuất và cho **xem trước** bản đã trộn.
- **Nhiều mẫu cùng đang dùng được** `sửa 20/08`: người xuất hợp đồng chọn mẫu nào trong ô chọn.
  *Ban hành* là đưa vào danh sách chọn, không phải thay mẫu cũ. File mẫu cũ giữ lại, và không có
  ràng buộc phiên bản nào.
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

### 9.1b. Thông báo trên web `mới 23/08`

Một **biểu tượng chuông** ở thanh trên cùng, sát trái thẻ tài khoản, mang **con số** thông báo chưa
đọc — không phải một dấu chấm. Quá 99 thì ghi `99+`.

- **Mọi hành động dẫn tới gửi email cho một người đều là một thông báo của người ấy, và ngoài ra
  không có thông báo nào khác.** Danh sách người nhận thông báo là chính danh sách người nhận thư,
  lấy ở cùng một chỗ.
- **Trừ hai lá thư về tài khoản** — kích hoạt tài khoản và đặt lại mật khẩu. Chúng mang liên kết
  dùng một lần, và liên kết ấy không được phép nằm trong bảng nào đọc lại được.
- Nội dung **ngắn gọn**: tên việc vừa xảy ra, khách hàng và mã hồ sơ, thời điểm. Lý do trả lại
  không hiện ở đây — bấm vào là mở đúng hồ sơ có nó.
- **Bấm vào thì tới đúng địa chỉ mà liên kết trong email dẫn tới.** Thư "để biết" dẫn tới *Lịch sử
  hồ sơ*, thư bàn giao khách hàng dẫn tới danh sách khách hàng.
- Bảng sổ xuống giữ **10 dòng gần nhất**, kèm *Đánh dấu đã đọc hết* và *Xem tất cả*. Trang đầy đủ
  lọc được **chỉ chưa đọc**.
- Thông báo giữ **6 tháng**, cùng cửa sổ với *Nhật ký*.

### 9.2. Bộ lọc và báo cáo

Bộ lọc **9 tiêu chí** `sửa 21/08`, cho phép kết hợp nhiều điều kiện, xóa bộ lọc, xuất Excel và giữ
điều kiện lọc trong phiên làm việc:

> thời gian áp dụng · thời gian duyệt · mã khách hàng · tên khách hàng · tên sản phẩm ·
> nhóm sản phẩm · TDV phụ trách · trạng thái · hạn xử lý

**Năm tiêu chí nhận NHIỀU giá trị cùng lúc** `mới 21/08` — mã khách hàng, tên sản phẩm, nhóm sản
phẩm, TDV phụ trách và trạng thái. Trong một tiêu chí, nhiều giá trị là **hoặc**; giữa hai tiêu chí
vẫn là **và**. Bốn tiêu chí ấy hiện dưới dạng **ô chọn** lấy thẳng từ danh mục, không phải ô gõ tay:
gõ để tìm, bấm để chọn, mỗi thứ đã chọn thành một thẻ bấm được để gỡ. Tối đa 50 giá trị mỗi tiêu chí.

> **Ba tiêu chí bỏ đi** `sửa 21/08`: **địa chỉ đăng ký** và **mã số thuế** — không ai lọc theo, và
> hai ô ấy chiếm chỗ ngay giữa biểu mẫu. **Người đề nghị** gộp vào **TDV phụ trách**: bình thường
> hai người là một, và chúng chỉ lệch nhau sau khi bàn giao khách hàng — lúc ấy câu hỏi *"hồ sơ của
> TDV này"* chỉ có một câu trả lời đúng, là TDV **đang phụ trách khách hàng**. Đó cũng chính là
> người quyết định ai nhìn thấy hồ sơ, và là con số mà khối *Theo trình dược viên* trên trang Tổng
> quan đếm — nên bấm một dòng ở đó ra đúng con số vừa bấm.
>
> **Hạn xử lý** đi ngược chiều: từ một tham số kỹ thuật (`0060`) thành một tiêu chí chính thức.

**Xuất Excel theo KẾT QUẢ TÌM KIẾM** `sửa 21/08`, không phải toàn bộ phạm vi. Nút đứng ở màn hình
*Hồ sơ CSBH* — màn hình duy nhất có bộ lọc — nên số dòng trong file luôn bằng con số hiện trên màn
hình. Trước đó nút nằm ở trang *Báo cáo*, cách bộ lọc một màn hình, nên nó chỉ xuất được tất cả.

Tên file `CSBH_<yyyymmdd>_<hhmmss>.xlsx` theo giờ Việt Nam. File ở mức **DÒNG SẢN PHẨM**: mỗi mặt
hàng của mỗi hồ sơ là một dòng riêng, kèm giá bán Công ty, giá bán buôn, CPBH, giá thu về, chiết
khấu và ngưỡng của chính dòng đó. Các cột thông tin hồ sơ lặp lại trên mọi dòng của hồ sơ ấy, nên
file **không có cột tổng nào của hồ sơ** — số dòng và tổng giá thu về để Excel tự cộng.

Báo cáo: tiến độ hồ sơ theo trạng thái, bước và người xử lý; nhật ký người dùng theo số lần ký,
tiếp nhận, xuất file và tải tài liệu. Ba báo cáo này đọc ở **trang Tổng quan**.

> **Bỏ "số lần xem"** `sửa 19/08` — hệ quả trực tiếp của quyết định ở muc 10. Không chỗ nào trong hệ
> thống ghi lại việc xem, nên một cột đếm lượt xem sẽ vĩnh viễn bằng không; giữ nó lại chỉ khiến
> người đọc báo cáo tưởng là không ai xem gì.

### 9.2b. Màn hình *Thống kê* `mới 22/08`

Đổi tên từ *Báo cáo*, và đổi cả nội dung. Bản cũ bày lại chính những con số của trang *Tổng quan*
dưới một cái tên khác, nên mở ra không thấy gì mới.

**Hai màn hình, hai câu hỏi:**

| Màn hình | Trả lời | Loại con số |
|---|---|---|
| *Tổng quan* | Bây giờ đang thế nào — bao nhiêu hồ sơ chờ, cái nào sắp quá hạn | **Tồn tại thời điểm** |
| *Thống kê* | Kỳ vừa rồi đi thế nào — lập bao nhiêu, duyệt xong bao nhiêu, nhanh hơn hay chậm đi | **Dòng chảy trong kỳ** |

Hai loại ấy **không được trộn**: "40 hồ sơ đang chờ" của ba tháng liền không cộng thành 120, vì phần
lớn vẫn là cùng những hồ sơ ấy. Chỉ nhóm dòng chảy mới vẽ được đường xu hướng.

**Bốn nhịp**: tuần · tháng · quý · năm. Mỗi vai trò mở màn hình ra ở nhịp của mình — TDV theo tháng;
Trưởng bộ phận, Kế toán và Sale Admin theo tuần; Ban lãnh đạo theo quý — rồi đổi được bằng một cú
bấm.

**Bốn quy tắc số liệu:**

1. **Mỗi chỉ số neo vào đúng một mốc, và nói ra mốc ấy.** *"Tháng này có bao nhiêu CSBH"* là câu
   chưa đủ nghĩa: lập trong tháng, gửi duyệt trong tháng, hay có hiệu lực trong tháng là ba con số
   khác nhau. Bảng chú giải dưới mỗi bảng số nói rõ từng cột tính theo mốc nào.
2. **Đếm theo mốc, không theo trạng thái hiện tại** — cùng nguyên tắc mà tỷ lệ trả lại đã theo từ
   `18/08`. Trạng thái đổi được, mốc thì không.
3. **Kỳ cắt theo giờ Việt Nam.** Hồ sơ duyệt lúc 23:30 ngày cuối tháng thuộc tháng ấy. Tuần bắt đầu
   thứ Hai, nhãn kèm khoảng ngày (*Tuần 34 · 17/08–23/08*).
4. **Kỳ đang chạy so cùng số ngày.** Hôm nay ngày 22 mà đặt tháng này cạnh cả tháng trước là so 22
   ngày với 31 ngày — mọi chỉ số đều "giảm" mà không ai làm gì sai. Kỳ trước chỉ tính tới đúng mốc
   kỳ này đang đứng, và màn hình nói ra điều đó. Hồ sơ `LEGACY` loại khỏi mọi chỉ số **và được đếm
   ra**.

**BIỂU ĐỒ, KHÔNG PHẢI BẢNG SỐ** `sửa 23/08`. Bản đầu bày mỗi vai trò một bảng 6–8 cột × 12 dòng;
khách hàng bác thẳng: *"thể hiện dưới dạng biểu đồ, để nhìn được tổng quan chứ không dùng số
liệu"*. Sáu dạng hình, mỗi dạng gắn với một câu hỏi — **không dùng biểu đồ tròn**, vì nó chỉ đọc
được với 2–3 phần và không so được giữa hai kỳ:

| Dạng | Câu hỏi |
|---|---|
| Đường | Đang lên hay đang xuống? |
| Cột chồng | Cơ cấu kết cục đổi thế nào? |
| Phễu | Rơi rụng ở bước nào? |
| Thanh xếp hạng | Ai nhiều nhất, ai ít nhất? |
| Phân tán | Ai lệch khỏi đám đông? |
| Thanh ngưỡng | Còn cách hạn bao xa? |

**BỐ CỤC LƯỚI** `sửa 23/08`. Hình xếp **hai cột** trên màn hình rộng, không phải mười hai khối kéo
hết bề ngang: một hình chiếm trọn chiều ngang thì phải cuộn mới thấy hình kế tiếp, mà mắt không so
được hai hình không cùng nằm trong tầm nhìn. Chỉ khối có **dòng người** (tên · thanh · nhãn xu
hướng) mới chiếm trọn.

**Chú thích gom về MỘT chỗ** `sửa 23/08`. Dưới mỗi hình chỉ còn chú thích màu; phần *mốc của từng
chỉ số*, *luật nhãn xu hướng* và *cách xử lý kỳ đang chạy* nằm trong khối **Cách tính** gấp lại ở
cuối trang. In chúng dưới từng hình thì mỗi khối gánh thêm bốn dòng chữ xám, và cả trang thành trang
chữ có hình xen kẽ.

**Nhãn trục ngắn** `mới 23/08` — `T34` · `8/26` · `Q3/26` · `2026`. Nhãn đầy đủ (*"Tuần 34 ·
17/08–23/08"*) vẫn dùng ở câu tóm tắt cho trình đọc màn hình. Bước nhảy giữa các nhãn **tự tính**
theo bề rộng còn trống và độ dài nhãn, nên chúng không bao giờ đè lên nhau.

**Khối theo vai trò:**

| Vai trò | Hình |
|---|---|
| TDV | Đường *hồ sơ của tôi* kèm **trung vị công ty** để so · cột chồng kết cục |
| Trưởng bộ phận | **Xếp hạng TDV gửi hồ sơ tới bàn mình** · cơ cấu chất lượng hồ sơ · số ngày sửa lại · khối lượng ký của chính mình |
| Kế toán | Hai hàng đợi L1/L2 · giá trị CSBH có hiệu lực theo kỳ |
| Sale Admin | Bàn giao và xuất hợp đồng · số ngày làm bản cứng |
| Ban lãnh đạo | Vào/ra luồng · kết cục · phễu duyệt · chiết khấu theo nhóm · thời gian từng bước · **xếp hạng và phân tán theo từng TDV** |
| Quản trị hệ thống | **Không con số hồ sơ nào** — hoạt động hệ thống theo kỳ, đếm từ nhật ký |

### 9.2c. Theo dõi từng trình dược viên `mới 23/08`

Ban lãnh đạo theo dõi hiệu quả của **cả công ty lẫn từng TDV**; Trưởng bộ phận cũng vậy, trong phạm
vi của mình. Bốn vai trò còn lại **không** có chiều người.

**Phạm vi "TDV của tôi" — phương án A đã chốt.** Hệ thống không có cây tổ chức (`16/08`), nên "TDV
thuộc quản lý" đọc từ dữ liệu là: **người có hồ sơ trong phạm vi của người xem**. Ban lãnh đạo thấy
toàn bộ, Trưởng bộ phận thấy những người đã gửi hồ sơ tới bàn mình. Không thêm bảng nào, không mở
lại quyết định về cây phân quyền.

> **Danh sách người lấy theo CẢ CỬA SỔ, không theo kỳ đang xem.** Lấy theo kỳ thì người ngừng gửi
> hẳn biến mất khỏi bảng — mà đó đúng là ca *chững* nặng nhất. Ai không có hồ sơ nào trong kỳ này
> vẫn hiện, với số 0.

**"Hiệu quả" đo bằng đúng dữ liệu phần mềm đang có** `chốt 23/08`: số CSBH có hiệu lực · tỷ lệ bị
trả lại · số ngày từ gửi duyệt tới có hiệu lực · tổng giá thu về. Bốn chỉ số ấy đo **việc chạy hồ
sơ CSBH**, **không đo doanh số bán hàng** — phần mềm không có dữ liệu bán hàng — và câu giới hạn
này in ngay dưới tiêu đề khối, không nằm trong chú thích gấp lại.

**Nhãn xu hướng** — *đang lên · đi ngang · chững lại · sụt mạnh* — tính ở máy chủ theo một luật duy
nhất cho cả hai vai trò: so trung bình **3 kỳ đã đóng** gần nhất với 3 kỳ trước đó, lệch từ 15% mới
đổi nhãn, từ 30% trở xuống là *sụt mạnh*. **Kỳ đang chạy không tham gia phép so** — nó chưa đủ
ngày, và tính nó vào thì đầu mỗi kỳ ai cũng "đang xuống". Nhãn hiện bằng **chữ** kèm mũi tên, không
chỉ bằng màu.

**Trưởng bộ phận hỏi thêm một câu của riêng họ**: *hồ sơ của ai làm tôi mất công nhất*. Trả lời
bằng thanh **100% chia đoạn** — ký thẳng lần đầu · trả lại 1 lần · trả lại từ 2 lần · từ chối ·
đang xử lý — chứ không bằng một cột xếp hạng ngược, và cơ cấu chứ không phải số tuyệt đối: để số
tuyệt đối thì người gửi nhiều luôn có vệt đỏ dài nhất. Kèm **số ngày từ lúc bị trả lại tới lúc gửi
lại**, quãng ăn thẳng vào SLA 14 ngày mà không ai để ý vì lúc đó hồ sơ nằm ở bàn TDV.

**Bấm một người thì lọc tại chỗ** `chốt 23/08`, không mở màn hình riêng; **không có chức năng đặt
hai TDV cạnh nhau để so**.

> **Quản trị hệ thống không có chỉ số hồ sơ nào**, và đó là quyết định chứ không phải thiếu sót:
> phạm vi dữ liệu của vai trò này rỗng (`16/08`), nên mọi con số hồ sơ sẽ bằng 0 — đúng về kỹ thuật,
> đọc ra nghĩa hoàn toàn sai. Khối của họ đếm dòng nhật ký, và **chỉ trong cửa sổ sáu tháng** như
> mọi đường đọc nhật ký khác (`22/08`); chuỗi kỳ dài hơn thì bị cắt và số kỳ bị cắt được nói ra.

Màn hình này **không nhận bộ lọc 9 tiêu chí**. "Hoạt động của quý 3" chỉ có nghĩa trên toàn bộ phạm
vi của người xem; lọc thêm rồi vẫn gọi tên như cũ là đặt hai con số của hai tập hồ sơ khác nhau cạnh
nhau mà không gì phân biệt.

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

**Không loại nào gửi email** `sửa 18/08`. Bản trước gửi thư tới TDV phụ trách khi hồ sơ *Đang có hiệu
lực* bị lệch; khách hàng yêu cầu bỏ. Chênh lệch chỉ hiện trên màn hình, ở hai chỗ:

- box *Yêu cầu cập nhật* trên trang Tổng quan;
- khối cảnh báo **ngay trên màn hình hồ sơ**, phía trên bảng dòng sản phẩm `18/08` — nên mở hồ sơ
  thẳng từ hộp việc hay từ danh sách vẫn thấy, không phải ghé qua trang Tổng quan trước.

**Box không có nút nào.** Việc phải làm khác nhau theo vai trò và theo bước — trả lại để sửa, cứ
duyệt vì chênh lệch không đáng kể, hay lập một CSBH mới — và đó là quyết định của người.

**Ẩn hẳn khi không có gì lệch.** Đây là màn hình mở mỗi sáng; một khối rỗng lặp lại mỗi ngày là khối
người dùng ngừng nhìn, và đúng hôm nó có nội dung thì họ cũng không nhìn.

Ban lãnh đạo và Quản trị hệ thống **không có box này**: cả hai nằm ngoài luồng duyệt.

> **Lưu ý khi dựng:** địa chỉ đăng ký là text tự do nên chỉ lọc được kiểu “có chứa” — và từ
> `sửa 16/08` đó là cách lọc theo địa bàn DUY NHẤT còn lại, vì trường Tỉnh/thành đã bỏ.

---

## 10. Nhật ký, phiên bản và bảo mật

- Lưu người tạo, sửa, ký số, tiếp nhận, trả lại, xuất hợp đồng, in và tải scan.
- **KHÔNG lưu việc XEM file** `sửa 19/08`. Bỏ hẳn khỏi yêu cầu, không phải hoãn.
  > Xem là mở tệp trong phần mềm rồi đóng; tải là đưa một bản sao ra khỏi hệ thống. Chỉ việc thứ hai
  > đáng ghi. Ghi cả hai thì mỗi lần liếc màn hình thành một dòng, và những dòng nói về bước duyệt
  > bị dìm mất — lịch sử hồ sơ sinh ra để kể chuyện hồ sơ đã đi qua tay ai, không phải để đếm lượt
  > mở màn hình.
- **Ai được đụng vào tệp nào** `mới 20/08`: bản cứng đã scan — **chỉ Sale Admin**; giấy tờ của hồ sơ
  — **chỉ TDV**, và chỉ khi hồ sơ còn sửa được; hồ sơ pháp lý khách hàng — **chỉ TDV phụ trách khách
  hàng ấy**. Vai trò khác xem và tải bình thường, nhưng không thấy nút gỡ lẫn vùng tải lên.
- **Màn hình hồ sơ tách HAI KHỐI TỆP** `mới 23/08`: *Giấy tờ hồ sơ* (TDV đính lúc lập) và *Bản cứng*
  (Sale Admin scan ở B8). Vùng tải lên và dấu gỡ chỉ hiện ở **đúng khối của loại tệp** người ấy được
  đụng vào — ở hồ sơ *Nháp*, khối *Bản cứng* không cho TDV tải gì lên.
  > Một khối tên *Bản cứng* chứa cả hai loại thì ở hồ sơ Nháp, TDV thấy vùng kéo thả nằm dưới đúng
  > cái tiêu đề ấy — đọc ra là "tôi đang tải bản cứng lên lúc hồ sơ còn nháp". Bản cứng là bản giấy
  > đã ký, chưa tồn tại cho tới B8.
  > Bản trước cho cả bốn vai trò trong luồng. Bản scan là bản giấy có chữ ký khách hàng, do chính
  > Sale Admin in ra, trình ký rồi scan lại — không ai khác cầm nó trong tay. Và gỡ nó ra thì chặn
  > luôn bước bàn giao.
- **Lịch sử của hồ sơ ghi lượt TẢI XUỐNG BẢN CỨNG** `sửa 20/08`: bản scan và tệp đính kèm — kèm
  người tải và thời điểm. Chúng nằm cùng chỗ với các bước duyệt vì cùng trả lời một câu: hồ sơ này
  đã đi qua tay ai.
  > **Mở ra XEM thì không ghi.** Phần mềm phân biệt xem với tải: xem là mở trong phần mềm rồi đóng,
  > tải là đưa một bản sao ra khỏi hệ thống.
  > **Bản mềm CSBH và hợp đồng KHÔNG ghi gì cả** `sửa 20/08` — kể cả lượt tải. Bản trước ghi cả
  > bốn loại (19/08); khách hàng bỏ hai loại đầu ngày 20/08. Lý do là chính lý do đã dùng để loại
  > lượt XEM: bản mềm và hợp đồng là thứ người ta mở ra ĐỌC, mỗi hồ sơ vài lần một buổi, nên những
  > dòng ấy chỉ làm dày lịch sử. Bản scan thì khác — nó mang chữ ký khách hàng, và *"ai đã lấy nó ra
  > khỏi hệ thống"* là một câu hỏi kiểm soát thật.
  >
  > Dấu **đã xuất hợp đồng** thì GIỮ: nó không phải một dòng lịch sử mà là một trạng thái của hồ sơ
  > (muc 8.3 hỏi *"hồ sơ này đã có hợp đồng chưa"*), và nó vẫn đóng ở cả đường xem lẫn đường tải.
  > Những dòng *Tải bản mềm CSBH* / *Tải bản hợp đồng* đã ghi trước đó thì **xoá hẳn** — phần mềm
  > chưa bàn giao nên chúng đều do bộ nạp demo và các lượt chạy kiểm thử sinh ra, và để lại là bày
  > ra ở bản demo một loại dòng mà phần mềm không còn sinh nữa.
- Lưu giá trị **trước và sau** của dữ liệu quan trọng, kèm lý do thay đổi.
- **Nhật ký chỉ ghi thêm** — chặn sửa và xóa ở tầng cơ sở dữ liệu, không chỉ ở ứng dụng.
- **Nhật ký hệ thống chỉ Quản trị hệ thống đọc** `mới 21/08`. Bốn vai trò trong luồng duyệt không
  đọc được, và Ban lãnh đạo cũng thôi từ ngày này — xem mục 2.6. *Lịch sử hồ sơ* thì khác: ai mở
  được hồ sơ thì đọc được lịch sử của chính hồ sơ ấy.
- **Cửa sổ audit: 6 tháng gần nhất** `mới 22/08`. Phần mềm phải tra ngược được sáu tháng; ô chọn
  khoảng thời gian không nhận mốc xa hơn, và **máy chủ từ chối ở tầng API** chứ không chỉ ẩn ô trên
  màn hình.
  > **Dữ liệu cũ hơn sáu tháng thì GIỮ NGUYÊN, không xoá.** Sáu tháng là *bảo đảm*, không phải
  > *giới hạn*. Xoá khỏi bảng nhật ký đòi tắt chính cái chốt chặn "chỉ ghi thêm" ở tầng CSDL — mở
  > đúng cánh cửa mà điều khoản trên vừa khoá, và đổi lấy một chút dung lượng đĩa thì không đáng.
  > Ngày dung lượng thật sự thành vấn đề thì bàn tới việc chuyển sang kho lạnh, không phải xoá.
- **Nhật ký ghi cả việc TÀI KHOẢN và PHIÊN ĐĂNG NHẬP** `mới 22/08`: đăng nhập thành công · đăng nhập
  thất bại kèm **lý do thật** · khoá tạm sau nhiều lần sai · đăng xuất · tạo tài khoản · vô hiệu hoá
  và mở lại · đổi mật khẩu (nói rõ tự đổi, kích hoạt qua thư mời, hay đặt lại sau khi quên).
  > Người gọi vẫn nhận **đúng một mã lỗi** cho mọi nhánh đăng nhập hỏng — phân biệt ra là xác nhận
  > giúp người dò rằng tài khoản đó có thật. Nhật ký thì ngược lại: nó chỉ Quản trị đọc được, và
  > *"sai mật khẩu"* với *"tài khoản đã khoá"* là hai câu chuyện an ninh khác hẳn nhau.
  >
  > Gõ vào một tên **không tồn tại** cũng ghi lại chính tên đã gõ: một chuỗi thử liên tiếp vào những
  > tên không có thật chính là hình dạng của một lượt dò.
  >
  > **Không ghi mật khẩu, không ghi token, không ghi thân request.** Nhật ký trả lời "ai làm gì lúc
  > nào", không phải "họ đã gõ gì".
- **Nhật ký KHÔNG có đường xuất ra file** `mới 22/08`. Đọc trên màn hình, nên bộ lọc và phân trang
  phải đủ để tra tại chỗ: khoảng thời gian, người thực hiện, hành động, đối tượng, địa chỉ IP và mã
  tra cứu. Việc ghi lại **lượt xuất Excel của báo cáo hồ sơ** thì vẫn giữ — đó là một tập dữ liệu
  nghiệp vụ rời khỏi hệ thống, chuyện khác hẳn.
- Mỗi mốc thời gian là **một cột riêng** trên hồ sơ kèm người thực hiện; báo cáo và SLA truy vấn
  trực tiếp từ các cột này, nhật ký chỉ dùng để truy vết.
- Mỗi lần trả lại, bổ sung sản phẩm, chỉnh sửa sản phẩm hoặc thay đổi giá đều tạo phiên bản mới;
  không ghi đè file đã ký.
- Khi kế toán yêu cầu in lại, **bản scan cũ được GIỮ NGUYÊN** `sửa 19/08`. Sale Admin **chủ động gỡ
  và tải bản mới lên**. Màn hình đánh dấu rõ bản scan đang đính kèm là bản đã bị yêu cầu in lại, và
  **không chặn** bàn giao — quyết định thuộc về Sale Admin, vì có lần bản giấy hỏng lúc chuyển phát
  chứ không phải bản in sai.
  > Luật cũ xóa bản scan ngay khi kế toán bấm. Đổi vì kế toán chê **bản giấy**, mà nhiều khi chỉ so
  > với bản scan đang có mới thấy hỏng ở đâu — xóa ngay là lấy mất vật đối chiếu của đúng người sắp
  > phải sửa.
- Gỡ một bản scan là **gỡ thật** khỏi kho lưu trữ, không giữ bản sao ảnh. Nhật ký vẫn ghi lại việc
  đã có một bản scan bị hủy: ai hủy, lúc nào, lý do gì.
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
  > **Mười ba mục này là yêu cầu của bảng XEM — bảng do hệ thống dựng** `làm rõ 24/08`, và bảng ấy
  > luôn đủ cả mười ba. **Mẫu bản mềm do Quản trị soạn là một thứ khác**: nó chỉ bị ép **9 trên
  > 13**, vì bốn mục kia hoặc cố định (*thông tin công ty*), hoặc do người soạn quyết (*CPBH*),
  > hoặc **còn đang đổi** lúc dựng văn bản (*trạng thái*, *thời gian duyệt*). Xem mục 6.4.

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

**Nhật ký kiểm toán** `mới 22/08` — cửa sổ audit **6 tháng gần nhất**, máy chủ chặn ở tầng API; dữ
liệu cũ hơn **giữ nguyên, không xoá** vì xoá đòi tắt chốt "chỉ ghi thêm" · **không có đường xuất ra
file**, đọc trên màn hình bằng bộ lọc.

**Trang *Báo cáo* thành trang *Thống kê*** `mới 22/08` — đổi tên và đổi hẳn nội dung. Trang cũ bày
lại chính những con số của *Tổng quan* (tổng hồ sơ, đang chờ, quá hạn, tiến độ theo trạng thái, khối
SLA) nên mở ra không thấy gì mới. Trang mới chỉ nói về **hoạt động theo kỳ**: tuần · tháng · quý ·
năm, mỗi vai trò một nhịp mặc định và một bộ chỉ số riêng. Bốn quy tắc số liệu ở muc 9.2b —
tồn-tại-thời-điểm không trộn với dòng-chảy-trong-kỳ; mỗi chỉ số neo vào một mốc và nói ra mốc ấy; kỳ
cắt theo giờ Việt Nam; kỳ đang chạy so **cùng số ngày** với kỳ trước. Đường dẫn cũ `/bao-cao` vẫn
sống, trỏ về màn hình mới.

> **Quản trị hệ thống không có chỉ số hồ sơ nào** trên trang này — phạm vi dữ liệu của họ rỗng nên
> mọi con số sẽ là 0. Khối của họ đếm **hoạt động hệ thống theo kỳ** từ nhật ký, trong đúng cửa sổ
> sáu tháng nêu ngay ở trên.

**Thống kê là BIỂU ĐỒ, và soi được từng TDV** `mới 23/08` — bản bảng số bị bác, làm lại bằng sáu
dạng hình. Ban lãnh đạo và Trưởng bộ phận theo dõi được hiệu quả **từng trình dược viên**; phạm vi
"TDV của tôi" đọc từ chính phạm vi dữ liệu (*phương án A*), không dựng lại cây tổ chức. "Hiệu quả"
chỉ gồm những gì phần mềm đang có, và màn hình nói rõ **đây không phải doanh số**. Bấm một người thì
lọc tại chỗ; không có chức năng so hai người cạnh nhau. Chi tiết ở muc 9.2c.

**Thông báo trên web soi gương hộp thư** `mới 23/08` — một cái chuông ở thanh trên cùng, mang **con
số** chưa đọc (`99+` khi vượt trần), sát trái thẻ tài khoản. Quy tắc phạm vi chốt gọn một câu: *mọi
hành động dẫn tới gửi email cho một người đều là một thông báo của người ấy, ngoài ra không có gì
khác* — nên danh sách người nhận thông báo **là chính** danh sách người nhận thư, đọc ở cùng một
chỗ, không có bảng tra thứ hai. Bấm vào một thông báo thì tới **đúng địa chỉ mà thư dẫn tới**.

> **Hai lá thư tài khoản đứng ngoài, và không phải vì thẩm mỹ.** Thư kích hoạt và thư đặt lại mật
> khẩu mang **token thô** trong thân — thứ `ONB-15` chỉ cho phép tồn tại trong bộ nhớ tiến trình và
> trong email, còn CSDL chỉ giữ bản băm. Bảng thông báo thì đọc được qua API. Chi tiết ở muc 9.1b.

**Mẫu bản mềm đóng băng vào hồ sơ, và mẫu chỉ vô hiệu chứ không xoá** `mới 23/08` — hai quyết định
KHOÁ LẪN NHAU, bỏ một cái thì cái kia thành lỗi. TDV chọn mẫu trong hộp *Gửi duyệt*, ngay trên bản
A4 xem trước; từ lúc bấm gửi thì **không vai trò nào chọn lại**, mọi người xem đúng bản người gửi đã
chọn. Kéo theo: gửi duyệt **bắt buộc** chọn mẫu, chặn ở máy chủ; gửi lại sau khi bị trả về thì chọn
lại và ghi đè. Mẫu **không xoá được nữa** — chỉ vô hiệu hoá (gõ lại tên mẫu) và bật lại; vô hiệu hoá
rút mẫu khỏi ô chọn mà **không đụng tới hồ sơ đã gắn nó**. Hợp đồng giữ nguyên đường cũ — Kế toán và
Sale Admin vẫn chọn mẫu ở mỗi lượt xuất — nhưng cũng **phải chọn**: không còn mẫu mặc định ngầm ở bất
kỳ đâu. Chi tiết ở mục 6.4.

> **Vì sao hai quyết định không tách rời được.** Xoá một mẫu đang có hồ sơ trỏ tới là làm hỏng vĩnh
> viễn bản mềm của những hồ sơ ấy, mà chúng đã khoá sửa từ lúc gửi duyệt — không ai chữa được, và
> người bấm xoá không có màn hình nào cho biết mình vừa làm gì. Nên bỏ đường xoá không phải là một
> yêu cầu thứ hai, nó là điều kiện để đường thứ nhất an toàn.

**Mẫu bản mềm thôi bắt buộc có *trạng thái* và *thời gian duyệt*** `mới 24/08` — hai mục ấy rời khỏi
danh sách ép lúc lưu mẫu; *ngày KT nhận lần 1* vốn chưa bao giờ bị ép. Lý do không phải nới lỏng cho
dễ soạn: chúng là hai mục **còn đang đổi** trong lúc hồ sơ đi qua luồng duyệt, nên một bản mềm dựng
lúc Trưởng bộ phận ký buộc phải in ra *Chờ kế toán duyệt lần 1* và một ô *thời gian duyệt* rỗng — ép
có mặt là ép in một câu sai ở mọi hồ sơ chưa tới B10. Hai trường **vẫn đặt ô được**, hệ thống chỉ
thôi ép, và ba mẫu bàn giao kèm phần mềm vẫn in cả hai. Chi tiết ở mục 6.4.

> **Mười ba mục của mục 11.1 là yêu cầu của bảng CSBH XEM**, tức bảng do hệ thống dựng — bảng ấy
> vẫn đủ cả mười ba. Đem nguyên yêu cầu ấy áp sang **mẫu do Quản trị vẽ** là chỗ `20/08` đọc quá
> lời. Cộng bốn mục nay tự chịu trách nhiệm, phép kiểm lúc lưu mẫu còn **9 trên 13**.

**Thông tin khách hàng đóng băng vào hồ sơ, và chữ ký huỷ khi trả lại** `mới 24/08` — tám trường
khách hàng in trên bản CSBH (kể cả **công nợ**) cùng **họ tên người đề nghị** chụp lại vào hồ sơ lúc
gửi duyệt; **họ tên Trưởng bộ phận đã ký** chụp lúc ký. Sửa hồ sơ khách hàng hay đổi họ tên tài
khoản từ nay không làm đổi nội dung một hồ sơ đã gửi duyệt. Ảnh chụp **làm mới ở mỗi lượt gửi**, nên
hồ sơ bị trả lại vì sai thông tin khách hàng vẫn chữa được: sửa rồi gửi lại là có số mới. Chi tiết ở
mục 5, ý 8.

> **Đo được trước khi sửa.** Trên bản chạy thật: 317 hồ sơ đã qua bước Trưởng bộ phận ký, và tám
> trường khách hàng của cả 317 hồ sơ ấy đọc sống từ hồ sơ khách hàng ở **mỗi** lần mở. Đổi một dòng
> địa chỉ là đổi nội dung của hàng chục tờ giấy đã ký, không cảnh báo, không dấu vết.
>
> **Và nó lộ ra một lỗ hổng khác của quy trình.** Quy trình đã quy định hồ sơ bị trả về phải đi lại
> **toàn bộ** vòng duyệt *kể cả bước ký số*. Nhưng dấu ký của Trưởng bộ phận chưa bao giờ được xoá,
> nên hồ sơ bị Kế toán trả về **sau khi đã ký** thì gửi lại xong **không ký lại được** — nó nằm lại
> ở *Chờ TBP duyệt*, quá hạn sau 14 ngày rồi tự xoá sau 3 ngày nữa. Từ `24/08`, quay về *Yêu cầu
> chỉnh sửa* là chữ ký mất hiệu lực và hồ sơ ký lại được bình thường.

**Chỉ TDV phụ trách sửa được nội dung hồ sơ** `nói rõ 23/08` — **không phải một quyết định mới**, mà
là một luật cũ được viết ra sau khi phần mềm bị bắt gặp làm khác. Đợt rà tìm thấy và dựng lại được
trên bản chạy thật: **Ban lãnh đạo — vai trò chỉ đọc — xoá được một dòng sản phẩm khỏi hồ sơ *Nháp*
của người khác**, và **Kế toán hoặc Trưởng bộ phận xoá được dòng khỏi hồ sơ họ vừa trả về** cho TDV
sửa. Từ nay: thêm, sửa, xoá dòng sản phẩm và đổi ngày áp dụng đều đòi **đúng TDV đang phụ trách hồ
sơ ấy**; có tên trên hồ sơ chỉ cho quyền xem lại việc mình đã làm. Xem mục 5.

> **Vì sao lỗi này sống lâu mà không ai thấy.** Màn hình chưa bao giờ bày cái nút ấy ra cho vai trò
> nào khác, và bảng quyền của giao diện vẫn đúng suốt thời gian đó — nên không có triệu chứng nào để
> nhìn thấy. Lỗ hổng chỉ mở với người gọi thẳng API. Đó cũng là lý do phép kiểm mới không kiểm màn
> hình mà **quét toàn bộ đường ghi của máy chủ** và gọi thật từng đường bằng tài khoản Ban lãnh đạo.

**Hồ sơ đi theo khách hàng** `mới 21/08`. Đổi *TDV phụ trách* của một khách hàng — dù qua bàn giao
lúc vô hiệu hoá tài khoản, hay qua màn hình khách hàng — thì **mọi hồ sơ của khách ấy sang tay
cùng**, kể cả *Từ chối* và *Hết hiệu lực*; chỉ hồ sơ *Đã xoá* đứng ngoài.

> **Vì sao rộng hơn luật bàn giao ở trên.** Phạm vi đọc hồ sơ có hai bản cài đặt phải trả lời giống
> hệt nhau: màn hình *Hồ sơ CSBH* đọc read-model báo cáo, màn hình chi tiết đọc thẳng hồ sơ. Tới
> `20/08` bản thứ nhất tính phạm vi theo **TDV phụ trách khách hàng** còn bản thứ hai theo **cột
> người trên chính hồ sơ** — nên đổi tay khách hàng làm hai bên tách đôi, và tách theo hướng tệ
> nhất: **danh sách bày hồ sơ ra, bấm vào thì báo không có quyền**. Đo được: đổi TDV phụ trách một
> khách có 7 hồ sơ thì người nhận thấy đủ 7 dòng — gồm một bản *Đang có hiệu lực* — và cả 7 đều bị
> từ chối khi mở, còn *Lịch sử CSBH* của khách thì rỗng trơn.
>
> Cũng vì thế mà người tiếp quản một khách hàng **đọc được lịch sử chính sách** của khách đó, thay
> vì thấy một khách hàng không có quá khứ.

**Thư báo người nhận bàn giao** `mới 21/08` — **một** lá cho cả lượt: *bạn được bàn giao bao nhiêu
khách hàng, từ ai*, kèm danh sách mã và tên khách. Không kể hồ sơ; số hồ sơ phải xử lý thì khối
*Việc của tôi* trên trang Tổng quan nói chính xác hơn và luôn cập nhật. Trước đó người nhận **không
được báo gì cả** — họ chỉ phát hiện ra khi mở hộp việc và thấy thêm hàng trăm hồ sơ lạ.

**Ban lãnh đạo thôi đọc nhật ký hệ thống** `mới 21/08` — bỏ cả mục menu *Nhật ký* lẫn khối *Hoạt
động gần đây* trên trang tổng quan của vai trò này; nhật ký hệ thống chỉ còn của Quản trị hệ thống.
Lý do: nhật ký là **vết kiểm soát** (IP, mã tra cứu, giá trị trước/sau của từng lần sửa) phục vụ
truy vết sự cố, không phải dữ liệu điều hành — còn thứ Ban lãnh đạo cần, *"hồ sơ này đã đi qua tay
ai"*, thì *Lịch sử hồ sơ* trong chính hồ sơ kể đủ và họ vẫn mở được mọi hồ sơ. "Toàn quyền đọc" ở
mục 2.6 từ nay hiểu là toàn quyền đọc **dữ liệu nghiệp vụ**.

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
chỉnh sửa CSBH · trả lại bắt buộc nhập lý do · bản scan cũ **giữ nguyên** khi yêu cầu in lại `sửa 19/08`.

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
trong file Excel — bộ lọc còn **11 tiêu chí**, và còn **9** sau lần rà 21/08 · dữ liệu đã nhập của ba trường ấy **mất theo**, có chủ
ý: giữ lại cột là giữ lại màn hình nhập, và dữ liệu nhập vào sẽ có người tin là có nghĩa.

**Khác** — chữ ký điện tử nội bộ · SLA 14 ngày tính cả cuối tuần · một luồng email cho mỗi khách hàng.
