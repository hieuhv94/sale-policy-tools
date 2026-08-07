/**
 * Lời gọi ra bốn service khác để dựng lại một dòng read-model.
 *
 * VÌ SAO KHÔNG NHÉT SẴN MỌI THỨ VÀO SỰ KIỆN. Cách đó bỏ được bốn vòng mạng dưới
 * đây, nhưng đổi lại mọi bên phát sự kiện phải biết read-model cần những trường
 * gì, và thêm một tiêu chí lọc là sửa cả bốn service cộng một lần nạp lại dữ
 * liệu cũ. Sự kiện ở đây chỉ nói "hồ sơ X vừa đổi"; đọc lại trạng thái hiện tại
 * là việc của bên nhận.
 *
 * Hệ quả phải chấp nhận: sự kiện tới CHẬM thì read-model đọc được trạng thái
 * MỚI HƠN sự kiện. Điều đó vô hại vì mỗi lần đồng bộ ghi lại toàn bộ dòng —
 * không có phép cộng dồn nào để sai lệch tích luỹ.
 */
import { Injectable, Logger } from '@nestjs/common';
import { identityUrl, mintServiceToken } from '@csbh/http-kit';

const policyUrl = () => process.env.POLICY_URL ?? 'http://policy:3004';
const customerUrl = () => process.env.CUSTOMER_URL ?? 'http://customer:3003';
const catalogUrl = () => process.env.CATALOG_URL ?? 'http://catalog:3002';

const svc = () => ({ 'X-Service-Token': mintServiceToken('reporting') });
const jsonSvc = () => ({ 'content-type': 'application/json', ...svc() });

export type PolicySrc = {
  id: string;
  code: string;
  customer_id: string;
  version_no: number;
  status: string;
  pending_step: string | null;
  source: string;
  applied_date: string | null;
  effective_from: string | null;
  tbp_signed_at: string | null;
  created_at: string;
  created_by: string | null;
  submitted_at: string | null;
  returned_at: string | null;
  rejected_at: string | null;
  deactivated_at: string | null;
  sla_due_at: string | null;
  sla_started_at: string | null;
  tdv_user_id: string | null;
  row_version: number;
  lines: {
    product_id: string;
    product_code_snap: string;
    product_name_snap: string;
    net_price: string;
    discount_rate: string;
  }[];
};

export type CustomerSrc = {
  id: string;
  code: string;
  name: string;
  customerType: number;
  provinceCode: string | null;
  hospitalCode: string | null;
  channelCode: string | null;
  tdvUserId: string;
  idNumber: string | null;
  registeredAddress: string;
};

@Injectable()
export class Clients {
  private readonly log = new Logger(Clients.name);

  /** `undefined` nghĩa là hồ sơ không còn tồn tại — không phải lỗi cần ném ra. */
  async policy(id: string): Promise<PolicySrc | undefined> {
    const res = await fetch(`${policyUrl()}/internal/policies/${encodeURIComponent(id)}`, {
      headers: svc(),
    });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`policy trả ${res.status} khi đồng bộ read-model`);
    return (await res.json()) as PolicySrc;
  }

  async customer(id: string): Promise<CustomerSrc | undefined> {
    const res = await fetch(`${customerUrl()}/internal/customers/${encodeURIComponent(id)}`, {
      headers: svc(),
    });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`customer trả ${res.status} khi đồng bộ read-model`);
    return (await res.json()) as CustomerSrc;
  }

  async productGroups(productIds: string[]): Promise<Record<string, string>> {
    if (productIds.length === 0) return {};
    const res = await fetch(`${catalogUrl()}/internal/catalog/product-groups`, {
      method: 'POST',
      headers: jsonSvc(),
      body: JSON.stringify({ productIds }),
    });
    if (!res.ok) throw new Error(`catalog trả ${res.status} khi tra nhóm sản phẩm`);
    return (await res.json()) as Record<string, string>;
  }

  /**
   * Tên người dùng. Hỏng thì trả về rỗng chứ KHÔNG ném lỗi: thiếu tên làm dòng
   * báo cáo xấu đi, còn ném lỗi làm cả dòng không được đồng bộ — mất một hồ sơ
   * khỏi báo cáo tệ hơn nhiều so với hiện uuid thay cho tên.
   */
  async userNames(userIds: string[]): Promise<Record<string, string>> {
    const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
    if (ids.length === 0) return {};
    try {
      const res = await fetch(`${identityUrl()}/internal/users/names`, {
        method: 'POST',
        headers: jsonSvc(),
        body: JSON.stringify({ userIds: ids }),
      });
      if (!res.ok) throw new Error(`identity trả ${res.status}`);
      return (await res.json()) as Record<string, string>;
    } catch (e) {
      this.log.warn(`không tra được tên người dùng: ${String(e)}`);
      return {};
    }
  }
}
