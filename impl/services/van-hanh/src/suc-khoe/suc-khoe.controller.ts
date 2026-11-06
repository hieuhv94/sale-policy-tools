/**
 * Thẻ Sức khoẻ (`0253`) — MỘT lời gọi gom mọi thứ trang cần để nói "hệ thống ổn không".
 *
 * Trả DỮ LIỆU có cấu trúc, không trả câu chữ: câu chữ cho người không chuyên IT là việc
 * của giao diện (`agents/KE-HOACH-VAN-HANH.md`), và một câu viết ở máy chủ thì không đổi
 * được mà không dựng lại ảnh.
 *
 * Thành phần lấy từ `/readyz` của gateway — nó đã hỏi song song mười một service, có
 * hạn chờ riêng; hỏi lại từ đây là bản chép thứ hai của cùng một phép đo.
 */
import { Controller, Get, Logger } from '@nestjs/common';
import { Bus, BUS } from '@csbh/bus';
import { Roles } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { ODiaService } from '../o-dia/o-dia.service.js';
import { TacTuService } from '../tac-tu/tac-tu.service.js';

const HANG_DOI_LOI = [
  ['thong-bao', BUS.queues.notificationDlq],
  ['tep', BUS.queues.documentDlq],
  ['ho-so', BUS.queues.policyDlq],
  ['nhat-ky', BUS.queues.auditDlq],
  ['bao-cao', BUS.queues.reportingDlq],
] as const;

@Controller('van-hanh')
export class SucKhoeController {
  private readonly log = new Logger(SucKhoeController.name);

  constructor(
    private readonly db: Db,
    private readonly oDia: ODiaService,
    private readonly tacTu: TacTuService,
  ) {}

  private async thanhPhan(): Promise<{ ok: boolean; services: { service: string; ok: boolean; status?: number; error?: string }[] }> {
    const url = `${process.env.GATEWAY_URL ?? 'http://gateway:3000'}/readyz`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return (await r.json()) as { ok: boolean; services: { service: string; ok: boolean }[] };
    } catch (e) {
      return { ok: false, services: [{ service: 'gateway', ok: false, error: String(e) }] };
    }
  }

  private async hangDoiLoi(): Promise<{ hangDoi: string; so: number | null }[]> {
    const bus = new Bus();
    try {
      const kq: { hangDoi: string; so: number | null }[] = [];
      for (const [ten, q] of HANG_DOI_LOI) kq.push({ hangDoi: ten, so: await bus.demHangDoi(q) });
      return kq;
    } catch (e) {
      this.log.warn(`không hỏi được RabbitMQ: ${String(e)}`);
      return HANG_DOI_LOI.map(([ten]) => ({ hangDoi: ten, so: null }));
    } finally {
      await bus.close().catch(() => undefined);
    }
  }

  @Roles('QUAN_TRI')
  @Get('suc-khoe')
  async xem() {
    const [thanhPhan, hangDoiLoi, outbox, thuHong, saoLuu, oDia, tacTu, container] = await Promise.all([
      this.thanhPhan(),
      this.hangDoiLoi(),
      this.db.q<{ nguon: string; so: string }>(`SELECT nguon, so::text FROM ops.dem_outbox_chua_phat()`),
      this.db.one<{ so: string }>(`SELECT ops.dem_thu_hong()::text AS so`),
      // Sao lưu QUÁ HẠN = đến hạn mà mốc đã trôi qua hơn 2 giờ — lượt theo lịch lẽ ra đã
      // chạy và thành công. Lượt hỏng một lần chưa tính (đang trong giờ thử lại).
      this.db.q<{ viec: string; quaHan: boolean; lanThanhCong: string | null; lanGanNhat: string | null }>(
        `SELECT c.viec,
                ops.den_han(c.viec, now()) AND now() > ops.moc_truoc(c.viec, now()) + interval '2 hours' AS "quaHan",
                (SELECT max(bat_dau) FROM ops.lan_chay l WHERE l.viec = c.viec AND ket_qua = 'THANH_CONG') AS "lanThanhCong",
                (SELECT ket_qua FROM ops.lan_chay l WHERE l.viec = c.viec ORDER BY bat_dau DESC, id DESC LIMIT 1) AS "lanGanNhat"
           FROM ops.cau_hinh_viec c WHERE c.viec IN ('SAO_LUU_CSDL', 'SAO_LUU_KHO_TEP') ORDER BY c.viec`,
      ),
      this.oDia.theoO(),
      this.tacTu.nhipTim(),
      // Container hạ tầng do TÁC TỬ chụp (`0254`) — `/readyz` chỉ biết các service Node.
      this.tacTu.container(),
    ]);
    return {
      thanhPhan,
      hangDoiLoi,
      suKienChoPhat: outbox.map((o) => ({ nguon: o.nguon, so: Number(o.so) })),
      thuHong: Number(thuHong?.so ?? 0),
      saoLuu,
      oDia: oDia.map((d) => ({ o: d.o, phanTram: d.phanTram, vuotNguong: d.vuotNguong, duBaoNgayDay: d.duBaoNgayDay })),
      tacTu: { online: tacTu.online, lanCuoi: tacTu.lanCuoi },
      container,
    };
  }
}
