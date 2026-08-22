/**
 * @vitest-environment jsdom
 *
 * `0094` — trang *Thống kê*: bảng tra theo vai trò, và màn hình dựng từ chúng.
 *
 * Cái sai cần bắt ở đây không phải một hàm trả sai giá trị mà là **một khối vắng
 * mặt hoặc một khối thừa**: một vai trò không có hình nào, Quản trị hệ thống
 * được bày một biểu đồ hồ sơ toàn số 0, hay một vai trò không được phép lại đọc
 * được bảng xếp hạng đồng nghiệp. Không lỗi nào trong ba lỗi ấy làm màn hình đỏ
 * lên — chúng chỉ làm nó sai một cách im lặng.
 *
 * Phần TOÁN của bộ vẽ nằm ở `bieu-do.test.ts`; ở đây chỉ kiểm bố cục và luồng.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PhienProvider, usePhien } from '@csbh/web/auth';
import { BoDinhTuyen } from '@csbh/web/router';
import { ThongKe } from '@csbh/web/thong-ke-ui';
import { Cot, Duong } from '@csbh/web/bieu-do';
import { NHAN_XU_HUONG } from '@csbh/web/xep-hang';
import { DIEU_HUONG, VAI_TRO, xem, type VaiTro } from '@csbh/web/can';
import {
  KHOI_CAN_NHOM,
  KHOI_CAN_SO_LIEU,
  KHOI_CAN_TDV,
  KHOI_DOC_NHAT_KY,
  KHOI_THEO_VAI_TRO,
  KY_MAC_DINH,
  LY_DO_KHONG_CO_SO,
  MOI_KY,
  NEO,
  NHAN_KY,
  tyLeKyThang,
} from '@csbh/web/thong-ke';

const doc = (p: string) => readFileSync(`apps/web/src/${p}`, 'utf8');

describe('`0094` bảng tra phủ đủ sáu vai trò', () => {
  it('không vai trò nào thiếu khoá, và không vai trò nào ra trang trắng', () => {
    expect(Object.keys(KHOI_THEO_VAI_TRO).sort()).toEqual([...VAI_TRO].sort());
    for (const v of VAI_TRO) {
      expect(KHOI_THEO_VAI_TRO[v].length, `vai trò ${v} sẽ ra trang trắng`).toBeGreaterThan(0);
    }
  });

  it('mọi khối đều có một nguồn dữ liệu, không khối nào mồ côi', () => {
    // Một khối không nằm trong bảng nguồn nào thì màn hình dựng nó ra mà không
    // ai gọi API — nó hiện "đang tải" vĩnh viễn.
    const coNguon: string[] = [
      ...KHOI_CAN_SO_LIEU,
      ...KHOI_CAN_TDV,
      ...KHOI_CAN_NHOM,
      ...KHOI_DOC_NHAT_KY,
      'vi-sao-khong-co-so',
    ];
    for (const v of VAI_TRO) {
      for (const k of KHOI_THEO_VAI_TRO[v]) {
        expect(coNguon, `khối ${k} của ${v} không có nguồn`).toContain(k);
      }
    }
  });

  it('CHỈ Ban lãnh đạo và Trưởng bộ phận soi được từng TDV', () => {
    /*
     * Quyết định 23/08. Không phải chuyện phạm vi — phạm vi đã tự lo, một TDV
     * gọi vào chỉ thấy chính mình. Đây là chuyện nghiệp vụ: bảng ấy bày tên
     * đồng nghiệp cạnh nhau kèm con số hiệu quả.
     */
    const coTdv = VAI_TRO.filter((v) =>
      KHOI_THEO_VAI_TRO[v].some((k) => KHOI_CAN_TDV.includes(k)),
    );
    expect([...coTdv].sort()).toEqual(['BAN_LANH_DAO', 'TBP']);
  });

  it('vai trò nào đọc `/audit` thì phải xem được mục Nhật ký', () => {
    // Cùng phép đối chiếu mà `0086` để lại ở trang Tổng quan: quyền và bố cục
    // nằm ở hai tệp, sót một bên thì khối ấy nhận 403 giữa màn hình.
    for (const v of VAI_TRO) {
      if (KHOI_THEO_VAI_TRO[v].some((k) => KHOI_DOC_NHAT_KY.includes(k))) {
        expect(xem(v, 'nhatKy'), `${v} đọc /audit mà không có quyền nhatKy`).toBe(true);
      }
    }
  });

  it('Quản trị hệ thống KHÔNG có khối hồ sơ nào, và nói ra vì sao', () => {
    expect(KHOI_THEO_VAI_TRO.QUAN_TRI.some((k) => KHOI_CAN_SO_LIEU.includes(k))).toBe(false);
    expect(KHOI_THEO_VAI_TRO.QUAN_TRI.some((k) => KHOI_CAN_TDV.includes(k))).toBe(false);
    expect(LY_DO_KHONG_CO_SO.QUAN_TRI).toMatch(/phạm vi dữ liệu/);
  });

  it('mỗi vai trò một nhịp mặc định hợp lệ, và nhịp ấy khớp nhịp công việc', () => {
    for (const v of VAI_TRO) expect(MOI_KY, v).toContain(KY_MAC_DINH[v]);
    // Chiết khấu bình quân theo tuần thì nhảy loạn; khối lượng ký thì dồn theo
    // tuần, xem theo quý là mất hẳn một tuần dồn việc.
    expect(KY_MAC_DINH.BAN_LANH_DAO).toBe('quy');
    expect(KY_MAC_DINH.TBP).toBe('tuan');
    expect(KY_MAC_DINH.TDV).toBe('thang');
  });
});

describe('`0094` không còn bảng số', () => {
  it('mục menu là "Thống kê", đường cũ không còn trong menu', () => {
    const m = DIEU_HUONG.find((x) => x.duong === '/thong-ke');
    expect(m?.nhan).toBe('Thống kê');
    expect(DIEU_HUONG.some((x) => x.duong === '/bao-cao')).toBe(false);
  });

  it('màn hình KHÔNG dựng thẻ `table` nào', () => {
    /*
     * Yêu cầu 23/08: *"thể hiện dưới dạng biểu đồ, để nhìn được tổng quan chứ
     * không dùng số liệu"*. Một cái bảng lẻn vào lần sửa sau sẽ không làm ca
     * kiểm nào đỏ — trừ ca này.
     */
    const src = doc('pages/ThongKe.tsx');
    expect(src).not.toMatch(/<table/);
    expect(src).not.toMatch(/<thead/);
  });

  it('mọi tên chỉ số trên hình đều khai được MỐC của nó', () => {
    // "Tháng này có bao nhiêu CSBH" là câu chưa đủ nghĩa — lập, gửi duyệt hay
    // có hiệu lực là ba con số. Chú thích dưới hình là chỗ duy nhất nói ra.
    for (const [ten, n] of Object.entries(NEO)) {
      expect(n.nhan.length, ten).toBeGreaterThan(0);
      expect(n.moc.length, ten).toBeGreaterThan(0);
    }
  });
});

describe('`0094` tỷ lệ ký thẳng', () => {
  it('kỳ KHÔNG có hồ sơ nào trả về `null`, không phải 0', () => {
    /*
     * 0 vẽ ra một điểm chạm đáy và đọc thành "kỳ ấy hỏng hết"; `null` thì không
     * vẽ gì. Đây là khác biệt giữa "không có dữ liệu" và "dữ liệu bằng không".
     */
    expect(tyLeKyThang({ kyThang: 0, traLai1: 0, traLaiNhieu: 0, tuChoi: 0, dangXuLy: 0 })).toBeNull();
    expect(tyLeKyThang({ kyThang: 3, traLai1: 1, traLaiNhieu: 0, tuChoi: 0, dangXuLy: 0 })).toBe(75);
  });
});

describe('`0094` hình vẽ ra đúng hình dạng', () => {
  /**
   * Phần TOÁN đã kiểm bằng bảng số, nhưng KHÔNG ca nào gác việc component
   * **dùng** phép toán ấy. Một lần sửa bỏ mất mốc đáy của cột chồng thì mọi lớp
   * cùng mọc từ đáy — hình vẫn có, màu vẫn đủ, và cột vẫn cao đúng bằng lớp lớn
   * nhất. Đây là ca duy nhất nhìn ra chuyện đó.
   */
  it('cột CHỒNG lên nhau, không cùng mọc từ đáy', () => {
    const { container } = render(
      <Cot
        moc={['K1']}
        moTa="thử"
        lop={[
          { nhan: 'duoi', diem: [10], mau: 'bd-1' },
          { nhan: 'tren', diem: [10], mau: 'bd-2' },
        ]}
      />,
    );
    const o = [...container.querySelectorAll('rect.bd-o')];
    expect(o.length).toBe(2);
    const y = o.map((r) => Number(r.getAttribute('y')));
    const h = o.map((r) => Number(r.getAttribute('height')));
    // Hai lớp bằng nhau: lớp trên phải nằm CAO HƠN đúng bằng chiều cao lớp dưới.
    expect(h[0]).toBeCloseTo(h[1] ?? 0, 6);
    expect((y[0] ?? 0) - (y[1] ?? 0)).toBeCloseTo(h[0] ?? 0, 6);
  });

  it('cột NHÓM đứng cạnh nhau, cùng mọc từ đáy', () => {
    const { container } = render(
      <Cot
        moc={['K1']}
        nhom
        moTa="thử"
        lop={[
          { nhan: 'a', diem: [10], mau: 'bd-1' },
          { nhan: 'b', diem: [5], mau: 'bd-2' },
        ]}
      />,
    );
    const o = [...container.querySelectorAll('rect.bd-o')];
    const day = o.map((r) => Number(r.getAttribute('y')) + Number(r.getAttribute('height')));
    expect(day[0]).toBeCloseTo(day[1] ?? 0, 6);
    // Cột 5 phải thấp đúng một nửa cột 10.
    const h = o.map((r) => Number(r.getAttribute('height')));
    expect((h[1] ?? 0) * 2).toBeCloseTo(h[0] ?? 0, 6);
  });

  it('đường mờ KHÔNG có chấm cuối — nó để so, không phải để đọc', () => {
    const { container } = render(
      <Duong
        moc={['K1', 'K2']}
        moTa="thử"
        chuoi={[
          { nhan: 'toi', diem: [1, 2], mau: 'bd-1' },
          { nhan: 'trung vi', diem: [2, 2], mau: 'bd-mo', mo: true },
        ]}
      />,
    );
    expect(container.querySelectorAll('polyline.bd-net').length).toBe(1);
    expect(container.querySelectorAll('polyline.bd-net-mo').length).toBe(1);
    expect(container.querySelectorAll('circle.bd-cham').length).toBe(1);
  });

  it('mỗi hình có một câu tóm tắt cho trình đọc màn hình', () => {
    // 12 điểm × 4 đường mà đọc hết là 48 con số không ai nghe được; câu tóm tắt
    // nói đúng điều cần biết.
    const { container } = render(
      <Duong moc={['K1']} moTa="Hồ sơ có hiệu lực qua 1 kỳ" chuoi={[{ nhan: 'a', diem: [1], mau: 'bd-1' }]} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Hồ sơ có hiệu lực qua 1 kỳ');
  });
});

// --- Dựng màn hình thật ------------------------------------------------------

const phien = (role: VaiTro) => ({
  accessToken: 'a',
  refreshToken: 'r',
  user: {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'ai-do',
    fullName: 'Người kiểm thử',
    email: 'ai-do@nutricare.com.vn',
    role,
    mustChangePassword: false,
  },
});

const KY = (ma: string, nhan: string, dangChay = false) => ({
  ma,
  nhan,
  tu: '2026-07-31T17:00:00.000Z',
  den: '2026-08-31T17:00:00.000Z',
  dangChay,
});

const soLieuKy = (ma: string, nhan: string, dangChay: boolean, n: number) => ({
  ...KY(ma, nhan, dangChay),
  dem: {
    lapMoi: n + 2,
    guiDuyet: n + 1,
    tbpKy: n,
    ktNhanL1: n,
    banGiao: n - 1,
    hopDong: n - 1,
    coHieuLuc: n - 1,
    traLai: 1,
    tuChoi: 0,
    quaHan: 0,
    hetHieuLuc: 0,
  },
  giaTri: n * 1_000_000,
  soNgayDuyetTb: 4.5,
  chietKhauTb: 12.5,
  soDong: n * 2,
  dongVuotNguong: 1,
  tyLeVuotNguong: 12.5,
  tyLeTraLai: 16.67,
});

const BO = {
  ky: 'thang',
  soKy: 12,
  muiGio: 'Asia/Ho_Chi_Minh',
  chuoi: [
    soLieuKy('2026-07-01', 'Tháng 7/2026', false, 5),
    soLieuKy('2026-08-01', 'Tháng 8/2026', true, 7),
  ],
  soSanh: {
    kyNay: soLieuKy('2026-08-01', 'Tháng 8/2026', true, 7),
    kyTruoc: soLieuKy('2026-07-01', 'Tháng 7/2026', false, 5),
    daQua: 21 * 24 * 3600_000,
    denKyTruoc: '2026-07-22T03:00:00.000Z',
  },
  loaiTruLegacy: 3,
  trungVi: { '2026-07-01': 4, '2026-08-01': 5 },
  buoc: {
    '2026-08-01': { choTbp: 2.4, choKtL1: 1.8, saLamBanCung: 5.6, choKtL2: 2.1 },
    '2026-07-01': { choTbp: 2.1, choKtL1: 1.6, saLamBanCung: 6.2, choKtL2: 2.4 },
  },
};

const nguoi = (ten: string, so: number, chuoi: number[], xh: string, kyThang: number) => ({
  userId: `u-${ten}`,
  ten,
  kyNay: { guiDuyet: so + 1, coHieuLuc: so, traLai: 1, tuChoi: 0, giaTri: so * 1_000_000 },
  chuoiHieuLuc: chuoi,
  chuoiGui: chuoi.map((v) => v + 1),
  xuHuong: xh,
  xuHuongGui: xh,
  tyLeTraLai: 12,
  chatLuong: { kyThang, traLai1: 2, traLaiNhieu: 1, tuChoi: 0, dangXuLy: 1 },
  chatLuongTheoKy: [],
  suaLaiNgay: 3.2,
});

const TDV = {
  ky: 'thang',
  soKy: 12,
  chuoi: [KY('2026-07-01', 'Tháng 7/2026'), KY('2026-08-01', 'Tháng 8/2026', true)],
  nguoi: [
    nguoi('Lê Thị Thu Hà', 9, [4, 5, 6, 7, 8, 9], 'len', 12),
    nguoi('Bùi Thu Trang', 0, [8, 7, 5, 2, 1, 0], 'xuong', 1),
  ],
};

const HOAT_DONG = {
  ky: 'thang',
  chuoi: [
    {
      ma: '2026-08-01',
      nhan: 'Tháng 8/2026',
      dangChay: true,
      tong: 42,
      nguoi: 3,
      theoDoiTuong: { policy: 40, customer: 2 },
    },
  ],
  window: { from: '2026-02-23T00:00:00.000Z', months: 6 },
  kyBiCat: 0,
};

const NHOM = {
  ky: 'thang',
  chuoi: [{ ma: '2026-08-01', nhan: 'Tháng 8/2026' }],
  dong: [{ nhom: 'SUA', maKy: '2026-08-01', chietKhauTb: 12.5, soDong: 8, vuotNguong: 2 }],
};

let daGoi: string[] = [];
let vaiTroPhien: VaiTro = 'TDV';

const chan = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn((duong: string) => {
      daGoi.push(duong);
      // `/auth/me` phải trả về NGƯỜI DÙNG THẬT: `PhienProvider` ghi đè phiên
      // bằng thứ máy chủ trả lời, nên chặn qua loa làm vai trò biến mất sau
      // lượt vẽ thứ hai và màn hình rỗng đi trong im lặng.
      const than = duong.includes('/auth/me')
        ? phien(vaiTroPhien).user
        : duong.includes('/audit/')
          ? HOAT_DONG
          : duong.includes('/thong-ke/tdv')
            ? TDV
            : duong.includes('/thong-ke/nhom')
              ? NHOM
              : BO;
      return Promise.resolve(
        new Response(JSON.stringify(than), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );

/** Cổng chờ phiên — dựng màn hình đúng như `App.tsx` dựng (`0076`). */
function ChoPhien({ children }: { children: React.ReactNode }) {
  const { dangTai } = usePhien();
  return dangTai ? null : <>{children}</>;
}

const mo = (role: VaiTro) => {
  vaiTroPhien = role;
  localStorage.setItem('csbh:phien', JSON.stringify(phien(role)));
  render(
    <PhienProvider>
      <BoDinhTuyen>
        <ChoPhien>
          <ThongKe />
        </ChoPhien>
      </BoDinhTuyen>
    </PhienProvider>,
  );
};

const doiHinh = async () =>
  waitFor(() => expect(screen.getAllByRole('img').length).toBeGreaterThan(0));

beforeEach(() => {
  daGoi = [];
  chan();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('`0094` màn hình dựng theo bảng tra', () => {
  it('TDV thấy đường của mình VÀ trung vị công ty, không gọi bảng người', async () => {
    mo('TDV');
    await doiHinh();
    expect(daGoi.some((d) => d.includes('/thong-ke/tdv'))).toBe(false);
    expect(screen.getByText(/trung vị của một trình dược viên/i)).toBeTruthy();
  });

  it('Quản trị hệ thống KHÔNG gọi `/reports`, chỉ gọi nhật ký', async () => {
    mo('QUAN_TRI');
    await waitFor(() => expect(screen.getByRole('note')).toBeTruthy());
    expect(daGoi.some((d) => d.includes('/reports/'))).toBe(false);
    expect(daGoi.some((d) => d.includes('/audit/thong-ke'))).toBe(true);
  });

  it('mở ra là đúng NHỊP của vai trò, đổi nhịp thì gọi lại', async () => {
    mo('BAN_LANH_DAO');
    const soLieu = () => daGoi.filter((d) => d.includes('/thong-ke'));
    await waitFor(() => expect(soLieu().length).toBeGreaterThan(0));
    expect(soLieu().every((d) => d.includes('ky=quy'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: NHAN_KY.tuan }));
    await waitFor(() => expect(soLieu().some((d) => d.includes('ky=tuan'))).toBe(true));
  });

  it('số hồ sơ dữ liệu cũ bị loại được NÓI RA', async () => {
    mo('BAN_LANH_DAO');
    await doiHinh();
    expect(screen.getByText(/Đã loại 3 hồ sơ nhập từ dữ liệu cũ/)).toBeTruthy();
  });
});

describe('`0094` Ban lãnh đạo soi từng TDV', () => {
  it('xếp hạng hiện tên, số, và nhãn xu hướng BẰNG CHỮ', async () => {
    /*
     * Bằng chữ chứ không chỉ bằng màu và mũi tên: màu không phải là thông tin
     * cho người không phân biệt được màu, và bản in đen trắng thì mất sạch.
     */
    mo('BAN_LANH_DAO');
    await doiHinh();
    expect(screen.getByText('Lê Thị Thu Hà')).toBeTruthy();
    expect(screen.getAllByText(new RegExp(NHAN_XU_HUONG.len.chu)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(NHAN_XU_HUONG.xuong.chu)).length).toBeGreaterThan(0);
  });

  it('nói rõ đây KHÔNG phải doanh số', async () => {
    // Một biểu đồ mang tên "hiệu quả" mà người đọc hiểu thành doanh số là loại
    // hiểu nhầm dẫn tới quyết định về con người (chốt 23/08).
    mo('BAN_LANH_DAO');
    await doiHinh();
    expect(screen.getByText(/không đo doanh số/i)).toBeTruthy();
  });

  it('bấm một người thì LỌC TẠI CHỖ, bấm lại thì bỏ chọn', async () => {
    mo('BAN_LANH_DAO');
    await doiHinh();
    const dong = screen.getByRole('button', { name: /Lê Thị Thu Hà/ });
    expect(dong.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(dong);
    await waitFor(() => expect(screen.getByRole('button', { name: /Bỏ chọn/ })).toBeTruthy());
    expect(
      screen.getByRole('button', { name: /Lê Thị Thu Hà/ }).getAttribute('aria-pressed'),
    ).toBe('true');
    // Không mở màn hình mới: cùng trang, chỉ thêm một khối.
    expect(screen.getByRole('heading', { name: 'Thống kê' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Lê Thị Thu Hà/ }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Bỏ chọn/ })).toBeNull());
  });

  it('KHÔNG có chức năng đặt hai người cạnh nhau để so', async () => {
    // Chốt 23/08: xếp hạng cho thấy ai đứng đâu, phân tán cho thấy ai lệch, còn
    // muốn xem kỹ một người thì bấm vào người ấy. Chọn người thứ hai phải THAY
    // người thứ nhất, không phải thêm vào.
    mo('BAN_LANH_DAO');
    await doiHinh();
    fireEvent.click(screen.getByRole('button', { name: /Lê Thị Thu Hà/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Bỏ chọn/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Bùi Thu Trang/ }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Lê Thị Thu Hà/ }).getAttribute('aria-pressed'),
      ).toBe('false'),
    );
    expect(screen.getAllByRole('button', { name: /Bỏ chọn/ }).length).toBe(1);
  });
});

describe('`0094` Trưởng bộ phận soi các TDV gửi hồ sơ tới mình', () => {
  it('xếp hạng theo HỒ SƠ GỬI LÊN, không phải hồ sơ có hiệu lực', async () => {
    mo('TBP');
    await doiHinh();
    expect(screen.getByText('Hồ sơ gửi lên')).toBeTruthy();
  });

  it('người kỳ này KHÔNG gửi gì vẫn hiện ra', async () => {
    /*
     * Lấy danh sách theo kỳ đang xem thì người ngừng gửi hẳn biến mất — mà đó
     * đúng là ca chững nặng nhất. Máy chủ trả họ về; màn hình phải bày ra.
     */
    mo('TBP');
    await doiHinh();
    const dong = screen.getByRole('button', { name: /Bùi Thu Trang/ });
    expect(within(dong).getByText(new RegExp(NHAN_XU_HUONG.xuong.chu))).toBeTruthy();
  });

  it('cơ cấu chất lượng là thanh 100%, và nói ra ô "đang xử lý"', async () => {
    mo('TBP');
    await doiHinh();
    expect(screen.getByText(/100% hồ sơ của người đó/i)).toBeTruthy();
    // Ô "Đang xử lý" xuất hiện ở cả chú thích lẫn câu giải thích dưới hình —
    // hai chỗ, cùng một ý, nên `getAllByText`.
    expect(screen.getAllByText(/Đang xử lý/).length).toBeGreaterThan(0);
  });

  it('có khối số ngày sửa lại, kèm ngưỡng', async () => {
    mo('TBP');
    await doiHinh();
    expect(screen.getByText(/Trả lại rồi bao lâu mới quay lại/)).toBeTruthy();
  });
});
