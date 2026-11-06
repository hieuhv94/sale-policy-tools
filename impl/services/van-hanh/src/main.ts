import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { LoggerTep } from '@csbh/http-kit';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false, logger: new LoggerTep('van-hanh') });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3011);
  await app.listen(port, '0.0.0.0');
  new Logger('van-hanh').log(`van-hanh nghe ở cổng ${port}`);
}

void bootstrap();
