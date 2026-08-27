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
import type { PhamVi } from '../reports/filter.js';

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

  /**
   * Phạm vi ĐẦY ĐỦ để đưa cho `build()` — id VÀ vai trò (`0144`).
   *
   * Một hàm chứ không phải hai lời gọi rời ở tám chỗ: từ `0142` phạm vi của Kế
   * toán khác năm vai trò còn lại, nên một chỗ lấy id mà quên vai trò là một
   * màn hình đếm thừa hồ sơ mà chính người đọc không mở được. Ở đây thì không
   * có cách nào lấy được vế này mà bỏ vế kia.
   */
  async phamViCua(me: AuthUser): Promise<PhamVi> {
    return { ids: await this.userIdsFor(me), vaiTro: me.role };
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
