/**
 * Lập và sửa khách hàng, và đổi TDV phụ trách.
 *
 * Hai ràng buộc nghiệp vụ được nói thẳng trên biểu mẫu, không giấu trong thông
 * báo lỗi sau khi bấm:
 *
 *   - **Mã khách hàng không sửa được sau khi lưu** (`CUST-04`). Sửa được nó là
 *     mọi hồ sơ CSBH cũ lặng lẽ trỏ sang một khách hàng khác. Nên ô mã chỉ có ở
 *     biểu mẫu lập mới.
 *   - **Trùng mã số thuế / CCCD vẫn lưu được**, chỉ cảnh báo (`CUST-07`): một
 *     chủ hộ mở nhiều điểm bán là chuyện có thật. Không nói trước thì người dùng
 *     tưởng mình nhập sai và đi sửa một dữ liệu đúng.
 */
import { useEffect, useState } from 'react';
import { dang, layJson, va } from '../lib/api.js';
import { LOAI_KHACH_HANG, nhanLoaiKhach } from '../lib/danh-muc.js';
import { BaoLoi, ChuThichBatBuoc, HopThoai, ONhapTien, Truong } from './Chung.js';

export type KhachHangDayDu = {
  id: string;
  code: string;
  name: string;
  customerType: number;
  registeredAddress: string;
  deliveryAddress: string | null;
  ownerName: string;
  ownerTitle: string | null;
  idNumber: string | null;
  debt: string;
  tdvUserId: string | null;
};

type Gia = {
  code: string;
  name: string;
  customerType: string;
  registeredAddress: string;
  deliveryAddress: string;
  ownerName: string;
  ownerTitle: string;
  idNumber: string;
  debt: string;
};

const rong: Gia = {
  code: '',
  name: '',
  customerType: '1',
  registeredAddress: '',
  deliveryAddress: '',
  ownerName: '',
  ownerTitle: '',
  idNumber: '',
  debt: '',
};

const tuDto = (k: KhachHangDayDu): Gia => ({
  code: k.code,
  name: k.name,
  customerType: String(k.customerType),
  registeredAddress: k.registeredAddress,
  deliveryAddress: k.deliveryAddress ?? '',
  ownerName: k.ownerName,
  ownerTitle: k.ownerTitle ?? '',
  idNumber: k.idNumber ?? '',
  debt: k.debt,
});

export function BieuMauKhachHang({
  khach,
  dong,
  xong,
}: {
  /** Có thì là SỬA, không có thì là LẬP MỚI. */
  khach?: KhachHangDayDu | undefined;
  dong: () => void;
  xong: (id: string) => void;
}) {
  const [g, datG] = useState<Gia>(khach ? tuDto(khach) : rong);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const sua = (p: Partial<Gia>) => datG((cu) => ({ ...cu, ...p }));

  /** Đang sửa một khách đã có, VÀ ô loại khách hàng thật sự đổi giá trị. */
  const doiLoai = khach !== undefined && Number(g.customerType) !== khach.customerType;

  // Trường tuỳ chọn để trống thì BỎ HẲN khỏi thân request, không gửi chuỗi rỗng:
  // `str(1, …)` của máy chủ từ chối chuỗi rỗng, nên gửi đi là 400 ở một trường
  // mà người dùng cố ý bỏ trống.
  const coGiaTri = (v: string) => (v.trim() === '' ? undefined : v.trim());

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      const than = {
        name: g.name.trim(),
        registeredAddress: g.registeredAddress.trim(),
        ownerName: g.ownerName.trim(),
        ...opt('deliveryAddress', coGiaTri(g.deliveryAddress)),
        ...opt('ownerTitle', coGiaTri(g.ownerTitle)),
        ...opt('idNumber', coGiaTri(g.idNumber)),
        ...opt('debt', coGiaTri(g.debt)),
      };
      if (khach) {
        // Chỉ gửi khi ĐÃ ĐỔI. Gửi kèm ở mọi lượt sửa thì một lần sửa địa chỉ
        // cũng ghi một dòng "đổi loại khách hàng" vào nhật ký kiểm toán, và
        // nhật ký đầy những thay đổi không có thật thì không ai đọc nữa.
        await va(`/customers/${khach.id}`, {
          ...than,
          ...(doiLoai ? { customerType: Number(g.customerType) } : {}),
        });
        xong(khach.id);
      } else {
        const moi = await dang<{ id: string }>('/customers', {
          code: g.code.trim(),
          customerType: Number(g.customerType),
          ...than,
        });
        xong(moi.id);
      }
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  const duGiaTri =
    g.name.trim() !== '' &&
    g.registeredAddress.trim() !== '' &&
    g.ownerName.trim() !== '' &&
    (khach !== undefined || g.code.trim() !== '');

  return (
    <HopThoai tieuDe={khach ? `Sửa ${khach.code}` : 'Lập khách hàng'} dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        {khach ? (
          <p className="ghi-chu">
            Mã khách hàng <strong>{khach.code}</strong> không sửa được. Hồ sơ CSBH đã lập trỏ tới mã
            này.
          </p>
        ) : (
          <>
            <Truong id="kh-ma" nhan="Mã khách hàng" bắtBuộc>
              {(p) => (
                <input {...p} className="o-nhap" value={g.code} onChange={(e) => sua({ code: e.target.value })} />
              )}
            </Truong>
            <p className="ghi-chu">
              <strong>Mã không sửa được sau khi lưu.</strong> Nhập nhầm thì phải lập khách hàng mới.
            </p>
          </>
        )}

        {/* LOẠI KHÁCH HÀNG sửa được, cả khi lập lẫn khi sửa. Trước đây khoá lại
            vì nó quyết định ngưỡng chiết khấu — nhưng khách hàng có đổi hạng
            thật, và cách duy nhất còn lại là lập một khách hàng mới với mã mới,
            tức là cắt đôi lịch sử CSBH của cùng một khách. */}
        <Truong id="kh-loai" nhan="Loại khách hàng" bắtBuộc>
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={g.customerType}
              onChange={(e) => sua({ customerType: e.target.value })}
            >
              {LOAI_KHACH_HANG.map((l) => (
                <option key={l} value={l}>
                  {nhanLoaiKhach(l)}
                </option>
              ))}
            </select>
          )}
        </Truong>

        {/*
          Cảnh báo CHỈ hiện khi ô thật sự đổi giá trị. Bày sẵn một khối vàng ở
          mọi lượt sửa tên hay địa chỉ là dạy người dùng bỏ qua nó, và lúc họ đổi
          loại thật thì nó đã thành nền.
        */}
        {doiLoai && (
          <div className="hop-canh-bao" role="note">
            <strong>
              Đổi từ {nhanLoaiKhach(khach!.customerType)} sang {nhanLoaiKhach(Number(g.customerType))}.
            </strong>{' '}
            Loại khách hàng quyết định ngưỡng chiết khấu. Hồ sơ <strong>Nháp</strong> và hồ sơ bị
            trả lại sẽ <strong>tự nhận ngưỡng mới</strong> ngay lần mở tiếp theo. Hồ sơ{' '}
            <strong>đã gửi duyệt</strong> thì giữ nguyên ngưỡng đã đóng băng — chúng sẽ hiện trong
            box <em>Yêu cầu cập nhật</em> ở trang Tổng quan để người phụ trách tự quyết định.
          </div>
        )}

        <Truong id="kh-ten" nhan="Tên khách hàng" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" value={g.name} onChange={(e) => sua({ name: e.target.value })} />
          )}
        </Truong>
        <Truong id="kh-dc-dk" nhan="Địa chỉ đăng ký" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              value={g.registeredAddress}
              onChange={(e) => sua({ registeredAddress: e.target.value })}
            />
          )}
        </Truong>
        <Truong id="kh-dc-gh" nhan="Địa chỉ giao hàng">
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              value={g.deliveryAddress}
              placeholder="Để trống thì dùng địa chỉ đăng ký"
              onChange={(e) => sua({ deliveryAddress: e.target.value })}
            />
          )}
        </Truong>
        <Truong id="kh-nguoi" nhan="Người đại diện" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              value={g.ownerName}
              onChange={(e) => sua({ ownerName: e.target.value })}
            />
          )}
        </Truong>
        <Truong id="kh-chuc" nhan="Chức danh người đại diện">
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              value={g.ownerTitle}
              onChange={(e) => sua({ ownerTitle: e.target.value })}
            />
          )}
        </Truong>
        <Truong id="kh-mst" nhan="Mã số thuế / CCCD">
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              value={g.idNumber}
              onChange={(e) => sua({ idNumber: e.target.value })}
            />
          )}
        </Truong>
        <p className="ghi-chu">
          Trùng mã số thuế với khách khác <strong>vẫn lưu được</strong> — hệ thống chỉ cảnh báo. Một
          chủ hộ mở nhiều điểm bán là chuyện bình thường.
        </p>
        <Truong id="kh-no" nhan="Công nợ" donVi="Tiền tệ đơn vị đồng">
          {(p) => <ONhapTien {...p} giaTri={g.debt} doi={(v) => sua({ debt: v })} />}
        </Truong>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || !duGiaTri}>
            {dangGui ? 'Đang lưu…' : khach ? 'Lưu' : 'Lập khách hàng'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}

const opt = (k: string, v: string | undefined) => (v === undefined ? {} : { [k]: v });

// --- Đổi TDV phụ trách -------------------------------------------------------

type Tdv = { id: string; username: string; fullName: string };

/**
 * Đổi TDV phụ trách một khách hàng — Sale Admin và Quản trị (`doiTdvPhuTrach`).
 *
 * Đây KHÔNG phải đổi một cái tên trên màn hình: phạm vi dữ liệu suy từ người
 * phụ trách, nên đổi xong thì TDV cũ thôi nhìn thấy khách hàng này và mọi hồ sơ
 * của họ, còn TDV mới thấy ngay. Câu đó nằm trên hộp thoại.
 */
export function DoiTdvPhuTrach({
  khachHangId,
  tdvHienTai,
  dong,
  xong,
}: {
  khachHangId: string;
  tdvHienTai: string | null;
  dong: () => void;
  xong: () => void;
}) {
  const [ds, datDs] = useState<Tdv[] | null>(null);
  const [chon, datChon] = useState(tdvHienTai ?? '');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  useEffect(() => {
    const huy = new AbortController();
    layJson<Tdv[]>('/auth/nguoi-theo-vai-tro/TDV', huy.signal)
      .then(datDs)
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, []);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await va(`/customers/${khachHangId}`, { tdvUserId: chon });
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe="Đổi trình dược viên phụ trách" dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        <p className="giai-thich">
          Đổi người phụ trách <strong>đổi luôn phạm vi nhìn thấy</strong>: trình dược viên cũ thôi
          thấy khách hàng này và mọi hồ sơ của họ; người mới thấy ngay.
        </p>
        <Truong id="tdv-chon" nhan="Trình dược viên" bắtBuộc>
          {(p) => (
            <select {...p} className="o-nhap" value={chon} onChange={(e) => datChon(e.target.value)}>
              <option value="">— Chọn —</option>
              {(ds ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName} ({t.username})
                </option>
              ))}
            </select>
          )}
        </Truong>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button
            type="submit"
            className="nut nut-chinh"
            disabled={dangGui || chon === '' || chon === tdvHienTai}
          >
            {dangGui ? 'Đang lưu…' : 'Đổi'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}
