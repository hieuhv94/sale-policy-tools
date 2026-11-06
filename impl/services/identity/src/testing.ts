/**
 * Tiện ích dựng app cho test HTTP. Nằm trong service chứ không nằm trong thư mục
 * test để mọi bộ test đều dựng app theo đúng một cách.
 */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { signJwt } from '@csbh/identity-core';
import { AppModule } from './app.module.js';
import { getKeyPair } from '@csbh/http-kit';
import { CONFIG } from './infra/config.js';

/**
 * Xuất ra để test thay tạm hàm gửi thư — kiểm nhánh "SMTP hỏng" mà không phải
 * dựng một máy chủ SMTP hỏng thật.
 */
export { Mailer } from './infra/mailer.js';
export { KHONG_NHAN_THONG_BAO } from './internal/internal.controller.js';
/** Bơm `idn.outbox` bằng tay trong test — cùng nếp với bốn service kia (`0091`). */
export { IdentityOutbox } from './infra/outbox.relay.js';

/** Đăng nhập Google (`0241`): bộ kiểm thay cấu hình và phần gọi ra Google. */
export { GoogleClient } from './auth/google.client.js';
export { CAU_HINH_GOOGLE, docCauHinhGoogle, type CauHinhGoogle } from './auth/google.config.js';
export { kiemClaim, duongNoiBo, maCuaSo } from './auth/google.service.js';

/**
 * Dựng app với vài provider bị thay — đường DUY NHẤT để một tệp kiểm bật đăng
 * nhập Google mà không đụng tới tệp khác.
 */
export async function createTestAppWith(
  thay: { provide: unknown; useValue: unknown }[],
): Promise<INestApplication> {
  let b = Test.createTestingModule({ imports: [AppModule] });
  for (const t of thay) b = b.overrideProvider(t.provide).useValue(t.useValue);
  const app = (await b.compile()).createNestApplication();
  await app.init();
  return app;
}

export async function createTestApp(): Promise<INestApplication> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  await app.init();
  return app;
}

/** Token dịch vụ hợp lệ để gọi /internal — audience nội bộ, không phải audience người dùng. */
export const serviceToken = (): string =>
  signJwt({ sub: 'svc:policy' }, getKeyPair().privateKey, {
    issuer: CONFIG.issuer,
    audience: CONFIG.audInternal,
    expiresInSec: 300,
  });

/** Access token đã hết hạn, để kiểm nhánh TOKEN_EXPIRED mà không phải chờ 15 phút. */
export const expiredAccessToken = (userId: string): string =>
  signJwt({ sub: userId, role: 'TDV', pat: 0 }, getKeyPair().privateKey, {
    issuer: CONFIG.issuer,
    audience: CONFIG.audUser,
    expiresInSec: 1,
    now: Date.now() - 60_000,
  });
