/**
 * API file. Mọi lượt tải đều đi qua đây và kiểm quyền lại từ đầu — không có URL
 * công khai nào trên MinIO (muc 10).
 */
import {
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  CurrentUser,
  oneOf,
  opt,
  Roles,
  str,
  tenTepTaiVe,
  validate,
  type AuthUser,
} from '@csbh/http-kit';
import { FilesService, MAX_BYTES, type OwnerKind, type Purpose } from './files.service.js';
import { Clients } from '../infra/clients.js';
import { checkFileToken, FILE_LINK_TTL_SEC, mintFileToken } from './file-link.js';
import { UploadErrorFilter } from './upload-error.filter.js';

const WRITERS = ['TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN'];

/**
 * Ai gõ được vào các đường ĐỌC tệp. Quản trị hệ thống thêm ở `0148`.
 *
 * Thoạt nhìn nó mâu thuẫn với `0133` — *"Quản trị đứng ngoài luồng duyệt, không
 * có phạm vi hồ sơ nào"*. Không mâu thuẫn, vì chốt vai trò ở đây chỉ là cửa
 * ngoài: phép kiểm thật nằm ở `assertCanRead`, và ở đó nhánh HỒ SƠ so phạm vi
 * dữ liệu — thứ mà Quản trị có RỖNG. Nên họ vào được cửa rồi vẫn nhận 403 ở mọi
 * tệp của hồ sơ, đúng như trước.
 *
 * Cái mở ra là nhánh KHÁCH HÀNG. Màn hình khách hàng dựng khối *Hồ sơ pháp lý*
 * cho mọi vai trò mở được trang ấy, và Quản trị mở được (`0133` giữ lại trang
 * này vì nút *Đổi TDV phụ trách* nằm ở đó). Trước lượt này, khối ấy hiện với họ
 * rồi báo lỗi — đúng lối "nút hiện rồi trả 403" mà `0097` đã phải chữa một lần.
 *
 * KHÔNG thêm vào `WRITERS`: đọc và ghi là hai câu, và lượt này chỉ trả lời câu
 * thứ nhất.
 */
const READERS = [...WRITERS, 'BAN_LANH_DAO', 'QUAN_TRI'];

@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly clients: Clients,
  ) {}

  /*
   * Vai trò khai BẰNG CHỮ (SEC-13 đọc chuỗi trong ngoặc). `BAN_LANH_DAO` có mặt từ
   * `0263` và CHỈ cho tệp bình luận — chặn ngay đầu thân hàm; SEC-13 khai miễn trừ
   * cho đường này kèm lý do.
   */
  @Roles('TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'BAN_LANH_DAO')
  @Post()
  @HttpCode(201)
  // Nhận vào bộ nhớ chứ không ghi tạm ra đĩa: phải BĂM và KIỂM ĐỊNH DẠNG trước
  // khi có bất kỳ byte nào rời tiến trình. Trần 20MB đặt ở cả multer lẫn service
  // — multer chặn sớm để không phải nạp nguyên file rác vào RAM.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES + 1 } }))
  @UseFilters(UploadErrorFilter)
  async upload(
    @CurrentUser() me: AuthUser,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @Query() q: Record<string, string>,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'FILE_MISSING', message: 'Thiếu phần file' });
    }
    const b = validate(q, {
      ownerKind: oneOf('POLICY', 'CUSTOMER', 'TEMPLATE'),
      ownerId: opt(str(36, 36)),
      /*
       * `BAN_CSBH` CỐ Ý ĐỨNG NGOÀI danh sách này (`0167`).
       *
       * Bản mềm không phải thứ ai đó tải lên từ máy mình — nó do hệ thống dựng
       * từ dữ liệu hồ sơ và một mẫu, ở `POST /policies/:id/render/luu`. Mở nó ra
       * ở đây là mở một đường để đính bất kỳ tệp PDF nào vào hồ sơ dưới nhãn
       * *bản mềm*, tức là đúng thứ mà việc dựng-từ-mẫu sinh ra để bảo đảm.
       */
      purpose: oneOf('HO_SO', 'SCAN', 'PHAP_LY', 'MAU_HD', 'BINH_LUAN'),
      fileName: opt(str(1, 300)),
    });
    if (me.role === 'BAN_LANH_DAO' && b.purpose !== 'BINH_LUAN') {
      throw new ForbiddenException({ code: 'ROLE_FORBIDDEN' });
    }
    const row = await this.files.upload(
      {
        ownerKind: b.ownerKind as OwnerKind,
        ownerId: b.ownerId ?? null,
        purpose: b.purpose as Purpose,
        // multer giải mã tên file theo latin1; tên tiếng Việt qua đó thành ký tự
        // lạ. Client gửi kèm `fileName` đã mã hoá URL thì dùng bản đó (DOC-18).
        fileName: b.fileName ?? file.originalname,
        buffer: file.buffer,
      },
      me,
    );
    return view(row);
  }

  @Roles(...READERS)
  @Get(':id')
  async meta(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const row = await this.files.row(id);
    // `0183` — `purpose` đi cùng: người ở mức *bản trước* chỉ đọc được bản mềm
    // và file scan, và chỗ duy nhất biết tệp này thuộc loại nào là chính `row`.
    await this.files.assertCanReadRow(row, me);
    return view(row);
  }

  @Roles(...READERS)
  @Get(':id/link')
  async link(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const row = await this.files.row(id);
    // ĐỌC: đây là bước một của lượt tải xuống (`DOC-09`), không phải lượt ghi nào.
    await this.files.assertCanReadRow(row, me);
    return {
      url: `/files/${id}/content?t=${encodeURIComponent(mintFileToken(id, me.id))}`,
      expiresInSec: FILE_LINK_TTL_SEC,
      fileName: row.file_name,
    };
  }

  /**
   * Tải nội dung. Ba lớp kiểm, và cả ba đều cần thiết:
   *   1. token của liên kết còn hạn và **cấp cho đúng người đang gọi** (DOC-09)
   *   2. người đó có quyền xem hồ sơ chủ của file — kiểm lại, không tin token
   *   3. nội dung trên kho khớp bản băm đã ghi lúc tải lên (DOC-06)
   */
  @Roles(...READERS)
  @Get(':id/content')
  async content(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Query('t') t: string | undefined,
    /** `xem=1` — mở trong phần mềm, KHÔNG ghi dòng tải xuống (`0053`). */
    @Query('xem') xem: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!t) throw new BadRequestException({ code: 'LINK_TOKEN_MISSING' });
    const check = checkFileToken(t, id, me.id);
    if (check !== 'ok') {
      throw new ForbiddenException({
        code: check === 'expired' ? 'LINK_EXPIRED' : 'LINK_NOT_YOURS',
        message:
          check === 'expired'
            ? 'Liên kết đã hết hạn, hãy mở lại hồ sơ để lấy liên kết mới'
            : 'Liên kết này cấp cho người dùng khác',
      });
    }
    const { row, body } = await this.files.read(id, me);

    /*
     * Ghi một dòng *Lịch sử* cho mỗi lượt TẢI tệp của hồ sơ (`0053`, N-01).
     *
     * Chỉ tệp thuộc HỒ SƠ. Tệp của khách hàng (`CUSTOMER`) và mẫu hợp đồng
     * (`TEMPLATE`) không có màn hình lịch sử nào để ghi vào — vết của chúng nằm
     * ở nhật ký kiểm toán toàn hệ thống.
     *
     * Ghi TRƯỚC khi trả nội dung, khác hai đường kia. Bản CSBH và hợp đồng ghi
     * sau vì phần đắt nhất là dựng PDF và nó có thể hỏng; ở đây nội dung đã nằm
     * sẵn trong tay, nên ghi trước là bảo đảm không có lượt tải nào chui lọt vì
     * lỗi xảy ra giữa hai bước.
     */
    // `0263` — tệp bình luận KHÔNG vào *Lịch sử* hồ sơ: lịch sử kể chuyện của văn
    // bản hồ sơ, còn tệp bình luận là một phần của cuộc trao đổi.
    if (row.owner_kind === 'POLICY' && row.owner_id && xem !== '1' && row.purpose !== 'BINH_LUAN') {
      await this.clients.daSinhVanBan(
        row.owner_id,
        row.purpose === 'SCAN' ? 'BAN_SCAN' : 'TEP_DINH_KEM',
        me,
      );
    }

    res.setHeader('Content-Type', row.content_type);
    // RFC 5987: tên tiếng Việt phải đi ở `filename*`, không nhét vào `filename`.
    // `0198` gom phép dựng header này ra `tenTepTaiVe` — ba đường tải từng dựng
    // nó theo hai cách khác nhau, và cách kia là một lỗ hổng.
    res.setHeader('Content-Disposition', tenTepTaiVe(row.file_name));
    res.end(body);
  }

  @Roles(...READERS)
  @Get(':id/verify')
  verify(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.files.verify(id, me);
  }

  @Roles(...READERS)
  @Get()
  async list(@CurrentUser() me: AuthUser, @Query() q: Record<string, string>) {
    const b = validate(q, {
      ownerKind: oneOf('POLICY', 'CUSTOMER', 'TEMPLATE'),
      ownerId: str(36, 36),
    });
    const rows = await this.files.listFor(b.ownerKind as OwnerKind, b.ownerId, me);
    return rows.map(view);
  }

  @Roles('SALE_ADMIN', 'TDV')
  @Delete(':id')
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const row = await this.files.row(id);
    // `0263` — tệp bình luận gỡ bằng cách SỬA bình luận, không xoá rời: xoá rời là
    // để lại một bình luận trỏ vào tệp đã mất.
    if (row.purpose === 'BINH_LUAN') {
      throw new ConflictException({
        code: 'TEP_BINH_LUAN_XOA_QUA_BINH_LUAN',
        message: 'Tệp đính kèm của bình luận gỡ bằng cách sửa hoặc xoá bình luận.',
      });
    }
    // GHI, và cố ý hẹp hơn quyền đọc từ `0148`: Trưởng bộ phận đọc được tệp
    // pháp lý của khách hàng, nhưng xoá thì vẫn chỉ TDV phụ trách.
    await this.files.assertCanWrite(row.owner_kind, row.owner_id, me);
    await this.files.discard(id, `xoá bởi ${me.role}`);
    return { ok: true };
  }
}

const view = (r: {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: string;
  sha256: string;
  owner_kind: string;
  owner_id: string | null;
  purpose: string;
  object_key: string;
  uploaded_at: Date;
}) => ({
  id: r.id,
  fileName: r.file_name,
  contentType: r.content_type,
  sizeBytes: r.size_bytes,
  sha256: r.sha256,
  ownerKind: r.owner_kind,
  ownerId: r.owner_id,
  purpose: r.purpose,
  objectKey: r.object_key,
  uploadedAt: r.uploaded_at,
});
