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

export { LogService, canNen, canDon, TEP_NEN, THANH_PHAN } from './logs/log.service.js';
export { VanHanhOutbox } from './infra/outbox.js';
export { SaoLuuService, mocThanhIso } from './sao-luu/sao-luu.service.js';
export { ODiaService, duBaoNgayDay } from './o-dia/o-dia.service.js';
export { TacTuService, MAT_LIEN_LAC_GIAY } from './tac-tu/tac-tu.service.js';
export { VIEC, GIU_TOI_DA, CHI_HANG_NGAY } from './lich/lich.controller.js';
