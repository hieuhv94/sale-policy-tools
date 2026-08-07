/**
 * Cấu hình thư — và hai chốt an toàn chặn ngay lúc khởi động.
 *
 * Email là chỗ dễ gây tai nạn nhất khi test: một biến môi trường sai là thư
 * chạy thẳng tới Trưởng bộ phận thật. Nguyên tắc đã chốt ở thiết kế §14: chặn ở
 * TẦNG SMTP chứ không ở tầng ứng dụng — ứng dụng cứ gửi thật như production,
 * thứ nhận thư mới là thứ khác nhau giữa các môi trường.
 *
 * Nhưng "chặn ở tầng SMTP" chỉ đúng khi SMTP thật sự là hộp thư giả. Hai chốt
 * dưới đây kiểm đúng điều đó, và kiểm lúc KHỞI ĐỘNG chứ không lúc gửi: một
 * service không chạy thì ai cũng thấy ngay, còn một service chạy êm mà gửi thư
 * nhầm địa chỉ thì tới lúc có người phàn nàn mới biết (NTF-16).
 */

/** Máy chủ thư giả — chỉ những tên này mới được coi là an toàn tuyệt đối. */
const FAKE_MAIL_HOSTS = /^(mailpit|mailhog|localhost|127\.0\.0\.1|::1)$/i;

export const isFakeRelay = (host: string): boolean => FAKE_MAIL_HOSTS.test(host.trim());

/**
 * Bất kỳ thứ gì không nằm trong danh sách hộp thư giả đều bị coi là relay THẬT.
 *
 * Mặc định nghiêng về phía an toàn: tên máy chủ lạ thì giả định nó gửi được thư
 * ra ngoài. Ngược lại — mặc định coi là an toàn trừ khi nhận ra là thật — nghĩa
 * là mọi tên máy chủ chưa từng gặp đều lọt qua, và chốt an toàn nào cũng vô dụng.
 */
export const isExternalRelay = (host: string): boolean => !isFakeRelay(host);

export type MailEnv = Record<string, string | undefined> & {
  NODE_ENV?: string | undefined;
  MAIL_HOST?: string | undefined;
  MAIL_REDIRECT_ALL?: string | undefined;
};

export class UnsafeMailConfigError extends Error {}

/** Tách khỏi lớp cấu hình để test gọi thẳng với môi trường bịa ra (NTF-16). */
export function assertSafeMailConfig(env: MailEnv): void {
  const host = (env.MAIL_HOST ?? 'mailpit').trim();
  const prod = env.NODE_ENV === 'production';

  if (prod && isFakeRelay(host)) {
    throw new UnsafeMailConfigError(
      `Production trỏ vào hộp thư giả "${host}" — mọi thông báo sẽ rơi vào hư vô ` +
        'mà không ai báo lỗi. Đặt MAIL_HOST là máy chủ SMTP của công ty.',
    );
  }
  if (!prod && isExternalRelay(host) && !env.MAIL_REDIRECT_ALL) {
    throw new UnsafeMailConfigError(
      `Môi trường "${env.NODE_ENV ?? 'development'}" trỏ vào SMTP thật "${host}" mà ` +
        'chưa đặt MAIL_REDIRECT_ALL — thư test sẽ tới hộp thư người thật.',
    );
  }
}

const num = (v: string | undefined, d: number): number => (v ? Number(v) : d);

export function loadMailConfig(env: NodeJS.ProcessEnv = process.env) {
  assertSafeMailConfig(env);
  return {
    host: (env.MAIL_HOST ?? env.SMTP_HOST ?? 'mailpit').trim(),
    port: num(env.MAIL_PORT ?? env.SMTP_PORT, 1025),
    from: env.MAIL_FROM ?? 'csbh-noreply@nutricare.test',

    /** Staging: dồn hết về một hộp thư QA, người nhận gốc ghi ở X-Original-To (NTF-19). */
    redirectAll: env.MAIL_REDIRECT_ALL?.trim() || undefined,

    /** Production: ngoài tên miền này thì không gửi. */
    allowlist: (env.MAIL_ALLOWLIST ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),

    webBaseUrl: env.WEB_BASE_URL ?? 'http://localhost:8080',

    /**
     * Giãn cách giữa các lần thử lại. Ba lần rồi vào DLQ (NTF-05).
     * Test hạ xuống vài mili-giây — chờ 13 giây thật để chứng minh một phép lùi
     * theo cấp số nhân là đổi thời gian lấy thứ không chứng minh thêm được gì.
     */
    retryBackoffMs: (env.MAIL_RETRY_BACKOFF_MS ?? '1000,3000,9000')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n)),
  };
}

export type MailConfig = ReturnType<typeof loadMailConfig>;
