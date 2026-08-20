/**
 * @vitest-environment jsdom
 *
 * `0067` — trang **thêm văn bản mẫu**: một lượt lưu, không bước nào ở giữa.
 *
 * Ca đáng giá nhất tệp này vẫn là phép ĐỐI CHIẾU HAI PHÍA ở cuối: bảng hướng dẫn
 * phải liệt kê đúng những khoá máy chủ nhận. Thiếu một khoá thì người soạn mẫu
 * không biết nó tồn tại; thừa một khoá thì họ gõ vào file, ánh xạ không được, và
 * thông báo lỗi nói "không có trường nguồn" về đúng thứ phần mềm vừa mời họ dùng.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KHOA_HUONG_DAN, ThemMau } from '@csbh/web/them-mau';
import { NHAN_KHOA } from '@csbh/web/mau-hop-dong';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const NGUON = {
  knownSources: ['ho_so.ma_ho_so', 'ho_so.ten_khach_hang', 'ho_so.cong_no', 'ngay_in'],
  batBuoc: ['ho_so.ma_ho_so'],
  oBangSanPham: '{{bang_san_pham}}',
  cotBang: [
    { khoa: 'stt', nhan: 'STT' },
    { khoa: 'ten_san_pham', nhan: 'Tên sản phẩm', batBuoc: true },
    { khoa: 'cpbh_tong', nhan: 'CPBH tổng', batBuoc: true },
    { khoa: 'cpbh', nhan: 'Từng khoản CPBH (CPBH1…CPBHn)' },
    { khoa: 'ghi_chu', nhan: 'Ghi chú' },
  ],
  cotBatBuoc: ['ten_san_pham', 'cpbh_tong'],
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/**
 * Chặn `fetch` theo ĐƯỜNG DẪN.
 *
 * `oTrong` là thứ máy chủ trả về khi trang gửi file lên đọc ô trống; ca nào cần
 * một file khác thì truyền vào.
 */
const chan = (oTrong: { placeholders: string[]; goiY: { placeholder: string; source: string }[] }) => {
  const f = vi.fn((duong: unknown) => {
    const d = String(duong);
    if (d.includes('/sources')) return Promise.resolve(json(NGUON));
    if (d.includes('/o-trong')) return Promise.resolve(json(oTrong));
    return Promise.resolve(json({ id: 'mau-1', name: 'Mẫu mới' }));
  });
  vi.stubGlobal('fetch', f);
  return f;
};

const DU_MUC = {
  placeholders: ['{{ho_so.ma_ho_so}}', '{{ho_so.cong_no}}', '{{bang_san_pham}}'],
  goiY: [
    { placeholder: '{{ho_so.ma_ho_so}}', source: 'ho_so.ma_ho_so' },
    { placeholder: '{{ho_so.cong_no}}', source: 'ho_so.cong_no' },
  ],
};

const bay = (loai: 'HO_SO' | 'HOP_DONG' = 'HO_SO') =>
  render(<ThemMau loai={loai} quayLai={() => undefined} xong={() => undefined} />);

/** Chọn một file .docx giả và đợi bảng ánh xạ hiện ra. */
const chonTep = async () => {
  const o = screen.getByLabelText(/Tệp mẫu/) as HTMLInputElement;
  const f = new File(['PK'], 'mau.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  fireEvent.change(o, { target: { files: [f] } });
  await waitFor(() => expect(screen.getByText('Ô trống trong file → trường dữ liệu')).toBeDefined());
};

describe('`0067` một lượt lưu, không bước nào ở giữa', () => {
  it('nút LƯU ở góc trên bên phải, và xám khi chưa chọn file', () => {
    chan(DU_MUC);
    bay('HO_SO');
    const nut = screen.getByRole('button', { name: 'Lưu' });
    expect(nut.closest('.nhom-nut-dau'), 'nút Lưu phải nằm cùng hàng tiêu đề').not.toBeNull();
    expect((nut as HTMLButtonElement).disabled).toBe(true);
  });

  it('chọn file thì bảng ánh xạ hiện NGAY DƯỚI, và ánh xạ được đoán sẵn', async () => {
    /*
     * Bản trước bảng ánh xạ là một hộp thoại ở bước sau: tải lên xong, đóng lại,
     * tìm dòng của mình trong danh sách, rồi bấm *Ánh xạ*. Ba bước cho một việc
     * mà file vừa mới nằm trong tay người dùng.
     */
    chan(DU_MUC);
    bay('HO_SO');
    await chonTep();

    const o = screen.getByLabelText('Trường dữ liệu cho {{ho_so.ma_ho_so}}') as HTMLSelectElement;
    expect(o.value, 'máy chủ đoán sẵn theo tên ô trống').toBe('ho_so.ma_ho_so');
    // Ô bảng sản phẩm KHÔNG có ô chọn — nó không trỏ tới trường nào.
    expect(screen.queryByLabelText('Trường dữ liệu cho {{bang_san_pham}}')).toBeNull();
    expect(document.body.textContent).toContain('Cả bảng sản phẩm');
  });

  it('LƯU hỏi lại một lần, và chỉ gửi khi xác nhận', async () => {
    const f = chan(DU_MUC);
    bay('HO_SO');
    await chonTep();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined());
    // Chưa gửi gì cả: hộp thoại là một câu hỏi, không phải một thông báo.
    expect(f.mock.calls.filter((c) => String(c[0]).endsWith('/policy-templates'))).toHaveLength(0);
    // Và nó nói rõ hệ quả người dùng cần biết TRƯỚC khi bấm.
    expect(screen.getByRole('dialog').textContent).toContain('không sửa được');

    fireEvent.click(screen.getByRole('button', { name: 'Lưu mẫu' }));
    await waitFor(() =>
      expect(f.mock.calls.some((c) => String(c[0]).endsWith('/policy-templates'))).toBe(true),
    );
  });

  it('còn một ô chưa chọn trường thì nút Lưu vẫn xám', async () => {
    chan({ placeholders: ['{{ho_so.ma_ho_so}}', '{{khong_doan_duoc}}'], goiY: [] });
    bay('HO_SO');
    await chonTep();
    expect((screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('`0067` chọn cột bảng sản phẩm', () => {
  it('chỉ hiện khi file THẬT SỰ có ô bảng', async () => {
    // Hỏi về một cái bảng không có trong mẫu là hỏi một câu không hệ quả nào.
    chan({ placeholders: ['{{ho_so.ma_ho_so}}'], goiY: [] });
    bay('HO_SO');
    await chonTep();
    expect(screen.queryByText('Cột của bảng sản phẩm')).toBeNull();
  });

  it('cột BẮT BUỘC hiện ra ở trạng thái bật và KHÔNG tắt được', async () => {
    chan(DU_MUC);
    bay('HO_SO');
    await chonTep();

    const buoc = screen.getByLabelText('Tên sản phẩm') as HTMLInputElement;
    expect(buoc.checked).toBe(true);
    expect(buoc.disabled, 'muc 11.1 đòi bản A4 phải có tên sản phẩm').toBe(true);

    const tuy = screen.getByLabelText('Ghi chú') as HTMLInputElement;
    expect(tuy.disabled).toBe(false);
  });

  it('CPBH là MỘT lựa chọn, không phải từng cột lẻ', async () => {
    /*
     * Số cột CPBH bằng dòng nhiều khoản nhất (muc 7.1), và con số ấy chỉ biết
     * lúc dựng bảng cho một hồ sơ cụ thể — còn tập cột thì khai lúc soạn mẫu,
     * trước khi biết hồ sơ nào sẽ dùng nó.
     */
    chan(DU_MUC);
    bay('HO_SO');
    await chonTep();
    expect(screen.getByLabelText(/Từng khoản CPBH/)).toBeDefined();
    expect(screen.queryByLabelText('CPBH1')).toBeNull();
  });
});

describe('`0067` hướng dẫn', () => {
  it('KHÔNG còn nút chép khoá — khoá chỉ để đọc', () => {
    chan(DU_MUC);
    bay('HO_SO');
    expect(screen.queryByRole('button', { name: /ho_so\.ten_khach_hang/ })).toBeNull();
    expect(document.body.textContent).toContain('{{ho_so.ten_khach_hang}}');
  });

  it('KHÔNG còn dòng chú thích về việc Word cắt rời khoá', () => {
    chan(DU_MUC);
    bay('HO_SO');
    expect(document.body.textContent).not.toContain('xoá đi và gõ lại liền một mạch');
  });

  it('KHÔNG còn nhóm khoá công ty và nhóm dòng sản phẩm', () => {
    // Thông tin Công ty cố định nên gõ thẳng vào file; dòng sản phẩm nằm trong
    // bảng do hệ thống dựng. Bày chúng ra là mời gõ một khoá máy chủ không nhận.
    chan(DU_MUC);
    bay('HO_SO');
    expect(document.body.textContent).not.toContain('{{cong_ty.ten}}');
    expect(document.body.textContent).not.toContain('{{san_pham.ma_san_pham}}');
    expect(document.body.textContent).toContain('gõ thẳng vào file');
  });

  it('hộp hướng dẫn TỰ CUỘN, không kéo cả trang', () => {
    /*
     * Danh sách khoá dài hơn biểu mẫu vài lần. Để nó nong trang ra thì người
     * dùng phải cuộn cả màn hình xuống mới thấy nút Lưu — mà nút ấy ở đầu trang.
     *
     * Kiểm bằng CSS thật, không bằng tên lớp: một quy tắc bị xoá thì tên lớp vẫn
     * còn nguyên trên DOM, và ca kiểm thử vẫn xanh trong khi hộp đã hết cuộn.
     */
    const css = readFileSync('apps/web/src/styles/app.css', 'utf8');
    // MỌI khối có bộ chọn ấy, không chỉ khối đầu tiên: `.them-mau-huong-dan`
    // xuất hiện hai lần — một lần dùng chung khung viền với biểu mẫu, một lần
    // riêng cho phép cuộn.
    const khoi = [...css.matchAll(/\.them-mau-huong-dan[^{]*\{([^}]*)\}/g)].map((m) => m[1]!);
    expect(khoi.some((k) => /overflow-y:\s*auto/.test(k)), 'hộp hướng dẫn phải tự cuộn').toBe(true);
    expect(khoi.some((k) => /max-height:/.test(k)), 'phải có trần chiều cao').toBe(true);
  });

  it('hai cột của bảng khoá THẲNG HÀNG giữa các nhóm', () => {
    // Mỗi nhóm là một `<table>` riêng, nên không có `table-layout: fixed` cộng
    // bề rộng cột đầu cố định thì mỗi bảng tự căn theo khoá dài nhất của nó, và
    // cột chú thích nhảy chỗ mỗi lần xuống một nhóm mới.
    const css = readFileSync('apps/web/src/styles/app.css', 'utf8');
    expect(css).toMatch(/\.bang-khoa\s*\{\s*table-layout:\s*fixed/);
    expect(css).toMatch(/\.bang-khoa td:first-child\s*\{[^}]*width:/);
  });
});

describe('`0056` bảng khoá khớp đúng máy chủ', () => {
  /** `KNOWN_SOURCES` của máy chủ, đọc thẳng từ mã nguồn. */
  const nguonMayChu = (): string[] => {
    const ma = readFileSync('services/document/src/contracts/sources.ts', 'utf8');
    return [...ma.matchAll(/^ {2}'?([a-zA-Z0-9_.]+)'?:\s*\(/gm)]
      .map((m) => m[1]!)
      .filter((s) => s.includes('.') || s === 'ngay_in');
  };

  it('không khoá nào của máy chủ vắng mặt trên hướng dẫn', () => {
    const thieu = nguonMayChu().filter((s) => !KHOA_HUONG_DAN.includes(s));
    expect(thieu, `hướng dẫn thiếu khoá: ${thieu.join(', ')}`).toEqual([]);
  });

  it('không khoá nào trên hướng dẫn là khoá máy chủ không nhận', () => {
    const may = nguonMayChu();
    const thua = KHOA_HUONG_DAN.filter((k) => !may.includes(k));
    expect(thua, `hướng dẫn nêu khoá lạ: ${thua.join(', ')}`).toEqual([]);
  });

  it('khoá nào cũng có nhãn tiếng Việt, không bày mã trần cho người đọc', () => {
    for (const k of KHOA_HUONG_DAN) {
      expect(NHAN_KHOA[k], `thiếu nhãn cho ${k}`).toBeDefined();
    }
  });
});
