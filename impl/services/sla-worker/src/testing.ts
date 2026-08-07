import 'reflect-metadata';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module.js';

/**
 * `sla-worker` không có HTTP adapter nào, nên dựng ngữ cảnh module chứ không
 * dựng ứng dụng — đúng như `main.ts` dùng `createApplicationContext`.
 */
export async function createTestWorker(): Promise<TestingModule> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  await mod.init();
  return mod;
}

export { SlaService } from './sla.service.js';
export { Scheduler } from './scheduler.js';
export { Clock } from './clock.js';
