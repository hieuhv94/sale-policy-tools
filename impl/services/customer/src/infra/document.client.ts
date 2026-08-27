/**
 * Lời gọi từ `customer` sang `document` (`0149`).
 *
 * Đúng MỘT việc: gỡ hẳn một tệp khỏi kho khi con trỏ ở `cus.customer_document`
 * vừa bị xoá, hoặc khi lượt ghi con trỏ bị từ chối.
 *
 * VÌ SAO CHIỀU GỌI NÀY PHẢI CÓ. Tệp sống ở hai kho — `doc.stored_file` cộng
 * MinIO nói *"tệp này tồn tại"*, `cus.customer_document` nói *"khách hàng này
 * có tệp ấy"* — và tới `0149` không có gì buộc hai kho khớp nhau. Xoá con trỏ
 * mà không nói gì cho `document` thì tệp nằm lại vĩnh viễn.
 *
 * Chú thích ở `removeDocument` từng bảo `sys.run_retention()` dọn hộ. Không:
 * hàm ấy chỉ đụng `idn.refresh_token`, `idn.activation_token` và ba bảng
 * `outbox` — đọc `0008_scale_retention.sql` là thấy. Một câu nghe hợp lý mà
 * chưa bao giờ đúng, và nó giữ cho chỗ hở này không bị nghi ngờ suốt tám mươi
 * chặng.
 */
import { Injectable, Logger } from '@nestjs/common';
import { mintServiceToken } from '@csbh/http-kit';

const documentUrl = () => process.env.DOCUMENT_URL ?? 'http://document:3005';

@Injectable()
export class DocumentClient {
  private readonly log = new Logger(DocumentClient.name);

  /**
   * Gỡ hẳn một tệp theo khoá kho.
   *
   * NUỐT LỖI, cùng lý do đã viết ở `Clients.goBoTep` bên `policy`: việc người
   * dùng yêu cầu đã xong và đã commit, còn đường lùi khi hỏng đúng bằng hành vi
   * trước `0149` — tệp nằm lại kho, không mất dữ liệu, chỉ tốn chỗ chứa.
   */
  async goBoTep(objectKey: string, lyDo: string): Promise<void> {
    try {
      const res = await fetch(`${documentUrl()}/internal/files/go-bo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Token': mintServiceToken('customer'),
        },
        body: JSON.stringify({ objectKey, lyDo }),
      });
      if (!res.ok) throw new Error(`document trả ${res.status}`);
    } catch (e) {
      this.log.error(`không gỡ được tệp ${objectKey} khỏi kho: ${String(e)}`);
    }
  }
}
