/**
 * Ghi nhật ký từ sự kiện trên bus. Chỉ ghi thêm, không bao giờ sửa (YCNV muc 10).
 *
 * Nguyên tắc dịch sự kiện → dòng nhật ký: **không đoán**. Mỗi service phát ra
 * cái gì thì ghi đúng cái đó; audit không tự suy diễn ra hành động nào, vì suy
 * diễn sai trong nhật ký là loại sai tệ nhất — nó trông có thẩm quyền.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PG, pgCode } from '@csbh/http-kit';
import { Db } from '../infra/db.js';

export type Incoming = {
  eventId: string;
  routingKey: string;
  payload: Record<string, unknown>;
};

export type Outcome = 'written' | 'duplicate' | 'ignored';

const s = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * Tên hành động ghi vào nhật ký, suy từ khoá định tuyến.
 *
 * `policy.tbp_sign` → `TBP_SIGN`. Sự kiện nào mang sẵn trường `action` thì dùng
 * trường đó — nó chính xác hơn khoá định tuyến ở những sự kiện gộp.
 */
const actionOf = (e: Incoming): string =>
  s(e.payload['action']) ?? e.routingKey.split('.').slice(1).join('.').toUpperCase();

/** Loại đối tượng bị tác động. Dùng cho bộ lọc nhật ký và cho báo cáo hoạt động. */
const entityOf = (e: Incoming): string => {
  const declared = s(e.payload['entity']);
  if (declared) return declared;
  const [domain] = e.routingKey.split('.');
  return domain === 'sla' ? 'policy' : (domain ?? 'unknown');
};

const entityIdOf = (e: Incoming): string | null =>
  s(e.payload['id']) ?? s(e.payload['policyId']) ?? s(e.payload['customerId']) ?? null;

@Injectable()
export class AuditService {
  private readonly log = new Logger(AuditService.name);

  constructor(private readonly db: Db) {}

  async record(e: Incoming): Promise<Outcome> {
    const p = e.payload;

    // `occurred_at` là thời điểm việc XẢY RA, lấy từ payload — không phải thời
    // điểm ghi dòng. Xem chú thích dài ở migration 0015: đây là điều kiện để
    // khoá chống trùng `(occurred_at, event_id)` thật sự chặn được.
    const occurredAt = s(p['at']) ?? new Date().toISOString();

    // Chỉ nhận IP đúng dạng: cột là `inet`, và một chuỗi lạ sẽ làm câu lệnh hỏng
    // — mất luôn cả dòng nhật ký chỉ vì một header người dùng tự đặt.
    const ipRaw = s(p['actorIp']);
    const ip = ipRaw && /^[0-9a-fA-F.:]+$/.test(ipRaw) ? ipRaw : null;

    try {
      await this.db.q(
        `INSERT INTO aud.audit_log
           (event_id, occurred_at, actor_id, actor_role, actor_ip, action, entity, entity_id,
            before_data, after_data, reason, trace_id, app_version)
         VALUES ($1, $2::timestamptz, $3, $4, $5::inet, $6, $7, $8,
                 $9::jsonb, $10::jsonb, $11, $12, $13)`,
        [
          e.eventId,
          occurredAt,
          s(p['actorId']) ?? null,
          s(p['actorRole']) ?? null,
          ip,
          actionOf(e),
          entityOf(e),
          entityIdOf(e),
          p['before'] === undefined ? null : JSON.stringify(p['before']),
          p['after'] === undefined ? null : JSON.stringify(p['after']),
          s(p['reason']) ?? null,
          s(p['traceId']) ?? null,
          process.env.APP_VERSION ?? null,
        ],
      );
      return 'written';
    } catch (err) {
      // Hàng đợi giao ít nhất một lần. Sự kiện tới lần hai là chuyện thường, và
      // ràng buộc duy nhất ở CSDL là chốt chặn — không phải một phép kiểm trước
      // khi ghi, vốn hai bản audit chạy song song đều vượt qua được.
      if (pgCode(err) === PG.uniqueViolation) return 'duplicate';
      throw err;
    }
  }
}
