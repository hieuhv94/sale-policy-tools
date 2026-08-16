# Hướng dẫn sử dụng — phần mềm Chính sách bán hàng

Dành cho người dùng cuối. Viết theo **việc bạn cần làm**, không theo màn hình.

---

## 1. Đăng nhập

Mở địa chỉ phần mềm, nhập tên đăng nhập (hoặc email) và mật khẩu.

- **Tài khoản mới**: bạn nhận một thư mời kèm liên kết kích hoạt. Bấm vào đó và **tự đặt mật khẩu**.
  Không ai — kể cả Quản trị hệ thống — đưa cho bạn một mật khẩu sẵn, vì hệ thống không tạo ra cái
  nào. Trước khi đi qua liên kết, tài khoản chưa đăng nhập được.
  Liên kết sống **72 giờ**; quá hạn thì đề nghị Quản trị hệ thống gửi lại. Mỗi lần gửi lại làm
  **liên kết cũ chết ngay** — luôn dùng thư mới nhất.
- Sai mật khẩu **5 lần** thì tài khoản bị khoá tạm; liên hệ Quản trị hệ thống.

### Quên mật khẩu

Bấm **Quên mật khẩu?** ngay dưới nút Đăng nhập, nhập tên tài khoản hoặc email. Hệ thống gửi liên kết
đặt lại tới **email khai trong hệ thống** của tài khoản đó — không phải địa chỉ bạn vừa gõ, nếu hai
cái khác nhau.

- Liên kết đặt lại sống **2 giờ**, ngắn hơn thư mời: bạn đang ngồi trước máy, còn một liên kết sống
  lâu là một liên kết nằm lại trong hộp thư.
- Đặt lại xong, **mọi phiên đang mở đều bị đăng xuất** — kể cả phiên của người khác nếu mật khẩu cũ
  đã bị lộ.
- Màn hình luôn hiện *"Đã gửi, nếu tài khoản tồn tại"* dù tài khoản có thật hay không. Đó là chủ ý:
  nói khác đi là để người ngoài dò được danh sách tài khoản của công ty.
- Nhận được thư đặt lại mà **không phải bạn yêu cầu** thì cứ bỏ qua — mật khẩu hiện tại giữ nguyên.
  Nhận nhiều lần thì báo Quản trị hệ thống.
- Đang làm dở mà hết phiên: hệ thống hiện ô đăng nhập lại **đè lên màn hình cũ**. Đăng nhập xong,
  mọi thứ bạn đang nhập vẫn còn nguyên — không phải làm lại.

## 2. Sáu vai trò, ai làm gì

| Vai trò | Việc trong luồng |
|---|---|
| **Trình dược viên (TDV)** | Lập khách hàng · lập hồ sơ CSBH · gửi duyệt · sửa khi bị trả lại |
| **Trưởng bộ phận (TBP)** | Ký số duyệt · trả lại để chỉnh sửa · từ chối hồ sơ |
| **Kế toán** | Tiếp nhận lần 1 · **xuất hợp đồng** · tiếp nhận lần 2 · yêu cầu in lại |
| **Sale Admin** | Bàn giao hồ sơ · quản lý mẫu hợp đồng |
| **Ban lãnh đạo** | **Chỉ xem** — báo cáo, hồ sơ, nhật ký. Không có nút ghi ở bất kỳ đâu |
| **Quản trị hệ thống** | Danh mục sản phẩm, giá, người dùng. **Không** tham gia duyệt hồ sơ |

Bạn chỉ nhìn thấy dữ liệu **trong phạm vi của mình**: TDV thấy khách hàng mình phụ trách, Kế toán
thấy của các TDV thuộc mình, Sale Admin thấy toàn bộ nhánh bên dưới.

## 3. Bố cục màn hình

**Thanh bên trái** là toàn bộ điều hướng. Bạn chỉ thấy những mục thuộc vai trò của mình — Ban lãnh
đạo không có mục nào dẫn tới nút ghi, Quản trị hệ thống không có mục nào của luồng duyệt. Mục đang
mở được tô nền xanh.

**Thanh trên cùng** có ba thứ, từ phải sang: nút **Đăng xuất**, tên và vai trò của bạn, và nút đổi
**giao diện sáng / tối**.

### Ô bắt buộc và ô tuỳ chọn

Mọi biểu mẫu nhập liệu đều đánh dấu ô phải điền bằng **dấu sao đỏ** ngay sau nhãn, và có một dòng
nhắc *"Trường có dấu \* là bắt buộc"* ở đầu biểu mẫu. Ô không có dấu sao thì bỏ trống được.

**Chưa điền đủ ô bắt buộc thì nút Lưu / Tạo mờ đi và không bấm được.** Bạn không phải bấm thử rồi
đọc thông báo lỗi để biết mình còn thiếu gì.

Chú ý riêng với **ô ngày**: nó thường có sẵn ngày hôm nay, nhìn như đã điền. Nếu bạn xoá trắng nó
thì ô đó thành trống và nút Lưu tắt — gõ lại ngày là bấm được.

### Giao diện sáng và tối

Nút hình mặt trăng (hoặc mặt trời) ở thanh trên cùng, và ở góc trên bên phải màn hình đăng nhập.

- **Chưa bấm lần nào** thì phần mềm **đi theo cài đặt của máy bạn**. Máy để chế độ tối — kể cả loại
  tự chuyển tối vào buổi tối — thì phần mềm tối theo, không cần làm gì.
- **Bấm một lần** là bạn chọn tay, và lựa chọn đó **thắng cài đặt của máy** theo cả hai chiều. Nó
  được nhớ trên chính máy này cho những lần sau.

Lựa chọn giao diện là **của riêng từng máy**, không đi theo tài khoản: cùng một người đăng nhập ở
máy bàn và ở điện thoại có thể để hai giao diện khác nhau.

## 4. Trang tổng quan

Màn hình đầu tiên sau khi đăng nhập. **Nội dung khác nhau theo vai trò** — bạn chỉ thấy những con
số thuộc phần việc của mình.

### Dải thẻ trạng thái

Hàng thẻ trên cùng đếm hồ sơ theo trạng thái. **Bấm vào một thẻ** là mở danh sách hồ sơ đã lọc sẵn
theo đúng trạng thái đó.

| Vai trò | Thẻ bạn thấy |
|---|---|
| **Trình dược viên** | Đang chờ duyệt · Nháp · Yêu cầu chỉnh sửa · Đang có hiệu lực · Từ chối |
| **Trưởng bộ phận** | Chờ TBP duyệt · Quá hạn duyệt · TBP đã ký số · Đang có hiệu lực · Từ chối |
| **Kế toán** | Chờ Kế toán L1 · Chờ Kế toán L2 · Quá hạn duyệt · Đang có hiệu lực |
| **Sale Admin** | Sale Admin đang xử lý · Quá hạn duyệt · Đang có hiệu lực · Từ chối |
| **Ban lãnh đạo** | **Cả 11 trạng thái** |
| **Quản trị hệ thống** | Không có — xem giải thích bên dưới |

Cố ý **không** bày cho bạn trạng thái là bước của người khác: một Trình dược viên nhìn ô "Chờ Kế
toán L2: 7" thì không làm được gì với con số ấy.

### Việc của tôi

Ngay dưới dải thẻ là hồ sơ **đang chờ chính bạn** xử lý, sắp theo hạn gần nhất trước. Hồ sơ **quá
hạn** có vạch đỏ bên trái. Không thấy hồ sơ nào nghĩa là bạn không còn việc — không phải hệ thống lỗi.

Riêng **Kế toán** thấy hai danh sách tách rời: *Tiếp nhận lần 1* và *Tiếp nhận lần 2*.

### Từng vai trò còn thấy gì thêm

- **Trưởng bộ phận và Kế toán** — tỷ lệ trả lại, số ngày chờ trung bình, số hồ sơ đến hạn hôm nay.
- **Sale Admin** — cảnh báo đỏ khi **chưa có mẫu hợp đồng nào đang áp dụng** (lúc đó Kế toán không
  xuất được hợp đồng, và chỉ bạn sửa được), cùng bảng hồ sơ theo từng trình dược viên.
- **Ban lãnh đạo** — sức khoẻ luồng duyệt, hồ sơ đang tắc ở bước nào, top 5 trình dược viên, và
  hoạt động gần đây. Không có nút ghi nào.
- **Quản trị hệ thống** — thư hỏng chưa xử lý, số người dùng, số tài khoản chưa kích hoạt hoặc đang
  bị khoá, số sản phẩm đang áp dụng, hoạt động hôm nay và nhật ký gần đây.

> **Ban lãnh đạo và Quản trị hệ thống không có hồ sơ nào ở trang này** — cả hai đều đứng ngoài luồng
> duyệt. Riêng Quản trị còn không có con số hồ sơ nào, vì hồ sơ không thuộc phạm vi dữ liệu của vai
> trò đó. Màn hình sẽ nói rõ điều này thay vì để trống.

Dòng *"Số liệu tính lúc HH:MM"* dưới tiêu đề là mốc đọc số. Các con số đến từ bảng tổng hợp, có thể
trễ vài giây so với thực tế; riêng danh sách *Việc của tôi* thì luôn đọc thẳng dữ liệu gốc.

## 5. Lập khách hàng (TDV)

*Khách hàng* → điền mã, tên, loại khách hàng, địa chỉ đăng ký, người đại diện.

- **Mã khách hàng không sửa được sau khi lưu.** Sửa được nó là mọi hồ sơ CSBH cũ lặng lẽ trỏ sang
  một khách hàng khác. Nhập nhầm thì lập khách hàng mới.
- Trùng mã số thuế / CCCD với khách khác: hệ thống **vẫn lưu**, chỉ cảnh báo. Một chủ hộ mở nhiều
  điểm bán là chuyện có thật.
- **Loại khách hàng thì sửa được** — xem ngay dưới đây.

Loại khách hàng hiện ở **cả hai chỗ**: cạnh mã trên từng thẻ ở danh sách, và trong khối thông tin ở
màn hình chi tiết. Nó quyết định ngưỡng chiết khấu, nên người lập hồ sơ cần thấy nó trước khi mở
khách hàng ra.

**Sửa khách hàng** — nút *Sửa* ở màn hình chi tiết. Kế toán, Sale Admin và Quản trị cũng sửa được,
không riêng Trình dược viên.

> **Ba ô Tỉnh/thành · Bệnh viện–điểm bán · Kênh bán đã bỏ.** Ngưỡng chiết khấu chỉ phụ thuộc nhóm sản
> phẩm và loại khách hàng, nên ba ô ấy không còn ảnh hưởng tới bất kỳ con số nào. Dữ liệu đã nhập của
> chúng không còn nữa; muốn lọc theo địa bàn thì dùng ô **Địa chỉ đăng ký**.

### Đổi loại khách hàng

Ô *Loại khách hàng* nằm ngay trong hộp thoại *Sửa*. Chọn loại khác thì một khối vàng hiện ra nói rõ
hệ quả — nó chỉ hiện khi bạn thật sự đổi giá trị.

| Hồ sơ | Sau khi đổi loại |
|---|---|
| Đã lập, bất kể trạng thái nào — kể cả **Nháp** và **Yêu cầu chỉnh sửa** | **Giữ nguyên** ngưỡng đã chụp lúc lập |
| Lập **từ đây về sau** | Dùng ngưỡng của loại mới |

Muốn một hồ sơ đang sửa dùng ngưỡng mới: mở hồ sơ ra, bấm **Sửa** ở từng dòng sản phẩm rồi lưu lại.
Đó là đường duy nhất — hệ thống **không** tự tính lại, và đó là cố ý: một con số trong hồ sơ đang mở
mà tự đổi dưới tay người đang xem, không do thao tác nào của họ, là thứ khó tin hơn hẳn.

Hồ sơ đã gửi duyệt thì khoá sửa, nên không có đường nào làm nó đổi số.

**Đổi trình dược viên phụ trách** — nút riêng, chỉ Sale Admin và Quản trị. Đây không phải đổi một
cái tên: **phạm vi nhìn thấy đổi theo**. Người cũ thôi thấy khách hàng này và mọi hồ sơ của họ,
người mới thấy ngay.

## 6. Lập hồ sơ CSBH (TDV)

*Hồ sơ CSBH* → **Lập hồ sơ** → chọn khách hàng → thêm từng dòng sản phẩm.

Hồ sơ tạo ra ở trạng thái **Nháp** ngay sau khi chọn khách hàng, rồi bạn thêm dòng sản phẩm trên
màn hình chi tiết. Mỗi lần thêm một dòng, hệ thống tính và hiện ngay **giá thu về** và **tỷ lệ chiết
khấu** của dòng đó — không phải nhập hết rồi mới biết.

Với mỗi dòng bạn nhập **Giá bán buôn** và các khoản **CPBH**. Hệ thống tự tính:

> **Giá thu về** = Giá bán buôn − (tổng các khoản CPBH)
> **Tỷ lệ chiết khấu** = 1 − Giá thu về / Giá bán Công ty

**Số khoản CPBH tuỳ từng dòng.** Biểu mẫu mở sẵn một ô; bấm *+ Thêm khoản chi phí* để có thêm, bấm
*Bớt* để bỏ ô thừa. Không phải mọi sản phẩm đều có bốn khoản, và gõ số 0 vào những ô không dùng chỉ
làm bản in dài thêm mấy cột số 0.

Trên bản in, số cột CPBH lấy theo **dòng nhiều khoản nhất**; dòng ít khoản hơn để **ô trống** — ô
trống nghĩa là dòng ấy không có khoản đó, khác với số 0 nghĩa là khoản đó bằng không.

**Sửa một dòng đã thêm**: bấm *Sửa* ở cột Thao tác. Đổi được giá bán buôn và các khoản chi phí.
**Sản phẩm thì không đổi được** — muốn đổi sản phẩm thì xoá dòng rồi thêm dòng mới, vì đó là hai
việc khác nhau.

**Giá bán Công ty** và **ngưỡng chiết khấu** lấy từ danh mục, bạn không nhập được — và chúng được
**đóng băng** vào hồ sơ ngay lúc lập. Danh mục đổi giá về sau không làm đổi hồ sơ đã lập.

### Hai màu trong bảng dòng sản phẩm

Màu nằm trên **chính con số ở cột Tỷ lệ CK**, không phủ nền cả dòng: những ô còn lại của dòng là số
bình thường và vẫn phải đọc được như số bình thường. Ngay dưới bảng có **chú thích màu** giải nghĩa
cả hai:

| Dấu hiệu | Nghĩa | Có chặn không |
|---|---|---|
| Tỷ lệ CK màu **đỏ** + dấu chấm than `!` | **Vượt ngưỡng** — tỷ lệ chiết khấu cao hơn ngưỡng cho phép | Không. Chỉ được đánh dấu để người duyệt nhìn thấy |
| Tỷ lệ CK màu **vàng** + dấu `◆` | **Chưa có quy định chiết khấu** phủ sản phẩm này với loại khách hàng của khách hàng, nên dòng **không có ngưỡng nào để đối chiếu** | Không. Báo Quản trị hệ thống nếu cần một ngưỡng cho sản phẩm này |

Dòng vừa vượt ngưỡng vừa thiếu quy định thì con số là **đỏ** — vượt ngưỡng là thứ phải xử lý trước —
nhưng dấu `◆` vẫn còn.

**Không nhớ màu nghĩa là gì thì bấm dấu `?`** ngay cạnh con số. Rê chuột cũng được; trên điện thoại
thì bấm. Nó nói đủ lý do: vượt ngưỡng bao nhiêu so với ngưỡng nào, hay không tìm thấy quy định chiết
khấu nào áp dụng.

**Bạn được báo trước, không phải sau.** Ngay khi chọn sản phẩm trong hộp thoại thêm dòng, nếu không
quy định nào khớp thì một khối vàng hiện ra kèm **đúng con số ngưỡng sẽ dùng**. Báo trước vì ngưỡng
đóng băng vào hồ sơ ngay lúc bấm Lưu; biết sau thì phải xoá dòng, nhờ Quản trị khai quy định, rồi
nhập lại từ đầu.

Sản phẩm **không có cả quy định lẫn mặc định** thì vẫn thêm dòng được. Dòng ấy đơn giản là không có
ngưỡng nào để đối chiếu: cột *Tỷ lệ CK* vẫn tính đủ, chỉ là không bao giờ bị đánh dấu vượt ngưỡng.

### Cột Ghi chú

Ô chữ tự do cho **riêng một dòng sản phẩm** — "giá theo thoả thuận tháng 8", "khách yêu cầu đóng
thùng 12". Nhập trong hộp thoại thêm hoặc sửa dòng, tối đa 500 ký tự.

- Ghi chú **in ra bản CSBH A4**, ở cột cuối của bảng dòng sản phẩm. Người duyệt và người ký đều đọc
  được nó.
- **Xoá sạch ô rồi Lưu là xoá ghi chú.** Hộp thoại sửa dòng gửi lên toàn bộ nội dung dòng, nên bỏ
  trống ô nghĩa là bạn vừa bỏ ghi chú đi.
- Ghi chú **đi theo dòng sang phiên bản mới** của hồ sơ, trừ khi chính dòng ấy được nhập lại.

### Cột QĐCK

Mã của **đúng quy định chiết khấu** đã cho ra ngưỡng của dòng đó. Ô trống nghĩa là không có quy định
nào — đúng những dòng mang dấu `◆`.

Dùng để làm gì: chép mã, sang mục **Chiết khấu**, dán vào ô tìm kiếm. Ra ngay dòng quy định đang chi
phối con số ngưỡng của dòng hồ sơ ấy. Đó là câu trả lời cho *"vì sao dòng này ngưỡng 25% mà dòng kia
30%"*.

Nếu khách hàng **đã có CSBH đang hiệu lực**, hệ thống hỏi bạn muốn **Bổ sung** (thêm sản phẩm mới)
hay **Chỉnh sửa** (đổi sản phẩm đã có). Phiên bản mới **luôn chứa lại toàn bộ sản phẩm cũ** — bạn
không cần nhập lại.

Xong thì bấm **Gửi duyệt**.

**Sửa hồ sơ** chỉ làm được khi hồ sơ ở **Nháp** hoặc **Yêu cầu chỉnh sửa**. Lúc đó bảng dòng sản
phẩm có thêm nút *Xoá dòng*, và có nút *Sửa ngày áp dụng*. Hồ sơ đã gửi đi thì không sửa được nữa —
muốn sửa phải chờ người duyệt trả lại.

**Xoá hồ sơ** — nút riêng, mở cho bốn vai trò trong luồng và Quản trị. Phải **gõ lại mã hồ sơ** để
xác nhận, vì xoá không lùi được. Hồ sơ **Từ chối không xoá được**, kể cả Quản trị hệ thống: đó là
trạng thái kết thúc và phải giữ lại dấu vết.

## 7. Luồng duyệt — 10 bước

```
TDV lập  →  Gửi duyệt  →  TBP ký số  →  Kế toán tiếp nhận L1  →  xuất hợp đồng
   →  Sale Admin bàn giao  →  Kế toán tiếp nhận L2  →  ĐANG CÓ HIỆU LỰC
```

Ở mỗi bước, người phụ trách nhận **email** kèm liên kết mở thẳng hồ sơ.

**Trả lại và từ chối**

- **Trả lại chỉnh sửa** (TBP hoặc Kế toán): hồ sơ về tay TDV, **bắt buộc nhập lý do**. Sửa xong đi
  lại từ đầu vòng duyệt.
- **Từ chối** (chỉ TBP): hồ sơ đóng vĩnh viễn. **Không ai xoá được** hồ sơ đã từ chối, kể cả Quản
  trị hệ thống.

**Hạn xử lý**: mỗi bước chờ có hạn **14 ngày**, tính cả thứ bảy và chủ nhật. Trước hạn một ngày hệ
thống gửi thư nhắc; quá hạn thì hồ sơ chuyển *Quá hạn duyệt* nhưng **vẫn đi tiếp đúng nhánh cũ**.

## 8. Hiệu lực

Ba điều dễ hiểu nhầm:

1. **Mỗi khách hàng chỉ có đúng một CSBH còn hiệu lực.**
2. **CSBH không có ngày hết hạn.** Nó chỉ hết hiệu lực khi CSBH mới của cùng khách hàng được duyệt
   xong — hai việc đó xảy ra cùng lúc, không có khoảnh khắc nào khách hàng không có chính sách.
3. Hiệu lực chuyển **đúng lúc Kế toán tiếp nhận lần 2**, không phải lúc TBP ký.

## 9. Xuất hợp đồng (Kế toán và Sale Admin)

Mở hồ sơ → **Xuất hợp đồng (PDF)**. File sinh ở máy chủ, trộn dữ liệu hồ sơ vào mẫu do Sale Admin
tải lên.

- **Không có nút In.** Muốn in thì tải PDF về rồi in — như vậy bản in ở mọi máy giống hệt nhau.
- Hệ thống **không lưu** file hợp đồng. Bấm lại là sinh lại từ dữ liệu **hiện tại** của hồ sơ. Nếu
  địa chỉ khách hàng vừa đổi thì bản mới mang địa chỉ mới — đúng theo thiết kế.
- Trưởng bộ phận **không** thấy nút này.

### Mẫu hợp đồng (Sale Admin)

*Mẫu hợp đồng* — file Word có ô trống, được trộn dữ liệu hồ sơ vào lúc Kế toán xuất hợp đồng. Ba
bước, theo đúng thứ tự:

1. **Tải mẫu lên** — file `.docx` với ô trống dạng `{{ten_o}}`. Hệ thống đọc ô trống ngay lúc tải;
   file hỏng thì mẫu đang dùng không bị ảnh hưởng.
2. **Ánh xạ trường** — mỗi ô trống trỏ tới một trường dữ liệu. Ô có tiền tố `policy.lines[].` làm
   **dòng bảng chứa nó được nhân bản theo từng dòng sản phẩm**; đây là chỗ hay chọn nhầm, và chọn
   nhầm thì hợp đồng ra thiếu dòng.
3. **Ban hành** — chỉ được khi đã ánh xạ hết. Ban hành mẫu mới **tự động hạ mẫu cũ**; luôn có nhiều
   nhất một mẫu đang áp dụng.

> **Không có mẫu nào đang áp dụng thì mọi lần Kế toán bấm *Xuất hợp đồng* đều hỏng** — và Kế toán
> không vào được mục này để sửa. Màn hình hiện cảnh báo đỏ khi rơi vào tình trạng đó.

### Tải văn bản trên màn hình hồ sơ

Mở một hồ sơ, mục **Tải văn bản**:

- **Bản CSBH (A4 dọc / A4 ngang)** — mọi vai trò xem được hồ sơ đều tải được, kể cả Ban lãnh đạo.
  Chọn khổ ngang khi hồ sơ nhiều dòng: bảng mười cột không vừa khổ dọc.
- **Xuất hợp đồng (PDF)** — chỉ Kế toán và Sale Admin.

### Tệp đính kèm

Tải lên, tải xuống và gỡ tệp của hồ sơ. Bốn vai trò trong luồng đều làm được, không riêng Trình dược
viên — bản scan có chữ ký thường do người tiếp nhận đính vào.

Mỗi tệp tối đa **20MB**. Đường tải cấp riêng cho từng người và **hết hạn sau vài phút**; hết hạn thì
mở lại hồ sơ để lấy đường mới. Gỡ tệp chỉ gỡ khỏi hồ sơ.

## 10. Tìm kiếm và bộ lọc

*Hồ sơ CSBH* → **Bộ lọc** — 11 tiêu chí, kết hợp được với nhau:

> thời gian áp dụng · thời gian duyệt · mã khách hàng · tên khách hàng · địa chỉ đăng ký ·
> mã số thuế · tên sản phẩm · người đề nghị · trạng thái · TDV phụ trách · nhóm sản phẩm

- **Địa chỉ đăng ký** chỉ tìm kiểu *"có chứa"*, và **không phân biệt dấu**: gõ `da nang` vẫn ra
  `Đà Nẵng`. Đây là cách lọc theo địa bàn duy nhất — ba tiêu chí tỉnh/thành, bệnh viện và kênh đã bỏ
  cùng ba trường tương ứng bên khách hàng.
- **Thời gian duyệt** là lúc hồ sơ **có hiệu lực** (sau bước tiếp nhận L2), không phải lúc TBP ký.
  Hồ sơ đang chờ chưa có thời gian duyệt nên không lọt vào kết quả lọc theo tiêu chí này.
- Điều kiện lọc **được giữ trong phiên làm việc**: chuyển màn hình rồi quay lại vẫn còn. Bấm
  **Xoá bộ lọc** để về danh sách đầy đủ.
- Trên điện thoại, bộ lọc nằm trong tấm trượt lên từ đáy màn hình.

## 11. Báo cáo và xuất Excel

Đầu màn hình là **bốn con số** trả lời bốn câu hỏi thường gặp nhất: tổng hồ sơ, đang chờ xử lý, quá
hạn, và tỷ lệ trả lại. Ô *Quá hạn* chuyển đỏ khi khác 0.

Bên dưới là **tiến độ hồ sơ** theo trạng thái (sắp giảm dần, kèm thanh so sánh độ dài), **tỷ lệ hồ
sơ bị trả lại** (tính cả hồ sơ bị từ chối), và **hạn xử lý (SLA)**.

**Xuất Excel** chạy nền: bấm xong bạn dùng tiếp màn hình khác, khi file sẵn sàng sẽ hiện liên kết
tải. File chứa **đúng tập đang lọc**, cột tiền là **số** nên cộng và lọc được ngay trong Excel.

File kết xuất **chỉ người bấm xuất tải được**, và hết hạn lưu sau 24 giờ.

## 12. Người dùng (Quản trị hệ thống)

*Người dùng* — hai thẻ: **Người dùng** và **Hệ thống**.

### Thứ tự bắt buộc: Trưởng bộ phận trước, Trình dược viên sau

Hồ sơ của Trình dược viên đi tới **đúng Trưởng bộ phận được gán cho người đó**. Chưa có tài khoản
Trưởng bộ phận nào thì ô chọn rỗng và **không tạo được** Trình dược viên.

1. **Tạo tài khoản Trưởng bộ phận** — không có trường nào thêm ngoài họ tên, tài khoản và thư.
2. **Tạo tài khoản Trình dược viên**, chọn *Trưởng bộ phận quản lý*. Đây là trường **bắt buộc**:
   một Trình dược viên không có người duyệt là tài khoản chết — hồ sơ họ gửi không tới ai, đứng im
   cho tới khi quá hạn.

### Trường theo vai trò

Trường có dấu <span aria-hidden="true">\*</span> là **bắt buộc**, không điền thì nút Tạo không bấm được.

| Vai trò tạo | Trường phải điền thêm |
|---|---|
| Trình dược viên | Trưởng bộ phận quản lý **\*** · Cấp trên (Kế toán) |
| Kế toán | Cấp trên (Sale Admin) |
| Trưởng bộ phận · Sale Admin · Ban lãnh đạo · Quản trị hệ thống | không có |

*Cấp trên* dựng cây **xem dữ liệu**: Sale Admin thấy hồ sơ của các Kế toán dưới mình, Kế toán thấy
của các Trình dược viên dưới mình. Khác hẳn với *Trưởng bộ phận quản lý*, thứ quyết định hồ sơ chạy
đi đâu để duyệt.

### Sửa, vô hiệu hoá, gửi lại thư mời

- **Sửa** đổi được họ tên, Trưởng bộ phận quản lý và cấp trên — đổi người giữ chức chỉ là sửa lại ô
  này ở từng Trình dược viên liên quan. **Không đổi được vai trò** — đổi vai trò làm hồ sơ
  đang dở mắc kẹt giữa luồng. Cần đổi thì vô hiệu hoá tài khoản cũ và tạo tài khoản mới.
- **Vô hiệu hoá** chặn đăng nhập trong vòng một phút, kể cả khi người đó đang mở phần mềm. Không có
  chức năng **xoá** người dùng: nhật ký kiểm toán tham chiếu tới tài khoản, xoá đi là mất dấu vết.
- **Gửi lại thư mời** chỉ hiện với tài khoản chưa kích hoạt, và làm liên kết cũ chết ngay.

### Không có mật khẩu mặc định

Tạo tài khoản **không đặt mật khẩu**. Hệ thống gửi thư mời tới địa chỉ đã khai, và **liên kết trong
thư đó là đường duy nhất** để tài khoản có mật khẩu. Trước khi người dùng đi qua liên kết, tài khoản
không đăng nhập được bằng bất cứ gì.

Nghĩa là bạn **không phải bàn giao mật khẩu** cho ai qua tin nhắn, giấy tờ hay lời nói — thứ vốn là
chỗ rò rỉ thường xuyên nhất. Đổi lại, **địa chỉ email phải đúng**: gõ nhầm thì thư mời đi vào hộp
thư của người khác, và người đó đặt được mật khẩu cho tài khoản. Đọc kỹ ô email trước khi bấm Tạo.

Liên kết hết hạn sau **72 giờ**; hết hạn thì bấm **Gửi lại thư mời**.

### Hạn xử lý và thư hỏng — thẻ *Hệ thống*

**Hạn xử lý (SLA)**: số ngày cho mỗi bước chờ. Đổi số này **tính lại hạn cho mọi hồ sơ đang chờ**,
kể cả hồ sơ nộp từ trước — rút ngắn hạn có thể làm một số hồ sơ chuyển sang *Quá hạn duyệt* ngay.

**Thư hỏng**: thư hệ thống không gửi được sau nhiều lần thử. Người phụ trách ở bước đó **không nhận
được thông báo**, nên họ chỉ biết có việc khi tự mở phần mềm. Bấm *Gửi lại* chạy lại đúng đường xử
lý cũ. Kết quả *"đã gửi thành công trước đó"* không phải lỗi — sự kiện đã đi lọt ở một lượt khác, và
thư được đánh dấu đã xử lý.

## 13. Sản phẩm, Chiết khấu, Giấy tờ mẫu

Ba mục menu riêng. **Sản phẩm** và **Chiết khấu** mọi vai trò vào được — vai trò không phải Quản trị
thấy đúng bảng dữ liệu, ở dạng chỉ đọc. **Giấy tờ mẫu** chỉ Quản trị hệ thống thấy.

### 13.1. Sản phẩm

Quản trị hệ thống thấy **hai thẻ**: *Sản phẩm* và *Nhóm sản phẩm*. Vai trò khác chỉ thấy bảng sản
phẩm, ở dạng chỉ đọc.

Ô **tìm kiếm** phía trên bảng sản phẩm khớp cả **tên lẫn mã**, và **không cần gõ dấu** — gõ `sua` ra
"Sữa", gõ `dem` ra "Metacare Đêm".

**Thẻ Sản phẩm** — thêm, sửa tên và trạng thái, đặt giá, nhập hàng loạt từ Excel.

- **Mã vật tư không sửa được** sau khi tạo. Hồ sơ CSBH đã lập đóng băng mã này.
- **Vô hiệu hoá** chỉ chặn hồ sơ **lập mới**. Hồ sơ cũ giữ nguyên sản phẩm và giá đã đóng băng.
- **Giá không phải một ô** — nó là chuỗi dòng có ngày hiệu lực. Nút *Giá* mở lịch sử và cho đặt giá
  mới. Giá hiện hành là dòng mới nhất có ngày **không ở tương lai**: đặt giá cho ngày mai thì hôm nay
  vẫn dùng giá cũ.
- Danh mục chỉ có **một loại giá: Giá bán Công ty**. Giá bán buôn KHÔNG khai ở đây — người đề nghị
  nhập nó trên từng dòng của từng hồ sơ, vì nó khác nhau theo khách hàng.
- **Sản phẩm mới chưa có giá** nên chưa lập được hồ sơ với nó. Đặt giá ngay sau khi tạo.
- **Nhập Excel** cần ba cột: mã vật tư, tên sản phẩm, mã nhóm. **Một dòng lỗi thì không dòng nào
  được ghi** — thông báo nêu đúng số dòng hỏng để bạn sửa file rồi nhập lại.

**Thẻ Nhóm sản phẩm** — mỗi sản phẩm phải thuộc một nhóm, và quy định chiết khấu cũng khai theo
nhóm. **Làm thẻ này trước** nếu danh mục còn trống: chưa có nhóm nào thì nút *Tạo sản phẩm* bên thẻ
kia không bấm được. Không xoá được nhóm đang có sản phẩm; chuyển sản phẩm sang nhóm khác trước.

### 13.2. Chiết khấu

**Quy định chiết khấu** — ngưỡng để cảnh báo khi lập hồ sơ. Bỏ trống một ô nghĩa là *mọi giá trị*
của ô đó. Nhiều quy định cùng khớp một tình huống là bình thường: **quy định cụ thể hơn thắng**.
Vượt ngưỡng **không bị chặn**, chỉ được đánh dấu cho người duyệt nhìn thấy.

Đây là **nguồn ngưỡng duy nhất**. Sản phẩm không còn ô "ngưỡng mặc định" nào — sản phẩm nào không
được quy định nào phủ thì dòng hồ sơ của nó không có ngưỡng để đối chiếu.

**Thứ tự phân xử khi nhiều quy định cùng khớp:**

1. **Cụ thể hơn thắng** — nhóm sản phẩm (2 điểm) mạnh hơn loại khách hàng (1 điểm).
2. **Mới hơn thắng** — chỉ dùng tới khi hai dòng bằng điểm, mà bằng điểm nghĩa là trùng phạm vi.

**Không có bước thứ ba.** Hệ thống **từ chối** khi bạn khai một quy định trùng đúng phạm vi *và*
đúng ngày hiệu lực với một dòng đã có — thông báo chỉ ra hai cách đi tiếp: sửa ngưỡng của dòng đang
có, hoặc khai **ngày hiệu lực muộn hơn** để đè lên. Dòng cũ **không bị ghi đè**.

Lưu ý **ô để trống cũng tính là trùng**: hai dòng cùng bỏ trống ô nhóm sản phẩm đều nói *"mọi nhóm"*,
nên chúng trùng nhau.

**Mã quy định do bạn đặt.** Ô *Mã quy định* đứng đầu biểu mẫu *Thêm quy định*. Đặt mã đọc được và
nói lên phạm vi — ví dụ `CK-SUA-L1` — vì đây là thứ sẽ hiện lại ở cột *Id* và ở cột *QĐCK* của từng
dòng hồ sơ.

- **Trùng mã thì không tạo được.** Mã **không phân biệt hoa thường** và bỏ qua khoảng trắng thừa:
  `CK-01`, `ck-01` và ` CK-01 ` là một mã.
- Thông báo lỗi phân biệt rõ **trùng mã** với **trùng phạm vi** — hai chuyện khác nhau, hai cách sửa
  khác nhau.
- **Mã không sửa được** sau khi tạo: hồ sơ đã lập ghi lại mã này để truy vết. Đặt nhầm thì xoá dòng
  rồi khai lại.

**Cột Id và ô tìm kiếm.** Mã hiện ở cột *Id*. Ô tìm kiếm phía trên bảng khớp
**cả mã** — dán nguyên mã ở cột *QĐCK* của một dòng hồ sơ là ra thẳng quy định đã cho ra ngưỡng của
dòng ấy; dán một phần đầu của mã cũng ra. Ô tìm còn khớp phạm vi áp dụng (gõ không dấu được) và con
số ngưỡng đang hiện trên màn hình (`25,00`).

Cột **"Độ cụ thể"** đã bỏ. Nó là con số nội bộ để xếp thứ tự ưu tiên; cột *Áp dụng cho* ngay bên
cạnh đã nói rõ dòng nào hẹp hơn dòng nào, và câu hỏi *"hồ sơ này lấy ngưỡng từ đâu"* giờ trả lời
bằng cột *Id* cộng cột *QĐCK*.

- **Sửa chỉ đổi được *ngưỡng***. Hai ô phạm vi (nhóm · loại khách) không sửa được — đổi chúng
  là đổi thứ tự ưu tiên của cả bảng. Khai nhầm phạm vi thì **xoá dòng rồi khai lại**.
- **Quy định vô thời hạn**, không có ngày kết thúc. Có hiệu lực từ ngày khai cho tới khi bị xoá,
  hoặc cho tới khi một quy định cụ thể hơn khớp và thắng nó.
- **Sửa và xoá không làm đổi hồ sơ đã lập.** Mỗi dòng hồ sơ giữ ngưỡng đã chụp lúc lập; thay đổi ở
  đây chỉ áp dụng cho hồ sơ lập **từ đây về sau**.
- Muốn một quy định thôi áp dụng thì **xoá dòng**, hoặc khai một dòng cụ thể hơn đè lên. Xoá **không**
  làm đổi hồ sơ đã lập — mỗi dòng hồ sơ giữ ngưỡng đã chụp lúc lập.

> **Danh mục tra cứu đã bỏ.** Khối tỉnh/thành · bệnh viện · kênh bán dưới bảng quy định không còn:
> ngưỡng chỉ khớp theo **nhóm sản phẩm × loại khách hàng**, và ba danh mục ấy không còn ô nào để điền
> vào.

### 13.3. Giấy tờ mẫu (chỉ Quản trị hệ thống)

Nơi nhập mẫu văn bản để xuất PDF. **Hiện chưa nhập được gì** — mẫu hồ sơ CSBH đang được làm; bản A4
hiện do hệ thống tự dựng bố cục theo 13 mục bắt buộc.

**Mẫu hợp đồng không nằm ở đây.** Nó thuộc **Sale Admin**, ở mục menu *Mẫu hợp đồng* riêng.

> **Người ký đã gỡ khỏi phần mềm.** Yêu cầu cho chức năng này chưa đủ rõ: chưa xác định người ký
> dùng ở đâu trong luồng và ai gán cho hồ sơ nào. Sẽ dựng lại sau khi chốt yêu cầu.

## 14. Dùng trên điện thoại

Toàn bộ luồng duyệt làm được trên điện thoại, kể cả bước ký số của Trưởng bộ phận.

Dưới 1024px thanh bên **thu lại thành ngăn kéo**: chạm nút ba gạch ở góc trái thanh trên cùng để mở,
chạm ra ngoài hoặc chạm dấu X để đóng. Chọn một mục xong thì nó tự đóng.

Bảng dòng sản phẩm dưới 640px chuyển thành **thẻ**, mỗi sản phẩm một thẻ. **Không cột nào bị bỏ** —
bốn ô CPBH gấp vào dòng *Tổng CPBH*, chạm vào để mở.

Ô nhập tiền gọi **bàn phím số**. Xoay ngang máy giữa lúc đang gõ không làm mất nội dung.

## 15. Khi gặp lỗi

- **"Không kết nối được máy chủ"** — lỗi mạng. **Dữ liệu bạn đã nhập vẫn còn nguyên**, bấm *Thử lại*.
- **"Dữ liệu vừa được người khác thay đổi"** — hai người thao tác cùng lúc. Tải lại rồi làm lại.
- **"Bạn thao tác quá nhanh"** — chờ một lát rồi thử lại.
- Mỗi thông báo lỗi có **Mã tra cứu**. Đọc mã đó cho bộ phận hỗ trợ; nó dựng lại được toàn bộ chuỗi
  thao tác của bạn.

## 16. Những gì hệ thống **không** làm

Nói trước để khỏi đi tìm:

- **Không có nghiệp vụ thu hồi** hồ sơ đã duyệt. Muốn thay đổi thì lập phiên bản mới.
- **Không lưu file hợp đồng** — không tra được "những hợp đồng nào đã ký". Dấu vết duy nhất là mốc
  *đã xuất hợp đồng lúc nào, ai xuất* trên hồ sơ.
- **Không tích hợp hệ thống kế toán.** Công nợ là một ô nhập tay.
- **Không cảnh báo giấy tờ pháp lý hết hạn.**
- **Nhập dữ liệu CSBH cũ từ Excel** đang hoãn sang giai đoạn 2.
