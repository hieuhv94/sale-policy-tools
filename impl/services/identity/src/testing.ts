/**
 * Tiện ích dựng app cho test HTTP. Nằm trong service chứ không nằm trong thư mục
 * test để mọi bộ test đều dựng app theo đúng một cách.
 */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { signJwt } from '@csbh/identity-core';
import { AppModule } from './app.module.js';
import { getKeyPair } from './infra/keys.js';
import { CONFIG } from './infra/config.js';

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
