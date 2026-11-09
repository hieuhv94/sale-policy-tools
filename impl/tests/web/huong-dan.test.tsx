/**
 * @vitest-environment jsdom
 *
 * `0273` — trang *Hướng dẫn*.
 *
 * Ba thứ cần canh, và không thứ nào làm màn hình đỏ khi sai: (1) mỗi người chỉ
 * thấy hướng dẫn của ĐÚNG vai trò mình — lẫn sang vai trò khác là bày cho TDV
 * thao tác mà họ không có nút; (2) mọi ảnh nội dung nhắc tới phải có thật — ảnh
 * vắng thì trang vẫn dựng được, chỉ thiếu hình; (3) mọi trang hướng dẫn dẫn tới
 * một đường dẫn có thật của vai trò ấy.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { DIEU_HUONG, VAI_TRO, dieuHuongCho, xem, type VaiTro } from '@csbh/web/can';
import { HuongDan, MotTrang } from '@csbh/web/huong-dan-ui';
import {
  HUONG_DAN_CHUNG,
  HUONG_DAN_THEO_VAI_TRO,
  huongDanCua,
  moiAnh,
} from '@csbh/web/huong-dan';

let vaiTro: VaiTro = 'TDV';
vi.mock('@csbh/web/auth', async (goc) => ({
  ...(await goc<Record<string, unknown>>()),
  usePhien: () => ({ nguoiDung: { id: 'u1', fullName: 'Người Thử', role: vaiTro } }),
}));

const doc = (p: string) => readFileSync(`apps/web/src/${p}`, 'utf8');

beforeEach(() => {
  vaiTro = 'TDV';
});
afterEach(cleanup);

describe('`0273` bảng nội dung phủ đủ sáu vai trò', () => {
  it('mỗi vai trò có đủ phần, và mỗi trang có tên + mục đích', () => {
    expect(Object.keys(HUONG_DAN_THEO_VAI_TRO).sort()).toEqual([...VAI_TRO].sort());
    for (const v of VAI_TRO) {
      const h = HUONG_DAN_THEO_VAI_TRO[v];
      expect(h.lamGi.length, `${v}: thiếu mục "làm gì"`).toBeGreaterThan(0);
      expect(h.khongLam.length, `${v}: thiếu mục "không làm"`).toBeGreaterThan(0);
      expect(h.ngayLamViec.length, `${v}: thiếu ngày làm việc`).toBeGreaterThan(0);
      expect(h.trang.length, `${v}: không trang nào`).toBeGreaterThan(0);
      const ids = h.trang.map((t) => t.id);
      expect(new Set(ids).size, `${v}: trùng id trang`).toBe(ids.length);
      for (const t of h.trang) {
        expect(t.ten, `${v}`).not.toBe('');
        expect(t.mucDich, `${v}/${t.id}`).not.toBe('');
        // `chiTiet: true` mà không có bước nào là lời hứa suông.
        if (t.chiTiet) expect(t.buoc?.length ?? 0, `${v}/${t.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('vai trò lạ không có hướng dẫn riêng, không nổ', () => {
    expect(huongDanCua('KHONG_CO')).toBeNull();
    expect(huongDanCua(undefined)).toBeNull();
  });

  it('mọi liên kết "Mở trang này" dẫn tới một mục menu mà CHÍNH vai trò ấy thấy', () => {
    /*
     * Hướng dẫn nói "bấm Mở trang này" mà vai trò đó bị chặn ở trang ấy là một
     * nút dẫn tới `Không có quyền`. Đối chiếu với menu của vai trò, không với
     * danh sách đường dẫn chung.
     */
    for (const v of VAI_TRO) {
      const thay = dieuHuongCho(v).map((m) => m.duong);
      for (const t of HUONG_DAN_THEO_VAI_TRO[v].trang) {
        if (t.duong) expect(thay, `${v}/${t.id} → ${t.duong}`).toContain(t.duong);
      }
    }
  });

  it('Quản trị không có hướng dẫn nào về hồ sơ — họ không vào được trang hồ sơ', () => {
    // `0133`: Quản trị đứng ngoài luồng duyệt. Một bước "mở hồ sơ" trong hướng dẫn
    // của họ là chỉ đường tới một trang 403.
    expect(xem('QUAN_TRI', 'hoSo')).toBe(false);
    const duong = HUONG_DAN_THEO_VAI_TRO.QUAN_TRI.trang.map((t) => t.duong);
    expect(duong).not.toContain('/ho-so');
  });
});

describe('`0273` ảnh minh hoạ', () => {
  it('mọi ảnh được nhắc tới có thật trong public/huong-dan, và không ảnh nào bị nhắc hai lần', () => {
    const ds = moiAnh();
    expect(ds.length, 'chưa có ảnh nào').toBeGreaterThan(0);
    expect(new Set(ds).size, 'một ảnh dùng hai lần').toBe(ds.length);
    for (const tep of ds) {
      expect(existsSync(`apps/web/public/huong-dan/${tep}`), `thiếu ảnh ${tep}`).toBe(true);
    }
  });

  it('không có ảnh mồ côi: mọi tệp trong public/huong-dan đều được một bước nhắc tới', () => {
    // Chiều ngược của ca trên. Ảnh mồ côi vẫn được đóng gói và phát cho mọi người dùng
    // (cả ảnh chụp từ demo), mà không màn hình nào dùng tới.
    const dung = new Set(moiAnh());
    const co: string[] = [];
    for (const thuMuc of readdirSync('apps/web/public/huong-dan')) {
      for (const tep of readdirSync(`apps/web/public/huong-dan/${thuMuc}`)) co.push(`${thuMuc}/${tep}`);
    }
    expect(co.filter((t) => !dung.has(t))).toEqual([]);
  });

  it('mọi ảnh có chú thích — vừa là alt, vừa là dòng chữ dưới ảnh', () => {
    for (const h of Object.values(HUONG_DAN_THEO_VAI_TRO)) {
      for (const t of h.trang) {
        for (const b of t.buoc ?? []) if (b.anh) expect(b.anh.chuThich.trim().length).toBeGreaterThan(10);
      }
    }
  });
});

describe('`0273` màn hình: mỗi người CHỈ thấy hướng dẫn của vai trò mình', () => {
  it.each(VAI_TRO)('%s thấy tiêu đề vai trò mình và phần chung, không thấy vai trò khác', (v) => {
    vaiTro = v;
    render(<HuongDan />);
    const mine = HUONG_DAN_THEO_VAI_TRO[v];
    expect(screen.getByRole('heading', { level: 2, name: mine.tieuDe })).toBeTruthy();
    for (const k of VAI_TRO.filter((x) => x !== v)) {
      expect(
        screen.queryByRole('heading', { name: HUONG_DAN_THEO_VAI_TRO[k].tieuDe }),
        `${v} thấy hướng dẫn của ${k}`,
      ).toBeNull();
    }
    for (const m of HUONG_DAN_CHUNG) {
      expect(screen.getByRole('heading', { level: 3, name: m.ten })).toBeTruthy();
    }
  });

  it('mỗi trang của vai trò có một khối riêng và mục lục trỏ đúng vào nó', () => {
    vaiTro = 'TDV';
    const { container } = render(<HuongDan />);
    const mucLuc = within(screen.getByRole('navigation', { name: 'Mục lục hướng dẫn' }));
    for (const t of HUONG_DAN_THEO_VAI_TRO.TDV.trang) {
      const lien = mucLuc.getByRole('link', { name: t.ten });
      expect(lien.getAttribute('href')).toBe(`#trang-${t.id}`);
      expect(container.querySelector(`#trang-${t.id}`), t.id).not.toBeNull();
    }
  });

  it('trang chưa viết từng bước nói thẳng điều đó, thay vì để một mục trống', () => {
    /*
     * Mọi vai trò hiện đã viết đủ, nên không còn dữ liệu thật nào để dựng ca này — dựng
     * thẳng một trang `chiTiet: false`. Đường vẽ này vẫn cần giữ: vai trò hay trang mới
     * thêm sau sẽ đi qua nó trong lúc chờ biên soạn.
     */
    render(<MotTrang stt={1} t={{ id: 'thu', ten: 'Trang thử', mucDich: 'Mục đích thử', chiTiet: false }} />);
    expect(screen.getByRole('note').textContent).toContain('đang được biên soạn');
  });

  /*
   * Mọi vai trò đã viết đủ từng bước. Thêm một vai trò hay trang mới mà chưa viết xong thì
   * đánh dấu `chiTiet: false` và sửa ca này cho đúng — đừng để nó đỏ rồi xoá ca.
   */
  it.each(VAI_TRO)('%s đã viết đủ từng bước: không trang nào mang ghi chú "đang biên soạn"', (v) => {
    vaiTro = v;
    expect(HUONG_DAN_THEO_VAI_TRO[v].trang.every((t) => t.chiTiet)).toBe(true);
    render(<HuongDan />);
    expect(screen.queryAllByRole('note')).toHaveLength(0);
  });
});

describe('`0273` nối dây', () => {
  it('mọi vai trò thấy Hướng dẫn ở mục CUỐI của menu', () => {
    for (const v of VAI_TRO) {
      expect(xem(v, 'huongDan'), v).toBe(true);
      expect(dieuHuongCho(v).at(-1)?.duong, v).toBe('/huong-dan');
    }
    expect(DIEU_HUONG.filter((m) => m.duong === '/huong-dan')).toHaveLength(1);
  });

  it('trang tải theo nhu cầu: App.tsx nhập bằng lazy, không import tĩnh', () => {
    /*
     * Import tĩnh đẩy nội dung chữ của sáu vai trò vào gói tải ngay và làm vỡ
     * ngân sách `FE-38` (đã đo: 259,6KB trên trần 250KB). Ca đo kích thước ở
     * `bundle.test.ts` cũng bắt, nhưng chậm — ca này đỏ ngay và nói đúng lý do.
     */
    const app = doc('App.tsx');
    expect(app).not.toMatch(/import\s*\{\s*HuongDan\s*\}\s*from/);
    expect(app).toMatch(/lazy\(\(\)\s*=>\s*import\('\.\/pages\/HuongDan\.js'\)/);
  });

  it('kiểu của trang nằm trong tệp riêng, không trong app.css', () => {
    expect(doc('styles/app.css')).not.toContain('.hd-trang');
    expect(doc('styles/huong-dan.css')).toContain('.hd-trang');
    expect(doc('pages/HuongDan.tsx')).toContain("import '../styles/huong-dan.css'");
  });
});
