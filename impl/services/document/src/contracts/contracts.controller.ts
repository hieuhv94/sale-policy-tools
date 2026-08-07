/**
 * API mẫu hợp đồng (Sale Admin) và xuất hợp đồng (Kế toán · Sale Admin).
 *
 * CHÚ Ý VỚI NGƯỜI SỬA VỀ SAU: ở đây KHÔNG có và không được thêm
 * `GET /contracts/:id`. Hợp đồng không phải một tài nguyên có định danh — nó là
 * kết quả của một phép biến đổi trên hồ sơ CSBH (muc 8.3). Test `DOC-28` quét
 * bảng định tuyến và sẽ đỏ nếu một route như vậy xuất hiện.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser, Roles, str, validate, type AuthUser } from '@csbh/http-kit';
import { MAX_BYTES } from '../files/files.service.js';
import { TemplatesService, type MappingInput } from './templates.service.js';
import { ContractsService } from './contracts.service.js';
import { KNOWN_SOURCES } from './sources.js';

@Controller('contract-templates')
export class ContractTemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  // Quản trị hệ thống KHÔNG có quyền ở đây: mẫu hợp đồng là văn bản nghiệp vụ
  // của Sale Admin, khác với mẫu bản CSBH và biểu mẫu scan (DOC-26).
  @Roles('SALE_ADMIN')
  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES + 1 } }))
  async upload(
    @CurrentUser() me: AuthUser,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body() body: { name?: string },
  ) {
    if (!file) throw new BadRequestException({ code: 'FILE_MISSING', message: 'Thiếu phần file' });
    const b = validate({ name: body?.name ?? 'Mẫu hợp đồng' }, { name: str(1, 200) });
    return this.templates.upload(b.name, file.buffer, me);
  }

  @Roles('SALE_ADMIN')
  @Get()
  list() {
    return this.templates.list();
  }

  @Roles('SALE_ADMIN')
  @Get('sources')
  sources() {
    return { knownSources: KNOWN_SOURCES };
  }

  @Roles('SALE_ADMIN')
  @Get(':id/placeholders')
  async placeholders(@Param('id') id: string) {
    const declared = await this.templates.placeholders(id);
    const mapped = await this.templates.fields(id);
    const mappedSet = new Set(mapped.map((m) => m.placeholder));
    return {
      placeholders: declared,
      mapped,
      unmapped: declared.filter((p) => !mappedSet.has(p)),
      knownSources: KNOWN_SOURCES,
    };
  }

  @Roles('SALE_ADMIN')
  @Put(':id/mapping')
  mapping(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const list = (body as { mapping?: unknown })?.mapping;
    if (!Array.isArray(list)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        field: 'mapping',
        message: 'mapping phải là một mảng',
      });
    }
    const mapping: MappingInput[] = list.map((raw) => {
      const m = validate(raw, { placeholder: str(1, 200), source: str(1, 200) }) as MappingInput;
      const extra = raw as { required?: unknown; format?: unknown };
      return {
        ...m,
        required: extra.required === true,
        ...(typeof extra.format === 'string' ? { format: extra.format } : {}),
      };
    });
    return this.templates.setMapping(id, mapping, me);
  }

  @Roles('SALE_ADMIN')
  @Post(':id/publish')
  @HttpCode(200)
  publish(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.templates.publish(id, me);
  }

  @Roles('SALE_ADMIN')
  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.templates.deactivate(id, me);
  }
}

@Controller('policies')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  /** Xem trước: trả về dữ liệu đã trộn, KHÔNG sinh file và không ghi gì (DOC-14). */
  @Roles('KE_TOAN', 'SALE_ADMIN')
  @Get(':id/contract/preview')
  preview(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.contracts.preview(id, me);
  }

  @Roles('KE_TOAN', 'SALE_ADMIN')
  @Get(':id/contract.pdf')
  async pdf(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { pdf, fileName } = await this.contracts.export(id, me);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.end(pdf);
  }
}
