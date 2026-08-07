/**
 * Seed 10 tài khoản mẫu phủ đủ 6 vai trò và cả trường hợp ngoài phạm vi (§13 thiết kế).
 *
 * CHỐT AN TOÀN: script tự thoát nếu NODE_ENV=production. Đã có quá nhiều hệ thống
 * lên production kèm tài khoản admin/Test@1234 (test SEC-14).
 */
import { Client } from 'pg';
import { hashPassword } from '../packages/identity-core/src/password.js';

if (process.env.NODE_ENV === 'production') {
  console.error('seed: TỪ CHỐI chạy ở môi trường production');
  process.exit(1);
}

const PASSWORD = 'Test@1234';

type Row = { u: string; name: string; role: string; dept?: string; parent?: string };

const USERS: Row[] = [
  { u: 'sa01',    name: 'Sale Admin 01',        role: 'SALE_ADMIN' },
  { u: 'kt01',    name: 'Ke toan 01',           role: 'KE_TOAN',    parent: 'sa01' },
  { u: 'kt02',    name: 'Ke toan 02',           role: 'KE_TOAN',    parent: 'sa01' },
  { u: 'tdv01',   name: 'Trinh duoc vien 01',   role: 'TDV', dept: 'BP01', parent: 'kt01' },
  { u: 'tdv02',   name: 'Trinh duoc vien 02',   role: 'TDV', dept: 'BP01', parent: 'kt01' },
  { u: 'tdv03',   name: 'Trinh duoc vien 03',   role: 'TDV', dept: 'BP02', parent: 'kt02' },
  { u: 'tbp01',   name: 'Truong bo phan 01',    role: 'TBP' },
  { u: 'tbp02',   name: 'Truong bo phan 02',    role: 'TBP' },
  { u: 'bld01',   name: 'Ban lanh dao',         role: 'BAN_LANH_DAO' },
  { u: 'admin01', name: 'Quan tri he thong',    role: 'QUAN_TRI' },
];

const main = async () => {
  const db = new Client({
    host: process.env.PGHOST ?? 'postgres',
    database: process.env.PGDATABASE ?? 'csbh',
    user: process.env.PG_SUPERUSER ?? 'postgres',
    password: process.env.PG_PASSWORD ?? 'csbh_dev_pw',
  });
  await db.connect();
  await db.query('BEGIN');

  for (const [code, name] of [['BP01', 'Bo phan Mien Bac'], ['BP02', 'Bo phan Mien Nam']]) {
    await db.query(
      `INSERT INTO idn.department (code, name) VALUES ($1,$2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`, [code, name]);
  }

  const hash = await hashPassword(PASSWORD);
  const id: Record<string, string> = {};

  for (const r of USERS) {
    const res = await db.query(
      `INSERT INTO idn.app_user (username, email, full_name, role, department_id, password_hash)
       VALUES ($1,$2,$3,$4::idn.user_role,
               (SELECT id FROM idn.department WHERE code = $5), $6)
       ON CONFLICT (username) DO UPDATE
         SET full_name = EXCLUDED.full_name, role = EXCLUDED.role,
             department_id = EXCLUDED.department_id, password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [r.u, `${r.u}@csbh.test`, r.name, r.role, r.dept ?? null, hash]);
    id[r.u] = res.rows[0].id;
  }

  for (const r of USERS) {
    await db.query(
      `INSERT INTO idn.user_node (user_id, parent_id) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET parent_id = EXCLUDED.parent_id`,
      [id[r.u], r.parent ? id[r.parent] : null]);
  }

  // tbp01 duyệt bộ phận BP01, tbp02 duyệt BP02. Đổi người giữ chức = đổi dòng ở đây.
  for (const [user, dept] of [['tbp01', 'BP01'], ['tbp02', 'BP02']]) {
    await db.query(
      `INSERT INTO idn.department_approver (department_id, user_id)
       VALUES ((SELECT id FROM idn.department WHERE code=$1), $2)
       ON CONFLICT DO NOTHING`, [dept, id[user!]]);
  }

  await db.query('COMMIT');
  await db.end();
  console.log(`seed: xong ${USERS.length} tài khoản, mật khẩu chung "${PASSWORD}"`);
};

main().catch((e) => { console.error(e); process.exit(1); });
