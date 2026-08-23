/**
 * `0094` — phép toán của bộ vẽ biểu đồ.
 *
 * Kiểm bằng BẢNG SỐ, không dựng cây React: đây là chỗ duy nhất trong bộ vẽ có
 * thể sai IM LẶNG. Một cột cao sai 8% thì không ai nhìn ra — nó vẫn là một cột,
 * vẫn có màu, vẫn nằm đúng chỗ — trong khi một cột không hiện ra thì ai cũng
 * thấy ngay. Nên phần đáng gác là phép đổi toạ độ, không phải phần JSX.
 */
import { describe, expect, it } from 'vitest';
import {
  buocNhan,
  CHU,
  chong,
  duongGap,
  inNhan,
  KHUNG,
  mocTruc,
  oCot,
  toaDoX,
  toaDoY,
  tongChong,
  tran,
  tyLeDoan,
  vungDuoi,
} from '@csbh/web/ve-bieu-do';

const CAO = 210;
const DAY = CAO - KHUNG.leDuoi;

describe('`0094` trần trục tung', () => {
  it('làm tròn LÊN tới mốc đọc được, không lấy thẳng giá trị lớn nhất', () => {
    // Lấy thẳng thì đường chạm sát mép trên và không còn chỗ để thấy nó đang
    // lên hay đã kịch trần.
    expect(tran(7)).toBe(8);
    expect(tran(12)).toBe(15);
    expect(tran(23)).toBe(25);
    expect(tran(180)).toBe(200);
    // Bước chỉ nhận 1 · 2 · 5 · 10, nên 31 nhảy lên bậc 10 → trần 40. Thô hơn
    // một chút, đổi lại trục không bao giờ mang nhãn lẻ.
    expect(tran(31)).toBe(40);
  });

  it('dữ liệu rỗng hoặc âm KHÔNG làm vỡ phép chia', () => {
    // Trần 0 thì mọi phép chia sau đó ra `Infinity`, và biểu đồ biến mất mà
    // không có lỗi nào — đúng kiểu hỏng im lặng mà tệp này sinh ra để chặn.
    expect(tran(0)).toBe(1);
    expect(tran(-5)).toBe(1);
    expect(tran(Number.NaN)).toBe(1);
    expect(mocTruc(0)).toEqual([0]);
  });
});

describe('`0094` đổi toạ độ', () => {
  it('giá trị 0 nằm ở đáy, giá trị bằng trần nằm ở đỉnh', () => {
    expect(toaDoY(0, 10, CAO)).toBe(DAY);
    expect(toaDoY(10, 10, CAO)).toBe(KHUNG.leTren);
  });

  it('nửa giá trị nằm đúng giữa — trục TUYẾN TÍNH', () => {
    const giua = toaDoY(5, 10, CAO);
    expect(giua).toBeCloseTo((DAY + KHUNG.leTren) / 2, 6);
  });

  it('giá trị âm bị kẹp về đáy, không vẽ ngược ra ngoài khung', () => {
    expect(toaDoY(-3, 10, CAO)).toBe(DAY);
  });

  it('điểm đầu và điểm cuối chạm hai mép', () => {
    expect(toaDoX(0, 5)).toBe(KHUNG.leTrai);
    expect(toaDoX(4, 5)).toBe(KHUNG.rong - KHUNG.lePhai);
  });

  it('một điểm duy nhất thì không chia cho 0', () => {
    expect(Number.isFinite(toaDoX(0, 1))).toBe(true);
  });
});

describe('`0094` đường và vùng', () => {
  it('mỗi giá trị thành đúng một điểm, đúng thứ tự', () => {
    const s = duongGap([0, 5, 10], 10, CAO);
    const diem = s.split(' ');
    expect(diem.length).toBe(3);
    expect(diem[0]).toBe(`${KHUNG.leTrai.toFixed(1)},${DAY.toFixed(1)}`);
    expect(diem[2]!.split(',')[1]).toBe(KHUNG.leTren.toFixed(1));
  });

  it('vùng phủ đóng lại Ở ĐÁY hai bên, không phải ở điểm đầu điểm cuối', () => {
    // Đóng sai thì phần phủ thành một hình tam giác lơ lửng — trông vẫn "có
    // biểu đồ", nhưng nó tô nhầm chỗ.
    const s = vungDuoi([3, 7], 10, CAO);
    const diem = s.split(' ');
    expect(diem[0]).toBe(`${KHUNG.leTrai},${DAY.toFixed(1)}`);
    expect(diem[diem.length - 1]).toBe(`${(KHUNG.rong - KHUNG.lePhai).toFixed(1)},${DAY.toFixed(1)}`);
  });
});

describe('`0094` cột chồng', () => {
  it('mốc đáy của lớp sau là tổng các lớp trước', () => {
    const lop = [[10, 1], [5, 2], [2, 3]];
    expect(chong(lop, 0)).toEqual([0, 10, 15]);
    expect(chong(lop, 1)).toEqual([0, 1, 3]);
  });

  it('tổng cột dùng để tính trần, không phải giá trị lớn nhất của một lớp', () => {
    // Lấy max của một lớp thì cột chồng cao hơn trần và tràn ra khỏi khung.
    const lop = [[10, 1], [5, 2]];
    expect(tongChong(lop, 2)).toEqual([15, 3]);
  });

  it('lớp thiếu phần tử được coi là 0, không thành `NaN`', () => {
    expect(chong([[1, 2], [3]], 1)).toEqual([0, 2]);
    expect(tongChong([[1, 2], [3]], 2)).toEqual([4, 2]);
  });

  it('ô cột chia đều hết bề ngang', () => {
    const n = 8;
    expect(oCot(n) * n).toBeCloseTo(KHUNG.rong - KHUNG.leTrai - KHUNG.lePhai, 6);
    expect(oCot(0)).toBe(0);
  });
});

describe('`0094` nhãn trục hoành', () => {
  it('LUÔN in nhãn cuối — kỳ đang chạy là thứ người ta tìm trước', () => {
    expect(inNhan(11, 12, 2)).toBe(true);
    expect(inNhan(9, 12, 2)).toBe(true);
    expect(inNhan(10, 12, 2)).toBe(false);
  });

  it('in mọi nhãn khi bước bằng 1', () => {
    for (let i = 0; i < 6; i++) expect(inNhan(i, 6, 1)).toBe(true);
  });
});

describe('`0095` nhãn trục hoành KHÔNG đè lên nhau', () => {
  /** Bề rộng ước lượng của một nhãn, cùng công thức mà `buocNhan` dùng. */
  const rongNhan = (dai: number) => dai * 0.58 * CHU.nhan;
  const rongVe = KHUNG.rong - KHUNG.leTrai - KHUNG.lePhai;

  /** Tổng bề rộng của những nhãn THẬT SỰ được in. */
  const tongRong = (n: number, dai: number) => {
    const buoc = buocNhan(n, dai);
    const soIn = [...Array(n).keys()].filter((i) => i === n - 1 || (n - 1 - i) % buoc === 0).length;
    return soIn * rongNhan(dai);
  };

  it('nhãn ngắn 12 kỳ vẫn vừa, và in dày hơn nhãn dài', () => {
    // `T34` in được gần hết; `Tuần 34 · 17/08–23/08` thì phải thưa hẳn.
    expect(buocNhan(12, 3)).toBeLessThan(buocNhan(12, 21));
    expect(tongRong(12, 3)).toBeLessThanOrEqual(rongVe);
    expect(tongRong(12, 21)).toBeLessThanOrEqual(rongVe);
  });

  it('mọi tổ hợp số kỳ × độ dài nhãn đều vừa bề ngang', () => {
    /*
     * Đây là ca thay cho con mắt: bản trước để mỗi chỗ gọi tự truyền `moiN`, và
     * con số ấy đúng cho một bề rộng với một độ dài nhãn CỤ THỂ. Đổi nhãn hay
     * xếp hình vào lưới hai cột là nó sai — mà sai thì không có gì báo, chỉ có
     * chữ chồng lên chữ.
     */
    for (const n of [2, 5, 8, 12, 16, 24]) {
      for (const dai of [2, 4, 6, 10, 21]) {
        expect(tongRong(n, dai), `${n} kỳ, nhãn ${dai} ký tự`).toBeLessThanOrEqual(rongVe);
      }
    }
  });

  it('luôn in ÍT NHẤT nhãn cuối, dù nhãn dài tới đâu', () => {
    // Kỳ đang chạy là thứ người ta tìm trước; bỏ nó là bỏ đúng cái nhãn cần.
    const buoc = buocNhan(24, 30);
    expect([...Array(24).keys()].some((i) => i === 23)).toBe(true);
    expect(buoc).toBeGreaterThan(1);
  });
});

describe('`0094` thanh 100%', () => {
  it('các đoạn cộng lại đúng 100', () => {
    const t = tyLeDoan([3, 1, 1, 0, 5]);
    expect(t.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    expect(t[0]).toBeCloseTo(30, 6);
  });

  it('tổng bằng 0 thì trả về TOÀN 0, không chia đều', () => {
    // Chia đều là bịa ra dữ liệu: một người chưa gửi hồ sơ nào thì không có
    // "cơ cấu" nào cả, và một thanh bốn màu bằng nhau nói ngược lại điều đó.
    expect(tyLeDoan([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('`0094` mốc trục', () => {
  it('các vạch CÁCH ĐỀU nhau và đều là số nguyên', () => {
    expect(mocTruc(30)).toEqual([0, 10, 20, 30]);
    expect(mocTruc(8)).toEqual([0, 2, 4, 6, 8]);
    // Chia trần làm ba phần thì trần 10 ra 0 · 3,33 · 6,67 · 10 — làm tròn lại
    // thành những vạch trông cách đều mà không cách đều.
    expect(mocTruc(10).every((v) => Number.isInteger(v))).toBe(true);
  });
});
