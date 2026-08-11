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
import { LOAI_KHACH_HANG, LOAI_TRA_CUU, NHAN_TRA_CUU, type MucTraCuu } from '../lib/danh-muc.js';
import { BaoLoi, HopThoai, ONhapTien, Truong } from './Chung.js';

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
  provinceCode: string | null;
  hospitalCode: string | null;
  channelCode: string | null;
  tdvUserId: string | null;
};

type TraCuu = Record<string, MucTraCuu[]>;

/** Ba danh mục tra cứu tải cùng lúc — ba ô chọn cùng nằm trên một biểu mẫu. */
function useTraCuu(): TraCuu {
  const [ds, datDs] = useState<TraCuu>({});
  useEffect(() => {
    const huy = new AbortController();
    Promise.all(
      LOAI_TRA_CUU.map((k) =>
        layJson<MucTraCuu[]>(`/catalog/lookups/${k}`, huy.signal).then((r) => [k, r] as const),
      ),
    )
      .then((cap) => datDs(Object.fromEntries(cap)))
      .catch(() => undefined);
    return () => huy.abort();
  }, []);
  return ds;
}

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
  provinceCode: string;
  hospitalCode: string;
  channelCode: string;
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
  provinceCode: '',
  hospitalCode: '',
  channelCode: '',
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
  provinceCode: k.provinceCode ?? '',
  hospitalCode: k.hospitalCode ?? '',
  channelCode: k.channelCode ?? '',
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
  const traCuu = useTraCuu();
  const [g, datG] = useState<Gia>(khach ? tuDto(khach) : rong);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const sua = (p: Partial<Gia>) => datG((cu) => ({ ...cu, ...p }));

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
        ...opt('provinceCode', coGiaTri(g.provinceCode)),
        ...opt('hospitalCode', coGiaTri(g.hospitalCode)),
        ...opt('channelCode', coGiaTri(g.channelCode)),
      };
      if (khach) {
        await va(`/customers/${khach.id}`, than);
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
        {khach ? (
          <p className="ghi-chu">
            Mã khách hàng <strong>{khach.code}</strong> và loại khách hàng không sửa được. Hồ sơ CSBH
            đã lập trỏ tới mã này.
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
                      Loại {l}
                    </option>
                  ))}
                </select>
              )}
            </Truong>
          </>
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
        <Truong id="kh-no" nhan="Công nợ">
          {(p) => <ONhapTien {...p} giaTri={g.debt} doi={(v) => sua({ debt: v })} />}
        </Truong>

        {LOAI_TRA_CUU.map((k) => {
          const khoa = `${k}Code` as 'provinceCode' | 'hospitalCode' | 'channelCode';
          return (
            <Truong key={k} id={`kh-${k}`} nhan={NHAN_TRA_CUU[k]}>
              {(p) => (
                <select
                  {...p}
                  className="o-nhap"
                  value={g[khoa]}
                  onChange={(e) => sua({ [khoa]: e.target.value } as Partial<Gia>)}
                >
                  <option value="">— Không chọn —</option>
                  {(traCuu[k] ?? []).map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </Truong>
          );
        })}

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
    layJson<Tdv[]>('/admin/users/assignable-tdv', huy.signal)
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
