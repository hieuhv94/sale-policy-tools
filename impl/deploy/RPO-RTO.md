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

## Cái KHÔNG được bảo vệ

Ghi rõ để không ai nhầm:

- **Ổ đĩa hỏng cùng lúc với volume lưu trữ WAL.** Cả hai nằm trên cùng một VM. Muốn chống thì phải
  đẩy WAL và base backup sang một máy khác — chưa làm. Thư mục `workspace/backup-mirror` là bước
  chuẩn bị cho việc đó, hiện chỉ là một bản sao trên cùng máy.
- **MinIO.** File scan và file hợp đồng không nằm trong PITR của Postgres. Mất MinIO thì siêu dữ
  liệu còn nguyên nhưng file thì không. Hồ sơ đã ký mất bản scan là mất bằng chứng nghiệp vụ.
- **Sai sót của người dùng trong phạm vi RPO.** PITR phục hồi được về thời điểm trước thao tác sai,
  nhưng đổi lại mất mọi thao tác đúng sau đó. Đây là quyết định của người vận hành, không tự động.

## Việc còn phải làm

- Lịch tự động cho `make backup` và `make retention` (hiện chạy tay). Chuyển sang P8 cùng tài liệu
  triển khai.
- Đẩy bản sao lưu ra khỏi VM.
- Cảnh báo tự động trên `pg_stat_archiver` và trên `/readyz` của gateway.
