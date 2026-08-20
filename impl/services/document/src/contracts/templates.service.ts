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
import { ObjectMissingError, Storage } from '../infra/storage.js';
import { FilesService } from '../files/files.service.js';
import {
  khoGiayCua,
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

/**
 * Thứ tự mẫu trong ô chọn — và mẫu đầu danh sách là mẫu mặc định (`0058`).
 *
 * `is_default` xếp SAU CÙNG, không phải trước. Mẫu mặc định là cái sơ sài do hệ
 * thống tự seed để phần mềm chạy được từ phút đầu (DOC-35); ngày Quản trị phát
 * hành một mẫu thật thì mẫu thật phải là cái mở ra sẵn, còn cái sơ sài lùi
 * xuống cuối. Xếp ngược lại thì công soạn mẫu của họ chỉ tới được người nào
 * chịu khó mở ô chọn ra.
 *
 * `paper_size` đứng trước `id` để phá hoà DỨT KHOÁT chứ không ngẫu nhiên: hai
 * mẫu mặc định seed cùng một giao dịch có `published_at` bằng nhau, và `id` là
 * uuid ngẫu nhiên — bỏ nó ra thì mẫu mở sẵn là khổ dọc hay khổ ngang tuỳ từng
 * lần cài đặt. Thứ tự khai enum cho A4 dọc đứng trước.
 */
const THU_TU_MAU = 'is_default ASC, published_at DESC NULLS LAST, paper_size, id';

@Injectable()
export class TemplatesService {
  private readonly log = new Logger(TemplatesService.name);

  constructor(
    private readonly db: Db,
    private readonly storage: Storage,
    private readonly files: FilesService,
  ) {}

  // --- Tải lên --------------------------------------------------------------

  async upload(name: string, buffer: Buffer, me: AuthUser, kind: Loai = 'HOP_DONG') {
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
      // Khổ giấy ĐỌC TỪ FILE (`0058`), không phải một ô người tải lên tự khai —
      // xem `khoGiayCua`. Đọc cho CẢ mẫu hợp đồng: nó cũng in ra giấy, và cái
      // nhãn ấy giúp người chọn biết mình sắp in ra tờ nằm ngang hay tờ đứng.
      [name, file.id, me.id, kind, khoGiayCua(buffer)],
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

    /*
     * KHÔNG hạ mẫu nào xuống nữa (`0058`).
     *
     * Tới `0057`, phát hành nghĩa là "đặt làm mẫu DUY NHẤT của khổ này", nên nó
     * phải hạ mẫu cũ trước — hai mẫu cùng đang dùng thì `LIMIT 1` chọn bừa một
     * cái và không ai biết bản in ra dựng từ mẫu nào.
     *
     * Từ `0058` chính người xem chọn mẫu, nên nhiều mẫu cùng dùng được KHÔNG
     * còn là mập mờ — nó LÀ cái danh sách để chọn. Giữ bước hạ ấy thì phát hành
     * mẫu thứ hai sẽ lặng lẽ gỡ mẫu thứ nhất khỏi ô chọn, và Quản trị không bao
     * giờ có nổi hai mẫu.
     */
    await this.db.q(
      `UPDATE doc.contract_template
          SET is_active = true, published_at = now(), updated_by = $2, updated_at = now()
        WHERE id = $1`,
      [id, me.id],
    );
    return { id, isActive: true };
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
   * Danh sách mẫu ĐANG DÙNG của một loại — cái để dựng ô chọn (`0058`).
   *
   * Mở cho mọi vai trò đọc được văn bản tương ứng, không riêng người quản lý
   * mẫu: người chọn mẫu lúc xem bản mềm là kế toán, TDV, Trưởng bộ phận — họ
   * cần biết có những mẫu nào, chứ không cần quyền sửa mẫu nào.
   *
   * Trả về đúng bốn thứ ô chọn cần. KHÔNG dùng lại `view()` của màn hình quản
   * lý: `fileId`, `updatedAt`, `isDefault` là chuyện nội bộ của mẫu, và một
   * đường đọc mở rộng cho năm vai trò thì càng ít cột lọt ra càng tốt.
   */
  async khaDung(kind: Loai): Promise<{ id: string; ten: string; khoGiay: KhoGiay | null }[]> {
    const rows = await this.db.q<TemplateRow>(
      `SELECT * FROM doc.contract_template
        WHERE is_active AND kind = $1::doc.template_kind
        ORDER BY ${THU_TU_MAU}`,
      [kind],
    );
    return rows.map((r) => ({ id: r.id, ten: r.name, khoGiay: r.paper_size }));
  }

  /**
   * Mẫu để dựng văn bản: cái người dùng CHỌN, hoặc mẫu mặc định nếu không chọn.
   *
   * `undefined` nghĩa là chưa có mẫu nào đang dùng — người quản lý mẫu chưa phát
   * hành cái nào, hoặc đã rút hết khỏi danh sách.
   *
   * MẪU ĐÃ RÚT KHỎI DANH SÁCH THÌ TỪ CHỐI, không âm thầm rơi về mẫu mặc định.
   * Tình huống có thật: người dùng mở hộp chọn, đi pha cà phê, trong lúc ấy
   * Quản trị ngừng dùng mẫu kia. Dựng bằng mẫu khác thì họ nhận về một văn bản
   * không phải thứ họ vừa chọn, và không có gì trên màn hình nói ra điều đó.
   */
  async chon(
    kind: Loai,
    mauId?: string,
  ): Promise<{ template: TemplateRow; fields: FieldRow[] } | undefined> {
    const t = mauId
      ? await this.db.one<TemplateRow>(
          `SELECT * FROM doc.contract_template
            WHERE id = $1 AND is_active AND kind = $2::doc.template_kind`,
          [mauId, kind],
        )
      : await this.db.one<TemplateRow>(
          `SELECT * FROM doc.contract_template
            WHERE is_active AND kind = $1::doc.template_kind
            ORDER BY ${THU_TU_MAU} LIMIT 1`,
          [kind],
        );
    if (!t) {
      if (mauId) {
        throw new NotFoundException({
          code: 'TEMPLATE_NOT_USABLE',
          message: 'Mẫu vừa chọn không còn trong danh sách mẫu đang dùng. Hãy chọn lại.',
          templateId: mauId,
        });
      }
      return undefined;
    }
    return { template: t, fields: await this.fields(t.id) };
  }

  /**
   * File `.docx` của một mẫu, đọc từ kho (`0059`).
   *
   * Một chỗ duy nhất cho cả bản mềm lẫn hợp đồng, vì cả hai cần đúng câu trả lời
   * này khi object đã biến mất: KHÔNG phải 500 kèm vết ngăn xếp của minio, mà là
   * một câu nói rõ chuyện gì xảy ra và AI sửa được.
   *
   * Mẫu MẶC ĐỊNH thì lẽ ra không tới được đây: `ensureDefault` dựng lại file cho
   * chúng lúc khởi động. Còn tới được thì service vừa khởi động xong đã mất
   * object — hiếm, nhưng câu thông báo vẫn phải đúng.
   */
  async docxCua(t: TemplateRow): Promise<Buffer> {
    const file = await this.files.row(t.file_id);
    try {
      return await this.storage.get(file.object_key);
    } catch (e) {
      if (!(e instanceof ObjectMissingError)) throw e;
      this.log.error(`mẫu ${t.id} (${t.name}) mất file trên kho lưu trữ: ${file.object_key}`);
      throw new ConflictException({
        code: 'TEMPLATE_FILE_MISSING',
        message:
          `File của mẫu "${t.name}" không còn trên kho lưu trữ. ` +
          `Đề nghị ${t.kind === 'HO_SO' ? 'Quản trị hệ thống' : 'Sale Admin'} tải mẫu lên lại ` +
          'rồi ban hành, hoặc chọn một mẫu khác.',
        templateId: t.id,
      });
    }
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
    await this.vaFileMacDinh(systemUserId);
  }

  /**
   * Dựng lại FILE của mẫu mặc định nào mất object trên kho (`0059`).
   *
   * CSDL và kho đối tượng ghi riêng nên chúng lệch nhau được, và lệch trong im
   * lặng: phục hồi CSDL từ một bản sao lưu mới hơn MinIO, dựng lại MinIO từ
   * đầu, hoặc xoá nhầm một object. Đã gặp thật — triệu chứng là mọi lượt xem
   * bản mềm trả 500 với `S3Error`, còn màn hình quản trị vẫn hiển thị mẫu ấy
   * đang dùng bình thường.
   *
   * Tới `0058` phép tự chữa này CHỈ có cho mẫu hợp đồng, và nó nằm lẫn trong
   * `ensureDefaultHopDong` — nên mẫu hồ sơ, thứ mọi vai trò đều mở hằng ngày,
   * lại là thứ không tự chữa được. Tách ra thành một bước riêng chạy cho cả
   * bảng thì không loại mẫu nào bị bỏ quên nữa.
   *
   * CHỈ CHỮA MẪU MẶC ĐỊNH, và đây là ranh giới cố ý: chúng do chính hệ thống
   * sinh ra nên dựng lại được y hệt. Mẫu người dùng tải lên thì KHÔNG — thay
   * thầm nội dung một văn bản nghiệp vụ bằng bố cục khác tệ hơn nhiều so với
   * báo lỗi, và `docxCua` lo phần báo lỗi ấy.
   */
  private async vaFileMacDinh(systemUserId: string): Promise<void> {
    const ds = await this.db.q<TemplateRow>(
      `SELECT * FROM doc.contract_template WHERE is_default`,
    );
    for (const t of ds) {
      if (await this.files.objectExists(t.file_id)) continue;
      this.log.warn(`mẫu mặc định ${t.id} (${t.name}) mất file trên kho lưu trữ — đang dựng lại`);

      // Dựng lại đúng bố cục của chính loại và khổ ấy. `paper_size` của mẫu hợp
      // đồng mặc định là null với hàng cũ trước `0058`, và `makeDocx` lấy khổ
      // dọc khi không nói gì — đúng bố cục nó vốn có.
      const buffer =
        t.kind === 'HO_SO'
          ? makeDocx(defaultHoSoBody(), t.paper_size ?? 'a4p')
          : makeDocx(defaultTemplateBody(), t.paper_size ?? 'a4p');

      const rebuilt = await this.files.store({
        fileName: t.kind === 'HO_SO' ? `mau-ho-so-csbh-${t.paper_size ?? 'a4p'}.docx` : 'mau-hop-dong-mac-dinh.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer,
        ownerKind: 'TEMPLATE',
        ownerId: null,
        purpose: 'MAU_HD',
        uploadedBy: systemUserId,
      });
      await this.db.q(
        `UPDATE doc.contract_template SET file_id = $2, updated_at = now() WHERE id = $1`,
        [t.id, rebuilt.id],
      );
    }
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
    const thieu: { kho: KhoGiay; fileId: string }[] = [];
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
      thieu.push({ kho, fileId: file.id });
    }
    if (thieu.length === 0) return;

    /*
     * CẢ HAI KHỔ TRONG MỘT GIAO DỊCH — để `published_at` của chúng BẰNG NHAU.
     *
     * `now()` của Postgres là thời điểm mở giao dịch, nên hai câu INSERT ở đây
     * nhận đúng một giá trị. Trước `0058` mỗi khổ một giao dịch riêng, chênh nhau
     * vài mili giây, và điều đó không hại gì khi mẫu được tra theo khổ.
     *
     * Từ `0058` thứ tự ấy QUYẾT ĐỊNH mẫu nào mở sẵn khi không ai chọn — bản xem
     * trước trong hộp ký số chẳng hạn. Chênh mili giây thì mẫu mặc định là khổ
     * nào tuỳ vào thứ tự vòng lặp, một chi tiết không ai nghĩ là mình đang quyết
     * định. Bằng nhau thì `THU_TU_MAU` rơi xuống `paper_size`, và A4 dọc — thứ
     * tự khai enum — luôn là bản mở sẵn.
     */
    await this.db.tx(async (c) => {
      for (const { kho, fileId } of thieu) {
        const t = await c.query<{ id: string }>(
          `INSERT INTO doc.contract_template
             (name, file_id, is_default, is_active, published_at, updated_by, kind, paper_size)
           VALUES ($1,$2,true,true,now(),$3,'HO_SO',$4::doc.paper_size) RETURNING id`,
          [`Mẫu hồ sơ CSBH mặc định — ${NHAN_KHO[kho]}`, fileId, systemUserId, kho],
        );
        const id = t.rows[0]!.id;
        for (const m of DEFAULT_HO_SO_MAPPING) {
          await c.query(
            `INSERT INTO doc.contract_template_field (template_id, placeholder, source, required, format)
             VALUES ($1,$2,$3,$4,$5)`,
            [id, m.placeholder, m.source, m.required ?? false, m.format ?? null],
          );
        }
      }
    });
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
    // Phép tự chữa "có dòng mẫu nhưng mất file" KHÔNG còn ở đây (`0059`): nó là
    // `vaFileMacDinh`, chạy cho CẢ BẢNG sau hai bước seed. Nằm lẫn trong nhánh
    // này thì mẫu hồ sơ không được chữa, mà đó mới là thứ mọi vai trò mở hằng ngày.
    if (existing) return;

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
  { placeholder: '{{cong_ty.ten}}', source: 'cong_ty.ten', required: true },
  { placeholder: '{{cong_ty.dia_chi}}', source: 'cong_ty.dia_chi' },
  { placeholder: '{{cong_ty.ma_so_thue}}', source: 'cong_ty.ma_so_thue' },
  { placeholder: '{{ho_so.ten_khach_hang}}', source: 'ho_so.ten_khach_hang', required: true },
  { placeholder: '{{ho_so.ma_khach_hang}}', source: 'ho_so.ma_khach_hang', required: true },
  { placeholder: '{{ho_so.dia_chi_dang_ky}}', source: 'ho_so.dia_chi_dang_ky', required: true },
  { placeholder: '{{ho_so.nguoi_dai_dien}}', source: 'ho_so.nguoi_dai_dien', required: true },
  { placeholder: '{{ho_so.cong_no}}', source: 'ho_so.cong_no', format: 'money_vnd' },
  { placeholder: '{{ho_so.ma_ho_so}}', source: 'ho_so.ma_ho_so', required: true },
  { placeholder: '{{ho_so.ngay_ap_dung}}', source: 'ho_so.ngay_ap_dung', format: 'date_dmy' },
  { placeholder: '{{ngay_in}}', source: 'ngay_in', format: 'date_dmy' },
  { placeholder: '{{dong.stt}}', source: 'san_pham.stt' },
  { placeholder: '{{dong.ma_san_pham}}', source: 'san_pham.ma_san_pham' },
  { placeholder: '{{dong.ten_san_pham}}', source: 'san_pham.ten_san_pham' },
  { placeholder: '{{dong.gia_thu_ve}}', source: 'san_pham.gia_thu_ve', format: 'money_vnd' },
  { placeholder: '{{dong.ty_le_ck}}', source: 'san_pham.ty_le_ck', format: 'percent_2' },
];

const DEFAULT_HO_SO_MAPPING: MappingInput[] = [
  { placeholder: '{{cong_ty.ten}}', source: 'cong_ty.ten', required: true },
  { placeholder: '{{cong_ty.dia_chi}}', source: 'cong_ty.dia_chi' },
  { placeholder: '{{cong_ty.ma_so_thue}}', source: 'cong_ty.ma_so_thue' },
  { placeholder: '{{ho_so.ma_ho_so}}', source: 'ho_so.ma_ho_so', required: true },
  { placeholder: '{{ho_so.phien_ban}}', source: 'ho_so.phien_ban' },
  { placeholder: '{{ho_so.trang_thai}}', source: 'ho_so.trang_thai', required: true },
  { placeholder: '{{ho_so.ngay_ap_dung}}', source: 'ho_so.ngay_ap_dung', format: 'date_dmy' },
  { placeholder: '{{ho_so.ma_khach_hang}}', source: 'ho_so.ma_khach_hang', required: true },
  { placeholder: '{{ho_so.ten_khach_hang}}', source: 'ho_so.ten_khach_hang', required: true },
  { placeholder: '{{ho_so.dia_chi_dang_ky}}', source: 'ho_so.dia_chi_dang_ky' },
  { placeholder: '{{ho_so.nguoi_dai_dien}}', source: 'ho_so.nguoi_dai_dien' },
  { placeholder: '{{ho_so.cong_no}}', source: 'ho_so.cong_no', format: 'money_vnd' },
  { placeholder: '{{ho_so.nguoi_de_nghi}}', source: 'ho_so.nguoi_de_nghi', required: true },
  { placeholder: '{{ho_so.truong_bo_phan}}', source: 'ho_so.truong_bo_phan' },
  { placeholder: '{{ho_so.ke_toan}}', source: 'ho_so.ke_toan' },
  { placeholder: '{{ho_so.ngay_tbp_ky}}', source: 'ho_so.ngay_tbp_ky', format: 'date_dmy' },
  { placeholder: '{{ho_so.ngay_kt_nhan_l2}}', source: 'ho_so.ngay_kt_nhan_l2', format: 'date_dmy' },
  { placeholder: '{{ho_so.tep_dinh_kem}}', source: 'ho_so.tep_dinh_kem' },
  { placeholder: '{{ho_so.chu_ky_so_TBP}}', source: 'ho_so.chu_ky_so_TBP' },
];

/**
 * Thân mẫu hồ sơ mặc định — chép lại bố cục của bản A4 dựng cứng trước `0055`.
 *
 * `{{bang_san_pham}}` là chỗ hệ thống nhét cả bảng sản phẩm vào, với số cột CPBH
 * đúng theo hồ sơ đang xem.
 *
 * `{{ho_so.chu_ky_so_TBP}}` đứng CUỐI, tách hẳn khỏi khối thời gian duyệt: nó là
 * KHỐI CHỮ KÝ trên văn bản, chỗ mà người đọc bản giấy đưa mắt xuống tìm.
 */
const defaultHoSoBody = (): string =>
  [
    para('{{cong_ty.ten}}'),
    para('{{cong_ty.dia_chi}} — MST {{cong_ty.ma_so_thue}}'),
    para(''),
    para('CHÍNH SÁCH BÁN HÀNG'),
    para('Số {{ho_so.ma_ho_so}} · phiên bản {{ho_so.phien_ban}}'),
    para(''),
    para('Trạng thái: {{ho_so.trang_thai}}'),
    para('Mã khách hàng: {{ho_so.ma_khach_hang}}'),
    para('Tên khách hàng: {{ho_so.ten_khach_hang}}'),
    para('Địa chỉ: {{ho_so.dia_chi_dang_ky}}'),
    para('Người đại diện: {{ho_so.nguoi_dai_dien}}'),
    para('Công nợ: {{ho_so.cong_no}} đồng'),
    para('Người đề nghị: {{ho_so.nguoi_de_nghi}}'),
    para('Thời gian áp dụng: {{ho_so.ngay_ap_dung}}'),
    para(''),
    para('{{bang_san_pham}}'),
    para(''),
    para('Thời gian duyệt'),
    para('Trưởng bộ phận: {{ho_so.truong_bo_phan}} — ký ngày {{ho_so.ngay_tbp_ky}}'),
    para('Kế toán: {{ho_so.ke_toan}} — tiếp nhận ngày {{ho_so.ngay_kt_nhan_l2}}'),
    para('File đính kèm: {{ho_so.tep_dinh_kem}}'),
    para(''),
    para('{{ho_so.chu_ky_so_TBP}}'),
  ].join('');

const defaultTemplateBody = (): string =>
  [
    para('{{cong_ty.ten}}'),
    para('{{cong_ty.dia_chi}} — MST {{cong_ty.ma_so_thue}}'),
    para(''),
    para('HỢP ĐỒNG NGUYÊN TẮC BÁN HÀNG'),
    para('Số hồ sơ CSBH: {{ho_so.ma_ho_so}} — ngày áp dụng {{ho_so.ngay_ap_dung}}'),
    para(''),
    para('BÊN MUA: {{ho_so.ten_khach_hang}} (mã {{ho_so.ma_khach_hang}})'),
    para('Địa chỉ: {{ho_so.dia_chi_dang_ky}}'),
    para('Người đại diện: {{ho_so.nguoi_dai_dien}}'),
    para('Công nợ hiện tại: {{ho_so.cong_no}} đồng'),
    para(''),
    para('Danh sách sản phẩm và chính sách giá:'),
    table([
      tableRow(['#', 'Mã sản phẩm', 'Tên sản phẩm', 'Giá thu về', 'Tỷ lệ chiết khấu'], true),
      tableRow([
        '{{dong.stt}}',
        '{{dong.ma_san_pham}}',
        '{{dong.ten_san_pham}}',
        '{{dong.gia_thu_ve}}',
        '{{dong.ty_le_ck}}',
      ]),
    ]),
    para(''),
    para('Hà Nội, ngày {{ngay_in}}'),
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
