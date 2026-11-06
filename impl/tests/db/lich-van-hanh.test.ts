/**
 * `0251` — lịch tự động: `ops.moc_truoc` · `ops.moc_ke_tiep` · `ops.den_han`.
 *
 * Mọi ca chạy trong một transaction lăn ngược (`inRollback`), nên vặn cấu hình và
 * chèn lượt chạy giả không để lại gì. Thời điểm viết bằng GIỜ VIỆT NAM (`+07`) cho
 * dễ đọc — hàm tính trên giờ ấy, và ranh giới nửa đêm là chỗ dễ sai nhất.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { admin, expectSqlErrorInTx, inRollback } from './helpers';

let c: Client;
beforeAll(async () => {
  c = admin();
  await c.connect();
});
afterAll(async () => {
  await c.end();
});

const dat = (viec: string, tanSuat: string, gio: string, thu: number | null = null) =>
  c.query(
    `UPDATE ops.cau_hinh_viec SET tan_suat = $2, gio_chay = $3, thu_trong_tuan = $4 WHERE viec = $1`,
    [viec, tanSuat, gio, thu],
  );
/** Đổi một `timestamptz` về chuỗi giờ VN `YYYY-MM-DD HH:MM` để so cho dễ đọc. */
const vn = async (sql: string, ...p: unknown[]): Promise<string> =>
  (
    await c.query<{ v: string }>(
      `SELECT to_char((${sql}) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') AS v`,
      p,
    )
  ).rows[0]!.v;
const moc = (viec: string, luc: string) => vn(`ops.moc_truoc($1, $2::timestamptz)`, viec, luc);
const tiep = (viec: string, luc: string) => vn(`ops.moc_ke_tiep($1, $2::timestamptz)`, viec, luc);
const denHan = async (viec: string, luc: string) =>
  (await c.query<{ d: boolean }>(`SELECT ops.den_han($1, $2::timestamptz) AS d`, [viec, luc])).rows[0]!.d;
const lanChay = (viec: string, batDau: string, ketQua: 'THANH_CONG' | 'LOI' | 'DANG_CHAY') =>
  c.query(
    `INSERT INTO ops.lan_chay (viec, bat_dau, ket_thuc, ket_qua)
     VALUES ($1, $2::timestamptz, CASE WHEN $3 = 'DANG_CHAY' THEN NULL ELSE $2::timestamptz + interval '1 minute' END, $3)`,
    [viec, batDau, ketQua],
  );
const xoaLanChay = (viec: string) => c.query(`DELETE FROM ops.lan_chay WHERE viec = $1`, [viec]);

describe('`0251` cấu hình mặc định', () => {
  it('bốn việc, đúng giờ và số bản đã chốt', async () => {
    const { rows } = await c.query(
      `SELECT viec, tan_suat, to_char(gio_chay, 'HH24:MI') AS gio, giu_toi_da FROM ops.cau_hinh_viec ORDER BY viec`,
    );
    expect(rows).toEqual([
      { viec: 'DON_DU_LIEU', tan_suat: 'HANG_NGAY', gio: '03:00', giu_toi_da: null },
      { viec: 'NEN_LOG', tan_suat: 'HANG_NGAY', gio: '00:15', giu_toi_da: 30 },
      { viec: 'SAO_LUU_CSDL', tan_suat: 'HANG_NGAY', gio: '01:15', giu_toi_da: 7 },
      { viec: 'SAO_LUU_KHO_TEP', tan_suat: 'HANG_NGAY', gio: '02:00', giu_toi_da: 7 },
    ]);
  });
});

describe('`0251` mốc lịch theo bốn tần suất', () => {
  it('HẰNG NGÀY 01:15 — trước giờ là mốc hôm qua, đúng giờ là mốc hôm nay', async () => {
    await inRollback(c, async () => {
      await dat('SAO_LUU_CSDL', 'HANG_NGAY', '01:15');
      expect(await moc('SAO_LUU_CSDL', '2026-11-06 01:14+07')).toBe('2026-11-05 01:15');
      expect(await moc('SAO_LUU_CSDL', '2026-11-06 01:15+07')).toBe('2026-11-06 01:15');
      expect(await moc('SAO_LUU_CSDL', '2026-11-06 23:59+07')).toBe('2026-11-06 01:15');
      expect(await tiep('SAO_LUU_CSDL', '2026-11-06 09:00+07')).toBe('2026-11-07 01:15');
    });
  });

  it('ngày tính theo GIỜ VIỆT NAM: 18:30 UTC ngày 05 đã là 01:30 ngày 06', async () => {
    await inRollback(c, async () => {
      await dat('SAO_LUU_CSDL', 'HANG_NGAY', '01:15');
      expect(await moc('SAO_LUU_CSDL', '2026-11-05 18:30+00')).toBe('2026-11-06 01:15');
    });
  });

  it('MỖI 6 GIỜ từ 01:15 — 01:15 · 07:15 · 13:15 · 19:15, qua nửa đêm vẫn đúng', async () => {
    await inRollback(c, async () => {
      await dat('SAO_LUU_CSDL', 'MOI_6_GIO', '01:15');
      expect(await moc('SAO_LUU_CSDL', '2026-11-06 07:14+07')).toBe('2026-11-06 01:15');
      expect(await moc('SAO_LUU_CSDL', '2026-11-06 07:15+07')).toBe('2026-11-06 07:15');
      expect(await moc('SAO_LUU_CSDL', '2026-11-06 20:00+07')).toBe('2026-11-06 19:15');
      expect(await moc('SAO_LUU_CSDL', '2026-11-07 00:30+07')).toBe('2026-11-06 19:15');
      expect(await tiep('SAO_LUU_CSDL', '2026-11-06 20:00+07')).toBe('2026-11-07 01:15');
    });
  });

  it('MỖI 12 GIỜ từ 02:00 — 02:00 · 14:00', async () => {
    await inRollback(c, async () => {
      await dat('SAO_LUU_KHO_TEP', 'MOI_12_GIO', '02:00');
      expect(await moc('SAO_LUU_KHO_TEP', '2026-11-06 13:59+07')).toBe('2026-11-06 02:00');
      expect(await moc('SAO_LUU_KHO_TEP', '2026-11-06 14:00+07')).toBe('2026-11-06 14:00');
      expect(await moc('SAO_LUU_KHO_TEP', '2026-11-06 01:00+07')).toBe('2026-11-05 14:00');
      expect(await tiep('SAO_LUU_KHO_TEP', '2026-11-06 15:00+07')).toBe('2026-11-07 02:00');
    });
  });

  it('HẰNG TUẦN Thứ Hai 01:15 — 06/11/2026 là Thứ Sáu', async () => {
    await inRollback(c, async () => {
      await dat('SAO_LUU_CSDL', 'HANG_TUAN', '01:15', 1);
      expect(await moc('SAO_LUU_CSDL', '2026-11-06 12:00+07')).toBe('2026-11-02 01:15');
      expect(await moc('SAO_LUU_CSDL', '2026-11-09 01:14+07')).toBe('2026-11-02 01:15');
      expect(await moc('SAO_LUU_CSDL', '2026-11-09 01:15+07')).toBe('2026-11-09 01:15');
      expect(await tiep('SAO_LUU_CSDL', '2026-11-06 12:00+07')).toBe('2026-11-09 01:15');
    });
  });

  it('HẰNG TUẦN Chủ nhật (7) — đúng ngày ấy, không lệch sang Thứ Hai', async () => {
    await inRollback(c, async () => {
      await dat('SAO_LUU_CSDL', 'HANG_TUAN', '23:00', 7);
      expect(await moc('SAO_LUU_CSDL', '2026-11-08 23:30+07')).toBe('2026-11-08 23:00');
      expect(await moc('SAO_LUU_CSDL', '2026-11-08 22:59+07')).toBe('2026-11-01 23:00');
    });
  });
});

describe('`0251` đến hạn', () => {
  it('chưa từng chạy → đến hạn ngay', async () => {
    await inRollback(c, async () => {
      await xoaLanChay('SAO_LUU_CSDL');
      expect(await denHan('SAO_LUU_CSDL', '2026-11-06 09:00+07')).toBe(true);
    });
  });

  it('đã thành công từ mốc gần nhất → CHƯA đến hạn; qua mốc kế tiếp → đến hạn', async () => {
    await inRollback(c, async () => {
      await dat('SAO_LUU_CSDL', 'HANG_NGAY', '01:15');
      await xoaLanChay('SAO_LUU_CSDL');
      await lanChay('SAO_LUU_CSDL', '2026-11-06 01:15+07', 'THANH_CONG');
      expect(await denHan('SAO_LUU_CSDL', '2026-11-06 01:30+07')).toBe(false);
      expect(await denHan('SAO_LUU_CSDL', '2026-11-07 01:14+07')).toBe(false);
      expect(await denHan('SAO_LUU_CSDL', '2026-11-07 01:15+07')).toBe(true);
    });
  });

  it('chạy TAY trước mốc không thay cho lượt theo lịch của mốc ấy', async () => {
    await inRollback(c, async () => {
      await dat('SAO_LUU_CSDL', 'HANG_NGAY', '01:15');
      await xoaLanChay('SAO_LUU_CSDL');
      await lanChay('SAO_LUU_CSDL', '2026-11-05 22:00+07', 'THANH_CONG');
      expect(await denHan('SAO_LUU_CSDL', '2026-11-06 01:15+07')).toBe(true);
    });
  });

  it('lượt HỎNG: thử lại sau một giờ, không dội mỗi 15 phút', async () => {
    await inRollback(c, async () => {
      await dat('SAO_LUU_CSDL', 'HANG_NGAY', '01:15');
      await xoaLanChay('SAO_LUU_CSDL');
      await lanChay('SAO_LUU_CSDL', '2026-11-06 01:15+07', 'LOI');
      expect(await denHan('SAO_LUU_CSDL', '2026-11-06 01:30+07')).toBe(false);
      expect(await denHan('SAO_LUU_CSDL', '2026-11-06 02:14+07')).toBe(false);
      expect(await denHan('SAO_LUU_CSDL', '2026-11-06 02:16+07')).toBe(true);
    });
  });

  it('lượt chết giữa chừng (DANG_CHAY mãi) chỉ chặn một giờ', async () => {
    await inRollback(c, async () => {
      await dat('SAO_LUU_CSDL', 'HANG_NGAY', '01:15');
      await xoaLanChay('SAO_LUU_CSDL');
      await lanChay('SAO_LUU_CSDL', '2026-11-06 01:15+07', 'DANG_CHAY');
      expect(await denHan('SAO_LUU_CSDL', '2026-11-06 02:00+07')).toBe(false);
      expect(await denHan('SAO_LUU_CSDL', '2026-11-06 02:16+07')).toBe(true);
    });
  });

  it('máy tắt ba ngày: MỘT lượt bù, không phải ba', async () => {
    await inRollback(c, async () => {
      await dat('SAO_LUU_CSDL', 'HANG_NGAY', '01:15');
      await xoaLanChay('SAO_LUU_CSDL');
      await lanChay('SAO_LUU_CSDL', '2026-11-03 01:15+07', 'THANH_CONG');
      expect(await denHan('SAO_LUU_CSDL', '2026-11-06 09:00+07')).toBe(true);
      await lanChay('SAO_LUU_CSDL', '2026-11-06 09:00+07', 'THANH_CONG');
      expect(await denHan('SAO_LUU_CSDL', '2026-11-06 10:30+07')).toBe(false);
    });
  });

  it('đổi lịch sang dày hơn: đến hạn theo mốc MỚI', async () => {
    await inRollback(c, async () => {
      await dat('SAO_LUU_CSDL', 'HANG_NGAY', '01:15');
      await xoaLanChay('SAO_LUU_CSDL');
      await lanChay('SAO_LUU_CSDL', '2026-11-06 01:15+07', 'THANH_CONG');
      expect(await denHan('SAO_LUU_CSDL', '2026-11-06 08:00+07')).toBe(false);
      await dat('SAO_LUU_CSDL', 'MOI_6_GIO', '01:15');
      expect(await denHan('SAO_LUU_CSDL', '2026-11-06 08:00+07')).toBe(true);
    });
  });

  it('mỗi việc có lịch RIÊNG — lượt của việc này không đếm cho việc kia', async () => {
    await inRollback(c, async () => {
      await xoaLanChay('SAO_LUU_CSDL');
      await xoaLanChay('SAO_LUU_KHO_TEP');
      await lanChay('SAO_LUU_CSDL', '2026-11-06 09:00+07', 'THANH_CONG');
      expect(await denHan('SAO_LUU_KHO_TEP', '2026-11-06 09:30+07')).toBe(true);
    });
  });
});

describe('`0251` ràng buộc cấu hình ở CSDL', () => {
  // `expectSqlErrorInTx` nhận một HÀM. Bản đầu truyền chuỗi SQL: gọi chuỗi như hàm ném
  // TypeError, lỗi ấy bị bắt, và cả mười ba ca xanh vô điều kiện — nên đòi đúng mã.
  const sai = (sql: string) =>
    inRollback(c, async () => {
      const loi = await expectSqlErrorInTx(c, () => c.query(sql));
      expect(['23514', '23503', '22007', '22008'], loi.message).toContain(loi.code);
    });

  it.each([
    ["giu_toi_da = 0 (sao lưu)", `UPDATE ops.cau_hinh_viec SET giu_toi_da = 0 WHERE viec = 'SAO_LUU_CSDL'`],
    ["giu_toi_da = 61 (sao lưu)", `UPDATE ops.cau_hinh_viec SET giu_toi_da = 61 WHERE viec = 'SAO_LUU_KHO_TEP'`],
    ["giu_toi_da = 91 (log)", `UPDATE ops.cau_hinh_viec SET giu_toi_da = 91 WHERE viec = 'NEN_LOG'`],
    ["giu_toi_da NULL (sao lưu)", `UPDATE ops.cau_hinh_viec SET giu_toi_da = NULL WHERE viec = 'SAO_LUU_CSDL'`],
    ["dọn dữ liệu có giữ tối đa", `UPDATE ops.cau_hinh_viec SET giu_toi_da = 3 WHERE viec = 'DON_DU_LIEU'`],
    ["nén log không hằng ngày", `UPDATE ops.cau_hinh_viec SET tan_suat = 'MOI_6_GIO' WHERE viec = 'NEN_LOG'`],
    ["hằng tuần thiếu thứ", `UPDATE ops.cau_hinh_viec SET tan_suat = 'HANG_TUAN' WHERE viec = 'SAO_LUU_CSDL'`],
    ["hằng ngày có thứ", `UPDATE ops.cau_hinh_viec SET thu_trong_tuan = 3 WHERE viec = 'SAO_LUU_CSDL'`],
    ["thứ 8", `UPDATE ops.cau_hinh_viec SET tan_suat = 'HANG_TUAN', thu_trong_tuan = 8 WHERE viec = 'SAO_LUU_CSDL'`],
    ["giờ có giây", `UPDATE ops.cau_hinh_viec SET gio_chay = '01:15:30' WHERE viec = 'SAO_LUU_CSDL'`],
    ["tần suất lạ", `UPDATE ops.cau_hinh_viec SET tan_suat = 'MOI_GIO' WHERE viec = 'SAO_LUU_CSDL'`],
    ["việc lạ", `INSERT INTO ops.cau_hinh_viec (viec, tan_suat, gio_chay, giu_toi_da) VALUES ('XOA_HET', 'HANG_NGAY', '01:00', 1)`],
    ["kết thúc mà còn đang chạy", `INSERT INTO ops.lan_chay (viec, ket_thuc, ket_qua) VALUES ('SAO_LUU_CSDL', now(), 'DANG_CHAY')`],
  ])('chặn: %s', async (_ten, sql) => {
    await sai(sql);
  });

  it('cấu hình hợp lệ thì lưu được (hằng tuần Thứ Tư, giữ 60)', async () => {
    await inRollback(c, async () => {
      await c.query(
        `UPDATE ops.cau_hinh_viec SET tan_suat = 'HANG_TUAN', thu_trong_tuan = 3, gio_chay = '22:30', giu_toi_da = 60
          WHERE viec = 'SAO_LUU_CSDL'`,
      );
    });
  });
});

describe('`0251` quyền của sla-worker (csbh_pol)', () => {
  it('đọc cấu hình, hỏi đến hạn, ghi lượt chạy — nhưng KHÔNG sửa cấu hình', async () => {
    const { rows } = await c.query(`
      SELECT has_table_privilege('csbh_pol', 'ops.cau_hinh_viec', 'SELECT') AS doc_cau_hinh,
             has_table_privilege('csbh_pol', 'ops.cau_hinh_viec', 'UPDATE') AS sua_cau_hinh,
             has_table_privilege('csbh_pol', 'ops.lan_chay', 'INSERT') AS ghi_lan_chay,
             has_function_privilege('csbh_pol', 'ops.den_han(text, timestamptz)', 'EXECUTE') AS hoi_han,
             has_function_privilege('csbh_pol', 'sys.don_doc_outbox(int)', 'EXECUTE') AS don_doc`);
    expect(rows[0]).toEqual({ doc_cau_hinh: true, sua_cau_hinh: false, ghi_lan_chay: true, hoi_han: true, don_doc: true });
  });
});
