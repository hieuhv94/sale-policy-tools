# Cam kết phục hồi — RPO và RTO

Món nợ ghi ở P5.6 ("một VM, chưa ghi cam kết RPO/RTO"), trả ở P7c.

Hai con số này **không phải mục tiêu để phấn đấu** mà là mô tả trung thực về thứ hạ tầng hiện tại
thật sự làm được. Ghi ra để lúc sự cố không ai phải đoán, và để người ký duyệt biết mình đang chấp
nhận điều gì.

| | Cam kết | Đo bằng gì |
|---|---|---|
| **RPO** — mất tối đa bao nhiêu dữ liệu | **≤ 5 phút** | `archive_timeout = 5min`: WAL được đóng và đẩy sang kho lưu ít nhất mỗi 5 phút, kể cả khi hệ thống rảnh |
| **RTO** — bao lâu thì chạy lại được | **≤ 60 phút** | Đo thật bằng `make restore-drill`, không phải ước lượng |

## RPO đến từ đâu

Không đến từ bản sao lưu hằng đêm. Bản `pg_dump` mỗi đêm chỉ cho RPO 24 giờ — mất tối đa một ngày
làm việc, tức là toàn bộ hồ sơ CSBH lập trong ngày.

Con số 5 phút đến từ **PITR**: `archive_command` đẩy từng segment WAL sang volume `pgarchive`, và
`archive_timeout = 5min` buộc Postgres đóng segment đang ghi dở sau 5 phút dù nó chưa đầy. Không có
tham số đó thì một ngày ít giao dịch có thể không sinh segment nào suốt nhiều giờ, và RPO thực tế
trượt về "từ lần ghi WAL đầy 16MB gần nhất" — một con số không ai kiểm soát được.

**Điều kiện để con số này đúng:** `archive_command` phải thật sự chạy. Nó từng hỏng lặng lẽ một lần
(volume thuộc root, Postgres chạy uid 70) — CSDL vẫn xanh, healthcheck vẫn xanh, chỉ có WAL không
được lưu. Vì vậy `pg_stat_archiver` phải được theo dõi, không phải chỉ được kiểm lúc dựng:

```sql
SELECT archived_count, last_archived_time, failed_count, last_failed_time
  FROM pg_stat_archiver;
```

`failed_count > 0` hoặc `last_archived_time` cũ hơn 10 phút = **RPO đã mất, hệ thống vẫn trông bình
thường**. Đây là sự cố im lặng nguy hiểm nhất của hệ này.

## RTO đến từ đâu

Một VM, không có máy dự phòng nóng. 60 phút là tổng của:

| Bước | Thời gian |
|---|---|
| Nhận ra sự cố và quyết định phục hồi | 10 phút |
| `docker compose up` hạ tầng trên máy thay thế | 5 phút |
| Nạp base backup + replay WAL tới thời điểm chọn | 20 phút |
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

- **Ổ đĩa hỏng cùng lúc với volume lưu trữ WAL.** Cả hai nằm trên cùng một VM. Muốn chống thì phải
  đẩy WAL và base backup sang một máy khác — chưa làm. Thư mục `workspace/backup-mirror` là bước
  chuẩn bị cho việc đó, hiện chỉ là một bản sao trên cùng máy.
- **MinIO.** File scan và file hợp đồng không nằm trong PITR của Postgres. Từ `0246` có
  `./csbh sao-luu-tep` (chép phần mới vào bản sao lưu + bản sao ngoài) nhưng **chưa chạy định kỳ**
  (chốt 05/11) — RPO của tệp là lần chạy tay gần nhất, không phải 5 phút. Hồ sơ đã ký mất bản scan
  là mất bằng chứng nghiệp vụ.
- **Sai sót của người dùng trong phạm vi RPO.** PITR phục hồi được về thời điểm trước thao tác sai,
  nhưng đổi lại mất mọi thao tác đúng sau đó. Đây là quyết định của người vận hành, không tự động.

## Việc còn phải làm

- **Gắn `sao-luu-tep` vào cron.** Lệnh có từ `0246` và đã diễn tập; chưa chạy định kỳ theo chốt
  05/11 — vẫn là khoảng hở lớn nhất còn lại.
- **Lệnh `./csbh` cho PITR.** Quy trình đã diễn tập (`05-VAN-HANH` §3) nhưng còn là các lệnh
  `docker` gõ tay.
- **Cảnh báo tự động** trên `pg_stat_archiver` (`failed_count`, `last_archived_time`) và trên
  tuổi của bản sao lưu mới nhất. Cron chỉ ghi log; không ai đọc log thì lượt hỏng nằm im.
  Diễn tập thấy thêm một đường hỏng im lặng: cụm Postgres dựng lại trên **kho WAL cũ** đánh số
  segment lại từ đầu, và `archive_command` (`test ! -f …`) sẽ hỏng khi số va vào tệp cũ.
- **Đẩy bản sao lưu ra khỏi VM** — `CSBH_BACKUP_MIRROR` phải là ổ khác hoặc NAS; WAL trong ngày
  chỉ nằm ở volume `pgarchive`.

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

