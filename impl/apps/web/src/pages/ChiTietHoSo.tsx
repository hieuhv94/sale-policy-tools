/**
 * Chi tiết một hồ sơ CSBH: bảng 10 cột, lịch sử, và các nút hành động.
 *
 * Danh sách nút lấy từ `/policies/:id/allowed-actions` — MÁY CHỦ quyết định, vì
 * máy trạng thái nằm ở đó. Bảng vai trò phía giao diện chỉ dùng để ẩn bớt trước
 * khi hỏi; hai bên lệch nhau thì máy chủ thắng.
 */
import { useCallback, useEffect, useState } from 'react';
import { dang, layJson, taiVe } from '../lib/api.js';
import { usePhien } from '../lib/auth.js';
import { CAN_LY_DO, HANH_DONG_NHAN, can } from '../lib/can.js';
import { ngay, ngayGio, tien } from '../lib/format.js';
import { BangSanPham, type DongSanPham } from '../components/BangSanPham.js';
import { TepDinhKem, type TepDto } from '../components/TepDinhKem.js';
import { BaoLoi, DangTai, HopThoai, Nhan, Truong } from '../components/Chung.js';

type HoSo = {
  id: string;
  code: string;
  customerId: string;
  versionNo: number;
  status: string;
  appliedDate: string | null;
  effectiveFrom: string | null;
  lastReason: string | null;
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

  const taiBan = (kho: 'a4p' | 'a4l') => {
    datLoi(null);
    taiVe(`/policies/${id}/render?size=${kho}`, `CSBH-${kho}.pdf`).catch(datLoi);
  };

  if (loi !== null && hoSo === null) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (!hoSo) return <DangTai />;

  const tongThuVe = hoSo.lines.reduce((a, d) => a + BigInt(d.netPrice), 0n).toString();

  return (
    <section className="trang">
      <div className="dau-trang">
        <div>
          <h1>{hoSo.code}</h1>
          <p className="mo-ta-trang">
            Phiên bản {hoSo.versionNo} · Ngày áp dụng {ngay(hoSo.appliedDate)}
            {hoSo.effectiveFrom && ` · Có hiệu lực ${ngayGio(hoSo.effectiveFrom)}`}
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
      <BangSanPham dong={hoSo.lines} />
      {hoSo.lines.length > 0 && (
        <p className="tong-cong">
          Tổng giá thu về: <strong className="so">{tien(tongThuVe)}</strong>
        </p>
      )}

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

      {choPhep.length > 0 && (
        <>
          <h2>Thao tác</h2>
          <div className="nhom-nut">
            {choPhep.map((a) => (
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
  const [lyDo, datLyDo] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const gui = async () => {
    datLoi(null);
    datDangGui(true);
    try {
      await dang(`/policies/${hoSoId}/actions/${hanhDong}`, {
        rowVersion,
        ...(canLyDo ? { reason: lyDo.trim() } : {}),
      });
      xong();
    } catch (e) {
      // KHÔNG đóng hộp thoại khi lỗi: lý do vừa gõ phải còn nguyên để bấm lại
      // (FE-32). Đóng rồi mở lại là bắt người dùng gõ lại từ đầu.
      datLoi(e);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe={HANH_DONG_NHAN[hanhDong] ?? hanhDong} dong={dong}>
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
      {!canLyDo && <p>Xác nhận thực hiện thao tác này?</p>}
      {loi !== null && <BaoLoi loi={loi} />}
      <div className="nhom-nut">
        <button
          type="button"
          className="nut nut-chinh"
          disabled={dangGui || (canLyDo && lyDo.trim().length === 0)}
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
