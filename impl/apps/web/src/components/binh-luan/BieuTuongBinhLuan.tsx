/**
 * Biểu tượng của khối bình luận — nét 1.75 như `BieuTuong.tsx`, đường vẽ chép từ
 * mockup đã duyệt (`artifacts/binh-luan-mockup.html`). Tách tệp vì chín cái chỉ khối
 * này dùng; đặt vào `BieuTuong.tsx` là bắt mọi màn hình nạp chúng.
 */
import type { ReactNode } from 'react';

function Svg({ co = 18, children }: { co?: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={co}
      height={co}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const BtTraLoi = ({ co }: { co?: number }) => (
  <Svg co={co ?? 18}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 6 6v4" />
  </Svg>
);
export const BtThem = () => (
  <Svg>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Svg>
);
export const BtLienKet = () => (
  <Svg co={16}>
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
  </Svg>
);
export const BtBut = () => (
  <Svg co={16}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
);
export const BtXoa = () => (
  <Svg co={16}>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M9 7V4h6v3" />
  </Svg>
);
export const BtKep = () => (
  <Svg>
    <path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.3 3.3 0 0 1 4.7 4.7l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4L14.5 7" />
  </Svg>
);
export const BtDong = () => (
  <Svg co={16}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const BtCuoi = () => (
  <Svg co={16}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 14a4 4 0 0 0 7 0" />
    <path d="M9 9.5h.01M15 9.5h.01" />
  </Svg>
);
export const BtXuong = () => (
  <Svg co={16}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);
export const BtLen = () => (
  <Svg co={14}>
    <path d="M6 15l6-6 6 6" />
  </Svg>
);
export const BtKhoa = () => (
  <Svg co={22}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);
export const BtCanh = () => (
  <Svg co={16}>
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
);
