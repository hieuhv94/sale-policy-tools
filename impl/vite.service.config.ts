/**
 * Cấu hình chạy service ở môi trường thật.
 *
 * Dùng CHUNG một pipeline biến đổi với `vitest.config.ts`, và đó là toàn bộ lý
 * do file này tồn tại: esbuild — thứ `tsx` dùng — KHÔNG sinh được
 * `emitDecoratorMetadata`, mà tiêm phụ thuộc của NestJS đọc đúng metadata đó.
 * Thiếu nó thì service khởi động sạch sẽ rồi mọi request chết với
 * "Cannot read properties of undefined (reading 'getAllAndOverride')" — guard
 * nhận vào `undefined` thay vì `Reflector`.
 *
 * Đã thử `tsx` và `@swc-node/register` trước; cả hai đều hỏng, mỗi cái một kiểu.
 * swc qua Vite là con đường duy nhất trong repo này đã được 493 test chứng minh.
 */
import { defineConfig } from 'vite';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
