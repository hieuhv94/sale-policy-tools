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
import { ngay, ngayGio, tien } from '../lib/format.js';
import { nhanLoaiKhach } from '../lib/danh-muc.js';
import { LichSuGap } from '../components/LichSu.js';
import { BangSanPham, type DongSanPham } from '../components/BangSanPham.js';
import { TepDinhKem, type TepDto } from '../components/TepDinhKem.js';
import { HoSoPhapLy } from '../components/HoSoPhapLy.js';
import { XemTep } from '../components/XemTep.js';
import { XemBanMem } from '../components/XemBanMem.js';
import { NHAN_KHO, TY_LE_KHO, TY_LE_MAC_DINH, type MauChon } from '../lib/mau-hop-dong.js';
import {
  SuaNgayApDung,
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
  appliedDate: string | null;
  effectiveFrom: string | null;
  lastReason: string | null;
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
  const [moSua, datMoSua] = useState<'dong' | 'ngay' | 'xoa' | null>(null);
  const [dangXoaDong, datDangXoaDong] = useState<string | null>(null);
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
        <h1>{hoSo.code}</h1>
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
          <strong>Chưa bàn giao được:</strong> hồ sơ chưa có bản scan. Tải bản scan lên ở khối{' '}
          <em>Tệp đính kèm</em> bên dưới, rồi nút <em>Bàn giao</em> sẽ dùng được.
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

      {hoSo.lastReason && (
        <div className="ghi-chu-tra-lai" role="note">
          <span className="hop-tieu-de">Lý do gần nhất</span>
          {hoSo.lastReason}
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
      {(hoSo.lech ?? []).length > 0 && (
        <div className="canh-bao-lech" role="note">
          <span className="hop-tieu-de">Số trên hồ sơ này đã lệch so với danh mục hiện tại</span>
          <p className="ghi-chu">
            Hồ sơ đã <strong>đóng băng</strong> giá và ngưỡng lúc gửi duyệt — đó là chủ ý, không ai
            sửa một văn bản đang chờ chữ ký. Bảng dưới đây vẫn là con số đã đóng băng.
          </p>
          <DanhSachLech lech={hoSo.lech ?? []} />
        </div>
      )}

      <h2>Sản phẩm</h2>
      {dangSua && (
        <div className="nhom-nut">
          <button type="button" className="nut nut-chinh" onClick={() => datMoSua('dong')}>
            Thêm sản phẩm
          </button>
          <button type="button" className="nut nut-nhe" onClick={() => datMoSua('ngay')}>
            Sửa ngày áp dụng
          </button>
        </div>
      )}
      <BangSanPham
        dong={hoSo.lines}
        {...(dangSua
          ? { xoaDong: datXoaDongId, suaDong: datSuaDongCu, dangXoa: dangXoaDong }
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
      {moSua === 'ngay' && (
        <SuaNgayApDung
          hoSoId={hoSo.id}
          ngayHienTai={hoSo.appliedDate}
          dong={() => datMoSua(null)}
          xong={() => {
            datMoSua(null);
            taiLai();
          }}
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
 * trong `<dl>`, và không có nó thì lưới CSS xếp nhãn với giá trị thành hai ô rời
 * nhau — nhãn của ô này nằm cạnh giá trị của ô kia.
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
 * Hai nhóm thông tin ở đầu màn hình hồ sơ (`0061`): hồ sơ, và khách hàng của nó.
 *
 * TRẠNG THÁI nằm trong lưới chứ không còn là một nhãn rời ở góc phải: góc ấy giờ
 * là chỗ của các nút thao tác. Nó vẫn là ô ĐẦU TIÊN và vẫn vẽ bằng `<Nhan>` —
 * có màu, đọc được từ xa — nên không mất gì ngoài chỗ đứng.
 */
function ThongTinHoSo({ hoSo }: { hoSo: HoSo }) {
  const kh = hoSo.khachHang;

  return (
    <div className="tom-tat">
      <section className="tom-tat-nhom">
        <h2>Hồ sơ</h2>
        <dl>
          <O nhan="Trạng thái">
            <Nhan trangThai={hoSo.status} />
          </O>
          <O nhan="Phiên bản">{hoSo.versionNo}</O>
          <O nhan="Ngày soạn thảo">{ngay(hoSo.createdAt)}</O>
          <O nhan="Ngày áp dụng">{ngay(hoSo.appliedDate)}</O>
          {/* Chỉ hiện khi ĐÃ có hiệu lực. Một ô "Có hiệu lực —" trên mọi hồ sơ
              còn đang đi trong luồng là một dòng không nói gì, mà nó lại nằm
              ngay cạnh hai ô ngày tháng có thật. */}
          {hoSo.effectiveFrom && <O nhan="Có hiệu lực">{ngayGio(hoSo.effectiveFrom)}</O>}
          <O nhan="Người đề nghị">{hoSo.nguoiDeNghi?.ten ?? 'không tra được tên'}</O>
        </dl>
      </section>

      <section className="tom-tat-nhom tom-tat-khach">
        <h2>Khách hàng</h2>
        {kh === null || kh === undefined ? (
          // Nói THÀNH LỜI. Một khối rỗng ở đây đọc ra là "hồ sơ này không có
          // khách hàng", mà chuyện thật là tra không ra lúc này.
          <p className="ghi-chu">Chưa tải được thông tin khách hàng. Tải lại trang để thử lại.</p>
        ) : (
          <dl>
            <O nhan="Mã">
              {/* Liên kết đặt ở MÃ chứ không ở tên: mã là thứ người dùng đối
                  chiếu, và nó ngắn nên cả ô không biến thành một vùng bấm dài. */}
              <Lien den={`/khach-hang/${hoSo.customerId}`} className="ma-phu">
                {kh.ma}
              </Lien>
            </O>
            {/*
              TẬP Ô VÀ THỨ TỰ — khách hàng chốt 06/09 (`0177`).

              *"Bỏ mục Tên, thay vào đó bổ sung thêm tên người đại diện, tên hộ
              kinh doanh/tên công ty"* là MỘT việc, không phải hai. Ô cũ nhãn
              *Tên* mang đúng tên pháp nhân, và `0175` đã đổi nhãn của nó ở biểu
              mẫu lập khách hàng thành *Tên Hộ kinh doanh/Tên Công ty* — trang
              này là chỗ còn sót lại. Đọc riêng vế đầu mà bỏ hẳn ô là làm sai cả
              hai vế, đúng lối `0171` đã ghi.

              Thứ tự theo đúng câu khách hàng viết: người đại diện TRƯỚC tên
              pháp nhân, và *Số nhà, Phường xã* trước *Tỉnh/Thành phố* — ngược
              với trang khách hàng, nơi hai ô ấy đi theo thứ tự của biểu mẫu.
              Chọn theo bản vẽ của họ chứ không theo phép nhất quán, cùng lẽ với
              `0171` và `0174`.
            */}
            <O nhan="Người đại diện">{kh.nguoiDaiDien || '—'}</O>
            <O nhan="Tên Hộ kinh doanh/Tên Công ty">{kh.ten}</O>
            <DiaChiDangKy kh={kh} />
            {/*
              ĐỊA CHỈ GIAO HÀNG — CHỈ KHI CÓ, cùng luật với trang khách hàng
              (`0175`). Mảng rỗng nghĩa là *"giao tới địa chỉ đăng ký"* (`0006`),
              nên một ô ghi dấu gạch ở đây nói rằng khách thiếu một thông tin mà
              họ không hề thiếu.

              Mỗi địa chỉ một DÒNG: nối bằng dấu phẩy thì một địa chỉ vốn đã có
              dấu phẩy sẽ đọc ra thành hai.
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
            <O nhan="Loại">{nhanLoaiKhach(kh.loai)}</O>
            {/* `0138` — điều khoản thanh toán, đã đóng băng vào hồ sơ lúc gửi
                duyệt (`0101`). Không còn ` đ` ở cuối. */}
            <O nhan="Công nợ">{kh.congNo || '—'}</O>
            {/* Khách đã ngừng hợp tác thì PHẢI nói ra ở đây. Hồ sơ cũ của họ vẫn
                mở được, và không có dòng này thì người đọc không thấy gì bất
                thường ở một chính sách dành cho khách không còn giao dịch. */}
            {kh.trangThai === 'NGUNG_HOP_TAC' && (
              <O nhan="Trạng thái">
                <span className="nhan nhan-canh-bao">Đã ngừng hợp tác</span>
              </O>
            )}
          </dl>
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
