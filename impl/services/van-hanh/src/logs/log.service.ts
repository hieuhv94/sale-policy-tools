/**
 * Tệp log trên trang Vận hành (`0252`): liệt kê · xem · tải · xoá · NÉN HẰNG NGÀY.
 *
 * Bố cục (`0249` viết, `0252` nén):
 *
 *   <CSBH_LOG_DIR>/dang-ghi/<service>-<YYYY-MM-DD>.log   ← đang ghi, mỗi service một tệp
 *   <CSBH_LOG_DIR>/log-<YYYY-MM-DD>.tar.gz               ← MỘT tệp nén cho cả ngày
 *   <CSBH_LOG_DIR>/log-<YYYY-MM-DD>.tar.gz.sha256
 *
 * NÉN (chốt 05/11: "log tất cả nén chung vào một file", "chỉ giữ 30 file"): mọi tệp của
 * MỘT ngày đã qua → một `tar.gz`; KIỂM đọc lại được và đủ mọi tệp thành viên rồi MỚI xoá
 * bản gốc; rồi giữ tối đa N tệp nén (cấu hình `NEN_LOG`), xoá cũ nhất. Chạy lại an toàn:
 * tệp nén của ngày ấy đã có (lượt trước chết sau khi đổi tên) thì chỉ kiểm rồi dọn gốc.
 *
 * Nén bằng `tar` của ảnh (busybox) chứ không thư viện: ảnh đã có, và tệp ra là thứ
 * người vận hành `tar -tzf` được bằng tay.
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ngayVN, THU_MUC_DANG_GHI } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { emit } from '../infra/outbox.js';

const chay = promisify(execFile);

/** Thư mục log — đọc mỗi lần gọi để bộ kiểm đặt được theo từng ca. */
export const thuMucLog = (): string => {
  const d = process.env.CSBH_LOG_DIR;
  if (!d) throw new NotFoundException({ code: 'LOG_CHUA_CAU_HINH', message: 'Máy chủ chưa khai thư mục log' });
  return d;
};

/** Tên thành phần ghi log — mười một service + sáu container hạ tầng (tác tử thu, `0253`). */
export const THANH_PHAN = [
  'gateway', 'identity', 'catalog', 'customer', 'policy', 'document', 'notification', 'audit',
  'reporting', 'sla-worker', 'van-hanh',
  'postgres', 'redis', 'rabbitmq', 'minio', 'gotenberg', 'caddy',
] as const;

const TEP_DANG_GHI = /^([a-z][a-z-]*)-(\d{4}-\d{2}-\d{2})\.log$/;
/** `-2`, `-3`… khi một ngày đã có tệp nén mà lại mọc thêm tệp gốc (hiếm: đồng hồ lùi). */
export const TEP_NEN = /^log-(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.tar\.gz$/;

export type TepDangGhi = { ten: string; service: string; ngay: string };

/** Hàm THUẦN: tệp đang ghi nào thuộc ngày ĐÃ QUA (theo giờ VN), gom theo ngày. */
export function canNen(ten: string[], homNay: string): Map<string, TepDangGhi[]> {
  const theoNgay = new Map<string, TepDangGhi[]>();
  for (const t of ten) {
    const m = TEP_DANG_GHI.exec(t);
    if (!m || m[2]! >= homNay) continue;
    const ds = theoNgay.get(m[2]!) ?? [];
    ds.push({ ten: t, service: m[1]!, ngay: m[2]! });
    theoNgay.set(m[2]!, ds);
  }
  return new Map([...theoNgay.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/** Hàm THUẦN: tệp nén nào phải xoá để còn `giu` tệp — cũ nhất trước (sắp theo tên = theo ngày). */
export function canDon(tenNen: string[], giu: number): string[] {
  const ds = tenNen.filter((t) => TEP_NEN.test(t)).sort();
  return ds.slice(0, Math.max(0, ds.length - giu));
}

@Injectable()
export class LogService {
  private readonly log = new Logger(LogService.name);

  constructor(private readonly db: Db) {}

  async danhSach() {
    const goc = thuMucLog();
    const dg = join(goc, THU_MUC_DANG_GHI);
    const dangGhi = [];
    for (const t of existsSync(dg) ? (await readdir(dg)).sort() : []) {
      const m = TEP_DANG_GHI.exec(t);
      if (!m) continue;
      dangGhi.push({ ten: t, service: m[1]!, ngay: m[2]!, co: (await stat(join(dg, t))).size });
    }
    const daNen = [];
    for (const t of (await readdir(goc)).filter((x) => TEP_NEN.test(x)).sort().reverse()) {
      daNen.push({ ten: t, ngay: TEP_NEN.exec(t)![1]!, co: (await stat(join(goc, t))).size });
    }
    const giu = await this.giuToiDa();
    return { dangGhi, daNen, giuToiDa: giu, tongCo: [...dangGhi, ...daNen].reduce((s, x) => s + x.co, 0) };
  }

  /** Đường dẫn của một tệp nén — CHỈ tên khớp mẫu, không bao giờ một đường dẫn tuỳ ý. */
  duongDanNen(ten: string): string {
    if (!TEP_NEN.test(ten)) throw new BadRequestException({ code: 'TEN_TEP_SAI', message: 'Tên tệp log không hợp lệ' });
    const p = join(thuMucLog(), ten);
    if (!existsSync(p)) throw new NotFoundException({ code: 'LOG_KHONG_CO', message: 'Tệp log không còn' });
    return p;
  }

  moTepNen(ten: string) {
    return createReadStream(this.duongDanNen(ten));
  }

  async xoaTepNen(ten: string, nguoi: { id: string }): Promise<void> {
    const p = this.duongDanNen(ten);
    const co = (await stat(p)).size;
    await rm(p);
    await rm(`${p}.sha256`, { force: true });
    await emit(this.db, 'van_hanh.log_xoa', { action: 'VAN_HANH_LOG_XOA', actorId: nguoi.id, targetLabel: ten, after: { co } });
  }

  /**
   * Xem tệp ĐANG GHI của hôm nay: N dòng cuối khớp bộ lọc. Đọc tối đa 4MB cuối tệp —
   * đủ cho mọi cửa sổ xem, và không đọc trọn một tệp vài trăm MB mỗi lần bấm.
   */
  async xem(service: string, loc: { muc?: string | undefined; traceId?: string | undefined; so?: number | undefined }) {
    if (!(THANH_PHAN as readonly string[]).includes(service)) {
      throw new BadRequestException({ code: 'TEN_TEP_SAI', message: 'Không có thành phần này' });
    }
    if (loc.traceId !== undefined && !/^[A-Za-z0-9_-]{4,64}$/.test(loc.traceId)) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', field: 'traceId', message: 'Mã tra cứu không hợp lệ' });
    }
    const p = join(thuMucLog(), THU_MUC_DANG_GHI, `${service}-${ngayVN()}.log`);
    if (!existsSync(p)) return { dong: [] };
    const dong = (await this.duoiTep(p, 4 * 1024 * 1024)).filter((d) => {
      if (loc.traceId && !d.includes(loc.traceId)) return false;
      if (loc.muc === 'loi') return /"muc":"(error|fatal)"/.test(d);
      if (loc.muc === 'canh-bao') return /"muc":"(error|fatal|warn)"/.test(d);
      return true;
    });
    return { dong: dong.slice(-(loc.so ?? 500)) };
  }

  /** Tìm một mã tra cứu ở MỌI tệp đang ghi — nối dòng của mọi service cho một request. */
  async traMa(traceId: string) {
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(traceId)) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', field: 'traceId', message: 'Mã tra cứu không hợp lệ' });
    }
    const dg = join(thuMucLog(), THU_MUC_DANG_GHI);
    const kq: string[] = [];
    for (const t of existsSync(dg) ? (await readdir(dg)).sort() : []) {
      if (!TEP_DANG_GHI.test(t)) continue;
      for (const d of await this.duoiTep(join(dg, t), 4 * 1024 * 1024)) if (d.includes(traceId)) kq.push(d);
    }
    return { dong: kq.sort().slice(-500) };
  }

  private async duoiTep(p: string, toiDa: number): Promise<string[]> {
    const co = (await stat(p)).size;
    const tu = Math.max(0, co - toiDa);
    const fh = await open(p, 'r');
    try {
      const buf = Buffer.alloc(co - tu);
      await fh.read(buf, 0, buf.length, tu);
      const dong = buf.toString('utf8').split('\n').filter(Boolean);
      return tu > 0 ? dong.slice(1) : dong; // dòng đầu có thể bị cắt giữa chừng
    } finally {
      await fh.close();
    }
  }

  private async giuToiDa(): Promise<number> {
    const r = await this.db.one<{ giu_toi_da: number }>(`SELECT giu_toi_da FROM ops.cau_hinh_viec WHERE viec = 'NEN_LOG'`);
    return r?.giu_toi_da ?? 30;
  }

  /** Nén mọi ngày đã qua, rồi giữ tối đa N tệp nén. Trả về những gì đã làm. */
  async nen(luc: Date): Promise<{ daNen: string[]; daXoa: string[] }> {
    const goc = thuMucLog();
    const dg = join(goc, THU_MUC_DANG_GHI);
    const daNen: string[] = [];
    const nhom = canNen(existsSync(dg) ? await readdir(dg) : [], ngayVN(luc));
    for (const [ngay, tep] of nhom) daNen.push(await this.nenMotNgay(goc, dg, ngay, tep.map((t) => t.ten)));
    const daXoa = canDon(await readdir(goc), await this.giuToiDa());
    for (const t of daXoa) {
      await rm(join(goc, t), { force: true });
      await rm(join(goc, `${t}.sha256`), { force: true });
    }
    return { daNen, daXoa };
  }

  private async nenMotNgay(goc: string, dg: string, ngay: string, ten: string[]): Promise<string> {
    // Tên đích: `log-<ngày>.tar.gz`, hoặc `-2`, `-3`… nếu ngày ấy đã có tệp nén chứa
    // tệp KHÁC (đồng hồ lùi) — không bao giờ ghi đè một tệp nén đã có.
    let dich = `log-${ngay}.tar.gz`;
    for (let i = 2; existsSync(join(goc, dich)); i++) {
      if (await this.chuaDu(join(goc, dich), ten)) break; // lượt trước đã nén, chết trước khi dọn gốc
      dich = `log-${ngay}-${i}.tar.gz`;
    }
    const p = join(goc, dich);
    if (!existsSync(p)) {
      const tam = `${p}.partial`;
      await chay('tar', ['-czf', tam, '-C', dg, ...ten]);
      if (!(await this.chuaDu(tam, ten))) {
        await rm(tam, { force: true });
        throw new Error(`nén ${dich}: đọc lại không đủ ${ten.length} tệp — giữ nguyên bản gốc`);
      }
      await rename(tam, p);
      const bam = createHash('sha256').update(await readFile(p)).digest('hex');
      await writeFile(`${p}.sha256`, `${bam}  ${dich}\n`);
    }
    for (const t of ten) await rm(join(dg, t), { force: true });
    this.log.log(`nén ${ten.length} tệp ngày ${ngay} → ${dich}`);
    return dich;
  }

  /** Tệp nén đọc được (`tar -tzf`) và chứa ĐỦ mọi tên cần có. */
  private async chuaDu(p: string, ten: string[]): Promise<boolean> {
    try {
      const { stdout } = await chay('tar', ['-tzf', p], { maxBuffer: 16 * 1024 * 1024 });
      const co = new Set(stdout.split('\n').map((x) => x.replace(/^\.\//, '')).filter(Boolean));
      return ten.every((t) => co.has(t));
    } catch {
      return false;
    }
  }

  /** Việc định kỳ: đến hạn thì nén + ghi `ops.lan_chay`. Trả `null` khi chưa đến hạn. */
  async nenTheoLich(luc: Date): Promise<{ daNen: string[]; daXoa: string[] } | null> {
    if (!process.env.CSBH_LOG_DIR) return null;
    const h = await this.db.one<{ den: boolean }>(`SELECT ops.den_han('NEN_LOG', $1::timestamptz) AS den`, [luc.toISOString()]);
    if (!h?.den) return null;
    const lan = await this.db.one<{ id: string }>(
      `INSERT INTO ops.lan_chay (viec, bat_dau, tu_dong) VALUES ('NEN_LOG', $1::timestamptz, true) RETURNING id`,
      [luc.toISOString()],
    );
    try {
      const r = await this.nen(luc);
      await this.db.q(`UPDATE ops.lan_chay SET ket_thuc = now(), ket_qua = 'THANH_CONG', chi_tiet = $2 WHERE id = $1`, [
        lan!.id,
        JSON.stringify(r),
      ]);
      return r;
    } catch (e) {
      await this.db.q(`UPDATE ops.lan_chay SET ket_thuc = now(), ket_qua = 'LOI', chi_tiet = $2 WHERE id = $1`, [
        lan!.id,
        String(e),
      ]);
      throw e;
    }
  }
}
