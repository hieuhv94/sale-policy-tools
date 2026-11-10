/**
 * Sửa nội dung hồ sơ: thêm dòng sản phẩm, đổi ngày áp dụng, xoá hồ sơ.
 *
 * Chỉ hiện khi hồ sơ ở trạng thái SỬA ĐƯỢC. Danh sách trạng thái đó do máy chủ
 * giữ (`EDITABLE` ở `policies.service.ts`), nên ở đây suy từ chính câu trả lời
 * của máy chủ thay vì chép lại: hồ sơ nào sửa được thì `allowed-actions` có
 * `SUBMIT` hoặc `RESUBMIT_AFTER_EDIT`. Chép danh sách trạng thái sang giao diện
 * là thêm một bản sao phải giữ đồng bộ với máy trạng thái.
 */
import { useEffect, useMemo, useState } from 'react';
import { computeLine, rate2ToNumeric } from '@csbh/domain-policy';
import { dang, layJson, va, xoa } from '../lib/api.js';
import { BaoLoi, ChuThichBatBuoc, HopThoai, ONhapNgay, ONhapTien, Truong } from './Chung.js';
import { ChonCoGo } from './ChonCoGo.js';
import { useBaoLoi } from '../lib/bao-loi.js';
import { thieuTruong } from '../lib/bat-buoc.js';
import { homNayVN, tien, tyLe } from '../lib/format.js';
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
  /*
   * `price` ĐÃ GỠ KHỎI KIỂU NÀY ở `0193`, và chỗ trống để lại có chủ ý.
   *
   * `0124` lấy giá bán Công ty từ đây vì khi ấy ngày áp dụng là thuộc tính của
   * HỒ SƠ. `0180` đưa ngày xuống từng dòng, và giá thì phụ thuộc ngày — nên
   * trường này là giá HÔM NAY, tức câu trả lời sai cho mọi dòng hẹn ngày khác.
   * Nguồn đúng là `threshold-preview`, thứ đã nhận `ngayApDung` từ `0180`.
   *
   * Giữ nó lại làm một trường không ai đọc là để sẵn một nguồn thứ hai cho người
   * sửa vội tìm thấy.
   */
};

type XemTruocNguong = {
  productCode: string;
  /**
   * Giá bán Công ty **của NGÀY ÁP DỤNG đang gõ** (`0193`).
   *
   * Máy chủ vẫn trả trường này từ `0180`, và tới `0192` giao diện VỨT NÓ ĐI —
   * `giaCongTy` đọc giá HÔM NAY từ danh mục (`0124`, khi ấy ngày áp dụng còn là
   * thuộc tính của hồ sơ). Từ `0180` mỗi dòng mang ngày riêng và ảnh chụp giá
   * lấy theo ngày ấy, nên hộp thoại bày một con số rồi lưu một con số khác ở
   * đúng những dòng hẹn ngày tương lai — chính điều mà chú thích của
   * `threshold-preview` viết ra để chống, chỉ khác là nó nói về ngưỡng và bỏ sót
   * giá.
   */
  companyPrice: string;
  /** `null` đi kèm `KHONG_CO`: không có ngưỡng nào để đối chiếu. */
  threshold: string | null;
  /** Cùng ngưỡng ấy, dạng `Rate2` — thứ `computeLine` ăn vào (`0193`). */
  thresholdRate2: number | null;
  /** Mã quy định đã thắng (`0193`) — vào dấu `?` cạnh ngưỡng, như cột QĐCK. */
  ruleCode: string | null;
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
  /*
   * NỘI DUNG từng khoản (`0268`) — song song với `cpbh`, cùng chỉ số. Thêm/bớt một
   * khoản là thêm/bớt CẢ HAI ở cùng vị trí; để hai mảng tự sống riêng là ngày đầu
   * tiên bớt khoản giữa thì nội dung của khoản 3 dời sang mô tả khoản 2.
   */
  const [noiDung, datNoiDung] = useState<string[]>(() => {
    const so = dongCu && dongCu.cpbh.length > 0 ? dongCu.cpbh.length : 1;
    return Array.from({ length: so }, (_, i) => dongCu?.cpbhNoiDung?.[i] ?? '');
  });
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

  /**
   * Giá bán Công ty của sản phẩm đang chọn, **theo ngày áp dụng đang gõ** (`0193`).
   *
   * KHÔNG còn nhánh rơi về `dongCu.companyPrice`. Nhánh ấy có từ `0124` để cứu
   * ca sản phẩm đã vô hiệu hoá (không nằm trong `ds` vì `forNewPolicy=true` lọc
   * đi) — nhưng `threshold-preview` tra thẳng ảnh chụp sản phẩm nên nó trả lời
   * được cả ca ấy. Cái còn lại mà nhánh cũ che đi là lượt tra HỎNG, và ở đó nó
   * bày ra con số ĐÃ ĐÓNG BĂNG của dòng cũ trong khi máy chủ sắp ghi con số của
   * ngày mới. Không biết thì **thôi bày**: cả khối tự ẩn.
   */
  const giaCongTy = xem?.companyPrice ?? null;

  /**
   * Tỷ lệ chiết khấu, giá thu về và tổng CPBH — tính NGAY trong lúc gõ (`0193`).
   *
   * `format.ts` mở đầu bằng luật *"giao diện KHÔNG TÍNH TOÁN"* (`FE-27`), và luật
   * ấy sợ một BẢN CÀI ĐẶT THỨ HAI của phép làm tròn — con số hiện ra sẽ lệch con
   * số đem so ngưỡng. Ở đây không có bản thứ hai nào: `computeLine` và
   * `rate2ToNumeric` là **đúng hai hàm mà `upsertLine` gọi**, nhập từ cùng một
   * gói. Viết lại công thức mới là thứ `FE-27` cấm.
   *
   * Ba vế phải khớp nhau thì khối này mới đúng, và cả ba đều đến từ máy chủ:
   * giá bán Công ty và ngưỡng lấy theo NGÀY ÁP DỤNG (`xem`), còn giá bán buôn
   * với CPBH thì chính người dùng đang gõ.
   *
   * `null` khi CHƯA ĐỦ để tính — chưa chọn sản phẩm, chưa gõ giá bán buôn, hoặc
   * `computeLine` từ chối (giá bán Công ty bằng 0 ở dữ liệu cũ chưa từng đặt
   * giá). Bày `100%` cho một ô giá còn trống là bày một con số không có nghĩa.
   */
  const ketQua = useMemo(() => {
    if (xem === null || giaBanBuon === '') return null;
    try {
      return computeLine({
        companyPrice: BigInt(xem.companyPrice),
        wholesalePrice: BigInt(giaBanBuon),
        cpbh: cpbh.map((v) => BigInt(v || '0')),
        // Bỏ hẳn trường khi không có ngưỡng, KHÔNG gửi 0 — `computeLine` đọc `0`
        // là "ngưỡng bằng không" và đánh dấu vượt ngưỡng cho mọi dòng. Cùng phép
        // đề phòng mà `upsertLine` viết ra ở máy chủ.
        ...(xem.thresholdRate2 === null ? {} : { threshold: xem.thresholdRate2 }),
      });
    } catch {
      // `InvalidLineError` — máy chủ sẽ nói ra bằng một mã lỗi tử tế lúc lưu.
      // Ở đây chỉ là khối xem trước, im lặng là câu trả lời đúng (`0089`).
      return null;
    }
  }, [xem, giaBanBuon, cpbh]);

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

  const doiNoiDung = (i: number, v: string) =>
    datNoiDung((cu) => cu.map((x, j) => (j === i ? v : x)));

  const themCpbh = () => {
    datCpbh((cu) => [...cu, '']);
    datNoiDung((cu) => [...cu, '']);
  };
  const botCpbh = (i: number) => {
    datCpbh((cu) => cu.filter((_, j) => j !== i));
    datNoiDung((cu) => cu.filter((_, j) => j !== i));
  };

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
        // `0268` — đủ một phần tử cho MỖI khoản, kể cả rỗng: giữ đúng chỉ số.
        cpbhNoiDung: cpbh.map((_, i) => (noiDung[i] ?? '').trim()),
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
            <ONhapNgay {...p} giaTri={ngayApDung} doi={datNgayApDung} />
          )}
        </Truong>

        <Truong id="dsp-sp" nhan="Sản phẩm" bắtBuộc>
          {(p) => (
            <ChonCoGo
              {...p}
              giaTri={sanPham}
              disabled={sua}
              doi={datSanPham}
              goiY="Gõ mã hoặc tên sản phẩm"
              khongCoKetQua={(q) => `Không có sản phẩm nào khớp “${q}”. Thử gõ mã sản phẩm hoặc bớt chữ.`}
              ds={[
                // Khi sửa, danh mục có thể KHÔNG còn sản phẩm này (đã vô hiệu hoá)
                // — nhưng hồ sơ vẫn giữ nó. Thêm thẳng một mục từ chính dòng đang
                // sửa, nếu không ô chọn hiện rỗng và người dùng tưởng dữ liệu hỏng.
                ...(sua && !(ds ?? []).some((s) => s.id === dongCu.productId)
                  ? [{ gia: dongCu.productId, nhan: `${dongCu.productName} (${dongCu.productCode})` }]
                  : []),
                ...(ds ?? []).map((s) => ({ gia: s.id, nhan: `${s.name} (${s.code})` })),
              ]}
            />
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
        {/* `0268` — mỗi khoản là MỘT KHUNG: số tiền và nội dung đứng cạnh nhau để
            đọc là cùng một khoản (mockup duyệt 08/11). Nhãn ô số tiền GIỮ chữ
            *CPBH n* — đó là tên cột của bảng và là thứ các ca kiểm tìm ô theo. */}
        {cpbh.map((v, i) => (
          <div className="hang-cpbh khoan-cpbh" key={i}>
            <Truong id={`dsp-cpbh${i + 1}`} nhan={`CPBH ${i + 1}`} donVi="Tiền tệ đơn vị đồng">
              {(p) => <ONhapTien {...p} giaTri={v} doi={(x) => doiCpbh(i, x)} />}
            </Truong>
            <Truong id={`dsp-cpbh${i + 1}-nd`} nhan="Nội dung" donVi="không bắt buộc">
              {(p) => (
                <input
                  {...p}
                  className="o-nhap"
                  maxLength={200}
                  aria-label={`Nội dung khoản chi phí ${i + 1}`}
                  placeholder="Ví dụ: hỗ trợ trưng bày tại quầy"
                  value={noiDung[i] ?? ''}
                  onChange={(e) => doiNoiDung(i, e.target.value)}
                />
              )}
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

        {/*
          KHỐI XEM TRƯỚC (`0193`) — bốn con số mà tới `0192` chỉ đọc được ở BẢNG,
          tức sau khi đã bấm *Thêm dòng* (từ `0223` là *Xác nhận*).

          Khách hàng chốt 09/09: *"hiển thị thêm các thông tin về CPBH, tỷ lệ CK và
          QĐCK luôn trong hộp thoại để người dùng có thể thấy ngay mà chưa cần
          phải ra phần bảng để nhìn"*.

          **GIÁ THU VỀ là thứ THÊM ngoài ba mục ấy, và đã nêu.** Nó là mắt xích
          giữa CPBH và tỷ lệ chiết khấu — `1 − giá thu về / giá bán Công ty` — và
          hộp thoại này ĐÃ NHẮC TÊN nó từ `0124` ("tính từ con số đó và giá thu
          về") mà chưa bao giờ bày ra. Bỏ nó thì khối này hiện một phần trăm
          không có đường nào lần ngược.

          ĐẶT SAU CPBH, TRƯỚC GHI CHÚ: đây là KẾT QUẢ của mọi ô phía trên, và ghi
          chú thì nói về kết quả ấy. Cùng lập luận đã viết cho ô ghi chú ngay dưới.

          Nhãn lấy nguyên văn tên cột của bảng (`bang-cot.ts`) — cả điểm của yêu
          cầu là thôi phải ra bảng đối chiếu, mà hai cách gọi khác nhau cho cùng
          một con số thì vẫn phải dịch.
        */}
        {ketQua !== null && xem !== null && (
          <dl className="xem-truoc-dong">
            <div>
              <dt>CPBH</dt>
              <dd className="so">{tien(ketQua.cpbhTotal.toString())}</dd>
            </div>
            <div>
              <dt>Giá thu về</dt>
              <dd className="so">{tien(ketQua.netPrice.toString())}</dd>
            </div>
            <div>
              <dt>Tỷ lệ CK</dt>
              {/*
                HAI thứ mượn nguyên của bảng, và cả hai đều cố ý.

                `tyLe(rate2ToNumeric(...))` là ĐÚNG đường con số này đi ở bảng:
                máy chủ ghi `rate2ToNumeric(calc.discountRate)` vào CSDL, DTO trả
                nguyên chuỗi ấy, `tyLe()` in ra. Tự dựng chuỗi ở đây là dựng một
                đường thứ hai để hai chỗ lệch nhau ở chữ số thập phân.

                Lớp `ty-le vuot` cũng vậy — cùng lớp thì cùng MÀU, và màu vượt
                ngưỡng của bảng là `--mau-loi` chứ không phải màu cảnh báo. Đặt
                một lớp riêng ở đây là để hai chỗ tô hai màu cho cùng một chuyện.
              */}
              <dd className={`so ty-le${ketQua.overThreshold ? ' vuot' : ''}`}>
                {tyLe(rate2ToNumeric(ketQua.discountRate))}
              </dd>
            </div>
            <div>
              <dt>QĐCK</dt>
              {/*
                Bày NGƯỠNG phần trăm, mã quy định lui vào `title` — đúng quy ước
                cột QĐCK của bảng (`0180`). Không quy định nào phủ thì để TRỐNG,
                cũng như bảng: câu giải thích đã nằm ở khối cảnh báo phía trên,
                nhắc lại ở đây là nói hai lần trong một màn hình.
              */}
              <dd className="so" title={xem.ruleCode ?? undefined}>
                {xem.threshold === null ? '—' : tyLe(xem.threshold)}
              </dd>
            </div>
          </dl>
        )}

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
          Ghi chú riêng cho sản phẩm này — <strong>in ra bản CSBH A4</strong>; trên bảng hiện bằng
          một biểu tượng cạnh tên sản phẩm. Tối đa 500 ký tự. Để trống thì không có ghi chú.
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
            {/* `0223` — *Thêm dòng* → *Xác nhận*: hộp thoại đã mang tên *Thêm sản
                phẩm*, nên nút chỉ cần nói "chốt những gì vừa điền". */}
            {dangGui ? 'Đang lưu…' : sua ? 'Lưu dòng' : 'Xác nhận'}
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
