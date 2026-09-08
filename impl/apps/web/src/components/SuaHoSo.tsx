/**
 * Sửa nội dung hồ sơ: thêm dòng sản phẩm, đổi ngày áp dụng, xoá hồ sơ.
 *
 * Chỉ hiện khi hồ sơ ở trạng thái SỬA ĐƯỢC. Danh sách trạng thái đó do máy chủ
 * giữ (`EDITABLE` ở `policies.service.ts`), nên ở đây suy từ chính câu trả lời
 * của máy chủ thay vì chép lại: hồ sơ nào sửa được thì `allowed-actions` có
 * `SUBMIT` hoặc `RESUBMIT_AFTER_EDIT`. Chép danh sách trạng thái sang giao diện
 * là thêm một bản sao phải giữ đồng bộ với máy trạng thái.
 */
import { useEffect, useState } from 'react';
import { dang, layJson, va, xoa } from '../lib/api.js';
import { BaoLoi, ChuThichBatBuoc, HopThoai, ONhapTien, Truong } from './Chung.js';
import { useBaoLoi } from '../lib/bao-loi.js';
import { thieuTruong } from '../lib/bat-buoc.js';
import { homNayVN, tien } from '../lib/format.js';
import type { DongSanPham } from './BangSanPham.js';

export { suaDuoc } from '../lib/sua-ho-so.js';

/**
 * Chỉ những trường ô chọn này cần — KHÔNG dùng lại `SanPham` của `danh-muc.ts`.
 *
 * Kiểu kia mang cả trạng thái và nhóm, thứ mà biểu mẫu ở đây không đọc tới. Giữ
 * hẹp thì thêm một trường vào danh mục không kéo theo một thay đổi ở đây.
 */
type SanPham = {
  id: string;
  code: string;
  name: string;
  /** Giá bán Công ty hiện hành (`0123`). `null` ở dữ liệu cũ chưa từng đặt giá. */
  price: string | null;
};

type XemTruocNguong = {
  productCode: string;
  /** `null` đi kèm `KHONG_CO`: không có ngưỡng nào để đối chiếu. */
  threshold: string | null;
  /**
   * HAI giá trị, không phải bốn.
   *
   * Đây là kết quả tra NGAY BÂY GIỜ, nên nó không bao giờ mang hai nhãn lịch sử
   * mà dòng hồ sơ đã lưu có thể mang (`PRODUCT_DEFAULT` từ trước `0025`, và
   * `null` từ trước `0022`). Nhận đủ bốn ở đây là mời người đọc mã sau này viết
   * hai nhánh không bao giờ chạy.
   */
  thresholdSource: 'RULE' | 'KHONG_CO';
};

/**
 * Hỏi trước xem sản phẩm này có quy định chiết khấu nào phủ không, rồi cảnh báo
 * NGAY nếu không có.
 *
 * Vì sao hỏi trước khi lưu chứ không báo sau: ngưỡng ĐÓNG BĂNG vào dòng hồ sơ
 * lúc lưu. Biết sau thì phải xoá dòng, đi nhờ Quản trị khai quy định, rồi nhập
 * lại từ đầu. Biết trước thì người lập chọn được — vẫn lập và chấp nhận dòng
 * không có ngưỡng đối chiếu, hay dừng lại hỏi trước.
 *
 * Mọi lỗi ở đây KHÔNG hiện gì, và `0089` rà lại rồi giữ nguyên. Đây là thông
 * tin thêm, không phải điều kiện để
 * lưu; một khối đỏ "không tra được ngưỡng" cạnh biểu mẫu đang gõ dở chỉ làm
 * người dùng tưởng mình vừa làm hỏng thứ gì. Máy chủ vẫn tra lại lúc lưu, và từ
 * `0023` thì thiếu ngưỡng KHÔNG còn là lý do từ chối.
 */
function useXemTruocNguong(hoSoId: string, productId: string, ngayApDung: string) {
  const [xem, datXem] = useState<XemTruocNguong | null>(null);

  useEffect(() => {
    datXem(null);
    if (productId === '') return undefined;
    const huy = new AbortController();
    // `0180` — NGÀY ÁP DỤNG đi cùng: giá và ngưỡng phụ thuộc ngày (`0029`), nên
    // xem trước bằng hôm nay rồi ghi bằng ngày người dùng vừa gõ là bày ra một
    // con số và lưu một con số khác. Ô ngày nằm ngay trên ô sản phẩm nên người
    // dùng thấy hai thứ ấy đi cùng nhau.
    layJson<XemTruocNguong>(
      `/policies/${hoSoId}/threshold-preview?productId=${encodeURIComponent(productId)}` +
        (ngayApDung ? `&ngayApDung=${encodeURIComponent(ngayApDung)}` : ''),
      huy.signal,
    )
      .then(datXem)
      .catch(() => undefined);
    return () => huy.abort();
  }, [hoSoId, productId, ngayApDung]);

  return xem;
}

/**
 * Thêm MỘT dòng sản phẩm, hoặc SỬA một dòng đã có.
 *
 * Cùng một biểu mẫu, HAI đường máy chủ: `POST .../lines` để thêm, `PATCH
 * .../lines/:lineId` để sửa. Không gộp làm một vì trùng sản phẩm lúc THÊM là một
 * nhầm lẫn — người dùng tưởng mình đang thêm mặt hàng mới — và `POL-02` chặn nó
 * có chủ ý. Cho `POST` ghi đè là đánh mất một cái chặn đúng.
 *
 * Khi sửa thì Ô CHỌN SẢN PHẨM KHOÁ LẠI. Đổi sản phẩm không phải là sửa dòng này
 * mà là thêm một dòng khác — và dòng cũ vẫn nằm nguyên đó, nên người dùng tưởng
 * mình vừa đổi một dòng trong khi hồ sơ có thêm một sản phẩm.
 */
export function ThemDongSanPham({
  hoSoId,
  dongCu,
  dong,
  xong,
}: {
  hoSoId: string;
  /** Có nghĩa là SỬA dòng này. Bỏ trống là thêm dòng mới. */
  dongCu?: DongSanPham | undefined;
  dong: () => void;
  xong: () => void;
}) {
  const sua = dongCu !== undefined;
  const [ds, datDs] = useState<SanPham[] | null>(null);
  const [sanPham, datSanPham] = useState(dongCu?.productId ?? '');
  const [giaBanBuon, datGiaBanBuon] = useState(dongCu?.wholesalePrice ?? '');
  // Bắt đầu bằng MỘT ô khi thêm mới. Hồ sơ thường chỉ có một khoản chi phí; bày
  // sẵn bốn ô là bắt gõ số 0 vào ba ô không có nghĩa gì, rồi ba cột số 0 ấy đi
  // thẳng ra bản in. Khi sửa thì nạp đúng các khoản đang có.
  const [cpbh, datCpbh] = useState<string[]>(
    dongCu && dongCu.cpbh.length > 0 ? [...dongCu.cpbh] : [''],
  );
  const [ghiChu, datGhiChu] = useState(dongCu?.note ?? '');
  /*
   * NGÀY ÁP DỤNG của riêng dòng này (`0180`).
   *
   * Thêm mới thì mặc định HÔM NAY — cùng con số máy chủ sẽ điền nếu ô này trống,
   * nên màn hình và máy chủ không nói hai ngày khác nhau. Sửa thì nạp đúng ngày
   * dòng đang mang: rơi về hôm nay là âm thầm kéo một dòng áp dụng từ tháng sau
   * về hôm nay chỉ vì người dùng mở hộp thoại ra sửa một khoản chi phí.
   */
  const [ngayApDung, datNgayApDung] = useState(
    dongCu?.ngayApDung?.slice(0, 10) ?? homNayVN(),
  );
  const { bao } = useBaoLoi();
  // `loi` chỉ còn giữ lỗi TẢI danh mục sản phẩm — hộp thoại này không dựng nổi
  // nếu thiếu nó, nên đó là dạng `trang` chứ không phải lỗi của một lần bấm.
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);
  const xem = useXemTruocNguong(hoSoId, sanPham, ngayApDung);

  /** Giá bán Công ty của sản phẩm đang chọn. `null` = chưa chọn, hoặc không tra được. */
  const giaCongTy =
    (ds ?? []).find((s) => s.id === sanPham)?.price ?? (sua ? dongCu.companyPrice : null) ?? null;

  useEffect(() => {
    const huy = new AbortController();
    // `forNewPolicy=true` lọc bỏ sản phẩm đã vô hiệu hoá — bày ra rồi để máy chủ
    // từ chối là bắt người dùng đoán vì sao.
    layJson<{ items: SanPham[] }>('/catalog/products?limit=200&forNewPolicy=true', huy.signal)
      .then((r) => datDs(r.items))
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, []);

  const doiCpbh = (i: number, v: string) =>
    datCpbh((cu) => cu.map((x, j) => (j === i ? v : x)));

  const themCpbh = () => datCpbh((cu) => [...cu, '']);
  const botCpbh = (i: number) => datCpbh((cu) => cu.filter((_, j) => j !== i));

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datDangGui(true);
    try {
      const than = {
        wholesalePrice: giaBanBuon,
        // Ô để trống gửi '0' chứ không bỏ đi: người dùng đã mở ô đó ra thì nó là
        // một khoản họ có ý định khai, chỉ là bằng không. Bỏ đi sẽ làm lệch số
        // thứ tự của các khoản sau nó.
        cpbh: cpbh.map((v) => v || '0'),
        // Ghi chú gửi lên KỂ CẢ khi rỗng: `opt()` phía máy chủ coi chuỗi rỗng
        // là vắng mặt, và vắng mặt là lệnh xoá ghi chú cũ. Bỏ hẳn trường đi khi
        // rỗng cũng cho cùng kết quả, nhưng viết thẳng thế này thì đọc mã là
        // thấy ngay "xoá ô rồi lưu = xoá ghi chú".
        note: ghiChu.trim(),
        ngayApDung,
      };
      if (sua) await va(`/policies/${hoSoId}/lines/${dongCu.id}`, than);
      else await dang(`/policies/${hoSoId}/lines`, { productId: sanPham, ...than });
      xong();
    } catch (err) {
      bao(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai
      tieuDe={sua ? `Sửa ${dongCu.productCode}` : 'Thêm sản phẩm'}
      dong={dong}
    >
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        {/*
          NGÀY ÁP DỤNG ĐỨNG ĐẦU, trước cả ô chọn sản phẩm (`0180`).

          Khách hàng chốt *"cột ngày áp dụng để bên trái mã sản phẩm"* cho BẢNG;
          biểu mẫu đi theo cùng thứ tự vì hai thứ ấy đọc cùng nhau — người lập gõ
          xong biểu mẫu rồi nhìn lại hàng vừa thêm trong bảng.

          Nó cũng là ô phải gõ TRƯỚC theo nghĩa cơ học: giá bán Công ty và ngưỡng
          xem trước ngay dưới đây tra theo chính ngày này.
        */}
        <Truong id="dsp-ngay" nhan="Ngày áp dụng" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              type="date"
              value={ngayApDung}
              onChange={(e) => datNgayApDung(e.target.value)}
            />
          )}
        </Truong>

        <Truong id="dsp-sp" nhan="Sản phẩm" bắtBuộc>
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={sanPham}
              disabled={sua}
              onChange={(e) => datSanPham(e.target.value)}
            >
              <option value="">— Chọn sản phẩm —</option>
              {/* Khi sửa, danh mục có thể KHÔNG còn sản phẩm này (đã vô hiệu
                  hoá) — nhưng hồ sơ vẫn giữ nó. Thêm thẳng một mục từ chính dòng
                  đang sửa, nếu không ô chọn sẽ hiện rỗng và người dùng tưởng dữ
                  liệu hỏng. */}
              {sua && !(ds ?? []).some((s) => s.id === dongCu.productId) && (
                <option value={dongCu.productId}>
                  {dongCu.productName} ({dongCu.productCode})
                </option>
              )}
              {(ds ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          )}
        </Truong>

        {/*
          Cảnh báo NGAY sau ô chọn sản phẩm, không phải dưới đáy biểu mẫu: nó nói
          về sản phẩm vừa chọn, và người dùng sắp cuộn xuống gõ giá. Đặt cuối thì
          họ đọc nó sau khi đã gõ xong — quá muộn để đổi ý một cách rẻ.

          Không còn dấu ◆ dẫn đầu (`0028`): ký hiệu ấy đã gỡ khỏi bảng, nên để
          lại đây là trỏ tới một thứ người dùng sẽ không tìm thấy.
        */}
        {xem?.thresholdSource === 'KHONG_CO' && (
          <div className="hop-canh-bao" role="note">
            <strong>Chưa có quy định chiết khấu cho sản phẩm này.</strong> Không quy định nào phủ nó
            với loại khách hàng của khách hàng này, nên dòng này sẽ{' '}
            <strong>không có ngưỡng nào để đối chiếu</strong> — cột Tỷ lệ CK vẫn tính, chỉ là không
            đánh dấu vượt ngưỡng được. Vẫn lập hồ sơ được; báo Quản trị hệ thống nếu cần một ngưỡng
            cho sản phẩm này.
          </div>
        )}

        {/*
          GIÁ BÁN CÔNG TY, ngay trên ô Giá bán buôn (`0124`).
 
          Đây là con số mà tỷ lệ chiết khấu tính ngược từ đó — `1 − giá thu về /
          giá bán Công ty` — nên gõ giá bán buôn mà không thấy nó là gõ một nửa
          của một phép tính. Tới `0123` người lập phải mở màn hình Danh mục ở một
          tab khác để tra.
 
          Lấy từ DANH MỤC trước, rồi mới tới dòng đang sửa: sản phẩm đã vô hiệu
          hoá không có trong `ds` (`forNewPolicy=true` lọc nó đi) nhưng dòng cũ
          vẫn giữ con số đã chụp, và một ô trống ở đó đọc như một lỗi hiển thị.
        */}
        {giaCongTy !== null && (
          <p className="ghi-chu">
            Giá bán Công ty của sản phẩm này: <strong>{tien(giaCongTy)}</strong>. Tỷ lệ chiết khấu
            tính từ con số đó và giá thu về.
          </p>
        )}

        <Truong id="dsp-gia" nhan="Giá bán buôn" donVi="Tiền tệ đơn vị đồng" bắtBuộc>
          {(p) => <ONhapTien {...p} giaTri={giaBanBuon} doi={datGiaBanBuon} />}
        </Truong>

        {/* SỐ KHOẢN CPBH tuỳ dòng, người lập tự thêm bớt. Mỗi sản phẩm có cấu
            trúc chi phí khác nhau; ô cố định bốn là ép mọi sản phẩm vào một
            khuôn không có thật. */}
        {cpbh.map((v, i) => (
          <div className="hang-cpbh" key={i}>
            <Truong id={`dsp-cpbh${i + 1}`} nhan={`CPBH ${i + 1}`} donVi="Tiền tệ đơn vị đồng">
              {(p) => <ONhapTien {...p} giaTri={v} doi={(x) => doiCpbh(i, x)} />}
            </Truong>
            {cpbh.length > 1 && (
              <button
                type="button"
                className="nut nut-nhe"
                aria-label={`Bớt CPBH ${i + 1}`}
                onClick={() => botCpbh(i)}
              >
                Bớt
              </button>
            )}
          </div>
        ))}

        <div className="nhom-nut">
          <button type="button" className="nut nut-nhe" onClick={themCpbh}>
            + Thêm khoản chi phí
          </button>
        </div>

        {/* Ghi chú ĐỨNG CUỐI, sau mọi con số: nó nói VỀ những con số ấy, nên
            người lập viết nó sau khi đã nhập xong chứ không phải trước. */}
        <Truong id="dsp-ghi-chu" nhan="Ghi chú">
          {(p) => (
            <textarea
              {...p}
              className="o-nhap"
              rows={2}
              maxLength={500}
              value={ghiChu}
              onChange={(e) => datGhiChu(e.target.value)}
            />
          )}
        </Truong>
        <p className="ghi-chu">
          Ghi chú riêng cho sản phẩm này — <strong>in ra bản CSBH A4</strong> và hiện trong bảng
          cho mọi người duyệt. Tối đa 500 ký tự. Để trống thì không có ghi chú.
        </p>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button
            type="submit"
            className="nut nut-chinh"
            disabled={
              dangGui ||
              thieuTruong('dong-san-pham', {
                productId: sanPham,
                wholesalePrice: giaBanBuon,
                ngayApDung,
              }).length > 0
            }
          >
            {dangGui ? 'Đang lưu…' : sua ? 'Lưu dòng' : 'Thêm dòng'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}

/*
 * `SuaNgayApDung` GỠ HẲN ở `0180`.
 *
 * Hộp thoại này sửa ngày áp dụng CỦA HỒ SƠ, và trường ấy không còn tồn tại —
 * ngày là của từng dòng sản phẩm, sửa ngay trong `ThemDongSanPham` cùng với giá
 * bán buôn và các khoản CPBH của chính dòng đó. Đường máy chủ nó gọi
 * (`PATCH /policies/:id`) cũng đã gỡ.
 */

/**
 * Xoá hồ sơ. Hỏi lại BẰNG CÁCH BẮT GÕ MÃ HỒ SƠ, không phải một nút "Chắc chưa?".
 *
 * Xoá là thao tác không lùi được và nút của nó nằm ngay cạnh những nút dùng hàng
 * ngày. Một hộp thoại xác nhận thường bị bấm qua theo phản xạ; gõ lại mã thì
 * không thể bấm nhầm.
 *
 * HAI HẬU QUẢ KHÁC NHAU, và hộp thoại phải nói đúng cái sắp xảy ra (`0035`).
 * Hồ sơ chưa gửi duyệt thì biến mất hẳn; hồ sơ đã bị trả lại thì ở lại với nhãn
 * *Đã xoá* và giữ nguyên lịch sử. Nói chung chung "xoá là không lùi được" cho cả
 * hai là đúng một nửa ở mỗi vế — người dùng hoặc tưởng mình xoá sạch được một
 * hồ sơ người khác đã đọc, hoặc ngại xoá một bản nháp vì sợ nó nằm lại.
 */
export function XoaHoSo({
  hoSoId,
  ma,
  trangThai,
  dong,
  xong,
}: {
  hoSoId: string;
  ma: string;
  trangThai: string;
  dong: () => void;
  xong: () => void;
}) {
  /** Chưa gửi duyệt thì chưa ai ngoài người lập thấy hồ sơ này — xoá hẳn. */
  const xoaHan = trangThai === 'NHAP';
  const { bao } = useBaoLoi();
  const [go, datGo] = useState('');
  const [dangGui, datDangGui] = useState(false);

  const gui = async () => {
    datDangGui(true);
    try {
      await xoa(`/policies/${hoSoId}`);
      xong();
    } catch (e) {
      bao(e);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe={`Xoá hồ sơ ${ma}`} dong={dong}>
      {xoaHan ? (
        <p className="giai-thich">
          Hồ sơ này <strong>chưa gửi duyệt</strong> nên nó biến mất hẳn cùng mọi sản phẩm, và{' '}
          <strong>không lùi được</strong>. Lịch sử của riêng hồ sơ cũng mất theo — chưa ai ngoài bạn
          nhìn thấy nó.
        </p>
      ) : (
        <p className="giai-thich">
          Hồ sơ này <strong>đã từng vào luồng duyệt</strong> nên nó ở lại với nhãn{' '}
          <strong>Đã xoá</strong>: lịch sử và lý do{' '}
          trả lại giữ nguyên, tra cứu được, nhưng hồ sơ không đi tiếp được nữa và{' '}
          <strong>không lùi được</strong>. Người đã xử lý hồ sơ trước đó sẽ nhận thư báo.{' '}
          {/*
            `0155` — bỏ nhánh `TU_CHOI`. Trạng thái ấy không còn, nên đây chỉ còn
            đúng MỘT đường vào: hồ sơ bị trả lại rồi người lập tự bỏ.
          */}
          Hồ sơ vẫn được tính trong <strong>báo cáo tỷ lệ trả lại</strong> — xoá ở đây chỉ dọn thẻ
          đếm trên trang tổng quan của bạn.
        </p>
      )}
      <Truong id="xhs-ma" nhan={`Gõ lại mã hồ sơ để xác nhận: ${ma}`} bắtBuộc>
        {(p) => (
          <input
            {...p}
            className="o-nhap"
            autoComplete="off"
            value={go}
            onChange={(e) => datGo(e.target.value)}
          />
        )}
      </Truong>
      <div className="nhom-nut">
        <button
          type="button"
          className="nut nut-canh-bao"
          disabled={dangGui || go.trim() !== ma}
          onClick={gui}
        >
          {dangGui ? 'Đang xoá…' : 'Xoá hồ sơ'}
        </button>
        <button type="button" className="nut nut-nhe" onClick={dong}>
          Huỷ
        </button>
      </div>
    </HopThoai>
  );
}
