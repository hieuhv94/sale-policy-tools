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
    const sp = await c.query(`DELETE FROM cat.product WHERE code LIKE $1`, [`${TIEN_TO_KIEM}%`]);

    /*
     * HỒ SƠ VÀ KHÁCH HÀNG — thêm ở `0159`, cùng bệnh với sản phẩm.
     *
     * `0156` mới dọn sản phẩm, và lỗ hổng hiện ra ở bảng kế tiếp đúng bốn chặng
     * sau: **5469 hồ sơ, 1702 trong đó đã đóng băng, 5299 khách hàng**. Ca kiểm
     * `0029` — đổi một quy định chiết khấu — chạy quá 30 giây rồi bị cắt, vì lượt
     * rà quét MỌI hồ sơ đóng băng × mọi dòng, kèm gọi REST sang hai service.
     *
     * Đó là nợ **N-09** đã ghi trong `CLAUDE.md`: *"ở quy mô hiện tại chưa cắn"*.
     * Nó cắn — không phải trên máy khách hàng mà trên CSDL của bộ kiểm, nơi rác
     * tích nhanh hơn dữ liệu thật nhiều lần.
     *
     * XOÁ HỒ SƠ THEO KHÁCH HÀNG, không theo mã hồ sơ. `pol.next_policy_code()`
     * sinh mã ở máy chủ nên hồ sơ **không bao giờ mang tiền tố `ZZ`** — đo được:
     * 0 trong 5469. Mọi bước dọn hiện có trong các tệp kiểm đều viết
     * `DELETE FROM pol.policy WHERE code LIKE 'ZZ…%'`, tức **là lệnh rỗng, và đã
     * rỗng từ đầu**. Mỗi hồ sơ thuộc về một khách hàng, và khách hàng thì có
     * tiền tố — đó là đường vào đúng.
     *
     * `DA_XOA` phải gỡ nhãn TRƯỚC: `trg_forbid_delete_rejected` chặn xoá dòng ở
     * trạng thái kết thúc (`0035`). Đây là chỗ DUY NHẤT được phép đi vòng qua
     * chốt ấy, và chỉ vì nó đang dọn dữ liệu của một lượt chạy đã kết thúc.
     *
     * LẬT SANG `HET_HIEU_LUC`, KHÔNG SANG `NHAP` (`0197`). Trạng thái đích ở đây
     * chỉ cần thoả một điều — không nằm trong hai trạng thái trigger chặn — và
     * `NHAP` từ `0197` còn mang thêm một ràng buộc *một bản Nháp mỗi khách*. Một
     * khách có sẵn một bản Nháp cộng hai bản `DA_XOA` là lượt lật này ném
     * `23505` và cả bộ kiểm chết ở `globalSetup`, trước khi chạy ca nào.
     *
     * Đây là loại bẫy chỉ nổ khi dữ liệu rác xếp đúng hình: nó KHÔNG nổ trên
     * CSDL sạch, nên nó sẽ chờ tới lượt chạy nào đó nhiều tháng sau.
     */
    const khachKiem = `EXISTS (SELECT 1 FROM cus.customer k
                                WHERE k.id = p.customer_id AND k.code LIKE $1)`;
    await c.query(
      `UPDATE pol.policy p SET status = 'HET_HIEU_LUC'
        WHERE p.status::text = 'DA_XOA' AND ${khachKiem}`,
      [`${TIEN_TO_KIEM}%`],
    );
    const hs = await c.query(`DELETE FROM pol.policy p WHERE ${khachKiem}`, [`${TIEN_TO_KIEM}%`]);
    const kh = await c.query(`DELETE FROM cus.customer WHERE code LIKE $1`, [`${TIEN_TO_KIEM}%`]);

    const phan = [
      sp.rowCount ? `${sp.rowCount} sản phẩm` : '',
      hs.rowCount ? `${hs.rowCount} hồ sơ` : '',
      kh.rowCount ? `${kh.rowCount} khách hàng` : '',
    ].filter(Boolean);
    if (phan.length) {
      console.log(`bộ kiểm: dọn ${phan.join(' · ')} còn lại của lượt chạy trước`);
    }
  } finally {
    await c.end();
  }
}
