/**
 * Ghi log của mỗi service ra TỆP RIÊNG trong một thư mục chung (`0249`).
 *
 * VÌ SAO. Tới `0249` mười service chỉ in ra stdout, và Docker giữ một cửa sổ
 * trượt 500MB mỗi container rồi **mất sạch khi container bị dựng lại** — lần
 * nâng cấp nào cũng xoá log của mọi lỗi xảy ra trước đó. Thư mục chung
 * (`CSBH_LOG_DIR`, gắn từ máy chủ) sống ngoài vòng đời container.
 *
 * HÌNH DẠNG.
 *
 *   <CSBH_LOG_DIR>/dang-ghi/<service>-<YYYY-MM-DD>.log   ← mỗi dòng một JSON
 *
 * Ngày theo GIỜ VIỆT NAM (`ngayVN`) — đúng quy ước kỳ của cả phần mềm, và là thứ
 * lượt nén hằng đêm dựa vào để biết tệp nào đã "đóng". Tên tệp mang ngày chứ không
 * xoay vòng bằng đổi tên: sang ngày mới thì dòng kế tiếp tự rơi vào tệp mới, không
 * có khoảnh khắc nào hai tiến trình tranh nhau đổi tên một tệp.
 *
 * MỖI DÒNG mang `traceId` và người gọi lấy từ ngữ cảnh request (`request-context`)
 * — đây là thứ nối một mã tra cứu người dùng đọc được với vết ngăn xếp của lỗi.
 * Trước `0249` stdout không mang mã ấy, nên tra lỗi chỉ dò được theo giờ.
 *
 * VẪN in ra stdout y như cũ (kế thừa `ConsoleLogger`): `docker logs` và
 * `./csbh log` không đổi gì.
 *
 * KHÔNG BAO GIỜ làm sập service vì ghi log hỏng. Ổ đầy, thư mục mất quyền ghi —
 * nói ra MỘT lần trên stderr rồi tiếp tục chỉ in stdout; thử lại ở dòng sau, vì
 * người vận hành có thể đã sửa xong.
 *
 * `appendFileSync` chứ không giữ một luồng ghi mở: lượt nén có thể dời tệp đi bất
 * kỳ lúc nào, và một luồng đang mở sẽ tiếp tục ghi vào inode đã bị dời — log biến
 * mất không dấu vết. Mở-ghi-đóng mỗi dòng thì dòng sau luôn tới đúng tên tệp. Lượng
 * log của phần mềm này (không có log truy cập theo request) đủ nhỏ để cái giá ấy
 * không đáng kể.
 */
import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ngayVN } from './ky.js';
import { currentContext } from './request-context.js';

/** Thư mục con chứa tệp đang ghi. Lượt nén chỉ đọc ở đây. */
export const THU_MUC_DANG_GHI = 'dang-ghi';

/** Tên tệp log của một service trong một ngày. Một chỗ cho logger lẫn lượt nén. */
export const tenTepLog = (service: string, ngay: string): string => `${service}-${ngay}.log`;

export type DongLog = {
  t: string;
  muc: LogLevel;
  service: string;
  nguCanh?: string;
  traceId?: string;
  nguoiDung?: string;
  msg: string;
  stack?: string;
};

type TuyChon = {
  /** Thư mục gốc. Vắng mặt → chỉ in stdout (bộ kiểm, máy phát triển). */
  thuMuc?: string | undefined;
  /** Đồng hồ — bộ kiểm thay để thử qua nửa đêm. */
  bayGio?: () => Date;
  /** Ngày VN của một thời điểm — mặc định `ngayVN`. */
  ngayCua?: (d: Date) => string;
};

const chuoi = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.message;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

export class LoggerTep extends ConsoleLogger {
  private readonly thuMuc: string | undefined;
  private readonly bayGio: () => Date;
  private readonly ngayCua: (d: Date) => string;
  private daBaoLoi = false;

  constructor(
    private readonly service: string,
    tuyChon: TuyChon = {},
  ) {
    super();
    this.thuMuc = 'thuMuc' in tuyChon ? tuyChon.thuMuc : process.env.CSBH_LOG_DIR || undefined;
    this.bayGio = tuyChon.bayGio ?? (() => new Date());
    this.ngayCua = tuyChon.ngayCua ?? ngayVN;
  }

  /** Đường dẫn tệp đang ghi của hôm nay — bộ kiểm và trang Vận hành đọc nó. */
  duongDanHomNay(): string | undefined {
    if (!this.thuMuc) return undefined;
    return join(this.thuMuc, THU_MUC_DANG_GHI, tenTepLog(this.service, this.ngayCua(this.bayGio())));
  }

  override log(message: unknown, ...rest: unknown[]): void {
    super.log(message, ...rest);
    this.ghi('log', message, rest);
  }
  override warn(message: unknown, ...rest: unknown[]): void {
    super.warn(message, ...rest);
    this.ghi('warn', message, rest);
  }
  override debug(message: unknown, ...rest: unknown[]): void {
    super.debug(message, ...rest);
    if (this.isLevelEnabled('debug')) this.ghi('debug', message, rest);
  }
  override verbose(message: unknown, ...rest: unknown[]): void {
    super.verbose(message, ...rest);
    if (this.isLevelEnabled('verbose')) this.ghi('verbose', message, rest);
  }
  override fatal(message: unknown, ...rest: unknown[]): void {
    super.fatal(message, ...rest);
    this.ghi('fatal', message, rest);
  }
  /**
   * `error(message, stack?, context?)` — chữ ký của Nest. Bộ xử lý ngoại lệ mặc định
   * (`ExceptionsHandler`) gọi đúng dạng này cho mọi lỗi 500 không lường trước, kèm
   * vết ngăn xếp — và vì nó chạy bên trong chuỗi `await` của request, ngữ cảnh vẫn
   * còn: dòng ấy mang đúng `traceId` mà phản hồi trả về.
   */
  override error(message: unknown, ...rest: unknown[]): void {
    super.error(message, ...rest);
    const stack =
      message instanceof Error
        ? message.stack
        : rest.length >= 2 && typeof rest[0] === 'string'
          ? rest[0]
          : rest.length === 1 && typeof rest[0] === 'string' && rest[0].includes('\n    at ')
            ? rest[0]
            : undefined;
    this.ghi('error', message, rest, stack);
  }

  private ghi(muc: LogLevel, message: unknown, rest: unknown[], stack?: string): void {
    const duong = this.duongDanHomNay();
    if (!duong) return;
    const cuoi = rest[rest.length - 1];
    const nguCanh = typeof cuoi === 'string' && cuoi !== stack ? cuoi : this.context;
    const ctx = currentContext();
    const dong: DongLog = {
      t: this.bayGio().toISOString(),
      muc,
      service: this.service,
      ...(nguCanh ? { nguCanh } : {}),
      ...(ctx?.traceId ? { traceId: ctx.traceId } : {}),
      ...(ctx?.actor?.username ? { nguoiDung: ctx.actor.username } : {}),
      msg: chuoi(message),
      ...(stack ? { stack } : {}),
    };
    try {
      mkdirSync(join(this.thuMuc!, THU_MUC_DANG_GHI), { recursive: true });
      appendFileSync(duong, JSON.stringify(dong) + '\n');
      this.daBaoLoi = false;
    } catch (e) {
      if (!this.daBaoLoi) {
        this.daBaoLoi = true;
        process.stderr.write(
          `[${this.service}] KHÔNG ghi được tệp log ${duong}: ${(e as Error).message} — tiếp tục chỉ in ra màn hình\n`,
        );
      }
    }
  }
}
