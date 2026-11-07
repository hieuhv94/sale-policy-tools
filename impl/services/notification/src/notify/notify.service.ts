/**
 * Xử lý một sự kiện: dịch vai trò sang người, dựng thư, gửi, ghi lại.
 *
 * Thứ tự "GIỮ CHỖ trước, gửi sau" là quyết định đáng cân nhắc nhất ở đây.
 *
 * Hàng đợi giao ít nhất một lần, nên cùng một sự kiện tới hai lần là chuyện
 * thường. Ghi trước rồi gửi thì mất thư nếu tiến trình chết đúng giữa hai bước;
 * gửi trước rồi ghi thì gửi trùng nếu chết đúng giữa hai bước. Chọn vế thứ nhất:
 *
 *   - Gửi trùng là thứ NGƯỜI DÙNG thấy và không sửa được — bốn thư giống hệt
 *     nhau làm họ mất tin vào mọi thông báo sau đó.
 *   - Mất một thư thì hồ sơ vẫn nằm nguyên trong danh sách "chờ tôi xử lý" ở
 *     trang chủ (NTF-07), tức là vẫn còn một đường thấy việc.
 *
 * Gửi hỏng thì chỗ đã giữ được TRẢ LẠI và sự kiện vào DLQ, nên gửi lại được.
 */
import { Injectable, Logger } from '@nestjs/common';
import { CHU_BUOC, nguoiDuocNhac, trichDoan, type Status } from '@csbh/domain-policy';
import { Db } from '../infra/db.js';
import { Mailer } from '../infra/mailer.js';
import { RecipientsClient, type Target } from './recipients.js';
import {
  bodyBanGiao,
  bodyFor,
  duongDan,
  DUONG_BAN_GIAO,
  DUONG_O_DIA,
  bodyODia,
  moTaODia,
  subjectODia,
  titleODia,
  type ODiaMail,
  moTaBanGiao,
  moTaNgan,
  subjectBanGiao,
  titleBanGiao,
  titleFor,
  subjectFor,
  type Bac,
  type BanGiaoMail,
  type MailEvent,
} from './templates.js';

export type Incoming = {
  eventId: string;
  routingKey: string;
  payload: Record<string, unknown>;
};

export type Outcome = 'sent' | 'duplicate' | 'ignored' | 'dead';

const s = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * Số nguyên dương trong thân sự kiện, hoặc `undefined` (`0190`).
 *
 * JSON qua RabbitMQ giữ nguyên kiểu số, nên `typeof v === 'number'` là đủ —
 * nhưng vẫn chặn `NaN` và số âm: một `versionNo` hỏng sẽ in ra *"Phiên bản NaN"*
 * giữa lá thư, và đó là loại lỗi không ai báo cáo vì trông như lỗi hiển thị.
 */
const n = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined;

@Injectable()
export class NotifyService {
  private readonly log = new Logger(NotifyService.name);

  constructor(
    private readonly db: Db,
    private readonly mailer: Mailer,
    private readonly recipients: RecipientsClient,
  ) {}

  async handle(ev: Incoming): Promise<Outcome> {
    const p = ev.payload;
    // Bàn giao khách hàng rẽ NGAY ở đây (`0085`): nó là sự kiện duy nhất không
    // nói về một hồ sơ, nên cả khung thư lẫn cách tra người nhận đều khác.
    if (ev.routingKey === 'customer.handover') return this.banGiao(ev);
    // `0253` — cảnh báo ổ đĩa, cũng không nói về hồ sơ nào: người nhận là mọi Quản trị.
    if (ev.routingKey === 'van_hanh.o_dia_vuot_nguong') return this.oDia(ev);
    // `0262` — bình luận: CHỈ chuông, không thư (ngoại lệ có chủ ý của `0096`).
    if (ev.routingKey === 'binh_luan.tao' || ev.routingKey === 'binh_luan.sua') return this.binhLuan(ev);

    const roles = Array.isArray(p['recipients']) ? (p['recipients'] as string[]) : [];
    const tdvUserId = s(p['tdvUserId']);

    // Sự kiện không có danh sách người nhận là sự kiện dành cho service khác
    // (`policy.superseded` cho reporting, `catalog.changed` cho audit). Bỏ qua
    // trong im lặng chứ không coi là lỗi — hàng đợi này nghe cả `policy.#`.
    if (roles.length === 0 || !tdvUserId) return 'ignored';

    /** Lá thư VIỆC đã bay đi chưa — quyết định nhánh dọn dẹp ở `catch`. */
    let daGuiViec = false;
    try {
      // Bốn người của hồ sơ đi kèm sự kiện (`0031`). Sự kiện cũ trong hàng đợi
      // hoặc trong bảng thư hỏng không có ba khoá này — chúng rơi về `undefined`
      // và người nhận thu về còn mỗi TDV. Đúng hơn là ném lỗi: một lá thư thiếu
      // người nhận vẫn tới được người lập, còn ném lỗi thì không ai nhận gì.
      const targets = this.recipients.pick(
        await this.recipients.targetsFor(tdvUserId, {
          tbp: s(p['tbpUserId']),
          keToan: s(p['keToanUserId']),
          saleAdmin: s(p['saleAdminUserId']),
        }),
        roles,
      );
      if (targets.length === 0) throw new Error(`không tìm được người nhận cho vai trò ${roles}`);

      const mail: MailEvent = {
        eventId: ev.eventId,
        routingKey: ev.routingKey,
        action: s(p['action']),
        policyId: s(p['policyId']),
        policyCode: s(p['policyCode']),
        customerId: s(p['customerId']),
        customerCode: s(p['customerCode']),
        customerName: s(p['customerName']),
        toStatus: s(p['toStatus']),
        pendingStep: s(p['pendingStep']),
        at: s(p['at']),
        reason: s(p['reason']) ?? null,
        /*
         * `0190` — BẪY `0128` Ở TẦNG JAVASCRIPT.
         *
         * Danh sách này liệt kê từng trường, y như một câu `SELECT` liệt kê từng
         * cột: thêm một khoá vào thân sự kiện mà quên ở đây thì `MailEvent` nhận
         * `undefined`, TypeScript im vì trường khai `?`, và triệu chứng là một
         * dòng LẶNG LẼ VẮNG MẶT trong thư — không lỗi nào nổi lên.
         *
         * Đã dính hai lần ở `policy`/`customer` (`0128`, `0144`, `0182`); đây là
         * lần đầu ở `notification`, và cùng một hình dạng.
         */
        versionNo: n(p['versionNo']),
        extra: isRecord(p['extra']) ? (p['extra'] as Record<string, string>) : {},
      };

      /*
       * CHIA HAI BẬC (`0192`) — trục là *"người đọc có việc không"*.
       *
       * `CHU_BUOC[toStatus]` trả về vai trò phải làm bước kế tiếp. Ai giữ đúng
       * vai trò ấy trên hồ sơ này thì nhận lá thư VIỆC; mọi người còn lại trong
       * `recipients` nhận lá thư TIN, chung với những người đọc ra từ nhật ký.
       *
       * KHÔNG CÓ NHÁNH RIÊNG cho trạng thái kết thúc: `DANG_CO_HIEU_LUC`,
       * `HET_HIEU_LUC`, `DA_XOA`, `QUA_HAN_DUYET` đều không có chủ bước, nên
       * `chuBuoc` là `undefined`, `undefined` không bằng vai trò nào, và cả sáu
       * hành động ấy tự rơi hết về TIN. Viết thêm một nhánh `TERMINAL` ở đây là
       * dựng lại bằng tay đúng kết quả mà phép so đã cho sẵn.
       */
      const chuBuoc = CHU_BUOC[(mail.toStatus ?? '') as Status];
      const nhomViec = chuBuoc ? targets.filter((t) => t.role === chuBuoc) : [];
      const nhomTin = targets.filter((t) => !nhomViec.includes(t));

      const threadKey = s(p['customerCode']) ?? s(p['customerId']) ?? ev.eventId;

      /*
       * NHÓM VIỆC RỖNG LÀ MỘT KẾT QUẢ HỢP LỆ, không phải lỗi.
       *
       * Tới `0191` mọi sự kiện đều có lá thư `CHINH`, nên `claim` chạy vô điều
       * kiện và `targets.length === 0` ở trên là dấu hiệu identity tra hỏng. Sáu
       * hành động dẫn tới trạng thái không có chủ bước giờ hợp lệ mà không có ai
       * ở bậc VIỆC — giữ nguyên phép kiểm cũ là đẩy cả sáu vào DLQ.
       *
       * Nên chốt chặn tách làm hai: `targets` rỗng vẫn là LỖI (không ai trong
       * `recipients` tra ra được người), còn `nhomViec` rỗng thì chỉ là không có
       * lá thư nào để gửi ở bậc ấy — và cũng không có gì để giữ chỗ dưới `CHINH`.
       */
      if (nhomViec.length > 0) {
        if (!(await this.claim(ev, s(p['policyId']), s(p['customerId'])))) return 'duplicate';
        await this.guiThu(ev, mail, 'VIEC', 'CHINH', nhomViec, threadKey);
        daGuiViec = true;
      }

      const daGuiTin = await this.baoTin(ev, mail, nhomViec, nhomTin, threadKey, daGuiViec);
      // Không lá nào đi và cũng không lá nào hỏng: cả hai chỗ giữ đều đã có từ
      // lượt trước. Trả `duplicate` chứ không `sent` — `dead-letters/:id/retry`
      // đọc kết quả này để đánh dấu đã xử lý, và hai giá trị ấy đều hợp lệ ở đó,
      // nhưng nhật ký của consumer thì phải nói đúng chuyện vừa xảy ra.
      if (!daGuiViec && !daGuiTin) return 'duplicate';
      return 'sent';
    } catch (e) {
      /*
       * Trả lại chỗ đã giữ. Không làm bước này thì sự kiện vĩnh viễn bị coi là
       * "đã gửi" và lần gửi lại từ DLQ nào cũng bị chặn vì trùng khoá.
       *
       * NHƯNG CHỈ KHI LÁ THƯ VIỆC CHƯA ĐI (`0037`). Nếu nó đã gửi rồi thì hỏng
       * ở đây là hỏng của thứ khác, và trả lại chỗ là biến một lỗi phụ thành
       * một lá thư trùng ở lần gửi lại. Đã dính đúng lỗi này: lá thư "để biết"
       * ném lỗi kiểu dữ liệu và kéo theo cả sự kiện đã gửi xong vào DLQ.
       */
      if (!daGuiViec) {
        await this.db.q(`DELETE FROM ntf.sent_mail WHERE event_id = $1 AND kind = 'CHINH'`, [
          ev.eventId,
        ]);
      }
      await this.db.q(
        `INSERT INTO ntf.dead_letter (event_id, routing_key, payload, attempts, last_error)
         VALUES ($1,$2,$3::jsonb,$4,$5)`,
        [
          ev.eventId,
          ev.routingKey,
          JSON.stringify(ev.payload),
          this.mailer.cfg.retryBackoffMs.length + 1,
          String(e instanceof Error ? e.message : e),
        ],
      );
      this.log.error(`sự kiện ${ev.eventId} vào DLQ: ${String(e)}`);
      return 'dead';
    }
  }

  /**
   * Ghi thông báo trên web cho đúng những người sắp nhận lá thư này (`0096`).
   *
   * Hàm này KHÔNG có bảng tra hành động nào, và đó là điều kiện để luật của
   * khách hàng đứng vững: *mọi hành động dẫn tới gửi email cho một người đều là
   * một thông báo của người ấy, ngoài ra không có gì khác*. Nó nhận thẳng
   * `targets` — chính mảng mà `mailer.send` sắp lấy địa chỉ ra — nên không tồn
   * tại đường nào gửi được thư mà không sinh thông báo, và ngược lại.
   *
   * Ghi cho NGƯỜI ĐÁNG LẼ NHẬN THƯ, không phải cho danh sách sau khi lọc:
   * `mailer.allowed()` cắt bớt người nhận theo `MAIL_ALLOWLIST`, nhưng đó là van
   * an toàn về việc thư có được đi ra ngoài hay không, không phải câu trả lời
   * cho *việc này liên quan tới ai*. Người bị van ấy cắt vẫn phải thấy việc của
   * mình khi đăng nhập.
   *
   * Người vừa bấm nút cũng nhận, nếu vai trò của họ có trong `RECIPIENTS` của
   * bước ấy (`KT_RECEIVE_L2` là một ví dụ thật). Cố ý không lọc: lọc ở đây là
   * dựng một luật thứ hai chỉ đúng cho cái chuông, và cái chuông lệch khỏi hộp
   * thư. Thấy nhiễu thì sửa `RECIPIENTS` ở policy — thư cũng bớt nhiễu theo.
   */
  private async ghiThongBao(
    ev: Incoming,
    targets: { userId: string }[],
    t: {
      kind: 'CHINH' | 'THEO_DOI';
      action: string | null;
      tieuDe: string;
      moTa: string | null;
      duongDan: string;
      policyId?: string | null;
      customerId?: string | null;
      xayRaLuc: string | null;
    },
  ): Promise<void> {
    const ids = [...new Set(targets.map((x) => x.userId).filter(Boolean))];
    if (ids.length === 0) return;

    await this.db.q(
      `INSERT INTO ntf.thong_bao
         (user_id, event_id, kind, action, tieu_de, mo_ta, duong_dan,
          policy_id, customer_id, xay_ra_luc)
       SELECT u, $1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8::uuid,
              coalesce($9::timestamptz, now())
         FROM unnest($10::uuid[]) AS u
       ON CONFLICT (event_id, kind, user_id) DO NOTHING`,
      [
        ev.eventId,
        t.kind,
        t.action,
        t.tieuDe,
        t.moTa,
        t.duongDan,
        t.policyId ?? null,
        t.customerId ?? null,
        t.xayRaLuc,
        ids,
      ],
    );
  }

  /**
   * Thư BÀN GIAO KHÁCH HÀNG (`0085`).
   *
   * Người nhận bàn giao trước đây **không được báo gì cả**. Đo trên chồng demo
   * trước khi sửa: bàn giao 23 khách hàng và 140 hồ sơ từ `tdv01` sang `tdv02`,
   * số thư trong `ntf.sent_mail` đứng yên ở 342. Sự kiện `policy.handover` có
   * bay đi, nhưng nó không mang `recipients` lẫn `tdvUserId` nên `handle` bỏ qua
   * trong im lặng — đúng nhánh dành cho sự kiện của service khác. Người nhận
   * sáng hôm sau mở hộp việc lên và thấy thêm 140 hồ sơ lạ, có cái sắp quá hạn.
   *
   * MỘT lá thư cho MỘT lượt bàn giao, không phải một lá cho mỗi khách. Và nội
   * dung dừng ở đúng chỗ khách hàng đã chốt: *bạn được bàn giao chừng này khách,
   * từ ai*, kèm danh sách. Không kể hồ sơ — người vừa nhận 140 hồ sơ không đọc
   * hết một danh sách 140 mã trong thư, còn hộp việc thì nói con số ấy chính xác
   * và luôn cập nhật.
   *
   * KHÔNG có thư "để biết" đi kèm: người bàn giao vừa bị vô hiệu hoá tài khoản,
   * và Quản trị thì vừa tự tay bấm nút.
   */
  /**
   * THÔNG BÁO BÌNH LUẬN (`0262`) — dòng chuông, KHÔNG thư.
   *
   * NGOẠI LỆ CÓ CHỦ Ý của luật `0096` (*"thông báo trên web = người nhận thư"*),
   * chốt 06/11: bình luận là trao đổi dồn dập, một lá thư cho từng câu là ngập
   * hộp thư. Đừng "sửa cho đồng bộ" bằng cách gửi thư ở đây.
   *
   * Không `claim` vào `ntf.sent_mail`: bảng ấy giữ chỗ cho THƯ. Chống trùng khi
   * hàng đợi giao lại là chỉ mục `uq_thong_bao_event_kind_user` — cùng sự kiện,
   * cùng người, một dòng.
   *
   * Người nhận (yêu cầu 6.2): người MỚI được nhắc, cộng tác giả bình luận gốc khi
   * đây là một reply mới — trừ chính người viết. Một người một dòng: vừa được nhắc
   * vừa là tác giả gốc thì nhận câu *nhắc tên* (cụ thể hơn). Tra qua `byIds`, tức
   * `users/mail-targets` của identity — nơi đã lọc tài khoản vô hiệu hoá và
   * `KHONG_NHAN_THONG_BAO` (Ban lãnh đạo, `0260`). Không lọc lại ở đây.
   *
   * BẬC VIỆC (`kind = CHINH`, chốt 06/11): tính vào con số trên chuông, có kẻ xanh.
   * Câu chữ ĐÚNG như chủ sản phẩm viết — câu KỂ, lệch lối câu mệnh lệnh của bậc
   * VIỆC (`0195`). Không mâu thuẫn thật: thông báo bình luận chỉ có một bậc, nên
   * bất biến *"hai bậc ra hai tiêu đề khác nhau"* không áp vào đây.
   */
  private async binhLuan(ev: Incoming): Promise<Outcome> {
    const p = ev.payload;
    const policyId = s(p['policyId']);
    const binhLuanId = s(p['binhLuanId']);
    const actorId = s(p['actorId']);
    if (!policyId || !binhLuanId || !actorId) return 'ignored';

    const nhac = (Array.isArray(p['nguoiDuocNhac']) ? (p['nguoiDuocNhac'] as unknown[]) : [])
      .filter((x): x is string => typeof x === 'string' && x !== actorId);
    const gocId = ev.routingKey === 'binh_luan.tao' ? s(p['tacGiaGocId']) : undefined;
    const traLoi = gocId && gocId !== actorId && !nhac.includes(gocId) ? [gocId] : [];
    if (nhac.length === 0 && traLoi.length === 0) return 'ignored';

    const nhan = new Set((await this.recipients.byIds([...nhac, ...traLoi])).map((t) => t.userId));
    const noiDung = s(p['noiDungBinhLuan']) ?? '';
    const ten = await this.recipients.ten([actorId, ...nguoiDuocNhac(noiDung)]);
    const nguoiViet = ten[actorId] ?? s(p['actorName']) ?? 'Một người dùng';
    const moTa = [s(p['policyCode']), s(p['customerName'])].filter(Boolean).join(' · ') || null;
    const trich = noiDung ? trichDoan(noiDung, (id) => ten[id]) : null;
    const chung = {
      policyId,
      customerId: s(p['customerId']) ?? null,
      binhLuanId,
      moTa,
      trichDoan: trich,
      duongDan: `/ho-so/${policyId}#binh-luan-${binhLuanId}`,
      xayRaLuc: s(p['at']) ?? null,
    };
    // Nhắc tên ghi TRƯỚC: người vừa được nhắc vừa là tác giả gốc đã bị loại khỏi
    // `traLoi` ở trên, nên hai lượt ghi không bao giờ cùng một người.
    await this.ghiBinhLuan(ev, nhac.filter((u) => nhan.has(u)), {
      ...chung,
      action: 'BINH_LUAN_NHAC',
      tieuDe: `${nguoiViet} đã nhắc đến bạn trong một bình luận`,
    });
    await this.ghiBinhLuan(ev, traLoi.filter((u) => nhan.has(u)), {
      ...chung,
      action: 'BINH_LUAN_TRA_LOI',
      tieuDe: `${nguoiViet} đã phản hồi một bình luận của bạn`,
    });
    return 'sent';
  }

  private async ghiBinhLuan(
    ev: Incoming,
    userIds: string[],
    t: {
      action: string;
      tieuDe: string;
      moTa: string | null;
      trichDoan: string | null;
      duongDan: string;
      policyId: string;
      customerId: string | null;
      binhLuanId: string;
      xayRaLuc: string | null;
    },
  ): Promise<void> {
    if (userIds.length === 0) return;
    await this.db.q(
      `INSERT INTO ntf.thong_bao
         (user_id, event_id, kind, action, tieu_de, mo_ta, duong_dan,
          policy_id, customer_id, xay_ra_luc, binh_luan_id, trich_doan)
       SELECT u, $1::uuid, 'CHINH', $2, $3, $4, $5, $6::uuid, $7::uuid,
              coalesce($8::timestamptz, now()), $9::uuid, $10
         FROM unnest($11::uuid[]) AS u
       ON CONFLICT (event_id, kind, user_id) DO NOTHING`,
      [
        ev.eventId,
        t.action,
        t.tieuDe,
        t.moTa,
        t.duongDan,
        t.policyId,
        t.customerId,
        t.xayRaLuc,
        t.binhLuanId,
        t.trichDoan,
        userIds,
      ],
    );
  }

  /**
   * Thư cảnh báo ổ đĩa (`0253`) — cùng khuôn `banGiao`: không thuộc hồ sơ nào, người nhận
   * đích danh (mọi Quản trị đang hoạt động), chuông ghi TRƯỚC thư (SMTP chết thì chuông là
   * đường duy nhất), hỏng hẳn thì vào bảng thư hỏng để gửi lại.
   */
  private async oDia(ev: Incoming): Promise<Outcome> {
    const p = ev.payload;
    const phanTram = typeof p['phanTram'] === 'number' ? p['phanTram'] : null;
    const nguong = typeof p['nguong'] === 'number' ? p['nguong'] : null;
    if (phanTram === null || nguong === null) return 'ignored';
    if (!(await this.claim(ev))) return 'duplicate';
    try {
      const targets = await this.recipients.quanTri();
      if (targets.length === 0) throw new Error('không có Quản trị hệ thống nào đang hoạt động để nhận cảnh báo');
      const thu: ODiaMail = {
        o: s(p['o']) ?? 'du-lieu',
        phanTram,
        nguong,
        conLai: typeof p['conLai'] === 'number' ? p['conLai'] : null,
        duBaoNgayDay: typeof p['duBaoNgayDay'] === 'number' ? p['duBaoNgayDay'] : null,
        at: s(p['at']),
      };
      await this.ghiThongBao(ev, targets, {
        kind: 'CHINH',
        action: 'O_DIA_VUOT_NGUONG',
        tieuDe: titleODia(thu),
        moTa: moTaODia(thu),
        duongDan: DUONG_O_DIA,
        xayRaLuc: thu.at ?? null,
      });
      const subject = subjectODia(thu);
      const sent = await this.withRetry(ev, () =>
        this.mailer.send({
          eventId: ev.eventId,
          to: targets.map((t) => t.email),
          subject,
          text: bodyODia(thu, this.mailer.cfg.webBaseUrl),
          threadKey: ev.eventId,
        }),
      );
      await this.db.q(
        `UPDATE ntf.sent_mail
            SET message_id = $2, to_addresses = $3, subject = $4, attempts = $5
          WHERE event_id = $1 AND kind = 'CHINH'`,
        [ev.eventId, sent.messageId, sent.to, subject, sent.attempts],
      );
      return 'sent';
    } catch (e) {
      await this.db
        .q(`DELETE FROM ntf.sent_mail WHERE event_id = $1 AND kind = 'CHINH'`, [ev.eventId])
        .catch(() => undefined);
      await this.db.q(
        `INSERT INTO ntf.dead_letter (event_id, routing_key, payload, attempts, last_error)
         VALUES ($1,$2,$3::jsonb,$4,$5)`,
        [
          ev.eventId,
          ev.routingKey,
          JSON.stringify(ev.payload),
          this.mailer.cfg.retryBackoffMs.length + 1,
          String(e instanceof Error ? e.message : e).slice(0, 2000),
        ],
      );
      this.log.error(`thư cảnh báo ổ đĩa ${ev.eventId} vào DLQ: ${String(e)}`);
      return 'dead';
    }
  }

  private async banGiao(ev: Incoming): Promise<Outcome> {
    const p = ev.payload;
    const nhan = s(p['tdvUserId']);
    const count = typeof p['count'] === 'number' ? p['count'] : 0;
    if (!nhan || count === 0) return 'ignored';

    if (!(await this.claim(ev))) return 'duplicate';

    try {
      // `byIds` chứ không `targetsFor`: người nhận đã biết đích danh, không có
      // vai trò nào phải dịch. Nó cũng lọc sẵn tài khoản đã vô hiệu hoá — người
      // nhận bàn giao thì không thể ở trạng thái đó, nhưng để identity trả lời
      // vẫn hơn là ở đây tự tin rằng không thể.
      const targets = await this.recipients.byIds([nhan]);
      if (targets.length === 0) throw new Error(`không tra được địa chỉ thư của ${nhan}`);

      const thu: BanGiaoMail = {
        fromName: s(p['fromName']) ?? null,
        count,
        customers: Array.isArray(p['customers'])
          ? (p['customers'] as { code: string; name: string }[])
          : [],
        at: s(p['at']),
      };

      // Thông báo duy nhất KHÔNG trỏ về một hồ sơ, đúng như lá thư sinh ra nó.
      await this.ghiThongBao(ev, targets, {
        kind: 'CHINH',
        action: 'HANDOVER',
        tieuDe: titleBanGiao(thu),
        moTa: moTaBanGiao(thu),
        duongDan: DUONG_BAN_GIAO,
        xayRaLuc: thu.at ?? null,
      });

      const subject = subjectBanGiao(thu);
      const sent = await this.withRetry(ev, () =>
        this.mailer.send({
          eventId: ev.eventId,
          to: targets.map((t) => t.email),
          subject,
          text: bodyBanGiao(thu, this.mailer.cfg.webBaseUrl),
          // Không gộp vào luồng thư của khách hàng nào: một lượt bàn giao nói
          // về cả tập khách, gộp nó vào hộp thoại của một khách là chôn nó ở
          // giữa một chuỗi thư về hồ sơ.
          threadKey: ev.eventId,
        }),
      );
      await this.db.q(
        `UPDATE ntf.sent_mail
            SET message_id = $2, to_addresses = $3, subject = $4, attempts = $5
          WHERE event_id = $1 AND kind = 'CHINH'`,
        [ev.eventId, sent.messageId, sent.to, subject, sent.attempts],
      );
      return 'sent';
    } catch (e) {
      await this.db
        .q(`DELETE FROM ntf.sent_mail WHERE event_id = $1 AND kind = 'CHINH'`, [ev.eventId])
        .catch(() => undefined);
      await this.db.q(
        `INSERT INTO ntf.dead_letter (event_id, routing_key, payload, attempts, last_error)
         VALUES ($1,$2,$3::jsonb,$4,$5)`,
        [
          ev.eventId,
          ev.routingKey,
          JSON.stringify(ev.payload),
          this.mailer.cfg.retryBackoffMs.length + 1,
          String(e instanceof Error ? e.message : e).slice(0, 2000),
        ],
      );
      this.log.error(`thư bàn giao ${ev.eventId} vào DLQ: ${String(e)}`);
      return 'dead';
    }
  }

  /**
   * Dựng chữ, ghi thông báo, gửi thư, ghi lại — một lá, một bậc (`0192`).
   *
   * Tách ra vì từ `0192` có HAI lá đi qua đúng bốn bước này, và cho tới `0191`
   * chúng là hai đoạn mã chép tay đứng cách nhau hai trăm dòng. Chúng đã kịp
   * lệch: lá "để biết" không đi qua `withRetry`, và không có lý do nào cho việc
   * ấy ngoài chuyện người viết đoạn thứ hai không chép nốt.
   *
   * GHI THÔNG BÁO TRƯỚC KHI GỬI THƯ (`0096`). Thứ tự này là một quyết định: SMTP
   * chết thì sự kiện vào DLQ và không ai nhận được thư — nhưng hành động thì ĐÃ
   * xảy ra, hồ sơ đã chuyển bước thật. Đúng lúc email hỏng là lúc cái chuông
   * thành đường duy nhất còn lại để người ta thấy việc, nên buộc nó vào kết quả
   * của SMTP là làm hỏng nó ở đúng lúc cần nhất. Chạy lại từ DLQ thì
   * `uq_thong_bao_event_kind_user` chặn bản sao.
   *
   * `eventId` của LÁ THƯ mang hậu tố ở bậc TIN — nó thành `Message-ID`, và trùng
   * với lá kia thì trình khách gộp hai thư làm một. Cột `event_id` trong CSDL
   * thì KHÔNG mang hậu tố: nó kiểu `uuid`, và cặp phân biệt hai lá đã là
   * `(event_id, kind)` (`0037`).
   */
  private async guiThu(
    ev: Incoming,
    mail: MailEvent,
    bac: Bac,
    kind: 'CHINH' | 'THEO_DOI',
    targets: Target[],
    threadKey: string,
  ): Promise<void> {
    // `duongDan(mail, bac)` — cùng một hàm cho cả thư lẫn chuông, nên hai bên
    // không thể dẫn đi hai chỗ khác nhau (`0096`).
    await this.ghiThongBao(ev, targets, {
      kind,
      action: mail.action ?? null,
      tieuDe: titleFor(mail, bac),
      moTa: moTaNgan(mail),
      duongDan: duongDan(mail, bac),
      policyId: mail.policyId ?? null,
      customerId: mail.customerId ?? null,
      xayRaLuc: mail.at ?? null,
    });

    const subject = subjectFor(mail, bac);
    const sent = await this.withRetry(ev, () =>
      this.mailer.send({
        eventId: kind === 'THEO_DOI' ? `${ev.eventId}:theo-doi` : ev.eventId,
        to: targets.map((t) => t.email),
        subject,
        text: bodyFor(mail, bac, this.mailer.cfg.webBaseUrl),
        threadKey,
      }),
    );
    await this.db.q(
      `UPDATE ntf.sent_mail
          SET message_id = $2, to_addresses = $3, subject = $4, thread_key = $5, attempts = $6
        WHERE event_id = $1 AND kind = $7`,
      [ev.eventId, sent.messageId, sent.to, subject, threadKey, sent.attempts, kind],
    );
  }

  /**
   * Lá thư bậc TIN — "để bạn biết", cho người KHÔNG phải làm gì ở bước này.
   *
   * Vì sao là hai lá thư chứ không phải một lá gửi cho nhiều người hơn: HAI
   * NHÓM CẦN HAI ĐƯỜNG DẪN KHÁC NHAU. Người phải xử lý cần mở thẳng hồ sơ để
   * bấm nút; người chỉ cần biết thì mở hồ sơ ra chẳng có nút nào, nên liên kết
   * của họ trỏ vào NHẬT KÝ — nơi trả lời đúng câu họ đang hỏi: "từ lúc tôi rời
   * tay, hồ sơ này đã đi qua những đâu". Một lá thư chỉ mang được một liên kết.
   *
   * HAI NGUỒN NGƯỜI NHẬN, và `0192` mới nối nguồn thứ hai vào (`0036` chỉ có
   * nguồn đầu):
   *
   *   `quanSat`  — đọc ra từ nhật ký hồ sơ: *ai đã từng thao tác*;
   *   `nhomTin`  — có TÊN trong `recipients` nhưng không phải chủ bước.
   *
   * Tới `0191` nhóm thứ hai nhận lá thư VIỆC cùng với người thật sự có việc, nên
   * TBP và TDV đọc *"Kế toán đã tiếp nhận lần 1"* dưới cùng một tiêu đề mà Sale
   * Admin đọc nó như một mệnh lệnh.
   *
   * TRỪ khỏi nhóm `quanSat` — và CHỈ nhóm ấy:
   *   * Người đã nhận lá thư VIỆC — hai thư cho một sự kiện là cách nhanh nhất
   *     khiến người ta ngừng đọc cả hai.
   *   * Người vừa bấm nút — họ vừa nhìn thấy kết quả trên màn hình.
   *   * **Sale Admin** (`0147`, siết lại ở `0192`) — xem khối ngay dưới.
   *   * Tài khoản đã vô hiệu hoá — lọc ở identity (`users/mail-targets`).
   *
   * `nhomTin` KHÔNG bị lọc theo người bấm nút: `RECIPIENTS` gọi tên vai trò của
   * chính người vừa thao tác ở vài bước (`KT_RECEIVE_L2` là ca thật), và `0096`
   * đã chốt rằng cái chuông không dựng luật riêng cho mình — thấy nhiễu thì sửa
   * `RECIPIENTS` bên policy, thư cũng bớt nhiễu theo.
   */
  private async baoTin(
    ev: Incoming,
    mail: MailEvent,
    daNhanViec: Target[],
    nhomTin: Target[],
    threadKey: string,
    /**
     * Lá thư VIỆC đã bay đi chưa — quyết định hỏng thì NUỐT hay NÉM (`0192`).
     *
     * `0037` chốt *"hỏng thì nuốt"* khi lá này là thư phụ: để nó kéo cả sự kiện
     * vào DLQ là biến một tiện ích thành điểm hỏng cho lá thư chính, mà lá chính
     * đã gửi xong nên gửi lại từ DLQ sẽ thành thư trùng.
     *
     * Lập luận ấy đứng trên một tiền đề mà `0192` vừa bỏ: rằng luôn có một lá
     * chính đã đi trước. Sáu hành động dẫn tới trạng thái không có chủ bước
     * (`KT_RECEIVE_L2`, `DELETE`, `SUPERSEDE`, `CUSTOMER_RETIRED`, `SLA_OVERDUE`,
     * `SLA_DISCARDED`) giờ chỉ có LÁ NÀY. Nuốt lỗi ở đó là mất hẳn thông báo
     * *"CSBH bắt đầu có hiệu lực"* mà không để lại một dòng DLQ nào.
     */
    daGuiViec: boolean,
  ): Promise<boolean> {
    const p = ev.payload;
    const ids = Array.isArray(p['observers']) ? (p['observers'] as string[]) : [];

    /*
     * SALE ADMIN không nhận lá này VÌ ĐÃ TỪNG THAO TÁC — nhưng vẫn nhận nếu
     * `RECIPIENTS` gọi tên họ (`0147`, siết lại ở `0192`).
     *
     * Khách hàng chốt 27/08: *"chỉ gửi cho SA khi đó là việc SA phải làm"*. Tới
     * `0191` phép loại trừ áp cho CẢ lá thư, và điều đó đúng chừng nào lá này
     * chỉ gồm người đọc ra từ nhật ký. Từ `0192` nó còn gồm người có tên trong
     * `RECIPIENTS`, và ở `KT_RECEIVE_L2` với `TBP_RECALL` thì `RECIPIENTS` gọi
     * tên Sale Admin **có chủ ý** — hồ sơ vừa có hiệu lực, hoặc vừa bị rút khỏi
     * bàn họ. Áp phép loại trừ cho cả nhóm là lặng lẽ nuốt đúng hai thông báo ấy.
     *
     * Nên nó ở lại đây, trong khối `quanSat`, chứ không nhích lên trên: nó trả
     * lời câu *"ai đáng nhận thư vì đã chạm vào hồ sơ"*, không phải câu *"ai
     * đáng nhận thư"*.
     *
     * Trừ theo ID chứ không theo vai trò: `observers` là danh sách người đã
     * thao tác, không mang vai trò nào. Một người giữ hai vai trò trên cùng một
     * hồ sơ là chuyện không xảy ra (bốn vai trò, bốn tài khoản), nên id của Sale
     * Admin trong danh sách ấy chỉ có thể là chính họ.
     */
    const bo = new Set([
      ...daNhanViec.map((t) => t.userId),
      ...nhomTin.map((t) => t.userId),
      s(p['actorId']) ?? '',
      s(p['saleAdminUserId']) ?? '',
    ]);
    const conLai = [...new Set(ids)].filter((id) => typeof id === 'string' && !bo.has(id));

    try {
      const quanSat = conLai.length > 0 ? await this.recipients.byIds(conLai) : [];
      const targets = [...nhomTin, ...quanSat];
      if (targets.length === 0) return false;

      // CÙNG `event_id`, khác `kind` (`0037`). Bản đầu nhét hậu tố vào chính
      // `event_id` (`<uuid>:theo-doi`) và cột kiểu `uuid` từ chối — ở đúng chỗ
      // tệ nhất, SAU khi lá thư chính đã gửi.
      if (!(await this.claim(ev, s(p['policyId']), s(p['customerId']), 'THEO_DOI'))) return false;

      await this.guiThu(ev, mail, 'TIN', 'THEO_DOI', targets, threadKey);
      return true;
    } catch (e) {
      await this.db
        .q(`DELETE FROM ntf.sent_mail WHERE event_id = $1 AND kind = 'THEO_DOI'`, [ev.eventId])
        .catch(() => undefined);
      if (!daGuiViec) throw e;
      this.log.warn(`không gửi được thư "để bạn biết" cho ${ev.eventId}: ${String(e)}`);
      return false;
    }
  }

  /**
   * Giữ chỗ bằng chính ràng buộc UNIQUE của CSDL, không bằng SELECT rồi INSERT.
   *
   * Hai bản notification chạy song song cùng nhận một sự kiện thì cả hai đều
   * thấy "chưa có" ở câu SELECT, và cả hai đều gửi. `ON CONFLICT DO NOTHING`
   * thì đúng một bản thắng, không cần khoá phân tán nào (NTF-06).
   */
  private async claim(
    ev: Incoming,
    policyId?: string,
    customerId?: string,
    /** `0037` — một sự kiện có hai lá thư, nên khoá chống trùng là CẶP. */
    kind: 'CHINH' | 'THEO_DOI' = 'CHINH',
  ): Promise<boolean> {
    const r = await this.db.q<{ id: string }>(
      `INSERT INTO ntf.sent_mail
         (event_id, kind, routing_key, policy_id, customer_id, message_id, to_addresses, subject)
       VALUES ($1,$5,$2,$3,$4,'','{}','')
       ON CONFLICT (event_id, kind) DO NOTHING
       RETURNING id`,
      [ev.eventId, ev.routingKey, policyId ?? null, customerId ?? null, kind],
    );
    return r.length > 0;
  }

  /** Thử lại có giãn cách; hết lượt thì ném ra để người gọi ghi DLQ (NTF-05). */
  private async withRetry<T extends object>(
    ev: Incoming,
    fn: () => Promise<T>,
  ): Promise<T & { attempts: number }> {
    const backoff = this.mailer.cfg.retryBackoffMs;
    let last: unknown;
    for (let i = 0; i <= backoff.length; i++) {
      try {
        return { ...(await fn()), attempts: i + 1 };
      } catch (e) {
        last = e;
        this.log.warn(`gửi thư hỏng lần ${i + 1} cho ${ev.eventId}: ${String(e)}`);
        const wait = backoff[i];
        if (wait !== undefined) await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw last;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
