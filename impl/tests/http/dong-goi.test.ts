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
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const chay = promisify(execFile);

const SH = readFileSync('scripts/dong-goi.sh', 'utf8');

describe('`0105` bản đóng gói', () => {
  // `0270`: danh sách tệp của bản cài nằm ở `scripts/ban-cai.sh` — MỘT định nghĩa cho
  // gói giao lần đầu (`dong-goi.sh goi`) lẫn lượt `csbh cap-nhat` (bung từ ảnh ops).
  const BC = readFileSync('scripts/ban-cai.sh', 'utf8');

  it('`goi` dựng chương trình bằng `ban-cai.sh`, không tự liệt kê tệp', () => {
    expect(SH).toContain('sh scripts/ban-cai.sh . "$goc" "$IMG"');
    const goi = /\ngoi\(\) \{([\s\S]*?)\n\}/.exec(SH)?.[1] ?? '';
    expect(goi, 'goi() chép tệp chương trình bằng tay — hai danh sách sẽ trôi').not.toMatch(/cp (deploy|scripts|docs)\//);
  });

  it('mọi tệp mà `ban-cai.sh` chép đều có thật', () => {
    // Đường nguồn dạng "$goc/<đường>" không mang biến nào khác.
    const nguon = [...BC.matchAll(/"\$goc\/([^"$]+)"/g)].map((m) => m[1]!).filter((p) => p !== 'VERSION' || true);
    expect(nguon.length, 'không rút được đường dẫn nào — biểu thức đã lạc hậu').toBeGreaterThan(8);
    for (const p of nguon) expect(existsSync(p), `ban-cai.sh chép "${p}" nhưng tệp không tồn tại`).toBe(true);
    // Vòng compose: các tệp BẮT BUỘC phải có (compose.kiem.yml là tuỳ chọn tới P309).
    for (const t of ['compose.yml', 'compose.prod.yml', 'compose.du-lieu.yml', 'compose.tunnel.yml']) {
      expect(BC).toContain(t);
      expect(existsSync(`deploy/${t}`), t).toBe(true);
    }
  });

  it('các tệp người vận hành CHẠY đều nằm trong bản cài', () => {
    for (const p of ['scripts/cai-dat.sh', 'scripts/csbh', 'scripts/lib-buoc.sh', 'deploy/cron/csbh.cron', 'deploy/systemd/csbh-tac-tu.service']) {
      expect(BC, `bản cài thiếu ${p}`).toContain(p.replace(/^/, '$goc/'));
      expect(existsSync(p), `${p} không tồn tại`).toBe(true);
    }
    expect(BC).toContain('"$goc/deploy/env.mau" > "$dich/csbh.env.mau"');
  });

  it('bốn tài liệu đều nằm trong bản cài', () => {
    for (const p of ['docs/03-HUONG-DAN-SU-DUNG.md', 'docs/04-TRIEN-KHAI.md', 'docs/05-VAN-HANH.md', 'deploy/RPO-RTO.md']) {
      expect(BC, `bản cài thiếu ${p}`).toContain(`$goc/${p}`);
      expect(existsSync(p), `${p} không tồn tại`).toBe(true);
    }
  });

  it('CHẠY THẬT: `ban-cai.sh` dựng ra đúng hình dạng thư mục chương trình', async () => {
    const dich = mkdtempSync(join(tmpdir(), 'ban-cai-'));
    await chay('sh', ['scripts/ban-cai.sh', '.', dich, 'kho/csbh']);
    for (const t of ['csbh', 'cai-dat.sh', 'lib-buoc.sh', 'VERSION', 'csbh.env.mau', 'deploy/compose.prod.yml',
      'deploy/compose.du-lieu.yml', 'deploy/postgres/postgresql.conf', 'deploy/cron/csbh.cron',
      'deploy/systemd/csbh-tac-tu.service', 'tai-lieu/04-TRIEN-KHAI.md']) {
      expect(existsSync(join(dich, t)), t).toBe(true);
    }
    expect(readFileSync(join(dich, 'csbh.env.mau'), 'utf8')).toMatch(/^CSBH_IMAGE=kho\/csbh$/m);
    expect(readFileSync(join(dich, 'tai-lieu/04-TRIEN-KHAI.md'), 'utf8')).not.toContain('../deploy/RPO-RTO.md');
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

  it('`0270` bí mật NGƯỜI DÙNG khai trong csbh.env KHÔNG BAO GIỜ được compose nhắc tới', () => {
    /*
     * Từ `0270` tệp cấu hình duy nhất mang cả mật khẩu SMTP, secret Google, mật khẩu
     * Quản trị đầu và token registry. Compose chỉ đưa vào container những biến NÓ NHẮC
     * TỚI — nên chỉ cần không compose nào nhắc tới bốn khoá ấy là chúng không bao giờ
     * hiện ở `docker inspect` (lý do `0106`). Container đọc tệp dẫn xuất qua `*_FILE`.
     */
    const mau = readFileSync('deploy/env.mau', 'utf8');
    for (const k of ['MAIL_PASSWORD', 'GOOGLE_CLIENT_SECRET', 'ADMIN_MAT_KHAU', 'REGISTRY_TOKEN']) {
      expect(mau, `${k} phải có trong csbh.env.mau`).toMatch(new RegExp(`^${k}=`, 'm'));
      for (const t of readdirSync('deploy').filter((x) => /^compose.*\.yml$/.test(x))) {
        expect(readFileSync(join('deploy', t), 'utf8'), `${t} nhắc tới \${${k}}`).not.toMatch(new RegExp(`\\$\\{${k}[:}-]`));
      }
    }
  });

  it('`0270` `cai-dat.sh` KHÔNG HỎI GÌ — mọi thông tin đọc từ tệp cấu hình', () => {
    /*
     * Thay ca `0112` (lời nhắc ra stderr): bộ cài thôi hỏi. Một lệnh `read` lọt vào
     * là bộ cài đứng chờ bàn phím — chạy qua `ssh host 'sudo ./cai-dat.sh'` hay từ một
     * công cụ tự động là TREO, không lỗi nào.
     */
    const sh = readFileSync('scripts/cai-dat.sh', 'utf8');
    const ma = sh.split('\n').filter((d) => !/^\s*#/.test(d)).join('\n');
    expect(ma).not.toMatch(/(^|[\s;|&(])read\s/m);
    expect(sh).toMatch(/^#!\/usr\/bin\/env bash$/m);
    expect(sh).toContain('set -euo pipefail');
    expect(sh).toContain('ENV_TEP="${CSBH_ENV:-/etc/csbh/csbh.env}"');
  });

  it('`0113` `cai-dat.sh` chặn khi bí mật MỚI gặp dữ liệu CŨ', () => {
    /*
     * Postgres đặt mật khẩu superuser CHỈ ở lần khởi tạo thư mục dữ liệu đầu
     * tiên. Nên `secrets/` chưa có + dữ liệu đã có = mật khẩu sắp sinh chắc chắn
     * không khớp, và lượt `len` ngay sau sẽ chết ở migrate.
     *
     * Từ `0270` dữ liệu nằm ở `<workspace>/data/postgres` (bind) — chốt hỏi CẢ thư
     * mục ấy lẫn volume tên cũ. Ca chạy thật ở `cai-dat.test.ts`.
     */
    const sh = readFileSync('scripts/cai-dat.sh', 'utf8');
    expect(sh).toContain('! -f "$WS/secrets/pg_password.txt"');
    expect(sh).toContain('"$WS/data/postgres"');
    expect(sh).toContain('docker volume inspect "${DU_AN}_pgdata"');
    expect(sh).toContain('DU_AN="$(doc_env COMPOSE_PROJECT_NAME)"');
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
    // `0270`: bốn ảnh của kho ta chạy ĐÚNG thẻ `-latest`, và `.env` không còn
    // mang số phiên bản nào (ảnh tự biết mình — xem ca `0270` ở dưới).
    const cuaTa = [...prod.matchAll(/^\s+image: \$\{CSBH_IMAGE:\?thiếu CSBH_IMAGE\}:(\S+)$/gm)].map((m) => m[1]);
    expect([...new Set(cuaTa)].sort()).toEqual(['minio-latest', 'ops-latest', 'service-latest', 'web-latest']);
    expect(prod).not.toContain('CSBH_TAG');
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

  it('`0125` `seed-demo` dọn dòng giá của lượt tạo', () => {
    /*
     * Từ `0123` tạo sản phẩm ghi luôn một dòng giá mang ngày HÔM NAY. Bộ nạp
     * demo dựng ba năm lịch sử rồi vặn đồng hồ về quá khứ, nên dòng ấy sai với
     * chính câu chuyện nó kể — và nó hiện ra ở *Lịch sử giá* như một lần đổi giá
     * không ai thực hiện.
     *
     * Ca kiểm quét mã nguồn vì bộ nạp chỉ chạy trên chồng demo, không chạy trong
     * bộ test. Phép xoá phải CÓ ĐIỀU KIỆN: xoá trần theo ngày sẽ cuốn theo cả
     * giá của `nap-danh-muc`, nơi ngày hôm nay là mốc đúng và duy nhất.
     */
    const nguon = readFileSync('scripts/seed-demo.ts', 'utf8');
    expect(nguon).toContain('donGiaTao');
    expect(nguon).toMatch(/DELETE FROM cat\.product_price/);
    expect(nguon, 'phải chừa lại sản phẩm chỉ có một mốc giá').toMatch(/EXISTS \(/);
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


/**
 * `0218` — `./csbh upgrade`: lên bản mới nhất, xoá sạch dữ liệu, GIỮ địa chỉ.
 *
 * Lệnh này xoá hẳn dữ liệu trên một chồng `production`, nên nó đi vòng qua chốt
 * `NODE_ENV` mà SEC-14 canh. Đường vòng ấy chỉ chấp nhận được khi nó **khó gõ
 * nhầm hơn** chính cái chốt nó đi vòng qua — và ba ca đầu dưới đây canh đúng ba
 * lớp thay chỗ cho chốt ấy. Cùng khuôn `0136` đã dùng cho `nap-danh-muc`, thứ
 * cũng không có chốt `NODE_ENV` và phải chứng minh nó có đủ hai chốt khác.
 *
 * Ba ca sau canh vế thứ hai của yêu cầu: **địa chỉ công khai không được đổi**.
 * Nó không kiểm được bằng cách dựng thật ở đây, nên chúng canh những cách đã
 * biết là làm nó đổi.
 */
describe('`0218` ./csbh upgrade', () => {
  const CLI = readFileSync('scripts/csbh', 'utf8');
  const OPS = readFileSync('docker/ops-entrypoint.sh', 'utf8');
  /*
   * MÃ, đã BỎ CHÚ THÍCH — bài học `0208`.
   *
   * Ca *"không tự viết lệnh xoá"* dưới đây đỏ ở lượt chạy đầu, và **tệp thì
   * đúng**: chính dòng chú thích giải thích *vì sao* không được viết
   * `DROP DATABASE` ở đó lại chứa đúng cụm từ bị cấm. Đây là mặt trái của bẫy
   * `0124` (ở đó chú thích làm phép quét nói CÓ khi thật ra không).
   */
  const OPS_MA = OPS.split('\n')
    .filter((d) => !/^\s*#/.test(d))
    .join('\n');
  /** Thân nhánh `upgrade)` của `case`, cắt tới nhánh kế tiếp. */
  const nhanh = /\n {2}upgrade\)\n([\s\S]*?)\n {2}sao-luu\)/.exec(CLI)?.[1];

  it('nhánh `upgrade` rút ra được — biểu thức không lạc hậu', () => {
    // Mọi ca dưới đây đọc `nhanh`; nó rỗng thì chúng xanh mà chẳng đo gì (bẫy
    // `0205`).
    expect(nhanh, 'không rút được nhánh upgrade của `case`').toBeDefined();
    expect(nhanh!.length).toBeGreaterThan(500);
  });

  it('HỎI LẠI bằng bàn phím, và hỏi TRƯỚC khi xoá', () => {
    /*
     * Thứ tự là cả nội dung của ca này. Một lệnh hỏi xác nhận SAU khi đã gọi
     * `lam-sach` thì câu hỏi ấy chỉ là trang trí.
     */
    const iHoi = nhanh!.indexOf('read -r xn');
    const iXoa = nhanh!.indexOf('lam-sach');
    expect(iHoi, 'không hỏi lại gì').toBeGreaterThan(-1);
    expect(iXoa).toBeGreaterThan(-1);
    expect(iHoi, 'hỏi xác nhận SAU khi đã xoá').toBeLessThan(iXoa);
    expect(nhanh).toContain('XOA-SACH');
  });

  it('SAO LƯU trước khi xoá — lối lùi duy nhất của một lượt gõ nhầm', () => {
    const iLuu = nhanh!.indexOf('ops backup');
    const iXoa = nhanh!.indexOf('lam-sach');
    expect(iLuu, 'không sao lưu gì').toBeGreaterThan(-1);
    expect(iLuu, 'sao lưu SAU khi đã xoá').toBeLessThan(iXoa);
    // `0270`: và TRƯỚC khi kéo — máy chạy thẻ `-latest`, kéo trước là lượt sao lưu
    // chạy bằng ảnh ops MỚI thay vì bản đã ghi dữ liệu.
    const iKeo = nhanh!.indexOf('keo_anh_latest');
    expect(iKeo).toBeGreaterThan(-1);
    expect(iLuu, 'kéo ảnh mới TRƯỚC khi sao lưu').toBeLessThan(iKeo);
  });

  it('NÓI RA hai bước cài đặt phải làm lại, và nói SAU KHI dựng xong', () => {
    /*
     * Xoá sạch xong mà không nói gì thì người vận hành mở trang web ra, thấy
     * màn hình đăng nhập, và không có tài khoản nào để vào.
     *
     * VẾ *"sau khi dựng xong"* CÓ VÌ MỘT LƯỢT PHÁ LẠI XANH: bản đầu chỉ hỏi hai
     * cái tên có xuất hiện trong nhánh không, và chúng cũng xuất hiện ở khối
     * CẢNH BÁO trước lúc hỏi xác nhận — nên gỡ sạch phần hướng dẫn cuối mà ca
     * vẫn xanh. Câu hỏi đúng là *"người vận hành có đọc được nó SAU khi lệnh
     * chạy xong không"*, vì lúc ấy khối cảnh báo đã trôi khỏi màn hình.
     */
    const iDung = nhanh!.lastIndexOf('$DC up -d --wait');
    expect(iDung, 'không thấy lượt dựng lại').toBeGreaterThan(-1);
    const cuoi = nhanh!.slice(iDung);
    expect(cuoi, 'không nhắc bước tạo tài khoản sau khi dựng xong').toContain('mo-tai-khoan');
    expect(cuoi, 'không nhắc bước nạp danh mục sau khi dựng xong').toContain('nap-danh-muc');
  });

  it('KHÔNG kéo ảnh `cloudflared` — thẻ `latest` đổi là địa chỉ đổi', () => {
    /*
     * `$DC pull` trần kéo cả `cloudflare/cloudflared:latest`. Cloudflare đẩy
     * bản mới vài tuần một lần, nên đúng vào một lượt nâng bản nào đó id ảnh
     * đổi, `up -d` dựng lại container, và địa chỉ quick tunnel chết theo — mọi
     * liên kết trong thư đã gửi thành vô hiệu, mà không ai nối hai việc lại.
     *
     * Ca này canh CÁCH VIẾT chứ không canh hành vi, và nói rõ điều đó: nó là
     * thứ duy nhất đo được mà không dựng cả chồng production lên.
     */
    expect(nhanh, 'nhánh upgrade kéo mọi ảnh, gồm cả cloudflared').not.toMatch(/\$DC pull(\s|$)/);
    expect(nhanh, 'không thấy lượt kéo ảnh có chọn lọc').toContain('keo_anh_latest');
    expect(CLI).toContain('keo_anh_latest() {');
    // Kéo ĐÚNG ba thành phần của phần mềm, bằng thẻ `latest`.
    const keo = /keo_anh_latest\(\) \{([\s\S]*?)\n\}/.exec(CLI)?.[1] ?? '';
    expect(keo).toMatch(/for tp in \$ANH_TA/);
    expect(CLI).toMatch(/^ANH_TA="service web ops minio"$/m);
    expect(keo).toContain('-latest');
  });

  it('KHÔNG dựng lại `cloudflared`, và ĐO lại xem nó có bị dựng lại không', () => {
    /*
     * Vế thứ hai là thứ đáng giá: `up -d` *lẽ ra* không đụng container có cấu
     * hình không đổi — nhưng "lẽ ra" đã làm hỏng vài lượt ở repo này. Nên lệnh
     * ghi id container trước và sau, rồi nói ra nếu nó đổi.
     */
    expect(nhanh, 'upgrade ép dựng lại container').not.toContain('--force-recreate');
    expect(CLI).toContain('id_cloudflared() {');
    /*
     * HỎI HAI PHÉP GÁN, KHÔNG ĐẾM MỘT CÁI TÊN — và vế này đi qua HAI lượt phá
     * lại mới đúng:
     *
     *   1. bản đầu chỉ hỏi chuỗi `id_cloudflared` có mặt trong nhánh không, nên
     *      bỏ lượt đo TRƯỚC mà vẫn xanh nhờ lượt đo SAU còn nguyên;
     *   2. bản thứ hai đếm số lần xuất hiện và đòi ≥ 2 — vẫn xanh, vì **chú
     *      thích của chính nhánh ấy nhắc tên hàm**. Đúng bẫy `0124`, lần thứ
     *      HAI trong cùng chặng này (xem `OPS_MA` ở trên).
     *
     * Một phép so cần hai vế; đo một vế rồi so với rỗng là luôn thấy "đổi".
     */
    expect(nhanh, 'không đo id cloudflared TRƯỚC khi dựng lại').toMatch(
      /truoc="\$\(id_cloudflared\)"/,
    );
    expect(nhanh, 'không đo lại id cloudflared SAU khi dựng').toMatch(
      /sau="\$\(id_cloudflared\)"/,
    );
    expect(nhanh, 'đo rồi mà không so').toMatch(/"\$truoc" != "\$sau"/);
    expect(nhanh, 'id đổi mà không nói gì').toMatch(/CẢNH BÁO[\s\S]*cloudflared/);
  });

  it('`0270` — `.env` KHÔNG mang số phiên bản; ẢNH tự biết mình', () => {
    /*
     * ĐẢO ca `0218` (*"`latest` không bao giờ vào `.env` — ghim SỐ"*). Lý do của ca
     * cũ: ảnh `service`/`ops` nhận `APP_VERSION` từ `.env`, nên chạy `latest` là mười
     * service tự báo phiên bản `latest`. Từ `0270` máy chạy `-latest` theo yêu cầu,
     * nên lý do ấy phải được chữa Ở GỐC — con số nướng vào ẢNH — và ca này canh cả
     * bốn mắt xích: Dockerfile nhận biến, lượt dựng truyền nó, compose thôi đè nó, và
     * `upgrade` thôi ghi số vào `.env`.
     */
    const df = readFileSync('docker/Dockerfile', 'utf8');
    expect(df, 'ảnh service không nướng APP_VERSION').toMatch(/^ARG APP_VERSION=0\.0\.0-dev\nENV APP_VERSION=\$\{APP_VERSION\}$/m);
    const SH2 = readFileSync('scripts/dong-goi.sh', 'utf8');
    const anh = /\nanh\(\) \{([\s\S]*?)\n\}/.exec(SH2)?.[1] ?? '';
    const lenhDung = anh.split('docker build').slice(1);
    expect(lenhDung.length).toBe(3);
    // Ảnh service VÀ ảnh web nhận `--build-arg APP_VERSION`; ảnh ops kế thừa từ service.
    expect(lenhDung.filter((l) => l.includes('--build-arg "APP_VERSION=${TAG}"')).length).toBe(2);
    for (const tep of readdirSync('deploy').filter((t) => /^compose\.(prod|tunnel)\.yml$/.test(t))) {
      // Khoá YAML, không phải chữ: chú thích đầu tệp NÓI về biến này (bẫy `0124`).
      expect(readFileSync(join('deploy', tep), 'utf8'), `${tep} còn đè APP_VERSION`).not.toMatch(/^\s+APP_VERSION:/m);
    }
    expect(readFileSync('deploy/env.mau', 'utf8')).not.toMatch(/^CSBH_TAG=/m);
    expect(nhanh, 'upgrade còn ghi số vào .env').not.toMatch(/CSBH_TAG/);
    expect(CLI, 'không đọc số từ nhãn OCI').toContain('org.opencontainers.image.version');
    /*
     * Nhãn rỗng (ảnh dựng trước `0218`) thì DỪNG, không rơi về `latest`.
     *
     * Hỏi CHÍNH KHỐI GÁC, không hỏi "có `exit 1` nào sau đó không": bản đầu hỏi
     * đúng câu ấy và một lượt phá lại (thay `exit 1` bằng `moi=latest`) vẫn XANH
     * — vì cách đó vài chục dòng còn `exit 1` của lượt hỏi xác nhận. Đúng lớp
     * bẫy `indexOf` trúng nhầm chuỗi thứ hai, lần thứ ba trong chặng này.
     */
    const gac = /\[ -n "\$moi" \] \|\| \{([\s\S]*?)\n {4}\}/.exec(nhanh!)?.[1];
    expect(gac, 'không có khối gác cho nhãn rỗng').toBeDefined();
    expect(gac, 'nhãn rỗng mà vẫn đi tiếp').toContain('exit 1');
    expect(gac, 'nhãn rỗng thì tự gán một giá trị thay vì dừng').not.toMatch(/moi=/);
  });

  it('người vận hành thấy bản SẮP LÊN trước khi gõ xác nhận', () => {
    // Kéo ảnh không đụng container nào đang chạy, nên làm trước được — và gõ
    // "XOA-SACH" cho một bản chưa biết là gì là xác nhận một thứ mình không đọc.
    // `0270`: đọc số THẲNG TỪ REGISTRY (`nhan_kho`) — kéo phải đợi sau sao lưu.
    const iSo = nhanh!.indexOf('nhan_kho');
    const iHoi = nhanh!.indexOf('read -r xn');
    expect(iSo, 'đọc số phiên bản SAU khi đã hỏi xác nhận').toBeLessThan(iHoi);
    expect(nhanh).toContain('Sẽ lên bản:');
  });

  it('`make day-anh` đẩy CẢ thẻ số lẫn `latest`, thẻ số TRƯỚC', () => {
    /*
     * Thứ tự có lý do: đẩy hỏng giữa chừng mà thẻ số đã lên thì vô hại; ngược
     * lại thì `latest` trỏ tới một bản mà thẻ số của nó không tồn tại, và
     * `upgrade` sẽ ghim một con số không kéo lại được.
     */
    const day = /\nday\(\) \{([\s\S]*?)\n\}/.exec(SH)?.[1] ?? '';
    /*
     * Đọc THỨ TỰ CÁC LƯỢT `docker push`, không tìm chuỗi thẻ: bản đầu tìm
     * `-${TAG}"` và một lượt phá lại (đảo hai vòng) vẫn XANH — chuỗi ấy còn nằm
     * trong lệnh `docker tag …-${TAG} …-latest` của vòng `latest`.
     */
    const day_push = [...day.matchAll(/docker push "\$\{IMG\}:\$\{tp\}-([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(day_push, 'phải đẩy đúng hai loại thẻ').toEqual(['${TAG}', 'latest']);
    expect(day).toMatch(/docker tag "\$\{IMG\}:\$\{tp\}-\$\{TAG\}" "\$\{IMG\}:\$\{tp\}-latest"/);
  });

  it('CẢ BA ảnh mang nhãn phiên bản — thiếu một ảnh là upgrade không đọc được số', () => {
    const anh = /\nanh\(\) \{([\s\S]*?)\n\}/.exec(SH)?.[1] ?? '';
    const soBuild = (anh.match(/docker build/g) ?? []).length;
    const soNhan = (anh.match(/--label "\$NHAN"/g) ?? []).length;
    expect(soBuild).toBe(3);
    expect(soNhan, 'có ảnh dựng ra mà không mang nhãn phiên bản').toBe(soBuild);
    expect(SH).toMatch(/^NHAN="org\.opencontainers\.image\.version=\$\{TAG\}"$/m);
  });

  it('danh sách service phải DỪNG tính bằng phép TRỪ, và giữ đúng hạ tầng', () => {
    /*
     * Gõ tay mười tên service là một danh sách sẽ trôi: thêm service thứ mười
     * một mà quên sửa nó thì service ấy giữ một kết nối tới CSDL, và
     * `DROP DATABASE` hỏng với *"is being accessed by other users"* — một câu
     * lỗi không nói cho biết ai đang giữ.
     *
     * Phép trừ thì tự đúng. Thứ phải giữ đồng bộ chuyển sang danh sách HẠ TẦNG,
     * và ca này ghim ba cái tên bắt buộc có trong đó, mỗi cái một lý do khác
     * nhau — `postgres` là thứ đang bị xoá bên trong, `caddy` để trang còn trả
     * lời, `cloudflared` vì dựng lại nó là đổi địa chỉ công khai.
     */
    expect(nhanh, 'gõ tay danh sách service thay vì tính bằng phép trừ').toContain(
      '$DC config --services',
    );
    const giu = /GIU_LAI="([^"]+)"/.exec(nhanh!)?.[1]?.split(/\s+/) ?? [];
    for (const ten of ['postgres', 'caddy', 'cloudflared', 'ops', 'migrate']) {
      expect(giu, `${ten} phải nằm trong danh sách GIỮ LẠI`).toContain(ten);
    }
    // Và mọi tên trong danh sách ấy phải là service CÓ THẬT — một tên gõ sai
    // thì service ấy bị dừng trong im lặng.
    const dsv = readFileSync('deploy/compose.yml', 'utf8') + readFileSync('deploy/compose.prod.yml', 'utf8') + readFileSync('deploy/compose.tunnel.yml', 'utf8');
    for (const ten of giu) {
      expect(dsv, `không có service nào tên "${ten}"`).toMatch(
        new RegExp(`^ {2}${ten}:`, 'm'),
      );
    }
  });

  it('`csbh-ops lam-sach` đòi XAC_NHAN_XOA_SACH, và KHÔNG chép phép xoá', () => {
    /*
     * Cùng khuôn `RESTORE_DB=csbh` của lệnh `restore`: một biến không có mặc
     * định, người gọi phải gõ ra.
     *
     * Vế thứ hai quan trọng không kém: `reset-db.sh` phải là bản DUY NHẤT của
     * phép `DROP DATABASE`. Chép nó sang entrypoint là hai chỗ sẽ lệch, và chỗ
     * lệch ấy chỉ lộ ra ở đúng lượt người ta cần nó chạy đúng nhất.
     */
    expect(OPS).toContain('XAC_NHAN_XOA_SACH');
    expect(OPS).toContain('/app/scripts/reset-db.sh');
    expect(OPS_MA, 'entrypoint tự viết lệnh xoá thay vì gọi reset-db.sh').not.toContain(
      'DROP DATABASE',
    );
  });

  it('CHẠY THẬT: thiếu XAC_NHAN_XOA_SACH thì `lam-sach` tự thoát', async () => {
    /*
     * Không đọc mã nguồn bằng mắt — chạy chính entrypoint. Chỉ chiều ÂM được
     * kiểm ở đây: chiều dương sẽ xoá CSDL của bộ kiểm.
     */
    let code = 0;
    let loi = '';
    try {
      await chay('sh', ['docker/ops-entrypoint.sh', 'lam-sach']);
    } catch (e) {
      const err = e as { code?: number; stderr?: string; stdout?: string };
      code = err.code ?? 1;
      loi = `${err.stderr ?? ''}${err.stdout ?? ''}`;
    }
    expect(code, 'chạy được mà không cần xác nhận').not.toBe(0);
    expect(loi).toMatch(/XAC_NHAN_XOA_SACH/);
    // Và nó chỉ ra lối đi GIỮ dữ liệu, thay vì để người đọc tự đoán.
    expect(loi).toMatch(/cap-nhat/);
  });
});

describe('`0247` ảnh MinIO NHÂN BẢN trong kho của ta', () => {
  /*
   * MinIO xoá kho `minio/minio` khỏi Docker Hub (09/2026), nên máy MỚI không kéo
   * được ảnh gốc. Ta giữ một bản nhân bản — cùng ảnh, chỉ đổi tên. Ba tệp phải
   * nói CÙNG một bản MinIO: `dong-goi.sh` (nguồn), `compose.yml` (dev/kiểm/demo
   * dùng tên gốc), `compose.prod.yml` (máy khách dùng bản nhân bản). Lệch một tệp
   * là máy dev chạy một bản MinIO, máy khách chạy bản khác, mà không gì đỏ.
   */
  const GOC = /^MINIO_GOC="([^"]+)"$/m.exec(SH)?.[1] ?? '';
  const BAN = GOC.split(':')[1] ?? '';
  const anhCua = (tep: string) => {
    const s = readFileSync(tep, 'utf8');
    const khoi = /\n {2}minio:\n([\s\S]*?)(?=\n {2}[a-z-]+:\n)/.exec(s)?.[1] ?? '';
    // Cả phần còn lại của dòng: `${CSBH_IMAGE:?thiếu CSBH_IMAGE}` có dấu cách bên trong.
    return /^\s+image:\s*(.+?)\s*$/m.exec(khoi)?.[1] ?? '';
  };

  it('`MINIO_GOC` khai đúng một bản có ghim, và thẻ nhân bản mang ĐÚNG bản ấy', () => {
    expect(GOC).toMatch(/^minio\/minio:RELEASE\.\d{4}-\d{2}-\d{2}T[\d-]+Z$/);
    expect(SH).toMatch(/^MINIO_BAN="\$\{IMG\}:minio-\$\{MINIO_GOC##\*:\}"$/m);
  });

  // Từ `0248` mọi tham chiếu mang thêm `@sha256:…` — so phần thẻ, digest do `ghim-anh.test.ts` canh.
  const boDigest = (r: string) => r.split('@')[0];

  it('`compose.yml` dùng ĐÚNG ảnh gốc ấy (máy dev còn ảnh)', () => {
    expect(boDigest(anhCua('deploy/compose.yml'))).toBe(GOC);
  });

  it('`compose.prod.yml` dùng bản NHÂN BẢN của đúng bản ấy — không bao giờ `minio/minio`', () => {
    // `0270`: máy khách chạy `minio-latest`; `day_minio` gắn nó lên ĐÚNG bản nhân bản ấy.
    expect(anhCua('deploy/compose.prod.yml')).toBe('${CSBH_IMAGE:?thiếu CSBH_IMAGE}:minio-latest');
    const dm = /\nday_minio\(\) \{([\s\S]*?)\n\}/.exec(SH)?.[1] ?? '';
    expect(dm).toContain('docker tag "$MINIO_BAN" "${IMG}:minio-latest"');
    expect(dm.indexOf('docker push "$MINIO_BAN"'), 'đẩy latest trước thẻ bản').toBeLessThan(dm.indexOf('docker push "${IMG}:minio-latest"'));
  });

  it('`anh` gắn thẻ nhân bản TỪ ảnh gốc; `day` đẩy MinIO TRƯỚC ảnh phần mềm', () => {
    const anh = /\nanh\(\) \{([\s\S]*?)\n\}/.exec(SH)?.[1] ?? '';
    expect(anh).toContain('docker tag "$MINIO_GOC" "$MINIO_BAN"');
    const day = /\nday\(\) \{([\s\S]*?)\n\}/.exec(SH)?.[1] ?? '';
    const lenh = day.split('\n').map((d) => d.trim()).filter((d) => d && !d.startsWith('#'));
    expect(lenh[0]).toBe('day_minio');
    expect(/\nday_minio\(\) \{([\s\S]*?)\n\}/.exec(SH)?.[1]).toContain('docker push "$MINIO_BAN"');
  });

  it('`make day-minio` đẩy RIÊNG MinIO — không kéo theo ảnh phần mềm nào', () => {
    expect(readFileSync('Makefile', 'utf8')).toMatch(/^day-minio:\n\tsh scripts\/dong-goi\.sh day-minio$/m);
    expect(SH).toMatch(/^ {2}day-minio\) day_minio ;;$/m);
  });

  it('AGPL: chỉ ra mã nguồn của ĐÚNG bản phân phối lại', () => {
    expect(SH).toContain(`https://github.com/minio/minio/tree/${BAN}`);
  });
});
