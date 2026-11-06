/**
 * Lịch tự động của trang Vận hành (`0252`) — đọc/sửa `ops.cau_hinh_viec`, đọc `ops.lan_chay`.
 *
 * Luật hợp lệ nằm Ở HAI CHỖ có chủ ý: ở đây để trả lời người dùng bằng một câu nói được
 * (giữ tối đa ngoài khoảng, hằng tuần thiếu thứ…), và ở ràng buộc CSDL (`0251`) để chặn mọi
 * đường ghi khác. Nếu hai chỗ lệch nhau thì CSDL thắng — lượt ghi trả `LICH_KHONG_HOP_LE`
 * thay vì 500, nên lệch vẫn lộ ra mà không làm hỏng gì.
 */
import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Put, Query } from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser, int, oneOf, opt, str, validate } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { emit } from '../infra/outbox.js';

export const VIEC = ['SAO_LUU_CSDL', 'SAO_LUU_KHO_TEP', 'NEN_LOG', 'DON_DU_LIEU'] as const;
export type Viec = (typeof VIEC)[number];
const TAN_SUAT = ['MOI_6_GIO', 'MOI_12_GIO', 'HANG_NGAY', 'HANG_TUAN'] as const;

/** Khoảng "giữ tối đa" của từng việc — bản chép của ràng buộc `luat_tung_viec` (`0251`). */
export const GIU_TOI_DA: Record<Viec, { min: number; max: number } | null> = {
  SAO_LUU_CSDL: { min: 1, max: 60 },
  SAO_LUU_KHO_TEP: { min: 1, max: 60 },
  NEN_LOG: { min: 1, max: 90 },
  DON_DU_LIEU: null,
};
/** Việc chỉ chạy hằng ngày — tần suất không đổi được. */
export const CHI_HANG_NGAY: readonly Viec[] = ['NEN_LOG', 'DON_DU_LIEU'];

type DongLich = {
  viec: Viec;
  tanSuat: string;
  gioChay: string;
  thuTrongTuan: number | null;
  giuToiDa: number | null;
  lanToi: string;
  lanGanNhat: { batDau: string; ketThuc: string | null; ketQua: string; tuDong: boolean; chiTiet: string | null } | null;
};

const CHON_LICH = `
  SELECT c.viec, c.tan_suat AS "tanSuat", to_char(c.gio_chay, 'HH24:MI') AS "gioChay",
         c.thu_trong_tuan AS "thuTrongTuan", c.giu_toi_da AS "giuToiDa",
         ops.moc_ke_tiep(c.viec, now()) AS "lanToi",
         (SELECT json_build_object('batDau', l.bat_dau, 'ketThuc', l.ket_thuc, 'ketQua', l.ket_qua,
                                   'tuDong', l.tu_dong, 'chiTiet', l.chi_tiet)
            FROM ops.lan_chay l WHERE l.viec = c.viec ORDER BY l.bat_dau DESC, l.id DESC LIMIT 1) AS "lanGanNhat"
    FROM ops.cau_hinh_viec c`;

@Controller('van-hanh')
export class LichController {
  constructor(private readonly db: Db) {}

  @Roles('QUAN_TRI')
  @Get('lich')
  async danhSach(): Promise<DongLich[]> {
    const rows = await this.db.q<DongLich>(`${CHON_LICH} ORDER BY array_position($1::text[], c.viec)`, [[...VIEC]]);
    return rows;
  }

  @Roles('QUAN_TRI')
  @Put('lich/:viec')
  async sua(@CurrentUser() me: AuthUser, @Param('viec') viecTho: string, @Body() body: unknown): Promise<DongLich> {
    if (!(VIEC as readonly string[]).includes(viecTho)) {
      throw new NotFoundException({ code: 'LICH_KHONG_CO', message: 'Không có việc định kỳ này' });
    }
    const viec = viecTho as Viec;
    const v = validate(body, {
      tanSuat: oneOf(...TAN_SUAT),
      // Độ dài KHÔNG chặn ở đây: `1:15` phải nhận cùng câu dễ hiểu như `25:00` (phép kiểm dưới).
      gioChay: str(1, 10),
      thuTrongTuan: opt(int(1, 7)),
      giuToiDa: opt(int(-1_000_000, 1_000_000)),
    });
    const sai = (field: string, message: string) =>
      new BadRequestException({ code: 'LICH_KHONG_HOP_LE', field, message });
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.gioChay)) throw sai('gioChay', 'Giờ chạy phải có dạng HH:MM');
    if (CHI_HANG_NGAY.includes(viec) && v.tanSuat !== 'HANG_NGAY') throw sai('tanSuat', 'Việc này chỉ chạy hằng ngày');
    if (v.tanSuat === 'HANG_TUAN' && v.thuTrongTuan === undefined) throw sai('thuTrongTuan', 'Chọn thứ trong tuần');
    const thu = v.tanSuat === 'HANG_TUAN' ? v.thuTrongTuan! : null;
    const khoang = GIU_TOI_DA[viec];
    let giu: number | null = null;
    if (khoang) {
      if (v.giuToiDa === undefined || v.giuToiDa < khoang.min || v.giuToiDa > khoang.max) {
        throw sai('giuToiDa', `Số bản giữ lại phải từ ${khoang.min} đến ${khoang.max}`);
      }
      giu = v.giuToiDa;
    }

    return this.db.tx(async (c) => {
      const truoc = (await c.query<DongLich>(`${CHON_LICH} WHERE c.viec = $1 FOR UPDATE OF c`, [viec])).rows[0]!;
      try {
        await c.query('SAVEPOINT ghi');
        await c.query(
          `UPDATE ops.cau_hinh_viec
              SET tan_suat = $2, gio_chay = $3::time, thu_trong_tuan = $4, giu_toi_da = $5,
                  cap_nhat_luc = now(), cap_nhat_boi = $6
            WHERE viec = $1`,
          [viec, v.tanSuat, v.gioChay, thu, giu, me.id],
        );
      } catch (e) {
        if ((e as { code?: string }).code === '23514') {
          await c.query('ROLLBACK TO SAVEPOINT ghi');
          throw sai('lich', 'Cấu hình lịch không hợp lệ');
        }
        throw e;
      }
      const sau = (await c.query<DongLich>(`${CHON_LICH} WHERE c.viec = $1`, [viec])).rows[0]!;
      await emit(c, 'van_hanh.lich_doi', {
        action: 'VAN_HANH_LICH_DOI',
        actorId: me.id,
        targetLabel: viec,
        before: { tanSuat: truoc.tanSuat, gioChay: truoc.gioChay, thuTrongTuan: truoc.thuTrongTuan, giuToiDa: truoc.giuToiDa },
        after: { tanSuat: sau.tanSuat, gioChay: sau.gioChay, thuTrongTuan: sau.thuTrongTuan, giuToiDa: sau.giuToiDa },
      });
      return sau;
    });
  }

  @Roles('QUAN_TRI')
  @Get('lan-chay')
  async lanChay(@Query('viec') viec: string | undefined, @Query('so') so: string | undefined) {
    if (viec !== undefined && !(VIEC as readonly string[]).includes(viec)) {
      throw new NotFoundException({ code: 'LICH_KHONG_CO', message: 'Không có việc định kỳ này' });
    }
    const n = Math.min(Math.max(Number(so) || 20, 1), 200);
    return this.db.q(
      `SELECT id, viec, bat_dau AS "batDau", ket_thuc AS "ketThuc", ket_qua AS "ketQua",
              tu_dong AS "tuDong", chi_tiet AS "chiTiet"
         FROM ops.lan_chay WHERE ($1::text IS NULL OR viec = $1)
        ORDER BY bat_dau DESC, id DESC LIMIT $2`,
      [viec ?? null, n],
    );
  }
}
