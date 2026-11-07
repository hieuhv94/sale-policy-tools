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
  /**
   * HAI Ô NGUỒN của địa chỉ đăng ký (`0177`), chụp vào hồ sơ cùng cột gộp ngay
   * trên. Cột gộp là DẪN XUẤT của đúng hai ô này (`0175`) — nó ở lại vì tờ giấy
   * in thẳng chuỗi ấy, còn màn hình hồ sơ bày hai ô.
   */
  province?: string | null;
  streetWard?: string | null;
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

/**
 * Mã lỗi nghiệp vụ bên trong một `HttpException` của Nest (`0083`).
 *
 * Hàm này ném `NotFoundException({ code })`, và mã ấy nằm trong phần THÂN phản
 * hồi chứ không phải trên `Error.message`. Đọc bằng `instanceof
 * NotFoundException` thì KHÔNG đủ: catalog trả 404 cho cả sản phẩm đã xoá lẫn
 * sản phẩm chưa khai giá, và hai chuyện ấy phải xử khác nhau.
 *
 * Đọc mềm, không ép kiểu: một lỗi mạng (`TypeError`) rơi vào đây thì trả về
 * `undefined`, và người gọi hiểu là *"không kết luận được"*.
 */
export const maLoiNghiepVu = (e: unknown): string | undefined => {
  const than = (e as { response?: unknown })?.response;
  const ma = (than as { code?: unknown })?.code;
  return typeof ma === 'string' ? ma : undefined;
};

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

  /**
   * Những ai trong `ids` NHẬN ĐƯỢC thông báo — tài khoản đang hoạt động, không
   * thuộc `KHONG_NHAN_THONG_BAO` (Ban lãnh đạo, `0260`).
   *
   * Bình luận (`0261`) dùng chính đường này cho danh sách nhắc tên: *"nhắc được
   * ai"* và *"ai nhận được thông báo nhắc tên"* là MỘT câu hỏi, và luật ấy chốt
   * ở identity. Lọc lại ở đây là dựng bản chép thứ hai của `KHONG_NHAN_THONG_BAO`.
   *
   * Ném khi hỏng, không nuốt: danh sách rỗng giả sẽ đọc ra là *"không ai để
   * nhắc"*, và lượt gửi bình luận có nhắc tên sẽ bị từ chối với một câu sai.
   */
  async nguoiNhanDuoc(
    ids: string[],
  ): Promise<{ userId: string; role: string; email: string; fullName: string }[]> {
    const list = [...new Set(ids.filter(Boolean))];
    if (list.length === 0) return [];
    const res = await fetch(`${identityUrl()}/internal/users/mail-targets`, {
      method: 'POST',
      headers: { ...svc(), 'content-type': 'application/json' },
      body: JSON.stringify({ userIds: list }),
    });
    if (!res.ok) throw new Error(`identity trả ${res.status} khi tra người nhắc được`);
    return (
      (await res.json()) as {
        targets: { userId: string; role: string; email: string; fullName: string }[];
      }
    ).targets;
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
        /*
         * CHẶN GIỜ, vì đây là việc DỌN chứ không phải việc người dùng đợi.
         *
         * Lượt gọi này nằm trên đường TRẢ LỜI của một thao tác đã xong — gỡ tệp
         * đã commit, hoặc lượt đính kèm vừa bị từ chối và lỗi đã sẵn sàng ném ra.
         * `document` chết hoặc treo thì không có lý do gì để người dùng ngồi chờ
         * hết thời gian mặc định của `fetch`.
         *
         * Đo được ở `0150`: một ca kiểm thử hai mươi lượt đính kèm hỏng trong
         * môi trường không có `document` chạy quá 30 giây rồi bị cắt — mỗi lượt
         * từ chối kéo theo một lời gọi treo.
         */
        signal: AbortSignal.timeout(3000),
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
    if (res.status === 404) {
      /*
       * ĐỌC MÃ TRONG THÂN, đừng gắn nhãn hộ catalog (`0199`).
       *
       * Bản trước ném thẳng `PRODUCT_NOT_FOUND` mà không mở thân phản hồi ra
       * xem, trong khi `snapshot()` bên catalog có HAI nguồn 404 khác hẳn nhau:
       * sản phẩm không còn trong danh mục, và sản phẩm còn nguyên đó mà chưa
       * khai giá tại ngày ấy (`PRICE_NOT_SET`). Gộp hai thứ vào một mã là nói
       * với người lập hồ sơ rằng *"không tìm thấy sản phẩm này"* về một mặt hàng
       * họ vừa chọn trong chính danh mục, rồi bảo họ chọn lại.
       *
       * Bản một sản phẩm ngay dưới đây vốn đã đọc đúng; hai hàm anh em trả lời
       * cùng một câu hỏi thì không được lệch nhau ở chỗ này.
       */
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      throw new NotFoundException({ code: body.code ?? 'PRODUCT_NOT_FOUND' });
    }
    if (!res.ok) throw new Error(`catalog trả ${res.status}`);
    const list = (await res.json()) as ProductSnapshot[];
    return new Map(list.map((s) => [s.productId, s]));
  }

  /**
   * Cùng lượt tra ấy, nhưng CHỊU ĐƯỢC sản phẩm vắng mặt (`0199`).
   *
   * ---------------------------------------------------------------------------
   * VÌ SAO PHẢI CÓ HÀM THỨ HAI, thay vì nới `productSnapshots`
   * ---------------------------------------------------------------------------
   *
   * `POST /internal/catalog/product-snapshots` là một vòng lặp `await` không bọc
   * `try`, nên **một id hỏng là cả lô 404** — không có kết quả từng phần. Đó là
   * hợp đồng CÓ CHỦ Ý, và nó đúng cho đường LẬP hồ sơ: thiếu một sản phẩm thì cả
   * hồ sơ sai, đi tiếp với một dòng khuyết là tệ hơn hẳn dừng lại.
   *
   * Đường ĐỐI CHIẾU thì ngược hẳn: ở đó một sản phẩm biến mất chính là THÔNG TIN
   * CẦN BÁO, không phải lý do bỏ cuộc. Nên hai bài toán, hai hàm — và bài toán
   * thứ hai phải nói được ba chuyện khác nhau chứ không phải hai.
   *
   * TRẢ VỀ HAI THỨ:
   *
   *   * `anh` — tra được.
   *   * `loi` — id KHÔNG tra được, kèm mã lỗi nếu **kết luận được**
   *     (`PRODUCT_NOT_FOUND` = không còn trong danh mục · `PRICE_NOT_SET` = còn
   *     đó mà chưa khai giá tại ngày ấy), hoặc `undefined` khi KHÔNG kết luận
   *     được — catalog đang khởi động lại, mạng chớp, 500.
   *
   * Ranh giới ấy là cả điểm của hàm này, và `0083` đã trả giá một lần cho nó:
   * coi mọi id vắng mặt là *"đã xoá khỏi danh mục"* thì một lượt catalog khởi
   * động lại ghi đè dấu vết của mọi hồ sơ đã đóng băng bằng một câu bịa. Người
   * gọi phải tự quyết mỗi nhóm nghĩa là gì — hàm này không đoán hộ.
   *
   * Đường nhanh vẫn là MỘT lời gọi cả lô; chỉ khi nó hỏng mới lùi về hỏi từng
   * cái, tức đường chậm chỉ chạy đúng lúc thật sự có sản phẩm vắng mặt.
   */
  async productSnapshotsChiuLoi(
    productIds: string[],
    customerType: number,
    on?: string | undefined,
  ): Promise<{ anh: Map<string, ProductSnapshot>; loi: Map<string, string | undefined> }> {
    if (productIds.length === 0) return { anh: new Map(), loi: new Map() };
    try {
      return { anh: await this.productSnapshots(productIds, customerType, on), loi: new Map() };
    } catch {
      const anh = new Map<string, ProductSnapshot>();
      const loi = new Map<string, string | undefined>();
      for (const id of productIds) {
        try {
          anh.set(id, await this.productSnapshot(id, customerType, on));
        } catch (e) {
          loi.set(id, maLoiNghiepVu(e));
        }
      }
      return { anh, loi };
    }
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
