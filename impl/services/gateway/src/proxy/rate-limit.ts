/**
 * Giới hạn tần suất cho hai đường tốn kém nhất: đăng nhập và xuất file (SEC-07).
 *
 * VÌ SAO Ở GATEWAY CHỨ KHÔNG Ở CADDY. Caddy 2 không có giới hạn tần suất sẵn —
 * phải dựng lại ảnh bằng xcaddy để nhét plugin vào. Nhưng lý do chính không phải
 * là tiện: bộ đếm phải theo **người dùng** ở đường xuất file, mà Caddy không đọc
 * được JWT để biết ai đang gọi. Nó chỉ thấy địa chỉ IP, và cả phòng kinh doanh
 * ngồi sau một địa chỉ NAT duy nhất.
 *
 * Nên: đăng nhập đếm theo IP + tên đăng nhập (chưa có danh tính để đếm), xuất
 * file đếm theo id người dùng (đã xác thực rồi).
 *
 * Bộ đếm nằm ở Redis chứ không trong bộ nhớ tiến trình: hai bản gateway thì bộ
 * đếm trong bộ nhớ cho phép gấp đôi số lần thử, và mỗi lần khởi động lại là xoá
 * sạch — biến việc giới hạn thành lời mời khởi động lại gateway.
 */
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_URL } from '@csbh/http-kit';

export type Rule = {
  /** Tên hiển thị trong header và trong log. */
  name: string;
  limit: number;
  windowSec: number;
};

/**
 * Hai ngưỡng, đặt theo NHỊP LÀM VIỆC THẬT chứ không theo con số tròn.
 *
 * Đăng nhập: gõ sai mật khẩu vài lần là chuyện thường, nhưng 20 lần trong một
 * phút thì không phải người gõ. Khoá tài khoản sau 5 lần sai đã có ở AUTH-09;
 * lớp này chặn kiểu dò mật khẩu trải mỏng trên NHIỀU tài khoản, thứ mà khoá
 * theo tài khoản không thấy.
 *
 * Xuất file: mỗi lần là một việc nền dựng tới 20 nghìn dòng. Mười lần trong năm
 * phút đã là nhiều hơn bất kỳ ai thật sự cần.
 */
export const RULES = {
  login: {
    name: 'login',
    limit: Number(process.env.RATE_LOGIN_LIMIT ?? 20),
    windowSec: Number(process.env.RATE_LOGIN_WINDOW_SEC ?? 60),
  } satisfies Rule,
  export: {
    name: 'export',
    limit: Number(process.env.RATE_EXPORT_LIMIT ?? 10),
    windowSec: Number(process.env.RATE_EXPORT_WINDOW_SEC ?? 300),
  } satisfies Rule,
  /**
   * Gửi và sửa bình luận (`0261`, yêu cầu §7.11). Ba mươi một phút là trao đổi
   * dồn dập vẫn thoải mái; một vòng lặp gửi rác thì không.
   */
  binhLuan: {
    name: 'binh-luan',
    limit: Number(process.env.RATE_BINH_LUAN_LIMIT ?? 30),
    windowSec: Number(process.env.RATE_BINH_LUAN_WINDOW_SEC ?? 60),
  } satisfies Rule,
  /** Tìm người để nhắc tên — gõ từng phím có chờ 250ms nên sáu mươi là dư. */
  timNguoiNhac: {
    name: 'tim-nguoi-nhac',
    limit: Number(process.env.RATE_TIM_NHAC_LIMIT ?? 60),
    windowSec: Number(process.env.RATE_TIM_NHAC_WINDOW_SEC ?? 60),
  } satisfies Rule,
};

export type Verdict = { allowed: boolean; remaining: number; retryAfterSec: number; rule: Rule };

@Injectable()
export class RateLimiter implements OnModuleDestroy {
  private readonly redis = new Redis(REDIS_URL);

  /**
   * Cửa sổ cố định bằng `INCR` + `EXPIRE`.
   *
   * Không dùng cửa sổ trượt: nó cần một sorted set và ba lệnh mỗi request, đổi
   * lại độ chính xác ở ranh giới cửa sổ — thứ không đáng ở đây, vì kẻ tấn công
   * lợi dụng được nhiều nhất là gấp đôi hạn mức trong một khoảnh khắc.
   *
   * `EXPIRE` chỉ đặt ở lần tăng ĐẦU TIÊN. Đặt lại mỗi lần thì cửa sổ bị đẩy mãi
   * về sau và bộ đếm không bao giờ hết hạn — người dùng bị khoá vĩnh viễn sau
   * khi vượt ngưỡng một lần.
   */
  async hit(rule: Rule, key: string): Promise<Verdict> {
    const k = `rl:${rule.name}:${key}`;
    const n = await this.redis.incr(k);
    if (n === 1) await this.redis.expire(k, rule.windowSec);

    if (n <= rule.limit) {
      return { allowed: true, remaining: rule.limit - n, retryAfterSec: 0, rule };
    }
    const ttl = await this.redis.ttl(k);
    return {
      allowed: false,
      remaining: 0,
      // TTL âm nghĩa là khoá vừa hết hạn giữa hai lệnh — trả về cửa sổ đầy đủ
      // thay vì một số âm đi thẳng vào header `Retry-After`.
      retryAfterSec: ttl > 0 ? ttl : rule.windowSec,
      rule,
    };
  }

  /** Dùng trong test và trong việc mở khoá bằng tay khi có người bị chặn nhầm. */
  async reset(rule: Rule, key: string): Promise<void> {
    await this.redis.del(`rl:${rule.name}:${key}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
