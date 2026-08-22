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

export { SyncService } from './reports/sync.service.js';
export { ReportsService } from './reports/reports.service.js';
export { ThongKeService, maSql } from './reports/thong-ke.service.js';
export { ExportsService, EXPORT_MAX_ROWS, tenTepXuat } from './exports/exports.service.js';
export { ReportingConsumer } from './reports/consumer.js';
export { COLUMNS } from './exports/sheet.js';
export {
  FILTER_KEYS,
  KHOA_NGOAI_MUC_92,
  KHOA_NHIEU_GIA_TRI,
  SO_GIA_TRI_TOI_DA,
  SO_TIEU_CHI,
  tach,
} from './reports/filter.js';
export { norm } from '@csbh/http-kit';
