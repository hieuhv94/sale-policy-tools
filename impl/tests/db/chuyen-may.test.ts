/**
 * `0246` — `scripts/chuyen-may.sh`: phần chạy trong ảnh `ops` của chuyển máy.
 *
 * Câu hỏi cả chặng là *"máy mới có đúng y như máy cũ không"*, và nó chỉ trả lời
 * được nếu BẢNG KÊ nhạy với đúng những gì có thể lệch: một ô, một dòng, một giá
 * trị sequence, một byte trong tệp, một khoá tệp không có tệp. Mỗi ca dưới đây
 * đổi ĐÚNG một thứ và đòi bảng kê lệch ĐÚNG ở chỗ ấy — và ngược lại, hai lượt kê
 * trên cùng dữ liệu (kể cả khác múi giờ phiên) phải ra y hệt.
 *
 * Chạy CHÍNH script, trên Postgres thật, với `openssl` thật (ảnh kiểm thêm gói ấy
 * ở `0246`) — không giả lập gì.
 */
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin } from './helpers';

const run = promisify(execFile);

const ENV = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? 'postgres',
  PGUSER: 'postgres',
  PGPASSWORD: process.env.PG_PASSWORD ?? 'csbh_dev_pw',
  PGDATABASE: 'csbh',
};

async function cm(args: string[], them: Record<string, string> = {}) {
  try {
    const r = await run('sh', ['scripts/chuyen-may.sh', ...args], { env: { ...ENV, ...them }, maxBuffer: 64 << 20 });
    return { ma: 0, ra: r.stdout, loi: r.stderr };
  } catch (e) {
    const x = e as { code?: number; stdout?: string; stderr?: string };
    return { ma: x.code ?? 1, ra: x.stdout ?? '', loi: x.stderr ?? '' };
  }
}

const psql = async (sql: string) =>
  (await run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { env: ENV })).stdout.trim();

const thu = () => mkdtempSync(join(tmpdir(), 'cm-'));

/** Dựng một bảng kê trong thư mục mới; `tep` là cây tệp giả của kho (tuỳ chọn). */
async function ke(tep: Record<string, string> = {}, them: Record<string, string> = {}) {
  const d = thu();
  for (const [p, nd] of Object.entries(tep)) {
    mkdirSync(join(d, 'tep', p, '..'), { recursive: true });
    writeFileSync(join(d, 'tep', p), nd);
  }
  const r = await cm(['ban-ke', d], them);
  expect(r.ma, r.loi).toBe(0);
  return d;
}

const dongLech = (ra: string) => ra.split('\n').filter((d) => /^[-+][^-+]/.test(d));

beforeAll(async () => {
  await psql(`
    DROP SCHEMA IF EXISTS zz_cm CASCADE;
    CREATE SCHEMA zz_cm;
    CREATE TABLE zz_cm.t (id int PRIMARY KEY, ten text, lu timestamptz DEFAULT now(), object_key text);
    INSERT INTO zz_cm.t (id, ten, object_key) VALUES (1, 'một', 'zz-cm/k-co'), (2, 'hai', 'zz-cm/k-thieu');
    CREATE SEQUENCE zz_cm.s;
    SELECT nextval('zz_cm.s');
    CREATE TABLE zz_cm.outbox (id serial PRIMARY KEY, published_at timestamptz);`);
});

afterAll(async () => {
  await psql('DROP SCHEMA IF EXISTS zz_cm CASCADE');
});

const TEP = { 'csbh/zz-cm/k-co': 'noi dung tep' };

describe('`0246` bảng kê: cùng dữ liệu thì y hệt', () => {
  it('hai lượt kê liền nhau → so-sanh KHỚP, thoát 0', async () => {
    const a = await ke(TEP);
    const b = await ke(TEP);
    const r = await cm(['so-sanh', a, b]);
    expect(r.ma, r.ra).toBe(0);
    expect(r.ra).toContain('KHỚP');
  });

  it('múi giờ của PHIÊN không đổi bảng kê (cột timestamptz)', async () => {
    const a = await ke(TEP);
    const b = await ke(TEP, { PGTZ: 'Asia/Tokyo' });
    expect(readFileSync(join(b, 'csdl.txt'), 'utf8')).toBe(readFileSync(join(a, 'csdl.txt'), 'utf8'));
  });

  it('cùng NỘI DUNG mà khác thứ tự VẬT LÝ trên đĩa → vẫn y hệt', async () => {
    /*
     * Máy mới nạp lại từ bản dump, và sau cập nhật/vacuum các dòng nằm trên đĩa
     * theo thứ tự khác máy cũ. Phá lại *"bỏ `ORDER BY` khỏi bảng kê"* XANH với
     * mọi ca khác — chúng kê hai lần trên CÙNG một CSDL, nên thứ tự vật lý tình
     * cờ trùng. Ca này xếp lại dòng trên đĩa mà giữ nguyên nội dung.
     */
    await psql(`CREATE TABLE zz_cm.u (id int, ten text); INSERT INTO zz_cm.u VALUES (1, 'a'), (2, 'b'), (3, 'c')`);
    const a = await ke();
    await psql(`
      CREATE TEMP TABLE x AS SELECT * FROM zz_cm.u;
      TRUNCATE zz_cm.u;
      INSERT INTO zz_cm.u SELECT * FROM x ORDER BY id DESC`);
    const b = await ke();
    const dong = (d: string) => readFileSync(join(d, 'csdl.txt'), 'utf8').split('\n').find((l) => l.startsWith('zz_cm.u|'));
    expect(dong(b)).toBe(dong(a));
  });

  it('câu DỰNG DANH SÁCH BẢNG hỏng mà câu sau chạy êm → bảng kê THOÁT LỖI, không ra bảng kê thiếu', async () => {
    /*
     * Đúng hình dạng lỗi đã gặp: một dấu nháy kép trong chú thích làm vỡ chuỗi
     * shell, `psql` ĐẦU đường ống hỏng còn `psql` CUỐI chạy êm — và `ban-ke` thoát
     * 0 với mỗi dòng sequence. Hai đầu hỏng cùng kiểu là đối chiếu báo KHỚP GIẢ.
     *
     * Ca *"sai mật khẩu CSDL"* KHÔNG tái hiện được điều này (phá lại: gỡ cả hai chốt
     * vẫn xanh) — sai mật khẩu thì `psql` cuối cũng hỏng và `set -e` bắt hộ. Nên ở
     * đây một `psql` GIẢ đứng đầu `PATH`, hỏng ĐÚNG ở câu hỏi `pg_class`, mọi câu
     * khác chuyển cho `psql` thật.
     */
    const bin = thu();
    writeFileSync(
      join(bin, 'psql'),
      '#!/bin/sh\ncase "$*" in *pg_class*) echo "psql giả: hỏng" >&2; exit 2 ;; esac\nexec /usr/bin/psql "$@"\n',
    );
    await run('chmod', ['+x', join(bin, 'psql')]);
    const r = await cm(['ban-ke', thu()], { PATH: `${bin}:${process.env.PATH}` });
    expect(r.ma, r.ra).not.toBe(0);
  });

  it('BẢNG TẠM của một phiên khác đang mở KHÔNG lọt vào bảng kê', async () => {
    /*
     * Tìm ra vì một ca CHẬP CHỜN: ca thứ tự vật lý dùng một bảng tạm, và ở một
     * lượt `make test` bảng kê liệt kê trúng nó trong lúc phiên kia đang đóng —
     * "relation pg_temp_3.x does not exist". Ca này giữ phiên mở suốt lượt kê,
     * nên nó tất định: thiếu chốt loại bảng tạm là kê vào `pg_temp_*` mỗi lần.
     */
    const c = admin();
    await c.connect();
    try {
      await c.query('CREATE TEMP TABLE zz_cm_tam (a int); INSERT INTO zz_cm_tam VALUES (1)');
      const d = await ke();
      expect(readFileSync(join(d, 'csdl.txt'), 'utf8')).not.toMatch(/^pg_temp/m);
    } finally {
      await c.end();
    }
  });

  it('kê ĐỦ mọi schema của phần mềm, kèm sequence', async () => {
    const d = await ke();
    const csdl = readFileSync(join(d, 'csdl.txt'), 'utf8');
    for (const b of ['idn.app_user', 'pol.policy', 'pol.policy_line', 'cus.customer', 'cat.product', 'doc.stored_file', 'aud.audit_log', 'zz_cm.t']) {
      expect(csdl, b).toMatch(new RegExp(`^${b.replace('.', '\\.')}\\|`, 'm'));
    }
    expect(csdl).toMatch(/^seq:pol\.policy_code_seq\|/m);
  });
});

describe('`0246` bảng kê: đổi MỘT thứ thì lệch ĐÚNG chỗ ấy', () => {
  it('đổi một ô → chỉ dòng của bảng ấy lệch', async () => {
    const a = await ke(TEP);
    await psql(`UPDATE zz_cm.t SET ten = 'một!' WHERE id = 1`);
    const b = await ke(TEP);
    const r = await cm(['so-sanh', a, b]);
    expect(r.ma).toBe(1);
    expect(r.ra).toContain('LỆCH ở csdl.txt');
    expect(dongLech(r.ra).every((d) => d.slice(1).startsWith('zz_cm.t|')), r.ra).toBe(true);
  });

  it('thêm một dòng → số dòng đổi', async () => {
    const a = await ke(TEP);
    await psql(`INSERT INTO zz_cm.t (id, ten) VALUES (3, 'ba')`);
    const b = await ke(TEP);
    const r = await cm(['so-sanh', a, b]);
    expect(r.ma).toBe(1);
    expect(dongLech(r.ra).some((d) => d.startsWith('+zz_cm.t|3|'))).toBe(true);
  });

  it('sequence nhảy → lệch (mã hồ sơ đề xuất đọc từ sequence)', async () => {
    const a = await ke(TEP);
    await psql(`SELECT nextval('zz_cm.s')`);
    const b = await ke(TEP);
    const r = await cm(['so-sanh', a, b]);
    expect(r.ma).toBe(1);
    expect(dongLech(r.ra).map((d) => d.slice(1).split('|')[0])).toEqual(['seq:zz_cm.s', 'seq:zz_cm.s']);
  });

  it('một byte trong một tệp → lệch ở tep.txt', async () => {
    const a = await ke(TEP);
    const b = await ke({ 'csbh/zz-cm/k-co': 'noi dung tep!' });
    const r = await cm(['so-sanh', a, b]);
    expect(r.ma).toBe(1);
    expect(r.ra).toContain('LỆCH ở tep.txt');
  });

  it('khoá tệp CSDL trỏ tới mà kho không có → liệt kê đúng khoá ấy', async () => {
    const d = await ke(TEP);
    const thieu = readFileSync(join(d, 'khoa-thieu.txt'), 'utf8').split('\n');
    expect(thieu).toContain('zz-cm/k-thieu');
    expect(thieu).not.toContain('zz-cm/k-co');
  });
});

describe('`0246` chờ xả', () => {
  it('đếm sự kiện chưa gửi ở MỌI bảng outbox, kể cả bảng mới', async () => {
    const truoc = Number((await cm(['cho-xa'])).ra.trim());
    await psql(`INSERT INTO zz_cm.outbox (published_at) VALUES (NULL), (NULL), (now())`);
    const sau = Number((await cm(['cho-xa'])).ra.trim());
    expect(sau - truoc).toBe(2);
  });
});

describe('`0246` gói bí mật — openssl THẬT', () => {
  const dung = () => {
    const cai = thu();
    writeFileSync(join(cai, '.env'), 'COMPOSE_PROJECT_NAME=csbh-prod\nCSBH_TAG=1.1.0\n');
    mkdirSync(join(cai, 'secrets'));
    writeFileSync(join(cai, 'secrets', 'pg_password.txt'), 'bi-mat-that');
    return cai;
  };

  it('đóng rồi mở bằng ĐÚNG mật khẩu → ra nguyên .env và secrets/', async () => {
    const cai = dung();
    const ra = join(thu(), 'bi-mat.enc');
    expect((await cm(['bi-mat-dong', cai, ra], { CSBH_MAT_KHAU: 'mat-khau-dai-12' })).ma).toBe(0);
    // Gói không được mang bí mật ở dạng đọc được.
    expect(readFileSync(ra).includes(Buffer.from('bi-mat-that'))).toBe(false);
    const mo = thu();
    const r = await cm(['bi-mat-mo', ra, mo], { CSBH_MAT_KHAU: 'mat-khau-dai-12' });
    expect(r.ma, r.loi).toBe(0);
    expect(readFileSync(join(mo, '.env'), 'utf8')).toContain('CSBH_TAG=1.1.0');
    expect(readFileSync(join(mo, 'secrets', 'pg_password.txt'), 'utf8')).toBe('bi-mat-that');
  });

  it('SAI mật khẩu → thoát 1, không ra tệp nào', async () => {
    const cai = dung();
    const ra = join(thu(), 'bi-mat.enc');
    await cm(['bi-mat-dong', cai, ra], { CSBH_MAT_KHAU: 'mat-khau-dai-12' });
    const mo = thu();
    const r = await cm(['bi-mat-mo', ra, mo], { CSBH_MAT_KHAU: 'mat-khau-SAI-12' });
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('SAI mật khẩu');
  });

  it('thiếu mật khẩu → không mã hoá gì', async () => {
    const r = await cm(['bi-mat-dong', dung(), join(thu(), 'x.enc')]);
    expect(r.ma).toBe(2);
  });
});

describe('`0246` gói dữ liệu: chép hỏng giữa đường thì biết', () => {
  it('đóng rồi mở → nguyên vẹn; sửa một byte của gói → mo-goi DỪNG', async () => {
    const vao = thu();
    writeFileSync(join(vao, 'a.txt'), 'xin chao');
    const ra = join(thu(), 'goi.tar');
    expect((await cm(['dong-goi', vao, ra])).ma).toBe(0);
    const mo = thu();
    expect((await cm(['mo-goi', ra, join(mo, 'x')])).ma).toBe(0);
    expect(readFileSync(join(mo, 'x', 'a.txt'), 'utf8')).toBe('xin chao');

    const b = readFileSync(ra);
    const i = b.indexOf(Buffer.from('xin chao'));
    b[i] = 'X'.charCodeAt(0);
    writeFileSync(ra, b);
    const r = await cm(['mo-goi', ra, join(thu(), 'y')]);
    expect(r.ma).toBe(1);
    expect(r.loi).toContain('chép hỏng');
  });
});
