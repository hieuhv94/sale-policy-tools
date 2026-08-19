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
import {
  makeDocx,
  NotADocxError,
  O_BANG_SAN_PHAM,
  para,
  placeholdersOf,
  table,
  tableRow,
} from './docx.js';
import { FORMATS, isKnownSource, KNOWN_SOURCES, NGUON_BAT_BUOC_HO_SO } from './sources.js';

/**
 * Hai loại mẫu, hai chủ sở hữu khác nhau (`0055`).
 *
 * `HOP_DONG` do **Sale Admin** soạn (muc 8.2) — văn bản nghiệp vụ của người bán.
 * `HO_SO` do **Quản trị hệ thống** (muc 6.4) — bố cục bản CSBH A4, thứ trước
 * `0055` nằm cứng trong mã.
 */
export type Loai = 'HOP_DONG' | 'HO_SO';
export type KhoGiay = 'a4p' | 'a4l';

export const KHO_GIAY: KhoGiay[] = ['a4p', 'a4l'];
export const NHAN_KHO: Record<KhoGiay, string> = { a4p: 'A4 dọc', a4l: 'A4 ngang' };

export type TemplateRow = {
  id: string;
  name: string;
  file_id: string;
  is_active: boolean;
  is_default: boolean;
  published_at: Date | null;
  updated_at: Date;
  kind: Loai;
  paper_size: KhoGiay | null;
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

  async upload(
    name: string,
    buffer: Buffer,
    me: AuthUser,
    kind: Loai = 'HOP_DONG',
    paperSize?: KhoGiay,
  ) {
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

    // `purpose` vẫn là `MAU_HD` cho cả hai loại: nó nói FILE NÀY LÀ GÌ — một
    // mẫu .docx — chứ không nói ai sở hữu. Thêm một giá trị enum thứ hai là
    // thêm một nhánh vào bảng `ALLOWED` kiểm kiểu nội dung, cho cùng một câu
    // trả lời. Loại mẫu nằm ở cột `kind` của chính bảng mẫu.
    const file = await this.files.upload(
      { ownerKind: 'TEMPLATE', ownerId: null, purpose: 'MAU_HD', fileName: `${name}.docx`, buffer },
      me,
    );
    const row = await this.db.one<TemplateRow>(
      `INSERT INTO doc.contract_template (name, file_id, updated_by, kind, paper_size)
       VALUES ($1,$2,$3,$4::doc.template_kind,$5::doc.paper_size) RETURNING *`,
      [name, file.id, me.id, kind, paperSize ?? null],
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

  async list(kind: Loai = 'HOP_DONG') {
    // Lọc theo loại, KHÔNG trả cả hai rồi để màn hình tự lọc: hai màn hình khác
    // nhau, hai vai trò khác nhau, và Sale Admin không có việc gì với mẫu hồ sơ.
    const rows = await this.db.q<TemplateRow>(
      `SELECT * FROM doc.contract_template WHERE kind = $1::doc.template_kind
        ORDER BY is_active DESC, paper_size, updated_at DESC`,
      [kind],
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
    const t = await this.byId(id);
    const declared = await this.placeholders(id);
    const fields = await this.fields(id);
    const mapped = new Set(fields.map((f) => f.placeholder));

    /*
     * Ô trống bảng sản phẩm KHÔNG cần ánh xạ (`0055`).
     *
     * Nó không trỏ tới một trường dữ liệu nào — hệ thống thay nó bằng cả một
     * bảng. Bắt Quản trị ánh xạ nó là bắt họ chọn một nguồn không tồn tại.
     */
    const missing = declared.filter((p) => p !== O_BANG_SAN_PHAM && !mapped.has(p));

    if (missing.length > 0) {
      throw new ConflictException({
        code: 'TEMPLATE_INCOMPLETE',
        message: 'Còn ô trống chưa ánh xạ tới trường dữ liệu nào',
        missing,
      });
    }

    if (t.kind === 'HO_SO') {
      /*
       * MƯỜI BA MỤC BẮT BUỘC của muc 11.1 — kiểm ở đây, một lần, lúc phát hành.
       *
       * Muc 6.4 để ngỏ đúng câu hỏi này khi chốt rằng bản A4 chưa nhận mẫu tải
       * lên: *"nếu mẫu do người dùng soạn, hệ thống không còn bảo đảm được 13
       * mục kia có mặt"*. Phép kiểm này là câu trả lời.
       */
      const daCo = new Set(fields.map((f) => f.source));
      const thieu = NGUON_BAT_BUOC_HO_SO.filter((n) => !daCo.has(n));
      const thieuBang = !declared.includes(O_BANG_SAN_PHAM);

      if (thieu.length > 0 || thieuBang) {
        throw new ConflictException({
          code: 'TEMPLATE_MISSING_REQUIRED',
          message:
            'Mẫu hồ sơ CSBH còn thiếu mục bắt buộc. Bản A4 phải có đủ 13 mục ở muc 11.1.',
          thieuTruong: thieu,
          ...(thieuBang ? { thieuBangSanPham: O_BANG_SAN_PHAM } : {}),
        });
      }
    }

    return this.db.tx(async (c) => {
      /*
       * Hạ mẫu cũ TRƯỚC, và CHỈ TRONG CÙNG PHẠM VI.
       *
       * Bản trước hạ mọi mẫu đang dùng của cả bảng — đúng khi chỉ có một loại
       * mẫu. Từ `0055` mà giữ nguyên thì phát hành mẫu hồ sơ khổ dọc sẽ đá mẫu
       * hợp đồng ra, và triệu chứng là kế toán mất khả năng xuất hợp đồng ngay
       * lúc Quản trị làm một việc chẳng liên quan gì.
       *
       * Thứ tự hạ-trước-nâng-sau thì giữ: partial unique index kiểm ngay sau
       * từng câu lệnh chứ không hoãn tới COMMIT.
       */
      await c.query(
        `UPDATE doc.contract_template SET is_active = false
          WHERE is_active AND kind = $1::doc.template_kind
            AND paper_size IS NOT DISTINCT FROM $2::doc.paper_size`,
        [t.kind, t.paper_size],
      );
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

  /**
   * Mẫu đang dùng của một loại (và một khổ giấy, với mẫu hồ sơ).
   *
   * `undefined` nghĩa là chưa có mẫu phù hợp — với hợp đồng thì Sale Admin đã vô
   * hiệu hết, với hồ sơ thì Quản trị chưa phát hành mẫu cho khổ giấy ấy.
   */
  async active(
    kind: Loai = 'HOP_DONG',
    paperSize?: KhoGiay,
  ): Promise<{ template: TemplateRow; fields: FieldRow[] } | undefined> {
    const t = await this.db.one<TemplateRow>(
      `SELECT * FROM doc.contract_template
        WHERE is_active AND kind = $1::doc.template_kind
          AND paper_size IS NOT DISTINCT FROM $2::doc.paper_size
        LIMIT 1`,
      [kind, paperSize ?? null],
    );
    if (!t) return undefined;
    return { template: t, fields: await this.fields(t.id) };
  }

  // --- Mẫu mặc định ---------------------------------------------------------

  /**
   * Seed một mẫu tối thiểu lúc khởi động nếu chưa có mẫu nào ĐANG DÙNG.
   *
   * Không có bước này thì hệ thống mới triển khai xong sẽ trả 409 ở lần xuất hợp
   * đồng đầu tiên, và người dùng gặp một lỗi mà họ không có cách nào đoán ra
   * phải làm gì (DOC-35).
   */
  async ensureDefault(systemUserId: string): Promise<void> {
    await this.ensureDefaultHopDong(systemUserId);
    await this.ensureDefaultHoSo(systemUserId);
  }

  /**
   * Seed mẫu hồ sơ CSBH mặc định cho CẢ HAI khổ giấy (`0055`).
   *
   * Không có bước này thì hệ thống vừa triển khai xong không xem được bản mềm
   * nào — mọi lượt bấm *Xem bản mềm* trả về "chưa có văn bản mẫu phù hợp", và
   * người dùng gặp một lỗi mà họ không có cách nào đoán ra phải làm gì. Cùng lý
   * do với mẫu hợp đồng mặc định (DOC-35).
   *
   * Đường báo lỗi VẪN có thật và vẫn tới được: Quản trị vô hiệu mẫu của một khổ
   * là khổ ấy báo lỗi ngay. Mẫu mặc định chỉ bảo đảm hệ thống chạy được từ phút
   * đầu, không bảo đảm nó luôn có mẫu.
   */
  private async ensureDefaultHoSo(systemUserId: string): Promise<void> {
    for (const kho of KHO_GIAY) {
      const co = await this.db.one<{ id: string }>(
        `SELECT id FROM doc.contract_template
          WHERE is_active AND kind = 'HO_SO' AND paper_size = $1::doc.paper_size LIMIT 1`,
        [kho],
      );
      if (co) continue;

      const file = await this.files.store({
        fileName: `mau-ho-so-csbh-${kho}.docx`,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: makeDocx(defaultHoSoBody(), kho),
        ownerKind: 'TEMPLATE',
        ownerId: null,
        purpose: 'MAU_HD',
        uploadedBy: systemUserId,
      });

      await this.db.tx(async (c) => {
        const t = await c.query<{ id: string }>(
          `INSERT INTO doc.contract_template
             (name, file_id, is_default, is_active, published_at, updated_by, kind, paper_size)
           VALUES ($1,$2,true,true,now(),$3,'HO_SO',$4::doc.paper_size) RETURNING id`,
          [`Mẫu hồ sơ CSBH mặc định — ${NHAN_KHO[kho]}`, file.id, systemUserId, kho],
        );
        const id = t.rows[0]!.id;
        for (const m of DEFAULT_HO_SO_MAPPING) {
          await c.query(
            `INSERT INTO doc.contract_template_field (template_id, placeholder, source, required, format)
             VALUES ($1,$2,$3,$4,$5)`,
            [id, m.placeholder, m.source, m.required ?? false, m.format ?? null],
          );
        }
      });
    }
  }

  private async ensureDefaultHopDong(systemUserId: string): Promise<void> {
    // Điều kiện là "có mẫu nào ĐANG DÙNG không", KHÔNG phải "bảng có dòng nào
    // không". Hai câu ấy khác nhau ở đúng tình huống đã xảy ra thật: một lượt
    // chạy vô hiệu hết mẫu rồi chết giữa chừng trước khi phát hành lại, để lại
    // 54 dòng mẫu mà không dòng nào đang dùng. Với điều kiện cũ thì `ensureDefault`
    // thấy "đã có mẫu" và không làm gì — mọi lần xuất hợp đồng sau đó đều 409,
    // vĩnh viễn, và khởi động lại service cũng không chữa được.
    const existing = await this.db.one<{ id: string }>(
      `SELECT id FROM doc.contract_template WHERE is_active AND kind = 'HOP_DONG' LIMIT 1`,
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
        `SELECT id, file_id FROM doc.contract_template
          WHERE is_default AND kind = 'HOP_DONG' ORDER BY updated_at DESC LIMIT 1`,
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

/**
 * Ánh xạ mặc định của mẫu hồ sơ — phủ ĐỦ 13 mục bắt buộc của muc 11.1.
 *
 * Nếu thiếu một mục thì chính `publish` từ chối mẫu mặc định, và service không
 * seed được gì lúc khởi động. Đó là chủ ý: bảng này và `NGUON_BAT_BUOC_HO_SO`
 * phải khớp nhau, và cách rẻ nhất để giữ chúng khớp là để cái sau canh cái trước.
 */
const DEFAULT_HO_SO_MAPPING: MappingInput[] = [
  { placeholder: '{{company.name}}', source: 'company.name', required: true },
  { placeholder: '{{company.address}}', source: 'company.address' },
  { placeholder: '{{company.tax_code}}', source: 'company.tax_code' },
  { placeholder: '{{policy.code}}', source: 'policy.code', required: true },
  { placeholder: '{{policy.version_no}}', source: 'policy.version_no' },
  { placeholder: '{{policy.status}}', source: 'policy.status', required: true },
  { placeholder: '{{policy.applied_date}}', source: 'policy.applied_date', format: 'date_dmy' },
  { placeholder: '{{customer.code}}', source: 'customer.code', required: true },
  { placeholder: '{{customer.name}}', source: 'customer.name', required: true },
  { placeholder: '{{customer.registered_address}}', source: 'customer.registered_address' },
  { placeholder: '{{customer.owner_name}}', source: 'customer.owner_name' },
  { placeholder: '{{customer.debt}}', source: 'customer.debt', format: 'money_vnd' },
  { placeholder: '{{person.tdv}}', source: 'person.tdv', required: true },
  { placeholder: '{{person.tbp}}', source: 'person.tbp' },
  { placeholder: '{{person.ke_toan}}', source: 'person.ke_toan' },
  { placeholder: '{{policy.tbp_signed_at}}', source: 'policy.tbp_signed_at', format: 'date_dmy' },
  { placeholder: '{{policy.kt_l2_received_at}}', source: 'policy.kt_l2_received_at', format: 'date_dmy' },
  { placeholder: '{{policy.attachments}}', source: 'policy.attachments' },
];

/**
 * Thân mẫu hồ sơ mặc định — chép lại bố cục của bản A4 dựng cứng trước `0055`.
 *
 * Giữ nguyên thứ tự và cách gọi tên để người đang quen bản cũ mở ra không thấy
 * khác gì; khác biệt duy nhất là giờ Quản trị SỬA ĐƯỢC nó.
 *
 * Ô `{{policy.lines_table}}` là chỗ hệ thống nhét cả bảng sản phẩm vào, với số
 * cột CPBH đúng theo hồ sơ đang xem.
 */
const defaultHoSoBody = (): string =>
  [
    para('{{company.name}}'),
    para('{{company.address}} — MST {{company.tax_code}}'),
    para(''),
    para('CHÍNH SÁCH BÁN HÀNG'),
    para('Số {{policy.code}} · phiên bản {{policy.version_no}}'),
    para(''),
    // NHÃN tường minh cho từng mục. Bản A4 là văn bản đưa cho người ký đọc —
    // một con số đứng trơ không nói được nó là con số gì.
    para('Trạng thái: {{policy.status}}'),
    para('Mã khách hàng: {{customer.code}}'),
    para('Tên khách hàng: {{customer.name}}'),
    para('Địa chỉ: {{customer.registered_address}}'),
    para('Người đại diện: {{customer.owner_name}}'),
    para('Công nợ: {{customer.debt}} đồng'),
    para('Người đề nghị: {{person.tdv}}'),
    para('Thời gian áp dụng: {{policy.applied_date}}'),
    para(''),
    para('{{policy.lines_table}}'),
    para(''),
    para('Thời gian duyệt'),
    para('Trưởng bộ phận: {{person.tbp}} — ký ngày {{policy.tbp_signed_at}}'),
    para('Kế toán: {{person.ke_toan}} — tiếp nhận ngày {{policy.kt_l2_received_at}}'),
    para('File đính kèm: {{policy.attachments}}'),
  ].join('');

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
  kind: r.kind,
  paperSize: r.paper_size,
  fileId: r.file_id,
  isActive: r.is_active,
  isDefault: r.is_default,
  publishedAt: r.published_at,
  updatedAt: r.updated_at,
});
