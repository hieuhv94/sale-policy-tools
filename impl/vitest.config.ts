import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  // esbuild — trình biên dịch mặc định của Vite — KHÔNG sinh được
  // emitDecoratorMetadata, mà tiêm phụ thuộc của NestJS lại đọc đúng metadata
  // đó để biết constructor cần gì. Thiếu nó thì mọi provider vào là undefined.
  // swc sinh được, nên dùng swc cho toàn bộ mã TypeScript.
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        // `tsx: true` cho cả .ts lẫn .tsx — swc nhận một cấu hình parser duy
        // nhất cho mọi tệp, và thiếu nó thì mọi test giao diện chết với
        // "React is not defined".
        parser: { syntax: 'typescript', tsx: true, decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
          // `automatic` để không phải import React ở từng tệp .tsx.
          react: { runtime: 'automatic' },
        },
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'packages/*/src/**/*.test.ts'],
    // Test ràng buộc CSDL dùng chung một Postgres thật nên chạy tuần tự,
    // tránh hai test cùng chèn vào một bảng rồi đổ lỗi cho nhau.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Cờ --reporter trên dòng lệnh sẽ ĐÈ danh sách này, nên script test không truyền cờ đó.
    reporters: ['verbose', 'junit'],
    outputFile: { junit: '/workspace/reports/junit.xml' },
  },
});
