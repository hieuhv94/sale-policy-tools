/**
 * Lớp gọi API. Mọi request của giao diện đi qua đây.
 *
 * Ba việc mà từng màn hình không nên phải tự lo, và nếu để tự lo thì sẽ có màn
 * hình làm sai:
 *
 *   1. **Token hết hạn** → làm mới một lần rồi thử lại (`FE-33`).
 *   2. **Mất mạng** → phân biệt với lỗi nghiệp vụ, vì hai thứ đó dẫn tới hai câu
 *      trả lời khác nhau cho người dùng (`FE-32`).
 *   3. **Bản mới đã triển khai** → đọc `X-App-Version` trên mọi phản hồi.
 */

/**
 * Gốc của mọi đường API. Cố định `/api` vì Caddy luôn gắn gateway ở đó
 * (`handle_path /api/*`), và máy chủ phát triển của Vite chuyển tiếp cùng
 * đường đó.
 *
 * KHÔNG đọc từ `import.meta.env`: các test chạy dưới dự án TypeScript của máy
 * chủ, nơi không có kiểu `vite/client`, nên một tham chiếu như vậy làm hỏng
 * `typecheck` ở một chỗ chẳng liên quan gì tới giao diện.
 */
export const GOC_API = '/api';

export class LoiApi extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown> = {},
    readonly traceId: string | null = null,
  ) {
    super(message);
    this.name = 'LoiApi';
  }

  /**
   * Lỗi MẠNG, không phải lỗi nghiệp vụ.
   *
   * Phân biệt quan trọng vì cách xử lý ngược nhau: lỗi nghiệp vụ thì sửa dữ liệu
   * rồi gửi lại, còn lỗi mạng thì **dữ liệu đang nhập vẫn đúng** và chỉ cần bấm
   * thử lại. Gộp chung thành "có lỗi xảy ra" là bắt người dùng nhập lại một hồ
   * sơ 20 dòng vì rớt sóng (`FE-32`).
   */
  get laLoiMang(): boolean {
    return this.status === 0 || this.status === 502 || this.status === 503;
  }
}

type Phien = { accessToken: string; refreshToken: string };

let phien: Phien | null = null;
let khiHetPhien: (() => void) | null = null;
let phienBanMoi: ((v: string) => void) | null = null;

export const datPhien = (p: Phien | null): void => {
  phien = p;
};
export const layPhien = (): Phien | null => phien;
export const dangKyHetPhien = (fn: () => void): void => {
  khiHetPhien = fn;
};
export const dangKyPhienBan = (fn: (v: string) => void): void => {
  phienBanMoi = fn;
};

type TuyChon = {
  method?: string;
  body?: unknown;
  /** Không gắn token — chỉ dùng cho đăng nhập và làm mới. */
  congKhai?: boolean;
  signal?: AbortSignal;
};

/** Một lần làm mới token dùng chung cho mọi request đang chờ. */
let dangLamMoi: Promise<boolean> | null = null;

async function lamMoiToken(): Promise<boolean> {
  if (!phien?.refreshToken) return false;
  // Gộp: năm request cùng nhận 401 thì chỉ gọi làm mới MỘT lần. Không gộp thì
  // năm lời gọi xoay vòng token song song, bốn cái sau dùng token đã bị thu hồi
  // và cả phiên bị đá ra — lỗi chỉ xuất hiện khi màn hình tải nhiều thứ cùng lúc.
  if (!dangLamMoi) {
    dangLamMoi = (async () => {
      try {
        const res = await fetch(`${GOC_API}/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: phien!.refreshToken }),
        });
        if (!res.ok) return false;
        phien = (await res.json()) as Phien;
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      // Xoá NGAY khi lời hứa kết thúc. Mọi bên đang chờ đã cầm sẵn tham chiếu
      // nên vẫn đọc được kết quả; đặt lại bằng `setTimeout` thì lượt làm mới
      // sau có thể dùng nhầm kết quả của lượt trước.
      dangLamMoi = null;
    });
  }
  return dangLamMoi;
}

export async function goi<T>(duong: string, t: TuyChon = {}): Promise<T> {
  const chay = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (t.body !== undefined) headers['content-type'] = 'application/json';
    if (!t.congKhai && phien) headers['authorization'] = `Bearer ${phien.accessToken}`;
    try {
      return await fetch(`${GOC_API}${duong}`, {
        method: t.method ?? 'GET',
        headers,
        ...(t.body !== undefined ? { body: JSON.stringify(t.body) } : {}),
        ...(t.signal ? { signal: t.signal } : {}),
      });
    } catch (e) {
      // `fetch` chỉ ném khi KHÔNG tới được máy chủ. Mọi mã lỗi HTTP đều là
      // "tới được" và đi tiếp bên dưới.
      throw new LoiApi(0, 'MAT_KET_NOI', 'Không kết nối được máy chủ.', {
        goc: String(e),
      });
    }
  };

  let res = await chay();

  if (res.status === 401 && !t.congKhai && (await lamMoiToken())) {
    res = await chay();
  }

  const v = res.headers.get('x-app-version');
  if (v) phienBanMoi?.(v);
  const traceId = res.headers.get('x-trace-id');

  if (res.status === 401 && !t.congKhai) {
    // Làm mới cũng hỏng → phiên chấm dứt. Màn hình hiện đăng nhập lại và GIỮ
    // NGUYÊN biểu mẫu đang dở (`FE-33`); việc giữ do `auth.tsx` lo.
    khiHetPhien?.();
    throw new LoiApi(401, 'PHIEN_HET_HAN', 'Phiên đăng nhập đã hết hạn.', {}, traceId);
  }

  if (res.status === 204) return undefined as T;

  const kieu = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    let body: Record<string, unknown> = {};
    if (kieu.includes('json')) body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const code = typeof body['code'] === 'string' ? body['code'] : `HTTP_${res.status}`;
    const message =
      typeof body['message'] === 'string' ? body['message'] : moTaLoi(res.status, code);
    throw new LoiApi(res.status, code, message, body, traceId);
  }

  if (!kieu.includes('json')) return (await res.text()) as T;
  return (await res.json()) as T;
}

/**
 * Thông điệp mặc định khi máy chủ không kèm `message`.
 *
 * Viết theo VIỆC NGƯỜI DÙNG PHẢI LÀM TIẾP, không theo mã HTTP. "403 Forbidden"
 * đúng về kỹ thuật và vô dụng với kế toán đang cần biết mình bấm nhầm chỗ nào.
 */
function moTaLoi(status: number, code: string): string {
  if (code === 'RATE_LIMITED') return 'Bạn thao tác quá nhanh. Chờ một lát rồi thử lại.';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (status === 404) return 'Không tìm thấy dữ liệu. Có thể nó vừa bị xoá hoặc đổi.';
  if (status === 409) return 'Dữ liệu vừa được người khác thay đổi. Hãy tải lại rồi thử lại.';
  if (status === 413) return 'Tệp quá lớn.';
  if (status >= 500) return 'Máy chủ đang gặp sự cố. Dữ liệu bạn nhập vẫn được giữ nguyên.';
  return 'Yêu cầu không hợp lệ.';
}

export const layJson = <T,>(duong: string, signal?: AbortSignal): Promise<T> =>
  goi<T>(duong, signal ? { signal } : {});

export const dang = <T,>(duong: string, body?: unknown): Promise<T> =>
  goi<T>(duong, { method: 'POST', ...(body !== undefined ? { body } : {}) });

export const va = <T,>(duong: string, body: unknown): Promise<T> =>
  goi<T>(duong, { method: 'PATCH', body });

export const dat = <T,>(duong: string, body: unknown): Promise<T> =>
  goi<T>(duong, { method: 'PUT', body });

export const xoa = <T,>(duong: string): Promise<T> => goi<T>(duong, { method: 'DELETE' });
