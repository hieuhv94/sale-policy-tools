/**
 * @vitest-environment jsdom
 *
 * `0093` — trang *Thống kê*: bảng tra theo vai trò, và màn hình dựng từ chúng.
 *
 * Cái sai cần bắt ở đây không phải một hàm trả sai giá trị mà là **một ô vắng
 * mặt hoặc một ô thừa**: một vai trò không có cột nào, hoặc Quản trị hệ thống
 * được bày một bảng hồ sơ toàn số 0. Không lỗi nào trong hai lỗi ấy làm màn
 * hình đỏ lên — chúng chỉ làm nó sai một cách im lặng.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PhienProvider, usePhien } from '@csbh/web/auth';
import { BoDinhTuyen } from '@csbh/web/router';
import { ThongKe } from '@csbh/web/thong-ke-ui';
import { DIEU_HUONG, VAI_TRO, xem, type VaiTro } from '@csbh/web/can';
import {
  COT,
  COT_THEO_VAI_TRO,
  KHOI_CAN_SO_LIEU,
  KHOI_DOC_NHAT_KY,
  KHOI_THEO_VAI_TRO,
  KY_MAC_DINH,
  LY_DO_KHONG_CO_SO,
  MOI_KY,
  NHAN_KY,
  THE_THEO_VAI_TRO,
} from '@csbh/web/thong-ke';

const doc = (p: string) => readFileSync(`apps/web/src/${p}`, 'utf8');

describe('bảng tra phủ đủ sáu vai trò', () => {
  it('không vai trò nào thiếu khoá trong ba bảng', () => {
    for (const b of [COT_THEO_VAI_TRO, THE_THEO_VAI_TRO, KHOI_THEO_VAI_TRO]) {
      expect(Object.keys(b).sort()).toEqual([...VAI_TRO].sort());
    }
  });

  it('mọi vai trò đều có ít nhất một thứ để nhìn', () => {
    // Đây đúng là lỗi mà trang *Báo cáo* cũ mắc phải với Quản trị hệ thống: mở
    // ra thấy "0 hồ sơ trong phạm vi dữ liệu của bạn" và không gì khác.
    for (const v of VAI_TRO) {
      expect(KHOI_THEO_VAI_TRO[v].length, `vai trò ${v} sẽ ra trang trắng`).toBeGreaterThan(0);
    }
  });

  it('mọi tên cột đều có mô tả trong `COT`', () => {
    for (const v of VAI_TRO) {
      for (const c of [...COT_THEO_VAI_TRO[v], ...THE_THEO_VAI_TRO[v]]) {
        expect(COT[c], `cột ${c} của ${v} chưa khai`).toBeDefined();
        // `neo` là câu trả lời cho "con số này tính theo mốc nào", và nó hiện
        // thành chú giải dưới bảng. Cột thiếu nó là một cột không giải thích
        // được — mà "lập trong tháng hay có hiệu lực trong tháng" là hai con số
        // khác nhau.
        expect(COT[c]!.neo.length, `cột ${c} thiếu mô tả mốc`).toBeGreaterThan(0);
      }
    }
  });

  it('thẻ so sánh là TẬP CON của cột trong bảng', () => {
    // Một chỉ số nổi lên dải thẻ mà không có trong bảng thì người đọc không tra
    // lại được nó theo từng kỳ.
    for (const v of VAI_TRO) {
      for (const t of THE_THEO_VAI_TRO[v]) {
        expect(COT_THEO_VAI_TRO[v], `${v}: thẻ ${t} không có cột tương ứng`).toContain(t);
      }
    }
  });
});

describe('`0093` Quản trị hệ thống KHÔNG được bày số hồ sơ', () => {
  it('không có cột nào, không có thẻ nào, và không gọi `/reports`', () => {
    /*
     * `idn.scope_user_ids` trả RỖNG cho vai trò này, nên mọi con số hồ sơ đều
     * bằng 0. Bày một bảng toàn số 0 là nói với người xem rằng hệ thống không
     * có hoạt động nào — đúng về kỹ thuật, sai hoàn toàn về nghĩa.
     */
    expect(COT_THEO_VAI_TRO.QUAN_TRI).toEqual([]);
    expect(THE_THEO_VAI_TRO.QUAN_TRI).toEqual([]);
    expect(KHOI_THEO_VAI_TRO.QUAN_TRI.some((k) => KHOI_CAN_SO_LIEU.includes(k))).toBe(false);
  });

  it('có câu giải thích, và câu ấy nói ra vì sao', () => {
    expect(KHOI_THEO_VAI_TRO.QUAN_TRI).toContain('vi-sao-khong-co-so');
    expect(LY_DO_KHONG_CO_SO.QUAN_TRI).toBeDefined();
    expect(LY_DO_KHONG_CO_SO.QUAN_TRI).toMatch(/phạm vi dữ liệu/);
  });

  it('vai trò nào đọc `/audit` thì phải xem được mục Nhật ký', () => {
    // Cùng phép đối chiếu mà `0086` để lại ở trang Tổng quan: quyền và bố cục
    // nằm ở hai tệp, và sót một bên thì khối ấy nhận 403 giữa màn hình.
    for (const v of VAI_TRO) {
      const doc = KHOI_THEO_VAI_TRO[v].some((k) => KHOI_DOC_NHAT_KY.includes(k));
      if (doc) expect(xem(v, 'nhatKy'), `${v} đọc /audit mà không có quyền nhatKy`).toBe(true);
    }
  });
});

describe('`0093` nhịp mặc định theo vai trò', () => {
  it('mỗi vai trò có một nhịp, và nhịp ấy nằm trong bốn giá trị hợp lệ', () => {
    for (const v of VAI_TRO) {
      expect(MOI_KY, `${v}`).toContain(KY_MAC_DINH[v]);
    }
  });

  it('Ban lãnh đạo mở ra ở nhịp DÀI, người trong luồng ở nhịp ngắn', () => {
    /*
     * Không phải chuyện thẩm mỹ. Chiết khấu bình quân theo tuần nhảy loạn vì
     * mỗi tuần chỉ vài hồ sơ có hiệu lực; còn khối lượng ký của Trưởng bộ phận
     * dồn theo tuần, nên xem theo quý thì một tuần dồn việc biến mất.
     */
    expect(KY_MAC_DINH.BAN_LANH_DAO).toBe('quy');
    expect(KY_MAC_DINH.TBP).toBe('tuan');
    expect(KY_MAC_DINH.SALE_ADMIN).toBe('tuan');
    expect(KY_MAC_DINH.KE_TOAN).toBe('tuan');
    expect(KY_MAC_DINH.TDV).toBe('thang');
  });
});

describe('`0093` trang đổi tên và không lặp lại Tổng quan', () => {
  it('mục menu tên là "Thống kê" và trỏ vào `/thong-ke`', () => {
    const m = DIEU_HUONG.find((x) => x.duong === '/thong-ke');
    expect(m).toBeDefined();
    expect(m!.nhan).toBe('Thống kê');
    expect(DIEU_HUONG.some((x) => x.duong === '/bao-cao')).toBe(false);
  });

  it('KHÔNG cột nào đếm tồn tại thời điểm', () => {
    /*
     * Quy tắc "tồn thì không cộng, dòng thì cộng". Số hồ sơ ĐANG CHỜ không cộng
     * theo kỳ được — ba tháng mỗi tháng "40 đang chờ" không thành 120, phần lớn
     * vẫn là cùng những hồ sơ ấy. Nếu một cột như thế lọt vào bảng theo kỳ thì
     * cả cột là số vô nghĩa, mà nhìn thì không phân biệt được với cột đúng.
     */
    const tonTai = ['dangCho', 'sapQuaHan', 'tong', 'dangCoHieuLuc'];
    for (const v of VAI_TRO) {
      for (const c of COT_THEO_VAI_TRO[v]) expect(tonTai).not.toContain(c);
    }
  });

  it('màn hình không còn khối SLA và tỷ lệ trả lại kiểu ảnh chụp', () => {
    const src = doc('pages/ThongKe.tsx');
    expect(src).not.toMatch(/Hạn xử lý/);
    expect(src).not.toMatch(/Tiến độ theo trạng thái/);
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

const KY_MAU = {
  ma: '2026-08-01',
  nhan: 'Tháng 8/2026',
  tu: '2026-07-31T17:00:00.000Z',
  den: '2026-08-31T17:00:00.000Z',
  dangChay: true,
  dem: {
    lapMoi: 7,
    guiDuyet: 6,
    tbpKy: 5,
    ktNhanL1: 4,
    banGiao: 3,
    hopDong: 3,
    coHieuLuc: 2,
    traLai: 1,
    tuChoi: 0,
    quaHan: 0,
    hetHieuLuc: 1,
  },
  giaTri: 12_000_000,
  soNgayDuyetTb: 4.5,
  chietKhauTb: 12.5,
  soDong: 8,
  dongVuotNguong: 2,
  tyLeVuotNguong: 25,
  tyLeTraLai: 16.67,
};

const BO = {
  ky: 'thang',
  soKy: 12,
  muiGio: 'Asia/Ho_Chi_Minh',
  chuoi: [{ ...KY_MAU, ma: '2026-07-01', nhan: 'Tháng 7/2026', dangChay: false }, KY_MAU],
  soSanh: {
    kyNay: KY_MAU,
    kyTruoc: { ...KY_MAU, ma: '2026-07-01', nhan: 'Tháng 7/2026', dangChay: false, giaTri: 9_000_000 },
    daQua: 21 * 24 * 3600_000,
    denKyTruoc: '2026-07-22T03:00:00.000Z',
  },
  loaiTruLegacy: 3,
};

const HOAT_DONG = {
  ky: 'thang',
  chuoi: [{ ma: '2026-08-01', nhan: 'Tháng 8/2026', tu: '', den: '', dangChay: true, tong: 42, nguoi: 3, theoDoiTuong: { policy: 40 } }],
  window: { from: '2026-02-22T00:00:00.000Z', months: 6 },
  kyBiCat: 0,
};

/** Ghi lại MỌI đường mà màn hình gọi — dùng để khẳng định vai trò nào gọi gì. */
let daGoi: string[] = [];
let vaiTroPhien: VaiTro = 'TDV';

const chan = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn((duong: string) => {
      daGoi.push(duong);
      /*
       * `/auth/me` phải trả về NGƯỜI DÙNG THẬT.
       *
       * `PhienProvider` gọi nó ngay khi gắn vào cây rồi ghi đè phiên đang có
       * bằng thứ máy chủ trả lời. Chặn một cách qua loa — trả cùng một thân cho
       * mọi đường — làm vai trò biến mất sau lượt vẽ thứ hai, và màn hình rỗng
       * đi trong im lặng: đúng chỗ tốn nửa giờ để hiểu vì sao bảng không hiện.
       */
      const than = duong.includes('/auth/me')
        ? phien(vaiTroPhien).user
        : duong.includes('/audit/')
          ? HOAT_DONG
          : duong.includes('/nhom')
            ? { ky: 'thang', chuoi: [{ ma: '2026-08-01', nhan: 'Tháng 8/2026' }], dong: [] }
            : BO;
      return Promise.resolve(
        new Response(JSON.stringify(than), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );

/**
 * Cổng chờ phiên — DỰNG MÀN HÌNH ĐÚNG NHƯ `App.tsx` dựng.
 *
 * `App` không dựng gì chừng nào còn đang kiểm phiên (`0076`), nên mọi màn hình
 * thật đều gắn vào cây SAU khi đã biết vai trò. Bỏ cổng này đi thì `ThongKe`
 * gắn vào lúc `nguoiDung` còn rỗng và chốt nhịp mặc định theo một vai trò rỗng
 * — một cảnh không xảy ra trong phần mềm thật, nhưng đủ để ca kiểm đỏ và dẫn
 * người đọc đi sai đường nửa giờ.
 */
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

beforeEach(() => {
  daGoi = [];
  chan();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('`0093` màn hình dựng theo bảng tra', () => {
  it('TDV thấy đúng những cột của mình, không thấy cột của người khác', async () => {
    mo('TDV');
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    const dau = screen.getAllByRole('columnheader').map((th) => th.textContent);
    for (const c of COT_THEO_VAI_TRO.TDV) expect(dau).toContain(COT[c]!.nhan);
    // "TBP ký" là việc của người khác — một TDV không làm gì được với con số ấy.
    expect(dau).not.toContain(COT['tbpKy']!.nhan);
  });

  it('Quản trị hệ thống KHÔNG gọi `/reports`, và thấy câu giải thích', async () => {
    mo('QUAN_TRI');
    await waitFor(() => expect(screen.getByRole('note')).toBeTruthy());
    expect(daGoi.some((d) => d.includes('/reports/'))).toBe(false);
    expect(daGoi.some((d) => d.includes('/audit/thong-ke'))).toBe(true);
  });

  it('mở ra là đã đúng NHỊP của vai trò, và đổi nhịp thì gọi lại', async () => {
    mo('BAN_LANH_DAO');
    const soLieu = () => daGoi.filter((d) => d.includes('/thong-ke'));
    await waitFor(() => expect(soLieu().length).toBeGreaterThan(0));
    expect(soLieu().every((d) => d.includes('ky=quy'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: NHAN_KY.tuan }));
    await waitFor(() => expect(soLieu().some((d) => d.includes('ky=tuan'))).toBe(true));
  });

  it('kỳ ĐANG CHẠY được đánh dấu, và câu chú thích nói ra phép so cùng số ngày', async () => {
    mo('TDV');
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    expect(screen.getAllByText(/đang chạy/).length).toBeGreaterThan(0);
    expect(screen.getByText(/so cùng số ngày/)).toBeTruthy();
  });

  it('số hồ sơ dữ liệu cũ bị loại được NÓI RA', async () => {
    mo('TDV');
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    expect(screen.getByText(/Đã loại 3 hồ sơ nhập từ dữ liệu cũ/)).toBeTruthy();
  });

  it('Ban lãnh đạo có thêm khối chiết khấu theo nhóm', async () => {
    mo('BAN_LANH_DAO');
    await waitFor(() => expect(daGoi.some((d) => d.includes('/thong-ke/nhom'))).toBe(true));
    expect(screen.getByRole('heading', { name: /nhóm sản phẩm/i })).toBeTruthy();
  });
});
