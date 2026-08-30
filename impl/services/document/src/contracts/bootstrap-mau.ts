/**
 * BA VĂN BẢN MẪU MẶC ĐỊNH, nạp lúc `document` khởi động (`0165`).
 *
 * Khách hàng chốt 30/08: *"3 văn bản mẫu mặc định cho từng loại văn bản mẫu,
 * luôn luôn được deploy cùng hệ thống mà không cần phải make demo-mau hay make
 * nap-danh-muc"*.
 *
 * ---------------------------------------------------------------------------
 * ĐÂY LÀ ĐẢO NGƯỢC `0150`, VÀ CHỖ ĐẢO KHÔNG PHẢI CHỖ NGƯỜI TA TƯỞNG
 * ---------------------------------------------------------------------------
 *
 * `0150` bỏ hẳn `ensureDefault` với một lý lẽ đúng và vẫn đúng: *"vô hiệu hoá
 * mẫu cuối cùng của một khổ thì lần khởi động sau hệ thống dựng lại một bản
 * Quản trị không hề tạo, và nó nằm ngay trong ô chọn của mọi người"*. Cái hỏng
 * ở đó KHÔNG phải việc seed — nó là việc **seed lại**: bộ dựng cũ hỏi *"loại này
 * còn mẫu nào dùng được không"*, một câu hỏi mà câu trả lời đổi theo thao tác
 * của người dùng.
 *
 * Bản này hỏi một câu khác hẳn, và câu trả lời của nó KHÔNG BAO GIỜ quay lại:
 * *"đã từng nạp mẫu mặc định của loại này chưa"* — đo bằng sự tồn tại của một
 * dòng mang đúng `(kind, name)`, tính cả dòng đã vô hiệu hoá. Chỉ mục
 * `uq_template_ten` của `0108` là thứ làm cho câu ấy có nghĩa: hai mẫu không thể
 * trùng tên trong cùng một loại, nên cái tên là một khoá thật.
 *
 * Hệ quả: **Quản trị vô hiệu mẫu mặc định thì nó nằm im**. Lần khởi động sau
 * thấy dòng ấy vẫn còn và bỏ qua. Đó chính là lời hứa mà `0150` đòi, và nó giữ
 * được mà không phải bỏ việc seed.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO Ở TẦNG SERVICE, KHÔNG Ở MIGRATION
 * ---------------------------------------------------------------------------
 *
 * Một mẫu không chỉ là một dòng CSDL: nó là một file `.docx` nằm trên kho đối
 * tượng, một dòng `doc.file`, và một bảng ánh xạ ô trống → trường nguồn đọc ra
 * từ chính file ấy. Migration chạy bằng `psql`; nó không với tới MinIO, không
 * đọc được zip, và không biết `KNOWN_SOURCES`.
 *
 * Đi qua `TemplatesService.luu` chứ không tự viết `INSERT`: mọi phép kiểm của
 * `0067` — đủ ô trống đã ánh xạ, đủ mục bắt buộc của muc 11.1, có
 * `{{bang_san_pham}}` — chạy đúng như khi Quản trị tự tải file lên. Ba mẫu bàn
 * giao vì thế được KIỂM ở mỗi lượt khởi động, không phải chỉ ở bộ test.
 *
 * ---------------------------------------------------------------------------
 * NUỐT LỖI CÓ CHỦ Ý
 * ---------------------------------------------------------------------------
 *
 * Nạp hỏng thì GHI LOG rồi đi tiếp, không làm service chết. Một service tài liệu
 * không khởi động được là cả phần mềm dừng — kể cả những việc chẳng liên quan gì
 * tới văn bản mẫu. Đổi lấy: thiếu mẫu chỉ chặn đúng thao tác in của Sale Admin
 * ở B8 (`0163`), và màn hình ở đó nói rõ ai chữa được.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuthUser } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { TemplatesService, type Loai } from './templates.service.js';
import { SYSTEM_USER_ID } from './bootstrap.js';

/**
 * Thư mục chứa ba file bàn giao, ĐI CÙNG ẢNH.
 *
 * `docker/Dockerfile` dựng bằng `COPY . .` nên `impl/templates/` nằm sẵn trong
 * ảnh ở `/app/templates`. Không tải từ đâu về lúc chạy: một bản cài không có
 * Internet vẫn phải lên đủ ba mẫu.
 *
 * Cùng biến môi trường với `nap-danh-muc.ts` để hai chỗ không trỏ hai nơi.
 */
const THU_MUC = join(process.env.TEMPLATES_DIR ?? '/app/templates', 'default');

/**
 * BA MẪU, tên file CỐ ĐỊNH và tên mẫu CỐ ĐỊNH.
 *
 * Tên mẫu là KHOÁ IDEMPOTENT của lượt nạp, nên nó không được đổi: sửa một chữ ở
 * đây là lần khởi động sau nạp thêm một bản thứ hai bên cạnh bản cũ. Có ca kiểm
 * canh đúng chuyện ấy.
 *
 * Ba tên phải KHÁC NHAU dù `uq_template_ten` chỉ đòi duy nhất trong từng loại:
 * ô chọn của Sale Admin trộn chung hai loại hồ sơ (`0165`), nên hai dòng cùng
 * tên ở đó là hai dòng người chọn không phân biệt được — đúng cái `0150` sinh ra
 * luật cấm trùng tên để tránh.
 */
export const MAU_MAC_DINH: { tep: string; ten: string; kind: Loai }[] = [
  { tep: 'ho-so-day-du.docx', ten: 'Hồ sơ mẫu đầy đủ (bản mặc định)', kind: 'HO_SO' },
  { tep: 'ho-so-rut-gon.docx', ten: 'Hồ sơ mẫu rút gọn (bản mặc định)', kind: 'HO_SO_RUT_GON' },
  { tep: 'hop-dong.docx', ten: 'Hợp đồng (bản mặc định)', kind: 'HOP_DONG' },
];

/** Người tải lên của ba mẫu này — hệ thống, không phải một tài khoản thật. */
const HE_THONG: AuthUser = {
  id: SYSTEM_USER_ID,
  role: 'QUAN_TRI',
  mustChangePassword: false,
  name: 'Hệ thống',
};

@Injectable()
export class MauMacDinhBootstrap implements OnApplicationBootstrap {
  private readonly log = new Logger(MauMacDinhBootstrap.name);

  constructor(
    private readonly db: Db,
    private readonly templates: TemplatesService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const m of MAU_MAC_DINH) {
      try {
        await this.nap(m);
      } catch (e) {
        // Một mẫu hỏng không được kéo theo hai mẫu kia: ba file độc lập nhau, và
        // hai phần ba danh mục còn hơn không phần nào.
        this.log.error(`không nạp được mẫu mặc định "${m.ten}": ${(e as Error).message}`);
      }
    }
  }

  private async nap(m: (typeof MAU_MAC_DINH)[number]): Promise<void> {
    /*
     * Hỏi CSDL trước khi đọc file: lượt khởi động thứ hai trở đi không phải mở
     * zip, không phải gọi MinIO, không phải làm gì cả. Đây là đường nóng của mọi
     * lượt `docker compose up`.
     *
     * Đếm cả dòng ĐÃ VÔ HIỆU HOÁ (`vo_hieu_hoa_luc IS NOT NULL`) — đó là cả
     * điểm khác với `ensureDefault` của `0150`, xem docstring đầu tệp.
     */
    const co = await this.db.one<{ id: string }>(
      `SELECT id FROM doc.contract_template
        WHERE kind = $1::doc.template_kind AND name = $2`,
      [m.kind, m.ten],
    );
    if (co) return;

    const buffer = readFileSync(join(THU_MUC, m.tep));

    /*
     * Bảng ánh xạ dựng bằng chính bộ GỢI Ý mà màn hình thêm mẫu đang dùng.
     *
     * Không gõ tay một bảng ánh xạ ở đây, và không phải vì lười: một bảng gõ tay
     * là bản sao thứ hai của danh mục `SCALAR`, và nó sẽ trôi ở đúng lượt ai đó
     * thêm một trường nguồn mới. Bộ gợi ý khớp tên ô trống với tên trường
     * (`0051` viết khoá trộn bằng tiếng Việt chính vì thế), nên ba file bàn giao
     * ánh xạ xong mà không cần một dòng cấu hình nào.
     *
     * Ô nào không đoán được thì `source` rỗng, và `luu` sẽ từ chối với
     * `SOURCE_UNKNOWN` — tức là ba file này phải sạch, và lượt khởi động là chỗ
     * phát hiện ra nếu chúng không sạch.
     */
    const { goiY } = await this.templates.doOTrong(buffer);

    await this.templates.luu(
      { name: m.ten, buffer, kind: m.kind, mapping: goiY },
      HE_THONG,
    );
    this.log.log(`đã nạp mẫu mặc định: ${m.ten}`);
  }
}
