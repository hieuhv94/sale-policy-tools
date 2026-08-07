/**
 * Giữ điều kiện lọc trong PHIÊN LÀM VIỆC (RPT-04).
 *
 * VÌ SAO ĐỂ Ở MÁY CHỦ chứ không `sessionStorage` của trình duyệt. Yêu cầu là
 * "đặt bộ lọc, chuyển màn hình rồi quay lại thì điều kiện giữ nguyên" — riêng
 * điều đó thì trình duyệt làm được. Nhưng hai chỗ dưới đây thì không:
 *
 *   - Người dùng mở hồ sơ ở tab thứ hai. `sessionStorage` tách theo tab, nên
 *     tab mới mất sạch bộ lọc dù vẫn cùng một phiên đăng nhập.
 *   - Đăng xuất phải xoá được bộ lọc. Dữ liệu nằm trong trình duyệt thì nó ở lại
 *     trên máy dùng chung sau khi người ta rời đi.
 *
 * Redis chứ không CSDL: đây là trạng thái tạm của phiên, hết hạn theo phiên, và
 * không có giá trị lịch sử nào. Đưa vào Postgres là thêm một bảng phải dọn.
 */
import { BadRequestException, Injectable, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_URL, type AuthUser } from '@csbh/http-kit';
import { cleanFilter, type Filter } from './filter.js';

/** Cùng hạn với token làm mới: bộ lọc sống đúng bằng phiên làm việc. */
const TTL_SEC = Number(process.env.RPT_FILTER_TTL_SEC ?? 12 * 60 * 60);

/** Danh sách ĐÓNG. Tên màn hình đi thẳng vào khoá Redis nên không nhận chuỗi tự do. */
const SCREENS = ['ho-so', 'bao-cao', 'khach-hang'] as const;

@Injectable()
export class FilterStore implements OnModuleDestroy {
  private readonly redis = new Redis(REDIS_URL);

  private key(me: AuthUser, screen: string): string {
    if (!(SCREENS as readonly string[]).includes(screen)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        field: 'screen',
        message: `screen phải là một trong: ${SCREENS.join(', ')}`,
      });
    }
    return `rpt:filter:${me.id}:${screen}`;
  }

  async save(me: AuthUser, screen: string, raw: Record<string, unknown>): Promise<Filter> {
    // Chuẩn hoá TRƯỚC khi lưu. Lưu nguyên văn thì một bộ lọc hỏng nằm lại trong
    // Redis và mỗi lần mở màn hình lại nổ ra cùng một lỗi 400 cho tới khi có ai
    // đó biết cách xoá khoá đó bằng tay.
    const f = cleanFilter(raw);
    await this.redis.set(this.key(me, screen), JSON.stringify(f), 'EX', TTL_SEC);
    return f;
  }

  async load(me: AuthUser, screen: string): Promise<Filter> {
    const hit = await this.redis.get(this.key(me, screen));
    if (!hit) return {};
    try {
      return cleanFilter(JSON.parse(hit) as Record<string, unknown>);
    } catch {
      return {};
    }
  }

  async clear(me: AuthUser, screen: string): Promise<void> {
    await this.redis.del(this.key(me, screen));
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
