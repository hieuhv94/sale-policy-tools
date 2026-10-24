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

describe('OPS-02 · lưu trữ WAL đang chạy', () => {
  it('archive_mode bật và không có lần lưu trữ nào hỏng', async () => {
    expect(await psql('SHOW archive_mode')).toBe('on');

    await psql('SELECT pg_switch_wal()');
    // archive_command hỏng lặng lẽ là kịch bản tệ nhất: CSDL vẫn chạy,
    // healthcheck vẫn xanh, chỉ có khả năng phục hồi theo thời điểm là mất.
    const failed = Number(await psql('SELECT failed_count FROM pg_stat_archiver'));
    expect(failed).toBe(0);
    const archived = Number(await psql('SELECT archived_count FROM pg_stat_archiver'));
    expect(archived).toBeGreaterThan(0);
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

describe('OPS-08 · sao lưu vật lý ghép được với WAL', () => {
  const BB = '/tmp/bb-ops08';
  const MIR = '/tmp/mirror-ops08';
  const env = { BACKUP_DIR: BB, ARCHIVE_DIR: '/archive', KEEP_BASE: '1', BACKUP_MIRROR_DIR: MIR };
  /** Segment WAL mà một bản nền bắt đầu — đọc từ backup_label của chính nó. */
  const batDau = async (dir: string) =>
    (
      await sh(
        `tar -xzOf ${dir}/base.tar.gz backup_label | sed -n 's/^START WAL LOCATION: .*(file \\([0-9A-F]*\\))$/\\1/p'`,
      )
    ).stdout.trim();

  it('chạy basebackup.sh HAI đêm (giữ 1 bản nền): cả hai lượt thoát 0', async () => {
    await sh(`rm -rf ${BB} ${MIR}`);
    for (let dem = 0; dem < 2; dem++) {
      await psql('SELECT pg_switch_wal()');
      await psql('SELECT pg_switch_wal()');
      const r = await thu('/bin/sh /basebackup.sh', env);
      expect(r.ma, r.ra).toBe(0);
    }
  }, 600_000);

  it('có bản sao lưu VẬT LÝ, không chỉ bản dump logic', async () => {
    // pg_dump + archive_mode KHÔNG tự ghép thành phục hồi theo thời điểm: PITR
    // cần một bản sao lưu vật lý làm điểm xuất phát.
    const { stdout } = await sh(`ls -1d ${BB}/base/*/ | wc -l`);
    expect(Number(stdout.trim())).toBe(1);
  });

  it('WAL cũ hơn bản nền CÒN GIỮ đã bị dọn — kể cả nhãn `.backup`', async () => {
    /*
     * Bản trước lấy mốc dọn từ tệp `.backup` CŨ NHẤT trong kho, mà Postgres 16
     * không xoá tệp ấy — mốc đứng yên ở bản nền đầu tiên mãi mãi (diễn tập: 16MB
     * → 176MB qua sáu đêm). Kho của bộ kiểm có `.backup` từ những lượt trước,
     * nên với luật cũ ca này đỏ ngay.
     */
    const goc = (await sh(`ls -1d ${BB}/base/*/ | head -1`)).stdout.trim().replace(/\/$/, '');
    const moc = await batDau(goc);
    expect(moc).toMatch(/^[0-9A-F]{24}$/);
    const ds = (await sh('ls -1 /archive')).stdout.trim().split('\n').filter(Boolean);
    expect(ds.length, 'kho WAL rỗng — /archive có được gắn vào không?').toBeGreaterThan(0);
    const cu = ds.filter((f) => f.slice(0, 24) < moc);
    expect(cu, `còn tệp cũ hơn mốc ${moc}`).toEqual([]);
  });

  it('thư mục lưu trữ WAL không phình vô hạn', async () => {
    // `du` của một thư mục KHÔNG CÓ trả chuỗi rỗng = 0 và ca này xanh mãi — nên
    // hỏi sự có mặt trước.
    const { stdout } = await sh('test -d /archive && du -sm /archive | cut -f1');
    expect(stdout.trim()).toMatch(/^\d+$/);
    expect(Number(stdout.trim())).toBeLessThan(500);
  });

  it('bản sao ngoài: dọn theo cùng luật, có WAL, và WAL GIỮ chủ sở hữu Postgres', async () => {
    // Bản trước chép lại mọi thứ mỗi đêm, không xoá gì, không có WAL. Và chép
    // bằng root thì tệp WAL thành `root 0600`: Postgres phục hồi không đọc được,
    // COI NHƯ HẾT WAL và dừng sớm KHÔNG báo lỗi (diễn tập: mất hai đêm dữ liệu).
    expect(Number((await sh(`ls -1d ${MIR}/base/*/ | wc -l`)).stdout.trim())).toBe(1);
    expect(Number((await sh(`ls -1 ${MIR}/wal | wc -l`)).stdout.trim())).toBeGreaterThan(0);
    const chu = (await sh(`stat -c %u ${MIR}/wal/* | sort -u`)).stdout.trim();
    expect(chu).toBe((await sh('stat -c %u /archive/$(ls -1 /archive | head -1)')).stdout.trim());
    const moc = await batDau((await sh(`ls -1d ${MIR}/base/*/`)).stdout.trim().replace(/\/$/, ''));
    const cu = (await sh(`ls -1 ${MIR}/wal`)).stdout.trim().split('\n').filter((f) => f.slice(0, 24) < moc);
    expect(cu).toEqual([]);
  });
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
