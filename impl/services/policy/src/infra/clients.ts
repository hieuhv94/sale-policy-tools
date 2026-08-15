/**
 * Lời gọi ra ba service khác. policy không đọc được schema `cat`, `cus` lẫn `idn`.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { identityUrl, mintServiceToken } from '@csbh/http-kit';

const catalogUrl = () => process.env.CATALOG_URL ?? 'http://catalog:3002';
const customerUrl = () => process.env.CUSTOMER_URL ?? 'http://customer:3003';

export type CustomerInfo = {
  id: string;
  code: string;
  name: string;
  customerType: number;
  channelCode: string | null;
  tdvUserId: string;
};

export type ProductSnapshot = {
  productId: string;
  productCode: string;
  productName: string;
  status: string;
  companyPrice: string;
  /** `null` đi kèm `KHONG_CO`: sản phẩm này không có ngưỡng nào để đối chiếu. */
  thresholdRate2: number | null;
  /** Ngưỡng đến từ một quy định, hay không có quy định nào (`0025`). */
  thresholdSource: 'RULE' | 'KHONG_CO';
  /** Mã quy định đã thắng. `null` khi `KHONG_CO` — xem `0022`, `0024`. */
  ruleCode: string | null;
};

const svc = () => ({ 'X-Service-Token': mintServiceToken('policy') });

@Injectable()
export class Clients {
  /** TDV này đã có Trưởng bộ phận quản lý chưa. `null` là chưa gán. */
  async approverOf(tdvUserId: string): Promise<string | null> {
    const res = await fetch(
      `${identityUrl()}/internal/approver/${encodeURIComponent(tdvUserId)}`,
      { headers: svc() },
    );
    if (!res.ok) throw new Error(`identity trả ${res.status} khi hỏi Trưởng bộ phận quản lý`);
    return ((await res.json()) as { approverUserId: string | null }).approverUserId;
  }

  async customer(id: string): Promise<CustomerInfo> {
    const res = await fetch(`${customerUrl()}/internal/customers/${encodeURIComponent(id)}`, {
      headers: svc(),
    });
    if (res.status === 404) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    if (!res.ok) throw new Error(`customer trả ${res.status}`);
    return (await res.json()) as CustomerInfo;
  }

  /** Tra nhiều sản phẩm trong MỘT vòng mạng (chống N+1 khi hồ sơ nhiều dòng). */
  async productSnapshots(
    productIds: string[],
    customerType: number,
    channelCode: string | null,
  ): Promise<Map<string, ProductSnapshot>> {
    if (productIds.length === 0) return new Map();
    const res = await fetch(`${catalogUrl()}/internal/catalog/product-snapshots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...svc() },
      body: JSON.stringify({
        productIds,
        customerType,
        ...(channelCode ? { channelCode } : {}),
      }),
    });
    if (res.status === 404) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
    if (!res.ok) throw new Error(`catalog trả ${res.status}`);
    const list = (await res.json()) as ProductSnapshot[];
    return new Map(list.map((s) => [s.productId, s]));
  }

  async productSnapshot(
    productId: string,
    customerType: number,
    channelCode: string | null,
  ): Promise<ProductSnapshot> {
    const qs = new URLSearchParams({ customerType: String(customerType) });
    if (channelCode) qs.set('channelCode', channelCode);
    const res = await fetch(
      `${catalogUrl()}/internal/catalog/product-snapshot/${encodeURIComponent(productId)}?${qs}`,
      { headers: svc() },
    );
    if (res.status === 404) {
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      throw new NotFoundException({ code: body.code ?? 'PRODUCT_NOT_FOUND' });
    }
    if (!res.ok) throw new Error(`catalog trả ${res.status}`);
    return (await res.json()) as ProductSnapshot;
  }
}
