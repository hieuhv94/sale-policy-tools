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
export { sheetHtml, money, pct, dmy } from './render/sheet.js';
export { TemplatesService } from './contracts/templates.service.js';
export { ContractsService } from './contracts/contracts.service.js';
export { KNOWN_SOURCES, LINE_PREFIX } from './contracts/sources.js';
export { makeDocx, para, table, tableRow, placeholdersOf, documentXml } from './contracts/docx.js';
export { SYSTEM_USER_ID } from './contracts/bootstrap.js';
export { DocumentOutbox } from './infra/outbox.relay.js';
