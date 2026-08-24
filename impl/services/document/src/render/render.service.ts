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
import { TemplatesService } from '../contracts/templates.service.js';
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
 * số mới. Đây đúng là cái bẫy đã cắn ở `0098` (xem `mauCua`, nhánh 1 phải đứng
 * trước), và lần này nó tự tránh: ảnh chụp có mặt thì nó là ảnh của lần gửi
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
     * Mẫu người gọi truyền kèm. Từ `0098` nó chỉ còn nghĩa với NGƯỜI LẬP đang
     * soạn hồ sơ của mình; mọi trường hợp khác đọc mẫu từ chính hồ sơ. Không còn
     * nhánh "bỏ trống thì lấy mẫu đầu danh sách" — xem `mauCua`.
     */
    mauId: string | undefined,
    me: AuthUser,
  ): Promise<{ body: Buffer; code: string }> {
    const { policy, customer, people } = await this.collect(policyId, me);
    const mau = await this.mauCua(policy, mauId, me);

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
    const body = await this.gotenberg.docxToPdf(docx, `CSBH-${policy.code}.docx`);

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
   * MẪU NÀO DỰNG BẢN MỀM NÀY — toàn bộ luật của `0098`, ở đúng một chỗ.
   *
   * Ba nhánh, và THỨ TỰ giữa chúng là cả nội dung của yêu cầu:
   *
   *   1. NGƯỜI LẬP, hồ sơ CÒN SỬA ĐƯỢC → mẫu họ chọn. Đây là quãng duy nhất còn
   *      chọn được, và nó khép lại đúng lúc bấm *Gửi duyệt*.
   *   2. Hồ sơ ĐÃ ĐÓNG BĂNG mẫu → dùng đúng mẫu ấy, kể cả khi nó đã bị vô hiệu
   *      hoá. Ai truyền `mauId` khác thì bị TỪ CHỐI, không bị bỏ qua im lặng —
   *      im lặng ở đây nghĩa là người gọi tin mình đang xem mẫu A trong khi
   *      nhận về mẫu B (`0089`).
   *   3. Còn lại → không dựng được, và có HAI lý do khác hẳn nhau. Xem `0100`
   *      ở khối ngay trên câu lệnh ném lỗi.
   *
   * NHÁNH 1 PHẢI ĐỨNG TRƯỚC, và tôi đã xếp ngược ở bản đầu. Hồ sơ *Yêu cầu
   * chỉnh sửa* VẪN mang mẫu của lần gửi trước, nên nhánh 2 đứng trước sẽ nuốt
   * nó: TDV mở hộp *Gửi lại duyệt*, chọn mẫu khác, bản xem trước ăn 409
   * `TEMPLATE_LOCKED` — và vì nút *Xác nhận* chờ bản xem trước tải xong, họ
   * không bao giờ gửi lại được bằng mẫu mới. Máy chủ vẫn nhận `mauHoSoId` mới ở
   * `RESUBMIT_AFTER_EDIT`, nên lỗi này chỉ đóng đúng đường giao diện đi.
   *
   * Đảo lại KHÔNG nới lỏng gì: điều kiện của nhánh 1 là "còn sửa được VÀ chính
   * người lập". Vai trò khác mở cùng hồ sơ ấy vẫn rơi xuống nhánh 2 và vẫn thấy
   * đúng mẫu đang gắn — hồ sơ sửa được không có nghĩa ai cũng đổi được bản
   * trình bày của nó.
   *
   * PHẢI Ở MÁY CHỦ, không phải ở chỗ giao diện ẩn ô chọn: Ban lãnh đạo mở được
   * hồ sơ *Nháp* của người khác (`assertPolicyInScope` cho qua vì TDV nằm trong
   * phạm vi họ), nên "web không bày ô chọn" không chặn được gì.
   */
  private async mauCua(
    policy: { id: string; status: string; mau_ho_so_id: string | null; tdv_user_id: string | null },
    mauId: string | undefined,
    me: AuthUser,
  ) {
    const dangSoan = SUA_DUOC.includes(policy.status as never) && policy.tdv_user_id === me.id;

    if (dangSoan && mauId) return this.templates.chon('HO_SO', mauId);

    if (policy.mau_ho_so_id) {
      if (mauId && mauId !== policy.mau_ho_so_id) {
        throw new ConflictException({
          code: 'TEMPLATE_LOCKED',
          message:
            'Hồ sơ này đã gắn văn bản mẫu từ lúc gửi duyệt, không đổi mẫu khi xem được.',
          templateId: policy.mau_ho_so_id,
        });
      }
      const mau = await this.templates.theoId(policy.mau_ho_so_id, 'HO_SO');
      if (!mau) {
        // Mẫu đã gắn mà không tra ra được: chỉ xảy ra khi có người xoá thẳng
        // dưới CSDL, vì `0098` đã gỡ hết đường xoá qua API.
        throw new ConflictException({
          code: 'POLICY_TEMPLATE_MISSING',
          message:
            'Văn bản mẫu đã gắn với hồ sơ này không còn trong hệ thống. ' +
            'Đề nghị Quản trị hệ thống kiểm tra lại danh sách văn bản mẫu.',
          templateId: policy.mau_ho_so_id,
        });
      }
      return mau;
    }

    if (dangSoan) {
      throw new ConflictException({
        code: 'TEMPLATE_REQUIRED',
        message: 'Chọn một văn bản mẫu để xem bản mềm.',
      });
    }

    /*
     * HAI LÝ DO, HAI CÂU (`0100`).
     *
     * `0098` gộp cả hai vào một câu — *"hồ sơ này lập trước khi phần mềm gắn
     * văn bản mẫu"* — vì lúc viết nhánh này tôi chỉ nghĩ tới dữ liệu cũ. Nhưng
     * hồ sơ NHÁP của người khác cũng rơi xuống đây, và với nó thì cả hai vế của
     * câu ấy đều sai: nó không lập trước `0098`, và lời khuyên *"lập một CSBH
     * mới"* đẩy người đọc đi làm một việc vô ích — hồ sơ ấy vẫn sống, TDV của
     * nó chỉ chưa gửi duyệt.
     *
     * Phân biệt được bằng chính TRẠNG THÁI, không cần thêm dữ liệu nào: còn sửa
     * được thì cột mẫu rỗng là chuyện BÌNH THƯỜNG của một hồ sơ chưa gửi; ngoài
     * `SUA_DUOC` mà vẫn rỗng thì mới là dữ liệu lập trước `0098` — vì từ `0098`
     * hai lối ra duy nhất của hai trạng thái ấy đều bắt buộc ghi cột.
     *
     * Ai đọc câu thứ nhất: trên thực tế chỉ Ban lãnh đạo. Bốn vai trò kia không
     * nằm trong phạm vi một hồ sơ Nháp của người khác (hồ sơ Nháp mới có mỗi
     * `tdv_user_id`), nên họ dừng ở 403 trước khi tới đây. Viết điều kiện theo
     * trạng thái chứ không theo vai trò: luật là về hồ sơ, không về người.
     */
    if (SUA_DUOC.includes(policy.status as never)) {
      throw new ConflictException({
        code: 'POLICY_TEMPLATE_PENDING',
        message:
          'Hồ sơ này chưa gửi duyệt nên chưa có bản mềm. ' +
          'Trình dược viên phụ trách sẽ chọn văn bản mẫu khi gửi duyệt.',
      });
    }

    throw new ConflictException({
      code: 'POLICY_TEMPLATE_NOT_SET',
      message:
        'Hồ sơ này lập trước khi phần mềm gắn văn bản mẫu vào hồ sơ, nên không có bản mềm. ' +
        'Lập một CSBH mới cho khách hàng này để có bản mềm.',
    });
  }
}
