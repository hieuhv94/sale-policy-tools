/**
 * Cache trạng thái tài khoản trong Redis, TTL 60 giây (AUTH-07).
 *
 * Guard chạy trên MỌI request nên không thể mỗi lần lại truy vấn CSDL. Đổi lại
 * là một cửa sổ trễ: vô hiệu hoá tài khoản qua API thì cache bị xoá ngay nên
 * chặn tức thì; đổi thẳng dưới CSDL thì chậm nhất TTL giây sau mới có hiệu lực.
 */
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { Db } from './db.js';
import { CONFIG } from './config.js';

export type AccountState = {
  id: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  /** epoch MILI giây — giây là quá thô, xem ghi chú ở AuthGuard. */
  passwordChangedAt: number;
};

type Row = {
  id: string;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  password_changed_at: Date;
};

@Injectable()
export class AccountCache implements OnModuleDestroy {
  private readonly redis = new Redis(process.env.REDIS_URL ?? 'redis://redis:6379');

  constructor(private readonly db: Db) {}

  private key = (userId: string) => `idn:acct:${userId}`;

  async get(userId: string): Promise<AccountState | undefined> {
    const hit = await this.redis.get(this.key(userId));
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
    await this.redis.set(this.key(userId), JSON.stringify(state), 'EX', CONFIG.accountCacheTtlSec);
    return state;
  }

  /** Gọi ngay sau mọi thay đổi đi qua API, để không phải chờ hết TTL. */
  async invalidate(userId: string): Promise<void> {
    await this.redis.del(this.key(userId));
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
