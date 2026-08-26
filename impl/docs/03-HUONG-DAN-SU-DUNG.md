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

### Bao lâu phải đăng nhập lại

**Không phải đăng nhập lại chừng nào không có gì thay đổi.** Phiên được gia hạn mỗi lần bạn dùng phần
mềm, và nó sống qua cả việc đóng trình duyệt. Nghỉ liên tục **7 ngày** không mở phần mềm thì mới
phải đăng nhập lại.

Bảy ngày tính từ **lần dùng gần nhất**, không phải từ lần đăng nhập: mở phần mềm hàng tuần thì phiên
gia hạn liên tục và bạn không bao giờ gặp lại màn hình đăng nhập.

Bốn việc cắt phiên **ngay lập tức**, kể cả phiên đang mở ở máy khác:

| Việc | Vì sao |
|---|---|
| Bạn **đổi mật khẩu** | Nếu mật khẩu đã bị lộ thì đổi mật khẩu phải cắt được phiên của người đang dùng trộm |
| Quản trị **vô hiệu hoá** tài khoản | Có hiệu lực ngay ở lần gia hạn kế tiếp, không chờ |
| Bạn bấm **Đăng xuất** | Cắt cả chuỗi phiên, không riêng thiết bị đang bấm |
| Hệ thống phát hiện phiên bị **dùng lại bất thường** | Dấu hiệu token bị đánh cắp — cắt sạch, thà bắt đăng nhập lại |

> **Máy dùng chung**: phiên sống qua việc đóng trình duyệt, nên trên máy ở quầy hãy bấm **Đăng xuất**
> thay vì chỉ đóng cửa sổ.

Mỗi lần mở phần mềm, nó **kiểm tra phiên với máy chủ trước khi hiện màn hình** `sửa 21/08` — bạn sẽ
thấy dòng *"Đang kiểm tra phiên đăng nhập…"* trong chớp mắt. Phiên còn sống thì vào thẳng trang Tổng
quan; phiên đã hết hạn thì hiện **bảng đăng nhập, và chỉ bảng đăng nhập**.

> Trước đây phần mềm tin ngay phiên cũ lưu trên máy: nó dựng trang Tổng quan lên rồi mới phát hiện
> phiên đã chết, và bạn nhận một ô báo *phiên hết hạn* đè lên một trang trống mà mình chưa hề đăng
> nhập để vào. Nghỉ vài ngày rồi mở lại là gặp đúng cảnh ấy.
>
> Bước kiểm tra này còn lấy về **thông tin mới nhất** của tài khoản. Quản trị đổi vai trò hay đặt lại
> mật khẩu cho bạn thì có hiệu lực ngay lần mở tiếp theo, không phải đợi tới lần đăng nhập lại.
>
> Nếu **mất mạng hoặc máy chủ chưa sẵn sàng**, phần mềm vẫn cho bạn vào bằng thông tin đã lưu và
> không xoá phiên — một sự cố mạng vài giây không đáng để bắt bạn đăng nhập lại.

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
| **Ban lãnh đạo** | **Chỉ xem** — báo cáo, hồ sơ, lịch sử của từng hồ sơ. Không có nút ghi ở bất kỳ đâu. **Không** vào *Nhật ký* hệ thống `sửa 21/08` |
| **Quản trị hệ thống** | Danh mục sản phẩm, giá, người dùng. **Không** tham gia duyệt hồ sơ |

Bạn chỉ nhìn thấy dữ liệu **trong phạm vi của mình**: TDV thấy khách hàng mình phụ trách, Kế toán
thấy của các TDV thuộc mình, Sale Admin thấy toàn bộ nhánh bên dưới.

## 3. Bố cục màn hình

**Thanh bên trái** là toàn bộ điều hướng. Bạn chỉ thấy những mục thuộc vai trò của mình — Ban lãnh
đạo không có mục nào dẫn tới nút ghi, Quản trị hệ thống không có mục nào của luồng duyệt. Mục đang
mở được tô nền xanh.

**Thanh trên cùng** có bốn thứ, từ phải sang: **thẻ tài khoản** (ảnh đại diện + **tên đăng nhập** của
bạn), **chuông thông báo** `mới 23/08`, **vai trò** của bạn, và nút đổi **giao diện sáng / tối**.

Thẻ hiện **tên đăng nhập** chứ không hiện họ tên: nó trả lời câu *"máy này đang chạy bằng tài khoản
nào"*, mà họ tên không trả lời được — hai tài khoản của cùng một người mang y hệt một cái tên. Họ tên
còn ở chữ viết tắt trên ảnh đại diện và ở màn hình *Thông tin tài khoản*.

Vai trò đứng **riêng bên trái**, không phải một dòng phụ dưới tên: nó quyết định bạn thấy gì trên mọi
màn hình, nên nó là câu trả lời cho *"vì sao menu của tôi không có mục kia"*, chứ không phải một chú
thích của cái tên.

> Dưới 640px viên vai trò ẩn đi cho vừa thanh — nhãn như *"Quản trị hệ thống"* quá dài cho màn hình
> điện thoại. Tên đăng nhập thì vẫn hiện.

### Chuông thông báo `mới 23/08`

Cái chuông đứng sát trái thẻ tài khoản. Khi có việc chưa xem, nó mang một **con số đỏ** — số thông
báo bạn chưa đọc. Quá 99 thì ghi **`99+`**.

**Quy tắc gọn một câu: mỗi email hệ thống gửi cho bạn là một thông báo ở đây, và không có gì khác.**
Không có loại thông báo nào chỉ hiện trên web mà không có thư, và không có lá thư nghiệp vụ nào
không để lại một dòng.

> Trừ **hai lá thư về tài khoản** — *kích hoạt tài khoản* và *đặt lại mật khẩu*. Chúng mang liên kết
> dùng một lần, và liên kết ấy chỉ được tồn tại trong hộp thư của bạn.

Bấm vào chuông thì sổ xuống **10 thông báo gần nhất**. Mỗi dòng có:

| Phần | Là gì |
|---|---|
| Dòng đậm | Việc vừa xảy ra — *"Hồ sơ bị trả lại để chỉnh sửa"* |
| Dòng mờ | Mã và tên khách hàng, mã hồ sơ |
| Dòng nhỏ | *3 giờ trước* — rê chuột lên thì hiện ngày giờ đầy đủ |
| Chấm xanh bên trái | Dòng này bạn **chưa đọc** |
| Nhãn **để biết** | Bạn **không phải xử lý gì** — bạn nhận nó vì đã từng thao tác trên hồ sơ |

**Bấm vào một dòng thì tới đúng chỗ mà liên kết trong email dẫn tới**, và dòng đó thành đã đọc. Dòng
*để biết* mở *Lịch sử hồ sơ* thay vì mở hồ sơ — ở đó không có nút nào cho bạn bấm, còn lịch sử thì
trả lời đúng câu *"từ lúc tôi rời tay, hồ sơ này đã đi qua những đâu"*. Thông báo bàn giao khách hàng
mở danh sách khách hàng.

Chân bảng có **Xem tất cả** → trang *Thông báo* đầy đủ, phân trang và lọc được **chỉ chưa đọc**. Nút
**Đánh dấu đã đọc hết** chỉ hiện khi còn dòng chưa đọc.

Đóng bảng bằng cách bấm ra ngoài, bấm lại vào chuông, hoặc nhấn **Esc**.

> Thông báo giữ **6 tháng gần nhất**, cùng cửa sổ với *Nhật ký hệ thống*. Con số trên chuông tự làm
> mới mỗi phút; chuyển sang tab khác thì nó dừng và hỏi lại ngay khi bạn quay về.

### Menu tài khoản

Bấm vào **thẻ tài khoản** ở thanh trên cùng thì sổ xuống ba dòng:

| Dòng | Là gì |
|---|---|
| `ten@nutricare.com.vn` | Email của tài khoản đang đăng nhập — **chỉ để đọc**, không bấm được |
| **Thông tin tài khoản** | Mở màn hình *Thông tin của tôi*: sửa tên, email, đổi mật khẩu |
| **Đăng xuất** | Cắt phiên |

Đóng lại bằng cách bấm ra ngoài, bấm lại vào thẻ tên, hoặc nhấn **Esc**.

> **Vì sao Đăng xuất không còn bày sẵn.** Trước đây nó là một nút đứng ngay cạnh thẻ tên — tức là sát
> ngay chỗ người ta bấm để vào xem thông tin của mình. Bấm trượt một lần là mất phiên **và mất cả
> biểu mẫu đang nhập dở**. Giờ nó cần hai cú bấm có chủ ý.
>
> Dòng email ở trên cùng trả lời câu hỏi hay gặp nhất trên máy dùng chung ở quầy: *"máy này đang đăng
> nhập bằng tài khoản nào?"*

### Ô bắt buộc và ô tuỳ chọn

Mọi biểu mẫu nhập liệu đều đánh dấu ô phải điền bằng **dấu sao đỏ** ngay sau nhãn, và có một dòng
nhắc *"Trường có dấu \* là bắt buộc"* ở đầu biểu mẫu. Ô không có dấu sao thì bỏ trống được.

**Chưa điền đủ ô bắt buộc thì nút Lưu / Tạo mờ đi và không bấm được.** Bạn không phải bấm thử rồi
đọc thông báo lỗi để biết mình còn thiếu gì.

Chú ý riêng với **ô ngày**: nó thường có sẵn ngày hôm nay, nhìn như đã điền. Nếu bạn xoá trắng nó
thì ô đó thành trống và nút Lưu tắt — gõ lại ngày là bấm được.

### Phân trang

**Mọi danh sách trong phần mềm hiện tối đa 20 dòng một trang.** Dưới mỗi danh sách dài hơn thế có
thanh *Trang X / Y · N mục* kèm hai nút **← Trước** và **Sau →**. Danh sách ngắn hơn 20 dòng thì
không có thanh nào — không cần.

- **Gõ vào ô tìm kiếm hoặc đổi bộ lọc thì quay về trang 1.** Nếu không, bạn sẽ đứng ở trang 7 của kết
  quả cũ và nhìn một màn hình trắng.
- **Ô tìm kiếm luôn tìm trên toàn bộ**, không phải chỉ trong 20 dòng đang hiện.
- **Xoá dòng cuối cùng của trang cuối** thì phần mềm tự lùi bạn về trang trước.

Ba thứ **không** phân trang, và đó là chủ ý: bảng *Sản phẩm* bên trong một hồ sơ CSBH, lịch sử giá
của một sản phẩm, và tệp đính kèm của một hồ sơ. Chúng là nội dung của **một** hồ sơ chứ không phải
danh sách để duyệt — và bản A4 in ra phải khớp đúng bản trên màn hình.

### Giao diện sáng và tối

Nút hình mặt trăng (hoặc mặt trời) ở thanh trên cùng, và ở góc trên bên phải màn hình đăng nhập.

- **Chưa bấm lần nào** thì phần mềm **đi theo cài đặt của máy bạn**. Máy để chế độ tối — kể cả loại
  tự chuyển tối vào buổi tối — thì phần mềm tối theo, không cần làm gì.
- **Bấm một lần** là bạn chọn tay, và lựa chọn đó **thắng cài đặt của máy** theo cả hai chiều. Nó
  được nhớ trên chính máy này cho những lần sau.

Lựa chọn giao diện là **của riêng từng máy**, không đi theo tài khoản: cùng một người đăng nhập ở
máy bàn và ở điện thoại có thể để hai giao diện khác nhau.

### Khi có lỗi `mới 22/08`

Phần mềm báo lỗi ở **bốn chỗ**, và chỗ nào là theo việc bạn phải làm tiếp:

| Bạn thấy | Nghĩa là | Việc phải làm |
|---|---|---|
| **Hộp thoại giữa màn hình** | Thao tác vừa bấm không thành | Đọc câu lỗi, bấm *Đã hiểu*, làm theo câu ấy |
| **Thanh nhỏ ở góc dưới bên phải** | Một việc phụ hỏng, dữ liệu của bạn không mất gì | Thường chỉ cần bấm lại sau vài giây; thanh tự tắt |
| **Dòng đỏ ngay dưới một ô** | Đúng ô đó chưa hợp lệ | Sửa ngay ô đang đứng, không cần bấm gì khác |
| **Khối đỏ ở lại trên trang** | Không tải được dữ liệu để dựng màn hình | Bấm *Thử lại*; nếu vẫn vậy thì báo Quản trị hệ thống |

Mọi câu lỗi đều nói **việc gì vừa hỏng và làm gì tiếp**, không phải mã lỗi. Hộp thoại còn có
**Mã tra cứu** ở dòng cuối — đọc mã đó cho Quản trị hệ thống thì họ tìm ra đúng lượt bấm của bạn
trong nhật ký.

> **Lỗi mạng khác lỗi dữ liệu.** Mất kết nối thì phần mềm nói rõ *"dữ liệu bạn đã nhập vẫn được giữ
> nguyên"* — đóng hộp thoại và bấm lại là xong, **không phải nhập lại từ đầu**.

### Nhật ký hệ thống `sửa 22/08`

Màn hình *Nhật ký* của Quản trị hệ thống tra được **6 tháng gần nhất**, mở ra mặc định là **tháng
này**. Sáu ô lọc: từ ngày · đến ngày · người thực hiện · hành động · đối tượng · địa chỉ IP.

- Cột **Người thực hiện** hiện họ tên, dòng nhỏ dưới là tên đăng nhập và vai trò. Dòng cũ ghi trước
  ngày 22/08 để trống ô này — phần mềm **không tra bù** tên hiện tại vào một việc của quá khứ.
- Bấm **Xem thay đổi** ở những dòng có sửa dữ liệu để đọc giá trị **trước và sau**, kèm lý do.
- Bấm **mã tra cứu** để xem cả chuỗi: một thao tác của bạn thường sinh ra nhiều dòng ở nhiều phần
  khác nhau của hệ thống, và mã này nối chúng lại.
- **Không có nút xuất file.** Nhật ký đọc tại chỗ; đó là lý do bộ lọc ở trên đầy đủ tới vậy.

**Phần mềm không nói bừa khi chưa hỏi được máy chủ** `mới 22/08`. Trước đây vài chỗ tra hỏng mà màn
hình vẫn trả lời dứt khoát — *"khách hàng chưa có CSBH nào"*, *"không có mục nào khớp"* — trong khi
sự thật chỉ là lượt gọi ấy hỏng. Nay những chỗ đó nói đúng là chưa tra được, kèm nút thử lại.

## 4. Trang tổng quan

**Đăng nhập xong bạn vào đây**, dù trước đó thanh địa chỉ đang ở màn hình nào. Mở lại một tab cũ đang
đứng ở *Người dùng* rồi đăng nhập cũng vào trang tổng quan, không rơi vào giữa một màn hình con mà
vai trò của bạn có thể không xem được.

Hai ngoại lệ:

- **Liên kết trong thư báo.** Bấm *Mở hồ sơ* hay *Xem lịch sử hồ sơ* trong email rồi đăng nhập thì bạn vào
  thẳng hồ sơ đó, không bị đưa về đây — bạn bấm vào nó vì cần đúng nó.
- **Phiên hết hạn giữa chừng.** Ô đăng nhập lại hiện đè lên màn hình cũ, và đăng nhập xong bạn ở
  nguyên chỗ đang làm với mọi thứ đang gõ dở còn nguyên.

Màn hình đầu tiên sau khi đăng nhập. **Nội dung khác nhau theo vai trò** — bạn chỉ thấy những con
số thuộc phần việc của mình.

### Dải thẻ

Hàng thẻ trên cùng đếm hồ sơ. **Bấm được vào mọi thẻ, không trừ cái nào** — mở ra danh sách hồ sơ đã
lọc sẵn đúng bằng con số vừa bấm.

| Vai trò | Thẻ bạn thấy |
|---|---|
| **Trình dược viên** | Yêu cầu chỉnh sửa · **Sắp quá hạn · Quá hạn** · Đang chờ · Đang có hiệu lực · Từ chối |
| **Trưởng bộ phận** | Chờ TBP duyệt · **Sắp quá hạn · Quá hạn** · Đang chờ · Đang có hiệu lực · Từ chối |
| **Kế toán** | KT duyệt bản mềm · KT duyệt bản cứng · **Sắp quá hạn · Quá hạn** · Đang chờ · Đang có hiệu lực |
| **Sale Admin** | Trình ký · Lỗi bản cứng · **Sắp quá hạn · Quá hạn** · Đang chờ · Đang có hiệu lực |
| **Ban lãnh đạo** | **Cả 11 trạng thái** |
| **Quản trị hệ thống** | Không có — xem giải thích bên dưới |

Cố ý **không** bày cho bạn bước của người khác thành thẻ riêng: một Trình dược viên nhìn ô "KT duyệt
bản cứng: 7" thì không làm được gì với con số ấy.

**Thẻ *Đang chờ*** gộp đúng phần ấy lại thành một số: hồ sơ trong phạm vi của bạn đang chạy trong
luồng nhưng **hiện không cần bạn làm gì**. Nó trả lời câu "hồ sơ tôi gửi vẫn đang đi chứ" mà không
bắt bạn đọc bốn ô của bốn người khác.

Thẻ này **không** kèm dòng đếm *"trong đó N sắp quá hạn"* như các ô đếm việc khác — theo đúng định
nghĩa của nó, đây là phần không cần bạn làm gì. Bấm vào thì vẫn thấy: danh sách mở ra có cột
*Hạn xử lý* đánh dấu từng hồ sơ.

**Hai thẻ của Sale Admin** trông giống nhau nhưng là hai việc khác hẳn:

| Thẻ | Nghĩa |
|---|---|
| **Trình ký** | Kế toán vừa nhận bản mềm. In, trình Ban lãnh đạo ký, nhận lại, scan, tải lên (bước B8). |
| **Lỗi bản cứng** | Kế toán nhận bản cứng rồi **bắt in lại** (B10C). Bản scan cũ **vẫn còn** để bạn đối chiếu xem bản giấy hỏng ở đâu — in xong thì **gỡ nó và tải bản mới lên**. Thẻ này tô vàng vì đó là việc lẽ ra không phải làm. |

**Thẻ *Sắp quá hạn*** đếm hồ sơ còn dưới 24 giờ là tới hạn, **ở bất kỳ bước nào** trong phạm vi của
bạn — không riêng bước bạn phụ trách. Người đang giữ hồ sơ chính là người đã không xử lý suốt 13 ngày
qua, nên ai liên quan cũng cần thấy để còn gọi nhắc. Ô tô **đỏ** vì đây là thứ sắp mất hẳn, không
phải một việc tồn đọng. Các ô đếm việc khác có thêm dòng *"trong đó N sắp quá hạn"* để biết chỗ nào
đang gấp.

**Thẻ *Quá hạn*** đứng ngay cạnh, và hai thẻ nói hai chuyện khác nhau:

| Thẻ | Nghĩa | Làm gì được |
|---|---|---|
| **Sắp quá hạn** | Còn dưới 24 giờ | Còn cứu được — xử lý ngay, hoặc gọi cho người đang giữ |
| **Quá hạn** | Đã chết, hệ thống xoá sau 3 ngày | Không bấm được gì. Lập một CSBH mới cho khách hàng đó |

Thẻ *Quá hạn* **không** gộp vào ô đếm việc của bước: ô đếm việc nói việc phải **làm**, thẻ này nói
việc phải **làm lại**. Ba ngày ấy là cửa sổ duy nhất để biết mình vừa mất gì trước khi hồ sơ rời khỏi
mọi màn hình.

### Yêu cầu cập nhật

Có ở bốn vai trò trong luồng: **TDV, Trưởng bộ phận, Sale Admin, Kế toán**. Khối này đứng **ngay sau
*Việc của tôi***, và chỉ hiện khi có việc — không có gì lệch thì nó biến mất hẳn khỏi màn hình.

Mỗi trang **tối đa 5 hồ sơ**, như *Việc của tôi*: trên trang Tổng quan chúng chỉ là hai trong nhiều
khối, và hai mươi dòng mỗi khối đẩy mọi thứ còn lại xuống dưới tầm mắt.

Nó liệt kê những hồ sơ **đã gửi duyệt** (cho tới cả hồ sơ *đang có hiệu lực*) mà nội dung trên hồ sơ
**đã khác với danh mục hiện tại**.

**Mỗi hồ sơ một dòng.** Dòng ấy cho biết mã hồ sơ, trạng thái, **lệch loại gì** và bao nhiêu điểm
lệch — đủ để quét cả danh sách mà không phải đọc số. **Bấm vào một dòng** thì nó mở ra: lệch ở sản
phẩm nào, **từ đâu sang đâu**, kèm liên kết mở hồ sơ. Bấm lần nữa thì gấp lại.

Ba loại lệch, phân biệt bằng nhãn màu — nhãn hiện ngay trên dòng gấp lại:

| Nhãn | Nghĩa |
|---|---|
| **Giá** | Giá bán Công ty của sản phẩm đã đổi |
| **QĐ chiết khấu** | Quy định chiết khấu áp cho dòng đó đã đổi, hoặc **đã bị xoá** (khi đó ngưỡng về rỗng) |
| **Sản phẩm** | Sản phẩm **đã bị vô hiệu hoá**, hoặc **đã bị xoá** khỏi danh mục |

Chi tiết dựng thành **bảng bốn cột** — *Lệch ở · Sản phẩm · Trên hồ sơ · Đã cập nhật* — để con
số cũ và mới nằm thẳng cột mà so, thay vì trôi trên một dòng chữ.

Nhãn **Sản phẩm** tô đỏ, hai nhãn kia thì không — và đó là chủ ý. Lệch vài đồng là chuyện để cân
nhắc; còn một CSBH đang có hiệu lực cho mặt hàng không còn bán nữa là **một điều khoản không thực
hiện được**.

Vì sao cần: hồ sơ đã gửi duyệt thì đóng băng số, và đó là chủ ý — không ai được sửa một văn bản đang
chờ chữ ký. Hệ quả là hồ sơ nằm trên bàn bạn có thể mang con số đã lỗi thời mà không có gì trên bảng
sản phẩm nói ra điều đó.

**Cùng cảnh báo ấy hiện ngay trên màn hình hồ sơ**, ở khối vàng **phía trên bảng dòng sản phẩm** —
nên mở hồ sơ thẳng từ thư báo hay từ hộp việc thì vẫn thấy, không phải ghé qua trang tổng quan trước.
Khối chỉ hiện khi hồ sơ đó thật sự lệch.

> **Không có thư báo cho việc này.** Danh mục đổi thì phần mềm **không** gửi email cho ai — kể cả với
> CSBH đang có hiệu lực. Hai chỗ trên đây là nơi duy nhất bạn biết, nên hãy nhìn trang Tổng quan mỗi
> sáng và đọc khối vàng trước khi ký.

**Khối không có nút nào**, và đó là chủ ý. Việc phải làm tuỳ tình huống: trả lại để người lập sửa,
cứ duyệt tiếp vì chênh lệch không đáng kể, hay lập một CSBH mới. Phần mềm không đoán hộ.

Hồ sơ còn ở *Nháp* hoặc *Yêu cầu chỉnh sửa* **không xuất hiện ở đây** — chúng tự cập nhật mỗi lần mở
nên không có gì để nhắc.

### Việc của tôi

Khối **đầu tiên** dưới dải thẻ: hồ sơ **đang chờ chính bạn** xử lý, sắp theo hạn gần nhất trước. Hồ
sơ còn dưới 24 giờ có vạch đỏ bên trái. Không thấy hồ sơ nào nghĩa là bạn không còn việc — không phải
hệ thống lỗi.

**Mỗi trang tối đa 5 hồ sơ.**

Với **Trình dược viên**, danh sách này gồm cả hồ sơ **Nháp** chưa gửi duyệt, không chỉ hồ sơ bị trả
lại — hồ sơ bạn đang viết dở cũng là việc của bạn. Vì vậy dải thẻ không còn ô *Nháp* riêng: một con số
ở trên rồi lại chính danh sách ấy ở dưới là bắt bạn đọc hai lần cùng một chuyện.

**Kế toán** thấy **một danh sách duy nhất** `sửa 21/08` gồm cả *Tiếp nhận lần 1* lẫn *Tiếp nhận lần
2*, xếp chung theo hạn gần nhất trước. Mỗi dòng có nhãn trạng thái riêng màu nên nhìn là biết dòng
đó thuộc lần nào.

> **Vì sao gộp lại.** Trước đây đây là hai danh sách tách rời dùng chung một thanh phân trang — nên
> một trang có thể toàn hồ sơ lần 1 trong khi lần 2 nằm ở trang sau, và nửa dưới báo *"không có hồ
> sơ nào chờ tiếp nhận lần 2"* dù thật ra vẫn còn. Gộp lại thì thứ tự theo hạn đúng trên toàn danh
> sách, và việc gấp nhất luôn nằm ở đầu bất kể nó thuộc lần nào.

### Từng vai trò còn thấy gì thêm

- **Trưởng bộ phận và Kế toán** — bảng **hồ sơ theo từng trình dược viên** `sửa 21/08`, đứng cuối
  trang. Bấm một dòng là ra đúng danh sách hồ sơ của người đó.
- **Sale Admin** — cảnh báo đỏ khi **chưa có mẫu hợp đồng nào đang áp dụng** (lúc đó Kế toán không
  xuất được hợp đồng, và chỉ bạn sửa được), cùng bảng hồ sơ theo từng trình dược viên.
- **Ban lãnh đạo** — sức khoẻ luồng duyệt, hồ sơ đang tắc ở bước nào, top 5 trình dược viên. Không
  có nút ghi nào. Khối *Hoạt động gần đây* đã gỡ `sửa 21/08` cùng lượt với mục menu *Nhật ký* —
  chuyện một hồ sơ đã đi qua tay ai thì *Lịch sử hồ sơ* trong chính hồ sơ ấy kể.
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

**Lập hồ sơ ngay từ đây** `mới 21/08` — nút **Lập hồ sơ CSBH** ở góc trên bên phải màn hình chi tiết
khách hàng. Bấm vào là sang thẳng bước chọn *Bổ sung / Chỉnh sửa* với khách hàng ấy **đã chọn sẵn**,
không phải sang mục Hồ sơ CSBH rồi gõ lại tên khách.

> Nút chỉ hiện với **Trình dược viên đang phụ trách** khách hàng đó, và chỉ khi khách **chưa bị xoá**
> — đúng bằng những trường hợp máy chủ cho phép lập.

### Lịch sử CSBH `mới 21/08`

Dưới khối *CSBH đang áp dụng* là bảng **mọi phiên bản CSBH** khách hàng này từng có — không chỉ bản
đang hiệu lực:

| Cột | Nội dung |
|---|---|
| Mã hồ sơ · Phiên bản · Trạng thái | Bấm mã để mở chính hồ sơ đó |
| Ngày áp dụng | Ngày ghi trên văn bản |
| Có hiệu lực từ | Lúc kế toán tiếp nhận lần 2 — thời điểm CSBH bắt đầu có giá trị |
| Hết hiệu lực lúc · Bị thay bởi | **Thời điểm bản mới thay bản này**, và mã của bản mới ấy |

Hai cột cuối luôn đi cùng nhau: có mốc thì phải có bản đã thay. Chúng hiện **cả giờ** chứ không chỉ
ngày, vì hai phiên bản thay nhau trong cùng một ngày là chuyện thường — bản mới có hiệu lực đúng lúc
bản cũ chết.

> **Một CSBH không có ngày hết hạn.** Cột *Hết hiệu lực* để trống ở bản mới nhất là đúng: nó chỉ hết
> hiệu lực khi phiên bản kế tiếp được duyệt xong, và có thể không bao giờ. Muốn biết **ai** thao tác
> ở từng mốc thì mở hồ sơ đó ra xem *Lịch sử hồ sơ*.

> **Bảng chỉ gồm hồ sơ bạn xem được** — nhưng nhận bàn giao một khách hàng là nhận **luôn toàn bộ
> hồ sơ** của khách ấy `sửa 21/08`, nên lịch sử của khách không còn bị cắt ngắn sau một lần đổi tay.

### Hồ sơ pháp lý `sửa 20/08`

Giấy phép kinh doanh, chứng chỉ hành nghề, giấy tờ tuỳ thân. Hiển thị giống hệt phần *Bản cứng* của
hồ sơ: mỗi giấy tờ một **thẻ có ảnh thu nhỏ**, rê chuột hiện **con mắt** để xem và **mũi tên xuống**
để tải, dấu **✕** ở góc để gỡ. Thêm bằng **vùng kéo thả** ở cuối hàng; chọn xong file thì phần mềm
hỏi *loại giấy tờ* rồi mới tải lên.

**Chỉ Trình dược viên phụ trách khách hàng ấy** mới thêm và gỡ được. Người khác vẫn xem và tải bình
thường, chỉ không thấy dấu ✕ và vùng kéo thả.

> Trước 20/08 mọi vai trò ghi đều tải lên được, cho mọi khách trong phạm vi của mình. Giấy tờ pháp lý
> là thứ TDV xin của khách và mang về — ba vai trò kia không cầm bản gốc bao giờ.
>
> **Gỡ giấy tờ** là việc mới. Trước đó tải nhầm là nằm lại vĩnh viễn, và cách duy nhất để sửa là tải
> thêm bản đúng rồi để hai bản cạnh nhau — người đọc sau không biết bản nào dùng được.

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

### Xoá một khách hàng

Nút **Xoá** trên màn hình chi tiết khách hàng. **Chỉ Trình dược viên phụ trách chính khách
đó** bấm được — không phải Kế toán, không phải Sale Admin, và cũng không phải Quản trị hệ thống dù
họ nhìn thấy mọi khách hàng. Quan hệ với khách hàng là việc của người phụ trách họ.

**Điều kiện duy nhất:** khách **không còn CSBH nào đang chờ**. Còn một bản Nháp cũng không được —
xử lý xong hoặc xoá hồ sơ đó trước. Màn hình liệt kê ra mã từng hồ sơ đang chặn.

Hộp thoại hỏi máy chủ trước rồi mới nói hậu quả, vì hậu quả khác nhau:

| Khách hàng | Bấm xong thì sao |
|---|---|
| **Chưa có hồ sơ CSBH nào** | Bản ghi bị **xoá hẳn**, không lấy lại được |
| **Đã có hồ sơ** | Bản ghi **giữ lại để tra cứu**, đánh dấu **Đã xoá**. Mọi CSBH **Đang có hiệu lực** chuyển sang **Hết hiệu lực** |

Sau khi xoá: khách **biến khỏi ô chọn lúc lập hồ sơ** và không lập CSBH mới được, nhưng **vẫn nằm
trong danh sách khách hàng** kèm nhãn *Đã xoá* — hồ sơ cũ của họ phải tra lại được. Việc cho hết
hiệu lực có vết trong **lịch sử của từng hồ sơ**.

> **Vì sao bản ghi vẫn còn sau khi bấm Xoá.** Hồ sơ CSBH trỏ vào khách hàng bằng khoá ngoại; xoá
> hẳn dòng là mất luôn tên khách trên mọi hồ sơ cũ, kể cả hồ sơ đã ký. Nhãn *Đã xoá* nói đúng điều
> người dùng vừa làm, còn bản ghi ở lại là để lịch sử đọc được.

> Vì sao ca đầu xoá hẳn mà ca sau chỉ đánh dấu: khách chưa có hồ sơ nào là khách vừa lập nhầm — gõ
> sai mã, tạo trùng, chọn nhầm loại. Không có lịch sử nào để giữ, và một bản ghi như thế nằm lại
> trong mọi danh sách mãi mãi thì không ai giải thích được nó là gì.

## 6. Lập hồ sơ CSBH (TDV)

*Hồ sơ CSBH* → **Lập hồ sơ** → chọn khách hàng → thêm từng dòng sản phẩm.

Hồ sơ tạo ra ở trạng thái **Nháp** ngay sau khi chọn khách hàng, rồi bạn thêm dòng sản phẩm trên
màn hình chi tiết. Mỗi lần thêm một dòng, hệ thống tính và hiện ngay **giá thu về** và **tỷ lệ chiết
khấu** của dòng đó — không phải nhập hết rồi mới biết.

Với mỗi dòng bạn nhập **Giá bán buôn** và các khoản **CPBH**. Hệ thống tự tính:

> **Giá thu về** = Giá bán buôn − (tổng các khoản CPBH)
> **Tỷ lệ chiết khấu** = 1 − Giá thu về / Giá bán Công ty

**Gõ số tiền thì gõ số trần**, không cần dấu chấm — `1000000`. Trong lúc con trỏ còn ở trong ô, ô
hiện đúng những chữ số bạn gõ và con số đã phân nhóm hiện ở **dòng nhỏ ngay dưới ô** (`1.000.000`)
để bạn soát nhanh mình đang gõ mấy số 0; rời ô là chính ô hiện số đã phân nhóm. `sửa 22/08`

> Trước đây ô tự chèn dấu chấm ngay giữa lúc gõ, và nó **hỏng khi bật bộ gõ tiếng Việt**: bộ gõ giữ
> bộ đệm riêng cho chữ đang gõ, ô nhập chèn thêm ký tự vào giữa là bộ đệm lệch, lượt sửa kế tiếp của
> bộ gõ ăn nhầm chữ số — gõ đủ bảy phím mà số tiền ra thiếu hoặc thừa số. Giờ ô không đụng vào chữ
> bạn đang gõ nữa, nên bật hay tắt bộ gõ cũng cho ra cùng một con số.

**Số khoản CPBH tuỳ từng dòng.** Biểu mẫu mở sẵn một ô; bấm *+ Thêm khoản chi phí* để có thêm, bấm
*Bớt* để bỏ ô thừa. Không phải mọi sản phẩm đều có bốn khoản, và gõ số 0 vào những ô không dùng chỉ
làm bản in dài thêm mấy cột số 0.

Trên bản in, số cột CPBH lấy theo **dòng nhiều khoản nhất**; dòng ít khoản hơn để **ô trống** — ô
trống nghĩa là dòng ấy không có khoản đó, khác với số 0 nghĩa là khoản đó bằng không.

**Sửa một dòng đã thêm**: bấm *Sửa* ở cột Thao tác. Đổi được giá bán buôn và các khoản chi phí.
**Sản phẩm thì không đổi được** — muốn đổi sản phẩm thì xoá dòng rồi thêm dòng mới, vì đó là hai
việc khác nhau.

**Giá bán Công ty** và **ngưỡng chiết khấu** lấy từ danh mục, bạn không nhập được — và chúng được
**đóng băng** vào hồ sơ — nhưng chỉ **từ lúc bấm Gửi duyệt**.

> **Hồ sơ Nháp sống theo danh mục.** Còn ở *Nháp* hay *Yêu cầu chỉnh sửa* thì mỗi lần bạn mở hồ sơ,
> giá và ngưỡng được lấy lại từ danh mục; lúc bấm *Gửi duyệt* lấy lại lần cuối rồi mới đóng băng. Nhờ
> vậy con số bạn vừa đọc đúng là con số sẽ được đóng băng.
>
> **Giá lấy theo *Thời gian áp dụng*, không phải ngày hôm nay.** Hồ sơ áp dụng từ 01/09 thì mang bảng
> giá của 01/09, kể cả khi bạn lập nó từ tháng 8. Đổi *Thời gian áp dụng* thì mọi dòng tính lại theo
> bảng giá của ngày mới.
>
> **Giá bán buôn và các khoản CPBH không bao giờ bị thay.** Đó là con số bạn nhập; chỉ Giá bán Công
> ty và ngưỡng — hai thứ lấy từ danh mục — mới được làm mới.
>
> **Gửi duyệt bị chặn nếu có dòng không lấy được giá.** Sản phẩm đã vô hiệu hoá, hoặc chưa khai giá
> tại ngày áp dụng. Hệ thống nói rõ sản phẩm nào; xoá dòng đó hoặc đổi *Thời gian áp dụng* rồi gửi
> lại. Mở hồ sơ ra xem thì vẫn xem được bình thường.

Hồ sơ **đã gửi duyệt** thì không bao giờ tự đổi số — xem *Yêu cầu cập nhật* ở mục 4.

### Hai màu trong bảng dòng sản phẩm

Màu nằm trên **chính con số ở cột Tỷ lệ CK**, không phủ nền cả dòng: những ô còn lại của dòng là số
bình thường và vẫn phải đọc được như số bình thường:

| Dấu hiệu | Nghĩa | Có chặn không |
|---|---|---|
| Tỷ lệ CK màu **đỏ** | **Vượt ngưỡng** — tỷ lệ chiết khấu cao hơn ngưỡng cho phép | Không. Chỉ được đánh dấu để người duyệt nhìn thấy |
| Tỷ lệ CK màu **vàng** | **Chưa có quy định chiết khấu** phủ sản phẩm này với loại khách hàng của khách hàng, nên dòng **không có ngưỡng nào để đối chiếu** | Không. Báo Quản trị hệ thống nếu cần một ngưỡng cho sản phẩm này |

Dòng vừa vượt ngưỡng vừa thiếu quy định thì con số là **đỏ** — vượt ngưỡng là thứ phải xử lý trước.

**Không nhớ màu nghĩa là gì thì bấm dấu `?`** ngay cạnh con số. Rê chuột cũng được; trên điện thoại
thì bấm. Nó nói đủ lý do, và nói **cả hai** khi cả hai cùng đúng: vượt ngưỡng bao nhiêu so với ngưỡng
nào, hay không tìm thấy quy định chiết khấu nào áp dụng.

Dấu `?` chỉ hiện ở dòng có màu — thấy nó là biết dòng ấy có chuyện, không thấy là dòng bình thường.

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
nào — đúng những dòng có Tỷ lệ CK màu vàng.

Dùng để làm gì: chép mã, sang mục **Chiết khấu**, lọc theo đúng **nhóm sản phẩm** và **loại khách
hàng** của dòng ấy. Danh sách còn lại rất ngắn, và dòng mang mã bạn vừa chép chính là quy định đang
chi phối con số ngưỡng. Đó là câu trả lời cho *"vì sao dòng này ngưỡng 25% mà dòng kia 30%"*.

Nếu khách hàng **đã có CSBH đang hiệu lực**, hệ thống hỏi bạn muốn **Bổ sung** (thêm sản phẩm mới)
hay **Chỉnh sửa** (đổi sản phẩm đã có). Phiên bản mới **luôn chứa lại toàn bộ sản phẩm cũ** — bạn
không cần nhập lại.

### Gửi duyệt: chọn người, đọc lại, rồi mới xác nhận

Bấm **Gửi duyệt** thì hộp thoại mở ra bốn phần, theo đúng thứ tự này:

1. **Văn bản mẫu** `mới 23/08` — chọn bố cục cho bản mềm CSBH. Mỗi mẫu có tập cột riêng, nên *"bản
   đầy đủ cho nội bộ"* và *"bản gọn đưa khách hàng"* ra hai tờ giấy khác hẳn nhau. **Mẫu này gắn với
   hồ sơ**: người duyệt xem đúng bản bạn chọn ở đây và không đổi được.
2. **Bản CSBH A4** hiện ngay dưới ô chọn, dựng bằng **chính mẫu vừa chọn** — đổi mẫu thì nó dựng
   lại. Đọc lại đi: đây là **lần cuối nội dung còn sửa được**. Sau bước này giá, ngưỡng, mẫu **và
   thông tin khách hàng** đóng băng, và mọi chỉnh sửa đều phải đi một vòng trả lại.
3. **Trưởng bộ phận duyệt** — người sẽ ký số. Chỉ người bạn chọn nhìn thấy hồ sơ này trong hộp việc
   của họ; Trưởng bộ phận khác không thấy, và cũng không mở được.
4. **Kế toán tiếp nhận** — người nhận **cả lần 1 và lần 2**, và là người xuất hợp đồng.

Nút *Xác nhận* khoá tới khi đã chọn mẫu, bản A4 tải xong và cả hai ô người đã chọn. Ô chọn rỗng nghĩa là chưa có tài
khoản vai trò đó nào đang hoạt động — màn hình nói thẳng điều đó thay vì để bạn bấm vào một ô câm.

> **Thiếu thông tin thì chưa gửi được** `mới 24/08`. Bấm *Xác nhận* mà hồ sơ hoặc khách hàng còn
> trống một trường sẽ in ra bản CSBH thì phần mềm **chặn lại và kể tên từng mục**:
>
> | Mục còn thiếu | Sửa ở đâu |
> |---|---|
> | **Mã số thuế** | Màn hình *Khách hàng* → mở khách hàng của hồ sơ → Sửa |
> | **Chức danh người đại diện** | cùng chỗ trên |
> | **Thời gian áp dụng** | ngay trên màn hình hồ sơ |
>
> Chặn ở đây chứ không ở lúc xem, vì đây là lúc bạn còn sửa được: hồ sơ vẫn là bản nháp và bản CSBH
> chưa đi đâu cả. Sửa xong quay lại bấm *Gửi duyệt* là đi tiếp — không phải lập hồ sơ khác.
>
> **Những mục do các bước sau sinh ra thì KHÔNG bị đòi**: *Ngày TBP ký*, *Kế toán*, *Sale Admin*,
> *Ngày KT nhận lần 1* và *lần 2*, *Ngày hiệu lực*, *Khối chữ ký số*. Chúng còn trống trên bản A4
> lúc bạn gửi là **đúng** — chưa tới lượt ai điền chúng.
>
> *Thời gian áp dụng* nay **điền sẵn hôm nay** ngay từ lúc lập hồ sơ, nên mục này chỉ thiếu khi bạn
> chủ động xoá nó đi.

Hồ sơ bị trả lại rồi gửi lại thì **chọn lại từ đầu** — cả người lẫn văn bản mẫu: bạn có quyền gửi
cho một Trưởng bộ phận khác, và đổi luôn bố cục bản mềm nếu bảng sản phẩm đã khác đi.

> **Bị trả lại vì sai thông tin khách hàng thì sửa được** `mới 24/08`. Tên, địa chỉ, công nợ… in
> trên bản CSBH được chụp lại ở **mỗi lượt gửi duyệt**. Nên cách chữa là: mở màn hình khách hàng,
> sửa cho đúng, quay lại hồ sơ và **gửi lại** — bản CSBH mang số mới. Không phải lập hồ sơ khác.
>
> Gửi lại cũng **huỷ chữ ký số** của Trưởng bộ phận: hồ sơ đi lại toàn bộ vòng duyệt và phải được
> ký lại, đúng như quy trình. Dấu ký cũ vẫn nằm trong *Lịch sử hồ sơ*.

> **Chọn xong là không đổi được.** Hệ thống **không có** chức năng giao lại một hồ sơ cho người
> khác. Chọn nhầm người thì hồ sơ nằm ở hộp việc của người đó và không ai gỡ ra được — người lập
> không sửa được, người đáng lẽ phải nhận thì không nhìn thấy hồ sơ để mà nhận, Quản trị hệ thống
> cũng không có nút nào. Đọc kỹ hai ô chọn trước khi bấm Xác nhận.
>
> Đổi người phụ trách chỉ xảy ra ở đúng hai chỗ: **lúc chọn người** trong luồng, và **lúc vô hiệu
> hoá tài khoản** (chuyển toàn bộ hồ sơ của người đó).

**Sửa hồ sơ** chỉ làm được khi hồ sơ ở **Nháp** hoặc **Yêu cầu chỉnh sửa**. Lúc đó bảng *Sản phẩm*
có thêm nút *Xoá* ở từng dòng, và có nút *Sửa ngày áp dụng*. Hồ sơ đã gửi đi thì không sửa được nữa —
muốn sửa phải chờ người duyệt trả lại.

**Xoá hồ sơ** — nút riêng, **chỉ Trình dược viên đang phụ trách hồ sơ**, và chỉ ở **ba trạng thái**:
**Nháp**, **Yêu cầu chỉnh sửa** (tức là cả ba đường bị trả về — TBP yêu cầu chỉnh sửa, Kế toán không
tiếp nhận L1, Kế toán không tiếp nhận L2), và **Từ chối**. Phải **gõ lại mã hồ sơ** để xác nhận, vì
xoá không lùi được.

Hai kết cục, hệ thống tự chọn — bạn không phải quyết định:

| Hồ sơ đang ở | Bấm *Xoá hồ sơ* thì |
|---|---|
| **Nháp** (chưa gửi duyệt) | Biến mất hẳn, không để lại dòng lịch sử nào |
| **Yêu cầu chỉnh sửa** | Chuyển sang **Đã xoá** — hồ sơ ở lại, giữ nguyên lịch sử và lý do trả lại, tra cứu được, nhưng không đi tiếp được nữa |
| **Từ chối** | Cũng chuyển sang **Đã xoá**, giữ nguyên lịch sử và lý do từ chối |

Sự khác nhau nằm ở chỗ **đã có ai khác đọc hồ sơ chưa**. Bản nháp chưa gửi thì chưa ai ngoài bạn
nhìn thấy, nên giữ lại một dòng "đã xoá" cho mỗi lần lập nhầm chỉ làm rác lịch sử. Hồ sơ bị trả lại
thì đã qua tay người khác, họ đã đọc và đã viết lý do — xoá sạch dấu vết là làm biến mất luôn phần
việc của họ. **Người đã trả hồ sơ lại sẽ nhận thư báo** khi bạn xoá, vì họ đang chờ một bản sửa sẽ
không bao giờ tới.

**Xoá hồ sơ bị Từ chối** là để dọn màn hình: hồ sơ ấy đã đóng vĩnh viễn, không làm gì được nữa, mà
vẫn nằm đếm trong thẻ *Từ chối* trên trang tổng quan của bạn. Xoá xong nó rời khỏi thẻ đó.

> **Nó KHÔNG biến mất khỏi báo cáo.** Tỷ lệ trả lại và từ chối đếm theo **thời điểm hồ sơ bị từ
> chối**, không theo trạng thái hiện tại — nên xoá ở đây không làm con số của bạn đẹp lên. Lịch sử
> hồ sơ cũng giữ nguyên, kể cả lý do Trưởng bộ phận đã ghi.

Ở **mọi trạng thái khác** thì không ai xoá được, kể cả bạn và kể cả Quản trị hệ thống: hồ sơ đã gửi
đi đang nằm trên bàn người khác, còn **Đã xoá**, **Hết hiệu lực** và **Đang có hiệu lực** thì phải
giữ lại dấu vết.

## 7. Luồng duyệt — 10 bước

```
TDV lập  →  Gửi duyệt  →  TBP ký số  →  Kế toán tiếp nhận L1  →  xuất hợp đồng
   →  Sale Admin bàn giao  →  Kế toán tiếp nhận L2  →  ĐANG CÓ HIỆU LỰC
```

Ở mỗi bước, người phụ trách nhận **email** kèm liên kết mở thẳng hồ sơ — **đúng một thư cho một
lần bấm nút**. Trước 19/08, lần Trưởng bộ phận ký số sinh hai thư về cùng một giây cho kế toán, vì
hệ thống ghi thêm một bước trung gian *TBP đã ký số* mà không ai nhìn thấy. Bước ấy đã bỏ: ký xong
là hồ sơ sang thẳng *KT duyệt bản mềm*.

**Ai nhận hồ sơ ở bước sau là do người ở bước trước chọn**, không phải do một cấu hình nhân sự nào:

| Bước | Người đang cầm hồ sơ chọn |
|---|---|
| Gửi duyệt | Trưởng bộ phận duyệt · Kế toán tiếp nhận |
| Kế toán tiếp nhận L1 | Sale Admin xử lý |
| Kế toán tiếp nhận L2 | *không chọn* — về đúng người đã nhận L1 |

Hồ sơ chỉ nằm trong hộp việc của **đúng người được chọn**, và cũng chỉ người đó mở được. Đồng nghiệp
cùng vai trò không thấy, không mở.

**Trả lại và từ chối**

- **Trả lại chỉnh sửa** (TBP hoặc Kế toán): hồ sơ về tay TDV, **bắt buộc nhập lý do**. Sửa xong đi
  lại từ đầu vòng duyệt.
- **Từ chối** (chỉ TBP): hồ sơ đóng vĩnh viễn. **Không ai xoá được** hồ sơ đã từ chối, kể cả Quản
  trị hệ thống.
- **Đã xoá**: hồ sơ bị trả lại mà người lập quyết định bỏ hẳn, không sửa lại nữa. Cũng là trạng thái
  đóng vĩnh viễn và không ai xoá được — xem *Xoá hồ sơ* ở mục 6.

### Màu của trạng thái

Mỗi trạng thái một màu riêng, dùng chung ở **cả nhãn trong bảng hồ sơ lẫn vạch màu bên trái thẻ tổng
quan** — quen một chỗ là đọc được chỗ kia.

Bốn bước chờ đi thành một **chuỗi** theo đúng thứ tự hồ sơ đi qua, nên nhìn dải thẻ là biết đoạn nào
đang tắc:

| Chờ TBP duyệt | KT duyệt bản mềm | Sale Admin đang xử lý | KT duyệt bản cứng |
|---|---|---|---|
| chàm | lam | xanh ngọc | mòng két |

Còn lại:

| Màu | Trạng thái |
|---|---|
| Nâu xám | Nháp |
| Xanh lá | Đang có hiệu lực |
| Hổ phách | Yêu cầu chỉnh sửa · và thẻ *Lỗi bản cứng* của Sale Admin |
| **Đỏ** | Từ chối · Quá hạn duyệt |
| **Xám đá** | Hết hiệu lực · Đã xoá |
| Cam | thẻ *Sắp quá hạn* — không phải trạng thái |

Hai cặp in đậm **cố ý dùng chung màu**: *Từ chối* với *Quá hạn duyệt* khác nguyên nhân nhưng cùng một
kết cục — hồ sơ không đi tiếp được nữa; *Hết hiệu lực* với *Đã xoá* đều đã rời khỏi luồng và không
đòi ai làm gì.

Thẻ *Đang chờ* **không có màu**: theo đúng định nghĩa nó là phần không cần bạn làm gì.

### Đầu màn hình hồ sơ

Mã hồ sơ ở góc trên bên trái, **các nút thao tác ở góc trên bên phải ngang hàng với nó**. Dưới đó là
hai thẻ thông tin, mỗi thứ một dòng có nhãn riêng.

| Thẻ **Hồ sơ** | Nghĩa |
|---|---|
| Trạng thái | Hồ sơ đang ở bước nào |
| Phiên bản | Bản CSBH thứ mấy **của khách hàng này** — không phải phiên bản phần mềm |
| Ngày soạn thảo | Lúc bản nháp ra đời |
| Ngày áp dụng | Ngày người lập khai, và là ngày dùng để tra giá với ngưỡng |
| Có hiệu lực | Chỉ hiện khi CSBH **đã** có hiệu lực |
| Người đề nghị | TDV đã **gửi** hồ sơ đi duyệt — không đổi khi khách hàng được bàn giao cho TDV khác |

| Thẻ **Khách hàng** | Nghĩa |
|---|---|
| Mã | Bấm vào mở màn hình khách hàng đó |
| Tên · Loại · Công nợ | Ba thứ quyết định ngưỡng chiết khấu và điều khoản thanh toán |
| Trạng thái | **Chỉ hiện khi khách đã ngừng hợp tác** — hồ sơ cũ của họ vẫn mở được |

> **Tên và công nợ ở thẻ này là số LÚC GỬI DUYỆT, không phải số hôm nay** `sửa 24/08`. Hồ sơ đã gửi
> duyệt thì thông tin khách hàng in trên bản CSBH được **giữ nguyên** — sửa hồ sơ khách hàng về sau
> không làm đổi một tờ giấy đã đưa đi ký. Thẻ này hiện đúng con số ấy để **màn hình và bản mềm luôn
> nói cùng một điều**.
>
> Muốn xem công nợ **hiện tại** thì bấm vào **Mã** để sang màn hình khách hàng.
>
> Hồ sơ còn *Nháp* thì chưa có gì được giữ, nên thẻ hiện số hiện tại — đúng quãng người lập còn
> đang cân nhắc. *Loại khách hàng* và nhãn *đã ngừng hợp tác* luôn là tin của hôm nay.

Ba mốc ngày tháng nằm ở ba ô riêng chứ không nối nhau trên một dòng: *ngày soạn thảo* và *ngày áp
dụng* cách nhau hàng tuần ở hồ sơ soạn dần, và đọc nhầm mốc nào cũng ra một ngày trông hợp lý.

### Ai đã duyệt

Ngay dưới hai thẻ ấy là dải **đã duyệt**: mỗi bước đã đi qua một ô, ghi **tên người duyệt** và
**thời điểm**.

| Ô | Nghĩa |
|---|---|
| Trưởng bộ phận ký | Người **thật sự đặt bút** — khác người được phân công nếu có duyệt thay |
| KT duyệt bản mềm | Kế toán tiếp nhận lần 1 |
| Sale Admin bàn giao | Bàn giao bản cứng |
| KT duyệt bản cứng | Kế toán tiếp nhận lần 2 — CSBH có hiệu lực từ đây |

**Chỉ hiện bước đã xảy ra.** Hồ sơ còn ở *Nháp* thì không có dải này; hồ sơ vừa được ký thì có một ô.
Bày sẵn bốn ô rỗng chờ điền là bốn dòng chữ không nói gì.

Thời điểm đi **kèm** tên chứ không tách: biết ai ký mà không biết ký lúc nào thì vẫn phải mở *Lịch sử*
ra mới biết hồ sơ nằm đó bao lâu — và đó thường là câu hỏi tiếp theo. Muốn xem đủ mọi bước, kể cả các
bước bị trả lại, thì mở *Lịch sử* ở cuối màn hình.

### Nút thao tác

Các nút thao tác nằm ở **góc trên bên phải, ngang hàng với mã hồ sơ** — không phải dưới đáy trang.
Người mở màn hình này phần lớn là để ký; bắt họ cuộn qua bảng sản phẩm, tệp đính kèm và nhóm nút tải
văn bản mới tới được việc của mình là đặt việc chính ở xa nhất.

Chúng chỉ hiện **những việc bạn làm được ở bước hiện tại** — không phải mọi việc của bước ấy. Trưởng
bộ phận mở một hồ sơ đang chờ mình thấy ba nút *Ký số duyệt · Trả lại chỉnh sửa · Từ chối hồ sơ*;
Trình dược viên mở đúng hồ sơ đó **không thấy nút nào**, vì lúc này việc không thuộc về họ.

Nhóm nút biến mất hẳn khi bạn không có việc gì, không hiện ra rồi báo lỗi khi bấm. **Ban lãnh đạo**
và **Quản trị hệ thống** không bao giờ thấy nó — cả hai đứng ngoài luồng duyệt.

*Xoá hồ sơ* **không** nằm trong nhóm này: nó ở cuối trang, tách khỏi các nút của luồng duyệt, để
không ai bấm nhầm nó khi đang định ký.

**Luật này áp cho MỌI nút trên màn hình hồ sơ**, không riêng dải *Thao tác*:

| Nút | Chỉ hiện khi |
|---|---|
| *Sửa hồ sơ* | Hồ sơ ở *Nháp* hoặc *Yêu cầu chỉnh sửa*, và bạn là TDV phụ trách |
| *Xoá hồ sơ* | Hồ sơ ở *Nháp*, *Yêu cầu chỉnh sửa* hoặc *Từ chối*, và bạn là TDV phụ trách |
| *Tải tệp lên* | Hồ sơ đang nhận được đúng loại tệp ấy — *Hồ sơ* ở bước nháp, *Bản scan* ở bước Sale Admin |
| *Gỡ* tệp | Hồ sơ ở *Nháp*, *Yêu cầu chỉnh sửa* hoặc *Sale Admin đang xử lý* |
| *Xuất hợp đồng (PDF)* | Kế toán đã tiếp nhận lần 1 |

Hộp thoại *Tải tệp lên* cũng không hỏi loại tệp khi chỉ có một loại hợp lệ — một ô chọn với đúng một
lựa chọn dùng được không phải lựa chọn.

Hệ quả với hồ sơ **Quá hạn duyệt**: mở ra thì **không còn nút nào cả**.

### Ai nhận thư khi hồ sơ đổi trạng thái

**Hai nhóm, hai lá thư khác nhau.**

| Nhóm | Nhận gì | Liên kết trong thư dẫn tới |
|---|---|---|
| Người **phải xử lý** bước tiếp theo | Thư chính | **Hồ sơ** — mở ra là bấm nút được ngay |
| Người **đã từng thao tác** lên hồ sơ nhưng giờ không có việc | Thư *để biết* | **Lịch sử hồ sơ** |

Nhóm thứ hai là điểm khác so với trước: hồ sơ đi tiếp thì mọi người đã đi qua nó đều được báo, không
chỉ người đang cầm nó. Trường hợp rõ nhất là **Trưởng bộ phận đã bị thay**: người thứ nhất trả hồ sơ
về, người lập sửa rồi gửi cho một Trưởng bộ phận khác — người thứ nhất không còn liên quan tới hồ sơ
theo bất kỳ ô nào trên màn hình, nhưng họ đã đọc nó và đã viết lý do trả lại, nên họ vẫn được báo.

Thư *để biết* nói thẳng ở thân thư rằng bạn **không phải xử lý gì**, và liên kết của nó mở **lịch
sử** chứ không mở hồ sơ: mở hồ sơ ra bạn chẳng có nút nào bấm được, còn thứ bạn muốn biết là hồ sơ đã
đi qua những đâu từ lúc bạn rời tay.

Ba nhóm **không** nhận thư *để biết*: người vừa nhận thư chính (nhận hai thư cho một sự kiện là cách
nhanh nhất khiến người ta ngừng đọc cả hai), người **vừa bấm nút** (họ vừa nhìn thấy kết quả trên
màn hình), và tài khoản **đã bị vô hiệu hoá**.

### Thư báo CSBH hết hiệu lực

Một CSBH đang hiệu lực mất hiệu lực theo **hai đường**, và cả hai giờ đều có thư báo.

| Đường | Ai nhận thư |
|---|---|
| **Có phiên bản mới** được duyệt xong | Người của **bản cũ** mà **không còn tên trong bản mới** |
| **Khách hàng ngừng hợp tác** | Cả ba người còn lại của hồ sơ — trừ chính TDV vừa bấm nút |

Ở đường thứ nhất, thư thường **không được gửi**, và đó là đúng: cùng một Trình dược viên, cùng một
Trưởng bộ phận, cùng một Kế toán giữ cả hai phiên bản thì cả bốn người vừa nhận lá *CSBH bắt đầu có
hiệu lực* của bản mới rồi. Gửi thêm một lá nữa cho chính họ là hai thư trong một giây.

Lá thư ấy sinh ra cho đúng ca hiếm mà nó có ích: **người đã ký bản cũ nhưng không tham gia bản mới**
— Trưởng bộ phận đã duyệt phiên bản trước, hoặc người phụ trách cũ sau khi khách hàng đổi Trình dược
viên. Không có thư thì chính sách họ từng ký hết hiệu lực trong im lặng.

Thư của đường thứ nhất chỉ luôn **phiên bản thay thế** ở cuối. Thư của đường thứ hai **không có**
dòng đó — ở đấy không có bản nào thay thế cả, và gợi ý ngược lại là bắt người đọc đi tìm một hồ sơ
không tồn tại.

### Lịch sử hồ sơ

**Mục cuối cùng** của màn hình hồ sơ, gập sẵn — bấm vào thanh *Lịch sử* thì sổ ra; mũi tên ở **mép
phải** thanh cho biết đang gập hay đang mở. Nó liệt kê
**toàn bộ** các bước hồ sơ đã đi qua, cũ nhất trước: thời điểm, việc gì, chuyển từ trạng thái nào
sang trạng thái nào, ai làm, và lý do nếu bước đó có.

> Trước đây mục này tên là *Nhật ký* và nằm ở một màn hình riêng, vào bằng một liên kết nhỏ dưới mã
> hồ sơ. Đổi tên vì phần mềm còn một *Nhật ký* nữa — nhật ký kiểm toán toàn hệ thống của Quản trị —
> và hai thứ khác hẳn phạm vi mà trùng tên thì luôn phải hỏi lại đang nói cái nào.
>
> Địa chỉ cũ **vẫn dùng được**: liên kết trong những lá thư *để biết* đã gửi đi vẫn mở đúng nơi.

- **Có cả những bước không ai bấm** — hệ thống tự chuyển sang Kế toán sau khi Trưởng bộ phận ký, tự
  đánh dấu quá hạn, bàn giao khi một tài khoản bị vô hiệu hoá. Chúng ghi người thực hiện là *Hệ
  thống*.
- **Lịch sử chỉ ghi thêm** — không dòng nào sửa hay xoá được, kể cả bởi Quản trị hệ thống.
- **Có cả dòng TẢI XUỐNG BẢN CỨNG** `sửa 20/08`: *Tải bản scan bản cứng* và *Tải tệp đính kèm* —
  kèm người tải và thời điểm.
  Chúng không phải bước duyệt nên không có mũi tên chuyển trạng thái — chỉ nói ai đã lấy văn bản ra
  khỏi hệ thống, lúc hồ sơ đang ở trạng thái nào.
  > **Xem thì không ghi.** Mở tệp bằng nút *Xem* không để lại dòng nào — một dòng cho mỗi lần liếc
  > màn hình sẽ dìm chết những dòng nói về bước duyệt. Chỉ bấm *Tải xuống* mới ghi.
  > **Bản mềm CSBH và hợp đồng không ghi gì cả** `sửa 20/08`, kể cả lượt tải: chúng là thứ mở ra
  > đọc, mỗi hồ sơ vài lần một buổi, và phần mềm dựng lại chúng bất cứ lúc nào từ dữ liệu hồ sơ. Bản
  > scan thì khác — nó mang chữ ký khách hàng, và *"ai đã lấy nó ra khỏi hệ thống"* là một câu hỏi
  > kiểm soát thật.
  >
  > Hai loại dòng *Tải bản mềm CSBH* và *Tải bản hợp đồng* ghi trước 20/08 đã **xoá hẳn**: phần mềm
  > chưa bàn giao nên chúng đều là dấu vết của bản demo và của các lượt chạy thử.
- **Đọc được ở mọi trạng thái**, kể cả hồ sơ đã *Từ chối*, *Đã xoá* hay *Hết hiệu lực*. Đó chính là
  lúc cần nó nhất: không còn màn hình nào khác nói chuyện gì đã xảy ra.
- Phạm vi xem **giống hệt** phạm vi mở hồ sơ: thấy hồ sơ thì đọc được lịch sử của nó, không thấy thì
  không.

### Xem tệp không cần tải về

Mục **Bản cứng** liệt kê tệp đính kèm của hồ sơ. Mỗi tệp có **hai nút**: *Xem* và *Tải xuống*. *Xem* mở tệp ngay trong phần mềm — PDF và
ảnh hiện thẳng trong một hộp, có nút **Đóng** luôn nhìn thấy và nút *Tải xuống* nếu bạn vẫn cần bản
về máy.

Tệp Word, Excel và các định dạng khác **không xem trực tiếp được** — trình duyệt chỉ mở sẵn được PDF
và ảnh. Hộp xem nói thẳng điều đó thay vì bày một khung trắng.

> **Hộp xem tự khớp theo hình dáng tệp** `sửa 21/08`. Trước đây hộp có một cỡ cố định cho mọi thứ,
> nên tờ A4 ngang thành một dải bẹp kẹp giữa hai vệt xám, còn ảnh chụp thì nằm lọt thỏm. Nay hộp
> mang đúng hình của thứ bên trong: bản mềm khổ ngang thì hộp rộng ra, ảnh dọc thì hộp cao lên, và
> hộp giãn tới hết chỗ màn hình cho phép.
>
> Với **ảnh** thì phần mềm đo đúng kích thước thật của tệp. Với **bản mềm và hợp đồng** thì nó lấy
> khổ giấy của mẫu bạn đang chọn — đổi mẫu dọc sang mẫu ngang là thấy hộp đổi hình theo. Riêng
> **bản scan dạng PDF** bạn tải lên thì phần mềm chưa đọc được khổ trang, nên nó dựng khung theo A4
> dọc; scan lệch khổ thì dùng thanh phóng to của trình xem PDF như bình thường.

**Xem bản mềm** là một nút ở **góc trên bên phải**, ngang hàng với mã hồ sơ — mọi vai trò đọc được
hồ sơ đều thấy, kể cả Ban lãnh đạo. Bấm vào thì **nội dung hiện ra ngay** `sửa 23/08`, dựng bằng
đúng văn bản mẫu mà người lập đã chọn lúc gửi duyệt; tên mẫu ghi trên tiêu đề hộp. Dưới bản xem có
nút *Tải xuống* và *Đóng*.

> **Không ai chọn mẫu ở đây nữa** `sửa 23/08`. Trước đó hộp này hỏi bạn chọn mẫu trước khi xem. Mẫu
> giờ là một phần của hồ sơ: Trình dược viên chọn một lần lúc gửi duyệt, và từ đó **mọi người xem
> đúng một bản**.
>
> Vì sao đổi: mỗi mẫu có bố cục và **tập cột riêng** — một mẫu đủ mười cột để đối chiếu nội bộ, một
> mẫu bốn cột để đưa khách hàng. Khi ai xem cũng tự chọn thì hai người mở cùng một hồ sơ có thể thấy
> hai bảng giá khác nhau, và bản đem đi ký không nhất thiết là bản người lập đã đọc.
>
> **Hồ sơ còn Nháp thì khác**: nó chưa gắn mẫu nào, nên người lập vẫn chọn mẫu mỗi lần xem thử — đó
> đúng là quãng họ đang cân nhắc dùng bố cục nào. **Người khác mở hồ sơ Nháp** — trên thực tế là Ban
> lãnh đạo, vai trò duy nhất đọc được hồ sơ Nháp của người khác — sẽ được báo rằng *hồ sơ chưa gửi
> duyệt nên chưa có bản mềm* `sửa 24/08`. Không phải lỗi, và không phải làm gì cả: bản mềm có ngay
> khi Trình dược viên phụ trách gửi duyệt.
>
> **Hợp đồng vẫn hỏi chọn mẫu** mỗi lượt xuất, và **phải chọn** mới xem được: hệ thống không lưu hợp
> đồng nên không có gì để gắn mẫu vào.

Sau khi đã xem, trên bản đang xem có ô **Mẫu** để đổi sang mẫu khác mà không phải đóng hộp ra chọn
lại — ô này chỉ hiện khi có từ hai mẫu trở lên. Đổi bao nhiêu lần cũng được và không lần nào bị tính
là một lượt tải.

> **Không còn hỏi khổ giấy nữa** `sửa 20/08`. Khổ giấy nằm sẵn trong file mẫu mà Quản trị soạn: mẫu
> ngang thì bản mềm ra ngang. Hỏi riêng khổ giấy là bắt bạn ghép hai mảnh mà phần mềm ghép được —
> bạn chọn *bản trình bày*, còn khổ giấy đi theo nó. Tên mẫu trong ô chọn có kèm nhãn khổ giấy để
> biết trước mình sắp in ra tờ nằm ngang hay tờ đứng.

Mục **Hợp đồng** đứng riêng, chỉ Kế toán và Sale Admin thấy và chỉ sau khi tiếp nhận lần 1. Nó cũng
là **một nút duy nhất** `sửa 20/08` — *Xuất hợp đồng* — và nó mở đúng hộp xem như trên: chọn mẫu
hợp đồng trước, rồi xem, rồi tải. Trước đây có hai nút, trong đó nút xuất tải thẳng về máy: nghĩa là đường duy nhất để
biết hợp đồng trông thế nào lại là đường không cho nhìn trước, nên người ta tải, mở ra, thấy sai
mẫu, rồi tải lại — mỗi lượt là một dòng trong *Lịch sử*.

> **Vì sao nên xem thay vì tải.** Mỗi lần tải là một bản sao nằm lại trong thư mục tải xuống của
> máy bạn, ngoài tầm kiểm soát của phần mềm. Mở ra đối chiếu rồi đóng thì không để lại gì.

**Hạn xử lý**: mỗi bước chờ có hạn **14 ngày**, tính cả thứ bảy và chủ nhật.

| Lúc nào | Việc gì | Thư tới ai |
|---|---|---|
| Còn **24 giờ** tới hạn | **Đúng một** thư *"Nhắc: hồ sơ sắp quá hạn duyệt"*, và hồ sơ vào thẻ **Sắp quá hạn** | **Chỉ người phải thao tác** |
| Hết hạn | Thư *"Hồ sơ đã quá hạn duyệt"*, rồi hồ sơ chuyển *Quá hạn duyệt* | Người phụ trách bước ấy · TDV lập hồ sơ · mọi người đã tác động |
| **3 ngày sau đó** | Thư *"Hồ sơ quá hạn đã bị hệ thống xoá"*, hồ sơ chuyển *Đã xoá* | TDV lập hồ sơ · người phụ trách bước hồ sơ chết ở đó |

Hệ thống quét **5 phút một lần**, nên thư đi trong vòng tối đa 5 phút kể từ mốc trên.

> ### Quá hạn là hết — hồ sơ không cứu được nữa
>
> Từ khi hồ sơ chuyển *Quá hạn duyệt*, **không ai thao tác được lên nó nữa**, kể cả đúng người ở
> đúng bước. Mở hồ sơ ra thì **dải nút Thao tác trống rỗng** — không có nút nào để bấm, kể cả nút
> đính kèm tệp hay nút gỡ tệp. Việc phải làm là **lập một CSBH mới** cho khách hàng đó.
>
> Ba ngày sau, hệ thống tự chuyển nó sang *Đã xoá*. **Nội dung và lịch sử còn nguyên** — tra lại
> được mãi mãi bằng bộ lọc trạng thái ở màn hình Hồ sơ — nhưng nó rời khỏi mọi thẻ đếm việc.
>
> Vì vậy **24 giờ cuối là cơ hội cuối**, và đó là lý do có thẻ *Sắp quá hạn*.

Chỉ bốn trạng thái chờ mới có hạn — hồ sơ ở *Nháp* hay *Yêu cầu chỉnh sửa* nằm trên bàn TDV nên không
bao giờ quá hạn.

Mỗi lần hồ sơ sang bước chờ mới thì **đồng hồ chạy lại từ đầu**, và lần chờ mới có thư nhắc riêng của
nó — kể cả khi nó bắt đầu ngay trong ngày hồ sơ vừa bị trả lại.

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

### Mẫu hợp đồng (Quản trị hệ thống) `sửa 20/08`

*Mẫu hợp đồng* — file Word có ô trống, được trộn dữ liệu hồ sơ vào lúc Kế toán xuất hợp đồng. Nó
nằm ở **thẻ thứ hai của màn hình *Văn bản mẫu***, cùng chỗ với mẫu hồ sơ CSBH.

> **Đổi chủ.** Trước 20/08 mục này thuộc Sale Admin. Sale Admin không mất gì trong công việc hằng
> ngày: họ vẫn xuất hợp đồng và vẫn chọn mẫu nào lúc xuất — chỉ không tải mẫu lên nữa.

Cách làm **giống hệt thẻ mẫu hồ sơ** (mục 13.0): chọn file → soát bảng ánh xạ → chọn cột bảng sản
phẩm → **Lưu**. Khác đúng một chỗ: mẫu hợp đồng **không có mục bắt buộc nào**, vì muc 11.1 chỉ nói
về bản CSBH A4.

> **Bảng sản phẩm của hợp đồng cũng do hệ thống dựng** `sửa 20/08`. Trước đó nó là một bảng vẽ tay
> bốn cột với nhóm khoá `san_pham.`; giờ đặt `{{bang_san_pham}}` và **chọn cột** như mẫu hồ sơ. Cùng
> một cách làm cho cả hai loại mẫu, và tập cột đổi được mà không phải vẽ lại bảng.

> **Không có mẫu nào thì mọi lần bấm *Xuất hợp đồng* đều hỏng** — và Kế toán không vào được mục này
> để sửa. Màn hình hiện cảnh báo đỏ khi rơi vào tình trạng đó, và khi bạn xoá **mẫu cuối cùng** thì
> hộp xác nhận bắt gõ lại tên mẫu.

Có sẵn một file mẫu hợp đồng để sửa: `templates/mau-hop-dong-a4-doc.docx` trong bộ mã.

### Xem và tải văn bản trên màn hình hồ sơ

Mở một hồ sơ:

- **Xem bản mềm** — nút ở góc trên bên phải. Mọi vai trò xem được hồ sơ đều dùng được, kể cả Ban
  lãnh đạo. Chọn mẫu trong ô *Mẫu*, xem, rồi tải nếu cần.
- **Xuất hợp đồng** — chỉ Kế toán và Sale Admin, và chỉ sau tiếp nhận lần 1. Cũng mở ra xem trước,
  có ô chọn mẫu hợp đồng.

### Giấy tờ hồ sơ và Bản cứng

**HAI KHỐI RIÊNG** `sửa 23/08`, vì chúng là hai thứ khác nhau và do hai người đưa vào ở hai thời
điểm khác nhau:

| Khối | Là gì | Ai tải lên | Lúc nào |
|---|---|---|---|
| **Giấy tờ hồ sơ** | Giấy tờ đính kèm hồ sơ CSBH | Trình dược viên | Khi hồ sơ còn sửa được — *Nháp* hoặc *Yêu cầu chỉnh sửa* |
| **Bản cứng** | Bản giấy đã ký, scan lại | Sale Admin | Bước *Sale Admin đang xử lý* |

> **Vì sao tách.** Trước đó cả hai nằm chung một khối tên *Bản cứng*, nên Trình dược viên mở một hồ
> sơ **Nháp** ra là thấy vùng kéo thả nằm dưới đúng cái tiêu đề ấy — đọc ra là *"tôi đang tải bản
> cứng lên lúc hồ sơ còn nháp"*, một câu vô lý: bản cứng là bản giấy đã ký, nó chưa tồn tại cho tới
> khi Sale Admin trình ký xong ở bước B8.

Khối nào **chưa có tệp** vẫn hiện, kèm một câu nói ai tải lên và lúc nào — để câu hỏi *"bản cứng
đâu"* luôn có chỗ trả lời.

Mỗi tệp là một **thẻ có ảnh thu nhỏ** `sửa 20/08`. Rê chuột lên thẻ thì hiện hai nút ở giữa: **con
mắt** để xem ngay trong phần mềm, **mũi tên xuống** để tải về. Dấu **✕** ở góc trên bên phải là gỡ
tệp.

> Tệp ở đây gần như luôn là bản scan giấy tờ, mà người ta nhận ra chúng bằng cách nhìn chứ không
> bằng cách đọc tên `IMG_4821.jpg`. Ảnh thì hiện chính nó; PDF và Word hiện đuôi file.

Thêm tệp bằng **vùng kéo thả** ở cuối hàng: kéo file vào, hoặc bấm vào giữa để chọn từ máy.

**Ai làm được gì** `sửa 20/08`:

| Việc | Ai |
|---|---|
| Xem và tải | Mọi vai trò đọc được hồ sơ |
| Thêm và gỡ **bản cứng đã scan** | **Chỉ Sale Admin** |
| Thêm và gỡ **giấy tờ của hồ sơ** | **Chỉ Trình dược viên**, và chỉ khi hồ sơ còn sửa được |

> Trước 20/08 cả bốn vai trò trong luồng đều tải lên và gỡ được. Bản scan là bản giấy có chữ ký
> khách hàng, do chính Sale Admin in ra, trình ký rồi scan lại — không ai khác cầm nó trong tay, nên
> không ai khác có gì để mà tải lên. Ai không có quyền thì **không thấy dấu ✕ và không thấy vùng kéo
> thả**; thẻ vẫn xem và tải bình thường.
>
> Luật này đọc **theo từng khối** `sửa 23/08`. Ở bước *Sale Admin đang xử lý*, Sale Admin thấy vùng
> kéo thả và dấu ✕ trong khối *Bản cứng*, nhưng **không** thấy dấu ✕ trên giấy tờ Trình dược viên đã
> đính từ lúc lập.

Mỗi tệp tối đa **20MB**. Đường tải cấp riêng cho từng người và **hết hạn sau vài phút**; hết hạn thì
mở lại hồ sơ để lấy đường mới. Gỡ tệp chỉ gỡ khỏi hồ sơ.

## 10. Tìm kiếm và bộ lọc

*Hồ sơ CSBH* → **Bộ lọc** — **9 tiêu chí** `sửa 21/08`, kết hợp được với nhau:

| Tiêu chí | Cách nhập |
|---|---|
| Áp dụng từ / đến · Duyệt từ / đến | Chọn ngày |
| **Mã khách hàng** | **Chọn nhiều** — gõ mã hoặc tên để tìm |
| Tên khách hàng | Gõ chữ, tìm gần đúng |
| **Tên sản phẩm** | **Chọn nhiều** — gõ tên để tìm |
| **Nhóm sản phẩm** | **Chọn nhiều** |
| **TDV phụ trách** | **Chọn nhiều** |
| **Trạng thái** | **Chọn nhiều** |
| Hạn xử lý | Chọn một |

**Năm tiêu chí chọn được nhiều thứ cùng lúc** `mới 21/08`. Gõ vài chữ, danh sách hiện ra, bấm để
chọn — mỗi thứ đã chọn thành một **thẻ** bấm vào là gỡ. Chọn ba khách hàng thì ra hồ sơ của **cả
ba**; thêm hai trạng thái thì ra hồ sơ của ba khách hàng ấy **và** đang ở một trong hai trạng thái.
Trong một ô là *hoặc*, giữa hai ô là *và*.

> **Vì sao chọn thay vì gõ.** Mã khách hàng và nhóm sản phẩm là mã có thật trong danh mục. Trước đây
> phải nhớ và gõ đúng; gõ sai một ký tự thì kết quả rỗng, và không có gì phân biệt *"không có hồ sơ
> nào"* với *"bạn gõ sai mã"*.
>
> **Ô chọn TDV phụ trách chỉ liệt kê những người có hồ sơ trong phạm vi của bạn** — nên chọn ai
> trong đó cũng chắc chắn ra kết quả.
>
> Ba tiêu chí cũ đã bỏ: **địa chỉ đăng ký**, **mã số thuế**, và **người đề nghị** (gộp vào *TDV phụ
> trách*).

Ô **Hạn xử lý** đứng cuối, ngay sau *Trạng thái*:

| Chọn | Ra hồ sơ nào |
|---|---|
| — tất cả — | Không lọc theo hạn |
| **Sắp quá hạn (dưới 24 giờ)** | Còn dưới 24 giờ là tới hạn, và vẫn đang chờ ai đó xử lý |
| **Đã quá hạn** | Đã quá hạn — không thao tác được nữa, hệ thống xoá sau 3 ngày |

Đây cũng là chỗ hai thẻ *Sắp quá hạn* và *Quá hạn* trên trang Tổng quan dẫn tới: bấm thẻ rồi mở *Bộ
lọc* ra là thấy đúng ô này đang được chọn, và đổi sang nửa kia bằng một cú chọn.

- **Tên khách hàng** tìm kiểu *"có chứa"* và **không phân biệt dấu**: gõ `minh chau` ra "Minh Châu".
  Đây là ô cho lúc bạn chưa biết mình đang tìm ai; biết rồi thì dùng ô *Mã khách hàng* ở trên, chính
  xác hơn và chọn được nhiều người.
- **Tên sản phẩm** thì ngược lại — nó khớp **đúng sản phẩm bạn chọn**, không phải "có chứa". Muốn
  gom nhiều mặt hàng cùng dòng thì gõ từ khoá chung rồi chọn hết những gì hiện ra, hoặc lọc theo
  *Nhóm sản phẩm*.
- **Thời gian duyệt** là lúc hồ sơ **có hiệu lực** (sau bước tiếp nhận L2), không phải lúc TBP ký.
  Hồ sơ đang chờ chưa có thời gian duyệt nên không lọt vào kết quả lọc theo tiêu chí này.
- Điều kiện lọc **được giữ trong phiên làm việc**: chuyển màn hình rồi quay lại vẫn còn. Bấm
  **Xoá bộ lọc** để về danh sách đầy đủ.
- Trên điện thoại, bộ lọc nằm trong tấm trượt lên từ đáy màn hình.

**Xuất Excel** nằm ở góc trên bên phải màn hình này `mới 21/08` — xem mục 11.

Cột cuối bảng là **Hạn xử lý**: hồ sơ nào còn **dưới 24 giờ** là tới hạn mang nhãn đỏ *Sắp quá hạn*,
còn lại để trống. Đây là cột thay cho *Số dòng* — số dòng sản phẩm là thứ phải mở hồ sơ ra mới dùng
được, còn nhãn này quyết định thứ tự xử lý ngay trên danh sách.

Nhãn ấy dùng đúng một định nghĩa với thẻ *Sắp quá hạn* trên trang Tổng quan, nên bấm vào thẻ rồi đếm
số dòng có nhãn đỏ sẽ ra đúng con số vừa bấm.

## 11. Thống kê và xuất Excel

### Màn hình *Thống kê* `sửa 22/08`

Trang này trước mang tên *Báo cáo* và bày lại chính những con số của trang **Tổng quan**. Từ 22/08
nó trả lời một câu hỏi khác hẳn:

| Bạn muốn biết | Mở màn hình |
|---|---|
| Bây giờ có bao nhiêu hồ sơ đang chờ, cái nào sắp quá hạn | **Tổng quan** |
| Tuần vừa rồi làm được bao nhiêu, quý này so với quý trước | **Thống kê** |

Đầu màn hình là **bốn nút nhịp**: Tuần · Tháng · Quý · Năm. Mở lên là đã đúng nhịp của vai trò bạn —
trình dược viên theo tháng, Trưởng bộ phận, Kế toán và Sale Admin theo tuần, Ban lãnh đạo theo quý —
đổi lúc nào cũng được bằng một cú bấm.

**Toàn biểu đồ, không có bảng số** `sửa 23/08`. Sáu dạng hình, mỗi dạng trả lời một câu: đường
(*đang lên hay đang xuống*), cột chồng (*cơ cấu đổi thế nào*), phễu (*rơi rụng ở bước nào*), thanh
xếp hạng (*ai nhiều nhất*), phân tán (*ai lệch khỏi đám đông*), thanh ngưỡng (*còn cách hạn bao
xa*).

Hình xếp **hai cột** để so được bằng mắt mà không phải cuộn. Dưới mỗi hình là **chú thích màu**;
muốn biết từng chỉ số tính theo mốc nào thì mở khối **Cách tính** ở cuối trang — *"tháng này có bao
nhiêu CSBH"* là câu chưa đủ nghĩa, vì **lập** trong tháng, **gửi duyệt** trong tháng và **có hiệu
lực** trong tháng là ba con số khác nhau.

**Kỳ đang chạy** phủ một dải mờ trên đường, và cột của nó nhạt hơn. Nó chưa đủ ngày, nên điểm cuối
luôn thấp hơn thực tế — không đánh dấu thì mọi đường đều trông như đang rơi ở đoạn cuối.

### Theo dõi từng trình dược viên `mới 23/08`

Có ở **Ban lãnh đạo** (toàn công ty) và **Trưởng bộ phận** (những người đã gửi hồ sơ tới bàn bạn).

- **Xếp hạng** — mỗi dòng một người: số hồ sơ, nhãn xu hướng, và đường nhỏ sáu kỳ gần nhất. Nhãn xu
  hướng so *trung bình 3 kỳ đã đóng gần nhất với 3 kỳ trước đó*, lệch từ 15% mới đổi nhãn; **kỳ đang
  chạy không tham gia phép so**.
- **Bấm một dòng** để lọc cả màn hình theo người đó, bấm lại để bỏ chọn. Không mở màn hình mới.
- **Phân tán** (Ban lãnh đạo) — trục ngang số CSBH có hiệu lực, trục dọc tỷ lệ bị trả lại. Vùng xanh
  nhạt là nơi nên nằm.
- **Cơ cấu chất lượng** (Trưởng bộ phận) — mỗi thanh là **100% hồ sơ của người đó**: ký thẳng · trả
  lại 1 lần · trả lại từ 2 lần · từ chối · đang xử lý. Xếp theo phần *ký thẳng* giảm dần.
- **Số ngày sửa lại** (Trưởng bộ phận) — từ lúc bạn trả lại tới lúc TDV gửi lại. Quãng này ăn thẳng
  vào hạn 14 ngày của chính hồ sơ ấy.

> Bốn chỉ số hiệu quả — số CSBH có hiệu lực, tỷ lệ bị trả lại, số ngày duyệt, tổng giá thu về — đo
> **việc chạy hồ sơ CSBH**, **không đo doanh số bán hàng**. Phần mềm không có dữ liệu bán hàng.

Vài điều nên biết khi đọc con số:

- **Kỳ cắt theo giờ Việt Nam.** Hồ sơ có hiệu lực lúc 23:30 ngày cuối tháng thuộc tháng ấy. Tuần bắt
  đầu **thứ Hai**, nhãn ghi kèm khoảng ngày (*Tuần 34 · 17/08–23/08*).
- **Hồ sơ nhập từ dữ liệu cũ bị loại** khỏi mọi con số, vì chúng không đi qua luồng duyệt nên không
  có mốc nào để tính vào kỳ. Số bị loại ghi ngay dưới bảng.
- **Ban lãnh đạo** có thêm bảng *Chiết khấu bình quân theo nhóm sản phẩm* — sáu kỳ gần nhất, kèm số
  dòng vượt ngưỡng của từng nhóm.
- **Quản trị hệ thống** không thấy con số hồ sơ nào, vì hồ sơ không thuộc phạm vi dữ liệu của vai
  trò này — mọi ô sẽ là 0 và đọc ra nghĩa sai. Thay vào đó là **hoạt động của hệ thống theo kỳ**,
  đếm từ nhật ký, trong cửa sổ **6 tháng** gần nhất.

Địa chỉ cũ `/bao-cao` vẫn mở được và dẫn tới đúng màn hình này.

### Xuất Excel `sửa 21/08`

Nút **Xuất Excel** nằm ở màn hình **Hồ sơ CSBH**, góc trên bên phải — không phải ở trang Thống kê.

Đặt ở đó vì đó là màn hình có bộ lọc: file xuất ra chứa **đúng kết quả bạn đang xem**, nên số dòng
trong file bằng đúng con số *"N hồ sơ khớp điều kiện"* ngay dưới tiêu đề. Trước đây nút nằm ở trang
Thống kê, cách bộ lọc một màn hình, nên nó chỉ xuất được **tất cả** hồ sơ trong phạm vi.

Xuất chạy **chạy nền**: bấm xong bạn dùng tiếp màn hình khác, khi file sẵn sàng nút đổi thành
*Tải file (N dòng)*. Cột tiền là **số** nên cộng và lọc được ngay trong Excel.

**Tên file** `sửa 21/08` có dạng `CSBH_20260821_143012.xlsx` — chữ số là **ngày tháng và giờ phút
giây lúc file được dựng**, theo giờ Việt Nam. Năm đứng trước nên xếp thư mục tải về theo tên là ra
đúng thứ tự thời gian, và hai lần xuất cách nhau vài giây vẫn là hai file khác tên.

**Mỗi sản phẩm là một dòng riêng** `sửa 21/08`. Hồ sơ có 5 mặt hàng chiếm 5 dòng trong file; các
cột thông tin hồ sơ (mã hồ sơ, khách hàng, trạng thái…) **lặp lại y nguyên** trên cả 5 dòng, còn
khối cột cuối là số liệu của **riêng dòng đó**:

| Cột | Nội dung |
|---|---|
| Mã sản phẩm · Tên sản phẩm · Nhóm SP | Mặt hàng của dòng này |
| Giá bán Công ty · Giá bán buôn · CPBH · Giá thu về | Bốn con số của riêng dòng |
| Chiết khấu (%) · Ngưỡng (%) · Vượt ngưỡng | Chiết khấu của dòng và ngưỡng áp cho nó |

> **Bỏ hai cột *Số dòng sản phẩm* và *Tổng giá thu về*** `sửa 21/08`. Chúng là con số của cả hồ sơ
> nên lặp lại y nguyên trên mọi dòng của hồ sơ ấy, và cộng cả cột là cộng thừa gấp mấy lần. Không
> mất gì: số dòng là số dòng của hồ sơ trong file, còn tổng giá thu về là tổng cột *Giá thu về* —
> để Excel cộng hộ thì chính xác hơn.
>
> *Chiết khấu cao nhất (%)* vẫn còn, vì nó là một phép **lớn nhất** chứ không phải phép cộng: lặp
> lại bao nhiêu lần thì giá trị lớn nhất của cột vẫn đúng.

> Hồ sơ **chưa nhập sản phẩm nào** (Nháp mới lập) vẫn có một dòng trong file, các ô sản phẩm để
> trống — để không hồ sơ nào biến mất khỏi báo cáo mà bạn không biết.

> Khối cột này đứng **ở cuối**. Thứ tự 16 cột cũ giữ nguyên để công thức Excel bạn đã dựng trên file
> cũ không hỏng.

Vì vậy **số dòng trong file lớn hơn số hồ sơ**: màn hình ghi *"58 hồ sơ khớp điều kiện"* còn nút ghi
*"Tải file (312 dòng)"* — 312 là số dòng sản phẩm của 58 hồ sơ đó.

**Đổi bộ lọc thì phải bấm xuất lại** — nút quay về *Xuất Excel*. Đây là chủ ý: giữ liên kết cũ thì
bạn tải về một file của bộ lọc trước, mang số dòng của một danh sách không còn trên màn hình.

File kết xuất **chỉ người bấm xuất tải được**, và hết hạn lưu sau 24 giờ.

## 12. Người dùng (Quản trị hệ thống)

*Người dùng* — hai thẻ: **Người dùng** và **Hệ thống**.

### Tìm tài khoản

Ô tìm phía trên bảng khớp **họ tên**, không cần gõ dấu — gõ `do thi huong` ra "Đỗ Thị Hường".

Nó **không khớp tên tài khoản và không khớp email**, và đó là chủ ý: một ô tìm ăn cả email biến màn
hình quản trị thành chỗ tra địa chỉ thư của cả công ty. Cần tìm theo tên tài khoản thì cột *Tài
khoản* đứng ngay cạnh cột *Họ tên*, đọc theo hàng là ra.

Nhãn thẻ **không còn con số đếm**. Danh sách do máy chủ cắt trang nên con số duy nhất màn hình biết
là tổng *sau khi lọc* — dán nó lên nhãn thẻ thì nó tụt xuống mỗi lần bạn gõ vào ô tìm. Tổng vẫn nói
ra, ở thanh phân trang dưới bảng.

### Biểu mẫu tạo tài khoản chỉ có bốn ô

Họ tên, tên tài khoản, email, vai trò — **giống hệt nhau cho cả sáu vai trò**. Không có ô "Trưởng bộ
phận quản lý", không có ô "cấp trên": người dùng không quản lý lẫn nhau.

Việc *ai xử lý hồ sơ của ai* quyết định trên **từng hồ sơ**, lúc chuyển tay: Trình dược viên chọn
Trưởng bộ phận và Kế toán ngay ở bước Gửi duyệt, Kế toán chọn Sale Admin ở bước Tiếp nhận lần 1.

> Trước đây hai ô ấy nằm ở đây, và chúng đẻ ra một kiểu hỏng im lặng: gán nhầm một Kế toán vào ô
> người duyệt thì hồ sơ đi vào ngõ cụt — người đó không có thao tác *Ký số duyệt* nào để làm, hồ sơ
> đứng im tới lúc quá hạn và không màn hình nào nói vì sao. Bỏ trống ô ấy còn tệ hơn: Trình dược viên
> không gửi được hồ sơ nào cả, mà chỉ biết điều đó ở lần gửi đầu tiên.

### Không còn thứ tự bắt buộc, nhưng vẫn nên dựng theo thứ tự

Tạo tài khoản nào trước cũng được. Nhưng Trình dược viên chỉ **gửi** được hồ sơ khi đã có ít nhất một
Trưởng bộ phận và một Kế toán **đã kích hoạt tài khoản** để chọn — tài khoản mới tạo mà chưa đi qua
liên kết trong thư mời thì chưa xuất hiện trong ô chọn.

Nên dựng theo thứ tự này để không phải quay lại: **Trưởng bộ phận → Kế toán → Sale Admin → Trình
dược viên**.

### Sửa, vô hiệu hoá, gửi lại thư mời

- **Sửa** đổi được **họ tên, và chỉ họ tên**. **Vai trò cố định từ lúc tạo tài khoản** — không có
  chức năng đổi vai trò. Hồ sơ ghi thẳng tên người xử lý lên chính nó, nên đổi vai trò là bỏ rơi
  đúng những hồ sơ đang chờ người đó, và không ai khác cầm được. Cần đổi vai trò thì **vô hiệu hoá
  tài khoản cũ** (kèm bàn giao, xem dưới) rồi **tạo tài khoản mới**.
- **Vô hiệu hoá** chặn đăng nhập trong vòng một phút, kể cả khi người đó đang mở phần mềm. Đi qua
  **ba cửa** — xem mục dưới. Không có chức năng **xoá** người dùng: nhật ký kiểm toán tham chiếu tới
  tài khoản, xoá đi là mất dấu vết. Vô hiệu hoá là cách duy nhất để một tài khoản ngừng hoạt động.
- **Gửi lại thư mời** chỉ hiện với tài khoản chưa kích hoạt, và làm liên kết cũ chết ngay.

### Vô hiệu hoá: gõ lại tên, và bàn giao hồ sơ

Hộp thoại vô hiệu hoá hỏi ba thứ, theo thứ tự:

1. **Tài khoản này đang giữ bao nhiêu hồ sơ và bao nhiêu khách hàng** — hệ thống tự đếm và hiện ra
   ngay khi mở hộp thoại, kèm mã của tối đa 20 hồ sơ và 20 khách. *"Vô hiệu hoá tài khoản này sẽ
   chuyển 14 hồ sơ và 9 khách hàng"* là một câu khác hẳn *"vô hiệu hoá tài khoản này"*, và bạn phải
   đọc được câu thứ nhất trước khi quyết định.
2. **Người nhận bàn giao** — **bắt buộc** nếu còn hồ sơ **hoặc còn khách hàng**, và phải **cùng vai
   trò**, đang hoạt động, đã kích hoạt. Không chọn thì **không vô hiệu hoá được**.
3. **Gõ lại tên đăng nhập** của người bị vô hiệu hoá. Chỉ khác khoảng trắng hay chữ hoa thì vẫn
   nhận — chép từ màn hình sang là chuyện bình thường; cái cần chặn là bấm nhầm dòng.

   Tên đăng nhập chứ không phải họ tên: **họ tên không duy nhất**. Hai người trùng tên trong cùng một
   danh sách là chuyện bình thường, nên gõ đúng họ tên không chứng minh được bạn đang nhìn đúng dòng
   — mà đó là toàn bộ việc phép xác nhận này phải làm.

> **Vì sao bàn giao là bắt buộc.** Hồ sơ ghi thẳng id người xử lý lên chính nó. Vô hiệu hoá mà không
> chuyển giao là để lại những hồ sơ **không ai nhìn thấy và không ai thao tác được** — chúng không
> nằm trong hộp việc của ai, không lọt vào phạm vi của ai, và chỉ lộ ra khi có người đi tìm một hồ
> sơ cụ thể rồi không thấy đâu.

**Chuyển những hồ sơ nào**: mọi hồ sơ **chưa kết thúc** mà người đó đang giữ ở vai trò của mình —
kể cả bản **Nháp**, và kể cả hồ sơ **Đang có hiệu lực** (người phụ trách nó là người nhận thư khi
giá hoặc quy định chiết khấu đổi). Hồ sơ **Từ chối**, **Đã xoá** và **Hết hiệu lực** thì không, vì không ai còn
phải làm gì với chúng — trừ khi chúng thuộc một khách hàng vừa đổi tay, xem ngay dưới.

**Khách hàng đi cùng hồ sơ** — chỉ với Trình dược viên, vì *TDV phụ trách* là liên kết duy nhất giữa
khách hàng và người. Chuyển **mọi** khách của người đó, **kể cả khách chưa có hồ sơ nào**: đó chính
là loại khách dễ mồ côi nhất — không hồ sơ nào trỏ tới nên không đường nào khác với tới, và người
duy nhất còn nhìn thấy thì vừa bị khoá tài khoản. Vì thế một TDV chỉ có khách mà chưa lập hồ sơ nào
**cũng phải chọn người nhận**.

**Hồ sơ của một khách hàng đi theo khách hàng ấy** `mới 21/08` — **mọi** hồ sơ, kể cả *Từ chối* và
*Hết hiệu lực*. Người tiếp quản một khách hàng cần đọc được lịch sử chính sách của khách đó; và
không cho họ đọc thì màn hình *Hồ sơ CSBH* vẫn **bày hồ sơ ra** (nó tính phạm vi theo TDV phụ trách
khách hàng) trong khi bấm vào lại báo *không có quyền*. Chỉ hồ sơ **Đã xoá** đứng ngoài.

> Điều này áp dụng cho **cả hai** đường đổi tay: bàn giao lúc vô hiệu hoá tài khoản, và đổi *TDV phụ
> trách* của một khách hàng ở màn hình khách hàng.

**Người nhận được báo bằng email** `mới 21/08`: **một** lá thư cho cả lượt bàn giao, nói bạn vừa
được bàn giao bao nhiêu khách hàng và từ ai, kèm danh sách mã và tên khách. Thư không kể hồ sơ —
số hồ sơ phải xử lý thì *Việc của tôi* trên trang Tổng quan nói chính xác và luôn cập nhật.

**Trạng thái không đổi.** Chuyển giao là đổi người, không phải một bước của luồng duyệt: hồ sơ đang
ở *Chờ TBP duyệt* thì vẫn ở đó, chỉ là chờ một Trưởng bộ phận khác.

**Có vết trong lịch sử của từng hồ sơ.** Mở một hồ sơ vừa đổi tay ra là thấy dòng *Chuyển giao* kèm
lý do, đúng chỗ với các bước duyệt khác — không phải đi tìm trong nhật ký hệ thống.

**Bật lại** thì không hỏi gì: nó không làm hồ sơ nào kẹt — nhưng nó **không** trả lại hồ sơ hay
khách hàng nào. Bàn giao là một chiều.

### Không có mật khẩu mặc định

Tạo tài khoản **không đặt mật khẩu**. Hệ thống gửi thư mời tới địa chỉ đã khai, và **liên kết trong
thư đó là đường duy nhất** để tài khoản có mật khẩu. Trước khi người dùng đi qua liên kết, tài khoản
không đăng nhập được bằng bất cứ gì.

Nghĩa là bạn **không phải bàn giao mật khẩu** cho ai qua tin nhắn, giấy tờ hay lời nói — thứ vốn là
chỗ rò rỉ thường xuyên nhất. Đổi lại, **địa chỉ email phải đúng**: gõ nhầm thì thư mời đi vào hộp
thư của người khác, và người đó đặt được mật khẩu cho tài khoản. Đọc kỹ ô email trước khi bấm Tạo.

Liên kết hết hạn sau **72 giờ**; hết hạn thì bấm **Gửi lại thư mời**.

### Email phải thuộc tên miền của công ty `mới 26/08`

Hệ thống chỉ gửi thư tới những **tên miền đã khai lúc cài đặt** — thường là tên miền của công ty.
Nhập một địa chỉ ngoài danh sách đó thì màn hình báo lỗi ngay dưới ô *Email*, **kể ra các tên miền
đang được phép**, và **không tạo tài khoản nào**.

Đây là chốt chặn có ích chứ không phải phiền hà: tài khoản chỉ nhận được mật khẩu qua thư mời, nên
một địa chỉ không nhận được thư là một tài khoản không bao giờ dùng được — mà nó vẫn chiếm mất tên
đăng nhập và địa chỉ ấy.

Hai điều dễ nhầm:

- **Miền con thì được**. Khai `nutricare.vn` thì `an@hn.nutricare.vn` vẫn tạo được.
- **`nutricare.com.vn` KHÔNG phải miền con của `nutricare.vn`.** Đó là hai tên miền khác nhau, mỗi
  cái phải khai riêng.

Cần mở tài khoản cho một địa chỉ ngoài tên miền công ty — nhân sự thuê ngoài chẳng hạn — thì báo bộ
phận kỹ thuật **khai thêm tên miền ấy** vào cấu hình nhận thư. Không có đường vòng nào khác, và
không nên có: một tài khoản không nhận được thư của hệ thống thì cũng không đặt lại được mật khẩu
khi quên.

### Hạn xử lý và thư hỏng — thẻ *Hệ thống*

**Hạn xử lý (SLA)**: số ngày cho mỗi bước chờ. Đổi số này **tính lại hạn cho mọi hồ sơ đang chờ**,
kể cả hồ sơ nộp từ trước — rút ngắn hạn có thể làm một số hồ sơ chuyển sang *Quá hạn duyệt* ngay.

**Thư hỏng**: thư hệ thống không gửi được sau nhiều lần thử. Người phụ trách ở bước đó **không nhận
được thông báo**, nên họ chỉ biết có việc khi tự mở phần mềm. Bấm *Gửi lại* chạy lại đúng đường xử
lý cũ. Kết quả *"đã gửi thành công trước đó"* không phải lỗi — sự kiện đã đi lọt ở một lượt khác, và
thư được đánh dấu đã xử lý.

## 13. Sản phẩm, Chiết khấu, Văn bản mẫu

Ba mục menu riêng. **Sản phẩm** và **Chiết khấu** mọi vai trò vào được — vai trò không phải Quản trị
thấy đúng bảng dữ liệu, ở dạng chỉ đọc. **Văn bản mẫu** chỉ Quản trị hệ thống thấy.

### 13.0. Văn bản mẫu — hai thẻ `sửa 20/08`

Màn hình có **hai thẻ**: *Mẫu hồ sơ CSBH* và *Mẫu hợp đồng*. Cùng một cách làm việc — tải `.docx`
lên, ánh xạ ô trống, ban hành — nên chúng ở cùng một chỗ. Phần dưới nói về thẻ thứ nhất; thẻ *Mẫu
hợp đồng* xem mục 9.

#### Thẻ *Mẫu hồ sơ CSBH* `mới 19/08`

Bản mềm CSBH **sinh từ một mẫu Word do Quản trị hệ thống tải lên**, không dựng cứng trong phần mềm.
Thẻ này là chỗ quản mẫu ấy.

**Ba thao tác** `sửa 23/08`: **Thêm mẫu** ở góc trên bên phải, **Vô hiệu hoá** và **Dùng lại** ở
từng dòng. Cột *Trạng thái* nói mẫu nào đang dùng được.

> **Không xoá được mẫu nữa** `sửa 23/08`. Từ khi mẫu hồ sơ gắn vào hồ sơ lúc gửi duyệt, xoá một mẫu
> nghĩa là làm hỏng vĩnh viễn bản mềm của mọi hồ sơ đã dùng nó — mà hồ sơ thì khoá sửa từ lúc ấy, nên
> không ai chữa được.
>
> **Vô hiệu hoá làm đúng phần việc bạn cần**: mẫu biến khỏi ô chọn, không ai chọn nó nữa. **Hồ sơ đã
> gắn mẫu ấy vẫn xem được bản mềm bình thường.** Đổi ý thì bấm *Dùng lại* — không mất gì.
>
> Vô hiệu hoá đòi **gõ lại tên mẫu**; *Dùng lại* thì không đòi gì, vì nó không phá huỷ gì.

> **Không sửa được mẫu.** Muốn đổi câu chữ thì thêm mẫu mới rồi vô hiệu mẫu cũ: hồ sơ cũ giữ nguyên
> bản của nó, hồ sơ mới dùng bản mới. Sửa thẳng một mẫu đã gắn vào hồ sơ đã ký là sửa chính văn bản
> đã duyệt.

> **Không còn ban hành, không còn nháp.** Mọi mẫu trong danh sách đều dùng được ngay — lưu được là
> dùng được. Mọi phép kiểm dồn về lúc bấm *Lưu*, tức là lúc bạn còn đang mở file Word ra và sửa thêm
> một ô trống là xong.

**Trang thêm mẫu** làm một lượt, không có bước nào ở giữa:

1. **Chọn file `.docx`.** Phần mềm đọc ô trống ngay và **đoán sẵn** trường dữ liệu cho từng ô — khoá
   viết bằng tiếng Việt trùng luôn tên trường, nên phần lớn mẫu ánh xạ xong trước khi bạn chạm vào.
2. **Soát bảng ánh xạ** hiện ngay dưới ô chọn tệp. Ô nào phần mềm không đoán được thì tự chọn.
3. **Chọn cột của bảng sản phẩm** `mới 20/08` — xem dưới.
4. **Lưu** ở góc trên bên phải. Nó hỏi lại một lần, vì mẫu không sửa được sau khi lưu.

> **Ai chọn mẫu nào, và lúc nào** `sửa 23/08`. **Mẫu hồ sơ CSBH**: Trình dược viên chọn một lần
> trong hộp *Gửi duyệt*, và mẫu ấy gắn với hồ sơ — mọi người xem sau đó đều thấy đúng bản ấy, không
> đổi được. **Mẫu hợp đồng**: Kế toán hoặc Sale Admin chọn ở từng lượt xuất, vì hệ thống không lưu
> hợp đồng nên không có gì để gắn mẫu vào.

Hướng dẫn đặt khoá nằm ở cột bên phải và **tự cuộn trong hộp của nó**, không kéo cả trang — nút *Lưu*
luôn ở trong tầm mắt.

- **Khoá viết bằng tiếng Việt**, một nhóm `ho_so.` cho tất cả: `{{ho_so.ten_khach_hang}}`,
  `{{ho_so.cong_no}}`, `{{ho_so.ngay_ap_dung}}`, `{{ho_so.nguoi_de_nghi}}`.
- **Tên, địa chỉ và mã số thuế Công ty gõ thẳng vào file** `sửa 20/08`. Ba giá trị ấy giống nhau ở
  mọi hồ sơ nên không còn khoá nào cho chúng — một ô trống cho một giá trị không bao giờ đổi chỉ
  thêm đúng một bước có thể quên.
- **Định dạng không phải chọn** `sửa 20/08`. Tiền ra kiểu tiền, ngày ra `31/12/2026`, phần trăm hai
  chữ số — đi theo từng trường, không theo từng mẫu.
- **Khối chữ ký số**: `{{ho_so.chu_ky_so_TBP}}` in ra hai dòng — *TBP đã ký số* và ngày ký ở dòng
  dưới. Hồ sơ chưa ký thì chỗ ấy để **trống**.
- **Bảng sản phẩm KHÔNG vẽ trong Word.** Đặt ô `{{bang_san_pham}}` ở chỗ muốn có bảng; phần mềm thay
  nó bằng cả cái bảng, với **đúng số cột CPBH của từng hồ sơ**.
- **Lưu bị chặn nếu thiếu mục bắt buộc.** Bản A4 phải có đủ **10 mục** `sửa 24/08` ở phần *Yêu cầu
  hiển thị file*; thông báo **kể tên từng mục còn thiếu** `sửa 24/08`, và bảng hướng dẫn bên phải
  gắn sẵn dấu *bắt buộc* vào đúng những mục ấy — không phải tải file lên rồi mới biết. (Trước 20/08 là 13 — mục *thông tin công ty* rời
  khỏi danh sách cùng lúc với khoá của nó, và giờ do người soạn tự chịu trách nhiệm.)
  > **Bỏ ép *Trạng thái* và *Thời gian duyệt*** `mới 24/08`. Hai mục ấy **còn đổi** trong lúc hồ sơ
  > đi qua luồng duyệt: bản mềm xem ở bước Trưởng bộ phận ký sẽ in ra *Chờ kế toán duyệt lần 1* và
  > một ô *Thời gian duyệt* trống — ép mẫu phải có chúng là ép in ra một câu sai. Bạn **vẫn đặt ô
  > được** nếu muốn, và ba mẫu soạn sẵn kèm phần mềm vẫn in cả hai.
- **Có sẵn một mẫu mặc định cho mỗi khổ** ngay khi triển khai, để không phải chờ ai soạn mẫu mới xem
  được bản mềm. Chúng luôn nằm **cuối** danh sách.
- **Bộ file mẫu soạn sẵn** trong thư mục `templates/` của bộ mã: `mau-ho-so-a4-doc.docx`,
  `mau-ho-so-a4-ngang.docx`, một bản **rút gọn** gần sát mức tối thiểu (từ 24/08 nó rộng hơn đúng
  hai ô: *Trạng thái* và *Thời gian duyệt*, hai mục vừa thôi bị ép), và
  `mau-hop-dong-a4-doc.docx`. Tải một file về, sửa câu chữ trong Word, rồi tải lên. Bản demo
  (`make demo-mau`) nạp sẵn ba file đầu; mẫu hợp đồng thì không, ai cần tự tải lên.

##### Chọn cột của bảng sản phẩm `mới 20/08`

Mỗi mẫu tự khai muốn hiện cột nào. Đây là cách soạn **"bản đầy đủ cho nội bộ"** và **"bản gọn đưa
khách hàng"** mà không cần ai lập trình — người xem chọn mẫu nào thì được bảng ấy.

| Cột | Ghi chú |
|---|---|
| STT · Mã sản phẩm · Giá công ty · Giá bán buôn · **CPBH tổng** · Giá thu về · Tỷ lệ CK · Ghi chú | Tuỳ chọn |
| **Tên sản phẩm** | **Không tắt được** — bảng giá phải nói nó đang nói về mặt hàng nào |
| **Từng khoản CPBH** | Một lựa chọn duy nhất, bật thì hiện **hết** CPBH1…CPBHn |

> **CPBH tổng tắt được** `sửa 21/08`. CPBH là chi phí **nội bộ**: bản đưa khách hàng thì tắt cả
> *CPBH tổng* lẫn *từng khoản CPBH*, bản lưu nội bộ thì bật. Đổi lại, phần mềm **không còn tự bảo
> đảm** mục *CPBH* của muc 11.1 có mặt trên bản A4 — bạn soạn mẫu, bạn quyết.

> *Từng khoản CPBH* không tách ra chọn lẻ được: số cột bằng dòng nhiều khoản nhất của **từng hồ sơ**,
> mà bạn khai tập cột lúc soạn mẫu — trước khi biết hồ sơ nào sẽ dùng nó.

> Bỏ bớt cột làm bảng hẹp lại và **vừa khổ dọc dễ hơn nhiều**. Đủ mười cột thì gần như phải dùng A4
> ngang.

> Đây **không phải** mẫu hợp đồng — nó là **thẻ bên cạnh**, cùng màn hình, cùng người quản lý. Khác
> nhau ở luật: mẫu hồ sơ có mục bắt buộc theo muc 11.1, mẫu hợp đồng thì không có mục nào.

### 13.1. Sản phẩm

Quản trị hệ thống thấy **hai thẻ**: *Sản phẩm* và *Nhóm sản phẩm*. Vai trò khác chỉ thấy bảng sản
phẩm, ở dạng chỉ đọc.

Phía trên bảng có **ô tìm** và **ô chọn nhóm sản phẩm**, dùng chung hoặc riêng.

- Ô tìm khớp **tên sản phẩm** — đúng như nhãn của nó ghi. Nó **không khớp mã vật tư**; mã đã nằm ở
  cột đầu bảng và lọc theo nhóm thu hẹp nhanh hơn.
- **Không cần gõ dấu**: gõ `sua` ra "Sữa", gõ `dem` ra "Metacare Đêm", gõ `duong` ra "Đường".
- Khớp theo **chuỗi con**, nên nhớ mỗi chữ giữa tên cũng tìm được: gõ `care` ra cả "Nutricare Gold"
  lẫn "Metacare Đêm".

> Cả hai ô lọc chạy **ở máy chủ, trên toàn bộ danh mục**. Trước đây màn hình chỉ tải 200 sản phẩm
> đầu rồi lọc tại chỗ, nên vượt con số ấy là gõ đúng tên một mặt hàng có thật vẫn ra "không tìm
> thấy" — mà không gì báo cho bạn biết mình chỉ đang tìm trong một phần.

**Thẻ Sản phẩm** — thêm, sửa tên và trạng thái, đặt giá, nhập hàng loạt từ Excel.

- **Mã vật tư không sửa được** sau khi tạo. Hồ sơ CSBH đã lập đóng băng mã này.
- **Vô hiệu hoá** chỉ chặn hồ sơ **lập mới**. Hồ sơ cũ giữ nguyên sản phẩm và giá đã đóng băng.
  Nhưng nó **không im lặng**: mọi CSBH đang hiệu lực còn chứa sản phẩm ấy hiện ngay trong khối *Yêu
  cầu cập nhật* của người phụ trách, kèm một lá thư tới từng Trình dược viên. Vì thế hộp thoại bắt
  bạn **gõ lại mã vật tư** để xác nhận — đây là thao tác phá huỷ duy nhất của sản phẩm, vì không có
  đường xoá hẳn. Đổi tên hay **bật lại** thì không đòi gì.
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
Xoá nhóm đòi **gõ lại mã nhóm** — mã chứ không phải tên, vì hai nhóm trùng tên là chuyện có thật.

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

**Cột Id và hai ô lọc.** Mã hiện ở cột *Id*. Phía trên bảng có **hai ô chọn** — *Nhóm sản phẩm* và
*Loại khách hàng* — thay cho ô gõ tự do trước đây.

Hai ô ấy **giữ lại cả quy định chung**: chọn nhóm SUA thì danh sách gồm cả dòng riêng của SUA lẫn
dòng áp cho *mọi nhóm sản phẩm*, vì dòng chung ấy vẫn đang áp cho sản phẩm nhóm SUA. Giấu nó đi là
đưa ra một bức tranh thiếu đúng dòng đang có hiệu lực.

> Ô gõ tự do cũ khớp cả mã, cả phạm vi, cả con số ngưỡng đang hiện — nhưng nó chỉ tìm trong **200
> dòng đầu**, nên vượt con số đó là gõ đúng mã vẫn ra "không tìm thấy". Hai ô chọn lọc trên **toàn
> bộ** bảng quy định.

Cột **"Độ cụ thể"** đã bỏ. Nó là con số nội bộ để xếp thứ tự ưu tiên; cột *Áp dụng cho* ngay bên
cạnh đã nói rõ dòng nào hẹp hơn dòng nào, và câu hỏi *"hồ sơ này lấy ngưỡng từ đâu"* giờ trả lời
bằng cột *Id* cộng cột *QĐCK*.

- **Sửa chỉ đổi được *ngưỡng***. Hai ô phạm vi (nhóm · loại khách) không sửa được — đổi chúng
  là đổi thứ tự ưu tiên của cả bảng. Khai nhầm phạm vi thì **xoá dòng rồi khai lại**.
- **Sửa được cả ngày hiệu lực**, không chỉ ngưỡng. Dời sang ngày khác thì quy định bắt đầu ăn từ
  ngày mới — hồ sơ đã lập không đổi. Dời trúng ngày của một quy định khác **cùng phạm vi** thì hệ
  thống từ chối: hai dòng như vậy không phân xử được.
- **Quy định vô thời hạn**, không có ngày kết thúc. Có hiệu lực từ ngày khai cho tới khi bị xoá,
  hoặc cho tới khi một quy định cụ thể hơn khớp và thắng nó.
- **Sửa và xoá không làm đổi hồ sơ đã lập.** Mỗi dòng hồ sơ giữ ngưỡng đã chụp lúc lập; thay đổi ở
  đây chỉ áp dụng cho hồ sơ lập **từ đây về sau**.
- Muốn một quy định thôi áp dụng thì **xoá dòng**, hoặc khai một dòng cụ thể hơn đè lên. Xoá **không**
  làm đổi hồ sơ đã lập — mỗi dòng hồ sơ giữ ngưỡng đã chụp lúc lập.
- **Xoá đòi gõ lại mã quy định.** Và xoá **không im lặng**: mọi CSBH đã gửi duyệt còn dùng ngưỡng của
  quy định ấy hiện ngay trong khối *Yêu cầu cập nhật*, với ngưỡng mới là **rỗng** — không quy định
  nào phủ nữa, và cả trên màn hình từng hồ sơ. **Không có thư báo** — chênh lệch chỉ hiện trên màn
  hình.

> **Danh mục tra cứu đã bỏ.** Khối tỉnh/thành · bệnh viện · kênh bán dưới bảng quy định không còn:
> ngưỡng chỉ khớp theo **nhóm sản phẩm × loại khách hàng**, và ba danh mục ấy không còn ô nào để điền
> vào.

### 13.3. Văn bản mẫu (chỉ Quản trị hệ thống)

Xem **13.0** ở trên: một màn hình, hai thẻ — *Mẫu hồ sơ CSBH* và *Mẫu hợp đồng*.

> **Người ký đã gỡ khỏi phần mềm.** Yêu cầu cho chức năng này chưa đủ rõ: chưa xác định người ký
> dùng ở đâu trong luồng và ai gán cho hồ sơ nào. Sẽ dựng lại sau khi chốt yêu cầu.

## 14. Dùng trên điện thoại

Toàn bộ luồng duyệt làm được trên điện thoại, kể cả bước ký số của Trưởng bộ phận.

Dưới 1024px thanh bên **thu lại thành ngăn kéo**: chạm nút ba gạch ở góc trái thanh trên cùng để mở,
chạm ra ngoài hoặc chạm dấu X để đóng. Chọn một mục xong thì nó tự đóng.

Bảng dòng sản phẩm dưới 640px chuyển thành **thẻ**, mỗi sản phẩm một thẻ. **Không cột nào bị bỏ** —
bốn ô CPBH gấp vào dòng *Tổng CPBH*, chạm vào để mở.

Ô nhập tiền gọi **bàn phím số**. Xoay ngang máy giữa lúc đang gõ không làm mất nội dung.

Thanh trên cùng dưới 640px **giữ tên đăng nhập** và bỏ viên vai trò — nhãn như *"Quản trị hệ thống"*
quá dài cho bề ngang ấy. Muốn xem vai trò thì mở **menu tài khoản ▸ Thông tin tài khoản**.

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
