import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module.js';

export async function createTestApp(): Promise<INestApplication> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  // Cùng lý do như ở main.ts: không tắt bodyParser thì mọi POST đi qua gateway
  // mất sạch thân request, và test sẽ đỏ ở chỗ trông như lỗi phân quyền.
  const app = mod.createNestApplication({ bodyParser: false });
  await app.init();
  return app;
}

export { RateLimiter, RULES } from './proxy/rate-limit.js';
export { UPSTREAMS, resolveUpstream } from './proxy/routes.js';
export { allowedOrigins } from './infra/cors.js';
export { DeniedPublisher } from './proxy/denied.publisher.js';
export { Readiness } from './infra/readiness.js';
// `0261` — bảng "đường nào đếm vào xô nào", để ca kiểm hỏi thẳng mà không phải gõ 31 lượt gửi.
export { ruleFor } from './proxy/proxy.middleware.js';
