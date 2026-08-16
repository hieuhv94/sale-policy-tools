/**
 * Người ký — YCNV muc 6.4.
 *
 * Tệp này từng mang tên `lookups.service.ts` và giữ thêm ba danh mục tra cứu
 * tỉnh/thành · bệnh viện · kênh. Cả ba rời khỏi phần mềm ở `0026`; phần còn lại
 * đổi tên theo đúng thứ nó còn làm.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Db } from '../infra/db.js';
import { changeEvent, emit } from '../infra/outbox.js';

export type SignerInput = {
  fullName: string;
  title: string;
  unit: string;
  signScope: string;
  validFrom: string;
  validTo?: string | undefined;
};

@Injectable()
export class SignersService {
  constructor(private readonly db: Db) {}

  async createSigner(input: SignerInput, actorId: string) {
    return this.db.tx(async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO cat.signer (full_name, title, unit, sign_scope, valid_from, valid_to)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          input.fullName,
          input.title,
          input.unit,
          input.signScope,
          input.validFrom,
          input.validTo ?? null,
        ],
      );
      const id = r.rows[0]!.id;
      await emit(
        c,
        'catalog.changed',
        changeEvent('signer', id, actorId, { before: null, after: input }),
      );
      return { id, ...input };
    });
  }

  /**
   * Sửa người ký. `isActive: false` là cách ĐÚNG để ngừng dùng một người.
   *
   * Xoá (`removeSigner`) chỉ dành cho dòng vừa khai nhầm. Người đã từng đứng tên
   * trên hợp đồng xuất ra thì phải ngừng chứ không xoá: hệ thống không lưu file
   * hợp đồng, nên bản giấy khách hàng đang giữ là dấu vết duy nhất, và nó dẫn
   * chiếu tới một cái tên mà CSDL phải còn giải thích được.
   */
  async updateSigner(
    id: string,
    input: {
      title?: string | undefined;
      unit?: string | undefined;
      signScope?: string | undefined;
      validTo?: string | null | undefined;
      isActive?: boolean | undefined;
    },
    actorId: string,
  ) {
    return this.db.tx(async (c) => {
      const truoc = await c.query(`SELECT * FROM cat.signer WHERE id = $1`, [id]);
      if (truoc.rowCount === 0) throw new NotFoundException({ code: 'SIGNER_NOT_FOUND' });

      const r = await c.query(
        `UPDATE cat.signer
            SET title      = coalesce($2, title),
                unit       = coalesce($3, unit),
                sign_scope = coalesce($4, sign_scope),
                valid_to   = CASE WHEN $6 THEN $5::date ELSE valid_to END,
                is_active  = coalesce($7, is_active)
          WHERE id = $1
        RETURNING full_name AS "fullName", title, unit, sign_scope AS "signScope",
                  valid_from AS "validFrom", valid_to AS "validTo", is_active AS "isActive"`,
        [
          id,
          input.title ?? null,
          input.unit ?? null,
          input.signScope ?? null,
          input.validTo ?? null,
          input.validTo !== undefined,
          input.isActive ?? null,
        ],
      );
      const sau = r.rows[0]!;
      await emit(
        c,
        'catalog.changed',
        changeEvent('signer', id, actorId, { before: truoc.rows[0], after: sau }),
      );
      return { id, ...sau };
    });
  }

  /** Xoá hẳn — chỉ dùng cho dòng vừa khai nhầm. Xem chú thích ở `updateSigner`. */
  async removeSigner(id: string, actorId: string) {
    return this.db.tx(async (c) => {
      const truoc = await c.query(`DELETE FROM cat.signer WHERE id = $1 RETURNING *`, [id]);
      if (truoc.rowCount === 0) throw new NotFoundException({ code: 'SIGNER_NOT_FOUND' });
      await emit(
        c,
        'catalog.changed',
        changeEvent('signer', id, actorId, { before: truoc.rows[0], after: null }),
      );
      return { ok: true };
    });
  }

  listSigners(activeOn?: string) {
    return this.db.q(
      `SELECT id, full_name AS "fullName", title, unit, sign_scope AS "signScope",
              valid_from AS "validFrom", valid_to AS "validTo", is_active AS "isActive"
         FROM cat.signer
        WHERE ($1::date IS NULL OR (is_active
              AND valid_from <= $1::date
              AND (valid_to IS NULL OR valid_to >= $1::date)))
        ORDER BY full_name`,
      [activeOn ?? null],
    );
  }

  /**
   * Chọn người ký cho một văn bản. Trả 400 nếu người đó đã hết hiệu lực hoặc
   * ký ngoài phạm vi được giao (CAT-17).
   *
   * Kiểm ở đây chứ không để service gọi tự kiểm: điều kiện hiệu lực nằm trong
   * dữ liệu của catalog, ai cũng tự diễn giải thì sớm muộn có chỗ diễn giải sai.
   */
  async selectSigner(signerId: string, scope: string, on?: string) {
    const s = await this.db.one<{
      id: string;
      full_name: string;
      title: string;
      unit: string;
      sign_scope: string;
      is_active: boolean;
      valid_from: Date;
      valid_to: Date | null;
    }>(`SELECT * FROM cat.signer WHERE id = $1`, [signerId]);
    if (!s) throw new NotFoundException({ code: 'SIGNER_NOT_FOUND' });

    const day = on ? new Date(`${on}T00:00:00Z`) : new Date();
    const expired =
      !s.is_active || s.valid_from > day || (s.valid_to !== null && s.valid_to < day);
    if (expired) {
      throw new BadRequestException({
        code: 'SIGNER_NOT_VALID',
        message: 'Người ký đã hết hiệu lực tại thời điểm ký',
      });
    }
    if (s.sign_scope !== scope) {
      throw new BadRequestException({
        code: 'SIGNER_OUT_OF_SCOPE',
        message: `Người ký không có phạm vi ký "${scope}"`,
      });
    }
    return {
      id: s.id,
      fullName: s.full_name,
      title: s.title,
      unit: s.unit,
      signScope: s.sign_scope,
    };
  }
}
