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
  /** Dòng mới ghi *Ngừng bán* thì sản phẩm sinh ra đã ở trạng thái ngừng bán. */
  conBan: boolean;
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

/**
 * Một sản phẩm sắp đổi trạng thái (`0122`).
 *
 * `lyDo` tách hai đường ngừng bán, và bảng xem trước PHẢI vẽ chúng thành hai
 * khối riêng: một bên là câu khẳng định của người soạn file, một bên là suy ra
 * từ sự VẮNG MẶT. Hai thứ mang mức độ chắc chắn khác hẳn nhau — gộp lại thì
 * người duyệt không phân biệt được đâu là ý định, đâu là dán thiếu dòng.
 */
export type DoiTrangThai = {
  id: string;
  code: string;
  name: string;
  /** `O_CHON`: ô cột 5 ghi *Ngừng bán*. `VANG_MAT`: mã không có trong file. */
  lyDo: 'O_CHON' | 'VANG_MAT';
};

export type KeHoach = {
  themMoi: DongThem[];
  sua: DongSua[];
  /** Đang bán → ngừng bán. Liệt kê ĐỦ ở bảng xem trước, không gấp lại. */
  ngungBan: DoiTrangThai[];
  /** Ngừng bán → bán lại. Không đòi xác nhận riêng: nó không phá gì. */
  banLai: DoiTrangThai[];
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
    /*
     * GIÁ BẮT BUỘC từ `0123`.
     *
     * `0121` cho ô giá để trống với nghĩa "giữ nguyên giá cũ". Khách hàng chốt
     * bỏ: từ `0123` sản phẩm không thể tồn tại mà không có giá, nên một ô trống
     * ở đây là dấu hiệu file soạn dở chứ không phải một ý định.
     *
     * Hệ quả phải nhớ: sản phẩm CŨ chưa từng đặt giá sẽ xuất ra file mẫu với ô
     * trống, và file ấy không tải lên lại được cho tới khi điền giá cho chúng.
     * Đó là hành vi đúng — đằng nào chúng cũng không đưa vào hồ sơ được — nhưng
     * nó biến lượt nhập đầu tiên sau `0123` thành một đợt dọn dữ liệu.
     */
    if (r.price === null) thieuO.push({ rowNumber: r.rowNumber, cot: 'gia_ban_cong_ty' });
    // Cột hiệu lực để trống là CHƯA ĐIỀN, không phải "ngừng bán" (`0122`).
    if (r.thieuHieuLuc) thieuO.push({ rowNumber: r.rowNumber, cot: 'dang_co_hieu_luc' });
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

  // --- Dựng kế hoạch --------------------------------------------------------
  const theoMa = new Map(hienTai.sanPham.map((p) => [chuanMa(p.code), p]));
  const themMoi: DongThem[] = [];
  const sua: DongSua[] = [];
  const ngungBan: DoiTrangThai[] = [];
  const banLai: DoiTrangThai[] = [];
  let khongDoi = 0;

  /*
   * VẮNG MẶT TRONG FILE = NGỪNG BÁN (`0122`).
   *
   * `0121` chặn hẳn lượt nhập khi file thiếu một mã đang có; khách hàng chốt đổi
   * thành đường ngừng bán thứ hai. Ghi lại chỗ này vì nó ĐẢO một quyết định, và
   * người đọc sau sẽ thấy hai câu trái nhau ở hai chỗ trong nhật ký.
   *
   * Rủi ro đi kèm là thật và không gỡ được bằng mã: một dòng biến mất vì lọc rồi
   * chép phần đang hiện, vì sắp xếp rồi xoá nhầm, vì dán đè một vùng ngắn hơn —
   * cả ba đều trông y hệt một quyết định ngừng bán. Thứ duy nhất đứng giữa là
   * bảng xem trước, nên khối `VANG_MAT` phải liệt kê ĐỦ và tách riêng.
   *
   * Sản phẩm vắng mặt mà VỐN ĐÃ ngừng bán thì không có gì để làm.
   */
  const trongFile = new Set(rows.map((r) => chuanMa(r.code)));
  for (const p of hienTai.sanPham) {
    if (trongFile.has(chuanMa(p.code))) continue;
    if (p.status === 'DANG_AP_DUNG') {
      ngungBan.push({ id: p.id, code: p.code, name: p.name, lyDo: 'VANG_MAT' });
    } else {
      khongDoi += 1;
    }
  }

  for (const r of rows) {
    const cu = theoMa.get(chuanMa(r.code));
    if (!cu) {
      themMoi.push({
        rowNumber: r.rowNumber,
        code: r.code,
        name: r.name,
        groupCode: r.groupCode,
        price: r.price === null ? null : r.price.toString(),
        conBan: r.conBan,
      });
      continue;
    }

    const d: DongSua = { rowNumber: r.rowNumber, id: cu.id, code: cu.code };
    if (chuanTen(cu.name) !== chuanTen(r.name)) d.ten = { truoc: cu.name, sau: r.name };
    if (chuanMa(cu.groupCode) !== chuanMa(r.groupCode)) {
      d.nhom = { truoc: cu.groupCode, sau: r.groupCode };
    }

    /*
     * Giá chỉ vào kế hoạch khi THẬT SỰ đổi.
     *
     * Từ `0123` ô giá bắt buộc có, nên `r.price` không bao giờ `null` ở đây —
     * phép kiểm còn lại chỉ là "khác giá đang có hay không". Ghi một dòng giá
     * bằng đúng giá cũ là thêm một sự kiện, tức một lượt rà mọi hồ sơ đã đóng
     * băng (nợ N-09), để đổi lấy đúng con số không.
     */
    if (r.price !== null && (cu.price === null || BigInt(cu.price) !== r.price)) {
      d.gia = { truoc: cu.price, sau: r.price.toString() };
      if (cu.price !== null && BigInt(cu.price) > 0n) {
        const cuSo = Number(cu.price);
        const tyLe = Math.abs(Number(r.price) - cuSo) / cuSo;
        if (tyLe > NGUONG_CANH_BAO_GIA) d.canhBaoGia = tyLe;
      }
    }

    // Trạng thái đi RIÊNG khỏi khối `sua`: nó không phải một ô đổi giá trị mà là
    // một hành động có hậu quả ngoài danh mục, và bảng xem trước vẽ nó riêng.
    const dangBan = cu.status === 'DANG_AP_DUNG';
    if (dangBan && !r.conBan) {
      ngungBan.push({ id: cu.id, code: cu.code, name: cu.name, lyDo: 'O_CHON' });
    } else if (!dangBan && r.conBan) {
      banLai.push({ id: cu.id, code: cu.code, name: cu.name, lyDo: 'O_CHON' });
    }

    if (d.ten || d.nhom || d.gia) sua.push(d);
    else if (dangBan === r.conBan) khongDoi += 1;
  }

  return { themMoi, sua, ngungBan, banLai, khongDoi };
}
