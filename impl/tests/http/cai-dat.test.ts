/**
 * `0270` — `sudo ./cai-dat.sh`: cài cả hệ bằng MỘT lệnh, đọc MỘT tệp cấu hình.
 *
 * Chạy CHÍNH bộ cài trên một gói dựng bằng `scripts/ban-cai.sh` thật, với `docker`,
 * `systemctl`, `useradd`, `getent`, `hostname`, `curl`… GIẢ đặt đầu `PATH` (lối
 * `csbh-keo-anh.test.ts`). `docker run … ban-cai` của bản giả chạy `ban-cai.sh` thật,
 * nên `csbh` mà bộ cài gọi sau đó là `csbh` THẬT của kho mã — chỉ docker là giả.
 *
 * Mọi đường hệ thống (`/etc/csbh`, `/opt/csbh`, `/usr/local/bin`, `/etc/cron.d`,
 * `/etc/systemd/system`, `/etc/os-release`) đè bằng biến `CSBH_*` vào thư mục tạm, và
 * `CSBH_BO_KIEM_ROOT=1` cho chạy không root. KHÔNG kiểm được ở đây (đã nêu): nhánh cài
 * Docker bằng apt (bản giả `docker` luôn có mặt trên PATH), quyền sở hữu thật (`chown`
 * giả), và kết nối SMTP (mạng tắt — bước ấy chỉ cảnh báo).
 */
import { execFileSync, spawn } from 'node:child_process';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = process.cwd();

const DOCKER_GIA = `#!/bin/sh
# \`csbh\` gọi compose của chồng kiểm qua \`env -i\` (môi trường SẠCH, \`0270\`), nên biến của ca
# kiểm không tới được đây qua môi trường — bản giả nạp chúng từ tệp cạnh nó.
. "$(dirname "$0")/env.sh"
echo "$*" >> "$NHAT_KY"
ra=""; bm=""; prev=""
for a in "$@"; do
  [ "$prev" = "-v" ] && case "$a" in *:/ra) ra="\${a%:/ra}" ;; *:/run/secrets) bm="\${a%:/run/secrets}" ;; esac
  prev="$a"
done
case "$*" in
  "compose version"*|"buildx version"*|"--version") echo "Docker version 27" ;;
  login*) cat > "$NHAT_KY.login"; [ "\${LOGIN_HONG:-0}" = 1 ] && exit 1; exit 0 ;;
  "image inspect -f"*"org.opencontainers.image.version"*) echo 1.4.0 ;;
  "image inspect "*)
    a="$3"
    case "$a" in kho/csbh:*) grep -qx "$a" "$TRANG_THAI" 2>/dev/null && exit 0; [ "\${CO_ANH:-0}" = 1 ] && exit 0; exit 1 ;; esac
    exit 0 ;;
  "pull "*) echo "$2" >> "$TRANG_THAI" ;;
  "volume inspect "*) exit "\${CO_VOLUME:-1}" ;;
  *" ban-cai /ra"*) sh "$REPO/scripts/ban-cai.sh" "$REPO" "$ra" kho/csbh ;;
  *" gen-secrets "*) echo x > "$bm/pg_password.txt"; echo k > "$bm/jwt-private.pem" ;;
  *"config --images"*) printf '%s\\n' postgres:16 kho/csbh:ops-latest ;;
  *"idn.app_user"*) echo "\${SO_TK:-0}" ;;
  *" ops bootstrap-admin"*)
    [ -f "$CSBH_WORKSPACE/secrets/admin_mat_khau.txt" ] && cat "$CSBH_WORKSPACE/secrets/admin_mat_khau.txt" > "$NHAT_KY.admin"
    exit 0 ;;
  # Chồng kiểm (\`0270\`): bộ kiểm nghiệm in dòng tổng kết; KIEM_DO=1 → một ca đỏ.
  *" ops kiem-nghiem"*)
    if [ "\${KIEM_DO:-0}" = 1 ]; then echo "  ✘ [Hồ sơ] giả hỏng"; echo "KIEM_NGHIEM 20/21"; exit 1; fi
    echo "KIEM_NGHIEM 21/21"; exit 0 ;;
  *"-p csbh-kiem"*" ops migrate"*) exit 0 ;;
  *"-p csbh-kiem"*"up -d --wait"*) exit 0 ;;
  *" ops migrate"*) [ "\${MIGRATE_HONG:-0}" = 1 ] && exit 1; exit 0 ;;
  # Postgres thật ghi thư mục dữ liệu ngay ở lần dựng đầu — lần cài sau nhận ra "đã có dữ liệu".
  *"up -d --wait"*) mkdir -p "$CSBH_WORKSPACE/data/postgres"; echo 16 > "$CSBH_WORKSPACE/data/postgres/PG_VERSION" ;;
  *) exit 0 ;;
esac
`;

const GIA: Record<string, string> = {
  docker: DOCKER_GIA,
  systemctl: '#!/bin/sh\necho "systemctl $*" >> "$NHAT_KY"\n',
  timedatectl: '#!/bin/sh\necho "timedatectl $*" >> "$NHAT_KY"\n',
  useradd: '#!/bin/sh\necho "useradd $*" >> "$NHAT_KY"\n',
  usermod: '#!/bin/sh\necho "usermod $*" >> "$NHAT_KY"\n',
  chown: '#!/bin/sh\nexit 0\n',
  ufw: '#!/bin/sh\necho "ufw $*" >> "$NHAT_KY"\n[ "$1" = status ] && echo "Status: ${UFW:-inactive}"\nexit 0\n',
  getent: '#!/bin/sh\n[ -n "${IP_TEN-1.2.3.4}" ] && echo "${IP_TEN-1.2.3.4}  STREAM $3"\nexit 0\n',
  hostname: '#!/bin/sh\necho "1.2.3.4 10.0.0.5"\n',
  curl: '#!/bin/sh\necho "curl $*" >> "$NHAT_KY"\nexit "${CURL_HONG:-0}"\n',
  timeout: '#!/bin/sh\nexit 1\n',
  id: '#!/bin/sh\ncase "$*" in\n  csbh) [ "${KHONG_CO_CSBH:-0}" = 1 ] && exit 1; echo "uid=999(csbh)" ;;\n  "-u csbh"|"-g csbh") echo 999 ;;\n  *) exec /usr/bin/id "$@" ;;\nesac\n',
};

const ENV_DU = (ws: string, them = '') => `CSBH_WORKSPACE=${ws}
COMPOSE_PROJECT_NAME=csbh-prod
CSBH_IMAGE=kho/csbh
REGISTRY_USER=nguoi-doc
REGISTRY_TOKEN=dckr_pat_BI_MAT_KHONG_DUOC_LO
SITE_ADDRESS=csbh.vi-du.vn
SITE_URL=
ACME_EMAIL=it@vi-du.vn
MAIL_HOST=smtp.vi-du.vn
MAIL_PORT=587
MAIL_FROM=csbh@vi-du.vn
MAIL_ALLOWLIST=vi-du.vn
MAIL_USER=csbh@vi-du.vn
MAIL_PASSWORD=mat-khau-smtp-bi-mat
ADMIN_TEN_DANG_NHAP=admin
ADMIN_EMAIL=admin@vi-du.vn
ADMIN_HO_TEN=Quản trị
ADMIN_MAT_KHAU=MatKhauTam2026
${them}`;

type Kq = { ma: number; ra: string; loi: string; goi: string; d: string; ws: string; envTep: string };

function chuanBi(): { d: string; goi: string } {
  const d = mkdtempSync(join(tmpdir(), 'cai-dat-'));
  const goi = join(d, 'goi');
  // Gói giải nén = đúng thứ `ban-cai.sh` dựng (chạy thật, đồng bộ).
  execFileSync('sh', ['scripts/ban-cai.sh', '.', goi, 'kho/csbh']);
  const bin = join(d, 'gia');
  mkdirSync(bin);
  for (const [ten, noi] of Object.entries(GIA)) { writeFileSync(join(bin, ten), noi); chmodSync(join(bin, ten), 0o755); }
  for (const t of ['etc/csbh', 'opt', 'bin', 'cron.d', 'systemd']) mkdirSync(join(d, t), { recursive: true });
  writeFileSync(join(d, 'os-release'), 'ID=ubuntu\nVERSION_ID=24.04\nVERSION_CODENAME=noble\nPRETTY_NAME="Ubuntu 24.04 LTS"\n');
  return { d, goi };
}

function caiDat(o: { env?: string | ((ws: string) => string); thamSo?: string[]; dat?: Record<string, string>; d?: { d: string; goi: string }; truoc?: (d: string, ws: string) => void } = {}): Promise<Kq> {
  const x = o.d ?? chuanBi();
  const { d, goi } = x;
  const ws = join(d, 'ws');
  const envTep = join(d, 'etc/csbh/csbh.env');
  if (o.env !== undefined) writeFileSync(envTep, typeof o.env === 'function' ? o.env(ws) : o.env);
  o.truoc?.(d, ws);
  const nhatKy = join(d, 'goi.log');
  writeFileSync(nhatKy, '');
  const bien: Record<string, string> = { NHAT_KY: nhatKy, TRANG_THAI: join(d, 'anh-da-keo'), REPO, ...o.dat };
  writeFileSync(join(d, 'gia', 'env.sh'), Object.entries(bien).map(([k, v]) => `export ${k}='${v}'`).join('\n') + '\n');
  const env = {
    ...process.env,
    PATH: `${join(d, 'gia')}:${process.env.PATH}`,
    NHAT_KY: nhatKy, TRANG_THAI: join(d, 'anh-da-keo'), REPO,
    CSBH_ENV: envTep, CSBH_CHUONG_TRINH: join(d, 'opt'), CSBH_BIN: join(d, 'bin'),
    CSBH_ETC_CRON: join(d, 'cron.d'), CSBH_ETC_SYSTEMD: join(d, 'systemd'),
    CSBH_OS_RELEASE: join(d, 'os-release'), CSBH_BO_KIEM_ROOT: '1',
    ...o.dat,
  };
  return new Promise((ok) => {
    // stdin ĐÓNG: bộ cài không hỏi gì — lệnh nào lỡ đọc bàn phím thì nhận EOF ngay chứ không treo.
    const p = spawn('bash', [join(goi, 'cai-dat.sh'), ...(o.thamSo ?? [])], { cwd: goi, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let ra = '';
    let loi = '';
    p.stdout.on('data', (b) => (ra += b));
    p.stderr.on('data', (b) => (loi += b));
    p.on('close', (ma) => ok({ ma: ma ?? 1, ra, loi, goi: readFileSync(nhatKy, 'utf8'), d, ws, envTep }));
  });
}

function thuTu(goi: string, moc: string[]) {
  const vt = moc.map((m) => goi.indexOf(m));
  expect(vt.every((i) => i >= 0), `thiếu mốc: ${moc.filter((_, i) => vt[i]! < 0).join(' | ')}\n${goi}`).toBe(true);
  expect([...vt].sort((a, b) => a - b), goi).toEqual(vt);
}

describe('`0270` cai-dat.sh — tệp cấu hình', () => {
  it('chưa có tệp cấu hình → TẠO từ mẫu, nói phải điền gì, DỪNG — không đụng docker', async () => {
    const r = await caiDat();
    expect(r.ma, r.loi).toBe(0);
    expect(existsSync(r.envTep)).toBe(true);
    expect(readFileSync(r.envTep, 'utf8')).toMatch(/^REGISTRY_TOKEN=THAY_/m);
    expect(statSync(r.envTep).mode & 0o077, 'tệp mẫu chứa chỗ điền mật khẩu — không ai khác được đọc').toBe(0);
    expect(r.ra).toContain('sudo ./cai-dat.sh');
    expect(r.goi).toBe('');
  });

  it('`--env <tệp>` chép tệp đã điền vào /etc/csbh rồi cài', async () => {
    const x = chuanBi();
    const san = join(x.d, 'da-dien.env');
    writeFileSync(san, ENV_DU(join(x.d, 'ws')));
    const r = await caiDat({ d: x, thamSo: ['--env', san] });
    expect(r.ma, r.loi + r.ra).toBe(0);
    expect(readFileSync(r.envTep, 'utf8')).toContain('SITE_ADDRESS=csbh.vi-du.vn');
  });

  it('còn giá trị mẫu → GOM mọi lỗi in MỘT LẦN, dừng trước mọi việc', async () => {
    const r = await caiDat({ env: (ws) => ENV_DU(ws).replace('REGISTRY_TOKEN=dckr_pat_BI_MAT_KHONG_DUOC_LO', 'REGISTRY_TOKEN=THAY_TOKEN').replace('SITE_ADDRESS=csbh.vi-du.vn', 'SITE_ADDRESS=THAY_TEN_MIEN') });
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('REGISTRY_TOKEN: còn giá trị mẫu');
    expect(r.loi).toContain('SITE_ADDRESS: còn giá trị mẫu');
    expect(r.loi).toContain('2 chỗ phải sửa');
    expect(r.goi).toBe('');
    expect(r.ra).toMatch(/\[2\/14\] ✘ Kiểm tệp cấu hình/);
  });

  for (const [ten, sua, can] of [
    ['MAIL_HOST là hộp thư giả', (e: string) => e.replace('MAIL_HOST=smtp.vi-du.vn', 'MAIL_HOST=mailpit'), 'MAIL_HOST: phải là máy chủ SMTP thật'],
    ['workspace tương đối', (e: string) => e.replace(/^CSBH_WORKSPACE=.*$/m, 'CSBH_WORKSPACE=du-lieu'), 'CSBH_WORKSPACE: phải là đường tuyệt đối'],
    ['workspace trong /opt/csbh', (e: string) => e.replace(/^CSBH_WORKSPACE=.*$/m, 'CSBH_WORKSPACE=/opt/csbh/ws'), 'không được nằm trong thư mục chương trình'],
    ['SITE_ADDRESS kèm https://', (e: string) => e.replace('SITE_ADDRESS=csbh.vi-du.vn', 'SITE_ADDRESS=https://csbh.vi-du.vn'), 'SITE_ADDRESS: chỉ ghi tên miền'],
    ['mật khẩu Quản trị yếu', (e: string) => e.replace('ADMIN_MAT_KHAU=MatKhauTam2026', 'ADMIN_MAT_KHAU=ngan'), 'ADMIN_MAT_KHAU: tối thiểu 10 ký tự'],
    ['có MAIL_USER mà thiếu mật khẩu', (e: string) => e.replace('MAIL_PASSWORD=mat-khau-smtp-bi-mat', 'MAIL_PASSWORD='), 'MAIL_PASSWORD: có MAIL_USER mà thiếu mật khẩu'],
    ['tên dự án trùng chồng demo', (e: string) => e.replace('COMPOSE_PROJECT_NAME=csbh-prod', 'COMPOSE_PROJECT_NAME=csbh'), "COMPOSE_PROJECT_NAME: không được là 'csbh'"],
  ] as const) {
    it(`${ten} → dừng, nói đúng dòng`, async () => {
      const r = await caiDat({ env: (ws) => sua(ENV_DU(ws)) });
      expect(r.ma).toBe(1);
      expect(r.loi).toContain(can);
      expect(r.goi).not.toContain('login');
    });
  }

  it('hệ điều hành không hỗ trợ → dừng ở bước 1', async () => {
    const r = await caiDat({ env: ENV_DU, truoc: (d) => writeFileSync(join(d, 'os-release'), 'ID=centos\nVERSION_ID=7\n') });
    expect(r.ma).toBe(1);
    expect(r.ra).toMatch(/\[1\/14\] ✘/);
  });
});

describe('`0270` cai-dat.sh — lần cài đầu đi hết đường', () => {
  it('đúng THỨ TỰ: đăng nhập → kéo ảnh → bung chương trình → sinh bí mật → migration → dựng → tạo Quản trị → tác tử', async () => {
    const r = await caiDat({ env: ENV_DU });
    expect(r.ma, r.loi + r.ra).toBe(0);
    thuTu(r.goi, [
      'login -u nguoi-doc --password-stdin',
      'pull kho/csbh:ops-latest',
      ' ban-cai /ra',
      ' gen-secrets /run/secrets',
      ' ops migrate',
      'up -d --wait',
      ' ops bootstrap-admin',
      'systemctl restart csbh-tac-tu',
      'curl -fsS --max-time 10 https://csbh.vi-du.vn/api/readyz',
    ]);
    for (const tp of ['service', 'web', 'ops', 'minio']) expect(r.goi).toContain(`pull kho/csbh:${tp}-latest`);
  });

  it('mỗi bước hiện ▶ lúc chạy và ✔ lúc xong, đủ 14 bước — và KHÔNG bước nào vượt tổng', async () => {
    const r = await caiDat({ env: ENV_DU });
    for (let i = 1; i <= 14; i++) {
      expect(r.ra, `bước ${i}`).toMatch(new RegExp(`\\[${i}/14\\] ▶ `));
      expect(r.ra, `bước ${i}`).toMatch(new RegExp(`\\[${i}/14\\] (✔|–) `));
    }
    // Tổng khai báo phải bằng số bước thật: bản P308 khai 12 mà chạy 13 bước, in ra `[13/12]` —
    // ca cũ chỉ hỏi 1…12 nên không thấy.
    const so = [...r.ra.matchAll(/^\[(\d+)\/(\d+)\] ▶/gm)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(so.length).toBe(14);
    expect(so.every(([i, n]) => i! <= n!), JSON.stringify(so)).toBe(true);
    // Bước con của `csbh len` thụt vào trong bước cha.
    expect(r.ra).toMatch(/^ {4}\[3\/3\] ✔ Dựng các service/m);
  });

  it('BÍ MẬT không lọt ra dòng lệnh: token qua stdin, mật khẩu Quản trị qua TỆP rồi xoá', async () => {
    const r = await caiDat({ env: ENV_DU });
    expect(r.goi).not.toContain('dckr_pat_BI_MAT_KHONG_DUOC_LO');
    expect(r.goi).not.toContain('MatKhauTam2026');
    expect(r.goi).not.toContain('mat-khau-smtp-bi-mat');
    expect(readFileSync(`${join(r.d, 'goi.log')}.login`, 'utf8')).toBe('dckr_pat_BI_MAT_KHONG_DUOC_LO');
    expect(readFileSync(`${join(r.d, 'goi.log')}.admin`, 'utf8'), 'bootstrap-admin không thấy tệp mật khẩu').toBe('MatKhauTam2026');
    expect(existsSync(join(r.ws, 'secrets/admin_mat_khau.txt')), 'tệp mật khẩu Quản trị phải bị xoá').toBe(false);
  });

  it('sau khi tạo Quản trị: ADMIN_MAT_KHAU XOÁ TRẮNG khỏi tệp cấu hình', async () => {
    const r = await caiDat({ env: ENV_DU });
    expect(readFileSync(r.envTep, 'utf8')).toMatch(/^ADMIN_MAT_KHAU=$/m);
  });

  it('mật khẩu SMTP từ tệp cấu hình → secrets/mail_password.txt (container đọc tệp)', async () => {
    const r = await caiDat({ env: ENV_DU });
    expect(readFileSync(join(r.ws, 'secrets/mail_password.txt'), 'utf8')).toBe('mat-khau-smtp-bi-mat');
    expect(statSync(join(r.ws, 'secrets/mail_password.txt')).mode & 0o077).toBe(0);
  });

  it('cây thư mục: chương trình ở opt/releases/<bản>, current, lệnh csbh; workspace đủ thư mục', async () => {
    const r = await caiDat({ env: ENV_DU });
    expect(readlinkSync(join(r.d, 'opt/current'))).toBe('releases/1.4.0');
    expect(existsSync(join(r.d, 'opt/releases/1.4.0/deploy/compose.du-lieu.yml'))).toBe(true);
    expect(lstatSync(join(r.d, 'bin/csbh')).isSymbolicLink()).toBe(true);
    for (const t of ['secrets', 'data/postgres', 'data/minio', 'data/caddy', 'backup', 'run', 'tmp', 'logs/cai-dat', 'logs/cron', 'logarchive', 'backup-mirror', '.csbh-workspace']) {
      expect(existsSync(join(r.ws, t)), t).toBe(true);
    }
    expect(statSync(join(r.ws, 'secrets')).mode & 0o777).toBe(0o700);
    expect(statSync(r.envTep).mode & 0o777).toBe(0o640);
    expect(readFileSync(join(r.d, 'etc/csbh/.workspace-hien-tai'), 'utf8').trim()).toBe(r.ws);
  });

  it('cron và unit systemd ghi ĐƯỜNG TUYỆT ĐỐI, không còn chỗ trống mẫu', async () => {
    const r = await caiDat({ env: ENV_DU });
    const cron = readFileSync(join(r.d, 'cron.d/csbh'), 'utf8');
    expect(cron).toContain(`${join(r.d, 'bin')}/csbh sao-luu --neu-den-han     >> ${r.ws}/logs/cron/sao-luu.log`);
    expect(cron).not.toMatch(/__CSBH__|__LOG__/);
    const unit = readFileSync(join(r.d, 'systemd/csbh-tac-tu.service'), 'utf8');
    expect(unit).toContain(`ExecStart=${join(r.d, 'opt')}/current/csbh tac-tu`);
    expect(unit).toContain(`WorkingDirectory=${r.ws}`);
    expect(unit).toMatch(/^User=csbh$/m);
  });

  it('toàn bộ đầu ra ghi kèm vào logs/cai-dat/<giờ>.log', async () => {
    const r = await caiDat({ env: ENV_DU });
    const tep = /Nhật ký lượt cài: (\S+)/.exec(r.ra)?.[1];
    expect(tep).toBeDefined();
    expect(readFileSync(tep!, 'utf8')).toContain('[12/14] ✔');
  });

  it('chưa có tài khoản csbh → tạo, và cho vào nhóm docker', async () => {
    const r = await caiDat({ env: ENV_DU, dat: { KHONG_CO_CSBH: '1' } });
    expect(r.goi).toMatch(/^useradd --system .* csbh$/m);
    expect(r.goi).toContain('usermod -aG docker csbh');
  });

  it('ufw đang bật → chỉ MỞ THÊM 80/443; ufw tắt → KHÔNG bật (tránh tự khoá SSH)', async () => {
    const bat = await caiDat({ env: ENV_DU, dat: { UFW: 'active' } });
    expect(bat.goi).toContain('ufw allow 80/tcp');
    expect(bat.goi).toContain('ufw allow 443/tcp');
    // `ufw --force enable` không chứa nguyên cụm `ufw enable` — bản đầu của ca này hỏi
    // đúng cụm ấy và một lượt phá lại (thêm `ufw --force enable`) vẫn XANH.
    expect(bat.goi).not.toMatch(/^ufw .*\benable\b/m);
    const tat = await caiDat({ env: ENV_DU });
    expect(tat.goi).not.toContain('ufw allow');
    expect(tat.goi).not.toMatch(/^ufw .*\benable\b/m);
  });
});

describe('`0270` cai-dat.sh — kiểm nghiệm trên chồng kiểm riêng (bước 10)', () => {
  it('lần cài đầu: chồng kiểm dựng, chạy bộ kiểm nghiệm và DỌN — tất cả TRƯỚC khi chồng thật được dựng', async () => {
    const r = await caiDat({ env: ENV_DU });
    expect(r.ma, r.loi + r.ra).toBe(0);
    const iKiem = r.goi.indexOf(' ops kiem-nghiem');
    const iDon = r.goi.indexOf('-p csbh-kiem', iKiem);
    // Lượt migrate/up của CHỒNG THẬT là lượt KHÔNG mang `-p csbh-kiem`.
    const dong = r.goi.split('\n');
    const iThat = dong.findIndex((d, i) => i > 0 && d.includes(' ops migrate') && !d.includes('-p csbh-kiem'));
    expect(iKiem, 'không chạy bộ kiểm nghiệm').toBeGreaterThan(-1);
    expect(iDon, 'không dọn chồng kiểm sau khi chạy').toBeGreaterThan(iKiem);
    expect(r.goi.indexOf(dong[iThat]!), 'chồng thật dựng TRƯỚC khi kiểm nghiệm xong').toBeGreaterThan(iKiem);
    expect(r.goi).toMatch(/-p csbh-kiem .*down -v --remove-orphans/);
    expect(r.ra).toContain('Kiểm nghiệm XANH: 21/21');
  });

  it('chồng kiểm dùng compose.kiem.yml và KHÔNG dùng compose.du-lieu.yml (dữ liệu giả không chạm data/)', async () => {
    const r = await caiDat({ env: ENV_DU });
    const kiem = r.goi.split('\n').filter((d) => d.includes('-p csbh-kiem'));
    expect(kiem.length).toBeGreaterThan(0);
    for (const d of kiem) {
      expect(d).toContain('compose.kiem.yml');
      expect(d).not.toContain('compose.du-lieu.yml');
    }
  });

  it('kiểm nghiệm ĐỎ → DỪNG: không dựng chồng thật, không tạo Quản trị, vẫn DỌN chồng kiểm', async () => {
    const r = await caiDat({ env: ENV_DU, dat: { KIEM_DO: '1' } });
    expect(r.ma).not.toBe(0);
    expect(r.ra).toMatch(/\[10\/14\] ✘ Kiểm nghiệm/);
    expect(r.goi).toMatch(/-p csbh-kiem .*down -v --remove-orphans/);
    expect(r.goi.split('\n').some((d) => d.includes(' ops migrate') && !d.includes('-p csbh-kiem'))).toBe(false);
    expect(r.goi).not.toMatch(/^(?!.*csbh-kiem).* ops bootstrap-admin/m);
    expect(r.loi + r.ra).toContain('KIỂM NGHIỆM ĐỎ: 20/21');
  });

  it('không phải lần cài đầu → bỏ qua bước kiểm nghiệm, NÓI ra cách chạy tay', async () => {
    const x = chuanBi();
    await caiDat({ d: x, env: ENV_DU });
    const r2 = await caiDat({ d: x, dat: { SO_TK: '1' } });
    expect(r2.goi).not.toContain(' ops kiem-nghiem');
    expect(r2.ra).toMatch(/\[10\/14\] – .*csbh kiem-nghiem/);
  });
});

describe('`0270` cai-dat.sh — chạy lại, chốt chặn', () => {
  it('chạy LẦN HAI: không kéo ảnh, không sinh lại bí mật, không tạo lại Quản trị — và NÓI là bỏ qua', async () => {
    const x = chuanBi();
    const r1 = await caiDat({ d: x, env: ENV_DU });
    expect(r1.ma, r1.loi).toBe(0);
    const r2 = await caiDat({ d: x, dat: { SO_TK: '1' } });
    expect(r2.ma, r2.loi + r2.ra).toBe(0);
    expect(r2.goi).not.toMatch(/^pull /m);
    expect(r2.goi).not.toContain(' gen-secrets ');
    expect(r2.goi).not.toContain(' ban-cai ');
    expect(r2.goi).not.toContain('bootstrap-admin');
    expect(r2.ra).toContain('bỏ qua: đã có đủ ảnh');
    expect(r2.ra).toContain('bỏ qua: CSDL đã có 1 tài khoản');
  });

  it('`0113` dữ liệu CSDL đã có mà THIẾU bí mật → dừng, không sinh bí mật mới, không dựng', async () => {
    const r = await caiDat({
      env: ENV_DU,
      truoc: (_d, ws) => { mkdirSync(join(ws, 'data/postgres'), { recursive: true }); writeFileSync(join(ws, 'data/postgres/PG_VERSION'), '16'); },
      // Lần này không phải lần cài đầu (có dữ liệu) → ADMIN_* không bắt buộc.
    });
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('chưa có bộ bí mật');
    expect(r.goi).not.toContain('gen-secrets');
    expect(r.goi).not.toContain('up -d');
  });

  it('DNS chưa trỏ về máy này → dừng TRƯỚC khi đăng nhập registry; --bo-kiem-dns thì đi tiếp', async () => {
    const lech = await caiDat({ env: ENV_DU, dat: { IP_TEN: '9.9.9.9' } });
    expect(lech.ma).toBe(1);
    expect(lech.loi).toContain('--bo-kiem-dns');
    expect(lech.goi).not.toContain('login');
    const bo = await caiDat({ env: ENV_DU, dat: { IP_TEN: '9.9.9.9' }, thamSo: ['--bo-kiem-dns'] });
    expect(bo.ma, bo.loi).toBe(0);
    expect(bo.ra).toMatch(/\[5\/14\] – .*bỏ qua: --bo-kiem-dns/);
  });

  it('DNS chưa phân giải → dừng, nói trỏ bản ghi A', async () => {
    const r = await caiDat({ env: ENV_DU, dat: { IP_TEN: '' } });
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('bản ghi A');
  });

  it('ĐỔI workspace sau khi đã cài → dừng, hướng dẫn dời; KHÔNG dựng workspace trống thứ hai', async () => {
    const x = chuanBi();
    await caiDat({ d: x, env: ENV_DU });
    mkdirSync(join(x.d, 'ws/data/postgres/base'), { recursive: true });
    const moi = join(x.d, 'ws-moi');
    const r = await caiDat({ d: x, env: (ws) => ENV_DU(ws).replace(`CSBH_WORKSPACE=${ws}`, `CSBH_WORKSPACE=${moi}`) });
    expect(r.ma).toBe(1);
    expect(r.loi).toContain(`sudo mv ${join(x.d, 'ws')} ${moi}`);
    expect(existsSync(join(moi, 'secrets')), 'đã dựng workspace mới').toBe(false);
  });

  it('đăng nhập registry hỏng → dừng ở bước 6, nói kiểm REGISTRY_*', async () => {
    const r = await caiDat({ env: ENV_DU, dat: { LOGIN_HONG: '1' } });
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('REGISTRY_USER');
    expect(r.ra).toMatch(/\[6\/14\] ✘ Đăng nhập registry — HỎNG/);
    expect(r.goi).not.toMatch(/^pull /m);
  });

  it('migration hỏng → dừng ở bước dựng hệ, không tạo Quản trị, không cài tác tử', async () => {
    const r = await caiDat({ env: ENV_DU, dat: { MIGRATE_HONG: '1' } });
    expect(r.ma).not.toBe(0);
    expect(r.ra).toMatch(/\[11\/14\] ✘ Dựng hệ thống/);
    // `bootstrap-admin` của CHỒNG KIỂM có (bước 10); của chồng THẬT thì không.
    expect(r.goi.split('\n').some((d) => d.includes('bootstrap-admin') && !d.includes('-p csbh-kiem'))).toBe(false);
    expect(r.goi).not.toContain('systemctl restart');
  });

  it('HTTPS chưa trả lời → dừng ở kiểm khói, chỉ đường xem log Caddy', async () => {
    const r = await caiDat({ env: ENV_DU, dat: { CURL_HONG: '1', CSBH_KIEM_KHOI_LAN: '1' } });
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('csbh log caddy');
  }, 200_000);

  it('`--cap-nhat` / `--lui-lai` chuyển thẳng sang csbh', async () => {
    const x = chuanBi();
    writeFileSync(join(x.d, 'bin/csbh'), '#!/bin/sh\necho "csbh-gia $*"\n');
    chmodSync(join(x.d, 'bin/csbh'), 0o755);
    const r = await caiDat({ d: x, env: ENV_DU, thamSo: ['--cap-nhat'] });
    expect(r.ra.trim()).toBe('csbh-gia cap-nhat');
    const l = await caiDat({ d: x, thamSo: ['--lui-lai'] });
    expect(l.ra.trim()).toBe('csbh-gia lui-lai');
  });
});
