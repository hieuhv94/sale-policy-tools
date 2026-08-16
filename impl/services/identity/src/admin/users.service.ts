/**
 * Tạo và quản lý tài khoản — YCNV muc 2.8. Chỉ vai trò QUAN_TRI gọi được;
 * hệ thống KHÔNG có màn hình đăng ký công khai.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hashPassword, newSecretToken } from '@csbh/identity-core';
import { paged, type Page } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { CONFIG } from '../infra/config.js';
import { Mailer } from '../infra/mailer.js';
import { AccountCache } from '../infra/account-cache.js';
import { PolicyClient } from '../infra/policy.client.js';

export const ROLE_VALUES = [
  'TDV',
  'TBP',
  'KE_TOAN',
  'SALE_ADMIN',
  'BAN_LANH_DAO',
  'QUAN_TRI',
] as const;
export type RoleValue = (typeof ROLE_VALUES)[number];

/*
 * KHÔNG CÒN `VAI_TRO_CAP_TREN`, và không còn cấp trên nào cả (`0031`).
 *
 * Người dùng không quản lý lẫn nhau nữa: một tài khoản chỉ có tên, email và vai
 * trò. Việc "ai xử lý hồ sơ của ai" chuyển sang từng hồ sơ — TDV chọn Trưởng bộ
 * phận và Kế toán lúc gửi duyệt, Kế toán chọn Sale Admin lúc tiếp nhận L1.
 *
 * Hệ quả đáng nhớ nhất: **tạo tài khoản không còn bước nào có thể gán sai**.
 * Trước đây gán nhầm một kế toán vào ô người duyệt là hồ sơ đi vào ngõ cụt và
 * đứng im tới lúc quá hạn; giờ ô ấy không tồn tại, và việc chọn diễn ra ở chỗ
 * người chọn nhìn thấy ngay hồ sơ mình đang gửi.
 */

/**
 * KHÔNG có `role` (`0032`). Vai trò cố định từ lúc tạo tài khoản.
 *
 * Đổi vai trò từng bị cấm hoàn toàn, rồi mở ra kèm chốt chặn "còn hồ sơ dở dang
 * thì không đổi được", và giờ đóng lại hẳn theo yêu cầu nghiệp vụ.
 *
 * Lý do đóng vẫn là lý do cũ, và từ `0031` nó mạnh hơn: hồ sơ ghi thẳng id người
 * xử lý lên chính nó. Một Trưởng bộ phận đang có hồ sơ chờ ký mà thành Kế toán
 * thì hồ sơ ấy trỏ tới người không còn hành động `TBP_SIGN` nào, và **không ai
 * khác cầm được** vì hồ sơ chỉ nằm trong hộp việc của đúng người được chọn.
 * Chốt chặn có điều kiện chỉ dời vấn đề: nó bắt người quản trị đi xử lý hết hồ
 * sơ trước, mà "xử lý hết" không phải việc của người quản trị.
 *
 * Cần đổi vai trò thì **vô hiệu hoá tài khoản cũ** (kèm chuyển giao hồ sơ, xem
 * `setActive`) và tạo tài khoản mới.
 */
export type UpdateUserInput = {
  fullName?: string | undefined;
};

export type CreateUserInput = {
  email: string;
  username: string;
  fullName: string;
  role: RoleValue;
};

@Injectable()
export class UsersService {
  private readonly log = new Logger(UsersService.name);

  constructor(
    private readonly db: Db,
    private readonly mailer: Mailer,
    private readonly accounts: AccountCache,
    private readonly policies: PolicyClient,
  ) {}

  async create(input: CreateUserInput, createdBy: string) {
    const trung = await this.db.q<{ email: string; username: string }>(
      `SELECT email, username FROM idn.app_user
        WHERE lower(email) = lower($1) OR lower(username) = lower($2)`,
      [input.email, input.username],
    );
    // Chặn TRƯỚC khi gửi thư: tạo hỏng mà thư đã bay đi thì người nhận có một
    // liên kết không kích hoạt được cái gì (ONB-03).
    //
    // Nói RÕ trùng cái nào, và kèm `message`. Không kèm thì giao diện rơi xuống
    // câu mặc định cho 409 — "Dữ liệu vừa được người khác thay đổi, hãy tải lại"
    // — vốn đúng cho tranh chấp ghi đồng thời và hoàn toàn sai ở đây: người
    // quản trị tải lại bao nhiêu lần thì tên tài khoản đó vẫn đang có người
    // dùng. Họ phải ĐỔI, mà câu kia không hề nói điều đó.
    if (trung.length > 0) {
      const trungEmail = trung.some((r) => r.email.toLowerCase() === input.email.toLowerCase());
      const trungTen = trung.some(
        (r) => r.username.toLowerCase() === input.username.toLowerCase(),
      );
      throw new ConflictException({
        // Giữ `EMAIL_DUPLICATE` cho trường hợp trùng email (ONB-03 tra mã này).
        code: trungEmail ? 'EMAIL_DUPLICATE' : 'USERNAME_DUPLICATE',
        field: trungEmail && !trungTen ? 'email' : 'username',
        message: trungEmail
          ? trungTen
            ? `Đã có tài khoản dùng tên "${input.username}", và cũng đã có tài khoản dùng email ${input.email}. Đổi cả hai rồi thử lại.`
            : `Email ${input.email} đã dùng cho một tài khoản khác. Mỗi tài khoản một địa chỉ riêng vì thư kích hoạt gửi tới đó.`
          : `Tên tài khoản "${input.username}" đã có người dùng. Chọn tên khác.`,
      });
    }

    const hash = await this.matKhauKhoa();
    const token = newSecretToken();

    const created = await this.db.tx(async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO idn.app_user
           (username, email, full_name, role, password_hash,
            must_change_password, created_by)
         VALUES ($1,$2,$3,$4::idn.user_role,$5,true,$6)
         RETURNING id`,
        [input.username, input.email, input.fullName, input.role, hash, createdBy],
      );
      const id = r.rows[0]!.id;
      await c.query(
        `INSERT INTO idn.activation_token (user_id, token_hash, expires_at, created_by, purpose)
         VALUES ($1,$2, now() + ($3 || ' hours')::interval, $4, 'ACTIVATE')`,
        [id, token.hash, String(CONFIG.activationTtlHours), createdBy],
      );
      return id;
    });

    // Gửi thư SAU khi đã ghi tài khoản, nên hỏng ở đây KHÔNG được làm hỏng cả
    // lời gọi: tài khoản đã tồn tại thật rồi. Ném ra thì quản trị nhận 500 và
    // không biết là mình vừa tạo xong hay chưa — rồi thử tạo lại và nhận 409.
    //
    // Trả về `inviteMailSent: false` để màn hình nói đúng một câu có ích: tài
    // khoản đã tạo, thư chưa đi, bấm "Gửi lại thư mời".
    const inviteMailSent = await this.guiThuMoi(
      input.email,
      input.fullName,
      token.raw,
      created,
    );

    return {
      id: created,
      username: input.username,
      email: input.email,
      role: input.role,
      status: 'CHO_KICH_HOAT',
      inviteMailSent,
    };
  }

  /** Gửi lại lời mời. Liên kết cũ chết ngay — chỉ liên kết mới nhất dùng được (ONB-10). */
  async resendInvite(userId: string, createdBy: string) {
    const u = await this.db.one<{ email: string; full_name: string; activated_at: Date | null }>(
      `SELECT email, full_name, activated_at FROM idn.app_user WHERE id = $1`,
      [userId],
    );
    if (!u) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    if (u.activated_at) throw new ConflictException({ code: 'ALREADY_ACTIVATED' });

    const token = newSecretToken();
    await this.db.tx(async (c) => {
      await c.query(
        `UPDATE idn.activation_token SET revoked_at = now()
          WHERE user_id = $1 AND purpose = 'ACTIVATE'
            AND used_at IS NULL AND revoked_at IS NULL`,
        [userId],
      );
      await c.query(
        `INSERT INTO idn.activation_token (user_id, token_hash, expires_at, created_by, purpose)
         VALUES ($1,$2, now() + ($3 || ' hours')::interval, $4, 'ACTIVATE')`,
        [userId, token.hash, String(CONFIG.activationTtlHours), createdBy],
      );
    });
    const inviteMailSent = await this.guiThuMoi(u.email, u.full_name, token.raw, userId);
    return { ok: true, inviteMailSent };
  }

  /**
   * Gửi thư mời, nuốt lỗi và trả về gửi được hay không.
   *
   * `Mailer` đã tự thử lại ba lần; tới đây là SMTP hỏng thật. Ghi log ở mức
   * `error` để còn dò được trong log vận hành — đường này không có hàng thư
   * hỏng, và cố ý không có: xem chú thích đầu `mailer.ts`.
   */
  private async guiThuMoi(
    email: string,
    fullName: string,
    rawToken: string,
    userId: string,
  ): Promise<boolean> {
    try {
      await this.mailer.sendInvite(email, fullName, this.activationUrl(rawToken));
      return true;
    } catch (e) {
      this.log.error(`không gửi được thư mời cho ${userId} (${email}): ${String(e)}`);
      return false;
    }
  }

  /**
   * Người này đang giữ hồ sơ nào — màn hình hỏi TRƯỚC khi mở hộp thoại vô hiệu hoá.
   *
   * "Vô hiệu hoá tài khoản này sẽ chuyển 14 hồ sơ sang người khác" là một câu
   * khác hẳn "vô hiệu hoá tài khoản này", và người quản trị phải đọc được câu
   * thứ nhất trước khi quyết định.
   */
  async xemTruocBanGiao(userId: string) {
    const u = await this.db.one<{ role: RoleValue; full_name: string }>(
      `SELECT role::text AS role, full_name FROM idn.app_user WHERE id = $1`,
      [userId],
    );
    if (!u) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    const hs = await this.policies.xemTruoc(userId, u.role);
    return { userId, role: u.role, fullName: u.full_name, ...hs };
  }

  /**
   * Vô hiệu hoá hoặc bật lại một tài khoản (`0032`).
   *
   * Vô hiệu hoá đi qua BA chốt chặn, và mỗi chốt chặn một kiểu hỏng khác nhau:
   *
   *   1. **Gõ lại họ tên** — chặn bấm nhầm dòng. Danh sách người dùng có 26
   *      dòng và các nút nằm sát nhau; một cú bấm lệch một dòng là khoá nhầm
   *      người, và người bị khoá chỉ biết vào sáng hôm sau.
   *   2. **Phải chọn người nhận bàn giao** cùng vai trò, đang hoạt động. Không
   *      chọn thì KHÔNG vô hiệu hoá được — đây là chốt chặn quan trọng nhất, xem
   *      dưới.
   *   3. **Chuyển giao chạy TRƯỚC**, và hỏng thì cả thao tác hỏng.
   *
   * Vì sao chốt thứ hai không thể bỏ qua: từ `0031` id người xử lý nằm cứng trên
   * từng hồ sơ. Vô hiệu hoá mà không chuyển giao là để lại những hồ sơ **không
   * ai nhìn thấy và không ai thao tác được** — chúng không nằm trong hộp việc
   * của ai, không lọt vào phạm vi của ai, và chỉ lộ ra khi có người đi tìm một
   * hồ sơ cụ thể rồi không thấy đâu.
   *
   * Bật lại thì KHÔNG cần gì: nó không làm hồ sơ nào kẹt.
   */
  async setActive(
    userId: string,
    isActive: boolean,
    opts: { confirmName?: string | undefined; successorId?: string | undefined; actorId: string } = {
      actorId: '',
    },
  ) {
    const u = await this.db.one<{ role: RoleValue; full_name: string; is_active: boolean }>(
      `SELECT role::text AS role, full_name, is_active FROM idn.app_user WHERE id = $1`,
      [userId],
    );
    if (!u) throw new NotFoundException({ code: 'USER_NOT_FOUND' });

    let banGiao: { count: number; policies: { code: string; status: string }[] } = {
      count: 0,
      policies: [],
    };

    if (!isActive) {
      // So sau khi chuẩn hoá khoảng trắng và chữ hoa: người quản trị chép tên từ
      // màn hình sang, và một dấu cách thừa không phải là bấm nhầm.
      const chuan = (x: string) => x.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
      if (chuan(opts.confirmName ?? '') !== chuan(u.full_name)) {
        throw new BadRequestException({
          code: 'CONFIRM_NAME_MISMATCH',
          field: 'confirmName',
          message: `Gõ đúng họ tên "${u.full_name}" để xác nhận vô hiệu hoá tài khoản này.`,
        });
      }

      const dangGiu = await this.policies.xemTruoc(userId, u.role);
      if (dangGiu.count > 0) {
        const nguoiNhan = await this.kiemNguoiNhan(userId, u.role, opts.successorId);
        banGiao = await this.policies.chuyen({
          fromUserId: userId,
          toUserId: nguoiNhan,
          role: u.role,
          actorId: opts.actorId,
        });
      }
    }

    const r = await this.db.q(
      `UPDATE idn.app_user SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING id`,
      [userId, isActive],
    );
    if (r.length === 0) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    // Xoá cache ngay để không phải chờ hết TTL — 60 giây chỉ là trần cho thay
    // đổi đi vòng ngoài API (AUTH-07).
    await this.accounts.invalidate(userId);
    return { ok: true, isActive, handedOver: banGiao.count, policies: banGiao.policies };
  }

  /**
   * Người nhận bàn giao phải: có thật · CÙNG VAI TRÒ · đang hoạt động · không
   * phải chính người đang bị vô hiệu hoá.
   *
   * Cùng vai trò là điều kiện cứng, không phải tiện ích: hồ sơ đang chờ ở bước
   * của vai trò ấy: giao cho một vai trò khác là chuyển hồ sơ tới người không có
   * hành động nào để làm — đúng cái ngõ cụt việc này sinh ra để chữa.
   */
  private async kiemNguoiNhan(
    userId: string,
    role: RoleValue,
    successorId: string | undefined,
  ): Promise<string> {
    if (!successorId) {
      throw new UnprocessableEntityException({
        code: 'SUCCESSOR_REQUIRED',
        field: 'successorId',
        message:
          'Tài khoản này đang giữ hồ sơ chưa xử lý xong. Chọn người nhận bàn giao ' +
          `cùng vai trò ${role} trước khi vô hiệu hoá.`,
      });
    }
    if (successorId === userId) {
      throw new UnprocessableEntityException({
        code: 'SUCCESSOR_INVALID',
        field: 'successorId',
        message: 'Không bàn giao cho chính tài khoản đang bị vô hiệu hoá.',
      });
    }
    const n = await this.db.one<{ role: string; is_active: boolean; activated_at: Date | null }>(
      `SELECT role::text AS role, is_active, activated_at FROM idn.app_user WHERE id = $1`,
      [successorId],
    );
    if (!n) throw new NotFoundException({ code: 'SUCCESSOR_NOT_FOUND' });
    if (n.role !== role) {
      throw new UnprocessableEntityException({
        code: 'SUCCESSOR_WRONG_ROLE',
        field: 'successorId',
        message: `Người nhận bàn giao phải cùng vai trò ${role}, tài khoản vừa chọn là ${n.role}.`,
      });
    }
    if (!n.is_active || n.activated_at === null) {
      throw new UnprocessableEntityException({
        code: 'SUCCESSOR_INACTIVE',
        field: 'successorId',
        message: 'Người nhận bàn giao phải là tài khoản đang hoạt động và đã kích hoạt.',
      });
    }
    return successorId;
  }

  /** Sửa tài khoản đã tạo. Chỉ họ tên — xem `UpdateUserInput`. */
  async update(userId: string, input: UpdateUserInput) {
    if (input.fullName === undefined) return { ok: true };
    const r = await this.db.q(
      `UPDATE idn.app_user SET full_name = $2, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [userId, input.fullName],
    );
    if (r.length === 0) throw new NotFoundException({ code: 'USER_NOT_FOUND' });

    // Họ tên nằm trong cache tài khoản — bỏ ngay, không chờ hết TTL 60 giây.
    await this.accounts.invalidate(userId);
    return { ok: true };
  }

  /**
   * Tài khoản đang hoạt động của một vai trò — nguồn cho MỌI ô chọn người.
   *
   * Từ `0031` có bốn chỗ cần đúng danh sách này và chúng phải nhìn thấy như
   * nhau: TDV chọn Trưởng bộ phận và Kế toán lúc gửi duyệt, Kế toán chọn Sale
   * Admin lúc tiếp nhận L1, Quản trị chọn TDV lúc đổi người phụ trách khách hàng.
   *
   * KHÔNG lọc theo phạm vi người gọi, và đó là chủ ý. Phạm vi trả lời câu "tôi
   * được xem hồ sơ nào"; ô chọn trả lời câu "tôi giao việc này cho ai được".
   * Trộn hai câu ấy làm một chính là lỗi cũ: `assignableTdv` từng lọc qua
   * `scope_user_ids`, nên một TDV mới tuyển chưa có hồ sơ nào thì không ai giao
   * khách được cho họ.
   *
   * Tài khoản đã vô hiệu hoá KHÔNG xuất hiện: giao việc cho người không đăng
   * nhập được là gửi hồ sơ vào ngõ cụt.
   */
  async byRole(role: RoleValue) {
    return this.db.q(
      `SELECT id, username, full_name AS "fullName", email
         FROM idn.app_user
        WHERE role = $1::idn.user_role AND is_active AND activated_at IS NOT NULL
        ORDER BY full_name`,
      [role],
    );
  }

  /**
   * Không còn cột liên kết nào (`0031`).
   *
   * Trước đây câu này nối ba lần sang chính `app_user` để lấy tên người duyệt và
   * tên cấp trên, vì biểu mẫu sửa phải mở ra thấy giá trị đang có. Hai ô ấy
   * không còn, nên ba phép nối cũng không còn.
   */
  async list(page: Page) {
    const rows = await this.db.q<Record<string, unknown> & { total_count: string }>(
      `SELECT u.id, u.username, u.email, u.full_name AS "fullName", u.role::text AS role,
              u.is_active AS "isActive", u.must_change_password AS "mustChangePassword",
              u.activated_at AS "activatedAt", u.email_verified_at AS "emailVerifiedAt",
              count(*) OVER() AS total_count
         FROM idn.app_user u
        ORDER BY u.username
        LIMIT $1 OFFSET $2`,
      [page.limit, page.offset],
    );
    return paged(rows, page);
  }

  /**
   * Băm của một chuỗi ngẫu nhiên 32 byte — tài khoản mới KHÔNG có mật khẩu.
   *
   * `password_hash` là `NOT NULL`, và để nó nhận NULL thì mọi đường đăng nhập
   * phải thêm một nhánh kiểm — quên một nhánh là một lỗ xác thực. Một giá trị
   * không ai đoán được thì mọi phép so đều trượt, mà không đường nào phải sửa.
   *
   * Đường DUY NHẤT để tài khoản có mật khẩu là liên kết trong thư mời. Không
   * còn "mật khẩu mặc định" nào để bàn giao ngoài luồng, cũng không còn kênh
   * nào để nó lọt ra.
   */
  private matKhauKhoa = () => hashPassword(randomBytes(32).toString('base64'));

  private activationUrl = (raw: string) =>
    `${CONFIG.webBaseUrl}/kich-hoat?token=${encodeURIComponent(raw)}`;
}
