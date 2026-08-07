/**
 * Bản AccountSource của identity — đọc thẳng CSDL vì identity SỞ HỮU lược đồ idn.
 *
 * Ghi vào đúng khoá Redis mà @csbh/http-kit dùng, nên chín service kia đọc lại
 * được cùng một bản ghi và cam kết "chậm nhất 60 giây" đúng trên toàn hệ.
 */
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { accountCacheKey, JWT, REDIS_URL, type AccountSource, type AccountState } from '@csbh/http-kit';
import { Db } from './db.js';

type Row = {
  id: string;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  password_changed_at: Date;
};

@Injectable()
export class AccountCache implements AccountSource, OnModuleDestroy {
  private readonly redis = new Redis(REDIS_URL);

  constructor(private readonly db: Db) {}

  async get(userId: string): Promise<AccountState | undefined> {
    const hit = await this.redis.get(accountCacheKey(userId));
    if (hit) return JSON.parse(hit) as AccountState;

    const row = await this.db.one<Row>(
      `SELECT id, role::text AS role, is_active, must_change_password, password_changed_at
         FROM idn.app_user WHERE id = $1`,
      [userId],
    );
    if (!row) return undefined;

    const state: AccountState = {
      id: row.id,
      role: row.role,
      isActive: row.is_active,
      mustChangePassword: row.must_change_password,
      passwordChangedAt: row.password_changed_at.getTime(),
    };
    await this.redis.set(accountCacheKey(userId), JSON.stringify(state), 'EX', JWT.accountCacheTtlSec);
    return state;
  }

  /** Gọi ngay sau mọi thay đổi đi qua API, để không phải chờ hết TTL. */
  async invalidate(userId: string): Promise<void> {
    await this.redis.del(accountCacheKey(userId));
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
