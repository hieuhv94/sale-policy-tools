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
  /** Ba người được phân công theo luồng (`0031`). */
  tbp_user_id: string | null;
  ke_toan_user_id: string | null;
  sale_admin_user_id: string | null;
  submitted_at: string | null;
  tbp_signed_at: string | null;
  kt_l1_received_at: string | null;
  sa_handover_at: string | null;
  kt_l2_received_at: string | null;
  contract_issued_at: string | null;
  /**
   * Mẫu bản mềm đã đóng băng lúc gửi duyệt (`0098`).
   *
   * `null` = hồ sơ chưa gửi duyệt lần nào, hoặc lập trước `0098`. Hai nghĩa ấy
   * phân biệt bằng trạng thái — xem `RenderService.mauCua`.
   */
  /** Ảnh chụp khách hàng và hai cái tên, ghi lúc gửi duyệt / ký (`0101`). */
  kh_ma_snap: string | null;
  kh_ten_snap: string | null;
  kh_ma_so_thue_snap: string | null;
  kh_dia_chi_dang_ky_snap: string | null;
  kh_noi_nhan_hang_snap: string | null;
  kh_nguoi_dai_dien_snap: string | null;
  kh_chuc_danh_dai_dien_snap: string | null;
  kh_dien_thoai_snap: string | null;
  kh_cong_no_snap: string | null;
  nguoi_de_nghi_snap: string | null;
  tbp_ky_ten_snap: string | null;
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
  /** `0128` — in ra bản CSBH, và đóng băng vào hồ sơ lúc gửi duyệt. */
  phone: string | null;
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

  /**
   * Báo `policy` rằng vừa sinh xong một văn bản của hồ sơ (`0052`, sửa `0059`).
   *
   * `loai` quyết định TẤT CẢ, và mỗi loại làm đúng một việc:
   *
   *   - `HOP_DONG`  → đóng dấu xuất hợp đồng, KHÔNG ghi lịch sử
   *   - `BAN_SCAN` · `TEP_DINH_KEM` → ghi một dòng *Lịch sử*, không đóng dấu gì
   *
   * `HO_SO` đã rời khỏi danh sách: bản mềm không ghi lịch sử nữa nên nó không
   * còn lý do nào để gọi sang `policy`.
   *
   * Tham số `ghiLichSu` cũng đi cùng (`0059`). Nó tồn tại để phân biệt xem với
   * tải, mà phép phân biệt ấy chỉ có nghĩa cho hai loại vừa bị bỏ — giữ lại là
   * một công tắc mà cả hai đường gọi đều truyền cùng một giá trị.
   */
  async daSinhVanBan(
    policyId: string,
    loai: 'HOP_DONG' | 'BAN_SCAN' | 'TEP_DINH_KEM',
    me: { id: string; role: string },
  ): Promise<void> {
    const r = await fetch(
      `${policyUrl()}/internal/policies/${encodeURIComponent(policyId)}/da-sinh-van-ban`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...svc() },
        body: JSON.stringify({ loai, actorId: me.id, actorRole: me.role }),
      },
    );
    if (!r.ok) throw new Error(`policy trả ${r.status} khi ghi lần sinh văn bản`);
  }

  /**
   * AI nhìn thấy khách hàng này (`0148`) — hỏi `customer`, không tự suy.
   *
   * Bản trước `document` tự khai luật: *"khách hàng thì theo TDV phụ trách"* —
   * đúng ở `0031` và sai từ đúng lúc ấy, vì `0031` cũng dựng ra bảng
   * `cus.customer_access`, thứ mà chỉ `customer` biết. Hệ quả đo được: Trưởng bộ
   * phận mở được màn hình khách hàng nhưng nhận 403 ở mọi tệp pháp lý của họ.
   *
   * Hỏi thay vì chép, vì đây là luật của service kia và nó đã đổi một lần rồi.
   */
  async customerViewers(id: string): Promise<string[]> {
    const r = await fetch(
      `${customerUrl()}/internal/customers/${encodeURIComponent(id)}/nguoi-xem`,
      { headers: svc() },
    );
    if (r.status === 404) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    if (!r.ok) throw new Error(`customer trả ${r.status} khi hỏi người xem`);
    const b = (await r.json()) as { userIds?: unknown };
    return Array.isArray(b.userIds) ? (b.userIds as string[]) : [];
  }

  async customer(id: string): Promise<CustomerFull> {
    const r = await fetch(`${customerUrl()}/internal/customers/${encodeURIComponent(id)}`, {
      headers: svc(),
    });
    if (r.status === 404) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    if (!r.ok) throw new Error(`customer trả ${r.status}`);
    return (await r.json()) as CustomerFull;
  }


  /**
   * Họ tên theo vai trò cho khối "TBP · kế toán · người đề nghị" trên bản A4.
   *
   * Dùng lại đúng hàm mà notification dùng để chọn người nhận thư: nếu bản A4 và
   * email ghi hai cái tên khác nhau cho cùng một hồ sơ thì một trong hai sai, và
   * cách chắc chắn nhất để điều đó không xảy ra là chỉ có một phép suy diễn.
   */
  /**
   * Tên người theo vai trò, để điền vào bản A4 và hợp đồng.
   *
   * Từ `0031` phải truyền cả ba người được phân công: `notify-targets` không suy
   * ngược từ cây tổ chức nữa, nên gọi với mỗi TDV thì bản A4 chỉ có tên người
   * lập và ba ô chữ ký còn trống.
   */
  async peopleFor(
    tdvUserId: string,
    phanCong: {
      tbp?: string | null | undefined;
      keToan?: string | null | undefined;
      saleAdmin?: string | null | undefined;
    } = {},
  ): Promise<Record<string, string>> {
    if (!tdvUserId) return {};
    const q = new URLSearchParams();
    if (phanCong.tbp) q.set('tbp', phanCong.tbp);
    if (phanCong.keToan) q.set('keToan', phanCong.keToan);
    if (phanCong.saleAdmin) q.set('saleAdmin', phanCong.saleAdmin);
    const duoi = q.toString() ? `?${q.toString()}` : '';
    const r = await fetch(
      `${identityUrl()}/internal/notify-targets/${encodeURIComponent(tdvUserId)}${duoi}`,
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
