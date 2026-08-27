/**
 * Lời gọi ra ba service khác. policy không đọc được schema `cat`, `cus` lẫn `idn`.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { identityUrl, mintServiceToken } from '@csbh/http-kit';

const catalogUrl = () => process.env.CATALOG_URL ?? 'http://catalog:3002';
const customerUrl = () => process.env.CUSTOMER_URL ?? 'http://customer:3003';
const documentUrl = () => process.env.DOCUMENT_URL ?? 'http://document:3005';

export type CustomerInfo = {
  id: string;
  code: string;
  name: string;
  customerType: number;
  /** `DANG_HOP_TAC` | `NGUNG_HOP_TAC` (`0034`). */
  status?: string;
  tdvUserId: string;
  /**
   * Công nợ, bigint dạng CHUỖI (`0061`).
   *
   * Khai tuỳ chọn dù `customer` luôn trả: kiểu này cũng mô tả phần thân mà
   * `create()` đọc, và ở đó công nợ không liên quan gì. Khai bắt buộc là ép mọi
   * chỗ dựng `CustomerInfo` trong test phải bịa ra một con số vô nghĩa.
   */
  debt?: string;
  /**
   * Bảy trường còn lại của khối "Khách hàng TRONG hồ sơ" (`0101`).
   *
   * `customer` vẫn trả đủ chúng từ đầu — `document` đọc chính chúng để dựng bản
   * mềm. Khai ở đây vì từ `0101` `policy` cũng cần: nó CHỤP LẠI chúng vào hồ sơ
   * lúc gửi duyệt. Tuỳ chọn cùng lý do với `debt` ở ngay trên.
   */
  idNumber?: string | null;
  registeredAddress?: string | null;
  deliveryAddress?: string | null;
  ownerName?: string | null;
  ownerTitle?: string | null;
  /** `0128` — vào bản CSBH in ra, nên `policy` cũng phải chụp lại nó lúc gửi. */
  phone?: string | null;
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
  private readonly log = new Logger(Clients.name);

  /** TDV này đã có Trưởng bộ phận quản lý chưa. `null` là chưa gán. */
  /**
   * Vai trò và trạng thái của những tài khoản vừa được chọn (`0031`).
   *
   * Thay cho `approverOf` bị gỡ cùng cây tổ chức. Hỏi MỘT lượt cho cả danh sách
   * chứ không mỗi người một lượt: bước gửi duyệt chọn hai người cùng lúc, và hai
   * vòng mạng nối tiếp cho một thao tác đồng bộ là hai lần cơ hội hỏng.
   */
  /**
   * Tên hiển thị của một loạt người dùng — cho màn hình nhật ký hồ sơ (`0036`).
   *
   * HỎNG THÌ TRẢ RỖNG, không ném: nhật ký hiện uuid thay cho tên thì xấu, còn
   * ném lỗi thì cả màn hình nhật ký không mở được — mà nó là màn hình người ta
   * vào đúng lúc đang đi tìm xem chuyện gì đã xảy ra.
   */
  async userNames(ids: string[]): Promise<Record<string, string>> {
    const list = [...new Set(ids.filter(Boolean))];
    if (list.length === 0) return {};
    try {
      const res = await fetch(`${identityUrl()}/internal/users/names`, {
        method: 'POST',
        headers: { ...svc(), 'content-type': 'application/json' },
        body: JSON.stringify({ userIds: list }),
      });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as Record<string, string>;
    } catch {
      return {};
    }
  }

  async checkUsers(
    ids: string[],
  ): Promise<Record<string, { role: string; isActive: boolean; fullName: string }>> {
    if (ids.length === 0) return {};
    const res = await fetch(`${identityUrl()}/internal/users/check`, {
      method: 'POST',
      headers: { ...svc(), 'content-type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(`identity trả ${res.status} khi kiểm tài khoản được chọn`);
    return (
      (await res.json()) as {
        users: Record<string, { role: string; isActive: boolean; fullName: string }>;
      }
    ).users;
  }

  /**
   * Cấp quyền xem khách hàng cho những người vừa được giao hồ sơ (`0031`).
   *
   * Ném ra khi hỏng, KHÔNG nuốt: một người được ghi tên lên hồ sơ mà không mở
   * được khách hàng của hồ sơ ấy là một trạng thái nửa vời, và người dùng không
   * có cách nào tự chữa. Thà để hành động hỏng và bấm lại.
   */
  async grantCustomerAccess(customerId: string, userIds: string[]): Promise<void> {
    const ids = userIds.filter(Boolean);
    if (ids.length === 0) return;
    const res = await fetch(
      `${customerUrl()}/internal/customers/${encodeURIComponent(customerId)}/access`,
      {
        method: 'POST',
        headers: { ...svc(), 'content-type': 'application/json' },
        body: JSON.stringify({ userIds: ids }),
      },
    );
    if (!res.ok) throw new Error(`customer trả ${res.status} khi cấp quyền xem khách hàng`);
  }

  /**
   * Nhân bản tệp *Giấy tờ hồ sơ* sang phiên bản CSBH mới (`0148`).
   *
   * NÉM RA KHI HỎNG, không nuốt. Nuốt thì bản mới lập xong mà thiếu giấy tờ, và
   * người lập không có cách nào biết — đúng cái hỏng lượt này sinh ra để chữa,
   * chỉ đổi từ "luôn thiếu" thành "thỉnh thoảng thiếu", tức khó tìm hơn hẳn.
   *
   * Cái giá, ghi ra để không ai phải đoán: từ lượt này, lập phiên bản CSBH mới
   * cho một khách hàng **đã có giấy tờ đính kèm** cần `document` sống. Hồ sơ đầu
   * tiên của một khách, và mọi bản mới của khách chưa đính giấy tờ nào, thì
   * KHÔNG gọi — `create()` chỉ gọi khi bản cũ thật sự có tệp.
   */
  async saoChepGiayTo(
    tuHoSo: string,
    sangHoSo: string,
    objectKeys: string[],
  ): Promise<{ objectKey: string; fileName: string; sizeBytes: string; uploadedBy: string }[]> {
    if (objectKeys.length === 0) return [];
    const res = await fetch(`${documentUrl()}/internal/files/sao-chep`, {
      method: 'POST',
      headers: { ...svc(), 'content-type': 'application/json' },
      body: JSON.stringify({ from: tuHoSo, to: sangHoSo, objectKeys }),
    });
    if (!res.ok) throw new Error(`document trả ${res.status} khi nhân bản giấy tờ hồ sơ`);
    const b = (await res.json()) as { tep?: unknown };
    return Array.isArray(b.tep)
      ? (b.tep as { objectKey: string; fileName: string; sizeBytes: string; uploadedBy: string }[])
      : [];
  }

  /**
   * Gỡ hẳn một tệp khỏi kho — gọi sau khi con trỏ ở `pol` đã bị xoá (`0149`).
   *
   * NUỐT LỖI, và đây là một trong số rất ít chỗ nuốt có lý do viết ra được:
   *
   *   - việc người dùng yêu cầu — *gỡ tệp khỏi hồ sơ* — ĐÃ XONG và đã commit.
   *     Ném ra ở đây là báo "gỡ hỏng" cho một thao tác vừa thành công;
   *   - đường lùi khi nuốt là **đúng hành vi trước `0149`**: tệp nằm lại kho mà
   *     không hồ sơ nào trỏ tới. Không mất dữ liệu, không lộ dữ liệu, chỉ tốn
   *     chỗ chứa — tức nuốt ở đây làm hệ thống lùi về trạng thái cũ chứ không
   *     dựng ra một trạng thái mới nào.
   *
   * Ghi log để lượt dọn về sau còn có dấu vết mà lần theo.
   */
  async goBoTep(objectKey: string, lyDo: string): Promise<void> {
    try {
      const res = await fetch(`${documentUrl()}/internal/files/go-bo`, {
        method: 'POST',
        headers: { ...svc(), 'content-type': 'application/json' },
        body: JSON.stringify({ objectKey, lyDo }),
      });
      if (!res.ok) throw new Error(`document trả ${res.status}`);
    } catch (e) {
      this.log.error(`không gỡ được tệp ${objectKey} khỏi kho: ${String(e)}`);
    }
  }

  async customer(id: string): Promise<CustomerInfo> {
    const res = await fetch(`${customerUrl()}/internal/customers/${encodeURIComponent(id)}`, {
      headers: svc(),
    });
    if (res.status === 404) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    if (!res.ok) throw new Error(`customer trả ${res.status}`);
    return (await res.json()) as CustomerInfo;
  }

  /**
   * Tra nhiều sản phẩm trong MỘT vòng mạng (chống N+1 khi hồ sơ nhiều dòng).
   *
   * `on` là NGÀY ÁP DỤNG của hồ sơ (`0029`). Bỏ trống thì catalog lấy hôm nay.
   * Đây là tham số quan trọng nhất của cả hàm: giá và ngưỡng đều có ngày hiệu
   * lực, nên tra theo hôm nay cho một hồ sơ áp dụng từ tháng sau là chụp đúng
   * con số của một ngày không liên quan gì tới hồ sơ ấy.
   */
  async productSnapshots(
    productIds: string[],
    customerType: number,
    on?: string | undefined,
  ): Promise<Map<string, ProductSnapshot>> {
    if (productIds.length === 0) return new Map();
    const res = await fetch(`${catalogUrl()}/internal/catalog/product-snapshots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...svc() },
      body: JSON.stringify({ productIds, customerType, ...(on ? { on } : {}) }),
    });
    if (res.status === 404) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
    if (!res.ok) throw new Error(`catalog trả ${res.status}`);
    const list = (await res.json()) as ProductSnapshot[];
    return new Map(list.map((s) => [s.productId, s]));
  }

  /** `on` — xem chú thích ở `productSnapshots`. */
  async productSnapshot(
    productId: string,
    customerType: number,
    on?: string | undefined,
  ): Promise<ProductSnapshot> {
    const qs = new URLSearchParams({ customerType: String(customerType) });
    if (on) qs.set('on', on);
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
