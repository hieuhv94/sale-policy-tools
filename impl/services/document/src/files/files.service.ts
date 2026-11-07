/**
 * Vòng đời file: tải lên, tải về, ký, xoá thật.
 *
 * Thứ tự trong `upload` là chủ ý và không đảo được: **kiểm hết rồi mới ghi lên
 * MinIO**. Ghi trước rồi kiểm thì file sai định dạng vẫn để lại một object không
 * ai trỏ tới, không ai biết để dọn, và dung lượng cứ thế tăng (CUST-12).
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GIOI_HAN_BINH_LUAN } from '@csbh/domain-policy';
import type { AuthUser } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { Clients } from '../infra/clients.js';
import { Storage, sha256 } from '../infra/storage.js';

export type OwnerKind = 'POLICY' | 'CUSTOMER' | 'TEMPLATE';
/**
 * `BAN_CSBH` và `BAN_DA_KY` ĐÃ GỠ (`0103`) — hai mục đích của bản lưu ký số, thứ
 * không ai gọi bao giờ. Hai GIÁ TRỊ ENUM vẫn còn trong `doc.file_purpose`:
 * Postgres không có `DROP VALUE`, và đổi kiểu của một cột đang dùng chỉ để bỏ hai
 * nhãn chết là một lượt migration rủi ro hơn hẳn thứ nó dọn. Kiểu TypeScript này
 * mới là chốt chặn — không đường nào ghi được hai giá trị ấy nữa.
 */
/**
 * `BAN_CSBH` thêm vào từ `0167` — bản mềm Sale Admin đã lưu.
 *
 * Giá trị này có trong enum `doc.file_purpose` từ `0011` mà chưa từng có ai
 * dùng: nó được nghĩ ra cho *"bản CSBH A4 do hệ thống sinh"*, và tới `0163` thì
 * bản mềm dựng lại mỗi lần in nên không có gì để lưu. `0167` đóng băng nó thành
 * một tệp của hồ sơ, và đó đúng là chỗ giá trị này chờ sẵn.
 *
 * `BAN_DA_KY` vẫn KHÔNG có ở đây: bản lưu ký số đã gỡ hẳn ở `0103`.
 */
/**
 * `BINH_LUAN` thêm ở `0263` — tệp đính kèm của bình luận trên hồ sơ. Chủ là HỒ SƠ
 * (`ownerKind = POLICY`), nhưng quyền đọc KHÔNG theo bốn cột người như các tệp hồ sơ
 * khác: nó hỏi `policy` (xem `assertCanReadRow`).
 */
export type Purpose = 'HO_SO' | 'SCAN' | 'PHAP_LY' | 'MAU_HD' | 'BAN_CSBH' | 'BINH_LUAN';

export const MAX_BYTES = 20 * 1024 * 1024;

/** Trần riêng của tệp bình luận (yêu cầu 7) — đọc từ `domain-policy`, nơi giao diện cũng đọc. */
const TRAN_THEO_MUC_DICH: Partial<Record<Purpose, number>> = {
  BINH_LUAN: GIOI_HAN_BINH_LUAN.coTepToiDaByte,
};
export const tranCo = (purpose: Purpose) => TRAN_THEO_MUC_DICH[purpose] ?? MAX_BYTES;

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Định dạng cho phép, kiểm bằng SỐ NHẬN DẠNG ĐẦU FILE chứ không bằng phần mở
 * rộng hay `Content-Type` do trình duyệt khai.
 *
 * Cả hai thứ kia đều do phía client đặt và đổi được tuỳ ý — đổi tên `virus.exe`
 * thành `giay-phep.pdf` là qua được mọi phép kiểm dựa trên tên.
 */
const MAGIC: { type: string; bytes: number[] }[] = [
  { type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, //                       %PDF
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  {
    type: DOCX,
    bytes: [0x50, 0x4b, 0x03, 0x04], //                            PK — .docx là một file zip
  },
];

const ALLOWED: Record<Purpose, string[]> = {
  HO_SO: ['application/pdf', 'image/jpeg', 'image/png'],
  SCAN: ['application/pdf', 'image/jpeg', 'image/png'],
  PHAP_LY: ['application/pdf', 'image/jpeg', 'image/png'],
  MAU_HD: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  // `0167` — bản mềm đã lưu. CHỈ PDF, và không phải vì thận trọng: nó do
  // Gotenberg dựng ra ngay trước lượt ghi, nên mọi giá trị khác ở đây sẽ là một
  // ô không bao giờ đúng.
  BAN_CSBH: ['application/pdf'],
  // `0263` — đúng sáu loại của yêu cầu 7.
  BINH_LUAN: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', DOCX, XLSX],
};

export function sniff(buf: Buffer): string | undefined {
  for (const m of MAGIC) {
    if (m.bytes.every((b, i) => buf[i] === b)) return m.type;
  }
  // WebP: `RIFF` + 4 byte cỡ + `WEBP` — số nhận dạng không nằm liền ở đầu nên
  // không viết được bằng bảng trên.
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return undefined;
}

/**
 * Phép nhận dạng của tệp BÌNH LUẬN (`0263`): tách được `.docx` khỏi `.xlsx`.
 *
 * `sniff` gọi mọi tệp zip là `.docx` — đúng cho mẫu hợp đồng, nơi chỉ nhận `.docx`
 * và thứ không phải `.docx` thì trình trộn tự từ chối. Bình luận nhận cả hai, nên
 * phải nhìn vào trong: tên mục trong zip nằm dạng chữ trơn ở cả tiêu đề từng mục lẫn
 * danh mục cuối tệp. Zip không mang mục nào của hai loại (một `.zip` thường, một
 * `.pptx`) thì KHÔNG nhận ra — chứ không rơi về `.docx`.
 *
 * Không đổi `sniff` cho mọi mục đích: mẫu hợp đồng đi đường của nó từ `0011`, và
 * siết nó ở đây là đổi hành vi của một đường không liên quan tới lượt này.
 */
export function sniffBinhLuan(buf: Buffer): string | undefined {
  const t = sniff(buf);
  if (t !== DOCX) return t;
  const chu = buf.toString('latin1');
  if (chu.includes('word/document.xml')) return DOCX;
  if (chu.includes('xl/workbook.xml')) return XLSX;
  return undefined;
}

export type FileRow = {
  id: string;
  object_key: string;
  file_name: string;
  content_type: string;
  size_bytes: string;
  sha256: string;
  owner_kind: OwnerKind;
  owner_id: string | null;
  purpose: Purpose;
  uploaded_by: string;
  uploaded_at: Date;
  deleted_at: Date | null;
};

@Injectable()
export class FilesService {
  constructor(
    private readonly db: Db,
    private readonly storage: Storage,
    private readonly clients: Clients,
  ) {}

  // --- Quyền xem ------------------------------------------------------------

  /**
   * Phạm vi của file suy ra từ phạm vi của thứ NÓ THUỘC VỀ, không lưu riêng.
   *
   * Lưu riêng thì chuyển hồ sơ sang TDV khác phải nhớ cập nhật cả file, và ngày
   * quên là ngày người cũ vẫn xem được.
   */
  /**
   * QUYỀN ĐỌC — xem, tải xuống, liệt kê (`0148`).
   *
   * Tách khỏi quyền GHI vì khách hàng chốt 27/08: *"những ai nhìn thấy khách
   * hàng đều xem và tải được các file hồ sơ pháp lý, nhưng không sửa hoặc xoá
   * được"*. Một hàm cho cả hai việc thì không viết ra được câu ấy.
   *
   * Khác nhau ĐÚNG ở nhánh khách hàng:
   *
   *   đọc  — mọi người nhìn thấy khách hàng (TDV phụ trách · những người được
   *          giao một hồ sơ của khách này · Quản trị hệ thống);
   *   ghi  — chỉ TDV phụ trách.
   *
   * Nhánh HỒ SƠ không đổi, và cũng không nên đổi: bốn cột người trên hồ sơ vốn
   * đã là "ai đang cầm hồ sơ này", tức đã trả lời đúng cả hai câu.
   */
  /**
   * HAI LOẠI TỆP mà người của bản KẾ NHIỆM đọc được (`0183`).
   *
   * Đúng thứ khách hàng nêu — *"bản mềm và bản cứng"* — không hơn. Giấy tờ
   * `HO_SO` của bản cũ đã được chép sang bản mới lúc lập (`0148`), nên người
   * duyệt vốn đã đọc được chúng ở chính hồ sơ họ đang cầm; mở thêm ở đây là nới
   * một phạm vi không ai cần.
   */
  private static readonly LOAI_BAN_TRUOC = ['BAN_CSBH', 'SCAN'];

  /**
   * Người này đọc được tệp của hồ sơ ấy KHÔNG, và ở mức nào (`0183`).
   *
   *   `DAY_DU`     id nằm trong bốn cột người của CHÍNH hồ sơ (luật từ `0031`).
   *   `BAN_TRUOC`  id nằm trong bốn cột người của một hồ sơ KẾ NHIỆM đang đi
   *                trong luồng duyệt — họ đang duyệt bản thay thế hồ sơ này.
   *   `null`       ngoài phạm vi.
   *
   * MỘT lời gọi `policy` cho cả hai mức: `nguoi_xem_ban_truoc` đi kèm chính lượt
   * gọi mà phép kiểm cũ vốn đã thực hiện.
   */
  private async mucDocHoSo(
    policyId: string,
    me: AuthUser,
  ): Promise<'DAY_DU' | 'BAN_TRUOC' | null> {
    const p = await this.clients.policy(policyId);
    const scope = await this.clients.scopeUserIds(me);
    const cua = [p.tdv_user_id, p.tbp_user_id, p.ke_toan_user_id, p.sale_admin_user_id];
    if (cua.some((x) => x && scope.includes(x))) return 'DAY_DU';
    if ((p.nguoi_xem_ban_truoc ?? []).some((x) => x && scope.includes(x))) return 'BAN_TRUOC';
    return null;
  }

  /**
   * QUYỀN ĐỌC — và từ `0183` nó RỘNG HƠN quyền ghi ở đúng một chỗ.
   *
   * `purpose` là tuỳ chọn vì `list` gọi hàm này trước khi biết mình sắp trả tệp
   * nào; ở đó phép nới vẫn áp, nhưng `list` LỌC lại kết quả xuống hai loại —
   * xem `forOwner`. Người gọi ở mức `BAN_TRUOC` mà xin một tệp ngoài hai loại
   * thì nhận 403 y như trước.
   */
  async assertCanRead(
    ownerKind: OwnerKind,
    ownerId: string | null,
    me: AuthUser,
    purpose?: string,
  ): Promise<void> {
    if (ownerKind === 'POLICY') {
      if (!ownerId) throw new ForbiddenException({ code: 'OUT_OF_SCOPE' });
      const muc = await this.mucDocHoSo(ownerId, me);
      if (muc === 'DAY_DU') return;
      if (muc === 'BAN_TRUOC' && (purpose === undefined || FilesService.LOAI_BAN_TRUOC.includes(purpose))) {
        return;
      }
      throw new ForbiddenException({
        code: 'OUT_OF_SCOPE',
        message: 'Hồ sơ này nằm ngoài phạm vi dữ liệu của bạn',
      });
    }
    if (ownerKind === 'CUSTOMER') {
      if (!ownerId) throw new ForbiddenException({ code: 'OUT_OF_SCOPE' });
      /*
       * Quản trị hệ thống đi nhánh riêng, y như `assertInScope` bên `customer`.
       *
       * Phạm vi dữ liệu của họ RỖNG (`0031`) nên họ không bao giờ khớp một danh
       * sách người — mà họ mở được màn hình khách hàng. Thiếu nhánh này thì tệp
       * pháp lý là thứ duy nhất trên màn hình ấy họ không mở được.
       */
      if (me.role === 'QUAN_TRI') return;
      const nguoi = await this.clients.customerViewers(ownerId);
      const scope = await this.clients.scopeUserIds(me);
      if (nguoi.some((x) => x && scope.includes(x))) return;
      throw new ForbiddenException({
        code: 'OUT_OF_SCOPE',
        message: 'Khách hàng này nằm ngoài phạm vi dữ liệu của bạn',
      });
    }
    return this.assertCanAccess(ownerKind, ownerId, me);
  }

  /**
   * Quyền đọc MỘT tệp đã biết dòng của nó — mọi đường đọc theo id đi qua đây.
   *
   * Tệp BÌNH LUẬN (`0263`) rẽ nhánh: `policy` trả lời, theo đúng `assertPolicyInScope`
   * (có luật Kế toán `da_qua_tbp`, thứ `mucDocHoSo` bốn cột không biết), CỘNG điều
   * kiện của chính bình luận — tệp đang gắn một bình luận chưa xoá, hoặc tệp chưa gắn
   * mà chính mình vừa tải lên (ô soạn cần xem lại tệp mình đính). Tệp đã gỡ hay của
   * bình luận đã xoá thì không ai đọc được nữa, kể cả tác giả (yêu cầu 3.4).
   *
   * 404 chứ không 403 cho tệp bình luận không đọc được: nói 403 là xác nhận cho người
   * dò id rằng tệp ấy có thật.
   */
  async assertCanReadRow(row: FileRow, me: AuthUser): Promise<void> {
    if (row.purpose !== 'BINH_LUAN') {
      return this.assertCanRead(row.owner_kind, row.owner_id, me, row.purpose);
    }
    const duoc =
      row.owner_kind === 'POLICY' &&
      row.owner_id !== null &&
      (await this.clients.tepBinhLuanXemDuoc({
        fileId: row.id,
        policyId: row.owner_id,
        nguoiTai: row.uploaded_by,
        me,
      }));
    if (!duoc) throw new NotFoundException({ code: 'FILE_NOT_FOUND' });
  }

  /**
   * QUYỀN GHI — tải lên, gỡ bỏ (`0148`).
   *
   * Đúng luật cũ, không nới một chút nào: tệp pháp lý của khách hàng do TDV phụ
   * trách đưa vào và chỉ họ gỡ ra. Trưởng bộ phận đọc được từ `0148`, nhưng
   * "đọc được" và "sửa được" là hai câu, và lượt này chỉ trả lời câu thứ nhất.
   */
  async assertCanWrite(ownerKind: OwnerKind, ownerId: string | null, me: AuthUser): Promise<void> {
    return this.assertCanAccess(ownerKind, ownerId, me);
  }

  async assertCanAccess(ownerKind: OwnerKind, ownerId: string | null, me: AuthUser): Promise<void> {
    if (ownerKind === 'TEMPLATE') {
      /*
       * File mẫu không thuộc cây phân quyền hồ sơ (DOC-26) — nó thuộc về người
       * quản lý mẫu, và từ `0060` chỉ còn MỘT người: Quản trị hệ thống giữ cả
       * hai loại mẫu.
       *
       * `0055` mở cho cả Sale Admin vì khi ấy họ giữ mẫu hợp đồng (muc 8.2).
       * Khách hàng gộp về Quản trị ngày 20/08, nên để Sale Admin ở đây là để
       * lại một cửa không còn ai đi qua — và một cửa như thế thì không ai nhớ
       * để đóng lúc nó thành vấn đề.
       */
      if (me.role !== 'QUAN_TRI') {
        throw new ForbiddenException({
          code: 'FORBIDDEN_ROLE',
          message: 'File văn bản mẫu thuộc Quản trị hệ thống',
        });
      }
      return;
    }
    if (!ownerId) throw new ForbiddenException({ code: 'OUT_OF_SCOPE' });

    // Hồ sơ: id của tôi ở MỘT TRONG BỐN cột người (`0031`). Cùng phép so với
    // `assertPolicyInScope` bên policy — hai chỗ phải trả lời giống hệt nhau,
    // nếu không thì một hồ sơ mở được mà không xuất được hợp đồng.
    //
    // Khách hàng thì vẫn theo TDV phụ trách: `document` chỉ đụng tới hồ sơ pháp
    // lý của khách, và người tải chúng lên là chính TDV đó.
    const nguoi =
      ownerKind === 'POLICY'
        ? await (async () => {
            const p = await this.clients.policy(ownerId);
            return [p.tdv_user_id, p.tbp_user_id, p.ke_toan_user_id, p.sale_admin_user_id];
          })()
        : [(await this.clients.customer(ownerId)).tdvUserId];

    const scope = await this.clients.scopeUserIds(me);
    if (!nguoi.some((x) => x && scope.includes(x))) {
      throw new ForbiddenException({
        code: 'OUT_OF_SCOPE',
        message: 'Hồ sơ này nằm ngoài phạm vi dữ liệu của bạn',
      });
    }
  }

  // --- Tải lên --------------------------------------------------------------

  async upload(
    input: {
      ownerKind: OwnerKind;
      ownerId: string | null;
      purpose: Purpose;
      fileName: string;
      buffer: Buffer;
    },
    me: AuthUser,
  ): Promise<FileRow> {
    if (input.buffer.length === 0) {
      throw new BadRequestException({ code: 'FILE_EMPTY', message: 'File rỗng' });
    }
    const tran = tranCo(input.purpose);
    if (input.buffer.length > tran) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `File vượt ${tran / 1024 / 1024}MB`,
        sizeBytes: input.buffer.length,
      });
    }
    const type = input.purpose === 'BINH_LUAN' ? sniffBinhLuan(input.buffer) : sniff(input.buffer);
    if (!type || !ALLOWED[input.purpose].includes(type)) {
      throw new BadRequestException({
        code: 'FILE_TYPE_NOT_ALLOWED',
        message: `Chỉ nhận ${ALLOWED[input.purpose].join(', ')}`,
        detected: type ?? 'không nhận dạng được',
      });
    }
    if (input.purpose === 'BINH_LUAN') {
      // `0263` — ai bình luận được trên hồ sơ thì đính tệp được: đúng phạm vi của
      // `policy`, kể cả Ban lãnh đạo và luật Kế toán chưa tới lượt.
      const duoc =
        input.ownerKind === 'POLICY' &&
        input.ownerId !== null &&
        (await this.clients.trongPhamVi(me, input.ownerId));
      if (!duoc) {
        throw new ForbiddenException({
          code: 'OUT_OF_SCOPE',
          message: 'Hồ sơ này nằm ngoài phạm vi dữ liệu của bạn',
        });
      }
    } else {
      await this.assertCanWrite(input.ownerKind, input.ownerId, me);
    }

    // Chuẩn hoá NFC cho tên hiển thị. macOS gửi lên dạng NFD, Windows gửi NFC;
    // không chuẩn hoá thì "Giấy phép.pdf" từ hai máy thành hai chuỗi khác nhau
    // và mọi phép so tên đều sai (DOC-18).
    const fileName = input.fileName.normalize('NFC');
    const key = Storage.keyFor(input.purpose, input.ownerId ?? undefined);

    await this.storage.put(key, input.buffer, type);
    try {
      return await this.insert({
        objectKey: key,
        fileName,
        contentType: type,
        buffer: input.buffer,
        ownerKind: input.ownerKind,
        ownerId: input.ownerId,
        purpose: input.purpose,
        uploadedBy: me.id,
      });
    } catch (e) {
      // Ghi CSDL hỏng sau khi đã ghi MinIO thì dọn object ngay. Không dọn là để
      // lại đúng thứ rác mà thứ tự "kiểm trước, ghi sau" ở trên sinh ra để tránh.
      await this.storage.remove(key).catch(() => undefined);
      throw e;
    }
  }

  /** Dùng cho file do chính hệ thống sinh (mẫu bàn giao) — đã có sẵn buffer. */
  async store(input: {
    fileName: string;
    contentType: string;
    buffer: Buffer;
    ownerKind: OwnerKind;
    ownerId: string | null;
    purpose: Purpose;
    uploadedBy: string;
  }): Promise<FileRow> {
    const key = Storage.keyFor(input.purpose, input.ownerId ?? undefined);
    await this.storage.put(key, input.buffer, input.contentType);
    return this.insert({ ...input, objectKey: key });
  }

  private async insert(input: {
    objectKey: string;
    fileName: string;
    contentType: string;
    buffer: Buffer;
    ownerKind: OwnerKind;
    ownerId: string | null;
    purpose: Purpose;
    uploadedBy: string;
  }): Promise<FileRow> {
    const row = await this.db.one<FileRow>(
      `INSERT INTO doc.stored_file
         (object_key, file_name, content_type, size_bytes, sha256,
          owner_kind, owner_id, purpose, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6::doc.owner_kind,$7,$8::doc.file_purpose,$9)
       RETURNING *`,
      [
        input.objectKey,
        input.fileName,
        input.contentType,
        input.buffer.length,
        sha256(input.buffer),
        input.ownerKind,
        input.ownerId,
        input.purpose,
        input.uploadedBy,
      ],
    );
    return row!;
  }

  // --- Tra và tải về --------------------------------------------------------

  async row(id: string): Promise<FileRow> {
    const r = await this.db.one<FileRow>(`SELECT * FROM doc.stored_file WHERE id = $1`, [id]);
    if (!r) throw new NotFoundException({ code: 'FILE_NOT_FOUND' });
    if (r.deleted_at) {
      throw new NotFoundException({
        code: 'FILE_DISCARDED',
        message: 'File đã bị huỷ khỏi hệ thống',
        discardedAt: r.deleted_at,
      });
    }
    return r;
  }

  /**
   * Liệt kê tệp của một chủ thể — và LỌC theo mức quyền của người gọi (`0183`).
   *
   * Người ở mức `BAN_TRUOC` chỉ thấy hai loại họ được xem. Lọc ở ĐÂY chứ không
   * để giao diện tự bỏ bớt: một danh sách trả ra rồi mới giấu đi là một danh
   * sách đã lộ — tên tệp cũng là dữ liệu.
   *
   * Đây cũng là đường mà màn hình dùng để đổi `objectKey` sang `fileId` trước
   * khi xin liên kết tải, nên nó phải trả ĐỦ hai loại ấy, không ít hơn.
   */
  async listFor(ownerKind: OwnerKind, ownerId: string, me: AuthUser): Promise<FileRow[]> {
    await this.assertCanRead(ownerKind, ownerId, me);
    const rows = await this.db.q<FileRow>(
      `SELECT * FROM doc.stored_file
        WHERE owner_kind = $1::doc.owner_kind AND owner_id = $2 AND deleted_at IS NULL
          -- 0263 — tệp bình luận chỉ hiện qua chính bình luận: liệt kê ở đây là bày
          -- tệp của bình luận đã xoá, tệp đã gỡ, và tệp người khác chưa gửi.
          AND purpose <> 'BINH_LUAN'
        ORDER BY uploaded_at`,
      [ownerKind, ownerId],
    );
    if (ownerKind !== 'POLICY') return rows;
    const muc = await this.mucDocHoSo(ownerId, me);
    return muc === 'BAN_TRUOC'
      ? rows.filter((r) => FilesService.LOAI_BAN_TRUOC.includes(r.purpose))
      : rows;
  }

  /**
   * Đọc nội dung và ĐỐI CHIẾU băm.
   *
   * File trên MinIO bị sửa bằng đường khác (người có khoá quản trị, sự cố lưu
   * trữ) thì phép so này là thứ duy nhất phát hiện ra. Trả nội dung sai mà không
   * báo gì là hỏng tệ hơn nhiều so với báo lỗi (DOC-06).
   */
  async read(id: string, me: AuthUser): Promise<{ row: FileRow; body: Buffer }> {
    const row = await this.row(id);
    // `0183` — `purpose` PHẢI đi cùng ở đây: đây là đường trả nội dung thật, và
    // bỏ sót nó là khe *bản trước* rộng hơn hai loại đã chốt. `0263` — qua
    // `assertCanReadRow` để tệp bình luận rẽ sang luật của nó.
    await this.assertCanReadRow(row, me);
    const body = await this.storage.get(row.object_key);
    if (sha256(body) !== row.sha256) {
      throw new ConflictException({
        code: 'FILE_INTEGRITY_FAILED',
        message: 'Nội dung file trên kho lưu trữ không khớp bản băm đã ghi khi tải lên',
        fileId: id,
      });
    }
    return { row, body };
  }

  /**
   * Object của một file còn nằm trên kho lưu trữ hay không.
   *
   * Không kiểm quyền và không đọc nội dung: đây là câu hỏi VẬN HÀNH — "siêu dữ
   * liệu trong CSDL còn khớp với kho lưu trữ không" — chứ không phải một lượt
   * tải file. Hai kho ghi riêng nên chúng lệch nhau được, và lệch trong im lặng.
   */
  async objectExists(id: string): Promise<boolean> {
    const row = await this.db.one<{ object_key: string }>(
      `SELECT object_key FROM doc.stored_file WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!row) return false;
    return this.storage.exists(row.object_key);
  }

  async verify(id: string, me: AuthUser): Promise<{ ok: boolean; expected: string; actual: string }> {
    const row = await this.row(id);
    // Đối chiếu băm là một phép ĐỌC — nó không đổi gì trên kho.
    await this.assertCanReadRow(row, me);
    const actual = sha256(await this.storage.get(row.object_key));
    return { ok: actual === row.sha256, expected: row.sha256, actual };
  }

  // --- Xoá thật -------------------------------------------------------------

  /**
   * Xoá object khỏi MinIO, giữ lại dòng CSDL làm vết.
   *
   * Gỡ một bản scan là gỡ THẬT — giữ một bản sao "cho chắc" là để tồn tại hai
   * bản cứng khác nhau cùng hiệu lực trong hệ thống. Nhưng vết "ai huỷ, lúc nào,
   * vì sao" thì phải còn (DOC-17, muc 10).
   *
   * Từ `0050` đường vào đây CHỈ CÒN MỘT: `DELETE /files/:id`, do người dùng bấm.
   * Trước đó còn một đường tự động — yêu cầu in lại xoá luôn bản scan — và đường
   * ấy đã gỡ theo yêu cầu khách hàng: Sale Admin chủ động gỡ và thay.
   */
  /**
   * Nhân bản tệp *Giấy tờ hồ sơ* của một hồ sơ sang hồ sơ khác (`0148`).
   *
   * CHÉP BYTE, không dùng chung `object_key`, và lý do nằm ngay ở hàm dưới đây:
   * `discard` **xoá object khỏi kho** chứ không chỉ đánh dấu dòng. Hai dòng
   * cùng trỏ một object thì Trình dược viên gỡ giấy tờ khỏi bản CŨ là bản MỚI
   * mất tệp — mất thật, không khôi phục được, và mất ở một hồ sơ mà người gỡ
   * không hề mở ra. Một lượt `put` thêm là cái giá rẻ để không có đường ấy.
   *
   * Trả về danh sách `objectKey` MỚI để `policy` dựng con trỏ của nó theo đúng
   * những tệp thật sự chép được — chứ không tự đoán từ bảng của chính nó. Hai
   * bảng đã có thể lệch nhau (tệp mồ côi), và lượt chép không phải là chỗ để
   * cái lệch ấy nhân đôi.
   */
  async saoChepGiayToHoSo(
    tuHoSo: string,
    sangHoSo: string,
    khoa: string[],
  ): Promise<{ objectKey: string; fileName: string; sizeBytes: string; uploadedBy: string }[]> {
    /*
     * `policy` NÓI CHÉP TỆP NÀO; ở đây không tự chọn (`0149`).
     *
     * Bản `0148` tự chọn bằng `owner_id = hồ sơ cũ AND purpose = 'HO_SO'`, và đó
     * là lấy nhầm bảng. Bảng này trả lời *"tệp nào tồn tại"*; câu cần hỏi là
     * *"hồ sơ cũ có tệp gì"*, và chỉ `pol.policy_attachment` trả lời được.
     *
     * Hai câu ấy lệch nhau ở đúng những tệp mà `0149` đang chữa: tệp TDV đã GỠ
     * khỏi hồ sơ (con trỏ mất, dòng ở đây còn), và tệp MỒ CÔI của một lượt tải
     * lên hỏng nửa chừng (chưa bao giờ có con trỏ). Bản `0148` chép cả hai — nên
     * giấy tờ đã gỡ quay lại ở bản mới, còn tệp mồ côi thành đính kèm thật.
     *
     * Vẫn lọc thêm `purpose = 'HO_SO'` dù `policy` đã lọc `kind`: hai chốt cho
     * cùng một luật, và chốt ở đây là chốt cuối trước khi byte được nhân đôi.
     */
    if (khoa.length === 0) return [];
    const nguon = await this.db.q<FileRow>(
      `SELECT * FROM doc.stored_file
        WHERE owner_kind = 'POLICY' AND owner_id = $1
          AND purpose = 'HO_SO' AND deleted_at IS NULL
          AND object_key = ANY($2::text[])
        ORDER BY uploaded_at`,
      [tuHoSo, khoa],
    );

    const ra: { objectKey: string; fileName: string; sizeBytes: string; uploadedBy: string }[] = [];
    for (const f of nguon) {
      const body = await this.storage.get(f.object_key);
      const moi = await this.store({
        fileName: f.file_name,
        contentType: f.content_type,
        buffer: body,
        ownerKind: 'POLICY',
        ownerId: sangHoSo,
        purpose: 'HO_SO',
        // Người tải lên GIỮ NGUYÊN là người của bản gốc, không đổi thành người
        // vừa lập bản mới: câu mà cột này trả lời là *"ai đưa tờ giấy này vào hệ
        // thống"*, và lượt chép không đổi câu trả lời ấy.
        uploadedBy: f.uploaded_by,
      });
      ra.push({
        objectKey: moi.object_key,
        fileName: moi.file_name,
        sizeBytes: String(moi.size_bytes),
        uploadedBy: moi.uploaded_by,
      });
    }
    return ra;
  }

  /**
   * Gỡ hẳn một tệp theo KHOÁ KHO — `policy` và `customer` gọi khi con trỏ của
   * chúng bị xoá (`0149`).
   *
   * Theo `object_key` chứ không theo `id`: hai bảng con trỏ (`pol.policy_attachment`,
   * `cus.customer_document`) chỉ giữ khoá kho, không giữ id của `doc.stored_file`.
   * Đó là ranh giới có từ `0069` và không đáng đổi cho một lượt xoá.
   *
   * Không tìm thấy thì IM LẶNG bỏ qua, không ném: lượt gỡ ở service kia đã ghi
   * xong rồi, và một tệp vốn đã biến mất thì không có gì để sửa. Ném ra ở đây
   * chỉ dựng thêm một đường lỗi cho một việc đã đạt mục đích.
   */
  async goBoTheoKhoa(objectKey: string, reason: string): Promise<boolean> {
    const row = await this.db.one<FileRow>(
      `SELECT * FROM doc.stored_file WHERE object_key = $1 AND deleted_at IS NULL`,
      [objectKey],
    );
    if (!row) return false;
    await this.discard(row.id, reason);
    return true;
  }

  /** Thông tin một lô tệp cho `policy` gắn vào bình luận (`0263`). Không kiểm quyền — `policy` quyết. */
  async thongTin(ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await this.db.q<FileRow>(`SELECT * FROM doc.stored_file WHERE id = ANY($1::uuid[])`, [ids]);
    return rows.map((r) => ({
      id: r.id,
      ownerKind: r.owner_kind,
      ownerId: r.owner_id,
      purpose: r.purpose,
      uploadedBy: r.uploaded_by,
      fileName: r.file_name,
      contentType: r.content_type,
      sizeBytes: String(r.size_bytes),
      daHuy: r.deleted_at !== null,
    }));
  }

  /**
   * Dọn tệp bình luận (`0263`, yêu cầu 7) — `sla-worker` gọi ở lượt *Dọn dữ liệu*.
   *
   * `policy` nói tệp nào phải đi (bình luận đã xoá · tệp đã gỡ khi sửa · tệp không
   * ai gắn quá 24 giờ · hồ sơ đã xoá hẳn); ở đây chỉ làm. Một lô tối đa `lo` tệp,
   * cũ trước; `tiep` là con trỏ của lô sau.
   *
   * KHÔNG dùng `discard`: nó nuốt lỗi kho rồi vẫn đánh dấu dòng là đã huỷ — đúng cho
   * lượt người dùng bấm gỡ (họ cần tệp biến khỏi màn hình), sai cho lượt dọn, nơi
   * mục đích duy nhất là ổ đĩa. Kho hỏng thì dòng GIỮ NGUYÊN để lượt sau thử lại;
   * đánh dấu trước là để lại một object không dòng nào trỏ tới, mãi mãi.
   */
  async donTepBinhLuan(
    sau: { moc: string; id: string } | null,
    lo = 500,
  ): Promise<{ daXoa: number; loi: number; tiep: { moc: string; id: string } | null }> {
    /*
     * CON TRỎ, không `LIMIT` trần: tệp của bình luận còn sống cũng nằm trong tập quét
     * và nằm lại mãi — quét lại từ đầu mỗi lô thì hơn `lo` tệp sống là lượt dọn đứng
     * yên ở chúng và không bao giờ tới tệp mới hơn. Mốc là `uploaded_at::text` (đủ
     * micro giây) chứ không qua `Date` của JS (cắt còn mili giây → hai tệp cùng mili
     * giây có thể bị bỏ qua).
     *
     * Chỉ tệp tải lên quá 24 giờ: mọi tệp cần dọn đều sẽ tới tuổi ấy, còn tệp trẻ hơn
     * thì có thể đang nằm trong một ô soạn chưa gửi.
     */
    const rows = await this.db.q<{ id: string; object_key: string; uploaded_at: Date; moc: string }>(
      `SELECT id, object_key, uploaded_at, uploaded_at::text AS moc FROM doc.stored_file
        WHERE purpose = 'BINH_LUAN' AND deleted_at IS NULL
          AND uploaded_at < now() - interval '24 hours'
          AND ($1::timestamptz IS NULL OR (uploaded_at, id) > ($1::timestamptz, $2::uuid))
        ORDER BY uploaded_at, id LIMIT $3`,
      [sau?.moc ?? null, sau?.id ?? null, lo + 1],
    );
    const lay = rows.slice(0, lo);
    if (lay.length === 0) return { daXoa: 0, loi: 0, tiep: null };
    const xoa = new Set(
      await this.clients.phanLoaiTepBinhLuan(
        lay.map((r) => ({ id: r.id, taoLuc: new Date(r.uploaded_at).toISOString() })),
      ),
    );
    let daXoa = 0;
    let loi = 0;
    for (const r of lay) {
      if (!xoa.has(r.id)) continue;
      try {
        await this.storage.remove(r.object_key);
      } catch {
        loi++;
        continue;
      }
      await this.db.q(
        `UPDATE doc.stored_file SET deleted_at = now(), delete_reason = 'dọn tệp bình luận' WHERE id = $1`,
        [r.id],
      );
      daXoa++;
    }
    const cuoi = lay[lay.length - 1]!;
    return { daXoa, loi, tiep: rows.length > lo ? { moc: cuoi.moc, id: cuoi.id } : null };
  }

  async discard(id: string, reason: string): Promise<void> {
    const row = await this.db.one<FileRow>(`SELECT * FROM doc.stored_file WHERE id = $1`, [id]);
    if (!row || row.deleted_at) return;
    await this.storage.remove(row.object_key).catch(() => undefined);
    await this.db.q(
      `UPDATE doc.stored_file SET deleted_at = now(), delete_reason = $2 WHERE id = $1`,
      [id, reason],
    );
  }
}
