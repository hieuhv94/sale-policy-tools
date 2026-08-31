/**
 * Dựng bản mềm CSBH từ MẪU `.docx` của Quản trị.
 *
 * BẢN LƯU KÝ SỐ ĐÃ GỠ (`0103`). `POST /policies/:id/sign-file` sinh hai object
 * PDF — bản nháp và bản đã ký — nối nhau qua `signed_from_id`, có ca kiểm
 * DOC-04/DOC-05, và KHÔNG AI GỌI: không màn hình nào, không `policy`, không
 * consumer nào. Đo ở `0099`: 197 hồ sơ đã qua bước TBP ký, ba file `BAN_DA_KY`
 * trong kho, cả ba do bộ test sinh ra.
 *
 * Khách hàng chốt 24/08: **dữ liệu đóng băng là đủ**. Từ `0101` hồ sơ giữ ảnh
 * chụp khách hàng, người đề nghị và tên TBP đã ký, nên câu "văn bản lúc ký nói
 * gì" trả lời được bằng chính hồ sơ — không cần một object PDF thứ hai để đối
 * chiếu. Chữ ký vẫn hiện trên bản mềm qua `{{ho_so.chu_ky_so_TBP}}`, và
 * `tbp_signed_at` vẫn là mốc thật; chỉ có BẢN LƯU là không còn.
 *
 * Gỡ chứ không để lại: một cơ chế không ai dùng mà vẫn chạy là một cơ chế sẽ
 * hỏng lặng lẽ — đúng lý do `0067` đã dùng để gỡ nhóm khoá `san_pham.`.
 */
import { ConflictException, Injectable } from '@nestjs/common';
import type { AuthUser } from '@csbh/http-kit';
import { SUA_DUOC } from '@csbh/domain-policy';
import { Clients, type CustomerFull, type PolicyFull } from '../infra/clients.js';
import { Gotenberg } from '../infra/gotenberg.js';
import { FilesService } from '../files/files.service.js';
import { LOAI_HO_SO, TemplatesService } from '../contracts/templates.service.js';
import { bangSanPhamXml } from '../contracts/bang-san-pham.js';
import { mergeDocx } from '../contracts/docx.js';
import { tron } from '../contracts/tron.js';

export type Size = 'a4p' | 'a4l';

/**
 * KHÁCH HÀNG NÀO DỰNG VĂN BẢN NÀY — toàn bộ luật của `0101`, ở đúng một chỗ.
 *
 * Hai nhánh, và cái quyết định là ẢNH CHỤP CÓ MẶT HAY KHÔNG, không phải trạng
 * thái hồ sơ:
 *
 *   1. Có ảnh chụp → dùng nó. Hồ sơ đã gửi duyệt.
 *   2. Không có   → đọc sống. Hồ sơ còn *Nháp* (chưa ai chụp), hoặc lập trước
 *      `0101`. Hai chuyện khác nhau nhưng cùng một cách xử: bày ra dữ liệu
 *      đang có, vì không có gì khác để bày.
 *
 * Xét theo ẢNH CHỤP chứ không theo trạng thái vì một lý do rất cụ thể: hồ sơ
 * *Yêu cầu chỉnh sửa* thì đã gửi duyệt một lần rồi, nên xét trạng thái sẽ bắt
 * nó dùng ảnh chụp CŨ — trong khi TDV đang sửa chính thông tin ấy và cần thấy
 * số mới. Đây đúng là cái bẫy đã cắn ở `0098` (mẫu đóng băng, nhánh 1 phải đứng
 * trước — cả cơ chế ấy đã bỏ ở `0163`), và lần này nó tự tránh: ảnh chụp có mặt
 * thì nó là ảnh của lần gửi
 * gần nhất, còn lượt gửi lại ghi đè nó ngay trong câu lệnh đổi trạng thái.
 *
 * LẤY CẢ CỤM hoặc không lấy gì — không trộn từng trường. Một văn bản nửa số cũ
 * nửa số mới không mô tả bất kỳ thời điểm nào có thật.
 */
export const khachHangCua = (
  p: Pick<
    PolicyFull,
    | 'kh_ma_snap'
    | 'kh_ten_snap'
    | 'kh_ma_so_thue_snap'
    | 'kh_dia_chi_dang_ky_snap'
    | 'kh_noi_nhan_hang_snap'
    | 'kh_nguoi_dai_dien_snap'
    | 'kh_chuc_danh_dai_dien_snap'
    | 'kh_dien_thoai_snap'
    | 'kh_cong_no_snap'
  >,
  song: CustomerFull,
): CustomerFull =>
  p.kh_ten_snap === null
    ? song
    : {
        ...song,
        code: p.kh_ma_snap ?? song.code,
        name: p.kh_ten_snap,
        idNumber: p.kh_ma_so_thue_snap,
        registeredAddress: p.kh_dia_chi_dang_ky_snap ?? song.registeredAddress,
        deliveryAddress: p.kh_noi_nhan_hang_snap,
        ownerName: p.kh_nguoi_dai_dien_snap ?? song.ownerName,
        ownerTitle: p.kh_chuc_danh_dai_dien_snap,
        phone: p.kh_dien_thoai_snap,
        debt: p.kh_cong_no_snap ?? song.debt,
      };

/**
 * HAI cái tên đóng băng, hai cái đọc sống (`0101`).
 *
 * `TDV` là người ĐỀ NGHỊ — một việc đã xảy ra, nên bàn giao về sau không đổi nó.
 * `TBP` là người ĐÃ KÝ, và tên chụp lúc ký; hồ sơ bị trả về thì cột ấy bị xoá
 * cùng `tbp_signed_at`, nên ở đây nó tự quay lại đọc sống mà không cần điều
 * kiện riêng.
 *
 * `KE_TOAN` và `SALE_ADMIN` KHÔNG đóng băng, có chủ ý: câu chúng trả lời là "ai
 * đang giữ hồ sơ", và sau một lượt bàn giao thì câu trả lời đúng là người kế
 * nhiệm. Xem đầu tệp `0101_dong_bang_khach_hang_va_nguoi.sql`.
 */
export const nguoiCua = (
  p: Pick<PolicyFull, 'nguoi_de_nghi_snap' | 'tbp_ky_ten_snap'>,
  song: Record<string, string>,
): Record<string, string> => ({
  ...song,
  ...(p.nguoi_de_nghi_snap ? { TDV: p.nguoi_de_nghi_snap } : {}),
  ...(p.tbp_ky_ten_snap ? { TBP: p.tbp_ky_ten_snap } : {}),
});

@Injectable()
export class RenderService {
  constructor(
    private readonly clients: Clients,
    private readonly gotenberg: Gotenberg,
    private readonly files: FilesService,
    private readonly templates: TemplatesService,
  ) {}

  private async collect(policyId: string, me: AuthUser) {
    const policy = await this.clients.policy(policyId);
    await this.files.assertCanAccess('POLICY', policyId, me);
    const [customer, people] = await Promise.all([
      this.clients.customer(policy.customer_id),
      this.clients.peopleFor(policy.tdv_user_id ?? '', {
        tbp: policy.tbp_user_id,
        keToan: policy.ke_toan_user_id,
        saleAdmin: policy.sale_admin_user_id,
      }),
    ]);
    // Đổi chỗ NGAY Ở ĐÂY, không ở `sources.ts`: cả hai đường dựng văn bản
    // (`pdf` và `sign`) đi qua `collect`, nên đây là chỗ duy nhất phải đúng.
    return {
      policy,
      customer: khachHangCua(policy, customer),
      people: nguoiCua(policy, people),
    };
  }

  async pdf(
    policyId: string,
    /**
     * MẪU BẮT BUỘC (`0163`) — trước là tuỳ chọn, và bỏ trống nghĩa là *"đọc mẫu
     * đã gắn vào hồ sơ"*. Không còn mẫu nào gắn vào hồ sơ nữa, nên người gọi
     * luôn phải nói mình muốn in bằng mẫu nào.
     */
    mauId: string,
    me: AuthUser,
  ): Promise<{ body: Buffer; code: string }> {
    const { policy, customer, people } = await this.collect(policyId, me);
    const mau = await this.mauCua(mauId);

    /*
      KHÔNG còn phép kiểm "thiếu trường bắt buộc" ở đây (`0067`).

      Nó dựa trên cờ `required` mà người soạn đánh dấu cho từng ô trống — một cờ
      chỉ đổi thời điểm báo lỗi, và báo cho người KHÔNG sửa được. Mục bắt buộc
      của muc 11.1 giờ kiểm lúc LƯU MẪU, ở màn hình người sửa được đang đứng.

      Trường rỗng thì ô trống ra rỗng, đúng như dữ liệu đang có.
    */
    const { values } = tron(mau.fields, { policy, customer, people });

    // `docxCua` chứ không đọc thẳng kho: object mất thì nó ném một lỗi CÓ TÊN
    // thay vì để `S3Error` chui ra thành 500 (`0059`).
    const docx = mergeDocx(await this.templates.docxCua(mau.template), {
      values,
      // Bảng sản phẩm do HỆ THỐNG dựng, đúng số cột CPBH của chính hồ sơ này
      // (muc 7.1), và đúng tập cột của CHÍNH MẪU NÀY (`0067`).
      banSanPham: bangSanPhamXml(policy, mau.template.cot_bang),
    });
    const body = await this.gotenberg.docxToPdf(docx, `${policy.code}.docx`);

    /*
     * KHÔNG ghi dòng *Lịch sử* nào cho bản mềm (`0059`).
     *
     * `0052` ghi mỗi lượt tải một dòng, theo N-01. Khách hàng bỏ yêu cầu ấy
     * ngày 20/08 — và bỏ có lý: bản mềm là thứ người ta mở ra ĐỌC. Kế toán xem
     * lại hồ sơ ba lần trong một buổi là chuyện thường, nên những dòng ấy chỉ
     * làm dày lịch sử và dìm mất thứ lịch sử sinh ra để kể — ai duyệt, ai trả
     * về, vì sao.
     *
     * Bản SCAN thì vẫn ghi: nó là bản cứng có chữ ký, và "ai đã lấy nó ra khỏi
     * hệ thống" là một câu hỏi khác hẳn.
     *
     * Kéo theo: `pdf()` không còn gọi sang `policy` ở đường này nữa. Cờ `xem=1`
     * cũng mất nghĩa và đã gỡ khỏi controller.
     */
    return { body, code: policy.code };
  }

  /**
   * DỰNG BẢN MỀM RỒI LƯU LẠI thành một tệp của hồ sơ (`0167`).
   *
   * Khác `pdf()` ở hai chỗ, và cả hai đều là ràng buộc nghiệp vụ chứ không phải
   * chi tiết kỹ thuật:
   *
   *   1. **CHỈ mẫu hồ sơ ĐẦY ĐỦ.** Khách hàng chốt 31/08: *"SA sẽ chọn loại văn
   *      bản mẫu chỉ được lấy từ mẫu hồ sơ đầy đủ"*. Bản lưu là bản đem đi trình
   *      ký và bàn giao cho Kế toán, nên nó phải mang đủ cột — kể cả giá thu về
   *      và tỷ lệ chiết khấu, thứ mẫu rút gọn cố ý cắt đi cho khách hàng xem.
   *      `chon('HO_SO', …)` chứ không `LOAI_HO_SO`: mẫu rút gọn không tra ra ở
   *      đây, nên nó trả `404 TEMPLATE_NOT_USABLE` — cùng câu lỗi với một mẫu đã
   *      vô hiệu, và đúng nghĩa: mẫu ấy không dùng được **cho việc này**.
   *   2. **Ghi tệp vào kho** với `purpose: 'BAN_CSBH'` — giá trị có từ `0011` và
   *      chưa từng có ai dùng; đây đúng là chỗ nó được nghĩ ra để phục vụ.
   *
   * KHÔNG tự gắn tệp vào hồ sơ ở đây. `pol.policy_attachment` là bảng của
   * `policy`, và người gọi đi tiếp một bước `POST /policies/:id/attachments` —
   * đúng hai bước mà lượt tải bản scan đang đi. Giữ nguyên hình dạng ấy để
   * `attach` vẫn là chỗ DUY NHẤT quyết định một tệp có được vào hồ sơ hay không,
   * và để phép dọn `goBoTep` khi hồ sơ từ chối vẫn chạy nguyên vẹn.
   */
  async luuBanMem(
    policyId: string,
    mauId: string,
    me: AuthUser,
  ): Promise<{ objectKey: string; fileName: string; sizeBytes: string; fileId: string }> {
    const { policy, customer, people } = await this.collect(policyId, me);
    const mau = await this.templates.chon('HO_SO', mauId);
    const { values } = tron(mau.fields, { policy, customer, people });
    const docx = mergeDocx(await this.templates.docxCua(mau.template), {
      values,
      banSanPham: bangSanPhamXml(policy, mau.template.cot_bang),
    });
    const body = await this.gotenberg.docxToPdf(docx, `${policy.code}.docx`);

    /*
     * TÊN TỆP mang mã hồ sơ và MỐC THỜI GIAN.
     *
     * Sale Admin lưu được nhiều bản mềm — hồ sơ bị Kế toán yêu cầu in lại thì họ
     * dựng bản mới, và bản cũ ở lại làm vết. Ba tệp cùng tên `CSBH-xxx.pdf` nằm
     * cạnh nhau trong một khối thì không ai biết cái nào mới; mốc thời gian trong
     * chính cái tên trả lời câu ấy ngay trên thẻ tệp.
     */
    const luc = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', 'h');
    const file = await this.files.upload(
      {
        ownerKind: 'POLICY',
        ownerId: policyId,
        purpose: 'BAN_CSBH',
        /*
         * `policy.code` ĐÃ mang tiền tố `CSBH-` (`pol.next_policy_code()`).
         *
         * Ghép thêm một lần nữa cho ra `CSBH-CSBH-2026-000020` — đo được trên
         * chồng demo, không phải suy đoán. Lỗi này CÓ SẴN ở ba chỗ khác trong
         * chính tệp và controller này, và chưa ai thấy vì hai chỗ kia chỉ đặt
         * tên tạm cho Gotenberg, còn chỗ thứ ba là `Content-Disposition` của
         * một lượt tải mà người dùng hiếm khi đọc kỹ tên. `0167` là lượt đầu
         * tiên cái tên ấy được LƯU LẠI và bày lên màn hình.
         */
        fileName: `${policy.code} (${luc}).pdf`,
        buffer: body,
      },
      me,
    );
    return {
      objectKey: file.object_key,
      fileName: file.file_name,
      // `bigint` không đi qua JSON được — cùng cách `files.controller` đang trả.
      sizeBytes: String(file.size_bytes),
      fileId: file.id,
    };
  }

  /**
   * MẪU để dựng bản mềm — người gọi CHỌN, hồ sơ không giữ (`0163`).
   *
   * Cả một trăm dòng luật cũ ở đây đã đi cùng khái niệm *mẫu đóng băng*: nhánh
   * "người lập đang soạn thì cho chọn", nhánh "hồ sơ đã gắn mẫu thì khoá"
   * (`TEMPLATE_LOCKED`), và hai câu lỗi phân biệt *chưa gửi duyệt* với *dữ liệu
   * lập trước `0098`* (`0100`). Không nhánh nào còn nghĩa: bản mềm giờ là thao
   * tác IN của Sale Admin, và họ chọn mẫu ở đúng lúc in.
   *
   * `chon` chứ không `theoId`: chỉ mẫu CÒN HIỆU LỰC mới in được. Mẫu đã vô hiệu
   * hoá vẫn xem lại được ở màn hình quản trị (`0150`), nhưng nó không phải thứ
   * để dựng một tờ giấy mới.
   */
  private mauCua(mauId: string) {
    // CẢ HAI loại mẫu hồ sơ (`0165`) — Sale Admin chọn đầy đủ hay rút gọn ở lúc
    // in, và ô chọn của họ trộn chung hai danh sách.
    return this.templates.chon(LOAI_HO_SO, mauId);
  }
}
