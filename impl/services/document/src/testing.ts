import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module.js';

export async function createTestApp(): Promise<INestApplication> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  await app.init();
  return app;
}

export { Storage, sha256, BUCKET } from './infra/storage.js';
export { FilesService, sniff, MAX_BYTES } from './files/files.service.js';
export { mintFileToken, FILE_LINK_TTL_SEC } from './files/file-link.js';
export { money, pct, dmy } from './contracts/dinh-dang.js';
/*
 * `COMPANY` mở ra cho bộ kiểm (`0151`).
 *
 * Fixture của bộ kiểm dựng `.docx` riêng và gõ tên Công ty vào đầu trang — sáu
 * chỗ, và lượt đổi pháp nhân 29/08 phải sửa từng chỗ. Đọc từ hằng thì lượt sau
 * không phải sửa ca kiểm nào, và quan trọng hơn: ca nào khẳng định *"bản in ra
 * có tên Công ty"* thì khẳng định đúng cái tên phần mềm thật sẽ in.
 */
export { COMPANY, COMPANY_ADDRESS_LINE } from './contracts/dinh-dang.js';
export { TemplatesService } from './contracts/templates.service.js';
export { ContractsService } from './contracts/contracts.service.js';
export {
  KNOWN_SOURCES,
  NGUON_BAT_BUOC_HO_SO,
  NHOM_TRUONG,
  dinhDangCua,
  type NhomTruong,
} from './contracts/sources.js';
export { makeDocx, mergeDocx, para, table, tableRow, placeholdersOf, documentXml, khoGiayCua, O_BANG_SAN_PHAM } from './contracts/docx.js';
export { SYSTEM_USER_ID } from './contracts/bootstrap.js';
export { DocumentOutbox } from './infra/outbox.relay.js';

/** `0055` — bảng sản phẩm dạng Word, để ca kiểm thử soi thẳng số ô mỗi hàng. */
export {
  bangSanPhamXml,
  COT_BANG,
  COT_BAT_BUOC,
  COT_MAC_DINH,
  COT_RUT_GON,
  RONG_TOI_THIEU_PCT,
  chuanHoaCot,
} from './contracts/bang-san-pham.js';

// `0165` — ba mẫu mặc định đi cùng hệ thống; ca kiểm đọc danh sách từ đây
// chứ không chép tên file sang.
export { MAU_MAC_DINH, MauMacDinhBootstrap } from './contracts/bootstrap-mau.js';
