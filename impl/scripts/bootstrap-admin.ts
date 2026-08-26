/**
 * TÀI KHOẢN QUẢN TRỊ ĐẦU TIÊN trên máy chủ thật (`0105`).
 *
 * Đây là lỗ hổng lộ ra ở lượt rà đóng gói: `seed.ts` và `seed-admin.ts` đều tự
 * thoát khi `NODE_ENV=production` (SEC-14), và chốt ấy ĐÚNG — quá nhiều hệ thống
 * lên máy chủ thật kèm `admin/Test@1234`. Nhưng không có đường thay thế nào, nên
 * một bản cài mới với CSDL trắng ở production là một hệ thống **không ai đăng
 * nhập được**, và cũng không có màn hình nào để tạo tài khoản đầu tiên.
 *
 * Script này là đường ấy. Nó khác `seed-admin.ts` ở bốn chỗ, và cả bốn đều là
 * điều kiện để nó được phép chạy ở production:
 *
 *   1. **Không có giá trị mặc định nào.** Thiếu một biến thì dừng. `seed-admin`
 *      có sẵn `admin01/Test@1234` — tiện cho demo, và đúng thứ SEC-14 cấm.
 *   2. **Mật khẩu phải qua đúng luật của phần mềm** (`checkNewPassword`, muc
 *      2.8). Một script mồi nới lỏng luật mật khẩu là một cửa sau.
 *   3. **Từ chối khi CSDL đã có tài khoản.** Nó là lệnh MỒI, không phải lệnh
 *      tạo người dùng — chạy lại lần hai trên hệ đang sống là một cách đặt lại
 *      mật khẩu quản trị mà không để lại dấu vết ở màn hình nào.
 *   4. **Bắt buộc đổi mật khẩu ở lần đăng nhập đầu.** Mật khẩu này đi qua dòng
 *      lệnh và nằm lại trong lịch sử shell của người cài đặt.
 *
 * Cách gọi (xem `docs/04-TRIEN-KHAI.md`):
 *
 *   docker compose run --rm -e ADMIN_USERNAME=... -e ADMIN_EMAIL=... \
 *     -e ADMIN_PASSWORD=... ops bootstrap-admin
 */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { checkNewPassword, describePasswordProblems } from '../packages/identity-core/src/password-policy.js';
import { hashPassword } from '../packages/identity-core/src/password.js';
import { chuanHoaMienThu, thuocMienThu } from '../packages/http-kit/src/mail-config.js';

const doc = (ten: string): string => {
  const tepBM = process.env[`${ten}_FILE`];
  if (tepBM) {
    // Mật khẩu qua FILE thì nó không nằm lại trong lịch sử shell hay trong
    // `docker inspect` của container — đường được khuyến nghị.
    return readFileSync(tepBM, 'utf8').trim();
  }
  const v = process.env[ten]?.trim();
  if (!v) {
    console.error(
      `bootstrap-admin: thiếu ${ten}. Không có giá trị mặc định nào — ` +
        `đặt ${ten} hoặc ${ten}_FILE.`,
    );
    process.exit(1);
  }
  return v;
};

const HINH_THU = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const main = async () => {
  const taiKhoan = doc('ADMIN_USERNAME');
  const thu = doc('ADMIN_EMAIL');
  const matKhau = doc('ADMIN_PASSWORD');
  const hoTen = process.env.ADMIN_FULL_NAME?.trim() || 'Quản trị hệ thống';

  if (!HINH_THU.test(thu)) {
    console.error(`bootstrap-admin: ADMIN_EMAIL "${thu}" không phải địa chỉ thư hợp lệ.`);
    process.exit(1);
  }

  /*
   * ĐỊA CHỈ PHẢI NẰM TRONG `MAIL_ALLOWLIST` (`0117`).
   *
   * Lệnh mồi không gửi thư nào (`0114`), nên sai ở đây KHÔNG lộ ra lúc cài: tài
   * khoản dựng xong có mật khẩu ngay và đăng nhập được. Nó lộ ra vài tháng sau,
   * lần đầu người quản trị bấm *Quên mật khẩu* — đường ấy đi qua đúng bộ lọc tên
   * miền, và nó im lặng theo thiết kế (không nói tài khoản có tồn tại hay không).
   * Triệu chứng khi đó là một hệ thống không còn ai vào được bằng quyền quản trị.
   *
   * Dùng chung `chuanHoaMienThu`/`thuocMienThu` với hai service gửi thư — chép
   * lại phép so ở đây là dựng chỗ thứ ba để hai bên lệch nhau.
   */
  const mienThu = chuanHoaMienThu(process.env.MAIL_ALLOWLIST);
  if (!thuocMienThu(thu, mienThu)) {
    console.error(
      `bootstrap-admin: ADMIN_EMAIL "${thu}" không thuộc tên miền nào trong MAIL_ALLOWLIST ` +
        `(${mienThu.join(', ')}). Tài khoản mồi vẫn đăng nhập được, nhưng "Quên mật khẩu" ` +
        'sẽ KHÔNG BAO GIỜ gửi được thư cho nó. Dùng địa chỉ thuộc tên miền công ty, ' +
        'hoặc khai thêm tên miền vào MAIL_ALLOWLIST trong .env rồi chạy lại.',
    );
    process.exit(1);
  }

  const loi = checkNewPassword(matKhau);
  if (loi.length > 0) {
    console.error(`bootstrap-admin: mật khẩu chưa đạt — ${describePasswordProblems(loi)}.`);
    process.exit(1);
  }

  const db = new Client({
    host: process.env.PGHOST ?? 'postgres',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? 'csbh',
    user: process.env.PG_SUPERUSER ?? process.env.PGUSER ?? 'postgres',
    password: process.env.PG_PASSWORD ?? process.env.PGPASSWORD,
  });
  await db.connect();

  try {
    /*
     * ĐẾM TRƯỚC, và đếm TẤT CẢ — kể cả tài khoản đã vô hiệu hoá.
     *
     * Đếm mỗi tài khoản đang hoạt động thì một hệ có đúng một quản trị vừa bị
     * vô hiệu hoá sẽ cho chạy lại script này, và lượt ấy dựng một quản trị mới
     * mà không ai phê duyệt. Đường đúng cho tình huống đó là phục hồi từ bản
     * sao lưu, không phải mồi lại.
     */
    /*
     * CHƯA CHẠY MIGRATION là tình huống có thật, không phải chuyện hiếm (`0110`).
     *
     * `docker compose run ops` tự khởi động Postgres theo `depends_on`, nên gọi
     * lệnh này trước `./csbh len` sẽ dựng một CSDL TRỐNG rồi chạy luôn — không
     * có gì báo rằng lược đồ chưa có. Bản trước ném nguyên vết ngăn xếp của `pg`:
     *
     *   error: relation "idn.app_user" does not exist
     *
     * — đúng về mặt kỹ thuật, và không nói cho người cài đặt biết phải gõ gì.
     */
    let rows: { n: string }[];
    try {
      ({ rows } = await db.query<{ n: string }>('SELECT count(*)::text AS n FROM idn.app_user'));
    } catch (e) {
      // 42P01 = undefined_table. Bắt theo MÃ chứ không theo câu chữ: câu chữ của
      // Postgres đổi theo ngôn ngữ máy chủ, mã thì không.
      if ((e as { code?: string }).code !== '42P01') throw e;
      console.error(
        'bootstrap-admin: CSDL chưa chạy migration — chưa có lược đồ nào. ' +
          'Chạy "./csbh len" trước, rồi gọi lại lệnh này.',
      );
      console.error(
        '  Nếu "./csbh len" đã chạy rồi: lệnh này đang nối tới một CSDL KHÁC. ' +
          'Kiểm COMPOSE_PROJECT_NAME trong .env — nó quyết định volume dữ liệu nào được dùng.',
      );
      process.exit(1);
    }
    const n = Number(rows[0]?.n ?? '0');
    if (n > 0) {
      console.error(
        `bootstrap-admin: TỪ CHỐI — CSDL đã có ${n} tài khoản. ` +
          'Lệnh này chỉ dùng cho lần cài đặt đầu tiên. ' +
          'Quên mật khẩu quản trị thì dùng đường "Quên mật khẩu" trên màn hình đăng nhập.',
      );
      process.exit(1);
    }

    const hash = await hashPassword(matKhau);
    const r = await db.query<{ id: string }>(
      `INSERT INTO idn.app_user
         (username, email, full_name, role, password_hash,
          must_change_password, activated_at, email_verified_at)
       VALUES ($1, $2, $3, 'QUAN_TRI', $4, true, now(), now())
       RETURNING id`,
      [taiKhoan, thu, hoTen, hash],
    );

    console.log(`bootstrap-admin: đã tạo ${taiKhoan} (${r.rows[0]?.id}).`);
    /*
     * NÓI RÕ LÀ KHÔNG CÓ THƯ NÀO (`0114`).
     *
     * Mọi tài khoản khác trong hệ đều nhận một thư mời kèm liên kết kích hoạt —
     * đó là đường DUY NHẤT để chúng có mật khẩu. Tài khoản này thì ngược lại:
     * không có ai ở trên nó để gửi thư mời, nên nó nhận mật khẩu thẳng từ dòng
     * lệnh và được đánh dấu đã kích hoạt luôn.
     *
     * Người cài đặt không biết ngoại lệ ấy sẽ ngồi chờ một lá thư không bao giờ
     * tới, rồi đi tra cấu hình SMTP — thứ chưa liên quan gì ở bước này.
     */
    console.log('bootstrap-admin: KHÔNG có thư nào được gửi — đăng nhập bằng chính');
    console.log('  mật khẩu vừa nhập. Lần đăng nhập đầu tiên sẽ BẮT BUỘC đổi mật khẩu.');
    console.log('  Muốn kiểm đường thư thì tạo một tài khoản THỨ HAI trên giao diện:');
    console.log('  tài khoản ấy mới nhận thư mời kích hoạt.');
  } finally {
    await db.end();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
