import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { LoggerTep } from '@csbh/http-kit';
import { CONFIG } from './infra/config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false, logger: new LoggerTep('identity') });

  // Nhận SIGTERM và đóng máy chủ HTTP trước, đóng pool CSDL sau. Không có nó
  // thì mỗi lần deploy là cắt ngang request đang chạy và transaction đang mở —
  // người dùng thấy lỗi ngẫu nhiên đúng lúc triển khai.
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  new Logger('identity').log(`identity ${CONFIG.appVersion} nghe ở cổng ${port}`);
}

void bootstrap();
