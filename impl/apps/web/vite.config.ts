import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const version = readFileSync(new URL('../../VERSION', import.meta.url), 'utf8').trim();

export default defineConfig({
  plugins: [react()],
  define: {
    // Số phiên bản NHÚNG LÚC BUILD. Giao diện so nó với `X-App-Version` trên mỗi
    // phản hồi để biết đã có bản mới (muc 11).
    __PHIEN_BAN__: JSON.stringify(version),
  },
  build: {
    outDir: 'dist',
    // Ngân sách của FE-38: gói dùng chung ≤ 250KB NÉN. Vite cảnh báo theo kích
    // thước chưa nén, nên đặt ngưỡng cảnh báo ở mức tương ứng ~800KB thô; phép
    // đo thật nằm ở test `tests/web/bundle.test.ts`, đọc kích thước sau gzip.
    chunkSizeWarningLimit: 800,
    sourcemap: false,
  },
  server: {
    proxy: { '/api': { target: 'http://gateway:3000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } },
  },
});
