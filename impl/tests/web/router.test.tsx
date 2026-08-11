/**
 * @vitest-environment jsdom
 *
 * Bộ định tuyến tự viết — phần chuỗi truy vấn.
 *
 * Trang tổng quan dẫn tới `/ho-so?status=CHO_TBP_DUYET`. Nếu bộ định tuyến gộp
 * chuỗi truy vấn vào đường dẫn thì `App` so `duong === '/ho-so'` sẽ trượt, và
 * người dùng bấm một con số lại rơi vào màn hình "không có màn hình nào ở địa
 * chỉ này" — một lỗi không test nào trước đây bắt được, vì trước đây chưa có
 * liên kết nào mang chuỗi truy vấn.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoDinhTuyen, Lien, khop, useDuong } from '@csbh/web/router';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

function ManHinhThu() {
  const { duong, truyVan } = useDuong();
  return (
    <>
      <p data-testid="duong">{duong}</p>
      <p data-testid="status">{truyVan.get('status') ?? '(rỗng)'}</p>
      <Lien den="/ho-so?status=CHO_TBP_DUYET">tới chờ TBP</Lien>
      <Lien den="/ho-so?status=NHAP">tới nháp</Lien>
      <Lien den="/ho-so">tới danh sách</Lien>
    </>
  );
}

const dung = () =>
  render(
    <BoDinhTuyen>
      <ManHinhThu />
    </BoDinhTuyen>,
  );

const duong = () => screen.getByTestId('duong').textContent;
const status = () => screen.getByTestId('status').textContent;

describe('chuỗi truy vấn tách khỏi đường dẫn', () => {
  it('đi tới liên kết có tham số thì `duong` vẫn là đường dẫn thuần', async () => {
    const nguoi = userEvent.setup();
    dung();
    await nguoi.click(screen.getByText('tới chờ TBP'));
    expect(duong()).toBe('/ho-so');
    expect(status()).toBe('CHO_TBP_DUYET');
    // Thanh địa chỉ thì phải mang đủ, để tải lại trang vẫn ra đúng bộ lọc.
    expect(window.location.pathname + window.location.search).toBe(
      '/ho-so?status=CHO_TBP_DUYET',
    );
  });

  it('đọc được tham số ngay từ lần vẽ đầu, không cần bấm gì', () => {
    window.history.replaceState(null, '', '/ho-so?status=TU_CHOI');
    dung();
    expect(duong()).toBe('/ho-so');
    expect(status()).toBe('TU_CHOI');
  });

  it('bấm hai thẻ khác nhau cùng trỏ về /ho-so là HAI lần chuyển màn hình', async () => {
    const nguoi = userEvent.setup();
    dung();
    await nguoi.click(screen.getByText('tới chờ TBP'));
    expect(status()).toBe('CHO_TBP_DUYET');
    // Bản cũ chỉ so đường dẫn, nên lần bấm thứ hai bị coi là "đã ở đó rồi" và
    // màn hình đứng yên với bộ lọc cũ — con số vừa bấm và danh sách đang hiện
    // không khớp nhau.
    await nguoi.click(screen.getByText('tới nháp'));
    expect(status()).toBe('NHAP');
  });

  it('bấm liên kết không tham số thì xoá sạch tham số cũ', async () => {
    const nguoi = userEvent.setup();
    window.history.replaceState(null, '', '/ho-so?status=NHAP');
    dung();
    await nguoi.click(screen.getByText('tới danh sách'));
    expect(duong()).toBe('/ho-so');
    expect(status()).toBe('(rỗng)');
    expect(window.location.search).toBe('');
  });
});

describe('khớp mẫu đường dẫn không bị chuỗi truy vấn phá', () => {
  it('`/ho-so/:id` vẫn khớp khi địa chỉ có tham số', () => {
    window.history.replaceState(null, '', '/ho-so/abc-123?x=1');
    dung();
    expect(khop('/ho-so/:id', duong() ?? '')).toEqual({ id: 'abc-123' });
  });

  it('`/ho-so` KHÔNG khớp mẫu có tham số đường dẫn', () => {
    expect(khop('/ho-so/:id', '/ho-so')).toBeNull();
  });
});
