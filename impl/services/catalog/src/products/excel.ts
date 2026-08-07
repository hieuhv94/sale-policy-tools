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
  defaultRate2Type1?: number | undefined;
  defaultRate2Type2?: number | undefined;
  defaultRate2Type3?: number | undefined;
};

const HEADERS = ['ma_vat_tu', 'ten_vat_tu', 'nhom_sp', 'ck_loai_1', 'ck_loai_2', 'ck_loai_3'];

const cellText = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'text' in v) return String(v.text).trim();
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '').trim();
  return String(v).trim();
};

const cellRate2 = (v: ExcelJS.CellValue, rowNumber: number, col: string): number | undefined => {
  const t = cellText(v);
  if (t === '') return undefined;
  // Nhận cả "12,35" lẫn "12.35" — bàn phím tiếng Việt cho ra dấu phẩy.
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) {
    throw new BadRequestException({
      code: 'IMPORT_FAILED',
      rowNumber,
      reason: 'RATE_INVALID',
      message: `Dòng ${rowNumber}: cột ${col} không phải số hợp lệ. Không dòng nào được ghi.`,
    });
  }
  return Math.round(n * 100);
};

export async function parseProductSheet(buffer: Buffer): Promise<ImportRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new BadRequestException({ code: 'EMPTY_SHEET' });

  const header = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((v) =>
    cellText(v).toLowerCase(),
  );
  for (const [i, want] of HEADERS.slice(0, 3).entries()) {
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
      defaultRate2Type1: cellRate2(r.getCell(4).value, n, 'ck_loai_1'),
      defaultRate2Type2: cellRate2(r.getCell(5).value, n, 'ck_loai_2'),
      defaultRate2Type3: cellRate2(r.getCell(6).value, n, 'ck_loai_3'),
    });
  }
  return rows;
}
