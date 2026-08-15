/**
 * Hỏi `policy`: người này còn hồ sơ nào dở dang không.
 *
 * identity không đọc được schema `pol` (AD-02), nên câu hỏi phải đi qua đây.
 * Chiều gọi là identity → policy chứ không ngược lại, và identity gửi kèm phạm
 * vi dữ liệu tính sẵn — để policy khỏi phải hỏi ngược lại identity ngay giữa lúc
 * identity đang xử lý request của chính nó.
 */
import { Injectable, Logger } from '@nestjs/common';
import { mintServiceToken } from '@csbh/http-kit';

const policyUrl = () => process.env.POLICY_URL ?? 'http://policy:3004';

export type HoSoDangDo = { code: string; status: string; reason: string };
/** `count` là TỔNG hồ sơ mắc lại; `policies` chỉ là 20 cái mới nhất. */
export type KetQuaDangDo = { count: number; policies: HoSoDangDo[] };

@Injectable()
export class PolicyClient {
  private readonly log = new Logger(PolicyClient.name);

  async dangDo(userId: string, role: string, scopeUserIds: string[]): Promise<KetQuaDangDo> {
    const res = await fetch(`${policyUrl()}/internal/dang-do`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': mintServiceToken('identity'),
      },
      body: JSON.stringify({ userId, role, scopeUserIds }),
    });
    if (!res.ok) {
      // KHÔNG nuốt lỗi thành "không có hồ sơ nào". Đây là chốt chặn: hỏng mà trả
      // rỗng thì phép đổi vai trò đi qua đúng lúc không ai kiểm được nó nữa.
      this.log.error(`policy trả ${res.status} khi hỏi hồ sơ dở dang của ${userId}`);
      throw new Error(`policy trả ${res.status} khi hỏi hồ sơ dở dang`);
    }
    return (await res.json()) as KetQuaDangDo;
  }
}
