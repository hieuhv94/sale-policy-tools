/**
 * CORS — danh sách trắng origin, không phải `*` (SEC-12).
 *
 * `Access-Control-Allow-Origin: *` KHÔNG dùng được ở đây kể cả nếu muốn: nó
 * không đi cùng `Allow-Credentials`, mà ứng dụng gửi token trong header nên
 * trình duyệt cần biết origin cụ thể.
 *
 * Điều dễ hiểu nhầm nhất về CORS: nó là ràng buộc của TRÌNH DUYỆT, không phải
 * của máy chủ. `curl` bỏ qua hoàn toàn. Nên đây không phải lớp phòng thủ chống
 * kẻ tấn công — nó chỉ ngăn một trang web lạ mượn phiên đăng nhập của người dùng
 * để gọi API thay họ. Phòng thủ thật vẫn là token và kiểm quyền ở từng service.
 */
import { Injectable, type NestMiddleware } from '@nestjs/common';

type Req = { method: string; headers: Record<string, string | string[] | undefined> };
type Res = {
  setHeader(n: string, v: string): void;
  statusCode: number;
  end(): void;
};

/**
 * Danh sách rỗng nghĩa là KHÔNG cho origin nào — mặc định đóng.
 *
 * Mặc định mở (cho hết khi chưa cấu hình) là kiểu mặc định sai kinh điển: nó
 * chạy tốt suốt quá trình phát triển rồi lên production vẫn mở, vì không có gì
 * hỏng để ai đó nhận ra.
 */
export const allowedOrigins = (): string[] =>
  (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

@Injectable()
export class CorsMiddleware implements NestMiddleware {
  use(req: Req, res: Res, next: () => void): void {
    const raw = req.headers['origin'];
    const origin = Array.isArray(raw) ? raw[0] : raw;

    if (origin && allowedOrigins().includes(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-credentials', 'true');
      // Phản hồi đổi theo origin, nên cache trung gian phải biết điều đó —
      // thiếu `Vary` thì một bản lưu đệm của origin này được trả cho origin kia.
      res.setHeader('vary', 'Origin');
      res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader(
        'access-control-allow-headers',
        'authorization,content-type,x-trace-id,x-service-token',
      );
      res.setHeader('access-control-max-age', '600');
    }

    // Preflight kết thúc ở đây, KHÔNG chuyển tiếp xuống service.
    //
    // Origin lạ vẫn nhận 204 chứ không phải 403: thiếu header cho phép đã đủ để
    // trình duyệt chặn, còn trả lỗi thì lộ ra rằng đường dẫn đó có tồn tại.
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    next();
  }
}
