/**
 * `0250` — bản chụp kho tệp bằng liên kết cứng, giữ tối đa N bản.
 *
 * Chạy CHÍNH đoạn `CHUP_KHO_TEP` trích từ `scripts/csbh` (đoạn ấy chạy trong
 * container MinIO trên máy thật), với một `mc` giả: `mc mirror --remove l <đích>`
 * làm `<đích>` khớp thư mục `$NGUON` — thêm tệp thiếu, GỠ tệp thừa, KHÔNG ghi đè tệp
 * đã có (đúng hành vi khi thiếu `--overwrite`). Ca nào hỏi về liên kết cứng thì hỏi
 * thẳng số liên kết (`nlink`), không suy từ cỡ thư mục.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, symlinkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSBH = readFileSync('scripts/csbh', 'utf8');
const CHUP = (() => {
  const m = CSBH.match(/^CHUP_KHO_TEP='\n([\s\S]*?)\n'$/m);
  if (!m) throw new Error('không tìm thấy CHUP_KHO_TEP trong scripts/csbh');
  return m[1]!;
})();

const MC_GIA = `#!/bin/sh
# Hai lệnh của mc thật mà đoạn chụp dùng:
#   mc ls l                                  → mỗi bucket một dòng "[…]  0B <tên>/"
#   mc mirror [--remove] --quiet l/<bucket> <đích>
PATH="$PATH_THAT"
echo "$*" >> "$NHAT_KY"
case "$1" in
  ls)
    for d in "$NGUON"/*/; do [ -d "$d" ] || continue; b=\${d%/}; echo "[2026-11-06 00:00:00 UTC]     0B \${b##*/}/"; done
    exit 0 ;;
  mirror) ;;
  *) exit 9 ;;
esac
case " $* " in *" --overwrite "*) echo "mc giả: KHÔNG được dùng --overwrite trên bản chụp liên kết cứng" >&2; exit 7 ;; esac
for a in "$@"; do nguonArg="$dich"; dich="$a"; done
# mc thật (ảnh ghim) HỎNG ở lượt thứ hai khi mirror từ GỐC kho sang thư mục — đo 06/11.
[ "$nguonArg" = l ] && { echo "mc giả: mirror từ gốc 'l' hỏng ở lượt hai trên mc thật" >&2; exit 8; }
src="$NGUON/\${nguonArg#l/}"
mkdir -p "$dich"
( cd "$src" && find . -type f ) | while read -r f; do
  [ -e "$dich/$f" ] || { mkdir -p "$(dirname "$dich/$f")"; cp "$src/$f" "$dich/$f"; }
done
case " $* " in *" --remove "*)
  ( cd "$dich" && find . -type f ) | while read -r f; do [ -e "$src/$f" ] || rm -f "$dich/$f"; done ;;
esac
`;

type Kq = { ma: number; ra: string };

/**
 * Lệnh có trong ảnh MinIO thật — đo 06/11 bằng `command -v` trong chính ảnh ghim ở
 * `deploy/compose.yml`. Ảnh ấy KHÔNG có `grep` · `sed` · `awk` · `find`: bản đầu
 * của đoạn chụp dùng `grep`, xanh ở đây (container kiểm có đủ), và trên MinIO thật
 * thì không tìm được bản trước (mỗi lượt chép trọn kho) và không bao giờ dọn. Nên
 * đoạn chụp chạy với PATH CHỈ gồm những lệnh này (`sh` gọi thẳng, không qua PATH).
 */
const LENH_ANH_MINIO = ['sort', 'head', 'tail', 'ls', 'cp', 'mv', 'rm', 'mkdir', 'basename', 'cat', 'chmod'];

function moiTruong() {
  const d = mkdtempSync(join(tmpdir(), 'chup-'));
  const bin = join(d, 'bin');
  mkdirSync(bin);
  for (const l of LENH_ANH_MINIO) {
    const that = execFileSync('sh', ['-c', `command -v ${l}`], { encoding: 'utf8' }).trim();
    symlinkSync(that, join(bin, l));
  }
  writeFileSync(join(bin, 'mc'), MC_GIA);
  chmodSync(join(bin, 'mc'), 0o755);
  const nguon = join(d, 'minio');
  const goc = join(d, 'backup', 'kho-tep');
  const cu = join(d, 'backup', 'tep');
  const nhatKy = join(d, 'mc.log');
  writeFileSync(nhatKy, '');
  const dat = (bucket: string, khoa: string, noiDung: string) => {
    mkdirSync(dirname(join(nguon, bucket, khoa)), { recursive: true });
    writeFileSync(join(nguon, bucket, khoa), noiDung);
  };
  const xoa = (bucket: string, khoa: string) => rmSync(join(nguon, bucket, khoa));
  const chup = (moc: string, giu = 7): Kq => {
    try {
      const ra = execFileSync('/bin/sh', ['-c', `GOC=${goc} CU=${cu} GIU=${giu} MOC=${moc}; ${CHUP}`], {
        env: { ...process.env, PATH: bin, PATH_THAT: process.env.PATH, NGUON: nguon, NHAT_KY: nhatKy },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { ma: 0, ra };
    } catch (e) {
      const x = e as { status?: number; stdout?: string; stderr?: string };
      return { ma: x.status ?? 1, ra: `${x.stdout ?? ''}${x.stderr ?? ''}` };
    }
  };
  const ban = () => (existsSync(goc) ? readdirSync(goc).sort() : []);
  const tep = (moc: string, bucket: string, khoa: string) => join(goc, moc, 'tep', bucket, khoa);
  return { d, nguon, goc, cu, dat, xoa, chup, ban, tep, nhatKy };
}

describe('`0250` bản chụp kho tệp', () => {
  it('bản đầu tiên chép đủ mọi bucket vào <mốc>/tep/', () => {
    const m = moiTruong();
    m.dat('csbh', 'a.pdf', 'A');
    m.dat('csbh', 'b/c.png', 'C');
    m.dat('khac', 'd.docx', 'D');
    expect(m.chup('20261101T020000Z').ma).toBe(0);
    expect(m.ban()).toEqual(['20261101T020000Z']);
    expect(readFileSync(m.tep('20261101T020000Z', 'csbh', 'b/c.png'), 'utf8')).toBe('C');
    expect(readFileSync(m.tep('20261101T020000Z', 'khac', 'd.docx'), 'utf8')).toBe('D');
  });

  it('tệp KHÔNG ĐỔI giữa hai bản dùng chung một inode — không tốn thêm chỗ', () => {
    const m = moiTruong();
    m.dat('csbh', 'a.pdf', 'A');
    m.chup('20261101T020000Z');
    m.dat('csbh', 'moi.pdf', 'M');
    m.chup('20261102T020000Z');
    const a1 = statSync(m.tep('20261101T020000Z', 'csbh', 'a.pdf'));
    const a2 = statSync(m.tep('20261102T020000Z', 'csbh', 'a.pdf'));
    expect(a2.ino).toBe(a1.ino);
    expect(a2.nlink).toBe(2);
    expect(statSync(m.tep('20261102T020000Z', 'csbh', 'moi.pdf')).nlink).toBe(1);
    expect(existsSync(m.tep('20261101T020000Z', 'csbh', 'moi.pdf'))).toBe(false);
  });

  it('tệp bị xoá khỏi kho: VẮNG ở bản mới, CÒN ở bản cũ', () => {
    const m = moiTruong();
    m.dat('csbh', 'a.pdf', 'A');
    m.dat('csbh', 'xoa.pdf', 'X');
    m.chup('20261101T020000Z');
    m.xoa('csbh', 'xoa.pdf');
    m.chup('20261102T020000Z');
    expect(existsSync(m.tep('20261102T020000Z', 'csbh', 'xoa.pdf'))).toBe(false);
    expect(readFileSync(m.tep('20261101T020000Z', 'csbh', 'xoa.pdf'), 'utf8')).toBe('X');
  });

  it('KHÔNG BAO GIỜ gọi `mc mirror --overwrite` (sẽ ghi vào inode dùng chung với bản cũ)', () => {
    const m = moiTruong();
    m.dat('csbh', 'a.pdf', 'A');
    m.chup('20261101T020000Z');
    m.chup('20261102T020000Z');
    const goi = readFileSync(m.nhatKy, 'utf8');
    expect(goi).toContain('--remove');
    expect(goi).not.toContain('--overwrite');
  });

  it('chỉ thư mục tep/ được liên kết — tệp ngoài nó (bảng kê) của bản cũ không bị bản mới đụng tới', () => {
    const m = moiTruong();
    m.dat('csbh', 'a.pdf', 'A');
    m.chup('20261101T020000Z');
    writeFileSync(join(m.goc, '20261101T020000Z', 'csdl.txt'), 'bang ke cu');
    m.chup('20261102T020000Z');
    expect(existsSync(join(m.goc, '20261102T020000Z', 'csdl.txt'))).toBe(false);
    // `ban-ke` ghi bằng `>`: nếu tệp ấy là liên kết cứng thì bản cũ bị cắt cụt.
    writeFileSync(join(m.goc, '20261102T020000Z', 'csdl.txt'), 'bang ke moi');
    expect(readFileSync(join(m.goc, '20261101T020000Z', 'csdl.txt'), 'utf8')).toBe('bang ke cu');
  });

  it('giữ tối đa N: bản thứ N+1 xoá bản CŨ NHẤT; xoá bản cũ không làm hỏng bản mới', () => {
    const m = moiTruong();
    m.dat('csbh', 'a.pdf', 'A');
    for (const n of [1, 2, 3]) m.chup(`2026110${n}T020000Z`, 3);
    const r = m.chup('20261104T020000Z', 3);
    expect(r.ma, r.ra).toBe(0);
    expect(m.ban()).toEqual(['20261102T020000Z', '20261103T020000Z', '20261104T020000Z']);
    expect(r.ra).toContain('xoá 20261101T020000Z');
    // tệp dùng chung vẫn đọc được ở bản mới sau khi bản cũ nhất bị xoá
    expect(readFileSync(m.tep('20261104T020000Z', 'csbh', 'a.pdf'), 'utf8')).toBe('A');
  });

  it('hạ N từ 5 xuống 2: lượt kế tiếp còn đúng 2', () => {
    const m = moiTruong();
    m.dat('csbh', 'a.pdf', 'A');
    for (const n of [1, 2, 3, 4, 5]) m.chup(`2026110${n}T020000Z`, 5);
    expect(m.ban()).toHaveLength(5);
    m.chup('20261106T020000Z', 2);
    expect(m.ban()).toEqual(['20261105T020000Z', '20261106T020000Z']);
  });

  it('lượt chụp HỎNG giữa chừng: không xoá bản nào, không để bản dở dang trông như bản tốt', () => {
    const m = moiTruong();
    m.dat('csbh', 'a.pdf', 'A');
    for (const n of [1, 2, 3]) m.chup(`2026110${n}T020000Z`, 3);
    writeFileSync(join(m.d, 'bin', 'mc'), '#!/bin/sh\nexit 5\n');
    const r = m.chup('20261104T020000Z', 2);
    expect(r.ma).not.toBe(0);
    expect(m.ban().filter((b) => /^\d{8}T\d{6}Z$/.test(b))).toEqual([
      '20261101T020000Z',
      '20261102T020000Z',
      '20261103T020000Z',
    ]);
    // lượt kế tiếp thành công dọn luôn phần dở dang của lượt hỏng
    writeFileSync(join(m.d, 'bin', 'mc'), MC_GIA);
    chmodSync(join(m.d, 'bin', 'mc'), 0o755);
    expect(m.chup('20261105T020000Z', 3).ma).toBe(0);
    // 1,2,3 + 5 → giữ 3 bản mới nhất; KHÔNG còn thư mục `.partial` nào
    expect(m.ban()).toEqual(['20261102T020000Z', '20261103T020000Z', '20261105T020000Z']);
  });

  it('mirror THEO TỪNG BUCKET, không bao giờ từ gốc kho', () => {
    const m = moiTruong();
    m.dat('csbh', 'a.pdf', 'A');
    m.dat('khac', 'b.pdf', 'B');
    expect(m.chup('20261101T020000Z').ma).toBe(0);
    expect(m.chup('20261102T020000Z').ma).toBe(0);
    const goi = readFileSync(m.nhatKy, 'utf8').split('\n').filter((d) => d.startsWith('mirror'));
    expect(goi).toHaveLength(4);
    for (const d of goi) expect(d).toMatch(/ l\/(csbh|khac) /);
  });

  it('bucket biến khỏi kho: thư mục của nó vắng ở bản chụp mới, còn ở bản cũ', () => {
    const m = moiTruong();
    m.dat('csbh', 'a.pdf', 'A');
    m.dat('cu', 'b.pdf', 'B');
    m.chup('20261101T020000Z');
    rmSync(join(m.nguon, 'cu'), { recursive: true });
    expect(m.chup('20261102T020000Z').ma).toBe(0);
    expect(existsSync(join(m.goc, '20261102T020000Z', 'tep', 'cu'))).toBe(false);
    expect(existsSync(m.tep('20261101T020000Z', 'cu', 'b.pdf'))).toBe(true);
  });

  it('bucket RỖNG không làm hỏng lượt sau (lỗi đo trên MinIO thật 06/11)', () => {
    const m = moiTruong();
    mkdirSync(join(m.nguon, 'rong'), { recursive: true });
    m.dat('csbh', 'a.pdf', 'A');
    for (const n of [1, 2, 3]) expect(m.chup(`2026110${n}T020000Z`).ma).toBe(0);
  });

  it('máy nâng cấp từ bố cục cũ (<backup>/tep/<bucket>): dùng làm điểm khởi đầu bằng liên kết, nói ra là xoá tay được', () => {
    const m = moiTruong();
    mkdirSync(join(m.cu, 'csbh'), { recursive: true });
    writeFileSync(join(m.cu, 'csbh', 'a.pdf'), 'A');
    m.dat('csbh', 'a.pdf', 'A');
    const r = m.chup('20261101T020000Z');
    expect(r.ma, r.ra).toBe(0);
    expect(r.ra).toContain(`kho cũ ${m.cu}`);
    expect(statSync(m.tep('20261101T020000Z', 'csbh', 'a.pdf')).ino).toBe(statSync(join(m.cu, 'csbh', 'a.pdf')).ino);
    expect(existsSync(join(m.cu, 'csbh', 'a.pdf'))).toBe(true);
  });
});
