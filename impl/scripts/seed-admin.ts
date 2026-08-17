/**
 * Tạo DUY NHẤT một tài khoản Quản trị hệ thống, không gì khác.
 *
 * Dùng cho bản chạy thử trên CSDL vừa dựng lại: người thử tự đi hết đường
 * onboarding thật — quản trị tạo bộ tài khoản, tạo danh mục sản phẩm và quy định
 * chiết khấu, rồi TDV lập khách hàng và hồ sơ. Không có gì được nạp sẵn, nên
 * không có cách nào nhầm dữ liệu mẫu với dữ liệu mình vừa nhập.
 *
 * Khác `seed.ts` ở đúng chỗ đó: `seed.ts` nạp 10 tài khoản phủ đủ sáu vai trò
 * và cả trường hợp ngoài phạm vi, vì bộ TEST cần một cây tổ chức có sẵn để kiểm
 * `idn.scope_user_ids`. Bản demo thì không — cái cần xem chính là việc dựng cây
 * đó bằng tay có chạy không.
 *
 * CHỐT AN TOÀN: tự thoát nếu NODE_ENV=production, giống `seed.ts` (test SEC-14).
 */
import { Client } from 'pg';
import { hashPassword } from '../packages/identity-core/src/password.js';

if (process.env.NODE_ENV === 'production') {
  console.error('seed-admin: TỪ CHỐI chạy ở môi trường production');
  process.exit(1);
}

const TAI_KHOAN = process.env.ADMIN_USERNAME ?? 'admin01';
const THU = process.env.ADMIN_EMAIL ?? 'admin01@csbh.test';
const MAT_KHAU = process.env.ADMIN_PASSWORD ?? 'Test@1234';

const main = async () => {
  const db = new Client({
    host: process.env.PGHOST ?? 'postgres',
    database: process.env.PGDATABASE ?? 'csbh',
    user: process.env.PG_SUPERUSER ?? 'postgres',
    password: process.env.PG_PASSWORD ?? 'csbh_dev_pw',
  });
  await db.connect();

  const hash = await hashPassword(MAT_KHAU);

  /*
    `must_change_password` để FALSE, khác với mọi tài khoản do quản trị tạo.

    Đây là tài khoản mồi: không có ai ở trên nó để gửi thư mời, nên không có
    liên kết kích hoạt nào để đi qua. Bắt nó đổi mật khẩu thì màn hình đầu tiên
    của bản demo là một biểu mẫu đổi mật khẩu, trước cả khi thấy phần mềm làm gì.

    `activated_at` và `email_verified_at` đặt luôn: bỏ trống thì màn hình quản
    trị hiện chính tài khoản đang đăng nhập ở trạng thái "Chờ kích hoạt" kèm nút
    "Gửi lại thư mời" — đọc ra là hệ thống đang hỏng.
  */
  const r = await db.query<{ id: string }>(
    `INSERT INTO idn.app_user
       (username, email, full_name, role, password_hash,
        must_change_password, activated_at, email_verified_at)
     VALUES ($1, $2, 'Quan tri he thong', 'QUAN_TRI', $3, false, now(), now())
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, is_active = true
     RETURNING id`,
    [TAI_KHOAN, THU, hash],
  );

  /*
   * KHÔNG còn bảng `idn.user_node` nào phải điền (`0031`).
   *
   * Bản trước chèn một dòng vào đó cho mọi người dùng, vì `scope_user_ids` và
   * `notify_targets` đều nối vào bảng ấy. `0031` bỏ cây tổ chức và DROP luôn
   * bảng — phạm vi giờ suy từ bốn cột người trên chính hồ sơ.
   *
   * Câu lệnh cũ nằm lại và làm `make demo` chết ngay ở bước cuối, sau khi đã
   * dựng xong mười service: `relation "idn.user_node" does not exist`. Bộ test
   * không bắt được vì nó dùng `seed.ts`, một script khác.
   */

  await db.end();
  console.log(`seed-admin: xong — ${TAI_KHOAN} / ${MAT_KHAU}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
