/**
 * Mọi mục menu phải dẫn tới một màn hình THẬT.
 *
 * Đây là test đáng lẽ phải có từ P7d. Không có nó, `DIEU_HUONG` khai
 * `/mau-hop-dong` và `/nguoi-dung` mà `App.tsx` không bắt hai đường dẫn đó, nên
 * Sale Admin và Quản trị bấm vào mục menu riêng của chính mình và nhận về
 * "Không có màn hình nào ở địa chỉ này". Cả bộ test cũ vẫn xanh: `FE-25` chỉ
 * kiểm CHỮ trong nhãn menu, không kiểm nhãn đó dẫn tới đâu.
 *
 * Không dựng cây React — chỉ gọi `noiDung()` và soi phần tử trả về. Dựng thật
 * kéo theo `usePhien`, `useDuong` và một loạt lời gọi mạng, tức là nhiều cách
 * hỏng chẳng liên quan gì tới câu hỏi đang kiểm.
 */
import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { KhongCoManHinh, KhongCoQuyen, noiDung } from '@csbh/web/app';
import { DIEU_HUONG, VAI_TRO, can, dieuHuongCho, xem } from '@csbh/web/can';

/** So KIỂU phần tử, không so chuỗi tiêu đề — sửa câu chữ không được làm đỏ test. */
const kieu = (el: unknown): unknown => (el as ReactElement)?.type;

describe('mọi mục điều hướng dẫn tới một màn hình', () => {
  it('không mục nào rơi vào "không có màn hình"', () => {
    for (const m of DIEU_HUONG) {
      // Lấy một vai trò thật sự thấy được mục này — mục nào cũng phải có ít nhất
      // một, nếu không thì nó là mục chết theo một kiểu khác.
      const vaiTro = VAI_TRO.find((v) => xem(v, m.muc));
      expect(vaiTro, `mục ${m.duong} không vai trò nào xem được`).toBeDefined();

      expect(
        kieu(noiDung(m.duong, vaiTro!)),
        `mục "${m.nhan}" (${m.duong}) chưa đấu dây trong App.tsx`,
      ).not.toBe(KhongCoManHinh);
    }
  });

  it('mọi vai trò bấm hết menu của mình đều ra màn hình thật', () => {
    for (const v of VAI_TRO) {
      for (const m of dieuHuongCho(v)) {
        const k = kieu(noiDung(m.duong, v));
        expect(k, `${v} · ${m.duong}`).not.toBe(KhongCoManHinh);
        // Menu đã lọc theo vai trò rồi thì không được có mục nào trả "không có
        // quyền": hai bảng `QUYEN_XEM` và tầng định tuyến phải khớp nhau.
        expect(k, `${v} · ${m.duong}`).not.toBe(KhongCoQuyen);
      }
    }
  });

  it('đường dẫn không có trong menu vẫn trả về màn hình trống, không nổ', () => {
    expect(kieu(noiDung('/khong-ton-tai', 'QUAN_TRI'))).toBe(KhongCoManHinh);
  });

  /*
   * `0036` — liên kết trong THƯ cũng phải dẫn tới một màn hình thật.
   *
   * Cùng loại lỗi với hai mục menu chết mà tệp này sinh ra để bắt, chỉ khác chỗ
   * bắt đầu: người dùng không bấm menu mà bấm một đường dẫn trong hộp thư, và
   * nếu nó rơi vào "Không có màn hình nào" thì không có gì trên màn hình nói vì
   * sao. Đây cũng là chỗ đã hỏng thật: mọi lá thư từ trước tới nay đều trỏ vào
   * `/policies/:id` — đường của API, không phải của giao diện.
   */
  it('hai đường dẫn xuất hiện trong thư đều mở được, với mọi vai trò NHẬN THƯ', () => {
    /*
     * `0133` thu hẹp vòng lặp này, và lý do phải ghi ra: Quản trị hệ thống KHÔNG
     * nhận lá thư hồ sơ nào — `notify.service.handle()` lấy người nhận từ chính
     * những người đang giữ hồ sơ, mà họ không giữ hồ sơ nào bao giờ. Nên với họ
     * hai đường này không tới từ một lá thư, và trả *Không có quyền* là đúng.
     *
     * Bỏ vòng lặp qua `VAI_TRO` mà không nói gì thì ca này vẫn XANH — `KhongCoQuyen`
     * đâu phải `KhongCoManHinh` — và người đọc sau sẽ tin rằng Quản trị vẫn mở
     * được liên kết trong thư.
     */
    for (const v of VAI_TRO.filter((x) => xem(x, 'hoSo'))) {
      expect(kieu(noiDung('/ho-so/abc-123', v)), `${v} · mở hồ sơ`).not.toBe(KhongCoManHinh);
      expect(kieu(noiDung('/ho-so/abc-123/nhat-ky', v)), `${v} · nhật ký`).not.toBe(
        KhongCoManHinh,
      );
      expect(kieu(noiDung('/ho-so/abc-123', v)), `${v} · mở hồ sơ`).not.toBe(KhongCoQuyen);
    }
  });

  it('`/ho-so/moi` KHÔNG bị nuốt bởi mẫu nhật ký hay mẫu chi tiết', () => {
    // Ba mẫu cùng bắt đầu bằng `/ho-so/`, và thứ tự trong `noiDung()` là thứ
    // duy nhất giữ chúng khỏi đè nhau.
    expect(kieu(noiDung('/ho-so/moi', 'TDV'))).not.toBe(KhongCoManHinh);
    expect(kieu(noiDung('/ho-so/moi', 'TDV'))).not.toBe(kieu(noiDung('/ho-so/abc', 'TDV')));
  });

  it('gõ thẳng địa chỉ ngoài quyền thì bị chặn ở tầng định tuyến, không chỉ ẩn menu', () => {
    // Ẩn mục menu là chưa đủ: gõ địa chỉ vào thanh duyệt là đường đi vòng hiển
    // nhiên nhất. Hai màn hình quản trị phải chặn ở đây.
    expect(kieu(noiDung('/nhat-ky', 'TDV'))).toBe(KhongCoQuyen);
    expect(kieu(noiDung('/nguoi-dung', 'TDV'))).toBe(KhongCoQuyen);
  });
});

// =============================================================================
// `0060` — hai mục menu mẫu gộp thành một trang hai thẻ
// =============================================================================

describe('`0060` Văn bản mẫu — một mục menu, một chủ', () => {
  it('CHỈ Quản trị có mục ấy, và chỉ có MỘT mục về văn bản mẫu', () => {
    /*
     * Tới `0059` là hai mục cạnh nhau của hai vai trò khác nhau: *Giấy tờ mẫu*
     * của Quản trị và *Mẫu hợp đồng* của Sale Admin. Gộp chủ sở hữu về một người
     * mà để nguyên hai mục thì thành hai chỗ cho một việc, trên cùng một menu.
     */
    const cuaQuanTri = dieuHuongCho('QUAN_TRI').filter((m) => m.duong.includes('mau'));
    expect(cuaQuanTri.map((m) => m.duong)).toEqual(['/van-ban-mau']);
    expect(cuaQuanTri[0]!.nhan).toBe('Văn bản mẫu');
  });

  it('Sale Admin KHÔNG còn mục menu nào về mẫu', () => {
    // Họ vẫn xuất hợp đồng và vẫn chọn mẫu lúc xuất — nhưng ngay trên màn hình
    // hồ sơ, không phải ở một mục menu riêng.
    expect(dieuHuongCho('SALE_ADMIN').filter((m) => m.duong.includes('mau'))).toEqual([]);
  });

  it('hai địa chỉ CŨ vẫn mở đúng trang ấy, không rơi vào "không có màn hình"', () => {
    /*
     * `/giay-to-mau` và `/mau-hop-dong` nằm trong tài liệu hướng dẫn và trong
     * kịch bản chạy demo. Chết một địa chỉ đang được viết ra giấy thì người đọc
     * tài liệu gặp "Không có màn hình nào ở địa chỉ này" và không đoán được đi
     * đâu — mà lỗi ấy trông y hệt một lỗi lập trình.
     */
    for (const d of ['/van-ban-mau', '/giay-to-mau', '/mau-hop-dong']) {
      expect(kieu(noiDung(d, 'QUAN_TRI')), d).not.toBe(KhongCoManHinh);
      // Và vai trò khác vẫn bị chặn ở tầng định tuyến, không chỉ bị ẩn menu.
      expect(kieu(noiDung(d, 'SALE_ADMIN')), `${d} phải chặn Sale Admin`).toBe(KhongCoQuyen);
    }
  });
});

// =============================================================================
// `0133` — Hồ sơ CSBH ra khỏi phạm vi của Quản trị hệ thống
// =============================================================================

describe('`0133` Quản trị hệ thống không vào màn hình hồ sơ', () => {
  const DUONG_HO_SO = ['/ho-so', '/ho-so/moi', '/ho-so/abc-123', '/ho-so/abc-123/nhat-ky'];

  it('BỐN đường `/ho-so*` đều chặn, không riêng đường danh sách', () => {
    /*
     * Ẩn mục menu thôi là chưa chặn: gõ thẳng địa chỉ là đường đi vòng hiển
     * nhiên nhất. Và phải cả bốn — liên kết tới một hồ sơ cụ thể còn nằm trong
     * dấu trang của người dùng và trong dòng thông báo ở chuông.
     *
     * `KhongCoQuyen` chứ không phải `KhongCoManHinh`: hai câu nói hai chuyện
     * khác nhau, và "không có màn hình nào ở địa chỉ này" là câu sai — màn hình
     * có thật, chỉ là không dành cho họ.
     */
    for (const d of DUONG_HO_SO) {
      expect(kieu(noiDung(d, 'QUAN_TRI')), `${d} phải chặn Quản trị`).toBe(KhongCoQuyen);
    }
  });

  it('năm vai trò còn lại KHÔNG bị chặn ở bất kỳ đường nào trong bốn', () => {
    // Chiều đối chiếu. Thiếu nó thì một chốt chặn viết nhầm thành "chặn tất cả"
    // vẫn xanh, và cả luồng duyệt chết mà không ca nào kêu.
    for (const v of VAI_TRO.filter((x) => x !== 'QUAN_TRI')) {
      for (const d of DUONG_HO_SO) {
        // `/ho-so/moi` có chốt riêng của nó (`lapHoSo`, chỉ TDV) — không tính.
        if (d === '/ho-so/moi' && v !== 'TDV') continue;
        expect(kieu(noiDung(d, v)), `${v} · ${d}`).not.toBe(KhongCoQuyen);
      }
    }
  });

  it('TỔNG QUAN vẫn còn — nó KHÔNG đi nhờ khoá `hoSo`', () => {
    /*
     * Cái bẫy của lượt này, và nó im lặng hoàn toàn.
     *
     * Tới `0132` mục menu `/` khai `muc: 'hoSo'`, nên gỡ Quản trị khỏi `hoSo` là
     * gỡ luôn màn hình đầu tiên họ nhìn thấy sau khi đăng nhập — trong khi Tổng
     * quan của họ chẳng có thẻ hồ sơ nào (`THE_THEO_VAI_TRO.QUAN_TRI` rỗng), nó
     * là thư hỏng, ô hệ thống, hoạt động hôm nay và nhật ký gọn.
     */
    expect(xem('QUAN_TRI', 'tongQuan')).toBe(true);
    expect(dieuHuongCho('QUAN_TRI').map((m) => m.duong)).toContain('/');
    expect(kieu(noiDung('/', 'QUAN_TRI'))).not.toBe(KhongCoQuyen);
  });

  it('KHÁCH HÀNG vẫn còn — chỗ duy nhất đổi được TDV phụ trách', () => {
    /*
     * `doiTdvPhuTrach` là quyền CHỈ của Quản trị (`0031`), và nút ấy nằm trên
     * trang chi tiết khách hàng. Gỡ nốt trang Khách hàng là gỡ luôn cách duy
     * nhất đổi TDV phụ trách của một khách — chốt 27/08 giữ lại có chủ ý.
     *
     * Hai vế đi cùng nhau ở đây: mục menu còn, VÀ quyền còn. Mất vế nào thì
     * chức năng cũng chết, mà mỗi vế nằm ở một bảng khác nhau.
     */
    expect(dieuHuongCho('QUAN_TRI').map((m) => m.duong)).toContain('/khach-hang');
    expect(can('QUAN_TRI', 'doiTdvPhuTrach')).toBe(true);
  });
});
