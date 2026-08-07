/**
 * Mở ngữ cảnh request cho mọi lời gọi, và trả `trace_id` về trong phản hồi.
 *
 * Trả về trong header là chủ ý: người dùng gặp lỗi có thể đọc mã đó ra và đọc
 * cho bộ phận hỗ trợ, thay vì mô tả "lúc nãy tôi bấm gì đó rồi nó báo lỗi".
 */
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { runWithContext, traceIdFrom, TRACE_HEADER } from './request-context.js';

type Req = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
};
type Res = { setHeader(name: string, value: string): void };

@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: Req, res: Res, next: () => void): void {
    const traceId = traceIdFrom(req.headers[TRACE_HEADER]);
    // `req.ip` chỉ đúng khi Express được bảo là đứng sau proxy; sau Caddy thì
    // địa chỉ thật nằm ở X-Forwarded-For. Lấy cả hai và ưu tiên cái Express đã
    // giải nghĩa, còn socket là đường lui khi không có proxy nào.
    const ip = req.ip ?? req.socket?.remoteAddress;
    res.setHeader(TRACE_HEADER, traceId);
    runWithContext({ traceId, ...(ip ? { ip } : {}) }, next);
  }
}
