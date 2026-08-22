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
  /**
   * Người đang gọi, đặt bởi `AuthGuard` sau khi token hợp lệ (`0090`).
   *
   * Cùng lý do với `ip` và `traceId`: nhật ký cần biết AI, mà nơi phát sự kiện
   * nằm sâu trong service còn danh tính chỉ có ở tầng HTTP. Ghi tên vào đây một
   * chỗ, thay vì sửa chữ ký của mọi hàm trên đường đi — và bỏ sót một chỗ thì
   * đúng dòng nhật ký ấy khuyết tên mà không ai biết.
   *
   * `undefined` ở đường công khai (đăng nhập, đặt mật khẩu) và ở consumer chạy
   * nền — hai chỗ không có người nào đang gọi.
   */
  actor?: { id: string; name?: string | undefined; username?: string | undefined; role: string } | undefined;
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

/**
 * Gắn ngữ cảnh request vào một tải sự kiện trước khi ghi outbox (`0090`).
 *
 * MỘT chỗ cho cả bốn service phát sự kiện, và điều đó không chỉ gọn: tới `0090`
 * chỉ `policy` gắn `traceId` với `actorIp`, nên nhật ký ghi việc đổi giá danh
 * mục hay đổi khách hàng đều **không có IP và không nối được chuỗi** — một
 * khoảng hụt không ai thấy vì dòng nhật ký vẫn hiện ra bình thường.
 *
 * Không ghi đè thứ nơi gọi đã tự đặt: vài sự kiện mang `actorId` của người khác
 * người đang gọi — bàn giao lúc vô hiệu hoá tài khoản là một ví dụ — và ở đó
 * nơi gọi biết rõ hơn ngữ cảnh.
 */
export const kemNguCanh = (payload: Record<string, unknown>): Record<string, unknown> => {
  const ctx = storage.getStore();
  const co = (k: string) => payload[k] !== undefined && payload[k] !== null;

  /*
   * Tên chỉ được gắn khi `actorId` CHÍNH LÀ người đang gọi.
   *
   * Ba trường hợp, và chúng khác nhau thật:
   *
   *   - Nơi gọi không đặt `actorId` → lấy cả id lẫn tên từ ngữ cảnh.
   *   - Nơi gọi đặt `actorId` TRÙNG người đang gọi (hầu hết: `actorId: me.id`)
   *     → tên từ ngữ cảnh là đúng người, gắn vào.
   *   - Nơi gọi đặt `actorId` của NGƯỜI KHÁC — bàn giao lúc vô hiệu hoá tài
   *     khoản mang id của người bị vô hiệu hoá — → KHÔNG gắn. Ghép tên người
   *     đang bấm vào id người khác là một dòng nhật ký sai người, và sai theo
   *     kiểu không ai kiểm ra được về sau.
   *
   * Luật đầu tiên tôi viết chỉ có hai nhánh đầu và nhánh cuối gộp làm một, nên
   * mọi sự kiện `actorId: me.id` đều mất tên — ca đối chiếu qua HTTP thật bắt
   * được, còn ba ca gọi thẳng hàm này thì không.
   */
  const cungNguoi = !co('actorId') || payload['actorId'] === ctx?.actor?.id;

  return {
    ...payload,
    ...(co('traceId') ? {} : { traceId: ctx?.traceId ?? null }),
    ...(co('actorIp') ? {} : { actorIp: ctx?.ip ?? null }),
    ...(co('actorId') ? {} : { actorId: ctx?.actor?.id ?? null }),
    ...(co('actorRole') ? {} : { actorRole: ctx?.actor?.role ?? null }),
    ...(co('actorName') || !cungNguoi ? {} : { actorName: ctx?.actor?.name ?? null }),
    ...(co('actorUsername') || !cungNguoi ? {} : { actorUsername: ctx?.actor?.username ?? null }),
  };
};
