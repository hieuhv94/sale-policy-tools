/**
 * Đọc bí mật, ưu tiên FILE hơn biến môi trường.
 *
 * Biến môi trường lộ ra ở `docker inspect`, ở `/proc/<pid>/environ`, và trong log
 * của bất kỳ thư viện nào lỡ in `process.env`. File thì chỉ tiến trình có quyền
 * đọc mới thấy, và không đi vào ảnh Docker.
 *
 * Quy ước: `FOO_FILE` thắng `FOO`. Giá trị mặc định chỉ dùng ở dev; ở production
 * thiếu cả hai thì DỪNG chứ không chạy tiếp với mật khẩu đoán được.
 */
import { readFileSync } from 'node:fs';

export function readSecret(name: string, devDefault?: string): string {
  const file = process.env[`${name}_FILE`];
  if (file) return readFileSync(file, 'utf8').trim();

  const direct = process.env[name];
  if (direct) return direct;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Thiếu bí mật ${name}: đặt ${name}_FILE trỏ tới file secret. ` +
        'Ở production không có giá trị mặc định.',
    );
  }
  if (devDefault === undefined) throw new Error(`Thiếu bí mật ${name}`);
  return devDefault;
}
