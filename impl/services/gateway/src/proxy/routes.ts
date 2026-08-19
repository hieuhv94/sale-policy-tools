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
export type Upstream = {
  prefix: string;
  url: () => string;
  name: string;
  /**
   * Chỉ nhận đường dẫn khớp thêm mẫu này. Dùng khi HAI service cùng phục vụ
   * dưới một tiền tố.
   */
  chiTiet?: RegExp;
};

const env = (k: string, d: string) => (): string => process.env[k] ?? d;

/**
 * THỨ TỰ CÓ Ý NGHĨA: dòng khớp trước thắng.
 *
 * `document` phục vụ ba đường nằm DƯỚI `/policies` (bản A4, ký số, hợp đồng) vì
 * chúng thuộc về vòng đời file chứ không thuộc máy trạng thái hồ sơ. Không tách
 * được bằng tiền tố, nên bốn dòng đầu dùng thêm một mẫu cụ thể và phải đứng
 * TRƯỚC dòng `/policies` chung.
 *
 * Đây là chỗ mà "gateway chỉ định tuyến theo tiền tố" không đủ, và phát hiện ra
 * điều đó chỉ bằng cách chạy thật: mọi test trước đó gọi thẳng từng service.
 */
export const UPSTREAMS: Upstream[] = [
  { prefix: '/auth', name: 'identity', url: env('IDENTITY_URL', 'http://identity:3001') },
  { prefix: '/admin/users', name: 'identity', url: env('IDENTITY_URL', 'http://identity:3001') },
  { prefix: '/catalog', name: 'catalog', url: env('CATALOG_URL', 'http://catalog:3002') },
  { prefix: '/customers', name: 'customer', url: env('CUSTOMER_URL', 'http://customer:3003') },
  {
    prefix: '/policies',
    name: 'document',
    url: env('DOCUMENT_URL', 'http://document:3005'),
    chiTiet: /^\/policies\/[^/]+\/(contract\.pdf|contract\/preview|render|sign-file)$/,
  },
  { prefix: '/policies', name: 'policy', url: env('POLICY_URL', 'http://policy:3004') },
  { prefix: '/sla', name: 'policy', url: env('POLICY_URL', 'http://policy:3004') },
  { prefix: '/files', name: 'document', url: env('DOCUMENT_URL', 'http://document:3005') },
  { prefix: '/contract-templates', name: 'document', url: env('DOCUMENT_URL', 'http://document:3005') },
  // `0055` — mẫu HỒ SƠ CSBH, của Quản trị. Tiền tố riêng chứ không dùng chung
  // với mẫu hợp đồng: hai vai trò khác nhau, và đường dẫn nói đúng thứ nó quản.
  { prefix: '/policy-templates', name: 'document', url: env('DOCUMENT_URL', 'http://document:3005') },
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
  return UPSTREAMS.find((u) => {
    if (path !== u.prefix && !path.startsWith(`${u.prefix}/`)) return false;
    return u.chiTiet ? u.chiTiet.test(path) : true;
  });
}
