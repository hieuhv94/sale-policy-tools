/**
 * Hỏi và sai khiến `policy` trong luồng vô hiệu hoá tài khoản.
 *
 * identity không đọc được schema `pol` (AD-02), nên cả hai câu — "người này đang
 * giữ hồ sơ nào" và "chuyển hết sang người kia" — phải đi qua đây.
 */
import { Injectable, Logger } from '@nestjs/common';
import { mintServiceToken } from '@csbh/http-kit';

const policyUrl = () => process.env.POLICY_URL ?? 'http://policy:3004';

export type HoSoDangGiu = { code: string; status: string };
/** `count` là TỔNG hồ sơ; `policies` ở bản xem trước chỉ là 20 cái mới nhất. */
export type KetQuaBanGiao = { count: number; policies: HoSoDangGiu[] };

@Injectable()
export class PolicyClient {
  private readonly log = new Logger(PolicyClient.name);

  private async goi(duong: string, body: unknown): Promise<KetQuaBanGiao> {
    const res = await fetch(`${policyUrl()}/internal/ban-giao${duong}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': mintServiceToken('identity'),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`policy trả ${res.status} khi ${duong ? 'xem trước' : 'chuyển giao'} hồ sơ`);
    }
    return (await res.json()) as KetQuaBanGiao;
  }

  /** Người này đang giữ hồ sơ nào — để màn hình nói con số TRƯỚC khi bấm. */
  xemTruoc(userId: string, role: string): Promise<KetQuaBanGiao> {
    return this.goi('/xem-truoc', { userId, role });
  }

  /**
   * Chuyển hết sang người khác.
   *
   * KHÔNG nuốt lỗi: vô hiệu hoá tài khoản mà chuyển giao hỏng là đúng cái ngõ
   * cụt việc này sinh ra để chữa. Thà để cả thao tác hỏng và người quản trị bấm
   * lại còn hơn để một nửa.
   */
  chuyen(input: {
    fromUserId: string;
    toUserId: string;
    role: string;
    actorId: string;
  }): Promise<KetQuaBanGiao> {
    return this.goi('', input);
  }
}
