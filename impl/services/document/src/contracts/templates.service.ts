/**
 * Văn bản mẫu: tải lên, đọc ô trống, ánh xạ trường, vô hiệu hoá.
 *
 * Cả hai loại đều thuộc **Quản trị hệ thống** từ `0060` (muc 6.4). Bản trước ghi
 * mẫu hợp đồng thuộc Sale Admin theo DOC-26; khách hàng gộp về một chủ ngày
 * 20/08 vì hai loại dùng chung một bộ máy, và bộ máy ấy là việc kỹ thuật.
 *
 * BA VIỆC, KHÔNG BỐN (`0098`): thêm · vô hiệu hoá · dùng lại. Không có sửa, và
 * không còn xoá — xem `voHieu`.
 */
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { kemNguCanh, PG, pgCode, type AuthUser } from '@csbh/http-kit';
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
import { chuanHoaCot, COT_BANG, COT_RUT_GON } from './bang-san-pham.js';
/*
 * `COMPANY` ĐÃ GỠ KHỎI TỆP NÀY (`0151`).
 *
 * Người dùng duy nhất của nó ở đây là `ensureDefault` — bộ dựng mẫu mặc định mà
 * `0150` bỏ hẳn. Dòng `import` thì ở lại: một import không ai dùng KHÔNG làm
 * `tsc` đỏ, nên nó sống sót cả lượt rà của `0150` lẫn `tsc` sau đó. Hằng ấy giờ
 * chỉ còn `scripts/tao-mau-ho-so.ts` và `seed-demo.ts` đọc.
 */

/**
 * Hai loại mẫu, cùng một chủ sở hữu từ `0060` — nhưng KHÁC nhau ở chỗ ai chọn.
 *
 * `HO_SO`    — bố cục bản CSBH A4. Từ `0098` **TDV chọn một lần lúc gửi duyệt**
 *              rồi nó đóng băng vào hồ sơ; các vai trò sau chỉ xem.
 * `HOP_DONG` — văn bản pháp lý riêng. **Kế toán hoặc Sale Admin chọn ở mỗi lượt
 *              xuất**, vì hợp đồng không lưu bản ghi nào (muc 8.3) nên không có
 *              gì để đóng băng vào.
 */
export type Loai = 'HOP_DONG' | 'HO_SO' | 'HO_SO_RUT_GON';

/**
 * HAI loại mẫu HỒ SƠ, và mọi đường tra một mẫu hồ sơ đều nhận cả hai (`0165`).
 *
 * `HO_SO` là bản ĐẦY ĐỦ, `HO_SO_RUT_GON` là bản gọn — khác nhau ở tập cột của
 * bảng sản phẩm, không ở luật nào khác. Ô chọn của Sale Admin trộn chung hai
 * danh sách: họ chọn bản trình bày ở lúc IN, và cả hai đều là bản trình bày hợp
 * lệ của cùng một hồ sơ.
 *
 * Đây là chỗ dễ sót nhất của cả chặng. Thêm giá trị enum thì `tsc` chỉ ra mọi
 * chỗ khai `Loai` thiếu nhánh, nhưng KHÔNG chỉ ra được một truy vấn viết
 * `kind = 'HO_SO'` — nó vẫn dịch, vẫn chạy, chỉ là mẫu rút gọn vô hình. Nên mọi
 * chỗ như thế phải đi qua hằng này, và có ca kiểm quét mã nguồn canh.
 */
export const LOAI_HO_SO: Loai[] = ['HO_SO', 'HO_SO_RUT_GON'];
export type KhoGiay = 'a4p' | 'a4l';

export const KHO_GIAY: KhoGiay[] = ['a4p', 'a4l'];
export const NHAN_KHO: Record<KhoGiay, string> = { a4p: 'A4 dọc', a4l: 'A4 ngang' };

export type TemplateRow = {
  id: string;
  name: string;
  file_id: string;
  updated_at: Date;
  kind: Loai;
  paper_size: KhoGiay | null;
  /** Tập cột bảng sản phẩm của riêng mẫu này (`0067`). NULL = tập mặc định. */
  cot_bang: string[] | null;
  /** Lúc bị rút khỏi ô chọn (`0098`). NULL = còn dùng được. */
  vo_hieu_hoa_luc: Date | null;
  vo_hieu_hoa_boi: string | null;
};

export type FieldRow = {
  placeholder: string;
  source: string;
};

/** Một dòng ánh xạ: ô trống nào lấy trường nào. Không còn gì khác (`0067`). */
export type MappingInput = { placeholder: string; source: string };

/**
 * Thứ tự mẫu trong ô chọn — mới sửa lên trước (`0058`, rút gọn ở `0150`).
 *
 * Vế `is_default ASC` đứng đầu đã đi cùng khái niệm mẫu mặc định (`0150`): hệ
 * thống không tự dựng mẫu nào nữa, nên mọi mẫu trong danh sách đều là mẫu do
 * Quản trị đưa vào và không cái nào đáng lùi xuống cuối.
 *
 * `paper_size` đứng trước `id` để phá hoà DỨT KHOÁT chứ không ngẫu nhiên: hai
 * mẫu tải lên trong cùng một giây có `updated_at` bằng nhau, và `id` là uuid
 * ngẫu nhiên — bỏ nó ra thì mẫu mở sẵn là khổ dọc hay khổ ngang tuỳ từng lần
 * chạy. Thứ tự khai enum cho A4 dọc đứng trước.
 */
const THU_TU_MAU = 'updated_at DESC, paper_size, id';

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

    /*
     * TẬP CỘT SUY TỪ LOẠI MẪU khi người soạn không khai gì (`0165`).
     *
     * Yêu cầu là *"tự động chọn cột với bản hồ sơ đầy đủ và rút gọn"*. `0067`
     * cho khai theo từng mẫu và đó vẫn đúng — chỉ là mặc định thôi còn là *"đủ
     * mười cột"* cho mọi loại: mẫu rút gọn mặc định ra sáu cột của tờ mẫu khách
     * hàng gõ.
     *
     * `chuanHoaCot(undefined)` rơi về `COT_MAC_DINH`, nên nhánh rút gọn phải
     * truyền tập cột VÀO chứ không dựa vào giá trị lùi ấy.
     */
    const cot = chuanHoaCot(
      input.cotBang ?? (input.kind === 'HO_SO_RUT_GON' ? COT_RUT_GON : undefined),
    );

    if (input.kind === 'HO_SO' || input.kind === 'HO_SO_RUT_GON') {
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
      /*
       * TÊN TRÙNG thì từ chối, và bắt lỗi của CSDL chứ không hỏi trước (`0150`).
       *
       * Hỏi trước bằng `SELECT` rồi `INSERT` là để hai lượt bấm gần như đồng
       * thời cùng đi qua — đúng lý do `0012` đã viết khi dựng
       * `uq_contract_template_active`. Chỉ mục là chốt thật; khối này chỉ dịch
       * `23505` sang một câu người dùng đọc được, kèm chính cái tên đang trùng.
       *
       * Tính cả mẫu ĐÃ VÔ HIỆU (xem migration `0108`). Hệ quả người dùng gặp
       * ngay: tên của một mẫu hỏng bị cháy vĩnh viễn, vì không còn đường sửa
       * mẫu — chữa một mẫu sai là tải bản mới lên rồi vô hiệu hoá bản cũ, mà tên
       * tự nhiên của bản mới chính là tên bản cũ.
       */
      const t = await c
        .query<TemplateRow>(
          `INSERT INTO doc.contract_template (name, file_id, updated_by, kind, paper_size, cot_bang)
         VALUES ($1,$2,$3,$4::doc.template_kind,$5::doc.paper_size,$6::jsonb) RETURNING *`,
          [input.name, file.id, me.id, input.kind, khoGiayCua(input.buffer), JSON.stringify(cot)],
        )
        .catch((e: unknown) => {
          if (pgCode(e) === PG.uniqueViolation) {
            throw new ConflictException({
              code: 'TEMPLATE_NAME_TAKEN',
              message: `Đã có văn bản mẫu tên "${input.name}". Đặt một tên khác.`,
              name: input.name,
            });
          }
          throw e;
        });
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
   * VÔ HIỆU HOÁ — rút một mẫu khỏi ô chọn, và đó là tất cả (`0098`).
   *
   * Thay hẳn cho `xoa()`. Xoá được là một lỗ hổng kể từ khi mẫu hồ sơ đóng băng
   * vào hồ sơ: xoá một mẫu đang có hồ sơ trỏ tới thì bản mềm của những hồ sơ ấy
   * hỏng vĩnh viễn, và KHÔNG AI chữa được — mẫu không dựng lại được vì file cũ
   * đã rời khỏi vòng đời, còn hồ sơ thì khoá sửa từ lúc gửi duyệt. Người gây ra
   * cũng không biết mình vừa làm gì: màn hình mẫu không có cách nào biết mẫu này
   * đang được bao nhiêu hồ sơ dùng.
   *
   * Nên phép chặn không phải là đếm hồ sơ trước khi cho xoá — nó là BỎ HẲN
   * đường xoá. Mẫu sống mãi; cái tắt được chỉ là sự có mặt của nó trong ô chọn.
   *
   * Vô hiệu hoá một mẫu ĐÃ vô hiệu thì không lỗi và không ghi đè mốc cũ: hai
   * người cùng bấm không được phép làm mốc "ai vô hiệu, lúc nào" nhảy sang
   * người bấm sau.
   */
  async voHieu(id: string, me: AuthUser): Promise<{ id: string; voHieuHoaLuc: Date | null }> {
    const truoc = await this.byId(id);
    if (truoc.vo_hieu_hoa_luc) {
      return { id, voHieuHoaLuc: truoc.vo_hieu_hoa_luc };
    }
    const r = await this.db.one<TemplateRow>(
      `UPDATE doc.contract_template
          SET vo_hieu_hoa_luc = now(), vo_hieu_hoa_boi = $2
        WHERE id = $1 AND vo_hieu_hoa_luc IS NULL
        RETURNING *`,
      [id, me.id],
    );
    await this.ghiNhatKy(truoc, r ?? truoc, me);
    return { id, voHieuHoaLuc: r?.vo_hieu_hoa_luc ?? truoc.vo_hieu_hoa_luc };
  }

  /**
   * DÙNG LẠI — đưa mẫu trở vào ô chọn.
   *
   * KHÔNG đòi gõ lại tên, khác với lúc vô hiệu hoá. Luật `17/08` buộc gõ lại mã
   * nghiệp vụ cho thao tác PHÁ HUỶ; bật lại một mẫu không phá huỷ gì, đúng như
   * bật lại một sản phẩm đã vô hiệu hoá cũng không đòi gì.
   */
  async moLai(id: string, me: AuthUser): Promise<{ id: string }> {
    const truoc = await this.byId(id);
    if (!truoc.vo_hieu_hoa_luc) return { id };
    const r = await this.db.one<TemplateRow>(
      `UPDATE doc.contract_template
          SET vo_hieu_hoa_luc = NULL, vo_hieu_hoa_boi = NULL
        WHERE id = $1 RETURNING *`,
      [id],
    );
    await this.ghiNhatKy(truoc, r ?? truoc, me);
    return { id };
  }

  /**
   * Một dòng nhật ký kèm GIÁ TRỊ TRƯỚC VÀ SAU (YCNV muc 10).
   *
   * Đi qua outbox vì role `csbh_doc` không có quyền ghi vào schema `aud` — cùng
   * đường mà lượt xuất hợp đồng đã đi.
   */
  private async ghiNhatKy(truoc: TemplateRow, sau: TemplateRow, me: AuthUser): Promise<void> {
    const anh = (r: TemplateRow) => ({ ten: r.name, voHieuHoaLuc: r.vo_hieu_hoa_luc });
    await this.db.q(`INSERT INTO doc.outbox (routing_key, payload) VALUES ($1,$2::jsonb)`, [
      'document.template_changed',
      JSON.stringify(
        kemNguCanh({
          entity: 'contract_template',
          id: truoc.id,
          action: sau.vo_hieu_hoa_luc ? 'TEMPLATE_DISABLED' : 'TEMPLATE_ENABLED',
          actorId: me.id,
          actorRole: me.role,
          before: anh(truoc),
          after: anh(sau),
          at: new Date().toISOString(),
        }),
      ),
    ]);
  }

  async byId(id: string): Promise<TemplateRow> {
    const r = await this.db.one<TemplateRow>(`SELECT * FROM doc.contract_template WHERE id = $1`, [
      id,
    ]);
    if (!r) throw new NotFoundException({ code: 'TEMPLATE_NOT_FOUND' });
    return r;
  }

  /**
   * Danh sách cho MÀN HÌNH QUẢN TRỊ — gồm cả mẫu đã vô hiệu hoá.
   *
   * Không lọc, và đó là điểm khác với `khaDung`: người quản mẫu phải nhìn thấy
   * cái mình đã tắt thì mới bật lại được. Một mẫu vô hiệu hoá xong biến mất khỏi
   * cả màn hình quản trị là một mẫu không ai dùng lại được nữa — tức là đã xoá,
   * chỉ khác cái tên.
   */
  async list(kind: Loai = 'HOP_DONG') {
    // Lọc theo loại, KHÔNG trả cả hai rồi để màn hình tự lọc: hai màn hình khác
    // nhau, và mỗi thẻ chỉ có việc với loại của nó.
    const rows = await this.db.q<TemplateRow>(
      `SELECT * FROM doc.contract_template WHERE kind = $1::doc.template_kind
        ORDER BY vo_hieu_hoa_luc IS NOT NULL, ${THU_TU_MAU}`,
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
   * Trả về đúng ba thứ ô chọn cần. KHÔNG dùng lại `view()` của màn hình quản
   * lý: `fileId` và `updatedAt` là chuyện nội bộ của mẫu, và một đường đọc mở
   * rộng cho năm vai trò thì càng ít cột lọt ra càng tốt.
   */
  async khaDung(kind: Loai | Loai[]): Promise<{ id: string; ten: string; khoGiay: KhoGiay | null }[]> {
    // MẢNG loại chứ không một loại (`0165`): ô chọn của Sale Admin trộn chung
    // mẫu đầy đủ và mẫu rút gọn, vì cả hai là bản trình bày của cùng một hồ sơ.
    const rows = await this.db.q<TemplateRow>(
      `SELECT * FROM doc.contract_template
        WHERE kind = ANY($1::doc.template_kind[]) AND vo_hieu_hoa_luc IS NULL
        ORDER BY ${THU_TU_MAU}`,
      [Array.isArray(kind) ? kind : [kind]],
    );
    return rows.map((r) => ({ id: r.id, ten: r.name, khoGiay: r.paper_size }));
  }

  /**
   * Tên một mẫu cho người XEM hồ sơ — kể cả mẫu đã vô hiệu hoá.
   *
   * Hồ sơ đã gắn mẫu thì màn hình phải nói được nó dựng bằng mẫu nào, và cái tên
   * ấy vẫn phải đọc ra được sau khi Quản trị vô hiệu mẫu — nếu không thì đúng
   * lúc người ta thắc mắc "sao bản này khác bản kia" lại là lúc không còn câu
   * trả lời. Trả về ĐÚNG ba thứ màn hình cần, không hơn.
   */
  async ten(id: string, kind: Loai | Loai[]) {
    const t = await this.theoId(id, kind);
    if (!t) throw new NotFoundException({ code: 'TEMPLATE_NOT_FOUND' });
    return {
      id: t.template.id,
      ten: t.template.name,
      khoGiay: t.template.paper_size,
      voHieu: t.template.vo_hieu_hoa_luc !== null,
    };
  }

  /**
   * CHI TIẾT một mẫu cho màn hình quản trị (`0150`) — kể cả mẫu đã vô hiệu.
   *
   * Trước lượt này, mẫu đã lưu là một HỘP ĐEN: bảng quản trị hiện tên, khổ giấy,
   * ngày sửa, trạng thái — và thao tác duy nhất là vô hiệu hoá. Không có đường
   * nào xem lại nội dung, xem lại ánh xạ, hay lấy file về.
   *
   * Chỗ hở ấy do chính hệ thống tự tạo ra, và đáng ghi vì nó không phải một
   * tính năng bị bỏ quên: `0067` bỏ hẳn việc sửa mẫu với lý do viết thẳng trong
   * migration — *"muốn đổi thì XOÁ đi và thêm mẫu mới"* — rồi `0098` bỏ luôn
   * quyền xoá vì mẫu đã đóng băng vào hồ sơ. Đường thoát mà `0067` dựa vào bị
   * lấy đi, và không ai để ý rằng khi ấy không còn đường nào cả.
   *
   * KỂ CẢ MẪU ĐÃ VÔ HIỆU, và đó không phải sự tiện tay: từ `0150` hệ thống không
   * tự dựng mẫu nào nữa, nên nếu Quản trị lỡ vô hiệu hoá hết mẫu thì đường duy
   * nhất để có lại là tải một `.docx` lên — và file `.docx` duy nhất trong tầm
   * tay họ là file lấy về từ chính đây. Chặn mẫu vô hiệu ở đường này là biến một
   * bước lùi được thành một ngõ cụt.
   */
  async chiTiet(id: string, kind: Loai | Loai[]) {
    const t = await this.theoId(id, kind);
    if (!t) throw new NotFoundException({ code: 'TEMPLATE_NOT_FOUND' });
    return {
      // `view()` đã mang sẵn `cotBang` — tập cột của bảng sản phẩm. Nó thuộc về
      // màn hình này chứ không phải chuyện nội bộ: `{{bang_san_pham}}` là MỘT ô
      // trống trên mẫu, nhưng nó nở ra thành mười cột hay bốn cột tuỳ chính
      // trường ấy, và đó là khác biệt lớn nhất giữa bản nội bộ và bản đưa khách.
      ...view(t.template),
      /*
       * NHÃN của tập cột, dựng ở đây chứ không để giao diện tự dịch.
       *
       * Bảng từ vựng nằm ngay cạnh — `COT_BANG` bên `bang-san-pham.ts`, cùng chỗ
       * khai trọng số bề rộng của chính những cột ấy. Chép nó sang giao diện là
       * dựng ra một bản thứ hai để hai bên trôi khỏi nhau, và cái trôi ở đây thì
       * im lặng: một cột đổi tên là màn hình quản trị nói sai tên cột mà không
       * có gì đỏ lên.
       *
       * `null` nghĩa là mẫu KHÔNG khai tập cột riêng — bảng in đủ mọi cột. Khác
       * hẳn mảng rỗng, thứ không dựng ra được (`Tên sản phẩm` là cột bắt buộc).
       */
      nhanCot: nhanCotBang(t.template.cot_bang),
      anhXa: t.fields.map((f) => ({ placeholder: f.placeholder, source: f.source })),
    };
  }

  /**
   * Mẫu để DỰNG văn bản — tra thẳng theo id, **kể cả mẫu đã vô hiệu hoá**.
   *
   * Đây là một nửa của `chon()` cũ, và việc tách đôi nó là thay đổi quan trọng
   * nhất của `0098`. Hàm cũ trả lời hai câu hỏi khác hẳn nhau bằng một đường:
   *
   *   *"ô chọn bày ra những mẫu nào"*  — phải LOẠI mẫu đã vô hiệu.
   *   *"dựng văn bản này bằng mẫu nào"* — phải LẤY ĐƯỢC mẫu đã vô hiệu.
   *
   * Trộn hai câu ấy làm một thì vô hiệu hoá một mẫu sẽ làm hỏng mọi hồ sơ đã
   * gắn nó — đúng cái hậu quả mà việc bỏ đường xoá sinh ra để tránh, chỉ khác
   * cái tên. Nên `khaDung` lọc, còn hàm này thì không, và sự khác nhau ấy là cố
   * ý chứ không phải một chỗ quên `WHERE`.
   *
   * `undefined` = không có mẫu nào mang id ấy. Người gọi quyết định đó là 404
   * hay là một câu khác — hai đường gọi có hai câu khác nhau.
   */
  async theoId(
    id: string,
    kind: Loai | Loai[],
  ): Promise<{ template: TemplateRow; fields: FieldRow[] } | undefined> {
    const t = await this.db.one<TemplateRow>(
      `SELECT * FROM doc.contract_template
        WHERE id = $1 AND kind = ANY($2::doc.template_kind[])`,
      [id, Array.isArray(kind) ? kind : [kind]],
    );
    if (!t) return undefined;
    return { template: t, fields: await this.fields(t.id) };
  }

  /**
   * Mẫu người dùng vừa CHỌN trong ô chọn — dùng ở đường xuất hợp đồng và ở lúc
   * TDV gửi duyệt.
   *
   * Khác `theoId` ở đúng một chỗ: mẫu đã vô hiệu thì **từ chối**. Người đang
   * đứng trước ô chọn phải chọn được một mẫu còn dùng được; tình huống có thật
   * là họ mở hộp chọn, đi pha cà phê, và trong lúc ấy Quản trị vô hiệu mẫu kia.
   *
   * KHÔNG CÒN NHÁNH "không chọn thì lấy mẫu đầu danh sách" (`0098`). Mẫu mặc
   * định ngầm là thứ làm người dùng gửi đi bản trình bày đầu tiên phần mềm đưa
   * ra chứ không phải bản họ định gửi — và với bản mềm CSBH thì bản ấy đem đi
   * ký. Thiếu `mauId` giờ là lỗi của người gọi, không phải một chỗ để đoán.
   */
  async chon(
    kind: Loai | Loai[],
    mauId: string,
  ): Promise<{ template: TemplateRow; fields: FieldRow[] }> {
    const t = await this.theoId(mauId, kind);
    if (!t || t.template.vo_hieu_hoa_luc) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_USABLE',
        message: 'Mẫu vừa chọn không còn trong danh sách. Hãy chọn lại.',
        templateId: mauId,
      });
    }
    return t;
  }

  /**
   * File `.docx` của một mẫu, đọc từ kho (`0059`).
   *
   * Một chỗ duy nhất cho cả bản mềm lẫn hợp đồng, vì cả hai cần đúng câu trả lời
   * này khi object đã biến mất: KHÔNG phải 500 kèm vết ngăn xếp của minio, mà là
   * một câu nói rõ chuyện gì xảy ra và AI sửa được.
   *
   * `0150` bỏ phép tự chữa `vaFileMacDinh` cùng với khái niệm mẫu mặc định, nên
   * đây là chỗ DUY NHẤT còn nói được chuyện này. Nó vốn chỉ chữa cho mẫu do hệ
   * thống dựng — mẫu Quản trị tải lên chưa bao giờ được chữa — nên cái mất là
   * một sự bất đối xứng, không phải một bảo đảm chung.
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
          // MỘT chủ sở hữu cho cả ba loại từ `0060` — câu cũ còn nhắc Sale Admin
          // ở nhánh `else`, và `0165` biến nhánh ấy thành nhánh của mẫu rút gọn,
          // tức chỉ sai người ở đúng loại mẫu mới thêm.
          'Đề nghị Quản trị hệ thống tải mẫu lên lại, hoặc chọn một mẫu khác.',
        templateId: t.id,
      });
    }
  }

}


/** Nhãn tiếng Việt của tập cột, giữ đúng thứ tự khai ở `COT_BANG` (`0150`). */
const nhanCotBang = (cot: unknown): string[] | null => {
  if (!Array.isArray(cot) || cot.length === 0) return null;
  const co = new Set(cot.map(String));
  return COT_BANG.filter((c) => co.has(c.khoa)).map((c) => c.nhan);
};

const view = (r: TemplateRow) => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  paperSize: r.paper_size,
  fileId: r.file_id,
  updatedAt: r.updated_at,
  cotBang: r.cot_bang,
  /** `0098` — mẫu đã vô hiệu vẫn nằm trong bảng quản trị, mang dấu này. */
  voHieuHoaLuc: r.vo_hieu_hoa_luc,
});
