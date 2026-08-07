import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const port = Number(process.env.PORT ?? 3002);
  await app.listen(port, '0.0.0.0');
  new Logger('catalog').log(`catalog nghe ở cổng ${port}`);
}

void bootstrap();
