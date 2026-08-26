/**
 * Kiểm tra một lượt nhập danh mục và dựng KẾ HOẠCH ghi (`0121`).
 *
 * Hàm THUẦN: nhận các dòng đã đọc từ Excel cộng một ảnh chụp danh mục, trả về
 * kế hoạch hoặc ném lỗi. Không chạm CSDL, không biết HTTP.
 *
 * Tách ra vì nó chạy HAI LẦN cho mỗi lượt nhập, và hai lần ấy phải cho cùng một
 * câu trả lời: một lần lúc người dùng bấm *Xem trước*, một lần nữa bên trong
 * transaction ghi. Giữa hai lượt, người khác có thể vừa tạo một nhóm, vừa thêm
 * một sản phẩm, vừa đổi một cái giá — nên kết quả của lượt xem trước là ẢNH
 * CHỤP, không phải bảo đảm. Hai bản sao của cùng phép kiểm thì sẽ lệch nhau, và
 * lệch ở đây nghĩa là bảng người dùng vừa duyệt không phải thứ được ghi.
 *
 * THỨ TỰ CÁC BƯỚC LÀ MỘT PHẦN CỦA ĐẶC TẢ, không phải chuyện sắp xếp cho gọn.
 * Bước "sai kiểu" chạy trước bước "thiếu nhóm" và bước "trùng": một ô lỗi công
 * thức đọc ra `null`, và nếu để nó đi tiếp thì phép so mã nhóm và phép dò trùng
 * chạy trên một giá trị vô nghĩa rồi báo một câu lỗi nói về chuyện khác hẳn.
 *
 * Mỗi bước GOM HẾT lỗi cùng loại rồi mới ném. Dừng ở dòng hỏng đầu tiên nghĩa là
 * một file có mười mã nhóm chưa tạo phải tải lên mười một lần.
 */
import { BadRequestException } from '@nestjs/common';
import type { ImportRow, LoiKieu } from './excel.js';

/**
 * Trần số dòng.
 *
 * Không phải luật nghiệp vụ mà là chốt chống một file làm nghẽn service: mọi
 * dòng nằm trong bộ nhớ cùng lúc, và lượt ghi chạy trong MỘT transaction. Danh
 * mục thật của khách hàng ở mức vài trăm mặt hàng, nên 5000 là rộng rãi tới mức
 * chạm vào nó gần như chắc chắn là file sai chứ không phải danh mục lớn.
 */
export const TRAN_SO_DONG = 5000;

/** Đổi giá quá ngưỡng này thì tô cảnh báo ở bảng xem trước. */
export const NGUONG_CANH_BAO_GIA = 0.5;

export type SanPhamHienTai = {
  id: string;
  code: string;
  name: string;
  groupCode: string;
  /** Giá hiện hành, `null` khi chưa từng đặt giá. */
  price: string | null;
  status: string;
};

export type DanhMucHienTai = {
  sanPham: SanPhamHienTai[];
  maNhom: string[];
};

export type DongThem = {
  rowNumber: number;
  code: string;
  name: string;
  groupCode: string;
  /**
   * CHUỖI, không phải `bigint`.
   *
   * Kế hoạch này đi thẳng ra JSON cho bảng xem trước, và `JSON.stringify` ném
   * `TypeError: Do not know how to serialize a BigInt` — một lỗi 500 không nhắc
   * gì tới tiền bạc, xuất hiện ở đúng đường mà người dùng vừa bấm. Cùng lối với
   * mọi cột tiền khác trong sản phẩm: `numeric` của Postgres cũng ra chuỗi.
   */
  price: string | null;
};

export type OiDoi = { truoc: string | null; sau: string };

export type DongSua = {
  rowNumber: number;
  id: string;
  code: string;
  /** Chỉ có mặt khi ô ấy thật sự đổi — bảng xem trước chỉ vẽ những gì có ở đây. */
  ten?: OiDoi;
  nhom?: OiDoi;
  gia?: OiDoi;
  /** Tỷ lệ đổi giá, chỉ đặt khi vượt `NGUONG_CANH_BAO_GIA`. */
  canhBaoGia?: number;
};

export type KeHoach = {
  themMoi: DongThem[];
  sua: DongSua[];
  /** Số dòng khớp hoàn toàn với danh mục — gấp lại ở bảng xem trước. */
  khongDoi: number;
};

/**
 * Mã vật tư so sau khi chuẩn hoá, ĐÚNG như unique index của CSDL
 * (`upper(btrim(code))`). Lệch khỏi nó thì phép kiểm ở đây nói "không trùng" rồi
 * lượt ghi chết vì trùng khoá — một lỗi 500 sau khi người dùng đã bấm xác nhận.
 */
const chuanMa = (s: string): string => s.trim().toUpperCase();

/**
 * Tên so sau khi gom khoảng trắng và bỏ hoa/thường. KHÔNG bỏ dấu: "Sữa" và "Sua"
 * là hai cái tên khác nhau, và gộp chúng lại là chặn một file hợp lệ.
 */
const chuanTen = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Ném lỗi 400 kèm thân có cấu trúc.
 *
 * Nhận NGUYÊN cái object thay vì `(code, them)`, và đó không phải sở thích:
 * `tests/web/loi.test.tsx` quét mã nguồn máy chủ tìm chuỗi `code: '…'` để đòi
 * mọi mã lỗi phải có câu chữ khai ở `loi.ts`. Truyền mã qua tham số thì literal
 * ấy biến mất khỏi mã nguồn, và sáu mã ở tệp này lọt qua bộ quét — đúng lớp lỗi
 * mà `0088` dựng ra để chặn.
 */
const bad = (than: { code: string } & Record<string, unknown>): never => {
  throw new BadRequestException(than);
};

/** Nhóm các phần tử trùng khoá, chỉ giữ nhóm có từ hai phần tử. */
function timTrung<T>(ds: T[], khoa: (x: T) => string): Map<string, T[]> {
  const theo = new Map<string, T[]>();
  for (const x of ds) {
    const k = khoa(x);
    const co = theo.get(k);
    if (co) co.push(x);
    else theo.set(k, [x]);
  }
  for (const [k, v] of theo) if (v.length < 2) theo.delete(k);
  return theo;
}

export function dungKeHoach(
  doc: { rows: ImportRow[]; loiKieu: LoiKieu[] },
  hienTai: DanhMucHienTai,
): KeHoach {
  const { rows, loiKieu } = doc;

  // --- Bước 1 (một phần) và bước 0 ------------------------------------------
  // Tiêu đề đã kiểm ở `parseProductSheet`. Còn lại ở đây là hai chuyện thuộc về
  // cả file: rỗng, và quá dài.
  if (rows.length === 0 && loiKieu.length === 0) bad({ code: 'EMPTY_SHEET' });
  if (rows.length > TRAN_SO_DONG) {
    bad({ code: 'IMPORT_TOO_MANY_ROWS', soDong: rows.length, toiDa: TRAN_SO_DONG });
  }

  // --- Bước 2: sai kiểu -----------------------------------------------------
  if (loiKieu.length > 0) bad({ code: 'IMPORT_BAD_TYPE', o: loiKieu });

  // --- Bước 2b: thiếu ô bắt buộc --------------------------------------------
  // Không nằm trong danh sách bạn đọc được ở đặc tả, nhưng nó là điều kiện của
  // mọi bước sau: một dòng thiếu mã thì không đối chiếu được với cái gì.
  const thieuO: { rowNumber: number; cot: string }[] = [];
  for (const r of rows) {
    if (r.code === '') thieuO.push({ rowNumber: r.rowNumber, cot: 'ma_vat_tu' });
    if (r.name === '') thieuO.push({ rowNumber: r.rowNumber, cot: 'ten_vat_tu' });
    if (r.groupCode === '') thieuO.push({ rowNumber: r.rowNumber, cot: 'nhom_sp' });
  }
  if (thieuO.length > 0) bad({ code: 'IMPORT_MISSING_FIELD', o: thieuO });

  // --- Bước 3: nhóm chưa có trong danh mục ----------------------------------
  const nhomCo = new Set(hienTai.maNhom.map(chuanMa));
  const nhomThieu = new Map<string, number[]>();
  for (const r of rows) {
    if (nhomCo.has(chuanMa(r.groupCode))) continue;
    const co = nhomThieu.get(r.groupCode);
    if (co) co.push(r.rowNumber);
    else nhomThieu.set(r.groupCode, [r.rowNumber]);
  }
  if (nhomThieu.size > 0) {
    bad({
      code: 'IMPORT_GROUP_MISSING',
      nhom: [...nhomThieu].map(([ma, dong]) => ({ ma, dong })),
    });
  }

  // --- Bước 4: trùng mã hoặc trùng tên TRONG FILE ---------------------------
  //
  // MÃ thì chặn thẳng: nó là khoá, CSDL có unique index trên nó, và hai dòng
  // cùng mã trong một file nghĩa là không ai biết dòng nào thắng.
  //
  // TÊN thì chỉ chặn phần MỚI PHÁT SINH, và đó không phải sự nới tay:
  //
  //   `cat.product` KHÔNG cấm trùng tên, và danh mục thật có trùng tên — cùng
  //   một mặt hàng ở hai quy cách, hai dung tích. Đo trên chính CSDL của bộ
  //   test: 19 sản phẩm mang cùng một tên.
  //
  //   Mà từ `0121` file phải chứa ĐỦ mọi mã đang có. Ghép hai điều đó lại, một
  //   phép chặn cứng nghĩa là danh mục nào lỡ có hai sản phẩm trùng tên thì
  //   KHÔNG BAO GIỜ nhập lại được — và đường chữa duy nhất là sửa tên bằng tay
  //   trên màn hình, đúng thứ mà lượt nhập sinh ra để khỏi phải làm.
  //
  //   Nên phép so là: tên ấy trong file xuất hiện NHIỀU HƠN trong danh mục hay
  //   không. Giữ nguyên hiện trạng thì qua; tạo thêm một cái trùng mới thì chặn.
  const trungMa = timTrung(rows, (r) => chuanMa(r.code));

  const demTen = new Map<string, number>();
  for (const p of hienTai.sanPham) {
    const k = chuanTen(p.name);
    demTen.set(k, (demTen.get(k) ?? 0) + 1);
  }
  const trungTen = new Map<string, ImportRow[]>();
  for (const [k, ds] of timTrung(rows, (r) => chuanTen(r.name))) {
    if (ds.length > (demTen.get(k) ?? 0)) trungTen.set(k, ds);
  }

  if (trungMa.size > 0 || trungTen.size > 0) {
    bad({
      code: 'IMPORT_DUPLICATE_IN_FILE',
      trungMa: [...trungMa].map(([, ds]) => ({
        giaTri: ds[0]!.code,
        dong: ds.map((r) => r.rowNumber),
      })),
      trungTen: [...trungTen].map(([, ds]) => ({
        giaTri: ds[0]!.name,
        dong: ds.map((r) => r.rowNumber),
      })),
    });
  }

  // --- Bước 5: thiếu sản phẩm đang có ---------------------------------------
  //
  // File là ảnh chụp ĐẦY ĐỦ của danh mục. Thiếu một mã đang có nghĩa là người
  // dùng đã dán thiếu dòng, hoặc đang nhập từ một file cũ — và cả hai đường đó
  // đều dẫn tới việc mất dấu một mặt hàng nếu ta im lặng bỏ qua.
  //
  // Không có đường xoá sản phẩm nào ở đây, kể cả gián tiếp: muốn ngừng bán thì
  // làm trên màn hình, nơi có chốt gõ lại mã vật tư.
  const trongFile = new Set(rows.map((r) => chuanMa(r.code)));
  const thieuSp = hienTai.sanPham.filter((p) => !trongFile.has(chuanMa(p.code)));
  if (thieuSp.length > 0) {
    bad({ code: 'IMPORT_PRODUCT_MISSING', ma: thieuSp.map((p) => p.code) });
  }

  // --- Dựng kế hoạch --------------------------------------------------------
  const theoMa = new Map(hienTai.sanPham.map((p) => [chuanMa(p.code), p]));
  const themMoi: DongThem[] = [];
  const sua: DongSua[] = [];
  let khongDoi = 0;

  for (const r of rows) {
    const cu = theoMa.get(chuanMa(r.code));
    if (!cu) {
      themMoi.push({
        rowNumber: r.rowNumber,
        code: r.code,
        name: r.name,
        groupCode: r.groupCode,
        price: r.price === null ? null : r.price.toString(),
      });
      continue;
    }

    const d: DongSua = { rowNumber: r.rowNumber, id: cu.id, code: cu.code };
    if (chuanTen(cu.name) !== chuanTen(r.name)) d.ten = { truoc: cu.name, sau: r.name };
    if (chuanMa(cu.groupCode) !== chuanMa(r.groupCode)) {
      d.nhom = { truoc: cu.groupCode, sau: r.groupCode };
    }

    /*
     * Ô GIÁ TRỐNG = KHÔNG ĐỤNG TỚI, không phải "đặt về rỗng".
     *
     * Đây là chỗ dễ làm sai nhất của cả hàm: giá là một chuỗi lịch sử mà hồ sơ
     * đã đóng băng tra ngược lại, nên "xoá giá" không phải một thao tác tồn tại.
     */
    if (r.price !== null && (cu.price === null || BigInt(cu.price) !== r.price)) {
      d.gia = { truoc: cu.price, sau: r.price.toString() };
      if (cu.price !== null && BigInt(cu.price) > 0n) {
        const cuSo = Number(cu.price);
        const tyLe = Math.abs(Number(r.price) - cuSo) / cuSo;
        if (tyLe > NGUONG_CANH_BAO_GIA) d.canhBaoGia = tyLe;
      }
    }

    if (d.ten || d.nhom || d.gia) sua.push(d);
    else khongDoi += 1;
  }

  return { themMoi, sua, khongDoi };
}
