/**
 * Chi tiết một hồ sơ CSBH: bảng 10 cột, lịch sử, và các nút hành động.
 *
 * Danh sách nút lấy từ `/policies/:id/allowed-actions` — MÁY CHỦ quyết định, vì
 * máy trạng thái nằm ở đó. Bảng vai trò phía giao diện chỉ dùng để ẩn bớt trước
 * khi hỏi; hai bên lệch nhau thì máy chủ thắng.
 */
import { useCallback, useEffect, useState } from 'react';
import { dang, layJson, taiVe, xemTruoc, xoa } from '../lib/api.js';
import { usePhien } from '../lib/auth.js';
import { CAN_LY_DO, HANH_DONG_NHAN, can, canHanhDong } from '../lib/can.js';
import { ngay, ngayGio, tien } from '../lib/format.js';
import { BangSanPham, type DongSanPham } from '../components/BangSanPham.js';
import { TepDinhKem, type TepDto } from '../components/TepDinhKem.js';
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

type HoSo = {
  id: string;
  code: string;
  customerId: string;
  versionNo: number;
  status: string;
  appliedDate: string | null;
  effectiveFrom: string | null;
  lastReason: string | null;
  /** Máy chủ tính sẵn (`0039`) — giao diện KHÔNG chép danh sách trạng thái. */
  xoaDuoc: boolean;
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

  const taiBan = (kho: 'a4p' | 'a4l') => {
    datLoi(null);
    taiVe(`/policies/${id}/render?size=${kho}`, `CSBH-${kho}.pdf`).catch(datLoi);
  };

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

  return (
    <section className="trang">
      <div className="dau-trang">
        <div>
          <h1>{hoSo.code}</h1>
          <p className="mo-ta-trang">
            Phiên bản {hoSo.versionNo} · Ngày áp dụng {ngay(hoSo.appliedDate)}
            {hoSo.effectiveFrom && ` · Có hiệu lực ${ngayGio(hoSo.effectiveFrom)}`}
            {' · '}
            {/* Nhật ký ở màn hình RIÊNG (`0036`), không phải một khối gập ở
                cuối trang này: nó cần một địa chỉ để dán vào thư báo. */}
            <Lien den={`/ho-so/${hoSo.id}/nhat-ky`}>Nhật ký</Lien>
          </p>
        </div>
        <Nhan trangThai={hoSo.status} />
      </div>

      {hoSo.lastReason && (
        <div className="ghi-chu-tra-lai" role="note">
          <strong>Lý do gần nhất:</strong> {hoSo.lastReason}
        </div>
      )}

      {loi !== null && <BaoLoi loi={loi} thuLai={taiLai} />}

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

      <TepDinhKem
        hoSoId={hoSo.id}
        tep={hoSo.attachments}
        choPhepGhi={can(nguoiDung?.role, 'taiTepDinhKem')}
        choPhepXoa={can(nguoiDung?.role, 'taiTepDinhKem')}
        taiLai={taiLai}
      />

      <h2>Tải văn bản</h2>
      <div className="nhom-nut">
        {/*
          Bản CSBH A4 mở cho cả năm vai trò đọc được hồ sơ, kể cả Ban lãnh đạo:
          tải một bản in ra xem KHÔNG phải thao tác ghi, nên không phạm `FE-23`.
          Hai khổ giấy vì bảng mười cột không vừa khổ dọc khi hồ sơ nhiều dòng.
        */}
        <button type="button" className="nut nut-nhe" onClick={() => taiBan('a4p')}>
          Bản CSBH (A4 dọc)
        </button>
        <button type="button" className="nut nut-nhe" onClick={() => taiBan('a4l')}>
          Bản CSBH (A4 ngang)
        </button>

        {/*
          Nút xuất hợp đồng chỉ hiện với Kế toán và Sale Admin (FE-24, muc 8.3).
          Trưởng bộ phận KHÔNG thấy — YCNV ghi sai chỗ này và bản hợp nhất đã sửa.
        */}
        {can(nguoiDung?.role, 'xuatHopDong') && (
          <button
            type="button"
            className="nut"
            onClick={() => {
              datLoi(null);
              taiVe(`/policies/${hoSo.id}/contract.pdf`, `HopDong-${hoSo.code}.pdf`).catch(datLoi);
            }}
          >
            Xuất hợp đồng (PDF)
          </button>
        )}
      </div>

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
        Lọc LẦN NỮA theo vai trò (`0038`), dù máy chủ đã lọc.

        Máy chủ là chốt thật: `/allowed-actions` trả về đúng những hành động
        vai trò này làm được. Giữ thêm phép lọc ở đây vì `FE-23` quét chính bảng
        quyền để khẳng định Ban lãnh đạo không có nút ghi nào — và vì một danh
        sách cũ còn nằm trong bộ nhớ trình duyệt sau khi đổi tài khoản thì đây
        là thứ chặn nó.
      */}
      {choPhep.some((a) => canHanhDong(nguoiDung?.role, a)) && (
        <>
          <h2>Thao tác</h2>
          <div className="nhom-nut">
            {choPhep.filter((a) => canHanhDong(nguoiDung?.role, a)).map((a) => (
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
        </>
      )}

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
    xemTruoc(`/policies/${hoSoId}/render?size=a4p`)
      .then((u) => {
        url = u;
        if (song) datXemUrl(u);
        else URL.revokeObjectURL(u);
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
