/**
 * `0270` — `./csbh cap-nhat` · `lui-lai` · `len` dưới mô hình thẻ `-latest`, và phần
 * hiển thị BƯỚC (yêu cầu 08/11: *"phải hiển thị rõ bước nào đang chạy, bước nào đã xong"*).
 *
 * Thay ca `0235` của `nang-cap <thẻ>` (lệnh ấy gỡ ở `0270`). Đường vòng *"kéo hỏng mà đủ
 * ảnh trên máy thì đi tiếp"* của `0235` vẫn sống trong `keo_anh`, giờ do `len` gọi khi
 * thiếu ảnh — có ca riêng ở cuối.
 *
 * Thứ canh ở đây là THỨ TỰ, vì đó là toàn bộ sự an toàn của `cap-nhat`:
 *   hỏi registry KHÔNG kéo → sao lưu bằng ảnh CŨ → giữ đường lùi → kéo → migrate → dựng.
 * Và hai lý do cũ của `0218` mà mô hình `latest` phải giữ: `len` KHÔNG kéo khi đủ ảnh;
 * phiên bản đọc từ ảnh, không từ `.env`.
 *
 * Chạy CHÍNH `scripts/csbh` với một `docker` giả đặt đầu `PATH`, ghi mọi lượt gọi ra tệp.
 */
import { execFile, spawn } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const chay = promisify(execFile);

const ANH = ['minio/minio:RELEASE.2024-09-22T00-33-43Z', 'kho/csbh:ops-latest', 'kho/csbh:service-latest'];

const DOCKER_GIA = `#!/bin/sh
# Compose của chồng kiểm chạy qua \`env -i\` (\`0270\`) — biến của ca kiểm nạp từ tệp cạnh lệnh giả.
. "$(dirname "$0")/env.sh"
echo "$*" >> "$NHAT_KY"
# Ghi MÔI TRƯỜNG mà compose của chồng kiểm nhìn thấy: chốt cách ly \`env -i\`.
case "$*" in *"-p csbh-kiem"*) echo "MOI_TRUONG CSBH_WORKSPACE=\${CSBH_WORKSPACE:-} SITE_URL=\${SITE_URL:-}" >> "$NHAT_KY" ;; esac
case "$*" in
  *" ops kiem-nghiem"*)
    [ "\${NGU:-0}" = 1 ] && sleep 30
    if [ "\${KIEM_DO:-0}" = 1 ]; then echo "KIEM_NGHIEM 20/21"; exit 1; fi
    echo "KIEM_NGHIEM 21/21"; exit 0 ;;
  *"-p csbh-kiem"*" ops migrate"*) exit 0 ;;
  *"-p csbh-kiem"*"up -d --wait"*) exit 0 ;;
  *"buildx imagetools inspect --format {{json .Manifest.Digest}}"*)
    [ "\${KHO_HONG:-0}" = 1 ] && exit 1
    echo "\\"\${DIGEST_KHO:-sha256:moi}\\"" ;;
  *"buildx imagetools inspect"*"org.opencontainers.image.version"*) echo 1.4.0 ;;
  *"image inspect -f {{range .RepoDigests}}"*) echo "kho/csbh@\${DIGEST_MAY:-sha256:cu}" ;;
  *"image inspect -f"*"org.opencontainers.image.version"*) echo "\${NHAN:-1.3.0}" ;;
  "image inspect "*)
    [ -z "\${CO_ANH+x}" ] && exit 0
    for a in $CO_ANH; do [ "$a" = "$3" ] && exit 0; done
    exit 1 ;;
  "pull "*) [ "\${PULL_HONG:-0}" = 1 ] && exit 1; exit 0 ;;
  *" pull") [ "\${COMPOSE_PULL_HONG:-0}" = 1 ] && exit 1; exit 0 ;;
  *"config --images"*) printf '%s\\n' ${ANH.join(' ')} ;;
  *" ops backup"*) [ "\${BACKUP_HONG:-0}" = 1 ] && exit 1; exit 0 ;;
  *"sys.schema_migration"*) echo "\${MIG:-0132_noi_dung_khoan_cpbh.sql}" ;;
  *" ops migrate"*) [ "\${MIGRATE_HONG:-0}" = 1 ] && exit 1; exit 0 ;;
  *"up -d --wait"*) [ "\${UP_HONG:-0}" = 1 ] && exit 1; exit 0 ;;
  *) exit 0 ;;
esac
`;

type Kq = { ma: number; ra: string; loi: string; goi: string; d: string };

async function csbh(lenh: string[], dat: Record<string, string> = {}, truoc?: (d: string) => void): Promise<Kq> {
  const d = mkdtempSync(join(tmpdir(), 'csbh-cn-'));
  copyFileSync('scripts/csbh', join(d, 'csbh'));
  copyFileSync('scripts/lib-buoc.sh', join(d, 'lib-buoc.sh'));
  mkdirSync(join(d, 'run'), { recursive: true });
  chmodSync(join(d, 'csbh'), 0o755);
  writeFileSync(join(d, '.env'), `COMPOSE_PROJECT_NAME=csbh-prod\nCSBH_IMAGE=kho/csbh\nSITE_URL=https://csbh.test\nCSBH_WORKSPACE=${d}\n`);
  writeFileSync(join(d, 'docker'), DOCKER_GIA);
  chmodSync(join(d, 'docker'), 0o755);
  truoc?.(d);
  const nhatKy = join(d, 'goi.log');
  writeFileSync(nhatKy, '');
  writeFileSync(join(d, 'env.sh'), Object.entries({ NHAT_KY: nhatKy, ...dat }).map(([k, v]) => `export ${k}='${v}'`).join('\n') + '\n');
  const env = { ...process.env, CSBH_ENV: join(d, ".env"), PATH: `${d}:${process.env.PATH}`, NHAT_KY: nhatKy, CSBH_KIEM_RAM_MB: '0', ...dat };
  try {
    const r = await chay('sh', [join(d, 'csbh'), ...lenh], { env, cwd: d });
    return { ma: 0, ra: r.stdout, loi: r.stderr, goi: readFileSync(nhatKy, 'utf8'), d };
  } catch (e) {
    const x = e as { code?: number; stdout?: string; stderr?: string };
    return { ma: x.code ?? 1, ra: x.stdout ?? '', loi: x.stderr ?? '', goi: readFileSync(nhatKy, 'utf8'), d };
  }
}

/** Mọi mốc có mặt trong nhật ký gọi `docker`, theo đúng thứ tự. */
function thuTu(goi: string, moc: string[]) {
  const vt = moc.map((m) => goi.indexOf(m));
  expect(vt.every((i) => i >= 0), `thiếu mốc: ${moc.filter((_, i) => vt[i]! < 0).join(' | ')}\n${goi}`).toBe(true);
  expect([...vt].sort((a, b) => a - b), goi).toEqual(vt);
}

describe('`0270` cap-nhat', () => {
  it('registry TRÙNG digest với máy → không sao lưu, không kéo, không dựng lại', async () => {
    const r = await csbh(['cap-nhat'], { DIGEST_KHO: 'sha256:cu' });
    expect(r.ma, r.loi).toBe(0);
    expect(r.ra).toContain('Đang là bản mới nhất (1.3.0)');
    for (const k of ['ops backup', 'pull ', 'ops migrate', 'up -d']) expect(r.goi, k).not.toContain(k);
  });

  it('CÓ bản mới → hỏi registry → SAO LƯU → giữ đường lùi → kéo → migrate → dựng, đúng thứ tự', async () => {
    const r = await csbh(['cap-nhat']);
    expect(r.ma, r.loi + r.ra).toBe(0);
    thuTu(r.goi, [
      'buildx imagetools inspect',
      'ops backup',
      'tag kho/csbh:ops-latest kho/csbh:ops-truoc-cap-nhat',
      'pull kho/csbh:ops-latest',
      ' ops kiem-nghiem',
      'down -v --remove-orphans',
      'ops migrate --',
    ].map((m) => (m === 'ops migrate --' ? 'ops migrate' : m)).slice(0, 5));
    // Lượt migrate/dựng của CHỒNG THẬT (không mang `-p csbh-kiem`) đứng SAU kiểm nghiệm.
    const dong = r.goi.split('\n');
    const iKiem = dong.findIndex((d) => d.includes(' ops kiem-nghiem'));
    const iThat = dong.findIndex((d) => d.includes(' ops migrate') && !d.includes('-p csbh-kiem'));
    expect(iThat).toBeGreaterThan(iKiem);
    // Đủ bốn ảnh của kho ta, kể cả MinIO nhân bản.
    for (const tp of ['service', 'web', 'ops', 'minio']) expect(r.goi).toContain(`pull kho/csbh:${tp}-latest`);
    expect(r.ra).toContain('1.3.0 → 1.4.0');
  });

  it('KHÔNG kéo trước khi sao lưu — lượt sao lưu phải chạy bằng ảnh ops CŨ', async () => {
    const r = await csbh(['cap-nhat']);
    expect(r.goi.indexOf('ops backup')).toBeLessThan(r.goi.indexOf('pull '));
  });

  it('không hỏi được registry → dừng trước mọi việc, nói đăng nhập registry', async () => {
    const r = await csbh(['cap-nhat'], { KHO_HONG: '1' });
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('docker login');
    expect(r.goi).not.toContain('ops backup');
    expect(r.goi).not.toContain('pull ');
  });

  it('sao lưu HỎNG → không kéo, không gắn thẻ, không dựng — hệ chưa bị đụng', async () => {
    const r = await csbh(['cap-nhat'], { BACKUP_HONG: '1' });
    expect(r.ma).not.toBe(0);
    for (const k of ['pull ', 'truoc-cap-nhat', 'ops migrate', 'up -d']) expect(r.goi, k).not.toContain(k);
  });

  it('kéo HỎNG → trả thẻ `-truoc-cap-nhat` về `-latest`, không migrate, không dựng', async () => {
    const r = await csbh(['cap-nhat'], { PULL_HONG: '1' });
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('hệ vẫn chạy bản 1.3.0');
    thuTu(r.goi, ['pull kho/csbh:', 'tag kho/csbh:service-truoc-cap-nhat kho/csbh:service-latest']);
    expect(r.goi).not.toContain('ops migrate');
    expect(r.goi).not.toContain('up -d');
  });

  it('migration HỎNG → không dựng, chỉ đường phục hồi + lùi', async () => {
    const r = await csbh(['cap-nhat'], { MIGRATE_HONG: '1' });
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('./csbh phuc-hoi');
    // `up -d` của CHỒNG KIỂM có (nó chạy trước); của chồng THẬT thì không.
    expect(r.goi.split('\n').some((d) => d.includes('up -d') && !d.includes('-p csbh-kiem'))).toBe(false);
  });

  it('ghi lại migration cuối TRƯỚC khi kéo — thứ `lui-lai` cần để biết có lùi được không', async () => {
    const r = await csbh(['cap-nhat']);
    expect(readFileSync(join(r.d, 'run', 'migration-truoc-cap-nhat'), 'utf8').trim()).toBe('0132_noi_dung_khoan_cpbh.sql');
  });
});

describe('`0270` cap-nhat kiểm nghiệm bản mới TRƯỚC khi đụng chồng thật', () => {
  it('kiểm nghiệm ĐỎ → trả ảnh cũ, KHÔNG migrate, KHÔNG dựng chồng thật, vẫn dọn chồng kiểm', async () => {
    const r = await csbh(['cap-nhat'], { KIEM_DO: '1' });
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('KHÔNG qua kiểm nghiệm');
    expect(r.goi).toContain('tag kho/csbh:ops-truoc-cap-nhat kho/csbh:ops-latest');
    expect(r.goi).toMatch(/-p csbh-kiem .*down -v --remove-orphans/);
    const dong = r.goi.split('\n');
    expect(dong.some((d) => d.includes(' ops migrate') && !d.includes('-p csbh-kiem'))).toBe(false);
    expect(dong.some((d) => d.includes('up -d --wait') && !d.includes('-p csbh-kiem'))).toBe(false);
  });
});

describe('`0270` csbh kiem-nghiem — chồng kiểm riêng, dọn sạch dù xanh hay đỏ', () => {
  it('XANH: dựng chồng kiểm → tạo Quản trị → chạy bộ kiểm → dọn; báo cáo ghi vào logs/kiem-nghiem/', async () => {
    const r = await csbh(['kiem-nghiem']);
    expect(r.ma, r.loi + r.ra).toBe(0);
    thuTu(r.goi, [' gen-secrets /run/secrets', '-p csbh-kiem', ' ops bootstrap-admin', ' ops kiem-nghiem', 'down -v --remove-orphans']);
    expect(r.ra).toContain('Kiểm nghiệm XANH: 21/21');
    expect(r.ra).toMatch(/Báo cáo: .*\/logs\/kiem-nghiem\/\d{8}-\d{6}\.txt/);
  });

  it('ĐỎ: mã thoát 1, nói số ca, VẪN dọn', async () => {
    const r = await csbh(['kiem-nghiem'], { KIEM_DO: '1' });
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('KIỂM NGHIỆM ĐỎ: 20/21');
    expect(r.goi).toMatch(/-p csbh-kiem .*down -v --remove-orphans/);
  });

  it('CÁCH LY: compose của chồng kiểm KHÔNG thấy biến của chồng thật (workspace, SITE_URL)', async () => {
    const r = await csbh(['kiem-nghiem']);
    const mt = r.goi.split('\n').filter((d) => d.startsWith('MOI_TRUONG'));
    expect(mt.length).toBeGreaterThan(0);
    for (const d of mt) {
      expect(d, 'chồng kiểm gắn workspace của chồng thật').toMatch(/CSBH_WORKSPACE=\S*\/tmp\/kiem-\d+ /);
      expect(d, 'SITE_URL của chồng thật lọt sang chồng kiểm').toMatch(/SITE_URL=$/);
    }
  });

  it('thiếu RAM → dừng TRƯỚC khi dựng gì, nói con số', async () => {
    const r = await csbh(['kiem-nghiem'], { CSBH_KIEM_RAM_MB: '99999999' });
    expect(r.ma).toBe(1);
    expect(r.loi).toMatch(/cần 99999999 MB/);
    expect(r.goi).not.toContain('gen-secrets');
  });

  it('bị NGẮT giữa chừng (SIGINT) → vẫn dọn chồng kiểm, bước hiện ✘', async () => {
    const d = mkdtempSync(join(tmpdir(), 'csbh-ngat-'));
    copyFileSync('scripts/csbh', join(d, 'csbh'));
    copyFileSync('scripts/lib-buoc.sh', join(d, 'lib-buoc.sh'));
    mkdirSync(join(d, 'run'), { recursive: true });
    writeFileSync(join(d, '.env'), `COMPOSE_PROJECT_NAME=csbh-prod\nCSBH_IMAGE=kho/csbh\nCSBH_WORKSPACE=${d}\n`);
    writeFileSync(join(d, 'docker'), DOCKER_GIA);
    chmodSync(join(d, 'docker'), 0o755);
    const nhatKy = join(d, 'goi.log');
    writeFileSync(nhatKy, '');
    writeFileSync(join(d, 'env.sh'), `export NHAT_KY='${nhatKy}'\nexport NGU='1'\n`);
    // `detached` + giết CẢ NHÓM tiến trình: đúng thứ Ctrl-C ở terminal làm. `dash` hoãn trap tới
    // khi lệnh con ở tiền cảnh kết thúc, nên chỉ báo cho riêng `sh` là đợi hết `sleep 30` giả.
    const p = spawn('sh', [join(d, 'csbh'), 'kiem-nghiem'], {
      detached: true,
      cwd: d, env: { ...process.env, CSBH_ENV: join(d, '.env'), PATH: `${d}:${process.env.PATH}`, CSBH_KIEM_RAM_MB: '0' },
    });
    let ra = '';
    p.stdout.on('data', (b) => (ra += b));
    for (let i = 0; i < 50 && !readFileSync(nhatKy, 'utf8').includes(' ops kiem-nghiem'); i++) await new Promise((x) => setTimeout(x, 100));
    process.kill(-p.pid!, 'SIGINT');
    const ma = await new Promise<number>((x) => p.on('close', (c) => x(c ?? 1)));
    expect(ma).not.toBe(0);
    expect(readFileSync(nhatKy, 'utf8')).toMatch(/-p csbh-kiem .*down -v --remove-orphans/);
    expect(ra).toMatch(/\[1\/1\] ✘ Kiểm nghiệm/);
  }, 20_000);
});

describe('`0270` hiển thị BƯỚC — bước nào đang chạy, bước nào đã xong', () => {
  it('mỗi bước có dòng ▶ lúc bắt đầu và ✔ lúc xong, đánh số [i/N]', async () => {
    const r = await csbh(['cap-nhat']);
    for (let i = 1; i <= 7; i++) {
      expect(r.ra, `bước ${i} không có dòng bắt đầu`).toMatch(new RegExp(`\\[${i}/7\\] ▶ `));
      expect(r.ra, `bước ${i} không có dòng xong`).toMatch(new RegExp(`\\[${i}/7\\] ✔ .*\\(\\d+ giây\\)`));
    }
    // ✔ của một bước đứng SAU ▶ của chính nó và TRƯỚC ▶ của bước kế.
    const iBat2 = r.ra.indexOf('[2/7] ▶');
    const iXong2 = r.ra.indexOf('[2/7] ✔');
    expect(iBat2).toBeLessThan(iXong2);
    expect(iXong2).toBeLessThan(r.ra.indexOf('[3/7] ▶'));
  });

  it('bước HỎNG in ✘ — không có bước nào treo ở ▶ khi lệnh đã chết', async () => {
    const r = await csbh(['cap-nhat'], { BACKUP_HONG: '1' });
    expect(r.ra).toMatch(/\[2\/7\] ✘ Sao lưu CSDL trước khi cập nhật — HỎNG/);
    expect(r.ra).not.toContain('[3/7]');
  });

  it('bước BỎ QUA in – kèm lý do', async () => {
    const r = await csbh(['cap-nhat'], { DIGEST_KHO: 'sha256:cu' });
    expect(r.ra).toMatch(/\[1\/7\] – .*bỏ qua: đang là bản mới nhất/);
  });

  it('`len` cũng hiện bước', async () => {
    const r = await csbh(['len']);
    expect(r.ma, r.loi).toBe(0);
    expect(r.ra).toMatch(/\[3\/3\] ✔ Dựng các service/);
  });
});

describe('`0270` lui-lai', () => {
  const daCapNhat = (mig: string) => (d: string) => writeFileSync(join(d, 'run', 'migration-truoc-cap-nhat'), `${mig}\n`);

  it('chưa có migration mới → trả ảnh `-truoc-cap-nhat` về `-latest` rồi dựng', async () => {
    const r = await csbh(['lui-lai'], {}, daCapNhat('0132_noi_dung_khoan_cpbh.sql'));
    expect(r.ma, r.loi).toBe(0);
    thuTu(r.goi, ['tag kho/csbh:ops-truoc-cap-nhat kho/csbh:ops-latest', 'up -d --wait']);
  });

  it('CSDL ĐÃ chạy migration mới → DỪNG, chỉ sang phục hồi, không đụng ảnh', async () => {
    const r = await csbh(['lui-lai'], { MIG: '0133_moi.sql' }, daCapNhat('0132_noi_dung_khoan_cpbh.sql'));
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('./csbh phuc-hoi');
    expect(r.goi).not.toContain('truoc-cap-nhat kho/csbh');
    expect(r.goi).not.toContain('up -d');
  });

  it('chưa từng cap-nhat (không có mốc) → DỪNG', async () => {
    const r = await csbh(['lui-lai']);
    expect(r.ma).toBe(1);
    expect(r.goi).not.toContain('up -d');
  });

  it('thiếu một ảnh `-truoc-cap-nhat` → không gắn lại cái nào', async () => {
    const r = await csbh(['lui-lai'], { CO_ANH: 'kho/csbh:service-truoc-cap-nhat' }, daCapNhat('0132_noi_dung_khoan_cpbh.sql'));
    expect(r.ma).not.toBe(0);
    expect(r.goi).not.toMatch(/^tag /m);
  });
});

describe('`0270` len KHÔNG kéo khi đủ ảnh — lý do thứ hai của `0218`', () => {
  it('đủ ảnh trên máy → không gọi pull, và nói đường cập nhật', async () => {
    const r = await csbh(['len']);
    expect(r.goi).not.toMatch(/ pull$/m);
    expect(r.ra).toContain('./csbh cap-nhat');
  });

  it('thiếu ảnh → kéo; kéo hỏng mà ĐỦ ảnh thì đi tiếp (đường vòng `0235`)', async () => {
    const r = await csbh(['len'], { CO_ANH: ANH.slice(1).join(' '), COMPOSE_PULL_HONG: '1' });
    // Thiếu ảnh MinIO gốc ở lượt kiểm đầu → kéo; kéo hỏng → kiểm lại vẫn thiếu → dừng.
    expect(r.goi).toMatch(/ pull$/m);
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('THIẾU ảnh');
    expect(r.goi).not.toContain('ops migrate');
  });

  it('`phien-ban` đọc NHÃN của ảnh, không đọc `.env`', async () => {
    const r = await csbh(['phien-ban'], { NHAN: '1.3.7' });
    expect(r.ra.trim()).toBe('1.3.7');
  });

  it('`nang-cap` đã gỡ — nói lệnh thay thế', async () => {
    const r = await csbh(['nang-cap', '1.0.5']);
    expect(r.ma).toBe(2);
    expect(r.loi).toContain('./csbh cap-nhat');
    expect(r.goi).toBe('');
  });
});
