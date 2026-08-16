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

/*
 * KHÔNG còn `tbp` và `parent` (`0031`).
 *
 * Người dùng không quản lý lẫn nhau nữa. Mười tài khoản này vẫn giữ nguyên tên
 * và vai trò — hàng chục ca kiểm thử viện dẫn đúng chúng — nhưng cây tổ chức
 * nối chúng lại với nhau thì đã bỏ. "Ai xử lý hồ sơ của ai" giờ nằm trên từng
 * hồ sơ, do người gửi duyệt chọn.
 */
type Row = { u: string; name: string; role: string };

const USERS: Row[] = [
  { u: 'sa01',    name: 'Sale Admin 01',        role: 'SALE_ADMIN' },
  { u: 'kt01',    name: 'Ke toan 01',           role: 'KE_TOAN' },
  { u: 'kt02',    name: 'Ke toan 02',           role: 'KE_TOAN' },
  { u: 'tdv01',   name: 'Trinh duoc vien 01',   role: 'TDV' },
  { u: 'tdv02',   name: 'Trinh duoc vien 02',   role: 'TDV' },
  { u: 'tdv03',   name: 'Trinh duoc vien 03',   role: 'TDV' },
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

  // MỘT lượt. Trước `0031` phải chạy ba lượt vì `approver_user_id` trỏ vào chính
  // bảng này và `user_node` là bảng thứ hai — tbp01 phải tồn tại trước khi tdv01
  // trỏ vào được. Không còn liên kết nào thì không còn thứ tự nào phải giữ.
  for (const r of USERS) {
    const res = await db.query(
      // `activated_at` phải có giá trị: mười tài khoản này ĐÃ dùng được ngay —
      // chúng có mật khẩu đặt thẳng, không đi qua thư mời. Để NULL thì chúng
      // đọc ra là "chờ kích hoạt", và từ `0031` mọi ô chọn người đều lọc bỏ
      // tài khoản chưa kích hoạt — giao việc cho người chưa đăng nhập được lần
      // nào là gửi hồ sơ vào chỗ không ai mở ra.
      `INSERT INTO idn.app_user
         (username, email, full_name, role, password_hash, activated_at)
       VALUES ($1,$2,$3,$4::idn.user_role,$5, now())
       ON CONFLICT (username) DO UPDATE
         SET full_name = EXCLUDED.full_name, role = EXCLUDED.role,
             password_hash = EXCLUDED.password_hash,
             activated_at = coalesce(idn.app_user.activated_at, now())
       RETURNING id`,
      [r.u, `${r.u}@csbh.test`, r.name, r.role, hash]);
    id[r.u] = res.rows[0].id;
  }


  await db.query('COMMIT');
  await db.end();
  console.log(`seed: xong ${USERS.length} tài khoản, mật khẩu chung "${PASSWORD}"`);
};

main().catch((e) => { console.error(e); process.exit(1); });
