/**
 * Hỏi identity "người này được xem dữ liệu của ai".
 *
 * Bản sao thứ ba của lời gọi này (policy và customer đã có). Giữ nguyên bản sao
 * thay vì gom vào http-kit là có chủ ý ở P4 và vẫn đúng ở đây: mỗi service ký
 * token dịch vụ bằng tên của chính nó, nên phần thân hàm giống nhau nhưng danh
 * tính người gọi thì không.
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
      headers: { 'X-Service-Token': mintServiceToken('reporting') },
    });
    if (!res.ok) throw new Error(`identity trả ${res.status} khi hỏi phạm vi dữ liệu`);
    const body = (await res.json()) as { scopeUserIds: string[] };
    await this.redis.set(key, JSON.stringify(body.scopeUserIds), 'EX', JWT.accountCacheTtlSec);
    return body.scopeUserIds;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
