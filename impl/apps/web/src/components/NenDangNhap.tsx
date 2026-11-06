/**
 * ẢNH NỀN nửa trái màn hình đăng nhập (`0259`) — mẫu C *Mạng vai trò*, khách hàng
 * chọn trong bốn mẫu (https://claude.ai/artifact/PbxHKyYtGF8rfS8xYq4dHi).
 *
 * Sáu vai trò quanh MỘT hồ sơ chung, nối bằng đường mảnh; một vai trò đang giữ hồ
 * sơ nổi màu — trừu tượng hoá việc nhiều bộ phận cùng xử lý một chính sách.
 *
 * VÌ SAO SVG NỘI TUYẾN chứ không phải tệp ảnh: màu lấy từ TOKEN qua lớp CSS
 * (`.nen-*` ở `app.css`) nên tự đổi theo giao diện sáng/tối — một tệp `.svg` gọi
 * bằng `background-image` không đọc được biến CSS của trang. Không mã màu nào ở
 * đây (`FE-19`).
 *
 * VỊ TRÍ (sửa sau lượt đo ở bảy khổ màn hình): bản đầu kéo giãn CẢ KHUNG hình
 * (`viewBox` 756×820, `slice`) theo nửa trái — cụm mạng phình theo bề rộng và đè lên
 * chữ ở 6/7 khổ đo được (đo khung bao bằng `getBoundingClientRect`, không bằng mắt).
 * Giờ SVG chỉ chứa CỤM MẠNG (`viewBox` vuông quanh nó), CSS đặt nó ở góc dưới phải
 * với cỡ có trần; lưới chấm là nền CSS của khối, còn chữ đứng ở phần trên.
 */
const CX = 570;
const CY = 610;
const R = 175;
const VAI_TRO = [0, 1, 2, 3, 4, 5].map((i) => {
  const a = ((-90 + i * 60) * Math.PI) / 180;
  return [CX + R * Math.cos(a), CY + R * Math.sin(a)] as const;
});
/** Vai trò đang giữ hồ sơ — nút nổi màu. */
const DANG_GIU = 2;

export function NenDangNhap() {
  return (
    <svg
      className="nen-dang-nhap"
      viewBox="268 308 604 604"
      aria-hidden="true"
      focusable="false"
    >
      {[290, 200, 110].map((r, i) => (
        <circle key={r} cx={CX} cy={CY} r={r} fill="none" className="nen-net-nhat" strokeWidth={i === 1 ? 2 : 24} />
      ))}
      {VAI_TRO.map(([x, y], i) => (
        <line
          key={`tia-${i}`}
          x1={CX}
          y1={CY}
          x2={x}
          y2={y}
          className="nen-net-vua"
          strokeWidth="1.6"
          strokeDasharray={i % 2 ? '4 6' : undefined}
        />
      ))}
      {VAI_TRO.map(([x, y], i) => {
        const [x2, y2] = VAI_TRO[(i + 1) % 6]!;
        return <line key={`vong-${i}`} x1={x} y1={y} x2={x2} y2={y2} className="nen-net-nhat" strokeWidth="2" />;
      })}
      {VAI_TRO.map(([x, y], i) => {
        const giu = i === DANG_GIU;
        return (
          <g key={`nguoi-${i}`}>
            <circle cx={x} cy={y} r={giu ? 28 : 22} className={giu ? 'nen-dam' : 'nen-be nen-net-dam'} strokeWidth="2.5" />
            <circle cx={x} cy={y - 5} r="6" className={giu ? 'nen-be' : 'nen-vua'} />
            <path d={`M${x - 10} ${y + 11} a10 8 0 0 1 20 0`} className={giu ? 'nen-be' : 'nen-vua'} />
          </g>
        );
      })}
      <g transform={`translate(${CX - 34} ${CY - 44})`}>
        <rect width="68" height="88" rx="10" className="nen-be nen-net-dam" strokeWidth="2.5" />
        <rect x="14" y="18" width="40" height="6" rx="3" className="nen-dam" />
        <rect x="14" y="34" width="34" height="5" rx="2.5" className="nen-vua" />
        <rect x="14" y="46" width="40" height="5" rx="2.5" className="nen-vua" />
        <rect x="14" y="58" width="26" height="5" rx="2.5" className="nen-vua" />
      </g>
    </svg>
  );
}
