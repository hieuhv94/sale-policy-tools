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
import { LichSuCsbh } from '../components/LichSuCsbh.js';
import {
  BieuMauKhachHang,
  DoiTdvPhuTrach,
  type KhachHangDayDu,
  HopThoaiNgungHopTac,
} from '../components/SuaKhachHang.js';
import { usePhien } from '../lib/auth.js';
import { can, xem } from '../lib/can.js';
import { la404 } from '../lib/loi.js';

type KhachHangDto = {
  id: string;
  code: string;
  name: string;
  customerType: number;
  /** Bản gộp nhiều dòng. Thẻ danh sách dùng mảng bên dưới (`0154`). */
  registeredAddress: string;
  registeredAddresses: string[];
  province: string;
  streetWard: string;
  deliveryAddresses: string[];
  idNumber: string | null;
  ownerName: string;
  phone: string | null;
  /** Câu chữ điều khoản thanh toán, máy chủ dựng sẵn (`0138`). */
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
                {/*
                  ĐỊA CHỈ ĐẦU cộng một con số, không phải cả danh sách (`0154`).

                  Cột `registeredAddress` là chuỗi GỘP ngăn bằng `\n`. Đổ thẳng
                  vào JSX thì HTML nuốt ký tự xuống dòng thành dấu cách và ba
                  địa chỉ dính thành một dòng dài không đọc được — hỏng im lặng,
                  vì với khách một địa chỉ thì nó vẫn đúng.

                  Thẻ này trả lời *"có phải khách tôi đang tìm không"*, và địa
                  chỉ đầu đủ để trả lời. Con số nói cho người đọc biết còn nữa,
                  để họ không tưởng khách chỉ có một điểm.
                */}
                <span className="phu">
                  {k.registeredAddresses[0] ?? '—'}
                  {k.registeredAddresses.length > 1 &&
                    ` · +${k.registeredAddresses.length - 1} địa chỉ khác`}
                </span>
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
  /** Lỗi của riêng khối *CSBH đang áp dụng* — không dỡ cả màn hình khách hàng. */
  const [loiHoSo, datLoiHoSo] = useState<unknown>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [mo, datMo] = useState<'sua' | 'tdv' | 'ngung' | null>(null);
  const [lan, datLan] = useState(0);

  /*
   * Vai trò này có ĐỌC ĐƯỢC hồ sơ không (`0133`).
   *
   * Đúng một cờ cho cả hai khối CSBH dưới đây, và nó là CHÍNH cái cờ đã ẩn mục
   * menu *Hồ sơ CSBH* — không phải một phép suy thứ hai. Quản trị hệ thống là
   * vai trò duy nhất trả `false` hôm nay.
   *
   * KHÔNG GỌI API khi cờ tắt, chứ không phải gọi rồi bắt lỗi: `scope_user_ids`
   * rỗng nên máy chủ chắc chắn trả `403 OUT_OF_SCOPE`, và bắt lỗi là dựng câu
   * trả lời từ một mã lỗi — hỏng nếu máy chủ đổi mã. Ở đây câu trả lời đã biết
   * trước khi hỏi.
   */
  const xemDuocHoSo = xem(nguoiDung?.role, 'hoSo');

  useEffect(() => {
    const huy = new AbortController();
    layJson<KhachHangDayDu>(`/customers/${id}`, huy.signal)
      .then(datKh)
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    if (xemDuocHoSo) {
      layJson<HoSoHienHanh>(`/policies/current?customerId=${encodeURIComponent(id)}`, huy.signal)
        .then(datHoSo)
        .catch((e: unknown) => {
          if (huy.signal.aborted) return;
          // 404 nghĩa là khách chưa có CSBH nào — câu trả lời bình thường.
          // Mọi lỗi KHÁC thì nói ra (`0089`): nuốt chúng vào cùng nhánh này là
          // khẳng định "chưa có CSBH nào" trong khi thật ra chưa hỏi được.
          if (la404(e)) datHoSo('khong-co');
          else datLoiHoSo(e);
        });
    }
    return () => huy.abort();
  }, [id, lan, xemDuocHoSo]);

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
          {/*
            LẬP HỒ SƠ NGAY TỪ ĐÂY (`0083`) — đi thẳng, không phải tìm lại khách.

            Đường cũ: *Hồ sơ CSBH* → *Lập hồ sơ* → gõ lại tên khách vừa xem →
            chọn trong danh sách. Ba bước để quay lại đúng chỗ đang đứng, và
            bước thứ ba còn có khả năng chọn nhầm một khách trùng tên.

            HAI ĐIỀU KIỆN, và cả hai đều khớp đúng luật máy chủ:
              - `lapHoSo` — chỉ TDV;
              - đúng TDV ĐANG PHỤ TRÁCH khách này. `create()` gọi
                `assertInScope(customer.tdvUserId, me)`, mà phạm vi của một TDV
                là chính họ — nên TDV khác bấm vào chắc chắn nhận 403.

            Khách đã ngừng hợp tác thì ẩn, cùng lý do với nút *Xoá* bên dưới:
            máy chủ trả `CUSTOMER_RETIRED`, và một nút bấm vào chỉ để nhận lỗi
            là một nút không nên có.
          */}
          {can(nguoiDung?.role, 'lapHoSo') &&
            nguoiDung?.id === kh.tdvUserId &&
            kh.status !== 'NGUNG_HOP_TAC' && (
              <Lien den={`/ho-so/moi?khachHang=${kh.id}`} className="nut nut-chinh">
                Lập hồ sơ CSBH
              </Lien>
            )}
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

      {/*
        THỨ TỰ VÀ TẬP Ô — khách hàng chốt 29/08 (`0153`).

        ĐỊA CHỈ ĐĂNG KÝ RA KHỎI KHỐI NÀY, và đó là bỏ khỏi CHỖ BÀY chứ không bỏ
        khỏi hệ thống. Trường vẫn bắt buộc lúc lập khách, vẫn sửa được ở hộp
        *Sửa*, vẫn đóng băng vào hồ sơ (`kh_dia_chi_dang_ky_snap`, `0101`) và vẫn
        in trên tờ CSBH lẫn hợp đồng. Nó cũng vẫn hiện ở **thẻ trong danh sách** —
        chỗ ấy giữ, vì hai khách trùng tên chỉ phân biệt được bằng địa chỉ, và ô
        tìm kiếm ngay trên đó khai *"tìm theo tên, địa chỉ hoặc mã số thuế"*.

        LOẠI KHÁCH HÀNG XUỐNG CUỐI. Nó đứng đầu từ P13 vì nó quyết định ngưỡng
        chiết khấu — nhưng câu ấy đúng với NGƯỜI LẬP HỒ SƠ, và người lập hồ sơ
        đọc nó ở thẻ danh sách (`ma-phu`, ngay cạnh mã) trước khi mở khách ra.
        Trong khối này thì bốn ô kia là thứ người ta mở khách hàng ra để tra:
        mã số thuế, người đại diện, số điện thoại, công nợ — bốn mục đi thẳng vào
        hợp đồng. Loại khách là một phân loại, không phải một thông tin liên hệ.
      */}
      <dl className="the-so">
        <div>
          <dt>Mã số thuế</dt>
          {/* `0175` — bắt buộc và duy nhất từ 05/09. Dấu gạch chỉ còn ở khách
              hàng lập trước ngày ấy: họ chưa ai khai. */}
          <dd>{kh.idNumber ?? '—'}</dd>
        </div>
        {/*
          ĐỊA CHỈ ĐĂNG KÝ QUAY LẠI KHỐI NÀY, ở dạng HAI Ô (`0175`, chốt 05/09).

          `0153` đưa nó ra khỏi đây với lý do *"bỏ khỏi chỗ bày, không bỏ khỏi hệ
          thống"* — và lý do ấy đúng với một chuỗi địa chỉ tự do đã hiện sẵn trên
          thẻ danh sách. Khách hàng vừa yêu cầu ngược lại, và cũng bằng một câu
          khác: *"hiển thị thông tin ở mục trên trong trang thông tin khách
          hàng"*, ngay sau câu tách nó thành hai ô. Hai ô ấy là dữ liệu theo giấy
          đăng ký kinh doanh, không phải một dòng địa chỉ để nhận ra khách.
        */}
        <div>
          <dt>Tỉnh/Thành phố</dt>
          <dd>{kh.province || '—'}</dd>
        </div>
        <div>
          <dt>Số nhà, Phường xã</dt>
          <dd>{kh.streetWard || '—'}</dd>
        </div>
        <div>
          <dt>Người đại diện</dt>
          <dd>{kh.ownerName}</dd>
        </div>
        <div>
          <dt>Số điện thoại</dt>
          {/* Dấu gạch chứ không ô trống: khách hàng lập trước `0128` chưa ai
              khai số, và một ô rỗng đọc như lỗi hiển thị. */}
          <dd>{kh.phone ?? '—'}</dd>
        </div>
        <div>
          <dt>Công nợ</dt>
          {/* `0138` — một câu chữ, không phải số tiền: bỏ `.so` (căn phải,
              chữ số đều cột) vì đây thôi là một con số. */}
          <dd>{kh.debt || '—'}</dd>
        </div>
        <div>
          <dt>Loại khách hàng</dt>
          <dd>{nhanLoaiKhach(kh.customerType)}</dd>
        </div>
        {/*
          ĐỊA CHỈ GIAO HÀNG — CHỈ KHI CÓ (`0175`).

          *"Hiển thị thông tin này trong trang thông tin của khách hàng NẾU CÓ"*.
          Vế cuối là một yêu cầu thật, không phải cách nói: mảng rỗng nghĩa là
          *"giao tới địa chỉ đăng ký"* (`0006`), nên một ô ghi dấu gạch ở đây sẽ
          nói rằng khách hàng thiếu một thông tin mà họ không hề thiếu.

          Nhiều địa chỉ thì mỗi cái một dòng: chúng là một danh sách, và nối bằng
          dấu phẩy thì một địa chỉ vốn đã có dấu phẩy sẽ đọc ra thành hai.
        */}
        {kh.deliveryAddresses.length > 0 && (
          <div>
            <dt>Địa chỉ giao hàng</dt>
            <dd>
              {kh.deliveryAddresses.map((d, i) => (
                <span key={i} className="dong-dia-chi">
                  {d}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>

      <h2>CSBH đang áp dụng</h2>
      {/*
        KHÔNG KHẢ DỤNG, chứ không phải lỗi và cũng không phải "chưa có" (`0133`).

        Ba câu trả lời khác hẳn nhau, và hai câu kia đều nói sai với Quản trị hệ
        thống: một khối đỏ đọc như hệ thống đang hỏng, còn *"khách hàng chưa có
        CSBH nào"* là một lời khẳng định về DỮ LIỆU mà màn hình này không có căn
        cứ để đưa ra — khách rất có thể đang có một CSBH hiệu lực.
      */}
      {!xemDuocHoSo && (
        <Trong
          tieuDe="Không khả dụng với vai trò của bạn"
          moTa="Quản trị hệ thống không tham gia luồng duyệt nên không xem được hồ sơ CSBH. Thông tin khách hàng và việc đổi TDV phụ trách vẫn dùng bình thường."
        />
      )}
      {xemDuocHoSo && loiHoSo !== null && <BaoLoi loi={loiHoSo} thuLai={taiLai} />}
      {xemDuocHoSo && hoSo === null && loiHoSo === null && <DangTai />}
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
          <p className="phu">{hoSo.lines.length} sản phẩm</p>
        </div>
      )}

      {/*
        LỊCH SỬ CSBH (`0082`) — đứng ngay dưới *CSBH đang áp dụng*.

        Hai khối trả lời hai câu hỏi kề nhau: "bây giờ khách này đang áp dụng
        cái gì" và "trước đó thì sao". Đặt cạnh nhau vì người mở màn hình khách
        hàng ra thường hỏi cả hai trong cùng một lượt — và câu thứ hai tới giờ
        chưa có chỗ nào trả lời.
      */}
      <h2>Lịch sử CSBH</h2>
      {/*
        Cùng cờ, cùng lý do với khối trên (`0133`) — và ở đây còn cần hơn:
        `/policies?customerId=…` lọc theo phạm vi nên với Quản trị nó trả về một
        DANH SÁCH RỖNG chứ không phải lỗi, và `LichSuCsbh` sẽ nói "chưa có phiên
        bản nào". Một câu sai mà không có dấu hiệu nào cho thấy nó sai.
      */}
      {xemDuocHoSo ? (
        <LichSuCsbh khachHangId={id} />
      ) : (
        <Trong
          tieuDe="Không khả dụng với vai trò của bạn"
          moTa="Lịch sử CSBH thuộc luồng duyệt, ngoài phạm vi của Quản trị hệ thống."
        />
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
