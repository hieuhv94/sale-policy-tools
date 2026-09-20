/**
 * Chi tiết một hồ sơ CSBH: bảng 10 cột, lịch sử, và các nút hành động.
 *
 * Danh sách nút lấy từ `/policies/:id/allowed-actions` — MÁY CHỦ quyết định, vì
 * máy trạng thái nằm ở đó. Bảng vai trò phía giao diện chỉ dùng để ẩn bớt trước
 * khi hỏi; hai bên lệch nhau thì máy chủ thắng.
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { dang, layJson, taiVe, xemTruoc, xoa } from '../lib/api.js';
import { usePhien } from '../lib/auth.js';
import { CAN_LY_DO, HANH_DONG_NHAN, can, canHanhDong, xemBanMemDuoc } from '../lib/can.js';
import { ngay, ngayGio, nhanHanhDong, nhanTrangThai, tien } from '../lib/format.js';
import { nhanLoaiKhach } from '../lib/danh-muc.js';
import { LichSuGap } from '../components/LichSu.js';
import { BangSanPham, type DongSanPham } from '../components/BangSanPham.js';
import { TepDinhKem, type TepDto } from '../components/TepDinhKem.js';
import { TepBanTruoc, type BanTruocDto } from '../components/TepBanTruoc.js';
import { HoSoPhapLy } from '../components/HoSoPhapLy.js';
import { XemTep } from '../components/XemTep.js';
import { XemBanMem } from '../components/XemBanMem.js';
import { SuaMaHoSo } from '../components/SuaMaHoSo.js';
import { NHAN_KHO, TY_LE_KHO, TY_LE_MAC_DINH, type MauChon } from '../lib/mau-hop-dong.js';
import {
  ThemDongSanPham,
  XoaHoSo,
  suaDuoc,
} from '../components/SuaHoSo.js';
import { Lien, useDuong } from '../lib/router.js';
import {
  oChonCua,
  type NguoiChon,
} from '../lib/nguoi-xu-ly.js';
import {
  BaoLoi,
  DangTai,
  HopThoai,
  HopThoaiXacNhan,
  Nhan,
  Truong,
} from '../components/Chung.js';
import { DanhSachLech, type LechMuc } from '../components/Lech.js';
import { useBaoLoi } from '../lib/bao-loi.js';

type HoSo = {
  id: string;
  code: string;
  customerId: string;
  versionNo: number;
  status: string;
  /** Lúc bản nháp ra đời — "ngày soạn thảo" (`0061`). */
  createdAt?: string | null;
  effectiveFrom: string | null;
  lastReason: string | null;
  /**
   * `0191` — phiên bản kế nhiệm đang SOẠN hoặc đang DUYỆT, nếu có.
   *
   * Chỉ có nghĩa khi hồ sơ này đang hiệu lực; máy chủ trả `null` ở mọi trạng
   * thái khác. Hộp xác nhận *Lập phiên bản mới* đọc nó để hỏi đúng câu — `create`
   * KHÔNG chặn bản thứ hai, nên im lặng ở đây là để người dùng lập chồng lên
   * chính bản họ đang soạn dở.
   */
  phienBanSau?: { id: string; code: string; status: string } | null;
  /**
   * `0189` — lý do gần nhất KÈM NGỮ CẢNH, máy chủ dựng từ nhật ký hồ sơ.
   *
   * Tuỳ chọn vì máy chủ cũ hơn giao diện không gửi nó; giá trị lùi là khối cũ
   * chỉ có câu chữ, tức mất ngữ cảnh chứ không mất lý do.
   */
  lyDoTraLai?: {
    lyDo: string;
    hanhDong: string;
    tuTrangThai: string | null;
    ten: string | null;
    luc: string | null;
  } | null;
  /* `mauHoSoId` ĐÃ GỠ (`0163`) — mẫu thôi đóng băng theo hồ sơ. */
  /**
   * Đã có Sale Admin chưa (`0141`) — một cờ, không phải id.
   *
   * Tuỳ chọn vì máy chủ cũ hơn giao diện không gửi nó, và giá trị lùi `false`
   * chọn phía AN TOÀN: hỏi thừa một ô còn hơn bỏ qua một ô bắt buộc rồi nhận
   * `ASSIGNEE_REQUIRED` sau khi bấm.
   */
  daChonSaleAdmin?: boolean;
  /** Người LẬP hồ sơ (`0061`). `ten` là `null` khi identity không tra được. */
  nguoiDeNghi?: { ten: string | null };
  /**
   * Khách hàng của hồ sơ (`0061`). `null` khi `customer` không trả lời được —
   * mất khối thông tin, không mất cả màn hình.
   */
  khachHang?: {
    ma: string;
    ten: string;
    /** `0177` — bốn trường dưới đây đóng băng lúc gửi duyệt, cùng `ten`. */
    nguoiDaiDien: string | null;
    soNha: string | null;
    tinhThanh: string | null;
    /**
     * Chuỗi gộp `"số nhà, tỉnh thành"` — CHỈ là giá trị lùi cho hồ sơ gửi trước
     * `0177`, lúc hai ô trên chưa được chụp. Đọc nó khi và chỉ khi cả hai rỗng.
     */
    diaChiDangKy: string | null;
    /** Mảng RỖNG = *"giao tới địa chỉ đăng ký"* (`0006`), không phải thiếu. */
    noiNhanHang: string[];
    loai: number;
    congNo: string | null;
    trangThai: string | null;
  } | null;
  /**
   * Bốn cờ MÁY CHỦ tính sẵn (`0039`, `0048`) — giao diện KHÔNG chép danh sách
   * trạng thái sang, vì bản sao thứ hai là bản sẽ có ngày lệch với máy trạng thái.
   *
   * Nguyên tắc chung: thao tác nào không làm được thì ĐỪNG HIỆN. Giao diện AND
   * cờ này với bảng quyền của nó — quyền trả lời "vai trò này được phép chưa",
   * cờ trả lời "hồ sơ này lúc này cho phép chưa".
   */
  xoaDuoc: boolean;
  /** Chênh lệch so với danh mục hôm nay (`0050`). Rỗng là không lệch gì. */
  lech?: LechMuc[];
  /**
   * Ai đã duyệt bước nào, và lúc nào (`0056`). `null` = bước ấy chưa xảy ra.
   *
   * Tên có thể `null` dù mốc thời gian có: `userNames` nuốt lỗi và trả rỗng khi
   * identity chết, nên mất tên chứ không mất cả màn hình.
   */
  nguoiDuyet?: Partial<Record<'tbp' | 'keToanL1' | 'keToanL2' | 'saleAdmin',
    { ten: string | null; luc: string } | null>>;
  /*
   * Ba cờ `0048` khai là TUỲ CHỌN, và đọc kèm giá trị lùi an toàn ngay dưới.
   *
   * Máy chủ cũ hơn giao diện — hoặc một stub trong test — không gửi chúng, và
   * `undefined.length` làm nổ cả trang chi tiết. Thiếu một cờ thì đáng lẽ chỉ
   * mất một nút, không phải mất cả màn hình. Giá trị lùi chọn phía AN TOÀN: ẩn
   * nút, chứ không hiện một nút sẽ trả 409.
   */
  loaiTepGhiDuoc?: string[];
  xuatHopDongDuoc?: boolean;
  /** `0050` — bản scan đang đính kèm là bản Kế toán đã yêu cầu in lại. */
  banScanCu?: boolean;
  /**
   * `0160` — đã có bản scan chưa, tức nút *Bàn giao* sáng hay xám.
   *
   * Máy chủ tính, giao diện KHÔNG tự suy từ `attachments`: chốt chặn thật
   * (`SCAN_REQUIRED`) hỏi cùng một câu ở cùng một chỗ, và hai bên tự suy là hai
   * bên sẽ lệch. `undefined` với hồ sơ cũ chưa có trường này — coi như bật, vì
   * siết nhầm ở đây là khoá mất một việc người ta làm được.
   */
  banGiaoDuoc?: boolean;
  /**
   * `0167` — hồ sơ đã có bản mềm ĐÃ LƯU chưa.
   *
   * Cờ RIÊNG với `banGiaoDuoc`, vì màn hình làm hai việc khác nhau: thiếu bản
   * scan thì nút *Bàn giao* xám (việc ngoài phần mềm — in, trình ký, scan);
   * thiếu bản mềm thì nút vẫn sáng và bấm vào mở hộp tạo bản mềm trước, vì đó là
   * việc phần mềm làm được ngay.
   *
   * `undefined` với máy chủ cũ hơn giao diện — coi như ĐÃ CÓ, tức không chen
   * thêm bước nào. Giá trị lùi chọn phía không cản đường: đoán sai theo hướng
   * này thì người dùng nhận `409 BAN_MEM_REQUIRED` và biết phải làm gì; đoán sai
   * hướng kia thì họ bị chặn bởi một bước không có thật.
   */
  coBanMem?: boolean;
  rowVersion: number;
  lines: DongSanPham[];
  attachments: TepDto[];
  /**
   * Bản mềm và file scan của phiên bản LIỀN TRƯỚC (`0183`).
   *
   * `null` khi hồ sơ chưa đi trong luồng duyệt, hoặc không có phiên bản trước —
   * máy chủ quyết định cả hai, giao diện không suy lại từ `status`.
   *
   * Tuỳ chọn vì máy chủ cũ hơn giao diện không gửi trường này; giá trị lùi
   * `undefined` là KHÔNG hiện khối, tức không hứa một thứ chưa có.
   */
  banTruoc?: BanTruocDto | null;
};

export function ChiTietHoSo({ id }: { id: string }) {
  const { bao } = useBaoLoi();
  const { nguoiDung } = usePhien();
  const [hoSo, datHoSo] = useState<HoSo | null>(null);
  const [choPhep, datChoPhep] = useState<string[]>([]);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);
  const [hanhDong, datHanhDong] = useState<string | null>(null);
  /** Dòng sản phẩm đang chờ xác nhận xoá. Nút Xoá nằm ngay trong bảng dữ liệu
      đọc hàng ngày, nên không cho nó xoá thẳng. */
  const [xoaDongId, datXoaDongId] = useState<string | null>(null);
  /** Dòng đang mở để sửa. Cùng biểu mẫu với thêm dòng — xem `ThemDongSanPham`. */
  const [suaDongCu, datSuaDongCu] = useState<DongSanPham | null>(null);
  const [moSua, datMoSua] = useState<'dong' | 'xoa' | null>(null);
  /** `0191` — hộp xác nhận *Lập phiên bản mới* đang mở hay không. */
  const [moBanMoi, datMoBanMoi] = useState(false);
  /**
   * Bản Nháp đang chặn lượt lập phiên bản mới (`0200`).
   *
   * Chỉ mang thứ đọc được TỪ LỖI máy chủ — thân `DRAFT_EXISTS` có `draftPolicyId`
   * chứ không có mã hồ sơ, nên `code` là `null` ở đường ấy. Đường thường thì đọc
   * thẳng `phienBanSau`, ở đó có cả mã.
   */
  const [nhapChan, datNhapChan] = useState<{ id: string; code: string | null } | null>(null);
  const [dangLapBanMoi, datDangLapBanMoi] = useState(false);
  const [dangXoaDong, datDangXoaDong] = useState<string | null>(null);
  /** Cờ riêng, không dùng chung `dangXoaDong`: nút này ở cấp HỒ SƠ, không của một dòng. */
  const [dangCapNhat, datDangCapNhat] = useState(false);
  /**
   * Mặt hàng lượt bấm vừa rồi KHÔNG áp được (`0199`).
   *
   * Máy chủ đã trả sẵn `hong` từ `0194` và giao diện vứt nó đi, nên người dùng
   * bấm nút, chờ, trang tải lại — và khối chênh lệch nằm y nguyên mà không một
   * chữ nào nói vì sao. Đúng chỗ ấy khách hàng đã chốt điều ngược lại: *"sau khi
   * cập nhật xong phần thông tin yêu cầu thay đổi sẽ biến mất"*; nó không biến
   * mất được thì phần mềm phải nói ra.
   */
  const [khongApDuoc, datKhongApDuoc] = useState<string[]>([]);
  /**
   * Mặt hàng lượt bấm vừa rồi ĐÃ RÚT khỏi hồ sơ (`0200`).
   *
   * Tách khỏi `khongApDuoc` chứ không gộp một danh sách: hai bên nói hai chuyện
   * ngược nhau — một bên là *phần mềm đã tự làm, bạn xem lại*, bên kia là *phần
   * mềm không làm được, bạn phải làm*. Trộn chúng vào một câu là để người dùng
   * tự đoán mặt hàng nào rơi vào vế nào.
   */
  const [daRut, datDaRut] = useState<string[]>([]);
  const { di } = useDuong();

  const tai = useCallback(async (signal: AbortSignal) => {
    const [h, a] = await Promise.all([
      layJson<HoSo>(`/policies/${id}`, signal),
      layJson<{ allowed: string[] }>(`/policies/${id}/allowed-actions`, signal),
    ]);
    return { h, a };
  }, [id]);

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    tai(huy.signal)
      .then(({ h, a }) => {
        datHoSo(h);
        datChoPhep(a.allowed ?? []);
      })
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [tai, lan]);

  const taiLai = () => datLan((x) => x + 1);

  /**
   * *Tự động cập nhật* — áp chênh lệch danh mục vào bảng sản phẩm (`0194`).
   *
   * `taiLai()` chứ không sửa tại chỗ: lượt gọi này đổi giá bán Công ty, ngưỡng,
   * tỷ lệ CK **và** trạng thái dòng của nhiều hàng cùng lúc, mà những con số ấy
   * do MÁY CHỦ tính (`SQL_TRANG_THAI_DONG`, `computeLine`). Dựng lại chúng ở đây
   * là chép phép tính sang giao diện — đúng thứ `FE-27` cấm.
   *
   * Khối lệch tự biến mất sau lượt tải lại: máy chủ tính lại chênh lệch và không
   * còn gì để bày. Không có bước ẩn khối nào ở giao diện — một cái ẩn bằng tay
   * sẽ nói dối đúng ở ca có dòng KHÔNG áp được.
   *
   * `hong` ĐỌC TỪ THÂN PHẢN HỒI (`0199`), không dựng lại ở đây. Chỉ máy chủ biết
   * mặt hàng nào vừa từ chối — nó vừa hỏi danh mục xong — và câu trả lời ấy đã
   * nằm sẵn trong thân từ `0194`; bản trước chỉ quên đọc.
   */
  const apDungThayDoi = async () => {
    datLoi(null);
    datKhongApDuoc([]);
    datDaRut([]);
    datDangCapNhat(true);
    try {
      const r = await dang<{ hong?: string[]; daRut?: string[] }>(
        `/policies/${id}/ap-dung-thay-doi`,
      );
      datKhongApDuoc(Array.isArray(r?.hong) ? r.hong : []);
      datDaRut(Array.isArray(r?.daRut) ? r.daRut : []);
      taiLai();
    } catch (e) {
      bao(e);
    } finally {
      datDangCapNhat(false);
    }
  };

  const xoaDong = async (lineId: string) => {
    datLoi(null);
    datDangXoaDong(lineId);
    try {
      await xoa(`/policies/${id}/lines/${lineId}`);
      taiLai();
    } catch (e) {
      bao(e);
    } finally {
      datDangXoaDong(null);
    }
  };

  /**
   * THÊM LẠI một dòng đã rút (`0186`).
   *
   * KHÔNG hỏi xác nhận, ngược với `xoaDong`: hộp xác nhận có mặt vì xoá là thứ
   * người dùng không lùi lại được dễ dàng, còn đây CHÍNH LÀ nút lùi lại. Bắt xác
   * nhận một thao tác hoàn tác là bắt trả lời hai lần cho một lần bấm nhầm.
   *
   * Dùng lại `dangXoaDong` làm cờ "dòng này đang có việc chạy": hai thao tác
   * không bao giờ cùng chạy trên một dòng — dòng đã rút không có nút Xoá, dòng
   * còn sống không có nút Thêm lại — nên một cờ là đủ, và hai cờ là hai chỗ phải
   * nhớ dọn.
   */
  const themLaiDong = async (lineId: string) => {
    datLoi(null);
    datDangXoaDong(lineId);
    try {
      await dang(`/policies/${id}/lines/${lineId}/khoi-phuc`);
      taiLai();
    } catch (e) {
      bao(e);
    } finally {
      datDangXoaDong(null);
    }
  };

  /**
   * LẬP PHIÊN BẢN MỚI ngay từ trang hồ sơ (`0191`).
   *
   * Khách hàng chốt 08/09: TDV xem một CSBH đang hiệu lực thì lập được bản mới
   * tại chỗ, không phải vòng qua trang khách hàng.
   *
   * Gọi ĐÚNG đường mà trang *Lập hồ sơ* vẫn gọi — `POST /policies` với `mode:
   * 'NEW_VERSION'` — chứ không thêm một đường máy chủ riêng. Hai lối vào cùng
   * một việc thì phải đi chung một chốt chặn: `assertInScope`, khách đã ngừng
   * hợp tác, và luật *"chưa có CSBH nào thì không lập bản mới được"* đều nằm ở
   * đó. Một đường thứ hai là một bản sao sẽ trôi.
   *
   * `lines: []` — bản mới CHÉP SẴN toàn bộ dòng của bản đang hiệu lực; đây là
   * phần TDV thêm vào, và ở lối tắt này họ chưa thêm gì.
   *
   * Đi thẳng sang hồ sơ vừa lập: người bấm nút này đang muốn SOẠN, và để họ ở
   * lại trang cũ thì việc kế tiếp của họ là tự đi tìm bản nháp vừa tạo.
   *
   * ---------------------------------------------------------------------------
   * `0200` — KHÁCH ĐÃ CÓ BẢN NHÁP thì KHÔNG còn thao tác này nữa.
   * ---------------------------------------------------------------------------
   *
   * `0197` cấm lập hồ sơ thứ hai cho khách đang giữ một bản Nháp, và `0088` khai
   * `DRAFT_EXISTS` là `dang: 'im'` — đúng cho màn hình *Lập hồ sơ*, nơi mã ấy
   * đổi hẳn cách hỏi thay vì bày một dải đỏ. Lối tắt `0191` thì không có nhánh
   * ấy, nên nó nuốt lỗi rồi đứng yên: **người dùng bấm một cái nút và không có
   * gì xảy ra**, kể cả một câu báo.
   *
   * Chữa bằng cách để hộp thoại BIẾT TRƯỚC, không phải bắt lỗi cho đẹp hơn:
   * `phienBanSau` (`0191`) đã trả về bản kế nhiệm đang dở kèm trạng thái, nên
   * bản ở `NHAP` là thứ đọc ra được ngay lúc dựng trang. Bấm rồi mới biết là
   * một vòng mạng để nhận về một câu lẽ ra đã hiện sẵn.
   *
   * Vẫn GIỮ nhánh bắt `DRAFT_EXISTS` ở đây, và nó không thừa: `phienBanSau` chỉ
   * thấy bản kế nhiệm của CHÍNH hồ sơ này (`supersedes_id`), còn chốt chặn hỏi
   * theo KHÁCH HÀNG — hai câu hỏi trùng nhau ở mọi dữ liệu hôm nay, nhưng trùng
   * nhau không phải là một. Cộng thêm khe thời gian: một bản Nháp có thể ra đời
   * giữa lúc mở trang và lúc bấm.
   */
  const lapPhienBanMoi = async () => {
    if (!hoSo) return;
    datLoi(null);
    datDangLapBanMoi(true);
    try {
      const moi = await dang<{ id: string }>('/policies', {
        customerId: hoSo.customerId,
        mode: 'NEW_VERSION',
        lines: [],
      });
      datMoBanMoi(false);
      di(`/ho-so/${moi.id}`);
    } catch (e) {
      const l = e as { code?: string; body?: Record<string, unknown> };
      const nhapId = l?.body?.['draftPolicyId'];
      // Thiếu id thì rơi về đường lỗi thường: một nút *Mở bản Nháp* không biết
      // mở cái nào thì tệ hơn một dải đỏ (cùng lập luận `0197` ở `LapHoSo`).
      if (l?.code === 'DRAFT_EXISTS' && typeof nhapId === 'string') {
        datNhapChan({ id: nhapId, code: null });
      } else bao(e);
    } finally {
      datDangLapBanMoi(false);
    }
  };

  /** Hộp *Xem bản mềm* đang mở hay không (`0054`). */
  const [moBanMem, datMoBanMem] = useState(false);
  /**
   * Hộp TẠO BẢN MỀM (`0167`), và nó nhớ mình được mở để làm gì.
   *
   *   `'tep'`     — Sale Admin bấm *Tạo bản mềm* ở khối tệp. Lưu xong là xong.
   *   `'banGiao'` — họ bấm *Bàn giao* trên một hồ sơ chưa có bản mềm. Lưu xong
   *                 thì hộp xác nhận bàn giao mở ra ngay, không bắt bấm lại.
   *
   * Một state mang cả LÝ DO chứ không phải một `boolean` cộng một cờ thứ hai:
   * "đang mở" và "mở để bàn giao" không độc lập nhau, và hai cờ rời thì trạng
   * thái `đóng + để bàn giao` viết ra được mà không có nghĩa gì.
   */
  const [moTaoBanMem, datMoTaoBanMem] = useState<'tep' | 'banGiao' | null>(null);
  const [moHopDong, datMoHopDong] = useState(false);

  /** Tệp đang mở xem trực tiếp — hợp đồng (`0051`). */
  const [dangXem, datDangXem] = useState<{
    tieuDe: string;
    duong: string;
    duongTai: string;
    tenTep: string;
  } | null>(null);

  if (loi !== null && hoSo === null) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (!hoSo) return <DangTai />;

  // KHÔNG hiện "Tổng giá thu về" dưới bảng nữa. Cộng dồn giá thu về của nhiều
  // sản phẩm khác nhau ra một con số không có nghĩa nghiệp vụ nào: mỗi dòng là
  // một mức giá cho một mặt hàng, không phải một khoản tiền của cùng một giao
  // dịch. Con số ấy đứng ngay dưới bảng thì người đọc mặc nhiên hiểu là giá trị
  // hợp đồng.

  // Sửa nội dung cần CẢ HAI: máy chủ cho phép (hồ sơ đang ở trạng thái sửa được)
  // và vai trò có quyền. Hai điều kiện độc lập — một Kế toán mở hồ sơ Nháp của
  // TDV thì `allowed-actions` rỗng, nhưng nếu không kiểm quyền thì một hồ sơ bị
  // trả lại vẫn bày nút sửa cho họ.
  const dangSua = suaDuoc(choPhep) && can(nguoiDung?.role, 'suaHoSo');

  /**
   * Bản Nháp đang chặn lượt lập phiên bản mới, đọc được TRƯỚC khi bấm (`0200`).
   *
   * `phienBanSau` đứng trước trong phép chọn? KHÔNG — `nhapChan` đứng trước, vì
   * nó đến từ chính lượt gọi vừa bị từ chối, tức nó nói về hiện tại còn
   * `phienBanSau` nói về lúc trang được tải.
   *
   * Chỉ nhận trạng thái `NHAP`. Bản kế nhiệm ở `CHO_TBP_DUYET` hay bất kỳ bước
   * duyệt nào khác thì **không chặn gì cả** — `create` vẫn cho lập bản thứ hai,
   * và ở đó cảnh báo của `0191` mới là câu đúng.
   */
  const nhapDangChan =
    nhapChan ??
    (hoSo?.phienBanSau && hoSo.phienBanSau.status === 'NHAP'
      ? { id: hoSo.phienBanSau.id, code: hoSo.phienBanSau.code }
      : null);

  /*
    Lọc LẦN NỮA theo vai trò (`0038`), dù máy chủ đã lọc.

    Máy chủ là chốt thật: `/allowed-actions` trả về đúng những hành động vai trò
    này làm được. Giữ thêm phép lọc ở đây vì `FE-23` quét chính bảng quyền để
    khẳng định Ban lãnh đạo không có nút ghi nào — và vì một danh sách cũ còn
    nằm trong bộ nhớ trình duyệt sau khi đổi tài khoản thì đây là thứ chặn nó.
  */
  const thaoTac = choPhep.filter((a) => canHanhDong(nguoiDung?.role, a));

  return (
    <section className="trang">
      {/*
        THAO TÁC nằm ở GÓC TRÊN BÊN PHẢI, ngang hàng với mã hồ sơ (`0061`).

        Trước đó chúng nằm dưới đáy trang, sau bảng sản phẩm, sau tệp đính kèm và
        sau nhóm nút tải văn bản. Người vào đây để KÝ — phần lớn lượt mở màn hình
        này — phải cuộn qua toàn bộ nội dung mới tới được việc của mình, và ở hồ
        sơ hai chục dòng thì nút nằm ngoài màn hình đầu tiên.

        Đặt cạnh mã hồ sơ vì hai thứ ấy trả lời cùng một câu: "đây là hồ sơ nào,
        và tôi làm gì với nó".
      */}
      <div className="dau-trang">
        {/*
          `0198` — mã hồ sơ sửa được tại chỗ khi còn ở *Nháp*.

          Điều kiện dựng ở ĐÂY chứ không trong component: `SuaMaHoSo` chỉ biết
          "cho sửa hay không", còn *ai* và *lúc nào* là luật của hồ sơ. Máy chủ
          gác cùng luật ở `doiMa` (`mustEdit` + đúng `NHAP`), nên cờ này chỉ để
          đừng bày ra một cái bút chì bấm vào sẽ nhận lỗi.

          `taiLai()` chứ không vá `hoSo.code` tại chỗ: mã đi vào nhiều chỗ khác
          trên trang này về sau (tên tệp bản mềm, hộp xoá hồ sơ đòi gõ lại mã),
          và một bản sao cập nhật nửa vời khó truy hơn hẳn một lượt tải lại.
        */}
        {/*
          `0206` — MÃ và TRẠNG THÁI đứng cùng một hàng, khách hàng chốt 19/09.

          Bọc thêm một lớp chứ không thả `<Nhan>` thẳng vào `.dau-trang`:
          khối ấy là `space-between` (mã bên trái, dải nút bên phải), nên một
          phần tử thứ ba sẽ trôi ra giữa trang.

          KHÔNG đưa nhãn vào trong `SuaMaHoSo`: component ấy đổi hẳn hình dạng
          khi bấm bút chì (ô nhập + hai nút + một dòng lỗi), và nhét nhãn vào
          giữa là nó phải biết mình đang mang thêm cái gì ở cả hai chế độ.
        */}
        <div className="dau-trang-ten">
          <SuaMaHoSo
            hoSoId={hoSo.id}
            ma={hoSo.code}
            // `dangSua` đã trả lời "TDV này sửa được hồ sơ này không" (suy từ
            // `allowed-actions`, tức từ chính máy trạng thái). Vế `NHAP` là phần
            // HẸP HƠN của riêng mã hồ sơ — xem `doiMa`.
            suaDuoc={dangSua && hoSo.status === 'NHAP'}
            xong={taiLai}
          />
          <Nhan trangThai={hoSo.status} />
        </div>
        {/*
          *Xem bản mềm* đứng CÙNG HÀNG với các nút thao tác (`0054`), và từ
          `0163` CHỈ SALE ADMIN thấy nó.

          Tới `0162` nó mở cho cả năm vai trò đọc được hồ sơ, kể cả Ban lãnh đạo.
          Khách hàng chốt 29/08 rằng bản mềm không phải văn bản đi qua luồng
          duyệt mà là thao tác IN của Sale Admin ở bước B8 — nên chỉ người ấy cần
          nút. Hỏi lại riêng về Ban lãnh đạo và họ chốt đúng chữ *"chỉ giữ ở
          SA"*, dù đó là nút duy nhất trên trang này của vai trò chỉ-đọc.

          Máy chủ chặn cùng luật ở `RenderController` (`READERS`), nên ẩn nút chỉ
          là đừng bày ra một thứ bấm vào chỉ nhận 403. Tên vai trò khai ở
          `can.ts` chứ không viết thẳng ở đây — `tests/web/quyen.test.ts` cấm, và
          cái cấm ấy là thứ giữ cho một quyền không có hai bản.
        */}
        <div className="nhom-nut nhom-nut-dau">
          {xemBanMemDuoc(nguoiDung?.role) && (
            <button type="button" className="nut nut-nhe" onClick={() => datMoBanMem(true)}>
              Xem bản mềm
            </button>
          )}
          {/*
            *Xuất hợp đồng* và *Xoá hồ sơ* LÊN ĐÂY từ `0071`.

            Chúng vốn nằm giữa trang, mỗi cái một mục có tiêu đề riêng — nên hai
            việc tác động lên CẢ hồ sơ lại nằm dưới bảng sản phẩm, còn nút *Xem
            bản mềm* thì ở trên cùng. Người dùng phải cuộn để tìm một nút mà họ
            biết chắc là có.
          */}
          {/*
            *Lập phiên bản mới* (`0191`) — CHỈ ở hồ sơ ĐANG CÓ HIỆU LỰC.

            Trạng thái là một nửa điều kiện, vai trò là nửa kia, và cả hai đều
            cần: hồ sơ đang hiệu lực cũng hiện ra với TBP, Kế toán và Sale Admin
            (họ nằm trong bốn cột người), mà lập hồ sơ là việc của TDV.

            KHÔNG đọc `allowed-actions`: danh sách ấy là các bước của MÁY TRẠNG
            THÁI trên chính hồ sơ này, còn đây là lượt LẬP MỘT HỒ SƠ KHÁC. Nhét
            nó vào máy trạng thái là khai một bước chuyển không có thật —
            `DANG_CO_HIEU_LUC` không đi đâu cả cho tới khi bản mới được duyệt.

            Máy chủ vẫn là chốt thật (`assertInScope` ở `create`); ẩn nút chỉ để
            đừng bày ra thứ bấm vào sẽ nhận 403.
          */}
          {hoSo.status === 'DANG_CO_HIEU_LUC' && can(nguoiDung?.role, 'lapHoSo') && (
            <button type="button" className="nut nut-nhe" onClick={() => datMoBanMoi(true)}>
              Lập phiên bản mới
            </button>
          )}
          {can(nguoiDung?.role, 'xuatHopDong') && hoSo.xuatHopDongDuoc === true && (
            <button type="button" className="nut nut-nhe" onClick={() => datMoHopDong(true)}>
              Xuất hợp đồng
            </button>
          )}
          {thaoTac.map((a) => {
            /*
             * `0160` — *Bàn giao* XÁM khi chưa có bản scan, không biến mất.
             *
             * Giấu nút thì Sale Admin nhìn một màn hình không có việc gì để bấm
             * và không có gì nói vì sao. Xám kèm lý do thì việc phải làm nằm
             * ngay trên cùng màn hình ấy — khối *Tệp đính kèm* ở ngay dưới.
             *
             * Đây KHÔNG phải chốt chặn: máy chủ vẫn trả `409 SCAN_REQUIRED` cho
             * ai gọi thẳng API. Nó chỉ để đừng bày ra một nút bấm vào chỉ nhận
             * lỗi — cùng nguyên tắc `can.ts` đã viết cho 403.
             */
            const thieuScan = a === 'SA_HANDOVER' && hoSo.banGiaoDuoc === false;
            return (
              <button
                key={a}
                type="button"
                className={a.includes('REJECT') ? 'nut nut-canh-bao' : 'nut nut-chinh'}
                disabled={thieuScan}
                {...(thieuScan
                  ? { title: 'Chưa có bản scan — tải bản scan lên rồi mới bàn giao được' }
                  : {})}
                onClick={() => {
                  /*
                   * BÀN GIAO KHI CHƯA CÓ BẢN MỀM: chen bước tạo vào trước
                   * (`0167`, chốt 31/08).
                   *
                   * Không chặn, và không bắt người dùng đi tìm nút: hệ thống
                   * biết chính xác cái đang thiếu và dựng được nó ngay. Máy chủ
                   * vẫn có chốt thật (`409 BAN_MEM_REQUIRED`) cho ai gọi thẳng
                   * API — đây chỉ là đường đi thuận cho người bấm nút.
                   */
                  if (a === 'SA_HANDOVER' && hoSo.coBanMem === false) {
                    datMoTaoBanMem('banGiao');
                    return;
                  }
                  datHanhDong(a);
                }}
              >
                {HANH_DONG_NHAN[a] ?? a}
              </button>
            );
          })}
          {/* Xoá đứng CUỐI nhóm và mang màu cảnh báo: nó là thao tác không lùi
              được duy nhất ở đây, nên nó không nằm cạnh chỗ tay hay bấm. */}
          {hoSo.xoaDuoc && can(nguoiDung?.role, 'xoaHoSo') && (
            <button type="button" className="nut nut-canh-bao" onClick={() => datMoSua('xoa')}>
              Xoá hồ sơ
            </button>
          )}
        </div>
      </div>

      {/*
        LÝ DO nút *Bàn giao* đang xám, viết ra thành chữ (`0160`).

        Thuộc tính `title` một mình là không đủ: trình đọc màn hình không đọc nó
        trên một nút `disabled`, và trên màn hình cảm ứng thì không có thao tác
        rê chuột nào để nó hiện ra. Một nút xám không lời giải thích là một màn
        hình bí — người dùng biết mình không bấm được, không biết vì sao.

        Chỉ hiện khi *Bàn giao* thật sự nằm trong dải nút, tức đúng người đúng
        bước. Hiện ở mọi lúc là dạy người ta bỏ qua nó.
      */}
      {thaoTac.includes('SA_HANDOVER') && hoSo.banGiaoDuoc === false && (
        <p className="ghi-chu" role="status">
          {/*
            TÊN KHỐI GỌI ĐÚNG TÊN NÓ ĐANG MANG (`0181`).

            Câu này trỏ tới khối *Tệp đính kèm* — một cái tên đã đổi từ `0054`
            và không còn trên màn hình từ đó. Một lỗi có sẵn, tìm ra ở lượt đổi
            nhãn này: hai lượt đổi tên khối (`0054`, rồi `0181`) đều không ai
            nghĩ tới câu chỉ đường nằm cách đó hai trăm dòng.

            Đây đúng là thứ `0170` đã ghi bằng chữ khác — *"để lại chỗ cũ là trỏ
            vào một khối không còn ở đó, và không test nào bắt được vì không có
            gì hỏng"*. Ca kiểm của `0160` chỉ đòi có "chưa có bản scan" trên màn
            hình, nên nó xanh suốt với một chỉ dẫn sai.
          */}
          <strong>Chưa bàn giao được:</strong> hồ sơ chưa có bản scan. Tải bản scan lên ở khối{' '}
          <em>File SCAN bản cứng</em> bên dưới, rồi nút <em>Bàn giao</em> sẽ dùng được.
        </p>
      )}

      {/*
        THÔNG TIN HỒ SƠ, mỗi thứ một dòng có nhãn (`0061`).

        Tới `0060` cả khối này là MỘT dòng chữ xám dưới tiêu đề: "Phiên bản 2 ·
        Ngày áp dụng 01/08/2026 · Có hiệu lực …". Ba con số ngày tháng nối nhau
        bằng dấu chấm giữa dòng thì mắt phải đọc cả câu mới tách được cái mình
        cần, và ngày soạn thảo, người đề nghị, khách hàng thì không có chỗ nào.

        Khách hàng là NHÓM RIÊNG, không trộn vào cùng lưới: nó là một thực thể
        khác, có màn hình riêng, và trộn chung thì "Loại" đứng cạnh "Phiên bản"
        đọc ra như hai thuộc tính của cùng một thứ.
      */}
      <ThongTinHoSo hoSo={hoSo} />

      {/*
        AI ĐÃ DUYỆT (`0056`).

        Trước đó đầu màn hình chỉ có mã, phiên bản, ngày áp dụng và trạng thái —
        nên câu hỏi thường gặp nhất khi mở một hồ sơ đã đi được vài bước ("ai ký
        cái này?") phải trả lời bằng cách sang màn hình *Nhật ký*. Một chuyến đi
        cho một dòng thông tin.

        Chỉ hiện bước ĐÃ XẢY RA. Bày sẵn bốn ô rỗng chờ điền là bốn dòng chữ
        không nói gì trên mọi hồ sơ còn ở Nháp.
      */}
      <DaDuyet nguoiDuyet={hoSo.nguoiDuyet} />

      {/*
        KHỐI LÝ DO nói đủ BỐN VẾ (`0189`): nói gì · ai · từ bước nào · lúc nào.

        Tới `0188` nó chỉ có mỗi câu chữ, và người đọc phải mở màn hình Nhật ký
        rồi tự dò xem dòng nào ứng với câu ấy — trong khi hồ sơ đi qua mười bước
        và có tới bốn hành động khác nhau kèm lý do (Trưởng bộ phận trả lại,
        Hoàn duyệt, Kế toán không tiếp nhận L1, và L2). Cùng một câu *"thiếu
        chứng từ"* đến từ hai bàn khác nhau là hai việc phải làm khác nhau.

        `lyDoTraLai` do MÁY CHỦ dựng từ nhật ký; `lastReason` giữ lại làm đường
        lùi cho hồ sơ mà dòng nhật ký mang lý do đã bị dọn (cửa sổ audit sáu
        tháng của `0087` không đụng `pol.policy_event`, nhưng đường lùi này rẻ và
        nó giữ cho khối không biến mất nếu điều đó đổi).
      */}
      {(hoSo.lyDoTraLai ?? hoSo.lastReason) && (
        <div className="ghi-chu-tra-lai" role="note">
          <span className="hop-tieu-de">Lý do gần nhất</span>
          {hoSo.lyDoTraLai ? (
            <>
              <p className="lai-lich-ly-do">
                <strong>{nhanHanhDong(hoSo.lyDoTraLai.hanhDong)}</strong>
                {/* NHÃN HÀNH ĐỘNG đã nói ra VAI TRÒ — *"Kế toán không tiếp nhận
                    lần 1"* — nên không in vai trò lần nữa. Ca kiểm đầu tiên của
                    `0189` tìm ra chỗ lặp này: câu dựng ra là *"Trưởng bộ phận
                    trả lại để chỉnh sửa — Trưởng bộ phận Trần Thị B"*.

                    Nhờ vậy `ten` rỗng cũng không mất câu trả lời cho *"bàn nào
                    trả về"* — vế ấy nằm ở nhãn hành động, không ở cái tên. */}
                {hoSo.lyDoTraLai.ten && <>{' — '}{hoSo.lyDoTraLai.ten}</>}
                {hoSo.lyDoTraLai.tuTrangThai && (
                  <> · từ bước {nhanTrangThai(hoSo.lyDoTraLai.tuTrangThai)}</>
                )}
                {hoSo.lyDoTraLai.luc && <> · {ngayGio(hoSo.lyDoTraLai.luc)}</>}
              </p>
              {hoSo.lyDoTraLai.lyDo}
            </>
          ) : (
            hoSo.lastReason
          )}
        </div>
      )}

      {loi !== null && <BaoLoi loi={loi} thuLai={taiLai} />}

      {/*
        Chênh lệch so với danh mục, đặt NGAY TRƯỚC bảng số (`0050`).
        
        Cho tới `0049` thông tin này chỉ có ở box *Yêu cầu cập nhật* trên trang
        tổng quan. Nhưng người sắp ký thường mở thẳng hồ sơ — từ thư báo, từ hộp
        việc, từ danh sách — và ở đó không có gì nói rằng con số họ đang nhìn đã
        lỗi thời. Box kia chỉ cứu được người tình cờ ghé qua trang tổng quan.

        Đặt TRÊN bảng sản phẩm, không phải dưới: đọc sau khi đã quét hết mười cột
        số thì đã muộn — người ta đã tin vào những con số ấy rồi.
      */}
      {/*
        MẶT HÀNG VỪA BỊ RÚT — đứng NGOÀI khối chênh lệch (`0200`).

        Khác hẳn câu *"chưa cập nhật được"*, thứ sống được bên trong khối nhờ một
        bất biến (`hong` không rỗng thì luôn còn ít nhất một mục lệch). Ở đây thì
        ngược: rút xong là mục `PRODUCT` của chính mặt hàng ấy biến mất, nên nếu
        nó là mục lệch duy nhất thì **cả khối biến mất** — và một câu nằm trong
        khối sẽ biến mất theo, đúng lượt nó cần nói nhất.
      */}
      {daRut.length > 0 && (
        <p className="ghi-chu" role="status">
          Đã rút <strong>{daRut.length} mặt hàng</strong> đã vô hiệu hoá khỏi hồ sơ:{' '}
          <strong>{daRut.join(', ')}</strong>. Dòng thừa kế từ bản CSBH trước vẫn nằm lại trong
          bảng dưới đây với nhãn <em>Đã xoá</em> để người duyệt thấy được, và chỉ biến mất hẳn khi
          hồ sơ có hiệu lực. Bấm <em>Thêm lại</em> nếu bạn muốn giữ.
        </p>
      )}

      {(hoSo.lech ?? []).length > 0 && (
        <div className="canh-bao-lech" role="note">
          <span className="hop-tieu-de">Số trên hồ sơ này đã lệch so với danh mục hiện tại</span>
          {/*
            HAI CÂU CHO HAI HOÀN CẢNH (`0194`).

            Tới `0193` khối này chỉ hiện trên hồ sơ ĐÃ ĐÓNG BĂNG, nên một câu là
            đủ. Từ `0194` nó hiện cả lúc TDV đang sửa — và ở đó câu *"không ai
            sửa một văn bản đang chờ chữ ký"* vừa sai vừa mâu thuẫn với cái nút
            ngay bên dưới nó.
          */}
          {dangSua ? (
            <p className="ghi-chu">
              Bảng dưới đây vẫn là con số hồ sơ đang giữ. Bấm <strong>Tự động cập nhật</strong> để
              lấy số mới của danh mục — <strong>giá bán buôn và các khoản CPBH bạn đã nhập giữ
              nguyên</strong>, chỉ giá bán Công ty, ngưỡng và tỷ lệ CK tính lại.
            </p>
          ) : (
            <p className="ghi-chu">
              Hồ sơ đã <strong>đóng băng</strong> giá và ngưỡng lúc gửi duyệt — đó là chủ ý, không ai
              sửa một văn bản đang chờ chữ ký. Bảng dưới đây vẫn là con số đã đóng băng.
            </p>
          )}
          <DanhSachLech lech={hoSo.lech ?? []} />
          {/*
            LƯỢT BẤM VỪA RỒI BỎ LẠI NHỮNG GÌ (`0199`).

            Chỗ này sống được bên TRONG khối là nhờ một bất biến của máy chủ:
            **một mặt hàng vào `hong` thì luôn để lại ít nhất một mục lệch**, nên
            khối không bao giờ biến mất trong khi câu này còn cần nói. Ba nguyên
            nhân của `hong` đều tự sinh ra một mục: vô hiệu hoá và biến mất khỏi
            danh mục ra mục `PRODUCT`, còn `computeLine` ném thì giá bán Công ty
            đã đổi, tức đã có mục `PRICE`. Bất biến ấy có ca kiểm riêng bên
            `policy.test.ts` — nó là điều kiện để chỗ này đúng, không phải một
            nhận xét bên lề.
          */}
          {khongApDuoc.length > 0 && (
            <p className="ghi-chu" role="status">
              Đã cập nhật những dòng lấy được số mới. <strong>{khongApDuoc.length} mặt hàng</strong>{' '}
              chưa cập nhật được vì danh mục không còn số hiện hành để lấy:{' '}
              <strong>{khongApDuoc.join(', ')}</strong>. Kiểm lại trong <em>Danh mục sản phẩm</em>,
              hoặc rút mặt hàng đó khỏi hồ sơ — để nguyên thì lượt gửi duyệt sẽ dừng ở đúng những
              dòng này.
            </p>
          )}
          {/*
            NÚT CHỈ CÓ KHI SỬA ĐƯỢC, và điều kiện ấy là chốt chặn thứ hai chứ
            không phải chốt duy nhất: `mustEdit` bên máy chủ gác cả ba vế (phạm
            vi · đúng TDV phụ trách · trạng thái sửa được). Giấu nút ở đây là để
            người duyệt không nhìn thấy một thao tác họ không được phép làm —
            không phải để thay cho phép kiểm.
          */}
          {dangSua && (
            <div className="nhom-nut">
              <button
                type="button"
                className="nut nut-chinh"
                disabled={dangCapNhat}
                onClick={apDungThayDoi}
              >
                {dangCapNhat ? 'Đang cập nhật…' : 'Tự động cập nhật'}
              </button>
            </div>
          )}
        </div>
      )}

      <h2>Sản phẩm</h2>
      {dangSua && (
        <div className="nhom-nut">
          {/* `0180` — nút *Sửa ngày áp dụng* GỠ HẲN: ngày áp dụng thuộc về từng
              dòng, và sửa nó đi cùng đường với giá bán buôn của chính dòng ấy
              (nút *Sửa* trên mỗi hàng của bảng). Một nút ở cấp hồ sơ sẽ phải hỏi
              "đổi ngày của dòng nào". */}
          <button type="button" className="nut nut-chinh" onClick={() => datMoSua('dong')}>
            Thêm sản phẩm
          </button>
        </div>
      )}
      <BangSanPham
        dong={hoSo.lines}
        {...(dangSua
          ? {
              xoaDong: datXoaDongId,
              suaDong: datSuaDongCu,
              // `0186` — đi CÙNG BỘ với hai prop trên, không gác thêm điều kiện
              // nào: `dangSua` đã đúng bằng hai trạng thái khách hàng chốt cho
              // phép thêm lại (Nháp · Yêu cầu chỉnh sửa), và `mustEdit` bên máy
              // chủ canh lại chính hai trạng thái ấy.
              themLaiDong: (lineId: string) => void themLaiDong(lineId),
              dangXoa: dangXoaDong,
            }
          : {})}
      />

      {/*
        KHỐI *GIẤY TỜ HỒ SƠ* ĐÃ BỎ (`0172`, chốt 01/09).

        Khách hàng: *"bỏ mục giấy tờ hồ sơ, không cần trong thông tin của hồ sơ"*.
        Đây là câu tiếp theo của `0171`, lượt bỏ dòng *File đính kèm* khỏi hai mẫu
        hồ sơ: giấy tờ TDV đính lúc lập thôi xuất hiện trên tờ giấy, và giờ thôi
        xuất hiện trên màn hình.

        HỆ QUẢ, nói thẳng vì nó rộng hơn một khối bị ẩn: đây là chỗ DUY NHẤT của
        giao diện đính được tệp loại `HO_SO`, nên tính năng ấy hết đường vào —
        tệp đã đính ở hồ sơ cũ vẫn nằm nguyên trong CSDL và trên kho, chỉ không
        còn màn hình nào bày ra. Đường máy chủ (`POST /policies/:id/attachments`
        với `kind: 'HO_SO'`) GIỮ NGUYÊN, vì gỡ nó là một quyết định khác — nó vẫn
        có chốt chặn vai trò và trạng thái, và cần lại thì chỉ phải dựng lại phần
        màn hình.
      */}

      {/*
        HỒ SƠ PHÁP LÝ CỦA KHÁCH HÀNG, ngay tại đây (`0162`, chốt 29/08).

        Người duyệt cần đối chiếu giấy phép kinh doanh với thông tin trên hồ sơ,
        và trước lượt này họ phải rời trang, mở khách hàng ra, rồi quay lại — ba
        lần chuyển màn hình giữa lúc đang đọc một hồ sơ chờ chữ ký của mình.

        DÙNG LẠI `HoSoPhapLy`, không chép một bản chỉ-đọc. Nó đã nhận cờ
        `choPhepGhi` từ `0069`, và nó cũng đã tự lo phần xem ảnh, xem PDF, tải
        về. Một bản sao rút gọn ở đây là một chỗ thứ hai phải sửa mỗi lần thêm
        một loại giấy tờ — và là chỗ sẽ quên.

        `choPhepGhi={false}` LUÔN, kể cả với TDV phụ trách: trang này là chỗ đọc
        hồ sơ CSBH, không phải chỗ quản lý giấy tờ khách hàng. Sửa thì sang trang
        khách hàng, nơi việc ấy có đủ ngữ cảnh — liên kết nằm ngay ở ô *Mã khách
        hàng* phía trên. Máy chủ vẫn chặn đúng luật ấy (`0069`), nên đây chỉ là
        chuyện đừng bày ra vùng tải lên ở một màn hình không dành cho nó.

        Khối tự lo lỗi của riêng nó (`BaoLoi` bên trong): lời gọi sang `customer`
        hỏng thì mất đúng mục này, không mất cả trang hồ sơ.
      */}
      <HoSoPhapLy
        khachHangId={hoSo.customerId}
        choPhepGhi={false}
        tieuDe="Hồ sơ pháp lý của khách hàng"
        moTa="Giấy tờ của khách hàng, không phải của hồ sơ này. Sửa hoặc bổ sung ở trang khách hàng."
      />

      {/*
        MỤC *Hợp đồng* VÀ NÚT *Xoá hồ sơ* ĐÃ LÊN ĐẦU TRANG (`0071`).

        Cả hai tác động lên CẢ hồ sơ, nên chúng thuộc về nhóm nút ở góc trên bên
        phải cùng với *Xem bản mềm* và các thao tác duyệt — không phải hai mục
        riêng nằm dưới bảng sản phẩm, nơi người dùng phải cuộn xuống mới thấy.

        Điều kiện hiện nút thì giữ nguyên từng chữ: `xuatHopDongDuoc` do máy chủ
        tính theo mốc tiếp nhận lần 1 (muc 8.3), `xoaDuoc` cũng do máy chủ tính —
        hồ sơ *Từ chối* xoá được mà không có hành động nào đi ra, nên không suy
        ra được từ `allowed-actions` (`0039`).
      */}

      {/*
        LỊCH SỬ ở cuối cùng, gập lại (`0061`).

        Nó là thứ người ta tra CHỦ ĐỘNG — "ai trả hồ sơ này về, lý do gì" — chứ
        không phải thứ cần đọc để làm việc hôm nay, nên nó không được chiếm chỗ
        phía trên. Nhưng trước `0061` nó chỉ có một liên kết bé xíu trên dòng
        tiêu đề dẫn sang màn hình khác, và một liên kết như thế thì phần lớn
        người dùng không biết là có.
      */}
      {/*
        `0163` — LUÔN hỏi mẫu, ở mọi trạng thái hồ sơ.

        Tới `0162` chỗ này truyền `mauDaGan`: hồ sơ đã gửi duyệt mang sẵn mẫu
        đóng băng của nó nên hộp mở ra là thấy ngay nội dung. Không còn "mẫu của
        hồ sơ" nữa — mẫu là tham số của lượt IN — nên hộp này giống hệt hộp xuất
        hợp đồng ngay dưới: chọn mẫu, rồi mới dựng.
      */}
      {moBanMem && (
        <XemBanMem hoSoId={hoSo.id} maHoSo={hoSo.code} dong={() => datMoBanMem(false)} />
      )}

      {/*
        HỘP TẠO BẢN MỀM (`0167`) — cùng thành phần với hộp xem thử, khác đúng hai
        prop: lọc còn mẫu ĐẦY ĐỦ, và có hàm lưu.

        Lưu đi HAI BƯỚC, đúng đường mà lượt tải bản scan đang đi: `document` dựng
        PDF rồi ghi tệp vào kho, `policy` gắn tệp ấy vào hồ sơ. Giữ nguyên hình
        dạng ấy để `attach` vẫn là chỗ DUY NHẤT quyết định một tệp có vào hồ sơ
        hay không — và để phép dọn tệp mồ côi khi hồ sơ từ chối vẫn chạy.
      */}
      {moTaoBanMem !== null && (
        <XemBanMem
          hoSoId={hoSo.id}
          maHoSo={hoSo.code}
          chiLoaiMau="HO_SO"
          khiLuu={async (mauId) => {
            const x = await dang<{ objectKey: string; fileName: string; sizeBytes: string }>(
              `/policies/${hoSo.id}/render/luu?mauId=${mauId}`,
              {},
            );
            await dang(`/policies/${hoSo.id}/attachments`, {
              kind: 'BAN_MEM',
              fileName: x.fileName,
              objectKey: x.objectKey,
              sizeBytes: x.sizeBytes,
            });
            /*
              Lưu xong thì đi tiếp theo ĐÚNG LÝ DO hộp được mở.

              Mở từ nút *Bàn giao* thì hộp xác nhận bàn giao bật ra ngay — khách
              hàng chốt đúng chữ *"nhấn lưu xong thì hệ thống hỏi xác nhận để bàn
              giao"*. Mở từ khối tệp thì dừng ở đây.
            */
            const tiep = moTaoBanMem === 'banGiao';
            datMoTaoBanMem(null);
            taiLai();
            if (tiep) datHanhDong('SA_HANDOVER');
          }}
          dong={() => datMoTaoBanMem(null)}
        />
      )}

      {moHopDong && (
        <XemBanMem
          loai="HOP_DONG"
          hoSoId={hoSo.id}
          maHoSo={hoSo.code}
          dong={() => datMoHopDong(false)}
        />
      )}

      {dangXem && (
        <XemTep
          tieuDe={dangXem.tieuDe}
          duong={dangXem.duong}
          duongTai={dangXem.duongTai}
          tenTep={dangXem.tenTep}
          dong={() => datDangXem(null)}
        />
      )}

      {/*
        BẢN MỀM và BẢN CỨNG xuống CUỐI TRANG, ngay trên *Lịch sử* (`0170`, chốt
        31/08).

        Ba khối tệp thôi đứng liền nhau, và chỗ tách đúng theo nghĩa: *Giấy tờ hồ
        sơ* là thứ Trình dược viên đính vào LÚC LẬP — nó thuộc về nội dung hồ sơ,
        nên ở lại ngay dưới bảng sản phẩm. Hai khối này là SẢN PHẨM CỦA BƯỚC B8,
        sinh ra sau khi hồ sơ đã đi hết vòng duyệt, nên chúng đứng cạnh *Lịch sử*
        — chỗ kể lại vòng duyệt ấy.

        Cảnh báo *bản scan cũ* đi THEO, không ở lại trên: câu chữ của nó là *"bản
        scan DƯỚI ĐÂY"*, nên để nó lại chỗ cũ là trỏ vào một khối không còn ở đó.
      */}
      {/*
        Bản scan đang đính kèm là bản Kế toán đã chê (`0050`).

        Từ `0050` yêu cầu in lại KHÔNG còn tự xoá bản scan — Sale Admin chủ động
        gỡ và thay. Khối này là thứ giữ cho việc "chủ động" ấy không thành việc
        "quên": hồ sơ vẫn đủ điều kiện bàn giao ngay, nên bấm bàn giao mà chưa
        thay là gửi lại đúng bản vừa bị từ chối.

        CẢNH BÁO, không chặn — có lần in lại mà bản scan cũ vẫn dùng được, ví dụ
        bản giấy hỏng lúc chuyển phát chứ không phải bản in sai.
      */}
      {hoSo.banScanCu === true && (
        <div className="canh-bao-scan" role="status">
          <p>
            <strong>Bản scan dưới đây là bản Kế toán đã yêu cầu in lại.</strong>
          </p>
          <p className="ghi-chu">
            Nó được giữ lại để bạn đối chiếu xem bản giấy hỏng ở đâu. In bản mới xong thì{' '}
            <strong>gỡ tệp này và tải bản scan mới lên</strong> trước khi bàn giao — hệ thống không
            chặn bạn bàn giao lại bản cũ.
          </p>
        </div>
      )}

      <TepDinhKem
        hoSoId={hoSo.id}
        tep={hoSo.attachments}
        /*
          Quyền VÀ trạng thái, cả hai (`0048`). Bảng quyền phía giao diện nói
          "vai trò này được đính kèm"; máy chủ nói "hồ sơ này lúc này đính kèm
          được loại gì". Thiếu vế thứ hai thì nút vẫn hiện ở hồ sơ đã quá hạn
          hay đang chờ duyệt, và bấm vào là 409 sau khi đã chọn xong file.
        */
        loaiGhiDuoc={can(nguoiDung?.role, 'taiTepDinhKem') ? (hoSo.loaiTepGhiDuoc ?? []) : []}
        taoBanMem={() => datMoTaoBanMem('tep')}
        taiLai={taiLai}
      />

      {/*
        BẢN MỀM VÀ BẢN CỨNG CỦA PHIÊN BẢN TRƯỚC (`0183`) — ngay dưới hai khối
        của chính hồ sơ này, và ngay trên *Lịch sử*.

        Chỗ đứng theo đúng chiều đọc: người duyệt xem thứ họ đang phải duyệt
        trước, rồi mới tới thứ để đối chiếu. Đặt lên trên là bắt họ đọc tờ giấy
        cũ trước tờ giấy mới.

        `banTruoc` là `null` ở mọi hồ sơ không có gì để so — MÁY CHỦ quyết định,
        xem `TepBanTruoc`.
      */}
      {hoSo.banTruoc && <TepBanTruoc banTruoc={hoSo.banTruoc} />}

      <LichSuGap hoSoId={hoSo.id} />

      {suaDongCu && (
        <ThemDongSanPham
          hoSoId={hoSo.id}
          dongCu={suaDongCu}
          dong={() => datSuaDongCu(null)}
          xong={() => {
            datSuaDongCu(null);
            taiLai();
          }}
        />
      )}

      {moSua === 'dong' && (
        <ThemDongSanPham
          hoSoId={hoSo.id}
          dong={() => datMoSua(null)}
          xong={() => {
            datMoSua(null);
            taiLai();
          }}
        />
      )}
      {/*
        `0200` — HAI HỘP THOẠI, chọn bằng "khách đã có bản Nháp chưa".

        Không phải hai nhánh trong một hộp: hai bên khác nhau ở CẢ BỐN thứ —
        tiêu đề, câu giải thích, nhãn nút, và việc cái nút làm. Nhồi chúng vào
        một khối có điều kiện thì mỗi prop mang một phép ba ngôi, và cái quan
        trọng nhất (`xacNhan` gọi hàm nào) là cái dễ đọc lướt qua nhất — mà đấu
        nhầm nó ở đây nghĩa là người dùng bấm *Mở bản Nháp* rồi hệ thống đi lập
        một hồ sơ.
      */}
      {moBanMoi && nhapDangChan !== null && (
        <HopThoaiXacNhan
          tieuDe="Khách hàng đã có bản Nháp"
          nhanNut="Mở bản Nháp đang có"
          nguyHiem={false}
          dong={() => datMoBanMoi(false)}
          /*
            ĐÓNG RỒI MỚI ĐI (`0201`).

            `HopThoaiXacNhan` không tự đóng — nơi dùng phải đóng, và nhánh *Lập
            phiên bản mới* ngay dưới đã làm đúng thế (`datMoBanMoi(false)` trong
            `lapPhienBanMoi`). Nhánh này thì không, và ở đây nó lộ ra thay vì im:
            `/ho-so/:id` cũ và mới là CÙNG một địa chỉ trong bộ định tuyến, nên
            React giữ nguyên component và mọi state của nó — hộp thoại nằm lại,
            đè lên đúng bản Nháp vừa mở ra.

            Nửa còn lại ở `App.noiDung` (`key` theo id hồ sơ): cái này là hợp
            đồng của CHÍNH hộp thoại — việc của nó xong thì nó đóng, ai mount
            trang cũng vậy.
          */
          xacNhan={() => {
            datMoBanMoi(false);
            datNhapChan(null);
            di(`/ho-so/${nhapDangChan.id}`);
          }}
          hauQua={
            <>
              <p>
                Khách hàng này <strong>đã có một bản Nháp đang soạn dở</strong>
                {nhapDangChan.code ? (
                  <>
                    {' '}
                    — <strong>{nhapDangChan.code}</strong>
                  </>
                ) : null}
                . Mỗi khách hàng chỉ giữ được một bản Nháp, nên chưa lập thêm bản mới được.
              </p>
              <p>Mở bản ấy ra soạn tiếp?</p>
            </>
          }
        />
      )}

      {moBanMoi && nhapDangChan === null && (
        <HopThoaiXacNhan
          tieuDe="Lập phiên bản mới"
          nhanNut={dangLapBanMoi ? 'Đang lập…' : 'Lập phiên bản mới'}
          // KHÔNG phải thao tác nguy hiểm: nó tạo một bản NHÁP, không đụng gì
          // tới CSBH đang hiệu lực. Bản cũ chỉ hết hiệu lực khi bản mới duyệt
          // xong, và bản nháp thì TDV tự xoá được.
          nguyHiem={false}
          dangChay={dangLapBanMoi}
          dong={() => datMoBanMoi(false)}
          xacNhan={() => void lapPhienBanMoi()}
          hauQua={
            <>
              <p>
                Phiên bản mới <strong>chép sẵn toàn bộ sản phẩm</strong> của {hoSo.code} — bạn không
                phải nhập lại. Mỗi dòng tự mang trạng thái <strong>Bổ sung</strong>,{' '}
                <strong>Chỉnh sửa</strong> hay <strong>Đang áp dụng</strong> theo đúng thứ bạn thay
                đổi.
              </p>
              <p>
                CSBH hiện tại <strong>vẫn có hiệu lực</strong> cho tới khi bản mới được duyệt xong.
              </p>
              {/*
                CẢNH BÁO, KHÔNG PHẢI CHẶN (`0191`).

                `create` không cấm lập bản thứ hai khi một bản mới đang dở dang —
                đó là hành vi có sẵn, và cấm nó là một luật nghiệp vụ mới chưa ai
                chốt. Nhưng lối tắt này làm nó dễ vấp hơn hẳn: đi từ trang khách
                hàng thì bản dở nằm ngay trong danh sách hồ sơ của khách; đi từ
                đây thì không thấy gì cả.
              */}
              {hoSo.phienBanSau && (
                <p className="hop-canh-bao">
                  Khách hàng này <strong>đã có một phiên bản mới đang dở dang</strong> —{' '}
                  <Lien den={`/ho-so/${hoSo.phienBanSau.id}`}>{hoSo.phienBanSau.code}</Lien> (
                  {nhanTrangThai(hoSo.phienBanSau.status)}). Lập tiếp sẽ tạo <strong>bản thứ hai</strong>,
                  và cả hai cùng chờ duyệt.
                </p>
              )}
            </>
          }
        />
      )}

      {moSua === 'xoa' && (
        <XoaHoSo
          hoSoId={hoSo.id}
          ma={hoSo.code}
          trangThai={hoSo.status}
          dong={() => datMoSua(null)}
          xong={() => di('/ho-so')}
        />
      )}

      {xoaDongId && (
        <HopThoaiXacNhan
          tieuDe="Xoá sản phẩm"
          hauQua={
            <p>
              Dòng này biến mất khỏi hồ sơ và <strong>không lấy lại được</strong>. Nếu đây là dòng
              thừa kế từ bản CSBH trước thì hồ sơ sẽ bị chặn ở bước gửi duyệt — bản mới phải chứa lại
              toàn bộ sản phẩm cũ.
            </p>
          }
          nhanNut="Xoá"
          dangChay={dangXoaDong === xoaDongId}
          dong={() => datXoaDongId(null)}
          xacNhan={() => void xoaDong(xoaDongId).then(() => datXoaDongId(null))}
        />
      )}

      {hanhDong && (
        <HopThoaiHanhDong
          hanhDong={hanhDong}
          hoSoId={hoSo.id}
          rowVersion={hoSo.rowVersion}
          daChonSaleAdmin={hoSo.daChonSaleAdmin ?? false}
          dong={() => datHanhDong(null)}
          xong={() => {
            datHanhDong(null);
            taiLai();
          }}
        />
      )}
    </section>
  );
}

/**
 * Hộp thoại một hành động của luồng duyệt.
 *
 * Ba phần, và phần nào có mặt là do BẢNG quyết định chứ không do một chuỗi `if`:
 *
 *   1. **Lý do** — `CAN_LY_DO` (trả lại, từ chối, yêu cầu in lại).
 *   2. **Chọn người xử lý bước sau** — `oChonCua` (`0031`, `0141`).
 *
 * PHẦN THỨ BA — *xem trước bản CSBH A4* — ĐÃ GỠ (`0163`). Nó tồn tại vì `0098`
 * bắt người gửi duyệt chọn văn bản mẫu, và `0140` tách nó ra thành bước hai để
 * tờ giấy đọc được. Bản mềm giờ là thao tác in của Sale Admin ở bước B8, nên
 * người gửi duyệt không có văn bản mẫu nào để chọn và không có gì để xem trước.
 * Hộp thoại quay về MỘT bước, như trước `0140`.
 *
 * Nút xác nhận KHOÁ tới khi cả hai phần còn lại đủ.
 */
function HopThoaiHanhDong({
  hanhDong,
  hoSoId,
  rowVersion,
  daChonSaleAdmin,
  dong,
  xong,
}: {
  hanhDong: string;
  hoSoId: string;
  rowVersion: number;
  /** `0141` — đã có Sale Admin thì lượt tiếp nhận L1 thôi hỏi ô ấy. */
  daChonSaleAdmin: boolean;
  dong: () => void;
  xong: () => void;
}) {
  const canLyDo = CAN_LY_DO.has(hanhDong);
  // `0141` — bước nào hỏi ai phụ thuộc cả trạng thái hồ sơ, không chỉ hành động.
  const oChon = oChonCua(hanhDong, { daChonSaleAdmin });

  const [lyDo, datLyDo] = useState('');
  const [chon, datChon] = useState<Record<string, string>>({});
  const [nguoi, datNguoi] = useState<Record<string, NguoiChon[]> | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);
  // Danh sách người cho từng ô. Tải MỘT lượt cho cả hộp thoại; hai ô của bước
  // gửi duyệt hỏi hai vai trò khác nhau nên vẫn là hai lời gọi, nhưng chúng chạy
  // song song chứ không nối tiếp.
  useEffect(() => {
    if (oChon.length === 0) return;
    const huy = new AbortController();
    Promise.all(
      oChon.map((o) =>
        layJson<NguoiChon[]>(`/auth/nguoi-theo-vai-tro/${o.vaiTro}`, huy.signal).then(
          (ds) => [o.truong, ds] as const,
        ),
      ),
    )
      .then((cap) => datNguoi(Object.fromEntries(cap)))
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hanhDong]);

  const thieuNguoi = oChon.some((o) => !chon[o.truong]);
  const gui = async () => {
    datLoi(null);
    datDangGui(true);
    try {
      await dang(`/policies/${hoSoId}/actions/${hanhDong}`, {
        rowVersion,
        ...(canLyDo ? { reason: lyDo.trim() } : {}),
        ...chon,
      });
      xong();
    } catch (e) {
      // KHÔNG đóng hộp thoại khi lỗi: lý do vừa gõ và người vừa chọn phải còn
      // nguyên để bấm lại (FE-32). Đóng rồi mở lại là bắt làm lại từ đầu.
      datLoi(e);
    } finally {
      datDangGui(false);
    }
  };

  /*
   * BẬC THƯỜNG cho hộp bước MỘT, kể cả ở lượt gửi duyệt (`0130`).
   *
   * `0129` cho hai bước gửi duyệt bậc `to` vì chúng nhúng cả một tờ CSBH; khách
   * hàng chốt 27/08 đưa về bậc thường. `0140` tách tờ CSBH sang một hộp RIÊNG có
   * cơ chế cỡ của chính nó (`tyLe` → `.hop-thoai-xem`), nên quyết định ấy càng
   * đúng: hộp bước một giờ chỉ còn ba ô chọn.
   */

  return (
    <HopThoai tieuDe={HANH_DONG_NHAN[hanhDong] ?? hanhDong} dong={dong}>
      {oChon.map((o) => (
        <Truong key={o.truong} id={`chon-${o.truong}`} nhan={o.nhan} bắtBuộc>
          {(p) => (
            <>
              <select
                {...p}
                className="o-nhap"
                value={chon[o.truong] ?? ''}
                onChange={(e) => datChon((cu) => ({ ...cu, [o.truong]: e.target.value }))}
              >
                <option value="">— Chọn người —</option>
                {(nguoi?.[o.truong] ?? []).map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.fullName} ({n.username})
                  </option>
                ))}
              </select>
              <span className="ghi-chu">{o.moTa}</span>
              {/* Danh sách RỖNG phải nói ra, không được để một ô chọn trống câm
                  lặng: người dùng sẽ tưởng mình chưa bấm trúng. */}
              {nguoi !== null && (nguoi[o.truong] ?? []).length === 0 && (
                <span className="ghi-chu canh-bao">
                  Chưa có tài khoản {o.vaiTro} nào đang hoạt động. Đề nghị Quản trị hệ thống tạo
                  hoặc kích hoạt trước khi gửi.
                </span>
              )}
            </>
          )}
        </Truong>
      ))}

      {canLyDo && (
        <Truong id="ly-do" nhan="Lý do" bắtBuộc>
          {(p) => (
            <textarea
              {...p}
              className="o-nhap"
              rows={4}
              value={lyDo}
              onChange={(e) => datLyDo(e.target.value)}
            />
          )}
        </Truong>
      )}
      {!canLyDo && oChon.length === 0 && <p>Xác nhận thực hiện thao tác này?</p>}
      {loi !== null && <BaoLoi loi={loi} />}
      {/*
        MỘT nút, hai việc khác nhau (`0140`).

        Hành động CÓ xem trước thì nút này đi sang bước hai và KHÔNG gửi gì cả —
        nhãn phải nói đúng điều đó, vì *Xác nhận* trên một nút chỉ chuyển bước là
        một lời hứa sai. Hành động khác thì nó gửi luôn, như cũ.

        `chuaXem` KHÔNG còn khoá nút này: bản xem trước là điều kiện của bước
        HAI, và khoá nó ở đây thì người dùng chọn xong ba ô vẫn ngồi đợi một khung
        PDF họ chưa nhìn thấy.
      */}
      <div className="nhom-nut">
        <button
          type="button"
          className="nut nut-chinh"
          disabled={
            dangGui || (canLyDo && lyDo.trim().length === 0) || thieuNguoi
          }
          onClick={gui}
        >
          {dangGui ? 'Đang gửi…' : 'Xác nhận'}
        </button>
        <button type="button" className="nut nut-nhe" onClick={dong}>
          Huỷ
        </button>
      </div>
    </HopThoai>
  );
}

/**
 * Một ô "nhãn — giá trị" trong lưới thông tin.
 *
 * `<div>` bọc quanh cặp `<dt>/<dd>`: đó là cách hợp lệ duy nhất để gom một cặp
 * trong `<dl>`. Từ `0179` nó KHÔNG còn dựng nên hàng — lưới nằm ở `dl` và hàng
 * mang `display: contents`, vì chỉ một lưới dùng chung mới đo được cột nhãn
 * theo nội dung; hàng vẫn đúng vì mỗi cặp góp đúng hai ô theo thứ tự nguồn.
 */
function O({ nhan, children }: { nhan: string; children: ReactNode }) {
  return (
    <div>
      <dt>{nhan}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Địa chỉ đăng ký: HAI Ô, hoặc MỘT ô cho hồ sơ gửi trước `0177`.
 *
 * Hai hình dạng, và cái thứ hai không phải một đường suy tàn cần che đi — nó nói
 * đúng thứ đã được đóng băng. Hồ sơ gửi trước `0177` chỉ chụp cột GỘP
 * `kh_dia_chi_dang_ky_snap`; tách ngược nó ở dấu phẩy là suy ngược lên hình dạng
 * của một cột dẫn xuất (`0175`), còn đọc sống hai ô của khách hàng hôm nay là
 * trộn hai thời điểm vào một khối đã đóng băng — đúng thứ `0101` chống.
 *
 * Hình dạng cũ tự hết: `0101` chụp lại cả khối ở MỖI lượt gửi, nên hồ sơ còn đi
 * trong luồng có hai ô ngay lượt gửi lại tiếp theo. Chỉ hồ sơ đã có hiệu lực giữ
 * nó mãi, và đó đúng là điều nên xảy ra với một hồ sơ đã ký.
 */
function DiaChiDangKy({
  kh,
}: {
  kh: { soNha: string | null; tinhThanh: string | null; diaChiDangKy: string | null };
}) {
  if (!kh.soNha && !kh.tinhThanh) {
    // Không có ô gộp nào để lùi về thì thôi hẳn, chứ không bày một ô dấu gạch:
    // hồ sơ chưa gửi duyệt của một khách chưa khai địa chỉ mới rơi vào đây, và
    // ô ấy sẽ hiện ra ngay khi họ khai.
    if (!kh.diaChiDangKy) return null;
    return <O nhan="Địa chỉ đăng ký">{kh.diaChiDangKy}</O>;
  }
  return (
    <>
      <O nhan="Số nhà, Phường xã">{kh.soNha || '—'}</O>
      <O nhan="Tỉnh/Thành phố">{kh.tinhThanh || '—'}</O>
    </>
  );
}

/**
 * MỘT khối thông tin ở đầu màn hình hồ sơ (`0206`, khách hàng chốt 19/09) — hồ
 * sơ và khách hàng của nó gộp làm một mục.
 *
 * `0061` dựng HAI thẻ nằm cạnh nhau, và chúng lệch hẳn nhau về chiều cao: bốn ô
 * bên trái, tám ô bên phải. Gộp lại thì một lưới duy nhất chia đều được.
 *
 * ---------------------------------------------------------------------------
 * TIÊU ĐỀ NHÓM ĐANG GÁNH NGHĨA CHO BA CÁI NHÃN
 * ---------------------------------------------------------------------------
 *
 * Đây là phần thật của lượt gộp, và nó không nhìn thấy được từ yêu cầu: ba ô
 * *Mã* · *Loại* · *Trạng thái* chỉ đọc ra được nghĩa nhờ đứng dưới chữ *Khách
 * hàng*. Bỏ tiêu đề ấy đi mà giữ nguyên nhãn thì **`Mã` đứng cạnh `Phiên bản`**
 * trong khi mã hồ sơ đang là `<h1>` của chính trang này — hai cái mã, một cái
 * nhãn. Nên ba nhãn ấy phải tự nói ra chúng thuộc về ai.
 *
 * TRẠNG THÁI HỒ SƠ lên cạnh mã ở đầu trang. **Không đảo `0061`**: lượt ấy đẩy
 * nhãn trạng thái ra khỏi GÓC PHẢI để nhường chỗ cho dải nút, và chỗ mới nằm ở
 * mép TRÁI, cạnh `<h1>` — hai việc không tranh nhau chỗ nào. Cái được là ô
 * *Trạng thái* rời khỏi lưới đúng lúc lưới sắp có một ô *Trạng thái* thứ hai của
 * khách hàng.
 */
function ThongTinHoSo({ hoSo }: { hoSo: HoSo }) {
  const kh = hoSo.khachHang;

  return (
    <div className="tom-tat">
      <section className="tom-tat-nhom tom-tat-chung">
        <h2>Thông tin chung</h2>
        <dl>
          <O nhan="Phiên bản">{hoSo.versionNo}</O>
          <O nhan="Ngày soạn thảo">{ngay(hoSo.createdAt)}</O>
          {/* Chỉ hiện khi ĐÃ có hiệu lực. Một ô "Có hiệu lực —" trên mọi hồ sơ
              còn đang đi trong luồng là một dòng không nói gì, mà nó lại nằm
              ngay cạnh hai ô ngày tháng có thật. */}
          {hoSo.effectiveFrom && <O nhan="Có hiệu lực">{ngayGio(hoSo.effectiveFrom)}</O>}
          <O nhan="Người đề nghị">{hoSo.nguoiDeNghi?.ten ?? 'không tra được tên'}</O>
          {kh !== null && kh !== undefined && (
            <>
              <O nhan="Mã khách hàng">
                {/* Liên kết đặt ở MÃ chứ không ở tên: mã là thứ người dùng đối
                    chiếu, và nó ngắn nên cả ô không biến thành một vùng bấm dài. */}
                <Lien den={`/khach-hang/${hoSo.customerId}`} className="ma-phu">
                  {kh.ma}
                </Lien>
              </O>
              {/*
                TẬP Ô VÀ THỨ TỰ — khách hàng chốt 06/09 (`0177`).

                *"Bỏ mục Tên, thay vào đó bổ sung thêm tên người đại diện, tên
                hộ kinh doanh/tên công ty"* là MỘT việc, không phải hai. Ô cũ
                nhãn *Tên* mang đúng tên pháp nhân, và `0175` đã đổi nhãn của nó
                ở biểu mẫu lập khách hàng thành *Tên Hộ kinh doanh/Tên Công ty*
                — trang này là chỗ còn sót lại. Đọc riêng vế đầu mà bỏ hẳn ô là
                làm sai cả hai vế, đúng lối `0171` đã ghi.

                Thứ tự theo đúng câu khách hàng viết: người đại diện TRƯỚC tên
                pháp nhân, và *Số nhà, Phường xã* trước *Tỉnh/Thành phố* — ngược
                với trang khách hàng, nơi hai ô ấy đi theo thứ tự của biểu mẫu.
                Chọn theo bản vẽ của họ chứ không theo phép nhất quán, cùng lẽ
                với `0171` và `0174`. `0206` gộp hai khối làm một mà KHÔNG động
                tới thứ tự ấy: dãy ô của khách hàng nối tiếp dãy của hồ sơ, đúng
                thứ tự cũ của cả hai.
              */}
              <O nhan="Người đại diện">{kh.nguoiDaiDien || '—'}</O>
              <O nhan="Tên Hộ kinh doanh/Tên Công ty">{kh.ten}</O>
              <DiaChiDangKy kh={kh} />
              {/*
                ĐỊA CHỈ GIAO HÀNG — CHỈ KHI CÓ, cùng luật với trang khách hàng
                (`0175`). Mảng rỗng nghĩa là *"giao tới địa chỉ đăng ký"*
                (`0006`), nên một ô ghi dấu gạch ở đây nói rằng khách thiếu một
                thông tin mà họ không hề thiếu.

                Mỗi địa chỉ một DÒNG: nối bằng dấu phẩy thì một địa chỉ vốn đã
                có dấu phẩy sẽ đọc ra thành hai.
              */}
              {kh.noiNhanHang.length > 0 && (
                <O nhan="Địa chỉ giao hàng">
                  {kh.noiNhanHang.map((d, i) => (
                    <span key={i} className="dong-dia-chi">
                      {d}
                    </span>
                  ))}
                </O>
              )}
              <O nhan="Loại khách hàng">{nhanLoaiKhach(kh.loai)}</O>
              {/* `0138` — điều khoản thanh toán, đã đóng băng vào hồ sơ lúc gửi
                  duyệt (`0101`). Không còn ` đ` ở cuối. */}
              <O nhan="Công nợ">{kh.congNo || '—'}</O>
              {/* Khách đã ngừng hợp tác thì PHẢI nói ra ở đây. Hồ sơ cũ của họ
                  vẫn mở được, và không có dòng này thì người đọc không thấy gì
                  bất thường ở một chính sách dành cho khách không còn giao dịch.

                  Nhãn nói rõ *khách hàng* từ `0206`: trạng thái HỒ SƠ giờ nằm
                  cạnh mã ở đầu trang, nhưng người đọc không biết điều đó — và
                  một ô tên trần *Trạng thái* trong khối này đọc ra là trạng thái
                  của hồ sơ, tức nói ngược hẳn thứ nó đang mang. */}
              {kh.trangThai === 'NGUNG_HOP_TAC' && (
                <O nhan="Trạng thái khách hàng">
                  <span className="nhan nhan-canh-bao">Đã ngừng hợp tác</span>
                </O>
              )}
            </>
          )}
        </dl>
        {/* Nói THÀNH LỜI. Một khối rỗng ở đây đọc ra là "hồ sơ này không có
            khách hàng", mà chuyện thật là tra không ra lúc này.

            Nằm NGOÀI `<dl>` chứ không thay chỗ cả lưới (`0206`): bốn ô của hồ sơ
            vẫn đọc được khi `customer` chết — trước lượt gộp chúng ở một thẻ
            khác nên chuyện ấy là hiển nhiên, giờ thì phải viết ra. */}
        {(kh === null || kh === undefined) && (
          <p className="ghi-chu">Chưa tải được thông tin khách hàng. Tải lại trang để thử lại.</p>
        )}
      </section>
    </div>
  );
}

/** Nhãn của từng bước duyệt, theo đúng thứ tự hồ sơ đi qua. */
const BUOC_DUYET: { khoa: 'tbp' | 'keToanL1' | 'keToanL2' | 'saleAdmin'; nhan: string }[] = [
  { khoa: 'tbp', nhan: 'Trưởng bộ phận ký' },
  { khoa: 'keToanL1', nhan: 'KT duyệt bản mềm' },
  { khoa: 'saleAdmin', nhan: 'Sale Admin bàn giao' },
  { khoa: 'keToanL2', nhan: 'KT duyệt bản cứng' },
];

/**
 * Dải "đã duyệt" ở đầu màn hình hồ sơ.
 *
 * MỐC THỜI GIAN đi kèm TÊN, không tách: "Trưởng bộ phận Nguyễn Văn A ký" mà
 * thiếu ngày thì vẫn phải mở nhật ký ra mới biết hồ sơ nằm đó bao lâu — và đó
 * chính là câu hỏi tiếp theo của người vừa đọc cái tên.
 *
 * Thứ tự theo LUỒNG, không theo thời gian: bốn bước luôn đi đúng trình tự ấy,
 * nên xếp theo luồng thì mắt đọc được cả những bước CHƯA có mà không cần ô rỗng.
 */
function DaDuyet({ nguoiDuyet }: { nguoiDuyet: HoSo['nguoiDuyet'] }) {
  const co = BUOC_DUYET.map((b) => ({ ...b, d: nguoiDuyet?.[b.khoa] })).filter(
    (x): x is typeof x & { d: { ten: string | null; luc: string } } => !!x.d,
  );
  if (co.length === 0) return null;

  return (
    <dl className="da-duyet">
      {co.map((x) => (
        <div key={x.khoa}>
          <dt>{x.nhan}</dt>
          <dd>
            {/* Tên tra không ra thì nói THÀNH LỜI. Một ô trống ở đây đọc ra là
                "chưa ai ký", mà mốc thời gian ngay bên cạnh nói ngược lại. */}
            <strong>{x.d.ten ?? 'không tra được tên'}</strong>
            <span className="phu">{ngayGio(x.d.luc)}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
