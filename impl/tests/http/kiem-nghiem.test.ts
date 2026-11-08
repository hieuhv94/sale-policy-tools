/**
 * `0270` — chốt chặn của CHỒNG KIỂM NGHIỆM. Luồng điều phối (`csbh kiem-nghiem`, `cap-nhat`,
 * bước 10 của `cai-dat.sh`) có ca ở `csbh-keo-anh.test.ts` và `cai-dat.test.ts`; tệp này canh
 * những gì khiến một chồng kiểm KHÔNG THỂ chạm dữ liệu thật hay gửi thư thật:
 *
 *   - cờ `CSBH_KIEM_NGHIEM` mở chốt "production không trỏ vào hộp thư giả" — và ĐÓNG chiều ngược;
 *   - cờ ấy chỉ khai ở `compose.kiem.yml`;
 *   - `compose.kiem.yml` không mở cổng, không bind dữ liệu, tắt `caddy`;
 *   - `kiem-nghiem.ts` từ chối chạy khi thiếu cờ.
 *
 * Bộ kiểm nghiệm CHẠY THẬT đã được dựng trên chồng production thật (ảnh 1.3.0, nhật ký P309):
 * 21/21 trong 87 giây, dọn sạch 0/0/0, và ngắt bằng SIGINT giữa chừng vẫn dọn.
 */
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { assertSafeMailConfig, UnsafeMailConfigError } from '../../packages/http-kit/src/mail-config.js';

const chay = promisify(execFile);
const KIEM = readFileSync('deploy/compose.kiem.yml', 'utf8');
const KIEM_MA = KIEM.split('\n').filter((d) => !/^\s*#/.test(d)).join('\n');

describe('`0270` cờ CSBH_KIEM_NGHIEM ở chốt cấu hình thư', () => {
  const PROD = { NODE_ENV: 'production', MAIL_ALLOWLIST: 'kiem.test' };

  it('production + mailpit KHÔNG cờ → vẫn DỪNG (chốt NTF-16 giữ nguyên)', () => {
    expect(() => assertSafeMailConfig({ ...PROD, MAIL_HOST: 'mailpit' })).toThrow(UnsafeMailConfigError);
  });

  it('production + mailpit + cờ → chạy được (chồng kiểm)', () => {
    expect(() => assertSafeMailConfig({ ...PROD, MAIL_HOST: 'mailpit', CSBH_KIEM_NGHIEM: '1' })).not.toThrow();
  });

  it('cờ bật mà trỏ vào SMTP THẬT → DỪNG: kiểm nghiệm không bao giờ gửi thư tới người thật', () => {
    expect(() => assertSafeMailConfig({ ...PROD, MAIL_HOST: 'smtp.congty.vn', CSBH_KIEM_NGHIEM: '1' }))
      .toThrow(/Chồng kiểm nghiệm trỏ vào SMTP thật/);
  });

  it('chỉ đúng giá trị "1" mới là cờ — "true", "0" không mở chốt', () => {
    for (const v of ['true', '0', 'yes', '']) {
      expect(() => assertSafeMailConfig({ ...PROD, MAIL_HOST: 'mailpit', CSBH_KIEM_NGHIEM: v }), v).toThrow(UnsafeMailConfigError);
    }
  });
});

describe('`0270` compose.kiem.yml', () => {
  it('CSBH_KIEM_NGHIEM chỉ được khai ở compose.kiem.yml — không tệp compose nào khác', () => {
    const lo = readdirSync('deploy')
      .filter((t) => /^compose.*\.yml$/.test(t) && t !== 'compose.kiem.yml')
      .filter((t) => /^\s+CSBH_KIEM_NGHIEM:/m.test(readFileSync(join('deploy', t), 'utf8')));
    expect(lo).toEqual([]);
    expect(KIEM_MA).toMatch(/^\s+CSBH_KIEM_NGHIEM: "1"$/m);
  });

  it('cờ đặt cho đúng ba service: identity, notification (đọc cấu hình thư), ops (chạy bộ kiểm)', () => {
    // Cắt tệp thành từng khối service theo dòng `  <tên>:` rồi hỏi khối nào mang cờ.
    const khoi = KIEM_MA.split(/^ {2}(?=[a-z-]+:$)/m).slice(1);
    const co = khoi.filter((k) => k.includes('CSBH_KIEM_NGHIEM')).map((k) => k.split(':')[0]);
    expect(co.sort()).toEqual(['identity', 'notification', 'ops']);
  });

  it('không mở cổng nào, tắt caddy', () => {
    expect(KIEM_MA).not.toMatch(/^\s+ports:/m);
    expect(KIEM_MA).toMatch(/ {2}caddy:\n {4}profiles: \["khong-dung"\]/);
  });

  it('KHÔNG bind dữ liệu, KHÔNG nhắc workspace — dữ liệu giả ở volume thường, `down -v` là hết', () => {
    expect(KIEM_MA).not.toMatch(/driver_opts|o: bind|CSBH_WORKSPACE/);
    // Và `csbh` không ghép compose.du-lieu.yml vào lệnh của chồng kiểm.
    const dc = /dc_kiem\(\) \{([\s\S]*?)\n\}/.exec(readFileSync('scripts/csbh', 'utf8'))?.[1] ?? '';
    expect(dc).toContain('compose.kiem.yml');
    expect(dc).not.toContain('compose.du-lieu.yml');
    expect(dc, 'compose của chồng kiểm phải chạy trong môi trường sạch').toMatch(/env -i /);
  });

  it('hộp thư giả mang bí danh mạng `mailpit` — tên duy nhất qua được isFakeRelay', () => {
    expect(KIEM_MA).toMatch(/aliases: \[mailpit\]/);
  });
});

describe('`0270` scripts/kiem-nghiem.ts', () => {
  it('CHẠY THẬT: thiếu CSBH_KIEM_NGHIEM=1 → từ chối, mã 2, không gọi mạng', async () => {
    const env: NodeJS.ProcessEnv = { ...process.env, GATEWAY_URL: 'http://khong-ton-tai.invalid:1' };
    delete env['CSBH_KIEM_NGHIEM'];
    let ma = 0;
    let loi = '';
    try {
      await chay('pnpm', ['exec', 'tsx', 'scripts/kiem-nghiem.ts'], { env });
    } catch (e) {
      ma = (e as { code?: number }).code ?? 1;
      loi = String((e as { stderr?: string }).stderr ?? '');
    }
    expect(ma).toBe(2);
    expect(loi).toContain('TỪ CHỐI');
  }, 30_000);

  it('không dựng NGÀY từ toISOString (lệch 7 giờ — `0208`)', () => {
    expect(readFileSync('scripts/kiem-nghiem.ts', 'utf8')).not.toMatch(/toISOString\(\)\.slice\(0, ?10\)/);
  });
});
