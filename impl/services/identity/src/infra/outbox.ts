/**
 * Ghi sự kiện tài khoản và phiên vào `idn.outbox` (`0091`).
 *
 * TỚI `0091` SERVICE NÀY KHÔNG PHÁT GÌ CẢ — service duy nhất đứng ngoài đường
 * sự kiện, nên mọi việc nó làm đều vô hình với nhật ký kiểm toán: đăng nhập
 * thành công lẫn thất bại, khoá tạm tài khoản, tạo và vô hiệu hoá tài khoản,
 * đổi mật khẩu. Ba trong sáu câu hỏi của bản rà 22/08 hỏng vì đúng một chỗ này.
 *
 * HAI ĐƯỜNG GHI, và sự khác nhau giữa chúng là điều đáng nhớ nhất ở đây:
 *
 *   `emit()`     — trong CÙNG transaction với thay đổi nghiệp vụ. Dùng cho việc
 *                  có ghi dữ liệu: tạo tài khoản, vô hiệu hoá, đổi mật khẩu.
 *                  Ghi hỏng thì cả hai cùng lùi, không có vết mồ côi.
 *
 *   `emitNgoai()`— ngoài transaction, tự mở kết nối. Dùng cho việc KHÔNG ghi gì
 *                  cả mà vẫn phải để lại vết: đăng nhập thất bại là chính nó.
 *                  Không có đường này thì đúng loại sự kiện an ninh quan trọng
 *                  nhất lại không có chỗ nào ghi.
 */
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { kemNguCanh } from '@csbh/http-kit';
import { Db } from './db.js';

const CAU_GHI = `INSERT INTO idn.outbox (routing_key, payload) VALUES ($1, $2::jsonb)`;

export async function emit(
  c: PoolClient,
  routingKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await c.query(CAU_GHI, [routingKey, JSON.stringify(kemNguCanh(payload))]);
}

@Injectable()
export class SuKienIdn {
  constructor(private readonly db: Db) {}

  /**
   * Phát một sự kiện KHÔNG kèm thay đổi dữ liệu nào.
   *
   * Nuốt lỗi có chủ ý, và đây là chỗ hiếm hoi việc ấy đúng: một lượt đăng nhập
   * KHÔNG được hỏng chỉ vì không ghi nổi dòng nhật ký. Đổi lại thì ghi log —
   * `0089` đã chốt rằng im lặng hoàn toàn mới là thứ không chấp nhận được.
   */
  async ngoai(routingKey: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.db.q(CAU_GHI, [routingKey, JSON.stringify(kemNguCanh(payload))]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`idn.outbox: không ghi được ${routingKey}: ${String(e)}`);
    }
  }
}

/**
 * Tải sự kiện chuẩn của nhóm tài khoản.
 *
 * `entity: 'user'` cho mọi sự kiện ở đây, kể cả đăng nhập: đối tượng bị tác
 * động là TÀI KHOẢN. Nhóm theo `entity` trên màn hình nhật ký nhờ vậy gom đúng
 * một chỗ mọi chuyện liên quan tới tài khoản.
 *
 * `targetLabel` là TÊN ĐĂNG NHẬP chứ không phải họ tên: người đọc nhật ký đang
 * truy một tài khoản, và tên đăng nhập là thứ duy nhất chắc chắn duy nhất — bài
 * học của `sửa 17/08`, khi việc xác nhận bằng họ tên bị đổi sang tên đăng nhập
 * vì họ tên không chứng minh được người quản trị đang nhìn đúng dòng.
 */
export const suKienTaiKhoan = (v: {
  action: string;
  userId?: string | null;
  username?: string | null;
  outcome?: 'OK' | 'FAILED';
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
}): Record<string, unknown> => ({
  entity: 'user',
  action: v.action,
  ...(v.userId ? { id: v.userId } : {}),
  ...(v.username ? { targetLabel: v.username } : {}),
  ...(v.outcome ? { outcome: v.outcome } : {}),
  ...(v.reason ? { reason: v.reason } : {}),
  ...(v.before === undefined ? {} : { before: v.before }),
  ...(v.after === undefined ? {} : { after: v.after }),
  ...(v.actorId ? { actorId: v.actorId } : {}),
  ...(v.actorName ? { actorName: v.actorName } : {}),
  ...(v.actorRole ? { actorRole: v.actorRole } : {}),
  at: new Date().toISOString(),
});
