/**
 * `0251` — `./csbh sao-luu [--neu-den-han]` · `sao-luu-tep [--neu-den-han]` theo lịch đã cấu hình.
 *
 * Chạy CHÍNH `scripts/csbh` với `docker` giả (khuôn `csbh-keo-anh.test.ts`). `docker`
 * giả trả lời ba câu SQL mà lệnh hỏi qua ảnh `ops`:
 *   - `ops.den_han` → biến `LICH` ("co 5" / "khong 5"); `LICH` rỗng = CSDL không trả lời
 *   - `INSERT INTO ops.lan_chay … RETURNING id` → 42
 *   - `UPDATE ops.lan_chay …` → ghi lại để đọc kết quả + chi tiết
 * Phép tính "đến hạn" thật nằm ở CSDL và có ca riêng (`tests/db/lich-van-hanh.test.ts`);
 * ở đây chỉ kiểm lệnh shell làm ĐÚNG theo câu trả lời ấy.
 */
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOCKER_GIA = `#!/bin/sh
echo "$*" >> "$NHAT_KY"
case "$*" in
  *"ops psql"*"ops.den_han"*) [ -n "$LICH" ] && echo "$LICH" || exit 2 ;;
  *"ops psql"*"INSERT INTO ops.lan_chay"*) [ -n "$LICH" ] && echo 42 || exit 2 ;;
  *"ops psql"*"UPDATE ops.lan_chay"*) printf '%s\\n' "$*" >> "$NHAT_KY.capnhat" ;;
  *"--entrypoint sh minio"*) [ "\${MC_HONG:-0}" = 1 ] && { echo "mc: <ERROR> mirror hỏng"; exit 1; }; exit 0 ;;
  *" ops backup"*)
    [ "\${BACKUP_HONG:-0}" = 1 ] && { echo "pg_dump: không nối được tới CSDL"; exit 1; }
    echo "backup: xong csbh-20261106T011500Z.dump"; echo "backup: có dấu 'nháy' và \\$csbh_ra\\$ trong đầu ra" ;;
  *) exit 0 ;;
esac
`;

type Kq = { ma: number; ra: string; goi: string; capNhat: string; d: string };

function chay(lenh: string[], dat: Record<string, string> = {}): Promise<Kq> {
  const d = mkdtempSync(join(tmpdir(), 'csbh-lich-'));
  copyFileSync('scripts/csbh', join(d, 'csbh'));
  chmodSync(join(d, 'csbh'), 0o755);
  writeFileSync(join(d, '.env'), 'COMPOSE_PROJECT_NAME=csbh-prod\nCSBH_IMAGE=kho/csbh\n');
  writeFileSync(join(d, 'docker'), DOCKER_GIA);
  chmodSync(join(d, 'docker'), 0o755);
  const nhatKy = join(d, 'goi.log');
  writeFileSync(nhatKy, '');
  const env = { ...process.env, PATH: `${d}:${process.env.PATH}`, NHAT_KY: nhatKy, LICH: '', ...dat };
  return new Promise((ok) => {
    const p = spawn('sh', [join(d, 'csbh'), ...lenh], { cwd: d, env });
    let ra = '';
    p.stdout.on('data', (b) => (ra += b));
    p.stderr.on('data', (b) => (ra += b));
    p.on('close', (ma) =>
      ok({
        ma: ma ?? 1,
        ra,
        goi: readFileSync(nhatKy, 'utf8'),
        capNhat: existsSync(`${nhatKy}.capnhat`) ? readFileSync(`${nhatKy}.capnhat`, 'utf8') : '',
        d,
      }),
    );
  });
}
const goiBackup = (k: Kq) => k.goi.split('\n').filter((l) => l.includes(' ops backup'));

describe('`0251` sao-luu --neu-den-han (cron hỏi mỗi 15 phút)', () => {
  it('CHƯA đến hạn → không sao lưu, không ghi lượt chạy nào', async () => {
    const k = await chay(['sao-luu', '--neu-den-han'], { LICH: 'khong 5' });
    expect(k.ma, k.ra).toBe(0);
    expect(goiBackup(k)).toEqual([]);
    expect(k.goi).not.toContain('INSERT INTO ops.lan_chay');
  });

  it('ĐẾN hạn → sao lưu với SỐ BẢN GIỮ đọc từ cấu hình, ghi lượt tự động THÀNH CÔNG', async () => {
    const k = await chay(['sao-luu', '--neu-den-han'], { LICH: 'co 5' });
    expect(k.ma, k.ra).toBe(0);
    expect(goiBackup(k)).toHaveLength(1);
    expect(goiBackup(k)[0]).toContain('-e GIU_TOI_DA=5 ops backup');
    expect(k.goi).toMatch(/INSERT INTO ops\.lan_chay \(viec, tu_dong\) VALUES \('SAO_LUU_CSDL', true\)/);
    expect(k.capNhat).toContain("ket_qua = 'THANH_CONG'");
    expect(k.capNhat).toContain('WHERE id = 42');
  });

  it('chi tiết lượt chạy mang đuôi đầu ra — kể cả dấu nháy và chính chuỗi bao', async () => {
    const k = await chay(['sao-luu', '--neu-den-han'], { LICH: 'co 5' });
    expect(k.capNhat).toContain('backup: xong csbh-20261106T011500Z.dump');
    expect(k.capNhat).toContain("có dấu 'nháy'");
  });

  it('sao lưu HỎNG → thoát lỗi để cron ghi log, lượt chạy ghi LOI kèm câu lỗi', async () => {
    const k = await chay(['sao-luu', '--neu-den-han'], { LICH: 'co 5', BACKUP_HONG: '1' });
    expect(k.ma).not.toBe(0);
    expect(k.capNhat).toContain("ket_qua = 'LOI'");
    expect(k.capNhat).toContain('pg_dump: không nối được tới CSDL');
  });

  it('CSDL không trả lời, NGOÀI giờ mặc định 01:15 → không chạy, có cảnh báo', async () => {
    const k = await chay(['sao-luu', '--neu-den-han'], { LICH: '', CSBH_GIO_VN: '0930' });
    expect(k.ma, k.ra).toBe(0);
    expect(goiBackup(k)).toEqual([]);
    expect(k.ra).toContain('không đọc được lịch từ CSDL');
  });

  it.each(['0115', '0120', '0129'])(
    'CSDL không trả lời, trong 15 phút từ giờ mặc định (%s) → VẪN sao lưu, giữ 7 bản mặc định',
    async (gio) => {
      const k = await chay(['sao-luu', '--neu-den-han'], { LICH: '', CSBH_GIO_VN: gio });
      expect(goiBackup(k)).toHaveLength(1);
      expect(goiBackup(k)[0]).toContain('-e GIU_TOI_DA=7 ops backup');
    },
  );

  it.each(['0114', '0130'])('CSDL không trả lời, ngay ngoài cửa sổ (%s) → không chạy', async (gio) => {
    const k = await chay(['sao-luu', '--neu-den-han'], { LICH: '', CSBH_GIO_VN: gio });
    expect(goiBackup(k)).toEqual([]);
  });

  it('giờ mặc định có số 08/09 (bát phân) vẫn tính đúng', async () => {
    // `phut_cua` dùng `expr`: `$(( 08 * 60 ))` là lỗi cú pháp trong sh.
    const k = await chay(['sao-luu', '--neu-den-han'], { LICH: '', CSBH_GIO_VN: '0809' });
    expect(k.ra).not.toMatch(/bad number|value too great|arithmetic/i);
    expect(goiBackup(k)).toEqual([]);
  });
});

describe('`0251` sao-luu (gõ tay)', () => {
  it('chạy NGAY dù chưa tới hạn, với số bản từ cấu hình, ghi lượt KHÔNG tự động', async () => {
    const k = await chay(['sao-luu'], { LICH: 'khong 9' });
    expect(k.ma, k.ra).toBe(0);
    expect(goiBackup(k)[0]).toContain('-e GIU_TOI_DA=9 ops backup');
    expect(k.goi).toMatch(/VALUES \('SAO_LUU_CSDL', false\)/);
  });

  it('CSDL không trả lời → vẫn sao lưu với mặc định', async () => {
    const k = await chay(['sao-luu'], { LICH: '' });
    expect(goiBackup(k)[0]).toContain('-e GIU_TOI_DA=7 ops backup');
  });

  it('tham số lạ → từ chối, không làm gì', async () => {
    const k = await chay(['sao-luu', '--neu-den'], { LICH: 'co 5' });
    expect(k.ma).toBe(2);
    expect(goiBackup(k)).toEqual([]);
  });
});

describe('`0251` sao-luu-tep theo lịch', () => {
  it('đến hạn → chụp ở cả hai nơi với GIU đọc từ cấu hình kho tệp', async () => {
    const k = await chay(['sao-luu-tep', '--neu-den-han'], { LICH: 'co 4', CSBH_MOC: '20261106T020000Z' });
    expect(k.ma, k.ra).toBe(0);
    expect(k.goi).toContain("ops.den_han('SAO_LUU_KHO_TEP'");
    expect(k.goi).toContain('GIU=4 MOC=20261106T020000Z');
    expect(k.goi).toContain('chuyen-may ban-ke /backup/kho-tep/20261106T020000Z');
  });

  it('chụp HỎNG ở bước giữa mà bước kiểm cuối vẫn chạy được → vẫn là LOI, thoát lỗi', async () => {
    // Bẫy `set -e` trong điều kiện `if`: thân hàm chạy tiếp qua bước hỏng, bước cuối
    // (kê bản chụp) thành công, và lượt hỏng bị ghi THÀNH CÔNG.
    const k = await chay(['sao-luu-tep', '--neu-den-han'], { LICH: 'co 4', MC_HONG: '1' });
    expect(k.ma).not.toBe(0);
    expect(k.capNhat).toContain("ket_qua = 'LOI'");
    expect(k.goi).not.toContain('chuyen-may ban-ke');
  });

  it('chưa đến hạn → không chụp', async () => {
    const k = await chay(['sao-luu-tep', '--neu-den-han'], { LICH: 'khong 4' });
    expect(k.goi).not.toContain('GOC=/backup/kho-tep');
  });
});

describe('`0251` hai việc sao lưu không chạy chồng nhau', () => {
  it('khoá đang bị giữ → lượt sau bỏ qua ngay, không hỏi CSDL, không sao lưu', async () => {
    const d0 = await chay(['phien-ban']);
    // giữ khoá ở CHÍNH thư mục bộ cài của lượt sau
    const giu = spawn('flock', [join(d0.d, '.khoa-sao-luu'), 'sleep', '5']);
    await new Promise((r) => setTimeout(r, 300));
    try {
      copyFileSync('scripts/csbh', join(d0.d, 'csbh'));
      const nhatKy = join(d0.d, 'goi.log');
      writeFileSync(nhatKy, '');
      const p = spawnSync('sh', [join(d0.d, 'csbh'), 'sao-luu', '--neu-den-han'], {
        cwd: d0.d,
        env: { ...process.env, PATH: `${d0.d}:${process.env.PATH}`, NHAT_KY: nhatKy, LICH: 'co 5' },
        encoding: 'utf8',
      });
      expect(p.status).toBe(0);
      expect(p.stdout).toContain('một lượt sao lưu khác đang chạy');
      expect(readFileSync(nhatKy, 'utf8')).not.toContain('ops.den_han');
    } finally {
      giu.kill();
    }
  });
});

describe('`0251` lịch cron', () => {
  const cron = readFileSync('deploy/cron/csbh.cron', 'utf8');
  const csbh = readFileSync('scripts/csbh', 'utf8');
  const lenhCron = [...cron.matchAll(/^[^#\n].*\.\/csbh ([a-z-]+)/gm)].map((m) => m[1]!);

  it('mỗi lệnh cron gọi là một lệnh con CÓ THẬT của ./csbh — gõ sai tên thì cron im lặng không làm gì', () => {
    expect(lenhCron.length).toBeGreaterThan(0);
    for (const l of lenhCron) expect(csbh, l).toMatch(new RegExp(`^  ${l}\\)`, 'm'));
  });

  it('hai việc sao lưu hỏi mỗi 15 phút với --neu-den-han; không còn giờ cứng', () => {
    expect(cron).toMatch(/^\*\/15 \* \* \* \* .*\.\/csbh sao-luu --neu-den-han/m);
    expect(cron).toMatch(/^\*\/15 \* \* \* \* .*\.\/csbh sao-luu-tep --neu-den-han/m);
    expect(cron).not.toMatch(/^\d+ \d+ \* \* \* .*\.\/csbh sao-luu\b/m);
  });

  it('không còn dòng dọn dữ liệu (sla-worker tự chạy theo lịch) hay trích kiểm toán (đã gỡ)', () => {
    expect(lenhCron).not.toContain('don-du-lieu');
    expect(lenhCron).not.toContain('luu-audit');
  });
});
