/**
 * API báo cáo — CHỈ ĐỌC, trừ hai đường ghi vào trạng thái tạm của phiên làm
 * việc (bộ lọc đã lưu) và một đường tạo việc xuất file.
 *
 * KHÔNG có route nào tên `inbox`, và đó là một quyết định chứ không phải thiếu
 * sót. "Việc đang chờ tôi xử lý" đọc thẳng `pol.policy` ở service policy, vì
 * read-model trễ vài giây so với nguồn: một hồ sơ vừa được chuyển tới bàn của
 * người dùng mà chưa hiện trên trang chủ là lỗi nghiệp vụ, còn một báo cáo trễ
 * vài giây thì không (RPT-14). Test quét bảng định tuyến và đỏ ngay nếu ai thêm.
 */
import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles, type AuthUser } from '@csbh/http-kit';
import { ReportsService } from './reports.service.js';
import { FilterStore } from './filter-store.js';
import { cleanFilter, FILTER_KEYS, SO_TIEU_CHI, type Filter } from './filter.js';
import { ExportsService } from '../exports/exports.service.js';

/** Ai cũng xem được báo cáo — nhưng chỉ trong phạm vi dữ liệu của mình. */
const VIEWERS = ['TDV', 'TBP', 'KE_TOAN', 'SALE_ADMIN', 'BAN_LANH_DAO', 'QUAN_TRI'];

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly store: FilterStore,
    private readonly exports: ExportsService,
  ) {}

  @Roles(...VIEWERS)
  @Get('policies')
  async policies(
    @CurrentUser() me: AuthUser,
    @Query() q: Record<string, string>,
  ) {
    const filter = cleanFilter(q);
    const limit = q['limit'] === undefined ? 50 : Number(q['limit']);
    const page = await this.reports.list(me, filter, { limit, cursor: q['cursor'] });
    return { ...page, filter, appliedCriteria: Object.keys(filter).length };
  }

  @Roles(...VIEWERS)
  @Get('policies/count')
  async count(@CurrentUser() me: AuthUser, @Query() q: Record<string, string>) {
    return { total: await this.reports.count(me, cleanFilter(q)) };
  }

  /**
   * Danh sách tên tham số lọc — nguồn để đối chiếu với biểu mẫu ở giao diện.
   *
   * `criteria` suy TỪ chính `FILTER_KEYS` chứ không viết tay con số (`0077`).
   * Bản trước ghi cứng `11`, và đó là một con số phải nhớ sửa mỗi lần thêm bớt
   * tiêu chí — thứ không ai nhớ, và sai thì nó nói dối về chính danh sách nó
   * vừa trả về ngay bên cạnh.
   */
  @Roles(...VIEWERS)
  @Get('filter-keys')
  filterKeys() {
    return { keys: FILTER_KEYS, criteria: SO_TIEU_CHI };
  }

  /** Ô chọn *TDV phụ trách* của bộ lọc — chỉ người có hồ sơ trong phạm vi (`0077`). */
  @Roles(...VIEWERS)
  @Get('handlers')
  handlers(@CurrentUser() me: AuthUser) {
    return this.reports.handlers(me);
  }

  /**
   * Ô chọn *Mã khách hàng* của bộ lọc (`0077`).
   *
   * Đứng ở reporting chứ không dùng `GET /customers?q=`: đường kia khớp tên, địa
   * chỉ và mã số thuế nhưng **không khớp MÃ**, lại phân biệt dấu. Xem
   * `ReportsService.customers`.
   */
  @Roles(...VIEWERS)
  @Get('customers')
  khachHang(@CurrentUser() me: AuthUser, @Query('q') q?: string) {
    return this.reports.customers(me, q ?? '');
  }

  @Roles(...VIEWERS)
  @Get('progress')
  progress(@CurrentUser() me: AuthUser, @Query() q: Record<string, string>) {
    return this.reports.progress(me, cleanFilter(q));
  }

  @Roles(...VIEWERS)
  @Get('return-rate')
  returnRate(@CurrentUser() me: AuthUser, @Query() q: Record<string, string>) {
    return this.reports.returnRate(me, cleanFilter(q));
  }

  @Roles(...VIEWERS)
  @Get('sla')
  sla(@CurrentUser() me: AuthUser, @Query() q: Record<string, string>) {
    return this.reports.sla(me, cleanFilter(q));
  }

  // --- Bộ lọc đã lưu trong phiên (RPT-04) ------------------------------------

  @Roles(...VIEWERS)
  @Get('filters/:screen')
  async savedFilter(@CurrentUser() me: AuthUser, @Param('screen') screen: string) {
    const filter = await this.store.load(me, screen);
    return { screen, filter, appliedCriteria: Object.keys(filter).length };
  }

  @Roles(...VIEWERS)
  @Put('filters/:screen')
  async saveFilter(
    @CurrentUser() me: AuthUser,
    @Param('screen') screen: string,
    @Body() body: Record<string, unknown>,
  ) {
    const filter = await this.store.save(me, screen, body ?? {});
    return { screen, filter, appliedCriteria: Object.keys(filter).length };
  }

  /**
   * *Xóa bộ lọc*. Trả về danh sách đầy đủ TRONG PHẠM VI người dùng, không phải
   * toàn hệ thống — xoá bộ lọc là bỏ mọi tiêu chí, không phải bỏ luôn phạm vi
   * (RPT-03).
   */
  @Roles(...VIEWERS)
  @Post('filters/:screen/clear')
  @HttpCode(200)
  async clearFilter(@CurrentUser() me: AuthUser, @Param('screen') screen: string) {
    await this.store.clear(me, screen);
    return { screen, filter: {} as Filter, appliedCriteria: 0 };
  }

  // --- Xuất Excel chạy nền (RPT-07, RPT-08) ---------------------------------

  @Roles(...VIEWERS)
  @Post('exports')
  @HttpCode(202)
  request(@CurrentUser() me: AuthUser, @Body() body: Record<string, unknown>) {
    return this.exports.request(me, cleanFilter(body ?? {}));
  }

  @Roles(...VIEWERS)
  @Get('exports/:jobId')
  exportStatus(@CurrentUser() me: AuthUser, @Param('jobId') jobId: string) {
    return this.exports.status(jobId, me);
  }

  @Roles(...VIEWERS)
  @Get('exports/:jobId/file')
  async exportFile(
    @CurrentUser() me: AuthUser,
    @Param('jobId') jobId: string,
    @Res() res: Response,
  ): Promise<void> {
    const f = await this.exports.file(jobId, me);
    // Đặt header trong thân hàm chứ không bằng `@Header`: khi đã nhận `@Res`,
    // Nest giao hẳn phản hồi cho mình và không áp các decorator header nữa.
    res.setHeader(
      'content-type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    /*
     * Bản lùi ASCII mang ĐÚNG cái tên thật, không phải `export.xlsx` (`0079`).
     *
     * Từ `0078` tên file là `CSBH_20260821_121417.xlsx` — chỉ có chữ, số và gạch
     * dưới, tức là đã thuần ASCII. Nên hai dạng trong header nói cùng một điều,
     * và không còn khe nào để một trình duyệt hay một thư viện đọc nhầm sang cái
     * tên chung chung.
     *
     * Vẫn giữ `filename*` dạng RFC 5987: nó là dạng ĐÚNG, và ngày nào tên file
     * mang dấu tiếng Việt thì nó đã sẵn ở đó. Đó cũng chính là chỗ `0079` vừa
     * sửa ở phía giao diện — biểu thức đọc header khớp nhầm bản lùi.
     */
    res.setHeader(
      'content-disposition',
      `attachment; filename="${f.name}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    );
    res.end(f.content);
  }
}
