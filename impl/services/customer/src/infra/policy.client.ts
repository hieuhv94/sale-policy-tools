/**
 * Hỏi và sai khiến `policy` trong luồng ngừng hợp tác (`0034`) và luồng đổi tay
 * khách hàng (`0085`).
 *
 * customer không đọc được schema `pol` (AD-02), nên mọi câu về hồ sơ — "khách
 * này còn hồ sơ nào đang chờ", "cho hồ sơ đang hiệu lực hết hiệu lực", "chuyển
 * hồ sơ của những khách này sang TDV mới" — phải đi qua đây.
 *
 * Chiều gọi customer → policy CHỈ dùng cho các thao tác GHI hiếm do người dùng
 * bấm. Ở đường đọc danh sách khách hàng tôi đã từ chối đúng chiều ấy (`0031`) và
 * lý do vẫn nguyên: đó là hot path mở mỗi lần vào màn hình, và policy chậm là
 * màn hình khách hàng chết theo. Còn ở đây lời gọi vốn PHẢI hỏng nếu không đi
 * được — không hỏi được thì không biết khách này còn hồ sơ nào chờ, và không
 * chuyển được hồ sơ thì phạm vi đọc tách làm đôi.
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
    const res = await fetch(`${policyUrl()}${duong}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': mintServiceToken('customer'),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`policy trả ${res.status} tại ${duong}`);
    return (await res.json()) as T;
  }

  hoSoCua(customerId: string): Promise<HoSoCuaKhach> {
    return this.goi(`/internal/khach-hang/${encodeURIComponent(customerId)}/ho-so`, {});
  }

  /**
   * Đổi tay khách hàng thì **hồ sơ của khách đi theo** (`0085`).
   *
   * Không đi theo là để phạm vi đọc tách làm đôi: read-model báo cáo tính phạm
   * vi theo TDV của KHÁCH HÀNG, còn `policy` tính theo cột trên chính hồ sơ —
   * danh sách bày hồ sơ ra, chi tiết trả 403. Xem `ban-giao.controller.ts`.
   *
   * CHIA LÔ 500. Một TDV nghỉ việc có thể mang theo hàng trăm khách; bộ kiểm dữ
   * liệu vào chặn ở 500 phần tử, và để lời gọi hỏng vì đúng con số ấy thì việc
   * vô hiệu hoá tài khoản kẹt lại mà không ai đoán ra vì sao.
   */
  async theoKhachHang(
    customerIds: string[],
    toUserId: string,
    actorId: string,
  ): Promise<{ count: number }> {
    let count = 0;
    for (let i = 0; i < customerIds.length; i += 500) {
      const r = await this.goi<{ count: number }>('/internal/ban-giao/theo-khach-hang', {
        customerIds: customerIds.slice(i, i + 500),
        toUserId,
        actorId,
      });
      count += r.count;
    }
    return { count };
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
    return this.goi('/internal/khach-hang/ngung-hop-tac', {
      customerId,
      actorId,
      customerCode: kh.code,
      customerName: kh.name,
    });
  }
}
