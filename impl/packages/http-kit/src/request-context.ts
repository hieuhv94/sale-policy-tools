/**
 * Ngữ cảnh của một request, đi theo suốt chuỗi `await` mà không phải truyền tay.
 *
 * VÌ SAO CẦN: nhật ký phải ghi được IP và `trace_id` (AUD-06), mà hai thứ đó chỉ
 * có ở tầng HTTP còn nơi phát sự kiện lại nằm sâu trong service. Truyền tay
 * xuống từng lời gọi nghĩa là đổi chữ ký của gần như mọi hàm — và bỏ sót một
 * chỗ thì dòng nhật ký đó thiếu vết, mà thiếu vết thì không ai phát hiện ra cho
 * tới lúc cần điều tra.
 *
 * `AsyncLocalStorage` giữ ngữ cảnh đúng theo từng request kể cả khi nhiều
 * request chạy xen kẽ nhau — khác hẳn một biến toàn cục, vốn sẽ trộn lẫn IP của
 * người này vào nhật ký của người kia dưới tải.
 *
 * `trace_id` từng là món nợ ghi lại ở P5.6: "có cột nhưng không ai điền".
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export type RequestContext = {
  traceId: string;
  ip?: string | undefined;
};

const storage = new AsyncLocalStorage<RequestContext>();

export const currentContext = (): RequestContext | undefined => storage.getStore();

export const currentTraceId = (): string | undefined => storage.getStore()?.traceId;
export const currentIp = (): string | undefined => storage.getStore()?.ip;

export const runWithContext = <T>(ctx: RequestContext, fn: () => T): T => storage.run(ctx, fn);

/** Header truyền `trace_id` giữa gateway và các service, và giữa service với nhau. */
export const TRACE_HEADER = 'x-trace-id';

/**
 * Nhận `trace_id` từ đầu vào nếu có, sinh mới nếu chưa.
 *
 * Nhận từ đầu vào là điều kiện để một luồng duyệt hoàn chỉnh — gateway, bốn
 * service, một consumer — cùng mang MỘT mã và tra lại được bằng một truy vấn
 * (INT-11). Sinh mới ở mỗi chặng thì mỗi chặng một mã, và không nối lại được.
 */
export const traceIdFrom = (headerValue: string | string[] | undefined): string => {
  const v = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  // Chỉ nhận mã đúng dạng: header do client gửi, và mã tuỳ ý sẽ lọt thẳng vào
  // truy vấn tra log lẫn vào bản ghi nhật ký.
  return v && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : randomUUID();
};
