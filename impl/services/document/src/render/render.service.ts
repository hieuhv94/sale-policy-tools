/**
 * Sinh bản CSBH A4 và ký số nội bộ lên nó.
 *
 * "Ký" ở đây là **ký điện tử nội bộ** (muc 10): họ tên, vai trò, dấu thời gian
 * in vào chính văn bản, cộng SHA-256 của file lưu trong CSDL để phát hiện sửa
 * file. Không HSM, không CA, không chứng thư số — và đó là quyết định nghiệp vụ
 * đã chốt, không phải chỗ chưa làm xong (DOC-07).
 *
 * Ký KHÔNG ghi đè bản nháp: bản đã ký là một object MỚI trỏ ngược về bản nháp
 * qua `signed_from_id`. Ghi đè thì câu hỏi "văn bản đã đổi gì so với lúc chưa
 * ký" vĩnh viễn không trả lời được (DOC-05).
 */
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from '@csbh/http-kit';
import { Clients } from '../infra/clients.js';
import { Gotenberg } from '../infra/gotenberg.js';
import { Storage } from '../infra/storage.js';
import { FilesService, type FileRow } from '../files/files.service.js';
import { TemplatesService } from '../contracts/templates.service.js';
import { bangSanPhamXml } from '../contracts/bang-san-pham.js';
import { mergeDocx } from '../contracts/docx.js';
import { tron } from '../contracts/tron.js';
import { sheetHtml, type Signature } from './sheet.js';

export type Size = 'a4p' | 'a4l';

@Injectable()
export class RenderService {
  constructor(
    private readonly clients: Clients,
    private readonly gotenberg: Gotenberg,
    private readonly files: FilesService,
    private readonly templates: TemplatesService,
    private readonly storage: Storage,
  ) {}

  private async collect(policyId: string, me: AuthUser) {
    const policy = await this.clients.policy(policyId);
    await this.files.assertCanAccess('POLICY', policyId, me);
    const [customer, people] = await Promise.all([
      this.clients.customer(policy.customer_id),
      this.clients.peopleFor(policy.tdv_user_id ?? '', {
        tbp: policy.tbp_user_id,
        keToan: policy.ke_toan_user_id,
        saleAdmin: policy.sale_admin_user_id,
      }),
    ]);
    return { policy, customer, people };
  }

  async pdf(
    policyId: string,
    /** Mẫu người xem CHỌN (`0058`). Bỏ trống thì lấy mẫu đầu danh sách. */
    mauId: string | undefined,
    me: AuthUser,
  ): Promise<{ body: Buffer; code: string }> {
    const { policy, customer, people } = await this.collect(policyId, me);

    /*
     * Bản mềm sinh từ MẪU do Quản trị tải lên (`0055`), không còn dựng cứng.
     *
     * Tới `0057` mẫu được tra theo KHỔ GIẤY người xem chọn. Từ `0058` người xem
     * chọn thẳng mẫu — khổ giấy là chuyện của chính file .docx, và bản mềm dựng
     * ra mang đúng khổ của mẫu vừa chọn.
     */
    const mau = await this.templates.chon('HO_SO', mauId);
    if (!mau) {
      throw new ConflictException({
        code: 'POLICY_TEMPLATE_MISSING',
        message:
          'Chưa có văn bản mẫu nào cho hồ sơ CSBH. ' +
          'Đề nghị Quản trị hệ thống thêm mẫu ở màn hình Văn bản mẫu.',
      });
    }

    /*
      KHÔNG còn phép kiểm "thiếu trường bắt buộc" ở đây (`0067`).

      Nó dựa trên cờ `required` mà người soạn đánh dấu cho từng ô trống — một cờ
      chỉ đổi thời điểm báo lỗi, và báo cho người KHÔNG sửa được. Mục bắt buộc
      của muc 11.1 giờ kiểm lúc LƯU MẪU, ở màn hình người sửa được đang đứng.

      Trường rỗng thì ô trống ra rỗng, đúng như dữ liệu đang có.
    */
    const { values } = tron(mau.fields, { policy, customer, people });

    // `docxCua` chứ không đọc thẳng kho: object mất thì nó ném một lỗi CÓ TÊN
    // thay vì để `S3Error` chui ra thành 500 (`0059`).
    const docx = mergeDocx(await this.templates.docxCua(mau.template), {
      values,
      // Bảng sản phẩm do HỆ THỐNG dựng, đúng số cột CPBH của chính hồ sơ này
      // (muc 7.1), và đúng tập cột của CHÍNH MẪU NÀY (`0067`).
      banSanPham: bangSanPhamXml(policy, mau.template.cot_bang),
    });
    const body = await this.gotenberg.docxToPdf(docx, `CSBH-${policy.code}.docx`);

    /*
     * KHÔNG ghi dòng *Lịch sử* nào cho bản mềm (`0059`).
     *
     * `0052` ghi mỗi lượt tải một dòng, theo N-01. Khách hàng bỏ yêu cầu ấy
     * ngày 20/08 — và bỏ có lý: bản mềm là thứ người ta mở ra ĐỌC. Kế toán xem
     * lại hồ sơ ba lần trong một buổi là chuyện thường, nên những dòng ấy chỉ
     * làm dày lịch sử và dìm mất thứ lịch sử sinh ra để kể — ai duyệt, ai trả
     * về, vì sao.
     *
     * Bản SCAN thì vẫn ghi: nó là bản cứng có chữ ký, và "ai đã lấy nó ra khỏi
     * hệ thống" là một câu hỏi khác hẳn.
     *
     * Kéo theo: `pdf()` không còn gọi sang `policy` ở đường này nữa. Cờ `xem=1`
     * cũng mất nghĩa và đã gỡ khỏi controller.
     */
    return { body, code: policy.code };
  }

  /**
   * Ký số: sinh bản CHƯA ký, lưu lại, rồi sinh bản CÓ ký và lưu thành object thứ
   * hai. Hai object cùng tồn tại là điều kiện để đối chiếu trước–sau (DOC-05).
   */
  async sign(policyId: string, me: AuthUser): Promise<{ draft: FileRow; signed: FileRow }> {
    if (me.role !== 'TBP') {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: 'Chỉ Trưởng bộ phận ký số bản CSBH',
      });
    }
    const { policy, customer, people } = await this.collect(policyId, me);
    if (!policy.tbp_signed_at) {
      throw new ConflictException({
        code: 'NOT_SIGNED_YET',
        message: 'Hồ sơ chưa qua bước ký số ở luồng duyệt',
        status: policy.status,
      });
    }

    const base = { policy, customer, people, size: 'a4p' as const };
    const draftPdf = await this.gotenberg.htmlToPdf(sheetHtml(base));
    const draft = await this.files.store({
      fileName: `CSBH-${policy.code}.pdf`,
      contentType: 'application/pdf',
      buffer: draftPdf,
      ownerKind: 'POLICY',
      ownerId: policyId,
      purpose: 'BAN_CSBH',
      uploadedBy: me.id,
    });

    const signature: Signature = {
      signerName: people['TBP'] ?? 'Trưởng bộ phận',
      signerRole: 'Trưởng bộ phận',
      signedAt: policy.tbp_signed_at,
    };
    const signedPdf = await this.gotenberg.htmlToPdf(sheetHtml({ ...base, signature }));
    const signed = await this.files.store({
      fileName: `CSBH-${policy.code}-da-ky.pdf`,
      contentType: 'application/pdf',
      buffer: signedPdf,
      ownerKind: 'POLICY',
      ownerId: policyId,
      purpose: 'BAN_DA_KY',
      uploadedBy: me.id,
      signedFromId: draft.id,
      signature,
    });
    return { draft, signed };
  }
}

