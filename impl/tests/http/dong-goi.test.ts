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
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const chay = promisify(execFile);

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

  it('`0106` `.env.mau` khai tên dự án compose, và KHÔNG mang mật khẩu nào', () => {
    /*
     * Hai bất biến ra từ cùng một lượt cài hỏng thật:
     *
     *   - Thiếu `COMPOSE_PROJECT_NAME` thì compose lấy tên thư mục, và trên máy
     *     đã chạy bản demo nó trùng — chung volume `pgdata`, mà Postgres đặt mật
     *     khẩu chỉ ở lần khởi tạo đầu. Triệu chứng là `password authentication
     *     failed`, một câu không nhắc gì tới volume dùng chung.
     *   - Mật khẩu trong `.env` là bản sao THỨ HAI của thứ đã nằm ở `secrets/`.
     *     Hai bản thì lệch nhau được. Postgres và MinIO đều đọc được `*_FILE`.
     */
    const mau = readFileSync('deploy/env.mau', 'utf8');
    expect(mau).toMatch(/^COMPOSE_PROJECT_NAME=.+$/m);
    for (const v of ['PG_PASSWORD', 'MINIO_PASSWORD']) {
      expect(mau, `${v} không được nằm trong .env`).not.toMatch(new RegExp(`^${v}=`, 'm'));
    }
    const prod = readFileSync('deploy/compose.prod.yml', 'utf8');
    expect(prod).toContain('POSTGRES_PASSWORD_FILE');
    expect(prod).toContain('MINIO_ROOT_PASSWORD_FILE');
  });

  it('`0112` `cai-dat.sh` hỏi ra stderr, trả lời ra stdout', async () => {
    /*
     * `hoi()` luôn được gọi trong `$( )`, mà command substitution BẮT TOÀN BỘ
     * stdout. In lời nhắc ra stdout thì hỏng hai lần cùng lúc: màn hình không
     * hiện câu hỏi nào — script trông như treo trong khi nó đang đứng ở `read` —
     * và lời nhắc trở thành MỘT PHẦN của câu trả lời, nên `.env` nhận nguyên
     * chuỗi `  Tên miền … [csbh.nutricare.vn]: csbh.nutricare.vn`.
     *
     * Ca này chạy CHÍNH hàm ấy, rút thẳng từ tệp thật, chứ không đọc bằng mắt:
     * `>&2` là một ký tự dễ mất trong một lượt sửa, và mất nó thì không có gì đỏ
     * ở tầng nào khác.
     */
    const sh = readFileSync('scripts/cai-dat.sh', 'utf8');
    const ham = /^hoi\(\) \{[\s\S]*?^\}/m.exec(sh)?.[0];
    expect(ham, 'không rút được hàm hoi() — biểu thức đã lạc hậu').toBeDefined();

    const { stdout, stderr } = await chay('sh', [
      '-c',
      `${ham}\nx=$(hoi "Ten mien" "mac-dinh.vn" </dev/null)\nprintf '%s' "$x"`,
    ]);

    // Câu trả lời SẠCH — không dính một chữ nào của lời nhắc.
    expect(stdout).toBe('mac-dinh.vn');
    // Và lời nhắc vẫn tới được mắt người dùng.
    expect(stderr).toContain('Ten mien');
    expect(stderr).toContain('mac-dinh.vn');
  });

  it('`0113` `cai-dat.sh` chặn khi bí mật MỚI gặp volume dữ liệu CŨ', () => {
    /*
     * Postgres đặt mật khẩu superuser CHỈ ở lần khởi tạo thư mục dữ liệu đầu
     * tiên. Nên `secrets/` chưa có + volume đã có = mật khẩu sắp sinh chắc chắn
     * không khớp, và lượt `len` ngay sau sẽ chết ở migrate.
     *
     * Đã xảy ra ba lần (`0106`, `0111`, và một lượt cài thật), báo lỗi ở ba chỗ
     * khác nhau — không chỗ nào là chỗ còn NGĂN được. Đây là chỗ ấy.
     */
    const sh = readFileSync('scripts/cai-dat.sh', 'utf8');

    // Điều kiện phải là CẢ HAI vế, không phải một.
    expect(sh).toContain('! -f secrets/pg_password.txt');
    expect(sh).toContain('_pgdata');
    expect(sh).toContain('docker volume inspect');

    // Tên volume suy từ COMPOSE_PROJECT_NAME, không viết cứng: mỗi nơi cài một tên.
    expect(sh).toContain('COMPOSE_PROJECT_NAME');

    // Và nói ra HAI đường xử lý — chúng khác nhau hẳn.
    expect(sh).toContain('down -v');
    expect(sh).toContain('KHÔNG có gì đáng giữ');
    expect(sh).toContain('CÓ dữ liệu');
  });

  it('`0108` khai `*_FILE` thì PHẢI đặt biến trực tiếp về RỖNG', () => {
    /*
     * Compose GỘP map `environment` chứ không thay thế, nên `POSTGRES_PASSWORD`
     * và `MINIO_ROOT_PASSWORD` của `compose.yml` vẫn còn dù lớp phủ production
     * không nhắc tới chúng. Không có cách nào gỡ một khoá bằng lớp phủ — chỉ
     * ĐẶT RỖNG được, và cả hai ảnh đều coi chuỗi rỗng là chưa đặt.
     *
     * Hai kiểu hỏng khác hẳn nhau, và kiểu thứ hai mới nguy:
     *
     *   Postgres DỪNG hẳn — "both POSTGRES_PASSWORD and POSTGRES_PASSWORD_FILE
     *   are set (but are exclusive)". Thấy ngay.
     *
     *   MinIO KHÔNG dừng. Nó lặng lẽ dùng biến trực tiếp, tức mật khẩu mặc định
     *   `csbh_dev_pw` của compose.yml, trong khi mười service đọc từ file. MinIO
     *   xanh, healthcheck xanh, và mọi lượt tải tệp trả một lỗi chữ ký không
     *   nhắc gì tới mật khẩu.
     */
    const prod = readFileSync('deploy/compose.prod.yml', 'utf8');
    for (const v of ['POSTGRES_PASSWORD', 'MINIO_ROOT_PASSWORD']) {
      expect(prod, `${v} phải được đặt rỗng cạnh ${v}_FILE`).toMatch(
        new RegExp(`^\\s+${v}: ""$`, 'm'),
      );
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

  it('`0118` thẻ ảnh CHỈ là số phiên bản — không gắn git sha', () => {
    /*
     * Thẻ dạng `1.0.0-a1b2c3d` đọc không ra và chép tay dễ sai: người vận hành
     * gõ nó vào `.env`, và `./csbh phien-ban` trả về một chuỗi không nói lên
     * bản nào.
     *
     * Cái giá dồn hết vào một luật, và luật ấy nằm ngoài mã: **mỗi lần giao là
     * một số mới trong `VERSION`**. Ca kiểm chỉ giữ được vế trong mã — thẻ dựng
     * từ `VERSION` và không gì khác.
     */
    expect(SH).toMatch(/^TAG="\$\{CSBH_TAG:-\$\{VERSION\}\}"$/m);
    // Không còn phép tính sha nào sót lại trong script.
    expect(SH).not.toContain('rev-parse');
  });

  it('`0117` `ops` nhận được MAIL_ALLOWLIST — nếu không, chốt của lệnh mồi là hình vẽ', () => {
    /*
     * `bootstrap-admin` từ chối một `ADMIN_EMAIL` ngoài danh sách tên miền. Nó
     * chạy trong container `ops`, mà khối `environment` của `ops` KHÔNG kế thừa
     * `&node-env` — nó tự khai từng biến một.
     *
     * Thiếu biến ở đó thì `chuanHoaMienThu(undefined)` trả danh sách rỗng,
     * `thuocMienThu` cho qua mọi địa chỉ, và chốt chặn đọc như thể đang chặn mà
     * không chặn gì — đúng lớp lỗi mà `0105` đã gặp một lần ở chính biến này.
     *
     * Không có ca kiểm nào khác bắt được: bộ test chạy `bootstrap-admin` bằng
     * môi trường của chính nó, không qua compose.
     */
    const prod = readFileSync('deploy/compose.prod.yml', 'utf8');
    const khoiOps = /^ {2}ops:\n(?: {4}.*\n| *\n)*/m.exec(prod)?.[0];
    expect(khoiOps, 'không rút được khối service `ops` — biểu thức đã lạc hậu').toBeDefined();
    expect(khoiOps).toContain('MAIL_ALLOWLIST');
  });
});
