/**
 * Bản AccountSource cho các service KHÔNG sở hữu lược đồ idn.
 *
 * Đọc Redis trước; trượt cache thì hỏi identity qua API nội bộ. Dùng chung đúng
 * khoá Redis với identity, nên identity xoá cache là service này thấy ngay.
 */
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { JWT, REDIS_URL, identityUrl } from './jwt-config.js';
import { accountCacheKey, type AccountSource, type AccountState } from './account-source.js';
import { mintServiceToken } from './service-token.js';

@Injectable()
export class RemoteAccountSource implements AccountSource, OnModuleDestroy {
  private readonly log = new Logger(RemoteAccountSource.name);
  private readonly redis = new Redis(REDIS_URL);

  async get(userId: string): Promise<AccountState | undefined> {
    const hit = await this.redis.get(accountCacheKey(userId));
    if (hit) return JSON.parse(hit) as AccountState;

    const res = await fetch(`${identityUrl()}/internal/account/${encodeURIComponent(userId)}`, {
      headers: { 'X-Service-Token': mintServiceToken('remote-account-source') },
    });
    if (res.status === 404) return undefined;
    if (!res.ok) {
      // identity chết thì TỪ CHỐI chứ không cho qua. Cho qua là biến sự cố của
      // một service thành lỗ hổng xác thực của cả hệ.
      this.log.error(`identity trả ${res.status} khi hỏi trạng thái ${userId}`);
      throw new Error('không hỏi được trạng thái tài khoản');
    }
    const state = (await res.json()) as AccountState;
    await this.redis.set(
      accountCacheKey(userId),
      JSON.stringify(state),
      'EX',
      JWT.accountCacheTtlSec,
    );
    return state;
  }

  async onModuleDestroy(): Promise<void> {
    // Tắt máy KHÔNG được ném lỗi. Kết nối đã rớt sẵn thì `quit()` báo
    // "Connection is closed" và Nest biến nó thành lỗi khi đóng ứng dụng — che
    // mất nguyên nhân thật của lần tắt đó.
    await this.redis.quit().catch(() => undefined);
  }
}
