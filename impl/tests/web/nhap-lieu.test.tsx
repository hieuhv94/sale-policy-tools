/**
 * @vitest-environment jsdom
 *
 * FE-09 · FE-31 · FE-34 · FE-35 — ô nhập, bộ gõ tiếng Việt, nhãn, hộp thoại.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import { ChuThichBatBuoc, HopThoai, ONhapTien, OTimKiem, Truong } from '@csbh/web/chung';

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
    expect(hop.querySelector('h2')!.parentElement).toBe(hop);
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
