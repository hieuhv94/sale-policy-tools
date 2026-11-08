/**
 * `0254` — `./csbh tac-tu --mot-nhip`: tác tử vận hành chạy trên máy chủ.
 *
 * Chạy CHÍNH `scripts/csbh` với `docker` giả đặt đầu `PATH` (khuôn `csbh-lich.test.ts`). Câu
 * SQL tác tử gửi qua `exec -T postgres psql -f -` đi bằng STDIN — `docker` giả đọc và ghi lại
 * nguyên văn; phía CSDL của các hàm ấy có ca riêng ở `tests/db/tac-tu.test.ts`.
 *
 * Biến điều khiển `docker` giả: `VIEC` (câu trả lời của `ops.tac_tu_nhip`), `DB_HONG`,
 * `LICH`, `BACKUP_HONG`, `MC_HONG`.
 */
import { spawn } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOCKER_GIA = `#!/bin/sh
echo "$*" >> "$NHAT_KY"
case "$*" in
  *"exec -T postgres psql"*)
    sql=$(cat)
    printf '%s\\n----\\n' "$sql" >> "$NHAT_KY.sql"
    [ "\${DB_HONG:-0}" = 1 ] && exit 2
    # Như hàm thật: chỉ giao việc khi tác tử báo RẢNH (tham số cuối là true).
    case "$sql" in *ops.tac_tu_nhip*", true)"*) printf '%s\\n' "$VIEC" ;; esac ;;
  *"ops psql"*"ops.den_han"*) [ -n "$LICH" ] && echo "$LICH" || exit 2 ;;
  *"ops psql"*"INSERT INTO ops.lan_chay"*) printf '%s\\n' "$*" >> "$NHAT_KY.lanchay"; echo 42 ;;
  *"ops psql"*"UPDATE ops.lan_chay"*) ;;
  *" ops backup"*)
    [ "\${BACKUP_HONG:-0}" = 1 ] && { echo "pg_dump: không nối được tới CSDL"; exit 1; }
    sleep "\${BACKUP_CHAM:-0}"
    echo "backup: xong csbh-20261106T040000Z.dump" ;;
  *"--entrypoint sh minio"*) [ "\${MC_HONG:-0}" = 1 ] && { echo "mc: hỏng"; exit 1; }; exit 0 ;;
  *"exec -T van-hanh sh -c"*)
    [ "\${VAN_HANH_HONG:-0}" = 1 ] && exit 1
    for a; do ten=$a; done
    mkdir -p "$LOG_GIA/dang-ghi"; cat >> "$LOG_GIA/dang-ghi/$ten" ;;
  # \`0270\`: phiên bản đọc từ NHÃN của ảnh, không từ \`.env\`.
  *"image inspect -f"*"org.opencontainers.image.version"*) echo 1.1.0 ;;
  *" ps -a --format json"*) echo '{"Service":"postgres","State":"running","Health":"healthy"}' ;;
  *"system df -v --format json"*) echo '{"Volumes":[{"Name":"csbh-prod_pgdata","Size":"1GB"}]}' ;;
  *"system df --format json"*) echo '{"Type":"Images","Size":"4.2GB"}' ;;
  *" logs --no-color"*)
    for svc in postgres redis rabbitmq minio gotenberg caddy; do
      case "$*" in *" $svc") ;; *) continue ;; esac
      case "$svc" in
        postgres)
          echo "2026-11-05T16:59:59.500000000Z LOG:  checkpoint trước nửa đêm VN"
          echo "2026-11-05T17:00:01.000000009Z LOG:  sau nửa đêm VN" ;;
        redis) echo "2026-11-06T02:00:00.123456789Z * Ready to accept connections" ;;
      esac
    done ;;
  *) exit 0 ;;
esac
`;

type Kq = { ma: number; ra: string; goi: string; sql: string; lanChay: string; d: string; log: string };

function chuanBi(): string {
  const d = mkdtempSync(join(tmpdir(), 'csbh-tt-'));
  copyFileSync('scripts/csbh', join(d, 'csbh'));
  copyFileSync('scripts/lib-buoc.sh', join(d, 'lib-buoc.sh'));
  mkdirSync(join(d, 'run'), { recursive: true });
  chmodSync(join(d, 'csbh'), 0o755);
  mkdirSync(join(d, 'logs'));
  writeFileSync(join(d, '.env'), `COMPOSE_PROJECT_NAME=csbh-prod\nCSBH_IMAGE=kho/csbh\nCSBH_WORKSPACE=${d}\n`);
  writeFileSync(join(d, 'docker'), DOCKER_GIA);
  chmodSync(join(d, 'docker'), 0o755);
  return d;
}

function chay(d: string, lenh: string[], dat: Record<string, string> = {}): Promise<Kq> {
  const nhatKy = join(d, 'goi.log');
  for (const t of [nhatKy, `${nhatKy}.sql`, `${nhatKy}.lanchay`]) writeFileSync(t, '');
  const env = {
    ...process.env,
    CSBH_ENV: join(d, ".env"), PATH: `${d}:${process.env.PATH}`,
    NHAT_KY: nhatKy,
    LOG_GIA: join(d, 'logs'), // thư mục log "bên trong" container van-hanh giả
    VIEC: '',
    LICH: 'khong 9',
    CSBH_EPOCH: '1000000',
    CSBH_HOM_NAY: '2026-11-06',
    CSBH_HOM_QUA: '2026-11-05',
    ...dat,
  };
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
        sql: readFileSync(`${nhatKy}.sql`, 'utf8'),
        lanChay: readFileSync(`${nhatKy}.lanchay`, 'utf8'),
        d,
        log: join(d, 'logs', 'dang-ghi'),
      }),
    );
  });
}
const nhip = (dat: Record<string, string> = {}, d = chuanBi()) => chay(d, ['tac-tu', '--mot-nhip'], dat);
const xong = (k: Kq) => k.sql.split('----').filter((s) => s.includes('ops.tac_tu_xong'));
const UUID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('`0254` nhịp tim và việc web', () => {
  it('rảnh, không việc → một nhịp tim mang phiên bản, không sao lưu gì', async () => {
    const k = await nhip();
    expect(k.ma, k.ra).toBe(0);
    expect(k.sql).toMatch(/SELECT ops\.tac_tu_nhip\(\$csbh_j\$1\.1\.0\$csbh_j\$, .*, true\)/);
    expect(k.goi).not.toContain(' ops backup');
    expect(xong(k)).toEqual([]);
  });

  it('việc SAO_LUU_CSDL → sao lưu NGAY (dù chưa tới lịch) với số bản giữ từ cấu hình, ghi người bấm, báo xong THÀNH CÔNG', async () => {
    const k = await nhip({ VIEC: `7 SAO_LUU_CSDL ${UUID}`, LICH: 'khong 9' });
    expect(k.ma, k.ra).toBe(0);
    expect(k.goi).toContain('-e GIU_TOI_DA=9 ops backup');
    expect(k.lanChay).toContain(`(viec, tu_dong, nguoi_chay) VALUES ('SAO_LUU_CSDL', false, '${UUID}')`);
    expect(xong(k)).toHaveLength(1);
    expect(xong(k)[0]).toMatch(/ops\.tac_tu_xong\(7, true, \$csbh_ra\$[\s\S]*backup: xong csbh-20261106T040000Z\.dump/);
  });

  it('sao lưu HỎNG → báo xong LỖI kèm câu lỗi', async () => {
    const k = await nhip({ VIEC: `7 SAO_LUU_CSDL ${UUID}`, BACKUP_HONG: '1' });
    expect(xong(k)[0]).toMatch(/ops\.tac_tu_xong\(7, false, [\s\S]*pg_dump: không nối được tới CSDL/);
  });

  it('việc SAO_LUU_KHO_TEP → chụp kho tệp; mc hỏng → LỖI', async () => {
    const k = await nhip({ VIEC: '8 SAO_LUU_KHO_TEP -' });
    expect(k.goi).toContain('GOC=/backup/kho-tep');
    expect(xong(k)[0]).toContain('ops.tac_tu_xong(8, true,');
    expect(k.lanChay).toContain("(viec, tu_dong) VALUES ('SAO_LUU_KHO_TEP', false)"); // "-" = không người bấm
    const h = await nhip({ VIEC: '8 SAO_LUU_KHO_TEP -', MC_HONG: '1' });
    expect(xong(h)[0]).toContain('ops.tac_tu_xong(8, false,');
  });

  it('việc NGOÀI danh sách trắng → không chạy gì, báo LỖI nói rõ', async () => {
    const k = await nhip({ VIEC: '9 XOA_HET -' });
    expect(k.goi).not.toContain(' ops backup');
    expect(k.goi).not.toContain('--entrypoint sh minio');
    expect(k.lanChay).toBe('');
    expect(xong(k)[0]).toMatch(/ops\.tac_tu_xong\(9, false, [\s\S]*không có trong danh sách được phép chạy/);
  });

  it.each([
    ['mã việc mang lệnh', '7;touch${IFS}/tmp/x SAO_LUU_CSDL -'],
    ['mã việc rỗng chữ', 'abc SAO_LUU_CSDL -'],
  ])('%s → bỏ việc, không chạy gì, không câu SQL nào mang chuỗi ấy', async (_t, viec) => {
    const k = await nhip({ VIEC: viec });
    expect(k.goi).not.toContain(' ops backup');
    expect(xong(k)).toEqual([]);
    expect(k.sql).not.toContain('touch');
  });

  it('người bấm không đúng dạng uuid → vẫn sao lưu, nhưng KHÔNG đưa chuỗi ấy vào SQL', async () => {
    const k = await nhip({ VIEC: "7 SAO_LUU_CSDL x');DROP-TABLE-ops.lan_chay;--" });
    expect(k.goi).toContain(' ops backup');
    expect(k.lanChay).toContain("(viec, tu_dong) VALUES ('SAO_LUU_CSDL', false)");
    expect(k.lanChay).not.toContain('DROP');
  });

  it('CSDL không trả lời → thoát lỗi kèm câu nói rõ, không làm việc định kỳ nào', async () => {
    const k = await nhip({ DB_HONG: '1' });
    expect(k.ma).not.toBe(0);
    expect(k.ra).toContain('không nối được CSDL');
    expect(k.goi).not.toContain(' ps -a');
  });

  it('tham số lạ → từ chối', async () => {
    const k = await chay(chuanBi(), ['tac-tu', '--chay-mot']);
    expect(k.ma).toBe(2);
    expect(k.sql).toBe('');
  });
});

describe('`0254` VÒNG LẶP thật (không --mot-nhip)', () => {
  /** Chạy `./csbh tac-tu` nhịp 1 giây tới khi có một lượt báo xong, rồi dừng. */
  const vongLap = async (dat: Record<string, string>) => {
    const d = chuanBi();
    const nhatKy = join(d, 'goi.log');
    for (const t of [nhatKy, `${nhatKy}.sql`, `${nhatKy}.lanchay`]) writeFileSync(t, '');
    const p = spawn('sh', [join(d, 'csbh'), 'tac-tu'], {
      cwd: d,
      env: { ...process.env, CSBH_ENV: join(d, ".env"), PATH: `${d}:${process.env.PATH}`, NHAT_KY: nhatKy, LOG_GIA: join(d, 'logs'), LICH: 'khong 9', TAC_TU_NHIP: '1', ...dat },
    });
    try {
      for (let i = 0; i < 100 && !readFileSync(`${nhatKy}.sql`, 'utf8').includes('ops.tac_tu_xong'); i++) {
        await new Promise((r) => setTimeout(r, 200));
      }
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      p.kill();
    }
    return readFileSync(`${nhatKy}.sql`, 'utf8');
  };

  it('chụp kho tệp HỎNG trong vòng lặp → báo LỖI, không phải THÀNH CÔNG', async () => {
    const sql = await vongLap({ VIEC: '8 SAO_LUU_KHO_TEP -', MC_HONG: '1' });
    const x = sql.split('----').filter((s) => s.includes('ops.tac_tu_xong'));
    expect(x.length).toBeGreaterThan(0);
    expect(x[0]).toContain('ops.tac_tu_xong(8, false,');
  }, 30_000);

  it('khởi động: gọi dọn việc dở; nhịp tim TIẾP TỤC (báo BẬN) trong lúc một lượt sao lưu dài chạy nền', async () => {
    // Sao lưu giả mất 4 giây, nhịp 1 giây: chạy tiền cảnh thì không có nhịp nào giữa lúc nhận
    // việc và lúc xong — trang sẽ báo mất liên lạc đúng lúc đang sao lưu.
    const sql = await vongLap({ VIEC: `7 SAO_LUU_CSDL ${UUID}`, BACKUP_CHAM: '4' });
    expect(sql).toContain('SELECT ops.tac_tu_khoi_dong()');
    const truocXong = sql.slice(0, sql.indexOf('ops.tac_tu_xong'));
    expect(truocXong.split(', false)').length - 1, 'nhịp báo BẬN trong lúc sao lưu').toBeGreaterThanOrEqual(2);
    expect(sql.split('ops.tac_tu_xong(').length - 1, 'không nhận việc thứ hai khi đang bận').toBe(1);
  }, 30_000);
});

describe('`0254` khoá sao lưu: lượt bấm trùng lượt theo lịch', () => {
  it('khoá đang bị giữ → việc web báo LỖI (không phải "xong"), không sao lưu', async () => {
    const d = chuanBi();
    const giu = spawn('flock', [join(d, 'run', 'khoa-sao-luu'), 'sleep', '5']);
    await new Promise((r) => setTimeout(r, 300));
    try {
      const k = await nhip({ VIEC: `7 SAO_LUU_CSDL ${UUID}` }, d);
      expect(k.goi).not.toContain(' ops backup');
      expect(xong(k)[0]).toMatch(/ops\.tac_tu_xong\(7, false, [\s\S]*một lượt sao lưu khác đang chạy/);
    } finally {
      giu.kill();
    }
  });
});

describe('`0254` việc định kỳ của tác tử', () => {
  const dem = (k: Kq) => ({
    container: k.goi.includes(' ps -a --format json'),
    log: k.goi.includes(' logs --no-color'),
    docker: k.goi.includes('system df -v'),
  });

  it('nhịp đầu làm cả ba; sau đó đúng chu kỳ: container 60 giây, log 5 phút, docker 1 giờ', async () => {
    const d = chuanBi();
    expect(dem(await nhip({ CSBH_EPOCH: '1000000' }, d))).toEqual({ container: true, log: true, docker: true });
    expect(dem(await nhip({ CSBH_EPOCH: '1000030' }, d))).toEqual({ container: false, log: false, docker: false });
    expect(dem(await nhip({ CSBH_EPOCH: '1000061' }, d))).toEqual({ container: true, log: false, docker: false });
    expect(dem(await nhip({ CSBH_EPOCH: '1000301' }, d))).toEqual({ container: true, log: true, docker: false });
    expect(dem(await nhip({ CSBH_EPOCH: '1003601' }, d))).toEqual({ container: true, log: true, docker: true });
  });

  it('chuyển nguyên văn đầu ra docker vào hàm SQL; docker đo theo ĐÚNG dự án compose', async () => {
    const k = await nhip();
    expect(k.sql).toContain('SELECT ops.ghi_container($csbh_j${"Service":"postgres","State":"running","Health":"healthy"}');
    expect(k.sql).toMatch(/SELECT ops\.ghi_docker\(\$csbh_j\$csbh-prod\$csbh_j\$,\s*\$csbh_j\$\{"Type":"Images"/);
    expect(k.sql).toContain('"Name":"csbh-prod_pgdata"');
  });

  it('log hạ tầng: ghi QUA container van-hanh vào thư mục log chung, tên <service>-<ngày>.log; dòng trước nửa đêm VN vào tệp HÔM QUA', async () => {
    const k = await nhip();
    expect(readdirSync(k.log).sort()).toEqual(['postgres-2026-11-05.log', 'postgres-2026-11-06.log', 'redis-2026-11-06.log']);
    expect(readFileSync(join(k.log, 'postgres-2026-11-05.log'), 'utf8')).toContain('checkpoint trước nửa đêm VN');
    expect(readFileSync(join(k.log, 'postgres-2026-11-06.log'), 'utf8')).toContain('sau nửa đêm VN');
    expect(readFileSync(join(k.log, 'postgres-2026-11-06.log'), 'utf8')).not.toContain('trước nửa đêm');
    for (const svc of ['postgres', 'redis', 'rabbitmq', 'minio', 'gotenberg', 'caddy']) expect(k.goi).toMatch(new RegExp(`logs --no-color.* ${svc}\\n`));
  });

  it('con trỏ mốc: lượt sau hỏi --since = dòng cuối + 1 nano giây; service không có dòng nào thì chưa có mốc', async () => {
    const d = chuanBi();
    await nhip({ CSBH_EPOCH: '1000000' }, d);
    expect(readFileSync(join(d, 'run', 'tac-tu', 'moc-log', 'postgres'), 'utf8').trim()).toBe('2026-11-05T17:00:01.000000010Z');
    expect(existsSync(join(d, 'run', 'tac-tu', 'moc-log', 'minio'))).toBe(false);
    const k = await nhip({ CSBH_EPOCH: '1000301' }, d);
    expect(k.goi).toContain('logs --no-color --no-log-prefix --timestamps --since 2026-11-05T17:00:01.000000010Z postgres');
    expect(k.goi).toMatch(/logs --no-color --no-log-prefix --timestamps minio\n/);
  });

  it('van-hanh không nhận ghi → con trỏ KHÔNG tiến; lượt sau thu lại từ đầu, không mất dòng', async () => {
    const d = chuanBi();
    const k = await nhip({ VAN_HANH_HONG: '1' }, d);
    expect(k.ra).toContain('không ghi được log postgres');
    expect(existsSync(join(d, 'run', 'tac-tu', 'moc-log', 'postgres'))).toBe(false);
    const k2 = await nhip({ CSBH_EPOCH: '1000301' }, d);
    expect(k2.goi).toMatch(/logs --no-color --no-log-prefix --timestamps postgres\n/);
    expect(readFileSync(join(k2.log, 'postgres-2026-11-05.log'), 'utf8')).toContain('trước nửa đêm');
  });

  it('không xác định được hôm qua (date không có -d) → mọi dòng vào tệp hôm nay, không mất dòng nào', async () => {
    const k = await nhip({ CSBH_HOM_QUA: '' }, (() => {
      const d = chuanBi();
      // `date` giả không hiểu `-d` (như busybox): hôm qua thành rỗng.
      writeFileSync(join(d, 'date'), '#!/bin/sh\ncase "$*" in *-d*) exit 1 ;; *) exec /bin/date "$@" ;; esac\n');
      chmodSync(join(d, 'date'), 0o755);
      return d;
    })());
    const t = readFileSync(join(k.log, 'postgres-2026-11-06.log'), 'utf8');
    expect(t).toContain('trước nửa đêm');
    expect(t).toContain('sau nửa đêm');
  });
});

describe('`0254` bộ giao: unit systemd', () => {
  const unit = readFileSync('deploy/systemd/csbh-tac-tu.service', 'utf8');
  it('ExecStart gọi đúng lệnh con `tac-tu` có thật; tự chạy lại khi chết; chờ docker', () => {
    // `0270`: unit là MẪU — `cai-dat.sh` thay `__CSBH__` bằng `/opt/csbh/current/csbh`.
    expect(unit).toMatch(/^ExecStart=__CSBH__ tac-tu$/m);
    expect(readFileSync('scripts/cai-dat.sh', 'utf8')).toContain('s|__CSBH__|$GOC_CT/current/csbh|g');
    expect(readFileSync('scripts/csbh', 'utf8')).toMatch(/^  tac-tu\)/m);
    expect(unit).toMatch(/^Restart=always$/m);
    expect(unit).toMatch(/^Requires=docker\.service$/m);
  });
  it('gói giao mang theo unit', () => {
    // `0270`: gói dựng bằng `ban-cai.sh` — một danh sách cho bộ cài lẫn lượt cập nhật.
    expect(readFileSync('scripts/dong-goi.sh', 'utf8')).toContain('sh scripts/ban-cai.sh');
    expect(readFileSync('scripts/ban-cai.sh', 'utf8')).toContain('deploy/systemd/csbh-tac-tu.service');
  });
});
