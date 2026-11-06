/**
 * `0255` — bảng CHÉP ở giao diện trang Vận hành phải khớp máy chủ.
 *
 * Giao diện là gói riêng (không import mã service), nên vài bảng phải chép: giới hạn "giữ tối
 * đa", việc chỉ-hằng-ngày, tên thành phần log, sáu thành phần nền tảng. Máy chủ vẫn là chốt;
 * bản chép chỉ để báo lỗi ngay dưới ô và đặt tên cho người đọc. Lệch là giao diện nói một câu
 * khác máy chủ — chặn ở đây (lối `0172`: `tests/http/` không bật jsx, nên phần chép nằm ở
 * `lib/van-hanh.ts`, không ở `.tsx`).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHI_HANG_NGAY, GIU_TOI_DA, THANH_PHAN, VIEC } from '@csbh/van-hanh/testing';
import * as GD from '@csbh/web/van-hanh';

describe('`0255` giao diện ↔ máy chủ', () => {
  it('giới hạn giữ tối đa: cùng tập việc, cùng min/max', () => {
    expect(Object.keys(GD.GIU_TOI_DA).sort()).toEqual([...VIEC].sort());
    for (const v of VIEC) {
      const may = GIU_TOI_DA[v];
      const gd = GD.GIU_TOI_DA[v];
      expect(gd === null ? null : { min: gd.min, max: gd.max }, v).toEqual(may);
    }
  });

  it('việc chỉ chạy hằng ngày: cùng tập', () => {
    expect([...GD.CHI_HANG_NGAY].sort()).toEqual([...CHI_HANG_NGAY].sort());
  });

  it('mọi việc định kỳ có nhãn tiếng Việt', () => {
    for (const v of VIEC) expect(GD.NHAN_VIEC[v], v).toBeTruthy();
  });

  it('tên thành phần: đúng tập thành phần có tệp log ở máy chủ, cùng thứ tự', () => {
    expect(Object.keys(GD.NHAN_THANH_PHAN)).toEqual([...THANH_PHAN]);
  });

  it('sáu thành phần nền tảng = danh sách tác tử thu log (`HA_TANG` của ./csbh)', () => {
    const csbh = readFileSync('scripts/csbh', 'utf8');
    const m = /^HA_TANG="([^"]+)"/m.exec(csbh);
    expect(m, 'không thấy HA_TANG trong scripts/csbh').not.toBeNull();
    expect([...GD.HA_TANG].sort()).toEqual(m![1]!.split(' ').sort());
  });

  it('nhãn hàng đợi lỗi phủ đúng năm tên thẻ Sức khoẻ trả về', () => {
    const src = readFileSync('services/van-hanh/src/suc-khoe/suc-khoe.controller.ts', 'utf8');
    const ten = [...src.matchAll(/\['([a-z-]+)', BUS\.queues\./g)].map((x) => x[1]!);
    expect(ten.length).toBe(5);
    expect(Object.keys(GD.NHAN_HANG_DOI).sort()).toEqual(ten.sort());
  });
});
