/**
 * Trợ giúp thao tác với `ChonCoGo` (`0280`) — thay cho `selectOptions` / `.options`
 * của `<select>`. Ô chọn có gõ hiện NHÃN trong ô, còn giá trị thật nằm ở
 * `data-gia`; danh sách chỉ có trong DOM khi ô đang mở.
 */
import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Giá trị THẬT đang chọn của một ô. */
export const giaTri = (o: HTMLElement): string => o.getAttribute('data-gia') ?? '';

/** Mở danh sách (bấm vào ô) rồi trả về các mục: `{ gia, nhan }`. */
export async function docMuc(nguoi: UserEvent, o: HTMLElement): Promise<{ gia: string; nhan: string; phu: string; chu: string }[]> {
  await nguoi.click(o);
  const lb = await screen.findByRole('listbox');
  return within(lb)
    .getAllByRole('option')
    .map((m) => {
      const nhan = m.querySelector('.chon-go-nhan')?.textContent ?? '';
      const phu = m.querySelector('.chon-go-phu')?.textContent ?? '';
      // `chu` = nhãn + " · " + dòng phụ, đúng chữ `<option>` cũ hiện ra.
      return { gia: m.getAttribute('data-gia') ?? '', nhan, phu, chu: phu ? `${nhan} · ${phu}` : nhan };
    });
}

/** Chọn một mục theo GIÁ TRỊ hoặc theo chữ hiện trong danh sách — như `selectOptions`. */
export async function chonMuc(nguoi: UserEvent, o: HTMLElement, gia: string | RegExp): Promise<void> {
  await nguoi.click(o);
  const lb = await screen.findByRole('listbox');
  const ds = within(lb).getAllByRole('option');
  const m = ds.find((x) =>
    typeof gia === 'string'
      ? x.getAttribute('data-gia') === gia || x.textContent === gia
      : gia.test(x.textContent ?? ''),
  );
  if (!m) throw new Error(`Không có mục "${String(gia)}" trong danh sách: ${ds.map((x) => x.textContent).join(' | ')}`);
  await nguoi.click(m);
}
