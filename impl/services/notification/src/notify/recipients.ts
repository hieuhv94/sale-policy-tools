/**
 * Dịch VAI TRÒ trong sự kiện sang địa chỉ thư cụ thể, bằng cách hỏi identity.
 *
 * notification không đọc được schema idn, và cũng không nên. Từ `0031` phép suy
 * diễn đã đơn giản hẳn — bốn người của hồ sơ đi kèm ngay trong sự kiện — nhưng
 * việc đổi id sang ĐỊA CHỈ THƯ vẫn phải hỏi identity, vì email nằm ở đó.
 */
import { Injectable } from '@nestjs/common';
import { identityUrl, mintServiceToken } from '@csbh/http-kit';

export type Target = { userId: string; role: string; email: string; fullName: string };

@Injectable()
export class RecipientsClient {
  async targetsFor(
    tdvUserId: string,
    phanCong: {
      tbp?: string | null | undefined;
      keToan?: string | null | undefined;
      saleAdmin?: string | null | undefined;
    } = {},
  ): Promise<Target[]> {
    // Bỏ qua ô rỗng thay vì gửi chuỗi trống: hồ sơ Nháp chưa có ai được chọn, và
    // một `?tbp=` rỗng đi tới `uuid` của Postgres là một lỗi kiểu, không phải
    // một câu trả lời rỗng.
    const q = new URLSearchParams();
    if (phanCong.tbp) q.set('tbp', phanCong.tbp);
    if (phanCong.keToan) q.set('keToan', phanCong.keToan);
    if (phanCong.saleAdmin) q.set('saleAdmin', phanCong.saleAdmin);
    const duoi = q.toString() ? `?${q.toString()}` : '';

    const res = await fetch(
      `${identityUrl()}/internal/notify-targets/${encodeURIComponent(tdvUserId)}${duoi}`,
      { headers: { 'X-Service-Token': mintServiceToken('notification') } },
    );
    if (!res.ok) throw new Error(`identity trả ${res.status} khi hỏi người nhận thư`);
    return ((await res.json()) as { targets: Target[] }).targets;
  }

  /**
   * Địa chỉ thư của những người CỤ THỂ, tra thẳng theo id (`0036`).
   *
   * Khác `targetsFor` ở chỗ căn bản: bên kia dịch bốn VAI TRÒ trên hồ sơ sang
   * người, còn ở đây danh sách người đã có sẵn — nó đọc ra từ nhật ký của chính
   * hồ sơ, nên không còn vai trò nào để dịch. Tài khoản đã vô hiệu hoá bị
   * identity lọc bỏ: người nghỉ việc vẫn nằm trong nhật ký mãi mãi, và gửi thư
   * cho họ là gửi vào hộp thư không ai mở.
   */
  async byIds(userIds: string[]): Promise<Target[]> {
    if (userIds.length === 0) return [];
    const res = await fetch(`${identityUrl()}/internal/users/mail-targets`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Service-Token': mintServiceToken('notification'),
      },
      body: JSON.stringify({ userIds }),
    });
    if (!res.ok) throw new Error(`identity trả ${res.status} khi tra địa chỉ thư theo id`);
    return ((await res.json()) as { targets: Target[] }).targets;
  }

  /**
   * Lọc theo danh sách vai trò của bước, GIỮ NGUYÊN THỨ TỰ vai trò trong bảng
   * muc 3. Người nhận trùng địa chỉ hai lần chỉ xuất hiện một lần.
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
