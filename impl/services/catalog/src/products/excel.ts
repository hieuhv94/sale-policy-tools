/**
 * Đọc và dựng file Excel danh mục sản phẩm (CAT-15, CAT-16).
 *
 * Chỉ PHÂN TÍCH ở đây, không chạm CSDL và không quyết định gì về nghiệp vụ: mọi
 * dòng phải đọc xong và đúng KIỂU trước khi ai đó hỏi CSDL xem mã nhóm có thật
 * không. Việc đối chiếu với danh mục nằm ở `nhap.ts`.
 */
import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';

export type ImportRow = {
  rowNumber: number;
  code: string;
  name: string;
  groupCode: string;
  /** `null` = ô để trống = KHÔNG đụng tới giá (`0121`). */
  price: bigint | null;
  /** Cột 5 (`0122`). `true` = đang bán, `false` = ngừng bán. */
  conBan: boolean;
  /**
   * Ô cột 5 để TRỐNG.
   *
   * Không gộp vào `conBan` được: "chưa điền" và "điền Đang bán" phải dẫn tới hai
   * câu khác nhau, mà cả hai đều đọc ra `true` nếu chỉ có một trường boolean.
   * `nhap.ts` bắt cờ này ở bước ô-bắt-buộc.
   */
  thieuHieuLuc?: true;
};

/*
 * NĂM CỘT. Từ `0122` cả năm đều ghi được.
 *
 * `0025` bỏ ba cột `ck_loai_1..3` — ngưỡng chiết khấu mặc định theo loại khách —
 * vì khái niệm ấy chuyển hẳn sang bảng Chiết khấu quy định.
 *
 * `0121` thêm `gia_ban_cong_ty` và `dang_co_hieu_luc`, cột thứ năm CHỈ ĐỂ XEM.
 * `0122` mở nó ra theo yêu cầu của khách hàng: đó là đường ngừng bán hàng loạt,
 * và là đường duy nhất mang Ý ĐỊNH — khác hẳn việc bỏ một dòng khỏi file.
 *
 * Đổi lại, chốt "gõ lại mã vật tư" của màn hình không còn phủ đường này. Thứ
 * thay chỗ nó: bảng xem trước liệt kê ĐỦ những sản phẩm sắp ngừng bán, tách
 * riêng theo lý do, cộng một chuỗi xác nhận phải gõ tay cho cả lô.
 */
const HEADERS = [
  'ma_vat_tu',
  'ten_vat_tu',
  'nhom_sp',
  'gia_ban_cong_ty',
  'dang_co_hieu_luc',
] as const;

type Cot = (typeof HEADERS)[number];

/** Cột hiệu lực — ô chọn hai giá trị, không phải ô gõ tự do (`0122`). */
const COT_HIEU_LUC: Cot = 'dang_co_hieu_luc';

/**
 * Hai giá trị của cột hiệu lực, và chúng nói ra HẬU QUẢ.
 *
 * Không dùng "Có"/"Không" hay một dấu tích: người soạn file phải đoán xem tích
 * nghĩa là còn bán hay đã ngừng. Hai chữ này thì không đoán gì cả.
 */
const CON_BAN = 'Đang bán';
const NGUNG_BAN = 'Ngừng bán';

/**
 * Chú thích tiếng Việt của từng cột, hiện ở ghi chú ô tiêu đề trong file mẫu.
 *
 * `HEADERS` khai `as const` nên bảng này phải phủ ĐỦ mọi cột: thêm một cột mà
 * quên chú thích là lỗi biên dịch, không phải một ô lặng lẽ không có hướng dẫn.
 */
const NHAN_COT: Record<Cot, string> = {
  ma_vat_tu: 'Mã vật tư — bắt buộc. Đây là cột đối chiếu: mã đã có thì cập nhật, mã mới thì thêm.',
  ten_vat_tu: 'Tên sản phẩm — bắt buộc.',
  nhom_sp: 'MÃ nhóm sản phẩm — bắt buộc. Xem các mã đang có ở trang "Nhom san pham".',
  gia_ban_cong_ty:
    'Giá bán Công ty, số nguyên đồng. ĐỂ TRỐNG nghĩa là giữ nguyên giá hiện có. ' +
    'Ngày áp dụng luôn là ngày nhập, không khai ở đây.',
  dang_co_hieu_luc:
    `Chọn "${CON_BAN}" hoặc "${NGUNG_BAN}" — bấm vào ô để xổ danh sách. ` +
    'Đổi thành Ngừng bán là gỡ mặt hàng khỏi mọi hồ sơ lập mới. KHÔNG được để trống.',
};

/** Tên file mẫu lúc tải về. Thuần ASCII nên `Content-Disposition` không phải né gì. */
export const MAU_TEN_TEP = 'mau-danh-muc-san-pham.xlsx';

const NHAN_HIEU_LUC: Record<string, string> = {
  DANG_AP_DUNG: CON_BAN,
  DA_VO_HIEU_HOA: NGUNG_BAN,
};

export type DongMau = {
  code: string;
  name: string;
  groupCode: string;
  /** Giá hiện hành, `null` khi sản phẩm chưa từng đặt giá. */
  price: string | null;
  status: string;
};

/**
 * Dựng file Excel MẪU để Quản trị tải về (`0119`, `0120`, `0121`).
 *
 * Ba quyết định, và cả ba đều là để file tải về **nhập lại được ngay**:
 *
 * 1. **Tiêu đề dựng TỪ `HEADERS`**, chính mảng mà `parseProductSheet` kiểm. Viết
 *    cứng năm cái tên lần thứ hai ở đây là dựng ra đúng thứ hỏng mà file mẫu sinh
 *    ra để chống — người dùng tải một file "chuẩn" về, điền đúng, rồi nhận
 *    `BAD_HEADER` vì hai bên đã trôi khỏi nhau.
 *
 * 2. **Chứa TOÀN BỘ danh mục hiện tại** (`0120`), kèm giá hiện hành và trạng
 *    thái. Từ `0121` file này còn là **đầu vào bắt buộc**: lượt nhập chặn khi
 *    thiếu một mã đang có, nên cách dùng duy nhất là tải xuống · sửa · tải lên.
 *
 *    Chú thích từng cột nằm ở GHI CHÚ của ô tiêu đề chứ không phải một hàng
 *    riêng: Excel hiện nó khi rê chuột, còn bộ đọc không thấy gì. Một hàng chú
 *    thích thật thì `parseProductSheet` đọc nó thành một sản phẩm tên *"Tên sản
 *    phẩm — bắt buộc"*.
 *
 * 3. **Trang thứ hai liệt kê mã nhóm đang có.** Bộ đọc chỉ lấy `worksheets[0]`
 *    nên trang này không bao giờ đi vào dữ liệu. Nó ở đây vì lỗi hay gặp nhất
 *    của một lượt nhập là mã nhóm chưa tồn tại, và người dùng chỉ biết điều đó
 *    sau khi tải file lên rồi bị chặn cả lô.
 */
export async function dungFileMau(
  nhom: { code: string; name: string }[],
  sanPham: DongMau[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('San pham');

  ws.addRow([...HEADERS]);
  const dau = ws.getRow(1);
  dau.font = { bold: true };
  for (const [i, h] of HEADERS.entries()) {
    dau.getCell(i + 1).note = NHAN_COT[h];
    ws.getColumn(i + 1).width = h === 'ten_vat_tu' ? 40 : 24;
  }

  /*
   * Ghi theo ĐÚNG thứ tự của `HEADERS`, không viết thẳng năm tên trường.
   *
   * Cùng lý do với hàng tiêu đề: đảo thứ tự cột ở một chỗ mà quên chỗ kia thì
   * file tải về có tiêu đề đúng và dữ liệu lệch cột — hỏng theo kiểu tệ nhất, vì
   * nó vẫn nhập được và nạp tên sản phẩm vào ô mã nhóm.
   */
  const theoCot = (p: DongMau): (string | number | null)[] =>
    HEADERS.map((h): string | number | null => {
      switch (h) {
        case 'ma_vat_tu':
          return p.code;
        case 'ten_vat_tu':
          return p.name;
        case 'nhom_sp':
          return p.groupCode;
        case 'gia_ban_cong_ty':
          // SỐ chứ không phải chuỗi: người soạn file cần cộng và lọc được ngay
          // trong Excel, và một cột tiền dạng chữ thì không làm được gì cả.
          return p.price === null ? null : Number(p.price);
        case 'dang_co_hieu_luc':
          return NHAN_HIEU_LUC[p.status as keyof typeof NHAN_HIEU_LUC] ?? p.status;
      }
    });

  /*
   * Ô CHỌN Ở CỘT HIỆU LỰC (`0122`).
   *
   * Excel không có checkbox nằm TRONG một ô. Thứ mang tên ấy có ba dạng, và chỉ
   * dạng này dùng được:
   *
   *   - Ô chọn xổ xuống (`dataValidation` kiểu `list`) — dựng được, và đã đo là
   *     sống qua một vòng ghi/đọc kèm nguyên ràng buộc.
   *   - Checkbox Form/ActiveX — là một đối tượng NỔI trên trang, không thuộc ô
   *     nào, nên đọc lại không biết nó của dòng nào.
   *   - Checkbox của Excel 365 bản 2024 — ghi `TRUE`/`FALSE` vào ô. Không dựng
   *     được từ đây, nhưng bộ đọc vẫn nhận, nên ai tự chuyển sang nó không hỏng.
   *
   * `allowBlank: false` cộng `showErrorMessage` để Excel chặn ngay tại chỗ nhập.
   * Đó là lớp chặn duy nhất đứng TRƯỚC lúc tải lên; mọi lớp còn lại đều chỉ nói
   * được sau khi người dùng đã soạn xong cả file.
   */
  const cotHieuLuc = HEADERS.indexOf(COT_HIEU_LUC) + 1;
  for (const p of sanPham) {
    const r = ws.addRow(theoCot(p));
    r.getCell(cotHieuLuc).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: [`"${CON_BAN},${NGUNG_BAN}"`],
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Chỉ hai giá trị',
      error: `Chọn "${CON_BAN}" hoặc "${NGUNG_BAN}".`,
    };
  }

  // Giữ hàng tiêu đề luôn nhìn thấy khi cuộn — file danh mục thật dài vài trăm
  // dòng, và cuộn tới dòng 300 mà không thấy tên cột là chỗ điền nhầm cột.
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const wsN = wb.addWorksheet('Nhom san pham');
  wsN.addRow(['ma_nhom', 'ten_nhom']);
  wsN.getRow(1).font = { bold: true };
  wsN.getColumn(1).width = 20;
  wsN.getColumn(2).width = 40;
  for (const n of nhom) wsN.addRow([n.code, n.name]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Giá trị một ô, đưa về chuỗi.
 *
 * Trả `null` cho **ô lỗi công thức** (`#N/A`, `#REF!`) thay vì một chuỗi nào đó:
 * `String({ error: '#N/A' })` cho ra `"[object Object]"`, và tới `0120` chuỗi ấy
 * đi thẳng vào CSDL làm tên sản phẩm. Người gọi phân biệt được "ô trống" (chuỗi
 * rỗng) với "ô hỏng" (`null`) và báo hai câu khác nhau.
 */
const cellText = (v: ExcelJS.CellValue): string | null => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('error' in v) return null;
    if ('richText' in v) return v.richText.map((x) => x.text).join('').trim();
    if ('text' in v) return String(v.text).trim();
    if ('result' in v) {
      // Công thức có kết quả LÀ một lỗi — `{ formula, result: { error } }`.
      const kq = (v as { result?: unknown }).result;
      if (kq !== null && typeof kq === 'object' && 'error' in (kq as object)) return null;
      return String(kq ?? '').trim();
    }
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
};

/** Một ô không đọc được, kèm chỗ và lý do — gom lại rồi báo một lượt (`0121`). */
export type LoiKieu = {
  rowNumber: number;
  cot: Cot;
  lyDo: 'O_HONG' | 'KHONG_PHAI_SO' | 'KHONG_PHAI_HIEU_LUC';
};

/**
 * Đọc cột hiệu lực (`0122`).
 *
 * Nhận ba cách viết vì ba cách ấy đều xuất hiện thật: hai chữ của ô chọn, giá
 * trị boolean của checkbox Excel 365, và chuỗi `TRUE`/`FALSE` mà một bản Excel
 * cũ hiện ra khi mở file do bản mới ghi.
 *
 * `undefined` = không đọc được. Ô TRỐNG người gọi bắt riêng, vì nó là "chưa
 * điền" chứ không phải "điền sai" — và hai chuyện ấy dẫn tới hai câu khác nhau.
 */
function doHieuLuc(tho: string): boolean | undefined {
  const t = tho.trim().toLowerCase();
  if (t === CON_BAN.toLowerCase() || t === 'true' || t === '1') return true;
  if (t === NGUNG_BAN.toLowerCase() || t === 'false' || t === '0') return false;
  return undefined;
}

/**
 * Giá: chịu mọi cách gõ mà người ta thật sự gõ (`0121`).
 *
 * `12.500`, `12,500`, `12 500`, ô định dạng text, và cả `12500.00` mà Excel sinh
 * ra khi ô đã từng là số thực. Dấu chấm và dấu phẩy đều là dấu NGHÌN ở đây —
 * danh mục không có giá lẻ dưới một đồng, nên coi chúng là dấu thập phân là hiểu
 * `12.500` thành mười hai đồng rưỡi.
 *
 * Ngoại lệ duy nhất: đuôi `,00` hoặc `.00` bị CẮT. Đó là thứ Excel để lại khi ô
 * mang định dạng hai chữ số thập phân, và từ chối nó là từ chối một file trông
 * hoàn toàn bình thường trên màn hình người dùng.
 */
function doGia(tho: string): bigint | null {
  const t = tho.replace(/\s/g, '').replace(/[.,]00$/, '');
  if (t === '') return null;
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const so = t.replace(/[.,]/g, '');
  if (!/^\d+$/.test(so)) return null;
  return BigInt(so);
}

export type KetQuaDoc = { rows: ImportRow[]; loiKieu: LoiKieu[] };

/**
 * Đọc trang đầu của file.
 *
 * Ném ngay với hai lỗi thuộc về CẢ FILE — không có trang nào, sai tiêu đề — vì
 * chúng làm mọi dòng vô nghĩa. Lỗi thuộc về TỪNG Ô thì gom vào `loiKieu` và trả
 * về hết một lượt: người dùng sửa file Excel, và sửa mười ô trong một lượt mở
 * file khác hẳn mười lượt tải lên để biết thêm mỗi lần một ô.
 */
export async function parseProductSheet(buffer: Buffer): Promise<KetQuaDoc> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new BadRequestException({ code: 'EMPTY_SHEET' });

  const header = (ws.getRow(1).values as ExcelJS.CellValue[])
    .slice(1)
    .map((v) => (cellText(v) ?? '').toLowerCase());
  for (const [i, want] of HEADERS.entries()) {
    if (header[i] !== want) {
      throw new BadRequestException({
        code: 'BAD_HEADER',
        message: `Cột ${i + 1} phải là "${want}", đang là "${header[i] ?? ''}"`,
      });
    }
  }

  const rows: ImportRow[] = [];
  const loiKieu: LoiKieu[] = [];

  for (let n = 2; n <= ws.rowCount; n++) {
    const r = ws.getRow(n);
    const o = (i: number) => cellText(r.getCell(i + 1).value);

    const code = o(0);
    const name = o(1);
    const groupCode = o(2);
    const giaTho = o(3);
    const hieuLucTho = o(4);

    // Ô hỏng ở bất kỳ cột nào: ghi lại rồi đi tiếp, đừng đoán.
    let hong = false;
    for (const [i, v] of [code, name, groupCode, giaTho, hieuLucTho].entries()) {
      if (v === null) {
        loiKieu.push({ rowNumber: n, cot: HEADERS[i]!, lyDo: 'O_HONG' });
        hong = true;
      }
    }
    if (hong) continue;

    // Dòng trống hoàn toàn: bỏ qua ở BẤT KỲ đâu trong file, không riêng cuối.
    // Người ta chèn một dòng trắng để tách nhóm hàng, và đó không phải lỗi.
    if (code === '' && name === '' && groupCode === '' && giaTho === '' && hieuLucTho === '') {
      continue;
    }

    let price: bigint | null = null;
    if (giaTho !== '') {
      price = doGia(giaTho!);
      if (price === null) {
        loiKieu.push({ rowNumber: n, cot: 'gia_ban_cong_ty', lyDo: 'KHONG_PHAI_SO' });
        continue;
      }
    }

    /*
     * Ô trống KHÔNG phải "ngừng bán", và đây là chỗ dễ làm sai nhất của `0122`.
     *
     * Dòng sản phẩm MỚI mà người dùng gõ thêm vào cuối file luôn có ô này trống.
     * Hiểu ô trống là ngừng bán nghĩa là mọi sản phẩm vừa thêm đều chết ngay lúc
     * sinh ra — và người thêm nó sẽ không hiểu vì sao.
     *
     * Nên ô trống rơi xuống `IMPORT_MISSING_FIELD` ở `nhap.ts` (chưa điền), còn
     * một giá trị lạ thì là `IMPORT_BAD_TYPE` (điền sai). Hai câu khác nhau cho
     * hai việc phải làm khác nhau.
     */
    let conBan = true;
    if (hieuLucTho !== '') {
      const doc = doHieuLuc(hieuLucTho!);
      if (doc === undefined) {
        loiKieu.push({ rowNumber: n, cot: 'dang_co_hieu_luc', lyDo: 'KHONG_PHAI_HIEU_LUC' });
        continue;
      }
      conBan = doc;
    }

    rows.push({
      rowNumber: n,
      code: code!,
      name: name!,
      groupCode: groupCode!,
      price,
      conBan,
      ...(hieuLucTho === '' ? { thieuHieuLuc: true } : {}),
    });
  }

  return { rows, loiKieu };
}
