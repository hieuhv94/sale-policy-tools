/**
 * `0151` — TÊN CÔNG TY, một nguồn sự thật và không còn bản chép nào bỏ sót.
 *
 * Khách hàng đổi pháp nhân 29/08: *Cổ phần Dinh dưỡng* → *TNHH Dược phẩm*. Việc
 * nghe như một lượt tìm-và-thay, và đó chính là chỗ nó nguy hiểm — tên cũ nằm ở
 * **sáu chỗ trong mã** cộng **bốn tệp `.docx` nhị phân**, và bốn tệp ấy không
 * một công cụ tìm kiếm văn bản nào nhìn thấy.
 *
 * Tệp thuần: đọc tệp trên đĩa, không dựng ứng dụng, không chạm CSDL.
 *
 * VÌ SAO QUÉT NGUỒN chứ không quét cả repo. Luật là *"phần mềm không được IN ra
 * tên cũ"*, không phải *"chữ ấy không được xuất hiện ở đâu"*. Nhật ký triển khai
 * và Phụ lục B **phải** giữ tên cũ — chúng ghi lại một quyết định có thật, và
 * một ca kiểm bắt xoá lịch sử là một ca kiểm sai. Nên phạm vi quét là mã nguồn
 * và tệp mẫu, hai thứ đi vào bản in.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPANY, COMPANY_ADDRESS_LINE, documentXml } from '@csbh/document/testing';
import { TEN_CONG_TY } from '@csbh/web/cong-ty';
import { BO_MAU, THU_MUC } from '../../scripts/tao-mau-ho-so.js';

/**
 * Tên cũ, dựng từ hai mảnh.
 *
 * Nối chuỗi chứ không viết liền, và không phải để làm dáng: phép quét bên dưới
 * đọc CẢ TỆP NÀY, nên một hằng viết liền sẽ tự làm chính nó đỏ. Cách khác là
 * loại trừ tệp này khỏi danh sách quét, nhưng loại trừ thì mọi thứ khác trong
 * tệp cũng ra khỏi tầm quét theo.
 */
const TEN_CU = 'CỔ PHẦN' + ' DINH DƯỠNG NUTRICARE';

/**
 * Chuẩn hoá NFC trước khi so.
 *
 * `CLAUDE.md` đã ghi cái bẫy này ở tên tệp; nó áp dụng y hệt cho nội dung. Chữ
 * `ưỡ` gõ trên macOS ra NFD (`ư` + dấu rời) còn trên Linux ra NFC — hai chuỗi
 * trông giống hệt nhau trên màn hình mà `includes()` trả về `false`. Không chuẩn
 * hoá thì ca này xanh ở đúng lúc nó phải đỏ.
 */
const chuan = (s: string): string => s.normalize('NFC').toLowerCase();
const coTenCu = (s: string): boolean => chuan(s).includes(chuan(TEN_CU));

/** Mọi tệp mã nguồn đi vào bản chạy — thứ có thể in ra tên Công ty. */
const NGUON: string[] = (() => {
  const ra: string[] = [];
  const BO_QUA = new Set(['node_modules', 'dist', '.git']);
  const di = (thuMuc: string): void => {
    for (const m of readdirSync(thuMuc, { withFileTypes: true })) {
      if (BO_QUA.has(m.name)) continue;
      const p = join(thuMuc, m.name);
      if (m.isDirectory()) di(p);
      else if (/\.(ts|tsx|html|css)$/.test(m.name)) ra.push(p);
    }
  };
  for (const goc of ['apps', 'services', 'packages', 'scripts', 'tests']) di(goc);
  return ra;
})();

describe('`0151` hằng là nguồn sự thật', () => {
  it('mang tên pháp nhân MỚI', () => {
    expect(COMPANY.name).toBe('CÔNG TY TNHH DƯỢC PHẨM NUTRICARE');
  });

  it('địa chỉ và mã số thuế KHÔNG đổi — chỉ tên pháp nhân đổi', () => {
    /*
     * Chiều đối chiếu, và nó canh một cách làm sai rất dễ xảy ra: nhân lúc sửa
     * tên thì "dọn" luôn hai dòng kia, hoặc thay chúng bằng số liệu phỏng đoán.
     * Khách hàng chốt 29/08 rằng hai dòng ấy giữ nguyên, và mã số thuế in sai
     * trên một bản hợp đồng đã ký là một lỗi không sửa lại được bằng phần mềm.
     */
    expect(COMPANY.address).toBe('Số 1 Đại Cồ Việt, Hai Bà Trưng, Hà Nội');
    expect(COMPANY.taxCode).toBe('0102345678');
    expect(COMPANY_ADDRESS_LINE).toBe(`${COMPANY.address} — MST ${COMPANY.taxCode}`);
  });
});

describe('`0151` bốn tệp mẫu `.docx` mang đúng tên ấy', () => {
  /*
   * ĐÂY LÀ CA QUAN TRỌNG NHẤT CỦA CHẶNG, vì hai vế nằm ở hai thế giới — hằng
   * trong TypeScript, và bốn gói zip nhị phân — đúng chỗ hở mà `0134` đã phải
   * trả giá một lần: một trường thêm vào bảng phân loại mà không mẫu nào in nó,
   * và không ca kiểm nào bắt được vì không ai đọc vào trong tệp zip.
   *
   * `templates/*.docx` là ĐẦU RA của `tao-mau-ho-so.ts`. Sửa hằng mà quên chạy
   * lại bộ sinh là bản chạy thật in tên cũ trong khi mã nguồn nói tên mới — và
   * đó là kết cục có thật nếu ca này không tồn tại.
   */
  const tep = BO_MAU.map((m) => m.tep);

  it('có đủ bốn tệp trên đĩa', () => {
    expect(tep.length).toBe(4);
    for (const t of tep) expect(existsSync(join(THU_MUC, t)), t).toBe(true);
  });

  it('mỗi tệp in tên MỚI, và không tệp nào còn tên cũ', () => {
    for (const t of tep) {
      const xml = documentXml(readFileSync(join(THU_MUC, t)));
      expect(chuan(xml), `${t} phải in tên mới`).toContain(chuan(COMPANY.name));
      expect(coTenCu(xml), `${t} vẫn còn tên cũ — chạy lại tao-mau-ho-so.ts`).toBe(false);
    }
  });

  it('và vẫn in đúng dòng địa chỉ + MST', () => {
    // Dòng ấy đứng ngay dưới tên ở cả bốn mẫu. Sinh lại mẫu mà đánh rơi nó thì
    // tờ hợp đồng mất mã số thuế bên bán — ca trên vẫn xanh.
    for (const t of tep) {
      const xml = documentXml(readFileSync(join(THU_MUC, t)));
      expect(chuan(xml), t).toContain(chuan(COMPANY_ADDRESS_LINE));
    }
  });
});

describe('`0151` không mã nguồn nào còn bản chép của tên cũ', () => {
  it('quét toàn bộ `apps` · `services` · `packages` · `scripts` · `tests`', () => {
    /*
     * Quét THẬT chứ không liệt kê tên tệp. `0133` đã ghi bài học ấy: một ca kiểm
     * liệt kê ba tên tệp thì bốn tệp còn lại lọt, và nó xanh suốt trong khi lỗi
     * vẫn ở đó. Ở đây cái lọt sẽ là một màn hình phụ hoặc một fixture nào đó còn
     * gõ tên cũ — thứ chỉ lộ ra khi có người mở đúng màn hình ấy.
     */
    const con = NGUON.filter((p) => coTenCu(readFileSync(p, 'utf8')));
    expect(con, `còn tên cũ ở: ${con.join(', ')}`).toEqual([]);
  });

  it('bản chép phía giao diện (`lib/cong-ty.ts`) khớp `COMPANY.name` từng chữ', () => {
    /*
     * Bản chép DUY NHẤT phía giao diện, và nó phải là bản chép: import `COMPANY`
     * từ một service vào gói trình duyệt là kéo cả cây phụ thuộc máy chủ theo
     * (`FE-38` chặn 250KB). Từ `0244` nó nằm ở `lib/cong-ty.ts` thay vì gõ thẳng
     * trong `DangNhap.tsx`, vì chân trang là chỗ dùng thứ hai — và so THẲNG với
     * hằng của máy chủ, khác dạng chữ hoa/thường là được.
     */
    expect(chuan(TEN_CONG_TY)).toBe(chuan(COMPANY.name));
    expect(coTenCu(readFileSync('apps/web/src/lib/cong-ty.ts', 'utf8'))).toBe(false);
  });

  it('không tệp giao diện nào gõ tay cái tên — mọi chỗ đọc từ `lib/cong-ty.ts`', () => {
    const lo: string[] = [];
    const quet = (d: string) => {
      for (const t of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, t.name);
        if (t.isDirectory()) quet(p);
        else if (/\.tsx?$/.test(p) && !p.endsWith('cong-ty.ts') && chuan(readFileSync(p, 'utf8')).includes(chuan(TEN_CONG_TY))) lo.push(p);
      }
    };
    quet('apps/web/src');
    expect(lo).toEqual([]);
  });
});
