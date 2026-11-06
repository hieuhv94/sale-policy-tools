/**
 * @vitest-environment jsdom
 *
 * `0088` — BẢNG TRA LỖI và ba dạng hiển thị.
 *
 * Ca quan trọng nhất ở đây không kiểm một câu chữ nào: nó **quét mã nguồn máy
 * chủ** và đòi mọi `code:` ném ra phải có mặt trong bảng tra. Đó là thứ giữ cho
 * lượt thêm mã lỗi lần sau không lặng lẽ rơi về *"Yêu cầu không hợp lệ."* —
 * đúng cái đã xảy ra với 35 mã trước `0088`, và không ca kiểm nào bắt được vì
 * mỗi mã ấy vẫn "hiện ra một câu gì đó".
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoiApi } from '@csbh/web/api';
import { BANG_LOI, docLoi, NHAN_TRUONG } from '@csbh/web/loi';
import { BaoLoiProvider, useBaoLoi } from '@csbh/web/bao-loi';
import { BaoLoi } from '@csbh/web/chung';

afterEach(cleanup);

function moiTep(thuMuc: string, duoi: string[]): string[] {
  const ra: string[] = [];
  for (const t of readdirSync(thuMuc)) {
    const d = join(thuMuc, t);
    if (statSync(d).isDirectory()) ra.push(...moiTep(d, duoi));
    else if (duoi.some((x) => d.endsWith(x))) ra.push(d);
  }
  return ra;
}

/** Mọi mã lỗi máy chủ ném ra, quét thẳng từ mã nguồn. */
function maMayChu(): Set<string> {
  const ra = new Set<string>();
  for (const goc of ['services', 'packages']) {
    for (const tep of moiTep(goc, ['.ts'])) {
      if (tep.includes('/node_modules/') || tep.endsWith('.test.ts')) continue;
      for (const m of readFileSync(tep, 'utf8').matchAll(/code: '([A-Z0-9_]+)'/g)) {
        ra.add(m[1]!);
      }
    }
  }
  return ra;
}

/** Mã chỉ giao diện sinh ra — không có ở máy chủ, và đó là đúng. */
const CUA_GIAO_DIEN = ['MAT_KET_NOI', 'KHONG_CO_TRINH_DUYET', 'PHIEN_HET_HAN'];

describe('`0088` bảng tra phủ hết mã lỗi của máy chủ', () => {
  it('KHÔNG mã nào của máy chủ thiếu trong bảng tra', () => {
    const thieu = [...maMayChu()].filter((m) => !(m in BANG_LOI)).sort();
    /*
     * Đỏ ở đây nghĩa là: vừa thêm một mã lỗi ở máy chủ mà quên khai câu chữ cho
     * nó. Cách chữa KHÔNG phải nới ca kiểm — mà thêm một dòng vào `BANG_LOI`,
     * kèm dạng hiển thị. Mã nội bộ không dành cho người dùng thì khai `im`.
     */
    expect(thieu, `mã lỗi chưa có câu trong BANG_LOI: ${thieu.join(', ')}`).toEqual([]);
  });

  it('bảng tra không giữ mã đã biến mất khỏi máy chủ', () => {
    const co = maMayChu();
    const thua = Object.keys(BANG_LOI)
      .filter((m) => !co.has(m) && !CUA_GIAO_DIEN.includes(m))
      .sort();
    // Chiều ngược lại, và nó không thừa: một mã đã gỡ khỏi máy chủ mà còn nằm
    // đây là một câu chữ không ai đọc được nữa, nhưng vẫn phải duyệt mỗi lần rà
    // lại bảng — y như `TBP_DA_KY_SO` từng sống sót ở bốn chỗ sau khi bị gỡ.
    expect(thua, `mã trong BANG_LOI không còn ở máy chủ: ${thua.join(', ')}`).toEqual([]);
  });

  it('mọi mục đều khai một dạng hợp lệ, và câu không rỗng', () => {
    for (const [ma, m] of Object.entries(BANG_LOI)) {
      expect(['hop-thoai', 'thanh-noi', 'o-nhap', 'trang', 'im'], ma).toContain(m.dang);
      // `im` thì không cần câu. Mọi dạng còn lại phải nói được một câu — bằng
      // câu của chính bảng, bằng câu máy chủ, hoặc dựng từ thân lỗi.
      if (m.dang !== 'im') {
        expect(
          Boolean(m.cau) || m.tuMayChu === true || m.tuThan === true,
          `${ma} không có nguồn câu chữ nào`,
        ).toBe(true);
      }
    }
  });
});

describe('`0088` câu chữ thay cho bảy câu mặc định', () => {
  const loi = (ma: string, st = 400, cauMayChu = '', than: Record<string, unknown> = {}) =>
    new LoiApi(st, ma, cauMayChu, than, 'tr-1');

  it('sai mật khẩu KHÔNG còn là "Yêu cầu không hợp lệ"', () => {
    const d = docLoi(loi('INVALID_CREDENTIALS', 401));
    expect(d.cau).toBe('Tên đăng nhập hoặc mật khẩu không đúng.');
    // Và nó thuộc về một Ô, không phải một hộp thoại chen giữa hai lần gõ.
    expect(d.dang).toBe('o-nhap');
  });

  it('mười bốn mã 404 khác nhau cho ra mười bốn câu khác nhau', () => {
    const ma = [
      'POLICY_NOT_FOUND',
      'CUSTOMER_NOT_FOUND',
      'USER_NOT_FOUND',
      'PRODUCT_NOT_FOUND',
      'GROUP_NOT_FOUND',
      'RULE_NOT_FOUND',
      'TEMPLATE_NOT_FOUND',
      'DOCUMENT_NOT_FOUND',
      'FILE_NOT_FOUND',
      'LINE_NOT_FOUND',
      'ATTACHMENT_NOT_FOUND',
      'EXPORT_NOT_FOUND',
      'SUCCESSOR_NOT_FOUND',
      'PRICE_NOT_SET',
    ];
    const cau = ma.map((m) => docLoi(loi(m, 404)).cau);
    expect(new Set(cau).size, `còn câu trùng nhau: ${cau.join(' | ')}`).toBe(ma.length);
    // Không câu nào còn là câu mặc định cũ.
    for (const c of cau) expect(c).not.toContain('Không tìm thấy dữ liệu');
  });

  it('file Excel đang dựng không còn nói là "không tìm thấy"', () => {
    const d = docLoi(loi('EXPORT_NOT_READY', 404));
    expect(d.cau).toContain('đang được dựng');
    // Không mất gì, không phải quyết định gì — thanh nổi, không phải hộp thoại.
    expect(d.dang).toBe('thanh-noi');
  });

  it('mã khách hàng trùng không còn nói là "người khác vừa thay đổi"', () => {
    const d = docLoi(loi('CUSTOMER_CODE_DUPLICATE', 409));
    expect(d.cau).toBe('Mã khách hàng này đã có trong hệ thống. Dùng mã khác.');
    expect(d.truong).toBe('customerCode');
  });

  it('câu của BẢNG TRA thắng câu mặc định, câu của MÁY CHỦ thắng bảng tra khi mã khai `tuMayChu`', () => {
    // `tuMayChu` dành cho câu mang số liệu của chính lần gọi ấy — chép một câu
    // tĩnh vào bảng là mất đúng phần nói lên sự việc.
    const d = docLoi(loi('IMPORT_FAILED', 400, 'Dòng 12: thiếu cột Giá bán. Không dòng nào được ghi.'));
    expect(d.cau).toBe('Dòng 12: thiếu cột Giá bán. Không dòng nào được ghi.');
  });
});

describe('`0088` ba câu không dấu dựng lại bằng tên tiếng Việt', () => {
  it('INVALID_TRANSITION nói tên trạng thái, không nói mã', () => {
    const d = docLoi(
      new LoiApi(409, 'INVALID_TRANSITION', 'Khong the thuc hien "TBP_SIGN" khi ho so dang o "CHO_KT_L1"', {
        status: 'CHO_KT_L1',
        allowed: ['KT_RECEIVE_L1', 'KT_RETURN_L1'],
      }),
    );
    expect(d.cau).toContain('Chờ KT duyệt L1');
    expect(d.cau).toContain('Kế toán tiếp nhận lần 1');
    // Không còn chữ không dấu lẫn mã máy nào lọt ra màn hình.
    expect(d.cau).not.toContain('TBP_SIGN');
    expect(d.cau).not.toContain('CHO_KT_L1');
    expect(d.cau).not.toContain('Khong the');
  });

  it('thiếu `status` thì lùi về câu tĩnh, KHÔNG lùi về câu không dấu', () => {
    // Máy chủ cũ hoặc một đường ném khác không kèm `status`. Lùi về câu máy chủ
    // ở đây là đưa lại đúng câu không dấu vừa đi chữa.
    const d = docLoi(new LoiApi(409, 'INVALID_TRANSITION', 'Khong the thuc hien "TBP_SIGN"', {}));
    expect(d.cau).not.toContain('Khong the');
    expect(d.cau).toContain('Hồ sơ đã sang bước khác');
  });

  it('POLICY_LOCKED dùng tên trạng thái tiếng Việt', () => {
    const d = docLoi(new LoiApi(409, 'POLICY_LOCKED', 'Ho so dang o CHO_TBP_DUYET', { status: 'CHO_TBP_DUYET' }));
    expect(d.cau).toBe('Hồ sơ đang ở Chờ TBP duyệt nên đã khoá sửa.');
  });
});

describe('`0088` VALIDATION_FAILED không lộ tên trường trong mã', () => {
  it('trường có nhãn thì gọi đúng nhãn trên màn hình', () => {
    const d = docLoi(
      new LoiApi(400, 'VALIDATION_FAILED', 'wholesalePrice: phải là số nguyên không âm', {
        field: 'wholesalePrice',
      }),
    );
    expect(d.cau).toBe('Ô Giá bán buôn chưa hợp lệ.');
    expect(d.cau).not.toContain('wholesalePrice');
    // `0244` đảo vế *"câu gốc xuống dòng phụ để Quản trị gỡ lỗi"* của `0088`:
    // khách hàng bỏ mọi mã khỏi màn hình, và câu gốc mang đúng tên trường trong mã.
    expect(JSON.stringify(d)).not.toContain(': phải là số');
    expect(d.truong).toBe('wholesalePrice');
  });

  it('trường lạ thì KHÔNG đoán tên', () => {
    const d = docLoi(
      new LoiApi(400, 'VALIDATION_FAILED', 'abcXyz: phải là số', { field: 'abcXyz' }),
    );
    expect(d.cau).toBe('Có ô nhập chưa hợp lệ.');
  });

  it('nhãn trường phủ các ô người dùng gõ nhiều nhất', () => {
    for (const t of ['customerCode', 'wholesalePrice', 'debtTerm', 'fullName', 'login']) {
      expect(NHAN_TRUONG[t], t).toBeTruthy();
    }
  });
});

// =============================================================================
// Lớp hiển thị
// =============================================================================

function ManHinhThu({ loi, vaoO }: { loi: unknown; vaoO?: boolean }) {
  const { bao } = useBaoLoi();
  return (
    <div>
      <button
        type="button"
        onClick={() => bao(loi, vaoO ? { vaoO: () => undefined } : undefined)}
      >
        Bấm
      </button>
    </div>
  );
}

const dung = (loi: unknown, vaoO = false) =>
  render(
    <BaoLoiProvider>
      <ManHinhThu loi={loi} vaoO={vaoO} />
    </BaoLoiProvider>,
  );

describe('`0088` dạng hiển thị', () => {
  it('lỗi thao tác dựng HỘP THOẠI chặn màn hình', async () => {
    const nguoi = userEvent.setup();
    dung(new LoiApi(409, 'ALREADY_SIGNED', 'Hồ sơ này đã được ký số rồi', {}, 'tr-9'));
    await nguoi.click(screen.getByRole('button', { name: 'Bấm' }));

    const hop = screen.getByRole('alertdialog');
    expect(hop.textContent).toContain('Hồ sơ này đã được ký số rồi');
    // `0244`: KHÔNG bày mã tra cứu, KHÔNG bày mã lỗi (đảo vế bày của `0088`).
    expect(hop.textContent).not.toContain('tr-9');
    expect(hop.textContent).not.toContain('ALREADY_SIGNED');
    expect(hop.textContent).not.toMatch(/Mã tra cứu/);

    await nguoi.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('lỗi phụ dựng THANH NỔI và tự tắt', () => {
    vi.useFakeTimers();
    const { container } = dung(new LoiApi(404, 'EXPORT_NOT_READY', '', {}));
    act(() => {
      container.querySelector('button')!.click();
    });
    expect(document.querySelector('.thanh-noi')!.textContent).toContain('đang được dựng');
    expect(screen.queryByRole('alertdialog'), 'thanh nổi không được chặn màn hình').toBeNull();

    act(() => {
      vi.advanceTimersByTime(6500);
    });
    expect(document.querySelector('.thanh-noi')).toBeNull();
    vi.useRealTimers();
  });

  it('mã `im` KHÔNG hiện gì cả', async () => {
    const nguoi = userEvent.setup();
    const { container } = dung(new LoiApi(401, 'TOKEN_MISSING', '', {}));
    await nguoi.click(screen.getByRole('button', { name: 'Bấm' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(container.ownerDocument.querySelector('.thanh-noi')).toBeNull();
  });

  it('lỗi của một Ô mà nơi gọi KHÔNG nhận thì vẫn phải hiện', async () => {
    /*
     * Chỗ dễ hỏng thầm nhất của cả cơ chế: một biểu mẫu chưa nối `vaoO` mà lỗi
     * lại thuộc dạng `o-nhap` thì câu ấy rơi vào khoảng không — người dùng bấm
     * Lưu, không có gì xảy ra, và họ bấm tiếp.
     */
    const nguoi = userEvent.setup();
    dung(new LoiApi(409, 'CUSTOMER_CODE_DUPLICATE', '', {}));
    await nguoi.click(screen.getByRole('button', { name: 'Bấm' }));
    expect(screen.getByRole('alertdialog').textContent).toContain('đã có trong hệ thống');
  });

  it('nơi gọi CÓ nhận thì hộp thoại không bật lên', async () => {
    const nguoi = userEvent.setup();
    dung(new LoiApi(409, 'CUSTOMER_CODE_DUPLICATE', '', {}), true);
    await nguoi.click(screen.getByRole('button', { name: 'Bấm' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('mã LẠ vẫn hiện ra — không lọt qua khe nào', async () => {
    /*
     * Máy chủ trả 404 mà không kèm `code` thì `api.ts` tự đặt `HTTP_404`. Cả họ
     * mã suy ra ấy không nằm trong bảng tra, và đó là chủ ý — nhưng chúng phải
     * đi tiếp bằng dạng mặc định chứ không được rơi vào khoảng không.
     */
    const nguoi = userEvent.setup();
    dung(new LoiApi(404, 'HTTP_404', 'Không tìm thấy dữ liệu.', {}));
    await nguoi.click(screen.getByRole('button', { name: 'Bấm' }));
    expect(screen.getByRole('alertdialog').textContent).toContain('Không tìm thấy dữ liệu');
  });

  it('lỗi mạng nói rõ dữ liệu vẫn còn nguyên', async () => {
    const nguoi = userEvent.setup();
    dung(new LoiApi(0, 'MAT_KET_NOI', '', {}));
    await nguoi.click(screen.getByRole('button', { name: 'Bấm' }));
    expect(screen.getByRole('alertdialog').textContent).toContain('vẫn được giữ nguyên');
  });
});

describe('`0104` TEMPLATE_MISSING_REQUIRED nói RÕ thiếu mục nào', () => {
  /*
   * Máy chủ gửi `thieuTruong` từ `0067`, và ca kiểm ở đó ghi *"Nói RÕ thiếu gì,
   * không chỉ nói 'thiếu': Quản trị phải sửa được ngay"*. Nhưng giao diện chưa
   * bao giờ đọc trường ấy — Quản trị đọc được đúng một câu *"còn thiếu mục bắt
   * buộc"* kèm một mã hiệu tài liệu họ không có trong tay.
   */
  it('đổi tên trường trong mã thành nhãn tiếng Việt và kể ra hết', () => {
    const d = docLoi(
      new LoiApi(409, 'TEMPLATE_MISSING_REQUIRED', 'Mẫu hồ sơ CSBH còn thiếu mục bắt buộc.', {
        thieuTruong: ['ho_so.ma_ho_so', 'ho_so.cong_no'],
      }),
    );
    expect(d.cau).toContain('Mã hồ sơ');
    expect(d.cau).toContain('Công nợ');
    // `0088`: không tên trường trong mã, không mã hiệu tài liệu.
    expect(d.cau).not.toContain('ho_so.');
    expect(d.cau).not.toContain('11.1');
    // Và nói LÀM GÌ tiếp, không chỉ nói cái gì sai.
    expect(d.cau).toContain('file Word');
  });

  it('thiếu cả BẢNG SẢN PHẨM thì kể luôn — nó cũng là một mục bắt buộc', () => {
    const d = docLoi(
      new LoiApi(409, 'TEMPLATE_MISSING_REQUIRED', 'Mẫu hồ sơ CSBH còn thiếu mục bắt buộc.', {
        thieuTruong: ['ho_so.ma_ho_so'],
        thieuBangSanPham: '{{bang_san_pham}}',
      }),
    );
    expect(d.cau).toContain('Bảng sản phẩm');
    expect(d.cau).toContain('2 mục');
  });

  it('thân lỗi KHÔNG kèm danh sách thì lùi về câu máy chủ, không ra câu rỗng', () => {
    // Máy chủ cũ, hay một đường ném khác. Câu cụt "còn thiếu 0 mục bắt buộc:"
    // tệ hơn hẳn câu chung chung.
    const d = docLoi(new LoiApi(409, 'TEMPLATE_MISSING_REQUIRED', 'Mẫu còn thiếu mục bắt buộc.', {}));
    expect(d.cau).toBe('Mẫu còn thiếu mục bắt buộc.');
  });
});

describe('`0244` không chỗ nào bày mã lỗi hay mã tra cứu', () => {
  it('`docLoi` không trả về thứ gì để bày: không `traceId`, không câu gốc', () => {
    // Gỡ ở NGUỒN chứ không ở chỗ vẽ — màn hình sau không có gì mà bày lại.
    const d = docLoi(new LoiApi(400, 'VALIDATION_FAILED', 'fullName: quá ngắn', { field: 'fullName' }, 'tr-1'));
    expect(Object.keys(d).sort()).toEqual(['cau', 'dang', 'laLoiMang', 'ma', 'truong']);
  });

  it('khối báo lỗi trên trang (`BaoLoi`) cũng không bày mã', () => {
    render(<BaoLoi loi={new LoiApi(500, 'LOI_LA_LAM', 'Máy chủ hỏng', {}, 'tr-77')} />);
    const k = screen.getByRole('alert');
    expect(k.textContent).not.toContain('tr-77');
    expect(k.textContent).not.toContain('LOI_LA_LAM');
    expect(k.textContent).not.toMatch(/Mã tra cứu/);
  });

  it('không tệp giao diện nào còn in chữ "Mã tra cứu", trừ hai công cụ tra cứu của Quản trị', () => {
    // Nhật ký là công cụ tra cứu của Quản trị — mã ở đó là CHÌA KHOÁ để lọc cả
    // chuỗi của một lượt bấm, không phải một lời báo lỗi bày cho người dùng.
    // `0255`: thẻ Tệp log của trang Vận hành cùng loại — lọc log theo mã, bấm mã mở Nhật ký.
    const MIEN = ['NhatKy.tsx', 'van-hanh/TepLog.tsx'];
    const lo: string[] = [];
    const quet = (d: string) => {
      for (const t of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, t.name);
        if (t.isDirectory()) quet(p);
        else if (p.endsWith('.tsx') && !MIEN.some((m) => p.endsWith(m)) && /Mã tra cứu/.test(readFileSync(p, 'utf8'))) lo.push(p);
      }
    };
    quet('apps/web/src');
    expect(lo).toEqual([]);
  });
});
