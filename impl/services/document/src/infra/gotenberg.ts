/**
 * HTML → PDF và DOCX → PDF, cả hai qua Gotenberg.
 *
 * LỆCH SO VỚI THIẾT KẾ, có chủ ý. Bản thiết kế đặt **Playwright + Chromium
 * ngay trong ảnh của `document`** cho phần HTML, và Gotenberg chỉ để chuyển
 * .docx. Ở đây cả hai đường đều đi qua Gotenberg. Ba lý do:
 *
 *   1. Gotenberg *chính là* Chromium chạy trong container, nên yêu cầu "bản PDF
 *      phải khớp bản đang xem" vẫn giữ nguyên — vẫn là engine của trình duyệt.
 *   2. Ngân sách RAM ở thiết kế đã tính "Chromium theo đợt 900MB **cộng**
 *      Gotenberg 700MB ≈ 6,2GB lúc bận nhất, biên an toàn mỏng". Dùng chung một
 *      Chromium cắt hẳn một nửa con số đó.
 *   3. Ảnh của `document` không phải kéo theo trình duyệt và bộ thư viện hệ
 *      thống của nó — ảnh nhỏ hơn nhiều lần và không có toolchain nào để vá.
 *
 * Cái mất: `document` không điều khiển được trình duyệt ở mức chi tiết (chờ
 * selector, chụp ảnh màn hình). Bản CSBH A4 là HTML tĩnh nên không cần tới.
 */
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

const url = (): string => process.env.GOTENBERG_URL ?? 'http://gotenberg:3000';

@Injectable()
export class Gotenberg {
  private async convert(path: string, form: FormData, what: string): Promise<Buffer> {
    let res: Response;
    try {
      res = await fetch(`${url()}${path}`, { method: 'POST', body: form });
    } catch (e) {
      // Gotenberg chết thì báo lỗi RÕ và không tạo bản ghi nửa vời ở đâu cả —
      // người gọi chưa ghi gì trước khi có PDF trong tay (DOC-34).
      throw new ServiceUnavailableException({
        code: 'PDF_ENGINE_UNAVAILABLE',
        message: `Không gọi được dịch vụ sinh PDF khi ${what}`,
        detail: String(e instanceof Error ? e.message : e),
      });
    }
    if (!res.ok) {
      throw new ServiceUnavailableException({
        code: 'PDF_RENDER_FAILED',
        message: `Sinh PDF hỏng khi ${what}`,
        status: res.status,
        detail: (await res.text()).slice(0, 500),
      });
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async htmlToPdf(html: string): Promise<Buffer> {
    const form = new FormData();
    // Gotenberg đòi đúng tên `index.html` làm tài liệu gốc.
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    // Khổ giấy lấy từ @page trong CSS. Xem chú thích ở sheet.ts: khai ở hai nơi
    // là có hai nguồn sự thật và chúng sẽ lệch nhau.
    form.append('preferCssPageSize', 'true');
    form.append('printBackground', 'true');
    return this.convert('/forms/chromium/convert/html', form, 'dựng bản CSBH');
  }

  async docxToPdf(docx: Buffer, fileName = 'hop-dong.docx'): Promise<Buffer> {
    const form = new FormData();
    form.append('files', new Blob([new Uint8Array(docx)]), fileName);
    return this.convert('/forms/libreoffice/convert', form, 'chuyển hợp đồng sang PDF');
  }
}
