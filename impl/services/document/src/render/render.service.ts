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
import { FilesService, type FileRow } from '../files/files.service.js';
import { sheetHtml, type Signature } from './sheet.js';

export type Size = 'a4p' | 'a4l';

@Injectable()
export class RenderService {
  constructor(
    private readonly clients: Clients,
    private readonly gotenberg: Gotenberg,
    private readonly files: FilesService,
  ) {}

  private async collect(policyId: string, me: AuthUser) {
    const policy = await this.clients.policy(policyId);
    await this.files.assertCanAccess('POLICY', policyId, me);
    const [customer, people] = await Promise.all([
      this.clients.customer(policy.customer_id),
      this.clients.peopleFor(policy.tdv_user_id ?? ''),
    ]);
    return { policy, customer, people };
  }

  /** Bản đang XEM trên màn hình. Chính chuỗi này đi qua Chromium thành PDF. */
  async html(policyId: string, size: Size, me: AuthUser): Promise<string> {
    const { policy, customer, people } = await this.collect(policyId, me);
    const signature = signatureOf(policy.tbp_signed_at, people['TBP']);
    return sheetHtml({ policy, customer, people, size, ...(signature ? { signature } : {}) });
  }

  async pdf(policyId: string, size: Size, me: AuthUser): Promise<{ body: Buffer; code: string }> {
    const { policy, customer, people } = await this.collect(policyId, me);
    const signature = signatureOf(policy.tbp_signed_at, people['TBP']);
    const html = sheetHtml({ policy, customer, people, size, ...(signature ? { signature } : {}) });
    return { body: await this.gotenberg.htmlToPdf(html), code: policy.code };
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

const signatureOf = (signedAt: string | null, name: string | undefined): Signature | undefined =>
  signedAt
    ? { signerName: name ?? 'Trưởng bộ phận', signerRole: 'Trưởng bộ phận', signedAt }
    : undefined;
