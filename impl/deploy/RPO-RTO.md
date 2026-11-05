# Cam kết phục hồi — RPO và RTO

Món nợ ghi ở P5.6 ("một VM, chưa ghi cam kết RPO/RTO"), trả ở P7c.

Hai con số này **không phải mục tiêu để phấn đấu** mà là mô tả trung thực về thứ hạ tầng hiện tại
thật sự làm được. Ghi ra để lúc sự cố không ai phải đoán, và để người ký duyệt biết mình đang chấp
nhận điều gì.

| | Cam kết | Đo bằng gì |
|---|---|---|
| **RPO** — mất tối đa bao nhiêu dữ liệu | **≤ một chu kỳ sao lưu** (mặc định 24 giờ) | lịch sao lưu cấu hình trên trang Vận hành; tuổi bản sao lưu mới nhất hiện ở thẻ Sức khoẻ |
| **RTO** — bao lâu thì chạy lại được | **≤ 60 phút** | Đo thật bằng `./csbh dien-tap`, không phải ước lượng |

## RPO đến từ đâu `sửa 06/11 — 0250`

**Từ bản sao lưu CSDL theo lịch, và chỉ từ đó.** Tới `0249` con số là 5 phút, nhờ bản nền
vật lý + lưu trữ WAL (`archive_timeout = 5min`). Khách hàng chốt 05/11 **bỏ hẳn** đường ấy sau
khi được giải thích cái giá: hệ gọn hơn nhiều GB, không còn quy trình phục hồi theo thời điểm,
không còn sự cố im lặng *"lưu WAL hỏng"* — đổi lại sự cố làm mất **mọi việc từ lượt sao lưu gần
nhất**: với lịch hằng ngày lúc 01:15, CSDL hỏng lúc 16:00 là mất trọn một ngày làm việc.

Thu hẹp RPO bằng cách đặt lịch dày hơn (mỗi 6 hoặc 12 giờ) — bản sao lưu CSDL nhỏ, chạy dày
được. Bản sao lưu chứa toàn bộ CSDL: hồ sơ, khách hàng, danh mục, tài khoản + mật khẩu băm +
phiên, nhật ký kiểm toán.

**Điều kiện để con số này đúng:** lượt sao lưu phải thật sự chạy và thành công. Thẻ Sức khoẻ
của trang Vận hành báo đỏ khi bản mới nhất cũ hơn một chu kỳ + 2 giờ.

## RTO đến từ đâu

Một VM, không có máy dự phòng nóng. 60 phút là tổng của:

| Bước | Thời gian |
|---|---|
| Nhận ra sự cố và quyết định phục hồi | 10 phút |
| `docker compose up` hạ tầng trên máy thay thế | 5 phút |
| Nạp bản sao lưu mới nhất (`phuc-hoi`) | 20 phút |
| Chạy migration, kiểm số dòng, `make seed` nếu là môi trường nháp | 10 phút |
| Kiểm thủ công một luồng duyệt và một lần xuất file | 15 phút |

Con số 20 phút cho bước nạp là thứ **phải đo lại** khi dữ liệu lớn lên; `make restore-drill` phục
hồi vào một CSDL nháp rồi đối chiếu số dòng, và đó là chỗ đọc ra con số thật.

## Đã diễn tập (`0240`, 24/10/2026)

Trên một chồng cô lập dựng từ **chính ảnh `ops-1.0.5` đã giao**, cấu hình Postgres của repo:

| Kịch bản | Kết quả | Thời gian |
|---|---|---|
| `restore-drill` (bản dump → CSDL nháp) | đủ dòng | 19 giây |
| PITR về một mốc giữa hai thao tác (bản nền mới nhất + WAL) | đúng mốc, thao tác sai sau mốc biến mất | 4 giây |
| PITR từ bản nền **cũ nhất còn giữ**, sau khi đã dọn WAL | đúng mốc | 3 giây |
| Chỉ dùng **bản sao ngoài** (bản nền + WAL nhân bản) | tới đúng lúc sao lưu đêm gần nhất | 4 giây |
| Quy trình PITR trong `05-VAN-HANH` §3, chạy nguyên văn tới `phuc-hoi` | đúng mốc | 81 giây |
| `phuc-hoi` đè lên CSDL có service đang nối | gián đoạn ~3 giây, service tự nối lại | 22 giây |
| `phuc-hoi` lên cụm Postgres **mới** (mất máy), chưa migrate | 9 role tự dựng, service đăng nhập được | — |

Dữ liệu diễn tập chỉ vài MB: các con số trên là **thời gian của quy trình**, không phải của
dữ liệu thật — đo lại bằng `./csbh dien-tap` khi CSDL lớn lên.

Bốn lỗi tìm ra và đã sửa ở `0240`: `phuc-hoi` **xoá CSDL đang chạy trước khi kiểm tệp** (tệp
gõ sai = CSDL trống) · mốc dọn WAL **kẹt ở bản nền đầu tiên** (kho WAL phình mãi) · bản sao
ngoài **không dọn, không có WAL**, và WAL chép bằng root thì Postgres phục hồi **dừng sớm không
báo lỗi** · phục hồi lên cụm mới **không dựng lại role**, `migrate` sau đó cũng không cứu được.

## Cái KHÔNG được bảo vệ

Ghi rõ để không ai nhầm:

- **Mọi việc làm sau lượt sao lưu gần nhất** (`0250`). Không còn phục hồi theo thời điểm.
- **Ổ đĩa hỏng khi `CSBH_BACKUP_MIRROR` cùng ổ với dữ liệu.** Bản sao ngoài phải là ổ khác/NAS;
  production thiếu nó thì lượt sao lưu thoát lỗi.
- **Kho tệp giữa hai lượt chụp.** Kho tệp (bản scan, bản mềm) có lịch chụp riêng; tệp tải lên
  sau lượt chụp gần nhất mà mất máy thì mất theo. Hồ sơ đã ký mất bản scan là mất bằng chứng
  nghiệp vụ.

## Việc còn phải làm

- **Cảnh báo tự động** khi bản sao lưu mới nhất quá tuổi — thẻ Sức khoẻ của trang Vận hành
  (chặng B/C của kế hoạch `agents/KE-HOACH-VAN-HANH.md`).

> **Lịch sử**: mục *"Đã diễn tập (`0240`)"* ở trên đo cả PITR — đường ấy đã gỡ ở `0250`; các
> dòng `restore-drill` và `phuc-hoi` vẫn đúng.

## Chuyển máy — diễn tập 05/11 (`0246`)

Nguồn: bản production chạy thử, ảnh `1.1.0-thu-0246`. Đích: bộ cài cùng bản giải nén ở thư mục khác,
dự án và cổng riêng (diễn tập trên cùng máy). Dữ liệu nhỏ (2 tài khoản, 3 tệp, 6 phiên, 12 dòng nhật
ký) — con số dưới đây là **khung thời gian cố định**, không phải thông lượng.

| Bước | Đo được |
|---|---|
| `xuat-chuyen-may` — hệ dừng từ đầu tới cuối lệnh | **31 giây** |
| `nhap-chuyen-may` — tới lúc phần mềm bật lại | **78 giây** |
| Bảng kê | 41 bảng + 10 sequence + 3 tệp: **KHỚP** |
| Bí mật hai máy (sha256 từng tệp, 7 tệp) | trùng hết |
| Phá lại trên đích: xoá một tệp / thêm một dấu cách vào một họ tên | lệch đúng `tep.txt` / đúng `idn.app_user` |

