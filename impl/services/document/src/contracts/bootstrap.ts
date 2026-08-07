/**
 * Seed mẫu hợp đồng mặc định lúc khởi động, nếu chưa có mẫu nào.
 *
 * Không có bước này thì hệ thống vừa triển khai xong sẽ trả 409 ở lần xuất hợp
 * đồng đầu tiên — một lỗi mà kế toán không có cách nào đoán ra phải làm gì
 * (DOC-35). Chạy được nhiều lần: có mẫu rồi thì không làm gì.
 *
 * Hỏng thì GHI LOG chứ không chặn khởi động: mẫu mặc định là tiện ích, không
 * phải điều kiện để service phục vụ mọi việc còn lại.
 */
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { TemplatesService } from './templates.service.js';

/** Người tạo của những thứ do chính hệ thống sinh ra, không phải người thật. */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class TemplateBootstrap implements OnModuleInit {
  private readonly log = new Logger(TemplateBootstrap.name);

  constructor(private readonly templates: TemplatesService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.templates.ensureDefault(SYSTEM_USER_ID);
    } catch (e) {
      this.log.error(`không seed được mẫu hợp đồng mặc định: ${String(e)}`);
    }
  }
}
