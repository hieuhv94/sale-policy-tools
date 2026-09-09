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

export { NotifyService } from './notify/notify.service.js';
export { NotifyConsumer } from './notify/consumer.js';
export { Mailer } from './infra/mailer.js';
export {
  assertSafeMailConfig,
  chuanHoaMienThu,
  loadMailConfig,
  thuocMienThu,
  tuyChonSmtp,
  UnsafeMailConfigError,
} from './infra/config.js';
export {
  bodyBanGiao,
  bodyFor,
  duongDan,
  DUONG_BAN_GIAO,
  loaiThayDoi,
  loaiThayDoiNgan,
  moTaNgan,
  NHAN_BAC,
  subjectBanGiao,
  subjectFor,
  TIN_CUA_HANH_DONG,
  titleBanGiao,
  titleFor,
  VIEC_CUA_BUOC,
  type Bac,
  type BanGiaoMail,
  type MailEvent,
} from './notify/templates.js';
