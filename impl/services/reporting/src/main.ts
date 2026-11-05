import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { LoggerTep } from '@csbh/http-kit';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false, logger: new LoggerTep('reporting') });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3008);
  await app.listen(port, '0.0.0.0');
  new Logger('reporting').log(`reporting nghe ở cổng ${port}`);
}

void bootstrap();
