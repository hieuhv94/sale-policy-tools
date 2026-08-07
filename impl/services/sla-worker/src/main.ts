import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  // `createApplicationContext` chứ không phải `create`: không có HTTP server nào
  // để mở. Mở một cổng chỉ để healthcheck gọi vào là thêm một bề mặt tấn công
  // cho một tiến trình đáng lẽ không nhận request nào từ bên ngoài.
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });
  app.enableShutdownHooks();
  new Logger('sla-worker').log('sla-worker đang chạy — quét 5 phút một lần');
}

void bootstrap();
