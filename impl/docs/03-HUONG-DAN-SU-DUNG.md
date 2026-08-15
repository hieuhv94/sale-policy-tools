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
- **Loại khách hàng cũng không sửa được** sau khi lưu: nó quyết định ngưỡng chiết khấu áp cho khách.

**Sửa khách hàng** — nút *Sửa* ở màn hình chi tiết. Kế toán, Sale Admin và Quản trị cũng sửa được,
không riêng Trình dược viên. Tỉnh · bệnh viện · kênh bán chọn từ danh mục do Quản trị khai; danh mục
trống thì ba ô đó cũng trống.

**Đổi trình dược viên phụ trách** — nút riêng, chỉ Sale Admin và Quản trị. Đây không phải đổi một
cái tên: **phạm vi nhìn thấy đổi theo**. Người cũ thôi thấy khách hàng này và mọi hồ sơ của họ,
người mới thấy ngay.

## 6. Lập hồ sơ CSBH (TDV)

*Hồ sơ CSBH* → **Lập hồ sơ** → chọn khách hàng → thêm từng dòng sản phẩm.

Hồ sơ tạo ra ở trạng thái **Nháp** ngay sau khi chọn khách hàng, rồi bạn thêm dòng sản phẩm trên
màn hình chi tiết. Mỗi lần thêm một dòng, hệ thống tính và hiện ngay **giá thu về** và **tỷ lệ chiết
khấu** của dòng đó — không phải nhập hết rồi mới biết.

Với mỗi dòng bạn nhập **Giá bán buôn** và bốn ô **CPBH**. Hệ thống tự tính:

> **Giá thu về** = Giá bán buôn − (CPBH1 + CPBH2 + CPBH3 + CPBH4)
> **Tỷ lệ chiết khấu** = 1 − Giá thu về / Giá bán Công ty

**Giá bán Công ty** và **ngưỡng chiết khấu** lấy từ danh mục, bạn không nhập được — và chúng được
**đóng băng** vào hồ sơ ngay lúc lập. Danh mục đổi giá về sau không làm đổi hồ sơ đã lập.

Dòng **vượt ngưỡng** hiện dấu chấm than đỏ kèm chữ *"vượt ngưỡng"*. Vượt ngưỡng **không bị chặn** —
nó chỉ được đánh dấu để người duyệt nhìn thấy.

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

*Hồ sơ CSBH* → **Bộ lọc** — 14 tiêu chí, kết hợp được với nhau:

> thời gian áp dụng · thời gian duyệt · mã khách hàng · tên khách hàng · địa chỉ đăng ký ·
> mã số thuế · tên sản phẩm · người đề nghị · trạng thái · TDV phụ trách · tỉnh/thành ·
> bệnh viện hoặc điểm bán · kênh · nhóm sản phẩm

- **Địa chỉ đăng ký** chỉ tìm kiểu *"có chứa"*, và **không phân biệt dấu**: gõ `da nang` vẫn ra
  `Đà Nẵng`. Muốn lọc theo địa bàn cho chắc thì dùng **Tỉnh/thành**.
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

Màn hình này có **hai bảng**: sản phẩm ở trên, nhóm sản phẩm ở dưới.

Ô **tìm kiếm** phía trên bảng sản phẩm khớp cả **tên lẫn mã**, và **không cần gõ dấu** — gõ `sua` ra
"Sữa", gõ `dem` ra "Metacare Đêm".

**Bảng sản phẩm** — thêm, sửa tên và trạng thái, đặt giá, nhập hàng loạt từ Excel.

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

**Bảng nhóm sản phẩm** — mỗi sản phẩm phải thuộc một nhóm, và quy định chiết khấu cũng khai theo
nhóm. Không xoá được nhóm đang có sản phẩm; chuyển sản phẩm sang nhóm khác trước.

### 13.2. Chiết khấu

**Quy định chiết khấu** — ngưỡng để cảnh báo khi lập hồ sơ. Bỏ trống một ô nghĩa là *mọi giá trị*
của ô đó. Nhiều quy định cùng khớp một tình huống là bình thường: **quy định cụ thể hơn thắng**, và
cột *Độ cụ thể* cho thấy thứ tự đó. Vượt ngưỡng **không bị chặn**, chỉ được đánh dấu cho người duyệt
nhìn thấy.

- **Sửa** chỉ đổi được *ngưỡng* và *ngày kết thúc*. Ba ô phạm vi (nhóm · loại khách · kênh) không
  sửa được — đổi chúng là đổi thứ tự ưu tiên của cả bảng. Khai nhầm phạm vi thì **xoá dòng rồi khai
  lại**.
- **Sửa và xoá không làm đổi hồ sơ đã lập.** Mỗi dòng hồ sơ giữ ngưỡng đã chụp lúc lập; thay đổi ở
  đây chỉ áp dụng cho hồ sơ lập **từ đây về sau**.
- Muốn một quy định thôi áp dụng từ một ngày nào đó thì **đặt ngày kết thúc**, đừng xoá — xoá là mất
  luôn dấu vết vì sao khoảng thời gian trước đó lại dùng ngưỡng ấy.

**Danh mục tra cứu** (dưới bảng quy định, chỉ Quản trị) — tỉnh/thành phố, bệnh viện, kênh bán. Ba danh mục này là **nguồn của ba ô
chọn trong biểu mẫu khách hàng**; để trống thì người lập khách hàng gặp ba ô rỗng. Thêm lại một mã
đã có sẽ đổi tên mã đó, không tạo bản thứ hai.

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
