import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3006);
  await app.listen(port, '0.0.0.0');
  new Logger('notification').log(`notification nghe ở cổng ${port}`);
}

void bootstrap();
