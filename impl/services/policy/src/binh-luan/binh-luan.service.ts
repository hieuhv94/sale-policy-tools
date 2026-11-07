/**
 * Bình luận trên hồ sơ CSBH (`0261`).
 *
 * QUYỀN = PHẠM VI HỒ SƠ (yêu cầu 2.2): mọi đường — kể cả đường hỏi thay đổi mười
 * lăm giây một lần — mở hồ sơ qua `assertPolicyInScope`, đúng chốt mà trang hồ sơ
 * dùng, có cả luật Kế toán chưa tới lượt (`da_qua_tbp`). Không có bảng quyền
 * riêng cho bình luận: một bảng thứ hai là một bảng sẽ lệch.
 *
 * MỌI LƯỢT GHI của một hồ sơ đi qua `pg_advisory_xact_lock` theo hồ sơ TRƯỚC khi
 * chạm vào `pol.binh_luan` — xem `0128_binh_luan.sql` về vì sao mốc `stt_doi` cần
 * điều đó để đường hỏi thay đổi không bỏ sót.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  chuanNoiDung,
  GIOI_HAN_BINH_LUAN,
  kiemNoiDung,
  MA_CAM_XUC,
  nguoiDuocNhac,
  type MaCamXuc,
} from '@csbh/domain-policy';
import type { AuthUser } from '@csbh/http-kit';
import { Db } from '../infra/db.js';
import { Clients } from '../infra/clients.js';
import { emit } from '../infra/emit.js';
import { PoliciesService } from '../policies/policies.service.js';

type HoSo = {
  id: string;
  code: string;
  customer_id: string;
  tdv_user_id: string | null;
  tbp_user_id: string | null;
  ke_toan_user_id: string | null;
  sale_admin_user_id: string | null;
  da_qua_tbp: boolean;
  kh_ten_snap: string | null;
};

type Dong = {
  id: string;
  policy_id: string;
  parent_id: string | null;
  tac_gia_id: string;
  noi_dung: string;
  stt: string;
  stt_doi: string;
  tao_luc: Date;
  sua_luc: Date | null;
  xoa_luc: Date | null;
};

export type TepBay = { id: string; ten: string; loai: string; co: number };

export type CamXucBay = { loai: MaCamXuc; so: number; cuaToi: boolean; nguoi: string[] };

export type MucBinhLuan = {
  id: string;
  parentId: string | null;
  stt: number;
  tacGia: { id: string; ten: string; vaiTro: string | null };
  cuaToi: boolean;
  /** `null` khi đã xoá — nội dung gốc KHÔNG rời máy chủ, kể cả với tác giả (yêu cầu 3.4). */
  noiDung: string | null;
  daXoa: boolean;
  taoLuc: string;
  suaLuc: string | null;
  camXuc: CamXucBay[];
  /** Tệp còn gắn (`0263`). Rỗng khi đã xoá — tệp của bình luận đã xoá cũng không rời máy chủ. */
  tep: TepBay[];
  /** Chỉ bình luận gốc. */
  soPhanHoi?: number;
};

export type TrangBinhLuan = {
  binhLuan: (MucBinhLuan & { phanHoi: MucBinhLuan[] })[];
  conCu: boolean;
  /** Tên HIỆN TẠI của mọi người được nhắc trong trang này (yêu cầu 4 — đổi tên thì hiện tên mới). */
  ten: Record<string, string>;
  /** Mốc để hỏi thay đổi tiếp. Lấy TRƯỚC khi đọc danh sách — xem `trang()`. */
  moc: number;
};

const COT = `id, policy_id, parent_id, tac_gia_id, noi_dung, stt, stt_doi, tao_luc, sua_luc, xoa_luc`;
const iso = (d: Date | null): string | null => (d ? new Date(d).toISOString() : null);

@Injectable()
export class BinhLuanService {
  constructor(
    private readonly db: Db,
    private readonly clients: Clients,
    private readonly policies: PoliciesService,
  ) {}

  // --- Mở hồ sơ ------------------------------------------------------------

  private async moHoSo(policyId: string, me: AuthUser): Promise<HoSo> {
    const p = await this.db.one<HoSo>(
      `SELECT id, code, customer_id, tdv_user_id, tbp_user_id, ke_toan_user_id,
              sale_admin_user_id, da_qua_tbp, kh_ten_snap
         FROM pol.policy WHERE id = $1`,
      [policyId],
    );
    if (!p) throw new NotFoundException({ code: 'POLICY_NOT_FOUND' });
    await this.policies.assertPolicyInScope(p, me);
    return p;
  }

  /**
   * Khoá ghi theo hồ sơ — gọi ĐẦU TIÊN trong mọi transaction ghi bình luận.
   *
   * `hashtextextended` ra một `bigint` từ id hồ sơ; va chạm băm giữa hai hồ sơ chỉ
   * làm hai lượt ghi của hai hồ sơ ấy xếp hàng nhau, không sai dữ liệu.
   */
  private khoa(c: PoolClient, policyId: string) {
    return c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [policyId]);
  }

  // --- Danh sách nhắc tên --------------------------------------------------

  /**
   * Người nhắc được (yêu cầu 4, chốt 07/11): đúng những người ĐỨNG TÊN trên hồ sơ
   * — TDV, TBP, Kế toán (chỉ khi đã tới lượt), Sale Admin — trừ chính mình, chỉ
   * tài khoản đang hoạt động, không bao giờ Ban lãnh đạo.
   *
   * Hai vế cuối KHÔNG viết ở đây: `nguoiNhanDuoc` hỏi identity, nơi chốt sẵn cả
   * hai (`KHONG_NHAN_THONG_BAO`, `0260`). Người đứng tên trên hồ sơ không bao giờ
   * là Ban lãnh đạo hôm nay, nhưng đó là một tình cờ của luồng duyệt chứ không
   * phải một luật — luật nằm ở identity.
   */
  private async nguoiNhacDuoc(p: HoSo, me: AuthUser) {
    const ids = [
      p.tdv_user_id,
      p.tbp_user_id,
      p.da_qua_tbp ? p.ke_toan_user_id : null,
      p.sale_admin_user_id,
    ].filter((x): x is string => x !== null && x !== me.id);
    return this.clients.nguoiNhanDuoc(ids);
  }

  async nguoiNhac(policyId: string, q: string, me: AuthUser) {
    const p = await this.moHoSo(policyId, me);
    const tim = q.normalize('NFC').toLowerCase().trim();
    const ds = (await this.nguoiNhacDuoc(p, me))
      .filter(
        (n) =>
          tim === '' ||
          n.fullName.normalize('NFC').toLowerCase().includes(tim) ||
          n.email.toLowerCase().includes(tim),
      )
      .slice(0, 10);
    return {
      nguoi: ds.map((n) => ({ id: n.userId, ten: n.fullName, email: n.email, vaiTro: n.role })),
    };
  }

  /**
   * Kiểm người được nhắc ở MÁY CHỦ (yêu cầu 4 + §7: không tin danh sách của client).
   *
   * `daCo` là những người đã được nhắc trong bản TRƯỚC của chính bình luận này: sửa
   * một bình luận cũ mà người được nhắc từ trước nay đã rời hồ sơ thì vẫn lưu được —
   * chỉ người MỚI thêm vào mới phải hợp lệ. Thiếu vế ấy, một bình luận cũ thôi sửa
   * được chỉ vì Kế toán đổi người.
   */
  private async kiemNhac(p: HoSo, me: AuthUser, noiDung: string, daCo: string[] = []) {
    const moi = nguoiDuocNhac(noiDung).filter((id) => !daCo.includes(id));
    if (moi.length === 0) return moi;
    const duoc = new Set((await this.nguoiNhacDuoc(p, me)).map((n) => n.userId));
    const sai = moi.filter((id) => !duoc.has(id));
    if (sai.length > 0) {
      throw new BadRequestException({
        code: 'NHAC_TEN_KHONG_HOP_LE',
        message: 'Có người được nhắc tên không còn nhắc được trên hồ sơ này.',
      });
    }
    return moi;
  }

  /**
   * Mã lỗi viết BẰNG CHỮ ở từng nhánh, không `code: loi`: `tests/web/loi.test.tsx`
   * quét mã nguồn máy chủ tìm `code: '…'` để đòi mỗi mã có câu ở `loi.ts`. Đi qua
   * một biến là ba mã vô hình với phép quét — đúng lỗ nó sinh ra để bịt.
   */
  private kiem(noiDung: string, coTep: boolean): void {
    switch (kiemNoiDung(noiDung, coTep)) {
      case null:
        return;
      case 'BINH_LUAN_RONG':
        throw new BadRequestException({ code: 'BINH_LUAN_RONG', message: 'Bình luận không được để trống.' });
      case 'BINH_LUAN_QUA_DAI':
        throw new BadRequestException({
          code: 'BINH_LUAN_QUA_DAI',
          message: `Bình luận dài quá ${GIOI_HAN_BINH_LUAN.kyTuToiDa} ký tự.`,
        });
      case 'QUA_NHIEU_NHAC_TEN':
        throw new BadRequestException({
          code: 'QUA_NHIEU_NHAC_TEN',
          message: `Một bình luận nhắc tên tối đa ${GIOI_HAN_BINH_LUAN.nhacToiDa} người.`,
        });
    }
  }

  /**
   * Kiểm một lô tệp sắp gắn (`0263`, yêu cầu 7). `daGan` là tệp ĐANG gắn chính bình
   * luận này (lượt sửa giữ lại tệp cũ thì không phải kiểm lại).
   *
   * Mọi điều kiện đọc từ `document` — nơi duy nhất biết tệp là gì — và quyết định ở
   * đây: tệp của CHÍNH người gửi, mục đích `BINH_LUAN`, chủ là ĐÚNG hồ sơ này, chưa
   * huỷ. *Chưa gắn ở đâu* thì `UNIQUE (file_id)` của `pol.binh_luan_tep` chốt, kể cả
   * hai lượt gửi song song; phép hỏi trước chỉ để trả đúng mã lỗi.
   *
   * Một mã cho mọi lý do: người gửi không làm gì khác được với từng lý do, và tách
   * mã là nói cho người dò ID biết tệp của người khác có tồn tại hay không.
   */
  private async kiemTep(c: PoolClient, p: HoSo, me: AuthUser, ids: string[], daGan: string[] = []) {
    if (new Set(ids).size !== ids.length) throw this.tepSai();
    if (ids.length > GIOI_HAN_BINH_LUAN.tepToiDa) {
      throw new BadRequestException({
        code: 'QUA_NHIEU_TEP',
        message: `Một bình luận đính kèm tối đa ${GIOI_HAN_BINH_LUAN.tepToiDa} tệp.`,
      });
    }
    const moi = ids.filter((id) => !daGan.includes(id));
    if (moi.length === 0) return [];
    const da = (
      await c.query<{ file_id: string }>(
        `SELECT file_id FROM pol.binh_luan_tep WHERE file_id = ANY($1::uuid[])`,
        [moi],
      )
    ).rows;
    if (da.length > 0) throw this.tepSai();
    const tt = await this.clients.thongTinTep(moi);
    const theoId = new Map(tt.map((t) => [t.id, t]));
    return moi.map((id) => {
      const t = theoId.get(id);
      if (
        !t ||
        t.daHuy ||
        t.purpose !== 'BINH_LUAN' ||
        t.ownerKind !== 'POLICY' ||
        t.ownerId !== p.id ||
        t.uploadedBy !== me.id
      ) {
        throw this.tepSai();
      }
      return t;
    });
  }

  private tepSai() {
    return new BadRequestException({
      code: 'TEP_KHONG_HOP_LE',
      message: 'Có tệp không gắn được vào bình luận này. Tải tệp lên lại rồi gửi.',
    });
  }

  private async ganTep(c: PoolClient, binhLuanId: string, tep: Awaited<ReturnType<BinhLuanService['kiemTep']>>) {
    for (const t of tep) {
      await c.query(
        `INSERT INTO pol.binh_luan_tep (binh_luan_id, file_id, ten, loai, co) VALUES ($1, $2, $3, $4, $5)`,
        [binhLuanId, t.id, t.fileName, t.contentType, t.sizeBytes],
      );
    }
  }

  // --- Dựng mục trả về -----------------------------------------------------

  /**
   * Dựng một lô dòng thành mục trả về, tra tên MỘT lần cho cả lô.
   *
   * Tên hỏng thì hiện *"Người dùng"* chứ không ném: đọc bình luận không được chết
   * vì identity chậm một nhịp — cùng lựa chọn của `userNames` cho màn hình nhật ký.
   */
  private async dung(
    rows: Dong[],
    me: AuthUser,
    soPhanHoi: Map<string, number> = new Map(),
  ): Promise<{ muc: Map<string, MucBinhLuan>; ten: Record<string, string> }> {
    const ids = rows.map((r) => r.id);
    const cx = ids.length
      ? await this.db.q<{ binh_luan_id: string; user_id: string; loai: MaCamXuc }>(
          `SELECT binh_luan_id, user_id, loai FROM pol.binh_luan_cam_xuc
            WHERE binh_luan_id = ANY($1::uuid[]) ORDER BY tao_luc`,
          [ids],
        )
      : [];
    const tep = ids.length
      ? await this.db.q<{ binh_luan_id: string; file_id: string; ten: string; loai: string; co: string }>(
          `SELECT binh_luan_id, file_id, ten, loai, co FROM pol.binh_luan_tep
            WHERE binh_luan_id = ANY($1::uuid[]) AND go_luc IS NULL ORDER BY stt`,
          [ids],
        )
      : [];
    const nhac = rows.flatMap((r) => (r.xoa_luc ? [] : nguoiDuocNhac(r.noi_dung)));
    const nguoi = [...new Set([...rows.map((r) => r.tac_gia_id), ...nhac, ...cx.map((x) => x.user_id)])];
    let tk: Record<string, { role: string; fullName: string }> = {};
    try {
      tk = await this.clients.checkUsers(nguoi);
    } catch {
      tk = {};
    }
    const tenCua = (id: string) => tk[id]?.fullName ?? 'Người dùng';

    const muc = new Map<string, MucBinhLuan>();
    for (const r of rows) {
      const cua = cx.filter((x) => x.binh_luan_id === r.id);
      const camXuc: CamXucBay[] = MA_CAM_XUC.flatMap((loai) => {
        const ai = cua.filter((x) => x.loai === loai);
        return ai.length && !r.xoa_luc
          ? [{ loai, so: ai.length, cuaToi: ai.some((x) => x.user_id === me.id), nguoi: ai.map((x) => tenCua(x.user_id)) }]
          : [];
      });
      muc.set(r.id, {
        id: r.id,
        parentId: r.parent_id,
        stt: Number(r.stt),
        tacGia: { id: r.tac_gia_id, ten: tenCua(r.tac_gia_id), vaiTro: tk[r.tac_gia_id]?.role ?? null },
        cuaToi: r.tac_gia_id === me.id,
        noiDung: r.xoa_luc ? null : r.noi_dung,
        daXoa: r.xoa_luc !== null,
        taoLuc: iso(r.tao_luc)!,
        suaLuc: iso(r.sua_luc),
        camXuc,
        tep: r.xoa_luc
          ? []
          : tep
              .filter((t) => t.binh_luan_id === r.id)
              .map((t) => ({ id: t.file_id, ten: t.ten, loai: t.loai, co: Number(t.co) })),
        ...(r.parent_id === null ? { soPhanHoi: soPhanHoi.get(r.id) ?? 0 } : {}),
      });
    }
    return { muc, ten: Object.fromEntries(nhac.map((id) => [id, tenCua(id)])) };
  }

  private async soPhanHoi(rootIds: string[]): Promise<Map<string, number>> {
    if (rootIds.length === 0) return new Map();
    const r = await this.db.q<{ parent_id: string; n: string }>(
      `SELECT parent_id, count(*)::text AS n FROM pol.binh_luan
        WHERE parent_id = ANY($1::uuid[]) GROUP BY parent_id`,
      [rootIds],
    );
    return new Map(r.map((x) => [x.parent_id, Number(x.n)]));
  }

  private async moc(policyId: string): Promise<number> {
    const r = await this.db.one<{ m: string }>(
      `SELECT coalesce(max(stt_doi), 0)::text AS m FROM pol.binh_luan WHERE policy_id = $1`,
      [policyId],
    );
    return Number(r?.m ?? 0);
  }

  // --- Đọc -----------------------------------------------------------------

  /**
   * Một trang bình luận gốc, MỚI NHẤT trước khi cắt nhưng trả theo thứ tự tăng
   * (cũ ở trên, mới ở dưới — yêu cầu 3.5), kèm ba reply mới nhất của mỗi gốc.
   *
   * MỐC LẤY TRƯỚC DANH SÁCH. Lấy sau thì một bình luận commit giữa hai câu sẽ nằm
   * dưới mốc mà không có trong danh sách — đường hỏi thay đổi bỏ qua nó mãi mãi.
   * Lấy trước thì tệ nhất nó có mặt ở cả hai chỗ, và giao diện khử trùng theo id.
   */
  async trang(policyId: string, truoc: number | undefined, me: AuthUser): Promise<TrangBinhLuan> {
    const p = await this.moHoSo(policyId, me);
    const moc = await this.moc(p.id);
    const n = GIOI_HAN_BINH_LUAN.trangGoc;
    const goc = await this.db.q<Dong>(
      `SELECT ${COT} FROM pol.binh_luan
        WHERE policy_id = $1 AND parent_id IS NULL AND ($2::bigint IS NULL OR stt < $2)
        ORDER BY stt DESC LIMIT $3`,
      [p.id, truoc ?? null, n + 1],
    );
    const conCu = goc.length > n;
    const lay = goc.slice(0, n).reverse();
    const ph = lay.length
      ? await this.db.q<Dong>(
          `SELECT ${COT} FROM (
             SELECT b.*, row_number() OVER (PARTITION BY parent_id ORDER BY stt DESC) AS hang
               FROM pol.binh_luan b WHERE parent_id = ANY($1::uuid[])
           ) x WHERE hang <= $2 ORDER BY stt`,
          [lay.map((g) => g.id), GIOI_HAN_BINH_LUAN.phanHoiXemTruoc],
        )
      : [];
    const so = await this.soPhanHoi(lay.map((g) => g.id));
    const { muc, ten } = await this.dung([...lay, ...ph], me, so);
    return {
      binhLuan: lay.map((g) => ({
        ...muc.get(g.id)!,
        phanHoi: ph.filter((x) => x.parent_id === g.id).map((x) => muc.get(x.id)!),
      })),
      conCu,
      ten,
      moc,
    };
  }

  /** Reply cũ hơn một mốc, từng đợt 20 (chốt khi duyệt mockup). */
  async phanHoi(policyId: string, gocId: string, truoc: number | undefined, me: AuthUser) {
    const p = await this.moHoSo(policyId, me);
    const g = await this.db.one<{ id: string }>(
      `SELECT id FROM pol.binh_luan WHERE id = $1 AND policy_id = $2 AND parent_id IS NULL`,
      [gocId, p.id],
    );
    if (!g) throw new NotFoundException({ code: 'BINH_LUAN_KHONG_TIM_THAY' });
    const n = GIOI_HAN_BINH_LUAN.trangPhanHoi;
    const rows = await this.db.q<Dong>(
      `SELECT ${COT} FROM pol.binh_luan
        WHERE parent_id = $1 AND ($2::bigint IS NULL OR stt < $2)
        ORDER BY stt DESC LIMIT $3`,
      [g.id, truoc ?? null, n + 1],
    );
    const lay = rows.slice(0, n).reverse();
    const { muc, ten } = await this.dung(lay, me);
    return { phanHoi: lay.map((r) => muc.get(r.id)!), conCu: rows.length > n, ten };
  }

  /**
   * Mọi bình luận và reply ĐỔI sau mốc `tu` — tạo, sửa, xoá, đổi cảm xúc, có
   * reply mới (yêu cầu 5).
   *
   * Mốc mới = mốc lớn nhất TRONG LÔ TRẢ VỀ, không phải `max` của bảng: lô bị cắt
   * ở 200 thì phần còn lại vẫn nằm trên mốc, và `conNua` bảo giao diện hỏi tiếp
   * ngay.
   */
  async thayDoi(policyId: string, tu: number, me: AuthUser) {
    const p = await this.moHoSo(policyId, me);
    const TRAN = 200;
    const rows = await this.db.q<Dong>(
      `SELECT ${COT} FROM pol.binh_luan WHERE policy_id = $1 AND stt_doi > $2
        ORDER BY stt_doi LIMIT $3`,
      [p.id, tu, TRAN + 1],
    );
    const lay = rows.slice(0, TRAN);
    const so = await this.soPhanHoi(lay.filter((r) => r.parent_id === null).map((r) => r.id));
    const { muc, ten } = await this.dung(lay, me, so);
    return {
      thayDoi: lay.map((r) => muc.get(r.id)!),
      ten,
      moc: lay.length ? Number(lay[lay.length - 1]!.stt_doi) : tu,
      conNua: rows.length > TRAN,
    };
  }

  /** Một mục, dựng lại sau khi ghi — để giao diện thay đúng dòng vừa đổi. */
  private async mot(id: string, me: AuthUser) {
    const r = await this.db.one<Dong>(`SELECT ${COT} FROM pol.binh_luan WHERE id = $1`, [id]);
    if (!r) throw new NotFoundException({ code: 'BINH_LUAN_KHONG_TIM_THAY' });
    const so = r.parent_id === null ? await this.soPhanHoi([r.id]) : undefined;
    const { muc, ten } = await this.dung([r], me, so);
    return { binhLuan: muc.get(r.id)!, ten };
  }

  // --- Ghi -----------------------------------------------------------------

  /**
   * Lấy một dòng để GHI, trong transaction đã khoá. Thứ tự lỗi là thứ tự người
   * dùng đọc được: không có → đã xoá → không phải của bạn.
   */
  private async layDeGhi(c: PoolClient, p: HoSo, id: string, me: AuthUser, canTacGia: boolean) {
    const r = (
      await c.query<Dong>(
        `SELECT ${COT} FROM pol.binh_luan WHERE id = $1 AND policy_id = $2 FOR UPDATE`,
        [id, p.id],
      )
    ).rows[0];
    if (!r) throw new NotFoundException({ code: 'BINH_LUAN_KHONG_TIM_THAY' });
    if (r.xoa_luc) {
      throw new ConflictException({ code: 'BINH_LUAN_DA_XOA', message: 'Bình luận này đã bị xoá.' });
    }
    if (canTacGia && r.tac_gia_id !== me.id) {
      throw new ForbiddenException({
        code: 'KHONG_PHAI_TAC_GIA',
        message: 'Chỉ người viết bình luận mới sửa hoặc xoá được.',
      });
    }
    return r;
  }

  /**
   * Tên khách cho dòng thông báo *"mã hồ sơ · tên khách"* (`0262`). Ảnh chụp lúc
   * gửi duyệt nếu có (`0101`), không thì hỏi `customer`. Hỏng thì `null` — dòng
   * thông báo thiếu tên khách vẫn đọc được, còn ném thì bình luận không gửi được.
   */
  private async tenKhach(p: HoSo): Promise<string | null> {
    if (p.kh_ten_snap) return p.kh_ten_snap;
    try {
      return (await this.clients.customer(p.customer_id)).name;
    } catch {
      return null;
    }
  }

  private suKien(p: HoSo, me: AuthUser, action: string, extra: Record<string, unknown>) {
    return {
      entity: 'binh_luan',
      action,
      policyId: p.id,
      policyCode: p.code,
      customerId: p.customer_id,
      targetLabel: p.code,
      actorId: me.id,
      actorRole: me.role,
      at: new Date().toISOString(),
      ...extra,
    };
  }

  async tao(
    policyId: string,
    input: { maGui: string; noiDung: string; parentId?: string | undefined; tep?: string[] | undefined },
    me: AuthUser,
  ) {
    const p = await this.moHoSo(policyId, me);
    const noiDung = chuanNoiDung(input.noiDung);
    const tepIds = input.tep ?? [];
    this.kiem(noiDung, tepIds.length > 0);
    const nhac = await this.kiemNhac(p, me, noiDung);
    const customerName = await this.tenKhach(p);

    const id = await this.db.tx(async (c) => {
      await this.khoa(c, p.id);

      // Gửi lại cùng mã (mất phản hồi, bấm Thử lại): trả đúng bình luận đã có.
      const cu = (
        await c.query<{ id: string; policy_id: string; tac_gia_id: string }>(
          `SELECT id, policy_id, tac_gia_id FROM pol.binh_luan WHERE ma_gui = $1`,
          [input.maGui],
        )
      ).rows[0];
      if (cu) {
        if (cu.policy_id !== p.id || cu.tac_gia_id !== me.id) {
          throw new ConflictException({ code: 'BINH_LUAN_TRUNG_MA' });
        }
        return cu.id;
      }

      let cha: Dong | undefined;
      if (input.parentId) {
        cha = (
          await c.query<Dong>(
            `SELECT ${COT} FROM pol.binh_luan WHERE id = $1 AND policy_id = $2 FOR UPDATE`,
            [input.parentId, p.id],
          )
        ).rows[0];
        if (!cha) throw new NotFoundException({ code: 'BINH_LUAN_KHONG_TIM_THAY' });
        if (cha.parent_id !== null) {
          throw new BadRequestException({
            code: 'PHAN_HOI_LONG_NHAU',
            message: 'Chỉ trả lời được bình luận gốc, không trả lời được một phản hồi.',
          });
        }
        if (cha.xoa_luc) {
          throw new ConflictException({
            code: 'BINH_LUAN_GOC_DA_XOA',
            message: 'Bình luận bạn đang trả lời đã bị xoá.',
          });
        }
      }

      const r = (
        await c.query<{ id: string }>(
          `INSERT INTO pol.binh_luan (policy_id, parent_id, tac_gia_id, noi_dung, ma_gui)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [p.id, cha?.id ?? null, me.id, noiDung, input.maGui],
        )
      ).rows[0]!;
      await this.ganTep(c, r.id, await this.kiemTep(c, p, me, tepIds));
      // Gốc đổi số reply → chạm gốc để nó lên đường hỏi thay đổi với con số mới.
      if (cha) await c.query(`UPDATE pol.binh_luan SET id = id WHERE id = $1`, [cha.id]);

      await emit(
        c,
        'binh_luan.tao',
        this.suKien(p, me, 'BINH_LUAN_TAO', {
          id: r.id,
          binhLuanId: r.id,
          parentId: cha?.id ?? null,
          tacGiaGocId: cha?.tac_gia_id ?? null,
          nguoiDuocNhac: nhac,
          customerName,
          // Cho `notification` dựng trích đoạn. Nhật ký KHÔNG lưu trường này —
          // `audit` chỉ ghi `before`/`after`/`reason`.
          noiDungBinhLuan: noiDung,
        }),
      );
      return r.id;
    });
    return this.mot(id, me);
  }

  /**
   * `tep` VẮNG MẶT = giữ nguyên tệp đang gắn; có mặt = danh sách tệp SAU khi sửa
   * (tệp cũ không còn trong danh sách thì gỡ — `go_luc`, lượt dọn xoá byte).
   */
  async sua(
    policyId: string,
    id: string,
    input: { noiDung: string; tep?: string[] | undefined },
    me: AuthUser,
  ) {
    const p = await this.moHoSo(policyId, me);
    const noiDung = chuanNoiDung(input.noiDung);
    const customerName = await this.tenKhach(p);

    await this.db.tx(async (c) => {
      await this.khoa(c, p.id);
      const r = await this.layDeGhi(c, p, id, me, true);
      const dangGan = (
        await c.query<{ file_id: string }>(
          `SELECT file_id FROM pol.binh_luan_tep WHERE binh_luan_id = $1 AND go_luc IS NULL`,
          [id],
        )
      ).rows.map((x) => x.file_id);
      const tepSau = input.tep ?? dangGan;
      this.kiem(noiDung, tepSau.length > 0);
      const moi = await this.kiemTep(c, p, me, tepSau, dangGan);
      const go = dangGan.filter((f) => !tepSau.includes(f));
      // Không đổi chữ nào, không đổi tệp nào thì không phải một lượt sửa: không nhãn *Đã sửa*, không sự kiện.
      if (r.noi_dung === noiDung && moi.length === 0 && go.length === 0) return;
      const nhac = await this.kiemNhac(p, me, noiDung, nguoiDuocNhac(r.noi_dung));
      if (go.length > 0) {
        await c.query(
          `UPDATE pol.binh_luan_tep SET go_luc = now() WHERE binh_luan_id = $1 AND file_id = ANY($2::uuid[])`,
          [id, go],
        );
      }
      await this.ganTep(c, id, moi);
      await c.query(`UPDATE pol.binh_luan SET noi_dung = $2, sua_luc = now() WHERE id = $1`, [
        id,
        noiDung,
      ]);
      await emit(
        c,
        'binh_luan.sua',
        this.suKien(p, me, 'BINH_LUAN_SUA', {
          id,
          binhLuanId: id,
          parentId: r.parent_id,
          // Chỉ người MỚI được nhắc nhận thông báo (yêu cầu 3.3).
          nguoiDuocNhac: nhac,
          customerName,
          noiDungBinhLuan: noiDung,
        }),
      );
    });
    return this.mot(id, me);
  }

  async xoa(policyId: string, id: string, me: AuthUser) {
    const p = await this.moHoSo(policyId, me);
    await this.db.tx(async (c) => {
      await this.khoa(c, p.id);
      const r = await this.layDeGhi(c, p, id, me, true);
      await c.query(`UPDATE pol.binh_luan SET xoa_luc = now() WHERE id = $1`, [id]);
      await emit(
        c,
        'binh_luan.xoa',
        this.suKien(p, me, 'BINH_LUAN_XOA', { id, binhLuanId: id, parentId: r.parent_id }),
      );
    });
    return this.mot(id, me);
  }

  /** Thả (`bat = true`) hoặc gỡ một cảm xúc. Lặp lại thì không đổi gì — PUT/DELETE đúng nghĩa. */
  async camXuc(policyId: string, id: string, loai: MaCamXuc, bat: boolean, me: AuthUser) {
    const p = await this.moHoSo(policyId, me);
    await this.db.tx(async (c) => {
      await this.khoa(c, p.id);
      await this.layDeGhi(c, p, id, me, false);
      const r = bat
        ? await c.query(
            `INSERT INTO pol.binh_luan_cam_xuc (binh_luan_id, user_id, loai) VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [id, me.id, loai],
          )
        : await c.query(
            `DELETE FROM pol.binh_luan_cam_xuc WHERE binh_luan_id = $1 AND user_id = $2 AND loai = $3`,
            [id, me.id, loai],
          );
      // Chỉ chạm khi thật sự đổi: chạm vô cớ là đẩy một "thay đổi" rỗng tới mọi người đang xem.
      if ((r.rowCount ?? 0) > 0) await c.query(`UPDATE pol.binh_luan SET id = id WHERE id = $1`, [id]);
    });
    return this.mot(id, me);
  }

  // --- Cho `document` (`0263`) ----------------------------------------------

  /**
   * Người này đọc được tệp bình luận ấy không. Hai vế, cả hai đều cần:
   *
   *   1. trong phạm vi HỒ SƠ — đúng `coTrongPhamVi`, có luật `da_qua_tbp`;
   *   2. tệp đang gắn một bình luận CHƯA XOÁ của chính hồ sơ ấy, hoặc tệp chưa gắn
   *      ở đâu mà chính người hỏi đã tải lên (ô soạn xem lại tệp vừa đính).
   *
   * Tệp đã gỡ khi sửa, tệp của bình luận đã xoá: KHÔNG ai đọc được — nội dung bình
   * luận đã xoá không rời máy chủ (yêu cầu 3.4), và tệp là một phần nội dung.
   */
  async tepXemDuoc(a: { fileId: string; policyId: string; nguoiTai: string; userId: string; role: string }) {
    const me: AuthUser = { id: a.userId, role: a.role as AuthUser['role'], mustChangePassword: false };
    const [trong] = await this.policies.trongPhamVi(me, [a.policyId]);
    if (trong !== a.policyId) return false;
    const r = await this.db.one<{ go_luc: Date | null; xoa_luc: Date | null; policy_id: string }>(
      `SELECT t.go_luc, b.xoa_luc, b.policy_id
         FROM pol.binh_luan_tep t JOIN pol.binh_luan b ON b.id = t.binh_luan_id
        WHERE t.file_id = $1`,
      [a.fileId],
    );
    if (!r) return a.nguoiTai === a.userId;
    return r.policy_id === a.policyId && r.go_luc === null && r.xoa_luc === null;
  }

  /**
   * Tệp nào trong lô phải dọn (yêu cầu 7). Đi: tệp đã gỡ · tệp của bình luận đã xoá
   * · tệp chưa gắn quá 24 giờ — gồm cả tệp của hồ sơ Nháp đã xoá hẳn (`0035`), vì
   * khi ấy dòng gắn mất theo `ON DELETE CASCADE` và tệp trở thành *chưa gắn*.
   *
   * 24 giờ đếm từ lúc TẢI LÊN: người soạn để tệp trong ô qua đêm rồi mới gửi thì
   * lượt gửi nhận `TEP_KHONG_HOP_LE` và phải tải lại — cái giá đã nêu ở yêu cầu 7.
   */
  async phanLoaiTep(tep: { id: string; taoLuc: string }[], bayGio = Date.now()): Promise<string[]> {
    if (tep.length === 0) return [];
    const rows = await this.db.q<{ file_id: string; go_luc: Date | null; xoa_luc: Date | null }>(
      `SELECT t.file_id, t.go_luc, b.xoa_luc
         FROM pol.binh_luan_tep t JOIN pol.binh_luan b ON b.id = t.binh_luan_id
        WHERE t.file_id = ANY($1::uuid[])`,
      [tep.map((t) => t.id)],
    );
    const gan = new Map(rows.map((r) => [r.file_id, r]));
    const HAN = 24 * 3600 * 1000;
    return tep
      .filter((t) => {
        const r = gan.get(t.id);
        if (r) return r.go_luc !== null || r.xoa_luc !== null;
        const tao = Date.parse(t.taoLuc);
        return Number.isFinite(tao) && bayGio - tao > HAN;
      })
      .map((t) => t.id);
  }
}
