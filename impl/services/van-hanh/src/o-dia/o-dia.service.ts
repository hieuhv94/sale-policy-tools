/**
 * Ổ đĩa trên trang Vận hành (`0253`): đo theo Ổ (`statfs`) và theo HẠNG MỤC, lịch sử,
 * dự báo ngày đầy, MỘT ngưỡng cảnh báo (chốt 05/11) kèm thư cho Quản trị.
 *
 * HAI Ổ được hỏi: ổ dữ liệu (nơi thư mục sao lưu — volume Docker — nằm, tức cùng ổ với
 * `pgdata`/`miniodata`) và ổ bản sao ngoài (`BACKUP_MIRROR_DIR`). Hai điểm gắn cùng một
 * thiết bị (`stat().dev`) là MỘT ổ: khi đó bản sao ngoài không chống được hỏng ổ, và
 * trang nói ra điều đó (`cungODuLieu`).
 *
 * THƯ chỉ gửi khi đi TỪ DƯỚI LÊN TRÊN ngưỡng (`dang_vuot` giữ trạng thái lượt đo trước) —
 * ở trên ngưỡng nhiều ngày không thành mỗi giờ một lá. Xuống dưới rồi vượt lại thì báo
 * lại. Ổ đầy hẳn 100% thì Postgres dừng ghi và outbox không ghi được — nên ngưỡng phải
 * đặt sớm; đó là lý do mặc định 80%.
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { lstat, readdir, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { Db } from '../infra/db.js';
import { emit } from '../infra/outbox.js';

export type Mau = { luc: string; dung: number; tong: number };
export type ODo = {
  o: 'du-lieu' | 'ban-sao-ngoai';
  tong: number;
  dung: number;
  conLai: number;
  phanTram: number;
  vuotNguong: boolean;
  duBaoNgayDay: number | null;
  cungODuLieu?: boolean;
};

/**
 * Hàm THUẦN: số ngày tới khi đầy, theo hồi quy tuyến tính trên các mẫu 7 ngày gần nhất.
 * `null` khi chưa đủ dữ liệu (dưới 24 mẫu hoặc trải dưới một ngày) hoặc ổ không lớn dần.
 */
export function duBaoNgayDay(mau: Mau[], bayGio: Date): number | null {
  const tu = bayGio.getTime() - 7 * 86_400_000;
  const ds = mau.filter((m) => new Date(m.luc).getTime() >= tu);
  if (ds.length < 24) return null;
  const xs = ds.map((m) => new Date(m.luc).getTime() / 86_400_000);
  if (Math.max(...xs) - Math.min(...xs) < 1) return null;
  const ys = ds.map((m) => m.dung);
  const n = ds.length;
  const tbX = xs.reduce((a, b) => a + b, 0) / n;
  const tbY = ys.reduce((a, b) => a + b, 0) / n;
  let tu2 = 0;
  let mau2 = 0;
  for (let i = 0; i < n; i++) {
    tu2 += (xs[i]! - tbX) * (ys[i]! - tbY);
    mau2 += (xs[i]! - tbX) ** 2;
  }
  const doc = mau2 === 0 ? 0 : tu2 / mau2; // byte mỗi ngày
  if (doc <= 0) return null;
  const cuoi = ds[ds.length - 1]!;
  return Math.max(0, Math.floor((cuoi.tong - cuoi.dung) / doc));
}

const phanTram = (dung: number, tong: number): number => Math.round((dung / tong) * 1000) / 10;

@Injectable()
export class ODiaService {
  private readonly log = new Logger(ODiaService.name);

  constructor(private readonly db: Db) {}

  private diemDo(): { o: ODo['o']; duong: string }[] {
    const ds: { o: ODo['o']; duong: string }[] = [];
    const duLieu = process.env.BACKUP_DIR ?? process.env.CSBH_LOG_DIR;
    if (duLieu && existsSync(duLieu)) ds.push({ o: 'du-lieu', duong: duLieu });
    const ngoai = process.env.BACKUP_MIRROR_DIR;
    if (ngoai && existsSync(ngoai)) ds.push({ o: 'ban-sao-ngoai', duong: ngoai });
    return ds;
  }

  private async doMot(duong: string): Promise<{ tong: number; dung: number; conLai: number }> {
    const s = await statfs(duong);
    // Như `df`: "đã dùng" = khối − khối trống; "còn lại" là phần người thường được dùng.
    const dung = (s.blocks - s.bfree) * s.bsize;
    const conLai = s.bavail * s.bsize;
    return { tong: dung + conLai, dung, conLai };
  }

  async cauHinh(): Promise<{ nguong: number; guiThu: boolean; dangVuot: boolean }> {
    const r = await this.db.one<{ nguong: number; gui_thu: boolean; dang_vuot: boolean }>(
      `SELECT nguong, gui_thu, dang_vuot FROM ops.cau_hinh_o_dia`,
    );
    return { nguong: r?.nguong ?? 80, guiThu: r?.gui_thu ?? true, dangVuot: r?.dang_vuot ?? false };
  }

  async theoO(bayGio = new Date()): Promise<ODo[]> {
    const { nguong } = await this.cauHinh();
    const diem = this.diemDo();
    const kq: ODo[] = [];
    let devDuLieu: number | undefined;
    for (const d of diem) {
      const dev = (await stat(d.duong)).dev;
      if (d.o === 'du-lieu') devDuLieu = dev;
      const m = await this.doMot(d.duong);
      const pt = phanTram(m.dung, m.tong);
      const lichSu = await this.lichSu(d.o, 7);
      kq.push({
        o: d.o,
        ...m,
        phanTram: pt,
        vuotNguong: pt >= nguong,
        duBaoNgayDay: duBaoNgayDay(lichSu, bayGio),
        ...(d.o === 'ban-sao-ngoai' ? { cungODuLieu: dev === devDuLieu } : {}),
      });
    }
    return kq;
  }

  async lichSu(o: string, soNgay: number): Promise<Mau[]> {
    return this.db.q<Mau>(
      `SELECT luc, dung::float8 AS dung, tong::float8 AS tong FROM ops.mau_o_dia
        WHERE o = $1 AND luc > now() - ($2 || ' days')::interval ORDER BY luc`,
      [o, soNgay],
    );
  }

  /** Cỡ một cây thư mục, mỗi inode đếm MỘT lần (bản chụp liên kết cứng không bị đếm gấp). */
  private async coCay(goc: string): Promise<number> {
    const daThay = new Set<string>();
    let tong = 0;
    const di = async (p: string): Promise<void> => {
      let ds: import('node:fs').Dirent[];
      try {
        ds = await readdir(p, { withFileTypes: true });
      } catch {
        return;
      }
      for (const d of ds) {
        const c = join(p, d.name);
        if (d.isDirectory()) await di(c);
        else if (d.isFile()) {
          const s = await lstat(c);
          const k = `${s.dev}:${s.ino}`;
          if (!daThay.has(k)) {
            daThay.add(k);
            tong += s.size;
          }
        }
      }
    };
    await di(goc);
    return tong;
  }

  async theoHangMuc(): Promise<{ hangMuc: string; co: number }[]> {
    const csdl = await this.db.one<{ co: string }>(`SELECT pg_database_size(current_database())::text AS co`);
    const kho = await this.db.one<{ co: string }>(`SELECT ops.co_kho_tep()::text AS co`);
    const ds = [
      { hangMuc: 'csdl', co: Number(csdl?.co ?? 0) },
      { hangMuc: 'kho-tep', co: Number(kho?.co ?? 0) },
    ];
    if (process.env.BACKUP_DIR) ds.push({ hangMuc: 'ban-sao-luu', co: await this.coCay(process.env.BACKUP_DIR) });
    if (process.env.CSBH_LOG_DIR) ds.push({ hangMuc: 'tep-log', co: await this.coCay(process.env.CSBH_LOG_DIR) });
    return ds;
  }

  async datNguong(nguong: number, guiThu: boolean, nguoi: { id: string }) {
    if (!Number.isInteger(nguong) || nguong < 1 || nguong > 99) {
      throw new BadRequestException({ code: 'NGUONG_KHONG_HOP_LE', field: 'nguong', message: 'Ngưỡng phải là số nguyên từ 1 đến 99' });
    }
    const truoc = await this.cauHinh();
    // Đổi ngưỡng thì quên trạng thái "đã báo": ngưỡng mới thấp hơn mức đang dùng phải
    // cho ra một lá thư ở lượt đo kế tiếp, không im lặng vì lượt cũ đã báo ở ngưỡng cũ.
    await this.db.q(
      `UPDATE ops.cau_hinh_o_dia SET nguong = $1, gui_thu = $2, dang_vuot = false,
              cap_nhat_luc = now(), cap_nhat_boi = $3`,
      [nguong, guiThu, nguoi.id],
    );
    await emit(this.db, 'van_hanh.nguong_doi', {
      action: 'VAN_HANH_NGUONG_DOI',
      actorId: nguoi.id,
      targetLabel: 'o-dia',
      before: { nguong: truoc.nguong, guiThu: truoc.guiThu },
      after: { nguong, guiThu },
    });
    return this.cauHinh();
  }

  /**
   * Việc định kỳ: mỗi giờ một mẫu, rồi so ngưỡng. Gọi ở mỗi nhịp 5 phút — tự bỏ qua khi
   * mẫu gần nhất chưa quá 55 phút.
   */
  async doVaBao(luc: Date): Promise<{ daDo: boolean; daBao: boolean }> {
    const gan = await this.db.one<{ co: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM ops.mau_o_dia WHERE luc > $1::timestamptz - interval '55 minutes') AS co`,
      [luc.toISOString()],
    );
    if (gan?.co) return { daDo: false, daBao: false };
    const ds = await this.theoO(luc);
    for (const d of ds) {
      await this.db.q(`INSERT INTO ops.mau_o_dia (luc, o, tong, dung) VALUES ($1::timestamptz, $2, $3, $4) ON CONFLICT DO NOTHING`, [
        luc.toISOString(),
        d.o,
        d.tong,
        d.dung,
      ]);
    }
    await this.db.q(`DELETE FROM ops.mau_o_dia WHERE luc < $1::timestamptz - interval '90 days'`, [luc.toISOString()]);

    const ch = await this.cauHinh();
    const vuot = ds.filter((d) => d.vuotNguong);
    if (vuot.length > 0 && !ch.dangVuot) {
      await this.db.q(`UPDATE ops.cau_hinh_o_dia SET dang_vuot = true`);
      if (ch.guiThu) {
        const d = vuot.sort((a, b) => b.phanTram - a.phanTram)[0]!;
        await emit(this.db, 'van_hanh.o_dia_vuot_nguong', {
          action: 'VAN_HANH_O_DIA_VUOT_NGUONG',
          targetLabel: d.o,
          o: d.o,
          phanTram: d.phanTram,
          nguong: ch.nguong,
          conLai: d.conLai,
          duBaoNgayDay: d.duBaoNgayDay,
        });
        this.log.warn(`ổ ${d.o} dùng ${d.phanTram}% ≥ ngưỡng ${ch.nguong}% — đã gửi cảnh báo`);
        return { daDo: true, daBao: true };
      }
    } else if (vuot.length === 0 && ch.dangVuot) {
      await this.db.q(`UPDATE ops.cau_hinh_o_dia SET dang_vuot = false`);
    }
    return { daDo: true, daBao: false };
  }
}
