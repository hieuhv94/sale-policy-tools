/**
 * Điều kiện "hồ sơ này sửa được không".
 *
 * Danh sách trạng thái sửa được do MÁY CHỦ giữ (`EDITABLE` ở
 * `policies.service.ts`), nên ở đây suy từ chính câu trả lời của máy chủ thay vì
 * chép lại: hồ sơ nào sửa được thì `allowed-actions` có `SUBMIT` hoặc
 * `RESUBMIT_AFTER_EDIT`. Chép danh sách trạng thái sang giao diện là thêm một
 * bản sao phải giữ đồng bộ với máy trạng thái.
 *
 * Ở `lib/` chứ không nằm trong `components/SuaHoSo.tsx` vì một lý do rất cụ thể:
 * dự án gốc (`tsconfig.json`) gom `tests/** /*.ts` mà KHÔNG bật `jsx`, nên một
 * test `.ts` import thẳng vào tệp `.tsx` làm `make typecheck` đỏ với `TS6142` —
 * và `make test` không chạy `tsc` nên chuyện đó lọt qua cả một đợt commit.
 * Logic thuần thì để ở `lib/`, JSX để ở `components/`.
 */

/** Hành động chỉ có ở hồ sơ đang sửa được — dùng để suy ra "có sửa được không". */
const HANH_DONG_SUA = ['SUBMIT', 'RESUBMIT_AFTER_EDIT'];

export const suaDuoc = (choPhep: string[]): boolean =>
  choPhep.some((a) => HANH_DONG_SUA.includes(a));
