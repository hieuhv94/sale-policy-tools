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
} from './docx.js';
import { isKnownSource, KNOWN_SOURCES, NGUON_BAT_BUOC_HO_SO } from './sources.js';
import { chuanHoaCot } from './bang-san-pham.js';
import { COMPANY } from '../render/sheet.js';

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
  is_default: boolean;
  updated_at: Date;
  kind: Loai;
  paper_size: KhoGiay | null;
  /** Tập cột bảng sản phẩm của riêng mẫu này (`0067`). NULL = tập mặc định. */
  cot_bang: string[] | null;
};

export type FieldRow = {
  placeholder: string;
  source: string;
};

/** Một dòng ánh xạ: ô trống nào lấy trường nào. Không còn gì khác (`0067`). */
export type MappingInput = { placeholder: string; source: string };

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
const THU_TU_MAU = 'is_default ASC, updated_at DESC, paper_size, id';

@Injectable()
export class TemplatesService {
  private readonly log = new Logger(TemplatesService.name);

  constructor(
    private readonly db: Db,
    private readonly storage: Storage,
    private readonly files: FilesService,
  ) {}

  // --- Tải lên --------------------------------------------------------------

  /**
   * ĐỌC ô trống của một file, KHÔNG lưu gì (`0067`).
   *
   * Bước đầu của màn hình thêm mẫu: người dùng chọn file, giao diện gọi đây để
   * dựng bảng ánh xạ, rồi mới bấm *Lưu*.
   *
   * Không tạo dòng nào ở bước này, và đó là cả điểm của nó. Trước `0067` việc
   * tải lên đã tạo ngay một mẫu ở trạng thái "nháp", nên mỗi lần người dùng đổi
   * ý giữa chừng lại để lại một dòng rác mà chỉ họ mới biết là rác.
   */
  async doOTrong(buffer: Buffer): Promise<{ placeholders: string[]; goiY: MappingInput[] }> {
    const placeholders = this.docOTrong(buffer);
    /*
     * GỢI Ý ánh xạ theo TÊN Ô TRỐNG.
     *
     * Khoá trộn viết bằng tiếng Việt từ `0051` và trùng luôn tên trường nguồn
     * (`{{ho_so.cong_no}}` ↔ `ho_so.cong_no`), nên phần lớn mẫu ánh xạ xong
     * trước khi người dùng chạm vào bảng. Ô nào không đoán được thì để trống —
     * gợi ý sai còn tệ hơn không gợi ý, vì người ta tin nó.
     */
    const goiY = placeholders
      .filter((o) => o !== O_BANG_SAN_PHAM)
      .map((o) => ({ placeholder: o, source: isKnownSource(o.slice(2, -2)) ? o.slice(2, -2) : '' }))
      .filter((m) => m.source !== '');
    return { placeholders, goiY };
  }

  /**
   * LƯU một mẫu — file, ánh xạ và tập cột bảng, trong MỘT lượt (`0067`).
   *
   * Gộp ba bước cũ (tải lên → ánh xạ → ban hành) làm một, vì cả ba chỉ có nghĩa
   * khi đủ cả ba: một mẫu chưa ánh xạ thì không dùng được, mà "dùng được" giờ
   * là điều kiện để tồn tại — mọi mẫu trong danh sách đều dùng được.
   *
   * Hệ quả đáng giá nhất: KHÔNG CÒN TRẠNG THÁI NỬA VỜI. Trước `0067` một lượt
   * chạy hỏng giữa chừng để lại mẫu nháp hoặc mẫu đã ánh xạ mà chưa ban hành,
   * và không màn hình nào nói cho người dùng biết họ đang đứng ở đâu.
   */
  async luu(
    input: { name: string; buffer: Buffer; kind: Loai; mapping: MappingInput[]; cotBang?: unknown },
    me: AuthUser,
  ) {
    const declared = new Set(this.docOTrong(input.buffer));

    for (const m of input.mapping) {
      if (!declared.has(m.placeholder)) {
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
    }

    // Ô trống bảng sản phẩm KHÔNG ánh xạ tới trường nào — hệ thống thay nó bằng
    // cả một bảng (`0055`). Mọi ô CÒN LẠI thì phải có, nếu không bản in ra mang
    // nguyên chuỗi `{{...}}` gửi cho khách hàng (DOC-30).
    const daAnhXa = new Set(input.mapping.map((m) => m.placeholder));
    const thieuAnhXa = [...declared].filter((o) => o !== O_BANG_SAN_PHAM && !daAnhXa.has(o));
    if (thieuAnhXa.length > 0) {
      throw new ConflictException({
        code: 'TEMPLATE_INCOMPLETE',
        message: 'Còn ô trống chưa ánh xạ tới trường dữ liệu nào',
        missing: thieuAnhXa,
      });
    }

    const cot = chuanHoaCot(input.cotBang);

    if (input.kind === 'HO_SO') {
      // MỤC BẮT BUỘC của muc 11.1 — kiểm ở đây, một lần, lúc LƯU. Trước `0067`
      // phép kiểm này nằm ở bước ban hành; bỏ ban hành thì nó về đúng chỗ duy
      // nhất còn lại, và cũng là chỗ người sửa được đang đứng.
      const daCo = new Set(input.mapping.map((m) => m.source));
      const thieu = NGUON_BAT_BUOC_HO_SO.filter((n) => !daCo.has(n));
      const thieuBang = !declared.has(O_BANG_SAN_PHAM);
      if (thieu.length > 0 || thieuBang) {
        throw new ConflictException({
          code: 'TEMPLATE_MISSING_REQUIRED',
          message:
            'Mẫu hồ sơ CSBH còn thiếu mục bắt buộc. Bản A4 phải có đủ các mục ở muc 11.1.',
          thieuTruong: thieu,
          ...(thieuBang ? { thieuBangSanPham: O_BANG_SAN_PHAM } : {}),
        });
      }
    }

    // Ghi FILE trước, rồi mới ghi CSDL. Ngược lại thì một lượt hỏng để lại dòng
    // mẫu trỏ tới một object không tồn tại — đúng cái lệch mà `0059` phải đi vá.
    const file = await this.files.upload(
      {
        ownerKind: 'TEMPLATE',
        ownerId: null,
        purpose: 'MAU_HD',
        fileName: `${input.name}.docx`,
        buffer: input.buffer,
      },
      me,
    );

    return this.db.tx(async (c) => {
      const t = await c.query<TemplateRow>(
        `INSERT INTO doc.contract_template (name, file_id, updated_by, kind, paper_size, cot_bang)
         VALUES ($1,$2,$3,$4::doc.template_kind,$5::doc.paper_size,$6::jsonb) RETURNING *`,
        [input.name, file.id, me.id, input.kind, khoGiayCua(input.buffer), JSON.stringify(cot)],
      );
      const id = t.rows[0]!.id;
      for (const m of input.mapping) {
        await c.query(
          `INSERT INTO doc.contract_template_field (template_id, placeholder, source)
           VALUES ($1,$2,$3)`,
          [id, m.placeholder, m.source],
        );
      }
      return view(t.rows[0]!);
    });
  }

  /** Đọc ô trống, đổi lỗi "không phải .docx" thành 400 thay vì 500. */
  private docOTrong(buffer: Buffer): string[] {
    try {
      return placeholdersOf(buffer);
    } catch (e) {
      if (e instanceof NotADocxError) {
        throw new BadRequestException({ code: 'TEMPLATE_NOT_DOCX', message: e.message });
      }
      throw e;
    }
  }

  /**
   * XOÁ hẳn một mẫu (`0067`) — thay cho *sửa* và *ngừng dùng*.
   *
   * Muốn đổi một mẫu thì xoá đi rồi thêm mẫu mới. Nghe như thêm việc, nhưng nó
   * gỡ đúng thứ khó nhất của bản cũ: sửa một mẫu ĐANG ĐƯỢC DÙNG nghĩa là bản
   * mềm của hôm nay và bản mềm của hôm qua khác nhau mà không ai ghi lại điều
   * đó ở đâu cả. Thêm mẫu mới thì mẫu cũ vẫn nằm đó cho tới khi có người chủ
   * động bỏ nó đi.
   *
   * KHÔNG xoá `doc.stored_file`: file ở lại như mọi file đã thay thế khác, và
   * `sys.run_retention()` dọn theo vòng đời chung.
   */
  async xoa(id: string): Promise<{ id: string }> {
    await this.byId(id);
    return this.db.tx(async (c) => {
      await c.query(`DELETE FROM doc.contract_template_field WHERE template_id = $1`, [id]);
      await c.query(`DELETE FROM doc.contract_template WHERE id = $1`, [id]);
      return { id };
    });
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
        ORDER BY ${THU_TU_MAU}`,
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
      `SELECT placeholder, source FROM doc.contract_template_field
        WHERE template_id = $1 ORDER BY placeholder`,
      [id],
    );
  }

  /*
   * `setMapping`, `publish` và `deactivate` ĐÃ GỠ (`0067`).
   *
   * Ba hàm ấy là ba bước của một vòng đời không còn tồn tại: tải lên (nháp) →
   * ánh xạ → ban hành, cộng đường lui *ngừng dùng*. Từ `0067` chỉ có `luu` và
   * `xoa` — lưu được là dùng được, muốn đổi thì xoá đi và thêm mẫu mới.
   *
   * Phép kiểm của chúng KHÔNG mất: "còn ô trống chưa ánh xạ" và "thiếu mục bắt
   * buộc của muc 11.1" chuyển hết vào `luu`, tức là sớm hơn một bước và ở đúng
   * màn hình người soạn đang đứng.
   */

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
        WHERE kind = $1::doc.template_kind
        ORDER BY ${THU_TU_MAU}`,
      [kind],
    );
    return rows.map((r) => ({ id: r.id, ten: r.name, khoGiay: r.paper_size }));
  }

  /**
   * Mẫu để dựng văn bản: cái người dùng CHỌN, hoặc mẫu mới nhất nếu không chọn.
   *
   * `undefined` nghĩa là chưa có mẫu nào — chưa ai thêm, hoặc đã xoá hết.
   *
   * MẪU ĐÃ XOÁ THÌ TỪ CHỐI, không âm thầm rơi về mẫu khác. Tình huống có thật:
   * người dùng mở hộp chọn, đi pha cà phê, trong lúc ấy Quản trị xoá mẫu kia.
   * Dựng bằng mẫu khác thì họ nhận về một văn bản không phải thứ họ vừa chọn,
   * và không có gì trên màn hình nói ra điều đó.
   */
  async chon(
    kind: Loai,
    mauId?: string,
  ): Promise<{ template: TemplateRow; fields: FieldRow[] } | undefined> {
    const t = mauId
      ? await this.db.one<TemplateRow>(
          `SELECT * FROM doc.contract_template
            WHERE id = $1 AND kind = $2::doc.template_kind`,
          [mauId, kind],
        )
      : await this.db.one<TemplateRow>(
          `SELECT * FROM doc.contract_template
            WHERE kind = $1::doc.template_kind
            ORDER BY ${THU_TU_MAU} LIMIT 1`,
          [kind],
        );
    if (!t) {
      if (mauId) {
        throw new NotFoundException({
          code: 'TEMPLATE_NOT_USABLE',
          message: 'Mẫu vừa chọn không còn trong danh sách. Hãy chọn lại.',
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
          WHERE kind = 'HO_SO' AND paper_size = $1::doc.paper_size LIMIT 1`,
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
             (name, file_id, is_default, updated_by, kind, paper_size)
           VALUES ($1,$2,true,$3,'HO_SO',$4::doc.paper_size) RETURNING id`,
          [`Mẫu hồ sơ CSBH mặc định — ${NHAN_KHO[kho]}`, fileId, systemUserId, kho],
        );
        const id = t.rows[0]!.id;
        for (const m of DEFAULT_HO_SO_MAPPING) {
          await c.query(
            `INSERT INTO doc.contract_template_field (template_id, placeholder, source)
             VALUES ($1,$2,$3)`,
            [id, m.placeholder, m.source],
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
      `SELECT id FROM doc.contract_template WHERE kind = 'HOP_DONG' LIMIT 1`,
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
        `INSERT INTO doc.contract_template (name, file_id, is_default, updated_by)
         VALUES ($1,$2,true,$3) RETURNING id`,
        ['Mẫu hợp đồng mặc định', file.id, systemUserId],
      );
      const id = t.rows[0]!.id;
      for (const m of DEFAULT_MAPPING) {
        await c.query(
          `INSERT INTO doc.contract_template_field (template_id, placeholder, source)
           VALUES ($1,$2,$3)`,
          [id, m.placeholder, m.source],
        );
      }
    });
  }
}

const DEFAULT_MAPPING: MappingInput[] = [
  { placeholder: '{{ho_so.ten_khach_hang}}', source: 'ho_so.ten_khach_hang' },
  { placeholder: '{{ho_so.ma_khach_hang}}', source: 'ho_so.ma_khach_hang' },
  { placeholder: '{{ho_so.dia_chi_dang_ky}}', source: 'ho_so.dia_chi_dang_ky' },
  { placeholder: '{{ho_so.nguoi_dai_dien}}', source: 'ho_so.nguoi_dai_dien' },
  { placeholder: '{{ho_so.cong_no}}', source: 'ho_so.cong_no' },
  { placeholder: '{{ho_so.ma_ho_so}}', source: 'ho_so.ma_ho_so' },
  { placeholder: '{{ho_so.ngay_ap_dung}}', source: 'ho_so.ngay_ap_dung' },
  { placeholder: '{{ngay_in}}', source: 'ngay_in' },
];

const DEFAULT_HO_SO_MAPPING: MappingInput[] = [
  { placeholder: '{{cong_ty.dia_chi}}', source: 'cong_ty.dia_chi' },
  { placeholder: '{{ho_so.ma_ho_so}}', source: 'ho_so.ma_ho_so' },
  { placeholder: '{{ho_so.phien_ban}}', source: 'ho_so.phien_ban' },
  { placeholder: '{{ho_so.trang_thai}}', source: 'ho_so.trang_thai' },
  { placeholder: '{{ho_so.ngay_ap_dung}}', source: 'ho_so.ngay_ap_dung' },
  { placeholder: '{{ho_so.ma_khach_hang}}', source: 'ho_so.ma_khach_hang' },
  { placeholder: '{{ho_so.ten_khach_hang}}', source: 'ho_so.ten_khach_hang' },
  { placeholder: '{{ho_so.dia_chi_dang_ky}}', source: 'ho_so.dia_chi_dang_ky' },
  { placeholder: '{{ho_so.nguoi_dai_dien}}', source: 'ho_so.nguoi_dai_dien' },
  { placeholder: '{{ho_so.cong_no}}', source: 'ho_so.cong_no' },
  { placeholder: '{{ho_so.nguoi_de_nghi}}', source: 'ho_so.nguoi_de_nghi' },
  { placeholder: '{{ho_so.truong_bo_phan}}', source: 'ho_so.truong_bo_phan' },
  { placeholder: '{{ho_so.ke_toan}}', source: 'ho_so.ke_toan' },
  { placeholder: '{{ho_so.ngay_tbp_ky}}', source: 'ho_so.ngay_tbp_ky' },
  { placeholder: '{{ho_so.ngay_kt_nhan_l2}}', source: 'ho_so.ngay_kt_nhan_l2' },
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
    // Khối công ty gõ THẲNG, không còn ô trống (`0067`): ba giá trị ấy cố định
    // ở mọi hồ sơ, nên một ô trống cho chúng chỉ thêm một bước có thể quên.
    para(COMPANY.name),
    para(`${COMPANY.address} — MST ${COMPANY.taxCode}`),
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
    para(COMPANY.name),
    para(`${COMPANY.address} — MST ${COMPANY.taxCode}`),
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
    // MỘT ô trống, hệ thống dựng cả bảng (`0067`). Trước đó đây là một bảng vẽ
    // tay bốn cột với nhóm khoá `san_pham.` và cơ chế nhân bản dòng — cả hai đã
    // gỡ, vì bảng do hệ thống dựng cho phép chọn cột theo từng mẫu.
    para(O_BANG_SAN_PHAM),
    para(''),
    para('Hà Nội, ngày {{ngay_in}}'),
  ].join('');

const view = (r: TemplateRow) => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  paperSize: r.paper_size,
  fileId: r.file_id,
  isDefault: r.is_default,
  updatedAt: r.updated_at,
  cotBang: r.cot_bang,
});
