/**
 * Gọi catalog qua API nội bộ. customer KHÔNG có quyền đọc schema cat, nên đây là
 * đường duy nhất để kiểm mã danh mục (CUST-08).
 */
import { Injectable } from '@nestjs/common';
import { mintServiceToken } from '@csbh/http-kit';

export const catalogUrl = (): string => process.env.CATALOG_URL ?? 'http://catalog:3002';

@Injectable()
export class CatalogClient {
  async validateCodes(input: {
    provinceCode?: string | undefined;
    hospitalCode?: string | undefined;
    channelCode?: string | undefined;
  }): Promise<{ ok: boolean; unknown: string[] }> {
    // Không mã nào cần kiểm thì đừng gọi mạng làm gì.
    if (!input.provinceCode && !input.hospitalCode && !input.channelCode) {
      return { ok: true, unknown: [] };
    }
    const res = await fetch(`${catalogUrl()}/internal/catalog/validate-codes`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Service-Token': mintServiceToken('customer'),
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`catalog trả ${res.status} khi kiểm mã danh mục`);
    return (await res.json()) as { ok: boolean; unknown: string[] };
  }
}
