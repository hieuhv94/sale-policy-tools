/**
 * Hỏi và sai khiến `policy` trong luồng ngừng hợp tác (`0034`).
 *
 * customer không đọc được schema `pol` (AD-02), nên cả hai câu — "khách này còn
 * hồ sơ nào đang chờ" và "cho hồ sơ đang hiệu lực hết hiệu lực" — phải đi qua đây.
 *
 * Chiều gọi customer → policy CHỈ dùng ở đường này. Ở đường đọc danh sách khách
 * hàng tôi đã từ chối đúng chiều ấy (`0031`) và lý do vẫn nguyên: đó là hot path
 * mở mỗi lần vào màn hình, và policy chậm là màn hình khách hàng chết theo. Còn
 * đây là một thao tác ghi hiếm do người dùng bấm, và nó vốn PHẢI hỏng nếu không
 * hỏi được — không có câu trả lời thì không biết khách này còn hồ sơ nào chờ.
 */
import { Injectable } from '@nestjs/common';
import { mintServiceToken } from '@csbh/http-kit';

const policyUrl = () => process.env.POLICY_URL ?? 'http://policy:3004';

export type HoSoTomTat = { id: string; code: string; status: string };
export type HoSoCuaKhach = {
  tong: number;
  dangCho: HoSoTomTat[];
  dangHieuLuc: HoSoTomTat[];
};
export type KetQuaNgung = { blocked: boolean; dangCho: HoSoTomTat[]; expired: HoSoTomTat[] };

@Injectable()
export class PolicyClient {
  private async goi<T>(duong: string, body: unknown): Promise<T> {
    const res = await fetch(`${policyUrl()}/internal/khach-hang${duong}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': mintServiceToken('customer'),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`policy trả ${res.status} khi hỏi hồ sơ của khách hàng`);
    return (await res.json()) as T;
  }

  hoSoCua(customerId: string): Promise<HoSoCuaKhach> {
    return this.goi(`/${encodeURIComponent(customerId)}/ho-so`, {});
  }

  /**
   * Mã và tên khách hàng đi kèm (`0066`): `policy` cần chúng để dựng thân thư
   * báo CSBH hết hiệu lực, mà nó không đọc được schema `cus`.
   *
   * Đưa sang ở đây chứ không để bên kia hỏi ngược lại: lời gọi này đang giữ
   * `customer` chờ, nên một lời gọi ngược từ `policy` về `customer` là vòng lồng
   * nhau. Bên này vốn đã đọc dòng khách hàng ra rồi trước khi gọi.
   */
  ngung(
    customerId: string,
    actorId: string,
    kh: { code: string; name: string },
  ): Promise<KetQuaNgung> {
    return this.goi('/ngung-hop-tac', {
      customerId,
      actorId,
      customerCode: kh.code,
      customerName: kh.name,
    });
  }
}
