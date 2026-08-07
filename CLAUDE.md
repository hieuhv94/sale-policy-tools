# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo này là gì

Không có mã nguồn phần mềm. Đây là repo tài liệu của việc **rà soát và hợp nhất yêu cầu nghiệp vụ**
cho phần mềm Chính sách bán hàng (CSBH) của Công ty TNHH Dược phẩm Nutricare — giai đoạn tiền lập
trình. Không có lệnh build, lint hay test.

Ba tài liệu nguồn `.docx` (bị `.gitignore` loại khỏi git) mâu thuẫn nhau ở nhiều chỗ; toàn bộ công
việc ở đây là gỡ mâu thuẫn đó và giữ ba sản phẩm bàn giao luôn khớp nhau.

## Thứ tự hiệu lực của tài liệu

| File | Vai trò |
|---|---|
| `YEU-CAU-NGHIEP-VU-CSBH.md` | **Bản hợp nhất v4.0, có hiệu lực cao nhất.** Tài liệu chính để lập trình; khi mâu thuẫn với bất kỳ nguồn nào, bản này thắng. |
| `ra-soat-csbh.html` | Nguồn của artifact web: bảng rà soát điểm còn mở, ba biểu đồ SVG, nhật ký 37 quyết định, bảng chức năng sáu vai trò. |
| `CSBH-ra-soat-yeu-cau.pptx` | Bộ slide 15 trang dùng họp với khách hàng, sinh từ HTML. |
| `05.08. Yêu cầu nghiệp vụ.docx` | YCNV v3.1 — bản khách hàng đang giữ. Phụ lục A của file `.md` liệt kê 6 chỗ trong đó cần sửa. |
| `01.08. Yêu cầu nghiệp vụ.docx` · `01.08. QUY TRÌNH CSBH.docx` | v3.0 và QT — nguồn lịch sử, chỉ dùng để tra dẫn chứng. |

## Quy trình khi khách hàng chốt thêm một điểm

Người dùng thường trả lời theo mã vấn đề (`C-xx` mâu thuẫn tài liệu, `R-xx` điểm chưa hợp lý,
`D-xx` cơ sở dữ liệu). Mỗi lượt cập nhật phải làm đủ:

1. Điểm **đóng hoàn toàn** → xoá hẳn `<article class="item">` khỏi bảng rà soát, thêm một dòng vào
   `<ol class="check">` mục *Nhật ký quyết định*. Đóng **một phần** → giữ thẻ, thêm mục "Đã chốt",
   thu hẹp mục "Còn mở" vào đúng phần chưa trả lời.
2. Điểm **hoãn** → giữ nguyên nội dung, chỉ đổi nhãn `<span class="sev s4">` thành "Giai đoạn 2".
3. **Chủ động báo vấn đề mới** phát sinh từ chính quyết định vừa chốt (các mã R-13, R-14, R-15 ra
   đời theo cách này).
4. Cập nhật **cả ba biểu đồ SVG và cả bộ slide**, không chỉ phần chữ. Đồng bộ lại
   `YEU-CAU-NGHIEP-VU-CSBH.md` — cả thân bài, Phụ lục A và Phụ lục B.

**Hai ràng buộc phải kiểm sau mỗi lượt** (người dùng đã từng bắt lỗi chỗ này):

- Số `<article class="item">` trong ba mục rà soát (nhóm C, R, D) phải khớp ô đếm *Điểm còn mở*
  trong `<div class="tiles">`. Sáu `article` ở mục "Chức năng của từng loại người dùng" dùng
  `class="id"` là số 1–6, **không** tính vào con số này.
- Tập mã gắn nhãn CHẶN phải khớp đúng danh sách *việc còn chặn lập trình*.

## Trạng thái hiện tại (06/08/2026)

Đã đủ điều kiện khởi công: 37 quyết định chốt qua hai phiên 04/08 và 05/08, **0 việc chặn lập
trình**, 2 điểm còn mở đều là hạng mục hoãn giai đoạn 2 (`C-09` và `D-10`, cùng về nhập dữ liệu
CSBH cũ từ Excel). Sáu quyết định của phiên 04/08 đã bị phiên 05/08 thay thế và đã gỡ khỏi nhật ký.

## Quyết định nghiệp vụ định hình lược đồ dữ liệu

Trái trực giác, dễ làm sai nếu không nhớ:

- **Mỗi khách hàng chỉ có đúng một CSBH còn hiệu lực**, và mọi CSBH đều **vô thời hạn** — không có
  trường ngày hết hiệu lực. Chỉ hết hiệu lực khi CSBH mới của cùng khách hàng được duyệt.
- **Phiên bản mới phải chứa lại toàn bộ sản phẩm cũ.** Hiệu lực quản lý ở cấp hồ sơ, không phải cấp
  dòng khách hàng × sản phẩm.
- **Kế toán L1 và L2 là một vai trò** (một người xử lý cả hai lần tiếp nhận, hai màn hình). **TDV và
  QL là một vai trò.** Tổng cộng sáu vai trò.
- Cây phân quyền suy ra từ cây tổ chức: Sale Admin → nhiều kế toán → nhiều TDV. Trưởng bộ phận là
  nhánh riêng, độc lập.
- **Kế toán là người xuất hợp đồng** (sau tiếp nhận L1), không phải Trưởng bộ phận như YCNV đang ghi.
- Không có nghiệp vụ thu hồi. Hồ sơ Từ chối là trạng thái kết thúc và **không ai xóa được**.
- Tỷ lệ chiết khấu = `1 − Giá thu về / Giá bán Công ty`, phần trăm làm tròn hai chữ số; so ngưỡng
  **sau khi** làm tròn để con số hiển thị và con số dùng so sánh là một.
- SLA 14 ngày cho mọi trạng thái chờ, tính cả cuối tuần. "Quá hạn duyệt" là trạng thái riêng, phải
  lưu kèm bước đang chờ để hồ sơ đi tiếp đúng nhánh cũ.

## Bẫy kỹ thuật

**Tên file tiếng Việt không truyền được qua bash.** Hai file `.docx` có dấu trong tên; truyền tên đó
làm tham số cho lệnh bash luôn báo `FileNotFoundError` dù `ls` vẫn thấy file (khác biệt chuẩn hoá
Unicode NFC/NFD). Cách vòng qua — để Python tự tìm bằng `glob`, đừng gõ tên file:

```bash
python3 -c "
import sys, glob
sys.argv = ['dx'] + sorted(glob.glob('/media/hieuhv/Data/Workspaces/sale-policy-tools/*.docx'))
exec(open('dx.py').read())
"
```

**Pipeline sinh pptx đã mất.** Các script `extract_cards.py`, `build_deck2.py`, `dx.py` và venv
python-pptx nằm trong thư mục `ra-soat/` đã bị xóa ngày 06/08/2026. Muốn sinh lại pptx thì phải viết
lại: trích `<article class="item">` và các dòng `<li><span><b>` từ HTML ra JSON, rồi dựng slide bằng
python-pptx trong một venv (`pip` ở python hệ thống bị PEP 668 chặn). Máy không có LibreOffice nên
chỉ kiểm tra bố cục pptx bằng cách so toạ độ shape.

**Slide phải trích toàn văn từ HTML bằng script**, không viết tay bản rút gọn — người dùng đã chê
"nội dung các thẻ quá sơ sài" khi tôi tự tóm tắt lại.

## Publish lại artifact

`ra-soat-csbh.html` đã publish. Gọi `Artifact` với `file_path` là file này và `url` là
`https://claude.ai/code/artifact/0daad399-bd08-4cc6-a281-27b751124ca0` để cập nhật đúng link cũ —
thiếu `url` sẽ tạo link mới.
