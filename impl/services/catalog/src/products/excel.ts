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
const HEADERS = ['ma_vat_tu', 'ten_vat_tu', 'nhom_sp'];

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
