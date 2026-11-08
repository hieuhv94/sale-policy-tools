/**
 * `0246` — `./csbh xuat-chuyen-may` · `nhap-chuyen-may` · `sao-luu-tep`: phần ĐIỀU
 * PHỐI. Phần làm việc thật (bảng kê, mã hoá, gói) có ca riêng trên Postgres và
 * openssl thật ở `tests/db/chuyen-may.test.ts`; ở đây canh THỨ TỰ và các CHỐT
 * CHẶN — những thứ mà làm sai thì dữ liệu mất mà không lệnh nào báo lỗi:
 *
 *   - chặn lối vào → xả sự kiện → mới dừng service → mới chụp;
 *   - xả không xong thì KHÔNG xuất gì;
 *   - mật khẩu không bao giờ nằm trên dòng lệnh;
 *   - nhập chỉ chạy trên bộ cài trống, cùng phiên bản, chưa có CSDL;
 *   - ĐỐI CHIẾU trước khi bật phần mềm, lệch thì không bật.
 *
 * Chạy CHÍNH `scripts/csbh` với một `docker` giả đặt đầu `PATH` (lối
 * `csbh-keo-anh.test.ts`). Bản giả biết ghi tệp vào thư mục gắn ở `/ra`, để
 * đường nhập đi được tới cuối.
 */
import { spawn } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOCKER_GIA = `#!/bin/sh
echo "$*" >> "$NHAT_KY"
ra=""; prev=""
for a in "$@"; do
  [ "$prev" = "-v" ] && case "$a" in *:/ra) ra="\${a%:/ra}" ;; esac
  prev="$a"
done
case "$*" in
  *"chuyen-may cho-xa"*) echo "\${CHO_XA:-0}" ;;
  *"rabbitmqctl"*) echo "\${HANG_DOI:-0}" ;;
  *"chuyen-may bi-mat-mo"*)
    [ "\${BI_MAT_MA:-0}" = 0 ] || { echo "bi-mat-mo: SAI mật khẩu, hoặc gói bí mật hỏng." >&2; exit 1; }
    mkdir -p "$ra/bi-mat/secrets"
    printf 'COMPOSE_PROJECT_NAME=csbh-prod\\nCSBH_IMAGE=kho/csbh\\nSITE_URL=https://csbh.test\\nCSBH_WORKSPACE=%s\\n' "$WS_GIA" > "$ra/bi-mat/.env"
    echo x > "$ra/bi-mat/secrets/pg_password.txt" ;;
  *"chuyen-may mo-goi"*)
    mkdir -p "$ra/goi/tep" "$ra/goi/logarchive"
    printf '%s=%s\\n' "\${KHOA_GOI:-PHIEN_BAN}" "\${TAG_GOI:-1.1.0}" > "$ra/goi/thong-tin.txt" ;;
  # \`0270\`: phiên bản của ảnh trên máy đọc từ NHÃN OCI.
  *"image inspect -f"*"org.opencontainers.image.version"*) echo "\${NHAN_MAY:-1.1.0}" ;;
  "pull "*) [ "\${PULL_HONG:-0}" = 1 ] && exit 1; exit 0 ;;
  *"chuyen-may so-sanh"*) exit "\${SO_SANH_MA:-0}" ;;
  "volume inspect "*) exit "\${CO_VOLUME:-1}" ;;
  *) exit 0 ;;
esac
`;

type KetQua = { ma: number; ra: string; loi: string; goi: string; d: string; ws: string; envTep: string };

/**
 * `0270`: BA chỗ — chương trình `d/` (csbh · lib-buoc.sh · csbh.env.mau), tệp cấu hình
 * `d/etc/csbh.env` (`CSBH_ENV`), workspace `d/ws`. Lệnh nhập tạo thư mục tạm dưới
 * `TMPDIR` (= `d/tmp-he`) — ca đầu đòi nó sạch sau lượt chạy.
 */
async function chay(lenh: string[], vao: string, o: { env?: string; dat?: Record<string, string> } = {}): Promise<KetQua> {
  const d = mkdtempSync(join(tmpdir(), 'csbh-cm-'));
  const ws = join(d, 'ws');
  const envTep = join(d, 'etc', 'csbh.env');
  copyFileSync('scripts/csbh', join(d, 'csbh'));
  copyFileSync('scripts/lib-buoc.sh', join(d, 'lib-buoc.sh'));
  chmodSync(join(d, 'csbh'), 0o755);
  writeFileSync(join(d, 'csbh.env.mau'), 'COMPOSE_PROJECT_NAME=csbh-prod\nCSBH_IMAGE=kho/csbh\n');
  mkdirSync(join(d, 'etc'), { recursive: true });
  mkdirSync(join(d, 'tmp-he'), { recursive: true });
  if (o.env !== undefined) {
    writeFileSync(envTep, `${o.env}CSBH_WORKSPACE=${ws}\n`);
    mkdirSync(join(ws, 'secrets'), { recursive: true });
    writeFileSync(join(ws, 'secrets', 'pg_password.txt'), 'x');
  }
  writeFileSync(join(d, 'docker'), DOCKER_GIA);
  chmodSync(join(d, 'docker'), 0o755);
  const nhatKy = join(d, 'goi.log');
  writeFileSync(nhatKy, '');
  for (const t of ['goi.tar', 'bi-mat.enc']) writeFileSync(join(d, t), 'x');
  const env = {
    ...process.env, PATH: `${d}:${process.env.PATH}`, NHAT_KY: nhatKy, CSBH_CHO_XA_GIAY: '0',
    CSBH_ENV: envTep, WS_GIA: ws, TMPDIR: join(d, 'tmp-he'), ...o.dat,
  };
  return new Promise((ok) => {
    const p = spawn('sh', [join(d, 'csbh'), ...lenh], { cwd: d, env });
    let ra = '';
    let loi = '';
    p.stdout.on('data', (b) => (ra += b));
    p.stderr.on('data', (b) => (loi += b));
    p.on('close', (ma) => ok({ ma: ma ?? 1, ra, loi, goi: readFileSync(nhatKy, 'utf8'), d, ws, envTep }));
    p.stdin.end(vao);
  });
}

const ENV_CU = 'COMPOSE_PROJECT_NAME=csbh-prod\nCSBH_IMAGE=kho/csbh\nSITE_URL=https://csbh.test\n';
const MK = 'mat-khau-du-dai';
const xuat = (vao: string, dat: Record<string, string> = {}) => chay(['xuat-chuyen-may'], vao, { env: ENV_CU, dat });
const nhap = (dat: Record<string, string> = {}, env?: string) =>
  chay(['nhap-chuyen-may', 'goi.tar', 'bi-mat.enc'], `${MK}\n`, { ...(env === undefined ? {} : { env }), dat });

/** Vị trí từng mốc trong nhật ký gọi `docker` — đòi có mặt và tăng dần. */
function thuTu(goi: string, moc: string[]) {
  const vt = moc.map((m) => goi.indexOf(m));
  expect(vt.every((i) => i >= 0), `thiếu mốc: ${moc.filter((_, i) => vt[i]! < 0).join(' | ')}\n${goi}`).toBe(true);
  expect([...vt].sort((a, b) => a - b), goi).toEqual(vt);
}

describe('`0246` xuat-chuyen-may', () => {
  it('chặn lối vào → xả → dừng service → CSDL → kho tệp → bảng kê → gói → bí mật', async () => {
    const r = await xuat(`CHUYEN-MAY\n${MK}\n${MK}\n`);
    expect(r.ma, r.loi).toBe(0);
    thuTu(r.goi, [
      'stop caddy gateway sla-worker',
      'chuyen-may cho-xa',
      'rabbitmqctl --silent list_queues messages',
      'stop identity catalog customer policy document notification audit reporting van-hanh',
      'chuyen-may xuat-csdl /xuat',
      'mc mirror --quiet l /xuat/tep',
      'chuyen-may ban-ke /xuat',
      'chuyen-may dong-goi /ra/goi',
      'chuyen-may bi-mat-dong /cai',
    ]);
  });

  it('mật khẩu KHÔNG BAO GIỜ nằm trên dòng lệnh; thư mục cài gắn chỉ-đọc', async () => {
    const r = await xuat(`CHUYEN-MAY\n${MK}\n${MK}\n`);
    expect(r.goi).not.toContain(MK);
    const dong = r.goi.split('\n').find((l) => l.includes('bi-mat-dong'))!;
    expect(dong).toMatch(/-e CSBH_MAT_KHAU( |$)/);
    expect(dong).toMatch(/:\/cai:ro /);
  });

  it('xả chưa xong (outbox còn sự kiện) → hết giờ thì DỪNG, không xuất gì', async () => {
    const r = await xuat(`CHUYEN-MAY\n${MK}\n${MK}\n`, { CHO_XA: '4', CSBH_CHO_XA_LAN: '3' });
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('Hết giờ chờ');
    expect(r.goi).not.toContain('xuat-csdl');
    expect(r.goi).not.toContain('stop identity');
  });

  it('outbox sạch mà HÀNG ĐỢI còn tin → vẫn chưa xuất', async () => {
    const r = await xuat(`CHUYEN-MAY\n${MK}\n${MK}\n`, { HANG_DOI: '2', CSBH_CHO_XA_LAN: '3' });
    expect(r.ma).toBe(1);
    expect(r.goi).not.toContain('xuat-csdl');
  });

  for (const [ten, vao] of [
    ['không gõ CHUYEN-MAY', 'khong\n'],
    ['hai lần mật khẩu lệch nhau', `CHUYEN-MAY\n${MK}\n${MK}x\n`],
    ['mật khẩu dưới 12 ký tự', 'CHUYEN-MAY\nngan\nngan\n'],
  ] as const) {
    it(`${ten} → huỷ trước khi dừng bất cứ thứ gì`, async () => {
      const r = await xuat(vao);
      expect(r.ma).toBe(1);
      expect(r.goi).not.toContain('stop');
    });
  }
});

describe('`0246` nhap-chuyen-may', () => {
  it('đi hết đường: mở bí mật → mở gói → hạ tầng → CSDL → tệp → ĐỐI CHIẾU → rồi mới migrate và bật', async () => {
    const r = await nhap();
    expect(r.ma, r.loi + r.ra).toBe(0);
    thuTu(r.goi, [
      'chuyen-may bi-mat-mo',
      'chuyen-may mo-goi',
      'up -d --wait postgres minio rabbitmq redis',
      'ops restore /xuat/csdl.dump',
      'mc mirror --overwrite --quiet',
      'chuyen-may ban-ke /t/kiem',
      'chuyen-may so-sanh /t/goi /t/kiem',
      'ops migrate',
    ]);
    expect(r.goi.trimEnd().split('\n').pop()).toMatch(/up -d --wait$/);
    expect(r.goi).toMatch(/-e RESTORE_DB=csbh /);
    // `0270`: cấu hình máy cũ → tệp cấu hình; bí mật → <workspace>/secrets.
    expect(readFileSync(r.envTep, 'utf8')).toContain('SITE_URL=https://csbh.test');
    // Ảnh trên máy đã đúng bản máy cũ → KHÔNG kéo thẻ số nào.
    expect(r.goi).not.toMatch(/^pull kho\/csbh:(service|web|ops)-/m);
    expect(existsSync(join(r.ws, 'secrets', 'pg_password.txt'))).toBe(true);
    for (const t of ['data/postgres', 'data/minio', 'backup', 'run']) expect(existsSync(join(r.ws, t)), t).toBe(true);
    expect(readdirSync(join(r.d, 'tmp-he')), 'thư mục tạm phải được dọn').toEqual([]);
  });

  it('ĐỐI CHIẾU LỆCH → không migrate, không bật phần mềm, thoát 1', async () => {
    const r = await nhap({ SO_SANH_MA: '1' });
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('ĐỐI CHIẾU LỆCH');
    expect(r.goi).not.toContain('ops migrate');
    expect(r.goi.trimEnd().split('\n').pop()).not.toMatch(/up -d --wait$/);
  });

  it('SAI mật khẩu → không ra .env, không dựng gì', async () => {
    const r = await nhap({ BI_MAT_MA: '1' });
    expect(r.ma).toBe(1);
    expect(existsSync(r.envTep)).toBe(false);
    expect(r.goi).not.toContain('up -d');
  });

  it('`0270` máy cũ KHÁC bản với ảnh trên máy → kéo THẺ SỐ của máy cũ, gắn thành -latest, TRƯỚC khi dựng', async () => {
    /*
     * Tới `0269` ca này đòi TỪ CHỐI và bảo giải nén bộ cài đúng bản. Từ `0270` máy chạy
     * `-latest`, mà `latest` trên registry có thể đã đi trước máy cũ — nên lệnh nhập tự
     * kéo đúng thẻ số (registry giữ mọi thẻ số) rồi gắn nó thành `-latest` ngay trên máy.
     * Vẫn CÙNG bản (đối chiếu từng bảng đòi thế), chỉ thôi bắt người vận hành tự tìm bộ cài.
     */
    const r = await nhap({ TAG_GOI: '1.0.5' });
    expect(r.ma, r.loi + r.ra).toBe(0);
    for (const tp of ['service', 'web', 'ops']) {
      thuTu(r.goi, [`pull kho/csbh:${tp}-1.0.5`, `tag kho/csbh:${tp}-1.0.5 kho/csbh:${tp}-latest`, 'up -d --wait postgres']);
    }
  });

  it('`0270` kéo thẻ số của máy cũ HỎNG → dừng, không ra .env, không dựng gì', async () => {
    const r = await nhap({ TAG_GOI: '1.0.5', PULL_HONG: '1' });
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('kho/csbh:service-1.0.5');
    expect(existsSync(r.envTep)).toBe(false);
    expect(r.goi).not.toContain('up -d');
  });

  it('`0270` gói xuất TRƯỚC 0270 (thong-tin.txt ghi CSBH_TAG) vẫn nhập được', async () => {
    const r = await nhap({ KHOA_GOI: 'CSBH_TAG', TAG_GOI: '1.0.5' });
    expect(r.ma, r.loi + r.ra).toBe(0);
    expect(r.goi).toContain('pull kho/csbh:ops-1.0.5');
  });

  it('máy này ĐÃ có CSDL của dự án → từ chối, không nhập đè', async () => {
    const r = await nhap({ CO_VOLUME: '0' });
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('Không nhập đè');
    expect(r.goi).not.toContain('up -d');
  });

  it('đã có .env (máy đã cài) → từ chối trước cả khi hỏi mật khẩu', async () => {
    const r = await nhap({}, ENV_CU);
    expect(r.ma).toBe(1);
    expect(r.goi).toBe('');
  });

  it('chạy được khi CHƯA có .env — mọi lệnh khác thì không', async () => {
    const r = await chay(['trang-thai'], '');
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('Không thấy');
  });
});

describe('`0246` sao-luu-tep', () => {
  it('chép vào volume sao lưu CỦA DỰ ÁN, sang bản sao ngoài khi có, rồi kê', async () => {
    const r0 = await chay(['sao-luu-tep'], '', { env: ENV_CU });
    expect(r0.ma, r0.loi).toBe(0);
    expect(r0.goi).toContain('-v csbh-prod_pgbackup:/backup');
    expect(r0.goi).not.toContain('/mirror/tep');
    // `0251` — đầu ra của việc sao lưu gom vào một tệp (để ghi đuôi vào `ops.lan_chay`) rồi
    // in ra stdout; câu cảnh báo giờ nằm ở đó chứ không ở stderr.
    expect(`${r0.ra}${r0.loi}`).toContain('KHÔNG có thư mục bản sao ngoài');

    const guong = mkdtempSync(join(tmpdir(), 'guong-'));
    mkdirSync(guong, { recursive: true });
    const r = await chay(['sao-luu-tep'], '', { env: `${ENV_CU}CSBH_BACKUP_MIRROR=${guong}\n` });
    // `0250` — bản chụp theo mốc ở CẢ HAI nơi, rồi kê đúng bản vừa chụp.
    thuTu(r.goi, ['GOC=/backup/kho-tep', `${guong}:/mirror`, 'GOC=/mirror/kho-tep', 'chuyen-may ban-ke /backup/kho-tep/']);
    expect(r.goi).not.toContain('mc mirror --overwrite --quiet l /backup');
  });

  it('`0251` ĐẢO chốt 05/11 cũ ("chưa chạy định kỳ"): kho tệp có lịch riêng, cron hỏi mỗi 15 phút', () => {
    // Khách hàng chốt 05/11 khi duyệt trang Vận hành: bản sao kho tệp cũng có giờ chạy và
    // số bản giữ cấu hình được — nên nó PHẢI có trong cron, theo lịch.
    expect(readFileSync('deploy/cron/csbh.cron', 'utf8')).toMatch(/^\*\/15 .*__CSBH__ sao-luu-tep --neu-den-han/m);
  });
});
