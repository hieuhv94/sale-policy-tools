/**
 * Gửi thư mời kích hoạt và liên kết đặt lại mật khẩu.
 *
 * Đây là đường gửi thư THỨ HAI của hệ thống, tách hẳn khỏi `notification`. Lý do
 * tách, và lý do KHÔNG gộp lại:
 *
 * `notification` đi qua RabbitMQ, có thử lại và có hàng thư hỏng — mà hàng thư
 * hỏng (`ntf.dead_letter.payload`) lưu NGUYÊN thân sự kiện, và người quản trị
 * đọc được nó ở màn hình *Hệ thống*. Đẩy thư mời qua đó là đưa token kích hoạt
 * thô vào một bảng có người đọc: ai mở được màn hình thư hỏng là chiếm được tài
 * khoản chưa kích hoạt. Hiện tại token thô CHỈ tồn tại trong bộ nhớ và trong
 * thân email; CSDL chỉ giữ bản băm (`ONB-15`).
 *
 * Đổi lại, đường này không có thử lại của hạ tầng, nên nó tự thử lại ở đây.
 *
 * Cấu hình và hai chốt an toàn dùng CHUNG với `notification` qua
 * `loadMailConfig` (`@csbh/http-kit`) — trước P14a hai bên đọc hai tên biến khác
 * nhau và identity bỏ qua cấu hình triển khai trong im lặng.
 */
import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { tuyChonSmtp } from '@csbh/http-kit';
import { CONFIG, MAIL } from './config.js';

/** Giãn cách giữa các lần thử lại, tính bằng mili-giây. */
const CHO_THU_LAI = [200, 1000, 3000];

@Injectable()
export class Mailer {
  private readonly log = new Logger(Mailer.name);
  private readonly tx: Transporter = createTransport(tuyChonSmtp(MAIL));

  async sendInvite(to: string, fullName: string, activationUrl: string): Promise<void> {
    // KHÔNG có mật khẩu nào trong thư — từ P13 hệ thống không sinh ra mật khẩu
    // mặc định nữa, nên cũng không còn gì để lỡ tay đưa vào đây (ONB-04).
    await this.gui(to, 'Kích hoạt tài khoản Chính sách bán hàng', [
      `Chào ${fullName},`,
      '',
      'Quản trị hệ thống đã tạo tài khoản Chính sách bán hàng cho bạn.',
      'Bấm liên kết dưới đây để xác nhận địa chỉ email và đặt mật khẩu của riêng bạn:',
      '',
      activationUrl,
      '',
      `Liên kết dùng được một lần và hết hạn sau ${CONFIG.activationTtlHours} giờ.`,
      'Nếu liên kết đã hết hạn, đề nghị Quản trị hệ thống gửi lại.',
    ]);
  }

  /**
   * Thư đặt lại mật khẩu.
   *
   * Nội dung nói rõ "nếu không phải bạn yêu cầu thì bỏ qua thư này": đường
   * `/auth/forgot-password` công khai và nhận tên tài khoản của bất kỳ ai, nên
   * một người dùng có thể nhận thư mà không hề bấm gì. Không nói ra thì thư
   * chính đáng của hệ thống lại giống hệt một cú lừa.
   */
  async sendPasswordReset(to: string, fullName: string, resetUrl: string): Promise<void> {
    await this.gui(to, 'Đặt lại mật khẩu Chính sách bán hàng', [
      `Chào ${fullName},`,
      '',
      'Có yêu cầu đặt lại mật khẩu cho tài khoản Chính sách bán hàng của bạn.',
      'Bấm liên kết dưới đây để đặt mật khẩu mới:',
      '',
      resetUrl,
      '',
      `Liên kết dùng được một lần và hết hạn sau ${CONFIG.resetTtlHours} giờ.`,
      'Nếu không phải bạn yêu cầu, bỏ qua thư này — mật khẩu hiện tại vẫn giữ nguyên.',
    ]);
  }

  /**
   * Định tuyến người nhận theo môi trường — ĐÚNG luật của `notification/mailer.ts`.
   *
   * Hai bên phải giống nhau, nếu không thì `MAIL_REDIRECT_ALL` dồn được thông
   * báo luồng duyệt về hộp thư QA mà thư mời vẫn bay thẳng tới người thật — đúng
   * thứ biến đó dựng ra để chặn.
   */
  private nguoiNhan(to: string): { den: string; goc?: string } {
    if (MAIL.allowlist.length > 0) {
      const hop = MAIL.allowlist.some((d) => to.toLowerCase().endsWith(d));
      if (!hop) throw new Error(`địa chỉ ${to} bị loại theo MAIL_ALLOWLIST`);
    }
    if (MAIL.redirectAll !== undefined) return { den: MAIL.redirectAll, goc: to };
    return { den: to };
  }

  /**
   * Gửi, thử lại tối đa ba lần.
   *
   * SMTP hỏng nhất thời — máy chủ thư khởi động lại, mạng chớp một nhịp — là
   * chuyện thường. Không thử lại thì một nhịp như vậy làm hỏng đúng cái thư mà
   * người dùng đang chờ để vào được hệ thống lần đầu.
   *
   * Hết ba lần thì NÉM. Người gọi quyết định phải làm gì: `users.service.create`
   * đã ghi tài khoản xong nên nó nuốt lỗi và báo lại là thư chưa gửi được, còn
   * `forgot-password` thì im lặng vì đường đó không được phép nói gì.
   */
  private async gui(to: string, tieuDe: string, dong: string[]): Promise<void> {
    const { den, goc } = this.nguoiNhan(to);
    let cuoi: unknown;

    for (let lan = 0; lan <= CHO_THU_LAI.length; lan++) {
      try {
        await this.tx.sendMail({
          from: MAIL.from,
          to: den,
          subject: tieuDe,
          text: dong.join('\n'),
          // Người nhận GỐC vẫn tra được khi đang dồn thư về hộp thư QA — không
          // có nó thì nghiệm thu không kiểm được "ai đáng lẽ nhận thư này" (NTF-19).
          headers: goc ? { 'X-Original-To': goc } : {},
        });
        this.log.log(`gửi "${tieuDe}" tới ${den}${lan > 0 ? ` (lần thử ${lan + 1})` : ''}`);
        return;
      } catch (e) {
        cuoi = e;
        const cho = CHO_THU_LAI[lan];
        if (cho === undefined) break;
        this.log.warn(`gửi "${tieuDe}" tới ${den} hỏng, thử lại sau ${cho}ms: ${String(e)}`);
        await new Promise((r) => setTimeout(r, cho));
      }
    }
    throw cuoi;
  }
}
