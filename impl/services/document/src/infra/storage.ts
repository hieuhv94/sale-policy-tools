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

/** Trần thời gian cho một lượt liệt kê. Xem chú thích ở `Storage.listKeys`. */
const LIET_KE_HET_GIO_MS = 15_000;

@Injectable()
/** Object có trong CSDL nhưng KHÔNG có trên kho lưu trữ (`0059`). */
export class ObjectMissingError extends Error {
  constructor(readonly key: string) {
    super(`Object ${key} không có trên kho lưu trữ`);
  }
}

/**
 * Nhận ra lỗi "không có khoá ấy" của S3, không nhận nhầm lỗi mạng.
 *
 * MinIO trả `NoSuchKey`; một số bản trả `NotFound` cho `statObject`. Bắt cả
 * hai, và bắt theo MÃ chứ không theo chuỗi thông báo — thông báo đổi theo phiên
 * bản, mã thì không.
 */
const laKhongCoObject = (e: unknown): boolean =>
  typeof e === 'object' &&
  e !== null &&
  'code' in e &&
  (e.code === 'NoSuchKey' || e.code === 'NotFound');

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
    let stream;
    try {
      stream = await this.client.getObject(BUCKET, key);
    } catch (e) {
      /*
       * OBJECT KHÔNG CÓ TRÊN KHO là một tình huống NGHIỆP VỤ, không phải sự cố
       * hạ tầng (`0059`).
       *
       * CSDL và kho đối tượng ghi riêng nên chúng lệch nhau được, và lệch trong
       * im lặng: phục hồi CSDL từ một bản sao lưu mới hơn MinIO, dựng lại MinIO
       * từ đầu, hoặc xoá nhầm một object. Đã gặp thật.
       *
       * Để nguyên thì lỗi `S3Error: The specified key does not exist` chui ra
       * thành HTTP 500 kèm vết ngăn xếp của thư viện minio — người dùng đọc
       * không hiểu gì, và người trực hệ thống thì đi tìm nhầm phía. Ném một lỗi
       * CÓ TÊN để tầng trên nói được câu đúng và chỉ đúng người sửa được.
       */
      if (laKhongCoObject(e)) throw new ObjectMissingError(key);
      throw e;
    }
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

  /**
   * Liệt kê khoá. Dùng trong test để chứng minh object thật sự biến mất, không
   * chỉ bị đánh dấu.
   *
   * CÓ TRẦN, và trần đó nằm ở thư viện chứ không ở đây. Trình phân tích XML bên
   * trong `minio` 8.0.1 (`fast-xml-parser`) ném *"Entity expansion limit
   * exceeded"* khi một trang kết quả vượt khoảng một nghìn phần tử — và nó ném
   * từ bên trong `Transform._flush`, tức là thành **ngoại lệ không ai bắt
   * được**: bọc `try/catch` quanh `for await` không hề nhận được lỗi, vòng lặp
   * chỉ treo cho tới lúc test hết giờ. Tôi đã thử và đó là kết quả.
   *
   * Nên **luôn truyền tiền tố hẹp**, đừng bao giờ gọi với chuỗi rỗng.
   *
   * Và nghe theo sự kiện `error` của luồng thay vì `for await`: `for await`
   * KHÔNG nhận được lỗi ném ra từ `Transform._flush` lúc `prefinish`, nên nó
   * đứng chờ mãi một luồng đã chết. Ở đây lỗi thành `reject`, kèm một trần thời
   * gian để trường hợp xấu nhất là một thông báo rõ ràng chứ không phải một
   * lượt chạy treo tới lúc ai đó bấm huỷ.
   *
   * CHƯA TÌM RA NGUYÊN NHÂN GỐC, và đây là những gì đã loại trừ được — để người
   * đọc sau không đi lại đúng bốn con đường ấy:
   *
   *   * KHÔNG phải số lượng object. Kho rỗng hoàn toàn (0 object) vẫn treo.
   *   * KHÔNG phải thư viện. Cùng lời gọi ấy trong một tiến trình sạch, cùng
   *     máy chủ MinIO: 28ms.
   *   * KHÔNG phải socket dùng lại. Dựng `Client` mới cho riêng lượt liệt kê
   *     cũng treo y hệt.
   *
   *   * KHÔNG phải bộ trộn DOCX dùng chung thư viện phân tích XML. Đây là
   *     hướng nghi lâu nhất và nó sai: `fast-xml-parser` chỉ có đúng một người
   *     phụ thuộc trong cây là `minio`, còn `contracts/docx.ts` dùng `fflate`
   *     với regex, không đụng tới nó.
   *
   * Điều duy nhất còn chắc chắn: nó chỉ treo ở CUỐI một tệp test đã chạy hàng
   * trăm thao tác object, và triệu chứng đầu tiên là một ngoại lệ không bắt
   * được từ bên trong luồng — "Entity expansion limit exceeded: 1002 > 1000".
   */
  async listKeys(prefix: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      const out: string[] = [];
      const stream = this.client.listObjectsV2(BUCKET, prefix, true);

      const hetGio = setTimeout(() => {
        stream.destroy();
        reject(new Error(`listKeys("${prefix}") quá ${LIET_KE_HET_GIO_MS}ms — luồng không kết thúc`));
      }, LIET_KE_HET_GIO_MS);
      const xong = (fn: () => void) => {
        clearTimeout(hetGio);
        fn();
      };

      stream.on('data', (o: { name?: string }) => {
        if (o.name) out.push(o.name);
      });
      stream.on('error', (e: Error) => xong(() => reject(e)));
      stream.on('end', () => xong(() => resolve(out)));
      stream.on('close', () => xong(() => resolve(out)));
    });
  }
}
