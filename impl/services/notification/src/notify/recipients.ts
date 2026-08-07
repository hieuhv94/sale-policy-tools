/**
 * Dịch VAI TRÒ trong sự kiện sang địa chỉ thư cụ thể, bằng cách hỏi identity.
 *
 * notification không đọc được schema idn, và cũng không nên: "kế toán phụ trách
 * hồ sơ này là ai" là câu hỏi về cây tổ chức, thay đổi mỗi lần nhân sự đổi chỗ.
 * Nhân bản phép suy diễn đó sang service thứ hai là bảo đảm sẽ có ngày hai bên
 * trả lời khác nhau — và bên sai là bên gửi thư cho người không liên quan.
 */
import { Injectable } from '@nestjs/common';
import { identityUrl, mintServiceToken } from '@csbh/http-kit';

export type Target = { userId: string; role: string; email: string; fullName: string };

@Injectable()
export class RecipientsClient {
  async targetsFor(tdvUserId: string): Promise<Target[]> {
    const res = await fetch(
      `${identityUrl()}/internal/notify-targets/${encodeURIComponent(tdvUserId)}`,
      { headers: { 'X-Service-Token': mintServiceToken('notification') } },
    );
    if (!res.ok) throw new Error(`identity trả ${res.status} khi hỏi người nhận thư`);
    return ((await res.json()) as { targets: Target[] }).targets;
  }

  /**
   * Lọc theo danh sách vai trò của bước, GIỮ NGUYÊN THỨ TỰ vai trò trong bảng
   * muc 3. Người nhận trùng vai trò hai lần (một người vừa là TBP vừa được cấu
   * hình duyệt thay) chỉ xuất hiện một lần.
   */
  pick(targets: Target[], roles: string[]): Target[] {
    const seen = new Set<string>();
    const out: Target[] = [];
    for (const role of roles) {
      for (const t of targets) {
        if (t.role !== role || seen.has(t.email.toLowerCase())) continue;
        seen.add(t.email.toLowerCase());
        out.push(t);
      }
    }
    return out;
  }
}
