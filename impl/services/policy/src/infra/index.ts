/**
 * Phần hạ tầng của policy dùng lại được ở service khác.
 *
 * `sla-worker` là tiến trình nền đọc chính `pol.*` và chạy dưới cùng DB role,
 * nên nó dùng lại đúng kết nối và đúng lời gọi ra ngoài của policy thay vì khai
 * lại một bản gần giống. Bản thiết kế gọi đây là "chung mã nguồn với policy".
 */
export { Db } from './db.js';
export { Clients } from './clients.js';
export { ScopeClient } from './scope.client.js';
