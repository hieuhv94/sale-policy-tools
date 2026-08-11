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

type Row = { u: string; name: string; role: string; tbp?: string; parent?: string };

const USERS: Row[] = [
  { u: 'sa01',    name: 'Sale Admin 01',        role: 'SALE_ADMIN' },
  { u: 'kt01',    name: 'Ke toan 01',           role: 'KE_TOAN',    parent: 'sa01' },
  { u: 'kt02',    name: 'Ke toan 02',           role: 'KE_TOAN',    parent: 'sa01' },
  { u: 'tdv01',   name: 'Trinh duoc vien 01',   role: 'TDV', tbp: 'tbp01', parent: 'kt01' },
  { u: 'tdv02',   name: 'Trinh duoc vien 02',   role: 'TDV', tbp: 'tbp01', parent: 'kt01' },
  { u: 'tdv03',   name: 'Trinh duoc vien 03',   role: 'TDV', tbp: 'tbp02', parent: 'kt02' },
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

  const hash = await hashPassword(PASSWORD);
  const id: Record<string, string> = {};

  // Hai lượt: tài khoản trước, người duyệt sau. `approver_user_id` trỏ vào chính
  // bảng này nên tbp01 phải TỒN TẠI trước khi tdv01 trỏ vào được.
  for (const r of USERS) {
    const res = await db.query(
      `INSERT INTO idn.app_user (username, email, full_name, role, password_hash)
       VALUES ($1,$2,$3,$4::idn.user_role,$5)
       ON CONFLICT (username) DO UPDATE
         SET full_name = EXCLUDED.full_name, role = EXCLUDED.role,
             password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [r.u, `${r.u}@csbh.test`, r.name, r.role, hash]);
    id[r.u] = res.rows[0].id;
  }

  for (const r of USERS.filter((x) => x.tbp)) {
    await db.query(
      `UPDATE idn.app_user SET approver_user_id = $2 WHERE id = $1`,
      [id[r.u], id[r.tbp!]]);
  }

  for (const r of USERS) {
    await db.query(
      `INSERT INTO idn.user_node (user_id, parent_id) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET parent_id = EXCLUDED.parent_id`,
      [id[r.u], r.parent ? id[r.parent] : null]);
  }

  await db.query('COMMIT');
  await db.end();
  console.log(`seed: xong ${USERS.length} tài khoản, mật khẩu chung "${PASSWORD}"`);
};

main().catch((e) => { console.error(e); process.exit(1); });
