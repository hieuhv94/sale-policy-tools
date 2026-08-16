-- =============================================================================
-- 0036_san_pham_bien_mat — loại lệch thứ ba: sản phẩm không còn dùng được.
--
-- --- Vấn đề ------------------------------------------------------------------
--
-- `0029` dựng `pol.policy_impact` để trả lời "hồ sơ đã đóng băng nào đang cầm
-- con số khác với danh mục hôm nay", và nó nhận ra ĐÚNG HAI loại lệch: giá đổi
-- (`PRICE`) và ngưỡng chiết khấu đổi (`RULE`).
--
-- Còn thiếu loại thứ ba, và nó nặng hơn cả hai: **sản phẩm bị vô hiệu hoá hoặc
-- biến mất khỏi danh mục**. Một CSBH đang có hiệu lực cho một mặt hàng không còn
-- bán nữa thì không phải "lệch vài đồng" — nó là một điều khoản không thực hiện
-- được. Vậy mà nó lọt qua sạch: consumer chỉ so giá và ngưỡng, mà vô hiệu hoá
-- một sản phẩm KHÔNG đổi giá của nó.
--
-- Hai lỗ, cùng một gốc:
--
--   1. `catalog.changed` với `entity = 'product'` bị consumer bỏ qua hoàn toàn —
--      nó chỉ nghe `catalog.price_changed` và `entity = 'discount_rule'`.
--   2. Sản phẩm bị XOÁ hẳn thì lời gọi tra ảnh chụp trả 404 cho cả lô, và
--      consumer `continue` — bỏ qua TOÀN BỘ hồ sơ. Một sản phẩm biến mất che mất
--      mọi chênh lệch còn lại của chính hồ sơ đó.
--
-- --- Cách ghi ----------------------------------------------------------------
--
-- Dùng lại đúng ba cột sẵn có thay vì thêm cột mới. `snap_value` là trạng thái
-- lúc hồ sơ đóng băng — luôn là "đang áp dụng", vì `POL-01` không cho đưa sản
-- phẩm đã vô hiệu hoá vào hồ sơ mới. `new_value` là trạng thái hôm nay, và
-- `NULL` mang đúng nghĩa nó vẫn mang ở hai loại kia: **không còn gì cả** — ở đây
-- là sản phẩm đã bị xoá khỏi danh mục.
-- =============================================================================

ALTER TABLE pol.policy_impact DROP CONSTRAINT IF EXISTS policy_impact_kind_check;
ALTER TABLE pol.policy_impact
  ADD CONSTRAINT policy_impact_kind_check CHECK (kind IN ('PRICE', 'RULE', 'PRODUCT'));

COMMENT ON COLUMN pol.policy_impact.kind IS
  'PRICE: giá đổi. RULE: ngưỡng đổi. PRODUCT: sản phẩm vô hiệu hoá hoặc đã xoá (0036).';
