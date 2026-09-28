import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PG, paged, pgCode, type AuthUser, type Page, kemNguCanh } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { ScopeClient } from '../infra/scope.client.js';
import { PolicyClient } from '../infra/policy.client.js';
import { DocumentClient } from '../infra/document.client.js';
import { cauNo, loiDieuKhoan, type DieuKhoanNo } from './dieu-khoan.js';
import { chuanTinhThanh } from './tinh-thanh.js';

/**
 * Ngăn cách giữa các địa chỉ trong hai cột GỘP (`0154`).
 *
 * Cùng một ký tự mà `cus.gop_dia_chi()` dùng để nối và tầng này dùng để tách —
 * khai một chỗ, vì hai bên lệch nhau là một khách hàng bốn địa chỉ đọc ra thành
 * một chuỗi dài. Ràng buộc `dia_chi_mot_dong` cấm ký tự này nằm trong một địa
 * chỉ, nên phép nối là không mất mát và phép tách trả về đúng mảng gốc.
 */
const NGAN_DIA_CHI = '\n';

/** Cột gộp → mảng. Chuỗi rỗng và `null` đều ra mảng rỗng, không ra `['']`. */
export const tachDiaChi = (gop: string | null): string[] =>
  gop === null || gop.trim() === '' ? [] : gop.split(NGAN_DIA_CHI);

export type CustomerInput = {
  code: string;
  name: string;
  customerType: number;
  /**
   * Địa chỉ đăng ký — HAI Ô, và CHỈ MỘT địa chỉ (`0175`, chốt 05/09).
   *
   * `0154` cho nó là một MẢNG, để một chủ hộ nhiều điểm bán khai đủ. Khách hàng
   * thu lại: địa chỉ đăng ký theo giấy đăng ký kinh doanh, mà một pháp nhân chỉ
   * có một tờ giấy ấy. Nhiều điểm bán vẫn khai được — bằng địa chỉ GIAO HÀNG,
   * thứ vẫn là danh sách.
   *
   * Hai ô chứ không một chuỗi vì khách hàng nêu đích danh hai mục, và tách ra
   * thì tỉnh/thành trở thành một giá trị lọc và đối chiếu được — chuỗi tự do thì
   * không.
   */
  province: string;
  streetWard: string;
  ownerName: string;
  /**
   * Mã số thuế — **BẮT BUỘC** từ `0175`, và **DUY NHẤT** giữa các khách đang
   * hợp tác. Đảo hẳn `0006`; xem `db/migrations/0114_…` để biết vì sao lượt đảo
   * ấy phải đi sau `0154`.
   */
  idNumber: string;
  /** Nơi nhận hàng — không bắt buộc; mảng rỗng nghĩa là trùng địa chỉ đăng ký. */
  deliveryAddresses?: string[] | undefined;
  ownerTitle?: string | undefined;
  ownerIdNumber?: string | undefined;
  /** Số điện thoại liên hệ (`0128`). `undefined` được — khách cũ chưa ai khai. */
  phone?: string | undefined;
  /**
   * Điều khoản thanh toán (`0138`) — thay cho `debt: bigint` trước đó.
   *
   * `debtNote` chỉ có nghĩa khi `debtTerm === 'KHAC'`; ràng buộc ấy kiểm ở
   * `assertDieuKhoan` chứ không ở CSDL, để câu báo lỗi chỉ được vào đúng ô.
   */
  debtTerm?: DieuKhoanNo | undefined;
  debtNote?: string | undefined;
};

type Row = {
  id: string;
  code: string;
  name: string;
  id_number: string | null;
  customer_type: number;
  province: string;
  street_ward: string;
  registered_address: string;
  delivery_address: string | null;
  owner_name: string;
  owner_title: string | null;
  owner_id_number: string | null;
  phone: string | null;
  debt_term: string;
  debt_note: string | null;
  tdv_user_id: string;
  /** `0034` — ngừng hợp tác thì khách biến khỏi ô chọn lúc lập hồ sơ. */
  status: string;
  retired_at: Date | null;
};

/**
 * Vai trò được đổi TDV phụ trách. TDV không tự chuyển khách của mình (CUST-10).
 *
 * CHỈ CÒN Quản trị hệ thống từ `0031`. Sale Admin có quyền này suốt từ P11d, và
 * hôm nay rà lại thì KHÔNG có yêu cầu nghiệp vụ nào cấp nó: YCNV §6.1 chỉ nói
 * "khách hàng do TDV tạo", §2.5 liệt kê bảy đầu việc của Sale Admin mà không có
 * việc giao khách. Lý do thật của lựa chọn cũ là Sale Admin đứng ở gốc nhánh cây
 * chứa TDV đó — và cây ấy vừa bị bỏ.
 *
 * Quản trị hệ thống thay vào, vì đây là việc hành chính đi kèm việc vô hiệu hoá
 * tài khoản một TDV nghỉ việc, và họ đã là người làm vế kia.
 */
const CAN_REASSIGN = ['QUAN_TRI'];

/**
 * Tên chỉ mục duy nhất của mã khách hàng (`0006`), so sau `upper(btrim())`.
 *
 * Hằng vì lượt `UPDATE` bắt `23505` theo TÊN (`0226`), và có ca kiểm hỏi thẳng
 * `pg_indexes` rằng cái tên này còn tồn tại — đổi tên chỉ mục mà quên hằng là
 * lượt trùng mã lọt thành 500.
 */
export const UQ_MA_KHACH = 'uq_customer_code_norm';

@Injectable()
export class CustomersService {
  constructor(
    private readonly db: Db,
    private readonly scope: ScopeClient,
    private readonly policies: PolicyClient,
    private readonly documents: DocumentClient,
  ) {}

  /**
   * PHẢI CÒN ÍT NHẤT MỘT địa chỉ đăng ký sau khi bỏ ô trống (`0154`).
   *
   * Luật của CẢ DANH SÁCH, nên nó không phát biểu được bằng một bộ kiểm theo
   * từng phần tử — cùng lý do `assertDieuKhoan` phải tồn tại. Controller cho ô
   * trống đi qua có chủ ý; chỗ duy nhất biết *"sau khi lọc còn gì không"* là đây.
   *
   * `undefined` thì bỏ qua: lượt `PATCH` không nói tới địa chỉ thì không đụng
   * tới chúng, và bắt mọi lượt sửa số điện thoại phải gửi kèm địa chỉ là biến
   * một trường tuỳ chọn thành bắt buộc.
   */
  /*
   * HAI CHỮ KÝ, để đường `create` khỏi phải `!` hay `?? ''` một giá trị mà chính
   * bộ kiểm của controller đã bảo đảm là có: `POST` khai `province: str(1, …)`
   * nên nó không bao giờ `undefined`, còn `PATCH` thì có.
   */
  private chotDiaChiDangKy(province: string, streetWard: string | undefined): string;
  private chotDiaChiDangKy(
    province: string | undefined,
    streetWard: string | undefined,
  ): string | undefined;
  private chotDiaChiDangKy(
    province: string | undefined,
    streetWard: string | undefined,
  ): string | undefined {
    /*
     * `undefined` thì bỏ qua — lượt `PATCH` không nói tới địa chỉ thì không đụng
     * tới nó. Nhưng CHUỖI RỖNG thì không: gửi `''` là cố ý xoá, và ô này bắt
     * buộc. Hai trạng thái ấy phải tách nhau, đúng như `0138` đã phải tách cho
     * `debtNote`.
     */
    if (province !== undefined && province.trim() === '') {
      throw new BadRequestException({
        code: 'CUSTOMER_PROVINCE_REQUIRED',
        message: 'Phải điền Tỉnh/Thành phố theo đăng ký kinh doanh.',
        field: 'province',
      });
    }
    if (streetWard !== undefined && streetWard.trim() === '') {
      throw new BadRequestException({
        code: 'CUSTOMER_STREET_REQUIRED',
        message: 'Phải điền Số nhà, Phường xã theo đăng ký kinh doanh.',
        field: 'streetWard',
      });
    }
    /*
     * TỈNH/THÀNH PHẢI NẰM TRONG 63 TÊN (`0205`).
     *
     * Hàm này TRẢ VỀ tên chuẩn chứ không chỉ gật đầu, và hai chỗ ghi ở dưới dùng
     * đúng giá trị trả về: `chuanTinhThanh` chuẩn hoá NFC, nên chỉ kiểm rồi ghi
     * nguyên chuỗi gửi lên là CSDL giữ hai dòng `Hà Nội` khác byte — thứ mà cả
     * chặng này dựng ra để dẹp. Lý do đầy đủ nằm ở `tinh-thanh.ts`.
     *
     * Chốt ở SERVICE chứ không phải `oneOf(...)` ở controller, dù `debtTerm`
     * (`0138`) đi đường ấy: `PATCH` khai `province` là `str(0, …)` có chủ ý — để
     * chuỗi rỗng đi qua được tới đây và thành một câu tiếng Việt nói rõ phải
     * điền ô nào. Đổi sang `oneOf` là lấy lại đúng câu lỗi mà `0175` vừa dựng
     * ra, và bày cho người dùng một danh sách 63 chuỗi thay cho nó.
     */
    if (province === undefined) return undefined;
    const chuan = chuanTinhThanh(province);
    if (chuan === null) {
      throw new BadRequestException({
        code: 'CUSTOMER_PROVINCE_UNKNOWN',
        message: 'Tỉnh/Thành phố phải chọn trong danh sách 63 tỉnh, thành phố.',
        field: 'province',
      });
    }
    return chuan;
  }

  /**
   * MÃ SỐ THUẾ DUY NHẤT giữa các khách ĐANG hợp tác (`0175`, chốt 05/09).
   *
   * Kiểm ở đây **và** ở chỉ mục `uq_customer_id_number`. Hai chỗ, và cả hai đều
   * cần: chỉ mục là chốt thật — nó đúng cả khi hai lượt lập chạy song song —
   * còn phép kiểm này là chỗ duy nhất trả được một câu tiếng Việt nói ra khách
   * hàng nào đang giữ mã ấy. Bắt `23505` rồi đoán ngược lại là đoán, vì dòng
   * khách hàng còn một chỉ mục duy nhất nữa: mã khách hàng.
   */
  private async assertMstChuaDung(idNumber: string | undefined, tru?: string): Promise<void> {
    if (idNumber === undefined) return;
    const trung = await this.findByIdNumber(idNumber, tru);
    if (trung.length === 0) return;
    throw new ConflictException({
      code: 'CUSTOMER_ID_NUMBER_DUPLICATE',
      message: `Mã số thuế này đã thuộc về khách hàng ${trung[0]!.code} — ${trung[0]!.name}.`,
      field: 'idNumber',
      khachHang: trung[0],
    });
  }

  /** Luật ở `dieu-khoan.ts`, cạnh chính bảng từ vựng nó kiểm (`0138`). */
  private assertDieuKhoan(term: string | undefined, note: string | undefined): void {
    const l = loiDieuKhoan(term, note);
    if (l) throw new BadRequestException(l);
  }

  /**
   * Ghi lại TOÀN BỘ địa chỉ một loại của một khách hàng (`0154`).
   *
   * XOÁ HẾT RỒI CHÈN LẠI, không so từng dòng để sửa tại chỗ. Địa chỉ không mang
   * khoá nghiệp vụ nào — hai dòng cùng nội dung là hai dòng không phân biệt
   * được — nên "sửa dòng thứ hai" và "xoá dòng hai, thêm một dòng mới" là cùng
   * một việc. Ghi đè trọn vẹn thì thứ tự người dùng sắp luôn là thứ tự lưu, và
   * không có nhánh nào để lệch.
   *
   * `stt` đánh từ 1 theo đúng thứ tự mảng gửi lên: đó là thứ tự in ra giấy.
   *
   * Trigger `tr_gop_dia_chi` dựng lại hai cột gộp sau mỗi lượt ghi, nên KHÔNG
   * chỗ nào ở đây đụng tới `registered_address`/`delivery_address`.
   */
  private async ghiDiaChi(
    c: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    customerId: string,
    kind: 'NHAN_HANG',
    dsChua: string[],
  ): Promise<void> {
    /*
     * GỘP MỌI KHOẢNG TRẮNG thành một dấu cách, kể cả xuống dòng.
     *
     * Ràng buộc `dia_chi_mot_dong` cấm `\n` trong một địa chỉ — phải cấm, vì hai
     * cột gộp nối bằng chính ký tự ấy. Nhưng `str(1, 500)` ở controller CHO
     * PHÉP `\n` đi qua, nên một người dán địa chỉ hai dòng từ Word sẽ chạm thẳng
     * vào chốt chặn CSDL và nhận **500** — một mã lỗi không nói gì về việc phải
     * làm, cho một thao tác hoàn toàn hợp lý.
     *
     * Chuẩn hoá thay vì từ chối: người dùng muốn nói một địa chỉ, và ký tự xuống
     * dòng ở đây là chuyện trình bày chứ không phải nội dung. Cùng phép biến đổi
     * mà migration `0109` dùng để chuyển dữ liệu cũ.
     */
    const ds = dsChua.map((d) => d.replace(/\s+/g, ' ').trim()).filter((d) => d !== '');
    await c.query(`DELETE FROM cus.customer_address WHERE customer_id = $1 AND kind = $2`, [
      customerId,
      kind,
    ]);
    if (ds.length === 0) return;
    await c.query(
      `INSERT INTO cus.customer_address (customer_id, kind, address, stt)
       SELECT $1, $2::cus.address_kind, d.address, d.stt
         FROM unnest($3::text[]) WITH ORDINALITY AS d(address, stt)`,
      [customerId, kind, ds],
    );
  }

  async create(input: CustomerInput, me: AuthUser) {
    this.assertDieuKhoan(input.debtTerm, input.debtNote);
    const tinhThanh = this.chotDiaChiDangKy(input.province, input.streetWard);
    /*
     * TRÙNG MÃ SỐ THUẾ THÌ KHÔNG LẬP ĐƯỢC (`0175`) — đảo hẳn `CUST-05`.
     *
     * Tới `0174` chỗ này chỉ cảnh báo, với lý do *"một chủ hộ mở nhiều điểm bán
     * là nghiệp vụ có thật"*. Nhu cầu ấy giờ có đường riêng — nhiều địa chỉ giao
     * hàng trên CÙNG một khách (`0154`) — nên hai khách cùng mã số thuế thôi là
     * một cách khai hợp lệ.
     */
    await this.assertMstChuaDung(input.idNumber);

    // Ghi khách hàng và ghi sự kiện trong CÙNG transaction. Trước P7b bước này
    // không phát sự kiện nào, và hậu quả rộng hơn báo cáo: nhật ký cũng không có
    // dòng nào cho việc lập khách hàng, tức là mục 10 hở đúng ở thao tác mở đầu
    // mọi hồ sơ.
    const row = await this.db.tx(async (c) => {
      const r = await c
        .query<Row>(
          /*
           * `registered_address` và `delivery_address` KHÔNG nằm trong câu này
           * nữa (`0154`) — chúng là cột dẫn xuất, do trigger dựng từ
           * `cus.customer_address` ngay dưới. Cột đầu là `NOT NULL` nên nó nhận
           * mặc định `''` của lược đồ trong khoảnh khắc giữa hai câu lệnh; cả
           * hai nằm trong CÙNG transaction nên không lượt đọc nào thấy khoảng
           * giữa ấy.
           */
          `INSERT INTO cus.customer
             (code, name, id_number, customer_type,
              owner_name, owner_title, owner_id_number, phone, debt_term, debt_note,
              province, street_ward,
              tdv_user_id, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
           RETURNING *`,
          [
            input.code,
            input.name,
            input.idNumber ?? null,
            input.customerType,
            input.ownerName,
            input.ownerTitle ?? null,
            input.ownerIdNumber ?? null,
            input.phone ?? null,
            input.debtTerm ?? 'SAU_NHAN_HANG',
            input.debtNote ?? null,
            // Tên của BẢNG, không phải chuỗi gửi lên (`0205` — chuẩn hoá NFC).
            tinhThanh,
            input.streetWard.trim(),
            // TDV phụ trách mặc định là người tạo (CUST-01).
            me.id,
          ],
        )
        .catch((e: unknown) => {
          if (pgCode(e) === PG.uniqueViolation) {
            throw new ConflictException({ code: 'CUSTOMER_CODE_DUPLICATE' });
          }
          throw e;
        });
      const created = r.rows[0]!;

      /*
       * Địa chỉ ghi NGAY SAU dòng khách hàng, trong cùng transaction (`0154`).
       *
       * Trigger dựng lại hai cột gộp, nên `created` trong tay đã CŨ — nó là bản
       * `RETURNING *` chụp trước lượt ghi địa chỉ, và hai cột gộp của nó còn
       * rỗng. Phải đọc lại dòng, nếu không thì `after` trong nhật ký và giá trị
       * trả về cho màn hình đều nói rằng khách hàng vừa lập không có địa chỉ nào.
       */
      await this.ghiDiaChi(c, created.id, 'NHAN_HANG', input.deliveryAddresses ?? []);
      const sau = (await c.query<Row>(`SELECT * FROM cus.customer WHERE id = $1`, [created.id]))
        .rows[0]!;

      await c.query(`INSERT INTO cus.outbox (routing_key, payload) VALUES ($1,$2::jsonb)`, [
        'customer.created',
        JSON.stringify(kemNguCanh({
          entity: 'customer',
          id: sau.id,
          customerId: sau.id,
          actorId: me.id,
          after: toDto(sau),
          at: new Date().toISOString(),
        })),
      ]);
      return sau;
    });

    return toDto(row);
  }

  async byId(id: string, me: AuthUser) {
    const row = await this.db.one<Row>(`SELECT * FROM cus.customer WHERE id = $1`, [id]);
    if (!row) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    await this.assertInScope(row.tdv_user_id, me, id);
    return toDto(row);
  }

  /**
   * Tìm theo tên, địa chỉ đăng ký hoặc mã số thuế (CUST-17).
   *
   * KHÔNG có trường "Tên mã khách" — khái niệm đó đã bỏ khỏi yêu cầu; ai muốn
   * tra thì dùng đúng ba tiêu chí trên.
   */
  async search(
    q: string | undefined,
    me: AuthUser,
    page: Page,
    opts: { forNewPolicy?: boolean | undefined } = {},
  ) {
    const ids = await this.scope.userIdsFor(me);
    const like = q ? `%${q}%` : null;
    // Chuỗi ghép giống hệt biểu thức của index GIN trigram ix_customer_search —
    // lệch một ký tự là Postgres không dùng index và quay về quét toàn bảng.
    const rows = await this.db.q<Row & { total_count: string }>(
      // Hai nguồn quyền xem, gộp bằng `OR` (`0031`): khách mình phụ trách, và
      // khách của những CSBH mình đã xử lý. `$3` là cờ "Quản trị thấy tất cả" —
      // đưa vào câu lệnh thay vì dựng hai câu, để chỉ có một hình dạng truy vấn
      // phải đọc và phải tối ưu.
      `SELECT *, count(*) OVER() AS total_count FROM cus.customer c
        WHERE ($5::boolean
               OR c.tdv_user_id = ANY($1::uuid[])
               OR EXISTS (SELECT 1 FROM cus.customer_access a
                           WHERE a.customer_id = c.id AND a.user_id = ANY($1::uuid[])))
          AND ($2::text IS NULL
               OR (name || ' ' || registered_address || ' ' || coalesce(id_number, ''))
                  ILIKE $2)
          -- forNewPolicy giấu khách đã ngừng hợp tác khỏi ô chọn lúc lập hồ sơ.
          -- Danh sách khách hàng bình thường VẪN hiện họ: hồ sơ cũ của họ phải
          -- tra lại được, và một khách biến mất hẳn khỏi mọi màn hình là một
          -- khách không ai đối chiếu được nữa (0034).
          AND (NOT $6::boolean OR c.status = 'DANG_HOP_TAC')
        -- Cột id là KHOÁ PHÁ HOÀ, không phải trang trí. Hai khách hàng trùng tên
        -- là chuyện thường (chuỗi nhà thuốc cùng thương hiệu), và khi khoá sắp
        -- xếp bị hoà thì Postgres được phép trả về theo thứ tự bất kỳ — hai lời
        -- gọi LIMIT/OFFSET liên tiếp cho ra hai thứ tự khác nhau, nên trang 2
        -- lặp lại một dòng của trang 1 và bỏ mất một dòng khác. Không có thông
        -- báo lỗi nào; người dùng chỉ thấy một khách hàng hiện hai lần.
        ORDER BY name, id
        LIMIT $3 OFFSET $4`,
      [ids, like, page.limit, page.offset, me.role === 'QUAN_TRI', opts.forNewPolicy === true],
    );
    const out = paged(rows, page);
    return { ...out, items: out.items.map((r) => toDto(r as unknown as Row)) };
  }

  async update(
    id: string,
    // Mọi trường đều `| undefined` tường minh: với exactOptionalPropertyTypes,
    // "vắng mặt" và "có mặt nhưng undefined" là hai kiểu khác nhau, mà bộ kiểm
    // dữ liệu vào luôn trả về dạng thứ hai.
    patch: { [K in keyof CustomerInput]?: CustomerInput[K] | undefined } & {
      tdvUserId?: string | undefined;
    },
    me: AuthUser,
  ) {
    this.assertDieuKhoan(patch.debtTerm, patch.debtNote);
    const tinhThanh = this.chotDiaChiDangKy(patch.province, patch.streetWard);
    const cur = await this.db.one<Row>(`SELECT * FROM cus.customer WHERE id = $1`, [id]);
    if (!cur) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    await this.assertInScope(cur.tdv_user_id, me, id);
    /*
     * CHỈ TDV PHỤ TRÁCH SỬA THÔNG TIN KHÁCH HÀNG (`0227`, khách hàng chốt 28/09).
     *
     * Tới `0226` mọi vai trò trong `WRITERS` sửa được khách hàng trong phạm vi
     * của mình — một danh sách dựng từ bản đầu, KHÔNG có quyết định nghiệp vụ
     * nào đứng sau: YCNV 2.4 cho Kế toán *"mở thông tin khách hàng để đối
     * chiếu"*, 2.5 viết Sale Admin *"không sửa nội dung CSBH"*, 2.7 cho Quản trị
     * đúng một việc với khách hàng là đổi TDV phụ trách. Giao diện còn lệch với
     * chính nó: máy chủ cho cả TBP, màn hình giấu nút với TBP.
     *
     * Cùng một đường `PATCH` còn gánh lượt ĐỔI TDV của Quản trị, nên luật tách
     * theo TRƯỜNG: lượt chỉ mang `tdvUserId` là việc hành chính (chốt
     * `CAN_REASSIGN` ngay dưới); lượt mang bất kỳ trường nào khác là sửa thông
     * tin khách — của TDV phụ trách. Đếm trường CÓ GIÁ TRỊ, không đếm khoá: bộ
     * kiểm dữ liệu vào trả khoá vắng mặt dưới dạng `undefined`.
     */
    const suaThongTin = Object.entries(patch).some(([k, v]) => k !== 'tdvUserId' && v !== undefined);
    if (suaThongTin) this.assertChinhTdv(cur, me);

    // TRỪ CHÍNH MÌNH: lượt sửa nào cũng gửi lại mã số thuế đang có, và không trừ
    // ra thì không khách hàng nào sửa được gì nữa.
    await this.assertMstChuaDung(patch.idNumber, id);

    /*
     * ĐỔI MÃ KHÁCH HÀNG (`0226`). Ai đổi được đã chốt ngay trên (`0227`: mọi
     * lượt sửa thông tin là của TDV phụ trách); ở đây còn hai luật riêng của MÃ.
     *
     * "Đổi" so trên chuỗi đã cắt khoảng trắng, KHÔNG so sau `upper()`: `kh-01` →
     * `KH-01` là một lượt đổi thật với người đọc tờ giấy, dù chỉ mục duy nhất
     * coi hai chuỗi là một. Gửi lại ĐÚNG mã đang có thì không phải đổi, nên
     * không vướng khoá CSBH hiệu lực bên dưới.
     */
    const maMoi = patch.code?.trim();
    if (maMoi !== undefined && maMoi === '') {
      throw new BadRequestException({
        code: 'CUSTOMER_CODE_REQUIRED',
        message: 'Mã khách hàng không được để trống.',
        field: 'customerCode',
      });
    }
    const doiMa = maMoi !== undefined && maMoi !== cur.code;
    if (doiMa) {
      /*
       * CHỈ KHÁCH CHƯA CÓ CSBH ĐANG HIỆU LỰC (`0226`, khách hàng bổ sung 28/09).
       *
       * CSBH đang hiệu lực là văn bản hai bên đã ký và ĐANG ÁP DỤNG — nó mang mã
       * cũ (ảnh chụp lúc gửi). Đổi mã lúc ấy là để khách hàng đang giao dịch
       * dưới một mã mà tờ giấy đang dùng không có. Hồ sơ đang duyệt thì KHÔNG
       * chặn: yêu cầu chỉ nói *"đang có hiệu lực"*.
       *
       * Hỏi `policy` (customer không đọc được `pol`), và FAIL CLOSED như
       * *Ngừng hợp tác*: không hỏi được thì không biết, và lượt ghi hỏng theo.
       */
      const hs = await this.policies.hoSoCua(id);
      if (hs.dangHieuLuc.length > 0) {
        throw new ConflictException({
          code: 'CUSTOMER_CODE_LOCKED',
          message: 'Khách hàng đang có CSBH hiệu lực, không sửa được mã khách hàng.',
          field: 'customerCode',
          policies: hs.dangHieuLuc.map((x) => x.code),
        });
      }
      // Hỏi trước để trả đúng câu; chỉ mục `uq_customer_code_norm` vẫn là chốt
      // thật (hai lượt song song), và lượt `UPDATE` dưới bắt nó theo TÊN.
      const trung = await this.db.one<{ id: string }>(
        `SELECT id FROM cus.customer WHERE upper(btrim(code)) = upper($1) AND id <> $2`,
        [maMoi, id],
      );
      if (trung) throw new ConflictException({ code: 'CUSTOMER_CODE_DUPLICATE' });
    }

    if (patch.tdvUserId !== undefined && !CAN_REASSIGN.includes(me.role)) {
      throw new ForbiddenException({
        code: 'REASSIGN_FORBIDDEN',
        message: 'Chỉ Quản trị hệ thống đổi được TDV phụ trách',
      });
    }

    /*
     * ĐỔI TAY KHÁCH HÀNG THÌ HỒ SƠ ĐI THEO (`0085`).
     *
     * Trước tệp này, đường này đổi đúng một cột `cus.customer.tdv_user_id` rồi
     * dừng — và đó là chỗ hỏng nặng nhất của cả luồng bàn giao. Đo trên chồng
     * demo: đổi TDV phụ trách KH-0006 xong, người nhận thấy đủ **7 hồ sơ** của
     * khách ấy trong danh sách (read-model tính phạm vi theo TDV của khách), và
     * cả 7 đều trả **403** khi bấm vào (policy tính phạm vi theo cột trên chính
     * hồ sơ). Trong đó có một bản *Đang có hiệu lực* và một bản *Sale Admin đang
     * xử lý* — hồ sơ sống, người phụ trách mới không mở nổi.
     *
     * GỌI TRƯỚC khi ghi, cùng lý do đã ghi ở `chuyen-tdv`: hai bên ở hai service
     * nên không transaction nào bọc được cả hai, và hỏng ở giữa theo thứ tự này
     * thì lượt bấm lại chữa được.
     */
    if (patch.tdvUserId !== undefined && patch.tdvUserId !== cur.tdv_user_id) {
      await this.policies.theoKhachHang([id], patch.tdvUserId, me.id);
    }

    return this.db.tx(async (c) => {
      // Không giữ `RETURNING *` vào biến nữa (`0154`): lượt ghi địa chỉ ngay
      // dưới làm trigger dựng lại hai cột gộp, nên bản chụp ở đây đã cũ.
      await c.query<Row>(
        `UPDATE cus.customer SET
            customer_type      = coalesce($9, customer_type),
            name               = coalesce($2, name),
            id_number          = coalesce($3, id_number),
            -- registered_address / delivery_address KHONG con o day (0154):
            -- chung la cot dan xuat, ghi qua ghiDiaChi roi trigger dung lai.
            --
            -- Da DANH SO LAI ca danh sach, khong bo trong $4/$5: Postgres dem
            -- theo tham so cao nhat duoc tham chieu, nen gui 13 gia tri cho mot
            -- cau chi dung 11 la loi bind — moi luot PATCH tra 500.
            --
            -- (Khong dau backtick trong khoi nay: ca cau SQL nam trong mot
            --  template literal, va mot backtick cat dut chuoi — bay da ghi o
            --  CLAUDE.md, va vua dinh lai o dung luot nay.)
            owner_name         = coalesce($4, owner_name),
            owner_title        = coalesce($5, owner_title),
            owner_id_number    = coalesce($6, owner_id_number),
            debt_term          = coalesce($7, debt_term),
            tdv_user_id        = coalesce($8, tdv_user_id),
            phone              = coalesce($10, phone),
            province           = coalesce($12, province),
            street_ward        = coalesce($13, street_ward),
            -- 0226: ma khach hang sua duoc (chi TDV phu trach, kiem o tren).
            code               = coalesce($14, code),
            -- debt_note KHONG dung coalesce (0138). Doi tu *Khac* sang phuong an
            -- 1 hay 2 thi phan go tay phai BIEN MAT; coalesce giu no lai, va no
            -- nam im trong CSDL cho toi ngay ai do doi nguoc ve *Khac* va thay
            -- noi dung cua lan truoc hien ra nhu the vua go.
            --   ''  = luot sua khong dung toi dieu khoan, giu nguyen
            --   '-' = xoa
            -- (Chu thich nay khong dung dau backtick: ca khoi SQL nam trong mot
            --  template literal cua TypeScript, va mot dau backtick o day cat
            --  dut chuoi — da dinh mot lan.)
            debt_note          = CASE WHEN $11 = '' THEN debt_note
                                      WHEN $11 = '-' THEN NULL
                                      ELSE $11 END,
            updated_at         = now()
          WHERE id = $1 RETURNING *`,
        [
          id,
          patch.name ?? null,
          patch.idNumber ?? null,
          patch.ownerName ?? null,
          patch.ownerTitle ?? null,
          patch.ownerIdNumber ?? null,
          patch.debtTerm ?? null,
          patch.tdvUserId ?? null,
          patch.customerType ?? null,
          patch.phone ?? null,
          // '' = không đụng tới · '-' = xoá · còn lại = nội dung mới.
          patch.debtTerm === undefined ? '' : (patch.debtNote ?? '-'),
          // Tên của BẢNG, không phải chuỗi gửi lên (`0205` — chuẩn hoá NFC).
          tinhThanh ?? null,
          patch.streetWard?.trim() ?? null,
          doiMa ? maMoi : null,
        ],
      ).catch((e: unknown) => {
        // Đối chiếu TÊN chỉ mục, không chỉ mã lỗi: dòng khách hàng còn chỉ mục
        // duy nhất thứ hai (`uq_customer_id_number`, `0175`).
        const loi = e as { code?: string; constraint?: string } | null;
        if (loi?.code === PG.uniqueViolation && loi.constraint === UQ_MA_KHACH) {
          throw new ConflictException({ code: 'CUSTOMER_CODE_DUPLICATE' });
        }
        throw e;
      });
      /*
       * Địa chỉ ghi RIÊNG, và chỉ khi lượt sửa có nói tới chúng (`0154`).
       *
       * `undefined` = không đụng tới, đúng quy ước của mọi trường khác trong
       * `PATCH` này. Mảng RỖNG thì khác hẳn: nó là *"xoá hết nơi nhận hàng"*, và
       * `ghiDiaChi` làm đúng thế. Gộp hai thứ ấy vào một nhánh là mất khả năng
       * xoá dòng cuối cùng — đúng lỗi mà `0138` đã phải chữa cho `debt_note`.
       */
      if (patch.deliveryAddresses !== undefined) {
        await this.ghiDiaChi(c, id, 'NHAN_HANG', patch.deliveryAddresses);
      }
      // Đọc lại: trigger vừa dựng lại hai cột gộp, nên `RETURNING *` ở trên đã cũ.
      const after = (await c.query<Row>(`SELECT * FROM cus.customer WHERE id = $1`, [id])).rows[0]!;
      // Nhật ký ghi giá trị trước và sau (CUST-15). Đi qua outbox vì role
      // csbh_cus không có quyền ghi vào schema aud.
      await c.query(`INSERT INTO cus.outbox (routing_key, payload) VALUES ($1,$2::jsonb)`, [
        'customer.changed',
        JSON.stringify(kemNguCanh({
          entity: 'customer',
          id,
          actorId: me.id,
          before: toDto(cur),
          after: toDto(after),
          at: new Date().toISOString(),
        })),
      ]);
      return toDto(after);
    });
  }

  /**
   * Xem trước: bấm *Ngừng hợp tác* bây giờ thì chuyện gì xảy ra (`0034`).
   *
   * Màn hình phải nói được ba con số TRƯỚC khi người dùng bấm, vì ba kết cục
   * khác hẳn nhau: chặn lại, xoá hẳn, hay giữ lại và cho hết hiệu lực.
   */
  async xemTruocNgung(id: string, me: AuthUser) {
    const cur = await this.db.one<Row>(`SELECT * FROM cus.customer WHERE id = $1`, [id]);
    if (!cur) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    this.assertChinhTdv(cur, me);
    const hs = await this.policies.hoSoCua(id);
    return {
      id,
      code: cur.code,
      name: cur.name,
      status: cur.status,
      dangCho: hs.dangCho,
      dangHieuLuc: hs.dangHieuLuc,
      // Chưa hồ sơ nào thì dòng bị XOÁ HẲN, không phải chuyển trạng thái. Người
      // dùng cần biết điều đó trước khi bấm — hai kết cục không lùi được như nhau.
      seXoaHan: hs.tong === 0,
    };
  }

  /**
   * Ngừng hợp tác với một khách hàng (`0034`).
   *
   * MỘT thao tác thay cho hai nút cũ (*Xoá* và một *Ngừng hợp tác* chưa bao giờ
   * tồn tại). Điều kiện cũng chỉ một: **không CSBH nào đang chờ**. Kết cục thì
   * hệ thống tự chọn theo việc khách ấy đã có lịch sử hay chưa — đó là chi tiết
   * của hệ thống, không phải quyết định của người dùng:
   *
   *   * **Chưa có hồ sơ nào** → xoá hẳn dòng. Đây là ca lập nhầm: gõ sai mã KH,
   *     tạo trùng, chọn nhầm loại khách. Một bản ghi như thế bị "ngừng hợp tác"
   *     sẽ nằm lại trong mọi danh sách và mọi ô chọn mãi mãi.
   *   * **Đã có hồ sơ** → `NGUNG_HOP_TAC`, và mọi CSBH đang hiệu lực chuyển
   *     `HET_HIEU_LUC`. KHÔNG xoá dòng: hồ sơ trỏ vào khách bằng khoá ngoại, xoá
   *     là mất tên khách trên mọi hồ sơ cũ.
   *
   * THỨ TỰ: cho hồ sơ hết hiệu lực TRƯỚC, đổi trạng thái khách SAU. Ngược lại
   * thì một lượt hỏng giữa chừng để lại khách đã ngừng mà CSBH vẫn đang hiệu
   * lực — tức một chính sách còn hiệu lực cho một khách không còn giao dịch, và
   * không màn hình nào cho thấy sự mâu thuẫn ấy.
   */
  async ngungHopTac(id: string, me: AuthUser) {
    const cur = await this.db.one<Row>(`SELECT * FROM cus.customer WHERE id = $1`, [id]);
    if (!cur) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    this.assertChinhTdv(cur, me);

    if (cur.status === 'NGUNG_HOP_TAC') {
      throw new ConflictException({
        code: 'CUSTOMER_ALREADY_RETIRED',
        message: 'Khách hàng này đã xoá rồi.',
      });
    }

    const kq = await this.policies.ngung(id, me.id, { code: cur.code, name: cur.name });
    if (kq.blocked) {
      throw new ConflictException({
        code: 'CUSTOMER_HAS_PENDING_POLICY',
        message:
          `Khách hàng còn ${kq.dangCho.length} hồ sơ CSBH chưa đi hết luồng duyệt. ` +
          'Xử lý xong hoặc xoá hồ sơ đó trước, rồi xoá khách hàng.',
        policies: kq.dangCho.map((x) => ({ code: x.code, status: x.status })),
      });
    }

    // Không hồ sơ nào — kể cả hồ sơ đã kết thúc — thì không có gì để giữ lại.
    const conVet = await this.policies.hoSoCua(id);
    if (conVet.tong === 0) {
      await this.db.tx(async (c) => {
        await c.query(`INSERT INTO cus.outbox (routing_key, payload) VALUES ($1,$2::jsonb)`, [
          'customer.deleted',
          JSON.stringify(kemNguCanh({
            entity: 'customer',
            id,
            actorId: me.id,
            before: toDto(cur),
            at: new Date().toISOString(),
          })),
        ]);
        // Khoá ngoại vẫn là chốt chặn cuối: một hồ sơ lập xen vào giữa hai câu
        // lệnh thì CSDL từ chối, và người dùng nhận đúng câu "khách đã có hồ sơ".
        await c
          .query(`DELETE FROM cus.customer WHERE id = $1`, [id])
          .catch((e: unknown) => {
            if (pgCode(e) === PG.foreignKeyViolation) {
              throw new ConflictException({
                code: 'CUSTOMER_HAS_POLICY',
                message: 'Khách hàng vừa có hồ sơ CSBH mới, không xoá được. Tải lại rồi thử lại.',
              });
            }
            throw e;
          });
      });
      return { ok: true, deleted: true, expired: kq.expired.length };
    }

    await this.db.tx(async (c) => {
      const r = await c.query<Row>(
        `UPDATE cus.customer
            SET status = 'NGUNG_HOP_TAC', retired_at = now(), updated_at = now()
          WHERE id = $1 RETURNING *`,
        [id],
      );
      await c.query(`INSERT INTO cus.outbox (routing_key, payload) VALUES ($1,$2::jsonb)`, [
        'customer.changed',
        JSON.stringify(kemNguCanh({
          entity: 'customer',
          id,
          actorId: me.id,
          action: 'RETIRED',
          before: toDto(cur),
          after: toDto(r.rows[0]!),
          at: new Date().toISOString(),
        })),
      ]);
    });
    return { ok: true, deleted: false, expired: kq.expired.length };
  }

  /**
   * CHỈ TDV phụ trách khách hàng này (`0034`).
   *
   * Chặt hơn `assertInScope`: một Trưởng bộ phận hay Kế toán được giao một CSBH
   * của khách này cũng ĐỌC được khách (`0031`) — nhưng ngừng hợp tác là quyết
   * định về quan hệ với khách hàng, không phải một bước xử lý hồ sơ. Người duy
   * nhất biết khách còn giao dịch hay không là người phụ trách họ.
   *
   * Quản trị hệ thống cũng KHÔNG, dù họ thấy mọi khách hàng: họ đổi được TDV
   * phụ trách, và đó là đúng vai trò hành chính của họ — còn quyết định nghiệp
   * vụ thì thuộc người làm nghiệp vụ.
   */
  private assertChinhTdv(cur: Row, me: AuthUser): void {
    if (cur.tdv_user_id !== me.id) {
      throw new ForbiddenException({
        code: 'NOT_OWNING_TDV',
        message: 'Chỉ Trình dược viên phụ trách khách hàng này mới làm được việc này.',
      });
    }
  }

  // --- Hồ sơ đính kèm -------------------------------------------------------

  async listDocuments(customerId: string, me: AuthUser) {
    await this.byId(customerId, me);
    return this.db.q(
      // `objectKey` đi kèm từ `0069`: giao diện cần nó để nối dòng này với file
      // thật bên `document` — dòng ở đây mang mã để GỠ, còn file bên kia mang mã
      // để XEM và TẢI. Thiếu nó thì màn hình phải chọn một trong hai việc.
      `SELECT id, kind, file_name AS "fileName", object_key AS "objectKey",
              size_bytes::text AS "sizeBytes", uploaded_at AS "uploadedAt"
         FROM cus.customer_document WHERE customer_id = $1 ORDER BY uploaded_at DESC`,
      [customerId],
    );
  }

  /**
   * Ghi con trỏ tới một hồ sơ pháp lý đã nằm trên kho lưu trữ.
   *
   * File thật do `document` giữ; ở đây chỉ lưu siêu dữ liệu. Hai bước chứ không
   * một: `customer` không đụng tới MinIO, và `document` không biết luật nghiệp
   * vụ nào về khách hàng. Không có giấy tờ nào là BẮT BUỘC và hệ thống không
   * cảnh báo hết hạn — việc đó nằm ngoài phần mềm (CUST-13).
   */
  async attachDocument(
    customerId: string,
    input: { kind: string; fileName: string; objectKey: string; sizeBytes: bigint },
    me: AuthUser,
  ) {
    /*
     * Lượt ghi bị TỪ CHỐI thì dọn lại tệp vừa tải lên (`0149`).
     *
     * Tải lên là hai lời gọi từ trình duyệt — `document` nhận file, rồi
     * `customer` ghi con trỏ — và không có phép bù trừ nào giữa chúng. Người
     * không phải TDV phụ trách bấm tải lên thì `assertTdvPhuTrach` ném 403, và
     * tệp đã nằm trên kho ở lời gọi trước đó.
     *
     * Cùng cách làm với `WorkflowService.attach` bên `policy`; xem chú thích ở
     * đó về việc vì sao bù trừ ở máy chủ chứ không ở giao diện.
     */
    try {
      await this.assertTdvPhuTrach(customerId, me);
    } catch (e) {
      await this.documents.goBoTep(input.objectKey, 'khách hàng từ chối đính kèm');
      throw e;
    }
    const r = await this.db.one<{ id: string }>(
      `INSERT INTO cus.customer_document (customer_id, kind, file_name, object_key, size_bytes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [customerId, input.kind, input.fileName, input.objectKey, input.sizeBytes.toString(), me.id],
    );
    return { id: r!.id, ...input, sizeBytes: input.sizeBytes.toString() };
  }

  /**
   * XOÁ một hồ sơ pháp lý (`0069`).
   *
   * Chưa từng có đường này: giấy tờ tải nhầm nằm lại vĩnh viễn, và cách duy nhất
   * để sửa là tải thêm bản đúng rồi để hai bản cạnh nhau — người đọc sau không
   * biết bản nào là bản dùng được.
   *
   * `0149` — XOÁ LUÔN FILE TRÊN KHO, không chỉ con trỏ.
   *
   * Bản trước dừng ở con trỏ, với lý do: *"file có vòng đời riêng do `document`
   * giữ, và `sys.run_retention()` dọn theo vòng đời chung"*. Vế sau **không
   * đúng**: đọc `0008_scale_retention.sql` thì hàm ấy chỉ đụng hai bảng token và
   * ba bảng `outbox` — nó chưa bao giờ biết tới `doc.stored_file` lẫn MinIO.
   *
   * Một câu nghe hợp lý mà chưa bao giờ đúng, và nó giữ cho chỗ hở này không bị
   * nghi ngờ. Hệ quả: giấy tờ pháp lý người dùng đã gỡ vẫn tải về được nguyên
   * vẹn qua `GET /files/:id/content` — với đúng những người có quyền xem khách
   * hàng ấy, nên không phải lỗ hổng phân quyền, nhưng "đã gỡ" mà vẫn đọc được
   * thì không phải điều người bấm nút mong đợi.
   */
  async removeDocument(customerId: string, documentId: string, me: AuthUser) {
    await this.assertTdvPhuTrach(customerId, me);
    const r = await this.db.q<{ id: string; object_key: string }>(
      `DELETE FROM cus.customer_document WHERE id = $1 AND customer_id = $2
       RETURNING id, object_key`,
      [documentId, customerId],
    );
    if (r.length === 0) throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND' });
    await this.documents.goBoTep(r[0]!.object_key, `gỡ khỏi hồ sơ pháp lý bởi ${me.role}`);
    return { ok: true };
  }

  /**
   * Chỉ TDV PHỤ TRÁCH khách hàng ấy mới thêm và gỡ hồ sơ pháp lý (`0069`).
   *
   * Tới `0068` mọi vai trò ghi đều tải lên được cho MỌI khách trong phạm vi của
   * mình — Trưởng bộ phận, Kế toán, Sale Admin. Giấy tờ pháp lý là thứ TDV xin
   * của khách và mang về; ba vai trò kia không cầm bản gốc bao giờ, và họ tải
   * lên được nghĩa là không ai biết bản trên hệ thống đến từ đâu.
   *
   * Dùng lại `assertChinhTdv` — phép kiểm đã có sẵn cho việc xoá khách hàng, và
   * nó trả về đúng mã lỗi `NOT_OWNING_TDV` mà giao diện đã biết đọc.
   */
  private async assertTdvPhuTrach(customerId: string, me: AuthUser): Promise<void> {
    const cur = await this.db.one<Row>(`SELECT * FROM cus.customer WHERE id = $1`, [customerId]);
    if (!cur) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    await this.assertInScope(cur.tdv_user_id, me, customerId);
    this.assertChinhTdv(cur, me);
  }

  // --- Trợ giúp -------------------------------------------------------------

  /**
   * Khách ĐANG hợp tác đang giữ mã số thuế này, trừ `tru` ra (`0175`).
   *
   * Khách đã ngừng hợp tác KHÔNG tính, cùng phạm vi với chỉ mục
   * `uq_customer_id_number`: hai chỗ trả lời khác nhau thì một trong hai luôn
   * sai, và cái sai sẽ là cái nói *"lập được"* rồi để CSDL trả `23505`.
   */
  private async findByIdNumber(idNumber: string | undefined, tru?: string) {
    if (!idNumber) return [];
    return this.db.q<{ id: string; code: string; name: string }>(
      `SELECT id, code, name FROM cus.customer
        WHERE id_number = $1 AND status <> 'NGUNG_HOP_TAC' AND ($2::uuid IS NULL OR id <> $2)`,
      [idNumber, tru ?? null],
    );
  }

  /**
   * Ô MÃ SỐ THUẾ hỏi NGAY LÚC GÕ (`0175`).
   *
   * Khách hàng: *"nếu trùng cảnh báo bên dưới ngay lúc nhập và không cho phép
   * tạo"*. Hai vế, hai chỗ: chỗ chặn là `assertMstChuaDung` ở lượt ghi, chỗ báo
   * là đây — và đường này KHÔNG ghi gì, nên nó gọi được ở mỗi lượt gõ.
   *
   * Trả về MÃ và TÊN của khách đang giữ, không phải một chữ *"đã tồn tại"* trần:
   * người vừa bị chặn cần biết hỏi ai. Đây cũng đúng những gì `create` vẫn trả
   * về ở `duplicateIdNumberWith` tới `0174`, nên không mở rộng thứ gì đang kín.
   */
  async kiemTraMst(mst: string, tru: string | undefined) {
    const trung = await this.findByIdNumber(mst, tru);
    return { trung: trung.length > 0, ...(trung[0] ? { khachHang: trung[0] } : {}) };
  }

  /**
   * Ai xem được một khách hàng (`0031`, CUST-14).
   *
   * HAI đường, và cả hai đều cần:
   *
   *   1. **TDV phụ trách** — `cus.customer.tdv_user_id`. Đúng cả với khách chưa
   *      có hồ sơ nào, tức đúng ngay từ giây người ta vừa lập xong khách hàng.
   *   2. **Đã xử lý một CSBH của khách này** — `cus.customer_access`, do
   *      `policy` bắn sự kiện sang. Đây là đường của TBP, Kế toán và Sale Admin.
   *
   * Quản trị hệ thống là ngoại lệ, và là ngoại lệ CÓ CHỦ Ý: phạm vi hồ sơ của
   * họ rỗng theo thiết kế, nhưng họ là người đổi TDV phụ trách khi một TDV nghỉ
   * việc — mà khách cần chuyển thường là khách chưa có hồ sơ nào, tức không
   * đường nào ở trên với tới. Không mở đường này thì chức năng ấy không dùng
   * được, và những khách hàng đó không còn ai nhìn thấy.
   */
  private async assertInScope(ownerUserId: string, me: AuthUser, customerId?: string): Promise<void> {
    if (me.role === 'QUAN_TRI') return;
    const ids = await this.scope.userIdsFor(me);
    if (ids.includes(ownerUserId)) return;
    if (customerId) {
      const r = await this.db.q(
        `SELECT 1 FROM cus.customer_access WHERE customer_id = $1 AND user_id = ANY($2::uuid[])`,
        [customerId, ids],
      );
      if (r.length > 0) return;
    }
    throw new ForbiddenException({ code: 'OUT_OF_SCOPE' });
  }
}

const toDto = (r: Row) => ({
  id: r.id,
  status: r.status,
  code: r.code,
  name: r.name,
  idNumber: r.id_number,
  customerType: r.customer_type,
  /*
   * HAI DẠNG của cùng một dữ liệu, và cả hai đều có người dùng thật (`0154`).
   *
   * `registeredAddress` / `deliveryAddress` — CHUỖI GỘP, nhiều dòng. Đây là thứ
   * `policy` đóng băng vào hồ sơ và `document` in ra giấy; `setParagraphText`
   * đổi `\n` thành `<w:br/>` nên chuỗi này lên giấy thành nhiều dòng mà không ai
   * phải sửa gì. Giữ nguyên tên cũ chính là điều khiến ba service sau không phải
   * đổi một dòng nào — cùng cách `0138` đã làm với `debt`.
   *
   * `registeredAddresses` / `deliveryAddresses` — MẢNG, cho màn hình sửa. Tách
   * tại chỗ từ chính cột gộp chứ không truy vấn thêm: ràng buộc
   * `dia_chi_mot_dong` cấm `\n` nằm trong một địa chỉ, nên phép tách trả về đúng
   * mảng gốc. Truy vấn thêm sẽ là một lượt gọi cho mỗi dòng ở màn hình danh
   * sách — N+1 ở đúng chỗ đông dòng nhất.
   */
  registeredAddress: r.registered_address,
  deliveryAddress: r.delivery_address,
  /*
   * HAI Ô của địa chỉ đăng ký (`0175`). `registeredAddress` ở trên là bản GỘP
   * mà chúng dựng ra — giữ lại vì `policy` và `document` đọc chính nó.
   *
   * `registeredAddresses` (số nhiều) vẫn còn, và giờ nó luôn có **một** phần
   * tử: màn hình danh sách đọc nó để hiện một dòng địa chỉ dưới tên khách.
   */
  province: r.province,
  streetWard: r.street_ward,
  registeredAddresses: tachDiaChi(r.registered_address),
  deliveryAddresses: tachDiaChi(r.delivery_address),
  ownerName: r.owner_name,
  ownerTitle: r.owner_title,
  ownerIdNumber: r.owner_id_number,
  phone: r.phone,
  debtTerm: r.debt_term,
  debtNote: r.debt_note,
  /*
   * `debt` là trường DẪN XUẤT, chỉ để đọc (`0138`).
   *
   * `policy` và `document` nhận đúng một chuỗi và không cần biết ba phương án
   * là gì — nhờ vậy lượt đổi này không phải sửa logic ở hai service ấy. Giữ tên
   * cũ `debt` cũng vì thế: nó là khoá mà `ho_so.cong_no` vẫn đang đọc.
   */
  debt: cauNo(r.debt_term, r.debt_note),
  tdvUserId: r.tdv_user_id,
});
