import { Client, type ClientConfig } from 'pg';

const base: ClientConfig = {
  host: process.env.PGHOST ?? 'postgres',
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? 'csbh',
};

/** Kết nối bằng tài khoản quản trị — dùng để dựng dữ liệu cho test. */
export function admin(): Client {
  return new Client({
    ...base,
    user: process.env.PG_SUPERUSER ?? 'postgres',
    password: process.env.PG_PASSWORD ?? 'csbh_dev_pw',
  });
}

/** Kết nối bằng đúng DB role của một service — dùng để kiểm ranh giới quyền. */
export function asRole(role: string): Client {
  return new Client({
    ...base,
    user: role,
    password: process.env.ROLE_PASSWORD ?? 'csbh_dev_pw',
  });
}

export async function withClient<T>(c: Client, fn: (c: Client) => Promise<T>): Promise<T> {
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Bắt lỗi SQL và trả về mã lỗi Postgres, để test khẳng định đúng loại lỗi. */
export async function expectSqlError(
  fn: () => Promise<unknown>,
): Promise<{ code: string | undefined; message: string }> {
  try {
    await fn();
  } catch (e) {
    const err = e as { code?: string; message: string };
    return { code: err.code, message: err.message };
  }
  throw new Error('Câu lệnh đáng lẽ phải lỗi nhưng lại chạy thành công');
}

export const uuid = () =>
  '10000000-0000-4000-8000-' + String(Date.now() % 1e12).padStart(12, '0');

/**
 * Chạy một đoạn test có thay đổi dữ liệu rồi HOÀN TÁC, kể cả khi assertion ném lỗi.
 *
 * Không có nó thì một test đỏ sẽ để lại dữ liệu bẩn và làm hỏng lây các lần chạy
 * sau — kiểu lỗi tốn nhiều thời gian nhất để tìm ra, vì test đỏ ở chỗ khác hẳn
 * nơi gây ra vấn đề.
 */
export async function inRollback(c: Client, fn: () => Promise<void>): Promise<void> {
  await c.query('BEGIN');
  try {
    await fn();
  } finally {
    await c.query('ROLLBACK');
  }
}

/**
 * Bắt lỗi SQL BÊN TRONG một transaction đang mở.
 *
 * Postgres đưa cả transaction vào trạng thái abort ngay khi một câu lệnh lỗi, nên
 * `expectSqlError` thường sẽ làm mọi câu lệnh sau đó hỏng theo với mã 25P02.
 * SAVEPOINT khoanh riêng câu lệnh dự kiến lỗi, để test còn kiểm được hiện trạng
 * sau đó — ví dụ "hồ sơ Từ chối vẫn còn nguyên sau khi DELETE bị chặn".
 */
export async function expectSqlErrorInTx(
  c: Client,
  fn: () => Promise<unknown>,
): Promise<{ code: string | undefined; message: string }> {
  await c.query('SAVEPOINT sp_expect');
  try {
    await fn();
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT sp_expect');
    const err = e as { code?: string; message: string };
    return { code: err.code, message: err.message };
  }
  await c.query('RELEASE SAVEPOINT sp_expect');
  throw new Error('Câu lệnh đáng lẽ phải lỗi nhưng lại chạy thành công');
}

/** Một khách hàng thật để hồ sơ CSBH trỏ vào — khoá ngoại pol.policy -> cus.customer. */
export async function mkCustomer(c: Client, tag = 'T'): Promise<string> {
  const r = await c.query<{ id: string }>(
    `INSERT INTO cus.customer
       (code, name, customer_type, registered_address, owner_name, tdv_user_id, created_by)
     VALUES ($1, 'Khach hang test', 1, 'Ha Noi', 'Chu ho',
             (SELECT id FROM idn.app_user WHERE username = 'tdv01'),
             (SELECT id FROM idn.app_user WHERE username = 'tdv01'))
     RETURNING id`,
    [`ZZ-${tag}-${crypto.randomUUID().slice(0, 8)}`],
  );
  return r.rows[0]!.id;
}
