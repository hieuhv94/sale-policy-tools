import { Controller, Get, Module, Res, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '@csbh/http-kit';
import { CorsMiddleware } from './infra/cors.js';
import { ProxyMiddleware } from './proxy/proxy.middleware.js';
import { RateLimiter } from './proxy/rate-limit.js';
import { DeniedPublisher } from './proxy/denied.publisher.js';
import { Readiness } from './infra/readiness.js';

const VERSION = process.env.APP_VERSION ?? '0.0.0-dev';

/**
 * Gateway KHÔNG có `AuthGuard`.
 *
 * Nó không phục vụ endpoint nghiệp vụ nào — chỉ hai đường kiểm tra sức khoẻ và
 * một middleware chuyển tiếp. Gắn guard ở đây là kiểm quyền hai lần bằng hai
 * bản cấu hình phải giữ đồng bộ mãi mãi, mà bên nới lỏng thì không ai thấy.
 */
@Controller()
class HealthController {
  constructor(private readonly readiness: Readiness) {}

  @Public()
  @Get('healthz')
  health() {
    return { ok: true, service: 'gateway', version: VERSION };
  }

  /**
   * Trạng thái CẢ HỆ. Trả 503 khi có service nào không trả lời, để công cụ giám
   * sát chỉ cần theo dõi một URL và một mã trạng thái.
   */
  @Public()
  @Get('readyz')
  async ready(@Res() res: Response): Promise<void> {
    const r = await this.readiness.check();
    res.status(r.ok ? 200 : 503).json({ ...r, version: VERSION });
  }

  @Public()
  @Get('version')
  version() {
    return { version: VERSION, service: 'gateway' };
  }
}

@Module({
  controllers: [HealthController],
  providers: [RateLimiter, DeniedPublisher, Readiness],
})
export class AppModule implements NestModule {
  /**
   * THỨ TỰ Ở ĐÂY LÀ MỘT QUYẾT ĐỊNH.
   *
   * CORS chạy TRƯỚC: request preflight `OPTIONS` phải kết thúc ngay tại gateway,
   * không được tính vào hạn mức tần suất và không được chuyển tiếp xuống service
   * — trình duyệt gửi nó tự động, người dùng không hề bấm gì.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorsMiddleware, ProxyMiddleware).forRoutes('*');
  }
}
