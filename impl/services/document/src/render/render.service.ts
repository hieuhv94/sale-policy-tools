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
import { TemplatesService, NHAN_KHO } from '../contracts/templates.service.js';
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
    size: Size,
    me: AuthUser,
    /** Ghi một dòng *Lịch sử* rằng người này đã TẢI bản mềm (`0052`, N-01). */
    ghiLichSu = true,
  ): Promise<{ body: Buffer; code: string }> {
    const { policy, customer, people } = await this.collect(policyId, me);

    /*
     * Bản mềm sinh từ MẪU do Quản trị tải lên (`0055`), không còn dựng cứng.
     *
     * Mẫu gắn với KHỔ GIẤY: file .docx tự mang khổ của nó và không xoay được
     * lúc trộn, nên "mẫu phù hợp" nghĩa là mẫu đúng khổ đang xem.
     */
    const mau = await this.templates.active('HO_SO', size);
    if (!mau) {
      throw new ConflictException({
        code: 'POLICY_TEMPLATE_MISSING',
        message:
          `Chưa có văn bản mẫu phù hợp cho hồ sơ CSBH ở khổ ${NHAN_KHO[size]}. ` +
          'Đề nghị Quản trị hệ thống tải mẫu lên và phát hành ở màn hình Giấy tờ mẫu.',
        paperSize: size,
      });
    }

    const { values, lines, linePlaceholders, missingRequired } = tron(mau.fields, {
      policy,
      customer,
      people,
    });
    if (missingRequired.length > 0) {
      // Cùng luật với hợp đồng (DOC-13): không sinh một văn bản có ô trống rỗng
      // rồi đưa đi ký. Khác ở người sửa được — ở đây là Quản trị, nên thông báo
      // nói tên mục thiếu chứ không nói "liên hệ quản trị".
      throw new ConflictException({
        code: 'POLICY_FIELDS_MISSING',
        message: 'Hồ sơ thiếu trường bắt buộc của mẫu, chưa dựng được bản mềm',
        missing: missingRequired,
      });
    }

    const file = await this.files.row(mau.template.file_id);
    const docx = mergeDocx(await this.storage.get(file.object_key), {
      values,
      lines,
      linePlaceholders,
      // Bảng sản phẩm do HỆ THỐNG dựng, đúng số cột CPBH của chính hồ sơ này
      // (muc 7.1) — xem `bang-san-pham.ts`.
      banSanPham: bangSanPhamXml(policy),
    });
    const body = await this.gotenberg.docxToPdf(docx, `CSBH-${policy.code}-${size}.docx`);

    /*
     * Ghi vết SAU khi đã có PDF trong tay — cùng luật với lần xuất hợp đồng
     * (DOC-34): ghi trước rồi Gotenberg chết là lịch sử mang một lượt tải không
     * hề xảy ra.
     *
     * Hỏng ở bước ghi thì KHÔNG nuốt: một lượt tải không để lại vết đúng là thứ
     * N-01 sinh ra để dẹp, và người dùng bấm lại được. Đổi lại, `policy` chết
     * thì không ai tải được bản mềm — chấp nhận, vì `collect()` ngay đầu hàm
     * cũng đã gọi `policy` rồi.
     */
    if (ghiLichSu) await this.clients.daSinhVanBan(policyId, 'HO_SO', me, true);
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

