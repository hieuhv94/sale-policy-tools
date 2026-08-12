/**
 * @vitest-environment jsdom
 *
 * Thao tác không lùi được phải HỎI LẠI trước khi chạy.
 *
 * Hai phần, kiểm hai kiểu sai khác nhau:
 *
 *   1. Bản thân hộp thoại có làm đúng việc của nó không — mức nặng phải khoá nút
 *      cho tới khi gõ đúng chuỗi, thanh hoàn tác phải gọi được hàm lùi.
 *   2. QUÉT MÃ NGUỒN: tệp nào gọi `xoa()` hoặc chạm một đường ghi ra ngoài hệ
 *      thống thì phải có xác nhận trong chính tệp đó. Đây mới là test giữ được
 *      bất biến về sau — một nút Xoá mới thêm ở màn hình mới sẽ đỏ ngay, chứ
 *      không chờ ai đó nhớ ra là phải hỏi lại.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HOAN_TAC_MS, HopThoaiXacNhan, ThanhHoanTac } from '@csbh/web/chung';

afterEach(cleanup);

describe('HopThoaiXacNhan', () => {
  it('mức thường: bấm được ngay, và nêu hậu quả chứ không hỏi "chắc chưa"', async () => {
    const xacNhan = vi.fn();
    render(
      <HopThoaiXacNhan
        tieuDe="Gỡ tệp"
        hauQua={<p>Bước bàn giao sẽ bị chặn lại.</p>}
        nhanNut="Gỡ tệp"
        dong={() => undefined}
        xacNhan={xacNhan}
      />,
    );
    expect(screen.getByText('Bước bàn giao sẽ bị chặn lại.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Gỡ tệp' }));
    expect(xacNhan).toHaveBeenCalledTimes(1);
  });

  it('mức nặng: nút KHOÁ cho tới khi gõ đúng chuỗi', async () => {
    const xacNhan = vi.fn();
    render(
      <HopThoaiXacNhan
        tieuDe="Ban hành mẫu"
        hauQua={<p>Mọi lượt xuất hợp đồng đều dùng mẫu này.</p>}
        nhanNut="Ban hành"
        goLai="Mau hop dong 2026"
        dong={() => undefined}
        xacNhan={xacNhan}
      />,
    );
    const nut = screen.getByRole('button', { name: 'Ban hành' }) as HTMLButtonElement;
    expect(nut.disabled).toBe(true);

    // Gõ gần đúng vẫn không mở — đó là toàn bộ giá trị của mức này.
    await userEvent.type(screen.getByRole('textbox'), 'Mau hop dong');
    expect((screen.getByRole('button', { name: 'Ban hành' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    await userEvent.type(screen.getByRole('textbox'), ' 2026');
    await userEvent.click(screen.getByRole('button', { name: 'Ban hành' }));
    expect(xacNhan).toHaveBeenCalledTimes(1);
  });

  it('bỏ qua khoảng trắng thừa hai đầu', async () => {
    const xacNhan = vi.fn();
    render(
      <HopThoaiXacNhan
        tieuDe="Xoá"
        hauQua={<p>x</p>}
        nhanNut="Xoá"
        goLai="ABC"
        dong={() => undefined}
        xacNhan={xacNhan}
      />,
    );
    // Dán từ chỗ khác thường kéo theo một dấu cách; chặn vì dấu cách vô hình là
    // kiểu bực mình vô nghĩa.
    await userEvent.type(screen.getByRole('textbox'), ' ABC ');
    await userEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(xacNhan).toHaveBeenCalledTimes(1);
  });

  it('đang chạy thì không bấm được lần thứ hai', () => {
    render(
      <HopThoaiXacNhan
        tieuDe="Xoá"
        hauQua={<p>x</p>}
        nhanNut="Xoá"
        dangChay
        dong={() => undefined}
        xacNhan={() => undefined}
      />,
    );
    expect((screen.getByRole('button', { name: 'Đang chạy…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe('ThanhHoanTac', () => {
  it('gọi hàm lùi khi bấm Hoàn tác', async () => {
    const hoanTac = vi.fn();
    render(<ThanhHoanTac loi="Đã ngừng dùng người ký A." hoanTac={hoanTac} dong={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(hoanTac).toHaveBeenCalledTimes(1);
  });

  it('tự tắt sau HOAN_TAC_MS', () => {
    vi.useFakeTimers();
    try {
      const dong = vi.fn();
      render(<ThanhHoanTac loi="x" hoanTac={() => undefined} dong={dong} />);
      expect(dong).not.toHaveBeenCalled();
      vi.advanceTimersByTime(HOAN_TAC_MS);
      expect(dong).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

// =============================================================================
// Quét mã nguồn: nút nguy hiểm nào cũng phải đi qua một lớp hỏi lại
// =============================================================================

const GOC = 'apps/web/src';

function moiTep(thuMuc: string, duoi: string[]): string[] {
  const ra: string[] = [];
  for (const t of readdirSync(thuMuc)) {
    const d = join(thuMuc, t);
    if (statSync(d).isDirectory()) ra.push(...moiTep(d, duoi));
    else if (duoi.some((x) => d.endsWith(x))) ra.push(d);
  }
  return ra;
}

/**
 * Đường ghi phải hỏi lại, và vì sao — mỗi dòng là một cách hỏng riêng.
 *
 * Không liệt kê MỌI đường ghi: tạo và sửa trong hộp thoại đã có nút Lưu rõ ràng,
 * hỏi thêm một lần nữa chỉ tổ dạy người dùng bấm cho qua.
 */
const PHAI_HOI: { mau: RegExp; viec: string }[] = [
  { mau: /\bxoa\(/, viec: 'xoá dữ liệu' },
  { mau: /resend-invite/, viec: 'gửi lại thư mời (giết liên kết cũ)' },
  { mau: /\/deactivate/, viec: 'vô hiệu hoá / ngừng dùng' },
  { mau: /\/publish/, viec: 'ban hành mẫu hợp đồng' },
  { mau: /dead-letters\/\$\{[^}]+\}\/retry/, viec: 'gửi lại thư hỏng' },
  { mau: /'\/sla\/config'/, viec: 'đổi hạn xử lý toàn hệ thống' },
];

/** Có lớp hỏi lại: hộp thoại xác nhận, hoặc thanh hoàn tác cho việc lùi được. */
const CO_LOP_HOI = /HopThoaiXacNhan|ThanhHoanTac/;

describe('mọi thao tác nguy hiểm đều có lớp hỏi lại', () => {
  it('không tệp nào gọi thẳng mà không hỏi', () => {
    const lac: string[] = [];
    for (const tep of moiTep(GOC, ['.ts', '.tsx'])) {
      // `api.ts` định nghĩa chính hàm `xoa`; `Chung.tsx` là nơi ở của lớp hỏi.
      if (tep.endsWith('lib/api.ts') || tep.endsWith('components/Chung.tsx')) continue;
      const src = readFileSync(tep, 'utf8');
      const coLop = CO_LOP_HOI.test(src) || src.includes('XoaHoSo');
      for (const { mau, viec } of PHAI_HOI) {
        if (mau.test(src) && !coLop) lac.push(`${tep} — ${viec}`);
      }
    }
    expect(lac, `thiếu bước hỏi lại:\n${lac.join('\n')}`).toEqual([]);
  });

  it('câu hỏi phải nêu HẬU QUẢ, không phải "bạn có chắc không"', () => {
    // "Bạn có chắc không?" không thêm một thông tin nào. Người dùng đọc nó xong
    // vẫn không biết mình sắp làm hỏng cái gì, và lần thứ ba thì bấm theo phản xạ.
    const lac: string[] = [];
    for (const tep of moiTep(GOC, ['.tsx'])) {
      const src = readFileSync(tep, 'utf8');
      for (const [i, dong] of src.split('\n').entries()) {
        // Bỏ qua chú thích: chúng NHẮC tới câu đó để giải thích vì sao không
        // dùng, và cấm cả chú thích thì lời giải thích phải biến mất theo.
        const t = dong.trim();
        if (t.startsWith('*') || t.startsWith('//')) continue;
        if (/[Bb]ạn có chắc|[Cc]hắc chưa/.test(dong)) lac.push(`${tep}:${i + 1}`);
      }
    }
    expect(lac, `câu hỏi rỗng nghĩa:\n${lac.join('\n')}`).toEqual([]);
  });
});
