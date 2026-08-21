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
  kind?: 'money' | 'date' | 'datetime' | 'rate' | 'list' | 'co-khong';
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
   * KHỐI DÒNG SẢN PHẨM (`0080`) — mỗi sản phẩm một DÒNG riêng.
   *
   * `0078` gộp tên các mặt hàng vào một ô. Đọc được, nhưng không lọc được, không
   * cộng được, không dựng được pivot — mà đó mới là việc người ta xuất Excel để
   * làm. Nay mỗi dòng của bảng tính là MỘT dòng sản phẩm của MỘT hồ sơ, và các
   * cột hồ sơ ở trên lặp lại trên mỗi dòng.
   *
   * MỘT BẪY PHẢI BIẾT: *Tổng giá thu về* và *Số dòng sản phẩm* là con số của CẢ
   * HỒ SƠ, nên chúng lặp lại y nguyên trên mọi dòng của hồ sơ ấy — cộng cả cột
   * là cộng thừa. Con số theo dòng nằm ở *Giá thu về (dòng)* bên dưới, và hai
   * cái mang hai cái tên khác nhau đúng vì lý do đó.
   *
   * Cả khối ĐỨNG CUỐI: thứ tự cột là hợp đồng, người dùng đã dựng công thức
   * tham chiếu cột N, cột O. Cột `Sản phẩm` của `0078` bị khối này thay thế —
   * nó nằm ở vị trí cuối cùng, nên gỡ đi không xê dịch cột nào khác.
   */
  { header: 'Mã sản phẩm', key: 'productCode', width: 16 },
  { header: 'Tên sản phẩm', key: 'productName', width: 40 },
  { header: 'Nhóm SP', key: 'groupCode', width: 16 },
  { header: 'Giá bán Công ty', key: 'companyPrice', width: 16, kind: 'money' },
  { header: 'Giá bán buôn', key: 'wholesalePrice', width: 16, kind: 'money' },
  { header: 'CPBH', key: 'cpbhTotal', width: 14, kind: 'money' },
  { header: 'Giá thu về (dòng)', key: 'netPrice', width: 16, kind: 'money' },
  { header: 'Chiết khấu dòng (%)', key: 'discountRate', width: 18, kind: 'rate' },
  { header: 'Ngưỡng (%)', key: 'threshold', width: 12, kind: 'rate' },
  { header: 'Vượt ngưỡng', key: 'overThreshold', width: 12, kind: 'co-khong' },
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
         * Boolean ghi thành CHỮ, không thành `TRUE`/`FALSE` (`0080`).
         *
         * `Có`/`—` đọc được ngay và lọc được bằng bộ lọc của Excel; `TRUE` thì
         * người đọc phải nhớ cột này hỏi điều gì mới suy ra nghĩa. Ô trống dành
         * cho hồ sơ chưa có dòng sản phẩm nào — khác hẳn với "không vượt".
         */
        case 'co-khong':
          cells[c.key] = v === null || v === undefined ? null : v ? 'Có' : '—';
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
