import { Module } from '@nestjs/common';
import { Db, Clients } from '@csbh/policy/infra';
import { SlaService } from './sla.service.js';
import { Scheduler } from './scheduler.js';
import { Clock } from './clock.js';

/**
 * Tiến trình NỀN: không có controller, không mở cổng HTTP nào.
 *
 * Nó cần scale và restart độc lập với API — một vòng quét nặng không được làm
 * chậm màn hình người dùng đang bấm duyệt (§04 phân rã service).
 */
@Module({
  providers: [Db, Clients, Clock, SlaService, Scheduler],
})
export class AppModule {}
