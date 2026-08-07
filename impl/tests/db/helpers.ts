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
