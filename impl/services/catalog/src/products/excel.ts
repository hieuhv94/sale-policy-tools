/**
 * Đọc file Excel danh mục sản phẩm (CAT-15).
 *
 * Chỉ PHÂN TÍCH ở đây, không chạm CSDL: mọi dòng phải đọc xong và hợp lệ về mặt
 * hình thức trước khi mở transaction ghi.
 */
import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';

export type ImportRow = {
  rowNumber: number;
  code: string;
  name: string;
  groupCode: string;
};

/*
 * Ba cột, không hơn (`0025`).
 *
 * File mẫu cũ có thêm `ck_loai_1..3` — ngưỡng chiết khấu mặc định theo loại
 * khách. Khái niệm ấy đã bỏ: ngưỡng chỉ khai ở bảng Chiết khấu quy định, nguồn
 * duy nhất. File cũ vẫn nhập được, ba cột thừa bị BỎ QUA chứ không báo lỗi —
 * chặn chúng là bắt người dùng sửa lại một file họ đã có, để đổi lấy đúng con
 * số không.
 */
const HEADERS = ['ma_vat_tu', 'ten_vat_tu', 'nhom_sp'] as const;

/**
 * Chú thích tiếng Việt của từng cột, hiện ở ghi chú ô tiêu đề trong file mẫu (`0119`).
 *
 * `HEADERS` khai `as const` nên bảng này phải phủ ĐỦ mọi cột: thêm một cột mà
 * quên chú thích là lỗi biên dịch, không phải một ô lặng lẽ không có hướng dẫn.
 */
const NHAN_COT: Record<(typeof HEADERS)[number], string> = {
  ma_vat_tu: 'Mã vật tư — bắt buộc, không trùng mã đã có',
  ten_vat_tu: 'Tên sản phẩm — bắt buộc',
  nhom_sp: 'MÃ nhóm sản phẩm — bắt buộc, nhóm phải có sẵn trong danh mục',
};

/** Tên file mẫu lúc tải về. Thuần ASCII nên `Content-Disposition` không phải né gì. */
export const MAU_TEN_TEP = 'mau-danh-muc-san-pham.xlsx';

/**
 * Dựng file Excel MẪU để Quản trị tải về (`0119`).
 *
 * Ba quyết định, và cả ba đều là để file tải về **nhập lại được ngay**:
 *
 * 1. **Tiêu đề dựng TỪ `HEADERS`**, chính mảng mà `parseProductSheet` kiểm. Viết
 *    cứng ba cái tên lần thứ hai ở đây là dựng ra đúng thứ hỏng mà file mẫu sinh
 *    ra để chống — người dùng tải một file "chuẩn" về, điền đúng, rồi nhận
 *    `BAD_HEADER` vì hai bên đã trôi khỏi nhau.
 *
 * 2. **Chứa TOÀN BỘ danh mục hiện tại** (`0120`). Bản `0119` để trang trống trơn
 *    dưới hàng tiêu đề. File có sẵn dữ liệu vừa là bản mẫu vừa là ảnh chụp danh
 *    mục: người dùng thấy ngay cách điền của những dòng đã có thay vì đoán từ
 *    tên cột, và biết mã nào đã dùng rồi.
 *
 *    Kèm theo một hệ quả phải nói ra, và tài liệu người dùng nói: **file này
 *    KHÔNG tải lên lại nguyên trạng được**. Luật hiện tại là trùng mã thì chặn
 *    cả lô, nên một file chứa mọi sản phẩm đã có sẽ hỏng ngay ở dòng thứ hai.
 *    Cách dùng là xoá những dòng đã có rồi điền dòng mới.
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
  sanPham: { code: string; name: string; groupCode: string }[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('San pham');

  ws.addRow([...HEADERS]);
  const dau = ws.getRow(1);
  dau.font = { bold: true };
  for (const [i, h] of HEADERS.entries()) {
    const o = dau.getCell(i + 1);
    o.note = NHAN_COT[h];
    ws.getColumn(i + 1).width = 28;
  }

  /*
   * Ghi theo ĐÚNG thứ tự của `HEADERS`, không viết thẳng ba tên trường.
   *
   * Cùng lý do với hàng tiêu đề: đảo thứ tự cột ở một chỗ mà quên chỗ kia thì
   * file tải về có tiêu đề đúng và dữ liệu lệch cột — hỏng theo kiểu tệ nhất, vì
   * nó vẫn nhập được và nạp tên sản phẩm vào ô mã nhóm.
   */
  const theoCot = (p: { code: string; name: string; groupCode: string }) =>
    HEADERS.map((h) => (h === 'ma_vat_tu' ? p.code : h === 'ten_vat_tu' ? p.name : p.groupCode));
  for (const p of sanPham) ws.addRow(theoCot(p));
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

const cellText = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'text' in v) return String(v.text).trim();
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '').trim();
  return String(v).trim();
};


export async function parseProductSheet(buffer: Buffer): Promise<ImportRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new BadRequestException({ code: 'EMPTY_SHEET' });

  const header = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((v) =>
    cellText(v).toLowerCase(),
  );
  for (const [i, want] of HEADERS.entries()) {
    if (header[i] !== want) {
      throw new BadRequestException({
        code: 'BAD_HEADER',
        message: `Cột ${i + 1} phải là "${want}", đang là "${header[i] ?? ''}"`,
      });
    }
  }

  const rows: ImportRow[] = [];
  for (let n = 2; n <= ws.rowCount; n++) {
    const r = ws.getRow(n);
    const code = cellText(r.getCell(1).value);
    const name = cellText(r.getCell(2).value);
    const groupCode = cellText(r.getCell(3).value);
    if (code === '' && name === '' && groupCode === '') continue; // dòng trống ở cuối file

    // Báo lỗi kèm SỐ DÒNG trong file, không phải chỉ số trong mảng — người dùng
    // sửa file Excel chứ không đọc mã nguồn.
    for (const [label, value] of [
      ['ma_vat_tu', code],
      ['ten_vat_tu', name],
      ['nhom_sp', groupCode],
    ] as const) {
      if (value === '') {
        throw new BadRequestException({
          code: 'IMPORT_FAILED',
          rowNumber: n,
          reason: 'MISSING_FIELD',
          message: `Dòng ${n}: thiếu cột ${label}. Không dòng nào được ghi.`,
        });
      }
    }

    rows.push({
      rowNumber: n,
      code,
      name,
      groupCode,
    });
  }
  return rows;
}
