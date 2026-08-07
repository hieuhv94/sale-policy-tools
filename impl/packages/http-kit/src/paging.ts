/**
 * Phân trang dùng chung cho mọi endpoint danh sách.
 *
 * Trả về TOÀN BỘ bảng là kiểu hỏng không có cảnh báo: chạy tốt suốt năm đầu rồi
 * chậm dần đều tới lúc không mở nổi màn hình. Đặt trần ngay từ đầu thì giới hạn
 * lộ ra ở ngày đầu tiên, lúc còn dễ sửa.
 */
import { BadRequestException } from '@nestjs/common';

export const PAGE_DEFAULT_LIMIT = 50;
export const PAGE_MAX_LIMIT = 200;

export type Page = { limit: number; offset: number };

export type Paged<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export function pageOf(q: { limit?: string | undefined; offset?: string | undefined }): Page {
  const limit = q.limit === undefined ? PAGE_DEFAULT_LIMIT : Number(q.limit);
  const offset = q.offset === undefined ? 0 : Number(q.offset);

  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX_LIMIT) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      field: 'limit',
      message: `limit phải là số nguyên trong khoảng 1..${PAGE_MAX_LIMIT}`,
    });
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      field: 'offset',
      message: 'offset phải là số nguyên không âm',
    });
  }
  return { limit, offset };
}

/**
 * Gói kết quả kèm tổng số dòng.
 *
 * Tổng lấy bằng `count(*) OVER()` ngay trong truy vấn chính — một lần quét thay
 * vì hai. Đổi lại là mỗi dòng mang thêm một cột; ở kích thước trang tối đa 200
 * thì không đáng kể.
 */
export function paged<T extends Record<string, unknown>>(rows: T[], p: Page): Paged<T> {
  const total = rows.length > 0 ? Number((rows[0] as { total_count?: string }).total_count ?? 0) : 0;
  const items = rows.map((r) => {
    const { total_count: _drop, ...rest } = r as T & { total_count?: string };
    return rest as unknown as T;
  });
  return { items, total, limit: p.limit, offset: p.offset };
}

/** Đoạn SQL thêm vào cuối truy vấn. Tham số đánh số tiếp theo tham số cuối cùng. */
export const pageSql = (nextParamIndex: number): string =>
  `LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}`;
