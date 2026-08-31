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
import { MAU_MAC_DINH } from '@csbh/document/testing';
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

  it('`seed-demo` KHÔNG đụng tới mẫu', () => {
    /*
     * Vế này đắt hơn vế trên: `seed-demo` từng nạp CẢ HAI loại — mẫu hồ sơ qua
     * `namMauHoSo()` và mười mấy mẫu hợp đồng dựng bằng `makeDocx`. Sót lại một
     * trong hai thì bản demo có hai bộ mẫu chồng lên nhau, và người xem không
     * biết bộ nào là bộ thật.
     */
    const s = nguon('scripts/seed-demo.ts');
    for (const cam of ['/policy-templates', '/contract-templates']) {
      expect(s, `seed-demo thôi đụng tới ${cam}`).not.toContain(cam);
    }
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
