/**
 * `0234` — mọi lệnh Postgres mà script vận hành gọi phải CÓ trong ảnh `ops`.
 *
 * `0105` chuyển sao lưu từ ảnh `postgres:16-alpine` sang ảnh `ops` (dựng từ ảnh
 * service) và chỉ cài `postgresql16-client`. Alpine xếp `pg_archivecleanup` vào
 * gói MÁY CHỦ, nên từ đó mọi lượt `basebackup.sh` chết ở dòng dọn WAL — SAU khi
 * bản nền đã ghi xong. Không gì đỏ suốt từ `0105`: bộ kiểm chỉ chạy `backup.sh`
 * (pg_dump), không chạy `basebackup.sh`, và ảnh `ops` chỉ dựng lúc đóng gói. Lộ
 * ra ở lượt `./csbh nang-cap` thật đầu tiên, vì lệnh ấy sao lưu TRƯỚC.
 *
 * Ca này không dựng ảnh và không chạy docker. Nó nối HAI thế giới bằng một bảng
 * tra: lệnh nào script gọi (đọc `scripts/*.sh` + `ops-entrypoint.sh`) → gói
 * Alpine nào cung cấp nó → gói ấy có trong dòng `apk add` của `Dockerfile.ops`.
 * Bảng tra đo trên Alpine thật (`apk search -x cmd:<lệnh>`), 29/09.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Lệnh → gói Alpine cung cấp nó. Chỉ lệnh CÓ trong bảng mới được đối chiếu. */
const GOI_CUA: Record<string, string> = {
  psql: 'postgresql16-client',
  pg_dump: 'postgresql16-client',
  pg_dumpall: 'postgresql16-client',
  pg_restore: 'postgresql16-client',
  pg_basebackup: 'postgresql16-client',
  pg_isready: 'postgresql16-client',
  pg_archivecleanup: 'postgresql16',
  pg_ctl: 'postgresql16',
  pg_waldump: 'postgresql16',
  pg_resetwal: 'postgresql16',
  pg_controldata: 'postgresql16',
  pg_rewind: 'postgresql16',
  initdb: 'postgresql16',
};

const SCRIPT = [
  ...readdirSync('scripts')
    .filter((f) => f.endsWith('.sh'))
    .map((f) => `scripts/${f}`),
  'docker/ops-entrypoint.sh',
];

/** Dòng chú thích shell bỏ đi — nhắc tên một lệnh không phải là gọi nó. */
const maLenh = (p: string) =>
  readFileSync(p, 'utf8')
    .split('\n')
    .filter((d) => !/^\s*#/.test(d))
    .join('\n');

const lenhDuocGoi = () => {
  const tat = new Set<string>();
  for (const p of SCRIPT) {
    for (const m of maLenh(p).matchAll(/\b(psql|initdb|pg_[a-z]+)\b/g)) {
      if (GOI_CUA[m[1]!]) tat.add(m[1]!);
    }
  }
  return tat;
};

/** Các gói trong MỌI dòng `apk add` của `Dockerfile.ops`. */
const goiDaCai = () => {
  const df = readFileSync('docker/Dockerfile.ops', 'utf8');
  const goi = new Set<string>();
  for (const m of df.matchAll(/apk add([^\n]*)/g)) {
    for (const t of m[1]!.trim().split(/\s+/)) if (!t.startsWith('-')) goi.add(t);
  }
  return goi;
};

describe('`0234` ảnh ops có đủ lệnh Postgres mà script vận hành gọi', () => {
  it('mỗi lệnh `pg_*` được gọi đều có gói cung cấp nó trong `Dockerfile.ops`', () => {
    const goi = goiDaCai();
    const thieu = [...lenhDuocGoi()].filter((l) => !goi.has(GOI_CUA[l]!));
    expect(thieu, `thiếu gói cho: ${thieu.map((l) => `${l} (${GOI_CUA[l]})`).join(', ')}`).toEqual([]);
  });

  it('phép quét THẬT SỰ tìm thấy lệnh — kể cả `pg_archivecleanup` của `basebackup.sh`', () => {
    // Biểu thức lạc hậu thì tập rỗng và ca trên xanh vô nghĩa (bài học `0105`).
    const l = lenhDuocGoi();
    for (const c of ['psql', 'pg_dump', 'pg_restore', 'pg_basebackup', 'pg_archivecleanup']) {
      expect(l.has(c), c).toBe(true);
    }
  });
});
