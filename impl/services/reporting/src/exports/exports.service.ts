/**
 * Xuất Excel CHẠY NỀN (RPT-08).
 *
 * VÌ SAO KHÔNG XUẤT ĐỒNG BỘ. Năm nghìn dòng mất vài giây để dựng, và trong lúc
 * đó Node đang bận CPU — không phải chờ I/O. Vòng lặp sự kiện chỉ có một, nên
 * một request xuất file đồng bộ làm ĐỨNG mọi request khác của cùng tiến trình,
 * kể cả `/healthz`. Với một người bấm xuất file thì cả phòng thấy hệ thống treo.
 *
 * Nên bấm xuất là TẠO MỘT VIỆC rồi trả về ngay; việc chạy ở lượt sau của vòng
 * lặp, và màn hình hỏi lại trạng thái cho tới khi có link tải.
 *
 * Đây vẫn chưa phải hàng đợi thật (BullMQ) — cùng món nợ đã ghi cho `DOC-20`.
 * Ở quy mô 50 người dùng, `SKIP LOCKED` trên bảng việc đủ để hai bản service
 * không giành nhau một việc; cái còn thiếu là giới hạn số việc chạy song song.
 */
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { ScopeClient } from '../infra/scope.client.js';
import { ReportsService } from '../reports/reports.service.js';
import type { Filter } from '../reports/filter.js';
import { buildSheet } from './sheet.js';

/**
 * Trần cứng. Quá số này thì bộ lọc chưa đủ hẹp, và người dùng cần biết điều đó.
 *
 * Từ `0080` đây là số DÒNG SẢN PHẨM, không phải số hồ sơ: mỗi hồ sơ chiếm một
 * dòng cho mỗi mặt hàng của nó. Với hồ sơ trung bình 5 mặt hàng thì trần này
 * ứng với chừng 4.000 hồ sơ. Giữ nguyên con số vì thứ nó bảo vệ là bộ nhớ và
 * thời gian dựng file, mà cả hai đều tính theo dòng.
 */
export const EXPORT_MAX_ROWS = 20_000;

/**
 * Tên file: `CSBH_20260821_143012.xlsx` (`0078`).
 *
 * GIỜ VIỆT NAM, không phải UTC. `toISOString()` là đường ngắn nhất tới đây và
 * cũng là đường sai: nó lệch 7 tiếng, nên file xuất lúc 6 giờ sáng mang tên
 * `23...` của NGÀY HÔM TRƯỚC. Sai kiểu ấy không ai báo — người ta chỉ thấy thư
 * mục tải về sắp lộn xộn và không hiểu vì sao.
 *
 * `YYYYMMDD_HHMMSS` chứ không phải `dd-mm-yyyy` quen mắt hơn: người ta xuất
 * nhiều lần trong ngày, và thứ tự tên file trong thư mục CHÍNH LÀ thứ tự thời
 * gian chỉ khi năm đứng trước. Đó là lý do duy nhất, và nó đủ.
 *
 * Tới từng GIÂY vì hai lượt xuất cách nhau vài chục giây là chuyện thường —
 * đổi bộ lọc rồi xuất lại. Trùng tên thì trình duyệt tự thêm `(1)`, và người
 * dùng mất luôn manh mối file nào là file nào.
 */
export function tenTepXuat(luc: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .formatToParts(luc)
    .reduce<Record<string, string>>((a, x) => ({ ...a, [x.type]: x.value }), {});
  return `CSBH_${p['year']}${p['month']}${p['day']}_${p['hour']}${p['minute']}${p['second']}.xlsx`;
}

export type JobRow = {
  id: string;
  requested_by: string;
  status: string;
  row_count: number | null;
  file_name: string | null;
  byte_size: string | null;
  error: string | null;
  created_at: Date;
  finished_at: Date | null;
};

@Injectable()
export class ExportsService {
  private readonly log = new Logger(ExportsService.name);
  /** Việc đang chạy trong tiến trình này — để tắt máy không bỏ dở giữa chừng. */
  private running = new Set<Promise<void>>();

  constructor(
    private readonly db: Db,
    private readonly reports: ReportsService,
    private readonly scope: ScopeClient,
  ) {}

  /**
   * Nhận yêu cầu và trả về NGAY. Phạm vi dữ liệu chốt ở thời điểm này, không ở
   * thời điểm việc chạy: người dùng bấm xuất rồi bị chuyển sang nhánh khác hai giây sau
   * thì file phải chứa đúng những gì họ được xem lúc bấm.
   */
  async request(me: AuthUser, filter: Filter): Promise<{ jobId: string; status: string }> {
    const scopeIds = await this.scope.userIdsFor(me);
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO rpt.export_job (requested_by, requested_role, filter)
       VALUES ($1, $2, $3::jsonb) RETURNING id`,
      [me.id, me.role, JSON.stringify({ ...filter, __scope: scopeIds })],
    );
    const jobId = row!.id;

    // Chạy ở lượt sau của vòng lặp sự kiện. `void` có chủ ý: người gọi KHÔNG
    // chờ, đó là toàn bộ điểm của endpoint này. Lỗi được bắt bên trong `run` và
    // ghi vào chính bản ghi việc, nên không có promise nào bị bỏ rơi.
    const p = this.run(jobId, filter, scopeIds).finally(() => this.running.delete(p));
    this.running.add(p);
    return { jobId, status: 'CHO_XU_LY' };
  }

  /** Chờ mọi việc đang chạy xong — dùng lúc tắt máy và trong test. */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.running]);
  }

  private async run(jobId: string, filter: Filter, scopeIds: string[]): Promise<void> {
    // Giành việc bằng chính câu UPDATE. Hai bản service cùng khởi động lại và
    // cùng nhặt việc tồn đọng thì chỉ một bản đổi được trạng thái.
    const claimed = await this.db.q<{ id: string }>(
      `UPDATE rpt.export_job SET status = 'DANG_CHAY', started_at = now()
        WHERE id = $1 AND status = 'CHO_XU_LY' RETURNING id`,
      [jobId],
    );
    if (claimed.length === 0) return;

    try {
      const rows = await this.reports.all(scopeIds, filter, EXPORT_MAX_ROWS + 1);
      if (rows.length > EXPORT_MAX_ROWS) {
        throw new Error(
          `Bộ lọc khớp hơn ${EXPORT_MAX_ROWS} dòng sản phẩm. Hãy thu hẹp bộ lọc rồi xuất lại.`,
        );
      }
      const buf = await buildSheet(rows);
      const name = tenTepXuat(new Date());
      await this.db.q(
        `UPDATE rpt.export_job
            SET status = 'XONG', finished_at = now(), row_count = $2,
                file_name = $3, content = $4, byte_size = $5
          WHERE id = $1`,
        [jobId, rows.length, name, buf, buf.byteLength],
      );
      this.log.log(`xuất Excel ${jobId}: ${rows.length} dòng, ${buf.byteLength} byte`);
    } catch (e) {
      // Việc hỏng phải ĐỌC ĐƯỢC. Không ghi lại thì màn hình treo mãi ở "đang
      // chạy" và người dùng bấm xuất lại, mỗi lần lại hỏng theo cùng một cách.
      await this.db
        .q(`UPDATE rpt.export_job SET status = 'LOI', finished_at = now(), error = $2 WHERE id = $1`, [
          jobId,
          String(e instanceof Error ? e.message : e).slice(0, 2000),
        ])
        .catch(() => undefined);
    }
  }

  async status(jobId: string, me: AuthUser) {
    const j = await this.mine(jobId, me);
    return {
      jobId: j.id,
      status: j.status,
      rowCount: j.row_count,
      fileName: j.file_name,
      byteSize: j.byte_size === null ? null : Number(j.byte_size),
      error: j.error,
      createdAt: j.created_at,
      finishedAt: j.finished_at,
      downloadUrl: j.status === 'XONG' ? `/reports/exports/${j.id}/file` : null,
    };
  }

  async file(jobId: string, me: AuthUser): Promise<{ name: string; content: Buffer }> {
    const j = await this.mine(jobId, me);
    if (j.status !== 'XONG') {
      throw new NotFoundException({ code: 'EXPORT_NOT_READY', status: j.status });
    }
    const r = await this.db.one<{ content: Buffer | null }>(
      `SELECT content FROM rpt.export_job WHERE id = $1`,
      [jobId],
    );
    if (!r?.content) {
      throw new NotFoundException({
        code: 'EXPORT_EXPIRED',
        message: 'File kết xuất đã hết hạn lưu, hãy xuất lại',
      });
    }
    return { name: j.file_name ?? 'export.xlsx', content: r.content };
  }

  /**
   * File kết xuất CHỈ người yêu cầu tải được, kể cả cấp trên của họ.
   *
   * Đây không phải trùng lặp với kiểm phạm vi: nội dung file đã chốt theo phạm
   * vi của người yêu cầu tại lúc bấm. Cho người khác tải là cho họ đọc một tập
   * dữ liệu dựng theo quyền của người kia — đúng kiểu leo thang khó thấy nhất,
   * vì mọi API còn lại vẫn kiểm phạm vi đầy đủ.
   */
  private async mine(jobId: string, me: AuthUser): Promise<JobRow> {
    const j = await this.db.one<JobRow>(
      `SELECT id, requested_by, status, row_count, file_name, byte_size::text,
              error, created_at, finished_at
         FROM rpt.export_job WHERE id = $1`,
      [jobId],
    );
    if (!j) throw new NotFoundException({ code: 'EXPORT_NOT_FOUND' });
    if (j.requested_by !== me.id) throw new ForbiddenException({ code: 'NOT_OWNER' });
    return j;
  }
}
