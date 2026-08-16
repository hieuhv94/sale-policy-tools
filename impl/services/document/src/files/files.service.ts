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
import type { AuthUser } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { Clients } from '../infra/clients.js';
import { Storage, sha256 } from '../infra/storage.js';

export type OwnerKind = 'POLICY' | 'CUSTOMER' | 'TEMPLATE';
export type Purpose = 'HO_SO' | 'SCAN' | 'PHAP_LY' | 'BAN_CSBH' | 'BAN_DA_KY' | 'MAU_HD';

export const MAX_BYTES = 20 * 1024 * 1024;

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
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: [0x50, 0x4b, 0x03, 0x04], //                            PK — .docx là một file zip
  },
];

const ALLOWED: Record<Purpose, string[]> = {
  HO_SO: ['application/pdf', 'image/jpeg', 'image/png'],
  SCAN: ['application/pdf', 'image/jpeg', 'image/png'],
  PHAP_LY: ['application/pdf', 'image/jpeg', 'image/png'],
  BAN_CSBH: ['application/pdf'],
  BAN_DA_KY: ['application/pdf'],
  MAU_HD: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

export function sniff(buf: Buffer): string | undefined {
  for (const m of MAGIC) {
    if (m.bytes.every((b, i) => buf[i] === b)) return m.type;
  }
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
  signed_from_id: string | null;
  signature: { signerName: string; signerRole: string; signedAt: string } | null;
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
  async assertCanAccess(ownerKind: OwnerKind, ownerId: string | null, me: AuthUser): Promise<void> {
    if (ownerKind === 'TEMPLATE') {
      // Mẫu hợp đồng thuộc Sale Admin, không thuộc cây phân quyền hồ sơ (DOC-26).
      if (me.role !== 'SALE_ADMIN') {
        throw new ForbiddenException({ code: 'FORBIDDEN_ROLE', message: 'Mẫu hợp đồng thuộc Sale Admin' });
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
    if (input.buffer.length > MAX_BYTES) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `File vượt ${MAX_BYTES / 1024 / 1024}MB`,
        sizeBytes: input.buffer.length,
      });
    }
    const type = sniff(input.buffer);
    if (!type || !ALLOWED[input.purpose].includes(type)) {
      throw new BadRequestException({
        code: 'FILE_TYPE_NOT_ALLOWED',
        message: `Chỉ nhận ${ALLOWED[input.purpose].join(', ')}`,
        detected: type ?? 'không nhận dạng được',
      });
    }
    await this.assertCanAccess(input.ownerKind, input.ownerId, me);

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

  /** Dùng cho file do chính hệ thống sinh (bản A4, bản đã ký) — đã có sẵn buffer. */
  async store(input: {
    fileName: string;
    contentType: string;
    buffer: Buffer;
    ownerKind: OwnerKind;
    ownerId: string | null;
    purpose: Purpose;
    uploadedBy: string;
    signedFromId?: string;
    signature?: { signerName: string; signerRole: string; signedAt: string };
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
    signedFromId?: string | undefined;
    signature?: { signerName: string; signerRole: string; signedAt: string } | undefined;
  }): Promise<FileRow> {
    const row = await this.db.one<FileRow>(
      `INSERT INTO doc.stored_file
         (object_key, file_name, content_type, size_bytes, sha256,
          owner_kind, owner_id, purpose, uploaded_by, signed_from_id, signature)
       VALUES ($1,$2,$3,$4,$5,$6::doc.owner_kind,$7,$8::doc.file_purpose,$9,$10,$11::jsonb)
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
        input.signedFromId ?? null,
        input.signature ? JSON.stringify(input.signature) : null,
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

  async listFor(ownerKind: OwnerKind, ownerId: string, me: AuthUser): Promise<FileRow[]> {
    await this.assertCanAccess(ownerKind, ownerId, me);
    return this.db.q<FileRow>(
      `SELECT * FROM doc.stored_file
        WHERE owner_kind = $1::doc.owner_kind AND owner_id = $2 AND deleted_at IS NULL
        ORDER BY uploaded_at`,
      [ownerKind, ownerId],
    );
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
    await this.assertCanAccess(row.owner_kind, row.owner_id, me);
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
    await this.assertCanAccess(row.owner_kind, row.owner_id, me);
    const actual = sha256(await this.storage.get(row.object_key));
    return { ok: actual === row.sha256, expected: row.sha256, actual };
  }

  // --- Xoá thật -------------------------------------------------------------

  /**
   * Xoá object khỏi MinIO, giữ lại dòng CSDL làm vết.
   *
   * Kế toán yêu cầu in lại thì bản scan cũ phải biến mất THẬT — giữ một bản sao
   * "cho chắc" là còn tồn tại hai bản cứng khác nhau cùng hiệu lực trong hệ
   * thống. Nhưng vết "ai huỷ, lúc nào, vì sao" thì phải còn (DOC-17, muc 10).
   */
  async discard(id: string, reason: string): Promise<void> {
    const row = await this.db.one<FileRow>(`SELECT * FROM doc.stored_file WHERE id = $1`, [id]);
    if (!row || row.deleted_at) return;
    await this.storage.remove(row.object_key).catch(() => undefined);
    await this.db.q(
      `UPDATE doc.stored_file SET deleted_at = now(), delete_reason = $2 WHERE id = $1`,
      [id, reason],
    );
  }

  async discardByObjectKey(objectKey: string, reason: string): Promise<number> {
    const rows = await this.db.q<{ id: string }>(
      `SELECT id FROM doc.stored_file WHERE object_key = $1 AND deleted_at IS NULL`,
      [objectKey],
    );
    for (const r of rows) await this.discard(r.id, reason);
    return rows.length;
  }
}
