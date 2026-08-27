/**
 * `0137` — MẪU NÀO ĐƯỢC NẠP SẴN, và mẫu nào chỉ nằm trong `templates/`.
 *
 * Tệp thuần: đọc `BO_MAU` và quét mã nguồn `nap-danh-muc.ts`, không dựng ứng
 * dụng, không chạm CSDL.
 *
 * Hai bộ nạp, hai danh sách riêng — và đó là chỗ chúng trôi khỏi nhau được:
 *
 *   `make demo-mau`        đọc `BO_MAU`, bỏ qua mục có `napDemo: false`
 *   `./csbh nap-danh-muc`  có danh sách `MAU` RIÊNG, viết tay trong script
 *
 * Khách hàng chốt 27/08: mẫu **A4 dọc rút gọn** ra khỏi cả hai. File vẫn ở lại
 * `templates/` — nó trả lời câu hỏi *"ít nhất phải có những gì thì mẫu mới ban
 * hành được"*, và câu ấy là của người SOẠN mẫu chứ không của người dùng bản
 * demo. Có một ca kiểm khác canh nội dung nó (`0057`).
 */
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BO_MAU, THU_MUC } from '../../scripts/tao-mau-ho-so.js';

const RUT_GON = 'mau-ho-so-a4-doc-rut-gon.docx';

/** Tên file mà `nap-danh-muc.ts` nạp — đọc từ chính mã nguồn của nó. */
const tepNapDanhMuc = (): string[] => {
  const s = readFileSync('scripts/nap-danh-muc.ts', 'utf8');
  return [...s.matchAll(/tep:\s*'([^']+\.docx)'/g)].map((m) => m[1]!);
};

/** Tên file mà `make demo-mau` nạp — cùng phép lọc `namMauHoSo()` dùng. */
const tepDemoMau = (): string[] => BO_MAU.filter((m) => m.napDemo !== false).map((m) => m.tep);

describe('`0137` mẫu rút gọn ra khỏi cả hai bộ nạp', () => {
  it('`make demo-mau` KHÔNG nạp nó', () => {
    expect(tepDemoMau()).not.toContain(RUT_GON);
  });

  it('`nap-danh-muc` KHÔNG nạp nó', () => {
    /*
     * Vế này đã đúng từ trước — `nap-danh-muc` chưa bao giờ nạp mẫu rút gọn.
     * Ca kiểm vẫn cần: hai danh sách nằm ở hai tệp khác nhau, nên "đã đúng" chỉ
     * là trạng thái hôm nay, không phải một bảo đảm.
     */
    expect(tepNapDanhMuc()).not.toContain(RUT_GON);
  });

  it('nhưng FILE vẫn còn trong `templates/`, và vẫn được sinh ra', () => {
    /*
     * Chiều đối chiếu, và nó bắt đúng cách làm sai hiển nhiên nhất: xoá luôn
     * mục khỏi `BO_MAU`. Làm thế thì hai ca trên vẫn xanh, mà file biến mất khỏi
     * repo ở lượt sinh lại kế tiếp — kéo theo ca `0057` canh nội dung nó.
     */
    expect(BO_MAU.map((m) => m.tep)).toContain(RUT_GON);
    expect(existsSync(`${THU_MUC}/${RUT_GON}`)).toBe(true);
  });
});

describe('`0137` hai mẫu còn lại vẫn được nạp', () => {
  it('`make demo-mau` nạp ĐÚNG hai mẫu hồ sơ — A4 dọc và A4 ngang', () => {
    /*
     * Bộ nạp XOAY VÒNG qua các mẫu đã nạp để mỗi hồ sơ mang một bố cục khác
     * nhau. Còn đúng một mẫu thì việc xoay vòng thành vô hình, và tính năng
     * *mẫu đóng băng vào hồ sơ* (`0098`) không còn chỗ nào bày ra.
     */
    expect(tepDemoMau()).toEqual(['mau-ho-so-a4-doc.docx', 'mau-ho-so-a4-ngang.docx']);
  });

  it('`nap-danh-muc` nạp ĐÚNG ba file: hai mẫu hồ sơ và một mẫu hợp đồng', () => {
    expect(tepNapDanhMuc()).toEqual([
      'mau-ho-so-a4-doc.docx',
      'mau-ho-so-a4-ngang.docx',
      'mau-hop-dong-a4-doc.docx',
    ]);
  });

  it('mẫu HỢP ĐỒNG vẫn đứng ngoài `make demo-mau` (`0058`)', () => {
    // Hai lý do khác nhau cùng dẫn tới `napDemo: false`, và trộn chúng lại là
    // mất một trong hai: mẫu hợp đồng đứng ngoài vì bản demo đã có mẫu riêng.
    expect(tepDemoMau()).not.toContain('mau-hop-dong-a4-doc.docx');
  });
});
