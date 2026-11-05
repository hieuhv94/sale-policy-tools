import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { LoggerTep } from '@csbh/http-kit';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false, logger: new LoggerTep('document') });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3005);
  await app.listen(port, '0.0.0.0');
  new Logger('document').log(`document nghe ở cổng ${port}`);
}

void bootstrap();
