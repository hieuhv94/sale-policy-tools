/**
 * Khoảng tỷ lệ chiết khấu của bộ lọc *Hồ sơ CSBH* (`0283`) — phần THUẦN, để ca kiểm gọi thẳng.
 *
 * Người dùng gõ DẤU PHẨY (`22,5`) theo quy ước tiếng Việt (`FE-27`); máy chủ nhận dấu chấm (`22.5`) và đòi
 * số 0–100 với tối đa hai chữ số thập phân. Hàm này là chỗ DUY NHẤT đổi giữa hai dạng, và cũng là chỗ quyết
 * định lúc nào một khoảng đủ tốt để gửi đi: gõ dở (`2,`) hay sai thứ tự thì KHÔNG gửi gì, kẻo máy chủ trả 400
 * và danh sách nhảy sang trạng thái lỗi giữa lúc người dùng đang gõ.
 */
import { doiSoThapPhan } from './danh-muc.js';

export type KhoangChietKhau = {
  /** Dạng gửi máy chủ (dấu chấm). Rỗng = không giới hạn đầu đó. */
  tu: string;
  den: string;
  /** Câu nói điều cần sửa; `null` khi khoảng dùng được. Khoảng lỗi thì `tu`/`den` là chuỗi rỗng. */
  loi: string | null;
};

const MOT_DAU = (s: string): string | null | 'sai' => {
  const t = s.trim();
  if (t === '') return null;
  const n = doiSoThapPhan(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 'sai';
  // Hai chữ số thập phân là độ chính xác lưu trong CSDL; gõ ba chữ số thì máy chủ từ chối.
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(t)) return 'sai';
  return String(n);
};

export function khoangChietKhau(tu: string, den: string): KhoangChietKhau {
  const a = MOT_DAU(tu);
  const b = MOT_DAU(den);
  if (a === 'sai' || b === 'sai') {
    return { tu: '', den: '', loi: 'Nhập số từ 0 đến 100, tối đa hai chữ số thập phân.' };
  }
  if (a !== null && b !== null && Number(a) > Number(b)) {
    return { tu: '', den: '', loi: 'Số đầu đang lớn hơn số cuối. Đổi chỗ hai số.' };
  }
  return { tu: a ?? '', den: b ?? '', loi: null };
}

/** Dạng hiện trên màn hình: dấu phẩy. */
export const hienPhanTram = (s: string): string => s.replace('.', ',');

/** Câu mô tả khoảng, dùng ở thẻ hồ sơ và dải tóm tắt: *20% – 25%*, *từ 20% trở lên*, *đến 10%*. */
export function moTaKhoang(tu: string, den: string): string {
  if (tu !== '' && den !== '') return `${hienPhanTram(tu)}% – ${hienPhanTram(den)}%`;
  if (tu !== '') return `từ ${hienPhanTram(tu)}% trở lên`;
  if (den !== '') return `đến ${hienPhanTram(den)}%`;
  return '';
}
