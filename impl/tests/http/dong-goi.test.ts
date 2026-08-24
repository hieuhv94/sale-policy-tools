/**
 * `0105` — BẢN ĐÓNG GÓI phải dựng được từ những tệp thật sự có trong kho.
 *
 * Bước đóng gói chỉ chạy lúc giao bản, tức là hiếm — và nó hỏng theo kiểu tệ
 * nhất: một tệp bị đổi tên ba tháng trước, `cp` báo "No such file", và người
 * đang chuẩn bị giao hàng phát hiện ra điều đó vào đúng hôm giao.
 *
 * Ca kiểm này đọc chính `dong-goi.sh`, rút ra mọi đường dẫn nó chép, và kiểm
 * chúng tồn tại. Nó không dựng ảnh và không chạy docker — nó chỉ canh cái lớp
 * mỏng dễ mục nhất: danh sách tệp.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SH = readFileSync('scripts/dong-goi.sh', 'utf8');

describe('`0105` bản đóng gói', () => {
  it('mọi tệp mà `dong-goi.sh` chép đều có thật', () => {
    /*
     * Rút đường dẫn NGUỒN của từng lệnh `cp`: mọi tham số trừ tham số cuối
     * (đích), và bỏ qua những tham số mang biến shell hay ký tự đại diện.
     */
    const nguon: string[] = [];
    for (const dong of SH.split('\n')) {
      const m = /^\s*cp\s+(.+)$/.exec(dong);
      if (!m?.[1]) continue;
      const phan = m[1].trim().split(/\s+/);
      for (const p of phan.slice(0, -1)) {
        if (p.startsWith('-') || p.includes('$') || p.includes('*')) continue;
        nguon.push(p);
      }
    }

    // Ca này chỉ có nghĩa khi nó thật sự tìm thấy thứ để kiểm.
    expect(nguon.length, 'không rút được đường dẫn nào — biểu thức đã lạc hậu').toBeGreaterThan(5);
    for (const p of nguon) {
      expect(existsSync(p), `dong-goi.sh chép "${p}" nhưng tệp không tồn tại`).toBe(true);
    }
  });

  it('ba tệp người vận hành CHẠY đều nằm trong gói', () => {
    // Thiếu một trong ba thì bản giao là một thư mục đọc được mà không dùng được.
    for (const p of ['scripts/cai-dat.sh', 'scripts/csbh', 'deploy/cron/csbh.cron']) {
      expect(SH, `gói thiếu ${p}`).toContain(p);
      expect(existsSync(p), `${p} không tồn tại`).toBe(true);
    }
  });

  it('bốn tài liệu đều nằm trong gói', () => {
    for (const p of [
      'docs/03-HUONG-DAN-SU-DUNG.md',
      'docs/04-TRIEN-KHAI.md',
      'docs/05-VAN-HANH.md',
      'deploy/RPO-RTO.md',
    ]) {
      expect(SH, `gói thiếu ${p}`).toContain(p);
      expect(existsSync(p), `${p} không tồn tại`).toBe(true);
    }
  });

  it('`compose.prod.yml` KHÔNG có `build:` nào — máy chủ khách chỉ pull', () => {
    /*
     * Bất biến trung tâm của cả mô hình. Một `build:` lọt vào đây thì lệnh dựng
     * trên máy chủ khách đi tìm cây mã nguồn không tồn tại, và câu báo lỗi của
     * docker nói về một đường dẫn chứ không nói về điều vừa sai.
     */
    const prod = readFileSync('deploy/compose.prod.yml', 'utf8');
    expect(prod).not.toMatch(/^\s+build:/m);
    // Và mọi ảnh đều ghim thẻ qua biến, không ai để `latest`.
    expect(prod).not.toMatch(/image:.*:latest/);
    expect(prod).toContain('${CSBH_TAG');
  });

  it('`.env.mau` khai ĐỦ mọi biến mà compose production đòi', () => {
    /*
     * `compose.prod.yml` dùng cú pháp `${X:?...}` cho biến bắt buộc — thiếu một
     * cái thì `docker compose` dừng ngay. Đó là hành vi đúng, nhưng người cài
     * đặt chỉ có `.env.mau` để biết phải khai gì. Một biến bắt buộc không có
     * trong bản khai là một người cài đặt bị chặn mà không biết điền vào đâu.
     */
    const prod = readFileSync('deploy/compose.prod.yml', 'utf8');
    const mau = readFileSync('deploy/env.mau', 'utf8');
    const batBuoc = new Set(
      [...prod.matchAll(/\$\{([A-Z_]+):\?/g)].map((m) => m[1] as string),
    );
    expect(batBuoc.size, 'không tìm thấy biến bắt buộc nào').toBeGreaterThan(3);
    for (const v of batBuoc) {
      expect(mau, `env.mau thiếu biến bắt buộc ${v}`).toMatch(new RegExp(`^${v}=`, 'm'));
    }
  });
});
