/**
 * @vitest-environment jsdom
 *
 * `0036` — màn hình Nhật ký hồ sơ.
 *
 * Máy chủ trả `GET /policies/:id/events` từ chặng đầu và KHÔNG màn hình nào gọi
 * nó, nên mọi câu hỏi kiểu "ai trả hồ sơ này về, lý do gì" chỉ trả lời được
 * bằng cách đọc thẳng cơ sở dữ liệu. Đợt này nó thành màn hình vì thư báo đổi
 * trạng thái trỏ thẳng vào đây cho những người không phải xử lý gì.
 *
 * Ba thứ đáng kiểm, và cả ba đều là chỗ dễ hiện ra dữ liệu thô:
 *   1. Mã hành động phải thành CHỮ — kể cả những mã không có nút nào.
 *   2. Việc do hệ thống làm phải ghi "Hệ thống", không gán cho một người.
 *   3. Không uuid nào lọt ra màn hình.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NhatKyHoSo } from '@csbh/web/nhat-ky-ho-so';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TDV_ID = '11111111-1111-1111-1111-111111111111';
const TBP_ID = '22222222-2222-2222-2222-222222222222';

const MUC = [
  {
    seq: 1,
    fromStatus: null,
    toStatus: 'NHAP',
    action: 'CREATE',
    actorId: TDV_ID,
    actorRole: 'TDV',
    actorName: 'Nguyen Van Tdv',
    reason: null,
    at: '2026-08-01T03:00:00.000Z',
  },
  {
    seq: 2,
    fromStatus: 'NHAP',
    toStatus: 'CHO_TBP_DUYET',
    action: 'SUBMIT',
    actorId: TDV_ID,
    actorRole: 'TDV',
    actorName: 'Nguyen Van Tdv',
    reason: null,
    at: '2026-08-01T04:00:00.000Z',
  },
  {
    seq: 3,
    fromStatus: 'CHO_TBP_DUYET',
    toStatus: 'YEU_CAU_CHINH_SUA',
    action: 'TBP_RETURN',
    actorId: TBP_ID,
    actorRole: 'TBP',
    actorName: 'Tran Thi Tbp',
    reason: 'Thieu chung tu kem theo',
    at: '2026-08-02T02:00:00.000Z',
  },
  {
    // Hệ thống tự chuyển bước — `actorId` có, nhưng vai trò là SYSTEM.
    seq: 4,
    fromStatus: 'CHO_TBP_DUYET',
    toStatus: 'QUA_HAN_DUYET',
    action: 'SLA_OVERDUE',
    actorId: null,
    actorRole: 'SYSTEM',
    actorName: null,
    reason: null,
    at: '2026-08-16T02:00:00.000Z',
  },
];

const HO_SO = { id: 'hs-1', code: 'CSBH-2026-000123', status: 'YEU_CAU_CHINH_SUA', versionNo: 2 };

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const mo = (muc: unknown = MUC) => {
  const f = vi.fn((duong: unknown) =>
    Promise.resolve(json(String(duong).includes('/events') ? muc : HO_SO)),
  );
  vi.stubGlobal('fetch', f);
  render(<NhatKyHoSo id="hs-1" />);
  return f;
};

const chu = () => document.body.textContent ?? '';

describe('mã hành động hiện ra thành chữ', () => {
  it('cả những mã KHÔNG có nút nào — hệ thống chuyển bước, quá hạn', async () => {
    mo();
    await waitFor(() => expect(chu()).toContain('Lập hồ sơ'));
    expect(chu()).toContain('Gửi duyệt');
    expect(chu()).toContain('Trưởng bộ phận trả lại để chỉnh sửa');
    // Đây mới là dòng đáng kiểm: `SLA_OVERDUE` không có nút nào nên nó vắng mặt
    // trong bảng nhãn nút, và thiếu nó thì đúng dòng khó hiểu nhất lại hiện ra
    // dưới dạng mã viết hoa.
    expect(chu()).toContain('Quá hạn xử lý');
    expect(chu()).not.toContain('SLA_OVERDUE');
    expect(chu()).not.toContain('TBP_RETURN');
  });

  it('trạng thái cũng là chữ, và hiện CẢ HAI đầu của bước chuyển', async () => {
    mo();
    // "Chờ TBP duyệt" một mình không nói được hồ sơ vừa đi tới hay vừa quay lại.
    await waitFor(() => expect(chu()).toContain('Yêu cầu chỉnh sửa'));
    expect(chu()).toContain('Chờ TBP duyệt');
    expect(chu()).not.toContain('YEU_CAU_CHINH_SUA');
  });
});

describe('người thực hiện', () => {
  it('ghi tên kèm vai trò, KHÔNG bày uuid ra màn hình', async () => {
    mo();
    await waitFor(() => expect(chu()).toContain('Nguyen Van Tdv'));
    expect(chu()).toContain('Trưởng bộ phận');
    expect(chu()).not.toContain(TDV_ID);
    expect(chu()).not.toContain(TBP_ID);
  });

  it('việc do hệ thống làm ghi "Hệ thống", không gán cho ai', async () => {
    mo();
    await waitFor(() => expect(chu()).toContain('Hệ thống'));
  });

  it('identity không tra được tên thì nói thẳng, không hiện uuid', async () => {
    // Một chuỗi 36 ký tự ở cột "Người thực hiện" trông như dữ liệu hỏng.
    mo([{ ...MUC[0], actorName: null }]);
    await waitFor(() => expect(chu()).toContain('không tra được tên'));
    expect(chu()).not.toContain(TDV_ID);
  });
});

describe('lý do', () => {
  it('hiện nguyên văn lý do trả lại — đó là thứ người ta vào đây để đọc', async () => {
    mo();
    await waitFor(() => expect(chu()).toContain('Thieu chung tu kem theo'));
  });
});

describe('nhật ký rỗng', () => {
  it('nói rõ là chưa có bước nào, không hiện một bảng trống', async () => {
    mo([]);
    await waitFor(() => expect(chu()).toContain('Chưa có bước nào'));
    expect(screen.queryByRole('table')).toBeNull();
  });
});
