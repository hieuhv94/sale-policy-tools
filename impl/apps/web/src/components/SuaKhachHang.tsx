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
import { dang, layJson, va, xoa } from '../lib/api.js';
import {
  DIEU_KHOAN_NO,
  LOAI_KHACH_HANG,
  NHAN_DIEU_KHOAN_NO,
  nhanLoaiKhach,
} from '../lib/danh-muc.js';
import { BaoLoi, ChuThichBatBuoc, DangTai, HopThoai, Truong } from './Chung.js';
import { useBaoLoi } from '../lib/bao-loi.js';

export type KhachHangDayDu = {
  id: string;
  code: string;
  name: string;
  customerType: number;
  registeredAddress: string;
  deliveryAddress: string | null;
  ownerName: string;
  ownerTitle: string | null;
  phone: string | null;
  idNumber: string | null;
  /** Câu chữ đã dựng xong — chỉ để hiện, không sửa qua ô này (`0138`). */
  debt: string;
  debtTerm: string;
  debtNote: string | null;
  tdvUserId: string | null;
  /** `DANG_HOP_TAC` | `NGUNG_HOP_TAC` (`0034`). */
  status: string;
};

type Gia = {
  code: string;
  name: string;
  customerType: string;
  registeredAddress: string;
  deliveryAddress: string;
  ownerName: string;
  ownerTitle: string;
  phone: string;
  idNumber: string;
  debtTerm: string;
  debtNote: string;
};

const rong: Gia = {
  code: '',
  name: '',
  customerType: '1',
  registeredAddress: '',
  deliveryAddress: '',
  ownerName: '',
  ownerTitle: '',
  phone: '',
  idNumber: '',
  debtTerm: 'SAU_NHAN_HANG',
  debtNote: '',
};

const tuDto = (k: KhachHangDayDu): Gia => ({
  code: k.code,
  name: k.name,
  customerType: String(k.customerType),
  registeredAddress: k.registeredAddress,
  deliveryAddress: k.deliveryAddress ?? '',
  ownerName: k.ownerName,
  ownerTitle: k.ownerTitle ?? '',
  phone: k.phone ?? '',
  idNumber: k.idNumber ?? '',
  debtTerm: k.debtTerm,
  debtNote: k.debtNote ?? '',
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
  const { bao } = useBaoLoi();
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
        ...opt('phone', coGiaTri(g.phone)),
        ...opt('idNumber', coGiaTri(g.idNumber)),
        /*
         * `debtTerm` gửi ở MỌI lượt, `debtNote` chỉ khi chọn *Khác* (`0138`).
         *
         * Máy chủ từ chối `debtNote` kèm phương án 1 hay 2 (`DEBT_NOTE_NOT_ALLOWED`),
         * và đó là chốt đúng — nhưng nếu giao diện cứ gửi kèm chuỗi cũ thì người
         * dùng đổi từ *Khác* sang phương án 1 sẽ nhận một lỗi mà họ không hiểu
         * mình vừa làm gì sai.
         */
        debtTerm: g.debtTerm,
        ...(g.debtTerm === 'KHAC' ? { debtNote: g.debtNote.trim() } : {}),
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
      bao(err);
    } finally {
      datDangGui(false);
    }
  };

  const duGiaTri =
    g.name.trim() !== '' &&
    g.registeredAddress.trim() !== '' &&
    g.ownerName.trim() !== '' &&
    // Chọn *Khác* mà chưa gõ gì thì nút Lưu xám (`0138`) — máy chủ cũng chặn,
    // nhưng bắt người dùng bấm Lưu mới biết là bắt họ đi một vòng thừa.
    (g.debtTerm !== 'KHAC' || g.debtNote.trim() !== '') &&
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
        {/*
          SỐ ĐIỆN THOẠI (`0128`) — đứng cạnh người đại diện, vì nó là cách liên
          hệ CHÍNH của khách hàng và người nhập điền hai ô ấy cùng một lúc.

          Không phải ô bắt buộc của biểu mẫu này: khách hàng lập trước `0128`
          chưa ai khai, và bắt điền ngay là chặn cả những lượt sửa chẳng liên
          quan. Chốt nằm ở lượt GỬI DUYỆT — số này in ra bản CSBH, nên hồ sơ
          không rời trạng thái Nháp khi nó còn trống.
        */}
        <Truong id="kh-dien-thoai" nhan="Số điện thoại">
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              type="tel"
              inputMode="tel"
              value={g.phone}
              onChange={(e) => sua({ phone: e.target.value })}
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
        {/*
          CÔNG NỢ là một ĐIỀU KHOẢN, không phải số tiền (`0138`, chốt 27/08).

          Ô gõ nội dung chỉ hiện khi chọn *Khác*, và nó BẮT BUỘC khi hiện — máy
          chủ chặn cả hai chiều, ô này chỉ nói trước để không ai phải bấm Lưu
          mới biết.
        */}
        <Truong id="kh-no" nhan="Công nợ" bắtBuộc>
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={g.debtTerm}
              onChange={(e) => sua({ debtTerm: e.target.value })}
            >
              {DIEU_KHOAN_NO.map((d) => (
                <option key={d} value={d}>
                  {NHAN_DIEU_KHOAN_NO[d]}
                </option>
              ))}
            </select>
          )}
        </Truong>
        {g.debtTerm === 'KHAC' && (
          <Truong id="kh-no-khac" nhan="Ghi rõ điều khoản" bắtBuộc>
            {(p) => (
              <textarea
                {...p}
                className="o-nhap"
                rows={2}
                maxLength={500}
                value={g.debtNote}
                onChange={(e) => sua({ debtNote: e.target.value })}
              />
            )}
          </Truong>
        )}

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
  const { bao } = useBaoLoi();
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
      bao(err);
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


/**
 * Xoá một khách hàng (`0034`) — MỘT nút, hai kết cục.
 *
 * NHÃN là "Xoá" ở mọi chỗ người dùng nhìn thấy, dù bên trong có khi là xoá dòng
 * và có khi là chuyển trạng thái `NGUNG_HOP_TAC`. Trộn hai từ vựng trên cùng một
 * màn hình — bấm nút "Xoá" rồi thấy nhãn "Đã ngừng hợp tác" — là bắt người dùng
 * tự dịch giữa hai cách gọi cho một việc họ vừa làm.
 *
 * Hộp thoại nói ra HẬU QUẢ trước, vì hậu quả khác nhau theo lịch sử của khách và
 * người dùng không đoán được từ cái nút:
 *
 *   * Chưa hồ sơ nào → **xoá hẳn**, không lùi được.
 *   * Đã có hồ sơ → giữ lại để tra cứu, và mọi CSBH đang hiệu lực **hết hiệu lực**.
 *   * Còn hồ sơ đang chờ → **chặn**, kèm mã từng hồ sơ.
 */
export function HopThoaiNgungHopTac({
  kh,
  dong,
  xong,
}: {
  kh: KhachHangDayDu;
  dong: () => void;
  xong: () => void;
}) {
  const { bao } = useBaoLoi();
  const [xem, datXem] = useState<XemTruocNgung | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  useEffect(() => {
    const huy = new AbortController();
    layJson<XemTruocNgung>(`/customers/${kh.id}/ngung-hop-tac`, huy.signal)
      .then(datXem)
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [kh.id]);

  const gui = async () => {
    datLoi(null);
    datDangGui(true);
    try {
      await xoa(`/customers/${kh.id}`);
      xong();
    } catch (e) {
      bao(e);
    } finally {
      datDangGui(false);
    }
  };

  const chan = (xem?.dangCho.length ?? 0) > 0;

  return (
    <HopThoai tieuDe={`Xoá khách hàng ${kh.name}`} dong={dong}>
      {xem === null && loi === null ? (
        <DangTai />
      ) : chan ? (
        <>
          <p>
            Khách hàng còn <strong>{xem!.dangCho.length} hồ sơ CSBH chưa đi hết luồng duyệt</strong>.
            Xử lý xong hoặc xoá những hồ sơ đó trước, rồi quay lại đây.
          </p>
          <p className="ghi-chu">
            {xem!.dangCho.map((x) => `${x.code} (${x.status})`).join(' · ')}
          </p>
        </>
      ) : (
        <>
          {xem?.seXoaHan ? (
            <p>
              Khách hàng này <strong>chưa có hồ sơ CSBH nào</strong>, nên bản ghi sẽ bị{' '}
              <strong>xoá hẳn</strong> — không lấy lại được.
            </p>
          ) : (
            <p>
              Khách hàng đã có hồ sơ CSBH nên bản ghi <strong>được giữ lại để tra cứu</strong> hồ sơ
              cũ — nhưng đánh dấu <strong>Đã xoá</strong>, biến khỏi ô chọn lúc lập hồ sơ và{' '}
              <strong>không lập CSBH mới được nữa</strong>.
            </p>
          )}
          {(xem?.dangHieuLuc.length ?? 0) > 0 && (
            <p>
              <strong>{xem!.dangHieuLuc.length} CSBH đang có hiệu lực</strong> sẽ chuyển sang{' '}
              <strong>Hết hiệu lực</strong>: {xem!.dangHieuLuc.map((x) => x.code).join(' · ')}.
            </p>
          )}
        </>
      )}

      {loi !== null && <BaoLoi loi={loi} />}
      <div className="nhom-nut">
        {!chan && (
          <button
            type="button"
            className="nut nut-canh-bao"
            disabled={dangGui || xem === null}
            onClick={gui}
          >
            {dangGui ? 'Đang xử lý…' : 'Xoá'}
          </button>
        )}
        <button type="button" className="nut nut-nhe" onClick={dong}>
          {chan ? 'Đóng' : 'Huỷ'}
        </button>
      </div>
    </HopThoai>
  );
}

export type XemTruocNgung = {
  id: string;
  code: string;
  name: string;
  status: string;
  dangCho: { code: string; status: string }[];
  dangHieuLuc: { code: string }[];
  seXoaHan: boolean;
};
