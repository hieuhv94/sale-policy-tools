import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { LoggerTep } from '@csbh/http-kit';

async function bootstrap(): Promise<void> {
  // `bodyParser: false` là BẮT BUỘC, không phải tối ưu. Trình phân tích thân
  // request của Nest đọc hết luồng dữ liệu rồi mới tới middleware chuyển tiếp;
  // lúc đó luồng đã cạn và mọi request POST được chuyển đi với thân RỖNG.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, logger: new LoggerTep('gateway'), bodyParser: false });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  new Logger('gateway').log(`gateway nghe ở cổng ${port}`);
}

void bootstrap();
