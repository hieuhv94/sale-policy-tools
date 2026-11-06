/**
 * Bản sao lưu trên trang Vận hành (`0253`): liệt kê · tải (chỉ CSDL) · xoá.
 *
 * Đọc thẳng thư mục sao lưu (`BACKUP_DIR` — volume `pgbackup`) và bản sao ngoài
 * (`BACKUP_MIRROR_DIR`), đúng bố cục `backup.sh` (`csbh-<UTC>.dump`) và `CHUP_KHO_TEP`
 * (`kho-tep/<UTC>/tep/…`) ghi ra (`0250`).
 *
 * LUẬT XOÁ, ở máy chủ:
 *   - KHÔNG xoá bản MỚI NHẤT (`SAO_LUU_CUOI_CUNG`) — luôn còn ít nhất một đường phục hồi.
 *   - KHÔNG xoá khi một lượt sao lưu cùng loại đang chạy (`SAO_LUU_DANG_CHAY`) — lượt ấy
 *     sắp dọn theo giới hạn N, hai bên cùng xoá là chuyện không ai đoán trước được.
 *   - Tên phải khớp ĐÚNG mẫu — không bao giờ một đường dẫn tuỳ ý.
 *
 * Bản chụp kho tệp KHÔNG tải về qua trình duyệt (chốt 05/11): mỗi bản là toàn bộ kho.
 * Xoá một bản chụp là `rm -rf` thư mục của nó — tệp dùng chung qua liên kết cứng vẫn
 * sống ở bản khác, nên không có gì phải đếm lại.
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createReadStream, existsSync } from 'node:fs';
import { lstat, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Db } from '../infra/db.js';
import { emit } from '../infra/outbox.js';

const TEN_CSDL = /^csbh-(\d{8}T\d{6}Z)\.dump$/;
const MOC = /^\d{8}T\d{6}Z$/;

/** `20261105T181500Z` → ISO. */
export const mocThanhIso = (m: string): string =>
  `${m.slice(0, 4)}-${m.slice(4, 6)}-${m.slice(6, 8)}T${m.slice(9, 11)}:${m.slice(11, 13)}:${m.slice(13, 15)}Z`;

const thuMucSaoLuu = (): string => {
  const d = process.env.BACKUP_DIR;
  if (!d) throw new NotFoundException({ code: 'SAO_LUU_CHUA_CAU_HINH', message: 'Máy chủ chưa khai thư mục sao lưu' });
  return d;
};
const thuMucNgoai = (): string | undefined => {
  const d = process.env.BACKUP_MIRROR_DIR;
  return d && existsSync(d) ? d : undefined;
};

/** Duyệt mọi tệp dưới một thư mục — `lstat`, không theo liên kết mềm. */
async function* tepDuoi(goc: string): AsyncGenerator<{ duong: string; co: number; nlink: number; ino: number; dev: number }> {
  let ds: import('node:fs').Dirent[];
  try {
    ds = await readdir(goc, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of ds) {
    const p = join(goc, d.name);
    if (d.isDirectory()) yield* tepDuoi(p);
    else if (d.isFile()) {
      const s = await lstat(p);
      yield { duong: p, co: s.size, nlink: s.nlink, ino: s.ino, dev: s.dev };
    }
  }
}

export type BanCsdl = { ten: string; luc: string; co: number; coBanSaoNgoai: boolean; moiNhat: boolean };
export type BanChup = { moc: string; luc: string; soTep: number; chiemThem: number; coBanSaoNgoai: boolean; moiNhat: boolean };

@Injectable()
export class SaoLuuService {
  constructor(private readonly db: Db) {}

  async banCsdl(): Promise<BanCsdl[]> {
    const goc = thuMucSaoLuu();
    const ngoai = thuMucNgoai();
    const ten = (existsSync(goc) ? await readdir(goc) : []).filter((t) => TEN_CSDL.test(t)).sort().reverse();
    const kq: BanCsdl[] = [];
    for (const t of ten) {
      kq.push({
        ten: t,
        luc: mocThanhIso(TEN_CSDL.exec(t)![1]!),
        co: (await stat(join(goc, t))).size,
        coBanSaoNgoai: !!ngoai && existsSync(join(ngoai, t)),
        moiNhat: kq.length === 0,
      });
    }
    return kq;
  }

  /**
   * "Chiếm thêm" của một bản chụp = tổng cỡ các tệp CHỈ bản ấy giữ (`nlink === 1`) — phần
   * đĩa trả lại được nếu xoá nó. Bản đầu tiên trong chuỗi chiếm gần trọn kho; các bản sau
   * chỉ chiếm phần tệp mới.
   */
  async banChup(): Promise<BanChup[]> {
    const goc = join(thuMucSaoLuu(), 'kho-tep');
    const ngoai = thuMucNgoai();
    const moc = (existsSync(goc) ? await readdir(goc) : []).filter((m) => MOC.test(m)).sort().reverse();
    const kq: BanChup[] = [];
    for (const m of moc) {
      let soTep = 0;
      let chiemThem = 0;
      for await (const f of tepDuoi(join(goc, m, 'tep'))) {
        soTep++;
        if (f.nlink === 1) chiemThem += f.co;
      }
      kq.push({
        moc: m,
        luc: mocThanhIso(m),
        soTep,
        chiemThem,
        coBanSaoNgoai: !!ngoai && existsSync(join(ngoai, 'kho-tep', m)),
        moiNhat: kq.length === 0,
      });
    }
    return kq;
  }

  duongCsdl(ten: string): string {
    if (!TEN_CSDL.test(ten)) throw new BadRequestException({ code: 'TEN_TEP_SAI', message: 'Tên bản sao lưu không hợp lệ' });
    const p = join(thuMucSaoLuu(), ten);
    if (!existsSync(p)) throw new NotFoundException({ code: 'SAO_LUU_KHONG_CO', message: 'Bản sao lưu không còn' });
    return p;
  }

  async moCsdl(ten: string, nguoi: { id: string }) {
    const p = this.duongCsdl(ten);
    await emit(this.db, 'van_hanh.sao_luu_tai', { action: 'VAN_HANH_SAO_LUU_TAI', actorId: nguoi.id, targetLabel: ten });
    return { luong: createReadStream(p), tenTai: `csbh-sao-luu-${TEN_CSDL.exec(ten)![1]}.backup` };
  }

  private async chanKhiDangChay(viec: 'SAO_LUU_CSDL' | 'SAO_LUU_KHO_TEP'): Promise<void> {
    const r = await this.db.one<{ co: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM ops.lan_chay WHERE viec = $1 AND ket_qua = 'DANG_CHAY'
                        AND bat_dau > now() - interval '1 hour') AS co`,
      [viec],
    );
    if (r?.co) {
      throw new ConflictException({
        code: 'SAO_LUU_DANG_CHAY',
        message: 'Đang có một lượt sao lưu chạy — đợi lượt ấy xong rồi xoá.',
      });
    }
  }

  async xoaCsdl(ten: string, caBanSaoNgoai: boolean, nguoi: { id: string }): Promise<void> {
    const p = this.duongCsdl(ten);
    const ds = await this.banCsdl();
    if (ds[0]?.ten === ten) {
      throw new ConflictException({ code: 'SAO_LUU_CUOI_CUNG', message: 'Không xoá được bản sao lưu mới nhất.' });
    }
    await this.chanKhiDangChay('SAO_LUU_CSDL');
    const co = (await stat(p)).size;
    await rm(p);
    const ngoai = thuMucNgoai();
    const xoaNgoai = caBanSaoNgoai && !!ngoai && existsSync(join(ngoai, ten));
    if (xoaNgoai) await rm(join(ngoai!, ten), { force: true });
    await emit(this.db, 'van_hanh.sao_luu_xoa', {
      action: 'VAN_HANH_SAO_LUU_XOA',
      actorId: nguoi.id,
      targetLabel: ten,
      after: { loai: 'CSDL', co, caBanSaoNgoai: xoaNgoai },
    });
  }

  async xoaChup(moc: string, caBanSaoNgoai: boolean, nguoi: { id: string }): Promise<void> {
    if (!MOC.test(moc)) throw new BadRequestException({ code: 'TEN_TEP_SAI', message: 'Mốc bản chụp không hợp lệ' });
    const p = join(thuMucSaoLuu(), 'kho-tep', moc);
    if (!existsSync(p)) throw new NotFoundException({ code: 'SAO_LUU_KHONG_CO', message: 'Bản chụp không còn' });
    const ds = await this.banChup();
    if (ds[0]?.moc === moc) {
      throw new ConflictException({ code: 'SAO_LUU_CUOI_CUNG', message: 'Không xoá được bản chụp mới nhất.' });
    }
    await this.chanKhiDangChay('SAO_LUU_KHO_TEP');
    const soTep = ds.find((b) => b.moc === moc)?.soTep ?? 0;
    await rm(p, { recursive: true, force: true });
    const ngoai = thuMucNgoai();
    const pNgoai = ngoai ? join(ngoai, 'kho-tep', moc) : undefined;
    const xoaNgoai = caBanSaoNgoai && !!pNgoai && existsSync(pNgoai);
    if (xoaNgoai) await rm(pNgoai!, { recursive: true, force: true });
    await emit(this.db, 'van_hanh.sao_luu_xoa', {
      action: 'VAN_HANH_SAO_LUU_XOA',
      actorId: nguoi.id,
      targetLabel: `kho-tep/${moc}`,
      after: { loai: 'KHO_TEP', soTep, caBanSaoNgoai: xoaNgoai },
    });
  }
}
