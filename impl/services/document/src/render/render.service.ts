/**
 * Sinh bản CSBH A4 và ký số nội bộ lên nó.
 *
 * "Ký" ở đây là **ký điện tử nội bộ** (muc 10): họ tên, vai trò, dấu thời gian
 * in vào chính văn bản, cộng SHA-256 của file lưu trong CSDL để phát hiện sửa
 * file. Không HSM, không CA, không chứng thư số — và đó là quyết định nghiệp vụ
 * đã chốt, không phải chỗ chưa làm xong (DOC-07).
 *
 * Ký KHÔNG ghi đè bản nháp: bản đã ký là một object MỚI trỏ ngược về bản nháp
 * qua `signed_from_id`. Ghi đè thì câu hỏi "văn bản đã đổi gì so với lúc chưa
 * ký" vĩnh viễn không trả lời được (DOC-05).
 */
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from '@csbh/http-kit';
import { SUA_DUOC } from '@csbh/domain-policy';
import { Clients } from '../infra/clients.js';
import { Gotenberg } from '../infra/gotenberg.js';
import { Storage } from '../infra/storage.js';
import { FilesService, type FileRow } from '../files/files.service.js';
import { TemplatesService } from '../contracts/templates.service.js';
import { bangSanPhamXml } from '../contracts/bang-san-pham.js';
import { mergeDocx } from '../contracts/docx.js';
import { tron } from '../contracts/tron.js';
import { sheetHtml, type Signature } from './sheet.js';

export type Size = 'a4p' | 'a4l';

@Injectable()
export class RenderService {
  constructor(
    private readonly clients: Clients,
    private readonly gotenberg: Gotenberg,
    private readonly files: FilesService,
    private readonly templates: TemplatesService,
    private readonly storage: Storage,
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
    return { policy, customer, people };
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
   *   3. Còn lại → không dựng được. Hồ sơ lập trước `0098` rơi vào đây.
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

    throw new ConflictException({
      code: 'POLICY_TEMPLATE_NOT_SET',
      message:
        'Hồ sơ này lập trước khi phần mềm gắn văn bản mẫu vào hồ sơ, nên không có bản mềm. ' +
        'Lập một CSBH mới cho khách hàng này để có bản mềm.',
    });
  }

  /**
   * Ký số: sinh bản CHƯA ký, lưu lại, rồi sinh bản CÓ ký và lưu thành object thứ
   * hai. Hai object cùng tồn tại là điều kiện để đối chiếu trước–sau (DOC-05).
   */
  async sign(policyId: string, me: AuthUser): Promise<{ draft: FileRow; signed: FileRow }> {
    if (me.role !== 'TBP') {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: 'Chỉ Trưởng bộ phận ký số bản CSBH',
      });
    }
    const { policy, customer, people } = await this.collect(policyId, me);
    if (!policy.tbp_signed_at) {
      throw new ConflictException({
        code: 'NOT_SIGNED_YET',
        message: 'Hồ sơ chưa qua bước ký số ở luồng duyệt',
        status: policy.status,
      });
    }

    const base = { policy, customer, people, size: 'a4p' as const };
    const draftPdf = await this.gotenberg.htmlToPdf(sheetHtml(base));
    const draft = await this.files.store({
      fileName: `CSBH-${policy.code}.pdf`,
      contentType: 'application/pdf',
      buffer: draftPdf,
      ownerKind: 'POLICY',
      ownerId: policyId,
      purpose: 'BAN_CSBH',
      uploadedBy: me.id,
    });

    const signature: Signature = {
      signerName: people['TBP'] ?? 'Trưởng bộ phận',
      signerRole: 'Trưởng bộ phận',
      signedAt: policy.tbp_signed_at,
    };
    const signedPdf = await this.gotenberg.htmlToPdf(sheetHtml({ ...base, signature }));
    const signed = await this.files.store({
      fileName: `CSBH-${policy.code}-da-ky.pdf`,
      contentType: 'application/pdf',
      buffer: signedPdf,
      ownerKind: 'POLICY',
      ownerId: policyId,
      purpose: 'BAN_DA_KY',
      uploadedBy: me.id,
      signedFromId: draft.id,
      signature,
    });
    return { draft, signed };
  }
}

