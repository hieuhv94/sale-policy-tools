/**
 * Tra cứu khách hàng. Ban lãnh đạo tìm và xem CSBH đang áp dụng trong không quá
 * ba lần chạm (`FE-12`): gõ tìm → chạm khách hàng → thấy ngay CSBH hiện hành.
 */
import { useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { ngay, tien } from '../lib/format.js';
import { Lien, useDuong } from '../lib/router.js';
import { BaoLoi, DangTai, Nhan, OTimKiem, Trong } from '../components/Chung.js';
import { PhanTrang } from '../components/PhanTrang.js';
import { useTrangMay } from '../lib/phan-trang.js';
import { nhanLoaiKhach } from '../lib/danh-muc.js';
import { HoSoPhapLy } from '../components/HoSoPhapLy.js';
import {
  BieuMauKhachHang,
  DoiTdvPhuTrach,
  type KhachHangDayDu,
  HopThoaiNgungHopTac,
} from '../components/SuaKhachHang.js';
import { usePhien } from '../lib/auth.js';
import { can } from '../lib/can.js';

type KhachHangDto = {
  id: string;
  code: string;
  name: string;
  customerType: number;
  registeredAddress: string;
  idNumber: string | null;
  ownerName: string;
  debt: string;
};

export function DanhSachKhachHang() {
  const { nguoiDung } = usePhien();
  const { di } = useDuong();
  const [moLap, datMoLap] = useState(false);
  const [tim, datTim] = useState('');
  // Tìm kiếm chạy Ở MÁY CHỦ (`?q=`), nên phân trang cũng phải ở máy chủ: cắt
  // tại chỗ thì trang 2 của một từ khoá không tồn tại.
  const {
    muc: ds,
    tong,
    loi,
    trang,
    soTrang,
    doiTrang,
  } = useTrangMay<KhachHangDto>(tim ? `/customers?q=${encodeURIComponent(tim)}` : '/customers');

  return (
    <section className="trang">
      <div className="dau-trang">
        <h1>Khách hàng</h1>
        {can(nguoiDung?.role, 'lapKhachHang') && (
          <button type="button" className="nut nut-chinh" onClick={() => datMoLap(true)}>
            Lập khách hàng
          </button>
        )}
      </div>
      <OTimKiem
        id="tim-khach-hang"
        nhan="Tìm theo tên, địa chỉ hoặc mã số thuế"
        giaTri={tim}
        doi={datTim}
      />

      {loi !== null && <BaoLoi loi={loi} />}
      {ds === null && loi === null && <DangTai />}
      {ds?.length === 0 && (
        <Trong tieuDe="Không tìm thấy khách hàng nào" moTa="Thử bớt từ khoá hoặc gõ mã số thuế." />
      )}

      {ds && ds.length > 0 && (
        <>
        <ul className="danh-sach-the">
          {ds.map((k) => (
            <li key={k.id}>
              <Lien den={`/khach-hang/${k.id}`} className="the-lien">
                {/* Loại khách hàng đứng cạnh mã: nó quyết định ngưỡng chiết
                    khấu, nên người lập hồ sơ cần thấy nó TRƯỚC khi mở khách
                    hàng ra, không phải sau. */}
                <span className="ma-phu">
                  {k.code} · {nhanLoaiKhach(k.customerType)}
                </span>
                <strong>{k.name}</strong>
                <span className="phu">{k.registeredAddress}</span>
              </Lien>
            </li>
          ))}
        </ul>
        <PhanTrang trang={trang} soTrang={soTrang} tong={tong} doiTrang={doiTrang} nhan="khách hàng" />
        </>
      )}

      {moLap && (
        <BieuMauKhachHang
          dong={() => datMoLap(false)}
          xong={(idMoi) => {
            datMoLap(false);
            // Đi thẳng sang màn hình chi tiết: việc tiếp theo gần như luôn là
            // tải hồ sơ pháp lý lên hoặc lập CSBH cho khách vừa tạo.
            di(`/khach-hang/${idMoi}`);
          }}
        />
      )}
    </section>
  );
}

type HoSoHienHanh = {
  id: string;
  code: string;
  status: string;
  appliedDate: string | null;
  lines: { id: string; productName: string; netPrice: string; discountRate: string }[];
};

export function ChiTietKhachHang({ id }: { id: string }) {
  const { nguoiDung } = usePhien();
  const [kh, datKh] = useState<KhachHangDayDu | null>(null);
  const [hoSo, datHoSo] = useState<HoSoHienHanh | null | 'khong-co'>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [mo, datMo] = useState<'sua' | 'tdv' | 'ngung' | null>(null);
  const [lan, datLan] = useState(0);

  useEffect(() => {
    const huy = new AbortController();
    layJson<KhachHangDayDu>(`/customers/${id}`, huy.signal)
      .then(datKh)
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    layJson<HoSoHienHanh>(`/policies/current?customerId=${encodeURIComponent(id)}`, huy.signal)
      .then(datHoSo)
      // 404 nghĩa là khách chưa có CSBH nào — trạng thái bình thường, không phải lỗi.
      .catch(() => datHoSo('khong-co'));
    return () => huy.abort();
  }, [id, lan]);

  if (loi !== null) return <BaoLoi loi={loi} />;
  if (!kh) return <DangTai />;

  const taiLai = () => datLan((x) => x + 1);

  return (
    <section className="trang">
      <div className="dau-trang">
        <div>
          <h1>{kh.name}</h1>
          <p className="mo-ta-trang">
            Mã khách hàng {kh.code}
            {kh.status === 'NGUNG_HOP_TAC' && (
              <>
                {' · '}
                <span className="nhan nhan-canh-bao">Đã xoá</span>
              </>
            )}
          </p>
        </div>
        <div className="nhom-nut nhom-nut-gon">
          {can(nguoiDung?.role, 'suaKhachHang') && (
            <button type="button" className="nut nut-nhe" onClick={() => datMo('sua')}>
              Sửa
            </button>
          )}
          {can(nguoiDung?.role, 'doiTdvPhuTrach') && (
            <button type="button" className="nut nut-nhe" onClick={() => datMo('tdv')}>
              Đổi TDV phụ trách
            </button>
          )}
          {/* Chỉ hiện với khách chưa xoá. Một nút "Xoá" trên một khách đã xoá
              là một nút bấm vào chỉ để nhận lỗi. */}
          {can(nguoiDung?.role, 'xoaKhachHang') && kh.status !== 'NGUNG_HOP_TAC' && (
            <button type="button" className="nut nut-canh-bao" onClick={() => datMo('ngung')}>
              Xoá
            </button>
          )}
        </div>
      </div>

      <dl className="the-so">
        <div>
          <dt>Loại khách hàng</dt>
          <dd>{nhanLoaiKhach(kh.customerType)}</dd>
        </div>
        <div>
          <dt>Địa chỉ đăng ký</dt>
          <dd>{kh.registeredAddress}</dd>
        </div>
        <div>
          <dt>Mã số thuế / CCCD</dt>
          <dd>{kh.idNumber ?? '—'}</dd>
        </div>
        <div>
          <dt>Người đại diện</dt>
          <dd>{kh.ownerName}</dd>
        </div>
        <div>
          <dt>Công nợ</dt>
          <dd className="so">{tien(kh.debt)}</dd>
        </div>
      </dl>

      <h2>CSBH đang áp dụng</h2>
      {hoSo === null && <DangTai />}
      {hoSo === 'khong-co' && (
        <Trong
          tieuDe="Khách hàng chưa có CSBH nào đang hiệu lực"
          moTa="Trình dược viên phụ trách lập hồ sơ mới từ mục Hồ sơ CSBH."
        />
      )}
      {hoSo !== null && hoSo !== 'khong-co' && (
        <div className="the">
          <div className="dau-trang">
            <Lien den={`/ho-so/${hoSo.id}`}>
              <strong>{hoSo.code}</strong>
            </Lien>
            <Nhan trangThai={hoSo.status} />
          </div>
          <p className="phu">Ngày áp dụng {ngay(hoSo.appliedDate)}</p>
          <p className="phu">{hoSo.lines.length} dòng sản phẩm</p>
        </div>
      )}

      {/*
        CHỈ TDV PHỤ TRÁCH khách hàng này (`0069`).

        Trước đó là `can(role, 'taiTepDinhKem')` — mọi vai trò ghi, cho mọi khách
        trong phạm vi của mình. Giấy tờ pháp lý là thứ TDV xin của khách và mang
        về; máy chủ giờ chặn đúng luật ấy, nên bày vùng tải lên cho người khác là
        bày một thứ chắc chắn trả 403.
      */}
      <HoSoPhapLy khachHangId={id} choPhepGhi={nguoiDung?.id === kh.tdvUserId} />

      {mo === 'sua' && (
        <BieuMauKhachHang
          khach={kh}
          dong={() => datMo(null)}
          xong={() => {
            datMo(null);
            taiLai();
          }}
        />
      )}
      {mo === 'tdv' && (
        <DoiTdvPhuTrach
          khachHangId={id}
          tdvHienTai={kh.tdvUserId}
          dong={() => datMo(null)}
          xong={() => {
            datMo(null);
            taiLai();
          }}
        />
      )}

      {mo === 'ngung' && (
        <HopThoaiNgungHopTac
          kh={kh}
          dong={() => datMo(null)}
          xong={() => {
            datMo(null);
            taiLai();
          }}
        />
      )}
    </section>
  );
}
