/**
 * Đổi lỗi thô của multer thành lỗi có MÃ ổn định như mọi lỗi khác của hệ.
 *
 * multer chặn file quá lớn NGAY TRÊN DÒNG DỮ LIỆU, trước khi 21MB kịp nằm hết
 * trong RAM — nên phải để nó chặn, không dời phép kiểm vào service. Đổi lại,
 * lỗi nó ném ra không mang mã nào mà giao diện dùng được.
 *
 * LỆCH SO VỚI DANH MỤC TEST, có chủ ý: `CUST-12` ghi mong đợi **400**, ở đây
 * trả **413 Payload Too Large**. 413 là mã dành riêng cho đúng tình huống này,
 * còn 400 là mã chung cho mọi dữ liệu vào sai. Phần quan trọng của yêu cầu —
 * chặn được, và không để lại object rác — không đổi.
 *
 * Kế thừa `BaseExceptionFilter` chứ không NÉM LẠI lỗi không thuộc phạm vi: ném
 * lại từ trong một filter không quay về đường xử lý lỗi của Nest, nó thành
 * unhandled rejection và mọi lỗi 400 bình thường của endpoint này biến mất.
 */
import { Catch, HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';
import { MAX_BYTES } from './files.service.js';

/**
 * Bắt ở CẢ HAI dạng. `@nestjs/platform-express` đã đổi `MulterError` với mã
 * `LIMIT_FILE_SIZE` thành `PayloadTooLargeException` trước khi filter chạy, nên
 * chỉ nhận dạng theo tên lớp của multer là không bao giờ khớp — đúng lỗi đã mất
 * một vòng chạy để tìm ra.
 */
const isFileTooLarge = (e: unknown): boolean =>
  (e instanceof HttpException && e.getStatus() === HttpStatus.PAYLOAD_TOO_LARGE) ||
  (e instanceof Error &&
    e.name === 'MulterError' &&
    (e as { code?: string }).code === 'LIMIT_FILE_SIZE');

@Catch()
export class UploadErrorFilter extends BaseExceptionFilter {
  override catch(e: unknown, host: ArgumentsHost): void {
    if (isFileTooLarge(e)) {
      host.switchToHttp().getResponse<Response>().status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        code: 'FILE_TOO_LARGE',
        message: `File vượt ${MAX_BYTES / 1024 / 1024}MB`,
      });
      return;
    }
    super.catch(e, host);
  }
}
