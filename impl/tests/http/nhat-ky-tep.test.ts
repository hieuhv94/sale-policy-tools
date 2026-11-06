/**
 * `0249` — mỗi service ghi tệp log riêng vào thư mục chung, mỗi ngày một tệp.
 *
 * Bốn lớp: (1) hàm `LoggerTep` thuần trên thư mục tạm — tên tệp, ngày VN qua nửa
 * đêm, JSON mỗi dòng, ngữ cảnh request, không làm sập khi ghi hỏng; (2) một app
 * Nest THẬT ném lỗi 500 — dòng log mang đúng `traceId` của phản hồi và vết ngăn
 * xếp, thứ nối mã tra cứu với nguyên nhân; (3) quét `main.ts` của mười service;
 * (4) quét compose — biến môi trường VÀ chỗ gắn thư mục phải đi cùng nhau.
 */
import { Controller, Get, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LoggerTep,
  THU_MUC_DANG_GHI,
  TraceMiddleware,
  runWithContext,
  tenTepLog,
  type DongLog,
} from '@csbh/http-kit';

const IMPL = join(__dirname, '..', '..');
const thuMucTam = () => mkdtempSync(join(tmpdir(), 'csbh-log-'));
const docDong = (tep: string): DongLog[] =>
  readFileSync(tep, 'utf8').trim().split('\n').filter(Boolean).map((d) => JSON.parse(d) as DongLog);

/** Logger không in stdout — bộ kiểm chỉ đọc tệp. */
const taoLogger = (service: string, tuyChon: ConstructorParameters<typeof LoggerTep>[1]) => {
  const l = new LoggerTep(service, tuyChon);
  l.setLogLevels(['log', 'error', 'warn', 'fatal']);
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  return l;
};

afterEach(() => vi.restoreAllMocks());

describe('LoggerTep — tệp và dòng', () => {
  it('ghi một dòng JSON vào dang-ghi/<service>-<ngày VN>.log', () => {
    const goc = thuMucTam();
    const l = taoLogger('policy', { thuMuc: goc, bayGio: () => new Date('2026-11-05T02:00:00Z') });
    l.log('policy nghe ở cổng 3004', 'Bootstrap');
    const tep = join(goc, THU_MUC_DANG_GHI, 'policy-2026-11-05.log');
    expect(existsSync(tep)).toBe(true);
    const [d] = docDong(tep);
    expect(d).toMatchObject({ muc: 'log', service: 'policy', nguCanh: 'Bootstrap', msg: 'policy nghe ở cổng 3004' });
    expect(d!.t).toBe('2026-11-05T02:00:00.000Z');
  });

  it('ngày theo GIỜ VIỆT NAM: 16:59:59Z còn là hôm trước, 17:00:00Z đã là hôm sau', () => {
    const goc = thuMucTam();
    let gio = new Date('2026-11-04T16:59:59Z'); // 23:59:59 giờ VN ngày 04/11
    const l = taoLogger('catalog', { thuMuc: goc, bayGio: () => gio });
    l.log('truoc nua dem');
    gio = new Date('2026-11-04T17:00:00Z'); // 00:00:00 giờ VN ngày 05/11
    l.log('sau nua dem');
    const tep = (n: string) => join(goc, THU_MUC_DANG_GHI, tenTepLog('catalog', n));
    expect(docDong(tep('2026-11-04')).map((d) => d.msg)).toEqual(['truoc nua dem']);
    expect(docDong(tep('2026-11-05')).map((d) => d.msg)).toEqual(['sau nua dem']);
  });

  it('nhiều dòng nối tiếp đúng thứ tự, không ghi đè', () => {
    const goc = thuMucTam();
    const l = taoLogger('audit', { thuMuc: goc });
    for (let i = 0; i < 5; i++) l.warn(`dong ${i}`);
    expect(docDong(l.duongDanHomNay()!).map((d) => d.msg)).toEqual([0, 1, 2, 3, 4].map((i) => `dong ${i}`));
  });

  it('mang traceId và tên đăng nhập của request đang chạy', () => {
    const goc = thuMucTam();
    const l = taoLogger('policy', { thuMuc: goc });
    runWithContext({ traceId: 'abcd1234ef', actor: { id: 'u1', username: 'tdv01', role: 'TDV' } }, () => {
      l.warn('STALE_LINE');
    });
    l.log('ngoai request');
    const [trong, ngoai] = docDong(l.duongDanHomNay()!);
    expect(trong).toMatchObject({ traceId: 'abcd1234ef', nguoiDung: 'tdv01' });
    expect(ngoai!.traceId).toBeUndefined();
    expect(ngoai!.nguoiDung).toBeUndefined();
  });

  it('error(message, stack, context) ghi vết ngăn xếp riêng', () => {
    const goc = thuMucTam();
    const l = taoLogger('policy', { thuMuc: goc });
    const e = new Error('hong');
    l.error(e.message, e.stack, 'ExceptionsHandler');
    const [d] = docDong(l.duongDanHomNay()!);
    expect(d).toMatchObject({ muc: 'error', msg: 'hong', nguCanh: 'ExceptionsHandler' });
    expect(d!.stack).toContain('Error: hong');
  });

  it('không khai thư mục thì không ghi tệp nào (bộ kiểm, máy phát triển)', () => {
    const l = taoLogger('policy', { thuMuc: undefined });
    expect(l.duongDanHomNay()).toBeUndefined();
    expect(() => l.log('x')).not.toThrow();
  });

  it('ghi hỏng thì KHÔNG ném lỗi, báo stderr đúng MỘT lần, rồi tự lành', () => {
    const goc = thuMucTam();
    // `dang-ghi` là một TỆP chứ không phải thư mục → mọi lượt ghi đều hỏng.
    writeFileSync(join(goc, THU_MUC_DANG_GHI), 'chan');
    const l = taoLogger('policy', { thuMuc: goc });
    const err = vi.mocked(process.stderr.write);
    expect(() => {
      l.log('a');
      l.log('b');
      l.error('c');
    }).not.toThrow();
    const baoLoi = () => err.mock.calls.filter((c) => String(c[0]).includes('KHÔNG ghi được tệp log'));
    expect(baoLoi()).toHaveLength(1);

    // Người vận hành sửa xong → dòng kế tiếp ghi được, không cần khởi động lại.
    rmSync(join(goc, THU_MUC_DANG_GHI));
    l.log('da sua');
    expect(docDong(l.duongDanHomNay()!).map((d) => d.msg)).toEqual(['da sua']);

    // Hỏng LẦN NỮA thì phải nói lại — cờ "đã báo" không được kẹt vĩnh viễn.
    rmSync(join(goc, THU_MUC_DANG_GHI), { recursive: true });
    writeFileSync(join(goc, THU_MUC_DANG_GHI), 'chan lan hai');
    l.log('d');
    expect(baoLoi()).toHaveLength(2);
  });
});

describe('LoggerTep — lỗi 500 thật trong một app Nest', () => {
  @Controller()
  class HongController {
    @Get('hong')
    hong(): never {
      throw new Error('bat ngo khong luong truoc');
    }
  }
  @Module({ controllers: [HongController] })
  class HongModule implements NestModule {
    configure(c: MiddlewareConsumer): void {
      c.apply(TraceMiddleware).forRoutes('*');
    }
  }

  it('dòng lỗi mang ĐÚNG traceId mà phản hồi trả về, kèm vết ngăn xếp', async () => {
    const goc = thuMucTam();
    const logger = taoLogger('policy', { thuMuc: goc });
    const app = await NestFactory.create(HongModule, { logger });
    await app.init();
    try {
      const res = await request(app.getHttpServer()).get('/hong').set('x-trace-id', 'tra1234cuu');
      expect(res.status).toBe(500);
      expect(res.headers['x-trace-id']).toBe('tra1234cuu');
      const loi = docDong(logger.duongDanHomNay()!).filter((d) => d.muc === 'error');
      expect(loi).toHaveLength(1);
      expect(loi[0]).toMatchObject({ traceId: 'tra1234cuu', msg: 'bat ngo khong luong truoc' });
      expect(loi[0]!.stack).toContain('HongController.hong');
    } finally {
      await app.close();
    }
  });
});

describe('mười service đều ghi tệp log', () => {
  const dichVu = readdirSync(join(IMPL, 'services'));

  it('có đủ mười một thư mục service (`0252` thêm `van-hanh`)', () => {
    expect(dichVu.sort()).toEqual(
      ['audit', 'catalog', 'customer', 'document', 'gateway', 'identity', 'notification', 'policy', 'reporting', 'sla-worker', 'van-hanh'],
    );
  });

  it.each(dichVu)('services/%s/src/main.ts dựng app với LoggerTep mang ĐÚNG tên thư mục', (s) => {
    const nguon = readFileSync(join(IMPL, 'services', s, 'src', 'main.ts'), 'utf8');
    // Chép dán từ service khác mà quên đổi tên thì hai service ghi chung một tệp.
    expect(nguon).toMatch(new RegExp(`logger: new LoggerTep\\('${s}'\\)`));
    const goi = nguon.match(/NestFactory\.create(?:ApplicationContext)?\(/g) ?? [];
    const coLogger = nguon.match(/NestFactory\.create(?:ApplicationContext)?\([^)]*logger: new LoggerTep/g) ?? [];
    expect(coLogger.length).toBe(goi.length);
  });
});

describe('compose gắn thư mục log cho mọi service ứng dụng', () => {
  it.each(['compose.prod.yml', 'compose.demo.yml'])(
    '%s: khối x-node có CẢ biến CSBH_LOG_DIR lẫn chỗ gắn /var/log/csbh',
    (tep) => {
      const nguon = readFileSync(join(IMPL, 'deploy', tep), 'utf8');
      const xNode = nguon.slice(nguon.indexOf('x-node: &node'), nguon.indexOf('\nservices:'));
      // Thiếu một trong hai là log lặng lẽ biến mất: có biến mà không gắn thì tệp
      // nằm TRONG container và chết theo nó; gắn mà không có biến thì không ghi gì.
      expect(xNode).toMatch(/^\s+CSBH_LOG_DIR: \/var\/log\/csbh$/m);
      expect(xNode).toMatch(/^\s+- \$\{CSBH_LOG_DIR:-[^}]+\}:\/var\/log\/csbh$/m);
      // Mười một service đều kế thừa x-node.
      const keThua = nguon.match(/^ {4}<<: \*node$/gm) ?? [];
      expect(keThua.length).toBe(11);
    },
  );

  it('env.mau khai CSBH_LOG_DIR cho máy chủ', () => {
    expect(readFileSync(join(IMPL, 'deploy', 'env.mau'), 'utf8')).toMatch(/^CSBH_LOG_DIR=\.\.\/logs$/m);
  });
});
