/**
 * `0156` — BỘ KIỂM KHÔNG ĐƯỢC TỰ ĐẦU ĐỘC CSDL CỦA NÓ.
 *
 * Ở `0155` bốn ca kiểm danh mục đỏ với `IMPORT_TOO_MANY_ROWS`, giữa một chặng
 * chẳng liên quan gì tới danh mục. Nguyên nhân: **5159 sản phẩm mang tiền tố
 * `ZZ`** tích lại qua nhiều lượt chạy, vượt trần 5000 dòng của lượt nhập Excel.
 *
 * Mười hai tệp kiểm tạo sản phẩm; chỉ ba tệp xoá chúng ở bước dọn. Chín tệp còn
 * lại để dòng ở lại, và `cat.product` không có đường xoá qua API (`0121`) nên
 * không lượt chạy nào tự gỡ được phần của lượt trước.
 *
 * Tệp này canh hai chiều của cùng một chuyện, và **cả hai đều cần**:
 *
 *   1. Bước dọn CÓ CHẠY — số dòng còn lại phải nằm xa dưới trần.
 *   2. Bước dọn còn Ở ĐÚNG CHỖ — quét mã nguồn `app.ts`.
 *
 * Vế 2 không thừa: bước dọn nằm trong `withAdminDb`, một hàm mà người ta sửa vì
 * mọi lý do khác. Gỡ nhầm nó thì vế 1 vẫn xanh suốt vài chục lượt chạy — đúng
 * bằng quãng thời gian rác tích đủ để đỏ lại, và khi ấy nó lại đỏ ở danh mục.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRAN_SO_DONG } from '@csbh/catalog/testing';
import { TIEN_TO_KIEM } from '../don-rac-truoc-luot.js';
import { withAdminDb } from './app.js';

/**
 * Ngưỡng cảnh báo: một nửa trần nhập Excel.
 *
 * Không đặt sát trần. Ca này phải đỏ khi rác BẮT ĐẦU tích, không phải khi nó đã
 * làm hỏng một ca khác — đặt ở 4999 thì nó chỉ đỏ cùng lúc với `IMPORT_TOO_MANY_ROWS`
 * và chẳng cứu ai khỏi quãng đi tìm nguyên nhân.
 *
 * Một lượt chạy đầy đủ tạo vài trăm sản phẩm, nên nửa trần là rộng rãi cho cả
 * một lượt chạy trọn vẹn mà vẫn bắt được hai lượt không dọn liên tiếp.
 */
const NGUONG = Math.floor(TRAN_SO_DONG / 2);

describe('`0156` CSDL của bộ kiểm không tích rác', () => {
  it(`số sản phẩm ${TIEN_TO_KIEM} còn lại nằm dưới ${NGUONG}`, async () => {
    const n = await withAdminDb(async (c) => {
      const r = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM cat.product WHERE code LIKE $1`,
        [`${TIEN_TO_KIEM}%`],
      );
      return Number(r.rows[0]!.n);
    });

    expect(
      n,
      `Có ${n} sản phẩm "${TIEN_TO_KIEM}" trong CSDL kiểm — bước dọn đầu lượt ` +
        `(globalSetup: tests/don-rac-truoc-luot.ts) không chạy. Để nguyên thì tới ` +
        `${TRAN_SO_DONG} dòng là các ca NHẬP EXCEL sẽ đỏ với IMPORT_TOO_MANY_ROWS, ` +
        `ở một chỗ không liên quan gì tới nguyên nhân. Dọn tay: ` +
        `DELETE FROM cat.product WHERE code LIKE '${TIEN_TO_KIEM}%';`,
    ).toBeLessThan(NGUONG);
  });

  it('bước dọn còn được KHAI trong `vitest.config.ts`', () => {
    /*
     * Quét mã nguồn, và đây là chỗ hiếm hoi quét mã nguồn là phép kiểm đúng: cái
     * phải khẳng định là *"vitest còn được bảo chạy tệp ấy"*, mà một ca kiểm chạy
     * BÊN TRONG vitest thì không quan sát được cấu hình đã nạp.
     *
     * Đòi cả hai vế: tệp tồn tại, VÀ cấu hình trỏ vào nó. Chỉ đòi vế đầu thì gỡ
     * dòng `globalSetup` mà giữ tệp vẫn xanh — và đó là cách hỏng dễ xảy ra
     * nhất, vì tệp trông vẫn còn đó khi người ta đọc lướt.
     */
    expect(readFileSync('tests/don-rac-truoc-luot.ts', 'utf8'), 'thiếu tệp dọn').toContain(
      'DELETE FROM cat.product WHERE code LIKE',
    );
    expect(
      readFileSync('vitest.config.ts', 'utf8'),
      '`vitest.config.ts` không còn khai globalSetup',
    ).toContain("globalSetup: ['tests/don-rac-truoc-luot.ts']");
  });

  it('`0159` số HỒ SƠ ĐÓNG BĂNG còn lại đủ nhỏ để lượt rà danh mục kịp chạy', async () => {
    /*
     * Đổi một quy định chiết khấu thì `policy` quét MỌI hồ sơ đã đóng băng ×
     * mọi dòng, kèm gọi REST sang `customer` và `catalog` — nợ **N-09**, ghi
     * trong `CLAUDE.md` kèm câu *"ở quy mô hiện tại chưa cắn"*.
     *
     * Nó cắn ở `0159`, và không phải trên máy khách hàng: CSDL của bộ kiểm tích
     * **1702 hồ sơ đóng băng**, và ca `0029` bên `notification.test.ts` chạy quá
     * 30 giây rồi bị cắt. Triệu chứng là một ca kiểm về THƯ hết giờ — không có
     * chữ nào nhắc tới danh mục hay hiệu năng.
     *
     * Ngưỡng 500 là con số ĐO ĐƯỢC quy ra: ở 199 hồ sơ ca ấy chạy 44 giây cho cả
     * tệp và xanh; ở 1702 thì riêng nó vượt 30 giây. Để rộng gấp đôi mức một lượt
     * chạy sinh ra, và vẫn còn xa mức làm ca kia đỏ.
     */
    const n = await withAdminDb(async (c) => {
      const r = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pol.policy
          WHERE status::text IN ('CHO_KT_L1','SA_DANG_XU_LY','CHO_KT_L2','DANG_CO_HIEU_LUC')`,
      );
      return Number(r.rows[0]!.n);
    });

    expect(
      n,
      `Có ${n} hồ sơ đã đóng băng trong CSDL kiểm. Lượt rà khi đổi quy định chiết ` +
        `khấu quét hết chúng (nợ N-09), và ca 0029 bên notification.test.ts sẽ hết ` +
        `giờ 30 giây — ở một chỗ không nhắc gì tới hiệu năng. Bước dọn đầu lượt ` +
        `(globalSetup) xoá hồ sơ theo KHÁCH HÀNG có tiền tố ${TIEN_TO_KIEM}, vì mã ` +
        `hồ sơ do máy chủ sinh và không mang tiền tố nào.`,
    ).toBeLessThan(500);
  });

  it('mọi tệp kiểm HTTP đều đặt tiền tố `ZZ` cho dữ liệu của mình', () => {
    /*
     * Bước dọn xoá theo TIỀN TỐ, nên nó chỉ đúng chừng nào mọi tệp còn dùng tiền
     * tố ấy. Một tệp mới đặt `const P = 'TEST'` thì sản phẩm của nó nằm ngoài
     * tầm dọn, và rác quay lại — lần này không tiền tố nào chung để tìm ra.
     *
     * Quét chính những tệp KHAI `const P`, chứ không quét mọi tệp: vài tệp không
     * tạo dữ liệu danh mục nào và không cần tiền tố.
     */
    const sai: string[] = [];
    for (const ten of readdirSync('tests/http').filter((x) => x.endsWith('.test.ts'))) {
      const tep = `tests/http/${ten}`;
      const m = /^const P = '([^']+)';/m.exec(readFileSync(tep, 'utf8'));
      if (m && !m[1]!.startsWith(TIEN_TO_KIEM)) sai.push(`${tep} → ${m[1]}`);
    }
    expect(sai, `tiền tố không bắt đầu bằng "${TIEN_TO_KIEM}": ${sai.join(', ')}`).toEqual([]);
  });
});
