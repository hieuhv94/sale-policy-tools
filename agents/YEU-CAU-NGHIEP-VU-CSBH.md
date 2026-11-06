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

- Tạo khách hàng, nhập thông tin và tải hồ sơ pháp lý — **chỉ TDV phụ trách khách hàng ấy mới thêm
  và gỡ được giấy tờ** `sửa 20/08`, **và mới sửa được thông tin khách hàng** `sửa 28/09`; vai trò
  khác xem và tải. Mã khách hàng do kế toán cấp bên ngoài
  phần mềm; hệ thống chỉ chặn tạo mới trùng mã đã có.
- Lập CSBH: chọn khách hàng, chọn sản phẩm từ danh mục, nhập giá bán buôn và các khoản chi phí bán
  hàng. **Số khoản CPBH tuỳ từng dòng sản phẩm**, không cố định bốn `sửa 15/08`.
- **Sửa một dòng đã có** `mới 15/08`: đổi giá bán buôn và các khoản chi phí. Sản phẩm của dòng thì
  không đổi được — đổi sản phẩm là xoá dòng này rồi thêm dòng khác.
- Xem bản CSBH trước khi gửi duyệt; sửa và gửi lại khi bị trả về.
- Khi bổ sung hoặc chỉnh sửa chính sách: đưa lại **toàn bộ** sản phẩm cũ vào hồ sơ mới.

**Không được làm** — sửa danh mục sản phẩm, giá bán Công ty, ngưỡng chiết khấu; sửa hồ sơ sau khi
đã gửi duyệt.

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

**Tiếp nhận lần 1 (L1)** — xem CSBH đã ký số, mở thông tin khách hàng của hồ sơ để đối chiếu
(**chỉ xem, không sửa** khách hàng `sửa 28/09`).
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
- Không sửa nội dung CSBH, không bỏ qua bước tiếp nhận lần 1. **Không sửa thông tin khách hàng**
  `sửa 28/09` — chỉ xem.

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
- **KHÔNG nhận bất kỳ thư hay thông báo nào** `mới 07/11` — không thư, không chuông, ở mọi bước và mọi
  loại thông báo (kể cả loại không gắn với hồ sơ). Hai lá thư của chính tài khoản (kích hoạt, đặt lại
  mật khẩu) vẫn gửi: đó là đường để có mật khẩu, không phải thông báo nghiệp vụ.
- Ký bản cứng là thao tác giấy do Sale Admin trình lên — phần mềm không có bước nào cho việc này.

### 2.7. Quản trị hệ thống

- Nhập và duy trì danh mục sản phẩm và giá, nhóm sản phẩm, chiết khấu quy định, danh mục tra cứu.
  **Cả hai loại văn bản mẫu thuộc vai trò này** `sửa 20/08` — mẫu hồ sơ CSBH và mẫu hợp đồng, ở màn
  hình *Văn bản mẫu*, hai thẻ. Bản trước giao mẫu hợp đồng cho Sale Admin (mục 8.2); khách hàng gộp
  về một chủ ngày 20/08. *Người ký* đã xoá hẳn — xem mục 6.4.
- Quản lý tài khoản, vai trò và cây phân quyền ở mục 2.1 — quy trình tạo tài khoản ở mục 2.8.
- Cấu hình SLA, mẫu email; xem nhật ký hệ thống.
- **Trang Vận hành** `mới 06/11` — trông coi phần mềm không cần vào máy chủ: sức khoẻ, ổ đĩa (một
  ngưỡng, thư khi vượt), sao lưu (xem · tải bản CSDL · xoá · *Sao lưu ngay* · lịch và số bản giữ),
  tệp log (xem hôm nay · tải · xoá · lịch nén), thư hỏng và hạn xử lý, lịch tự động. Người dùng
  vai trò này **không có chuyên môn IT**: trang không dùng thuật ngữ kỹ thuật, không bày câu lệnh
  máy chủ, và **không có phục hồi** — phục hồi là việc của người vận hành máy chủ. Xem mục 10.
- Giai đoạn 2: nhập dữ liệu CSBH cũ từ Excel — chỉ vai trò này được thực hiện.
- Không tham gia luồng duyệt. Mọi thay đổi danh mục vào nhật ký kèm giá trị trước và sau.
- Với khách hàng: **chỉ đổi TDV phụ trách**, không sửa thông tin khách hàng `sửa 28/09`.

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
- **Địa chỉ phải thuộc tên miền được phép nhận thư** `mới 26/08` — xem danh sách khai lúc chạy ở
  Phụ lục B. Ngoài danh sách thì **chặn ngay tại ô nhập**, kể ra các tên miền đang được phép, và
  không tạo tài khoản nào. Bản trước vẫn tạo tài khoản rồi để lá thư mời hỏng, mà thư mời là đường
  duy nhất để tài khoản có mật khẩu — nên thứ để lại là một tài khoản có thật, chiếm mất tên đăng
  nhập và địa chỉ, không bao giờ đăng nhập được. Trên máy chủ thật danh sách này luôn có; ở bản demo
  nó để trống, và để trống nghĩa là không lọc.
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
- **Hết phiên giữa chừng thì che kín màn hình** `sửa 04/11` `sửa 05/11` — ô đăng nhập lại hiện trên một
  nền đặc, **trên mọi lớp** (kể cả hộp lỗi, thông báo nổi) và ở **mọi màn hình** (kể cả màn hình đổi mật
  khẩu bắt buộc); màn hình đang làm dở được GIỮ nhưng không nhìn thấy, không bấm, không Tab được.
  Phiên đã chết thì dữ liệu nghiệp vụ không được bày ra cho người chưa xác nhận lại.
  - Ô đăng nhập lại có **đăng nhập Google**, chạy trong **cửa sổ bật lên** để không rời trang.
  - **Người khác** đăng nhập vào ô ấy thì màn hình và bản nháp của người trước bị **bỏ**, về Tổng quan.
  - **Nhiều tab**: đăng xuất ở một tab là đăng xuất mọi tab; đăng nhập lại ở một tab thì ô ở các tab
    kia tự đóng; tab để không thì hỏi lại máy chủ khi được mở lại và mỗi 5 phút.
- Mọi bước ở trên vào nhật ký. Nhật ký ghi ai tạo, tạo lúc nào, gửi lại mấy lần — **không bao giờ ghi
  mật khẩu hay nội dung liên kết kích hoạt**.
- **Đăng nhập bằng tài khoản Google** `mới 04/11` — màn hình đăng nhập có nút *Đăng nhập bằng
  Google*; bấm vào thì Google hiện hộp **chọn tài khoản**, chọn xong là vào thẳng phần mềm, không gõ
  tên hay mật khẩu. Ba luật:
  - **Chỉ ghép với tài khoản đã có**, theo **email** — email của tài khoản Google phải trùng email
    Quản trị đã cấp (không phân biệt hoa thường), và tài khoản phải đang hoạt động, không bị khoá
    tạm. **Không tự tạo tài khoản**: luật *không tự đăng ký* ở đầu mục giữ nguyên.
  - Chỉ nhận tài khoản thuộc **miền Google Workspace của Công ty** (khai lúc cài, `GOOGLE_HOSTED_DOMAIN`)
    và có email **Google đã xác minh**.
  - Tài khoản **chưa kích hoạt** đăng nhập Google được và **coi như kích hoạt** — Google vừa chứng minh
    hộp thư ấy có thật, đúng thứ liên kết trong thư mời chứng minh — nên email cũng được tính là **đã
    xác nhận**, và **liên kết trong thư mời bị thu hồi**. Người này không có mật khẩu; muốn có thì dùng
    *Quên mật khẩu*.
  - Mọi lượt hỏng (email không khớp, tài khoản vô hiệu hoá, ngoài miền…) báo **một câu chung**, cùng
    lý do với đăng nhập mật khẩu; nhật ký ghi lý do thật. Không khai cấu hình Google lúc cài thì nút
    **không hiện**.

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
| B1 | TDV | Nháp | — | Tạo hồ sơ: khách hàng, sản phẩm, CPBH, **ngày áp dụng của từng sản phẩm** `sửa 07/09`, file đính kèm |
| B2 | Hệ thống | Nháp | — | Tự tính, đối chiếu danh mục, kiểm tra trùng sản phẩm và CSBH hiện có, cảnh báo lỗi |
| B3 | TDV | Chờ TBP duyệt | TBP | Chọn Trưởng bộ phận và Kế toán, chốt và gửi duyệt. Hồ sơ khóa sửa; giá và ngưỡng đóng băng. **Không chọn văn bản mẫu** `sửa 29/08` — xem mục 6.4 |
| B4 | TBP — duyệt | **KT duyệt bản mềm** `sửa 19/08` | KT, TDV | Duyệt và ký số; file hiện người ký và ngày giờ ký. Hồ sơ sang thẳng bàn kế toán |
| B4B | TBP — không duyệt | Yêu cầu chỉnh sửa → B3 | TDV | Bắt buộc nhập lý do; hồ sơ mở khóa, tạo phiên bản mới |
| ~~B5~~ | ~~Hệ thống~~ | — | — | **Bỏ `19/08`** — xem ghi chú dưới bảng |
| B6A | Kế toán — nhận L1 | Sale Admin đang xử lý | SA, TBP, TDV | Tiếp nhận file mềm và **chọn Sale Admin xử lý bước sau** `sửa 16/08`; khách hàng đủ điều kiện xuất hàng và xuất VAT |
| B6B | Kế toán — không nhận L1 | Yêu cầu chỉnh sửa → B3 | TBP, TDV | Bắt buộc nhập lý do; duyệt và ký lại từ đầu |
| B7 | Kế toán **hoặc** Sale Admin | — | — | Xuất file hợp đồng (xem mục 8) |
| B8 | Sale Admin | Sale Admin đang xử lý | KT, TBP, TDV | **Tạo bản mềm** `sửa 31/08`, in, trình BLĐ ký, nhận lại, scan, tải lên. Bàn giao đòi CẢ HAI tệp |
| B9 | Sale Admin | KT duyệt bản cứng | KT, TBP, TDV | Bàn giao bản cứng |
| B10A | Kế toán — nhận L2 | **Đang có hiệu lực** | KT, TBP, SA, TDV | Đối chiếu bản cứng với lần 1; CSBH có hiệu lực ngay lúc này |
| B10B | Kế toán — không nhận L2 | Yêu cầu chỉnh sửa → B3 | KT, TBP, SA, TDV | Bắt buộc nhập lý do |
| B10C | Kế toán — yêu cầu in lại | **Sale Admin sửa bản cứng** `sửa 28/09` → B8 | SA, TBP, TDV | Bản scan cũ **giữ nguyên**; Sale Admin chủ động gỡ và thay `sửa 19/08`. Từ `28/09` là trạng thái **riêng**, không còn chung *Sale Admin đang xử lý* |
| B4C | TBP — **hoàn duyệt** `mới 07/09` | Yêu cầu chỉnh sửa → B3 | TDV, KT, SA | Rút lại chữ ký của chính mình ở **ba bước SAU B4**: B6 · B8 · B9/B10. Bắt buộc nhập lý do; chữ ký bị xoá và hồ sơ đi lại toàn bộ vòng duyệt |

**Bước B5 và trạng thái `TBP đã ký số` đã bỏ** `19/08`. Chúng chưa bao giờ hiện ra với người dùng:
hệ thống chuyển tiếp ngay trong cùng một giao dịch với lần TBP ký, nên không hồ sơ nào từng dừng lại
ở đó. Nhưng đó là **hai** lần chuyển bước, tức hai email, và **kế toán có tên trong cả hai** — mỗi
lần Trưởng bộ phận ký, kế toán nhận hai thư trong cùng một giây. Nay B4 sang thẳng *KT duyệt bản
mềm*: một bước, một thư, một dòng lịch sử. Chữ ký số và dấu thời gian vẫn được ghi y như cũ.

**Mọi lần trả lại đều tạo phiên bản mới.** Trả về Bước 3 nghĩa là đi lại toàn bộ vòng duyệt,
kể cả bước ký số của Trưởng bộ phận. Phiên bản cũ giữ nguyên trong lịch sử, kèm dữ liệu đã đóng băng của nó.

---

## 4. Trạng thái hồ sơ

| Trạng thái | Ý nghĩa | SLA |
|---|---|---|
| `Nháp` | Trạng thái đầu tiên, sửa tự do | — |
| `Chờ TBP duyệt` | Đã gửi duyệt, hồ sơ khóa sửa | 14 ngày |
| `KT duyệt bản mềm` | Chờ tiếp nhận file mềm — tên hiển thị đổi `18/08`, trước là *Chờ Kế toán L1* | 14 ngày |
| `Sale Admin đang xử lý` | In, trình ký, scan — bản cứng **lần đầu** | 14 ngày |
| `Sale Admin sửa bản cứng` `mới 28/09` | Kế toán **yêu cầu in lại** (B10C); Sale Admin làm lại bản cứng rồi bàn giao lại. TBP vẫn hoàn duyệt được | 14 ngày |
| `KT duyệt bản cứng` | Chờ tiếp nhận bản cứng — tên hiển thị đổi `18/08`, trước là *Chờ Kế toán L2* | 14 ngày |
| `Đang có hiệu lực` | CSBH đang áp dụng, vô thời hạn | — |
| `Hết hiệu lực` | Bị thay bởi một CSBH mới của cùng khách hàng | — |
| `Yêu cầu chỉnh sửa` | Bị trả lại, chờ TDV sửa | — |
| ~~`Từ chối`~~ | **BỎ HẲN `29/08`** — Trưởng bộ phận không còn nút ấy; họ **trả lại**, rồi TDV tự **xoá**. Xem Phụ lục B, mục *"BỎ HẲN trạng thái Từ chối"* | — |
| `Quá hạn duyệt` | Quá 14 ngày ở một trạng thái chờ. **Trạng thái kết thúc** `sửa 18/08` — không ai thao tác được nữa, và sau **3 ngày** hệ thống tự chuyển sang `Đã xóa` | — |
| `Đã xóa` | Người lập bỏ hẳn một hồ sơ bị trả lại — **trạng thái kết thúc** | — |

**Quy tắc**

- Mỗi trạng thái có một mã kỹ thuật và một nhãn hiển thị; danh sách trên là danh sách đóng — **mười
  một trạng thái** `sửa 28/09` (thêm *Sale Admin sửa bản cứng*; trước đó mười, từ `29/08`).
- Không dùng các tên cũ: “Bản Demo”, “Đang duyệt”, “Đã chuyển bước sau”, “Đang áp dụng”.
- ~~Hồ sơ ở `Từ chối` **không ai xóa được DÒNG**~~ `bỏ 29/08` — không còn trạng thái ấy. Hai cột
  `rejected_at` / `rejected_by` **VẪN CÒN** trong lược đồ và báo cáo vẫn đếm theo mốc ấy: nhật ký kể
  chuyện đã xảy ra, và hồ sơ bị từ chối trước ngày ấy phải còn tra được.
- **TDV xóa được hồ sơ ở hai trạng thái** `sửa 29/08`: `Nháp` và `Yêu cầu chỉnh sửa` (gồm cả ba đường
  bị trả về: TBP yêu cầu chỉnh sửa, Kế toán không tiếp nhận L1, Kế toán không tiếp nhận L2).
  Hai kết cục, hệ thống chọn theo trạng thái chứ không hỏi người dùng:
  - `Nháp` → **xóa hẳn, không ghi lịch sử**. Hồ sơ chưa gửi duyệt thì chưa ai ngoài người lập nhìn
    thấy; ghi một dòng "đã xóa" cho mỗi lần lập nhầm là biến nhật ký thành bãi rác và làm người lập
    ngại mở bản nháp.
  - `Yêu cầu chỉnh sửa` → chuyển `Đã xóa`, **ghi vào lịch sử hồ sơ**. Hồ sơ đã qua tay người khác và
    đã bị trả lại kèm lý do; xóa sạch dấu vết là làm biến mất phần việc của họ. Người đã trả hồ sơ
    lại nhận thư báo. Từ `29/08` đây là **đường kết thúc duy nhất** cho một hồ sơ Trưởng bộ phận
    không muốn duyệt: họ trả lại, người lập tự bỏ.
  Chỉ **TDV đang phụ trách** hồ sơ xóa được, không phải người đã lập ra nó — hai thứ khác nhau sau
  một lần bàn giao. Vai trò khác không xóa được gì, kể cả Quản trị hệ thống.
- Hồ sơ ở `Đã xóa` cũng **không ai xóa được** và không hành động nào đi ra được.
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

   **Và chỉ có MỘT hồ sơ CSBH đang xử lý** `mới 25/09` — tức ở một trong bảy trạng thái *Nháp* ·
   *Yêu cầu chỉnh sửa* · *Chờ TBP duyệt* · *Chờ KT duyệt L1* · *SA đang xử lý* · *SA sửa bản cứng*
   `thêm 28/09` · *KT duyệt bản cứng*.
   Bốn trạng thái **không tính**: *Đang có hiệu lực*, *Hết hiệu lực*, *Đã xoá*, và *Quá hạn duyệt*
   (trạng thái kết thúc, không ai thao tác được nữa). Nên một khách có tối đa hai hồ sơ "sống" cùng
   lúc: bản đang hiệu lực và bản thay thế đang đi luồng duyệt. Lập hồ sơ mới khi khách đã có một hồ
   sơ đang xử lý thì phần mềm từ chối và đưa thẳng tới hồ sơ ấy. Xem Phụ lục B, `25/09`.
2. **Mọi CSBH đều vô thời hạn.** Không có trường ngày hết hiệu lực, không có cảnh báo sắp hết hạn.
   Một CSBH chỉ hết hiệu lực khi một CSBH mới của cùng khách hàng được duyệt xong.
3. **CSBH có hiệu lực ngay khi kế toán tiếp nhận lần 2**, thời điểm đó cũng là ngày duyệt.
   *Ngày áp dụng* ghi trên CSBH chỉ là thông tin hiển thị, không chi phối trạng thái. Nếu ngày áp
   dụng rơi vào trước lúc duyệt xong thì không cần xử lý gì, vì CSBH cũ vẫn còn hiệu lực tới đúng
   thời điểm bản mới được duyệt.
4. **Phiên bản mới thừa kế toàn bộ sản phẩm cũ, và RÚT BỚT ĐƯỢC** `sửa 08/09`. Bổ sung hay chỉnh
   sửa đều tạo một CSBH mới đầy đủ và ký duyệt lại từ đầu; khi bản mới được duyệt thì bản cũ vô hiệu
   lực toàn bộ. Hiệu lực quản lý ở **cấp hồ sơ**, không cần mô hình cấp dòng.

   Phiên bản mới **chép sẵn** mọi mặt hàng của bản đang hiệu lực, nên người lập không phải nhập lại.
   Trình dược viên **rút bớt được** một mặt hàng khỏi bản mới — trước `08/09` việc này bị chặn hẳn
   (`MISSING_INHERITED_PRODUCT`), xem Phụ lục B.

   Rút một mặt hàng **KHÔNG làm dòng biến mất ngay**: nó chuyển sang trạng thái ***Đã xoá***, nằm lại
   bảng dưới dạng **làm mờ**, và đi cùng hồ sơ suốt luồng duyệt — vì bản cũ vô hiệu lực *toàn bộ*, nên
   một mặt hàng vắng mặt ở bản mới là một quyền lợi bị **thu hồi**, và bốn bàn duyệt phải nhìn thấy
   điều đó trước khi ký. Dòng chỉ **xoá hẳn khi hồ sơ sang *Đang có hiệu lực***.

   Ở **Nháp** và **Yêu cầu chỉnh sửa**, dòng đã rút **thêm lại được**, quay về nguyên số cũ. Đây là
   đường duy nhất đưa lại một mặt hàng đã **vô hiệu hoá trong danh mục**, vì đường thêm mới chặn nó
   (mục 8, `PRODUCT_DISABLED`).

   Bản mềm, hợp đồng và mọi báo cáo **không hiện** dòng đã rút.
5. **CSBH cũ vẫn giữ hiệu lực trong lúc bản mới chờ duyệt.** Hệ thống lưu quan hệ bản cũ – bản thay
   thế, thời điểm và người thao tác.
6. Mã phiên bản tự sinh theo số lần cập nhật CSBH của khách hàng đó và hiển thị trên bản in.

7. ~~**Văn bản mẫu của bản mềm cũng đóng băng lúc gửi duyệt**~~ `bỏ 29/08` — quyết định `23/08` đã
   được đảo lại. Bản mềm **không** đóng băng: nó là thao tác IN của Sale Admin ở bước B8, không phải
   văn bản đi qua luồng duyệt, nên mẫu là tham số của lượt in chứ không phải tính chất của hồ sơ.
   Xem mục 6.4.

8. **Thông tin khách hàng và hai cái tên cũng đóng băng lúc gửi duyệt** `mới 24/08`, vẫn cùng lằn
   ranh ấy. Tám trường của khách hàng in trên bản CSBH — mã, tên, mã số thuế, địa chỉ đăng ký, nơi
   nhận hàng, người đại diện, chức danh, **công nợ** — chụp lại vào hồ sơ, cùng với **họ tên người
   đề nghị**. Họ tên **Trưởng bộ phận đã ký** chụp lúc ký. Từ đó, sửa hồ sơ khách hàng hay đổi họ
   tên tài khoản **không làm đổi nội dung một hồ sơ đã gửi duyệt**.

   **Địa chỉ đăng ký chụp thêm ở dạng HAI Ô** `bổ sung 06/09` — *Số nhà, Phường xã* và
   *Tỉnh/Thành phố*, bên cạnh chuỗi gộp vốn có. Quyết định `05/09` tách địa chỉ đăng ký thành hai ô ở
   hồ sơ khách hàng, nhưng lượt gửi duyệt vẫn chỉ chụp chuỗi gộp — nên từ hôm ấy hệ thống đóng băng
   **cái bóng mà không đóng băng cái nguồn**. Không ai thấy, vì tờ giấy chỉ in chuỗi gộp; nó lộ ra khi
   trang hồ sơ bắt đầu bày hai ô. Chuỗi gộp **giữ nguyên** — tờ CSBH và hợp đồng vẫn in thẳng nó.

   > **Vì sao cần.** Trước đó những trường ấy đọc trực tiếp từ hồ sơ khách hàng ở mỗi lần mở, nên
   > sửa công nợ hôm nay là đổi con số trên bản CSBH đã ký từ tuần trước — lặng lẽ, và không ai
   > đối chiếu lại được. Giá và ngưỡng vốn đã đóng băng từ đầu; đây là nốt phần còn lại của cùng
   > một tờ giấy.

   **Hồ sơ bị trả lại thì mở ra sửa được.** Ảnh chụp làm mới ở **mỗi lượt gửi duyệt**, kể cả lượt
   gửi lại — nên trả lại vì *sai thông tin khách hàng* là một việc chữa được: TDV sửa hồ sơ khách
   hàng rồi gửi lại, bản CSBH mang số mới. Cùng lúc ấy **chữ ký của Trưởng bộ phận bị huỷ** và hồ
   sơ phải ký lại từ đầu, đúng như quy trình đã quy định.

   **Trả về là bỏ đóng băng khách hàng** `mới 28/09`. Hồ sơ về *Yêu cầu chỉnh sửa* thì ảnh chụp khách
   hàng **xoá cùng lúc với chữ ký**, nên trang hồ sơ — với mọi người mở nó — bày thông tin **sống**
   tới lượt gửi lại. TDV phụ trách sửa ngay trên trang hồ sơ bằng nút **Sửa thông tin khách hàng** ở
   khối *Thông tin chung* (có cả ở *Nháp*). Mã hồ sơ không nằm trong nút ấy.

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
- **Chỉ TDV đang phụ trách hồ sơ** thêm, sửa, xoá được một dòng sản phẩm — kể cả ngày áp dụng của
  dòng ấy `nói rõ 23/08`, `sửa 07/09`. Luật này không mới — nó là mặt còn lại của quy tắc xoá hồ sơ ở mục 4 — nhưng
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
| Mã khách hàng | **Khóa định danh.** Kế toán cấp bên ngoài phần mềm; hệ thống chặn trùng (không phân biệt hoa thường, bỏ khoảng trắng hai đầu). **Sửa được** `sửa 28/09`: chỉ TDV phụ trách, chỉ khi khách **chưa có CSBH đang có hiệu lực**; mã cũ dùng lại được |
| Tên khách hàng / hộ kinh doanh / công ty | Nhập tay, dùng tra cứu và lọc |
| CCCD / Mã số thuế | Kiểm tra định dạng, cảnh báo trùng, dùng lọc |
| Loại khách hàng | Loại 1: HKD của KH · Loại 2: HKD cộng tác · Loại 3: HKD/công ty là điểm bán hoặc cơ sở y tế. **Sửa được sau khi lưu** `sửa 15/08` — xem dưới bảng |
| Địa chỉ đăng ký / Nơi nhận hàng | Cho phép khác nhau; hiển thị đúng trên hợp đồng; dùng lọc |
| Chủ hộ / Người đại diện | Họ tên, chức vụ, thông tin định danh. **Chức danh là ô chọn** `mới 27/09`: *Giám đốc* · *Chủ hộ kinh doanh* · *Khác* (tự nhập) |
| Số điện thoại | Không bắt buộc; điền thì phải **đúng 10 chữ số** `mới 27/09` — sai thì báo đỏ dưới ô và không lưu được. Dấu cách, chấm, gạch ngang được bỏ qua và **lưu thành mười chữ số liền** |
| Công nợ | **ĐIỀU KHOẢN thanh toán, không phải số tiền** `sửa 27/08` — chọn một trong ba, phương án *Khác* thì tự nhập nội dung. **Không tích hợp** với hệ thống kế toán |
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

- **BA LOẠI MẪU** `sửa 30/08` — *Hồ sơ mẫu đầy đủ* · *Hồ sơ mẫu rút gọn* · *Mẫu hợp đồng*, mỗi loại
  một thẻ trên màn hình Quản trị và một **mẫu mặc định đi cùng hệ thống**. Hai loại hồ sơ khác nhau
  đúng một chuyện: **tập cột** của bảng sản phẩm, và tập ấy suy từ loại chứ không do người soạn khai.
  Chi tiết ở Phụ lục B, mục *"BA loại văn bản mẫu…"*.
- **CHỈ SALE ADMIN xem bản mềm, và họ chọn mẫu ở MỖI lượt in** `sửa 29/08`. Ô chọn nằm trong hộp
  *Xem bản mềm*, mở ra rỗng; chọn rồi mới dựng, đổi mẫu thì dựng lại. Khổ giấy đi theo file `.docx`
  của mẫu — phần mềm đọc nó từ `w:orient` chứ không hỏi người tải lên, vì một ô nhập tay không còn
  hậu quả gì là một ô sẽ nói dối.
  > **Đảo quyết định `23/08`, và đảo tận gốc.** Luật cũ — *"TDV chọn mẫu một lần lúc gửi duyệt, rồi
  > mẫu đóng băng vào hồ sơ"* — đứng trên một giả định: bản mềm là **văn bản đi qua luồng duyệt**,
  > nên người ký ở B10 phải thấy đúng tờ giấy người gửi ở B3 đã thấy. Khách hàng nói lại ngày 29/08
  > rằng giả định ấy không đúng: *"mục đích của bản mềm chỉ để in ra bản cứng tại thời điểm đó"*.
  >
  > Bản mềm là **thao tác IN của Sale Admin ở bước B8**. Cái được duyệt là dữ liệu hồ sơ, và dữ liệu
  > ấy vẫn đóng băng nguyên vẹn — giá, ngưỡng, thông tin khách hàng, tên người ký. Khi bản mềm chỉ
  > còn là thao tác in của MỘT người ở MỘT bước thì ba câu sau là một câu: chỉ người ấy cần nút, chỉ
  > người ấy chọn mẫu (và chọn lúc in, không lúc gửi), và không còn gì để đóng băng.
  >
  > Kéo theo, ghi ra để không ai phải đoán: **hồ sơ đã ký in lại hôm nay có thể ra một tờ giấy khác**
  > hôm nó được ký, nếu Quản trị đã sửa danh mục mẫu ở giữa; và **vô hiệu hết mẫu thì không hồ sơ nào
  > in được**, kể cả hồ sơ đã duyệt. Khách hàng chấp nhận — tờ giấy có giá trị pháp lý là **bản cứng
  > đã ký và đã scan**, không phải bản mềm dựng lại. **Gửi duyệt thôi cần mẫu**, nên hệ thống chưa có
  > mẫu nào vẫn gửi duyệt được (đảo một nửa quyết định `28/08`, xem mục 6.4 dưới).
  >
  > **Người duyệt thôi xem được tờ CSBH.** TDV, Trưởng bộ phận, Kế toán và **Ban lãnh đạo** mất nút
  > — hỏi lại riêng về Ban lãnh đạo và khách hàng chốt đúng chữ *"chỉ giữ ở SA"*, dù đó là nút duy
  > nhất của vai trò chỉ-đọc trên trang hồ sơ. Họ duyệt trên **bảng dữ liệu** ở màn hình chi tiết hồ
  > sơ, vốn đã mang đủ mười ba mục của mục 11.1.
  >
  > **Hợp đồng vẫn KHÔNG đóng băng** — Kế toán và Sale Admin vẫn chọn mẫu ở mỗi lượt xuất, vì hệ thống
  > không lưu hợp đồng (mục 8.3) nên không có gì để gắn mẫu vào. Nhưng họ cũng **phải chọn**: không
  > còn mẫu mặc định ngầm ở bất kỳ đâu, và nút *Xem* xám cho tới khi chọn.
  > *Ban hành* nghĩa là **thêm vào danh sách chọn**, không phải thay mẫu cũ. Nhiều mẫu
  > cùng áp dụng là trạng thái bình thường, và *"chưa có văn bản mẫu"* chỉ còn nghĩa là danh sách
  > RỖNG. Bản trước chốt "mỗi khổ giấy một mẫu riêng" — luật ấy sinh ra từ việc hệ thống tự tra mẫu
  > theo khổ, và nó mất nghĩa khi chính người dùng chọn.
- **KHÔNG xoá và KHÔNG sửa một mẫu — chỉ VÔ HIỆU HOÁ** `sửa 23/08`, và bật lại được bất cứ lúc nào.
  Vô hiệu hoá rút mẫu khỏi ô chọn; nó **không xoá dòng nào**, nên bật lại là mọi hồ sơ in được bằng
  mẫu ấy như cũ. Vô hiệu hoá đòi **gõ lại tên mẫu**; bật lại thì không đòi gì.
  > Lý lẽ ĐỔI ở `29/08` nhưng kết luận thì không. Tới `28/08` đây là hệ quả bắt buộc của việc đóng
  > băng: một mẫu xoá được là bản mềm của mọi hồ sơ đã gắn nó hỏng vĩnh viễn. Không còn đóng băng,
  > nhưng lý do mới còn rộng hơn — mẫu là tham số của lượt in, nên xoá một mẫu là **mọi hồ sơ** mất
  > một cách in, không riêng những hồ sơ đã gắn nó.
  >
  > *Sửa* cũng không quay lại. Lý do `20/08` — *"sửa một mẫu đang dùng thì bản mềm hôm nay và hôm qua
  > khác nhau mà không chỗ nào ghi lại"* — nay đúng trở lại nguyên văn, vì bản mềm dựng lại mỗi lần
  > in. Cách đúng vẫn là thêm mẫu mới rồi vô hiệu mẫu cũ.
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
  > `sửa 24/08`, rồi còn **7 trên 13** `sửa 01/09` khi khách hàng bỏ ba dòng *Số hồ sơ* ·
  > *Tên khách hàng* · *File đính kèm* khỏi hai mẫu hồ sơ của họ. Nói ra vì một bảo đảm 7/13 mà
  > tưởng là 13/13 thì tệ hơn hẳn một bảo đảm 7/13 đã biết — cái tưởng ấy chỉ vỡ ra trên một bản đã
  > đem đi ký.
  >
  > **13 mục của muc 11.1 là yêu cầu của bảng CSBH XEM**, tức MÀN HÌNH chi tiết hồ sơ — nó bày đủ
  > cả mười ba và không mẫu nào chi phối. Đem nguyên yêu cầu của màn hình áp sang bản người dùng vẽ
  > là chỗ `20/08` đọc quá lời. `sửa 24/08`: bản trước ghi bảng ấy là *"bảng do hệ thống dựng"*, một
  > đường dựng HTML chỉ phục vụ bản lưu ký số — thứ `0103` đã gỡ.
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
| **Văn bản mẫu** | Chỉ Quản trị | BA loại mẫu, ba thẻ `sửa 30/08`; Sale Admin chọn mẫu lúc xem bản mềm — xem 6.4 |

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

**Không bày mã lỗi hay mã tra cứu nào** `sửa 05/11` — kể cả ở dòng phụ, kể cả cỡ chữ nhỏ. Khách hàng:
*"người dùng không cần quan tâm đến nó, hiển thị chỉ gây rối mắt"*. Mã vẫn sinh và vẫn nằm trong nhật
ký; báo lỗi thì người dùng nói **đang làm gì, lúc mấy giờ** và **số phiên bản ở chân trang**, Quản trị
tìm lượt bấm ấy ở màn hình *Nhật ký* (nơi cột mã tra cứu được giữ, vì ở đó nó là khoá để lọc).

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

### 7.1. Ảnh chụp lấy theo NGÀY ÁP DỤNG `mới 16/08` `sửa 07/09`

Giá bán Công ty và ngưỡng chiết khấu đều có ngày hiệu lực. Con số chụp vào một dòng hồ sơ là con số
có hiệu lực **tại ngày áp dụng của chính dòng ấy**, không phải tại ngày lập.

**NGÀY ÁP DỤNG THUỘC VỀ TỪNG SẢN PHẨM** `sửa 07/09`. Hồ sơ CSBH không còn một ngày áp dụng chung:
mỗi dòng sản phẩm mang ngày của riêng nó, khai ngay ở hộp thoại *Thêm sản phẩm* — ô đầu tiên, trước
cả ô chọn sản phẩm. Một hồ sơ hoàn toàn có thể gồm ba mặt hàng cũ áp dụng từ 01/09 cộng một mặt hàng
mới áp dụng từ 01/10, và khi ấy hai nhóm dòng chụp hai bảng giá khác nhau.

Dòng áp dụng từ 01/09 mang bảng giá của 01/09, kể cả khi được lập từ tháng 8. Sửa ngày áp dụng của
một dòng thì **chính dòng ấy chụp lại** theo bảng giá của ngày mới; các dòng khác không đổi. Không
khai ngày thì máy chủ điền **hôm nay** (giờ Việt Nam) — cột này không rỗng được.

Bản CSBH in ra vì thế **không còn ô *Thời gian áp dụng*** ở đầu trang: ngày là **cột đầu tiên của
bảng sản phẩm**, ngay bên trái *Mã sản phẩm*. In một ngày duy nhất ở đầu trang là nói sai về mọi
dòng có ngày khác.

**NGÀY ĐÃ QUA THÌ TRA THEO HÔM NAY** `mới 11/09` `sửa 12/09`. Ngày tra bảng giá của một dòng là
**ngày áp dụng của dòng, hoặc hôm nay, lấy ngày MUỘN HƠN**. Áp cho mọi lượt mà TDV đang soạn một dòng
của hồ sơ còn sửa được: **thêm** dòng · **sửa** dòng · hộp thoại **xem trước** · khối *Yêu cầu cập
nhật* và nút *Tự động cập nhật*.

> **Mở *Sửa* một sản phẩm thì Giá bán Công ty là giá HIỆN TẠI** `mới 12/09`, không phải con số đang
> nằm trên dòng. Trước `12/09` hộp thoại tra theo đúng ngày áp dụng của dòng — mà dòng thừa kế mang
> ngày của bản CSBH trước, tức một ngày đã qua, tức chính con số đang hiện ra: hộp thoại bày lại
> chính nó. Nặng hơn thế: bấm *Tự động cập nhật* (giá lên 130.000) rồi **sửa một ghi chú** là dòng
> tụt về 100.000 — lượt cập nhật biến mất, khối cảnh báo mọc lại, không ai đụng vào giá.
>
> **Ngày áp dụng của dòng KHÔNG bị kéo theo.** Ngày GHI là ngày TDV khai; chỉ ngày TRA được quy đổi.
> Gộp hai thứ ấy là dời ngày áp dụng của mọi dòng thừa kế và lật nhãn trạng thái của cả bảng.

Lượt **lập hồ sơ kèm sẵn danh sách sản phẩm** là chỗ duy nhất vẫn tra theo đúng ngày áp dụng — đường
ấy chỉ dành cho tích hợp và bộ nạp dữ liệu; hai màn hình lập hồ sơ đều tạo hồ sơ rỗng rồi thêm từng
dòng.

Vì bảng giá của một ngày đã qua thì không đổi nữa (mọi lượt đổi giá đều hiệu lực từ hôm nay — muc
6.2), nên đối chiếu một dòng đề ngày quá khứ với chính bảng giá của ngày ấy là một câu hỏi không bao
giờ có câu trả lời. Chỗ nó cắn: **mọi dòng thừa kế của một phiên bản mới đều đề ngày quá khứ** — dòng
ấy giữ nguyên ngày của bản trước. Hệ quả trước `11/09`, cùng khách và cùng mặt hàng: bản đang hiệu
lực báo *"giá bán Công ty 100.000 → 130.000"*, còn bản mới đang soạn nói không có gì đổi, nút *Tự
động cập nhật* không áp được gì, và bản CSBH mới đi hết luồng duyệt rồi **được ký với giá cũ**.

Dòng đề ngày **tương lai** vẫn tra bảng giá của đúng ngày ấy — nó đã chụp đúng bảng giá sẽ có hiệu
lực, nên đem so với hôm nay là báo lệch ngược.

### 7.2. Đóng băng: đúng một lần, ở đúng lúc gửi duyệt `sửa 16/08`

| Hồ sơ | Khi danh mục đổi giá hoặc đổi quy định chiết khấu |
|---|---|
| **Nháp · Yêu cầu chỉnh sửa** | **Sống theo danh mục.** Mỗi lần mở hồ sơ, giá và ngưỡng chụp lại; lúc bấm *Gửi duyệt* chụp lại lần cuối rồi mới đóng băng |
| **Đã gửi duyệt → Đang có hiệu lực** | **Không bao giờ ghi đè.** Hiện trong box *Yêu cầu cập nhật* (muc 9.3) và trong khối cảnh báo ngay trên màn hình hồ sơ `18/08`. **Không gửi email** `sửa 18/08` |
| **Đã xoá · Hết hiệu lực** | Không theo dõi nữa |

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

- Cột của bảng, chốt `19/08` (tên cột `sửa 01/09`): **STT · Mã sản phẩm · Tên sản phẩm ·
  Giá bán Công ty · Giá bán buôn · CPBH · CPBH 1…CPBH n · Giá thu về · Tỷ lệ CK · Ghi chú**. Cột *Ngưỡng* đã **bỏ hẳn** — bản giấy
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
| Trạng thái | 11 trạng thái ở mục 4 `sửa 28/09` | Không có trạng thái — chỉ là một file PDF |

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

### 9.1b. Thông báo trên web `mới 23/08` `sửa 10/09`

Một **biểu tượng chuông** ở thanh trên cùng, sát trái thẻ tài khoản, mang **con số** việc chưa đọc —
không phải một dấu chấm. Quá 99 thì ghi `99+`.

- **BẬC của một thông báo** `mới 09/09` — với mỗi người đọc, một thông báo hoặc là **việc của họ**
  hoặc chỉ là **tin**. Người đọc là *chủ bước* của trạng thái đích thì đó là việc; còn lại là tin.
  Bậc quyết định **tiêu đề**, **liên kết** (hồ sơ / lịch sử hồ sơ), và **dòng kẻ dọc** bên trái
  dòng. Cùng một sự kiện cho ra hai tiêu đề khác nhau ở hai người, vì với họ đó là hai chuyện khác
  nhau.
- **Bậc KHÔNG viết thành nhãn chữ** `mới 10/09`. Hai nhãn *Cần bạn xử lý* / *Để bạn biết* mở đầu mọi
  tiêu đề từ 09/09 đã **bỏ hẳn**: trên màn hình bậc đọc bằng **một kẻ dọc xanh ở mép trái dòng**
  (`sửa 10/09` — không tô nền), và trong
  tiêu đề nó đã nằm sẵn ở **cách viết** — bậc việc là một mệnh lệnh gọi tên việc phải làm (*"Duyệt
  bản mềm — Trưởng bộ phận đã ký"*), bậc tin là một câu kể chuyện đã xảy ra (*"Trưởng bộ phận đã ký,
  hồ sơ sang Kế toán duyệt bản mềm"*). Trong **hộp thư** — nơi không có dải màu nào — thân thư bậc
  tin vẫn giữ đoạn nói rõ *bạn không phải xử lý gì ở bước này*.
- **Con số trên chuông đếm VIỆC, không đếm tin** `mới 09/09`. Hết việc mà còn tin chưa đọc thì chuông
  mang một **dấu chấm đỏ** `sửa 10/09`. Quyết định 23/08 — *con số thật, không phải dấu chấm* — giữ
  nguyên và mạnh hơn: nó nói *"còn n việc chưa xem"*, đúng câu khách hàng đặt ra cho nó.
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

> **CHƯA MỞ ở phiên bản hiện tại** `sửa 24/10` — cả mục này (box, khối cảnh báo lệch trên trang hồ sơ,
> nút *Tự động cập nhật*) nằm sau một công tắc đang tắt, xem Phụ lục B. Luật đóng băng lúc gửi duyệt
> (muc 7) không thuộc công tắc.

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
| `Ngưỡng` | Quy định chiết khấu áp cho dòng đó đổi — **ngưỡng khác, hoặc quy định khác dù cùng ngưỡng** `sửa 29/09` (ví dụ sau khi **đổi nhóm sản phẩm**) — **hoặc bị xoá**, khi đó ngưỡng mới là rỗng |
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
- **HAI KHỐI TỆP** `sửa 01/09`, `đổi tên 07/09` — *Bản mềm* · *File SCAN bản cứng*, theo đúng chiều hồ sơ đi: Sale Admin dựng
  bản mềm trước, in ra, trình ký, rồi mới scan lại. Khối *Bản mềm* không nhận tệp tải lên — nó có một
  nút mở hộp chọn mẫu. Xem Phụ lục B, mục *"BẢN MỀM thành một TỆP của hồ sơ"*.
  > **Khối *Giấy tờ hồ sơ* ĐÃ BỎ** `sửa 01/09` — xem Phụ lục B, mục *"Bỏ mục Giấy tờ hồ sơ"*. Hệ quả
  > rộng hơn một khối bị ẩn: đó là chỗ duy nhất của giao diện đính được loại tệp ấy, nên **Trình dược
  > viên thôi đính giấy tờ vào hồ sơ CSBH**. Giấy tờ pháp lý của khách hàng thì vẫn nguyên, ở hồ sơ
  > khách hàng và ở khối *Hồ sơ pháp lý của khách hàng* ngay trên trang này.
- **THỨ TỰ MỤC trên trang hồ sơ** `sửa 01/09` — *Hồ sơ* · *Khách hàng* · *Sản phẩm* ·
  *Hồ sơ pháp lý của khách hàng* · **Bản mềm** · **File SCAN bản cứng** · *Lịch sử*.
  > Hai khối của bước B8 xuống cuối, ngay trên *Lịch sử*: chúng là **sản phẩm của vòng duyệt**, nên
  > đứng cạnh chỗ kể lại vòng duyệt ấy. *Lịch sử* vẫn cuối cùng (chốt 23/08).
- **Màn hình hồ sơ tách HAI KHỐI TỆP** `mới 23/08` (`sửa 01/09` — cặp khối giờ là *Bản mềm* và *Bản
  cứng*; *Giấy tờ hồ sơ* đã bỏ): vùng tải lên và dấu gỡ chỉ hiện ở **đúng khối của loại tệp** người
  ấy được đụng vào — ở hồ sơ *Nháp* không khối nào cho tải gì lên.
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


### Sao lưu kho tệp và chuyển máy `mới 05/11`

- **Chuyển sang máy khác không được làm thay đổi gì** — tài khoản, phiên đăng nhập, hồ sơ, tệp
  (bản scan, bản mềm, giấy tờ, văn bản mẫu), nhật ký kiểm toán kể cả phần đã trích, dãy mã hồ sơ.
  Lệnh nhập **tự đối chiếu** với máy cũ (từng bảng, từng sequence, từng tệp, từng khoá tệp) và
  **không bật phần mềm** khi lệch. Điều kiện: máy cũ dừng trong lúc xuất (đo 31 giây ở diễn tập),
  máy mới cài **cùng phiên bản**.
- **Bí mật đi gói RIÊNG, mã hoá bằng mật khẩu** người vận hành đặt lúc xuất. Mất mật khẩu là
  không mở được CSDL ở máy mới.
- ~~Sao lưu kho tệp CHƯA chạy định kỳ~~ `sửa 06/11` — **cơ sở dữ liệu và kho tệp đều sao lưu theo
  lịch** Quản trị đặt trên trang Vận hành (tần suất 6 giờ · 12 giờ · ngày · tuần, giờ chạy, giữ
  tối đa N bản, mặc định 7). Mất máy đột ngột thì cả hai về được tới **lượt sao lưu gần nhất** —
  bản nền + WAL (phục hồi tới từng giây) đã bỏ theo chốt 05/11.

### Trang Vận hành `mới 06/11`

- **Chỉ Quản trị hệ thống.** Sáu thẻ: Sức khoẻ · Ổ đĩa · Sao lưu · Tệp log · Thư & hàng đợi · Lịch
  tự động. Thẻ *Hệ thống* của trang Người dùng (hạn xử lý, thư hỏng) dời vào thẻ *Thư & hàng đợi*.
- **Không chữ kỹ thuật, không câu lệnh, không phục hồi** (chốt 05/11). Bản sao lưu gọi là *bản sao
  lưu*, không phải *dump*.
- **Không xoá được bản sao lưu mới nhất**, và không xoá khi một lượt sao lưu cùng loại đang chạy.
  Bản chụp kho tệp **không tải về qua trình duyệt** (mỗi bản là toàn bộ kho).
- **Giảm số bản giữ lại thì phần thừa xoá ở lượt chạy KẾ TIẾP**, cũ nhất trước, chỉ sau khi bản mới
  đã ghi xong — không xoá lúc bấm Lưu (chốt 05/11).
- **Tệp log**: mỗi thành phần một tệp mỗi ngày; đêm hôm sau nén cả ngày thành **một** tệp; giữ tối
  đa N tệp (mặc định 30, đặt được 1–90).
- **Ổ đĩa: MỘT ngưỡng** (mặc định 80%). Vượt ngưỡng → một thư + một thông báo cho mọi Quản trị
  đang hoạt động, chỉ lúc đi từ dưới lên trên ngưỡng.
- ***Sao lưu ngay*** chạy qua một phần mềm nhận lệnh trên máy chủ; phần ấy tắt thì nút xám kèm câu
  nói vì sao — **sao lưu theo lịch không phụ thuộc nó**.
- Mọi lượt tải, xoá, sửa lịch, sửa ngưỡng, *Sao lưu ngay* ghi vào nhật ký kiểm toán.

## 11. Yêu cầu hiển thị file

### 11.1. Bản CSBH

- Bản mềm hỗ trợ đúng khổ A4 ngang và A4 dọc, không co sai tỷ lệ, không cắt nội dung.
- **Phần mềm không có chức năng in.** Chỉ có nút **Tải PDF**; máy chủ sinh file rồi trả về. Muốn có
  bản giấy thì người dùng tự mở file và in bằng máy in của mình — thao tác ngoài phần mềm.
- File PDF tải về phải **khớp đúng bản đang xem** trên màn hình. Nút Đóng luôn hiển thị ở màn hình xem.
- **Không lưu bản ký số thành file riêng** `sửa 24/08`. Bản mềm in khối *TBP đã ký số* kèm ngày ký;
  còn câu hỏi *"văn bản lúc ký nói gì"* trả lời bằng **dữ liệu đã đóng băng trong hồ sơ** (mục 5, ý
  8), không bằng một file PDF thứ hai giữ lại để đối chiếu.
- Bấm trực tiếp tên file để mở xem.
- Bảng CSBH xem tối thiểu có: thông tin công ty, người đề nghị, thời gian áp dụng, công nợ, mã và
  tên khách hàng, tên sản phẩm, CPBH, trạng thái, file đính kèm, Trưởng bộ phận, kế toán, thời gian duyệt.
  > **Mười ba mục này là yêu cầu của bảng XEM — MÀN HÌNH chi tiết hồ sơ** `làm rõ 24/08`, và màn
  > hình ấy luôn đủ cả mười ba. **Mẫu bản mềm do Quản trị soạn là một thứ khác**: nó chỉ bị ép **7 trên
  > 13** `sửa 01/09`, vì sáu mục kia hoặc cố định (*thông tin công ty*), hoặc do người soạn quyết
  > (*CPBH*), hoặc **còn đang đổi** lúc dựng văn bản (*trạng thái*, *thời gian duyệt*), hoặc **khách
  > hàng đã bỏ khỏi tờ giấy của họ** (*tên khách hàng* — dòng ấy giờ in tên người đại diện — và
  > *file đính kèm*). **Mã khách hàng vẫn bắt buộc.** Xem mục 6.4.

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

**Thông báo trên web soi gương hộp thư** `mới 23/08` `sửa 09/09` — một cái chuông ở thanh trên cùng,
mang **con số VIỆC** chưa đọc (`99+` khi vượt trần) hoặc một **dấu chấm** khi chỉ còn tin, sát trái
thẻ tài khoản. Quy tắc phạm vi chốt gọn một câu: *mọi hành động dẫn tới gửi email cho một người đều
là một thông báo của người ấy, ngoài ra không có gì khác* — nên danh sách người nhận thông báo **là
chính** danh sách người nhận thư, đọc ở cùng một chỗ, không có bảng tra thứ hai. Bấm vào một thông
báo thì tới **đúng địa chỉ mà thư dẫn tới**.

> **Tiêu đề trả lời câu hỏi của NGƯỜI ĐỌC** `mới 09/09` — *"tôi có phải làm gì không"*, chứ không
> *"ai vừa làm gì"*. Xem *"Tiêu đề thông báo nói rõ VIỆC CỦA AI"* ở cuối Phụ lục B.

> **Hai lá thư tài khoản đứng ngoài, và không phải vì thẩm mỹ.** Thư kích hoạt và thư đặt lại mật
> khẩu mang **token thô** trong thân — thứ `ONB-15` chỉ cho phép tồn tại trong bộ nhớ tiến trình và
> trong email, còn CSDL chỉ giữ bản băm. Bảng thông báo thì đọc được qua API. Chi tiết ở muc 9.1b.

> **ĐÃ ĐẢO NGƯỢC `29/08`** — xem mục *"Bản mềm CHỈ của Sale Admin…"* ở cuối Phụ lục B. Đoạn dưới đây
> giữ lại vì nó là tiền đề của tám chặng sau nó, không phải vì nó còn đúng.

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

**Số điện thoại khách hàng** `mới 27/08` — thêm một trường vào hồ sơ khách hàng, và thêm một khoá
tương ứng vào **bảng ánh xạ văn bản mẫu** để in ra bản CSBH.

> Nó **đóng băng vào hồ sơ lúc gửi duyệt**, như bảy trường khách hàng khác. Đọc sống nghĩa là khách
> đổi số sau khi hồ sơ đã duyệt thì tờ CSBH đã ký lặng lẽ mang một con số khác.
>
> Và nó thuộc nhóm **chặn lúc gửi duyệt**, cùng chỗ với mã số thuế và chức danh người đại diện: rỗng
> thì bản CSBH in ra một ô trắng, mà Trình dược viên sửa được. Hệ quả vận hành phải biết trước:
> **khách hàng cũ chưa khai số thì hồ sơ mới của họ chưa gửi duyệt được** cho tới khi ai đó bổ sung.
> Câu báo lỗi chỉ thẳng sang hồ sơ khách hàng.
>
> **THÔI CHẶN** `sửa 01/09` — hai mẫu hồ sơ mặc định không còn in số điện thoại lẫn chức danh người
> đại diện, nên chặn lúc gửi duyệt là chặn vì một ô không tồn tại trên tờ giấy. **Trường vẫn còn**
> trong hồ sơ khách hàng và vẫn đặt được ô trống trong mẫu; chỉ là **không bắt buộc**, và hệ quả vận
> hành ở trên **hết hiệu lực**: khách cũ chưa khai số vẫn gửi duyệt được.

**Lịch sử giá giữ đủ mọi lần sửa** `mới 27/08` — kể cả nhiều lần trong cùng một ngày. Mỗi lần một
dòng, kèm thời điểm ghi; giá đang dùng là **lần cuối cùng**, đánh dấu rõ trên màn hình.

**Kế toán chưa thấy hồ sơ ở lượt CHỜ TBP ĐẦU TIÊN** `mới 27/08` — hồ sơ vừa gửi duyệt chưa hiện
trong danh sách của Kế toán. Bị trả lại từ các bước sau rồi quay về *Chờ TBP duyệt* thì **vẫn thấy**.

> Điều kiện là *"đã từng qua Trưởng bộ phận"*, không phải *"đang ở bước nào"*: Kế toán trả hồ sơ lại
> ở L1 rồi nó quay về chờ TBP thì họ đã đọc nó, đã viết lý do, và có lý do để theo dõi tiếp.

Luật này áp cho **cả các ô đếm** `sửa 27/08` — thẻ *Sắp quá hạn* và mọi ô đếm việc trên trang *Tổng
quan* và *Thống kê* của Kế toán bỏ qua đúng những hồ sơ đang bị giấu.

> Bấm vào một con số rồi đếm số dòng hiện ra phải bằng chính con số ấy. Một màn hình đếm được thứ
> màn hình kia không mở được là lỗi nặng hơn cả việc đếm sai: người dùng thấy có việc, bấm vào, và
> không có gì ở đó.

**Chọn người xử lý MỘT LẦN, ở đúng bước sinh ra việc ấy** `mới 27/08`:

> - **Gửi lại sau khi sửa KHÔNG chọn lại** Trưởng bộ phận và Kế toán — hai người đã chọn từ lượt gửi
>   đầu và giữ nguyên qua mọi vòng trả lại. Chọn lại được nghĩa là người vừa trả hồ sơ về bị xoá khỏi
>   phạm vi đọc, vì phạm vi tính theo bốn cột người trên chính hồ sơ ấy.
> - **Tiếp nhận lần 1 chỉ hỏi Sale Admin ở lượt ĐẦU.** Hồ sơ đi vòng thứ hai thì người ấy đã có; hỏi
>   lại là mời chọn khác đi, tức đẩy hồ sơ sang một người chưa từng thấy nó.
>
> Muốn đổi người thì đó là nghiệp vụ **bàn giao**, không phải hệ quả phụ của một lượt gửi lại.

> **ĐÃ ĐẢO NGƯỢC `29/08`** — không còn mẫu để chọn ở đây, nên không còn bản xem trước, nên không còn
> bước hai. Gửi duyệt về lại MỘT bước, như mọi hành động khác.

**Gửi duyệt tách làm HAI BƯỚC** `mới 27/08` — bước một chọn Trưởng bộ phận, Kế toán và văn bản mẫu;
xác nhận xong thì một hộp thoại KHÁC mở ra, **cỡ bằng hộp xem bản mềm**, hiện bản CSBH dựng bằng mẫu
vừa chọn. Bấm *Gửi duyệt* ở hộp ấy thì hồ sơ mới đi.

> Bản trước để cả ba ô chọn và bản xem trước trong một hộp. Bản A4 bị kẹp giữa biểu mẫu, cao chừng
> nửa màn hình, nên người dùng cuộn qua nó để tới nút bấm — bước *đọc lại* tồn tại trên màn hình mà
> không tồn tại trong thực tế. Tách đôi làm nó thành **việc duy nhất** của màn hình thứ hai.
>
> *Tiếp tục* ở bước một **không gửi gì cả**, và *Quay lại* ở bước hai giữ nguyên những gì đã chọn.

**Ba loại khách hàng có TÊN THẬT** `mới 27/08` — nhãn hiện đủ cả số lẫn tên:

> | | |
> |---|---|
> | Loại 1 | Hộ kinh doanh của khách hàng |
> | Loại 2 | Hộ kinh doanh cộng tác |
> | Loại 3 | Hộ kinh doanh/ Công ty điểm trưng bày hàng |
>
> GIỮ chữ *Loại n* ở đầu chứ không thay hẳn bằng tên: con số ấy là thứ **quy định chiết khấu khai
> theo**, và nó xuất hiện ở màn hình Chiết khấu, trong file Excel nhập danh mục, trong câu báo lỗi.

**Công nợ là một ĐIỀU KHOẢN thanh toán, không phải số tiền** `mới 27/08` — ba lựa chọn, và lựa
chọn thứ ba cho gõ tự do:

> 1. Thanh toán sau khi nhận hàng
> 2. Thanh toán gối đơn, công nợ không quá 90 ngày
> 3. Khác — người dùng tự nhập nội dung
>
> *Khác* thì **bắt buộc** ghi rõ nội dung, và hai phương án kia thì **không được** ghi thêm — luật
> hai chiều, vì một dòng ghi chú kèm phương án 1 sẽ không đi đâu cả mà người gõ vẫn tin rằng nó có.
>
> Cột `debt` cũ **gỡ hẳn**, và số tiền trong đó mất theo: `4.500.000 đồng` không nói được khách ấy
> thanh toán sau khi nhận hàng hay gối đơn 90 ngày, nên không có phép chuyển đổi nào đúng. Mọi khách
> hàng nhận phương án 1 — thận trọng nhất trong ba, vì nó KHÔNG cho nợ. **Bản chạy thử đã nhập công
> nợ bằng số phải khai lại điều khoản cho từng khách hàng.**
>
> Ảnh chụp vào hồ sơ (`0101`) chụp **câu chữ đã dựng xong**, không phải mã: sửa câu chữ của phương
> án 2 về sau không được đổi nội dung của những tờ đã ký từ trước.

**Quản trị hệ thống KHÔNG có màn hình Hồ sơ CSBH** `mới 27/08` — mục menu ấy gỡ khỏi vai trò này, và
gõ thẳng địa chỉ cũng bị chặn.

> Đây không phải một luật mới. Mục 2.1 đã viết *"Quản trị hệ thống đứng ngoài luồng duyệt, không có
> phạm vi hồ sơ nào"*, và phần mềm đã làm đúng điều đó ở máy chủ từ đầu — mọi đường đọc hồ sơ trả
> `403` với vai trò này. Chỉ có mục menu là chưa ai gỡ, nên nó dẫn tới một màn hình mở lên chỉ để
> nhận danh sách trống hoặc một khối lỗi đỏ.
>
> **Màn hình Khách hàng thì GIỮ**, đúng theo ngoại lệ đã ghi ở mục 2.1: họ là người *đổi TDV phụ
> trách*, và nút ấy nằm trên trang chi tiết khách hàng. Đổi lại, hai khối *CSBH đang áp dụng* và
> *Lịch sử CSBH* trên trang ấy nói **"Không khả dụng với vai trò của bạn"** — không phải một khối lỗi
> đỏ (đọc như hệ thống hỏng), và cũng không phải câu *"khách hàng chưa có CSBH nào"* (một khẳng định
> về dữ liệu mà màn hình không có căn cứ đưa ra — khách rất có thể đang có một CSBH hiệu lực).

**Chọn văn bản mẫu bằng Ô CHỌN, và hộp xem ôm sát tờ giấy** `mới 27/08`:

> - Bước **chọn mẫu trước khi xem** — còn ở hồ sơ *Nháp* và ở mọi lượt xuất hợp đồng — là một **ô
>   chọn** kèm nút *Xem*, thay cho danh sách nút xếp dọc. Ô mở ra **rỗng**: luật *"phải chọn, phần
>   mềm không chọn hộ"* (chốt 20/08) giữ nguyên, chỉ đổi hình dạng. Danh mục mẫu dài ra thì ô chọn
>   vẫn cao một dòng, còn danh sách nút thì đẩy nút *Đóng* xuống dưới tầm nhìn.
> - **Không còn dải trắng thừa bên phải bản xem.** Đo được trước khi sửa trên laptop 1366×768: hộp
>   520px đựng một tờ A4 dọc rộng 267px, thừa **203px** trắng dồn hết sang phải.

**Hộp xem có bề rộng CỐ ĐỊNH, tờ giấy phóng to cho vừa** `sửa 27/08` — vế thứ hai ở trên thoạt tiên
làm hộp co theo tờ giấy; khách hàng xem bản ấy rồi chốt lại: *"hộp của khổ dọc vẫn quá hẹp, hãy điều
chỉnh để độ rộng luôn ổn định, có thể zoom phần pdf lên để không bị thừa lề bên phải"*.

> Hộp xem bản mềm và hợp đồng rộng **900px** ở mọi khổ giấy và mọi màn hình (hẹp lại theo màn hình
> nhỏ). Cái mất, có chủ ý: mẫu **khổ dọc** cao hơn khung nên phải cuộn trong bản xem mới đọc hết —
> đổi lấy chữ to hơn và một hộp không nhảy cỡ giữa hai lần mở.
>
> Hộp xem **ảnh scan** giữ nguyên cách cũ, co theo hình tấm ảnh: ảnh không phóng to được như PDF.
>
> **900px thành SÀN chứ không còn là con số duy nhất** `sửa 30/08` — xem mục ngay dưới.

**BẢN MỀM thành một TỆP của hồ sơ, đóng băng như bản cứng** `mới 31/08` — năm câu chốt cùng lúc:

> 1. Hộp *Xem bản mềm* của Sale Admin bày mẫu của **cả hai loại hồ sơ** — đầy đủ và rút gọn. (Đã
>    đúng từ `30/08`; lượt này chỉ thêm nhãn *đầy đủ* / *rút gọn* vào ô chọn, vì hai cái tên do
>    Quản trị đặt không bắt buộc nói ra điều đó.)
> 2. Hồ sơ CSBH có thêm một mục **Bản mềm**, giao diện như *Bản cứng*. **Chỉ Sale Admin thêm và
>    xoá**; vai trò khác xem và tải xuống.
> 3. Tạo bản mềm: Sale Admin chọn văn bản mẫu — **chỉ mẫu hồ sơ ĐẦY ĐỦ** — hệ thống hiện bản xem
>    trước, rồi cho **Lưu**.
> 4. Bản mềm ấy **đóng băng và lưu cùng hồ sơ**, giống bản cứng.
> 5. Bấm **Bàn giao** khi chưa có bản mềm thì hệ thống mở luôn khung chọn mẫu và lưu trước; lưu xong
>    mới hỏi xác nhận bàn giao.
>
> **KHÔNG PHẢI `23/08` QUAY LẠI.** Quyết định ấy đóng băng **id của MẪU** vào hồ sơ, và `29/08` gỡ
> hẳn. Thứ được đóng băng ở đây khác hẳn: **chính tờ giấy** — các byte PDF, nằm trên kho như mọi tệp
> khác. Mẫu đổi, mẫu bị vô hiệu, Quản trị sửa câu chữ — bản mềm đã lưu **không đổi theo**, vì nó
> không còn tra tới mẫu nào nữa.
>
> **Hai thứ sống cạnh nhau, và đừng lẫn:**
>
> | | *Xem bản mềm* | *Bản mềm* (tệp) |
> |---|---|---|
> | Mẫu | cả hai loại hồ sơ | **chỉ mẫu đầy đủ** |
> | Lưu lại | không | **có, vĩnh viễn** |
> | Mẫu bị vô hiệu | không xem được nữa | vẫn tải được |
>
> **Vì sao bản lưu chỉ nhận mẫu đầy đủ**: nó là bản đem trình ký và bàn giao cho Kế toán, nên phải
> mang đủ cột — kể cả giá thu về và tỷ lệ chiết khấu, thứ mẫu rút gọn cố ý cắt đi cho khách hàng xem.
>
> **Bàn giao đòi CẢ HAI tệp.** `SA_HANDOVER` đã chặn khi thiếu bản scan (WF-14) từ lâu; nay chặn cả
> khi thiếu bản mềm, với một **mã lỗi riêng**. Hai mã vì màn hình phản ứng khác hẳn: thiếu bản scan
> thì nút *Bàn giao* **xám** — việc ngoài phần mềm, phải in, trình ký, scan; thiếu bản mềm thì nút
> **vẫn sáng** và bấm vào mở hộp tạo bản mềm trước, vì đó là việc phần mềm làm được ngay.
>
> **Bản mềm KHÔNG tải lên từ máy được.** Nó chỉ sinh ra từ dữ liệu hồ sơ và một mẫu; mở đường tải tệp
> cho nó là mở đường đính bất kỳ PDF nào vào hồ sơ dưới nhãn *bản mềm*, đúng thứ việc dựng-từ-mẫu
> sinh ra để bảo đảm.
>
> Sale Admin lưu được **nhiều** bản mềm — hồ sơ bị Kế toán yêu cầu in lại thì họ dựng bản mới, và bản
> cũ ở lại làm vết. Tên tệp mang mã hồ sơ và mốc thời gian để phân biệt.

**Khối chữ ký của hai mẫu hồ sơ: một dòng bốn ô, không kẻ ô, chừa chỗ ký tay** `sửa 01/09` — ba câu
chốt cùng lúc:

> 1. **Bỏ ô kẻ** ở khối chữ ký dưới bảng sản phẩm.
> 2. **Kế toán vào giữa *Phó Giám đốc* và *Trưởng bộ phận***, cả khối xếp trên **một dòng**.
> 3. **Chừa khoảng trống giữa chức danh và tên người ký**, để ký tay sau khi in.
>
> **HAI MẪU, HAI DÃY CHỨC DANH** `sửa 05/09`:
>
> | Mẫu | Khối chữ ký |
> |---|---|
> | Đầy đủ | *Kế toán* · *Trưởng bộ phận* · *Người đề nghị* |
> | Rút gọn | *Phó Giám đốc* · *Kế toán* · *Trưởng bộ phận* · *Người đề nghị* |
>
> Bản đầu của lượt này cho hai mẫu dùng chung một khối bốn ô, lập luận rằng bản ĐẦY ĐỦ mới là tờ Sale
> Admin in ra đem trình Ban lãnh đạo ký ở B8 nên nó cần ô ấy nhất. Khách hàng trả lời khác — *"bản mẫu
> hồ sơ đầy đủ không cần phần Phó giám đốc"* — nên ô *Phó Giám đốc* chỉ còn ở bản rút gọn, đúng như tờ
> mẫu họ tự gõ.
>
> Ô *Phó Giám đốc* chỉ có chức danh và khoảng trống, **không có ô trống dữ liệu nào** — hệ thống không
> có trường tên cho Ban lãnh đạo.
>
> **Đường kẻ không đến từ khối chữ ký.** Bảng chữ ký chưa bao giờ khai đường kẻ; nó dính vào **bảng
> sản phẩm** — hai bảng Word nằm liền nhau thì bị gộp làm một, và bảng gộp lấy đường kẻ của bảng đầu.
> Nên phép chữa là chèn một đoạn văn ngăn giữa hai bảng, không phải tắt một thuộc tính.
>
> **Cái mất, đã đo:** khoảng trống ký tay cao thêm ~1,5cm, nên bản đầy đủ chứa được **ít hơn khoảng
> hai dòng sản phẩm** trên trang một. Hồ sơ dài hơn thì khối chữ ký sang trang sau, như mọi văn bản
> dài ra.

**Bỏ mục *Giấy tờ hồ sơ*** `sửa 01/09` — *"bỏ mục giấy tờ hồ sơ, không cần trong thông tin của hồ
sơ"*. Trang hồ sơ CSBH còn **hai** khối tệp: *Bản mềm* và *File SCAN bản cứng* (`đổi tên 07/09`).

> Đây là câu tiếp theo của lượt bỏ dòng *File đính kèm* khỏi hai mẫu hồ sơ, ngay bên trên: giấy tờ
> đính lúc lập thôi xuất hiện trên tờ giấy, và giờ thôi xuất hiện trên màn hình.
>
> **Hệ quả rộng hơn một khối bị ẩn, và đã nêu ra:** đó là chỗ DUY NHẤT của giao diện đính được loại
> tệp ấy, nên **Trình dược viên thôi đính giấy tờ vào hồ sơ CSBH**. Tệp của hồ sơ cũ còn nguyên trong
> cơ sở dữ liệu và trên kho lưu trữ; đường máy chủ cũng còn nguyên, nên cần bày lại thì chỉ phải dựng
> lại phần màn hình. Hồ sơ pháp lý của khách hàng **không liên quan** — nó ở hồ sơ khách hàng và vẫn
> hiện trên trang hồ sơ CSBH như cũ.

**Phóng to được ảnh trong hộp xem** `sửa 01/09` — *"cho phép zoom bằng chuột hoặc biểu tượng khi xem
preview ảnh hoặc pdf nếu chưa có"*.

> Hộp xem **ảnh** có thanh phóng to: hai nút − và +, một nút phần trăm bấm vào là về cỡ vừa khung;
> lăn chuột cũng phóng, và ảnh đã phóng thì **kéo** để di chuyển. Tối đa 6 lần, không thu nhỏ xuống
> dưới cỡ vừa khung.
>
> **PDF không thêm gì, và đó là một quyết định.** Trình xem PDF của trình duyệt đã mang sẵn thanh
> công cụ phóng to cùng `Ctrl` + lăn chuột. Dựng thêm một bộ nút của mình thì phải điều khiển trình
> xem ấy qua tham số trong địa chỉ, tức **nạp lại cả tài liệu và nhảy mất chỗ người ta đang đọc** —
> tệ hơn hẳn thứ sẵn có.

**Tiêu đề cột thống nhất giữa màn hình và bản mềm** `sửa 01/09` — *"đồng bộ tiêu đề cột trong trang
hồ sơ CSBH và trong bản mềm"*.

> | Trước | Nay |
> |---|---|
> | *Giá bán Công ty* (màn hình) / *Giá công ty* (bản mềm) | **Giá bán Công ty** |
> | *CPBH tổng* | **CPBH** |
> | *CPBH1* (bản mềm) / *CPBH 1* (màn hình) | **CPBH 1** |
> | *Mã SP* (màn hình) / *Mã sản phẩm* (bản mềm) | **Mã sản phẩm** |
>
> Cặp thứ tư khách hàng không nêu — nó nằm ngay cạnh ba cặp kia và cùng một loại lỗi, nên sửa luôn.
> Hai cột chỉ có ở một bên vẫn giữ nguyên: *STT* chỉ có trên bản in, *QĐCK* chỉ có trên màn hình.
>
> Hai bảng tên cột **không gộp làm một được** (một bên là gói giao diện, một bên là mã máy chủ), nên
> chốt chặn là một phép đối chiếu tự động — thêm một cột ở một bên mà quên bên kia là hỏng ngay lúc
> ấy, không phải lúc ai đó cầm bản in lên so.

**Bề rộng cột bản mềm tự co giãn theo nội dung** `sửa 01/09` — *"độ rộng cột trong bản mềm tự động
được điều chỉnh để cố gắng không phải xuống dòng"*.

> Mỗi cột được chia bề rộng theo **ô dài nhất của chính nó**, thay cho bộ tỷ lệ cố định chốt `27/08`.
> Hai cột chữ — *Tên sản phẩm* và *Ghi chú* — có **trần**: chúng được phép xuống dòng, nên nhu cầu
> của chúng không được kéo mọi cột tiền vào chỗ vỡ chữ.
>
> **Đảo một nửa `27/08`.** Chặng ấy nới *Tên sản phẩm* lên 29% bề ngang sau khi đo trên bản in thật,
> và con số ấy đúng với danh mục lúc đó — nó vẫn sai với một danh mục toàn tên ngắn. Cái GIỮ LẠI là
> luật đứng sau: *cột chữ được xuống dòng, cột số thì không*.
>
> **Cái mất, đã cân nhắc:** hai bản CSBH của hai khách hàng khác nhau in ra không còn khớp lưới cột.
> Bảng nào cũng đọc được, chỉ là đặt cạnh nhau thì các đường kẻ dọc không thẳng hàng.

**Hai mẫu hồ sơ mặc định BỎ BỐN DÒNG, và một dòng đổi nghĩa** `sửa 01/09` — *"sửa lại văn bản hồ sơ
mặc định cả đầy đủ và rút gọn trong default: bỏ số hồ sơ, người đại diện, và số điện thoại; tên khách
hàng là `{{tên người đại diện}} - …` chứ không phải `{{tên khách hàng}} - …`; bỏ dòng File đính kèm"*.

> Khối thông tin của cả hai mẫu còn đúng **bốn dòng**: *Mã khách hàng* · *Tên khách hàng* ·
> *Công nợ* · *Thời gian áp dụng* — và **ba** từ `07/09`, khi dòng cuối rời xuống bảng sản phẩm. Dòng *Tên khách hàng* in **tên người đại diện — địa chỉ đăng ký —
> MST**; ba dòng *Số hồ sơ*, *Người đại diện* (dòng riêng, có kèm chức danh và số điện thoại) và
> *File đính kèm* biến mất.
>
> **Đây là khách hàng đòi lại bản vẽ của chính họ.** *Số hồ sơ* và *File đính kèm* không có trên tờ
> mẫu họ gõ tay `30/08`; chúng bị chèn thêm vào đúng vì danh sách mục bắt buộc của muc 11.1 đòi. Nên
> lượt này danh sách ấy là thứ phải nhường, không phải tờ giấy.
>
> **Hai chốt chặn lúc gửi duyệt gỡ theo**: *chức danh người đại diện* (chốt `24/08`) và *số điện
> thoại* (chốt `27/08`). Một trường chỉ đáng chặn khi nó để lại một ô trắng trên bản đem đi ký — bỏ
> khỏi tờ giấy rồi mà vẫn chặn thì phần mềm bắt điền một thứ không ai đọc. Còn lại **hai** trường
> chặn: *Mã số thuế* và *Thời gian áp dụng* — và từ `07/09` còn **một**, khi *Thời gian áp dụng*
> chuyển xuống từng dòng sản phẩm.
>
> **Cái mất, đã cân nhắc và khách hàng chốt**: bản CSBH in ra **không còn tên pháp nhân của khách
> hàng** ở bất kỳ đâu — chỉ còn tên người đại diện, địa chỉ và mã số thuế. Mã khách hàng vẫn còn, và
> mã số thuế mới là thứ định danh pháp lý.
>
> **ĐẢO LẠI Ở `07/09`**: dòng ấy nay nối **năm phần** và tên pháp nhân quay về, đứng ngay sau tên
> người đại diện. Câu bỏ nó ở `31/08` đúng trong hoàn cảnh khi ấy — hai cái tên tranh MỘT chỗ trên
> cùng một dòng; chuỗi năm phần cho cả hai một chỗ riêng nên mâu thuẫn ấy hết. Xem mục *Dòng «Tên
> khách hàng» nối năm phần* dưới đây.

**BA loại văn bản mẫu, và ba mẫu MẶC ĐỊNH đi cùng hệ thống** `sửa 30/08` — bốn câu chốt cùng lúc:

> 1. **Thêm một thẻ cho *Hồ sơ mẫu rút gọn***; thẻ cũ đổi tên thành ***Hồ sơ mẫu đầy đủ***. Màn hình
>    *Văn bản mẫu* có ba thẻ: đầy đủ · rút gọn · hợp đồng.
> 2. **Mỗi loại một mẫu mặc định, deploy cùng hệ thống** — không cần `make demo-mau` lẫn
>    `./csbh nap-danh-muc`.
> 3. Ba mẫu ấy lấy từ ba file khách hàng gửi, thành **bản chuẩn tên cố định** trong `templates/default/`.
> 4. **Bỏ việc nạp mẫu** khỏi `make demo-mau` và `nap-danh-muc`.
> 5. **Bảng sản phẩm đúng màu và đúng định dạng** của tờ mẫu khách hàng gõ, và **tự chọn cột** theo
>    loại mẫu.
>
> **Vì sao là một LOẠI riêng, không phải một cờ.** Tập cột theo từng mẫu đã có từ `20/08`, nên "bản
> gọn" vốn dựng được mà không cần loại mới. Cái loại mới mang thêm là ba thứ tập cột không nói được:
> một **thẻ riêng** (tức một danh sách riêng), một **mẫu mặc định riêng**, và **tập cột suy từ loại**
> thay vì khai tay ở mỗi lượt tải lên.
>
> **Sáu cột của bản rút gọn**: STT · Mã sản phẩm · Tên sản phẩm · Giá bán Công ty · Giá bán buôn ·
> CPBH (tên cột `sửa 01/09`). Bốn cột bị cắt cùng một nhóm — từng khoản CPBH, giá thu về, tỷ lệ CK, ghi chú — là phép tính
> ngược ra mức chiết khấu, thứ nội bộ Công ty dùng để duyệt. **CPBH tổng thì Ở LẠI**, vì tờ mẫu khách
> hàng gõ có nó; `21/08` mở cột ấy ra cho tắt với lý do "con số nội bộ", và ở đây họ trả lời khác.
>
> **Ô chọn của Sale Admin TRỘN CHUNG hai loại hồ sơ.** Họ chọn bản trình bày ở lúc in, và đầy đủ hay
> rút gọn đều là bản trình bày hợp lệ của cùng một hồ sơ. Ba thẻ của Quản trị là ba danh sách rời.
>
> **Đảo một nửa `28/08`.** Chặng ấy chốt *"hệ thống không bao giờ tự tạo một văn bản mẫu"*, với hai
> lý lẽ chồng lên nhau. Lý lẽ *"không tự DỰNG thân mẫu bằng mã"* **vẫn giữ** — `30/08` nạp ba FILE
> `.docx` bàn giao, thứ người ta mở ra xem và sửa được. Lý lẽ *"vô hiệu mẫu cuối cùng thì nó mọc
> lại"* cũng giữ: lượt nạp hỏi *"đã từng nạp chưa"* — đo bằng sự tồn tại của dòng, **tính cả dòng đã
> vô hiệu hoá** — chứ không hỏi *"loại này còn mẫu dùng được không"*. Quản trị tắt mẫu mặc định thì nó
> nằm im.
>
> **Màu hàng tiêu đề** theo NHÓM Ý NGHĨA, đọc thẳng từ tờ mẫu khách hàng: xám cho STT, vàng cho Mã
> sản phẩm, xanh cho tên và hai mức giá **của danh mục**, cam cho mọi cột từ CPBH trở đi — số **của
> riêng hồ sơ này**. Ranh giới xanh/cam tách phần không bàn cãi khỏi phần đang xin phê duyệt.
>
> **BỀ RỘNG CỘT giữ theo `27/08`, không lấy theo tờ mẫu.** Chặng ấy khách hàng nêu đích danh *"tên sản
> phẩm cần rộng hơn"* và cột ấy được nới lên 25,6%; tờ mẫu gõ tay để nó ở 12,4%. Lấy theo tờ mẫu là
> lặng lẽ đảo một yêu cầu họ đã nói thành lời.

**Hộp xem phóng to gần hết màn hình** `sửa 30/08` — *"phóng to hết cỡ hộp thư để preview văn bản,
gần như full hết cả màn hình, có thể đè lên thanh bar bên trái, đảm bảo scale phù hợp với tỉ lệ màn
hình; đối với preview ảnh thì tự điều chỉnh kích thước để fit với kích thước ảnh"*.

> **Bỏ hẳn trần chiều cao.** Khung xem cao bằng màn hình trừ đúng chỗ ngồi của tiêu đề và hàng nút.
> Ba lượt trước đặt trần 900px (`23/08`) → 1600px (`27/08`) → 1400px (`27/08`); từ đây màn hình càng
> cao thì khung càng cao, không có mức dừng. Khoảng hở mà lượt `27/08` cố ý chừa ra để hộp *"còn
> trông như hộp thoại"* nay bị cắt gần hết — chính khách hàng đảo lại câu ấy.
>
> **Bề rộng lấy phần LỚN HƠN** của hai vế: bề rộng ứng với chiều cao khung (`cao × tỷ lệ tờ giấy`)
> và sàn 900px của bản `27/08`. Nên nó **không bao giờ hẹp hơn bản trước**, và rộng thêm khi màn hình
> cho phép — khổ ngang trên màn 1920×1080 ra 1210px, trên 2560×1440 ra 1720px. Khổ **dọc** thì sàn
> thắng ở mọi màn hình văn phòng, tức giữ nguyên hành vi cũ; đó là chủ ý, vì một tờ dọc rộng 605px
> đúng là thứ khách hàng đã than phiền ngày `27/08`.
>
> Vì sao vế tỷ lệ là mức **tối ưu** chứ không phải tối đa: trình xem PDF được bảo *"vừa bề rộng"*,
> nên hộp rộng hơn mức ấy chỉ làm nó phóng trang cao hơn khung rồi sinh ra một thanh cuộn dọc bên
> trong khung. Rộng đúng bằng ấy thì trang lấp đầy khung theo **cả hai chiều**.
>
> **ẢNH thì chặn ở cỡ THẬT của tệp.** Một tấm 400×300 kéo lên cao 900px là phóng to gấp ba — mờ theo
> kiểu người dùng tưởng bản scan bị hỏng. PDF không chặn: nó là ảnh vector, phóng bao nhiêu cũng nét.
>
> **Đè lên thanh bên: đã đúng từ trước.** Lớp phủ vốn phủ kín màn hình và nằm trên thanh bên; cái làm
> hộp trông nhỏ là trần chiều cao và bề rộng cố định, không phải thanh bên.

**Xem được văn bản mẫu đã lưu** `mới 28/08` — hộp *Chi tiết mẫu* trên màn hình Quản trị, chỉ đọc:
tập cột của bảng sản phẩm, bảng ô trống ↔ nguồn dữ liệu, và nút **tải file `.docx` gốc** về.

> Xem được **cả mẫu đã vô hiệu hoá**. Đó là chủ ý: hệ thống thôi tự tạo mẫu (xem dưới), nên nếu vô
> hiệu hết mẫu thì đường duy nhất để có lại là tải một `.docx` lên — mà file duy nhất trong tầm tay
> Quản trị là file lấy về từ chính đây.
>
> **Vẫn KHÔNG sửa được mẫu.** Sửa một mẫu đã gắn vào hồ sơ đã ký là sửa chính văn bản đã duyệt. Muốn
> đổi thì tải file về, sửa trong Word, thêm mẫu mới, vô hiệu mẫu cũ.
>
> Chỗ hở này do chính hệ thống tạo ra: `0067` bỏ việc sửa mẫu với lý do *"muốn đổi thì XOÁ đi và
> thêm mẫu mới"*, rồi `0098` bỏ luôn quyền xoá vì mẫu đã đóng băng vào hồ sơ. Đường thoát bị lấy đi
> mà không ai để ý.

**Tên văn bản mẫu không được trùng** `mới 28/08` — trong cùng một loại mẫu, tính **cả mẫu đã vô hiệu
hoá**. Ô chọn mẫu chỉ hiện đúng một cột là cái tên, nên hai mẫu trùng tên là hai dòng không phân
biệt được.

> Cái giá, có chủ ý: tên của một mẫu hỏng **không dùng lại được**. Chữa một mẫu sai là tải bản mới
> lên rồi vô hiệu bản cũ, và bản mới phải mang tên khác.

> **ĐẢO MỘT NỬA `30/08`** — hệ thống lại có mẫu mặc định, nhưng nó **NẠP FILE** bàn giao chứ không
> **DỰNG** thân mẫu bằng mã, và nó không mọc lại sau khi bị vô hiệu. Xem mục *"BA loại văn bản
> mẫu…"* ở cuối Phụ lục B; đoạn dưới đây giữ lại vì nó là tiền đề của bảy chặng sau nó.

**Hệ thống KHÔNG BAO GIỜ tự tạo văn bản mẫu** `mới 28/08` — bỏ hẳn khái niệm *mẫu mặc định*.

> Trước đó hệ thống dựng sẵn một mẫu hồ sơ mỗi khổ giấy và một mẫu hợp đồng lúc khởi động. Hệ quả:
> vô hiệu hoá mẫu cuối cùng của một khổ thì lần khởi động sau có một mẫu Quản trị không hề tạo xuất
> hiện trong ô chọn của mọi người.
>
> **Cái giá**: hệ thống vừa cài xong **không dùng được** cho tới khi có mẫu — không mẫu nào thì
> không gửi duyệt được hồ sơ nào. Nạp danh mục ban đầu (hoặc một lượt tải mẫu tay) thành **bước cài
> đặt bắt buộc**.

**Gỡ một tệp là XOÁ HẲN nó** `mới 28/08` — gỡ giấy tờ hồ sơ, gỡ bản cứng, gỡ hồ sơ pháp lý của
khách hàng: cả ba đều xoá tệp khỏi kho lưu trữ, không khôi phục được.

> Trước lượt này chỉ dòng trên màn hình biến mất; tệp vẫn nằm lại kho và vẫn tải về được bằng đường
> dẫn cũ. Không phải lỗ hổng phân quyền — vẫn đúng những người có quyền xem — nhưng *"đã gỡ"* mà vẫn
> đọc được thì không phải điều người bấm nút mong đợi. Và trong toàn phần mềm khi ấy **không thao tác
> nào của người dùng xoá được một byte** khỏi kho.
>
> Kèm theo: tải lên là hai bước (nhận tệp · ghi vào hồ sơ), và bước hai bị từ chối — hồ sơ vừa gửi
> duyệt, sai vai trò — thì tệp ở bước một **được dọn ngay** thay vì nằm lại.

**Giấy tờ hồ sơ đi theo phiên bản mới** `mới 28/08` — lập CSBH bổ sung hoặc chỉnh sửa thì các tệp
*Giấy tờ hồ sơ* của bản đang hiệu lực được **chép sang** bản mới, y như dòng sản phẩm.

> **Bản cứng KHÔNG đi theo** — nó là tờ giấy đã ký của phiên bản cũ; chép sang là để bước *Sale Admin
> bàn giao* của bản mới đi qua chốt "phải có bản scan" bằng chữ ký của một bản khác.
>
> Mỗi bản nhận một BẢN SAO riêng, không dùng chung tệp: gỡ giấy tờ ở bản cũ không được làm bản mới
> mất tệp.
>
> Đi theo đúng những giấy tờ bản cũ **đang có** `sửa 28/08` — thứ đã gỡ thì không quay lại.

**Bản mềm CHỈ của Sale Admin, và mẫu THÔI đóng băng** `sửa 29/08` — ba câu khách hàng nói cùng lúc,
và chúng chỉ có nghĩa khi đi cùng nhau:

> 1. **Bỏ mục *Xem bản mềm* của TDV, Trưởng bộ phận và Kế toán** — chỉ Sale Admin giữ. Hỏi lại riêng
>    về **Ban lãnh đạo** và khách hàng chốt đúng chữ *"chỉ giữ ở SA"*, dù đó là nút DUY NHẤT của vai
>    trò chỉ-đọc trên trang hồ sơ.
> 2. **Bỏ việc chọn văn bản mẫu lúc TDV gửi duyệt** — chuyển sang Sale Admin, chọn lúc mở bản mềm.
> 3. **Mẫu bản mềm KHÔNG đóng băng theo hồ sơ** — *"mục đích của bản mềm chỉ để in ra bản cứng tại
>    thời điểm đó"*.
>
> **Vì sao ba câu là một câu.** Quyết định `23/08` đóng băng mẫu, và lý lẽ khi ấy đúng với giả định
> khi ấy: bản mềm là **văn bản đi qua luồng duyệt**, nên phải bất biến từ lúc gửi tới lúc ký. Câu
> thứ ba nói lại rằng giả định ấy sai — bản mềm là **thao tác IN của Sale Admin ở bước B8**. Cái
> được duyệt là dữ liệu hồ sơ, và dữ liệu ấy vẫn đóng băng nguyên vẹn (giá, ngưỡng, tám trường khách
> hàng, tên người ký). Khi bản mềm chỉ còn là thao tác in của MỘT người ở MỘT bước thì chỉ người ấy
> cần nút, chỉ người ấy chọn mẫu — và chọn lúc in, không lúc gửi — nên không còn gì để đóng băng.
>
> **CÁI MẤT, ghi ra để không ai phải đoán.** *Hồ sơ đã ký in lại hôm nay có thể ra một tờ giấy KHÁC*
> hôm nó được ký, nếu Quản trị đã sửa danh mục mẫu ở giữa; và *vô hiệu hết mẫu thì không hồ sơ nào
> in được*, kể cả hồ sơ đã có hiệu lực. Trước `29/08` cả hai chuyện ấy không xảy ra được. Khách hàng
> chấp nhận: tờ giấy có giá trị pháp lý là **bản cứng đã ký và đã scan**, không phải bản mềm dựng
> lại. *Người duyệt thôi xem được tờ CSBH* — họ đọc **bảng dữ liệu** trên màn hình chi tiết hồ sơ,
> vốn đã mang đủ mười ba mục của mục 11.1.
>
> **Đảo một nửa quyết định `28/08`.** Chặng ấy ghi *"không có văn bản mẫu thì không hồ sơ nào gửi
> duyệt được"*. Từ đây gửi duyệt không cần mẫu; thiếu mẫu chỉ chặn đúng thao tác in của Sale Admin.
>
> Kéo theo, và đã làm: **gửi duyệt về lại MỘT bước** (bước hai của `27/08` sinh ra chỉ để đọc bản
> xem trước), và hộp *Xem bản mềm* **luôn hỏi mẫu** ở mọi trạng thái hồ sơ, mở ra rỗng.

**Hồ sơ pháp lý của khách hàng hiện ngay trên trang hồ sơ CSBH** `mới 29/08` — người duyệt đối chiếu
giấy phép kinh doanh mà không phải rời trang sang khách hàng rồi quay lại.

> **CHỈ ĐỌC ở đây**, kể cả với Trình dược viên phụ trách: xem và tải được, thêm và gỡ thì sang trang
> khách hàng. Trang hồ sơ là chỗ đọc một hồ sơ CSBH, không phải chỗ quản lý giấy tờ khách hàng.
>
> Nhãn ghi rõ *"của khách hàng"* — trang này đã có hai mục tệp khác (*Giấy tờ hồ sơ*, *Bản cứng*).

**Nút *Bàn giao* chỉ khả dụng khi đã có bản scan** `mới 29/08` — Sale Admin thấy nút xám kèm một dòng
nói rõ còn thiếu gì, thay vì bấm rồi mới nhận lỗi.

> **Chốt chặn ở máy chủ không đổi**: `SA_HANDOVER` khi chưa có bản scan vẫn trả lỗi (WF-14, có từ
> đầu). Lượt này chỉ thêm nửa còn lại — đừng bày ra một nút bấm vào chỉ nhận lỗi.

**Kế toán chỉ thấy hồ sơ ĐÃ TỪNG TỚI BÀN MÌNH** `sửa 29/08` — mở rộng luật `27/08`. Trước đó hồ sơ
chỉ bị giấu ở trạng thái *Chờ TBP duyệt*, nên **Trưởng bộ phận trả hồ sơ về là Kế toán lại thấy nó**
dù nó chưa bao giờ tới lượt họ. Giờ điều kiện bỏ hẳn vế trạng thái.

> Hồ sơ do **chính Kế toán** trả lại ở L1 hay L2 thì họ VẪN thấy: nó đã qua bàn họ, và không lượt trả
> về nào xoá dấu ấy.
>
> Đọc theo nghĩa đen *"chỉ thấy khi đã từng được kế toán TÁC ĐỘNG"* thì Kế toán không bao giờ thấy hồ
> sơ đang chờ chính mình, và không ai xử lý được bước nào — nên câu ấy hiểu là *"đã tới lượt Kế
> toán"*, tức đã qua chữ ký Trưởng bộ phận.

**Trạng thái *KT duyệt bản mềm* đổi tên thành *Chờ KT duyệt L1*** `sửa 29/08`. *KT duyệt bản cứng*
**giữ nguyên tên** (chốt riêng) — hai nhãn không cùng một lối đặt tên, có chủ ý.

**BỎ HẲN trạng thái *Từ chối*** `mới 29/08` — và bỏ luôn cả nút. Ở bước *Chờ TBP duyệt*, Trưởng bộ
phận chỉ còn **hai** đường ra: **Ký số duyệt** hoặc **Trả lại chỉnh sửa**.

> **Đường kết thúc một hồ sơ không mất, nó đổi tay**: TBP trả lại, rồi chính người lập bấm **Xoá** —
> hồ sơ mang nhãn *Đã xoá*. Khớp với luật đã có: chỉ TDV xoá được hồ sơ của mình.
>
> **Cái mất**: TBP không còn tự kết thúc được một hồ sơ. Nếu người lập không đồng ý, hồ sơ nằm ở
> *Yêu cầu chỉnh sửa* cho tới khi một trong hai người hành động — trạng thái ấy **không có SLA**.
>
> Hồ sơ đang ở *Từ chối* chuyển sang *Đã xoá*; lý do Trưởng bộ phận đã gõ vẫn nằm nguyên trong nhật
> ký. Trạng thái hồ sơ còn **mười** giá trị.
>
> **Thống kê mất chỉ số *Bị từ chối*** và một lát của biểu đồ cơ cấu kết cục — một chỉ số không ai
> tới được nữa thì luôn bằng 0. Báo cáo *tỷ lệ trả lại* **giữ** ô `rejected` cho dữ liệu cũ.

**Một khách hàng có NHIỀU địa chỉ** `mới 29/08` (`thu hẹp 05/09` — chỉ còn *Địa chỉ giao hàng*; xem
mục *"Địa chỉ đăng ký thành hai ô"* ở dưới) — thêm được nhiều dòng, tối đa 50.

> **Tờ CSBH và hợp đồng in HẾT, mỗi địa chỉ một dòng** — thứ tự in đúng thứ tự người dùng sắp trong
> biểu mẫu, nên dòng đầu là địa chỉ đầu.
>
> **Thẻ ở danh sách khách hàng** chỉ hiện địa chỉ đầu kèm *+N địa chỉ khác*: thẻ ấy trả lời *"có phải
> khách tôi đang tìm không"*, và ba dòng địa chỉ trên mỗi thẻ làm danh sách không đọc được nữa.
>
> Việc này **mở đường cho luật cấm trùng mã số thuế**: tới nay *"một chủ hộ nhiều điểm bán"* được làm
> bằng cách lập nhiều khách hàng cùng MST, mỗi bản một địa chỉ. Từ đây nó là **một khách, nhiều địa
> chỉ** — nên cấm trùng MST thôi chặn nhầm nghiệp vụ. **Luật ấy chốt ngày 05/09**, đúng một chặng sau.
>
> Địa chỉ dán từ Word có ký tự xuống dòng thì hệ thống **gộp lại thành một dòng**, không báo lỗi.

**Địa chỉ đăng ký thành HAI Ô và chỉ có MỘT; mã số thuế BẮT BUỘC và DUY NHẤT** `sửa 05/09` — sáu câu
trong một lượt phản hồi, và chúng chạm cùng một màn hình:

> 1. Mục *Tên khách hàng* đổi nhãn thành ***Tên Hộ kinh doanh/Tên Công ty***.
> 2. Biểu mẫu bỏ ô *Địa chỉ đăng ký*, thay bằng **hai ô bắt buộc**: *Tỉnh/Thành phố (theo đăng ký
>    kinh doanh)* và *Số nhà, Phường xã (theo đăng ký kinh doanh)* — và **chỉ có một** địa chỉ.
>    (`sửa 19/09` — *Tỉnh/Thành phố* thôi là ô gõ tự do: nó là **ô chọn trong 63 tỉnh, thành phố
>    theo danh sách CŨ**, viết tên ngắn, và máy chủ từ chối mọi giá trị ngoài danh sách ấy.)
> 3. Hai ô ấy **hiện ra ở trang thông tin khách hàng**.
> 4. Nút *Thêm địa chỉ giao hàng* căn lại cho gọn; **địa chỉ giao hàng hiện ở trang thông tin khách
>    hàng nếu có**.
> 5. Bốn loại giấy tờ đổi tên: *Giấy đăng ký kinh doanh* · *Giấy GPP* · *Căn cước công dân* · *Khác*.
> 6. **Không cho hai khách hàng trùng mã số thuế** — báo ngay dưới ô lúc nhập, không cho lưu — và
>    **mã số thuế bắt buộc**.
>
> **Câu 2 và câu 6 là một việc.** Chốt `29/08` cho trùng mã số thuế với đúng một lý do — *"một chủ hộ
> mở nhiều điểm bán"* — và mở đường thay thế bằng nhiều địa chỉ. Lượt này thu địa chỉ ĐĂNG KÝ về một
> (nó theo giấy đăng ký kinh doanh, mà một pháp nhân chỉ có một tờ giấy ấy) và đẩy "nhiều điểm bán"
> sang **địa chỉ giao hàng**, thứ vẫn là danh sách. Tới đó thì hai khách cùng mã số thuế thôi là một
> cách khai hợp lệ.
>
> **Mã số thuế duy nhất chỉ tính giữa khách ĐANG hợp tác.** Khách đã ngừng là dữ liệu lịch sử; giữ
> chỗ mã số thuế của họ là cấm luôn lượt lập lại chính họ khi họ quay lại.
>
> **Hai hệ quả vận hành, nói ra trước:**
>
> - **Bản nâng cấp DỪNG LẠI nếu dữ liệu đang có còn hai khách trùng mã số thuế.** Nó in ra danh sách
>   mã khách phải xử lý. Hệ thống không tự chọn được giữ bản nào — đó là quyết định nghiệp vụ.
> - **Địa chỉ cũ tách được hay không là tuỳ chuỗi.** Đoạn cuối mở đầu bằng *Thành phố*, *Tỉnh* hay
>   *TP* thì thành ô tỉnh/thành; không khớp thì cả chuỗi vào ô số nhà và **ô tỉnh/thành để trống**.
>   Để trống chứ không đoán bừa: ô trống thì người dùng thấy ngay lúc mở ra sửa, còn một tỉnh/thành
>   đoán sai thì đi thẳng lên tờ CSBH mà không ai biết. Ô ấy bắt buộc nên lượt sửa tiếp theo của
>   khách hàng đó là lượt lấp chỗ trống. (`sửa 19/09` — từ khi *Tỉnh/Thành phố* thành ô chọn, một
>   giá trị tách ra được nhưng **không trùng tên nào trong 63** cũng rơi vào cùng tình thế: ô chọn
>   bày nó kèm chữ *giá trị cũ, phải chọn lại*, và lượt sửa tiếp theo bị chặn tới khi chọn lại.)
>
> **Khách hàng cũ chưa khai mã số thuế thì cột vẫn trống** — chốt bắt buộc chỉ áp cho lượt LẬP MỚI.
> Biểu mẫu khai ô ấy bắt buộc, nên bất kỳ lượt sửa nào cũng lấp nốt.

**Khối thông tin khách hàng: năm ô, Loại khách hàng ở cuối** `mới 29/08` (`sửa 05/09` — thành **bảy**:
hai ô địa chỉ đăng ký chen vào sau mã số thuế, cộng *Địa chỉ giao hàng* khi có) — màn hình chi tiết
khách hàng bày *Mã số thuế* · *Tỉnh/Thành phố* · *Số nhà, Phường xã* · *Người đại diện* · *Số điện
thoại* · *Công nợ* · *Loại khách hàng*.

> **Địa chỉ đăng ký ra khỏi khối ấy** — bỏ khỏi CHỖ BÀY, không bỏ khỏi hệ thống. Trường vẫn bắt buộc
> lúc lập khách, vẫn sửa được, vẫn đóng băng vào hồ sơ (`0101`) và vẫn in trên tờ CSBH lẫn hợp đồng.
>
> Nó **vẫn hiện trên thẻ ở danh sách**: hai khách trùng tên chỉ phân biệt được bằng địa chỉ, và ô tìm
> kiếm ngay trên đó khai *"tìm theo tên, địa chỉ hoặc mã số thuế"*.
>
> *Loại khách hàng* xuống cuối vì nó là một phân loại, không phải thông tin liên hệ — và người lập hồ
> sơ vốn đã đọc nó ở thẻ danh sách, cạnh mã, trước khi mở khách hàng ra.

**Khối *Khách hàng* trên TRANG HỒ SƠ CSBH: tám ô** `mới 06/09` — *Mã* · *Người đại diện* · *Tên Hộ
kinh doanh/Tên Công ty* · *Số nhà, Phường xã* · *Tỉnh/Thành phố* · *Địa chỉ giao hàng* (chỉ khi có) ·
*Loại* · *Công nợ*. Trước lượt này là bốn: *Mã* · *Tên* · *Loại* · *Công nợ*.

> **Khối này là một thứ khác với khối trên màn hình KHÁCH HÀNG** — hai màn hình, hai câu hỏi. Ở đây
> mọi ô là dữ liệu **đã đóng băng lúc gửi duyệt** (mục 5, ý 8); ở kia là dữ liệu hôm nay.
>
> ***"Bỏ mục tên"* không phải bỏ tên khách hàng.** Câu kế tiếp của cùng yêu cầu đòi thêm *tên hộ kinh
> doanh/tên công ty*, và đó chính là dữ liệu ô cũ đang mang — quyết định `05/09` đã đổi nhãn của nó ở
> biểu mẫu lập khách hàng, trang hồ sơ là chỗ còn sót. Đây là một lượt **đổi nhãn cộng thêm một ô**.
>
> **Địa chỉ giao hàng chỉ hiện khi có**, mỗi địa chỉ một dòng. Không có dòng nào nghĩa là *giao tới
> địa chỉ đăng ký*, một câu trả lời đầy đủ chứ không phải một ô còn trống.
>
> **Hồ sơ gửi duyệt TRƯỚC 06/09 hiện MỘT ô *Địa chỉ đăng ký*** thay cho hai ô: lượt gửi của chúng chỉ
> giữ lại địa chỉ ở dạng một dòng, và phần mềm bày đúng thứ đã giữ chứ không tự cắt ra hai ô — cắt sai
> chỗ thì không ai biết. Hồ sơ còn trong luồng có hai ô ngay lượt gửi lại tiếp theo; hồ sơ đã có hiệu
> lực giữ nguyên một ô, đúng như một tờ giấy đã ký.

**NGÀY ÁP DỤNG THEO TỪNG SẢN PHẨM, và bốn thay đổi đi kèm ở bảng sản phẩm** `mới 07/09` — *"Bỏ
phần ngày áp dụng cho CSBH, thay vào đó gán ngày áp dụng vào cho từng sản phẩm cụ thể. Khai báo
thông tin ngày áp dụng khi thêm sản phẩm, cột ngày áp dụng để bên trái mã sản phẩm."*

> **Hồ sơ CSBH KHÔNG còn ngày áp dụng nào.** Cột ấy gỡ hẳn, không giữ lại làm cột dẫn xuất — đã cân
> nhắc giữ một ngày bằng *ngày sớm nhất của các dòng*, và bỏ ý ấy vì một hồ sơ bốn dòng bốn ngày thì
> "ngày áp dụng của hồ sơ" là câu **không có câu trả lời đúng**: in ngày sớm nhất ra tờ giấy đem ký
> là nói sai về ba dòng còn lại.
>
> Kéo theo, và đều là quyết định:
>
> - ô ***Thời gian áp dụng*** rời khỏi hai mẫu hồ sơ mặc định và khỏi bảng trường nguồn — ngày in ra
>   ở **cột đầu của bảng sản phẩm**. Mục *thời gian áp dụng* của muc 11.1 vẫn có mặt trên tờ giấy,
>   chỉ khác chỗ đứng; phép kiểm tự động lúc lưu mẫu còn **6/13** (trước là 7);
> - **phép chặn gửi duyệt** cho trường ấy biến mất — không phải nới, mà vì cột mới `NOT NULL` và máy
>   chủ điền mặc định, tức không có trạng thái "thiếu" nào. Còn **một** trường chặn: *Mã số thuế*;
> - **bộ lọc *"CSBH áp dụng từ … đến …"*** ở màn hình Thống kê đổi nghĩa sang **ngày sớm nhất của
>   các dòng**, và cột trên bảng danh sách hồ sơ đổi nhãn thành ***Áp dụng từ***;
> - **màn hình *Lập hồ sơ* thôi hỏi ngày**; ô ngày chuyển sang hộp thoại *Thêm sản phẩm*, đứng
>   **trước** ô chọn sản phẩm vì giá bán Công ty và ngưỡng xem trước đều tra theo chính ngày ấy.
>
> **Nâng cấp một hệ đang chạy:** ba mẫu mặc định bị xoá trong migration để bộ nạp tạo lại từ ba tệp
> mới — mẫu do người dùng tự tải lên **không bị chạm**, nhưng mẫu nào còn dùng ô `{{ho_so.ngay_ap_dung}}`
> sẽ in ra **ô rỗng** cho tới khi được thay. Xem `docs/04-TRIEN-KHAI.md`.

**Cột QĐCK hiện NGƯỠNG, tên quy định lui vào dấu `?`** `sửa 07/09` — *"nội dung của cột QĐCK hiển thị
số phần trăm chứ không hiển thị tên QĐCK, để dấu «?» nhỏ bên cạnh để khi người dùng di chuột vào sẽ
hiện tên QĐCK"*.

> Con số phần trăm đọc được ngay cạnh *Tỷ lệ CK* ở cùng hàng; mã quy định thì phải mở màn hình khác
> mới biết nó nghĩa là bao nhiêu. Mã KHÔNG mất — nó nằm trong câu của dấu `?`, và vẫn dán được vào ô
> tìm kiếm ở màn hình Chiết khấu. Cột này **chỉ có trên màn hình**, không in ra giấy (chốt `19/08`).

**BẤM NHÃN *Chỉnh sửa* THÌ THẤY DÒNG ẤY ĐỔI NHỮNG GÌ** `mới 12/09` `bỏ 21/09` — *"đề xuất cách hiển thị để
người dùng thấy luôn được thông tin nào của sản phẩm bị thay đổi"*.

> Nhãn trạng thái **giữ nguyên chữ**, không mang thêm thông tin nào — khách hàng chốt từng chữ. Thứ
> thêm vào là một thao tác: bấm vào nhãn thì ngay dưới hàng ấy mở ra một bảng ba cột — **Thay đổi ở ·
> Bản trước · Bản này** — liệt kê đúng những trường đã khác bản CSBH trước. Bấm lần nữa thì đóng; mở
> nhiều dòng cùng lúc được.
>
> Cùng hình dạng với khối *Yêu cầu cập nhật* trên cùng trang (dòng gấp lại, bấm mới mở chi tiết), nên
> không có cách đọc thứ hai phải học.
>
> **Đã cân và loại bỏ**: đánh dấu ngay trong ô kèm số cũ ở dòng dưới — mọi hàng *Chỉnh sửa* cao gấp
> đôi giữa một bảng tiền vốn đọc theo cột dọc; và thêm một cột *giá trị cũ* cho từng trường — bảng đã
> 13–15 cột.
>
> **Bản in KHÔNG đổi gì** (chốt `12/09`). Bảng này là đường tra ngược của người duyệt trên màn hình,
> cùng loại với cột *QĐCK* vốn đã chỉ có trên màn hình từ `19/08`.
>
> **Tên trường trong bảng chi tiết LÀ tiêu đề cột của chính bảng sản phẩm** — không phải một danh
> sách chữ thứ hai. Người ta bấm rồi đọc, trong khi mắt đang ở ngay cạnh hàng tiêu đề.
>
> **CPBH liệt kê từng khoản, không cộng lại**: hai cách chia vẫn có thể cùng tổng (`5.000` →
> `3.000 + 2.000`), và khi ấy một dòng *"CPBH 5.000 → 5.000"* là một thay đổi tự nói rằng nó không có
> thay đổi nào.
>
> ***Tỷ lệ CK cũ* giữ nguyên cột riêng.** Những trường được so là **nguyên nhân**, tỷ lệ CK là **hệ
> quả** — chúng không phải hai bản sao của một thứ.
>
> > **THAO TÁC BẤM NÀY ĐÃ BỎ ở `21/09`**: giá trị cũ về thẳng ô của nó dưới dạng một dấu tam giác, nên
> > nhãn *Chỉnh sửa* trở lại là một con chip chữ. Cột *Tỷ lệ CK cũ* thì GIỮ — lập luận ngay trên vẫn
> > đúng, và nó là cột duy nhất bày con số cũ mà không phải rê chuột.

**MỘT nút thay cho *Bổ sung* và *Chỉnh sửa*** `sửa 07/09` — *"Gộp hai nút bổ sung và chỉnh sửa CSBH
vào thành 1"*.

> Hai nút cũ dẫn tới **cùng một việc**: phiên bản mới chứa lại toàn bộ sản phẩm cũ, rồi TDV thêm bớt.
> Chúng chỉ bắt người lập trả lời trước một câu hỏi mà họ chỉ biết câu trả lời sau khi mở hồ sơ ra —
> và rất thường là **cả hai**. Nút còn lại: ***Lập phiên bản mới***.
>
> Sự phân biệt ấy không mất, nó chuyển xuống đúng chỗ có dữ liệu để trả lời — **trạng thái của từng
> dòng**, ngay dưới đây.

**BA TRẠNG THÁI cho từng sản phẩm trong CSBH, và cột *Tỷ lệ CK cũ*** `mới 07/09` — *"Mỗi sản phẩm
trong CSBH sẽ có 3 trạng thái: «Bổ sung» cho sản phẩm thêm mới so với CSBH đang có, «Chỉnh sửa» cho
sản phẩm đã có sẵn và bị sửa, «Đang áp dụng» cho sản phẩm đã có. Thêm một cột trạng thái cho từng sản
phẩm, trạng thái sẽ được tự cập nhật khi TDV thêm, sửa sản phẩm. Thêm 1 cột «Tỷ lệ CK cũ» bên cạnh
«Tỉ lệ CK» để hiển thị tỷ lệ CK cũ trong phiên bản trước cho các sản phẩm đã bị TDV chỉnh sửa."*

> **So với CSBH BỊ THAY THẾ**, không phải với một mốc nào khác. Phiên bản đầu tiên của một khách hàng
> không có bản trước, nên **mọi dòng của nó là *Bổ sung*** — chúng đều là mặt hàng vừa được đưa vào.
>
> ***"Bị sửa"* là đổi một dữ liệu SẼ ĐI RA TỜ GIẤY**: giá bán buôn · các khoản CPBH · ngày áp dụng —
> **cộng Giá bán Công ty** `sửa 12/09`, **trừ ghi chú** `sửa 21/09`.
>
> > Bản `07/09` viết *"đổi BẤT KỲ dữ liệu nào người lập nhập"*, tức có cả **ghi chú**. Khách hàng bỏ
> > vế ấy ở `21/09` — xem mục riêng ở dưới; ghi chú là lời nhắn cho người duyệt, không phải nội dung
> > chính sách.
>
> > **Giá bán Công ty vào phép so từ `12/09`**, đảo lại chốt `07/09`. Lý do cũ: *"nó đến từ danh mục
> > và được chụp lại ở MỖI LƯỢT MỞ hồ sơ còn sửa được, nên đưa vào phép so là để danh mục đổi giá một
> > mình cũng làm mọi dòng nhảy sang Chỉnh sửa trong khi TDV chưa đụng vào gì"*. Mệnh đề ấy **hết đúng
> > từ `10/09`**, lượt bỏ phép chụp lại ở đường đọc: từ đó giá trên dòng chỉ đổi khi TDV **bấm *Tự
> > động cập nhật*** hoặc khi **gửi duyệt**. Danh mục đổi giá một mình không còn chạm tới dòng nào.
> >
> > **Hệ quả đã nêu**: nhãn *Chỉnh sửa* giờ mọc ra được mà không ai gõ gì — hai lượt trên. Đó đúng là
> > câu đang hỏi: *"dòng này có khác bản trước không"*, không phải *"TDV có gõ gì không"*.
> >
> > **Ngưỡng chiết khấu VẪN đứng ngoài** — một dòng chỉ đổi ngưỡng (đổi *vượt ngưỡng*, không đổi tỷ lệ
> > CK) vẫn mang nhãn *Đang áp dụng*. Đây là chỗ duy nhất còn lệch, nêu ra để hỏi lại.
>
> Hệ quả có thật của việc **tính ra chứ không lưu một cờ**: sửa nhầm rồi sửa trả lại đúng giá trị cũ
> thì dòng **quay về *Đang áp dụng*** — hồ sơ khi ấy không khác bản đang hiệu lực ở dòng ấy, và một
> nhãn *Chỉnh sửa* dính lại sẽ bắt người duyệt đi tìm một khác biệt không tồn tại.
>
> ***Tỷ lệ CK cũ* chỉ hiện ở dòng *Chỉnh sửa***. Dòng *Đang áp dụng* có tỷ lệ cũ bằng đúng tỷ lệ mới —
> in ra là một cột lặp lại cột bên cạnh; dòng *Bổ sung* thì không có tỷ lệ cũ nào.
>
> **Hai cột này CÓ trong danh mục cột của văn bản mẫu nhưng KHÔNG tích sẵn cho hai mẫu mặc định**
> (khách hàng chốt riêng khi được hỏi): chúng trả lời câu *"bản này khác bản trước ở đâu"* — việc của
> người đang duyệt, không phải nội dung của một chính sách đem ký. Mẫu nào cần thì tự tích.

**HOÀN DUYỆT — Trưởng bộ phận rút lại chữ ký của chính mình** `mới 07/09` — *"Thêm một thao tác mới
cho TBP với những CSBH đang trong luồng duyệt gọi là «Hoàn duyệt». TBP có thể thực hiện thao tác này
đối với bất kỳ trạng thái nào của CSBH trừ «Chờ TBP duyệt», «đang có hiệu lực», «Nháp» và «Yêu cầu
chỉnh sửa». Khi TBP chọn «Hoàn duyệt», CSBH đó sẽ tự động về «Yêu cầu chỉnh sửa» đối với TDV"*.

> **BA trạng thái**, và chúng là phần giao nhau của hai câu trên: *Chờ KT duyệt L1* · *Sale Admin
> đang xử lý* · *Chờ KT duyệt bản cứng*. Nói gọn: **ba bước SAU chữ ký của chính TBP**.
>
> Ba trạng thái còn lại — *Quá hạn duyệt*, *Đã xoá*, *Hết hiệu lực* — đọc theo nghĩa đen câu thứ hai
> thì cũng lọt vào, nhưng khách hàng chốt là KHÔNG khi được hỏi: cả ba đã kết thúc (`18/08`, `0035`),
> và cho một hành động đi ra khỏi chúng là làm sống lại một hồ sơ đã xoá.
>
> **Bắt buộc nhập lý do** — giống ba đường trả hồ sơ về đã có. Hồ sơ quay về tay TDV kèm một câu nói
> rõ phải sửa gì; không có thì họ chỉ thấy hồ sơ tự bật lại.
>
> **Chữ ký TBP bị xoá và hồ sơ đi lại TOÀN BỘ vòng duyệt** — đúng luật `WF-20`. Đây không phải chi
> tiết kỹ thuật: giữ chữ ký lại thì lượt gửi lại sẽ không ký lại được, và hồ sơ nằm chết ở *Chờ TBP
> duyệt* (lỗ hổng `P0` mà `24/08` đã vá).
>
> **Báo cho CẢ BA** — TDV, Kế toán và Sale Admin — khác đường *Trả lại* ở B4B chỉ báo TDV. Lý do:
> lúc B4B hồ sơ chưa rời bàn TBP; lúc hoàn duyệt thì nó **đang nằm trên bàn người khác**, và việc họ
> đang làm vừa bị rút đi.
>
> ***Chờ TBP duyệt* bị loại vì ở đó đã có sẵn *Trả lại chỉnh sửa*** — hai nút làm cùng một việc ở
> cùng một chỗ là bắt người dùng đoán chúng khác nhau ở đâu.

**Bản mềm và bản cứng của PHIÊN BẢN TRƯỚC hiện trên hồ sơ đang duyệt** `mới 07/09` — *"Khi một chính
sách bán hàng được sửa đổi/bổ sung được TDV gửi vào luồng duyệt, khi đó vẫn cần phải hiển thị CSBH
bản mềm và bản cứng đã được lưu ở phiên bản ngay trước đó cho TBP và Kế toán có thể xem và so sánh"*.

> Một khối **CHỈ ĐỌC** trên trang hồ sơ, ngay dưới *Bản mềm* và *File SCAN bản cứng* của chính hồ sơ
> ấy, và ngay trên *Lịch sử*. Nó nói rõ mình thuộc hồ sơ nào và bấm sang được.
>
> **Ba điều kiện, và cả ba do MÁY CHỦ quyết định:**
>
> - hồ sơ **chưa duyệt xong** `sửa 07/09` — *Nháp* · *Yêu cầu chỉnh sửa* · và bốn bàn duyệt (chờ TBP
>   · chờ KT L1 · Sale Admin xử lý · chờ KT L2). Khối chỉ tắt khi hồ sơ đã xong: có hiệu lực, quá
>   hạn, hoặc đã xoá;
> - hồ sơ có **phiên bản trước** (bản mà nó thay thế);
> - chỉ **hai loại tệp**: bản mềm và file scan. Giấy tờ hồ sơ của bản cũ đã được chép sang bản mới
>   lúc lập (`28/08`), nên bày lại là bày hai lần cùng một tệp.
>
> **AI XEM ĐƯỢC:** ai đọc được hồ sơ MỚI. Không giới hạn đúng hai vai trò khách hàng nêu — Sale Admin
> và Ban lãnh đạo cũng đọc chính hồ sơ ấy và cùng có nhu cầu đối chiếu.
>
> **TDV XEM ĐƯỢC TRONG LÚC SOẠN** `sửa 07/09` — *"TDV cũng có thể xem được để đối chiếu trong lúc sửa
> hoặc nháp"*. Bản chốt đầu mở đúng bốn bàn duyệt, và hệ quả đã được nêu ra lúc ấy: khối tắt trong
> lúc TDV sửa. Khách hàng đọc xong đảo lại, và họ đúng ở một điểm: **người đang soạn cần đối chiếu
> TRƯỚC người đang duyệt** — sửa cho khớp rồi mới gửi thì đỡ hẳn một vòng trả lại.
>
> **Đây là một lượt NỚI QUYỀN, và nó cần thiết**: quyền đọc tệp vốn tính theo bốn cột người của chính
> hồ sơ chủ tệp, mà mỗi phiên bản chọn người duyệt riêng (`27/08`). Không nới thì đúng những lượt đổi
> người duyệt giữa hai phiên bản sẽ cho ra một khối đầy thẻ tệp mà bấm vào cái nào cũng báo *"ngoài
> phạm vi"*.
>
> Khe mở ra **hẹp đúng một mức**: chỉ ĐỌC (xem, tải), chỉ hai loại tệp trên, và chỉ cho người của một
> hồ sơ kế nhiệm **đang đi trong luồng**. Quyền GHI không đổi một chút nào — người duyệt bản mới
> không gỡ được tệp của bản đã ký.

**Dòng *Tên khách hàng* trên văn bản mẫu nối NĂM PHẦN** `sửa 07/09` — *"Nối mã: Tên người đại diện –
Tên Hộ kinh doanh/Tên Công ty – Số nhà/Phường xã – Tỉnh thành phố – Mã số thuế"*.

> Trước lượt này dòng ấy có **ba** phần: *tên người đại diện – địa chỉ đăng ký – MST*. Hai phần thêm
> vào, và mỗi phần đảo lại một quyết định cũ ở đúng chỗ nó không còn đúng nữa:
>
> - ***Tên Hộ kinh doanh/Tên Công ty* quay lại tờ giấy.** `31/08` bỏ nó vì khi ấy dòng này in tên
>   người đại diện **thay cho** tên pháp nhân — hai cái tên tranh một chỗ. Chuỗi năm phần cho cả hai
>   một chỗ riêng, nên mâu thuẫn ấy hết và bản CSBH lại mang tên pháp nhân của khách hàng.
> - **Địa chỉ tách làm HAI** — *Số nhà/Phường xã* rồi *Tỉnh thành phố* — thay cho một ô địa chỉ đăng
>   ký gộp. Cột gộp do phần mềm tự dựng từ hai ô ấy (`05/09`), và tách ngược nó ở dấu phẩy là cắt sai
>   chỗ ở mọi địa chỉ vốn đã có dấu phẩy. Nên bảng trường nguồn có **thêm hai khoá**; khoá địa chỉ
>   gộp GIỮ NGUYÊN cho mẫu nào muốn một ô đầy đủ.
>
> **Hồ sơ gửi duyệt TRƯỚC `06/09` in ra hai chỗ trống** ở phần địa chỉ: lượt gửi của chúng chỉ đóng
> băng địa chỉ ở dạng một chuỗi. Phần mềm **không** đọc địa chỉ hôm nay thay vào — đó là trộn hai
> thời điểm vào một tờ giấy đã ký. Hình dạng ấy tự hết: hồ sơ còn đi trong luồng chụp lại cả khối ở
> lượt gửi tiếp theo.

**Khối *Bản cứng* đổi tên thành *File SCAN bản cứng*** `sửa 07/09` — *"Sửa chữ «Bản cứng» thành
«File SCAN bản cứng»"*.

> Tên cũ gọi tên **VẬT** — tờ giấy đã ký — trong khi thứ nằm dưới nó là một danh sách **FILE**. Hai
> nghĩa ấy lệch nhau đúng ở câu người dùng hay hỏi: *"bản cứng đâu?"* có thể là *"tờ giấy ai đang
> giữ?"* hoặc *"file scan có chưa?"*, và khối này chỉ trả lời được câu thứ hai.
>
> **Chỉ đổi ở KHỐI TỆP.** Chữ *bản cứng* ở mọi chỗ khác vẫn nói về tờ giấy chứ không về file, nên
> chúng KHÔNG đổi: bước ***KT duyệt bản cứng*** trong luồng duyệt, việc ***Sale Admin bàn giao bản
> cứng***, khối ***Bản cứng*** của màn hình Thống kê (nó đếm lượt bàn giao và số ngày làm bản cứng,
> không đếm file). Đổi chúng theo là làm sai nghĩa một bước duyệt và hai biểu đồ.
>
> Đây là lần đổi tên **thứ hai** của khối ấy: `19/08` đổi từ *Tệp đính kèm* sang *Bản cứng*.

**RÚT MỘT MẶT HÀNG khỏi phiên bản mới** `mới 08/09` — *"Cho phép xóa một sản phẩm ra khỏi CSBH của
phiên bản trước đó, không cần phải có đầy đủ các sản phẩm của phiên bản trước · Khi xóa một sản phẩm
có trạng thái đang áp dụng, dòng đó chưa bị xóa khỏi bảng ngay, mà chỉ bị làm mờ và chuyển sang trạng
thái đã xóa, chỉ xóa hẳn khi hồ sơ sang trạng thái «đang có hiệu lực» · Bản mềm cũng không hiện sản
phẩm đã xóa · Ở trạng thái «Nháp» hoặc «Yêu cầu chỉnh sửa» cho phép thêm lại dòng sản phẩm đã xóa"*.

> **ĐẢO HẲN muc 5.4.** Tới hôm nay, một mặt hàng đã vào CSBH của một khách thì **không bao giờ ra
> được nữa**: gửi duyệt một phiên bản thiếu dòng thừa kế bị chặn (`MISSING_INHERITED_PRODUCT`), và
> không nghiệp vụ nào khác rút nó ra. Đó là một lỗ hổng chưa ai nói thành lời, và nó lộ ra qua một
> **bế tắc có thật**: mặt hàng bị **vô hiệu hoá trong danh mục** làm dòng thừa kế của nó không tra
> được giá hiện hành → chặn gửi duyệt kèm câu *"xoá sản phẩm đó rồi gửi lại"*; mà xoá thì chốt trên
> chặn. **Hai phép canh cấm nhau, hồ sơ chết hẳn ở Nháp**, không lối ra nào kể cả cho Quản trị.
>
> **Bỏ phép chặn KHÔNG phải là toàn bộ bản sửa, và một mình nó thì sai.** Luật cũ không tuỳ tiện — nó
> là hệ quả của ba câu ở ngay trên nó: mỗi khách **một** CSBH hiệu lực, bản mới duyệt xong thì bản cũ
> vô hiệu **toàn bộ**, hiệu lực quản lý ở **cấp hồ sơ**. Cộng lại: một mặt hàng vắng mặt ở bản mới
> **không rơi về bản cũ**, nó rơi ra khỏi mọi CSBH — tức là một quyền lợi bị **thu hồi**, thi hành
> lặng lẽ. Nên thứ thay cho phép chặn là làm cho việc rút **nhìn thấy được**: dòng nằm lại dưới nhãn
> ***Đã xoá***, làm mờ, đi cùng hồ sơ suốt luồng duyệt, để bốn bàn duyệt ký vào một tờ có nói ra mặt
> hàng nào đang mất.
>
> **Trạng thái dòng thứ TƯ**, cạnh ba trạng thái của `07/09`, và nó thắng cả ba khi cùng đúng.
>
> **Rút một dòng *Bổ sung* thì xoá HẲN ngay.** Mặt hàng ấy chưa bao giờ thuộc về khách hàng này, nên
> không có gì để cho ai xem; để lại một dòng mờ *"đã rút thứ chưa từng có"* chỉ làm bảng dài thêm.
>
> **Áp cho mọi dòng THỪA KẾ, không riêng dòng *Đang áp dụng*** (đọc theo mục đích, đã nêu giả định):
> dòng *Chỉnh sửa* cũng đến từ bản trước, nên rút nó cũng lấy đi một mặt hàng của khách. Đọc nghĩa
> đen thì nó xoá sạch không dấu vết — và tệ hơn, *sửa một dòng rồi mới xoá* trở thành đường vòng qua
> chính phép canh này.
>
> **Xoá hẳn ở bước có hiệu lực là bắt buộc, không phải dọn dẹp cho gọn**: phiên bản sau chép nguyên
> dòng của bản đang hiệu lực, nên giữ lại là mặt hàng vừa rút **mọc lại** ở bản sau, và người lập
> phải rút lại nó ở mọi phiên bản, mãi mãi.
>
> **Thêm lại là đường DUY NHẤT** đưa về một mặt hàng đã vô hiệu hoá trong danh mục — đường thêm mới
> chặn nó (`PRODUCT_DISABLED`). Nó khôi phục đúng dòng cũ với **nguyên số cũ**: khôi phục là hoàn tác
> lượt XOÁ, không phải hoàn tác những lượt sửa trước đó.
>
> **CAT-07 KHÔNG đổi.** Giữ lại một mặt hàng đã vô hiệu hoá vẫn chặn gửi duyệt — phần mềm vẫn không
> cho cam kết bán thứ đã ngừng bán. Cái đổi là giờ **có lối ra**: rút nó.

**MÀU BỐN NHÃN TRẠNG THÁI DÒNG** `sửa 08/09` — *"đổi màu tag đang áp dụng của sản phẩm sang màu
xanh, tag «Đã xóa» màu ghi xám"*.

> **XANH** *Đang áp dụng* · **XÁM** *Đã xoá* · **hổ phách** *Chỉnh sửa* · **chàm** *Bổ sung*.
>
> `07/09` đặt ngược lại, và lập luận của nó không sai: màu ở đó trả lời câu *"chỗ nào đáng soi"* —
> *Bổ sung* và *Chỉnh sửa* là hai thứ người duyệt phải nhìn vào, *Đang áp dụng* là phần không đổi nên
> lùi lại sau bằng màu xám. Khách hàng **đảo trục ấy**: màu nói **tình trạng của mặt hàng** — xanh là
> đang bán bình thường, xám là sắp không còn. Đó cũng là quy ước mà nhãn trạng thái **sản phẩm trong
> danh mục** đã dùng từ `26/08`, nên hai bảng thôi nói hai thứ tiếng về cùng một chữ.
>
> ***Bổ sung* phải rời khỏi màu xanh** — hệ quả, khách hàng không nêu. *Đang áp dụng* lấy xanh mà
> *Bổ sung* giữ nguyên thì hai trạng thái khác hẳn nhau trông giống hệt nhau. Chọn **chàm** vì nó
> không phải một màu cảnh báo: *Bổ sung* không đáng lo, nó chỉ là điều mới.
>
> ***Đã xoá* thôi mang màu đỏ** (`08/09` đặt nó đỏ lúc trạng thái ấy vừa ra đời). Rút một mặt hàng là
> một quyết định bình thường của người lập, không phải sự cố — và màu đỏ ở đó tranh chỗ với hai cảnh
> báo THẬT của cột *Tỷ lệ CK*.

**KHỐI LÝ DO nói rõ AI trả về và TỪ BƯỚC NÀO** `sửa 08/09` — *"phần lý do CSBH bị trả về yêu cầu
cần rõ ràng hơn, như ai đã trả về và trả về từ bước nào"*.

> Khối *Lý do gần nhất* trên trang hồ sơ nói đủ **bốn vế**: hành động · người thực hiện · **bước xuất
> phát** · thời điểm — rồi mới tới câu lý do.
>
> **Vì sao cần**: hồ sơ đi qua mười bước và có **bốn** hành động kèm lý do (Trưởng bộ phận *trả lại*,
> Trưởng bộ phận *hoàn duyệt*, Kế toán *không tiếp nhận lần 1*, và *lần 2*). Cùng một câu *"thiếu
> chứng từ"* đến từ bàn Trưởng bộ phận hay bàn Kế toán là **hai việc phải làm khác nhau**, mà tới
> `08/09` người đọc không phân biệt được nếu không tự mở Nhật ký hồ sơ ra dò.
>
> **Bước XUẤT PHÁT, không phải bước hiện tại**: hồ sơ bị trả về thì nó đang ở *Yêu cầu chỉnh sửa* —
> câu người đọc cần là *"nó bị trả về TỪ đâu"*.
>
> **Không thêm trường nào vào hồ sơ.** Ba vế mới đều đã nằm sẵn trên chính dòng nhật ký đã ghi ra câu
> lý do ấy.
>
> **Gửi lại sau khi sửa vẫn giữ lý do cũ** — cùng quy ước với `Lý do gần nhất` từ trước: lý do chỉ bị
> thay khi có một lý do mới.
>
> > **ĐẢO `25/09`** — khối chỉ hiện khi lý do còn là việc phải làm: ở *Yêu cầu chỉnh sửa*, hoặc ở bàn
> > Sale Admin sau lượt Kế toán *Yêu cầu in lại*. Gửi lại sau khi sửa thì khối **biến mất**. Xem *"Khối
> > lý do chỉ hiện khi còn việc phải làm"* ở cuối Phụ lục B.
>
> **Vai trò KHÔNG in riêng**: nhãn hành động đã nói ra nó (*"Kế toán không tiếp nhận lần 1"*), nên in
> thêm là lặp. Nhờ vậy hồ sơ không tra được tên người vẫn trả lời được câu *"bàn nào trả về"*.

**THÔNG BÁO NÓI RÕ LOẠI THAY ĐỔI** `sửa 08/09` — *"thêm vào phần nội dung thông báo để biết thay đổi
trên CSBH là tạo mới CSBH đối với khách hàng mới, hay đó là chỉnh sửa bổ sung trên một CSBH của một
khách hàng đã có"*.

> Thư và dòng thông báo trên chuông đều mang thêm **Loại thay đổi**, hai giá trị:
>
> - **CSBH mới — khách hàng chưa có CSBH nào trước đó** (phiên bản 1)
> - **Phiên bản *n* — chỉnh sửa/bổ sung, thay thế CSBH đang hiệu lực** (phiên bản > 1)
>
> **Vì sao cần**: hai loại này đòi hai việc khác nhau ở người duyệt. Bản đầu không có gì để đối
> chiếu; bản thay thế thì phải soi xem nó đổi gì so với thứ khách hàng ĐANG được hưởng — và nếu duyệt
> xong thì bản cũ **vô hiệu toàn bộ** (muc 5.4).
>
> **Phân biệt bằng SỐ PHIÊN BẢN**, thứ hệ thống đã có: bằng 1 nghĩa là khách hàng chưa có CSBH nào
> khi hồ sơ này được lập. Không thêm trường nào vào hồ sơ.
>
> **Con số chứ không phải một cờ có/không**: *"Phiên bản 4"* cho người đọc biết hồ sơ đã qua ba lần
> thay thế trước đó.
>
> Dòng này đứng **ngay sau mã hồ sơ**, trong cụm định danh ở đầu thư — nó trả lời *"hồ sơ này là
> gì"*, không phải *"đang chờ ai"*. Trên chuông thì rút gọn còn *CSBH mới* / *Phiên bản n*.

**LẬP PHIÊN BẢN MỚI NGAY TỪ TRANG HỒ SƠ** `mới 08/09` — *"khi TDV xem một hồ sơ CSBH đang có hiệu
lực, thêm 1 thao tác cho phép tạo một phiên bản mới ngay từ trang xem hồ sơ mà không cần phải vào
trang khách hàng"*.

> Nút ***Lập phiên bản mới*** trên trang hồ sơ, cạnh các nút thao tác. **Hai điều kiện**: hồ sơ ở
> ***Đang có hiệu lực***, và người xem là **Trình dược viên**. Hồ sơ đang hiệu lực cũng mở ra với TBP,
> Kế toán và Sale Admin — họ nằm trong bốn cột người — mà lập hồ sơ là việc của TDV.
>
> **Không phải một nghiệp vụ mới.** Nó gọi đúng đường mà trang *Lập hồ sơ* vẫn gọi, nên mọi chốt chặn
> giữ nguyên: phạm vi TDV phụ trách khách hàng, khách đã ngừng hợp tác thì không lập được, và bản mới
> vẫn **chép sẵn toàn bộ sản phẩm** của bản đang hiệu lực.
>
> **Không phải một bước của luồng duyệt.** `DANG_CO_HIEU_LUC` không đi đâu cả cho tới khi bản mới được
> duyệt xong; đây là lượt LẬP MỘT HỒ SƠ KHÁC, nên nó không nằm trong danh sách hành động của máy trạng
> thái.
>
> **Hộp xác nhận nói ra hai điều**: bản mới chép sẵn sản phẩm, và **CSBH hiện tại vẫn có hiệu lực**
> cho tới khi bản mới duyệt xong.
>
> **CẢNH BÁO khi khách đã có một bản mới đang dở dang** (đang soạn hoặc đang trong luồng duyệt), kèm
> liên kết mở thẳng bản ấy. Hệ thống **KHÔNG chặn** — lập hai bản cùng lúc vốn đã làm được từ trước —
> nhưng đi từ trang khách hàng thì bản dở nằm ngay trong danh sách hồ sơ của khách, còn đi từ đây thì
> không thấy gì cả.
>
> > **NỬA ĐẦU CỦA CÂU TRÊN ĐÃ ĐỔI `10/09`.** Bản dở ở trạng thái ***Nháp*** thì từ nay hệ thống
> > **CHẶN** — xem *"Một bản Nháp mỗi khách hàng"* ở cuối Phụ lục B. Cảnh báo này còn nguyên việc cho
> > nửa còn lại: bản mới **đang trong luồng duyệt** vẫn không bị chặn, và đó vẫn là chỗ duy nhất nói
> > ra điều đó khi đi từ trang hồ sơ.
>
> > **NỬA CÒN LẠI CŨNG ĐỔI `25/09`** — xem *"Một hồ sơ đang xử lý mỗi khách hàng"* ở cuối Phụ lục B.
> > Bản mới đang trong luồng duyệt giờ cũng bị chặn, nên cảnh báo này **gỡ hẳn**: hộp thoại đổi
> > thành hộp chặn, nói mã và trạng thái hồ sơ đang xử lý, và cho một nút mở thẳng nó.

**YÊU CẦU CẬP NHẬT HIỆN CẢ KHI ĐANG SỬA, VÀ CÓ NÚT ÁP DỤNG** `mới 10/09` — *"khi TDV nhấn vào để
chỉnh sửa một hồ sơ đang bị Yêu cầu cập nhật do thông tin sản phẩm hoặc chiết khấu thay đổi. Vẫn yêu
cầu hiện các thông tin đã bị thay đổi ở trang thông tin hồ sơ"* · *"có thêm thao tác Tự động cập nhật
ngay trong phần hiển thị thông tin thay đổi, khi nhấn vào thao tác này bảng sản phẩm sẽ tự động được
cập nhật thông tin theo những thay đổi mới đó, sau khi cập nhật xong phần thông tin yêu cầu thay đổi
sẽ biến mất"*.

> **ĐẢO PHÉP LÀM MỚI Ở ĐƯỜNG ĐỌC** của `0029`. Tới `0193` hồ sơ ở *Nháp* hoặc *Yêu cầu chỉnh sửa*
> được chụp lại giá và ngưỡng ở MỖI lượt mở, trong im lặng — nên khối chênh lệch không thể tồn tại ở
> đó, và một nút *Tự động cập nhật* sẽ không làm gì nhìn thấy được. Yêu cầu thứ hai chỉ có nghĩa nếu
> bỏ phép ghi đè ấy.
>
> **An toàn, và đây là dữ kiện quyết định**: lượt **gửi duyệt** vẫn làm mới như cũ, kèm chốt
> `STALE_LINE`. Bản nháp không bao giờ vào luồng với số cũ, dù TDV có bấm nút hay không. Cái mất là
> *"mở ra là thấy số hôm nay"*; cái được là *"số không tự đổi sau lưng người đang soạn"*.
>
> **Nút CHỈ có ở hồ sơ còn sửa được, và chỉ với TDV đang phụ trách.** Hồ sơ đang trong luồng vẫn hiện
> khối chênh lệch (`0050`) nhưng KHÔNG có nút — luật đóng băng của `0022` thắng: một hồ sơ đang chờ
> chữ ký mà bấm được nút này thì người duyệt đọc một con số rồi ký vào một con số khác.
>
> **Ranh giới của nút**: đổi *Giá bán Công ty · ngưỡng · Tỷ lệ CK*; **không đụng** *Giá bán buôn* và
> *CPBH* — đó là con số TDV nhập. Câu chữ trên màn hình nói ra điều này trước khi người dùng bấm.
>
> **Dòng không áp được thì Ở LẠI trong khối**, kèm lý do của nó (sản phẩm đã vô hiệu hoá hoặc đã
> xoá). Không chặn cả lượt vì một dòng hỏng — khác lượt gửi duyệt, nơi một dòng không kiểm được là lý
> do chặn vì con số ấy sắp đi vào văn bản đem ký.
>
> > **BA CHỖ CỦA CÂU TRÊN CHƯA CHẠY ĐÚNG CHO TỚI `11/09`** — xem *"Sản phẩm biến mất khỏi danh mục"*
> > ở cuối Phụ lục B. Mặt hàng **đã bị xoá** khỏi danh mục thì khối chênh lệch **tắt hẳn** thay vì ở
> > lại (kể cả chênh lệch của những dòng khác), nút trả lỗi, và lượt gửi duyệt cũng thế — nên
> > `STALE_LINE` không bao giờ chạy tới. Lý do của mỗi dòng cũng chưa nói ra ở giao diện.

**LỖI ĐÃ SỬA: dấu vết lệch không ai dọn** `sửa 10/09` — hồ sơ đi hết chuỗi *lệch → trả về → làm mới →
gửi lại* quay lại luồng duyệt kèm một khối cảnh báo nói về chênh lệch **đã được sửa xong**.

> `pol.policy_impact` chỉ được dọn bởi consumer, và chỉ cho những sản phẩm nó vừa quét lại ở lượt ấy
> (`0036`). Không có gì dọn nó khi chính DÒNG được làm mới. Khối sai nằm đó tới lần đổi danh mục kế
> tiếp chạm đúng sản phẩm ấy — không mã lỗi nào, không màn hình nào báo.
>
> Lỗi có từ `0029`. Sửa ở chỗ làm mới: áp dụng xong thì xoá dấu vết của **những dòng đã ghi lại
> được** — dòng hỏng giữ dấu vết, vì nó vẫn đúng.

**HỘP THOẠI THÊM DÒNG BÀY LUÔN BỐN CON SỐ** `mới 09/09` — *"trong hộp thoại để thêm sản phẩm vào CSBH
hiển thị thêm các thông tin về CPBH, tỷ lệ CK và QĐCK luôn trong hộp thoại để người dùng có thể thấy
ngay mà chưa cần phải ra phần bảng để nhìn"*.

> Khối nhỏ dưới các ô CPBH, hiện khi đã chọn sản phẩm **và** đã gõ giá bán buôn: **CPBH** (tổng) ·
> **Giá thu về** · **Tỷ lệ CK** · **QĐCK** (ngưỡng phần trăm, mã quy định trong `title`).
>
> **GIÁ THU VỀ là thứ thêm ngoài ba mục khách hàng nêu, đã nêu ra**: nó là mắt xích giữa CPBH và tỷ
> lệ chiết khấu (`1 − giá thu về / giá bán Công ty`), và hộp thoại vốn đã NHẮC TÊN nó từ `0124` mà
> chưa bao giờ bày ra. Bỏ nó thì khối hiện một phần trăm không có đường nào lần ngược.
>
> Nhãn và màu lấy **nguyên của bảng** (`bang-cot.ts`, lớp `.ty-le.vuot`): cả điểm của yêu cầu là
> thôi phải ra bảng đối chiếu, mà hai cách gọi hoặc hai màu cho cùng một con số thì vẫn phải dịch.
>
> **Giao diện TÍNH ở đây, và đó là ngoại lệ có điều kiện.** `FE-27` cấm giao diện tính lại vì sợ một
> bản cài đặt thứ hai của phép làm tròn — con số hiện ra sẽ lệch con số đem so ngưỡng. Hộp thoại gọi
> **chính `computeLine`** mà máy chủ gọi, nhập từ gói `domain-policy`; không có bản thứ hai nào. Điều
> kiện đi kèm: gói ấy không được có phụ thuộc nào, và phép đổi `Rate2 → numeric` phải ở đúng một chỗ
> (`rate2ToNumeric`) — cả hai đều có ca kiểm gác.

**LỖI ĐÃ SỬA: giá bán Công ty trong hộp thoại thôi lấy giá HÔM NAY** `sửa 09/09` — nó lấy theo **ngày
áp dụng** của dòng đang gõ.

> `0124` bày giá bán Công ty ngay trên ô *Giá bán buôn*, đọc từ danh mục. Khi ấy ngày áp dụng là
> thuộc tính của HỒ SƠ nên "giá hôm nay" là đúng. `0180` đưa ngày xuống TỪNG DÒNG và ảnh chụp giá lấy
> theo ngày ấy — từ đó hộp thoại bày một con số rồi máy chủ ghi một con số khác, ở đúng những dòng
> hẹn ngày tương lai.
>
> Chú thích của chính đường `threshold-preview` đã viết ra điều phải tránh (*"xem trước bằng ngày khác
> ngày sắp ghi là bày ra một con số rồi ghi một con số khác"*) và máy chủ vẫn trả `companyPrice` theo
> ngày từ `0180`; giao diện chỉ **vứt nó đi**. Không có mã lỗi nào, không màn hình nào báo — hai con
> số chỉ đơn giản khác nhau.

**TIÊU ĐỀ THÔNG BÁO NÓI RÕ VIỆC CỦA AI** `mới 09/09` — *"thử đề xuất nội dung tiêu đề của thông báo
để người dùng không bị rối khi nhận quá nhiều thông báo"*.

> **Chẩn đoán**: mười bảy tiêu đề cũ đều kể *ai vừa làm gì*, trong khi người đọc cần biết *tôi có
> phải làm gì không*. Cùng một tiêu đề đi tới hai đến bốn vai trò có việc khác hẳn nhau — *"Kế toán
> đã tiếp nhận lần 1"* với Sale Admin là **một mệnh lệnh**, với TBP và TDV là **một mẩu tin**. Mỗi
> dòng bắt người đọc tự dịch sang vai trò mình; với một hồ sơ thì không sao, với hai mươi thì đó
> chính là cái rối.
>
> **HAI BẬC, suy ra chứ không khai thêm bảng.** Người đọc là *chủ bước* của trạng thái đích thì thông
> báo ấy là **việc**; còn lại là **tin**. Bảng chủ bước đã có sẵn (nó vốn quyết định thư nhắc SLA gửi
> cho ai), chỉ thiếu một dòng *Yêu cầu chỉnh sửa → TDV*.
>
> **NHÃN CHỮ Ở CỘT *Tiêu đề* ĐÃ BỎ `10/09`** — xem *"Bậc đọc bằng MÀU, không bằng nhãn chữ"* ngay
> dưới mục này. Bảng giữ nguyên câu chữ của 09/09 vì nó là tiền đề của quyết định ấy: hai nhãn bị bỏ
> **chính vì** hai câu bên cạnh chúng đã tự nói ra bậc rồi.
>
> | Bậc | Tiêu đề | Liên kết | Dòng trên chuông |
> |---|---|---|---|
> | **Việc** | *Cần bạn xử lý (Phiên bản 4): Duyệt bản mềm — Trưởng bộ phận đã ký* | Hồ sơ | Dải hổ phách |
> | **Tin** | *Để bạn biết: Trưởng bộ phận đã ký, hồ sơ sang Kế toán duyệt bản mềm* | Lịch sử hồ sơ | Không dải |
>
> **Bốn trạng thái không có chủ bước** (*Đang có hiệu lực*, *Hết hiệu lực*, *Đã xoá*, *Quá hạn
> duyệt*), nên sáu hành động dẫn tới chúng **không có ai ở bậc việc** — mọi người nhận đều đọc *Để bạn
> biết*. Không phải một luật riêng: phép tra chủ bước trả về rỗng, và rỗng thì không bằng vai trò nào.
>
> **Hai ngoại lệ có nhãn riêng**, và cả hai đều đáng:
>
> - ***Sắp quá hạn — cần bạn xử lý***: đây là lá thư CUỐI CÙNG còn cứu được hồ sơ. Lá sau nó (*đã quá
>   hạn duyệt*) chỉ báo tin, vì quá hạn là trạng thái kết thúc — giữa hai lá là một lằn ranh cứng,
>   không phải một thang độ gấp.
> - ***Dừng xử lý***: khi Trưởng bộ phận hoàn duyệt, Kế toán hoặc Sale Admin đang CẦM hồ sơ và vừa bị
>   rút mất. *"Để bạn biết"* ở đó dẫn tới việc họ đọc lướt rồi làm tiếp một hồ sơ không còn trên bàn.
>
> **Loại thay đổi lên tiêu đề, chỉ ở bậc việc** — trong hàng đợi của một vai trò, phần *việc phải làm*
> giống nhau ở mọi hồ sơ nên nó không phân biệt được gì, còn *CSBH mới* / *Phiên bản 4* thì có. Chủ đề
> thư bị điện thoại cắt ở chừng 35 ký tự, và cách xếp này giữ được nó. Dòng *Loại thay đổi* trong
> **thân thư** vẫn có ở mọi bậc (`0190` không đổi).
>
> **Chuông: CON SỐ cho việc, DẤU CHẤM cho tin.** Quyết định 23/08 — *con số thật, không phải một dấu
> chấm* — **không bị đảo**: khách hàng mô tả con số là *"còn 12 việc chưa xem"*, mà tới 08/09 nó trộn
> cả tin lẫn việc nên chưa bao giờ nói đúng câu ấy. Lọc về bậc việc là trả nó về đúng nghĩa. Dấu chấm
> là chuyện khác: 23/08 chốt *chấm THAY CHO số*, còn đây là *chấm khi KHÔNG CÓ số*, cho đúng loại
> thông báo mà không có gì để đếm. Chấm chỉ hiện khi huy hiệu vắng mặt.
>
> **Cái giá, đã đo**: một vòng duyệt sinh **tám lá thư thay vì năm** — một lá mang được một tiêu đề.
> Số thư **mỗi người** nhận không đổi (vẫn 13 lượt, vẫn đúng những người ấy).
>
> **Đã nêu và KHÔNG làm**: cái chuông vẫn là **sổ sự kiện**, không phải danh sách việc tồn đọng — đọc
> một thông báo không có nghĩa là đã làm. Danh sách việc còn phải làm nằm ở *Tổng quan* (`NTF-07`), và
> dựng bản thứ hai của nó trong chuông là dựng hai danh sách sẽ lệch nhau.

**BẬC ĐỌC BẰNG MÀU, KHÔNG BẰNG NHÃN CHỮ** `mới 10/09` — *"bỏ phần text 'Bạn cần xử lý' và 'Để bạn
biết' đi, chỉ cần phân biệt bằng màu"*. Đảo một nửa quyết định 09/09: **hai bậc giữ nguyên**, chỉ
thôi được viết ra thành chữ ở đầu tiêu đề.

> **Vì sao bỏ được mà không mất gì** — và lý do này mạnh hơn *"cho gọn"*: hai bậc **đã nói ra bằng
> ngữ pháp**, ở ngay câu chữ mà chính 09/09 dựng. Bậc việc là một **mệnh lệnh** gọi tên việc của
> người đọc (*"Duyệt bản mềm — Trưởng bộ phận đã ký"*), bậc tin là một **câu kể** chuyện đã xảy ra
> (*"Trưởng bộ phận đã ký, hồ sơ sang Kế toán duyệt bản mềm"*). Nhãn chỉ dán tên cho một khác biệt
> đã có sẵn; nó lặp lại, và nó ăn mất chừng 14 ký tự đầu — đúng phần chủ đề thư mà điện thoại còn
> hiện được. Lập luận xếp *loại thay đổi* ra trước vì thế **mạnh lên**: phần biến thiên giữa các hồ
> sơ giờ đứng ngay ký tự đầu tiên — *"Phiên bản 4: Duyệt bản mềm — Trưởng bộ phận đã ký"*.
>
> **Trong HỘP THƯ không có màu nào**, và đó là vế phải nói ra. Thứ còn phân biệt hai bậc ở đó là ngữ
> pháp của tiêu đề, cộng **đoạn giải thích trong thân thư bậc tin** (*"Thư này chỉ để bạn biết — bạn
> KHÔNG phải xử lý gì ở bước này"*) và **liên kết** (hồ sơ / lịch sử hồ sơ). Hai thứ ấy **giữ lại có
> chủ ý**: chúng thôi là phần thừa từ hôm nay.
>
> **Hai câu riêng KHÔNG phải nhãn bậc nên ở lại**: *Sắp quá hạn* (lá thư cuối còn cứu được hồ sơ) và
> *Dừng xử lý* (hồ sơ vừa bị rút khỏi bàn người đang cầm). Câu SLA chỉ cắt đuôi *"— cần bạn xử lý"*,
> đúng cụm chữ khách hàng vừa bỏ.
>
> **Bất biến thay chỗ cho nhãn**, và nó là cách duy nhất quyết định này hỏng: **hai bậc phải cho hai
> tiêu đề khác nhau** ở mọi hành động có chủ bước. Nhãn đảm bảo điều đó một cách rẻ tiền; bỏ nhãn là
> bỏ chỗ dựa ấy, nên có ca kiểm duyệt hết bảng hành động.

**MÀU DÒNG VIỆC DỊU XUỐNG, CHẤM TRÊN CHUÔNG THÀNH ĐỎ** `mới 10/09` — *"đổi màu hổ phách bằng màu
cùng tông để tránh quá chói"* và *"dấu chấm xanh đổi thành chấm đỏ"*.

> **ĐI TIẾP MỘT BƯỚC NGAY SAU ĐÓ `10/09`** — xem *"Dòng việc chỉ còn một kẻ dọc xanh"* ngay dưới.
> Phần hổ phách của mục này **không còn đúng**; giữ lại vì nó ghi ra phép đo dẫn tới bước sau.
>
> **Dịu, nhưng không nhạt**: cùng lượt này nhãn chữ đi mất, nên dải màu thành **thứ duy nhất** nói ra
> bậc trên màn hình — hạ chói mà mờ luôn cả dải là xoá hẳn một trục thông tin. Chỗ chói thật là mảng
> **nền** trải hết bề ngang dòng (mười dòng như thế cạnh nhau trong hộp chuông), nên nền nhạt hẳn đi
> còn **dải giữ nguyên độ đậm**. Cặp màu riêng, không sửa màu cảnh báo chung — cặp ấy còn tô nhãn
> *Sắp quá hạn* và nhãn dòng *Chỉnh sửa*, là chữ trên nền và cần tương phản đọc được.
>
> **Chấm đỏ đảo lập luận 09/09** (*"xanh, vì nó là bản thu nhỏ của chấm chưa đọc trên từng dòng"*).
> Vế thắng: hai hình **loại trừ nhau** — người dùng thấy đúng một trong hai — nên chúng không bao giờ
> đứng cạnh nhau để so mức khẩn; còn một chấm xanh ở góc một nút xanh thương hiệu thì gần như chìm.
> **Chấm trên từng DÒNG vẫn xanh**: nó trả lời câu khác (*chưa đọc*, không phải *có việc*), và đổi
> luôn cả hai là nói *"mọi thứ đều gấp"*.

**DÒNG VIỆC CHỈ CÒN MỘT KẺ DỌC XANH** `mới 10/09` — *"với những thông báo cần xử lý không cần đổi
màu hổ phách, chỉ cần hiện dòng kẻ dọc bên trái, màu dòng kẻ cùng tông xanh"*. Bước thứ hai của cùng
một hướng mà quyết định trên đi nửa đường: nó **hạ chói** mảng nền, quyết định này **bỏ hẳn** nền.

> **Bỏ hẳn RẺ HƠN hạ chói.** Không còn nền thì nền hover thôi phải tranh chỗ với nền bậc, nên luật
> hover riêng của dòng việc biến mất theo — nó vốn có mặt chỉ để đè lại chính cái nền vừa bị bỏ. Và
> hộp thông báo thôi có màu cảnh báo nào: **không việc nào ở đây là sự cố**, đúng lập luận `0188` đã
> viết cho nhãn *Đã xoá*.
>
> **Xanh — đảo lập luận 09/09**, giữ lại nguyên văn vì nó không sai: *"hổ phách, không phải xanh
> thương hiệu: xanh đã là màu của chưa đọc ở chấm bên trái mỗi dòng, và một màu mang hai nghĩa trên
> cùng một dòng thì thôi nói được nghĩa nào."* Vế thắng: hai thứ ấy **khác hình và khác chỗ** — một
> đường dọc cao hết dòng ở mép trái, một chấm tròn 8px trong lòng dòng — nên chúng không đọc lẫn nhau
> như hai **mảng** cùng màu sẽ đọc lẫn.
>
> **Sáng hơn màu thương hiệu, và đó là một phép đo chứ không phải sở thích**: đây là một đường 3px
> chứ không phải một mảng, và ở cỡ ấy sắc navy `#034ea2` đọc ra gần như đen — tức mất luôn cái *xanh*
> vừa được yêu cầu. Ca kiểm canh hai vế (cùng sắc màu, sáng hơn) trên cả ba bảng màu, không ghim mã
> hex.

**MỘT BẢN NHÁP MỖI KHÁCH HÀNG** `mới 10/09` — *"để tránh spam tạo quá nhiều bản Nháp đối với 1 khách
hàng, chỉ cho phép có 1 bản Nháp đối với cùng 1 khách hàng, nếu chọn lập CSBH đã có bản Nháp rồi, nó
sẽ hiện thông báo đã có một bản nháp và nhấn đồng ý sẽ vào bản Nháp đó"*.

> **ĐÃ NỚI RỘNG `25/09`** — xem *"Một hồ sơ đang xử lý mỗi khách hàng"* ở cuối Phụ lục B. Đoạn
> *"chặn đúng Nháp"* ngay dưới đây giữ nguyên văn: lý do của nó đúng cho tới ngày khách hàng yêu cầu
> chính luật mà nó nói *"không ai yêu cầu"*.
>
> **CHẶN ĐÚNG *Nháp*, không rộng hơn.** *Yêu cầu chỉnh sửa* nằm cùng nhóm "sửa được" với *Nháp* nên
> rất dễ gộp, và gộp là dựng ra một luật khác hẳn: cấm TDV lập hồ sơ cho một khách đang có hồ sơ **bị
> trả về**. Không ai yêu cầu điều đó. Hồ sơ rời khỏi *Nháp* bằng bất kỳ đường nào — gửi duyệt, hay
> xoá — là chỗ trống ra ngay.
>
> **Áp cho cả hai đường lập**: bản đầu tiên và *Lập phiên bản mới*. Một bản nháp đang dở là một bản
> nháp đang dở, không phụ thuộc nó sẽ thành phiên bản thứ mấy.
>
> **Câu trả lời kèm một VIỆC ĐỂ LÀM**: thông báo nói ra bản Nháp đang có, và một nút mở thẳng vào đó.
> Nó được hỏi **trước** câu *"khách đã có CSBH, lập phiên bản mới không?"* — hai câu cùng nói *đừng
> lập cái mới*, nhưng chỉ câu này đưa ra được việc làm ngay.
>
> **Chốt chặn nằm ở CSDL, không chỉ ở phần mềm.** Kịch bản sinh ra chính yêu cầu này là người dùng
> bấm nút nhiều lần, mà bấm đúp là hai lượt chạy song song cùng đọc thấy *"chưa có Nháp nào"*. Một
> ràng buộc duy nhất là thứ duy nhất đóng được khe ấy.
>
> **Nâng cấp một hệ đang chạy có thể DỪNG** ở migration nếu còn khách đang có nhiều hơn một bản Nháp;
> thông báo in ra mã và tên khách kèm mã từng hồ sơ. Hệ thống **không chọn hộ được** bản nào đáng giữ
> — chỉ chính TDV ấy biết — nên đường sửa là xoá bớt trên màn hình rồi chạy lại.

**MÃ HỒ SƠ DO TDV ĐẶT** `mới 10/09` — *"khi tạo CSBH cần có một bước để TDV điền mã của CSBH, hệ
thống sẽ tự đề xuất nhưng TDV có thể sửa"* · *"cho phép TDV sửa Mã hồ sơ CSBH trong trạng thái Nháp,
để một biểu tượng edit ngay tại tiêu đề Mã hồ sơ, sửa xong có dấu tick để lưu"* · *"không cho lưu
hoặc tạo nếu mã đã tồn tại"*.

> **Đề xuất là một lượt LẤY SỐ, không phải một lượt đọc.** Mở màn hình *Lập hồ sơ* là lấy hẳn số tiếp
> theo của dãy, nên hai Trình dược viên mở cùng lúc được hai mã khác nhau. Cái giá: những khoảng
> trống trong dãy khi ai đó mở rồi bỏ đi — dãy này **vốn đã có trống** (một lượt lập hỏng giữa chừng
> cũng để lại một lỗ), và mã hồ sơ chưa bao giờ hứa là một dãy liên tục.
>
> **Mã TỰ DO**, không ép khuôn `CSBH-YYYY-NNNNNN` (khách hàng chốt 10/09). Ép khuôn thì *"TDV có thể
> sửa"* thu lại còn đổi mỗi số thứ tự. Chỉ chặn: để trống · dài quá 50 ký tự · và những ký tự phá tên
> tệp (`" \ / : * ? < > |`) hay phá header tải về (xuống dòng, tab, ký tự điều khiển) — mã hồ sơ đi
> thẳng vào TÊN TỆP của bản mềm đã lưu và của mọi lượt tải về.
>
> **Sửa được CHỈ khi hồ sơ còn ở *Nháp***. Hồ sơ đã gửi duyệt một lần thì mã của nó đã đi vào thư đã
> gửi, vào dòng thông báo trên chuông, vào nhật ký người duyệt đọc, và có thể vào tên một bản mềm đã
> lưu — đổi lúc ấy là làm mọi tham chiếu kia trỏ vào hư không, lặng lẽ. Hồ sơ ở *Yêu cầu chỉnh sửa*
> **sửa được nội dung nhưng KHÔNG sửa được mã**, vì nó cũng đã gửi duyệt một lần.
>
> **Mã DUY NHẤT toàn hệ thống, giữ chỗ vĩnh viễn** (khách hàng chốt 10/09) — ngược với luật mã số
> thuế (`29/08`), và vì lý do khác: mã số thuế định danh một **pháp nhân đang tồn tại**, còn mã hồ sơ
> định danh một **văn bản**. Hồ sơ *Đã xoá* hay *Hết hiệu lực* vẫn nằm trong nhật ký, trong báo cáo,
> và trên những tờ giấy đã in ra ngoài phần mềm; cho dùng lại mã là để câu *"CSBH-2026-000123 là hồ
> sơ nào"* thôi có câu trả lời.
>
> > **MỘT NGOẠI LỆ, và nó có lợi**: bản ***Nháp*** xoá đi thì **xoá hẳn**, không để lại một vết nào
> > (quyết định `18/08`) — nên mã của nó **dùng lại được**. Cái giá nêu lúc chốt (*lập nhầm một bản
> > Nháp rồi xoá thì mất luôn mã ấy*) **không tồn tại**.

**SẢN PHẨM BIẾN MẤT KHỎI DANH MỤC** `sửa 11/09` — ba chốt của *Tự động cập nhật* (`10/09`) chạy đúng
cả khi một mặt hàng của hồ sơ **không còn trong danh mục**, và phần mềm **nói ra tên** những dòng nó
không áp được.

> **Đo được trên chồng thật, và triệu chứng ngược hẳn với điều đã chốt**: hồ sơ còn sửa được có một
> mặt hàng đã bị xoá thì khối chênh lệch **tắt HẲN** — kể cả chênh lệch của những dòng chẳng liên
> quan — còn nút và lượt **Gửi duyệt** đều trả *"không tìm thấy sản phẩm này trong danh mục, tải lại
> rồi chọn lại"*, một câu không nêu dòng nào và không chữa được gì. Cùng lúc ấy một hồ sơ **đã đóng
> băng** của cùng khách, cùng hai dòng, cùng trạng thái danh mục, lại bày ra đủ hai chênh lệch.
>
> **Hồ sơ không chết, nhưng bị bịt mắt.** Rút dòng hỏng rồi gửi lại thì đi tiếp bình thường — chỉ là
> người dùng phải tự đoán ra rằng có một dòng hỏng, đoán ra là dòng nào, và đoán ra rằng rút nó là
> cách chữa.
>
> **Lối gỡ vốn đã có sẵn và chưa bao giờ chạy tới**: chốt `STALE_LINE` lúc gửi duyệt nêu đích danh mã
> mặt hàng và chỉ ra ba lối (kiểm lại danh mục · rút dòng · đổi *Ngày áp dụng* của dòng). Từ `11/09`
> nó nhận cả ba nguyên nhân: mặt hàng đã vô hiệu hoá · đã bị xoá khỏi danh mục · chưa khai giá tại
> ngày áp dụng của dòng.
>
> **Bấm nút xong thì phần mềm nói ra những mặt hàng chưa cập nhật được**, ngay dưới bảng chênh lệch.
> Câu chốt `10/09` — *"sau khi cập nhật xong phần thông tin yêu cầu thay đổi sẽ biến mất"* — không
> đúng được cho những dòng ấy, nên chỗ nó không biến mất phải có một lý do đọc được; nếu không người
> dùng chỉ biết là nút không làm gì.
>
> **Ranh giới giữ nguyên: danh mục TẠM THỜI không tra được thì KHÔNG đoán bừa.** Mặt hàng *vắng mặt*
> và lượt tra *hụt* là hai chuyện; gộp chúng là để `STALE_LINE` khuyên người dùng rút hết mặt hàng
> khỏi hồ sơ trong khi danh mục chỉ đang khởi động lại.
>
> **Bấm *Tự động cập nhật* giờ để lại một dòng trong nhật ký hệ thống.** Trước đó nó đổi giá bán Công
> ty, ngưỡng và tỷ lệ CK của nhiều dòng mà không ghi dấu vết nào — quy ước của một lượt ĐỌC, giữ lại
> sau khi `10/09` biến nó thành một lượt GHI do người dùng bấm. Bấm lúc không có gì để đổi thì vẫn
> không ghi gì.

**MỞ *SỬA* MỘT SẢN PHẨM THÌ GIÁ BÁN CÔNG TY LÀ GIÁ HIỆN TẠI** `mới 12/09` — *"khi hồ sơ ở trạng thái
Nháp hoặc Yêu cầu chỉnh sửa, khi nhấn vào sửa 1 sản phẩm, giá bán công ty phải tự động cập nhật giá
hiện tại chứ không phải giá đang hiện trong CSBH"*.

> Cùng gốc với lỗi `11/09`, ở nửa còn lại. `11/09` quy đổi ngày tra cho khối *Yêu cầu cập nhật* và nút
> *Tự động cập nhật*; đường **ghi** — thêm dòng, sửa dòng, và hộp thoại xem trước đi kèm — vẫn tra
> theo đúng ngày áp dụng của dòng. Dòng thừa kế mang ngày của bản CSBH trước, nên hộp thoại **bày lại
> chính con số đang nằm trên dòng**.
>
> **Nặng hơn hộp thoại, và đây mới là chỗ mất tiền**: bấm *Tự động cập nhật* cho dòng lên 130.000, rồi
> **sửa một ghi chú** — dòng tụt về 100.000. Lượt cập nhật biến mất, khối cảnh báo mọc lại, và không
> có gì trên màn hình nói rằng vừa có chuyện gì xảy ra. Người lập sửa một ô không liên quan gì tới
> giá.
>
> **Ngày áp dụng của dòng KHÔNG bị kéo theo** — ngày GHI là ngày TDV khai, chỉ ngày TRA được quy đổi.
> Gộp hai thứ ấy là dời ngày áp dụng của mọi dòng thừa kế, và vì ngày áp dụng nằm trong phép so trạng
> thái nên cả bảng nhảy sang *Chỉnh sửa* vì một lý do không ai nêu.
>
> **Dòng đề ngày TƯƠNG LAI vẫn lấy bảng giá của ngày ấy** — đúng điều `16/08` sinh ra để bảo đảm.
>
> **Chỗ duy nhất còn tra theo đúng ngày áp dụng** là lượt lập hồ sơ **kèm sẵn danh sách sản phẩm**.
> Người dùng không có đường nào đi qua đó: cả *Lập hồ sơ* lẫn *Lập phiên bản mới* đều tạo hồ sơ rỗng
> rồi thêm từng dòng. Đã ghim bằng ca kiểm để lượt đổi sau — nếu có — là một quyết định.

**GIÁ BÁN CÔNG TY ĐỔI CŨNG LÀ *Chỉnh sửa*** `mới 12/09` — *"thêm các trường Giá bán công ty thay đổi
so với bản trước cũng tính là Đã chỉnh sửa"*.

> Đảo lại chốt `07/09`, vốn loại Giá bán Công ty ra khỏi phép so. **Lý do cũ không sai, nó chỉ hết
> đúng**: khi ấy phần mềm chụp lại giá ở MỖI LƯỢT MỞ hồ sơ còn sửa được, nên đưa giá vào phép so là
> để một lượt Quản trị đổi giá làm mọi dòng của mọi bản nháp nhảy sang *Chỉnh sửa* cùng lúc. Chốt
> `10/09` bỏ hẳn phép chụp lại ở đường đọc — từ đó giá trên dòng chỉ đổi khi TDV **bấm *Tự động cập
> nhật*** hoặc khi **gửi duyệt** — nên hậu quả ấy đã hết đường xảy ra từ hai ngày trước, và không ai
> quay lại gỡ câu đã chết.
>
> **Cái được, và là lý do thực dụng**: cột *Tỷ lệ CK cũ* chỉ hiện cho dòng *Chỉnh sửa*. Giá bán Công
> ty đổi thì tỷ lệ chiết khấu đổi theo — đúng lúc người duyệt cần đặt hai con số cạnh nhau — mà trước
> `12/09` cột ấy **tắt đúng ở những dòng cần nó nhất**.
>
> **Hệ quả đã nêu**: nhãn *Chỉnh sửa* mọc ra được mà không ai gõ gì. Đó đúng là câu đang hỏi — *"dòng
> này có khác bản trước không"*, không phải *"TDV có gõ gì không"*.
>
> **Tỷ lệ chiết khấu không cần thêm vào phép so**: nó suy ra từ Giá bán Công ty, giá bán buôn và CPBH,
> mà cả ba đã có trong đó. **Ngưỡng chiết khấu thì VẪN đứng ngoài** — nó không suy ra được từ ba thứ
> ấy, nên một dòng chỉ đổi ngưỡng vẫn mang nhãn *Đang áp dụng*. Chốt đúng một trường; nêu ra để hỏi
> lại.

**BẢNG CHI TIẾT BÀY CẢ DÒNG Ở BẢN TRƯỚC, Ô ĐỔI BÔI VÀNG** `sửa 20/09` — *"khi kích vào sản phẩm có
trạng thái chỉnh sửa, hãy hiện thông tin của sản phẩm đó ở phiên bản trước khi bị chỉnh sửa, thông
tin nào bị đổi hãy đánh dấu bằng cách bôi vàng"*.

> Đảo NỘI DUNG của bảng `12/09`: từ *"đổi những gì"* (chỉ liệt kê trường đã khác) sang *"trước đó
> dòng này trông thế nào"* (cả dòng, ô đã đổi bôi vàng). Cơ chế mở ra giữ nguyên.
>
> **HÌNH DẠNG chốt ở lượt thứ hai** — *"hiển thị theo hàng ngang, đúng theo từng cột như dòng ở
> trên"*. Bản đầu bày thành bảng dọc *tên — giá trị*; khách hàng xem xong yêu cầu khớp cột, và họ
> đúng ở điểm bảng dọc không làm được: **so hai con số cùng cột thì mắt chỉ cần đi thẳng xuống**.
> Trên điện thoại thì vẫn là danh sách dọc, vì ở khổ ấy bảng đã thành thẻ và không còn cột nào.
>
> **BÀY CẢ NHỮNG Ô KHÔNG ĐỔI, và đó là điểm của yêu cầu**: một mình dòng *"Giá bán buôn 520.000"*
> không nói được tỷ lệ chiết khấu khi ấy là bao nhiêu. Giá trị MỚI thì nằm ngay trên, ở chính hàng
> của dòng đó.
>
> **Tám ô gồm ba con số DẪN XUẤT** — Giá thu về · Tỷ lệ CK · QĐCK. Chúng có sẵn trong cơ sở dữ liệu
> ở bản trước, nên không ai phải tính lại; và chúng cũng bôi vàng khi đổi, vì đổi giá bán buôn là đổi
> cả ba. Ngược lại, đổi CPBH mà giữ nguyên tổng thì chỉ ô *CPBH* vàng.
>
> **Nhãn *Chỉnh sửa* vẫn chỉ xét những trường TDV gõ** (`07/09`, `12/09`) — hai tập khác nhau cho hai
> câu hỏi khác nhau, và tập quyết định nhãn là tập con của tập bày ra.
>
> > **CƠ CHẾ NÀY ĐÃ THAY ở `21/09`** — xem mục ngay dưới. Hàng mở ra không còn; dữ liệu máy chủ trả
> > về thì giữ nguyên, chỉ đổi chỗ bày. Mọi lập luận trên vẫn đọc được vì chúng nói về NỘI DUNG chứ
> > không về cái hàng.

**DẤU TAM GIÁC CẠNH GIÁ TRỊ ĐÃ ĐỔI, VÀ GHI CHÚ RA KHỎI PHÉP SO** `sửa 21/09` — *"giá trị của cột nào
bị thay đổi thì đặt bên cạnh giá trị đó dấu tam giác màu xanh hướng lên nếu giá trị đó mới lớn hơn
giá trị cũ, màu đỏ hướng xuống nếu giá trị mới bé hơn. Khi người dùng di chuột vào vị trí dấu tam
giác, sẽ hiện ra giá trị trong phiên bản trước"*.

> Bước thứ ba của cùng một hướng, và là bước ĐỔI CHIỀU: `12/09` mở ra một danh sách trường đã đổi,
> `20/09` đổi nó thành cả dòng cũ rồi thành một hàng khớp cột — đều là *"mở thêm một hàng"*. Lượt này
> đưa giá trị cũ về **thẳng ô của nó**, và hàng mở ra biến mất cùng với thao tác bấm nhãn *Chỉnh sửa*.
>
> **Cái được**: bảng thôi cao gấp đôi ở mỗi dòng *Chỉnh sửa*, và dấu nói được thứ hàng cũ không nói —
> **đổi theo chiều nào**. **Cái mất, đã nêu**: đọc cả dòng cũ một lượt thì phải rê qua từng dấu.
>
> **Ô KHÔNG SO ĐƯỢC LỚN BÉ thì dấu KHÔNG phải tam giác** — một hình tròn hổ phách, rê vào vẫn hiện giá
> trị cũ. Gặp ở một khoản CPBH vừa có từ chỗ trống, hoặc một ngưỡng vừa xuất hiện. Bịa cho nó một
> chiều là nói sai ở đúng chỗ người duyệt đang đọc để quyết định.
>
> **Dấu là một NÚT, không phải một chữ mang `title`** — `title` chỉ hiện khi có chuột, mà người duyệt
> hay mở hồ sơ trên điện thoại trước khi ký. Rê chuột · Tab tới · chạm vào: cả ba đều hiện ra giá trị
> cũ. Cùng lối với dấu `?` của cột Tỷ lệ CK (`16/08`).

**GHI CHÚ KHÔNG PHẢI TRƯỜNG XÉT *Chỉnh sửa*** `sửa 21/09` — *"ghi chú không phải là trường để đánh
giá sản phẩm có bị chỉnh sửa không, nếu chỉ có ghi chú thay đổi, sản phẩm sẽ vẫn giữ nguyên trạng
thái"*.

> Đảo một phần chốt `07/09` (*"bị sửa là đổi BẤT KỲ dữ liệu nào người lập nhập"*). Phép so còn **bốn
> trường**: Giá bán Công ty · giá bán buôn · các khoản CPBH · ngày áp dụng.
>
> **Ranh giới đọc ra được từ chính bốn trường ấy**: cả bốn đều đi vào **tờ giấy khách hàng ký**, còn
> ghi chú là lời nhắn của người lập cho người duyệt. Sửa một câu chữ không làm chính sách bán hàng
> khác đi, nên nó không đáng để người duyệt đi tìm một khác biệt.
>
> **Hệ quả, đã nêu**: sửa ghi chú một mình thì dòng giữ nguyên *Đang áp dụng*, không có cột *Tỷ lệ CK
> cũ*, và **trên hàng không còn dấu vết nào** của lượt sửa ấy — ghi chú cũ thôi đọc được từ màn hình
> hồ sơ. Nhật ký hồ sơ thì vẫn giữ.

**NHÃN *Nháp* ĐỔI SANG Ô LIU — VÀNG LỤC** `sửa 21/09` — khách hàng chọn trong ba phương án đưa ra
(tím · hồng mận · ô liu), sau khi xem bảng mười màu trạng thái ở cả hai giao diện.

> **Vì sao đổi**: màu cũ là nâu xám — về sắc thì là nâu, nhưng nhạt tới mức mắt đọc ra **xám**, nên
> *Nháp* đứng thành một nhóm với *Hết hiệu lực* và *Đã xoá* (xám đá). Hai điều ngược nhau: *Nháp* là
> hồ sơ **đang dở tay**, hai nhãn kia là hồ sơ **đã rời khỏi luồng**.
>
> **Vì sao ô liu**: vùng vàng–lục chưa trạng thái nào dùng, và nó không mang nghĩa lỗi hay đã xong.
> **Cái giá đã nêu**: nó gần hổ phách của *Yêu cầu chỉnh sửa* nhất — hai trạng thái cùng là việc của
> Trình dược viên giờ cùng tông ấm.
>
> **Đã cân và không chọn**: tím (nối dài chuỗi màu của bốn bước chờ về phía trước — gần *Chờ TBP
> duyệt* nhất) và hồng mận (nổi nhất, nhưng có người đọc ra gần đỏ).
>
> Mọi cặp chữ/nền trạng thái đạt chuẩn tương phản **WCAG AA** ở cả giao diện sáng lẫn tối.

**MỘT HỒ SƠ ĐANG XỬ LÝ MỖI KHÁCH HÀNG** `mới 25/09` — *"mỗi khách hàng chỉ được có một CSBH tại
một thời điểm, không tính đến các CSBH đang có hiệu lực, đã xoá, hết hiệu lực"*. Mở rộng luật *"một
bản Nháp mỗi khách hàng"* (`10/09`) ra mọi hồ sơ chưa duyệt xong.

> **Sáu trạng thái được tính**: *Nháp* · *Yêu cầu chỉnh sửa* · *Chờ TBP duyệt* · *Chờ KT duyệt L1* ·
> *SA đang xử lý* · *KT duyệt bản cứng*. **Bốn không tính**: ba trạng thái khách hàng nêu, cộng
> ***Quá hạn duyệt*** — chốt khi được hỏi: nó là trạng thái kết thúc, không ai thao tác được, và tính
> nó là khoá khách ấy tới 3 ngày chờ hệ thống tự chuyển *Đã xoá*.
>
> **Đảo một ranh giới của `10/09`**: bản chốt ấy cố tình KHÔNG chặn *Yêu cầu chỉnh sửa* vì *"không
> ai yêu cầu"*. Giờ có. Khách có hồ sơ bị trả về thì TDV **sửa rồi gửi lại chính hồ sơ ấy**, hoặc xoá
> nó — không lập bản thứ hai bên cạnh.
>
> **Hai câu trả lời, theo việc làm được**: hồ sơ đang chặn là *Nháp* thì nói như cũ (*"mở bản Nháp ra
> soạn tiếp"*); hồ sơ đã vào luồng thì nói **mã và trạng thái** của nó, và nút mở hồ sơ ấy ra xem —
> việc của TDV là chờ nó duyệt xong, không phải soạn tiếp. Áp cho **cả hai đường lập** (trang *Lập
> hồ sơ* và lối tắt *Lập phiên bản mới* ở trang hồ sơ). Lối tắt **biết trước**: hộp thoại mở ra đã là
> hộp chặn, không bày nút lập rồi mới từ chối.
>
> **Cảnh báo *"khách đã có một phiên bản mới đang dở dang"* (`08/09`) GỠ HẲN** — nó sinh ra vì khi
> ấy lập hai bản cùng lúc là được; giờ không được nữa, nên chỗ của nó là hộp chặn.
>
> **Chốt chặn ở CSDL** (thay ràng buộc của `10/09`, cùng lý do: bấm đúp là hai lượt song song).
>
> **Nâng cấp một hệ đang chạy có thể DỪNG** ở migration nếu còn khách đang có nhiều hơn một hồ sơ chưa
> duyệt xong; thông báo in mã và tên khách kèm **mã và trạng thái** từng hồ sơ. Đường sửa như cũ: xoá
> bớt bản thừa trên màn hình, hoặc duyệt xong một bản, rồi chạy lại. **Đo được trên CSDL demo cũ**:
> 22 khách, mỗi khách 4–6 hồ sơ đang dở — bản demo phải dựng lại (`make demo-mau` đã đổi theo).

**KHỐI LÝ DO CHỈ HIỆN KHI CÒN VIỆC PHẢI LÀM** `sửa 25/09` — *"phần lý do cuối cùng trong trang CSBH chỉ
hiện khi ở trạng thái yêu cầu chỉnh sửa, hoặc SA cần up lại bản cứng, các trạng thái khác không cần
hiện"*.

> Khối *Lý do gần nhất* hiện ở đúng **hai lúc**:
>
> - hồ sơ đang **Yêu cầu chỉnh sửa** — TDV phải sửa theo lý do ấy (bốn đường trả về của `08/09`);
> - hồ sơ đang ở bàn **Sale Admin** và lý do gần nhất là Kế toán **Yêu cầu in lại** — Sale Admin phải
>   tải lên bản cứng mới theo lý do ấy.
>
> Mọi trạng thái khác: **không hiện**, kể cả khi hồ sơ từng bị trả về. **Đảo quy ước `08/09`** *"gửi
> lại sau khi sửa vẫn giữ lý do cũ"* — gửi lại rồi thì người đang cầm hồ sơ là người duyệt, và lý do
> ấy đã được xử lý. Lý do không mất: **Lịch sử** của hồ sơ vẫn giữ đủ mọi lượt.
>
> **Vế Sale Admin hỏi HÀNH ĐỘNG, không chỉ trạng thái**: *Sale Admin đang xử lý* cũng là bước bình
> thường ngay sau Kế toán tiếp nhận L1, và lúc ấy lý do gần nhất (nếu có) là một lượt trả về đã sửa
> xong từ trước — không hiện.

**CON MẮT HIỆN/ẨN MẬT KHẨU** `mới 25/09` — *"thêm chức năng hiển thị mật khẩu lúc nhập, để hình con
mắt bên cạnh của mọi text box chứa mật khẩu"*.

> **Mọi** ô mật khẩu — sáu ô ở ba màn hình: *Đăng nhập* (kể cả lớp phủ hết phiên), *Đổi mật khẩu*
> lần đầu, *Đặt mật khẩu* (kích hoạt tài khoản và quên mật khẩu). Mặc định **ẩn**; bấm con mắt thì
> hiện, bấm lần nữa thì ẩn.
>
> **Mỗi ô bật riêng**: hiện ô *Mật khẩu mới* không kéo theo ô *Nhập lại* — ô nhập lại tồn tại để gõ
> lại mà không nhìn.

**SỐ ĐIỆN THOẠI · CHỨC DANH · TÊN NÚT THÊM SẢN PHẨM** `sửa 27/09` — *"kiểm tra khi nhập số điện
thoại, yêu cầu nhập đúng 10 số, nếu không đúng, báo lỗi đỏ bên dưới và không cho sang bước tiếp
theo"*; *"chức danh người đại diện đổi thành list sổ xuống gồm Giám đốc, Chủ hộ kinh doanh, Khác (cho
tự nhập)"*; và nút *Thêm dòng* trong hộp thoại *Thêm sản phẩm* đổi thành ***Xác nhận***.

> **Số điện thoại vẫn KHÔNG bắt buộc** — để trống thì lưu được như cũ (khách hàng lập trước `27/08`
> chưa ai khai). Chỉ một số **đã gõ** mà không đủ đúng mười chữ số mới bị chặn — 9 hay 11 đều sai.
> Máy chủ chốt cùng luật, và lưu **bản chuẩn**: `0912 345 678`, `0912.345.678` và `0912345678` là một
> số, lưu thành `0912345678` — số này đóng băng vào hồ sơ và in ra tờ CSBH, nên một số không được có
> ba lối viết. **Không đòi đầu `0`** — yêu cầu nói *"đúng 10 số"*, luật đầu số chưa ai đặt.
>
> **Chức danh lưu CÂU CHỮ, không lưu mã**: nó in thẳng ra tờ CSBH, và *Khác* nghĩa là chữ tự do. Chức
> danh cũ ngoài danh sách (*Chủ nhà thuốc*, *Trưởng khoa*…) mở ra thành *Khác* kèm đúng chữ ấy —
> không bao giờ thành ô trống, vì lượt Lưu tiếp theo sẽ lặng lẽ xoá nó. Chọn *Khác* thì ô tự nhập
> **bắt buộc**.
>
> Nút trên bảng sản phẩm **đã là *Thêm sản phẩm*** từ `22/08`; lượt này chỉ đổi nút trong hộp thoại.

**TRẢ VỀ THÌ BỎ ĐÓNG BĂNG KHÁCH HÀNG, SỬA NGAY TẠI TRANG HỒ SƠ** `mới 28/09` — *"khi TBP hoặc kế
toán trả về CSBH cho TDV, TDV chưa thể sửa được các thông tin chung của CSBH đó, ví dụ các thông tin
liên quan đến khách hàng"*.

> **Thật ra sửa được — chỉ là không thấy.** Sửa ở trang Khách hàng vẫn ăn, nhưng trang hồ sơ bày
> **ảnh chụp** chụp lúc gửi duyệt (`24/08`), và ảnh chụp ấy nằm lại qua lượt trả về; tới lượt gửi lại
> mới chụp lại. Nên TDV sửa xong mở hồ sơ vẫn thấy số cũ, và trang hồ sơ không có lối nào sang chỗ sửa.
>
> Chốt ba điều: (1) hồ sơ về *Yêu cầu chỉnh sửa* — qua bất kỳ đường trả về nào — thì **ảnh chụp khách
> hàng bị xoá**, trang hồ sơ đọc thông tin **sống**, gửi lại thì đóng băng lại như mọi lượt gửi;
> (2) TBP, Kế toán mở hồ sơ trong quãng ấy cũng thấy **dữ liệu sống** — đó là thứ sắp được gửi lại;
> (3) khối *Thông tin chung* có nút **Sửa thông tin khách hàng** cho TDV phụ trách khi hồ sơ ở *Nháp*
> hoặc *Yêu cầu chỉnh sửa*, mở chính biểu mẫu của trang Khách hàng. **Mã hồ sơ không thuộc "thông tin
> chung"** — vẫn chỉ sửa được ở *Nháp* (`10/09`).
>
> **Cái mất:** người duyệt mở lại hồ sơ mình vừa trả về thấy số đang sửa dở, không còn đúng bản họ đã
> trả. Bản ấy vẫn nằm trong lý do trả về và thư báo; *người đề nghị* không bị xoá vì nó không phải
> thông tin khách hàng. An toàn nhờ `25/09`: mỗi khách chỉ một hồ sơ đang xử lý, còn CSBH đang hiệu
> lực có ảnh chụp riêng nên không đổi theo.

**HẾT PHIÊN THÌ CHE KÍN MÀN HÌNH** `sửa 04/11` — *"vẫn hiện ra phần đăng nhập nhưng không bao giờ show
nội dung đằng sau khi hết hạn phiên"*. Lộ ra lúc chạy thử bản production: đổi mật khẩu bắt buộc thu
hồi mọi phiên (kể cả phiên của chính người đổi), và ô đăng nhập lại nằm trên lớp mờ nên trang Tổng
quan phía sau vẫn đọc được. Giữ luật *"đăng nhập lại không mất bản nhập dở"*, chỉ thôi bày nó ra.
Việc đổi mật khẩu đưa thẳng về ô đăng nhập **giữ nguyên** theo câu trả lời ấy; đề xuất cấp phiên mới
cho chính người vừa đổi (để khỏi đăng nhập lại) **chưa làm**.

**CHUYỂN MÁY KHÔNG MẤT GÌ, VÀ SAO LƯU KHO TỆP** `mới 05/11` — *"restore và backup có đảm bảo dữ liệu
người dùng không bị mất không, ví dụ migrate sang máy khác vẫn đảm bảo người dùng và hệ thống không có
bất kỳ thay đổi nào"*. Đo ra là **chưa**: kho tệp không được sao lưu, bí mật chép tay, sự kiện đang chờ
mất khi chuyển giữa chừng. Chốt khi hỏi: bí mật đi gói riêng có mã hoá · sao lưu kho tệp là lệnh có sẵn,
chưa gắn lịch hằng đêm. Xem muc 10, *Sao lưu kho tệp và chuyển máy*.

**CHÂN TRANG, VÀ KHÔNG BÀY MÃ LỖI** `mới 05/11` — chân trang mọi màn hình mang đúng ba mảnh khách
hàng duyệt: *"© <năm> Công ty TNHH Dược phẩm Nutricare. Bảo lưu mọi quyền."* · *"Phần mềm Chính sách bán
hàng — tài sản của Công ty TNHH Dược phẩm Nutricare, chỉ dành cho người được cấp tài khoản."* · *"Phiên
bản <số>"* (số phiên bản dời xuống đây từ đáy thanh bên); màn hình đăng nhập mang dòng bản quyền và số
phiên bản (`sửa 05/11` — người không đăng nhập được cần đọc số ấy khi báo lỗi). Và
*"bỏ toàn bộ việc hiển thị mã lỗi trên giao diện, người dùng không cần quan tâm, hiển thị chỉ gây rối
mắt"* — không câu lỗi nào còn kèm **mã tra cứu** hay **câu gốc của máy chủ** (thứ mang tên trường trong
mã). Đảo vế bày của `0088`; mã vẫn sinh và vẫn nằm trong nhật ký. Màn hình *Nhật ký* của Quản trị **giữ**
cột mã tra cứu — ở đó nó là khoá để lọc cả chuỗi của một lượt bấm, không phải lời báo lỗi.

**BAN LÃNH ĐẠO KHÔNG NHẬN THÔNG BÁO NÀO** `mới 07/11` — hỏi *"ban lãnh đạo có nhận được thông báo gì
không"*, trả lời *không*, khách hàng chốt *"giữ nguyên, đảm bảo ban lãnh đạo sẽ không nhận bất kỳ thông
báo nào"*. Trước đó đúng tình cờ (vai trò này không đứng tên ô nào trên hồ sơ); giờ là luật, có chốt
chặn. Xem mục 2.6.

**TRANG VẬN HÀNH** `mới 05/11 — 06/11` — *"đưa mọi thao tác vận hành từ command line lên giao diện web
của tài khoản admin, trong một trang riêng biệt gọi là vận hành"*. Mockup duyệt 05/11. Chốt khi hỏi:
thao tác cần quyền máy chủ chạy qua **phần mềm nhận lệnh trên máy chủ**, không trao quyền ấy cho
container · **phục hồi giữ ở máy chủ**, không lên web (*"admin không có chuyên môn IT"*) · bỏ khỏi
trang: đường hầm, khởi động lại, nâng cấp, nạp danh mục, thư thử, diễn tập · **mỗi thành phần một
tệp log, nén một tệp mỗi ngày, giữ 30** · sao lưu CSDL **và** kho tệp có lịch + số bản giữ cấu hình
được · **bỏ bản nền + WAL**, sao lưu theo lịch là đủ · **bỏ trích kiểm toán** · **một ngưỡng ổ đĩa**
· thu cả log sáu thành phần nền tảng · giảm số bản thì **đợi lượt kế tiếp** · *"bỏ khái niệm dump"* ·
*Hạn xử lý hồ sơ* ghi rõ đơn vị **ngày**. Xem mục 2.7 và 10.

**HẾT PHIÊN Ở BẤT KỲ CỬA SỔ NÀO, VÀ GOOGLE Ở Ô ĐĂNG NHẬP LẠI** `sửa 05/11` — *"tạo và test hết các
case mà người dùng bị hết hạn đăng nhập ở bất kỳ cửa sổ nào, khi hiện hộp thư đăng nhập không có bất
cứ nội dung nào ở đằng sau, hộp thư đăng nhập cũng cần phải tích hợp OAuth 2.0 qua google login"*.
Đảo một nửa `04/11` (ô đăng nhập lại không có Google): giữ lý do cũ — rời trang là mất bản nhập dở —
bằng cách mở Google trong cửa sổ bật lên. Xem muc 2.8.

**ĐĂNG NHẬP BẰNG GOOGLE** `mới 04/11` — *"đăng nhập qua tài khoản google, click vào biểu tượng
đăng nhập bằng gmail, chọn gmail tương ứng để đăng nhập mà không cần nhập tay"*. Ba câu chốt khi hỏi:
**chỉ ghép email đã có** (không tự tạo tài khoản) · Công ty dùng **Google Workspace**, nên email trong
phần mềm chính là tài khoản Google · tài khoản **chưa kích hoạt** vào được và **coi như kích hoạt**.
Xem muc 2.8.

> **Cái mất, đã nêu**: người chỉ đăng nhập bằng Google không có mật khẩu, nên khi Google hỏng (hoặc máy
> chủ không ra được Internet) họ phải đi *Quên mật khẩu*. Lớp phủ *phiên đã hết hạn* **không** có nút
> Google — rời trang là mất bản đang nhập dở — nên ở đó họ cũng cần mật khẩu.

**YÊU CẦU CẬP NHẬT HOÃN SANG PHIÊN BẢN SAU** `sửa 24/10` — *"chức năng yêu cầu cập nhật CSBH khi giá
sản phẩm hoặc chiết khấu thay đổi sẽ tạm để sang version sau… giữ nguyên toàn bộ những gì đang phát
triển nhưng chưa mở ngay để dùng"*. Một **công tắc tính năng**, đang **tắt**: box *Yêu cầu cập nhật*
(muc 9.3), khối cảnh báo lệch trên trang hồ sơ, nút *Tự động cập nhật*, và các câu nhắc tới box ở hộp
sửa sản phẩm / khách hàng đều **không hiện**; máy chủ trả box rỗng và từ chối lượt gọi thẳng nút.

> **Không tắt**: (1) **luật đóng băng** — gửi duyệt vẫn chụp giá và ngưỡng hiện hành, dòng không chụp
> được vẫn chặn gửi (`16/08`); (2) phép **rà nền** khi danh mục đổi vẫn chạy, nên ngày bật lên box có
> ngay dữ liệu đúng. Mã và ca kiểm của tính năng **giữ nguyên**, bộ kiểm chạy chúng với công tắc bật.
>
> **Cái mất trong lúc tắt, đã nêu**: hồ sơ *Nháp* / *Yêu cầu chỉnh sửa* thôi tự đổi số khi mở ra từ
> `10/09`, nên TDV có thể đang nhìn giá cũ mà không gì báo; số đúng được chụp lúc gửi duyệt. Người duyệt
> hồ sơ đã đóng băng cũng không còn chỗ nào nói con số đã lỗi thời.

**CHỨC DANH Ở TRANG KHÁCH HÀNG · BỎ Ô TRẠNG THÁI KHÁCH HÀNG** `sửa 29/09` — chức danh người đại diện
hiện cả ở trang thông tin khách hàng (ngay sau người đại diện); ô *Trạng thái khách hàng* rời khỏi
khối *Thông tin chung* của trang hồ sơ, và *Tên Hộ kinh doanh/Tên Công ty* — ô từng đi cặp với nó —
chiếm trọn một hàng để mười ba ô còn lại vẫn đứng cố định theo cặp.

> **Cái mất, đã nêu**: hồ sơ của khách **đã ngừng hợp tác** thôi nói điều ấy trên trang hồ sơ (ô được
> thêm năm 19/09 đúng vì *"hồ sơ cũ của họ vẫn mở được"*). Trang khách hàng vẫn nói.

**ĐỔI NHÓM SẢN PHẨM · ĐỔI MÃ QUY ĐỊNH CŨNG LÀ LỆCH** `sửa 29/09` — *"khi sửa thông tin của sản
phẩm cho phép thay đổi cả nhóm sản phẩm… khi nhóm thay đổi, quy định chiết khấu đối với sản phẩm đó
cũng thay đổi, yêu cầu hệ thống cập nhật thông tin này vào danh sách CSBH cần yêu cầu cập nhật"*. Quản
trị đổi nhóm ở hộp *Sửa* (vẫn gõ lại mã); ngưỡng tra theo nhóm HIỆN TẠI nên hồ sơ lệch tự vào box.

> **Cùng ngưỡng, khác quy định vẫn là lệch** (chốt khi được hỏi). Tới đây box *Yêu cầu cập nhật* chỉ
> so NGƯỠNG (`17/08`); giờ so cả MÃ quy định. Kéo theo: sửa mã một quy định mà ngưỡng không đổi cũng
> sinh yêu cầu cập nhật cho mọi hồ sơ dùng nó — đã nêu khi chốt.

**THÔNG TIN CHUNG: KHÔNG KHOẢNG TRỐNG GIỮA KHỐI** `sửa 29/09` — *"không để khoảng trống giữa Chức danh
người đại diện và Tỉnh/Thành phố"*. Khoảng trống ấy là nửa phải của hàng *Tên Hộ kinh doanh/Tên Công
ty* trọn hàng (mục ngay dưới). Giờ tên đi cặp với **Mã khách hàng**; ô lẻ **Loại khách hàng** xuống
cuối khối (chốt khi được hỏi) — cùng chỗ nó đứng ở trang khách hàng từ `29/08`.

**BẢNG SẢN PHẨM: BỎ GHIM, THỨ TỰ CỘT NHƯ CŨ** `sửa 29/09` — sau khi xem mục ngay dưới trên bản demo:
*"bỏ fix cứng cột tên sản phẩm, đổi thứ tự cột về như cũ"*. Thứ tự lại là *Ngày áp dụng · Mã · Tên*,
**khớp bản in không ngoại lệ**; **không cột nào ghim** khi cuộn ngang (kể cả ba cột của `0228`). Sau
đó cùng ngày: *"đổi lại màu của cột tên sản phẩm về như cũ"* — cột tên thôi tô nền xanh nhạt, màu như
mọi cột. Còn lại từ mục ngay dưới: nút Sửa/Xoá cỡ thường, cột thao tác không ghim.

**BẢNG SẢN PHẨM: TÊN ĐỨNG ĐẦU, KHOÁ VÀ NỔI** `sửa 29/09, đã lùi phần thứ tự và ghim` — *"đẩy tên sản phẩm lên cột đầu tiên và
fix cứng cột đó khi người dùng lăn chuột, cần làm nổi cột này lên"*; nút Sửa/Xoá *"nhìn không bị quá
chật, và không cần cố định cột thao tác"*. Thay vế *khoá 3 cột đầu* và *cột thao tác ghim mép phải*
của mục ngay dưới: chỉ cột **Tên sản phẩm** khoá (nền xanh nhạt, chữ đậm, bóng mép phải), *Ngày áp
dụng* và *Mã sản phẩm* đứng ngay sau và trôi theo; cột thao tác đứng cuối, nút cỡ thường.

> **Chỉ màn hình** (chốt khi được hỏi). Bản in giữ tên ngay sau mã — đây là chỗ DUY NHẤT thứ tự cột
> màn hình khác bản in (luật khớp thứ tự của `07/09` miễn đúng cột này). Vế *"Ngày áp dụng bên trái
> Mã sản phẩm"* giữ nguyên ở cả hai.

**BỐ CỤC TRANG HỒ SƠ CSBH** `sửa 29/09` — năm câu một lượt: nút *"Sửa thông tin khách hàng"* rút gọn
thành **Sửa** và dời lên ngang tiêu đề *Thông tin chung*; **các ô của *Thông tin chung* có vị trí cố
định** (*"mã KH lúc bên trái lúc bên phải"*); thêm **Chức danh người đại diện**; bảng sản phẩm **khoá
3 cột đầu** khi cuộn ngang; nút **Sửa/Xoá luôn hiện**, bỏ rê chuột.

> **Vì sao các ô xô lệch.** Lưới hai cột xếp ô theo thứ tự, và bốn ô chỉ hiện khi có dữ liệu (*Có hiệu
> lực*, địa chỉ đăng ký một hoặc hai ô, *Địa chỉ giao hàng*, *Trạng thái khách hàng*) — mỗi ô vắng
> mặt đẩy mọi ô sau một nấc. Mỗi ô có lý do riêng lúc thêm vào; cộng lại thì ra đúng điều khách hàng
> thấy. Giờ **mười bốn ô luôn đủ**, thiếu dữ liệu thì nói thành lời (*Chưa có hiệu lực*, *Giao tới địa
> chỉ đăng ký*, *Đang hợp tác*).
>
> **Rê chuột chỉ bỏ ở bảng sản phẩm của hồ sơ.** Sáu bảng danh mục và quản trị vẫn giữ luật `27/08`
> (nút hiện khi rê chuột). Cột thao tác của bảng hồ sơ ghim mép phải, vì bảng cuộn ngang.

**CHỈ TDV PHỤ TRÁCH SỬA THÔNG TIN KHÁCH HÀNG** `sửa 28/09` — hỏi *"tại sao Kế toán, SA và Quản trị
lại được sửa khách hàng"*, rồi chốt: chỉ TDV phụ trách.

> **Quyền cũ không có căn cứ nghiệp vụ.** Mục 2.4 cho Kế toán *mở thông tin khách hàng để đối
> chiếu*, mục 2.5 viết Sale Admin *không sửa nội dung CSBH*, mục 2.7 cho Quản trị đúng một việc với
> khách hàng là đổi TDV phụ trách. Quyền sửa của ba vai trò ấy đến từ một danh sách "vai trò được
> ghi" dựng ở bản đầu và chưa từng được rà — hướng dẫn sử dụng chép lại hành vi ấy mà không có quyết
> định nào đứng sau. Máy chủ còn cho cả Trưởng bộ phận, trong khi màn hình giấu nút với họ.
>
> **Cái giá**: Kế toán hay Sale Admin thấy địa chỉ sai lúc xuất hợp đồng thì phải nhờ TDV sửa, không
> tự sửa ngay được. **Quản trị vẫn đổi được TDV phụ trách** — lượt đổi ấy không mang theo ô nào khác.

**MÃ KHÁCH HÀNG SỬA ĐƯỢC** `sửa 28/09` — *"cho phép sửa đổi mã khách hàng"*, rồi bổ sung *"chỉ có
khách hàng chưa có CSBH đang có hiệu lực mới được sửa mã KH"*. Chốt khi được hỏi: **chỉ TDV phụ
trách** sửa (Quản trị hệ thống cũng không) · **mã cũ dùng lại được**.

> **Luật cũ cấm vì một lo ngại không có thật.** Từ bản thiết kế, mã khách hàng bị khoá cứng ở cơ sở
> dữ liệu với lý do *"đổi mã thì hồ sơ CSBH cũ lặng lẽ trỏ sang khách khác"*. Hồ sơ nối với khách
> bằng mã nội bộ, không bằng mã khách hàng — đổi mã không làm hồ sơ nào đổi khách. Tờ CSBH đã gửi
> duyệt mang ảnh chụp mã lúc gửi (`24/08`), nên nó giữ mã cũ.
>
> **Vì sao khoá khi đang có CSBH hiệu lực**: đó là văn bản hai bên đã ký và đang áp dụng, và nó mang
> mã cũ. Đổi mã lúc ấy là để khách giao dịch dưới một mã mà tờ giấy đang dùng không có. Hồ sơ đang
> duyệt thì **không** chặn — yêu cầu chỉ nói *"đang có hiệu lực"*.
>
> **Cái giá của "mã cũ dùng lại được"**: tra một mã in trên tờ CSBH cũ có thể ra khách khác, nếu mã
> ấy đã được cấp lại. Khách hàng chấp nhận khi được nêu.

**TRẠNG THÁI MỚI *SALE ADMIN SỬA BẢN CỨNG*** `mới 28/09` — *"thêm một trạng thái cho CSBH trong luồng
duyệt gọi là SA sửa bản cứng, xảy ra khi Kế Toán trả lại CSBH về cho SA, khi đó cần trạng thái này để
phân biệt với SA đang xử lý"*.

> **Không phải một phân biệt mới — là đưa một phân biệt đã có ra chỗ nhìn thấy được.** Từ `19/08` hệ
> thống đã tách hai việc này để đếm thẻ *Lỗi bản cứng* của Sale Admin, nhưng bằng một **mốc thời gian
> ẩn** trên hồ sơ vẫn mang nhãn *Sale Admin đang xử lý*. Danh sách, trang hồ sơ, thư báo, bộ lọc và
> thống kê chỉ đọc nhãn trạng thái — nên ở mọi chỗ ấy hai việc trông như một. Nay đó là trạng thái
> thật, và mốc ẩn **bỏ hẳn**: hai chỗ trả lời cùng một câu hỏi là hai chỗ sẽ có ngày nói khác nhau.
>
> Chốt khi được hỏi: (1) **Trưởng bộ phận vẫn hoàn duyệt được** ở trạng thái mới — như hôm trước, khi
> nó còn là *Sale Admin đang xử lý*; (2) thẻ Tổng quan **giữ tên *Lỗi bản cứng*** và đếm đúng trạng
> thái này; (3) nhãn mang **một màu riêng** — tím mận, vùng màu duy nhất chưa trạng thái nào dùng.
>
> Đi kèm, không ai phải chốt: SLA 14 ngày như mọi bước chờ (ca này vốn đã có hạn); hồ sơ ở trạng thái
> này tính vào *"một hồ sơ đang xử lý mỗi khách"* (`25/09`); khối *Lý do gần nhất* hiện ở đây
> (`25/09` đã quy định đúng ca này). **Mốc cũ có một lỗ, đóng theo**: hồ sơ bị hoàn duyệt giữa lúc
> sửa bản cứng giữ lại mốc, nên vòng sau nó lại bị đếm vào *Lỗi bản cứng* dù đang làm bản cứng lần đầu.

**HỘP XEM ẢNH CHỈ CÒN CÂU HƯỚNG DẪN** `sửa 20/09` — hai câu, hai lượt: *"phần xem ảnh chỉ cần câu
hướng dẫn, không cần hai nút +/- bên cạnh"*, rồi *"không cần cả ô phần trăm và nút về cỡ vừa khung,
người dùng chỉ cần lăn chuột"*.

> `01/09` dựng ba nút cạnh câu hướng dẫn. Ở cỡ vừa khung — trạng thái mọi tấm ảnh mở ra — **hai trong
> ba đang xám**: nút *thu nhỏ* khoá vì không xuống dưới cỡ vừa khung được, và nút phần trăm cũng khoá
> vì ảnh đã ở đúng chỗ nó đưa về. Tức trạng thái thường gặp nhất bày ra ba nút mà chỉ một bấm được.
>
> **Lối vào không mất**: lăn chuột vẫn phóng to, kéo vẫn di chuyển, và câu hướng dẫn nói ra cả hai.
> Hai cái nút là một đường THỨ HAI tới cùng một việc.
>
> **ĐƯỜNG THOÁT: lượt đầu giữ lại, lượt sau bỏ nốt.** Bản `0211` cho nút `150% · Về cỡ vừa khung`
> hiện khi ảnh đang phóng; khách hàng xem xong bảo bỏ hẳn. Bỏ được vì một dữ kiện phải kiểm trước khi
> quyết chứ không phải một hy vọng: **lăn ngược hết cỡ cho ra đúng trạng thái cái nút ấy dựng lại** —
> phép kẹp mức phóng cũng là chỗ đưa ảnh về giữa, và đường lăn chuột đi qua chính nó.
>
> **Cái mất, đã nêu**: màn hình thôi cho biết đang phóng bao nhiêu phần trăm, và lăn quá tay thì phải
> lăn ngược chứ không bấm một lần.

**BẢN XEM PDF VÀ ẢNH PHỦ KÍN MÀN HÌNH** `sửa 20/09` — *"phần xem pdf hoặc ảnh hiển thị trong hộp
thoại vẫn hơi bé, đề xuất hiển thị ở dạng fullscreen, không cần bọc tài liệu hoặc ảnh trong hộp
thoại"*.

> **LƯỢT THỨ NĂM của cùng một dòng**, và là lượt bỏ chính cái khung: `20/08` dựng bề rộng suy từ khổ
> giấy · `28/08` nới trần chiều cao · `29/08` kéo lại vì *"hộp không còn thấy trang phía sau thì thôi
> trông như hộp thoại"* · `30/08` đảo đúng câu ấy và bỏ hẳn trần.
>
> **Vì sao nới thêm không chữa được, phải bỏ khung**: bề rộng khoá theo CHIỀU CAO nhân tỷ lệ tờ giấy,
> nên một tờ A4 dọc trên màn hình 16:9 chỉ dùng được khoảng hai phần ba bề ngang — phần còn lại là hai
> vệt trống. Nới `width` chỉ kéo dài hai vệt ấy, không làm chữ to thêm một pixel.
>
> **BA THỨ GIỮ LẠI, có chủ ý**: dải tiêu đề mỏng và hàng nút (muc 11.1 đòi *nút Đóng luôn hiển thị*,
> mà chế độ này không còn mép lớp phủ nào để bấm ra ngoài) · **ảnh vẫn chặn ở cỡ thật** của tệp, luật
> `30/08` chỉ đổi chỗ chứ không mất · **tệp Word, Excel giữ hộp thoại thường** — ở đó không có tài
> liệu nào để bày, chỉ một câu nhắn tải về.

**MẪU RÚT GỌN BỎ HAI DÒNG NGÀY DUYỆT** `sửa 20/09` — *"trong bản mềm rút gọn có thể bỏ dòng chữ màu
xanh bên dưới TBP và kế toán ghi ngày duyệt đi được không, bản đầy đủ thì vẫn giữ nguyên"*.

> Hai dòng ấy là `Tiếp nhận L1: {{ho_so.ngay_kt_nhan_l1}}` dưới ô Kế toán và `Ký ngày:
> {{ho_so.ngay_tbp_ky}}` dưới ô Trưởng bộ phận, in màu xanh trong khối chữ ký.
>
> **HAI DÒNG KHÔNG CÙNG GIÁ, và đó là chỗ phải hỏi lại trước khi làm.** Dòng dưới Kế toán bỏ tự do —
> `ngay_kt_nhan_l1` rời khỏi danh sách mục bắt buộc từ `24/08`. Dòng dưới TBP thì **vẫn là một trong
> sáu mục bắt buộc của muc 11.1**, nên bỏ nó là mẫu rút gọn không lưu được nữa.
>
> **Khách hàng chốt phương án A**: danh sách bắt buộc thành **theo LOẠI mẫu** — rút gọn năm mục, đầy
> đủ sáu. Phương án B (bỏ hẳn `ngay_tbp_ky` khỏi danh sách) ít việc hơn nhưng nới luôn cả mẫu đầy đủ,
> đúng thứ câu yêu cầu bảo giữ nguyên.
>
> **Cái giá đã nêu**: bản mềm rút gọn thôi cho biết ngày TBP ký và ngày Kế toán tiếp nhận. Hai mốc ấy
> vẫn còn ở bản đầy đủ, ở màn hình hồ sơ và trong Nhật ký.
>
> **Hệ đang chạy không tự đổi theo**: mẫu nạp vào cơ sở dữ liệu một lần theo `(loại, tên)`, nên sửa
> tệp không đụng tới dòng đã nạp — phải dựng lại dữ liệu, hoặc thay dòng ấy bằng tay.

**Ô NHẬP NGÀY VÀ MỌI CHỖ HIỂN THỊ NGÀY ĐỀU `DD/MM/YYYY`** `sửa 20/09` — *"các ô nhập ngày tháng năm
sửa lại về định dạng DD/MM/YYYY"*, rồi *"rà soát lại để đảm bảo mọi hiển thị ngày tháng năm ở nội
dung của tất cả các trang, bản mềm, mail, thông báo đều là DD/MM/YYYY"*.

> **Ô NGÀY SẴN CÓ CỦA TRÌNH DUYỆT KHÔNG ÉP ĐƯỢC LỐI VIẾT — đo chứ không suy.** Dựng bốn ô trên
> Chromium thật, một không khai `lang` và ba khai `vi` · `vi-VN` · `en-GB`: **cả bốn ra
> `09/20/2026`**. Trình duyệt đọc ngôn ngữ GIAO DIỆN của chính nó, không đọc tài liệu. Nên sáu ô
> ngày của phần mềm thôi dùng ô sẵn có; phần mềm tự vẽ ô chữ, và mượn lại bộ chọn lịch bằng một nút
> bên cạnh.
>
> **Cái giá đã nêu và khách hàng nhận**: nút lịch vắng mặt trên trình duyệt quá cũ (Safari dưới 16,
> Firefox dưới 101) — ô gõ vẫn dùng bình thường.
>
> **Lượt rà soát kèm theo**: bốn đường hiển thị — mọi trang, bản mềm, thư điện tử, chuông thông báo
> — đã đúng `dd/mm/yyyy` từ trước. Thứ tìm ra là **ba chỗ dựng "hôm nay" theo giờ UTC**: ngày mặc
> định của hộp thoại thêm quy định chiết khấu, chặn trên của bộ lọc Nhật ký, và mốc thời gian trong
> tên tệp bản mềm. Cả ba sai đúng bảy tiếng mỗi ngày — từ 00:00 tới 07:00 giờ Việt Nam chúng trả về
> HÔM QUA — và không cái nào làm gì đỏ, vì hôm qua cũng là một ngày hợp lệ.
>
> **Tên tệp là ngoại lệ có lý do**: nó không mang được dấu `/` (ký tự ngăn thư mục), nên mốc trong
> tên tệp bản mềm là `dd-mm-yyyy HHhMM`. Tên tệp Excel xuất báo cáo GIỮ `YYYYMMDD`, cũng có lý do:
> nó nằm trong thư mục Tải về, chỗ thứ tự tên chính là thứ tự thời gian.

**BỐN CON SỐ CỦA HỘP THOẠI THÊM DÒNG TRÊN MỘT HÀNG** `sửa 20/09` — *"trong hộp thoại thêm sản phẩm,
thông tin về CPBH, Giá thu về, tỷ lệ CK, QĐCK để chung một dòng, tự chỉnh bố cục, khoảng cách, độ
rộng cột cho cân đối"*.

> Khối xem trước của `09/09` xếp bốn ô thành 2×2; giờ là một hàng bốn ô.
>
> **CỘT BẰNG NHAU, không đo theo nội dung** — và đây là chỗ luật ngược với bảng sản phẩm và khối
> thông tin khách hàng, hai nơi bề rộng cột đo từ nội dung. Bốn con số này **đổi theo từng phím**
> người dùng gõ, nên cột đo theo nội dung sẽ làm cả hàng co giãn và ba ô không liên quan nhảy chỗ mỗi
> lượt gõ thêm một chữ số.
>
> **Màn hình hẹp về 2×2, điện thoại về một cột.** Bỏ bậc giữa là nhảy thẳng từ bốn cột sang một.

**MỘT KHỐI THÔNG TIN Ở ĐẦU TRANG HỒ SƠ** `mới 19/09` — *"trong trang thông tin hồ sơ, hãy gộp thông
tin của hồ sơ và khách hàng vào 1 mục, phần trạng thái của hồ sơ có thể để luôn bên cạnh mã hồ sơ ở
trên, bố cục dòng và cột sao cho cân đối"*.

> **VÌ SAO HAI THẺ CŨ KHÔNG CÂN ĐỐI, và nó không phải chuyện thẩm mỹ**: thẻ *Hồ sơ* có bốn ô, thẻ
> *Khách hàng* có tới tám — hai thẻ cạnh nhau thì một cái cao gấp đôi cái kia, và khoảng trống nằm
> đúng nửa trên bên trái, chỗ mắt đọc trước. Gộp làm một lưới thì mười một ô chia đều được thành hai
> cặp cột.
>
> **BA NHÃN PHẢI ĐỔI TÊN, và khách hàng không nêu vế này**: *Mã* · *Loại* · *Trạng thái* trước đây chỉ
> đọc ra được nghĩa nhờ đứng dưới tiêu đề *Khách hàng*. Bỏ tiêu đề ấy mà giữ nguyên nhãn thì **Mã đứng
> cạnh Phiên bản** trong khi mã hồ sơ là tiêu đề của chính trang — hai cái mã, một cái nhãn. Ba ô giờ
> là *Mã khách hàng* · *Loại khách hàng* · *Trạng thái khách hàng*.
>
> **Trạng thái hồ sơ lên cạnh mã — KHÔNG đảo lượt đưa nút thao tác lên đầu trang.** Lượt ấy đẩy nhãn
> trạng thái ra khỏi GÓC PHẢI để nhường chỗ cho dải nút; chỗ mới nằm ở mép TRÁI, cạnh mã, nên hai
> việc không tranh nhau chỗ nào. Khoản được không ai nêu: ô *Trạng thái* rời khỏi lưới đúng lúc lưới sắp có một ô
> *Trạng thái* thứ hai — của khách hàng.
>
> **Thứ tự các ô GIỮ NGUYÊN**: bốn ô của hồ sơ trước, rồi nguyên dãy của khách hàng theo đúng thứ tự
> chốt `06/09`. Lượt gộp không phải dịp sắp xếp lại.

**TỈNH/THÀNH PHỐ LÀ Ô CHỌN, 63 ĐƠN VỊ CŨ** `mới 19/09` — *"thay đổi về lúc nhập Tỉnh/Thành phố thành
dạng sổ list với danh sách 63 tỉnh thành phố cũ ở Việt Nam"*.

> **DANH SÁCH CŨ, KHÔNG PHẢI 34 ĐƠN VỊ SAU SÁP NHẬP.** Ô này khai địa chỉ **theo giấy đăng ký kinh
> doanh**, và tờ giấy trong tay khách hàng hôm nay vẫn mang tên cũ. Đây là một bảng từ vựng đọc theo
> GIẤY TỜ chứ không theo địa giới hành chính đang hiệu lực — ngày nào khách hàng đổi giấy thì đổi
> bảng, và đó là một quyết định nghiệp vụ chứ không phải một lượt cập nhật dữ liệu.
>
> **TÊN NGẮN** — *Hà Nội*, không phải *Thành phố Hà Nội*; *Bắc Ninh*, không phải *Tỉnh Bắc Ninh*.
> Chuỗi này nối với *Số nhà, Phường xã* thành dòng địa chỉ in trên bản CSBH hai bên ký
> (*"Số 8 Tôn Thất Thuyết, Cầu Giấy, Hà Nội"*), nên đổi lối viết về sau là đổi câu chữ trên giấy tờ
> đã ký. Chốt một lần.
>
> **MÁY CHỦ CŨNG CHẶN, không chỉ ô chọn** — chọn trong danh sách là chốt của trình duyệt, còn đường
> API thì bộ nạp dữ liệu mẫu và mọi phép kiểm đều đi thẳng vào. Giới hạn đúng một nửa là lặp lại
> chuyện `01/09` (nút *Bàn giao* có chốt chặn mà chưa xám), chỉ ngược chiều.
>
> **Cái giá, đã nêu và khách hàng chấp nhận**: hệ thống dựng từ **dữ liệu sạch** — nạp lại bộ dữ liệu
> mẫu — nên không có lượt quy đổi nào. Với một hệ đã chạy thật thì giá trị cũ **không tự hỏng**: nó
> nằm nguyên trong cơ sở dữ liệu, và ô chọn vẫn bày nó ra kèm chữ *giá trị cũ, phải chọn lại*. Nhưng
> **lượt SỬA tiếp theo của chính khách hàng ấy bị chặn** cho tới khi người dùng chọn lại một tỉnh
> trong danh sách. Cố ý: một câu lỗi đọc được thì hơn một lượt lặng lẽ đổi địa chỉ pháp nhân.
>
> **Hồ sơ đã gửi duyệt KHÔNG đổi theo** — ảnh chụp tỉnh/thành đóng băng từ `06/09` giữ nguyên câu chữ
> lúc gửi, kể cả lối viết cũ. Viết lại nó là sửa một tờ giấy đã ký.

**HAI LỖI CỦA LƯỢT 11/09** `mới 11/09` — một ở hộp thoại, một ở phép đối chiếu.

> **1 · Nhận lời mở bản Nháp đang có thì hộp thoại phải BIẾN MẤT.** Nút đưa đúng sang bản Nháp, nhưng
> hộp thoại nằm lại đè lên trang vừa mở. Hai hồ sơ khác nhau là **cùng một địa chỉ** với phần mềm, nên
> không có gì tháo màn hình cũ ra: hộp thoại — và cả những câu *"chưa cập nhật được"*, *"đã rút"* của
> lượt bấm vừa rồi — đi theo sang hồ sơ mới như thể là của nó. Từ nay mở một hồ sơ khác là **dựng lại
> màn hình**, không phải đổi một con số trên màn hình cũ.
>
> **2 · Lượt đổi giá bán Công ty BIẾN MẤT khỏi khối *Yêu cầu cập nhật* của phiên bản mới.** Đây là lỗi
> nặng hơn hẳn một câu cảnh báo mất tích, và nó im lặng từ đầu tới cuối. Đo được, cùng khách hàng ·
> cùng mặt hàng · cùng danh mục:
>
> > bản đang hiệu lực → *giá bán Công ty 100.000 → 130.000*
> > bản mới đang soạn → *không có gì đổi*
>
> Dòng thừa kế của phiên bản mới giữ nguyên **ngày áp dụng của bản trước** (cố ý — nếu không thì mọi
> mặt hàng cũ bị âm thầm dời ngày, và cả bảng nhảy sang nhãn *Chỉnh sửa*), nên nó luôn đề một ngày
> trong quá khứ. Mà phần mềm đối chiếu hồ sơ còn sửa được theo **đúng ngày của dòng**, trong khi mọi
> lượt đổi giá đều hiệu lực **từ hôm nay** — hai luật ấy cộng lại làm phép đối chiếu thành một câu hỏi
> không bao giờ có câu trả lời.
>
> > Nó không dừng ở khối cảnh báo: nút *Tự động cập nhật* báo *không còn gì lệch*, lượt gửi duyệt chụp
> > lại đúng con số cũ, chốt chặn *"dòng đã lỗi thời"* không có gì để chặn — **bản CSBH mới đi hết mười
> > bước rồi được ký với giá đã lỗi thời**.
>
> Từ nay ngày tra danh mục của phép đối chiếu là **ngày áp dụng của dòng hoặc hôm nay, lấy ngày muộn
> hơn** (muc 7.1). Lượt **chụp** số lúc lập hồ sơ giữ nguyên luật `16/08` — khai ngày quá khứ thì vẫn
> chụp bảng giá của ngày ấy. **Ngày áp dụng** của dòng không bị đụng tới. (Nhãn trạng thái thì CÓ đổi
> kể từ `12/09` — xem mục kế dưới đây; bản chốt `11/09` nói nó cũng không đổi, và câu ấy hết đúng.)
>
> > **Đã cân và chọn phía nói ra**: cách khác là để phiên bản mới tự chụp lại giá hôm nay lúc chép
> > dòng, và khi ấy không còn gì để cảnh báo. Cái giá của nó là tỷ lệ chiết khấu đổi **âm thầm** —
> > giá Công ty 100.000 → 130.000 làm tỷ lệ nhảy 15% → 34,6% và có thể vượt ngưỡng — trong khi không
> > màn hình nào nói ra. Phần mềm nói ra, người lập quyết định.

**NĂM VIỆC CỦA LƯỢT 11/09** `mới 11/09` — bốn câu về *Yêu cầu cập nhật* và một câu về bộ dữ liệu mẫu.

> **1 · Lối tắt *Lập phiên bản mới* khi khách đã có bản Nháp.** *"Hộp thoại vẫn hiện ra nút Lập phiên
> bản mới nhưng click vào không có action"* — `0197` chặn, mà mã lỗi ấy khai `im` cho màn hình *Lập
> hồ sơ* tự xử, nên lối tắt `0191` nuốt lỗi rồi đứng yên. Từ nay hộp thoại **biết trước** và đổi hẳn
> câu hỏi: *"khách hàng này đã có một bản Nháp đang soạn dở — mở ra soạn tiếp?"*, nút đưa thẳng vào
> bản ấy. Thao tác lập **biến mất**, không nằm cạnh một lời giải thích vì sao nó không chạy.
>
> **2 · Box *Yêu cầu cập nhật* liệt kê cả hồ sơ CÒN SỬA ĐƯỢC** (*Nháp*, *Yêu cầu chỉnh sửa*). Trước
> đó chỉ có hồ sơ đã đóng băng, nên TDV không có đường nào để BIẾT bản nháp của mình đã lệch — đúng
> lúc `10/09` vừa cho họ một cái nút để sửa chuyện ấy. Ba trạng thái kết thúc vẫn đứng ngoài: không
> ai làm gì được nữa.
>
> **3 · Mặt hàng đã VÔ HIỆU HOÁ thì nút *Tự động cập nhật* rút luôn nó khỏi CSBH.** Trước đó nó nằm
> lại mãi trong nhóm *"chưa cập nhật được"*, và người dùng phải tự đi tìm nút *Xoá* trên đúng hàng ấy.
> Dòng thừa kế vẫn **nằm lại với nhãn *Đã xoá*** (`04/09`) để người duyệt thấy được.
>
> > **LƯỢT GỬI DUYỆT KHÔNG tự rút**, và đó là ranh giới: ở đó hồ sơ rời tay người lập, nên một mặt
> > hàng biến mất khỏi văn bản ở đúng khoảnh khắc ấy thì không ai kịp thấy. Phần mềm vẫn dừng lại và
> > nêu đích danh. **Cũng CHỈ mặt hàng vô hiệu hoá** — sản phẩm biến mất khỏi danh mục và sản phẩm
> > chưa khai giá tại ngày áp dụng có việc phải làm khác hẳn.
>
> **4 · CSBH ĐANG CÓ HIỆU LỰC thì mọi dòng mang trạng thái *Đang áp dụng*.** *Bổ sung* và *Chỉnh sửa*
> trả lời câu hỏi của người ĐANG SOẠN — *"so với bản đang chạy, tôi vừa đổi gì?"*; hồ sơ duyệt xong
> thì bản trước đã vô hiệu toàn bộ và không còn gì để so. Cột *Tỷ lệ CK cũ* tắt theo: để nó còn số là
> đánh dấu đúng những dòng vốn là *Chỉnh sửa*, tức dựng lại bằng một cột số cái phân biệt vừa bỏ đi.
>
> > **CHƯA ÁP CHO *Hết hiệu lực***, đã nêu để hỏi lại: hệ quả là cùng một hồ sơ đổi nhãn vào lúc nó
> > bị một phiên bản mới thay thế.
>
> **5 · Bộ dữ liệu mẫu bớt hồ sơ cần cập nhật**, vẫn giữ đủ ba loại thay đổi. Đo được: **95 → 37 hồ
> sơ**, với cả ba nhãn *Giá* · *QĐ chiết khấu* · *Sản phẩm* đều còn.

**Thứ tự mục trên thanh bên** `sửa 31/08` — **hai thứ tự, tuỳ vai trò**.

> **Năm vai trò trong luồng** (TDV · Trưởng bộ phận · Kế toán · Sale Admin · Ban lãnh đạo) — sáu mục,
> chốt 29/08 và **không đổi**:
>
> > Tổng quan · Khách hàng · Hồ sơ CSBH · Sản phẩm · Chiết khấu · Thống kê
>
> Theo **trình tự công việc**, không theo tần suất dùng: có khách trước rồi mới có hồ sơ; Sản phẩm và
> Chiết khấu là cụm phải TRA khi lập và khi duyệt; Thống kê là việc cuối kỳ. (Hai chỗ đổi so với bản
> trước 29/08: *Khách hàng* lên trước *Hồ sơ CSBH*, và *Thống kê* xuống cuối nhóm.)
>
> **Quản trị hệ thống** `sửa 31/08` — tám mục, ba mục riêng của họ thôi dồn ở cuối:
>
> > Tổng quan · **Người dùng** · Khách hàng · Sản phẩm · Chiết khấu · **Văn bản mẫu** · Thống kê ·
> > **Nhật ký**
>
> Họ không có *Hồ sơ CSBH* — Quản trị đứng ngoài luồng duyệt (chốt 27/08).
>
> Hai thứ tự này đến từ **MỘT danh sách duy nhất**, không phải hai bảng. Ba mục riêng của Quản trị chỉ
> mình họ thấy, nên xê dịch chúng không chạm tới ai khác — chen chúng vào đúng chỗ giữa những mục
> chung là một danh sách cho ra cả hai. Cách này còn dùng được chừng nào yêu cầu chỉ đụng tới vị trí
> của mục RIÊNG; đòi đổi thứ tự tương đối của hai mục CHUNG theo vai trò thì phải đổi cấu trúc.

**Tên pháp nhân đổi thành *Công ty TNHH Dược phẩm Nutricare*** `mới 29/08` — thay cho *Công Ty Cổ
Phần Dinh Dưỡng Nutricare* ở mọi chỗ phần mềm in ra tên Công ty: bốn tệp mẫu `.docx` và màn hình đăng
nhập.

> **Địa chỉ và mã số thuế GIỮ NGUYÊN** — chỉ tên pháp nhân đổi.
>
> **Tờ đã ký không đổi theo, và đó là đúng.** Mẫu văn bản đóng băng vào hồ sơ lúc gửi duyệt, nên mọi
> hồ sơ đã duyệt vẫn in đúng cái tên có hiệu lực lúc nó được ký. Không có đường nào sửa ngược, và
> cũng không nên có.
>
> **Hệ đang chạy phải tự tải bốn mẫu mới lên** — đổi mã nguồn không đụng tới mẫu đã nằm trong CSDL.
> Và vì tên mẫu không được trùng (`28/08`), bản mới **phải mang tên khác** bản cũ; cách làm là tải
> lên với tên có gắn mốc thời gian rồi vô hiệu hoá bản cũ.

**Hồ sơ pháp lý của khách hàng: ai xem được khách thì xem được tệp** `mới 28/08` — Trưởng bộ phận,
Kế toán, Sale Admin (khi đã được giao một hồ sơ của khách ấy), Ban lãnh đạo và Quản trị hệ thống đều
**xem và tải** được giấy phép kinh doanh, chứng chỉ hành nghề…

> **Thêm và gỡ thì KHÔNG đổi**: vẫn chỉ Trình dược viên phụ trách khách hàng ấy. Giấy tờ pháp lý là
> thứ TDV xin của khách và mang về; ba vai trò kia không cầm bản gốc bao giờ.
>
> Trước lượt này khối *Hồ sơ pháp lý* hiện với mọi vai trò nhưng chỉ TDV phụ trách mở được tệp —
> Trưởng bộ phận duyệt một hồ sơ mà không đọc được giấy phép kinh doanh của chính khách hàng ấy.

**Sale Admin chỉ nhận thư và thông báo khi đó là VIỆC CỦA HỌ** `mới 27/08` — mọi thư CSBH gửi Sale
Admin *vì họ có tên trên hồ sơ* đều bỏ đi.

> Bỏ: thư **"để biết"** ở mọi bước, và thư báo CSBH **hết hiệu lực** (cả hai đường — có phiên bản mới,
> và khách hàng ngừng hợp tác), kể cả khi người lập **xoá** một hồ sơ đã đi qua tay họ.
>
> Giữ: ba bước **sinh ra việc** cho Sale Admin — *Kế toán tiếp nhận lần 1*, *Kế toán yêu cầu in lại*,
> *Kế toán tiếp nhận lần 2* — cộng thư **nhắc sắp quá hạn** và **quá hạn** khi hồ sơ đang nằm ở bước
> của họ.
>
> Vì sao luật này đúng với Sale Admin mà không đúng với ba vai trò kia: họ **rời hẳn luồng** sau khi
> bàn giao bản cứng. TDV luôn là người chịu trách nhiệm hồ sơ; TBP và Kế toán còn có thể nhận lại nó
> ở vòng sau. Sale Admin thì không, trừ đúng một đường là Kế toán bắt in lại — và đường ấy đã có thư
> riêng.

**Nhãn *Công nợ*** `sửa 27/08` — mọi màn hình gọi trường này là **Công nợ**, không phải *Điều khoản
thanh toán*. Nội dung vẫn là điều khoản (chốt cùng ngày, ở trên); đổi là đổi **tên gọi**, về đúng chữ
người dùng vẫn dùng. Bốn màn hình và cả bốn văn bản mẫu.

**Thao tác trong bảng hiện khi rê chuột** `mới 27/08` — cột *Thao tác* thôi có tiêu đề nhìn thấy
được, và các nút chỉ hiện khi con trỏ đi vào dòng. Áp dụng cho **cả bảy bảng** có cột thao tác: sản
phẩm · nhóm sản phẩm · quy định chiết khấu · văn bản mẫu · người dùng · thư hỏng · dòng sản phẩm
trong hồ sơ.

> Nút vẫn hiện đầy đủ với người dùng **bàn phím** (khi tiêu điểm đi vào dòng) và trên **màn hình cảm
> ứng** (nơi không có thao tác rê chuột nào). Tên cột vẫn còn nguyên với trình đọc màn hình.

> Trước đó hai lần sửa trong một ngày ĐÈ lên nhau: con số cũ biến mất, và không ai biết trong ngày ấy
> đã có mấy lần đổi. Cái giá của việc giữ đủ nằm ở lược đồ — phải có một khoá phân xử tăng dần, nếu
> không thì hai dòng cùng ngày bằng nhau và giá hiện hành đổi theo thứ tự đọc đĩa.

**Sản phẩm phải có giá ngay từ lúc tạo** `mới 26/08` — Giá bán Công ty là trường **bắt buộc** của
biểu mẫu tạo sản phẩm, và của cả cột trong file Excel. Không còn nút *Giá* riêng: giá sửa ngay ở
biểu mẫu *Sửa*, và **mọi lượt sửa đều đòi gõ lại mã vật tư** để xác nhận. **Ngày áp dụng luôn là
ngày hôm nay** — màn hình bỏ hẳn ô chọn ngày.

> Trước đó giá là một bước riêng sau khi tạo, và sản phẩm sinh ra ở trạng thái **không dùng được**:
> nó hiện trong ô chọn lúc lập hồ sơ rồi chặn ở *"chưa có giá"* đúng lúc Trình dược viên đã gõ xong
> dòng — một trạng thái nửa vời mà chỉ Quản trị chữa được.
>
> **Vì sao mọi lượt sửa đều phải gõ lại mã**: luật cũ (`0036`) chỉ đòi ở lượt vô hiệu hoá, với lý do
> rằng bắt gõ cho một thao tác hằng ngày sẽ làm mòn chính chốt chặn ấy. Lý do đó đúng khi màn hình
> sửa chỉ đổi được TÊN. Giờ nó đổi được cả GIÁ — con số đóng băng vào mọi hồ sơ gửi duyệt kể từ lúc
> ấy — nên không còn thao tác nhẹ nào ở đây để mà làm mòn.
>
> **Bỏ ô chọn ngày cũng bịt một lỗ**: đặt giá cho một ngày tương lai thì lượt rà *Yêu cầu cập nhật*
> chạy NGAY lúc gọi, lúc giá mới chưa hiệu lực — nên nó không thấy chênh lệch nào, và không có gì
> chạy lại vào ngày hiệu lực. Từ nay giao diện không với tới tình huống đó.

**Bảng sản phẩm hiện Giá bán Công ty cho mọi vai trò** `mới 26/08`, và **trạng thái có màu** — xanh
là đang áp dụng, đỏ là đã vô hiệu hoá.

**Ngừng bán hàng loạt qua file Excel** `mới 26/08` — cột *đang có hiệu lực* thôi chỉ-để-xem. Nó là
một **ô chọn** hai giá trị *Đang bán* / *Ngừng bán*, và có **hai đường** dẫn tới ngừng bán: đổi ô ấy,
hoặc **bỏ hẳn dòng khỏi file**. Đổi ô về *Đang bán* thì bán lại. Ô để trống là **lỗi**, không phải
ngừng bán.

> **Bảng xem trước tách hai đường thành hai khối riêng**, và đó là điều kiện để đường thứ hai an
> toàn. Ô chọn là một câu khẳng định; còn một dòng biến mất có thể vì người dùng lọc rồi chép phần
> đang hiện, sắp xếp rồi xoá nhầm, hay dán đè một vùng ngắn hơn — ba tai nạn trông y hệt một quyết
> định. Khối *vắng mặt trong file* vì thế **liệt kê đủ**, không gấp lại.
>
> **Ô trống phải là lỗi** vì một lý do rất cụ thể: dòng sản phẩm MỚI mà người dùng gõ thêm vào cuối
> file luôn có ô ấy trống. Hiểu ô trống là ngừng bán nghĩa là mọi sản phẩm vừa thêm đều chết ngay
> lúc sinh ra.
>
> Cái mất: chốt **gõ lại mã vật tư** của màn hình không còn phủ đường này — nó canh từng sản phẩm
> một, còn ở đây chỉ có một chuỗi xác nhận cho cả lô.

**Nhập danh mục từ Excel là GHI ĐÈ, và phải xem trước** `mới 26/08` — file nhập mang **5 cột** (mã
vật tư · tên · mã nhóm · giá bán Công ty · đang có hiệu lực) và phải chứa **đủ mọi sản phẩm đang
có**. Mã đã có thì cập nhật, mã mới thì thêm. Phần mềm kiểm theo thứ tự — đủ cột · đọc được ô ·
đủ ô bắt buộc · mã nhóm đã tồn tại · không trùng trong file · không thiếu sản phẩm nào — rồi hiện
**bảng thay đổi** để người dùng duyệt; chỉ khi họ **gõ lại chuỗi xác nhận** thì mới ghi, trong một
lượt.

> **Hai điều KHÔNG làm được qua đường nhập:**
>
> - **Xoá sản phẩm.** Danh mục không có đường xoá nào, ở bất kỳ màn hình nào.
> - **Xoá giá** — ô giá để trống nghĩa là *giữ nguyên*, không phải *đặt về rỗng*. Giá là chuỗi lịch
>   sử mà hồ sơ đã đóng băng tra ngược lại.
> - **Đổi ngày áp dụng của giá** — luôn là ngày nhập, đặt ở máy chủ. Một cột ngày cho phép khai một
>   ngày trong quá khứ, tức là sửa lịch sử.
>
> **Trùng tên chỉ chặn phần MỚI phát sinh.** Danh mục không cấm trùng tên, và danh mục thật có trùng
> tên — cùng một mặt hàng ở hai quy cách. Chặn cứng cộng với luật *"file phải đủ"* nghĩa là một danh
> mục lỡ có hai sản phẩm cùng tên thì không bao giờ nhập lại được.
>
> **Đặt lại giá trong cùng một ngày thì đè**, ở cả đường nhập lẫn màn hình *Đặt giá*. Trước đó lượt
> thứ hai bị từ chối, nên gõ nhầm một số 0 lúc sáng thì cả ngày hôm ấy không sửa lại được.

**Tên miền nhận thư khai lúc chạy, nhiều miền** `mới 25/08` — người vận hành khai danh sách tên
miền được phép **nhận** thư nghiệp vụ; nhiều miền thì ngăn bằng dấu phẩy, và **miền con tự động
được chấp nhận** (khai `nutricare.vn` thì `tdv@hn.nutricare.vn` cũng nhận được). Địa chỉ ngoài mọi
miền đã khai bị loại khỏi danh sách người nhận. Đổi danh sách chỉ cần sửa cấu hình rồi dựng lại,
không phải ra bản mới.

> **Ở máy chủ thật, khai danh sách này là BẮT BUỘC.** Trước đó bỏ trống nghĩa là "gửi cho tất cả",
> mà bỏ trống chính là giá trị của một cấu hình không ai đặt — nên chốt chặn ấy chỉ tồn tại ở nơi
> có người nhớ bật. Nó chặn một địa chỉ cá nhân gõ nhầm vào hồ sơ tài khoản rồi nhận toàn bộ thông
> báo nghiệp vụ: công nợ, giá thu về, tên khách hàng.

**Không tạo được tài khoản với email ngoài danh sách ấy** `mới 26/08` — Quản trị hệ thống nhập một
địa chỉ không thuộc tên miền nào đã khai thì phần mềm **từ chối ngay tại ô nhập**, kể ra các tên
miền đang được phép, và **không tạo tài khoản nào**. Lệnh mồi tài khoản quản trị đầu tiên trên máy
chủ mới cũng từ chối theo cùng luật ấy.

> Trước đó tài khoản vẫn được tạo, chỉ có lá thư mời là hỏng — và hỏng ở một chỗ cố tình nuốt lỗi,
> vì lúc ấy tài khoản đã ghi vào CSDL rồi. Kết quả là một tài khoản có thật, chiếm mất tên đăng nhập
> và địa chỉ, mà **không bao giờ đăng nhập được**: thư mời là đường duy nhất để nó có mật khẩu, nên
> bấm *Gửi lại thư mời* bao nhiêu lần cũng hỏng lại đúng như vậy. Đây là chuyện đã xảy ra ở lượt cài
> thật: danh sách khai `nutricare.vn`, tài khoản mở bằng `@nutricare.com.vn` — **hai tên miền khác
> nhau, `com.vn` không phải miền con của `vn`** — và ba tài khoản dựng ra đều chết.
>
> Cần mở tài khoản cho một địa chỉ ngoài tên miền công ty thì phải **khai thêm tên miền ấy** vào
> danh sách nhận thư. Cố ý không có đường vòng riêng cho việc tạo tài khoản: một tài khoản không
> nhận được thư của hệ thống là một tài khoản không dùng được, nên hai câu hỏi ấy chỉ có một câu
> trả lời.

**Đủ trường mới gửi duyệt được** `mới 24/08` — trước khi hồ sơ rời trạng thái *Nháp*, phần mềm kiểm
các trường sẽ in ra bản CSBH. Thiếu thì **chặn gửi**, và báo rõ thiếu mục nào cùng chỗ phải đi sửa.
Ba trường bị chặn: **Mã số thuế** · **Chức danh người đại diện** (cả hai ở hồ sơ khách hàng) và
**Thời gian áp dụng** (ở hồ sơ) — `sửa 01/09`: **còn hai**, xem mục ngay dưới; `sửa 07/09`: **còn
một**, vì *Thời gian áp dụng* thôi tồn tại ở cấp hồ sơ. Kèm theo, *Thời gian áp dụng* nay **mặc định
là hôm nay** ngay ở máy chủ — trước đó chỉ màn hình *Lập hồ sơ* điền sẵn, nên hồ sơ tạo qua đường
khác chạy hết vòng duyệt với ô ấy để trống trên bản A4. Luật mặc-định-ở-máy-chủ **đi theo** khi ngày
chuyển xuống dòng sản phẩm `07/09`.

> **Bảy trường KHÔNG bị chặn**, vì chúng chưa tồn tại lúc gửi: *Ngày TBP ký* · *Khối chữ ký số* (B3),
> *Kế toán* · *Ngày KT nhận lần 1* (B4), *Sale Admin* (B6), *Ngày KT nhận lần 2* · *Ngày hiệu lực*
> (B10). Đọc yêu cầu theo nghĩa đen — *"đủ tất cả các trường trong bảng hướng dẫn ánh xạ"* — thì
> không hồ sơ nào gửi duyệt được. Bảy trường ấy **vẫn ở lại** danh mục ánh xạ: chúng là khối phê
> duyệt của tờ CSBH, và gỡ đi thì bản đã duyệt in ra không còn chỗ nào nói ai duyệt và duyệt lúc nào.

**Màn hình soạn mẫu nói rõ mục nào bắt buộc** `mới 24/08` — bảng hướng dẫn ánh xạ gắn dấu *bắt buộc*
vào đúng những mục muc 11.1 đòi, và chỉ ở thẻ **mẫu hồ sơ**; mẫu hợp đồng không có mục nào bắt buộc.
Khi lưu bị chặn, thông báo **kể tên từng mục còn thiếu** thay vì chỉ nói *"còn thiếu mục bắt buộc"*.

**Bỏ bản lưu ký số** `mới 24/08` — phần mềm KHÔNG còn sinh và giữ một file PDF riêng cho lượt ký của
Trưởng bộ phận. Đường `POST /policies/:id/sign-file` gỡ hẳn, cùng hai mục đích file `BAN_CSBH` và
`BAN_DA_KY`. Bước **ký trong luồng duyệt không đổi**: TBP vẫn ký, `tbp_signed_at` vẫn là mốc thật,
và bản mềm vẫn in khối *TBP đã ký số* kèm ngày ký.

> **Vì sao bỏ được.** Bản lưu sinh ra để trả lời *"văn bản lúc ký nói gì"* — bằng cách giữ lại một
> object PDF và so nó với bản chưa ký. Từ `0101` chính hồ sơ đã giữ ảnh chụp tám trường khách hàng,
> người đề nghị và tên TBP đã ký, nên câu ấy trả lời được từ dữ liệu, rẻ hơn và nói nhiều hơn một
> tờ giấy đông cứng. Đo trước khi bỏ: **197** hồ sơ đã qua bước TBP ký, **3** file `BAN_DA_KY` trong
> kho — cả ba do bộ test sinh ra, không lượt nào của người dùng thật. Đường ấy chưa từng có ai gọi.

**Mẫu bản mềm thôi bắt buộc có *trạng thái* và *thời gian duyệt*** `mới 24/08` — hai mục ấy rời khỏi
danh sách ép lúc lưu mẫu; *ngày KT nhận lần 1* vốn chưa bao giờ bị ép. Lý do không phải nới lỏng cho
dễ soạn: chúng là hai mục **còn đang đổi** trong lúc hồ sơ đi qua luồng duyệt, nên một bản mềm dựng
lúc Trưởng bộ phận ký buộc phải in ra *Chờ kế toán duyệt lần 1* và một ô *thời gian duyệt* rỗng — ép
có mặt là ép in một câu sai ở mọi hồ sơ chưa tới B10. Hai trường **vẫn đặt ô được**, hệ thống chỉ
thôi ép, và ba mẫu bàn giao kèm phần mềm vẫn in cả hai. Chi tiết ở mục 6.4.

> **Mười ba mục của mục 11.1 là yêu cầu của bảng CSBH XEM**, tức MÀN HÌNH chi tiết hồ sơ — nó vẫn
> đủ cả mười ba. Đem nguyên yêu cầu ấy áp sang **mẫu do Quản trị vẽ** là chỗ `20/08` đọc quá lời. Cộng bốn mục nay tự chịu trách nhiệm, phép kiểm lúc lưu mẫu còn **9 trên 13** — và còn **7 trên 13** từ `01/09`.

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
cùng**, kể cả *Hết hiệu lực*; chỉ hồ sơ *Đã xoá* đứng ngoài. (Lúc chốt luật này còn *Từ chối*,
và nó cũng sang tay cùng — trạng thái ấy bỏ ở `29/08`.)

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

**Trạng thái** — dùng bộ đã hợp nhất · ~~Từ chối là trạng thái kết thúc · không cho xóa hồ sơ bị từ
chối~~ (`bỏ 29/08` — xem mục *"BỎ HẲN trạng thái Từ chối"*) · “Quá hạn duyệt” là trạng thái riêng ·
đổi tên “Đang áp dụng” thành “Đang có hiệu lực”.

**Hiệu lực** — có hiệu lực ngay khi kế toán duyệt lần 2 · mọi CSBH vô thời hạn · không có nghiệp vụ
thu hồi · ~~phiên bản mới phải chứa lại toàn bộ sản phẩm cũ~~ (`sửa 08/09` — xem mục *"RÚT MỘT MẶT
HÀNG khỏi phiên bản mới"*).

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
