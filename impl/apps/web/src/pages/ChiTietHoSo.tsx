/**
 * Chi tiết một hồ sơ CSBH: bảng 10 cột, lịch sử, và các nút hành động.
 *
 * Danh sách nút lấy từ `/policies/:id/allowed-actions` — MÁY CHỦ quyết định, vì
 * máy trạng thái nằm ở đó. Bảng vai trò phía giao diện chỉ dùng để ẩn bớt trước
 * khi hỏi; hai bên lệch nhau thì máy chủ thắng.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { dang, layJson, taiVe, xemTruoc, xoa } from '../lib/api.js';
import { usePhien } from '../lib/auth.js';
import { CAN_LY_DO, HANH_DONG_NHAN, can, canHanhDong } from '../lib/can.js';
import { ngay, ngayGio, tien } from '../lib/format.js';
import { nhanLoaiKhach } from '../lib/danh-muc.js';
import { LichSuGap } from '../components/LichSu.js';
import { BangSanPham, type DongSanPham } from '../components/BangSanPham.js';
import { TepDinhKem, type TepDto } from '../components/TepDinhKem.js';
import { XemTep } from '../components/XemTep.js';
import { XemBanMem } from '../components/XemBanMem.js';
import {
  SuaNgayApDung,
  ThemDongSanPham,
  XoaHoSo,
  suaDuoc,
} from '../components/SuaHoSo.js';
import { Lien, useDuong } from '../lib/router.js';
import {
  CAN_XEM_TRUOC,
  O_CHON_CUA,
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
  /** Người LẬP hồ sơ (`0061`). `ten` là `null` khi identity không tra được. */
  nguoiDeNghi?: { ten: string | null };
  /**
   * Khách hàng của hồ sơ (`0061`). `null` khi `customer` không trả lời được —
   * mất khối thông tin, không mất cả màn hình.
   */
  khachHang?: {
    ma: string;
    ten: string;
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
  tepXoaDuoc?: boolean;
  xuatHopDongDuoc?: boolean;
  /** `0050` — bản scan đang đính kèm là bản Kế toán đã yêu cầu in lại. */
  banScanCu?: boolean;
  rowVersion: number;
  lines: DongSanPham[];
  attachments: TepDto[];
};

export function ChiTietHoSo({ id }: { id: string }) {
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
      datLoi(e);
    } finally {
      datDangXoaDong(null);
    }
  };

  /** Hộp *Xem bản mềm* đang mở hay không (`0054`). */
  const [moBanMem, datMoBanMem] = useState(false);
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
          *Xem bản mềm* đứng CÙNG HÀNG với các nút thao tác (`0054`).

          Nó không phải thao tác ghi nên không phạm `FE-23`, và nó mở cho cả năm
          vai trò đọc được hồ sơ — kể cả Ban lãnh đạo, vốn không có nút nào khác.
          Vì thế nhóm nút này KHÔNG còn điều kiện `thaoTac.length > 0`: trước
          `0054` vai trò chỉ-đọc không thấy nhóm nút nào cả.
        */}
        <div className="nhom-nut nhom-nut-dau">
          <button type="button" className="nut nut-nhe" onClick={() => datMoBanMem(true)}>
            Xem bản mềm
          </button>
          {thaoTac.map((a) => (
            <button
              key={a}
              type="button"
              className={a.includes('REJECT') ? 'nut nut-canh-bao' : 'nut nut-chinh'}
              onClick={() => datHanhDong(a)}
            >
              {HANH_DONG_NHAN[a] ?? a}
            </button>
          ))}
        </div>
      </div>

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

      <h2>Dòng sản phẩm</h2>
      {dangSua && (
        <div className="nhom-nut">
          <button type="button" className="nut nut-chinh" onClick={() => datMoSua('dong')}>
            Thêm dòng sản phẩm
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
        choPhepXoa={can(nguoiDung?.role, 'taiTepDinhKem') && hoSo.tepXoaDuoc === true}
        taiLai={taiLai}
      />

      {/*
        Mục này CHỈ CÒN HỢP ĐỒNG (`0054`).

        Ba nút của bản CSBH — xem khổ dọc, tải khổ dọc, tải khổ ngang — đã dồn
        vào một nút *Xem bản mềm* ở góc trên bên phải. Hợp đồng ở lại đây vì nó
        là văn bản KHÁC, chỉ Kế toán và Sale Admin thấy, và chỉ sau khi tiếp
        nhận lần 1.

        MỘT NÚT, không phải hai (`0058`). Trước đó *Xem* và *Xuất* là hai nút
        cạnh nhau, và nút *Xuất* tải thẳng về mà không cho nhìn trước — nghĩa là
        đường duy nhất để biết hợp đồng trông thế nào lại là đường KHÔNG để lại
        vết trong Lịch sử. Giờ cả hai nằm trong một hộp: xem trước, chọn mẫu, rồi
        mới bấm tải.
      */}
      {can(nguoiDung?.role, 'xuatHopDong') && hoSo.xuatHopDongDuoc === true && (
        <>
          <h2>Hợp đồng</h2>
          <div className="nhom-nut">
            <button type="button" className="nut" onClick={() => datMoHopDong(true)}>
              Xuất hợp đồng
            </button>
          </div>
        </>
      )}

      {/*
        Xoá đọc thẳng cờ `xoaDuoc` MÁY CHỦ tính (`0039`).

        Tới `0035` điều kiện là `dangSua` — xoá được đúng những hồ sơ sửa được.
        `0039` cắt đứt phép suy ấy: hồ sơ *Từ chối* xoá được mà không có hành
        động nào đi ra, nên không suy ra được từ `allowed-actions`.

        Chép danh sách trạng thái sang đây là dựng bản sao thứ hai phải giữ đồng
        bộ, và lệch về phía nào cũng sai: thừa thì bày ra một nút chắc chắn 403,
        thiếu thì giấu mất đường bỏ hồ sơ. Một cờ boolean thì máy chủ vẫn là nơi
        duy nhất biết luật — kể cả phần "đúng TDV đang phụ trách".
      */}
      {hoSo.xoaDuoc && can(nguoiDung?.role, 'xoaHoSo') && (
        <p>
          <button type="button" className="nut nut-canh-bao" onClick={() => datMoSua('xoa')}>
            Xoá hồ sơ
          </button>
        </p>
      )}

      {/*
        LỊCH SỬ ở cuối cùng, gập lại (`0061`).

        Nó là thứ người ta tra CHỦ ĐỘNG — "ai trả hồ sơ này về, lý do gì" — chứ
        không phải thứ cần đọc để làm việc hôm nay, nên nó không được chiếm chỗ
        phía trên. Nhưng trước `0061` nó chỉ có một liên kết bé xíu trên dòng
        tiêu đề dẫn sang màn hình khác, và một liên kết như thế thì phần lớn
        người dùng không biết là có.
      */}
      {moBanMem && (
        <XemBanMem hoSoId={hoSo.id} maHoSo={hoSo.code} dong={() => datMoBanMem(false)} />
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
          tieuDe="Xoá dòng sản phẩm"
          hauQua={
            <p>
              Dòng này biến mất khỏi hồ sơ và <strong>không lấy lại được</strong>. Nếu đây là dòng
              thừa kế từ bản CSBH trước thì hồ sơ sẽ bị chặn ở bước gửi duyệt — bản mới phải chứa lại
              toàn bộ sản phẩm cũ.
            </p>
          }
          nhanNut="Xoá dòng"
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
 *   2. **Chọn người xử lý bước sau** — `O_CHON_CUA` (`0031`).
 *   3. **Xem trước bản CSBH A4** — `CAN_XEM_TRUOC`, chỉ lúc gửi duyệt.
 *
 * Nút xác nhận KHOÁ tới khi cả ba phần đủ. Với bản xem trước, "đủ" nghĩa là đã
 * tải xong và hiện ra — không phải người dùng đã cuộn hết. Ép cuộn là thứ người
 * ta học cách bấm qua trong ba ngày, còn bày ra toàn văn thì ít nhất người muốn
 * đọc có chỗ để đọc.
 */
function HopThoaiHanhDong({
  hanhDong,
  hoSoId,
  rowVersion,
  dong,
  xong,
}: {
  hanhDong: string;
  hoSoId: string;
  rowVersion: number;
  dong: () => void;
  xong: () => void;
}) {
  const canLyDo = CAN_LY_DO.has(hanhDong);
  const oChon = O_CHON_CUA[hanhDong] ?? [];
  const canXem = CAN_XEM_TRUOC.has(hanhDong);

  const [lyDo, datLyDo] = useState('');
  const [chon, datChon] = useState<Record<string, string>>({});
  const [nguoi, datNguoi] = useState<Record<string, NguoiChon[]> | null>(null);
  const [xemUrl, datXemUrl] = useState<string | null>(null);
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

  // Bản A4 tải về bộ nhớ rồi nhúng. Thu hồi `blob:` khi đóng — xem `xemTruoc`.
  useEffect(() => {
    if (!canXem) return;
    let url: string | null = null;
    let song = true;
    // Bản xem trước trong hộp xác nhận cũng là XEM, không phải tải.
    // KHÔNG kèm `mauId`: hộp xác nhận ký số không có ô chọn mẫu, và máy chủ lấy
    // mẫu đầu danh sách (`0058`). Bản xem trước ở đây để TBP đối chiếu nội dung
    // trước khi ký, không phải để chọn bản trình bày.
    xemTruoc(`/policies/${hoSoId}/render`)
      .then((x) => {
        url = x.url;
        if (song) datXemUrl(x.url);
        else URL.revokeObjectURL(x.url);
      })
      .catch(datLoi);
    return () => {
      song = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [canXem, hoSoId]);

  const thieuNguoi = oChon.some((o) => !chon[o.truong]);
  const chuaXem = canXem && xemUrl === null;

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

  return (
    <HopThoai tieuDe={HANH_DONG_NHAN[hanhDong] ?? hanhDong} dong={dong}>
      {canXem && (
        <div className="xem-truoc">
          <p className="ghi-chu">
            Đọc lại bản CSBH dưới đây trước khi gửi. Sau bước này{' '}
            <strong>giá và ngưỡng đóng băng</strong>, và mọi chỉnh sửa đều phải đi một vòng trả lại.
          </p>
          {xemUrl === null ? (
            <DangTai />
          ) : (
            <iframe className="khung-pdf" src={xemUrl} title="Bản CSBH A4" />
          )}
        </div>
      )}

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
      {!canLyDo && oChon.length === 0 && !canXem && <p>Xác nhận thực hiện thao tác này?</p>}
      {loi !== null && <BaoLoi loi={loi} />}
      <div className="nhom-nut">
        <button
          type="button"
          className="nut nut-chinh"
          disabled={
            dangGui || (canLyDo && lyDo.trim().length === 0) || thieuNguoi || chuaXem
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

      <section className="tom-tat-nhom">
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
            <O nhan="Tên">{kh.ten}</O>
            <O nhan="Loại">{nhanLoaiKhach(kh.loai)}</O>
            <O nhan="Công nợ">{kh.congNo === null ? '—' : `${tien(kh.congNo)} đ`}</O>
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
