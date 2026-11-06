/**
 * Tác tử vận hành nhìn từ phía ứng dụng (`0254`).
 *
 * Tác tử là vòng lặp shell trên máy chủ (`./csbh tac-tu`); nó và `van-hanh` không gọi nhau —
 * cả hai chỉ đọc/ghi bảng `ops.*` (migration `0127`). Ở đây: đọc nhịp tim, ảnh chụp container
 * và cỡ Docker tác tử ghi; xếp việc "Sao lưu ngay" cho tác tử nhận.
 *
 * MẤT LIÊN LẠC = quá 60 giây không nhịp (tác tử nhịp mỗi 10 giây). Khi ấy không xếp việc
 * (`AGENT_OFFLINE`): một việc nằm chờ không ai nhận trông y như một việc đang chạy.
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Db } from '../infra/db.js';
import { emit } from '../infra/outbox.js';

export const MAT_LIEN_LAC_GIAY = 60;

const LOAI = { CSDL: 'SAO_LUU_CSDL', KHO_TEP: 'SAO_LUU_KHO_TEP' } as const;
type LoaiWeb = keyof typeof LOAI;

export type ViecTay = {
  id: string;
  loai: string;
  trangThai: 'CHO' | 'DANG_CHAY' | 'THANH_CONG' | 'LOI';
  nguoiTao: string | null;
  taoLuc: string;
  batDau: string | null;
  ketThuc: string | null;
  chiTiet: string | null;
};

const COT_VIEC = `id::text, loai, trang_thai AS "trangThai", nguoi_tao AS "nguoiTao", tao_luc AS "taoLuc",
                  bat_dau AS "batDau", ket_thuc AS "ketThuc", chi_tiet AS "chiTiet"`;

@Injectable()
export class TacTuService {
  constructor(private readonly db: Db) {}

  async nhipTim(): Promise<{ online: boolean; lanCuoi: string | null; phienBan: string | null; may: string | null }> {
    const r = await this.db.one<{ lan_cuoi: string; phien_ban: string | null; may: string | null; online: boolean }>(
      `SELECT lan_cuoi, phien_ban, may, lan_cuoi > now() - make_interval(secs => $1) AS online FROM ops.tac_tu`,
      [MAT_LIEN_LAC_GIAY],
    );
    return { online: r?.online ?? false, lanCuoi: r?.lan_cuoi ?? null, phienBan: r?.phien_ban ?? null, may: r?.may ?? null };
  }

  async container() {
    return this.db.q<{ service: string; trangThai: string; sucKhoe: string | null; moTa: string | null; luc: string }>(
      `SELECT service, trang_thai AS "trangThai", suc_khoe AS "sucKhoe", mo_ta AS "moTa", luc FROM ops.container ORDER BY service`,
    );
  }

  async doDocker() {
    return this.db.q<{ ten: string; loai: 'VOLUME' | 'ANH'; co: number; luc: string }>(
      `SELECT ten, loai, co::float8 AS co, luc FROM ops.do_docker ORDER BY loai DESC, co DESC`,
    );
  }

  async viecGanDay(soDong = 20): Promise<ViecTay[]> {
    return this.db.q<ViecTay>(`SELECT ${COT_VIEC} FROM ops.viec_tay ORDER BY id DESC LIMIT $1`, [soDong]);
  }

  async motViec(id: string): Promise<ViecTay> {
    if (!/^\d{1,18}$/.test(id)) throw new BadRequestException({ code: 'VALIDATION_FAILED', field: 'id', message: 'Mã việc không hợp lệ' });
    const v = await this.db.one<ViecTay>(`SELECT ${COT_VIEC} FROM ops.viec_tay WHERE id = $1`, [id]);
    if (!v) throw new NotFoundException({ code: 'VIEC_KHONG_CO', message: 'Không có việc này' });
    return v;
  }

  /**
   * "Sao lưu ngay". Ba chốt: tác tử phải đang liên lạc; không có việc cùng loại đang chờ /
   * đang chạy (chỉ mục `uq_viec_tay_dang_do` là chốt thật — hai lượt bấm song song); và
   * không có lượt sao lưu cùng loại đang chạy theo lịch (lượt ấy giữ khoá, lượt bấm sẽ bị
   * bỏ qua — nói trước thay vì để việc thành LỖI sau vài giây).
   */
  async chayNgay(loaiWeb: unknown, nguoi: { id: string }): Promise<ViecTay> {
    // `Object.hasOwn`, không `in`: `'toString' in LOAI` là true (prototype) → `LOAI.toString`
    // là một hàm, đi xuống INSERT và nổ 500 (ca kiểm bắt được).
    if (typeof loaiWeb !== 'string' || !Object.hasOwn(LOAI, loaiWeb)) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', field: 'loai', message: 'loai phải là CSDL hoặc KHO_TEP' });
    }
    const loai = LOAI[loaiWeb as LoaiWeb];
    if (!(await this.nhipTim()).online) {
      throw new ConflictException({
        code: 'AGENT_OFFLINE',
        message: 'Máy chủ chưa sẵn sàng nhận lệnh. Bản sao lưu theo lịch vẫn chạy bình thường.',
      });
    }
    const dangChay = await this.db.one<{ co: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM ops.lan_chay WHERE viec = $1 AND ket_qua = 'DANG_CHAY'
                        AND bat_dau > now() - interval '1 hour') AS co`,
      [loai],
    );
    if (dangChay?.co) throw this.dangChay();
    let v: ViecTay | undefined;
    try {
      v = await this.db.one<ViecTay>(
        `INSERT INTO ops.viec_tay (loai, nguoi_tao) VALUES ($1, $2) RETURNING ${COT_VIEC}`,
        [loai, nguoi.id],
      );
    } catch (e) {
      if ((e as { code?: string; constraint?: string }).code === '23505' && (e as { constraint?: string }).constraint === 'uq_viec_tay_dang_do') {
        throw this.dangChay();
      }
      throw e;
    }
    await emit(this.db, 'van_hanh.sao_luu_chay_ngay', {
      action: 'VAN_HANH_SAO_LUU_CHAY_NGAY',
      actorId: nguoi.id,
      targetLabel: loai,
      after: { viec: v!.id },
    });
    return v!;
  }

  private dangChay() {
    return new ConflictException({ code: 'JOB_RUNNING', message: 'Đang có một lượt sao lưu loại này. Đợi lượt ấy xong.' });
  }
}
