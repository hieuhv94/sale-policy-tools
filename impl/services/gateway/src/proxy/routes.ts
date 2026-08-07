/**
 * Bảng định tuyến: tiền tố đường dẫn → service phía sau.
 *
 * DANH SÁCH TRẮNG, không phải danh sách đen. Đường dẫn không khớp tiền tố nào ở
 * đây thì trả 404 và không đi đâu cả. Ngược lại — chuyển tiếp mọi thứ trừ vài
 * đường bị cấm — nghĩa là mỗi service mới thêm route nào là route đó tự động lộ
 * ra ngoài Internet, kể cả route nội bộ mà tác giả không hề nghĩ tới.
 *
 * Chính vì thế `internal/**` KHÔNG có mặt ở đây. Token dịch vụ đã chặn ở tầng
 * service (AUTH-21), nhưng đó là lớp thứ hai; lớp thứ nhất là gateway không có
 * đường nào dẫn tới chúng.
 */
export type Upstream = { prefix: string; url: () => string; name: string };

const env = (k: string, d: string) => (): string => process.env[k] ?? d;

export const UPSTREAMS: Upstream[] = [
  { prefix: '/auth', name: 'identity', url: env('IDENTITY_URL', 'http://identity:3001') },
  { prefix: '/users', name: 'identity', url: env('IDENTITY_URL', 'http://identity:3001') },
  { prefix: '/catalog', name: 'catalog', url: env('CATALOG_URL', 'http://catalog:3002') },
  { prefix: '/customers', name: 'customer', url: env('CUSTOMER_URL', 'http://customer:3003') },
  { prefix: '/policies', name: 'policy', url: env('POLICY_URL', 'http://policy:3004') },
  { prefix: '/sla-config', name: 'policy', url: env('POLICY_URL', 'http://policy:3004') },
  { prefix: '/files', name: 'document', url: env('DOCUMENT_URL', 'http://document:3005') },
  { prefix: '/render', name: 'document', url: env('DOCUMENT_URL', 'http://document:3005') },
  { prefix: '/contracts', name: 'document', url: env('DOCUMENT_URL', 'http://document:3005') },
  { prefix: '/notifications', name: 'notification', url: env('NOTIFICATION_URL', 'http://notification:3006') },
  { prefix: '/audit', name: 'audit', url: env('AUDIT_URL', 'http://audit:3007') },
  { prefix: '/reports', name: 'reporting', url: env('REPORTING_URL', 'http://reporting:3008') },
];

/**
 * Tìm service phía sau cho một đường dẫn.
 *
 * So khớp theo ĐOẠN đường dẫn, không theo chuỗi con: `startsWith('/auth')` cũng
 * khớp `/authorize-something` và sẽ chuyển tiếp một đường dẫn lạ tới identity.
 */
export function resolveUpstream(path: string): Upstream | undefined {
  return UPSTREAMS.find((u) => path === u.prefix || path.startsWith(`${u.prefix}/`));
}
