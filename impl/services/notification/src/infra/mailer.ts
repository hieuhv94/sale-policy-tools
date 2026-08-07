/**
 * Gửi thư: định tuyến an toàn theo môi trường, và header gộp luồng.
 *
 * Việc gộp thư của một khách hàng vào MỘT luồng (muc 9.1) không làm được bằng
 * cách đặt tiêu đề giống nhau — trình khách gộp theo `Message-ID` /
 * `In-Reply-To` / `References`. Ở đây mọi thư của cùng một khách hàng đều trỏ
 * `References` về một gốc chung sinh từ mã khách hàng, nên chúng nối thành chuỗi
 * dù được gửi cách nhau nhiều tuần và không có thư nào là trả lời thư nào (NTF-04).
 */
import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { loadMailConfig, type MailConfig } from './config.js';

export type OutgoingMail = {
  eventId: string;
  to: string[];
  subject: string;
  text: string;
  threadKey: string;
};

const DOMAIN = 'nutricare.test';

@Injectable()
export class Mailer {
  private readonly log = new Logger(Mailer.name);
  readonly cfg: MailConfig;
  private readonly tx: Transporter;

  constructor() {
    // Chốt an toàn chạy ở constructor: cấu hình nguy hiểm thì service KHÔNG
    // khởi động nổi, thay vì chạy êm rồi gửi thư nhầm chỗ (NTF-16).
    this.cfg = loadMailConfig();
    this.tx = createTransport({
      host: this.cfg.host,
      port: this.cfg.port,
      secure: false,
      ignoreTLS: true,
    });
  }

  /** Gốc luồng của một khách hàng. Không phải id thư thật, chỉ là mỏ neo cố định. */
  static threadRoot(threadKey: string): string {
    return `<csbh.thread.${threadKey}@${DOMAIN}>`;
  }

  /**
   * Ở production, thư ra ngoài tên miền công ty bị loại.
   *
   * Không phải chống rò rỉ — người dùng nội bộ đều có địa chỉ công ty. Đây là
   * chống một tài khoản bị nhập nhầm địa chỉ cá nhân rồi nhận toàn bộ thông báo
   * nghiệp vụ vào hộp thư ngoài mà không ai để ý.
   */
  allowed(to: string[]): string[] {
    if (this.cfg.allowlist.length === 0) return to;
    return to.filter((a) => this.cfg.allowlist.some((d) => a.toLowerCase().endsWith(d)));
  }

  async send(m: OutgoingMail): Promise<{ messageId: string; to: string[] }> {
    const messageId = `<csbh.${m.eventId}@${DOMAIN}>`;
    const root = Mailer.threadRoot(m.threadKey);
    const recipients = this.allowed(m.to);
    if (recipients.length === 0) {
      throw new Error('không còn người nhận nào sau khi lọc theo MAIL_ALLOWLIST');
    }

    // Staging: dồn hết về hộp thư QA, nhưng người nhận GỐC vẫn tra được ở header
    // — không có nó thì nghiệm thu không kiểm được "ai đáng lẽ nhận thư này" (NTF-19).
    const redirected = this.cfg.redirectAll !== undefined;
    const envelopeTo = redirected ? [this.cfg.redirectAll as string] : recipients;

    await this.tx.sendMail({
      from: this.cfg.from,
      to: envelopeTo,
      subject: m.subject,
      text: m.text,
      messageId,
      inReplyTo: root,
      references: root,
      headers: redirected ? { 'X-Original-To': recipients.join(', ') } : {},
    });

    this.log.log(`gửi "${m.subject}" tới ${envelopeTo.join(', ')}`);
    return { messageId, to: recipients };
  }
}
