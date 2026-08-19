/**
 * Xuất hợp đồng — một PHÉP BIẾN ĐỔI, không phải một bản ghi (muc 8.3, Hình 4).
 *
 * Toàn bộ nhánh này chạy lại từ đầu ở MỖI lần bấm: đọc hồ sơ, đọc khách hàng,
 * đọc mẫu đang dùng, trộn, chuyển sang PDF, trả về. Không lưu file, không lưu
 * bản ghi, không lưu ảnh chụp dữ liệu.
 *
 * Hai hệ quả đã chấp nhận, và test khẳng định chúng thay vì chống lại:
 *   - Bấm hai lần cách nhau một tuần có thể ra hai nội dung khác nhau nếu dữ
 *     liệu nguồn đã đổi (DOC-27). Bản giấy in ra là bản cố định duy nhất.
 *   - Hệ thống không trả lời được "hợp đồng nào đã ký" — không có trạng thái.
 *
 * Dấu vết duy nhất: hai cột `contract_issued_at/by` trên hồ sơ, cộng một dòng
 * nhật ký cho MỖI lần bấm (DOC-22 kiểm đúng hai dòng cho hai lần bấm).
 */
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { AuthUser } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { Clients } from '../infra/clients.js';
import { Gotenberg } from '../infra/gotenberg.js';
import { FilesService } from '../files/files.service.js';
import { Storage } from '../infra/storage.js';
import { TemplatesService } from './templates.service.js';
import { mergeDocx } from './docx.js';
import { tron } from './tron.js';

/** Đúng hai vai trò xuất được hợp đồng (muc 8, PLA.1 — sửa 06/08). */
const EXPORTERS = ['KE_TOAN', 'SALE_ADMIN'];

export type Preview = {
  policyId: string;
  policyCode: string;
  templateId: string;
  templateName: string;
  values: Record<string, string>;
  lines: Record<string, string>[];
  missingRequired: { placeholder: string; source: string }[];
};

@Injectable()
export class ContractsService {
  constructor(
    private readonly db: Db,
    private readonly clients: Clients,
    private readonly gotenberg: Gotenberg,
    private readonly templates: TemplatesService,
    private readonly files: FilesService,
    private readonly storage: Storage,
  ) {}

  private assertRole(me: AuthUser): void {
    if (!EXPORTERS.includes(me.role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: 'Chỉ Kế toán và Sale Admin xuất được hợp đồng',
        role: me.role,
      });
    }
  }

  /**
   * Trộn dữ liệu, chưa sinh file.
   *
   * Cả xem trước lẫn xuất thật đều đi qua đây, nên "xem trước thấy gì thì xuất
   * ra đúng thế" là đúng theo cấu trúc. Xem trước KHÔNG tạo bản ghi nào (DOC-14).
   */
  async build(policyId: string, me: AuthUser): Promise<Preview> {
    this.assertRole(me);

    const policy = await this.clients.policy(policyId);
    await this.files.assertCanAccess('POLICY', policyId, me);

    // CỔNG THỜI ĐIỂM: chưa tiếp nhận lần 1 thì chưa xuất được — điều kiện giống
    // hệt nhau cho kế toán và Sale Admin. Quyền rộng ra không mở cổng sớm hơn
    // (DOC-10, DOC-21).
    if (!policy.kt_l1_received_at) {
      throw new ConflictException({
        code: 'CONTRACT_NOT_READY',
        message: 'Hồ sơ chưa được Kế toán tiếp nhận lần 1 nên chưa xuất được hợp đồng',
        status: policy.status,
      });
    }

    const active = await this.templates.active();
    if (!active) {
      throw new ConflictException({
        code: 'NO_ACTIVE_TEMPLATE',
        message:
          'Chưa có mẫu hợp đồng nào đang dùng. Đề nghị Sale Admin phát hành một mẫu ' +
          'ở màn hình Mẫu hợp đồng rồi xuất lại.',
      });
    }

    const [customer, people] = await Promise.all([
      this.clients.customer(policy.customer_id),
      this.clients.peopleFor(policy.tdv_user_id ?? '', {
        tbp: policy.tbp_user_id,
        keToan: policy.ke_toan_user_id,
        saleAdmin: policy.sale_admin_user_id,
      }),
    ]);
    // Phép trộn dùng chung với bản mềm CSBH (`0055`) — xem `tron.ts`.
    const { values, lines, missingRequired } = tron(active.fields, { policy, customer, people });

    return {
      policyId,
      policyCode: policy.code,
      templateId: active.template.id,
      templateName: active.template.name,
      values,
      lines,
      missingRequired,
    };
  }

  async preview(policyId: string, me: AuthUser): Promise<Preview> {
    return this.build(policyId, me);
  }

  /**
   * Sinh PDF và trả về NGAY. Không ghi file lên MinIO, không tạo bản ghi hợp
   * đồng — `DOC-28` quét kho lưu trữ để giữ điều đó đúng.
   */
  async export(
    policyId: string,
    me: AuthUser,
    /** Chỉ XEM trong phần mềm — vẫn đóng dấu xuất, nhưng không ghi lịch sử (`0052`). */
    chiXem = false,
  ): Promise<{ pdf: Buffer; fileName: string }> {
    const built = await this.build(policyId, me);

    if (built.missingRequired.length > 0) {
      throw new UnprocessableEntityException({
        code: 'CONTRACT_FIELDS_MISSING',
        message: 'Hồ sơ khách hàng thiếu trường bắt buộc, chưa xuất được hợp đồng',
        missing: built.missingRequired,
      });
    }

    // Mẫu đọc từ kho ở ĐÚNG thời điểm bấm. Sale Admin thay mẫu thì lần xuất sau
    // dùng mẫu mới — không có ràng buộc phiên bản nào vì lần xuất trước không
    // được lưu lại (DOC-15).
    const template = await this.templates.byId(built.templateId);
    const templateFile = await this.files.row(template.file_id);
    const docx = await this.storage.get(templateFile.object_key);

    const linePlaceholders = new Set(built.lines.flatMap((l) => Object.keys(l)));
    const merged = mergeDocx(docx, {
      values: built.values,
      lines: built.lines,
      linePlaceholders,
    });

    const pdf = await this.gotenberg.docxToPdf(merged, `hop-dong-${built.policyCode}.docx`);

    // Ghi dấu vết SAU khi đã có PDF trong tay. Ghi trước rồi Gotenberg chết là
    // hồ sơ mang dấu "đã xuất hợp đồng" cho một lần xuất không hề xảy ra (DOC-34).
    await this.clients.daSinhVanBan(policyId, 'HOP_DONG', me, !chiXem);
    await this.db.tx(async (c) => this.audit(c, built, me));

    return { pdf, fileName: `hop-dong-${built.policyCode}.pdf` };
  }

  /**
   * Một dòng nhật ký cho mỗi lần bấm, kèm người bấm và vai trò (DOC-23).
   *
   * Đi qua outbox vì role csbh_doc không có quyền ghi vào schema aud — cùng lý
   * do như ở catalog và customer.
   */
  private async audit(c: PoolClient, built: Preview, me: AuthUser): Promise<void> {
    await c.query(`INSERT INTO doc.outbox (routing_key, payload) VALUES ($1,$2::jsonb)`, [
      'document.contract_issued',
      JSON.stringify({
        entity: 'policy',
        id: built.policyId,
        policyCode: built.policyCode,
        templateId: built.templateId,
        actorId: me.id,
        actorRole: me.role,
        at: new Date().toISOString(),
      }),
    ]);
  }
}
