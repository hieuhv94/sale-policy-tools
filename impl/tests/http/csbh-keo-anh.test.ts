/**
 * `0235` — `./csbh nang-cap` đi tiếp khi một ảnh BÊN THỨ BA không kéo được mà
 * máy đang giữ sẵn nó; thiếu ảnh thật thì dừng và trả `.env` về thẻ cũ.
 *
 * 29/09 kho `minio/minio` trên Docker Hub trả `pull access denied` (cả thẻ ghim
 * của ta), và `nang-cap` — gọi `$DC pull` trần dưới `set -e` — chết ngay sau bước
 * sao lưu trên hệ thật. `len` đã có đường vòng từ `0107`; giờ cả hai gọi chung
 * `keo_anh`.
 *
 * Chạy CHÍNH `scripts/csbh` với một lệnh `docker` giả đặt đầu `PATH`: giả lập
 * `compose pull` hỏng, `config --images` liệt kê ảnh, `image inspect` trả lời
 * theo danh sách ảnh "có trên máy", và ghi mọi lượt gọi ra một tệp để đọc lại.
 */
import { execFile } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const chay = promisify(execFile);

const ANH = ['minio/minio:RELEASE.2024-09-22T00-33-43Z', 'kho/csbh:ops-1.0.5', 'kho/csbh:service-1.0.5'];

const DOCKER_GIA = `#!/bin/sh
echo "$*" >> "$NHAT_KY"
case "$*" in
  *" pull") exit 1 ;;
  *"config --images"*) printf '%s\\n' ${ANH.join(' ')} ;;
  "image inspect "*)
    for a in $CO_ANH; do [ "$a" = "$3" ] && exit 0; done
    exit 1 ;;
  *) exit 0 ;;
esac
`;

/** Dựng một thư mục cài đặt giả, chạy `./csbh nang-cap 1.0.5`, trả kết quả. */
async function nangCap(coAnh: string[]) {
  const d = mkdtempSync(join(tmpdir(), 'csbh-'));
  copyFileSync('scripts/csbh', join(d, 'csbh'));
  chmodSync(join(d, 'csbh'), 0o755);
  writeFileSync(join(d, '.env'), 'COMPOSE_PROJECT_NAME=csbh-prod\nCSBH_TAG=1.0.4\n');
  writeFileSync(join(d, 'docker'), DOCKER_GIA);
  chmodSync(join(d, 'docker'), 0o755);
  const nhatKy = join(d, 'goi.log');
  writeFileSync(nhatKy, '');
  const env = { ...process.env, PATH: `${d}:${process.env.PATH}`, NHAT_KY: nhatKy, CO_ANH: coAnh.join(' ') };
  let ma = 0;
  let loi = '';
  try {
    await chay('sh', [join(d, 'csbh'), 'nang-cap', '1.0.5'], { env });
  } catch (e) {
    ma = (e as { code?: number }).code ?? 1;
    loi = String((e as { stderr?: string }).stderr ?? '');
  }
  return {
    ma,
    loi,
    goi: readFileSync(nhatKy, 'utf8'),
    the: /^CSBH_TAG=(.*)$/m.exec(readFileSync(join(d, '.env'), 'utf8'))![1],
  };
}

describe('`0235` nang-cap chịu được ảnh bên thứ ba không kéo được', () => {
  it('kéo hỏng nhưng ĐỦ ảnh trên máy → sao lưu, migrate, dựng lại, thẻ mới', async () => {
    const r = await nangCap(ANH);
    expect(r.ma, r.loi).toBe(0);
    expect(r.the).toBe('1.0.5');
    const thuTu = ['ops backup', ' pull', 'ops migrate', 'up -d --wait'].map((k) => r.goi.indexOf(k));
    expect(thuTu.every((i) => i >= 0), r.goi).toBe(true);
    expect([...thuTu].sort((a, b) => a - b)).toEqual(thuTu);
  });

  it('THIẾU ảnh thật → dừng trước migrate, `.env` trả về thẻ cũ', async () => {
    const r = await nangCap([ANH[0]!, ANH[2]!]);
    expect(r.ma).not.toBe(0);
    expect(r.loi).toContain('kho/csbh:ops-1.0.5');
    expect(r.the).toBe('1.0.4');
    expect(r.goi).not.toContain('ops migrate');
    expect(r.goi).not.toContain('up -d');
  });

  it('không lệnh con nào của `csbh` gọi `$DC pull` trần ngoài `keo_anh`', () => {
    const ma = readFileSync('scripts/csbh', 'utf8')
      .split('\n')
      .filter((d) => !/^\s*#/.test(d));
    const tran = ma.filter((d) => /\$DC pull\b/.test(d));
    expect(tran.map((d) => d.trim())).toEqual(['$DC pull && return 0']);
  });
});
