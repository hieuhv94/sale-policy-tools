/**
 * `0165` — BA MẪU MẶC ĐỊNH ĐI CÙNG HỆ THỐNG, và KHÔNG bộ nạp nào tạo mẫu nữa.
 *
 * Tệp thuần: đọc `MAU_MAC_DINH`, quét mã nguồn hai script, kiểm sự tồn tại của
 * ba file. Không dựng ứng dụng, không chạm CSDL.
 *
 * ---------------------------------------------------------------------------
 * TỆP NÀY TỪNG HỎI MỘT CÂU KHÁC
 * ---------------------------------------------------------------------------
 *
 * `0137` viết nó để canh *"mẫu nào được nạp sẵn, mẫu nào chỉ nằm trong
 * `templates/`"* — khi ấy có HAI bộ nạp với hai danh sách rời:
 *
 *   `make demo-mau`        đọc `BO_MAU`, bỏ qua mục có `napDemo: false`
 *   `./csbh nap-danh-muc`  có danh sách `MAU` RIÊNG, viết tay trong script
 *
 * Khách hàng chốt 30/08 rằng ba mẫu mặc định *"luôn luôn được deploy cùng hệ
 * thống"*, nên cả hai danh sách ấy biến mất và câu hỏi đổi hẳn: **đúng một
 * đường nạp, và nó phải là đường duy nhất**.
 *
 * Hai bộ nạp cũ là chỗ hai danh sách trôi khỏi nhau được; giờ chỗ trôi được là
 * giữa `MAU_MAC_DINH` và thư mục `templates/default/`. Ca kiểm đi theo.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAU_MAC_DINH, documentXml, placeholdersOf } from '@csbh/document/testing';
import { BO_MAU, THU_MUC } from '../../scripts/tao-mau-ho-so.js';

const GOC = `${THU_MUC}/default`;

describe('`0165` ba mẫu mặc định', () => {
  it('có đúng BA mẫu, mỗi LOẠI một cái', () => {
    /*
     * Yêu cầu viết thẳng: *"3 văn bản mẫu mặc định cho từng loại văn bản mẫu"*.
     * Ba loại là ba thẻ trên màn hình Quản trị, nên thiếu một cái là một thẻ mở
     * ra rỗng trên hệ thống vừa cài xong.
     */
    expect(MAU_MAC_DINH.map((m) => m.kind).sort()).toEqual([
      'HOP_DONG',
      'HO_SO',
      'HO_SO_RUT_GON',
    ]);
  });

  it('TÊN MẪU và TÊN FILE bị ghim — đổi là nạp thêm một bản thứ hai', () => {
    /*
     * Tên mẫu là KHOÁ IDEMPOTENT của lượt nạp (`bootstrap-mau.ts` hỏi
     * *"đã có dòng mang đúng `(kind, name)` chưa"*). Đổi một chữ ở đây thì trên
     * mọi hệ ĐANG CHẠY, lượt khởi động sau nạp thêm một bản thứ hai bên cạnh bản
     * cũ — và cả hai nằm chung ô chọn của Sale Admin với hai cái tên gần giống.
     *
     * Ca này có mặt vì PHÁ LẠI: đổi tên mẫu hợp đồng mặc định mà **không ca nào
     * đỏ**. Ghim tên là cách duy nhất biến một quyết định mức dữ liệu thành một
     * quyết định người sửa buộc phải nhìn thấy.
     *
     * Muốn đổi tên thật thì đó là một chặng có migration đi kèm, không phải một
     * lượt sửa chuỗi.
     */
    expect(MAU_MAC_DINH).toEqual([
      { tep: 'ho-so-day-du.docx', ten: 'Hồ sơ mẫu đầy đủ (bản mặc định)', kind: 'HO_SO' },
      { tep: 'ho-so-rut-gon.docx', ten: 'Hồ sơ mẫu rút gọn (bản mặc định)', kind: 'HO_SO_RUT_GON' },
      { tep: 'hop-dong.docx', ten: 'Hợp đồng (bản mặc định)', kind: 'HOP_DONG' },
    ]);
  });

  it('ba FILE có thật trong `templates/default/`', () => {
    for (const m of MAU_MAC_DINH) {
      expect(existsSync(`${GOC}/${m.tep}`), `thiếu templates/default/${m.tep}`).toBe(true);
    }
  });

  it('thư mục KHÔNG có file thừa', () => {
    /*
     * Chiều đối chiếu, và nó bắt đúng cách hỏng im lặng nhất: đổi tên một mẫu
     * trong `MAU_MAC_DINH` mà quên đổi tên file thì ca trên đỏ, nhưng thêm một
     * file vào thư mục rồi quên khai nó thì KHÔNG gì đỏ — và file ấy nằm trong
     * ảnh, đi lên máy chủ khách, mà không bao giờ được nạp.
     */
    const co = readdirSync(GOC).filter((t) => t.endsWith('.docx')).sort();
    expect(co).toEqual(MAU_MAC_DINH.map((m) => m.tep).sort());
  });

  it('ba TÊN MẪU khác nhau — ô chọn của Sale Admin trộn chung hai loại hồ sơ', () => {
    /*
     * `uq_template_ten` chỉ đòi tên duy nhất TRONG TỪNG LOẠI, nên hai mẫu hồ sơ
     * trùng tên vẫn lưu được. Nhưng ô chọn lúc in trộn chung cả hai loại
     * (`0165`), và ở đó hai dòng cùng tên là hai dòng người chọn không phân biệt
     * được — đúng cái `0150` đặt luật cấm trùng tên để tránh.
     */
    const ten = MAU_MAC_DINH.map((m) => m.ten);
    expect(new Set(ten).size, `tên trùng nhau: ${ten.join(' · ')}`).toBe(ten.length);
  });

  it('`0171` hai mẫu HỒ SƠ in ĐÚNG những trường khách hàng đã chốt', () => {
    /*
     * Bố cục tờ giấy là một YÊU CẦU, và tới `0171` không ca nào canh nó. `0134`
     * chỉ hỏi *"mọi trường CHẶN gửi duyệt có được in không"* — sau `0171` nhóm ấy
     * còn hai trường, cả hai đều có mặt, nên nó xanh với bất kỳ tờ giấy nào. Bỏ
     * thêm một dòng, hay đưa `Số hồ sơ` quay lại, đều không làm gì đỏ.
     *
     * Ca này ghim CẢ TẬP ô trống, hai chiều. Khách hàng chốt 31/08 bỏ bốn thứ:
     *
     *   `ho_so.ma_ho_so` · `ho_so.phien_ban`   dòng *Số hồ sơ*
     *   `ho_so.chuc_danh_dai_dien`             \ một dòng *Người đại diện · ĐT*
     *   `ho_so.dien_thoai`                     /
     *   `ho_so.tep_dinh_kem`                   dòng *File đính kèm*
     *   `ho_so.ten_khach_hang`                 thay bằng `nguoi_dai_dien`
     *
     * Ghim bằng `toEqual` trên tập ĐÃ SẮP chứ không `toContain` từng cái: chiều
     * "thiếu" và chiều "thừa" đều là hỏng, và chiều thừa mới là chiều một lượt
     * dựng lại mẫu dễ mắc.
     */
    const MONG = [
      'bang_san_pham',
      'ho_so.cong_no',
      // `ho_so.dia_chi_dang_ky` RỜI KHỎI hai mẫu ở `0182`, và địa chỉ KHÔNG mất:
      // chuỗi *Tên khách hàng* in nó thành HAI phần (`so_nha_phuong_xa` và
      // `tinh_thanh_pho`), vì cột gộp do trigger dựng bằng `', '` nên tách ngược
      // là cắt sai chỗ ở mọi địa chỉ vốn đã có dấu phẩy. Khoá vẫn ở lại `SCALAR`
      // cho mẫu người dùng tự soạn.
      'ho_so.ke_toan',
      'ho_so.ma_khach_hang',
      'ho_so.ma_so_thue',
      // `0182` — dòng *Tên khách hàng* nối NĂM phần, nên hai ô địa chỉ và tên
      // pháp nhân vào tập này. `ho_so.ten_khach_hang` QUAY LẠI sau `0171`: khi
      // ấy nó bị bỏ vì tranh chỗ với tên người đại diện trên cùng một dòng, giờ
      // chuỗi có chỗ cho cả hai.
      // `ho_so.ngay_ap_dung` RA KHỎI TẬP ở `0180`: ngày áp dụng chuyển xuống
      // từng dòng sản phẩm, và nó in ra ở CỘT ĐẦU của `{{bang_san_pham}}` chứ
      // không còn là một ô ở đầu trang. Khoá ấy cũng đã gỡ khỏi `SCALAR`, nên
      // để lại đây thì hai mẫu mặc định không lưu nổi (`400 SOURCE_UNKNOWN`).
      'ho_so.ngay_kt_nhan_l1',
      'ho_so.ngay_tbp_ky',
      // Dòng *Tên khách hàng* MỞ ĐẦU bằng tên người đại diện (`0171`), rồi mới
      // tới tên pháp nhân — xem chuỗi năm phần của `0182`.
      'ho_so.nguoi_dai_dien',
      'ho_so.nguoi_de_nghi',
      'ho_so.so_nha_phuong_xa',
      'ho_so.ten_khach_hang',
      'ho_so.tinh_thanh_pho',
      'ho_so.truong_bo_phan',
    ];
    /*
     * HAI MẪU, HAI TẬP KHÁC NHAU từ `0209` — trước đó chúng giống hệt.
     *
     * Khách hàng chốt 20/09 bỏ hai dòng ngày duyệt màu xanh khỏi tờ RÚT GỌN,
     * *"bản đầy đủ thì vẫn giữ nguyên"*. Nên phép so thôi dùng chung một mảng:
     * tập của rút gọn = tập đầy đủ TRỪ hai khoá ấy, và viết bằng phép trừ chứ
     * không chép mảng thứ hai — chép thì lượt sửa tập kế tiếp phải nhớ sửa hai
     * chỗ, và chỗ bị quên sẽ là chỗ không ai mở ra đọc.
     */
    const BO_O_RUT_GON = ['ho_so.ngay_kt_nhan_l1', 'ho_so.ngay_tbp_ky'];
    const mong = (kind: string): string[] =>
      kind === 'HO_SO_RUT_GON' ? MONG.filter((x) => !BO_O_RUT_GON.includes(x)) : MONG;

    const day = MAU_MAC_DINH.filter((x) => x.kind !== 'HOP_DONG');
    expect(day.length, 'phải có hai mẫu hồ sơ').toBe(2);
    for (const m of day) {
      const o = placeholdersOf(readFileSync(`${GOC}/${m.tep}`)).map((x) => x.slice(2, -2));
      expect([...o].sort(), m.tep).toEqual(mong(m.kind));
    }

    // Và HAI TẬP ẤY PHẢI KHÁC NHAU: nếu một lượt dựng lại mẫu chép nguyên tờ
    // đầy đủ sang tờ rút gọn thì mọi phép so ở trên vẫn xanh với `mong()` —
    // không, chúng đỏ — nhưng một bản `mong()` viết sai (trả cùng một mảng cho
    // cả hai loại) thì xanh hết. Câu này canh chính hàm ấy.
    expect(mong('HO_SO_RUT_GON')).not.toEqual(mong('HO_SO'));
  });

  it('`0182` dòng *Tên khách hàng* nối ĐÚNG NĂM PHẦN, đúng thứ tự', () => {
    /*
     * Khách hàng chốt 07/09, và họ viết ra cả chuỗi:
     *
     *   Tên người đại diện – Tên Hộ kinh doanh/Tên Công ty – Số nhà/Phường xã –
     *   Tỉnh thành phố – Mã số thuế
     *
     * Ca `0171` ngay trên ghim TẬP ô trống của cả tệp, và nó KHÔNG thấy được thứ
     * tự: năm khoá ấy vẫn đủ khi chúng nằm rải ở năm dòng khác nhau, hay xếp
     * ngược. Mà thứ tự chính là thứ khách hàng viết ra — nên nó cần một ca riêng.
     *
     * Đọc CHỮ của đoạn văn chứ không đọc tập khoá: thứ phải đúng là một dòng
     * người ta sẽ đọc trên giấy, kể cả dấu ngăn giữa các phần.
     */
    const PHAN = [
      'ho_so.nguoi_dai_dien',
      'ho_so.ten_khach_hang',
      'ho_so.so_nha_phuong_xa',
      'ho_so.tinh_thanh_pho',
      'ho_so.ma_so_thue',
    ];
    for (const m of MAU_MAC_DINH.filter((x) => x.kind !== 'HOP_DONG')) {
      const x = documentXml(readFileSync(`${GOC}/${m.tep}`));
      const doan = (x.match(/<w:p[ >](?:(?!<\/w:p>).)*<\/w:p>/gs) ?? [])
        .map((p2) => p2.replace(/<[^>]+>/g, ''))
        .filter((t) => t.includes('{{ho_so.nguoi_dai_dien}}'));
      expect(doan.length, `${m.tep}: chờ ĐÚNG MỘT đoạn có tên người đại diện`).toBe(1);

      const viTri = PHAN.map((k) => doan[0]!.indexOf(`{{${k}}}`));
      for (const [i, v] of viTri.entries()) {
        expect(v, `${m.tep}: thiếu {{${PHAN[i]}}} trên dòng Tên khách hàng`).toBeGreaterThan(-1);
      }
      // Tăng dần = đúng thứ tự khách hàng viết. So từng cặp lân cận là đủ ở đây
      // vì cả năm phần cùng nằm trên MỘT đoạn.
      for (let i = 1; i < viTri.length; i += 1) {
        expect(
          viTri[i]!,
          `${m.tep}: {{${PHAN[i]}}} phải đứng sau {{${PHAN[i - 1]}}}`,
        ).toBeGreaterThan(viTri[i - 1]!);
      }
    }
  });

  describe('`0173` KHỐI CHỮ KÝ của hai mẫu hồ sơ', () => {
    /**
     * Bảng chữ ký = bảng THỨ HAI của tài liệu. Bảng đầu là khối thông tin khách
     * hàng; bảng sản phẩm thì chưa có ở đây — nó do `mergeDocx` chèn vào lúc dựng
     * bản mềm, đúng chỗ ô trống `{{bang_san_pham}}`.
     */
    const bangChuKy = (tep: string): string => {
      const x = documentXml(readFileSync(`${GOC}/${tep}`));
      const bang = x.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
      expect(bang.length, `${tep}: chờ hai bảng, thấy ${bang.length}`).toBe(2);
      return bang[1]!;
    };

    const MAU_HO_SO = MAU_MAC_DINH.filter((m) => m.kind !== 'HOP_DONG');

    /**
     * HAI mẫu, HAI dãy chức danh — và sự khác nhau ấy là CHỦ Ý (`0174`).
     *
     * `0173` cho cả hai dùng chung một dãy bốn ô, với lý lẽ *"bản đầy đủ mới là
     * tờ Sale Admin in ra đem trình Ban lãnh đạo ký ở B8"*. Khách hàng chốt
     * 05/09 trả lời khác — *"bản mẫu hồ sơ đầy đủ không cần phần Phó giám đốc"*
     * — nên ô ấy chỉ còn ở bản RÚT GỌN, đúng như tờ mẫu họ tự gõ.
     *
     * Khai thành BẢNG TRA chứ không nới ca kiểm thành `toContain`: hai mẫu khác
     * nhau ở đúng một ô, và một phép kiểm lỏng tay thì mất luôn khả năng nói ra
     * chỗ khác nhau ấy là chỗ nào.
     */
    const CHUC_DANH: Record<string, string[]> = {
      'ho-so-day-du.docx': ['Kế toán', 'Trưởng bộ phận', 'Người đề nghị'],
      'ho-so-rut-gon.docx': ['Phó Giám đốc', 'Kế toán', 'Trưởng bộ phận', 'Người đề nghị'],
    };

    it('MỘT hàng, đúng dãy chức danh của từng mẫu', () => {
      /*
       * Chốt 01/09: *"di chuyển chỗ Kế toán duyệt vào giữa Phó Giám đốc và TBP,
       * cố gắng sắp xếp trong một dòng"*. Bản rút gọn trước đó xếp HAI hàng —
       * *Kế toán* nằm một mình ở hàng dưới.
       *
       * Ghim CẢ DÃY bằng `toEqual`: hỏi "có mặt không" thì đảo hai ô vẫn xanh,
       * mà thứ tự chính là thứ khách hàng nêu.
       */
      for (const m of MAU_HO_SO) {
        const t = bangChuKy(m.tep);
        expect(t.match(/<w:tr>/g)?.length, `${m.tep}: khối chữ ký phải nằm trên MỘT hàng`).toBe(1);
        const chucDanh = (t.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map(
          (o) => (o.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/) ?? [])[1],
        );
        expect(chucDanh, m.tep).toEqual(CHUC_DANH[m.tep]);
        /*
         * LƯỚI cột phải khớp SỐ Ô. Ở `tblLayout=fixed` trình xem nghe theo
         * `<w:tblGrid>` chứ không theo `w:tcW` (`0135` đo được điều đó trên PDF
         * thật), nên bỏ một ô mà quên bớt một `gridCol` là ba ô chia theo lưới
         * bốn cột — cả khối lệch sang trái, và không gì khác đỏ.
         */
        expect(
          t.match(/<w:gridCol/g)?.length,
          `${m.tep}: lưới cột không khớp số ô`,
        ).toBe(CHUC_DANH[m.tep]!.length);
      }
    });

    it('KHÔNG kẻ ô, và bảng chữ ký KHÔNG dính vào bảng sản phẩm', () => {
      /*
       * Hai vế của cùng một yêu cầu — *"bỏ phần ô kẻ ở phần chữ ký dưới bảng sản
       * phẩm"* — và vế thứ hai mới là nguyên nhân thật.
       *
       * Khai `w:val="nil"` là chưa đủ: hai `<w:tbl>` LIỀN NHAU thì Word gộp làm
       * MỘT bảng (`0165` đã đo), và bảng gộp lấy thuộc tính của bảng ĐẦU — tức
       * bảng sản phẩm, thứ có đường kẻ. `mergeDocx` thay CẢ ĐOẠN chứa
       * `{{bang_san_pham}}` bằng một `<w:tbl>`, nên đoạn ấy mà đứng ngay trước
       * bảng chữ ký thì sau lượt trộn hai bảng dính nhau — đúng cái đã xảy ra
       * với bản rút gọn.
       *
       * Nên phép kiểm đọc chính khoảng GIỮA hai chỗ: phải còn ít nhất một `<w:p>`
       * ở đó sau khi ô trống bảng sản phẩm bị thay.
       */
      for (const m of MAU_HO_SO) {
        expect(bangChuKy(m.tep), `${m.tep}: bảng chữ ký chưa khai KHÔNG kẻ ô`).toContain(
          '<w:top w:val="nil"/>',
        );

        const x = documentXml(readFileSync(`${GOC}/${m.tep}`));
        const i = x.indexOf('{{bang_san_pham}}');
        expect(i, `${m.tep}: không thấy ô trống bảng sản phẩm`).toBeGreaterThan(0);
        const sauODoan = x.indexOf('</w:p>', i) + 6;
        const truocBang = x.indexOf('<w:tbl>', sauODoan);
        expect(
          x.slice(sauODoan, truocBang),
          `${m.tep}: bảng chữ ký dính ngay sau bảng sản phẩm — Word sẽ gộp hai bảng và kẻ ô lên khối chữ ký`,
        ).toContain('<w:p');
      }
    });

    it('có KHOẢNG TRỐNG giữa chức danh và tên, để ký tay sau khi in', () => {
      /*
       * *"Để khoảng trống ở giữa tên người ký và chức danh để có thể ký bằng tay
       * sau khi in"*. Đo bằng số ĐOẠN RỖNG nằm giữa hai đoạn có chữ trong cùng
       * một ô — đó là thứ dựng ra khoảng trống, và cũng là thứ một lượt "dọn dẹp
       * đoạn thừa" sẽ xoá mất mà không gì khác đỏ.
       *
       * Kiểm ô *Kế toán* (ô thứ hai): nó là ô có đủ ba phần — chức danh, tên,
       * dòng ngày — nên nó bắt được cả trường hợp khoảng trống rơi nhầm xuống
       * dưới tên.
       */
      for (const m of MAU_HO_SO) {
        const o = (bangChuKy(m.tep).match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [])[1]!;
        const doan = o.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
        const coChu = doan.map((d) => /<w:t(?:\s[^>]*)?>[^<]/.test(d));
        const dauTien = coChu.indexOf(true);
        const keTiep = coChu.indexOf(true, dauTien + 1);
        expect(
          keTiep - dauTien - 1,
          `${m.tep}: chỉ có ${keTiep - dauTien - 1} đoạn rỗng giữa chức danh và tên`,
        ).toBeGreaterThanOrEqual(2);
      }
    });
  });

  it('mẫu HỢP ĐỒNG mặc định là BẢN SAO đúng byte của `mau-hop-dong-a4-doc.docx`', () => {
    /*
     * Ba file trong `default/` là *"bản chuẩn"* chép từ ba file gốc. Hai mẫu hồ
     * sơ gõ tay nên chúng đứng yên; mẫu HỢP ĐỒNG thì khác — nó là ĐẦU RA của
     * `scripts/tao-mau-ho-so.ts`, và một lượt sinh lại sẽ đổi file gốc mà không
     * đụng tới bản trong `default/`.
     *
     * Đó là kiểu trôi không có triệu chứng: hệ thống vẫn chạy, vẫn có mẫu hợp
     * đồng, chỉ là bản đi cùng hệ thống không còn là bản mà bộ sinh đang tạo ra.
     * Sinh lại thì chép lại — câu lệnh nằm ngay trong thông báo lỗi này.
     */
    const goc = readFileSync(`${THU_MUC}/mau-hop-dong-a4-doc.docx`);
    const mac = readFileSync(`${GOC}/hop-dong.docx`);
    expect(
      Buffer.compare(goc, mac),
      'chép lại: cp templates/mau-hop-dong-a4-doc.docx templates/default/hop-dong.docx',
    ).toBe(0);
  });
});

describe('`0165` không bộ nạp nào tạo văn bản mẫu nữa', () => {
  const nguon = (t: string) => readFileSync(t, 'utf8');

  it('`nap-danh-muc` KHÔNG đụng tới mẫu', () => {
    const s = nguon('scripts/nap-danh-muc.ts');
    for (const cam of ['/policy-templates', '/contract-templates', '.docx']) {
      expect(s, `nap-danh-muc thôi đụng tới ${cam}`).not.toContain(cam);
    }
  });

  it('`seed-demo` KHÔNG TẠO mẫu — nhưng ĐỌC ô chọn thì được', () => {
    /*
     * Vế này đắt hơn vế trên: `seed-demo` từng nạp CẢ HAI loại — mẫu hồ sơ qua
     * `namMauHoSo()` và mười mấy mẫu hợp đồng dựng bằng `makeDocx`. Sót lại một
     * trong hai thì bản demo có hai bộ mẫu chồng lên nhau, và người xem không
     * biết bộ nào là bộ thật.
     *
     * `0168` NỚI MỘT NỬA, và chỗ nới là ranh giới thật của luật này: bộ nạp phải
     * ĐỌC ô chọn để lấy id mẫu hồ sơ đầy đủ, vì `0167` bắt nó dựng bản mềm qua
     * đường API thật. Đọc không phải tạo. Bản trước cấm mọi lần NHẮC TỚI chuỗi
     * `/policy-templates`, và câu ấy rộng hơn luật nó định canh.
     *
     * Nên ca kiểm đổi từ *"không nhắc tới"* sang *"nhắc tới ĐÚNG một đường, và
     * đường ấy là đường đọc"*. Thêm một đường tạo mẫu vào bộ nạp là đỏ ngay.
     */
    const s = nguon('scripts/seed-demo.ts');
    // Mẫu HỢP ĐỒNG thì bộ nạp không có việc gì — kể cả đọc.
    expect(s, 'seed-demo thôi đụng tới /contract-templates').not.toContain('/contract-templates');
    // Và không có bước ĐỌC Ô TRỐNG — bước đầu của mọi lượt tải mẫu lên.
    expect(s, 'seed-demo không được có bước đọc ô trống của một mẫu').not.toContain('/o-trong');

    const nhac = [...s.matchAll(/\/policy-templates[^'`\s]*/g)].map((m) => m[0]);
    expect(
      [...new Set(nhac)],
      'chỉ được đọc ô chọn; mọi đường khác của `/policy-templates` là đường GHI',
    ).toEqual(['/policy-templates/available']);
  });

  it('`0166` lượt dọn của `seed-demo` KHÔNG cuốn theo ba mẫu mặc định', () => {
    /*
     * LỖI THẬT, khách hàng báo sau khi chạy `make demo-mau`: *"toàn bộ văn bản
     * mẫu mặc định bị xoá mất"*.
     *
     * `xoaDuLieuCu()` quét sạch `doc.contract_template`, và tới `0164` điều đó
     * vô hại — bộ nạp demo dựng lại ngay một bộ mẫu của riêng nó. `0165` bỏ việc
     * dựng ấy đi, nên lượt xoá thành **một chiều**: ba mẫu mặc định chỉ nạp ở
     * LƯỢT KHỞI ĐỘNG của `document`, mà service thì đã lên từ lâu.
     *
     * Đây là loại lệch không tệp nào một mình nhìn thấy: `seed-demo.ts` không
     * biết `0165` vừa đổi ai chịu trách nhiệm tạo mẫu, còn `bootstrap-mau.ts`
     * không biết có ai đang xoá bảng của nó.
     *
     * Ca kiểm QUÉT MÃ NGUỒN, và nó yếu hơn một kiểu dữ liệu bắt buộc — một cách
     * viết mới vẫn lách qua được. Nhưng vế thứ nhất thì chặt: `DELETE FROM
     * doc.contract_template;` KHÔNG kèm điều kiện chính là hình dạng của lỗi.
     */
    const s = nguon('scripts/seed-demo.ts');
    for (const bang of ['doc.contract_template', 'doc.stored_file']) {
      expect(
        s,
        `xoá trắng ${bang} là cuốn theo cả ba mẫu mặc định — phải có điều kiện`,
      ).not.toMatch(new RegExp(`DELETE FROM ${bang.replace('.', '\\.')}\\s*;`));
    }
    expect(
      s,
      'điều kiện phải đọc từ `MAU_MAC_DINH`, không chép tay ba cái tên',
    ).toContain('MAU_MAC_DINH');
  });

  it('`BO_MAU` VẪN CÒN — nó là nguồn của chính ba file trong `default/`', () => {
    /*
     * Chiều đối chiếu, và nó bắt cách dọn dẹp quá tay: thấy `seed-demo` thôi đọc
     * `BO_MAU` rồi xoá luôn `tao-mau-ho-so.ts`. Làm thế thì `templates/*.docx`
     * mất bộ sinh, và `mau-hop-dong-a4-doc.docx` — nguồn của mẫu hợp đồng mặc
     * định — không dựng lại được nữa.
     */
    expect(BO_MAU.length).toBeGreaterThan(0);
    for (const m of BO_MAU) {
      expect(existsSync(`${THU_MUC}/${m.tep}`), `thiếu templates/${m.tep}`).toBe(true);
    }
  });
});
