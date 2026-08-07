/** Token dịch vụ cho lời gọi giữa các service — audience nội bộ, hạn ngắn. */
import { signJwt } from '@csbh/identity-core';
import { getKeyPair } from './keys.js';
import { JWT } from './jwt-config.js';

export const mintServiceToken = (caller: string): string =>
  signJwt({ sub: `svc:${caller}` }, getKeyPair().privateKey, {
    issuer: JWT.issuer,
    audience: JWT.audInternal,
    expiresInSec: JWT.serviceTokenTtlSec,
  });
