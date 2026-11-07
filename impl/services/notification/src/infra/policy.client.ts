/**
 * Hỏi `policy` một người còn mở được những hồ sơ nào (`0262`).
 *
 * Dùng lúc TRẢ hộp thông báo: dòng thông báo bình luận chỉ mang mã hồ sơ, tên khách
 * và trích đoạn khi người nhận còn trong phạm vi hồ sơ (yêu cầu 6.3). Luật là của
 * `policy` (`coTrongPhamVi`) — `notification` không đọc được `pol.policy`, và chép
 * luật sang đây là dựng bản thứ hai.
 *
 * HỎNG THÌ ĐÓNG: trả tập rỗng, tức là giấu. Một hộp thông báo thiếu trích đoạn trong
 * một nhịp là chuyện nhỏ; lộ trích đoạn cho người đã mất quyền thì không.
 */
import { Injectable } from '@nestjs/common';
import { mintServiceToken } from '@csbh/http-kit';

const policyUrl = () => process.env.POLICY_URL ?? 'http://policy:3004';

@Injectable()
export class PolicyClient {
  async trongPhamVi(user: { id: string; role: string }, policyIds: string[]): Promise<Set<string>> {
    const ids = [...new Set(policyIds.filter(Boolean))];
    if (ids.length === 0) return new Set();
    try {
      const res = await fetch(`${policyUrl()}/internal/policies/trong-pham-vi`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Service-Token': mintServiceToken('notification'),
        },
        body: JSON.stringify({ userId: user.id, role: user.role, policyIds: ids }),
      });
      if (!res.ok) return new Set();
      return new Set(((await res.json()) as { coQuyen: string[] }).coQuyen);
    } catch {
      return new Set();
    }
  }
}
