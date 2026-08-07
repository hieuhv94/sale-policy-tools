/**
 * Ghi lại nỗ lực thao tác VƯỢT QUYỀN, kể cả khi nó bị từ chối (AUD-08).
 *
 * Nghe ngược trực giác: chặn được rồi thì ghi làm gì. Nhưng một lần bị chặn là
 * chuyện bình thường (bấm nhầm nút), còn ba mươi lần trong năm phút thì không —
 * và chỉ nhật ký mới phân biệt được hai điều đó. Bản ghi này cũng là thứ duy
 * nhất trả lời được "ai đã thử xem hồ sơ ngoài phạm vi của họ".
 *
 * Không ghi thẳng vào `aud.audit_log`: role csbh_pol không có quyền trên schema
 * aud. Đi qua outbox như mọi sự kiện nhật ký khác.
 *
 * ĐÃ ĐẢO LẠI MỘT QUYẾT ĐỊNH. Bản đầu ghi kiểu "bắn đi rồi quên" (`void`) với lý
 * lẽ "ghi là việc phụ, không được làm chậm phản hồi". Lý lẽ đó sai ở đây:
 *
 *   - Tiến trình tắt đúng lúc đó thì bản ghi mất hẳn, và mất trong im lặng.
 *   - Một bản ghi an ninh *thường* được ghi thì không phải bản ghi an ninh.
 *
 * Nó cũng làm test đỏ ngẫu nhiên — nhưng đó chỉ là triệu chứng, không phải lý
 * do sửa. Cái giá của việc chờ: một câu INSERT, cỡ một mili-giây, trên đúng
 * nhánh mà người dùng vừa bị từ chối.
 */
import { Catch, ForbiddenException, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { currentContext, type AuthUser } from '@csbh/http-kit';
import { Db } from './db.js';

type Req = { method?: string; originalUrl?: string; url?: string; user?: AuthUser };

@Catch(ForbiddenException)
export class DeniedAuditFilter extends BaseExceptionFilter {
  constructor(private readonly db: Db) {
    super();
  }

  override async catch(e: ForbiddenException, host: ArgumentsHost): Promise<void> {
    const req = host.switchToHttp().getRequest<Req>();
    const ctx = currentContext();
    const body = e.getResponse() as { code?: string };
    const path = req.originalUrl ?? req.url ?? '';

    // Bóc id hồ sơ ra khỏi đường dẫn. Không có nó thì dòng nhật ký chỉ nói "có
    // người bị chặn" — đúng nhưng vô dụng; câu hỏi thật là "ai đã thử xem hồ sơ
    // NÀO ngoài phạm vi của họ".
    const entityId = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(path)?.[0];

    // Ghi hỏng thì VẪN trả 403 về cho người dùng: không ghi được nhật ký là lỗi
    // vận hành, không phải lý do để cho qua một thao tác vượt quyền.
    await this.db
      .q(`INSERT INTO pol.outbox (routing_key, payload) VALUES ($1, $2::jsonb)`, [
        'security.denied',
        JSON.stringify({
          entity: 'security',
          id: entityId ?? null,
          action: 'ACCESS_DENIED',
          actorId: req.user?.id ?? null,
          actorRole: req.user?.role ?? null,
          reason: body?.code ?? 'FORBIDDEN',
          after: { method: req.method, path },
          traceId: ctx?.traceId ?? null,
          actorIp: ctx?.ip ?? null,
          at: new Date().toISOString(),
        }),
      ])
      .catch(() => undefined);

    super.catch(e, host);
  }
}
