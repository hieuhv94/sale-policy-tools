/**
 * @vitest-environment jsdom
 *
 * `0237` — hộp thoại KHÔNG đóng khi bấm ra ngoài, và MỖI hộp thoại có một nút
 * đóng nhìn thấy được (khách hàng 29/09).
 *
 * Hai nửa đi cùng nhau: bỏ đường "bấm ra ngoài" thì nút là lối thoát nhìn thấy
 * được DUY NHẤT (Escape không ai nhìn thấy), nên một hộp thiếu nút là hộp người
 * dùng bị kẹt. Lượt rà tìm ra đúng một hộp như thế — *Xem trước thay đổi danh
 * mục*, nơi *Chọn tệp khác* chỉ lùi một bước.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { HopThoai } from '@csbh/web/chung';

afterEach(cleanup);

describe('`0237` bấm ra ngoài không đóng hộp thoại', () => {
  it('mousedown/click trên LỚP PHỦ không gọi `dong`; Escape vẫn gọi', () => {
    const dong = vi.fn();
    render(
      <HopThoai tieuDe="Thử" dong={dong}>
        <button type="button">Một nút</button>
      </HopThoai>,
    );
    const lopPhu = document.querySelector('.lop-phu')!;
    expect(lopPhu).not.toBeNull();
    // Đúng đường cũ: `mousedown` với target là CHÍNH lớp phủ.
    fireEvent.mouseDown(lopPhu);
    fireEvent.click(lopPhu);
    fireEvent.pointerDown(lopPhu);
    expect(dong).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dong).toHaveBeenCalledTimes(1);
  });
});

/** Mọi tệp `.tsx` của giao diện. */
const tepTsx = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? tepTsx(p) : p.endsWith('.tsx') ? [p] : [];
  });

/**
 * Mỗi chỗ dựng `<HopThoai …>…</HopThoai>`: biểu thức truyền vào `dong`, và các
 * nút bên trong khối cùng biểu thức `onClick` của chúng.
 *
 * Thẻ mở `<button …>` kết thúc ở `>` KHÔNG đứng sau `=`: bản đầu cắt ở `>` đầu
 * tiên, tức ở giữa `onClick={() => …}`, và báo nhầm hộp *Ánh xạ* là thiếu nút.
 */
const hopThoai = () =>
  tepTsx('apps/web/src').flatMap((f) => {
    const s = readFileSync(f, 'utf8');
    return [...s.matchAll(/<HopThoai(?![A-Za-z])/g)].map((m) => {
      const khoi = s.slice(m.index, s.indexOf('</HopThoai>', m.index));
      const dong = /\bdong=\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(khoi)?.[1]?.trim() ?? null;
      const nut = [...khoi.matchAll(/<button\b((?:=>|[^>])*)>([\s\S]*?)<\/button>/g)].map((b) => ({
        onClick: /onClick=\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(b[1]!)?.[1]?.trim() ?? null,
        chu: b[2]!.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\s+/g, ' ').trim(),
      }));
      return { noi: `${f}:${s.slice(0, m.index).split('\n').length}`, dong, nut };
    });
  });

describe('`0237` mỗi hộp thoại có một nút đóng nhìn thấy được', () => {
  it('phép quét THẬT SỰ tìm thấy các hộp thoại (≥ 20)', () => {
    // Biểu thức lạc hậu thì danh sách rỗng và ca dưới xanh vô nghĩa.
    expect(hopThoai().length).toBeGreaterThanOrEqual(20);
  });

  it('trong khối của mỗi `<HopThoai>` có một nút gọi CHÍNH biểu thức `dong` của nó', () => {
    const thieu = hopThoai()
      .filter((h) => h.dong === null || !h.nut.some((n) => n.onClick === h.dong))
      .map((h) => `${h.noi} (dong=${h.dong ?? '?'}; nút: ${h.nut.map((n) => n.chu).join(' · ') || 'không có'})`);
    expect(thieu, thieu.join('\n')).toEqual([]);
  });
});
