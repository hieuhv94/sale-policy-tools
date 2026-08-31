/**
 * `0168` — GATEWAY PHẢI ĐỊNH TUYẾN ĐỦ MỌI ĐƯỜNG `/policies` CỦA `document`.
 *
 * Tệp thuần: quét mã nguồn, không dựng ứng dụng, không chạm CSDL.
 *
 * ---------------------------------------------------------------------------
 * LỖ HỔNG NÀY ĐÃ CẮN HAI LẦN
 * ---------------------------------------------------------------------------
 *
 * Hai service cùng phục vụ tiền tố `/policies`: `policy` giữ máy trạng thái, còn
 * `document` giữ ba đường thuộc vòng đời file (bản A4, hợp đồng, xem trước).
 * Tiền tố không tách được chúng, nên `UPSTREAMS` có thêm một mẫu `chiTiet` liệt
 * kê ĐÍCH DANH những đường của `document`.
 *
 * Một danh sách viết tay như thế trôi theo đúng một chiều: thêm route mới ở
 * `document` mà quên thêm vào mẫu. Hậu quả không phải một lỗi có tên — lượt gọi
 * rơi xuống `policy`, và Nest trả **404 "Cannot POST …"**, một câu không nhắc gì
 * tới gateway lẫn service nào.
 *
 * Và bộ kiểm KHÔNG bắt được: mọi ca http gọi THẲNG từng service (`http(doc)`),
 * không đi qua gateway. Chú thích ở `routes.ts` đã ghi đúng điều đó từ `0055` —
 * *"phát hiện ra chỉ bằng cách chạy thật"* — rồi `0168` dính lại y hệt với
 * `POST /policies/:id/render/luu`, và lần này chồng demo là chỗ phát hiện.
 *
 * Ca kiểm dưới đây đóng vòng: nó đọc BẢNG ROUTE THẬT của `document` bằng cách
 * quét decorator, rồi đối chiếu từng đường với chính mẫu `chiTiet`. Thêm một
 * route `/policies/...` ở `document` mà quên gateway là ĐỎ Ở ĐÂY, không phải ở
 * lượt `docker compose up` tiếp theo.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UPSTREAMS } from '@csbh/gateway/testing';

/** Hai tệp khai `@Controller('policies')` bên `document`. */
const TEP = [
  'services/document/src/render/render.controller.ts',
  'services/document/src/contracts/contracts.controller.ts',
];

/**
 * Mọi đường `/policies/...` mà `document` phục vụ, đọc từ decorator.
 *
 * Chỉ nhận decorator nằm TRONG một lớp có `@Controller('policies')`: cùng tệp
 * `contracts.controller.ts` còn khai `@Controller('contract-templates')` và
 * `@Controller('policy-templates')`, và hai tiền tố ấy có dòng riêng trong
 * `UPSTREAMS` nên không liên quan.
 */
function duongCuaDocument(): string[] {
  const ra: string[] = [];
  for (const tep of TEP) {
    const src = readFileSync(tep, 'utf8');
    // Cắt tệp theo từng khối `@Controller('x')` … tới `@Controller` kế tiếp.
    const moc = [...src.matchAll(/@Controller\('([^']+)'\)/g)];
    for (const [i, m] of moc.entries()) {
      if (m[1] !== 'policies') continue;
      const het = moc[i + 1]?.index ?? src.length;
      const khoi = src.slice(m.index, het);
      for (const r of khoi.matchAll(/@(Get|Post|Delete|Patch|Put)\('([^']*)'\)/g)) {
        ra.push(`/policies/${r[2]}`);
      }
    }
  }
  return ra;
}

describe('`0168` gateway định tuyến đủ đường `/policies` của `document`', () => {
  const dong = UPSTREAMS.find((u) => u.prefix === '/policies' && u.name === 'document');

  it('có một dòng `/policies` trỏ sang `document`, và nó có mẫu `chiTiet`', () => {
    /*
     * Không có mẫu thì dòng ấy nuốt MỌI đường `/policies` — kể cả những đường
     * của máy trạng thái — và cả luồng duyệt chết. Đó là lý do mẫu tồn tại, nên
     * ca kiểm phải khẳng định nó có mặt trước khi đối chiếu nội dung.
     */
    expect(dong, 'thiếu dòng `/policies` → document').toBeDefined();
    expect(dong!.chiTiet, 'dòng ấy PHẢI có mẫu, nếu không nó nuốt cả `policy`').toBeDefined();
  });

  it('MỌI route của `document` dưới `/policies` đều khớp mẫu', () => {
    const duong = duongCuaDocument();
    // Đọc được ít nhất ba đường — nếu phép quét hỏng thì mảng rỗng và ca này
    // xanh vì không có gì để kiểm, đúng loại ca xanh vô nghĩa.
    expect(duong.length, 'phép quét decorator hỏng — không đọc được route nào').toBeGreaterThanOrEqual(3);

    const thieu: string[] = [];
    for (const d of duong) {
      // `:id` thành một đoạn thật, đúng như một lượt gọi thật.
      const that = d.replace(':id', 'a1b2c3d4-0000-4000-8000-000000000000');
      if (!dong!.chiTiet!.test(that)) thieu.push(d);
    }
    expect(
      thieu,
      `gateway sẽ đẩy ${thieu.join(', ')} sang \`policy\` và người dùng nhận 404 "Cannot POST …"`,
    ).toEqual([]);
  });

  it('mẫu KHÔNG nuốt đường của máy trạng thái', () => {
    /*
     * Chiều đối chiếu, và nó cần thật: cách "sửa" dễ nhất cho ca trên là nới mẫu
     * thành `.*`, và làm thế thì mọi lượt gửi duyệt, ký số, bàn giao đều bay sang
     * `document`. Cả luồng duyệt chết, và ca trên vẫn xanh.
     */
    const id = 'a1b2c3d4-0000-4000-8000-000000000000';
    for (const d of [
      `/policies/${id}`,
      `/policies/${id}/actions/SUBMIT`,
      `/policies/${id}/attachments`,
      `/policies/${id}/lines`,
      `/policies/${id}/allowed-actions`,
      `/policies/${id}/events`,
    ]) {
      expect(dong!.chiTiet!.test(d), `${d} phải đi về \`policy\``).toBe(false);
    }
  });
});
