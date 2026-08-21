/**
 * Dựng file Excel danh sách hồ sơ (RPT-07).
 *
 * BA ĐIỀU DỄ LÀM SAI, và cả ba đều không lộ ra khi mở file bằng mắt:
 *
 *   1. **Tiền phải là SỐ, không phải chuỗi.** Ghi "1.234.567 đ" thì file mở ra
 *      đẹp nhưng không cộng được, không lọc được ">1 triệu", không vẽ được biểu
 *      đồ — tức là hỏng đúng thứ người ta xuất Excel để làm. Ghi số rồi đặt
 *      `numFmt` thì vừa đọc ra có dấu phân cách, vừa tính được.
 *   2. **Ngày phải là Date, không phải chuỗi.** Cùng lý do, cộng thêm một lý do
 *      riêng: chuỗi "07/08/2026" sắp xếp theo thứ tự chữ cái, nên tháng 12 nằm
 *      trước tháng 2.
 *   3. **Thứ tự cột phải cố định.** Người dùng dựng công thức tham chiếu cột E;
 *      chèn một cột vào giữa ở bản sau là làm hỏng file của họ trong im lặng.
 *      Danh sách dưới đây là hợp đồng, không phải chi tiết cài đặt.
 */
import ExcelJS from 'exceljs';

type Col = {
  header: string;
  key: string;
  width: number;
  kind?: 'money' | 'date' | 'datetime' | 'rate' | 'list' | 'ds';
};

/** THỨ TỰ CỘT — hợp đồng với người dùng, chỉ được thêm vào CUỐI. */
export const COLUMNS: Col[] = [
  { header: 'Mã hồ sơ', key: 'code', width: 18 },
  { header: 'Phiên bản', key: 'versionNo', width: 10 },
  { header: 'Trạng thái', key: 'status', width: 18 },
  { header: 'Mã khách hàng', key: 'customerCode', width: 16 },
  { header: 'Tên khách hàng', key: 'customerName', width: 30 },
  { header: 'Địa chỉ đăng ký', key: 'registeredAddress', width: 36 },
  { header: 'Mã số thuế', key: 'taxId', width: 16 },
  { header: 'Ngày áp dụng', key: 'appliedDate', width: 14, kind: 'date' },
  { header: 'Thời gian duyệt', key: 'approvedAt', width: 18, kind: 'datetime' },
  { header: 'Người đề nghị', key: 'requesterName', width: 24 },
  { header: 'TDV phụ trách', key: 'tdvName', width: 24 },
  { header: 'Số dòng sản phẩm', key: 'lineCount', width: 14 },
  { header: 'Nhóm sản phẩm', key: 'productGroupCodes', width: 20, kind: 'list' },
  { header: 'Tổng giá thu về', key: 'totalNet', width: 18, kind: 'money' },
  { header: 'Chiết khấu cao nhất (%)', key: 'maxDiscount', width: 20, kind: 'rate' },
  { header: 'Ngày tạo', key: 'createdAt', width: 18, kind: 'datetime' },
  /*
   * Danh sách SẢN PHẨM CỤ THỂ của hồ sơ (`0078`).
   *
   * Trước đợt này file chỉ nói *"Số dòng sản phẩm: 5"* và *"Nhóm sản phẩm: SUA,
   * BOT"* — biết hồ sơ có năm mặt hàng thuộc hai nhóm, nhưng không biết là những
   * mặt hàng nào. Muốn biết thì phải mở từng hồ sơ ra xem, đúng việc mà một file
   * xuất ra sinh ra để khỏi phải làm.
   *
   * ĐỨNG CUỐI dù nó thuộc về chỗ cạnh *Nhóm sản phẩm*. Thứ tự cột là hợp đồng —
   * người dùng đã dựng công thức tham chiếu cột N, cột O; chèn vào giữa là làm
   * hỏng file của họ trong im lặng. Xem chú thích đầu tệp.
   */
  { header: 'Sản phẩm', key: 'productNames', width: 60, kind: 'ds' },
];

const MONEY_FMT = '#,##0';
const RATE_FMT = '0.00';
const DATE_FMT = 'dd/mm/yyyy';
const DATETIME_FMT = 'dd/mm/yyyy hh:mm';

const asDate = (v: unknown): Date | null => {
  if (v instanceof Date) return v;
  if (typeof v === 'string' && v) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

export async function buildSheet(rows: Record<string, unknown>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CSBH Nutricare';
  wb.created = new Date();
  const ws = wb.addWorksheet('Ho so CSBH');

  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  // Dòng tiêu đề đứng yên khi cuộn — danh sách 5000 dòng mà không có nó thì đến
  // dòng thứ 40 đã không ai biết cột nào là cột nào.
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const r of rows) {
    const cells: Record<string, unknown> = {};
    for (const c of COLUMNS) {
      const v = r[c.key];
      switch (c.kind) {
        case 'money':
          // Cột tiền lưu dạng chuỗi vì là bigint trong Postgres. Số tiền của hệ
          // này nằm rất xa 2^53 nên Number() an toàn — nhưng phải chuyển ở đây,
          // vì exceljs ghi nguyên chuỗi thành ô văn bản mà không báo gì.
          cells[c.key] = v === null || v === undefined ? null : Number(v);
          break;
        case 'rate':
          cells[c.key] = v === null || v === undefined ? null : Number(v);
          break;
        case 'date':
        case 'datetime':
          cells[c.key] = asDate(v);
          break;
        case 'list':
          cells[c.key] = Array.isArray(v) ? v.join(', ') : (v ?? null);
          break;
        /*
         * Ngăn bằng DẤU CHẤM PHẨY, không bằng dấu phẩy (`0078`).
         *
         * Tên sản phẩm là câu chữ tự do và có thể chứa dấu phẩy ("Sữa non 120g,
         * hộp giấy"); ngăn bằng dấu phẩy thì người dùng bấm *Text to Columns*
         * trong Excel sẽ cắt đúng giữa một cái tên. Mã nhóm thì không bao giờ
         * chứa dấu phẩy, nên cột ấy giữ nguyên `list` — đổi định dạng một cột
         * đã bàn giao là chuyện phải có lý do, và ở đó không có lý do nào.
         */
        case 'ds':
          cells[c.key] = Array.isArray(v) ? v.join('; ') : (v ?? null);
          break;
        default:
          cells[c.key] = v ?? null;
      }
    }
    ws.addRow(cells);
  }

  for (const [i, c] of COLUMNS.entries()) {
    const col = ws.getColumn(i + 1);
    if (c.kind === 'money') col.numFmt = MONEY_FMT;
    if (c.kind === 'rate') col.numFmt = RATE_FMT;
    if (c.kind === 'date') col.numFmt = DATE_FMT;
    if (c.kind === 'datetime') col.numFmt = DATETIME_FMT;
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
