/**
 * Gửi email qua SMTP. Ở dev và test đầu kia là Mailpit — không có thư nào ra
 * ngoài thật, và test đọc lại hộp thư qua HTTP API của Mailpit (ONB-04).
 */
import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { CONFIG } from './config.js';

@Injectable()
export class Mailer {
  private readonly log = new Logger(Mailer.name);
  private readonly tx: Transporter = createTransport({
    host: CONFIG.smtpHost,
    port: CONFIG.smtpPort,
    secure: false,
    ignoreTLS: true,
  });

  async sendInvite(to: string, fullName: string, activationUrl: string): Promise<void> {
    // KHÔNG đưa mật khẩu mặc định vào email. Quản trị bàn giao bằng kênh khác;
    // hộp thư bị lộ hay thư bị chuyển tiếp thì cũng không kèm theo mật khẩu (ONB-04).
    await this.tx.sendMail({
      from: CONFIG.mailFrom,
      to,
      subject: 'Kích hoạt tài khoản Chính sách bán hàng',
      text: [
        `Chào ${fullName},`,
        '',
        'Quản trị hệ thống đã tạo tài khoản Chính sách bán hàng cho bạn.',
        'Bấm liên kết dưới đây để xác nhận địa chỉ email và đặt mật khẩu của riêng bạn:',
        '',
        activationUrl,
        '',
        `Liên kết dùng được một lần và hết hạn sau ${CONFIG.activationTtlHours} giờ.`,
        'Nếu liên kết đã hết hạn, đề nghị Quản trị hệ thống gửi lại.',
      ].join('\n'),
    });
    this.log.log(`đã gửi thư mời tới ${to}`);
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
    await this.tx.sendMail({
      from: CONFIG.mailFrom,
      to,
      subject: 'Đặt lại mật khẩu Chính sách bán hàng',
      text: [
        `Chào ${fullName},`,
        '',
        'Có yêu cầu đặt lại mật khẩu cho tài khoản Chính sách bán hàng của bạn.',
        'Bấm liên kết dưới đây để đặt mật khẩu mới:',
        '',
        resetUrl,
        '',
        `Liên kết dùng được một lần và hết hạn sau ${CONFIG.resetTtlHours} giờ.`,
        'Nếu không phải bạn yêu cầu, bỏ qua thư này — mật khẩu hiện tại vẫn giữ nguyên.',
      ].join('\n'),
    });
    this.log.log(`đã gửi liên kết đặt lại mật khẩu tới ${to}`);
  }
}
