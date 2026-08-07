import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
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
