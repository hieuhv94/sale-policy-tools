/**
 * Hỏi identity "người này được xem dữ liệu của ai".
 *
 * Phạm vi SUY RA từ cây tổ chức và chỉ identity biết cây đó. Mỗi service tự
 * diễn giải lại là chắc chắn có chỗ diễn giải sai, và sai theo hướng lộ dữ liệu.
 */
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { identityUrl, JWT, mintServiceToken, REDIS_URL, type AuthUser } from '@csbh/http-kit';

@Injectable()
export class ScopeClient implements OnModuleDestroy {
  private readonly redis = new Redis(REDIS_URL);

  async userIdsFor(me: AuthUser): Promise<string[]> {
    const key = `idn:scope:${me.id}`;
    const hit = await this.redis.get(key);
    if (hit) return JSON.parse(hit) as string[];

    const res = await fetch(`${identityUrl()}/internal/scope/${encodeURIComponent(me.id)}`, {
      headers: { 'X-Service-Token': mintServiceToken('customer') },
    });
    if (!res.ok) throw new Error(`identity trả ${res.status} khi hỏi phạm vi dữ liệu`);
    const body = (await res.json()) as { scopeUserIds: string[] };
    // Cùng TTL với cache trạng thái tài khoản: đổi cây tổ chức thì phạm vi mới
    // có hiệu lực chậm nhất sau 60 giây (AUTH-15).
    await this.redis.set(key, JSON.stringify(body.scopeUserIds), 'EX', JWT.accountCacheTtlSec);
    return body.scopeUserIds;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
