/**
 * Kết nối Postgres bằng ĐÚNG DB role của service, không dùng superuser. Ranh
 * giới sở hữu dữ liệu ở AD-02 chỉ có giá trị khi service thật sự chạy dưới role
 * bị giới hạn quyền.
 */
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

export class DbPool {
  private readonly pool: Pool;

  constructor(dbUser: string) {
    this.pool = new Pool({
      host: process.env.PGHOST ?? 'postgres',
      port: Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE ?? 'csbh',
      user: dbUser,
      password: process.env.ROLE_PASSWORD ?? 'csbh_dev_pw',
      max: 8,
    });
  }

  async q<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.pool.query<T>(sql, params);
    return r.rows;
  }

  async one<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.q<T>(sql, params))[0];
  }

  /**
   * Mọi thao tác chạm nhiều bảng đều đi qua đây.
   *
   * CHÚ Ý: ném lỗi từ bên trong `fn` sẽ ROLLBACK. Nhánh nào vừa phải GHI vừa
   * phải BÁO LỖI thì đưa kết quả ra ngoài rồi mới ném, nếu không việc ghi bị
   * hoàn tác trong im lặng mà người gọi vẫn thấy đúng mã lỗi.
   */
  async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** Mã lỗi Postgres hay phải ánh xạ sang mã HTTP. */
export const PG = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  checkViolation: '23514',
  invalidEnumInput: '22P02',
} as const;

export const pgCode = (e: unknown): string | undefined =>
  typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : undefined;
