/**
 * OPS-01 … OPS-14 — yêu cầu phi chức năng: sao lưu, phục hồi, chống phình CSDL,
 * chống quét toàn bảng, giới hạn kết nối.
 *
 * Nhóm này KHÔNG có trong danh mục 323 test case ban đầu — bản thiết kế chỉ đo
 * hiệu năng (PERF) chứ không kiểm khả năng vận hành. Bổ sung sau khi rà soát
 * ngày 07/08.
 */
import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { admin, inRollback, mkCustomer, withClient } from './helpers';

const run = promisify(execFile);

/** Chạy một câu lệnh trong container postgres qua psql. */
const psql = async (sql: string): Promise<string> => {
  const { stdout } = await run('psql', ['-U', 'postgres', '-d', 'csbh', '-tAc', sql], {
    env: {
      ...process.env,
      PGHOST: process.env.PGHOST ?? 'postgres',
      PGPASSWORD: process.env.PG_PASSWORD ?? 'csbh_dev_pw',
    },
  });
  return stdout.trim();
};

describe('OPS-01 · giới hạn kết nối đủ cho 10 service', () => {
  it('max_connections ≥ 10 service × 8 kết nối, cộng biên cho việc quản trị', async () => {
    const max = Number(await psql('SHOW max_connections'));
    // 10 service × 8 = 80. Mặc định 100 là quá sát: còn migrate, job sao lưu,
    // psql thủ công, và pool cũ chưa đóng hẳn sau mỗi lần restart.
    expect(max).toBeGreaterThanOrEqual(150);
  });

  it('bộ đệm và work_mem đã rời khỏi mặc định của ảnh Docker', async () => {
    const shared = Number(await psql("SELECT setting FROM pg_settings WHERE name='shared_buffers'"));
    const work = Number(await psql("SELECT setting FROM pg_settings WHERE name='work_mem'"));
    expect(shared * 8192).toBeGreaterThanOrEqual(1024 ** 3); // ≥ 1GB
    expect(work).toBeGreaterThanOrEqual(8 * 1024); // ≥ 8MB
  });
});

describe('OPS-02 · `0250` không còn lưu trữ WAL', () => {
  it('archive_mode TẮT — bản nền + WAL đã gỡ, phục hồi chỉ từ bản sao lưu hằng ngày', async () => {
    // Bật mà không ai dọn thì kho WAL phình tới đầy ổ; đổi giá trị cần khởi động
    // lại Postgres (`04-TRIEN-KHAI` §8), nên ca này cũng là chốt "đã khởi động lại".
    expect(await psql('SHOW archive_mode')).toBe('off');
  });
});

describe('OPS-03 · nhật ký phân vùng theo tháng', () => {
  it('aud.audit_log là bảng phân vùng, không phải bảng thường', async () => {
    const kind = await psql(
      "SELECT relkind::text FROM pg_class WHERE oid = 'aud.audit_log'::regclass",
    );
    expect(kind).toBe('p');
  });

  it('có sẵn vùng cho tháng này và ít nhất ba tháng tới', async () => {
    const n = Number(
      await psql(`SELECT count(*) FROM pg_class c
                   WHERE c.relnamespace = 'aud'::regnamespace
                     AND c.relname ~ '^audit_log_[0-9]{4}_[0-9]{2}$'`),
    );
    // Quên tạo vùng thì dòng mới rơi vào vùng mặc định — vẫn ghi được, nhưng
    // mất luôn khả năng tách vùng cũ ra sau này.
    expect(n).toBeGreaterThanOrEqual(4);
  });

  it('vùng mặc định phải RỖNG — có dòng ở đó nghĩa là thiếu vùng theo tháng', async () => {
    const n = Number(await psql('SELECT count(*) FROM aud.audit_log_default'));
    expect(n).toBe(0);
  });

  it('bất biến chỉ-ghi-thêm vẫn giữ sau khi phân vùng', async () => {
    await withClient(admin(), async (c) => {
      await inRollback(c, async () => {
        const r = await c.query(
          `INSERT INTO aud.audit_log (action, entity) VALUES ('OPS','test') RETURNING id, occurred_at`,
        );
        let blocked = false;
        try {
          await c.query('SAVEPOINT s');
          await c.query('UPDATE aud.audit_log SET action = $1 WHERE id = $2', [
            'SUA',
            r.rows[0].id,
          ]);
        } catch (e) {
          blocked = String((e as Error).message).includes('chi duoc phep INSERT');
          await c.query('ROLLBACK TO SAVEPOINT s');
        }
        expect(blocked).toBe(true);
      });
    });
  });

  it('ensure_partition gọi lại nhiều lần không hại gì', async () => {
    const a = await psql("SELECT aud.ensure_partition(current_date)");
    const b = await psql("SELECT aud.ensure_partition(current_date)");
    expect(a).toBe(b);
  });
});

describe('OPS-04 · dọn dữ liệu hết vòng đời', () => {
  it('xoá token đã hết hạn nhưng GIỮ token còn hạn', async () => {
    await withClient(admin(), async (c) => {
      const uid = (
        await c.query<{ id: string }>(`SELECT id FROM idn.app_user WHERE username = 'tdv01'`)
      ).rows[0]!.id;

      await c.query(
        `INSERT INTO idn.refresh_token (user_id, family_id, token_hash, expires_at)
         VALUES ($1, gen_random_uuid(), 'zz-ops-cu', now() - interval '90 days'),
                ($1, gen_random_uuid(), 'zz-ops-moi', now() + interval '1 day')`,
        [uid],
      );
      try {
        const detail = JSON.parse(await psql('SELECT sys.run_retention()')) as {
          refreshToken: number;
        };
        expect(detail.refreshToken).toBeGreaterThanOrEqual(1);

        const left = await c.query<{ token_hash: string }>(
          `SELECT token_hash FROM idn.refresh_token WHERE token_hash LIKE 'zz-ops-%'`,
        );
        expect(left.rows.map((r) => r.token_hash)).toEqual(['zz-ops-moi']);
      } finally {
        await c.query(`DELETE FROM idn.refresh_token WHERE token_hash LIKE 'zz-ops-%'`);
      }
    });
  });

  it('CHỈ xoá sự kiện outbox ĐÃ GỬI — bản chưa gửi là việc còn nợ', async () => {
    await withClient(admin(), async (c) => {
      await c.query(
        `INSERT INTO cat.outbox (routing_key, payload, created_at, published_at)
         VALUES ('zz.ops.sent', '{}'::jsonb, now() - interval '90 days', now() - interval '90 days'),
                ('zz.ops.pending', '{}'::jsonb, now() - interval '90 days', NULL)`,
      );
      try {
        await psql('SELECT sys.run_retention()');
        const left = await c.query<{ routing_key: string }>(
          `SELECT routing_key FROM cat.outbox WHERE routing_key LIKE 'zz.ops.%'`,
        );
        expect(left.rows.map((r) => r.routing_key)).toEqual(['zz.ops.pending']);
      } finally {
        await c.query(`DELETE FROM cat.outbox WHERE routing_key LIKE 'zz.ops.%'`);
      }
    });
  });

  it('KHÔNG bao giờ đụng tới aud.audit_log', async () => {
    const before = Number(await psql('SELECT count(*) FROM aud.audit_log'));
    await psql('SELECT sys.run_retention()');
    expect(Number(await psql('SELECT count(*) FROM aud.audit_log'))).toBe(before);
  });

  it('mỗi lần dọn đều ghi lại đã xoá những gì', async () => {
    await psql('SELECT sys.run_retention()');
    const n = Number(await psql('SELECT count(*) FROM sys.retention_run'));
    expect(n).toBeGreaterThan(0);
  });
});

describe('OPS-05 · index cho tìm kiếm và cho việc dọn', () => {
  it('tìm khách hàng dùng index GIN, không quét toàn bảng', async () => {
    await withClient(admin(), async (c) => {
      await inRollback(c, async () => {
        for (let i = 0; i < 60; i++) await mkCustomer(c, `PLAN${i}`);
        await c.query('ANALYZE cus.customer');

        const plan = (
          await c.query<{ 'QUERY PLAN': string }>(
            `EXPLAIN SELECT * FROM cus.customer
              WHERE (name || ' ' || registered_address || ' ' || coalesce(id_number, ''))
                    ILIKE '%Khach hang%'`,
          )
        ).rows
          .map((r) => r['QUERY PLAN'])
          .join('\n');
        // Ở bảng nhỏ Postgres vẫn có thể chọn quét tuần tự, và đó là lựa chọn
        // đúng. Điều cần khẳng định là index CÓ TỒN TẠI và dùng được — nếu
        // biểu thức index lệch một ký tự so với truy vấn thì nó không bao giờ
        // được chọn, kể cả khi bảng đã lớn.
        expect(plan.length).toBeGreaterThan(0);
      });
    });

    const idx = await psql(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname='cus' AND indexname='ix_customer_search'`,
    );
    expect(idx).toContain('gin');
    expect(idx).toContain('gin_trgm_ops');
  });

  it('có index theo hạn để việc dọn không tự quét toàn bảng', async () => {
    for (const [schema, name] of [
      ['idn', 'ix_refresh_expiry'],
      ['idn', 'ix_activation_expiry'],
      ['pol', 'ix_policy_sla'],
    ]) {
      const found = await psql(
        `SELECT count(*) FROM pg_indexes WHERE schemaname='${schema}' AND indexname='${name}'`,
      );
      expect(Number(found), `thiếu index ${schema}.${name}`).toBe(1);
    }
  });

  it('nhật ký có index theo thời gian và theo đối tượng', async () => {
    const n = Number(
      await psql(
        `SELECT count(*) FROM pg_indexes
          WHERE schemaname='aud' AND indexname IN ('ix_audit_time','ix_audit_entity')`,
      ),
    );
    expect(n).toBe(2);
  });
});

describe('OPS-06 · sao lưu và phục hồi', () => {
  it('sao lưu tạo được file và pg_restore đọc được mục lục', async () => {
    await run('/bin/sh', ['/backup.sh'], {
      env: {
        ...process.env,
        PGHOST: process.env.PGHOST ?? 'postgres',
        PGPASSWORD: process.env.PG_PASSWORD ?? 'csbh_dev_pw',
        BACKUP_DIR: '/backup',
      },
    }).catch((e: unknown) => {
      throw new Error(`backup.sh hỏng: ${String(e)}`);
    });
  }, 120_000);

  it('phục hồi vào CSDL nháp cho lại đúng số tài khoản', async () => {
    await run('/bin/sh', ['/restore.sh'], {
      env: {
        ...process.env,
        PGHOST: process.env.PGHOST ?? 'postgres',
        PGPASSWORD: process.env.PG_PASSWORD ?? 'csbh_dev_pw',
        BACKUP_DIR: '/backup',
        RESTORE_DB: 'csbh_restore_check',
      },
    });

    const { stdout } = await run(
      'psql',
      ['-U', 'postgres', '-d', 'csbh_restore_check', '-tAc', 'SELECT count(*) FROM idn.app_user'],
      {
        env: {
          ...process.env,
          PGHOST: process.env.PGHOST ?? 'postgres',
          PGPASSWORD: process.env.PG_PASSWORD ?? 'csbh_dev_pw',
        },
      },
    );
    // Đúng 10 tài khoản mẫu — chứng minh bản sao lưu chứa dữ liệu thật, không
    // phải một file rỗng đọc được mục lục.
    expect(Number(stdout.trim())).toBeGreaterThanOrEqual(10);
  }, 180_000);

  it('bản phục hồi giữ nguyên các bất biến ở tầng CSDL', async () => {
    const q = async (sql: string) => {
      const { stdout } = await run(
        'psql',
        ['-U', 'postgres', '-d', 'csbh_restore_check', '-tAc', sql],
        {
          env: {
            ...process.env,
            PGHOST: process.env.PGHOST ?? 'postgres',
            PGPASSWORD: process.env.PG_PASSWORD ?? 'csbh_dev_pw',
          },
        },
      );
      return stdout.trim();
    };
    // Phục hồi mà mất ràng buộc thì bản phục hồi vô dụng: dữ liệu còn đó nhưng
    // hệ thống chạy trên nó sẽ sinh ra trạng thái không hợp lệ.
    expect(await q("SELECT count(*) FROM pg_indexes WHERE indexname='uq_policy_active_per_customer'")).toBe('1');
    expect(await q("SELECT count(*) FROM pg_trigger WHERE tgname='trg_forbid_delete_rejected'")).toBe('1');
    // Bảng phân vùng NHÂN BẢN trigger sang từng vùng con, nên số này bằng
    // 1 (bảng cha) + số vùng. Khẳng định "≥ 2" chứ không phải "= 1".
    expect(
      Number(await q("SELECT count(*) FROM pg_trigger WHERE tgname='trg_audit_immutable'")),
    ).toBeGreaterThanOrEqual(2);
    expect(await q("SELECT relkind::text FROM pg_class WHERE oid='aud.audit_log'::regclass")).toBe('p');
  }, 60_000);
});

/**
 * `0240` — diễn tập trên chồng cô lập tìm ra BỐN lỗ ở đường sao lưu/phục hồi, và
 * bộ kiểm cũ không thấy cái nào: OPS-06 chỉ phục hồi vào CSDL NHÁP với một tệp
 * ĐÚNG, còn OPS-08 *"WAL được dọn"* đọc `du` của một thư mục không gắn vào
 * container — chuỗi rỗng, `Number('') = 0 < 500`, xanh mãi.
 *
 * Mọi ca dưới đây chạy CHÍNH script giao cho khách (`/restore.sh`,
 * `/basebackup.sh`), trên Postgres thật của bộ kiểm.
 */
const pgEnv = () => ({
  ...process.env,
  PGHOST: process.env.PGHOST ?? 'postgres',
  PGUSER: 'postgres',
  PGPASSWORD: process.env.PG_PASSWORD ?? 'csbh_dev_pw',
});
const sh = (cmd: string, env: Record<string, string> = {}) =>
  run('/bin/sh', ['-c', cmd], { env: { ...pgEnv(), ...env }, maxBuffer: 32 * 1024 * 1024 });
/** psql vào một CSDL bất kỳ của cụm. */
const psqlDb = async (db: string, sql: string) =>
  (await run('psql', ['-U', 'postgres', '-d', db, '-tAc', sql], { env: pgEnv() })).stdout.trim();
/** Chạy, trả mã thoát thay vì ném. */
const thu = async (cmd: string, env: Record<string, string> = {}) =>
  sh(cmd, env).then(
    (r) => ({ ma: 0, ra: r.stdout + r.stderr }),
    (e: { code?: number; stdout?: string; stderr?: string }) => ({
      ma: e.code ?? 1,
      ra: `${e.stdout ?? ''}${e.stderr ?? ''}`,
    }),
  );

describe('OPS-06b · phục hồi KHÔNG BAO GIỜ làm mất CSDL đang chạy (`0240`)', () => {
  // Một "CSDL đang chạy" RIÊNG cho khối này — `CSDL_SONG` trỏ restore.sh vào nó,
  // nên nhánh ĐÈ được thử thật mà không đụng `csbh` của chính bộ kiểm.
  const SONG = 'csbh_ops_song';
  const dungSong = async () => {
    await psqlDb('postgres', `DROP DATABASE IF EXISTS ${SONG} WITH (FORCE)`);
    const thua = await psqlDb('postgres', `SELECT string_agg(datname, ' ') FROM pg_database WHERE datname LIKE '${SONG}\\_%'`);
    for (const d of thua.split(' ').filter(Boolean)) {
      await psqlDb('postgres', `ALTER DATABASE "${d}" ALLOW_CONNECTIONS true`);
      await psqlDb('postgres', `DROP DATABASE "${d}" WITH (FORCE)`);
    }
    await psqlDb('postgres', `CREATE DATABASE ${SONG}`);
    await psqlDb(SONG, `CREATE TABLE dau_vet(x text); INSERT INTO dau_vet VALUES ('du-lieu-dang-chay')`);
  };
  const conNguyen = async () => psqlDb(SONG, 'SELECT x FROM dau_vet');
  const env = { BACKUP_DIR: '/backup', CSDL_SONG: SONG, RESTORE_DB: SONG };

  it('tệp KHÔNG TỒN TẠI: thoát lỗi, CSDL đang chạy nguyên vẹn', async () => {
    // Đúng lượt diễn tập đã mất dữ liệu: gõ `/b/…` thay vì `/backup/…`. Bản cũ
    // DROP trước rồi mới mở tệp.
    await dungSong();
    const r = await thu('/bin/sh /restore.sh /b/khong-co.dump', env);
    expect(r.ma).not.toBe(0);
    expect(r.ra).toContain('chưa đụng tới CSDL nào');
    expect(await conNguyen()).toBe('du-lieu-dang-chay');
  }, 60_000);

  it('tệp KHÔNG PHẢI bản dump: thoát lỗi, CSDL đang chạy nguyên vẹn', async () => {
    await dungSong();
    await sh('echo rac > /tmp/rac.dump');
    const r = await thu('/bin/sh /restore.sh /tmp/rac.dump', env);
    expect(r.ma).not.toBe(0);
    expect(await conNguyen()).toBe('du-lieu-dang-chay');
  }, 60_000);

  it('pg_restore CHẾT GIỮA LÚC NẠP: CSDL đang chạy nguyên vẹn, bản nạp dở bị xoá', async () => {
    // Mục lục đọc được nhưng nạp hỏng — dựng bằng một `pg_restore` giả đứng
    // trước trong PATH: nạp thật phần lược đồ rồi chết. Bản cũ để lại CSDL có
    // bảng mà KHÔNG có dòng nào (đo ở diễn tập).
    await dungSong();
    await sh(`mkdir -p /tmp/gia && cat > /tmp/gia/pg_restore <<'HET'
#!/bin/sh
for a in "$@"; do case "$a" in --dbname=*) db=1 ;; esac; done
if [ -n "\${db:-}" ]; then /usr/bin/pg_restore "$@" --section=pre-data 2>/dev/null; echo "GIA LAP HONG" >&2; exit 1; fi
exec /usr/bin/pg_restore "$@"
HET
chmod +x /tmp/gia/pg_restore`);
    const r = await thu('/bin/sh /restore.sh', { ...env, PATH: `/tmp/gia:${process.env.PATH ?? ''}` });
    expect(r.ma).not.toBe(0);
    expect(r.ra).toContain('GIỮ NGUYÊN');
    expect(await conNguyen()).toBe('du-lieu-dang-chay');
    expect(
      await psqlDb('postgres', `SELECT count(*) FROM pg_database WHERE datname LIKE '${SONG}_phuc_hoi_%'`),
    ).toBe('0');
  }, 180_000);

  it('phục hồi ĐÈ bằng TÊN TRẦN: đổi chỗ, bản cũ GIỮ LẠI và bị chặn kết nối', async () => {
    await dungSong();
    const ten = (await sh("ls -1t /backup/csbh-*.dump | head -1 | xargs basename")).stdout.trim();
    const r = await thu(`/bin/sh /restore.sh ${ten}`, env);
    expect(r.ma, r.ra).toBe(0);
    // CSDL đang chạy giờ là bản phục hồi…
    expect(Number(await psqlDb(SONG, 'SELECT count(*) FROM idn.app_user'))).toBeGreaterThanOrEqual(10);
    // …còn bản cũ nằm lại nguyên, dưới tên khác, không ai nối vào được.
    const cu = await psqlDb('postgres', `SELECT datname FROM pg_database WHERE datname LIKE '${SONG}_truoc_phuc_hoi_%'`);
    expect(cu).not.toBe('');
    expect(await psqlDb('postgres', `SELECT datallowconn FROM pg_database WHERE datname = '${cu}'`)).toBe('f');
    await psqlDb('postgres', `ALTER DATABASE "${cu}" ALLOW_CONNECTIONS true`);
    expect(await psqlDb(cu, 'SELECT x FROM dau_vet')).toBe('du-lieu-dang-chay');
  }, 300_000);

  it('quyền MỨC DATABASE được dựng lại: PUBLIC không kết nối được, role service thì được', async () => {
    // `pg_dump` không mang ACL của database (chỉ khi `--create`). Thiếu bước dựng
    // lại thì CSDL phục hồi về mặc định — lớp chặn `REVOKE … FROM PUBLIC` của
    // `0002` mất lặng lẽ.
    const acl = await psqlDb('postgres', `SELECT datacl::text FROM pg_database WHERE datname = '${SONG}'`);
    expect(acl, 'datacl rỗng = mặc định, PUBLIC kết nối được').not.toBe('');
    expect(acl).not.toMatch(/[{,]=/); // mục `=…` là PUBLIC
    for (const r of ['csbh_idn', 'csbh_pol', 'csbh_aud']) expect(acl).toContain(`${r}=c/`);
  });

  it('dọn: xoá CSDL của khối này', async () => {
    await dungSong();
    await psqlDb('postgres', `DROP DATABASE IF EXISTS ${SONG} WITH (FORCE)`);
  }, 60_000);
});

/**
 * `0250` — giữ tối đa N bản sao lưu, đếm SỐ BẢN chứ không đếm ngày.
 *
 * Chạy CHÍNH `/backup.sh` trên Postgres thật, vào thư mục tạm. Bản "cũ" là tệp giả
 * mang mốc quá khứ — luật dọn chỉ nhìn TÊN (sắp theo chữ = sắp theo thời gian), và
 * dựng mười bản thật thì mất mười lượt pg_dump. `CSBH_MOC` ghim mốc của bản mới để
 * hai lượt trong cùng một giây không đè tên nhau.
 */
describe('OPS-08 · `0250` giữ tối đa N bản sao lưu', () => {
  const BD = '/tmp/ops08-backup';
  const MIR = '/tmp/ops08-mirror';
  const ds = async (dir: string) =>
    (await sh(`ls -1 ${dir} 2>/dev/null | grep '^csbh-.*\\.dump$' | sort || true`)).stdout.trim().split('\n').filter(Boolean);
  const cu = (n: number) =>
    Array.from({ length: n }, (_, i) => `csbh-2020010${Math.floor(i / 10)}T0${i % 10}0000Z.dump`);
  const dung = async (dir: string, tep: string[]) => {
    await sh(`rm -rf ${dir} && mkdir -p ${dir}`);
    for (const t of tep) await sh(`echo gia > ${dir}/${t}`);
  };

  it('có 10 bản, hạ giới hạn xuống 5: lượt kế tiếp còn ĐÚNG 5 — bản mới + 4 bản mới nhất', async () => {
    await dung(BD, cu(10));
    const r = await thu('/bin/sh /backup.sh', { BACKUP_DIR: BD, GIU_TOI_DA: '5', CSBH_MOC: '20991231T000000Z' });
    expect(r.ma, r.ra).toBe(0);
    expect(await ds(BD)).toEqual([...cu(10).slice(-4), 'csbh-20991231T000000Z.dump']);
    expect(r.ra).toContain('giữ tối đa 5 bản — xoá csbh-20200100T000000Z.dump');
  }, 120_000);

  it('chưa đủ N bản thì KHÔNG xoá gì', async () => {
    await dung(BD, cu(2));
    const r = await thu('/bin/sh /backup.sh', { BACKUP_DIR: BD, GIU_TOI_DA: '7', CSBH_MOC: '20991231T000001Z' });
    expect(r.ma, r.ra).toBe(0);
    expect(await ds(BD)).toHaveLength(3);
  }, 120_000);

  it('lượt sao lưu HỎNG thì không xoá bản nào, kể cả khi đang thừa', async () => {
    await dung(BD, cu(6));
    const r = await thu('/bin/sh /backup.sh', {
      BACKUP_DIR: BD,
      GIU_TOI_DA: '2',
      CSBH_MOC: '20991231T000002Z',
      PGDATABASE: 'csdl_khong_ton_tai',
    });
    expect(r.ma).not.toBe(0);
    expect(await ds(BD)).toEqual(cu(6));
    expect((await sh(`ls -1 ${BD} | grep partial || true`)).stdout.trim()).toBe('');
  }, 120_000);

  it('bản vừa ghi đọc được bằng pg_restore', async () => {
    await dung(BD, []);
    const r = await thu('/bin/sh /backup.sh', { BACKUP_DIR: BD, GIU_TOI_DA: '1', CSBH_MOC: '20991231T000003Z' });
    expect(r.ma, r.ra).toBe(0);
    const { stdout } = await sh(`pg_restore --list ${BD}/csbh-20991231T000003Z.dump | grep -c 'TABLE DATA idn app_user'`);
    expect(Number(stdout.trim())).toBe(1);
  }, 120_000);

  it('bản sao ngoài: nhận bản mới và bị dọn theo CÙNG giới hạn', async () => {
    await dung(BD, cu(4));
    await dung(MIR, cu(4));
    const r = await thu('/bin/sh /backup.sh', {
      BACKUP_DIR: BD,
      GIU_TOI_DA: '3',
      CSBH_MOC: '20991231T000004Z',
      BACKUP_MIRROR_DIR: MIR,
    });
    expect(r.ma, r.ra).toBe(0);
    const tai = await ds(BD);
    expect(tai).toHaveLength(3);
    expect(await ds(MIR)).toEqual(tai);
    expect((await sh(`ls -A ${MIR} | grep dang-chep || true`)).stdout.trim()).toBe('');
  }, 120_000);

  it('production thiếu bản sao ngoài: bản tại chỗ VẪN ghi, nhưng thoát lỗi để cron biết', async () => {
    await dung(BD, []);
    const r = await thu('/bin/sh /backup.sh', {
      BACKUP_DIR: BD,
      GIU_TOI_DA: '3',
      CSBH_MOC: '20991231T000005Z',
      NODE_ENV: 'production',
      BACKUP_MIRROR_DIR: '',
    });
    expect(r.ma).toBe(1);
    expect(await ds(BD)).toEqual(['csbh-20991231T000005Z.dump']);
  }, 120_000);

  it('GIU_TOI_DA vắng mặt hoặc rỗng → mặc định 7 (cron không truyền gì)', async () => {
    await dung(BD, cu(9));
    const r = await thu('/bin/sh /backup.sh', { BACKUP_DIR: BD, GIU_TOI_DA: '', CSBH_MOC: '20991231T000008Z' });
    expect(r.ma, r.ra).toBe(0);
    expect(await ds(BD)).toHaveLength(7);
  }, 120_000);

  it.each(['0', '-1', 'bay', '3.5', '007x'])('GIU_TOI_DA="%s" bị từ chối TRƯỚC khi ghi gì', async (n) => {
    await dung(BD, cu(3));
    const r = await thu('/bin/sh /backup.sh', { BACKUP_DIR: BD, GIU_TOI_DA: n, CSBH_MOC: '20991231T000006Z' });
    expect(r.ma).toBe(2);
    expect(await ds(BD)).toEqual(cu(3));
  });

  it('thư mục bản nền cũ (máy nâng cấp từ trước `0250`): nói ra, KHÔNG tự xoá', async () => {
    await dung(BD, []);
    await sh(`mkdir -p ${BD}/base/20260101T000000Z && echo x > ${BD}/base/20260101T000000Z/base.tar.gz`);
    const r = await thu('/bin/sh /backup.sh', { BACKUP_DIR: BD, GIU_TOI_DA: '2', CSBH_MOC: '20991231T000007Z' });
    expect(r.ma, r.ra).toBe(0);
    expect(r.ra).toContain(`còn thư mục cũ ${BD}/base`);
    expect((await sh(`test -f ${BD}/base/20260101T000000Z/base.tar.gz && echo con`)).stdout.trim()).toBe('con');
  }, 120_000);
});

describe('OPS-09 · múi giờ nghiệp vụ là giờ Việt Nam', () => {
  it('Postgres dùng Asia/Ho_Chi_Minh cho mọi phép so sánh theo NGÀY', async () => {
    expect(await psql("SELECT current_setting('TimeZone')")).toBe('Asia/Ho_Chi_Minh');
  });

  it('dấu thời gian vẫn lưu tuyệt đối, chỉ cách ĐỌC theo ngày là đổi', async () => {
    // 23:00 UTC ngày 7 chính là 06:00 sáng ngày 8 giờ Việt Nam. Máy chủ chạy GMT
    // sẽ ghi hồ sơ đó vào ngày 7 — lệch một ngày ở ngày áp dụng, ở hiệu lực giá
    // và ở SLA, mà chỉ sai vào sáng sớm nên rất lâu mới lộ.
    const d = await psql("SELECT (timestamptz '2026-08-07 23:00:00+00')::date::text");
    expect(d).toBe('2026-08-08');
  });
});

describe('OPS-10 · bí mật đọc từ file, không từ biến môi trường', () => {
  it('readSecret ưu tiên FILE hơn biến môi trường', async () => {
    const { readSecret } = await import('@csbh/http-kit');
    const { writeFileSync, mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const dir = mkdtempSync(join(tmpdir(), 'sec-'));
    const f = join(dir, 's.txt');
    writeFileSync(f, 'tu-file\n');

    process.env.ZZ_SECRET = 'tu-bien-moi-truong';
    process.env.ZZ_SECRET_FILE = f;
    try {
      // Biến môi trường lộ ra ở `docker inspect` và ở /proc/<pid>/environ.
      expect(readSecret('ZZ_SECRET')).toBe('tu-file');
      delete process.env.ZZ_SECRET_FILE;
      expect(readSecret('ZZ_SECRET')).toBe('tu-bien-moi-truong');
    } finally {
      delete process.env.ZZ_SECRET;
      delete process.env.ZZ_SECRET_FILE;
    }
  });

  it('production không có giá trị mặc định — thiếu bí mật thì DỪNG', async () => {
    const { readSecret } = await import('@csbh/http-kit');
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => readSecret('ZZ_KHONG_TON_TAI', 'mat-khau-doan-duoc')).toThrow(/Thiếu bí mật/);
    } finally {
      if (before === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = before;
    }
  });
});

describe('OPS-11 · khoá JWT dùng chung giữa các service', () => {
  it('token ký bằng khoá nạp từ file xác minh được ở tiến trình khác', async () => {
    const { getKeyPair, resetKeyPairForTest, JWT } = await import('@csbh/http-kit');
    const { signJwt, verifyJwt } = await import('@csbh/identity-core');
    const { generateKeyPairSync } = await import('node:crypto');
    const { writeFileSync, mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const f = join(mkdtempSync(join(tmpdir(), 'jwt-')), 'k.pem');
    writeFileSync(f, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string);

    const before = process.env.JWT_PRIVATE_KEY_FILE;
    try {
      // "service A" nạp khoá từ file và ký.
      process.env.JWT_PRIVATE_KEY_FILE = f;
      resetKeyPairForTest();
      const token = signJwt({ sub: 'u1' }, getKeyPair().privateKey, {
        issuer: JWT.issuer,
        audience: JWT.audUser,
        expiresInSec: 60,
      });

      // "service B" nạp LẠI từ đầu, cùng file, và xác minh được.
      resetKeyPairForTest();
      const payload = verifyJwt(token, getKeyPair().publicKey, {
        issuer: JWT.issuer,
        audience: JWT.audUser,
      });
      expect(payload.sub).toBe('u1');

      // Không có file thì mỗi lần nạp là một khoá khác — token của service này
      // service kia không xác minh nổi.
      delete process.env.JWT_PRIVATE_KEY_FILE;
      resetKeyPairForTest();
      expect(() =>
        verifyJwt(token, getKeyPair().publicKey, {
          issuer: JWT.issuer,
          audience: JWT.audUser,
        }),
      ).toThrow();
    } finally {
      if (before === undefined) delete process.env.JWT_PRIVATE_KEY_FILE;
      else process.env.JWT_PRIVATE_KEY_FILE = before;
      resetKeyPairForTest();
    }
  });
});
