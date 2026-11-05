/**
 * `0248` — mọi ảnh BÊN NGOÀI được ghim: thẻ phiên bản + digest.
 *
 * Vụ MinIO (`0247`) cho thấy ảnh bên ngoài là thứ ta không kiểm soát. Thẻ trôi
 * (`postgres:16-alpine`, `gotenberg/gotenberg:8`, `cloudflared:latest`) còn tệ theo
 * kiểu lặng lẽ hơn: kéo hôm nay và kéo ba tháng sau ra hai ảnh khác nhau, nên máy cài
 * mới hay máy chuyển tới (`0246`) chạy một bản KHÁC máy cũ mà không ai chủ ý — và
 * Gotenberg đổi một dòng là tờ CSBH in khác đi.
 *
 * Digest là thứ QUYẾT ĐỊNH (docker kéo theo digest, bỏ qua thẻ); thẻ phiên bản đi kèm
 * để người đọc biết đang chạy bản nào. Đã đo trước khi ghim (05/11): mọi digest là của
 * đúng ảnh đã qua bộ kiểm, và vẫn kéo được từ registry.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPOSE = readdirSync('deploy').filter((t) => /^compose.*\.yml$/.test(t)).map((t) => join('deploy', t));
const DOCKERFILE = readdirSync('docker').filter((t) => t.startsWith('Dockerfile')).map((t) => join('docker', t));

/** Mọi tham chiếu ảnh BÊN NGOÀI: `image:` trong compose, `FROM` trong Dockerfile. */
function thamChieu(): { tep: string; ref: string }[] {
  const ra: { tep: string; ref: string }[] = [];
  for (const tep of COMPOSE) {
    for (const m of readFileSync(tep, 'utf8').matchAll(/^\s+image:\s*(.+?)\s*$/gm)) {
      if (m[1]!.startsWith('${CSBH_IMAGE')) continue; // ảnh của ta — thẻ số phiên bản
      ra.push({ tep, ref: m[1]! });
    }
  }
  for (const tep of DOCKERFILE) {
    for (const m of readFileSync(tep, 'utf8').matchAll(/^FROM\s+(\S+)/gm)) {
      if (m[1]!.startsWith('${')) continue; // `FROM ${BASE}` — ảnh service của ta
      ra.push({ tep, ref: m[1]! });
    }
  }
  return ra;
}

const kho = (ref: string) => ref.split('@')[0]!.replace(/:[^/:]+$/, '');

describe('`0248` ghim ảnh bên ngoài', () => {
  const ds = thamChieu();

  it('quét được đủ ảnh — không lặng lẽ thành rỗng', () => {
    const cacKho = new Set(ds.map((x) => kho(x.ref)));
    for (const k of ['postgres', 'redis', 'rabbitmq', 'gotenberg/gotenberg', 'axllent/mailpit', 'caddy', 'node', 'cloudflare/cloudflared', 'minio/minio']) {
      expect(cacKho.has(k), k).toBe(true);
    }
  });

  it('MỌI ảnh ngoài mang thẻ PHIÊN BẢN + digest sha256', () => {
    const sai = ds.filter((x) => !/^[a-z0-9./-]+:[A-Za-z0-9._-]+@sha256:[0-9a-f]{64}$/.test(x.ref));
    expect(sai.map((x) => `${x.tep}: ${x.ref}`)).toEqual([]);
  });

  it('không `latest`, không thẻ chỉ có số MAJOR (thẻ trôi)', () => {
    const troi = ds.filter((x) => {
      const the = x.ref.split('@')[0]!.split(':').pop()!;
      // KHÔNG cấm `MAJOR.MINOR`: Postgres đánh số hai phần, `16.15` LÀ bản đầy đủ — bản đầu
      // của ca này bắt nhầm đúng chỗ ấy. Digest là thứ ghim; thẻ chỉ phải nói được bản nào.
      return the === 'latest' || /^v?\d+(-[a-z]+)?$/.test(the);
    });
    expect(troi.map((x) => `${x.tep}: ${x.ref}`)).toEqual([]);
  });

  it('cùng một kho thì MỌI chỗ dùng cùng một tham chiếu (compose lẫn Dockerfile)', () => {
    const theoKho = new Map<string, Set<string>>();
    for (const x of ds) theoKho.set(kho(x.ref), (theoKho.get(kho(x.ref)) ?? new Set()).add(x.ref));
    const lech = [...theoKho].filter(([, s]) => s.size > 1).map(([k, s]) => `${k}: ${[...s].join(' | ')}`);
    expect(lech).toEqual([]);
  });

  it('ảnh MinIO nhân bản của production cũng ghim digest', () => {
    const prod = readFileSync('deploy/compose.prod.yml', 'utf8');
    expect(prod).toMatch(/^\s+image: \$\{CSBH_IMAGE:\?thiếu CSBH_IMAGE\}:minio-RELEASE\.[\dT-]+Z@sha256:[0-9a-f]{64}$/m);
  });
});
