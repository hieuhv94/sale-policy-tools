/**
 * `0156` — DỌN RÁC MỘT LẦN, TRƯỚC CẢ LƯỢT CHẠY.
 *
 * `cat.product` không có đường xoá qua API (`0121`: xoá sản phẩm là thứ danh mục
 * không cho làm), nên chín trong mười hai tệp kiểm tạo sản phẩm mà không gỡ được
 * chúng đi. Đo được ở `0155`: **5159 sản phẩm `ZZ`** tích lại, vượt trần 5000
 * dòng của lượt nhập Excel, làm bốn ca kiểm danh mục đỏ ở một chỗ chẳng liên quan
 * gì tới nguyên nhân.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO Ở ĐÂY, SAU KHI ĐÃ THỬ MỘT CHỖ SAI
 * ---------------------------------------------------------------------------
 *
 * Bản đầu đặt bước dọn trong `withAdminDb`, gác bằng một cờ mô-đun, và chú thích
 * khẳng định nó *"chạy một lần mỗi lượt"* — lý lẽ là bộ kiểm chạy tuần tự trong
 * một tiến trình.
 *
 * **Đo ra thì nó chạy TÁM lần**, một lần mỗi tệp: vitest cấp lại đồ thị mô-đun
 * cho từng tệp kiểm, nên cờ ấy về `false` mỗi lượt. Và hậu quả nặng hơn việc
 * chạy thừa — log ghi *"dọn 9 sản phẩm"* ở giữa lượt, tức nó đang xoá sản phẩm
 * do một tệp CHẠY TRƯỚC trong CÙNG lượt tạo ra. Hôm nay vô hại vì mỗi tệp tự
 * chứa, nhưng đó là một quả mìn đặt sẵn cho tệp đầu tiên cần dữ liệu của tệp
 * khác.
 *
 * `globalSetup` chạy đúng MỘT lần, TRƯỚC mọi tệp. Không cờ nào phải gác, và
 * không lượt chạy nào có thể xoá dữ liệu của chính nó.
 *
 * ---------------------------------------------------------------------------
 * KHÔNG CÓ POSTGRES THÌ ĐI TIẾP, KHÔNG DỪNG
 * ---------------------------------------------------------------------------
 *
 * `globalSetup` chạy cho MỌI lượt gọi vitest, kể cả `vitest run tests/web` —
 * jsdom, chặn `fetch`, và không nối Postgres nào. `CLAUDE.md` còn khai đó là
 * cách chạy DUY NHẤT được phép khi chồng demo đang bật.
 *
 * Nên nối hỏng thì báo rồi đi tiếp. Đây vốn là điều làm tôi tránh `globalSetup`
 * lúc đầu — *"một bước dọn im lặng bỏ qua là một bước dọn sẽ có ngày im lặng
 * không chạy nữa"* — và lời ấy vẫn đúng. Cái bịt nó lại là
 * `tests/http/don-rac.test.ts`: nó ĐẾM số dòng còn lại và đỏ khi rác bắt đầu
 * tích, nên sự im lặng ở đây không bao giờ kéo dài quá vài lượt chạy.
 */
import { Client } from 'pg';

/** Tiền tố mà mọi tệp kiểm HTTP đặt cho dữ liệu của mình (`const P = 'ZZ…'`). */
export const TIEN_TO_KIEM = 'ZZ';

export default async function donRacTruocLuot(): Promise<void> {
  const c = new Client({
    host: process.env.PGHOST ?? 'postgres',
    database: process.env.PGDATABASE ?? 'csbh',
    user: process.env.PG_SUPERUSER ?? 'postgres',
    password: process.env.PG_PASSWORD ?? 'csbh_dev_pw',
  });

  try {
    await c.connect();
  } catch {
    // Lượt chạy không có Postgres — `tests/web`. Không phải lỗi.
    return;
  }

  try {
    // `ON DELETE CASCADE` trên `cat.product_price` lo phần giá.
    const r = await c.query(`DELETE FROM cat.product WHERE code LIKE $1`, [`${TIEN_TO_KIEM}%`]);
    if (r.rowCount) {
      console.log(`bộ kiểm: dọn ${r.rowCount} sản phẩm còn lại của lượt chạy trước`);
    }
  } finally {
    await c.end();
  }
}
