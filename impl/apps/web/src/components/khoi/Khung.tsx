/**
 * Vỏ chung của một khối trên trang tổng quan.
 *
 * Mỗi khối tự hỏng RIÊNG: lỗi hiện bên trong thẻ của nó, các khối khác vẫn chạy.
 * Quan trọng nhất với Quản trị hệ thống — bộ khối của họ chạm bốn service khác
 * nhau, và `notification` chết không được làm trắng cả trang.
 */
import type { ReactNode } from 'react';
import { BaoLoi, DangTai } from '../Chung.js';

export function Khoi({
  tieuDe,
  loi,
  dangTai,
  children = null,
}: {
  tieuDe: string;
  loi?: unknown;
  dangTai?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="khoi">
      <h2>{tieuDe}</h2>
      {loi !== null && loi !== undefined ? (
        <div className="the">
          <BaoLoi loi={loi} />
        </div>
      ) : dangTai ? (
        <div className="the">
          <DangTai />
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/**
 * Vì sao vai trò này không có hộp việc.
 *
 * Bắt buộc, không phải trang trí: một trang không có việc nào trông y hệt một
 * hệ thống hỏng, và người dùng sẽ gọi điện hỏi thay vì đọc tiếp phần bên dưới.
 */
export function ViSaoKhongCoViec({ ly_do }: { ly_do: string }) {
  return (
    <p className="giai-thich" role="note">
      {ly_do}
    </p>
  );
}
