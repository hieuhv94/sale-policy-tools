/**
 * Trang tổng quan gồm những gì, cho vai trò nào.
 *
 * HAI BẢNG TRA, và chúng là nguồn duy nhất. Rải `if (vaiTro === …)` trong JSX là
 * cách chắc chắn để có ngày một vai trò sót một thẻ — mà thẻ sót thì không báo
 * lỗi, nó chỉ vắng mặt. `tong-quan.test.tsx` quét đúng hai bảng này.
 *
 * Không đặt trong `can.ts`: đó là bảng PHÂN QUYỀN và `FE-23` quét chính nó. Trộn
 * chuyện bố cục vào là mời người sau sửa quyền lúc đang định sửa giao diện.
 */
import type { VaiTro } from './can.js';

/** 11 trạng thái của muc 4. Cùng tập khoá với `NHAN_TRANG_THAI` ở `format.ts`. */
export type TrangThai =
  | 'NHAP'
  | 'CHO_TBP_DUYET'
  | 'TBP_DA_KY_SO'
  | 'CHO_KT_L1'
  | 'SA_DANG_XU_LY'
  | 'CHO_KT_L2'
  | 'DANG_CO_HIEU_LUC'
  | 'HET_HIEU_LUC'
  | 'YEU_CAU_CHINH_SUA'
  | 'TU_CHOI'
  | 'QUA_HAN_DUYET';

export const MOI_TRANG_THAI: TrangThai[] = [
  'NHAP',
  'CHO_TBP_DUYET',
  'TBP_DA_KY_SO',
  'CHO_KT_L1',
  'SA_DANG_XU_LY',
  'CHO_KT_L2',
  'DANG_CO_HIEU_LUC',
  'HET_HIEU_LUC',
  'YEU_CAU_CHINH_SUA',
  'TU_CHOI',
  'QUA_HAN_DUYET',
];

/**
 * Trạng thái này là VIỆC CỦA AI — hồ sơ đang nằm trên bàn của vai trò nào.
 *
 * `null` nghĩa là trạng thái kết thúc hoặc trạng thái cắt ngang, không thuộc bàn
 * của riêng ai: hồ sơ đã có hiệu lực, đã hết hiệu lực, đã bị từ chối, hoặc đang
 * quá hạn ở một bước bất kỳ. Bốn cái đó ai xem cũng có nghĩa.
 *
 * Bảng này KHÔNG dùng để dựng màn hình. Nó tồn tại để test đối chiếu được rằng
 * dải thẻ của một vai trò không chứa bước của vai trò khác — nếu suy ngược từ
 * chính `THE_TRANG_THAI` thì test chỉ đang lặp lại dữ liệu nó cần kiểm.
 */
export const BAN_CUA: Record<TrangThai, VaiTro | null> = {
  NHAP: 'TDV',
  YEU_CAU_CHINH_SUA: 'TDV',
  CHO_TBP_DUYET: 'TBP',
  TBP_DA_KY_SO: 'TBP',
  CHO_KT_L1: 'KE_TOAN',
  CHO_KT_L2: 'KE_TOAN',
  SA_DANG_XU_LY: 'SALE_ADMIN',
  DANG_CO_HIEU_LUC: null,
  HET_HIEU_LUC: null,
  TU_CHOI: null,
  QUA_HAN_DUYET: null,
};

/**
 * Dải thẻ đếm hồ sơ theo trạng thái, cho từng vai trò.
 *
 * Quy tắc: **chỉ trạng thái thuộc phần việc của chính vai trò đó**, cộng các
 * trạng thái kết thúc. Một TDV nhìn ô "Chờ Kế toán L2: 7" thì không làm được gì
 * với con số ấy, mà nó vẫn chiếm chỗ và vẫn bắt phải đọc.
 *
 * Ngoại lệ duy nhất là `BAN_LANH_DAO`: vai trò giám sát toàn luồng nên không
 * cắt bớt cái nào.
 *
 * `QUAN_TRI` KHÔNG có thẻ nào, và đây là chỗ dễ làm sai nhất của cả màn hình:
 * `idn.scope_user_ids` trả về RỖNG cho họ (0003_identity.sql), nên mọi lời gọi
 * `/reports/*` đều ra 0. Bày một ô "Tổng hồ sơ: 0" là một con số đúng nhưng đọc
 * ra nghĩa hoàn toàn sai — người xem sẽ tưởng hệ thống trống.
 */
export const THE_TRANG_THAI: Record<VaiTro, TrangThai[]> = {
  TDV: ['NHAP', 'YEU_CAU_CHINH_SUA', 'DANG_CO_HIEU_LUC', 'TU_CHOI'],
  TBP: ['CHO_TBP_DUYET', 'QUA_HAN_DUYET', 'TBP_DA_KY_SO', 'DANG_CO_HIEU_LUC', 'TU_CHOI'],
  KE_TOAN: ['CHO_KT_L1', 'CHO_KT_L2', 'QUA_HAN_DUYET', 'DANG_CO_HIEU_LUC'],
  SALE_ADMIN: ['SA_DANG_XU_LY', 'QUA_HAN_DUYET', 'DANG_CO_HIEU_LUC', 'TU_CHOI'],
  BAN_LANH_DAO: MOI_TRANG_THAI,
  QUAN_TRI: [],
};

/**
 * Bốn trạng thái mà hồ sơ ĐANG ĐI trong luồng duyệt.
 *
 * TDV có thêm một thẻ gộp "Đang chờ duyệt" bằng tổng bốn cái này — nó trả lời
 * "hồ sơ tôi gửi vẫn đang chạy chứ?" mà không phải bày ra bốn ô của bốn người
 * khác.
 */
export const DANG_CHO: TrangThai[] = [
  'CHO_TBP_DUYET',
  'CHO_KT_L1',
  'SA_DANG_XU_LY',
  'CHO_KT_L2',
];

/**
 * Vai trò nào được thêm thẻ gộp "Đang chờ duyệt".
 *
 * Là một BẢNG chứ không phải `vaiTro === 'TDV'` trong màn hình: `quyen.test.ts`
 * cấm so sánh vai trò bằng chuỗi viết thẳng ngoài `can.ts`, và cái lệnh cấm ấy
 * có lý do — một phép so rải trong JSX là chỗ không ai nghĩ tới khi thêm vai trò.
 */
export const CO_THE_DANG_CHO: VaiTro[] = ['TDV'];

/** Các khối ngoài dải thẻ. Thứ tự trong mảng là thứ tự hiện trên màn hình. */
export type TenKhoi =
  | 'vi-sao-khong-co-viec'
  | 'canh-bao-mau-hop-dong'
  | 'canh-bao-thu-hong'
  | 'yeu-cau-cap-nhat'
  | 'hop-viec'
  | 'hop-viec-ke-toan'
  | 'suc-khoe-luong'
  | 'theo-buoc'
  | 'theo-tdv'
  | 'o-he-thong'
  | 'hoat-dong-hom-nay'
  | 'nhat-ky-gon';

/**
 * Cảnh báo đứng TRƯỚC hộp việc ở hai vai trò có nó.
 *
 * Mẫu hợp đồng chết và thư hỏng đều là thứ làm hỏng việc của NGƯỜI KHÁC, và chỉ
 * người này chữa được. Đặt nó dưới một danh sách dài là gần như chắc chắn không
 * ai cuộn tới.
 */
/*
 * `yeu-cau-cap-nhat` đứng TRƯỚC hộp việc ở cả bốn vai trò trong luồng (`0029`).
 *
 * Cùng lý do với hai cảnh báo phía trên nó: một hồ sơ mang con số đã lỗi thời là
 * thứ phải biết TRƯỚC khi mở nó ra ký. Đặt dưới một danh sách việc dài là gần
 * như chắc chắn không ai cuộn tới, mà cuộn tới thì cũng đã ký xong rồi.
 *
 * Ban lãnh đạo và Quản trị KHÔNG có: cả hai nằm ngoài luồng duyệt, phạm vi dữ
 * liệu của họ không chứa hồ sơ nào (Quản trị) hoặc chỉ để xem (Ban lãnh đạo) —
 * bày một danh sách việc-phải-làm cho người không làm được việc ấy là nhiễu.
 */
export const KHOI_THEO_VAI_TRO: Record<VaiTro, TenKhoi[]> = {
  TDV: ['yeu-cau-cap-nhat', 'hop-viec'],
  TBP: ['yeu-cau-cap-nhat', 'hop-viec', 'suc-khoe-luong'],
  KE_TOAN: ['yeu-cau-cap-nhat', 'hop-viec-ke-toan', 'suc-khoe-luong'],
  SALE_ADMIN: ['canh-bao-mau-hop-dong', 'yeu-cau-cap-nhat', 'hop-viec', 'theo-tdv'],
  BAN_LANH_DAO: [
    'vi-sao-khong-co-viec',
    'suc-khoe-luong',
    'theo-buoc',
    'theo-tdv',
    'nhat-ky-gon',
  ],
  QUAN_TRI: [
    'vi-sao-khong-co-viec',
    'canh-bao-thu-hong',
    'o-he-thong',
    'hoat-dong-hom-nay',
    'nhat-ky-gon',
  ],
};

/** Khối nào có nút ghi — `FE-23` cấm `BAN_LANH_DAO` chạm vào bất kỳ cái nào. */
export const KHOI_CO_NUT_GHI: TenKhoi[] = ['canh-bao-mau-hop-dong', 'canh-bao-thu-hong'];

/** Câu giải thích vì sao vai trò này không có hộp việc. Nói thẳng, không vòng vo. */
export const LY_DO_KHONG_CO_VIEC: Partial<Record<VaiTro, string>> = {
  BAN_LANH_DAO:
    'Ban lãnh đạo không nằm trong luồng duyệt nên không có hồ sơ nào chờ bạn xử lý. ' +
    'Màn hình này là bản tổng hợp toàn hệ thống, chỉ để xem.',
  QUAN_TRI:
    'Quản trị hệ thống không nằm trong luồng duyệt nên không có hồ sơ nào ở đây, ' +
    'và các con số hồ sơ cũng không thuộc phạm vi dữ liệu của bạn. ' +
    'Màn hình này theo dõi sức khoẻ hệ thống.',
};
