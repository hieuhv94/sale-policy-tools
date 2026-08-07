/**
 * Kết nối Postgres bằng ĐÚNG DB role của identity (csbh_idn), không dùng
 * superuser. Ranh giới sở hữu dữ liệu ở mục AD-02 chỉ có giá trị khi service
 * thật sự chạy dưới role bị giới hạn quyền.
 */
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

@Injectable()
export class Db implements OnModuleDestroy {
  private readonly pool = new Pool({
    host: process.env.PGHOST ?? 'postgres',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? 'csbh',
    user: process.env.IDN_DB_USER ?? 'csbh_idn',
    password: process.env.ROLE_PASSWORD ?? 'csbh_dev_pw',
    max: 8,
  });

  async q<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.pool.query<T>(sql, params);
    return r.rows;
  }

  async one<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.q<T>(sql, params))[0];
  }

  /** Mọi thao tác chạm nhiều bảng đều đi qua đây — tạo tài khoản mà email gửi
   *  hỏng thì không được để lại tài khoản mồ côi không có token kích hoạt. */
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

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
