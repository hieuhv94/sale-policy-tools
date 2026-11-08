/**
 * Cấu hình thư — và BA chốt an toàn chặn ngay lúc khởi động (`sửa 0105`).
 *
 * Ở `packages/` chứ không ở riêng `notification`, vì HAI service gửi thư:
 * `notification` gửi thông báo luồng duyệt, còn `identity` gửi thư mời kích hoạt
 * và liên kết đặt lại mật khẩu THẲNG qua SMTP, không đi qua hàng đợi (xem chú
 * thích ở `identity/src/infra/mailer.ts`).
 *
 * Trước khi gom về đây, hai bên đọc HAI TÊN BIẾN KHÁC NHAU: `notification` đọc
 * `MAIL_HOST`, `identity` chỉ đọc `SMTP_HOST`, còn `deploy/` chỉ đặt `MAIL_HOST`.
 * Bản demo chạy đúng hoàn toàn do trùng hợp — giá trị mặc định viết cứng của
 * identity tình cờ cũng là `mailpit:1025`. Trên máy chủ thật, đặt `MAIL_HOST`
 * là máy chủ SMTP của công ty thì notification dùng đúng còn identity vẫn gõ cửa
 * `mailpit`, và MỌI thư kích hoạt hỏng. Từ P13, thư kích hoạt là đường duy nhất
 * để tài khoản có mật khẩu — nên triệu chứng là không ai đăng nhập được vào hệ
 * thống vừa triển khai, và không có gì chỉ ra nguyên nhân.
 *
 * Email là chỗ dễ gây tai nạn nhất khi test: một biến môi trường sai là thư
 * chạy thẳng tới Trưởng bộ phận thật. Nguyên tắc đã chốt ở thiết kế §14: chặn ở
 * TẦNG SMTP chứ không ở tầng ứng dụng — ứng dụng cứ gửi thật như production,
 * thứ nhận thư mới là thứ khác nhau giữa các môi trường.
 *
 * Nhưng "chặn ở tầng SMTP" chỉ đúng khi SMTP thật sự là hộp thư giả. Ba chốt
 * dưới đây kiểm đúng điều đó, và kiểm lúc KHỞI ĐỘNG chứ không lúc gửi: một
 * service không chạy thì ai cũng thấy ngay, còn một service chạy êm mà gửi thư
 * nhầm địa chỉ thì tới lúc có người phàn nàn mới biết (NTF-16).
 *
 * Chốt thứ ba đến ở `0105`: production phải KHAI TÊN MIỀN nhận thư. Hai chốt
 * đầu canh "thư đi tới máy chủ nào", chốt này canh "thư tới hộp thư của ai".
 */
import { readFileSync } from 'node:fs';

export class UnsafeMailConfigError extends Error {}

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

/**
 * TÊN MIỀN THƯ ĐƯỢC PHÉP NHẬN — khai lúc chạy, nhiều miền (`0105`).
 *
 * Người vận hành gõ danh sách vào `MAIL_ALLOWLIST`, ngăn nhau bằng dấu phẩy.
 * Hàm này chịu mọi cách gõ mà người ta thật sự gõ: `@nutricare.vn`, khoảng
 * trắng thừa, chữ hoa, dấu chấm phẩy, xuống dòng, và trùng lặp.
 *
 * Dấu `@` và dấu `.` đứng đầu bị CẮT chứ không bị từ chối: `@nutricare.vn` và
 * `.nutricare.vn` là hai cách viết mà người vận hành hay dùng để nói "miền này",
 * và từ chối chúng là bắt họ đoán đúng một quy ước không ai nói ra.
 *
 * Mục nào không ra hình một tên miền thì NÉM, không im lặng bỏ qua. Một mục sai
 * chính tả bị bỏ qua lặng lẽ nghĩa là cả một phòng ban thôi nhận được thư, và
 * triệu chứng xuất hiện nhiều ngày sau đó ở một chỗ không liên quan.
 */
const HINH_MIEN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function chuanHoaMienThu(raw: string | undefined): string[] {
  const ra: string[] = [];
  for (const tho of (raw ?? '').split(/[,;\s]+/)) {
    const m = tho.trim().toLowerCase().replace(/^@/, '').replace(/^\./, '');
    if (m === '') continue;
    if (!HINH_MIEN.test(m)) {
      throw new UnsafeMailConfigError(
        `MAIL_ALLOWLIST có mục không phải tên miền: "${tho.trim()}". ` +
          'Viết dạng "nutricare.vn", nhiều miền thì ngăn bằng dấu phẩy.',
      );
    }
    if (!ra.includes(m)) ra.push(m);
  }
  return ra;
}

/**
 * Địa chỉ này có thuộc một trong các miền được phép không.
 *
 * So trên PHẦN SAU dấu `@`, không so trên cả chuỗi. Bản trước dùng
 * `address.endsWith(mien)` và nó khớp cả `ke-toan@gia-nutricare.vn` khi danh
 * sách là `nutricare.vn` — một tên miền do người khác đăng ký, chỉ cần kết thúc
 * đúng chữ ấy. Chốt chặn đọc như thể đang chặn, mà không chặn.
 *
 * Miền con thì QUA: `nutricare.vn` chấp nhận `hn.nutricare.vn`. Công ty có nhiều
 * chi nhánh thì đó là điều người vận hành mong đợi, và bắt họ liệt kê từng miền
 * con là một danh sách sẽ lạc hậu ngay lần mở chi nhánh sau.
 */
export function thuocMienThu(address: string, mien: readonly string[]): boolean {
  if (mien.length === 0) return true;
  const at = address.lastIndexOf('@');
  if (at < 0) return false;
  const cua = address.slice(at + 1).trim().toLowerCase().replace(/\.$/, '');
  return mien.some((m) => cua === m || cua.endsWith(`.${m}`));
}

export type MailEnv = Record<string, string | undefined> & {
  NODE_ENV?: string | undefined;
  MAIL_HOST?: string | undefined;
  MAIL_REDIRECT_ALL?: string | undefined;
};

/** Tách khỏi lớp cấu hình để test gọi thẳng với môi trường bịa ra (NTF-16). */
export function assertSafeMailConfig(env: MailEnv): void {
  const host = (env.MAIL_HOST ?? 'mailpit').trim();
  const prod = env.NODE_ENV === 'production';

  /*
   * CHỒNG KIỂM NGHIỆM (`0270`) — ngoại lệ DUY NHẤT của chốt dưới, và nó chặn cả HAI chiều.
   *
   * Mỗi lượt cài/cập nhật dựng một chồng production thứ hai (`compose.kiem.yml`) từ CÙNG
   * ảnh để chạy bộ kiểm nghiệm với dữ liệu giả; thư của người dùng giả phải vào Mailpit
   * để bộ kiểm đọc được liên kết kích hoạt. Cờ chỉ khai ở `compose.kiem.yml` (có ca quét).
   * Và vế ngược lại là vế quan trọng hơn: cờ bật mà trỏ vào SMTP THẬT thì DỪNG — một
   * lượt kiểm nghiệm không bao giờ được gửi thư tới hộp thư người thật.
   */
  if (env.CSBH_KIEM_NGHIEM === '1') {
    if (isExternalRelay(host)) {
      throw new UnsafeMailConfigError(
        `Chồng kiểm nghiệm trỏ vào SMTP thật "${host}" — dữ liệu giả sẽ gửi thư tới người thật. ` +
          'CSBH_KIEM_NGHIEM=1 chỉ đi cùng MAIL_HOST=mailpit.',
      );
    }
    return;
  }

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

  /*
   * CHỐT THỨ BA (`0105`): production BẮT BUỘC khai tên miền nhận thư.
   *
   * Trước đó `MAIL_ALLOWLIST` rỗng nghĩa là "gửi cho tất cả", và giá trị mặc
   * định của một biến không ai đặt chính là rỗng. Nên chốt chặn mà nó dựng lên
   * chỉ tồn tại ở nơi có người nhớ bật — tức là không tồn tại ở nơi cần nhất.
   *
   * Cùng lối với hai chốt trên: chặn lúc KHỞI ĐỘNG. Một địa chỉ cá nhân gõ nhầm
   * vào hồ sơ tài khoản sẽ nhận toàn bộ thông báo nghiệp vụ — công nợ, giá thu
   * về, tên khách hàng — và không có gì trên màn hình nói ra điều đó.
   *
   * Nhiều miền thì ngăn bằng dấu phẩy; miền con tự động được chấp nhận.
   */
  const mien = chuanHoaMienThu(env.MAIL_ALLOWLIST);
  if (prod && mien.length === 0) {
    throw new UnsafeMailConfigError(
      'Production chưa khai MAIL_ALLOWLIST — mọi địa chỉ đều nhận được thư nghiệp vụ, ' +
        'kể cả một địa chỉ cá nhân gõ nhầm. Khai tên miền của công ty, ' +
        'nhiều miền thì ngăn bằng dấu phẩy: MAIL_ALLOWLIST=nutricare.vn,nutricare.com.vn',
    );
  }
}

const num = (v: string | undefined, d: number): number => (v ? Number(v) : d);

/** `false`, `0`, `no`, `off` là TẮT; mọi giá trị khác có mặt là BẬT. */
const co = (v: string | undefined, mac: boolean): boolean =>
  v === undefined || v.trim() === '' ? mac : !/^(false|0|no|off)$/i.test(v.trim());

/**
 * Mật khẩu SMTP: `MAIL_PASSWORD_FILE` thắng `MAIL_PASSWORD`, cả hai đều bỏ được.
 *
 * KHÔNG dùng `readSecret`: hàm ấy NÉM khi production thiếu bí mật, mà một relay
 * nội bộ không đòi xác thực là cấu hình hợp lệ. Thiếu ở đây nghĩa là "không xác
 * thực", không phải "quên cấu hình".
 */
function matKhauThu(env: NodeJS.ProcessEnv): string | undefined {
  const f = env.MAIL_PASSWORD_FILE?.trim();
  if (f) return readFileSync(f, 'utf8').trim();
  return env.MAIL_PASSWORD?.trim() || undefined;
}

export function loadMailConfig(env: NodeJS.ProcessEnv = process.env) {
  assertSafeMailConfig(env);
  return {
    host: (env.MAIL_HOST ?? env.SMTP_HOST ?? 'mailpit').trim(),
    port: num(env.MAIL_PORT ?? env.SMTP_PORT, 1025),
    from: env.MAIL_FROM ?? 'csbh-noreply@nutricare.test',

    /** Staging: dồn hết về một hộp thư QA, người nhận gốc ghi ở X-Original-To (NTF-19). */
    redirectAll: env.MAIL_REDIRECT_ALL?.trim() || undefined,

    /**
     * Tên miền được phép nhận thư — khai lúc chạy, nhiều miền (`0105`).
     * Rỗng nghĩa là không lọc, và ở production thì `assertSafeMailConfig` không
     * cho phép rỗng.
     */
    allowlist: chuanHoaMienThu(env.MAIL_ALLOWLIST),

    /*
     * XÁC THỰC VÀ TLS (`0105`).
     *
     * Tới `0104` cả hai service dựng transport với `secure: false` và
     * `ignoreTLS: true` viết cứng, không có `auth` — chạy được với Mailpit và
     * với một relay nội bộ mở, còn SMTP có xác thực thì MỌI thư hỏng. Từ P13
     * thư kích hoạt là đường duy nhất để một tài khoản có mật khẩu, nên triệu
     * chứng là không ai đăng nhập được vào hệ vừa triển khai.
     *
     * `secure` — TLS ngay từ đầu kết nối, cổng 465.
     * `requireTls` — nâng cấp STARTTLS sau khi chào, cổng 587. MẶC ĐỊNH BẬT khi
     *   máy chủ là relay thật và không dùng cổng 465: gửi mật khẩu SMTP qua một
     *   kết nối chưa mã hoá là chuyện không nên xảy ra vì ai đó quên một biến.
     *   Relay nội bộ không hỗ trợ TLS thì tắt tường minh bằng `MAIL_STARTTLS=false`.
     */
    user: env.MAIL_USER?.trim() || undefined,
    pass: matKhauThu(env),
    secure: co(env.MAIL_SECURE, false),
    requireTls: co(
      env.MAIL_STARTTLS,
      isExternalRelay((env.MAIL_HOST ?? 'mailpit').trim()) && !co(env.MAIL_SECURE, false),
    ),

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

/**
 * Tuỳ chọn transport dựng TỪ cấu hình, ở MỘT chỗ cho cả hai service (`0105`).
 *
 * Tới `0104` mỗi service tự viết cứng `{ secure: false, ignoreTLS: true }` và
 * không service nào có `auth`. Chạy được với Mailpit và với một relay nội bộ mở;
 * SMTP đòi xác thực hay đòi STARTTLS thì MỌI thư hỏng — mà từ P13 thư kích hoạt
 * là đường duy nhất để một tài khoản có mật khẩu, nên triệu chứng là không ai
 * đăng nhập được vào hệ vừa triển khai, và log chỉ nói "connection refused".
 *
 * `ignoreTLS` giờ chỉ còn đúng với HỘP THƯ GIẢ — Mailpit không nói TLS, và ép nó
 * là hỏng bản demo.
 */
export function tuyChonSmtp(cfg: MailConfig) {
  const gia = isFakeRelay(cfg.host);
  return {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    ...(cfg.requireTls ? { requireTLS: true } : {}),
    ...(gia && !cfg.secure && !cfg.requireTls ? { ignoreTLS: true } : {}),
    ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.pass ?? '' } } : {}),
  };
}
