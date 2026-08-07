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
import { cleanFilter, FILTER_KEYS, type Filter } from './filter.js';
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

  /** Danh sách tên tham số lọc — màn hình dựng form từ đây, không gõ lại 16 chuỗi. */
  @Roles(...VIEWERS)
  @Get('filter-keys')
  filterKeys() {
    return { keys: FILTER_KEYS, criteria: 14 };
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
    // `filename*` dạng RFC 5987: tên file có dấu tiếng Việt, và `filename=`
    // thuần thì trình duyệt đọc ra ký tự lạ (FE-18 cùng loại lỗi).
    res.setHeader(
      'content-disposition',
      `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    );
    res.end(f.content);
  }
}
