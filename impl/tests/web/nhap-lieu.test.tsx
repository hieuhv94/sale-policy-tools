/**
 * @vitest-environment jsdom
 *
 * FE-09 · FE-31 · FE-34 · FE-35 — ô nhập, bộ gõ tiếng Việt, nhãn, hộp thoại.
 */
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import {
  catHaiChuSo,
  ChuThichBatBuoc,
  HopThoai,
  ONhapTien,
  OTimKiem,
  Truong,
} from '@csbh/web/chung';
import { doiSoThapPhan, nguongTuPhanTram, phanTramTuNguong } from '@csbh/web/danh-muc';

/**
 * Dọn DOM sau mỗi test.
 *
 * `globals` đang tắt trong vitest.config nên testing-library KHÔNG tự đăng ký
 * bước dọn này. Thiếu nó thì các lần render chồng lên nhau trong cùng một tệp,
 * và lỗi hiện ra dưới dạng "tìm thấy nhiều phần tử" ở một test chẳng liên quan.
 */
afterEach(cleanup);

describe('FE-09 ô nhập tiền gọi bàn phím số', () => {
  it('có inputMode numeric và KHÔNG dùng type=number', () => {
    render(<ONhapTien id="gia" giaTri="" doi={() => {}} />);
    const o = document.getElementById('gia') as HTMLInputElement;
    expect(o.getAttribute('inputmode')).toBe('numeric');
    // `type=number` cho gõ `e`, dấu trừ và dấu chấm, và con lăn chuột đổi số
    // tiền lúc cuộn trang — cả hai đều sai âm thầm ở chỗ không được sai.
    expect(o.getAttribute('type')).toBe('text');
  });

  it('loại mọi ký tự không phải chữ số', async () => {
    const nguoi = userEvent.setup();
    let v = '';
    render(<ONhapTien id="gia" giaTri="" doi={(x) => (v = x)} />);
    await nguoi.type(document.getElementById('gia')!, '1');
    expect(v).toBe('1');
    await nguoi.clear(document.getElementById('gia')!);
    await nguoi.type(document.getElementById('gia')!, 'a');
    expect(v).toBe('');
  });
});

describe('FE-31 gõ tiếng Việt bằng bộ gõ', () => {
  it('KHÔNG gọi tìm kiếm giữa lúc đang bỏ dấu', async () => {
    vi.useFakeTimers();
    const goi = vi.fn();
    render(<OTimKiem id="tim" nhan="Tìm" giaTri="" doi={goi} cho={100} />);
    const o = document.getElementById('tim') as HTMLInputElement;

    // Telex: "Dda Nawng" → "Đà Nẵng". Các trạng thái giữa chừng vô nghĩa với
    // máy chủ và gọi tìm kiếm ở đó là vừa tốn vừa dễ làm mất dấu.
    fireEvent.compositionStart(o);
    fireEvent.change(o, { target: { value: 'Dd' } });
    fireEvent.change(o, { target: { value: 'Dda' } });
    vi.advanceTimersByTime(500);
    expect(goi).not.toHaveBeenCalled();

    fireEvent.compositionEnd(o, { target: { value: 'Đà Nẵng' } });
    vi.advanceTimersByTime(200);
    expect(goi).toHaveBeenCalledWith('Đà Nẵng');
    vi.useRealTimers();
  });

  it('không mất dấu: giá trị trong ô luôn là thứ người dùng vừa gõ', () => {
    render(<OTimKiem id="tim2" nhan="Tìm" giaTri="" doi={() => {}} />);
    const o = document.getElementById('tim2') as HTMLInputElement;
    fireEvent.compositionStart(o);
    fireEvent.change(o, { target: { value: 'Đà Nẵng' } });
    expect(o.value).toBe('Đà Nẵng');
  });
});

describe('FE-34 nhãn gắn đúng vào ô nhập', () => {
  it('label có htmlFor trỏ tới id của ô', () => {
    render(
      <Truong id="ten" nhan="Tên khách hàng" bắtBuộc>
        {(p) => <input {...p} />}
      </Truong>,
    );
    // getByLabelText chỉ tìm thấy khi nhãn thật sự gắn đúng — đây là phép kiểm
    // giống hệt cách trình đọc màn hình đọc biểu mẫu.
    expect(screen.getByLabelText(/Tên khách hàng/)).toBeDefined();
  });

  it('trường bắt buộc nói rõ bằng chữ, không chỉ bằng dấu sao', () => {
    render(
      <Truong id="ten2" nhan="Tên" bắtBuộc>
        {(p) => <input {...p} />}
      </Truong>,
    );
    // Dấu `*` là quy ước thị giác; trình đọc màn hình đọc ra "sao" và người
    // dùng không biết nó nghĩa là gì.
    expect(screen.getByText('(bắt buộc)')).toBeDefined();
  });

  it('ô KHÔNG bắt buộc thì không có dấu sao — sao phải nói lên điều gì đó', () => {
    // Gắn sao cho mọi ô là bỏ luôn thông tin: người dùng không còn phân biệt
    // được ô nào phải điền, và dấu sao thành trang trí.
    const { container } = render(
      <Truong id="tuy-chon" nhan="Địa chỉ giao hàng">
        {(p) => <input {...p} />}
      </Truong>,
    );
    expect(container.querySelector('.sao')).toBeNull();
    expect(screen.queryByText('(bắt buộc)')).toBeNull();
  });

  it('chú giải dấu sao ẩn khỏi cây trợ năng, không đọc lặp', () => {
    // Trình đọc màn hình đã nghe "(bắt buộc)" ở từng nhãn; đọc thêm một câu giải
    // thích quy ước thị giác ở đầu biểu mẫu là nhiễu.
    const { container } = render(<ChuThichBatBuoc />);
    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
  });

  it('lỗi được nối vào ô bằng aria-describedby', () => {
    render(
      <Truong id="ten3" nhan="Tên" loi="Chưa nhập tên">
        {(p) => <input {...p} />}
      </Truong>,
    );
    const o = document.getElementById('ten3')!;
    expect(o.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(o.getAttribute('aria-describedby')!)!.textContent).toBe(
      'Chưa nhập tên',
    );
  });
});

describe('FE-35 hộp thoại dùng được bằng bàn phím', () => {
  it('Escape đóng, và tiêu điểm vào bên trong khi mở', () => {
    const dong = vi.fn();
    render(
      <HopThoai tieuDe="Xác nhận" dong={dong}>
        <button type="button">Đồng ý</button>
      </HopThoai>,
    );
    expect(document.activeElement?.textContent).toBe('Đồng ý');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dong).toHaveBeenCalled();
  });

  it('tiêu đề nằm NGOÀI vùng cuộn của hộp thoại', () => {
    // Biểu mẫu tạo Trình dược viên cao hơn màn hình laptop. Nếu tiêu đề nằm
    // cùng vùng cuộn với nội dung thì nó trôi mất khi kéo xuống, và người dùng
    // không còn biết mình đang mở hộp thoại nào. Kiểm CẤU TRÚC ở đây vì jsdom
    // không tính bố cục — nhưng chính cấu trúc này là thứ dễ bị làm phẳng lại.
    const { container } = render(
      <HopThoai tieuDe="Tạo người dùng" dong={() => {}}>
        <p>Nội dung dài</p>
      </HopThoai>,
    );
    const hop = container.querySelector('.hop-thoai')!;
    const than = hop.querySelector('.hop-thoai-than')!;
    // Từ `0257` tiêu đề nằm trong khối đầu hộp cùng nút ×; khối ấy là con trực
    // tiếp của hộp, ĐỨNG NGOÀI vùng cuộn — đúng điều ca này canh từ đầu.
    expect(hop.querySelector('h2')!.closest('.hop-thoai-dau')!.parentElement).toBe(hop);
    expect(than.contains(hop.querySelector('h2'))).toBe(false);
    expect(than.textContent).toBe('Nội dung dài');
  });

  it('Tab không thoát ra ngoài hộp thoại', () => {
    render(
      <HopThoai tieuDe="Xác nhận" dong={() => {}}>
        <button type="button">Một</button>
        <button type="button">Hai</button>
      </HopThoai>,
    );
    const hai = screen.getByRole('button', { name: 'Hai' });
    hai.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // Từ phần tử cuối, Tab quay về phần tử đầu thay vì đi ra vùng bị lớp phủ che.
    expect(document.activeElement?.textContent).toBe('Một');
  });

  it('có vai trò dialog và aria-modal', () => {
    render(
      <HopThoai tieuDe="Xác nhận xoá" dong={() => {}}>
        <button type="button">OK</button>
      </HopThoai>,
    );
    const h = screen.getByRole('dialog');
    expect(h.getAttribute('aria-modal')).toBe('true');
    expect(h.getAttribute('aria-label')).toBe('Xác nhận xoá');
  });
});

// =============================================================================
// Định dạng số NGAY KHI ĐANG GÕ
// =============================================================================

/** Ô tiền có nơi dùng thật: giá trị do cha giữ, đúng như bốn chỗ đang dùng. */
function OTienCoTrangThai({ ban = '' }: { ban?: string }) {
  const [v, datV] = useState(ban);
  return <ONhapTien id="t" giaTri={v} doi={datV} />;
}

describe('ô nhập tiền', () => {
  it('rời ô thì hiện dấu phân nhóm nghìn, và báo ra chuỗi số trần', async () => {
    // Đếm số 0 bằng mắt là chỗ sai tiền nhiều nhất, và nó sai theo bội số của
    // mười. Nhưng giá trị gửi lên máy chủ phải là số trần — gửi "90.000" thì
    // `money()` bên máy chủ từ chối.
    const doi = vi.fn();
    render(<ONhapTien id="t" giaTri="90000" doi={doi} />);
    const o = screen.getByRole('textbox') as HTMLInputElement;
    expect(o.value).toBe('90.000');

    await userEvent.type(o, '5');
    expect(doi).toHaveBeenLastCalledWith('900005');
  });

  /*
   * `0087` — LỖI GÕ SỐ TIỀN BẰNG BỘ GÕ TIẾNG VIỆT.
   *
   * Bộ gõ giữ bộ đệm riêng cho từ đang gõ và sửa chữ bằng phím xoá lùi. Ô nhập
   * tự chèn dấu chấm vào giữa chuỗi là bộ đệm ấy lệch khỏi thứ trên màn hình,
   * và lượt xoá lùi kế tiếp ăn nhầm chữ số — gõ đủ bảy phím mà ra thiếu hoặc
   * thừa số.
   *
   * Nên bất biến là: **trong lúc ô có con trỏ, chữ trong ô đúng bằng chữ người
   * dùng đã gõ**. Ca này không nhắc tới bộ gõ nào cả — nó chốt chính cái bất
   * biến ấy, nên bộ gõ khác về sau cũng nằm trong phạm vi.
   */
  it('`0087` đang gõ thì KHÔNG chèn gì vào chuỗi người dùng vừa gõ', async () => {
    const nguoi = userEvent.setup();
    render(<OTienCoTrangThai />);
    const o = screen.getByRole('textbox') as HTMLInputElement;

    await nguoi.click(o);
    for (const [da, phim] of [
      ['1', '1'],
      ['10', '0'],
      ['100', '0'],
      ['1000', '0'],
      ['10000', '0'],
      ['100000', '0'],
      ['1000000', '0'],
    ] as const) {
      await nguoi.keyboard(phim);
      expect(o.value, `gõ tới ${da} mà ô hiện ${o.value}`).toBe(da);
    }

    // Con số phân nhóm vẫn đọc được ngay, chỉ nằm ở dòng chú thích cạnh ô.
    expect(document.querySelector('.doc-so')!.textContent).toBe('1.000.000');

    // Rời ô thì chính ô hiện số đã phân nhóm, và dòng chú thích thôi lặp lại.
    await nguoi.tab();
    expect(o.value).toBe('1.000.000');
    expect(document.querySelector('.doc-so')).toBeNull();
  });

  it('`0087` không lọc giữa lúc bộ gõ đang soạn', () => {
    /*
     * Telex đi qua các trạng thái trung gian có chữ cái. Lọc `[^\d]` ngay lúc
     * ấy là xoá đúng ký tự bộ gõ cần để bỏ dấu, và ô nhập thành chỗ không gõ
     * nổi. Soạn xong mới lọc — lúc đó cái gì không phải chữ số thì bỏ, y như cũ.
     */
    render(<OTienCoTrangThai />);
    const o = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.compositionStart(o);
    fireEvent.change(o, { target: { value: '12ows' } });
    expect(o.value).toBe('12ows');

    fireEvent.compositionEnd(o, { target: { value: '12ơ' } });
    expect(o.value).toBe('12');
  });

  it('ô rỗng hiện rỗng, không hiện dấu gạch ngang', () => {
    // `tien('')` trả '—' cho bảng dữ liệu; trong ô nhập thì đó là rác người dùng
    // phải xoá đi trước khi gõ được.
    render(<ONhapTien id="t" giaTri="" doi={() => undefined} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
  });
});

describe('ô nhập phần trăm', () => {
  it('cắt còn hai chữ số thập phân ngay lúc gõ', () => {
    expect(catHaiChuSo('12,345')).toBe('12,34');
    expect(catHaiChuSo('12.345')).toBe('12,34');
  });

  it('CHỊU ĐƯỢC trạng thái gõ dở', () => {
    // "12," là chuỗi người dùng bắt buộc phải đi qua để gõ "12,5". Chuẩn hoá quá
    // tay ở đây là ô nhập tự xoá ký tự vừa gõ, và không cách nào nhập phần thập
    // phân được nữa.
    expect(catHaiChuSo('12,')).toBe('12,');
    expect(catHaiChuSo('')).toBe('');
  });

  it('bỏ ký tự không phải số', () => {
    expect(catHaiChuSo('1a2b,3c')).toBe('12,3');
  });

  it('đọc được cả dấu phẩy lẫn dấu chấm', () => {
    // Quy ước tiếng Việt là dấu phẩy, nhưng bàn phím số trên laptop chỉ có dấu
    // chấm — ép một kiểu là thỉnh thoảng có người nhập xong thấy báo "không phải
    // số" mà không hiểu vì sao.
    expect(doiSoThapPhan('12,34')).toBeCloseTo(12.34);
    expect(doiSoThapPhan('12.34')).toBeCloseTo(12.34);
    expect(Number.isNaN(doiSoThapPhan(''))).toBe(true);
  });

  it('đi một vòng phần trăm → phần vạn → phần trăm vẫn đúng', () => {
    expect(nguongTuPhanTram('12,34')).toBe(1234);
    expect(phanTramTuNguong(1234)).toBe('12,34');
  });
});
