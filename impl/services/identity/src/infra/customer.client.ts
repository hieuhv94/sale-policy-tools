/**
 * Chuyển khách hàng của một TDV bị vô hiệu hoá sang người nhận bàn giao (`0032`).
 *
 * identity không đọc được schema `cus` (AD-02), nên cả hai câu — "TDV này đang
 * phụ trách khách nào" và "chuyển hết sang người kia" — phải đi qua đây.
 *
 * Vì sao identity gọi thẳng `customer` chứ không nhờ `policy` làm hộ trong lượt
 * chuyển hồ sơ: `policy` chỉ biết những khách hàng CÓ hồ sơ. Khách chưa có hồ sơ
 * nào thì nó không thấy — mà đó chính là loại khách dễ mồ côi nhất.
 */
import { Injectable } from '@nestjs/common';
import { mintServiceToken } from '@csbh/http-kit';

const customerUrl = () => process.env.CUSTOMER_URL ?? 'http://customer:3003';

export type KhachTomTat = { code: string; name: string };
export type KetQuaChuyenKhach = { count: number; customers: KhachTomTat[] };

@Injectable()
export class CustomerClient {
  private async goi(duong: string, body: unknown): Promise<KetQuaChuyenKhach> {
    const res = await fetch(`${customerUrl()}/internal/customers${duong}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': mintServiceToken('identity'),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`customer trả ${res.status} khi xử lý khách hàng bàn giao`);
    return (await res.json()) as KetQuaChuyenKhach;
  }

  /** TDV này đang phụ trách bao nhiêu khách — để màn hình nói con số trước khi bấm. */
  cuaTdv(userId: string): Promise<KetQuaChuyenKhach> {
    return this.goi(`/cua-tdv/${encodeURIComponent(userId)}`, {});
  }

  /**
   * Chuyển hết sang TDV khác. KHÔNG nuốt lỗi — xem `PolicyClient.chuyen`.
   *
   * `fromName` đi kèm từ `0085`: thư báo cho người nhận phải nói *"bàn giao từ
   * ai"*, mà tên ấy chỉ tra được Ở ĐÂY. Lá thư dựng sau, không đồng bộ, và lúc
   * ấy tài khoản kia đã `is_active = false` — `users/mail-targets` lọc bỏ tài
   * khoản đã khoá, nên không còn đường nào hỏi ra tên nữa. Đây là ảnh chụp tại
   * thời điểm bàn giao, và đó cũng là giá trị đúng để lưu.
   */
  chuyen(input: { fromUserId: string; toUserId: string; actorId: string; fromName: string }) {
    return this.goi('/chuyen-tdv', input);
  }
}
