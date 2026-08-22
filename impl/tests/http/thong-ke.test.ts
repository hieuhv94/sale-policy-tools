/**
 * `0093` — trang *Thống kê*: hoạt động theo tuần · tháng · quý · năm.
 *
 * DỰNG DÒNG READ-MODEL THẲNG BẰNG SQL, không đi qua luồng duyệt.
 *
 * Khác hẳn `reporting.test.ts`, và khác vì một lý do: thứ phải kiểm ở đây là
 * **phép cắt kỳ và phép neo mốc**, mà cả hai chỉ lộ ra ở những mốc thời gian cụ
 * thể — nửa đêm giờ Việt Nam, một hồ sơ gửi duyệt kỳ trước mà có hiệu lực kỳ
 * này. Hồ sơ đi qua mười bước API thì mọi mốc của nó đều là `now()`, nên không
 * ca kiểm nào dựng được những tình huống ấy.
 *
 * Phần "sync có chép đúng ba mốc mới không" nằm ở `reporting.test.ts`, nơi đã có
 * sẵn cả chuỗi outbox thật — xem ca `0093` ở đó.
 *
 * MỌI MỐC TÍNH LÙI TỪ HIỆN TẠI, không viết ngày cố định. Một ca kiểm neo vào
 * `2026-03-02` sẽ xanh cho tới ngày nó trôi ra khỏi cửa sổ 24 kỳ rồi đỏ mà không
 * ai đụng vào mã nguồn — kiểu đỏ tốn nhiều thời gian nhất để hiểu.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp as createReportingApp, maSql } from '@csbh/reporting/testing';
import {
  accessTokenFor,
  bootIdentityListening,
  clearAccountCache,
  clearScopeCache,
  http,
  maDuyNhat,
  withAdminDb,
} from './app.js';

const SEED_PW = 'Test@1234';
const P = 'ZZTK';
const PHUT = 60_000;
const GIO = 60 * PHUT;
const NGAY = 24 * GIO;

let identity: INestApplication;
let reporting: INestApplication;
const restores: (() => void)[] = [];
const tok: Record<string, string> = {};
const uid: Record<string, string> = {};

const rget = async (path: string, who = 'tdv01') =>
  (await http(reporting)).get(path).set('Authorization', `Bearer ${tok[who]}`);

type MotKy = { ma: string; tu: string; den: string; dangChay: boolean };

/**
 * Ranh giới kỳ do CHÍNH MÁY CHỦ nói ra, dùng làm gốc toạ độ cho mọi ca kiểm.
 *
 * Không phải phép kiểm vòng tròn: ca kiểm ranh giới bên dưới đặt hồ sơ ở HAI
 * BÊN một mốc rồi đòi chúng rơi vào hai kỳ khác nhau. Cắt theo UTC thay vì giờ
 * Việt Nam làm lệch cả hai bên đúng bảy tiếng, nên hồ sơ nằm trong khoảng bảy
 * tiếng ấy đổi kỳ — và đó chính là thứ ca kiểm bắt. Phép cắt tự nó đã được kiểm
 * bằng bảng số ở `packages/http-kit/src/ky.test.ts`.
 */
const moc: Record<string, MotKy[]> = {};
const ky = (nhip: string, lui: number): MotKy => {
  const ds = moc[nhip]!;
  return ds[ds.length - 1 - lui]!;
};
/** Một mốc cách đầu kỳ `lui` đúng `lech` mili-giây. */
const tai = (nhip: string, lui: number, lech: number): string =>
  new Date(new Date(ky(nhip, lui).tu).getTime() + lech).toISOString();

type HoSoOpts = {
  created?: string;
  submitted?: string;
  tbpKy?: string;
  ktL1?: string;
  banGiao?: string;
  hopDong?: string;
  approved?: string;
  traLai?: string;
  tuChoi?: string;
  quaHan?: string;
  /** Ai nhìn thấy hồ sơ này. Mặc định `tdv01`. */
  tdv?: string;
  status?: string;
  source?: string;
  tongTien?: number;
  /** Dòng sản phẩm: `[tỷ lệ chiết khấu, có vượt ngưỡng không]`. */
  dong?: [number, boolean][];
  nhom?: string;
};

/**
 * Chèn một dòng read-model với ĐÚNG những mốc mình muốn.
 *
 * `customer_id` sinh ngẫu nhiên và không trỏ tới khách hàng thật — read-model
 * không có khoá ngoại sang `cus`, và không truy vấn nào của trang Thống kê đi
 * qua bảng khách hàng.
 */
async function hoSo(o: HoSoOpts = {}): Promise<void> {
  await withAdminDb(async (c) => {
    const r = await c.query<{ policy_id: string }>(
      `INSERT INTO rpt.policy_row (
         policy_id, code, version_no, status, source,
         created_at, submitted_at, tbp_signed_at, kt_l1_received_at, sa_handover_at,
         contract_issued_at, approved_at, returned_at, rejected_at, sla_due_at,
         customer_id, customer_code, customer_name, tdv_user_id, total_net, line_count)
       VALUES (gen_random_uuid(), $1, 1, $2, $3,
               $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
               gen_random_uuid(), $14, 'Khách kiểm thử', $15, $16, $17)
       RETURNING policy_id`,
      [
        maDuyNhat(P, 'HS'),
        o.status ?? 'DANG_CO_HIEU_LUC',
        o.source ?? 'NORMAL',
        o.created ?? o.submitted ?? o.approved ?? tai('thang', 11, GIO),
        o.submitted ?? null,
        o.tbpKy ?? null,
        o.ktL1 ?? null,
        o.banGiao ?? null,
        o.hopDong ?? null,
        o.approved ?? null,
        o.traLai ?? null,
        o.tuChoi ?? null,
        o.quaHan ?? null,
        maDuyNhat(P, 'KH'),
        uid[o.tdv ?? 'tdv01'],
        String(o.tongTien ?? 0),
        (o.dong ?? []).length,
      ],
    );
    const pid = r.rows[0]!.policy_id;
    let seq = 0;
    for (const [ck, vuot] of o.dong ?? []) {
      await c.query(
        `INSERT INTO rpt.policy_line
           (policy_id, seq, product_code, product_name, group_code, net_price,
            discount_rate, threshold, over_threshold)
         VALUES ($1, $2, $3, 'Sản phẩm kiểm thử', $4, 90000, $5, 10, $6)`,
        [pid, ++seq, maDuyNhat(P, 'SP'), o.nhom ?? null, String(ck), vuot],
      );
    }
  });
}

/**
 * Xoá SẠCH read-model trước mỗi ca.
 *
 * Không chỉ xoá dòng của chính tệp này: mọi phép đếm ở đây là đếm trên phạm vi
 * của `tdv01`, và các tệp kiểm khác cũng lập hồ sơ dưới tên người ấy. Đây là
 * bảng chiếu, dựng lại được từ nguồn bằng `SyncService` — `reporting.test.ts`
 * cũng dọn đúng cách này.
 */
const donKho = () => withAdminDb(async (c) => void (await c.query(`DELETE FROM rpt.policy_row`)));

beforeAll(async () => {
  const i = await bootIdentityListening();
  identity = i.app;
  restores.push(i.restore);
  await clearAccountCache();
  await clearScopeCache();
  for (const u of ['tdv01', 'tdv02', 'bld01', 'admin01']) {
    tok[u] = await accessTokenFor(identity, u, SEED_PW);
  }
  await withAdminDb(async (c) => {
    const r = await c.query<{ id: string; username: string }>(
      `SELECT id, username FROM idn.app_user WHERE username = ANY($1::text[])`,
      [['tdv01', 'tdv02']],
    );
    for (const u of r.rows) uid[u.username] = u.id;
  });
  reporting = await createReportingApp();
  await donKho();

  for (const nhip of ['tuan', 'thang', 'quy', 'nam']) {
    const r = await rget(`/reports/thong-ke?ky=${nhip}&soKy=${nhip === 'nam' ? 5 : 12}`);
    if (r.status !== 200) throw new Error(`không lấy được ranh giới kỳ: ${JSON.stringify(r.body)}`);
    moc[nhip] = r.body.chuoi as MotKy[];
  }
});

afterAll(async () => {
  await donKho();
  await reporting?.close();
  await identity?.close();
  for (const r of restores) r();
});

beforeEach(donKho);

type DongKy = { ma: string; dem: Record<string, number> } & Record<string, unknown>;

/** Lấy một kỳ theo mã. `undefined` nghĩa là kỳ ấy không có trong chuỗi trả về. */
const kyCo = (bo: { chuoi: DongKy[] }, ma: string): DongKy | undefined =>
  bo.chuoi.find((k) => k.ma === ma);

describe('`0093` cắt kỳ theo giờ Việt Nam', () => {
  it('nửa giờ hai bên nửa đêm rơi vào HAI kỳ khác nhau', async () => {
    /*
     * Nửa đêm giờ Việt Nam là 17:00 hôm trước theo UTC. Cắt bằng UTC thì hồ sơ
     * lúc 00:30 ngày mùng một (giờ ta) bị đẩy về kỳ TRƯỚC, vì theo UTC nó vẫn
     * đang là 17:30 ngày cuối kỳ. Đó là bảy tiếng mà con số cuối tháng lệch đi
     * mà không ai giải thích được.
     */
    await hoSo({ approved: tai('thang', 1, 30 * PHUT) });
    await hoSo({ approved: tai('thang', 1, -30 * PHUT) });

    const r = await rget('/reports/thong-ke?ky=thang&soKy=12');
    expect(kyCo(r.body, ky('thang', 1).ma)?.dem.coHieuLuc).toBe(1);
    expect(kyCo(r.body, ky('thang', 2).ma)?.dem.coHieuLuc).toBe(1);
  });

  it('nhịp quý gom cả ba tháng vào một ô', async () => {
    await hoSo({ approved: tai('quy', 1, 30 * PHUT) });
    await hoSo({ approved: tai('quy', 1, 60 * NGAY) });
    await hoSo({ approved: tai('quy', 1, -30 * PHUT) });

    const r = await rget('/reports/thong-ke?ky=quy&soKy=12');
    expect(kyCo(r.body, ky('quy', 1).ma)?.dem.coHieuLuc).toBe(2);
    expect(kyCo(r.body, ky('quy', 2).ma)?.dem.coHieuLuc).toBe(1);
  });

  it('phép cắt KHÔNG phụ thuộc cấu hình múi giờ của máy chủ', async () => {
    /*
     * ĐỐI CHIẾU, và ca kiểm này sinh ra sau một lần phá lại KHÔNG đỏ.
     *
     * Bỏ `AT TIME ZONE` khỏi truy vấn mà cả 17 ca ở đây vẫn xanh: `postgresql.conf`
     * đặt sẵn `timezone = 'Asia/Ho_Chi_Minh'`, nên `date_trunc` trên timestamptz
     * vốn đã cắt theo giờ ta. Nghĩa là phép cắt kỳ đang được một dòng cấu hình ở
     * tệp khác bảo lãnh — và một máy chủ dựng lại bằng ảnh Postgres mặc định
     * (UTC) sẽ lệch bảy tiếng ở MỌI ranh giới kỳ mà không gì nói ra.
     *
     * Ca này đặt phiên về UTC rồi gọi CHÍNH hàm dựng khoá kỳ của service, nên nó
     * đỏ ngay khi ai đó gỡ phép đổi múi giờ.
     */
    await withAdminDb(async (c) => {
      await c.query(`SET TIME ZONE 'UTC'`);
      const r = await c.query<{ ma: string }>(
        `SELECT ${maSql('thang', "timestamptz '2026-08-01 00:30:00+07'")} AS ma`,
      );
      expect(r.rows[0]!.ma).toBe('2026-08-01');

      const t = await c.query<{ ma: string }>(
        `SELECT ${maSql('tuan', "timestamptz '2026-08-24 00:30:00+07'")} AS ma`,
      );
      expect(t.rows[0]!.ma).toBe('2026-08-24');
    });
  });

  it('nhãn tuần nói ra khoảng ngày, không chỉ có số tuần', async () => {
    const r = await rget('/reports/thong-ke?ky=tuan');
    expect(r.body.chuoi[0].nhan).toMatch(/^Tuần \d+ · \d\d\/\d\d–\d\d\/\d\d$/);
    expect(r.body.muiGio).toBe('Asia/Ho_Chi_Minh');
  });

  it('các kỳ khớp đầu đuôi — không khe hở, không chồng lấn', async () => {
    const r = await rget('/reports/thong-ke?ky=thang&soKy=12');
    const c = r.body.chuoi as MotKy[];
    for (let i = 1; i < c.length; i++) expect(c[i]!.tu).toBe(c[i - 1]!.den);
    expect(c[c.length - 1]!.dangChay).toBe(true);
    expect(c.slice(0, -1).every((k) => !k.dangChay)).toBe(true);
  });
});

describe('`0093` mỗi chỉ số neo vào đúng một mốc', () => {
  it('MỘT hồ sơ đếm vào những kỳ KHÁC NHAU tuỳ theo chỉ số', async () => {
    /*
     * Quy tắc quan trọng nhất của cả trang. "Tháng này có bao nhiêu CSBH" là
     * câu chưa đủ nghĩa: lập trong tháng, gửi duyệt trong tháng, hay có hiệu
     * lực trong tháng? Một hồ sơ thật đi qua ranh giới tháng phải xuất hiện ở
     * đúng hai kỳ khác nhau, mỗi kỳ ở những cột khác nhau.
     */
    await hoSo({
      created: tai('thang', 2, NGAY),
      submitted: tai('thang', 2, 2 * NGAY),
      tbpKy: tai('thang', 1, GIO),
      ktL1: tai('thang', 1, 2 * GIO),
      banGiao: tai('thang', 1, 3 * GIO),
      hopDong: tai('thang', 1, 4 * GIO),
      approved: tai('thang', 1, 5 * GIO),
    });

    const r = await rget('/reports/thong-ke?ky=thang&soKy=12');
    expect(kyCo(r.body, ky('thang', 2).ma)?.dem).toMatchObject({
      lapMoi: 1,
      guiDuyet: 1,
      coHieuLuc: 0,
      tbpKy: 0,
    });
    expect(kyCo(r.body, ky('thang', 1).ma)?.dem).toMatchObject({
      tbpKy: 1,
      ktNhanL1: 1,
      banGiao: 1,
      hopDong: 1,
      coHieuLuc: 1,
      lapMoi: 0,
      guiDuyet: 0,
    });
  });

  it('quá hạn đếm theo hạn 14 ngày, và CHỈ hồ sơ thật sự chết', async () => {
    // Không có mốc `overdue_at` riêng — hạn trôi qua chính là lúc hồ sơ chết.
    // Nhưng hồ sơ được xử lý kịp cũng có `sla_due_at` trong kỳ ấy, nên chỉ mốc
    // thôi thì đếm thừa: điều kiện trạng thái là vế thứ hai bắt buộc.
    await hoSo({ quaHan: tai('thang', 1, NGAY), status: 'QUA_HAN_DUYET' });
    await hoSo({ quaHan: tai('thang', 1, 2 * NGAY), status: 'DANG_CO_HIEU_LUC' });

    const r = await rget('/reports/thong-ke?ky=thang&soKy=12');
    expect(kyCo(r.body, ky('thang', 1).ma)?.dem.quaHan).toBe(1);
  });

  it('tỷ lệ trả lại lấy tử số và mẫu số CỦA CÙNG MỘT KỲ', async () => {
    const k = (l: number) => tai('thang', 1, l * NGAY);
    await hoSo({ submitted: k(1) });
    await hoSo({ submitted: k(2) });
    await hoSo({ submitted: k(3), traLai: k(4) });
    await hoSo({ submitted: k(3), tuChoi: k(5) });

    const r = await rget('/reports/thong-ke?ky=thang&soKy=12');
    const o = kyCo(r.body, ky('thang', 1).ma);
    expect(o?.dem).toMatchObject({ guiDuyet: 4, traLai: 1, tuChoi: 1 });
    expect(o?.tyLeTraLai).toBe(50);
  });
});

describe('`0093` tiền, chiết khấu và ngưỡng', () => {
  it('giá trị và chiết khấu neo vào ngày CÓ HIỆU LỰC, không phải ngày lập', async () => {
    await hoSo({
      created: tai('thang', 2, NGAY),
      submitted: tai('thang', 1, 5 * NGAY),
      approved: tai('thang', 1, 10 * NGAY),
      tongTien: 5_000_000,
      dong: [
        [10, false],
        [20, true],
      ],
    });

    const r = await rget('/reports/thong-ke?ky=thang&soKy=12');
    expect(kyCo(r.body, ky('thang', 2).ma)?.giaTri).toBe(0);
    const o = kyCo(r.body, ky('thang', 1).ma);
    expect(o?.giaTri).toBe(5_000_000);
    expect(o?.chietKhauTb).toBe(15);
    expect(o?.soDong).toBe(2);
    expect(o?.tyLeVuotNguong).toBe(50);
    // Từ gửi duyệt tới có hiệu lực đúng 5 ngày.
    expect(o?.soNgayDuyetTb).toBe(5);
  });

  it('tách theo NHÓM SẢN PHẨM cho khối của Ban lãnh đạo', async () => {
    await hoSo({ approved: tai('thang', 1, NGAY), dong: [[10, false]], nhom: 'SUA' });
    await hoSo({ approved: tai('thang', 1, 2 * NGAY), dong: [[30, true]], nhom: 'DINH_DUONG' });

    const r = await rget('/reports/thong-ke/nhom?ky=thang&soKy=12', 'bld01');
    expect(r.status).toBe(200);
    const ma = ky('thang', 1).ma;
    const sua = r.body.dong.find((d: { nhom: string }) => d.nhom === 'SUA');
    const dd = r.body.dong.find((d: { nhom: string }) => d.nhom === 'DINH_DUONG');
    expect(sua).toMatchObject({ maKy: ma, chietKhauTb: 10, vuotNguong: 0 });
    expect(dd).toMatchObject({ maKy: ma, chietKhauTb: 30, vuotNguong: 1 });
  });
});

describe('`0093` phạm vi dữ liệu và dữ liệu cũ', () => {
  it('TDV chỉ thấy hồ sơ của mình, Ban lãnh đạo thấy cả hai', async () => {
    await hoSo({ tdv: 'tdv01', approved: tai('thang', 1, NGAY) });
    await hoSo({ tdv: 'tdv02', approved: tai('thang', 1, 2 * NGAY) });
    const ma = ky('thang', 1).ma;

    const cua01 = await rget('/reports/thong-ke?ky=thang&soKy=12', 'tdv01');
    expect(kyCo(cua01.body, ma)?.dem.coHieuLuc).toBe(1);

    const cuaBld = await rget('/reports/thong-ke?ky=thang&soKy=12', 'bld01');
    expect(kyCo(cuaBld.body, ma)?.dem.coHieuLuc).toBe(2);
  });

  it('Quản trị hệ thống gọi được, nhưng phạm vi RỖNG', async () => {
    // Máy chủ không cấm — cấm thì màn hình của họ nhận 403 thay vì một bộ số 0.
    // Việc "đừng bày số hồ sơ cho vai trò này" là của bảng khối bên giao diện.
    await hoSo({ approved: tai('thang', 1, NGAY) });
    const r = await rget('/reports/thong-ke?ky=thang&soKy=12', 'admin01');
    expect(r.status).toBe(200);
    expect(kyCo(r.body, ky('thang', 1).ma)?.dem.coHieuLuc).toBe(0);
  });

  it('hồ sơ LEGACY bị loại khỏi mọi chỉ số, và được ĐẾM RA', async () => {
    /*
     * Dữ liệu CSBH cũ nhập từ Excel không đi qua luồng duyệt nào. Để lẫn vào
     * thì cột "có hiệu lực" nhảy vọt ở đúng kỳ nhập dữ liệu trong khi mọi cột
     * giữa luồng vẫn bằng 0 — một hình ảnh sai mà không gì giải thích.
     */
    await hoSo({ approved: tai('thang', 1, NGAY), source: 'LEGACY' });
    await hoSo({ approved: tai('thang', 1, 2 * NGAY) });

    const r = await rget('/reports/thong-ke?ky=thang&soKy=12');
    expect(kyCo(r.body, ky('thang', 1).ma)?.dem.coHieuLuc).toBe(1);
    expect(r.body.loaiTruLegacy).toBe(1);
  });
});

describe('`0093` kỳ đang chạy so cùng số ngày', () => {
  it('hồ sơ ở PHẦN CUỐI kỳ trước KHÔNG lọt vào phép so', async () => {
    /*
     * Hôm nay ngày 22 mà đặt tháng này cạnh cả tháng trước là so 22 ngày với 31
     * ngày: mọi chỉ số đều "giảm" mà không ai làm gì sai. Ca này dựng đúng cái
     * bẫy — một hồ sơ có hiệu lực ở phút cuối của kỳ trước, tức là sau mốc mà kỳ
     * này mới đi tới.
     */
    await hoSo({ approved: tai('thang', 0, -PHUT) });
    await hoSo({ approved: tai('thang', 1, PHUT) });

    const r = await rget('/reports/thong-ke?ky=thang&soKy=12');
    // Cả hai đều nằm trong kỳ trước theo lịch…
    expect(kyCo(r.body, ky('thang', 1).ma)?.dem.coHieuLuc).toBe(2);
    // …nhưng phép so chỉ tính tới mốc kỳ này đang đứng.
    expect(r.body.soSanh.kyTruoc.ma).toBe(ky('thang', 1).ma);
    expect(r.body.soSanh.kyTruoc.dem.coHieuLuc).toBe(1);
    expect(r.body.soSanh.kyTruoc.dangChay).toBe(false);
    expect(r.body.soSanh.kyNay.dangChay).toBe(true);
  });

  it('mốc cắt của kỳ trước lùi đúng một kỳ so với bây giờ', async () => {
    const r = await rget('/reports/thong-ke?ky=tuan');
    const cat = new Date(r.body.soSanh.denKyTruoc).getTime();
    const gio = Date.now();
    // Bảy ngày trước, sai số một phút cho thời gian chạy ca kiểm.
    expect(Math.abs(gio - 7 * NGAY - cat)).toBeLessThan(PHUT);
  });
});

describe('`0093` tham số', () => {
  it('nhịp lạ bị TỪ CHỐI, không âm thầm rơi về mặc định', async () => {
    const r = await rget('/reports/thong-ke?ky=ngay');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_FAILED');
    expect(r.body.field).toBe('ky');
  });

  it('số kỳ có trần và có sàn', async () => {
    expect((await rget('/reports/thong-ke?ky=thang&soKy=999')).status).toBe(400);
    expect((await rget('/reports/thong-ke?ky=thang&soKy=0')).status).toBe(400);
    expect((await rget('/reports/thong-ke?ky=thang&soKy=2,5')).status).toBe(400);
  });

  it('KHÔNG nhận bộ lọc — một tiêu chí lạ không đổi được kết quả', async () => {
    /*
     * Trang Thống kê trả lời "công việc trong kỳ đi thế nào", và câu ấy chỉ có
     * nghĩa trên toàn bộ phạm vi. Nhận thêm bộ lọc rồi vẫn gọi kết quả là "hoạt
     * động của quý 3" là mời người ta so hai con số của hai tập hồ sơ khác nhau
     * — mà trên màn hình thì chúng nằm cạnh nhau.
     */
    await hoSo({ approved: tai('thang', 1, NGAY) });
    const a = await rget('/reports/thong-ke?ky=thang&soKy=12');
    const b = await rget('/reports/thong-ke?ky=thang&soKy=12&status=TU_CHOI');
    const ma = ky('thang', 1).ma;
    expect(kyCo(b.body, ma)?.dem.coHieuLuc).toBe(kyCo(a.body, ma)?.dem.coHieuLuc);
    expect(kyCo(a.body, ma)?.dem.coHieuLuc).toBe(1);
  });
});
