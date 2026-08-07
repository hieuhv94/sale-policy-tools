/**
 * Mẫu hợp đồng: tải lên, đọc ô trống, ánh xạ trường, phát hành.
 *
 * Thuộc **Sale Admin**, không thuộc Quản trị hệ thống (muc 8.2, DOC-26). Đây là
 * chỗ dễ nhầm vì Quản trị nắm mọi danh mục khác — nhưng mẫu hợp đồng là văn bản
 * nghiệp vụ do người bán soạn, không phải cấu hình hệ thống.
 */
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { Storage } from '../infra/storage.js';
import { FilesService } from '../files/files.service.js';
import { makeDocx, NotADocxError, para, placeholdersOf, table, tableRow } from './docx.js';
import { FORMATS, isKnownSource, KNOWN_SOURCES } from './sources.js';

export type TemplateRow = {
  id: string;
  name: string;
  file_id: string;
  is_active: boolean;
  is_default: boolean;
  published_at: Date | null;
  updated_at: Date;
};

export type FieldRow = {
  placeholder: string;
  source: string;
  required: boolean;
  format: string | null;
};

export type MappingInput = {
  placeholder: string;
  source: string;
  required?: boolean | undefined;
  format?: string | undefined;
};

@Injectable()
export class TemplatesService {
  private readonly log = new Logger(TemplatesService.name);

  constructor(
    private readonly db: Db,
    private readonly storage: Storage,
    private readonly files: FilesService,
  ) {}

  // --- Tải lên --------------------------------------------------------------

  async upload(name: string, buffer: Buffer, me: AuthUser) {
    // Đọc ô trống TRƯỚC khi ghi bất cứ thứ gì: file hỏng thì mẫu đang dùng không
    // bị ảnh hưởng và kho không có object thừa (DOC-33).
    let placeholders: string[];
    try {
      placeholders = placeholdersOf(buffer);
    } catch (e) {
      if (e instanceof NotADocxError) {
        throw new BadRequestException({ code: 'TEMPLATE_NOT_DOCX', message: e.message });
      }
      throw e;
    }

    const file = await this.files.upload(
      { ownerKind: 'TEMPLATE', ownerId: null, purpose: 'MAU_HD', fileName: `${name}.docx`, buffer },
      me,
    );
    const row = await this.db.one<TemplateRow>(
      `INSERT INTO doc.contract_template (name, file_id, updated_by) VALUES ($1,$2,$3) RETURNING *`,
      [name, file.id, me.id],
    );
    return { ...view(row!), placeholders, knownSources: KNOWN_SOURCES };
  }

  async byId(id: string): Promise<TemplateRow> {
    const r = await this.db.one<TemplateRow>(`SELECT * FROM doc.contract_template WHERE id = $1`, [
      id,
    ]);
    if (!r) throw new NotFoundException({ code: 'TEMPLATE_NOT_FOUND' });
    return r;
  }

  async list() {
    const rows = await this.db.q<TemplateRow>(
      `SELECT * FROM doc.contract_template ORDER BY is_active DESC, updated_at DESC`,
    );
    return rows.map(view);
  }

  /** Ô trống đọc lại từ chính file .docx, không từ CSDL — mẫu là nguồn sự thật. */
  async placeholders(id: string): Promise<string[]> {
    const t = await this.byId(id);
    const file = await this.files.row(t.file_id);
    return placeholdersOf(await this.storage.get(file.object_key));
  }

  async fields(id: string): Promise<FieldRow[]> {
    return this.db.q<FieldRow>(
      `SELECT placeholder, source, required, format FROM doc.contract_template_field
        WHERE template_id = $1 ORDER BY placeholder`,
      [id],
    );
  }

  // --- Ánh xạ ---------------------------------------------------------------

  /**
   * Lưu bảng ánh xạ. Kiểm ngay tại đây chứ không đợi lúc xuất: Sale Admin phải
   * biết mình gõ sai tên trường ngay ở màn hình đang gõ, không phải hai tuần sau
   * khi kế toán bấm xuất và nhận lỗi (DOC-29).
   */
  async setMapping(id: string, mapping: MappingInput[], me: AuthUser) {
    await this.byId(id);
    const known = new Set(await this.placeholders(id));

    for (const m of mapping) {
      if (!known.has(m.placeholder)) {
        throw new BadRequestException({
          code: 'PLACEHOLDER_NOT_IN_TEMPLATE',
          message: `Mẫu không có ô trống ${m.placeholder}`,
          placeholder: m.placeholder,
        });
      }
      if (!isKnownSource(m.source)) {
        throw new BadRequestException({
          code: 'SOURCE_UNKNOWN',
          message: `Không có trường nguồn "${m.source}"`,
          placeholder: m.placeholder,
          source: m.source,
          knownSources: KNOWN_SOURCES,
        });
      }
      if (m.format && !FORMATS.includes(m.format as never)) {
        throw new BadRequestException({
          code: 'FORMAT_UNKNOWN',
          message: `Không có định dạng "${m.format}"`,
          allowed: FORMATS,
        });
      }
    }

    return this.db.tx(async (c) => {
      await c.query(`DELETE FROM doc.contract_template_field WHERE template_id = $1`, [id]);
      for (const m of mapping) {
        await c.query(
          `INSERT INTO doc.contract_template_field (template_id, placeholder, source, required, format)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, m.placeholder, m.source, m.required ?? false, m.format ?? null],
        );
      }
      await c.query(`UPDATE doc.contract_template SET updated_by = $2, updated_at = now() WHERE id = $1`, [
        id,
        me.id,
      ]);
      return { templateId: id, mapped: mapping.length };
    });
  }

  // --- Phát hành ------------------------------------------------------------

  /**
   * Đặt mẫu này thành mẫu đang dùng. Chặn nếu còn ô trống chưa ánh xạ (DOC-30):
   * phát hành một mẫu thiếu ánh xạ nghĩa là hợp đồng in ra mang nguyên chuỗi
   * `{{...}}` gửi cho khách hàng.
   */
  async publish(id: string, me: AuthUser) {
    await this.byId(id);
    const declared = await this.placeholders(id);
    const mapped = new Set((await this.fields(id)).map((f) => f.placeholder));
    const missing = declared.filter((p) => !mapped.has(p));

    if (missing.length > 0) {
      throw new ConflictException({
        code: 'TEMPLATE_INCOMPLETE',
        message: 'Còn ô trống chưa ánh xạ tới trường dữ liệu nào',
        missing,
      });
    }

    return this.db.tx(async (c) => {
      // Hạ mẫu cũ TRƯỚC. Partial unique index kiểm ngay sau từng câu lệnh chứ
      // không hoãn tới COMMIT, nên làm ngược lại là có một khoảnh khắc hai mẫu
      // cùng active và CSDL từ chối — đúng thứ tự đã học ở EFF-01 của policy.
      await c.query(`UPDATE doc.contract_template SET is_active = false WHERE is_active`);
      await c.query(
        `UPDATE doc.contract_template
            SET is_active = true, published_at = now(), updated_by = $2, updated_at = now()
          WHERE id = $1`,
        [id, me.id],
      );
      return { id, isActive: true };
    });
  }

  async deactivate(id: string, me: AuthUser) {
    await this.byId(id);
    await this.db.q(
      `UPDATE doc.contract_template SET is_active = false, updated_by = $2, updated_at = now()
        WHERE id = $1`,
      [id, me.id],
    );
    return { id, isActive: false };
  }

  /** Mẫu đang dùng, kèm bảng ánh xạ. `undefined` nghĩa là Sale Admin đã vô hiệu hết. */
  async active(): Promise<{ template: TemplateRow; fields: FieldRow[] } | undefined> {
    const t = await this.db.one<TemplateRow>(
      `SELECT * FROM doc.contract_template WHERE is_active LIMIT 1`,
    );
    if (!t) return undefined;
    return { template: t, fields: await this.fields(t.id) };
  }

  // --- Mẫu mặc định ---------------------------------------------------------

  /**
   * Seed một mẫu tối thiểu lúc khởi động nếu chưa có mẫu nào.
   *
   * Không có bước này thì hệ thống mới triển khai xong sẽ trả 409 ở lần xuất hợp
   * đồng đầu tiên, và người dùng gặp một lỗi mà họ không có cách nào đoán ra
   * phải làm gì (DOC-35).
   */
  async ensureDefault(systemUserId: string): Promise<void> {
    const existing = await this.db.one<{ id: string }>(
      `SELECT id FROM doc.contract_template LIMIT 1`,
    );
    if (existing) {
      // Có dòng mẫu rồi, nhưng dòng đó CÓ CÒN FILE KHÔNG lại là câu hỏi khác.
      // CSDL và kho đối tượng ghi riêng nên chúng lệch nhau được: phục hồi CSDL
      // từ một bản sao lưu cũ hơn MinIO, dựng lại MinIO từ đầu, hoặc xoá nhầm
      // một object. Khi đó mọi lần xuất hợp đồng đều 409 và thông báo lại nói
      // "chưa có mẫu nào" — trong khi màn hình quản trị hiển thị rõ ràng là có.
      //
      // Tự chữa CHỈ cho mẫu mặc định, vì nó do chính hệ thống sinh ra và dựng
      // lại được y hệt. Mẫu do Sale Admin tải lên thì KHÔNG: thay thầm nội dung
      // hợp đồng bằng một mẫu khác tệ hơn nhiều so với báo lỗi.
      const def = await this.db.one<{ id: string; file_id: string }>(
        `SELECT id, file_id FROM doc.contract_template WHERE is_default ORDER BY updated_at DESC LIMIT 1`,
      );
      if (!def || (await this.files.objectExists(def.file_id))) return;
      this.log.warn(`mẫu mặc định ${def.id} mất file trên kho lưu trữ — đang dựng lại`);
      const rebuilt = await this.files.store({
        fileName: 'mau-hop-dong-mac-dinh.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: makeDocx(defaultTemplateBody()),
        ownerKind: 'TEMPLATE',
        ownerId: null,
        purpose: 'MAU_HD',
        uploadedBy: systemUserId,
      });
      await this.db.q(
        `UPDATE doc.contract_template SET file_id = $2, updated_at = now() WHERE id = $1`,
        [def.id, rebuilt.id],
      );
      return;
    }

    const buffer = makeDocx(defaultTemplateBody());
    const file = await this.files.store({
      fileName: 'mau-hop-dong-mac-dinh.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer,
      ownerKind: 'TEMPLATE',
      ownerId: null,
      purpose: 'MAU_HD',
      uploadedBy: systemUserId,
    });

    await this.db.tx(async (c) => {
      const t = await c.query<{ id: string }>(
        `INSERT INTO doc.contract_template (name, file_id, is_default, is_active, published_at, updated_by)
         VALUES ($1,$2,true,true,now(),$3) RETURNING id`,
        ['Mẫu hợp đồng mặc định', file.id, systemUserId],
      );
      const id = t.rows[0]!.id;
      for (const m of DEFAULT_MAPPING) {
        await c.query(
          `INSERT INTO doc.contract_template_field (template_id, placeholder, source, required, format)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, m.placeholder, m.source, m.required ?? false, m.format ?? null],
        );
      }
    });
  }
}

const DEFAULT_MAPPING: MappingInput[] = [
  { placeholder: '{{company.name}}', source: 'company.name', required: true },
  { placeholder: '{{company.address}}', source: 'company.address' },
  { placeholder: '{{company.tax_code}}', source: 'company.tax_code' },
  { placeholder: '{{customer.name}}', source: 'customer.name', required: true },
  { placeholder: '{{customer.code}}', source: 'customer.code', required: true },
  { placeholder: '{{customer.registered_address}}', source: 'customer.registered_address', required: true },
  { placeholder: '{{customer.owner_name}}', source: 'customer.owner_name', required: true },
  { placeholder: '{{customer.debt}}', source: 'customer.debt', format: 'money_vnd' },
  { placeholder: '{{policy.code}}', source: 'policy.code', required: true },
  { placeholder: '{{policy.applied_date}}', source: 'policy.applied_date', format: 'date_dmy' },
  { placeholder: '{{today}}', source: 'today', format: 'date_dmy' },
  { placeholder: '{{line.index}}', source: 'policy.lines[].index' },
  { placeholder: '{{line.product_code}}', source: 'policy.lines[].product_code' },
  { placeholder: '{{line.product_name}}', source: 'policy.lines[].product_name' },
  { placeholder: '{{line.net_price}}', source: 'policy.lines[].net_price', format: 'money_vnd' },
  { placeholder: '{{line.discount_rate}}', source: 'policy.lines[].discount_rate', format: 'percent_2' },
];

const defaultTemplateBody = (): string =>
  [
    para('{{company.name}}'),
    para('{{company.address}} — MST {{company.tax_code}}'),
    para(''),
    para('HỢP ĐỒNG NGUYÊN TẮC BÁN HÀNG'),
    para('Số hồ sơ CSBH: {{policy.code}} — ngày áp dụng {{policy.applied_date}}'),
    para(''),
    para('BÊN MUA: {{customer.name}} (mã {{customer.code}})'),
    para('Địa chỉ: {{customer.registered_address}}'),
    para('Người đại diện: {{customer.owner_name}}'),
    para('Công nợ hiện tại: {{customer.debt}} đồng'),
    para(''),
    para('Danh sách sản phẩm và chính sách giá:'),
    table([
      tableRow(['#', 'Mã sản phẩm', 'Tên sản phẩm', 'Giá thu về', 'Tỷ lệ chiết khấu']),
      tableRow([
        '{{line.index}}',
        '{{line.product_code}}',
        '{{line.product_name}}',
        '{{line.net_price}}',
        '{{line.discount_rate}}',
      ]),
    ]),
    para(''),
    para('Hà Nội, ngày {{today}}'),
  ].join('');

const view = (r: TemplateRow) => ({
  id: r.id,
  name: r.name,
  fileId: r.file_id,
  isActive: r.is_active,
  isDefault: r.is_default,
  publishedAt: r.published_at,
  updatedAt: r.updated_at,
});
