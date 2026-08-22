/**
 * `0093` — phép cắt kỳ theo giờ Việt Nam.
 *
 * Kiểm bằng BẢNG SỐ, không dựng máy chủ: đây là hàm thuần, và mọi chỗ dễ sai của
 * nó đều là một mốc cụ thể — nửa đêm giờ Việt Nam, ngày cuối tháng, Chủ nhật,
 * tuần bắc cầu giữa hai năm. Một ca kiểm qua HTTP không chỉ ra được cái nào
 * trong bốn cái đó vừa hỏng.
 */
import { describe, expect, it } from 'vitest';
import {
  chuoiKy,
  dauKy,
  docKy,
  docSoKy,
  kyKe,
  maKy,
  mocCungKhoang,
  nhanKy,
  SO_KY_MAX,
  soTuanIso,
} from './ky.js';

/** Một mốc khai theo GIỜ VIỆT NAM, cho ca kiểm đọc được. */
const ict = (s: string): Date => new Date(`${s}+07:00`);

describe('`0093` ranh giới kỳ cắt theo giờ Việt Nam', () => {
  it('23:30 ngày cuối tháng thuộc THÁNG ẤY, không phải tháng sau', () => {
    /*
     * Đây là lý do cả tệp này tồn tại. 23:30 ngày 31/08 giờ Việt Nam là
     * 16:30 ngày 31/08 UTC — cắt theo UTC thì vẫn đúng. Nhưng 00:30 ngày 01/09
     * giờ Việt Nam là 17:30 ngày 31/08 UTC, và cắt theo UTC đẩy nó về tháng 8.
     */
    expect(maKy('thang', ict('2026-08-31T23:30:00'))).toBe('2026-08-01');
    expect(maKy('thang', ict('2026-09-01T00:30:00'))).toBe('2026-09-01');
  });

  it('nửa đêm đúng là thời điểm ĐẦU kỳ mới', () => {
    expect(dauKy('thang', ict('2026-09-01T00:00:00')).toISOString()).toBe(
      ict('2026-09-01T00:00:00').toISOString(),
    );
    expect(maKy('thang', ict('2026-09-01T00:00:00'))).toBe('2026-09-01');
  });

  it('quý và năm cắt cùng một mốc', () => {
    expect(maKy('quy', ict('2026-08-22T10:00:00'))).toBe('2026-07-01');
    expect(maKy('quy', ict('2026-09-30T23:59:59'))).toBe('2026-07-01');
    expect(maKy('quy', ict('2026-10-01T00:00:00'))).toBe('2026-10-01');
    expect(maKy('nam', ict('2026-12-31T23:59:59'))).toBe('2026-01-01');
  });
});

describe('`0093` tuần bắt đầu thứ Hai', () => {
  it('Chủ nhật thuộc tuần VỪA QUA, không mở tuần mới', () => {
    // 23/08/2026 là Chủ nhật; tuần của nó bắt đầu thứ Hai 17/08.
    expect(maKy('tuan', ict('2026-08-23T20:00:00'))).toBe('2026-08-17');
    expect(maKy('tuan', ict('2026-08-24T00:00:00'))).toBe('2026-08-24');
    expect(maKy('tuan', ict('2026-08-17T00:00:00'))).toBe('2026-08-17');
  });

  it('nhãn tuần kèm khoảng ngày, không chỉ có số tuần', () => {
    const nhan = nhanKy('tuan', ict('2026-08-19T09:00:00'));
    expect(nhan).toContain('17/08');
    expect(nhan).toContain('23/08');
    expect(nhan).toMatch(/^Tuần \d+ · /);
  });

  it('số tuần theo ISO — tuần bắc cầu thuộc năm của thứ Năm', () => {
    // 01/01/2027 là thứ Sáu, nên tuần chứa nó là tuần cuối của 2026.
    expect(soTuanIso(ict('2027-01-01T12:00:00'))).toEqual({ tuan: 53, nam: 2026 });
    // Tuần kế tiếp mới là tuần 1 của 2027.
    expect(soTuanIso(ict('2027-01-04T12:00:00'))).toEqual({ tuan: 1, nam: 2027 });
    // Năm bắt đầu bằng thứ Năm: mùng một nằm ngay trong tuần 1.
    expect(soTuanIso(ict('2026-01-01T12:00:00'))).toEqual({ tuan: 1, nam: 2026 });
  });
});

describe('`0093` chuỗi kỳ', () => {
  it('trả về cũ trước mới sau, kỳ cuối là kỳ đang chạy', () => {
    const ds = chuoiKy('thang', 3, ict('2026-08-22T10:00:00'));
    expect(ds.map((k) => k.ma)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01']);
    expect(ds.map((k) => k.dangChay)).toEqual([false, false, true]);
    expect(ds[2]!.nhan).toBe('Tháng 8/2026');
  });

  it('mỗi kỳ là một khoảng NỬA MỞ, khớp đầu đuôi với kỳ liền kề', () => {
    // Không có khe hở và không chồng lấn — điều kiện để tổng các kỳ bằng tổng
    // cả khoảng, và cũng là điều kiện để không hồ sơ nào bị đếm hai lần.
    const ds = chuoiKy('tuan', 4, ict('2026-08-22T10:00:00'));
    for (let i = 1; i < ds.length; i++) expect(ds[i]!.tu).toBe(ds[i - 1]!.den);
  });

  it('bắc qua ranh giới năm mà không hụt kỳ nào', () => {
    const ds = chuoiKy('quy', 5, ict('2027-02-10T10:00:00'));
    expect(ds.map((k) => k.ma)).toEqual([
      '2026-01-01',
      '2026-04-01',
      '2026-07-01',
      '2026-10-01',
      '2027-01-01',
    ]);
  });
});

describe('`0093` kỳ đang chạy so cùng số ngày', () => {
  it('mốc so sánh của kỳ trước lùi đúng khoảng thời gian đã trôi', () => {
    /*
     * Ngày 22 của tháng 8 mà đặt cạnh CẢ tháng 7 là so 22 ngày với 31 ngày, và
     * mọi chỉ số đều "giảm" mà không ai làm gì sai.
     */
    const { daQua, denKyTruoc } = mocCungKhoang('thang', ict('2026-08-22T10:00:00'));
    expect(daQua).toBe((21 * 24 + 10) * 3600_000);
    expect(denKyTruoc).toBe(ict('2026-07-22T10:00:00').toISOString());
  });

  it('kỳ vừa mới bắt đầu thì khoảng đã trôi gần bằng không', () => {
    const { daQua } = mocCungKhoang('tuan', ict('2026-08-17T00:05:00'));
    expect(daQua).toBe(5 * 60_000);
  });
});

describe('`0093` đọc tham số', () => {
  it('nhịp lạ bị TỪ CHỐI, không âm thầm rơi về mặc định', () => {
    // Rơi về mặc định là kiểu hỏng tệ nhất ở đây: người dùng gọi `ky=ngay`, nhận
    // về một bảng đầy số theo tháng, và không có gì nói rằng nhịp họ xin không
    // tồn tại.
    expect(() => docKy('ngay')).toThrow();
    expect(docKy(undefined)).toBe('thang');
    expect(docKy(undefined, 'quy')).toBe('quy');
    expect(docKy('tuan')).toBe('tuan');
  });

  it('số kỳ mặc định theo nhịp, và có trần', () => {
    expect(docSoKy(undefined, 'quy')).toBe(8);
    expect(docSoKy('6', 'thang')).toBe(6);
    expect(() => docSoKy(String(SO_KY_MAX + 1), 'thang')).toThrow();
    expect(() => docSoKy('0', 'thang')).toThrow();
    expect(() => docSoKy('2,5', 'thang')).toThrow();
  });
});

describe('`0093` kyKe', () => {
  it('bước âm lùi đúng số kỳ, kể cả qua ranh giới tháng ngắn', () => {
    expect(maKy('thang', kyKe('thang', ict('2026-03-31T10:00:00'), -1))).toBe('2026-02-01');
    expect(maKy('tuan', kyKe('tuan', ict('2026-01-05T10:00:00'), -1))).toBe('2025-12-29');
  });
});
