/**
 * `0092` — kho lưu trữ log: thu gom, nén theo tháng, và bản trích audit.
 *
 * Ba script này chạy bằng `sh` chứ không phải Node, nên bộ kiểm gọi thẳng chúng
 * trên một kho GIẢ và một thư mục tạm. Đổi lại thì kiểm được đúng thứ khó nhất:
 * con trỏ mốc có chống trùng và chống hụt không, và bản nén có đọc lại được
 * không.
 *
 * KHÔNG kiểm `docker compose logs` — nó cần daemon, và một ca kiểm phụ thuộc
 * daemon sẽ đỏ vì lý do chẳng liên quan gì tới thứ nó gác. `COMPOSE_CMD` thay
 * bằng một script giả trả về đúng hình dạng Docker trả về.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const GOC = process.cwd();
let tam: string;
let kho: string;

/** Docker giả: in ra các dòng có dấu thời gian, và tôn trọng `--since`. */
function dungDockerGia(dong: string[]): string {
  const duong = join(tam, 'docker-gia.sh');
  writeFileSync(
    duong,
    `#!/bin/sh
since=""
while [ $# -gt 0 ]; do
  case "$1" in
    --since) since="$2"; shift 2 ;;
    *) shift ;;
  esac
done
cat <<'HET' | awk -v s="$since" '{ if (s == "" || $1 > s) print }'
${dong.join('\n')}
HET
`,
    { mode: 0o755 },
  );
  chmodSync(duong, 0o755);
  return duong;
}

const chay = (script: string, moiTruong: Record<string, string>) =>
  execFileSync('sh', [join(GOC, 'scripts', script)], {
    cwd: GOC,
    env: { ...process.env, ...moiTruong },
    encoding: 'utf8',
  });

beforeEach(() => {
  tam = mkdtempSync(join(tmpdir(), 'csbh-log-'));
  kho = join(tam, 'kho');
  mkdirSync(kho, { recursive: true });
});

afterEach(() => {
  rmSync(tam, { recursive: true, force: true });
});

const thangNay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
}).format(new Date());

const tepLog = () => join(kho, 'logs', 'thu', `thu-${thangNay}.log`);
const dongThat = (): string[] =>
  readFileSync(tepLog(), 'utf8')
    .split('\n')
    .filter((d) => d.startsWith('20'));

describe('`0092` thu gom log — con trỏ mốc', () => {
  it('lượt đầu thu hết, và tệp mang dòng tiêu đề nói rõ quy ước múi giờ', () => {
    const docker = dungDockerGia([
      '2026-08-22T10:00:00.000000001Z dong mot',
      '2026-08-22T10:00:01.000000002Z dong hai',
    ]);
    chay('luu-log.sh', { KHO_LOG: kho, COMPOSE_CMD: `sh ${docker}`, DICH_VU: 'thu' });

    const noi = readFileSync(tepLog(), 'utf8');
    expect(noi).toContain('dong mot');
    expect(noi).toContain('dong hai');
    /*
     * Ranh giới tháng cắt theo giờ Việt Nam còn dấu thời gian từng dòng là UTC.
     * Không nói ra thì người đọc thấy dòng đầu tháng 8 mang nhãn
     * `2026-07-31T17:00:00Z` và tưởng tệp bị lẫn.
     */
    expect(noi).toContain('giờ Việt Nam');
    expect(noi).toContain('UTC');
  });

  it('chạy HAI lượt liền nhau KHÔNG sinh dòng trùng', () => {
    /*
     * `--since` của Docker là "lớn hơn HOẶC BẰNG", nên lưu thẳng mốc của dòng
     * cuối thì lượt sau thu lại đúng dòng ấy. Đo được trên chồng demo trước khi
     * sửa: đúng một dòng trùng ở MỌI service.
     */
    const docker = dungDockerGia([
      '2026-08-22T10:00:00.000000001Z dong mot',
      '2026-08-22T10:00:01.000000002Z dong hai',
    ]);
    const mt = { KHO_LOG: kho, COMPOSE_CMD: `sh ${docker}`, DICH_VU: 'thu' };
    chay('luu-log.sh', mt);
    chay('luu-log.sh', mt);

    const ds = dongThat();
    expect(ds.length, ds.join('\n')).toBe(2);
    expect(new Set(ds).size).toBe(2);
  });

  it('lỡ một lượt rồi chạy bù thì thu ĐỦ khoảng đã lỡ', () => {
    // Đây là vế còn lại của con trỏ: `--since 24h` cố định sẽ mất hẳn phần
    // trước đó, còn con trỏ thì tiếp đúng chỗ dừng dù nghỉ bao lâu.
    const som = dungDockerGia(['2026-08-22T10:00:00.000000001Z dong mot']);
    chay('luu-log.sh', { KHO_LOG: kho, COMPOSE_CMD: `sh ${som}`, DICH_VU: 'thu' });

    const muon = dungDockerGia([
      '2026-08-22T10:00:00.000000001Z dong mot',
      '2026-08-23T10:00:00.000000002Z dong hai',
      '2026-08-24T10:00:00.000000003Z dong ba',
    ]);
    chay('luu-log.sh', { KHO_LOG: kho, COMPOSE_CMD: `sh ${muon}`, DICH_VU: 'thu' });

    const ds = dongThat();
    expect(ds.length).toBe(3);
    expect(ds.filter((d) => d.includes('dong mot')).length, 'dòng cũ bị thu lại').toBe(1);
  });
});

describe('`0092` nén theo tháng', () => {
  const chuanBiThangCu = (thang: string, soDong: number) => {
    const d = join(kho, 'logs', 'thu');
    mkdirSync(d, { recursive: true });
    const dong = Array.from({ length: soDong }, (_, i) => `2026-01-0${(i % 9) + 1}T00:00:00Z dong ${i}`);
    writeFileSync(join(d, `thu-${thang}.log`), `# tiêu đề\n${dong.join('\n')}\n`);
    return join(d, `thu-${thang}.log`);
  };

  it('nén xong tự KIỂM lại, sinh sha256, và ghi manifest', () => {
    const tep = chuanBiThangCu('2026-01', 20);
    const ra = chay('nen-log-thang.sh', { KHO_LOG: kho, THANG_NEN: '2026-01' });

    expect(existsSync(`${tep}.gz`)).toBe(true);
    expect(existsSync(`${tep}.gz.sha256`)).toBe(true);
    expect(existsSync(tep), 'bản chưa nén phải được gỡ sau khi kiểm xong').toBe(false);
    expect(ra).toContain('thu-2026-01.log.gz');

    const manifest = JSON.parse(
      readFileSync(join(kho, 'manifest', '2026-01.json'), 'utf8'),
    ) as { thang: string; mui_gio_cat_ky: string; tep: { ten: string; dong: number }[] };
    expect(manifest.thang).toBe('2026-01');
    // Manifest nói ra CẢ HAI quy ước thời gian — xem ca kiểm dòng tiêu đề ở trên.
    expect(manifest.mui_gio_cat_ky).toBe('Asia/Ho_Chi_Minh');
    expect(manifest.tep[0]!.dong).toBe(21);
  });

  it('TỪ CHỐI nén tháng đang chạy', () => {
    /*
     * Tháng đang chạy còn được `luu-log.sh` ghi thêm vào, nên nén nó là nén một
     * nửa — và bản nửa vời ấy trông y hệt bản đủ cho tới ngày ai đó cần đọc.
     */
    chuanBiThangCu(thangNay, 5);
    expect(() => chay('nen-log-thang.sh', { KHO_LOG: kho, THANG_NEN: thangNay })).toThrow();
    expect(existsSync(join(kho, 'logs', 'thu', `thu-${thangNay}.log`))).toBe(true);
  });
});
