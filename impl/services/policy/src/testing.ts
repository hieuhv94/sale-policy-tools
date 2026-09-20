import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module.js';

export async function createTestApp(): Promise<INestApplication> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  await app.init();
  return app;
}

export { PolicyOutbox } from './infra/outbox.relay.js';
export { CatalogImpactConsumer } from './consumers/catalog-impact.consumer.js';
export { Clients } from './infra/clients.js';
export { RECIPIENTS, TRUONG_CHAN_LUC_GUI } from './policies/workflow.service.js';
// `0194` — phép so "dòng này lệch ở đâu", dùng chung giữa consumer và đường đọc.
export { soSanhLech, NHAN_TRANG_THAI_SP, type MucLech, type DongDaChup } from './policies/lech.js';
export { ngayTraDanhMuc } from './policies/ngay-tra-danh-muc.js';
/*
 * HAI DANH SÁCH TRƯỜNG của dòng sản phẩm (`0214`) — xuất ra để bộ kiểm ghim
 * được tập khoá của từng cái. Xem `policies.service.ts` về vì sao chúng khác
 * nhau, và `tests/http/policy.test.ts` về vì sao chỗ này cần một chốt chặn.
 */
export { TRUONG_SO_VOI_BAN_TRUOC, TRUONG_BAY_BAN_TRUOC } from './policies/policies.service.js';
export { chuanHoaMa, CAU_LOI_MA, DAI_TOI_DA_MA } from './policies/ma-ho-so.js';
