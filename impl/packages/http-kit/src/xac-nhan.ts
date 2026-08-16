/**
 * "Gõ lại tên của thứ sắp mất" — chốt chặn dùng chung cho mọi thao tác xoá.
 *
 * VÌ SAO Ở MÁY CHỦ chứ không chỉ là một hộp thoại đẹp: hộp thoại chặn bấm nhầm,
 * còn phép kiểm này là một phần của HỢP ĐỒNG. Ai gọi thẳng API — một script dọn
 * dữ liệu, một lần thử tay bằng curl, một màn hình viết sau này quên mất bước
 * xác nhận — vẫn phải nói ra đúng thứ mình định xoá. Đây cũng là nếp đã có sẵn:
 * vô hiệu hoá tài khoản đòi gõ lại từ `0032`, tệp này chỉ đem nó ra dùng chung.
 *
 * DÙNG MÃ NGHIỆP VỤ, KHÔNG DÙNG UUID. Mã sản phẩm, mã quy định, tên đăng nhập —
 * đó là những chuỗi hiện trên màn hình và gõ lại được. UUID thì không ai gõ,
 * người dùng sẽ sao chép, mà sao chép thì cũng phản xạ y như bấm nút: chốt chặn
 * biến thành một bước thừa mà vẫn không chặn được gì.
 *
 * So sau khi bỏ khoảng trắng hai đầu và không phân biệt hoa thường: người dùng
 * chép mã từ màn hình sang, và một chữ hoa lệch không phải là bấm nhầm.
 */
import { BadRequestException } from '@nestjs/common';

const chuan = (x: string) => x.trim().toLocaleLowerCase('vi');

export function xacNhanGoLai(
  nhap: string | undefined,
  dung: string,
  opts: { field?: string; viec: string },
): void {
  if (chuan(nhap ?? '') === chuan(dung)) return;
  throw new BadRequestException({
    code: 'CONFIRM_MISMATCH',
    field: opts.field ?? 'confirm',
    // Thông điệp nêu ĐÚNG chuỗi phải gõ. Giấu nó đi không thêm được chút an
    // toàn nào — người gọi đang nhìn thẳng vào bản ghi đó — mà lại biến một
    // chốt chặn chống bấm nhầm thành một câu đố.
    message: `Gõ đúng "${dung}" để xác nhận ${opts.viec}.`,
    expected: dung,
  });
}
