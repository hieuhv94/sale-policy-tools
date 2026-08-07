/**
 * Lưu file trên MinIO (S3 API).
 *
 * Hai quyết định về KHOÁ OBJECT, cả hai đều để tránh loại lỗi khó truy:
 *
 * 1. **Khoá không mang tên file người dùng đặt.** Tên tiếng Việt có dấu, dấu
 *    cách, dấu `/` và ký tự Unicode tổ hợp — đưa thẳng vào khoá S3 là sinh ra
 *    khoá tải về được ở máy này và 404 ở máy khác vì chuẩn hoá NFC/NFD khác
 *    nhau. Khoá là uuid, tên hiển thị nằm trong CSDL (DOC-18).
 *
 * 2. **Không có URL công khai và không dùng liên kết ký sẵn của MinIO.** Liên
 *    kết ký sẵn hợp lệ với BẤT KỲ AI cầm được nó, tức là gửi liên kết đi là gửi
 *    luôn quyền xem — đúng thứ DOC-09 nói phải chặn. Mọi lượt tải đều đi qua
 *    `document` và kiểm quyền lại từ đầu.
 */
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Client } from 'minio';
import { readSecret } from '@csbh/http-kit';

export const BUCKET = process.env.MINIO_BUCKET ?? 'csbh';

export const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

@Injectable()
export class Storage implements OnModuleInit {
  private readonly log = new Logger(Storage.name);
  private readonly client = new Client({
    endPoint: process.env.MINIO_HOST ?? 'minio',
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: (process.env.MINIO_USE_SSL ?? 'false') === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'csbh',
    secretKey: readSecret('MINIO_PASSWORD', 'csbh_dev_pw'),
  });

  async onModuleInit(): Promise<void> {
    if (!(await this.client.bucketExists(BUCKET))) {
      await this.client.makeBucket(BUCKET);
      this.log.log(`đã tạo bucket ${BUCKET}`);
    }
  }

  /** Khoá lưu trữ: chỉ chữ thường, số và dấu gạch — an toàn ở mọi hệ thống file. */
  static keyFor(purpose: string, ownerId: string | undefined): string {
    return `${purpose.toLowerCase()}/${ownerId ?? 'chung'}/${randomUUID()}`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.putObject(BUCKET, key, body, body.length, {
      'Content-Type': contentType,
    });
  }

  async get(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(BUCKET, key);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  }

  async remove(key: string): Promise<void> {
    await this.client.removeObject(BUCKET, key);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(BUCKET, key);
      return true;
    } catch {
      return false;
    }
  }

  /** Dùng trong test để chứng minh object thật sự biến mất, không chỉ bị đánh dấu. */
  async listKeys(prefix: string): Promise<string[]> {
    const out: string[] = [];
    const stream = this.client.listObjectsV2(BUCKET, prefix, true);
    for await (const o of stream) {
      const k = (o as { name?: string }).name;
      if (k) out.push(k);
    }
    return out;
  }
}
