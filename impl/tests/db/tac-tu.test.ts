/**
 * `0254` — phía CSDL của tác tử vận hành: mọi hàm `ops.*` mà `./csbh tac-tu` gọi.
 *
 * Tác tử shell chỉ chuyển nguyên văn đầu ra của docker; phân tích ở đây. Mẫu đầu vào chép
 * đúng HÌNH DẠNG đo được trên Docker 29.2 / Compose v5.0.2 (06/11): `compose ps` in một đối
 * tượng JSON mỗi dòng, `system df` in một dòng mỗi loại, `system df -v` một đối tượng với
 * mảng `Volumes` liệt kê MỌI volume của máy, cỡ là chuỗi đơn vị thập phân.
 *
 * Mọi ca chạy trong transaction lăn ngược. Ca cuối đối chiếu mọi tên `ops.<hàm>(` trong
 * `scripts/csbh` với `pg_proc` — gõ sai tên hàm ở shell thì tác tử lặng lẽ không làm gì.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { admin, asRole, expectSqlErrorInTx, inRollback, uuid } from './helpers';

let c: Client;
beforeAll(async () => {
  c = admin();
  await c.connect();
});
afterAll(async () => {
  await c.end();
});

const mot = async <T>(sql: string, p: unknown[] = []): Promise<T> => (await c.query(sql, p)).rows[0] as T;
const don = () => c.query(`DELETE FROM ops.viec_tay; DELETE FROM ops.tac_tu; DELETE FROM ops.container; DELETE FROM ops.do_docker`);

const PS = [
  { Service: 'postgres', State: 'running', Health: 'healthy', Status: 'Up 3 hours (healthy)', Name: 'csbh-prod-postgres-1' },
  { Service: 'minio', State: 'running', Health: '', Status: 'Up 3 hours', Name: 'csbh-prod-minio-1' },
  { Service: 'notification', State: 'restarting', Health: '', Status: 'Restarting (1) 5 seconds ago', Name: 'csbh-prod-notification-1' },
  { Service: 'migrate', State: 'exited', Health: '', Status: 'Exited (0) 3 hours ago', Name: 'csbh-prod-migrate-1' },
  { Service: 'pg-init', State: 'exited', Health: '', Status: 'Exited (0) 3 hours ago', Name: 'csbh-prod-pg-init-1' },
];
const nhan = (du: string, vol: string) =>
  `com.docker.compose.config-hash=abc,com.docker.compose.project=${du},com.docker.compose.version=5.0.2,com.docker.compose.volume=${vol}`;
const DF = [
  { Active: '30', Reclaimable: '42.81GB (31%)', Size: '4.2GB', TotalCount: '12', Type: 'Images' },
  { Active: '19', Reclaimable: '0B', Size: '601.6MB', TotalCount: '47', Type: 'Containers' },
  { Active: '24', Reclaimable: '1GB', Size: '58.61GB', TotalCount: '3052', Type: 'Local Volumes' },
].map((d) => JSON.stringify(d)).join('\n');
const DF_V = JSON.stringify({
  Images: [],
  Containers: [],
  Volumes: [
    { Name: 'csbh-prod_pgdata', Labels: nhan('csbh-prod', 'pgdata'), Size: '4.1GB' },
    { Name: 'csbh-prod_miniodata', Labels: nhan('csbh-prod', 'miniodata'), Size: '96.25GB' },
    { Name: 'csbh-prod_pgbackup', Labels: nhan('csbh-prod', 'pgbackup'), Size: '2.463kB' },
    // dự án KHÁC trên cùng máy, và một dự án tên là TIỀN TỐ của tên ta
    { Name: 'khac_pgdata', Labels: nhan('khac', 'pgdata'), Size: '9GB' },
    { Name: 'csbh_pgdata', Labels: nhan('csbh', 'pgdata'), Size: '1GB' },
    { Name: '704bae7daf', Labels: 'com.docker.volume.anonymous=', Size: '0B' },
  ],
  BuildCache: [],
});

describe('`0254` ops.co_docker — cỡ kiểu Docker → byte (đơn vị thập phân)', () => {
  it.each([
    ['0B', 0],
    ['512B', 512],
    ['2.463kB', 2463],
    ['53.2MB', 53_200_000],
    ['4.1GB', 4_100_000_000],
    ['1.5TB', 1_500_000_000_000],
    [' 7 MB ', 7_000_000],
  ])('%s → %d', async (vao, ra) => {
    expect(Number((await mot<{ v: string }>(`SELECT ops.co_docker($1) AS v`, [vao])).v)).toBe(ra);
  });
  it.each(['', 'N/A', '12', '3 GiB', '1,5GB', '-1MB'])('chuỗi lạ "%s" → NULL', async (vao) => {
    expect((await mot<{ v: string | null }>(`SELECT ops.co_docker($1) AS v`, [vao])).v).toBeNull();
  });
});

describe('`0254` nhịp tim và nhận việc', () => {
  it('nhịp đầu tạo dòng, nhịp sau cập nhật — luôn đúng MỘT dòng', async () => {
    await inRollback(c, async () => {
      await don();
      await c.query(`SELECT ops.tac_tu_nhip('1.1.0', 'may-a', true)`);
      await c.query(`UPDATE ops.tac_tu SET lan_cuoi = now() - interval '5 minutes'`);
      await c.query(`SELECT ops.tac_tu_nhip('1.1.1', 'may-b', true)`);
      const r = await c.query(`SELECT phien_ban, may, lan_cuoi > now() - interval '1 minute' AS moi FROM ops.tac_tu`);
      expect(r.rows).toEqual([{ phien_ban: '1.1.1', may: 'may-b', moi: true }]);
    });
  });

  it('không có việc → rỗng; có việc → "id loai người", việc chuyển sang ĐANG CHẠY; theo thứ tự xếp', async () => {
    await inRollback(c, async () => {
      await don();
      const ai = uuid();
      expect((await mot<{ v: string }>(`SELECT ops.tac_tu_nhip('x', 'm', true) AS v`)).v).toBe('');
      const a = await mot<{ id: string }>(`INSERT INTO ops.viec_tay (loai, nguoi_tao) VALUES ('SAO_LUU_KHO_TEP', $1) RETURNING id::text`, [ai]);
      const b = await mot<{ id: string }>(`INSERT INTO ops.viec_tay (loai) VALUES ('SAO_LUU_CSDL') RETURNING id::text`);
      expect((await mot<{ v: string }>(`SELECT ops.tac_tu_nhip('x', 'm', true) AS v`)).v).toBe(`${a.id} SAO_LUU_KHO_TEP ${ai}`);
      expect((await mot<{ t: string }>(`SELECT trang_thai AS t FROM ops.viec_tay WHERE id = $1`, [a.id])).t).toBe('DANG_CHAY');
      expect((await mot<{ v: string }>(`SELECT ops.tac_tu_nhip('x', 'm', true) AS v`)).v).toBe(`${b.id} SAO_LUU_CSDL -`);
    });
  });

  it('tác tử BẬN (đang chạy một việc) → vẫn nhịp tim, KHÔNG nhận thêm việc', async () => {
    await inRollback(c, async () => {
      await don();
      await c.query(`INSERT INTO ops.viec_tay (loai) VALUES ('SAO_LUU_CSDL')`);
      await c.query(`UPDATE ops.tac_tu SET lan_cuoi = now() - interval '1 day'`);
      expect((await mot<{ v: string }>(`SELECT ops.tac_tu_nhip('x', 'm', false) AS v`)).v).toBe('');
      expect((await mot<{ t: string }>(`SELECT trang_thai AS t FROM ops.viec_tay`)).t).toBe('CHO');
      expect((await mot<{ n: number }>(`SELECT count(*)::int AS n FROM ops.tac_tu WHERE lan_cuoi > now() - interval '1 minute'`)).n).toBe(1);
    });
  });

  it('xong: THÀNH CÔNG / LỖI kèm đuôi đầu ra; việc không ở trạng thái ĐANG CHẠY thì không đổi', async () => {
    await inRollback(c, async () => {
      await don();
      const a = await mot<{ id: string }>(`INSERT INTO ops.viec_tay (loai, trang_thai, bat_dau) VALUES ('SAO_LUU_CSDL', 'DANG_CHAY', now()) RETURNING id::text`);
      await c.query(`SELECT ops.tac_tu_xong($1, false, $2)`, [a.id, 'x'.repeat(9000) + 'pg_dump: hỏng']);
      const r = await mot<{ trang_thai: string; chi_tiet: string; xong: boolean }>(
        `SELECT trang_thai, chi_tiet, ket_thuc IS NOT NULL AS xong FROM ops.viec_tay WHERE id = $1`, [a.id]);
      expect(r).toMatchObject({ trang_thai: 'LOI', xong: true });
      expect(r.chi_tiet.length).toBe(8000); // giữ ĐUÔI — câu lỗi ở cuối
      expect(r.chi_tiet.endsWith('pg_dump: hỏng')).toBe(true);
      await c.query(`SELECT ops.tac_tu_xong($1, true, 'lượt hai')`, [a.id]);
      expect((await mot<{ t: string }>(`SELECT trang_thai AS t FROM ops.viec_tay WHERE id = $1`, [a.id])).t).toBe('LOI');
    });
  });

  it('khởi động lại: việc ĐANG CHẠY dở thành LỖI (nút mở lại); việc CHỜ giữ nguyên', async () => {
    await inRollback(c, async () => {
      await don();
      await c.query(`INSERT INTO ops.viec_tay (loai, trang_thai, bat_dau) VALUES ('SAO_LUU_CSDL', 'DANG_CHAY', now())`);
      await c.query(`INSERT INTO ops.viec_tay (loai) VALUES ('SAO_LUU_KHO_TEP')`);
      expect((await mot<{ n: number }>(`SELECT ops.tac_tu_khoi_dong() AS n`)).n).toBe(1);
      const r = await c.query(`SELECT loai, trang_thai, chi_tiet FROM ops.viec_tay ORDER BY id`);
      expect(r.rows[0]).toMatchObject({ trang_thai: 'LOI', chi_tiet: expect.stringContaining('khởi động lại') });
      expect(r.rows[1]).toMatchObject({ trang_thai: 'CHO' });
    });
  });

  it('một việc dở mỗi loại (chỉ mục), loại ngoài danh sách trắng bị CHECK chặn', async () => {
    await inRollback(c, async () => {
      await don();
      await c.query(`INSERT INTO ops.viec_tay (loai) VALUES ('SAO_LUU_CSDL')`);
      const e = await expectSqlErrorInTx(c, () => c.query(`INSERT INTO ops.viec_tay (loai, trang_thai) VALUES ('SAO_LUU_CSDL', 'DANG_CHAY')`));
      expect(e.code).toBe('23505');
      expect(e.message).toContain('uq_viec_tay_dang_do');
      await c.query(`INSERT INTO ops.viec_tay (loai) VALUES ('SAO_LUU_KHO_TEP')`); // loại khác: được
      await c.query(`UPDATE ops.viec_tay SET trang_thai = 'THANH_CONG' WHERE loai = 'SAO_LUU_CSDL'`);
      await c.query(`INSERT INTO ops.viec_tay (loai) VALUES ('SAO_LUU_CSDL')`); // việc cũ xong: được
      for (const l of ['XOA_HET', "SAO_LUU_CSDL; rm -rf /", 'sao_luu_csdl']) {
        expect((await expectSqlErrorInTx(c, () => c.query(`INSERT INTO ops.viec_tay (loai) VALUES ($1)`, [l]))).code).toBe('23514');
      }
    });
  });
});

describe('`0254` ảnh chụp container', () => {
  const ndjson = PS.map((p) => JSON.stringify(p)).join('\n') + '\n';
  const doc = async () => (await c.query(`SELECT service, trang_thai, suc_khoe, mo_ta FROM ops.container ORDER BY service`)).rows;

  it('một đối tượng mỗi dòng (compose mới); bỏ việc chạy một lần; sức khoẻ rỗng → NULL', async () => {
    await inRollback(c, async () => {
      await don();
      expect((await mot<{ n: number }>(`SELECT ops.ghi_container($1) AS n`, [ndjson])).n).toBe(3);
      expect(await doc()).toEqual([
        { service: 'minio', trang_thai: 'running', suc_khoe: null, mo_ta: 'Up 3 hours' },
        { service: 'notification', trang_thai: 'restarting', suc_khoe: null, mo_ta: 'Restarting (1) 5 seconds ago' },
        { service: 'postgres', trang_thai: 'running', suc_khoe: 'healthy', mo_ta: 'Up 3 hours (healthy)' },
      ]);
    });
  });

  it('một MẢNG (compose cũ) cho cùng kết quả', async () => {
    await inRollback(c, async () => {
      await don();
      await c.query(`SELECT ops.ghi_container($1)`, [JSON.stringify(PS)]);
      expect((await doc()).map((r) => r.service)).toEqual(['minio', 'notification', 'postgres']);
    });
  });

  it('thay TRỌN ảnh chụp — container đã gỡ biến khỏi bảng; đầu ra rỗng (docker hỏng) → bảng rỗng', async () => {
    await inRollback(c, async () => {
      await don();
      await c.query(`SELECT ops.ghi_container($1)`, [ndjson]);
      await c.query(`SELECT ops.ghi_container($1)`, [JSON.stringify(PS[0])]);
      expect((await doc()).map((r) => r.service)).toEqual(['postgres']);
      await c.query(`SELECT ops.ghi_container('')`);
      expect(await doc()).toEqual([]);
    });
  });
});

describe('`0254` cỡ volume và ảnh Docker', () => {
  it('chỉ volume của ĐÚNG dự án (không dự án khác, không dự án trùng tiền tố), tên ngắn, kèm tổng ảnh', async () => {
    await inRollback(c, async () => {
      await don();
      expect((await mot<{ n: number }>(`SELECT ops.ghi_docker('csbh-prod', $1, $2) AS n`, [DF, DF_V])).n).toBe(4);
      const r = await c.query(`SELECT ten, loai, co::float8 AS co FROM ops.do_docker ORDER BY loai, ten`);
      expect(r.rows).toEqual([
        { ten: 'anh-docker', loai: 'ANH', co: 4.2e9 },
        { ten: 'miniodata', loai: 'VOLUME', co: 96.25e9 },
        { ten: 'pgbackup', loai: 'VOLUME', co: 2463 },
        { ten: 'pgdata', loai: 'VOLUME', co: 4.1e9 },
      ]);
    });
  });

  it('đo lại thay trọn; `df -v` rỗng (lệnh hỏng) → chỉ còn tổng ảnh', async () => {
    await inRollback(c, async () => {
      await don();
      await c.query(`SELECT ops.ghi_docker('csbh-prod', $1, $2)`, [DF, DF_V]);
      await c.query(`SELECT ops.ghi_docker('csbh-prod', $1, '')`, [DF]);
      expect((await c.query(`SELECT ten FROM ops.do_docker`)).rows).toEqual([{ ten: 'anh-docker' }]);
    });
  });
});

describe('`0254` quyền của `van-hanh` (csbh_ops)', () => {
  it('đọc ba bảng tác tử ghi, xếp được việc — nhưng KHÔNG sửa trạng thái việc, không giả nhịp tim', async () => {
    const o = asRole('csbh_ops');
    await o.connect();
    try {
      await o.query('BEGIN');
      await o.query(`SELECT * FROM ops.tac_tu, ops.container, ops.do_docker LIMIT 1`);
      await o.query(`INSERT INTO ops.viec_tay (loai) VALUES ('SAO_LUU_KHO_TEP')`).catch(() => undefined);
      await o.query('ROLLBACK');
      for (const sql of [
        `UPDATE ops.viec_tay SET trang_thai = 'THANH_CONG'`,
        `INSERT INTO ops.tac_tu (lan_cuoi) VALUES (now())`,
        `DELETE FROM ops.container`,
      ]) {
        const e = await o.query(sql).then(() => null, (x: { code?: string }) => x.code);
        expect(e, sql).toBe('42501');
      }
    } finally {
      await o.end();
    }
  });
});

describe('`0254` mọi hàm tác tử gọi đều CÓ THẬT', () => {
  it('mỗi `ops.<hàm>(` trong scripts/csbh khớp một hàm trong pg_proc', async () => {
    const csbh = readFileSync('scripts/csbh', 'utf8');
    const ten = [...new Set([...csbh.matchAll(/\bops\.([a-z_]+)\(/g)].map((m) => m[1]!))];
    for (const t of ['tac_tu_nhip', 'tac_tu_xong', 'tac_tu_khoi_dong', 'ghi_container', 'ghi_docker']) expect(ten).toContain(t);
    const co = (await c.query<{ proname: string }>(
      `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE nspname = 'ops'`,
    )).rows.map((r) => r.proname);
    for (const t of ten) expect(co, `ops.${t}`).toContain(t);
  });
});
