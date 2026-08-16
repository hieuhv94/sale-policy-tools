/**
 * Lời gọi ra ba service khác. `document` không đọc được schema nào ngoài `doc`.
 *
 * Phạm vi dữ liệu vẫn do identity trả lời, y như ở policy và customer: mỗi
 * service tự diễn giải lại cây tổ chức là chắc chắn có ngày hai bên trả lời khác
 * nhau, và bên sai là bên cho xem file của người khác.
 */
import { Injectable, NotFoundException, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { identityUrl, JWT, mintServiceToken, REDIS_URL, type AuthUser } from '@csbh/http-kit';

const policyUrl = () => process.env.POLICY_URL ?? 'http://policy:3004';
const customerUrl = () => process.env.CUSTOMER_URL ?? 'http://customer:3003';
const catalogUrl = () => process.env.CATALOG_URL ?? 'http://catalog:3002';

const svc = () => ({ 'X-Service-Token': mintServiceToken('document') });

export type PolicyLine = {
  product_id: string;
  product_code_snap: string;
  product_name_snap: string;
  company_price: string;
  wholesale_price: string;
  /** Các khoản chi phí bán hàng, số lượng TUỲ DÒNG (0021). */
  cpbh: string[];
  cpbh_total: string;
  net_price: string;
  discount_rate: string;
  threshold_snap: string | null;
  over_threshold: boolean;
  /** Ghi chú tự do của người lập cho riêng dòng này (`0027`). */
  note: string | null;
};

export type PolicyFull = {
  id: string;
  code: string;
  customer_id: string;
  version_no: number;
  status: string;
  applied_date: string | null;
  effective_from: string | null;
  tdv_user_id: string | null;
  submitted_at: string | null;
  tbp_signed_at: string | null;
  kt_l1_received_at: string | null;
  sa_handover_at: string | null;
  kt_l2_received_at: string | null;
  contract_issued_at: string | null;
  lines: PolicyLine[];
  attachments: { id: string; kind: string; file_name: string; object_key: string }[];
};

export type CustomerFull = {
  id: string;
  code: string;
  name: string;
  customerType: number;
  tdvUserId: string;
  idNumber: string | null;
  registeredAddress: string;
  deliveryAddress: string | null;
  ownerName: string;
  ownerTitle: string | null;
  debt: string;
};

@Injectable()
export class Clients implements OnModuleDestroy {
  private readonly redis = new Redis(REDIS_URL);

  async policy(id: string): Promise<PolicyFull> {
    const r = await fetch(`${policyUrl()}/internal/policies/${encodeURIComponent(id)}`, {
      headers: svc(),
    });
    if (r.status === 404) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });
    if (!r.ok) throw new Error(`policy trả ${r.status}`);
    return (await r.json()) as PolicyFull;
  }

  async markContractIssued(policyId: string, actorId: string): Promise<void> {
    const r = await fetch(
      `${policyUrl()}/internal/policies/${encodeURIComponent(policyId)}/contract-issued`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...svc() },
        body: JSON.stringify({ actorId }),
      },
    );
    if (!r.ok) throw new Error(`policy trả ${r.status} khi ghi lần xuất hợp đồng`);
  }

  async customer(id: string): Promise<CustomerFull> {
    const r = await fetch(`${customerUrl()}/internal/customers/${encodeURIComponent(id)}`, {
      headers: svc(),
    });
    if (r.status === 404) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    if (!r.ok) throw new Error(`customer trả ${r.status}`);
    return (await r.json()) as CustomerFull;
  }

  /** Người ký đang hiệu lực — dùng cho khối chữ ký ở cuối bản CSBH A4. */
  async signer(): Promise<{ fullName: string; title: string; unit: string } | undefined> {
    const r = await fetch(`${catalogUrl()}/internal/catalog/signers`, {
      headers: svc(),
    }).catch(() => undefined);
    if (!r?.ok) return undefined;
    const list = (await r.json()) as { fullName?: string; title?: string; unit?: string }[];
    const first = list[0];
    if (!first?.fullName) return undefined;
    return { fullName: first.fullName, title: first.title ?? '', unit: first.unit ?? '' };
  }

  /**
   * Họ tên theo vai trò cho khối "TBP · kế toán · người đề nghị" trên bản A4.
   *
   * Dùng lại đúng hàm mà notification dùng để chọn người nhận thư: nếu bản A4 và
   * email ghi hai cái tên khác nhau cho cùng một hồ sơ thì một trong hai sai, và
   * cách chắc chắn nhất để điều đó không xảy ra là chỉ có một phép suy diễn.
   */
  async peopleFor(tdvUserId: string): Promise<Record<string, string>> {
    if (!tdvUserId) return {};
    const r = await fetch(
      `${identityUrl()}/internal/notify-targets/${encodeURIComponent(tdvUserId)}`,
      { headers: svc() },
    );
    if (!r.ok) return {};
    const body = (await r.json()) as { targets: { role: string; fullName: string }[] };
    const out: Record<string, string> = {};
    for (const t of body.targets) out[t.role] ??= t.fullName;
    return out;
  }

  async scopeUserIds(me: AuthUser): Promise<string[]> {
    const key = `idn:scope:${me.id}`;
    const hit = await this.redis.get(key);
    if (hit) return JSON.parse(hit) as string[];

    const res = await fetch(`${identityUrl()}/internal/scope/${encodeURIComponent(me.id)}`, {
      headers: svc(),
    });
    if (!res.ok) throw new Error(`identity trả ${res.status} khi hỏi phạm vi dữ liệu`);
    const body = (await res.json()) as { scopeUserIds: string[] };
    await this.redis.set(key, JSON.stringify(body.scopeUserIds), 'EX', JWT.accountCacheTtlSec);
    return body.scopeUserIds;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
