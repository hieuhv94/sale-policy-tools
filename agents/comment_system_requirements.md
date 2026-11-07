# YÊU CẦU CHỨC NĂNG BÌNH LUẬN TRÊN HỒ SƠ CSBH

**Phạm vi:** Bình luận trên hồ sơ Chính sách bán hàng của phần mềm CSBH.\
**Đối tượng đọc:** người xây tính năng (máy chủ, giao diện, kiểm thử).\
**Phiên bản:** theo phiên bản phần mềm (`VERSION`), không đánh số riêng.

Tài liệu này thay bản đặc tả "Comment System" chung chung trước đây (còn trong lịch sử git).
Mọi quyết định dưới đây đã được chốt khi rà soát cùng chủ sản phẩm ngày 06/11/2026; chỗ nào là
**lựa chọn của người viết** (không phải chủ sản phẩm chốt) thì ghi rõ *(đề xuất)* — người xây
được phép đổi những chỗ đó nếu có lý do, nhưng phải ghi lại vào nhật ký triển khai.

> Thứ tự hiệu lực của `CLAUDE.md` vẫn đứng: nếu tài liệu này mâu thuẫn với
> `agents/YEU-CAU-NGHIEP-VU-CSBH.md` thì YCNV thắng. Khi tính năng được làm, các luật nghiệp vụ ở
> đây phải được chép vào YCNV (thân bài **và** Phụ lục B) và `impl/docs/03-HUONG-DAN-SU-DUNG.md`.

------------------------------------------------------------------------

## 1. Mục đích

Các bên trong luồng duyệt (TDV, Trưởng bộ phận, Kế toán, Sale Admin, Ban lãnh đạo) cần **trao
đổi qua lại liên tục ngay trên một hồ sơ** — hỏi lại một dòng giá, nhắc người kia xem một chỗ,
gửi kèm tệp minh hoạ — thay vì gọi điện hoặc nhắn tin ngoài phần mềm rồi mất dấu vết.

Thành công nghĩa là: hai người cùng mở một hồ sơ nói chuyện được với nhau mà **không phải tải
lại trang**, và người được nhắc tên biết ngay trên chuông thông báo.

### 1.1. Không làm (non-goals)

| Không làm | Lý do |
|---|---|
| Bình luận trên khách hàng hay bất kỳ đối tượng nào khác | Chỉ cần trên hồ sơ CSBH |
| Định dạng chữ (đậm, nghiêng, danh sách, code), bộ chọn emoji | Chỉ cần chữ thường, xuống dòng, nhắc tên |
| Gửi email cho bình luận | Chỉ hiện ở chuông (xem 6.1) |
| Kiểm duyệt: người khác xoá hộ, khôi phục bình luận đã xoá | Không cần |
| Lịch sử chỉnh sửa (xem nội dung trước khi sửa) | Chỉ cần nhãn *Đã sửa* |
| Lưu nháp nội dung đang soạn | Tải lại trang thì mất — chấp nhận |
| Reply nhiều cấp | Một cấp là đủ |
| Ghim, tìm kiếm bình luận, gom thông báo, tuỳ chỉnh thông báo *(đề xuất)* | Không ai yêu cầu |
| Đẩy tin tức thời qua WebSocket/SSE | Chậm tối đa 30 giây là đủ (xem 5) |
| Dán ảnh bằng Ctrl+V | Không cần |
| Bình luận xuất hiện trên bản mềm, hợp đồng, báo cáo | Bình luận không phải văn bản đi ra giấy |

### 1.2. Thất bại dù chạy đúng (anti-goals)

- Người không mở được hồ sơ mà đọc được bình luận, tệp đính kèm, hay trích đoạn trong thông báo.
- Một lượt tự cập nhật làm mất chữ người dùng đang gõ, hoặc làm trang nhảy khỏi chỗ đang đọc.
- Bình luận lọt vào tờ giấy khách hàng ký.
- Tệp của bình luận đã xoá nằm mãi trong kho làm đầy ổ.

------------------------------------------------------------------------

## 2. Gắn vào đâu, ai thấy

### 2.1. Mỗi hồ sơ một luồng bình luận

- Bình luận gắn vào **một hồ sơ** (`pol.policy.id`), không gắn vào khách hàng.
- **Mỗi phiên bản là một luồng riêng.** Lập phiên bản mới thì bản mới bắt đầu với khu vực bình
  luận **trống**; bình luận của bản cũ ở lại bản cũ, vẫn mở ra đọc được.
- Bình luận **không phụ thuộc trạng thái hồ sơ**: ở mọi trạng thái — kể cả *Đang có hiệu lực*,
  *Hết hiệu lực*, *Đã xoá*, *Quá hạn duyệt* — ai mở được hồ sơ thì vẫn bình luận được như thường.
- Bản Nháp bị xoá thì **xoá hẳn dòng** (`0035`), nên bình luận và tệp của nó mất theo.

### 2.2. Quyền = phạm vi hồ sơ, không có luật riêng

**Ai mở được hồ sơ thì đọc, viết, reply, thả reaction được.** Ai không mở được thì không thấy gì.
Không có bảng quyền nào riêng cho bình luận: mọi phép kiểm dùng lại **đúng** luật phạm vi hồ sơ
đang có — `thuocPhamVi` và `assertPolicyInScope` ở
`impl/services/policy/src/policies/policies.service.ts` (bốn cột người cộng danh sách phạm vi,
và luật Kế toán chưa tới lượt `da_qua_tbp` của `0142`/`0157`).

Hệ quả, đã chốt:

- Phạm vi đổi theo bước duyệt nên **người thấy bình luận cũng đổi theo**. Kế toán chỉ thấy luồng
  bình luận khi đã tới lượt (sau khi TBP ký); lúc ấy họ đọc được **toàn bộ** trao đổi trước đó,
  kể cả từ lúc Nháp.
- Người đã từng trong phạm vi rồi mất quyền (đổi người duyệt, đổi TDV phụ trách) thì **thôi
  thấy** bình luận ngay.
- **Quản trị hệ thống không thấy bình luận** — họ không có phạm vi hồ sơ nào (YCNV 2.1, `0133`).
  Điều này là đúng ý: không có kiểm duyệt.
- **Ban lãnh đạo ĐƯỢC bình luận** (chốt 06/11/2026): đọc, viết, reply, thả reaction trên mọi hồ sơ
  — phạm vi của họ là mọi người dùng nên họ mở được mọi hồ sơ. Đây là **ngoại lệ có chủ ý** của luật
  "Ban lãnh đạo chỉ đọc" (SEC-13): các đường ghi bình luận khai thêm `BAN_LANH_DAO`, và SEC-13 có một
  danh sách miễn trừ ghi lý do, **chỉ** gồm các đường bình luận (và đường tải tệp của mục đích bình
  luận).
- **Ban lãnh đạo KHÔNG được nhắc tên và KHÔNG nhận thông báo bình luận** (chốt 07/11/2026), theo luật
  P296 (`0260`): *"Ban lãnh đạo không nhận bất kỳ thông báo nào"*. Họ không có trong danh sách `@`, và
  khi ai đó trả lời bình luận của họ thì cũng không có thông báo nào — họ chỉ thấy khi tự mở hồ sơ.

| Hành động | Tác giả | Người khác mở được hồ sơ | Người không mở được hồ sơ |
|---|---|---|---|
| Đọc bình luận, tải tệp | Có | Có | Không |
| Viết bình luận, reply | Có | Có | Không |
| Thả / gỡ reaction | Có | Có | Không |
| Sửa bình luận | Có | Không | Không |
| Xoá bình luận | Có | Không | Không |

Máy chủ kiểm quyền ở **mọi** đường, kể cả đường đọc tệp và đường hỏi thay đổi định kỳ. Giao diện
chỉ ẩn nút cho khớp; không được coi việc ẩn nút là phép kiểm.

------------------------------------------------------------------------

## 3. Bình luận

### 3.1. Nội dung

- **Chữ thuần**: chữ thường, xuống dòng, nhắc tên `@`, địa chỉ web. Không định dạng.
- **Lưu chữ thuần kèm danh sách mention** (mỗi mention là một user ID và vị trí trong chuỗi), **không
  lưu HTML**. Cách mã hoá cụ thể là việc của người xây.
- Hiển thị bằng nút chữ của React, **không bao giờ chèn HTML** — nên không có lớp lỗi "HTML/script
  độc", máy chủ không cần lọc HTML. Phải có ca kiểm gửi chuỗi kiểu `<script>` và thấy nó hiện ra
  nguyên văn.
- **Địa chỉ web tự thành liên kết**: chỉ chuỗi bắt đầu bằng `http://` hoặc `https://`. Mở **tab
  mới**, `rel="noopener noreferrer"`. `javascript:`, `www.` không giao thức… không thành liên kết.
- Emoji gõ bằng bàn phím của máy là chữ thường, không cần xử lý gì.
- Không cho gửi nội dung rỗng hoặc chỉ có khoảng trắng — **trừ khi có tệp đính kèm** *(đề xuất)*.
- Độ dài tối đa *(đề xuất)*: 5.000 ký tự. Tối đa 20 mention một bình luận *(đề xuất)*.
  Giới hạn khai ở **một chỗ** và giao diện đọc cùng con số (lối `0193`/`domain-policy`), máy chủ
  là chốt cuối.

### 3.2. Reply

- **Một cấp**: reply vào bình luận gốc; không reply vào reply. Muốn đáp một reply cụ thể thì nhắc
  tên tác giả của reply ấy.
- Bình luận gốc hiện số reply. Luồng có **hơn 3 reply** thì chỉ hiện **3 reply mới nhất** (sát ô
  trả lời — phần trao đổi đang diễn ra); phía trên có nút *Xem N phản hồi trước* mở thêm **từng đợt
  20** reply cũ hơn; mở hết thì nút thành *Thu gọn, chỉ hiện 3 phản hồi mới nhất* và cuộn về bình
  luận gốc. Reply mới (của mình hay tự cập nhật) luôn vào cuối và không bị thu gọn. Đường tải reply
  phân trang 20 mỗi lượt. (Chốt khi duyệt mockup.)
- Không cho reply mới vào bình luận gốc **đã xoá**; reply cũ vẫn hiện.

### 3.3. Sửa

- Chỉ tác giả sửa được, ở mọi trạng thái hồ sơ, miễn còn mở được hồ sơ.
- Sửa xong hiện nhãn **Đã sửa**. **Không có lịch sử chỉnh sửa**, không lưu nội dung cũ ở đâu cả.
- Sửa được thêm/gỡ tệp đính kèm. Danh sách mention tính lại theo nội dung mới; người **mới** được
  nhắc thì nhận thông báo, người đã nhắc từ trước thì không nhận lại.
- Không sửa được bình luận đã xoá.

### 3.4. Xoá

- Chỉ tác giả xoá được. Không ai xoá hộ, không có khôi phục.
- **Xoá mềm**: bình luận giữ chỗ trong luồng, hiện *"Bình luận này đã bị xoá"*; **không ai** xem lại
  được nội dung gốc trên giao diện. Reply của nó giữ nguyên.
- Bình luận đã xoá: không sửa, không reaction, không reply mới.
- Tệp đính kèm của bình luận đã xoá bị **dọn khỏi kho** (xem 7.3).

### 3.5. Thứ tự và tải

- Cũ ở trên, mới ở dưới — cả bình luận gốc lẫn reply. Sửa không đổi vị trí.
- Mở hồ sơ thì tải **20 bình luận gốc mới nhất**; nút *Xem bình luận cũ hơn* ở trên cùng tải thêm
  20 *(đề xuất)*. Tải thêm không làm mất vị trí cuộn.
- Thời gian theo **giờ Việt Nam** (hệ thống chạy một múi giờ, `ngayVN()`): *Vừa xong* · *N phút
  trước* · *N giờ trước* · *Hôm qua* · `dd/mm/yyyy`. Rê chuột hoặc chạm thì hiện giờ chính xác.

### 3.6. Không lưu nháp

- Nội dung đang soạn (bình luận, reply, bản đang sửa, tệp đã chọn) **chỉ nằm trong bộ nhớ trang**.
  Không lưu `localStorage`/`sessionStorage`/IndexedDB/máy chủ, không autosave.
- Gửi thất bại (lỗi mạng, lỗi máy chủ) thì nội dung **còn nguyên trong ô soạn** để thử lại.
- Tải lại trang, đóng tab, rời trang thì nội dung **mất**, không khôi phục.
- Rời trang khi ô soạn còn chữ thì trình duyệt **hỏi lại** (`beforeunload`). Đây chỉ là cảnh báo,
  không lưu gì.
- Lưu ý: điều hướng TRONG ứng dụng (router riêng) không kích hoạt `beforeunload` — người xây quyết
  có hỏi lại ở đường ấy không *(đề xuất: có, cùng một câu)*.

------------------------------------------------------------------------

## 4. Nhắc tên (mention)

- Gõ `@` thì mở danh sách gợi ý; gõ tiếp thì lọc theo **tên hoặc email**.
- Danh sách gồm đúng **những người đứng tên trên hồ sơ**: TDV phụ trách, TBP, Kế toán (chỉ khi đã
  tới lượt — `da_qua_tbp`), Sale Admin (khi đã được chọn) — và chỉ tài khoản **đang hoạt động**.
  **Không có Ban lãnh đạo** (2.2), không có Quản trị, không có ai ngoài phạm vi, không có chính mình.
- Mỗi dòng gợi ý: tên, email, vai trò; phần chữ khớp được tô đậm. Tối đa 10 dòng *(đề xuất)*.
- Phím: ↑/↓ di chuyển, **Enter chọn** (khi danh sách đang mở), Escape đóng. Chuột và chạm cũng chọn
  được. Danh sách phải có `role="listbox"` và đọc được bằng trình đọc màn hình.
- Trạng thái danh sách: *Đang tải…* · *Không tìm thấy người dùng* · *Không tải được danh sách*.
- Mention đã chọn là một **token gắn user ID**, hiện khác màu chữ thường. Đổi tên người dùng thì bình
  luận cũ hiện tên mới.
- **Máy chủ không tin danh sách mention của client**: kiểm lại từng user ID có tồn tại, đang hoạt
  động, và đang trong phạm vi hồ sơ; ID không hợp lệ thì từ chối cả bình luận.
- Người bị vô hiệu hoá: mention cũ vẫn hiện tên; không nhắc mới được; không gửi thông báo cho họ.
  Người nhận bàn giao không kế thừa mention cũ.

------------------------------------------------------------------------

## 5. Tự cập nhật (không tải lại trang)

**Mục tiêu đã chốt: mọi thay đổi hiện ra ở người đang xem chậm nhất 30 giây**, không cần tải lại.

**Cách làm: hỏi định kỳ, không đẩy** *(đề xuất, chủ sản phẩm đã đồng ý)*. Lý do: gateway hiện đọc
trọn phản hồi rồi mới trả (`impl/services/gateway/src/proxy/proxy.middleware.ts`), nên SSE/WebSocket
không đi qua được; và token truy cập 15 phút gửi qua header `Authorization` mà `EventSource`/WebSocket
không đặt được. Hỏi định kỳ tránh cả hai, không đụng hạ tầng.

| Chỗ | Nhịp hỏi | Ghi chú |
|---|---|---|
| Trang hồ sơ đang mở khu vực bình luận | **15 giây** | Hỏi *những gì đổi kể từ lần trước* của hồ sơ này |
| Chuông, mọi trang | **30 giây** (hạ từ 60, `NHIP_HOI_MS` ở `impl/apps/web/src/lib/thong-bao.ts`) | Người được nhắc có thể đang ở trang khác |
| Ngay sau khi chính mình gửi/sửa/xoá | Hỏi ngay | |
| Quay lại tab | Hỏi ngay | Tab ẩn thì **ngừng hỏi**, như chuông hiện nay |

Những gì tự cập nhật: bình luận mới, reply mới, sửa (nội dung + nhãn *Đã sửa*), xoá (chuyển sang
dòng *đã bị xoá*), reaction (số đếm), số trên chuông và danh sách thông báo.

Luật hiển thị:

- Đang ở cuối luồng: bình luận mới hiện ngay tại chỗ, tô nổi nhẹ trong chốc lát.
- Đang cuộn lên đọc cũ: **không tự cuộn**, hiện chỉ báo *"N bình luận mới"* bấm để xuống.
- Thread đang thu gọn: chỉ tăng số reply.
- **Không bao giờ** làm mất chữ, tiêu điểm hay con trỏ trong ô soạn.
- Không hiện trùng: bình luận của chính mình vừa gửi không hiện hai lần (khử trùng theo ID).
- Bình luận mình đang **sửa** hoặc đang **trả lời** bị tác giả khác xoá *(chỉ xảy ra với reply vào
  bình luận gốc của người khác)*: hiện câu báo rõ; nội dung đang soạn vẫn còn cho tới khi người dùng
  tự huỷ; gửi reply thì máy chủ từ chối với mã lỗi riêng.
- Lượt hỏi hụt (mất mạng): **nuốt có lý do** như chuông hiện nay (khai ở `NUOT_CO_LY_DO`), lượt sau
  hỏi tiếp và lấy bù mọi thứ đã lỡ — vì mỗi lượt hỏi "kể từ mốc lần trước".
- Mất quyền giữa chừng: lượt hỏi kế tiếp nhận 403/404 → khu vực bình luận chuyển sang câu *"Bạn không
  còn quyền xem hồ sơ này"*, ngừng hỏi.
- Đánh dấu thông báo đã đọc ở một tab thì các tab khác cập nhật (dùng `BroadcastChannel` như `0242`;
  jsdom không chuyển tin — bộ kiểm dùng bản giả).

Cái giá đã biết: số request tăng (chuông gấp đôi; thêm 4 lượt/phút cho mỗi tab đang mở một hồ sơ).
Mỗi lượt là một câu truy vấn nhỏ có chỉ mục — chưa đo trên chồng demo, cần đo và ghi vào nhật ký.
Muốn nhanh hơn về sau thì thay cơ chế hỏi bằng kênh đẩy; giao diện không phải đổi.

------------------------------------------------------------------------

## 6. Thông báo

### 6.1. Chỉ trên chuông — ngoại lệ có chủ ý của `0096`

Luật hiện có (`0096`): *thông báo trên web = người nhận thư, không hơn không kém*. **Bình luận là
ngoại lệ đầu tiên và có chủ ý**: chỉ ghi thông báo trên web, **không gửi email**. Lý do: bình luận là
trao đổi nhanh, gửi thư cho từng câu sẽ ngập hộp thư. Phải ghi chú ngoại lệ này tại chỗ trong
`notification` để người sau không "sửa cho đồng bộ".

### 6.2. Ai nhận

- Người **được nhắc tên** trong bình luận hoặc reply.
- **Tác giả bình luận gốc** khi có reply mới.
- Không gửi cho chính người vừa hành động (tự nhắc mình, tự trả lời mình).
- Một người chỉ nhận **một** thông báo cho một bình luận, dù vừa được nhắc vừa là tác giả gốc, dù bị
  nhắc nhiều lần.
- Chỉ người **đang trong phạm vi** hồ sơ và tài khoản đang hoạt động.
- **Không bao giờ gửi cho Ban lãnh đạo** (P296, `0260`) — kể cả khi ai đó trả lời bình luận của họ.
  Tra người nhận qua đúng đường `users/mail-targets` của identity, nơi luật `KHONG_NHAN_THONG_BAO` đã
  chốt sẵn; không tự lọc lại ở `notification`.
- Reaction **không** sinh thông báo. Sửa/xoá không sinh thông báo (trừ người mới được nhắc khi sửa).

### 6.3. Bậc và câu chữ (đã chốt)

- Thông báo bình luận là **bậc VIỆC** (`0192`): tính vào **con số** trên chuông, có **kẻ dọc xanh**
  ở mép trái dòng (`0196`).
- Câu chữ **đúng như chủ sản phẩm viết**:
  - *"Nguyễn Văn A đã nhắc đến bạn trong một bình luận"*
  - *"Nguyễn Văn A đã phản hồi một bình luận của bạn"*

  Đây là câu KỂ, lệch lối *câu mệnh lệnh* của bậc VIỆC (`0195`). Không mâu thuẫn thật: thông báo
  bình luận chỉ có một bậc nên bất biến *"hai bậc cho hai tiêu đề khác nhau"* không áp dụng. Ghi chú
  tại chỗ để không ai "sửa cho đúng lối".
- Mỗi dòng trên chuông:

  ```
  Nguyễn Văn A đã nhắc đến bạn trong một bình luận
  CSBH-2026-000123 · Nhà thuốc Minh Châu
  "Anh xem lại giá dòng Sữa X giúp em..."
  ```

  Dòng 3 là **trích đoạn** (cắt khoảng 100 ký tự *(đề xuất)*, mention hiện bằng tên).
- Hết là việc khi người dùng **bấm vào**, **đánh dấu đã đọc**, hoặc — riêng thông báo bình luận —
  khi **chính bình luận ấy hiện trên màn hình của họ** (chốt 06/11/2026): đang trao đổi trên trang hồ
  sơ thì con số trên chuông không tăng vô ích. Các tab khác của cùng người dùng cập nhật theo.
- **Kanban *Việc của bạn* không đổi** — cột ấy nói về trạng thái hồ sơ, không về bình luận.
- Bấm vào thì mở hồ sơ, cuộn tới đúng bình luận và tô nổi nó trong chốc lát.
- Người nhận đã mất quyền xem hồ sơ: dòng thông báo **chỉ còn câu tiêu đề**, không mã hồ sơ, không
  tên khách, không trích đoạn; bấm vào ra câu *"Bạn không còn quyền xem hồ sơ này"*. Phép kiểm làm
  **lúc đọc**, không lúc ghi.

Rủi ro đã nêu với chủ sản phẩm: trao đổi dồn dập đẩy con số trên chuông lên nhanh, các việc duyệt hồ
sơ thật có thể lẫn vào giữa.

------------------------------------------------------------------------

## 7. Tệp đính kèm

### 7.1. Luật

- Bình luận và reply đính kèm được tệp, qua **nút chọn tệp** hoặc **kéo thả** vào ô soạn. **Không có
  dán bằng Ctrl+V.**
- Mặc định *(đề xuất, cấu hình được)*: ảnh JPG/PNG/WebP · PDF · DOCX · XLSX; tối đa **5 tệp** một bình
  luận, **10MB** một tệp. Máy chủ kiểm **loại tệp thật** (byte đầu), không chỉ đuôi tệp.
- Trước khi gửi: thấy tên, dung lượng, tiến trình tải lên; gỡ được; tải hỏng thì thử lại hoặc gỡ.
  Đang tải lên thì nút Gửi xám.
- Hiển thị: ảnh có ô xem nhỏ (cỡ tối đa cố định, không vỡ bố cục), bấm mở **hộp xem ảnh sẵn có**;
  tệp khác hiện biểu tượng theo loại, tên (dài thì rút gọn, rê vào thấy đủ) và dung lượng.

### 7.2. Lưu trữ và quyền

- **Dùng lại đường tệp sẵn có** của service `document` (`POST /files`, MinIO riêng tư,
  `doc.stored_file`), thêm **một mục đích tệp mới** vào `doc.file_purpose` cho bình luận.
- Quyền đọc tệp tính theo **phạm vi hồ sơ chủ bình luận** — `document` hỏi `policy` (đúng luật
  phạm vi của hồ sơ, có luật Kế toán chưa tới lượt), không dùng bốn cột người của `assertCanRead`.
  Thêm điều kiện của chính bình luận: tệp đang gắn một bình luận **chưa xoá**, hoặc tệp **chưa gắn**
  mà chính người hỏi vừa tải lên. Không đủ điều kiện thì **404** (không phải 403 — 403 là xác nhận
  cho người dò ID rằng tệp có thật). *(chốt khi làm `0263`)*
- Gỡ tệp bằng cách **sửa** bình luận; đường xoá rời một tệp từ chối tệp bình luận (409). Tệp bình
  luận không hiện ở danh sách tệp của hồ sơ, và lượt tải nó không ghi vào *Lịch sử*.
- Ban lãnh đạo tải lên được — **chỉ** tệp bình luận.
- Không có URL công khai vĩnh viễn; tải về đi qua máy chủ như các tệp khác.

### 7.3. Dọn tệp (đã chốt: phải dọn để không đầy ổ)

Tệp bị **xoá khỏi kho** ở **lượt dọn tự động kế tiếp** của `sla-worker` — cùng chỗ các lượt dọn
dữ liệu khác, hiện trên *Vận hành → Lịch tự động* (`0251`) — khi:

- bình luận chứa nó đã bị xoá;
- nó bị gỡ khi sửa bình luận;
- nó được tải lên nhưng không gắn vào bình luận nào **quá 24 giờ** (người dùng bỏ dở, hoặc tải lại
  trang làm mất bình luận đang soạn).
- hồ sơ Nháp chứa nó đã bị xoá hẳn (dòng gắn mất theo, tệp thành *chưa gắn*).

Kho tệp không xoá được một tệp thì dòng của tệp **giữ nguyên** để lượt sau thử lại, và lượt dọn ghi
**lỗi** trên trang Vận hành. *(chốt khi làm `0263`)*

Lưu ý: bản chụp kho tệp trong sao lưu giữ tệp bằng **liên kết cứng** (`0250`), nên dung lượng ổ chỉ
thật sự trả lại khi các bản sao lưu cũ chứa tệp ấy bị xoay vòng bỏ đi.

------------------------------------------------------------------------

## 8. Reaction

- Bộ cố định 6 emoji: 👍 ❤️ 🎉 👀 🚀 😄. Không có bộ chọn emoji nào khác.
- Bấm thì thả, bấm lại thì gỡ. Mỗi người tối đa **một lần mỗi loại** trên một bình luận (máy chủ
  chốt bằng ràng buộc duy nhất).
- Hiện số đếm theo từng loại; rê/chạm vào thì thấy danh sách người đã thả *(đề xuất)*.
- Không thả được trên bình luận đã xoá. Không sinh thông báo.

------------------------------------------------------------------------

## 9. Giao diện

### 9.1. Chỗ đặt

Một khối **Bình luận** trên trang hồ sơ (`ChiTietHoSo`). Vị trí trong bố cục hai cột hiện tại là
việc của người xây *(đề xuất: cuối cột chính, trên khối Lịch sử)*. Tiêu đề khối có số bình luận.

### 9.2. Một bình luận

Ảnh đại diện tròn 32px (chữ cái đầu nếu không có ảnh) · tên · thời gian · nhãn *Đã sửa* · nội dung ·
tệp · reaction · số reply · menu thao tác. Menu (hiện khi rê chuột, khi có tiêu điểm, và **luôn hiện
trên thiết bị cảm ứng** — lối `0132`): *Trả lời* · *Sao chép liên kết* · *Sửa* (tác giả) · *Xoá*
(tác giả, nút đỏ, hỏi xác nhận bằng `HopThoaiXacNhan`). Reply thụt lề, có đường nối mảnh màu trung
tính.

### 9.3. Ô soạn

- Ô nhập nhiều dòng **tự viết**, không thư viện soạn thảo; tự giãn tới chiều cao trần rồi cuộn bên
  trong. Chữ gợi ý: *"Viết bình luận…"*.
- **Enter gửi**, **Shift+Enter xuống dòng**; khi danh sách mention đang mở thì Enter **chọn người**.
  Trên điện thoại *(đề xuất)*: Enter xuống dòng, gửi bằng nút.
- Chế độ trả lời: hiện rõ *"Đang trả lời Nguyễn Văn A"* kèm nút huỷ. Chế độ sửa: nút đổi thành
  *Lưu*, có *Huỷ*.
- Đang gửi thì nút Gửi xám (chống gửi trùng). Gửi lỗi: câu lỗi ngay dưới ô (lỗi của một ô — `0088`),
  giữ nội dung, có *Thử lại*.

### 9.4. Trạng thái

| Trạng thái | Câu chữ |
|---|---|
| Chưa có bình luận | *Chưa có bình luận nào. Hãy bắt đầu trao đổi.* |
| Đang tải | Khung xương 3 bình luận |
| Đang tải thêm | Biểu tượng xoay ở nút *Xem bình luận cũ hơn* |
| Không tải được | *Không tải được bình luận.* + *Thử lại* |
| Gửi lỗi | Câu theo mã lỗi ở `loi.ts` + *Thử lại* |
| Tải tệp lỗi | *Tải tệp lên không thành công.* + *Thử lại* / *Gỡ* |
| Không có người khớp | *Không tìm thấy người dùng* |
| Mất quyền | *Bạn không còn quyền xem hồ sơ này.* |
| Bình luận đã xoá | *Bình luận này đã bị xoá.* (chữ mờ) |
| Có bình luận mới khi đang cuộn lên | *N bình luận mới* |

### 9.5. Luật chung của repo phải theo

- Mọi câu chữ **tiếng Việt**; không lộ tên trường, mã trạng thái, chữ không dấu (`0088`).
- Mỗi mã lỗi mới của máy chủ **khai câu ở `impl/apps/web/src/lib/loi.ts`** cùng lượt
  (`tests/web/loi.test.tsx` quét mã nguồn máy chủ).
- **Không thêm thư viện vào gói giao diện** (hiện chỉ `react`, `react-dom`, `@csbh/domain-policy`);
  trần FE-38 250KB sau nén có `tests/web/bundle.test.ts` canh. Biểu tượng dùng bộ đang có trong repo.
- Màu đọc từ token ở `tokens.css`, đủ tương phản ở cả sáng lẫn tối; vùng chạm 44px trên cảm ứng
  (`--vung-cham`).
- Bàn phím dùng được mọi thao tác; nút chỉ có biểu tượng phải có `aria-label`; gửi thành công/thất
  bại được thông báo cho trình đọc màn hình (`aria-live`).

### 9.6. Liên kết tới một bình luận

Dạng `/ho-so/<id>#binh-luan-<commentId>`, dùng cho *Sao chép liên kết* và cho thông báo. Router
`di()` đã tách phần `#` từ `0255` (`impl/apps/web/src/lib/router.tsx`), nhưng **không tự cuộn tới
phần tử** sau khi chuyển trang — khối bình luận tự đọc `location.hash` lúc dựng và lúc `hashchange`.
Mở liên kết tới bình luận chưa nằm trong 20 bình luận mới nhất thì tải tới đủ để thấy nó; bình luận
đã xoá thì cuộn tới dòng *đã bị xoá*.

### 9.7. Chốt khi duyệt mockup (07/11/2026)

Mockup đã duyệt: https://claude.ai/artifact/M9CzyKU338eAmjFuVpMip9 (nguồn
`artifacts/binh-luan-mockup.html`). Những điểm sau là luật, không còn là đề xuất:

- **Vai trò hiện cạnh tên** người viết (*Trưởng bộ phận*, *Kế toán*…).
- **Sửa và trả lời ngay tại chỗ**: ô sửa mở trong chính bình luận; ô trả lời mở ở cuối luồng, có dòng
  *Đang trả lời …* và nút huỷ. Ô soạn chung ở cuối khối chỉ để viết bình luận gốc.
- Ảnh đại diện **32px** cho bình luận gốc, **28px** cho reply.
- Nút thao tác: *Trả lời* + *Thao tác khác* (menu: *Sao chép liên kết* · *Sửa* · *Xoá bình luận* —
  Xoá màu đỏ, sau đường kẻ). Hiện khi rê/tiêu điểm, luôn hiện ở khổ cảm ứng.
- Cảm xúc là ô nhỏ bo góc 6px; ô của mình viền và nền màu thương hiệu.
- Thông báo trên chuông: dòng trích đoạn **in nghiêng** dưới dòng mã hồ sơ · tên khách.
- Đầu khối có dòng nhỏ *Tự cập nhật · N giây trước* (ẩn ở khổ điện thoại).
- Bình luận mới tô nền nhạt rồi tắt dần trong 2,4 giây; tắt hẳn khi người dùng chọn giảm chuyển động.
- Ở khổ điện thoại, ô soạn chung dính đáy màn hình.

------------------------------------------------------------------------

## 10. Máy chủ

- Bình luận nằm **trong service `policy`** *(đề xuất)*, schema `pol`, không tách service thứ 12 —
  luật phạm vi đã ở đó; tách ra thì phải sửa ba danh sách gõ tay (`make demo`, `xuat-chuyen-may`,
  `luu-log.sh`), gateway, sao lưu và `ban-ke`.
- Bảng mới đi qua **migration SQL thuần** đặt tên theo mã thay đổi. Bảng kê chuyển máy (`ban-ke`) quét
  mọi bảng nên tự phủ; vẫn phải kiểm lại bằng một lượt diễn tập.
- Mọi đường ghi khai `@Roles` đủ năm vai trò trong luồng (không `QUAN_TRI`) **cộng** phép kiểm phạm
  vi; SEC-13 ở `tests/http/security.test.ts` sẽ quét chúng.
- Không tin `authorId` từ client — tác giả lấy từ token. Sửa/xoá bằng cách đổi ID trên request phải
  bị chặn.
- Thông báo đi qua **outbox** sang `notification`; nhật ký tạo/sửa/xoá đi qua outbox sang `audit`
  (ghi *ai, lúc nào, hành động*; **không lưu nội dung**).
- **Giới hạn tần suất** bằng `RateLimiter` sẵn có ở gateway
  (`impl/services/gateway/src/proxy/rate-limit.ts`), thêm luật cho gửi bình luận và tìm người để
  nhắc *(đề xuất: 30 bình luận/phút/người, 60 lượt tìm/phút/người)*.
- Đường *"những gì đổi kể từ mốc X"* phải trả cả bình luận mới, đã sửa, đã xoá và reaction đổi — mốc
  lấy từ **máy chủ** (không tin đồng hồ trình duyệt), dùng một cột thời gian/số thứ tự đơn điệu để
  không lọt bản ghi ghi cùng một transaction (bẫy `now()` của `0126`).
- `internal.controller` của `policy` (đường bản mềm, hợp đồng, báo cáo đọc) **không** trả bình luận —
  có ca kiểm ghim.
- Hiệu năng *(đề xuất, đo trên chồng demo)*: tải 20 bình luận và lượt hỏi thay đổi P95 < 300ms;
  gửi bình luận P95 < 1 giây.

------------------------------------------------------------------------

## 11. Tiêu chí nghiệm thu

Mỗi ca phải có ca kiểm tự động ở đúng tầng (http với Postgres thật, hoặc `tests/web`), và được
**phá lại** theo luật của repo.

**Bình luận**

1. Gửi bình luận hợp lệ → lưu và hiện. Rỗng / chỉ khoảng trắng (không tệp) → bị từ chối.
2. Quá độ dài → bị từ chối, câu lỗi tiếng Việt.
3. Chuỗi `<script>…` hiện nguyên văn, không chạy.
4. `https://…` thành liên kết mở tab mới có `noopener`; `javascript:…` không thành liên kết.
5. Tác giả sửa → nội dung mới + *Đã sửa*. Người khác sửa → 403.
6. Tác giả xoá → *Bình luận này đã bị xoá*, reply còn. Người khác xoá → 403.
7. Bình luận đã xoá: không sửa, không reaction, không reply mới được.
8. Reply vào reply → bị từ chối.
9. Tải thêm: 45 bình luận → mở thấy 20 mới nhất, *Xem bình luận cũ hơn* hai lần thấy đủ 45, không trùng.
10. Gửi lỗi mạng → nội dung còn trong ô. Tải lại trang khi đang soạn → nội dung mất.
11. Bình luận được ở hồ sơ *Đang có hiệu lực*, *Hết hiệu lực*, *Quá hạn duyệt*.
12. Phiên bản mới → khu vực bình luận trống; bản cũ vẫn đọc được bình luận cũ.
13. Bản mềm, hợp đồng, báo cáo không chứa chữ nào của bình luận.

**Phạm vi**

14. Người ngoài phạm vi: đọc, viết, tải tệp, hỏi thay đổi → đều bị chặn.
15. Kế toán trước khi TBP ký không thấy luồng; sau khi ký thấy **toàn bộ**, kể cả bình luận lúc Nháp.
16. Đổi người duyệt → người cũ thôi thấy ngay ở lượt hỏi kế tiếp.
17. Quản trị hệ thống không thấy bình luận.
18. Giả mạo tác giả → máy chủ bỏ qua, tác giả là người cầm token.

**Mention**

19. Gõ `@` mở danh sách; lọc theo tên và theo email đều ra đúng.
20. Danh sách không có người ngoài phạm vi, không có tài khoản bị vô hiệu hoá, không có Ban lãnh
    đạo, không có chính mình.
21. Gửi mention bằng ID người ngoài phạm vi / không tồn tại / đã vô hiệu hoá → bị từ chối.
22. Nhắc nhiều người → mỗi người một thông báo; nhắc một người ba lần → một thông báo.
23. Sửa thêm người mới → chỉ người mới nhận thông báo.
24. Đổi tên người được nhắc → bình luận cũ hiện tên mới.

**Thông báo**

25. Được nhắc → dòng chuông đúng câu *"… đã nhắc đến bạn trong một bình luận"*, bậc VIỆC, tăng con số.
26. Có reply vào bình luận của mình → *"… đã phản hồi một bình luận của bạn"*.
27. Tự nhắc mình / tự trả lời mình → không có thông báo.
28. **Không có email nào** được gửi cho bình luận (đối chiếu Mailpit).
29. Bấm thông báo → mở đúng hồ sơ, cuộn tới đúng bình luận.
30. Người nhận đã mất quyền → dòng chỉ còn tiêu đề, không lộ mã hồ sơ, tên khách, trích đoạn.
31. Reaction không sinh thông báo.
31a. Ban lãnh đạo viết bình luận được; reply vào bình luận của Ban lãnh đạo → Ban lãnh đạo **không**
     nhận thông báo; gửi mention bằng ID một người Ban lãnh đạo → bị từ chối.
31b. Bình luận nhắc tên mình hiện trên màn hình → thông báo tương ứng tự thành đã đọc, chuông giảm số.

**Tự cập nhật**

32. A gửi, B đang mở cùng hồ sơ → B thấy trong ≤ 30 giây, không tải lại (kiểm bằng đồng hồ giả).
33. Reply, sửa, xoá, reaction của A → B thấy trong ≤ 30 giây.
34. B được nhắc khi đang ở trang khác → chuông của B tăng trong ≤ 30 giây.
35. B đang gõ dở khi có bình luận mới → chữ, tiêu điểm, con trỏ của B nguyên vẹn.
36. B đang cuộn lên → không tự cuộn, có *N bình luận mới*.
37. A gửi → bình luận chỉ hiện một lần ở A.
38. B mất mạng 2 phút rồi có lại → mọi thay đổi trong lúc mất được lấy bù.
39. Tab ẩn → không có lượt hỏi nào; quay lại → hỏi ngay.

**Tệp**

40. Tải tệp hợp lệ → hiện đúng bình luận. Sai loại (kể cả đổi đuôi) / quá cỡ / quá 5 tệp → bị từ chối.
41. Người ngoài phạm vi tải bằng ID tệp → 403.
42. Xoá bình luận → tệp bị xoá khỏi kho ở lượt dọn kế tiếp. Gỡ tệp khi sửa → cũng vậy.
43. Tệp tải lên không gửi quá 24 giờ → bị dọn; chưa quá 24 giờ → còn.

**Reaction**

44. Thả, bấm lại gỡ; thả trùng cùng loại → không nhân đôi (ràng buộc CSDL).

**Bảo mật chung**

45. Vượt giới hạn tần suất → 429 với câu tiếng Việt.
46. Tạo, sửa, xoá đều có dòng nhật ký (không chứa nội dung bình luận).

------------------------------------------------------------------------

## 12. Cấu hình (không gõ cứng trong giao diện)

| Cấu hình | Mặc định *(đề xuất)* |
|---|---|
| Số bình luận tải mỗi lần | 20 |
| Nhịp hỏi trên trang hồ sơ | 15 giây |
| Nhịp hỏi của chuông | 30 giây |
| Độ dài tối đa | 5.000 ký tự |
| Số mention tối đa | 20 |
| Số kết quả gợi ý mention | 10 |
| Thời gian chờ trước khi tìm mention | 250ms |
| Số tệp tối đa / bình luận | 5 |
| Cỡ tối đa / tệp | 10MB |
| Loại tệp cho phép | JPG, PNG, WebP, PDF, DOCX, XLSX |
| Tệp không gửi được dọn sau | 24 giờ |
| Giới hạn tần suất gửi / tìm | 30 / 60 lượt mỗi phút mỗi người |

Giới hạn dùng chung cho giao diện và máy chủ khai ở **một chỗ**; máy chủ là chốt cuối.

------------------------------------------------------------------------

## 13. Việc phải làm kèm khi giao

Theo luật một chặng ở `CLAUDE.md`:

- Chép các luật nghiệp vụ (2, 3, 6, 7) vào `agents/YEU-CAU-NGHIEP-VU-CSBH.md` — thân bài **và** Phụ
  lục B (có ngày chốt 06/11/2026) — và `impl/docs/03-HUONG-DAN-SU-DUNG.md`.
- Ghi ngoại lệ `0096` (6.1) và lệch lối câu chữ (6.3) tại chỗ trong mã `notification`.
- Sửa `di()` tách `#` (9.6) kèm ca kiểm cho cả liên kết `/van-hanh#o-dia` hiện đang hỏng.
- Đo tải của nhịp hỏi trên chồng demo thật và dán con số vào `agents/NHAT-KY-TRIEN-KHAI.md`.
- `make demo-mau` nạp vài luồng bình luận mẫu *(đề xuất)* để demo có cái để xem — và phải kiểm bộ nạp
  demo không vỡ (bẫy đã cắn ba lần).
