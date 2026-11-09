/**
 * Nội dung trang *Hướng dẫn* (`0273`) — DỮ LIỆU THUẦN, không có JSX.
 *
 * Tách khỏi `pages/HuongDan.tsx` vì hai lý do: (1) `tests/http/` không bật `jsx`
 * nên chỉ một tệp `.ts` mới được ca đối chiếu import; (2) nội dung là thứ sửa
 * nhiều nhất, màn hình là thứ sửa ít nhất — để chung một tệp thì sửa một câu chữ
 * cũng là chạm vào component.
 *
 * Mỗi người chỉ thấy hướng dẫn của ĐÚNG vai trò mình (khách hàng chốt): bảng
 * `HUONG_DAN_THEO_VAI_TRO` khoá theo `VaiTro` nên thêm vai trò mà quên viết là
 * `tsc` đỏ. Phần chung (`HUONG_DAN_CHUNG`) hiện cho mọi vai trò.
 *
 * `chiTiet: false` = trang đã có tên và mục đích nhưng chưa viết từng bước; màn
 * hình nói thẳng điều đó thay vì để một mục trống. Cả sáu vai trò hiện đã viết đủ
 * (P312–P316); cờ vẫn giữ cho vai trò hay trang thêm sau trong lúc chờ biên soạn.
 *
 * Ảnh minh hoạ nằm ở `public/huong-dan/<vai-trò>/<tên>.png`; `tep` là phần SAU
 * `huong-dan/`. Ca kiểm quét mọi `tep` và đòi tệp tồn tại.
 */
import type { VaiTro } from './can.js';

export type AnhHuongDan = {
  /** Đường dẫn trong `public/huong-dan/`, ví dụ `tdv/tong-quan.png`. */
  tep: string;
  /** Vừa là `alt` vừa là chú thích dưới ảnh: nói ảnh cho thấy gì. */
  chuThich: string;
};

export type BuocHuongDan = {
  tieuDe: string;
  /** Mỗi phần tử một đoạn. */
  noiDung: string[];
  anh?: AnhHuongDan;
};

export type CauHoiThuong = { hoi: string; traLoi: string };

export type TrangHuongDan = {
  id: string;
  /** Đường dẫn của màn hình trong ứng dụng — có thì bày nút *Mở trang này*. */
  duong?: string;
  ten: string;
  mucDich: string;
  /** Các khối bạn sẽ thấy trên trang. */
  khoi?: string[];
  chiTiet: boolean;
  buoc?: BuocHuongDan[];
  loiThuong?: CauHoiThuong[];
};

export type HuongDanVaiTro = {
  tieuDe: string;
  gioiThieu: string;
  lamGi: string[];
  khongLam: string[];
  /** Một ngày làm việc điển hình, theo thứ tự. */
  ngayLamViec: string[];
  trang: TrangHuongDan[];
};

export type MucChung = { id: string; ten: string; noiDung: string[] };

/** Chín bước của luồng duyệt, dùng cho sơ đồ ở phần chung. */
export const LUONG_DUYET: { ten: string; ai: string }[] = [
  { ten: 'Lập hồ sơ, gửi duyệt', ai: 'Trình dược viên' },
  { ten: 'Ký số duyệt', ai: 'Trưởng bộ phận' },
  { ten: 'Tiếp nhận lần 1, xuất hợp đồng', ai: 'Kế toán' },
  { ten: 'In bản mềm, bàn giao bản cứng', ai: 'Sale Admin' },
  { ten: 'Tiếp nhận lần 2 → có hiệu lực', ai: 'Kế toán' },
];

export const HUONG_DAN_CHUNG: MucChung[] = [
  {
    id: 'dang-nhap',
    ten: 'Đăng nhập và tài khoản',
    noiDung: [
      'Đăng nhập bằng email và mật khẩu, hoặc bấm “Đăng nhập bằng Google” nếu công ty đã bật. Chỉ email đã được Quản trị hệ thống tạo tài khoản mới vào được.',
      'Lần đầu, bạn nhận một thư mời có liên kết kích hoạt: bấm vào đó để tự đặt mật khẩu. Hệ thống không có mật khẩu mặc định.',
      'Quên mật khẩu: bấm “Quên mật khẩu” ở màn hình đăng nhập, nhập email, rồi làm theo thư nhận được.',
      'Đổi mật khẩu hoặc sửa họ tên: bấm tên của bạn ở góc trên bên phải. Họ tên bạn tự sửa được; email và vai trò không tự đổi được. Chỉ Quản trị hệ thống sửa được, và chỉ khi tài khoản chưa kích hoạt.',
      'Để lâu không thao tác, phiên sẽ hết hạn. Ô đăng nhập hiện đè lên màn hình, đăng nhập xong bạn ở nguyên chỗ cũ, những gì đang gõ dở vẫn còn.',
    ],
  },
  {
    id: 'man-hinh',
    ten: 'Làm quen với màn hình',
    noiDung: [
      'Thanh bên trái liệt kê các trang bạn được dùng, tuỳ vai trò. Bấm nút ở đầu thanh để thu gọn thành cột biểu tượng khi cần thêm chỗ cho bảng.',
      'Chuông ở thanh trên báo việc mới: số trên chuông là số việc đang chờ bạn xử lý, dấu chấm nghĩa là có tin để bạn biết. Bấm vào một dòng để mở thẳng hồ sơ liên quan.',
      'Giao diện sáng hoặc tối đổi ở menu tài khoản. Trên điện thoại, thanh bên là ngăn kéo mở bằng nút ba gạch.',
      'Trong hộp thoại, bấm ra ngoài không đóng hộp. Muốn thoát thì bấm Huỷ, nút × hoặc phím Esc, để không mất dở dang những gì đang gõ.',
    ],
  },
  {
    id: 'luong-duyet',
    ten: 'Luồng duyệt một hồ sơ CSBH',
    noiDung: [
      'Hồ sơ Chính sách bán hàng (CSBH) đi qua năm chặng. Mỗi chặng có một người phụ trách, và người ở chặng trước chọn người ở chặng sau.',
      'Sau khi duyệt xong, hồ sơ có hiệu lực không thời hạn. Mỗi khách hàng chỉ có một CSBH hiệu lực; CSBH mới được duyệt xong thì bản cũ hết hiệu lực.',
      'Nếu hồ sơ bị trả lại, nó về tay Trình dược viên kèm lý do. Sửa xong, gửi lại thì hồ sơ đi lại từ đầu vòng duyệt.',
      'Mỗi trạng thái có một màu riêng. Hồ sơ chờ quá 14 ngày sẽ quá hạn và không ai thao tác được nữa.',
    ],
  },
  {
    id: 'loi',
    ten: 'Khi gặp lỗi',
    noiDung: [
      'Lỗi của một thao tác hiện trong hộp thoại hoặc thanh nổi, nói rõ cần sửa gì. Lỗi ở một ô nhập hiện ngay dưới ô đó.',
      'Màn hình không tải được thì có nút “Thử lại”. Nếu vẫn không được, báo cho Quản trị hệ thống kèm giờ xảy ra và việc bạn đang làm.',
      'Nút xám thường là chưa đủ điều kiện, và dòng chữ nhỏ gần nút cho biết còn thiếu gì.',
    ],
  },
];

const ANH = (tep: string, chuThich: string): AnhHuongDan => ({ tep, chuThich });

const TDV: HuongDanVaiTro = {
  tieuDe: 'Hướng dẫn cho Trình dược viên',
  gioiThieu:
    'Bạn là người lập hồ sơ CSBH cho từng khách hàng mình phụ trách. Hồ sơ bạn lập sẽ đi qua luồng duyệt rồi có hiệu lực. Bạn cũng là người sửa lại khi hồ sơ bị trả về.',
  lamGi: [
    'Lập khách hàng mình phụ trách và giữ thông tin của họ luôn đúng.',
    'Lập hồ sơ CSBH: thêm từng dòng sản phẩm, nhập giá bán buôn và các khoản chi phí bán hàng (CPBH).',
    'Chọn Trưởng bộ phận và Kế toán rồi gửi duyệt.',
    'Sửa hồ sơ bị trả về theo lý do rồi gửi lại, hoặc xoá hẳn nếu không làm tiếp.',
    'Lập phiên bản mới khi muốn đổi một CSBH đang có hiệu lực.',
  ],
  khongLam: [
    'Không thấy khách hàng và hồ sơ của Trình dược viên khác.',
    'Không ký duyệt, không xuất hợp đồng và không bàn giao bản cứng. Đó là việc của các vai trò sau.',
    'Không tự nhập được Giá bán Công ty và ngưỡng chiết khấu. Hai con số này lấy từ danh mục sản phẩm.',
  ],
  ngayLamViec: [
    'Mở Tổng quan và đọc khối “Việc của tôi”: hồ sơ Nháp dở dang và hồ sơ bị trả về nằm ở đây.',
    'Sửa các hồ sơ bị trả về theo lý do, rồi gửi lại.',
    'Có khách hàng mới thì lập khách hàng trước, rồi mới lập hồ sơ CSBH cho họ.',
    'Thêm từng dòng sản phẩm vào hồ sơ Nháp, rà tỷ lệ chiết khấu từng dòng, rồi gửi duyệt.',
    'Cuối kỳ, vào Thống kê xem lại kết quả của mình.',
  ],
  trang: [
    {
      id: 'tong-quan',
      duong: '/',
      ten: 'Tổng quan',
      mucDich: 'Màn hình đầu tiên sau đăng nhập. Cho bạn biết hôm nay cần làm gì trước.',
      khoi: [
        'Dải thẻ đếm hồ sơ: Yêu cầu chỉnh sửa, Sắp quá hạn, Quá hạn, Đang chờ, Đang có hiệu lực.',
        'Việc của tôi: hồ sơ đang chờ chính bạn, hạn gần nhất đứng trước.',
        'Yêu cầu cập nhật: hồ sơ có số liệu lệch so với danh mục hiện tại.',
      ],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đọc dải thẻ',
          noiDung: [
            'Mỗi thẻ là một con số. Bấm vào thẻ nào thì mở danh sách hồ sơ đã lọc sẵn đúng bằng con số đó.',
            'Hai thẻ đáng để ý nhất là Sắp quá hạn và Quá hạn. Hồ sơ còn dưới 24 giờ có vạch đỏ ở bên trái.',
          ],
          anh: ANH('tdv/tong-quan.png', 'Trang Tổng quan của Trình dược viên: dải thẻ và khối Việc của tôi.'),
        },
        {
          tieuDe: 'Xử lý “Việc của tôi”',
          noiDung: [
            'Khối này gồm hồ sơ Nháp bạn đang soạn dở và hồ sơ bị trả về chờ bạn sửa, xếp theo hạn gần nhất trước, tối đa 5 hồ sơ mỗi trang.',
            'Không thấy hồ sơ nào nghĩa là bạn không còn việc, không phải hệ thống lỗi.',
          ],
        },
        {
          tieuDe: 'Yêu cầu cập nhật',
          noiDung: [
            'Khi giá hoặc ngưỡng chiết khấu trong danh mục đổi, khối này liệt kê những hồ sơ của bạn đang lệch. Mở hồ sơ để xem chênh lệch và bấm “Tự động cập nhật” nếu muốn lấy số mới.',
          ],
        },
      ],
      loiThuong: [
        {
          hoi: 'Tôi thấy toàn số 0, hồ sơ đâu hết rồi?',
          traLoi: 'Số liệu tính từ bảng tổng hợp và có thể trễ vài giây. Danh sách “Việc của tôi” thì luôn đọc thẳng dữ liệu gốc.',
        },
      ],
    },
    {
      id: 'khach-hang',
      duong: '/khach-hang',
      ten: 'Khách hàng',
      mucDich: 'Lập và giữ thông tin khách hàng. Phải có khách hàng thì mới lập được hồ sơ CSBH cho họ.',
      khoi: [
        'Danh sách khách hàng do bạn phụ trách, tìm theo tên, địa chỉ hoặc mã số thuế.',
        'Thông tin chung: Mã số thuế, địa chỉ, người đại diện, chức danh, điện thoại, công nợ, loại khách hàng.',
        'Địa chỉ giao hàng: khách có thể có nhiều địa chỉ.',
        'Hồ sơ pháp lý: giấy tờ của khách hàng.',
        'Lịch sử CSBH: các hồ sơ đã lập cho khách hàng này.',
      ],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Lập khách hàng mới',
          noiDung: [
            'Vào Khách hàng, bấm nút lập mới rồi điền: mã khách hàng, tên hộ kinh doanh hoặc tên công ty, loại khách hàng, Tỉnh/Thành phố, Số nhà và Phường xã, người đại diện, chức danh, mã số thuế, số điện thoại.',
            'Mã số thuế bắt buộc và không được trùng khách đang hợp tác. Gõ xong phần mềm kiểm ngay, trùng thì báo dưới ô và nút Lưu không bấm được.',
            'Tỉnh/Thành phố là ô chọn trong danh sách 63 đơn vị, theo tên cũ như trên giấy đăng ký kinh doanh. Số điện thoại không bắt buộc, nhưng nếu điền thì phải đủ 10 chữ số.',
            'Chức danh chọn Giám đốc hoặc Chủ hộ kinh doanh. Chức danh khác thì chọn “Khác (tự nhập)” và gõ vào ô hiện ra.',
          ],
          anh: ANH('tdv/khach-hang-danh-sach.png', 'Danh sách khách hàng của Trình dược viên.'),
        },
        {
          tieuDe: 'Nhiều địa chỉ giao hàng',
          noiDung: [
            'Một chủ hộ mở nhiều điểm bán thì khai nhiều địa chỉ giao hàng trên cùng một khách. Địa chỉ đăng ký thì chỉ có một, theo giấy đăng ký kinh doanh.',
          ],
        },
        {
          tieuDe: 'Sửa thông tin khách hàng',
          noiDung: [
            'Chỉ Trình dược viên phụ trách khách đó mới sửa được thông tin của họ.',
            'Mã khách hàng chỉ sửa được khi khách chưa có CSBH đang hiệu lực. Khi đã có thì ô mã xám và ghi rõ mã CSBH đang giữ.',
            'Đổi loại khách hàng được, vì loại quyết định ngưỡng chiết khấu áp dụng cho khách.',
          ],
          anh: ANH('tdv/khach-hang-chi-tiet.png', 'Trang chi tiết một khách hàng.'),
        },
        {
          tieuDe: 'Hồ sơ pháp lý và xoá khách hàng',
          noiDung: [
            'Tải giấy tờ pháp lý của khách lên khối Hồ sơ pháp lý để người duyệt đọc được ngay trên trang hồ sơ CSBH.',
            'Chỉ xoá được khách hàng chưa có hồ sơ CSBH nào. Khách đã có hồ sơ thì chuyển sang ngừng hợp tác.',
          ],
        },
      ],
      loiThuong: [
        {
          hoi: 'Không lưu được vì “giá trị cũ, phải chọn lại” ở ô Tỉnh/Thành phố?',
          traLoi: 'Khách lập từ trước có tên tỉnh không nằm trong danh sách hiện nay. Mở ô chọn, chọn lại đúng tên trong danh sách rồi Lưu.',
        },
        {
          hoi: 'Sao tôi không sửa được mã khách hàng?',
          traLoi: 'Khách đang có CSBH hiệu lực, hoặc bạn không phải Trình dược viên phụ trách khách đó.',
        },
      ],
    },
    {
      id: 'lap-ho-so',
      duong: '/ho-so',
      ten: 'Hồ sơ CSBH: lập và soạn',
      mucDich: 'Lập hồ sơ CSBH cho một khách hàng và thêm từng dòng sản phẩm.',
      khoi: [
        'Thông tin chung của hồ sơ: mã hồ sơ, khách hàng, phiên bản, trạng thái.',
        'Bảng dòng sản phẩm: giá bán buôn, các khoản CPBH, giá thu về, tỷ lệ chiết khấu, ngưỡng.',
        'Bản mềm và File SCAN bản cứng của hồ sơ.',
        'Lịch sử hồ sơ và bình luận.',
      ],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Lập hồ sơ',
          noiDung: [
            'Vào Hồ sơ CSBH, bấm Lập hồ sơ, chọn khách hàng rồi chọn lập mới hay lập phiên bản mới.',
            'Mã hồ sơ đã được điền sẵn một mã đề xuất; cứ để nguyên nếu bạn không cần mã riêng. Mã không được trùng và không dùng các ký tự \\ / : * ? < > | vì mã trở thành tên tệp khi tải bản mềm.',
            'Mỗi khách chỉ có một hồ sơ đang xử lý. Khách đã có hồ sơ Nháp hoặc hồ sơ đang đi luồng duyệt thì phần mềm không cho lập thêm, và có nút mở thẳng hồ sơ đó.',
          ],
          anh: ANH('tdv/lap-ho-so.png', 'Màn hình chọn khách hàng để lập hồ sơ.'),
        },
        {
          tieuDe: 'Thêm một dòng sản phẩm',
          noiDung: [
            'Trên trang hồ sơ, bấm Thêm sản phẩm. Chọn sản phẩm rồi nhập Giá bán buôn và các khoản CPBH. Giá bán Công ty hiện ngay trên ô giá bán buôn để bạn đối chiếu.',
            'Bốn con số CPBH, Giá thu về, Tỷ lệ CK và QĐCK hiện ngay trong hộp thoại, trước khi bạn bấm Xác nhận. Đó chính là những con số sẽ nằm trong bảng.',
            'Gõ số tiền thì gõ số trần, ví dụ 1000000. Dòng nhỏ dưới ô sẽ cho bạn thấy số đã phân nhóm (1.000.000) để soát số 0.',
            'Số khoản CPBH tuỳ dòng: bấm “Thêm khoản chi phí” để có thêm ô, “Bớt” để bỏ. Mỗi khoản có thể ghi thêm một câu Nội dung ngắn, khi đó cạnh con số trên bảng có dấu ? để người duyệt đọc.',
            'Ngày áp dụng gõ theo dd/mm/yyyy, gõ tám chữ số liền, ví dụ 20092026. Ngày áp dụng thuộc về từng dòng sản phẩm, và quyết định bảng giá dùng cho chính dòng đó.',
          ],
          anh: ANH('tdv/them-dong-san-pham.png', 'Hộp thoại thêm dòng sản phẩm với bốn con số tính sẵn.'),
        },
        {
          tieuDe: 'Đọc bảng dòng sản phẩm',
          noiDung: [
            'Tỷ lệ chiết khấu đỏ nghĩa là vượt ngưỡng. Màu này chỉ đánh dấu để người duyệt nhìn thấy, không chặn bạn gửi.',
            'Mỗi dòng có một nhãn trạng thái: Bổ sung (mặt hàng mới), Đang áp dụng (giữ nguyên so với bản trước), Chỉnh sửa (đã đổi so với bản trước). Dòng chỉnh sửa có dấu tam giác cạnh giá trị đã đổi: xanh hướng lên là tăng, đỏ hướng xuống là giảm, rê chuột để xem giá trị cũ.',
            'Nút Sửa và Xoá ở cuối mỗi dòng. Sản phẩm của một dòng không đổi được: muốn đổi thì xoá dòng rồi thêm dòng mới.',
          ],
          anh: ANH('tdv/bang-san-pham.png', 'Bảng dòng sản phẩm với tỷ lệ chiết khấu và nhãn trạng thái.'),
        },
        {
          tieuDe: 'Số liệu lệch so với danh mục',
          noiDung: [
            'Hồ sơ Nháp không tự đổi số sau lưng bạn. Nếu giá hoặc ngưỡng trong danh mục đổi, một khối cảnh báo hiện ngay trên bảng với nút “Tự động cập nhật”. Bấm là lấy số mới, không bấm thì thôi.',
            'Dù bạn có bấm hay không, lúc gửi duyệt hệ thống vẫn lấy lại số lần cuối rồi mới đóng băng, nên hồ sơ không bao giờ vào luồng duyệt với số cũ.',
          ],
        },
        {
          tieuDe: 'Lập phiên bản mới',
          noiDung: [
            'Mở một CSBH đang có hiệu lực của khách bạn phụ trách và bấm “Lập phiên bản mới”. Bản mới chép sẵn toàn bộ sản phẩm của bản hiện tại, bạn chỉ sửa phần cần đổi.',
            'Rút một mặt hàng khỏi phiên bản mới bằng cách xoá dòng. Dòng đó mờ đi và được đánh dấu đã xoá cho người duyệt thấy, chỉ mất hẳn khi hồ sơ có hiệu lực.',
            'CSBH hiện tại vẫn có hiệu lực cho tới khi bản mới được duyệt xong.',
          ],
        },
      ],
      loiThuong: [
        {
          hoi: 'Vì sao nút Lập phiên bản mới mở ra một hộp thoại nói khách đã có hồ sơ?',
          traLoi: 'Khách đó đang có một hồ sơ chưa duyệt xong. Dùng nút trong hộp thoại để mở hồ sơ ấy rồi làm tiếp, không lập thêm bản thứ hai.',
        },
        {
          hoi: 'Vì sao nút Lưu dòng bị xám?',
          traLoi: 'Thường là ngày áp dụng không có thật (ví dụ 31/02) hoặc thiếu sản phẩm, giá bán buôn. Chữ đỏ dưới ô nói rõ ô nào.',
        },
      ],
    },
    {
      id: 'gui-duyet',
      duong: '/ho-so',
      ten: 'Gửi duyệt, bị trả về và xoá hồ sơ',
      mucDich: 'Đưa hồ sơ vào luồng duyệt, rồi xử lý khi hồ sơ bị trả về.',
      khoi: [
        'Dải nút thao tác ở đầu trang hồ sơ.',
        'Lý do gần nhất: ai trả về, từ bước nào, vì sao.',
        'Tiến trình duyệt: hồ sơ đã qua những bước nào.',
      ],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Gửi duyệt',
          noiDung: [
            'Bấm Gửi duyệt ở đầu trang hồ sơ. Hộp thoại mở ra để bạn chọn hai người: Trưởng bộ phận duyệt (người sẽ ký số) và Kế toán tiếp nhận (nhận cả lần 1 và lần 2).',
            'Chỉ người bạn chọn mới thấy hồ sơ này trong hộp việc của họ. Nút Xác nhận chỉ bấm được khi đã chọn đủ cả hai.',
            'Gửi xong hồ sơ rời trạng thái Nháp, và bạn không sửa được nữa cho tới khi nó bị trả về.',
          ],
          anh: ANH('tdv/gui-duyet.png', 'Hộp thoại gửi duyệt với hai ô chọn người.'),
        },
        {
          tieuDe: 'Theo dõi hồ sơ đã gửi',
          noiDung: [
            'Khối Tiến trình duyệt cho biết hồ sơ đã qua những bước nào và đang ở đâu. Mỗi lần hồ sơ đổi trạng thái, người liên quan nhận thư và thông báo.',
            'Có chuyện cần hỏi người duyệt thì viết ở khối Bình luận trên hồ sơ. Bạn có thể nhắc tên họ để họ nhận thông báo.',
          ],
        },
        {
          tieuDe: 'Khi hồ sơ bị trả về',
          noiDung: [
            'Hồ sơ về trạng thái Yêu cầu chỉnh sửa kèm khối Lý do gần nhất: ai trả về, từ bước nào, lúc nào và vì sao.',
            'Sửa hồ sơ theo lý do rồi gửi lại chính hồ sơ ấy, không lập thêm một bản bên cạnh. Lần này bạn không phải chọn lại người duyệt.',
            'Không làm tiếp nữa thì xoá hồ sơ. Chỉ hồ sơ đang Nháp hoặc Yêu cầu chỉnh sửa mới xoá được; hồ sơ Đã xoá không ai khôi phục được.',
          ],
          anh: ANH('tdv/bi-tra-ve.png', 'Hồ sơ bị trả về với khối Lý do gần nhất.'),
        },
      ],
      loiThuong: [
        {
          hoi: 'Gửi duyệt báo có dòng không lấy được giá?',
          traLoi: 'Sản phẩm đã bị vô hiệu hoá hoặc chưa có giá tại ngày áp dụng của dòng. Phần mềm nói rõ sản phẩm nào: xoá dòng đó, hoặc sửa ngày áp dụng của chính dòng, rồi gửi lại.',
        },
        {
          hoi: 'Sao tôi không thấy hồ sơ mình vừa gửi ở “Việc của tôi”?',
          traLoi: 'Hồ sơ đang nằm ở người duyệt, không còn là việc của bạn. Tìm nó ở Hồ sơ CSBH.',
        },
      ],
    },
    {
      id: 'danh-sach-ho-so',
      duong: '/ho-so',
      ten: 'Hồ sơ CSBH: tìm và lọc',
      mucDich: 'Tìm lại bất kỳ hồ sơ nào trong phạm vi của bạn.',
      khoi: [
        'Hai cách xem: Kanban theo trạng thái, hoặc Bảng.',
        'Bộ lọc 9 tiêu chí kết hợp được với nhau.',
      ],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Kanban và Bảng',
          noiDung: [
            'Trang mở ở dạng Kanban: mỗi trạng thái một cột, xếp theo thứ tự luồng duyệt. Cột tô viền xanh là việc của bạn. Cột không có hồ sơ thì ẩn.',
            'Nút Kanban | Bảng ở góc trên đổi sang dạng bảng. Phần mềm nhớ lựa chọn của bạn trên máy này. Kanban không kéo thả: đổi trạng thái hồ sơ bằng nút trên trang hồ sơ.',
          ],
          anh: ANH('tdv/ho-so-kanban.png', 'Danh sách hồ sơ dạng Kanban.'),
        },
        {
          tieuDe: 'Dùng bộ lọc',
          noiDung: [
            'Bộ lọc gồm: khoảng ngày áp dụng, khoảng ngày duyệt, mã khách hàng, tên khách hàng, tên sản phẩm, nhóm sản phẩm, trạng thái và hạn xử lý. Các ô có chữ “chọn nhiều” cho chọn cùng lúc nhiều giá trị.',
            'Bộ lọc áp cho mọi cột Kanban. Lọc theo Trạng thái thì chỉ còn các cột được chọn.',
          ],
        },
      ],
    },
    {
      id: 'san-pham-chiet-khau',
      duong: '/san-pham',
      ten: 'Sản phẩm và Chiết khấu',
      mucDich: 'Tra giá bán Công ty, ngưỡng và quy định chiết khấu khi lập hồ sơ.',
      khoi: ['Danh mục sản phẩm kèm giá hiện hành và lịch sử giá.', 'Quy định chiết khấu theo nhóm sản phẩm và loại khách hàng.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Tra khi lập hồ sơ',
          noiDung: [
            'Hai trang này chỉ để xem. Bạn tra giá bán Công ty của sản phẩm và ngưỡng chiết khấu áp cho từng loại khách hàng. Muốn đổi danh mục thì nhờ Quản trị hệ thống.',
            'Lịch sử giá cho biết giá đã đổi lúc nào; nhãn Đang áp dụng đánh dấu dòng giá hiện hành.',
          ],
          anh: ANH('tdv/san-pham.png', 'Trang Sản phẩm.'),
        },
      ],
    },
    {
      id: 'thong-ke',
      duong: '/thong-ke',
      ten: 'Thống kê',
      mucDich: 'Nhìn lại kết quả làm việc của bạn theo kỳ.',
      khoi: ['Các biểu đồ theo tuần, tháng, quý, năm.', 'Nút xuất Excel.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đọc biểu đồ',
          noiDung: [
            'Chọn kỳ ở đầu trang. Kỳ đang chạy chỉ so với cùng số ngày của kỳ trước, nên con số so sánh công bằng.',
            'Thống kê nói về dòng chảy trong kỳ, khác với Tổng quan nói về những gì đang tồn tại ngay lúc này. Bạn chỉ thấy số liệu của chính mình.',
          ],
          anh: ANH('tdv/thong-ke.png', 'Trang Thống kê của Trình dược viên.'),
        },
      ],
    },
  ],
};

/** Khung cho các vai trò chưa viết từng bước — xem ghi chú đầu tệp. */
const trangChuaViet = (id: string, ten: string, mucDich: string, duong: string): TrangHuongDan => ({
  id,
  duong,
  ten,
  mucDich,
  chiTiet: false,
});

const TBP: HuongDanVaiTro = {
  tieuDe: 'Hướng dẫn cho Trưởng bộ phận',
  gioiThieu:
    'Bạn là người ký số duyệt hồ sơ CSBH mà Trình dược viên gửi lên. Với mỗi hồ sơ, bạn chỉ có hai lựa chọn: ký, hoặc trả lại kèm lý do để Trình dược viên chỉnh sửa. Sau khi ký, bạn vẫn có thể rút lại chữ ký nếu phát hiện vấn đề.',
  lamGi: [
    'Ký số duyệt các hồ sơ do Trình dược viên chọn gửi tới bạn.',
    'Trả lại hồ sơ kèm lý do để Trình dược viên chỉnh sửa.',
    'Hoàn duyệt: rút lại chữ ký của chính mình ở các bước sau khi đã ký.',
    'Theo dõi kết quả làm việc của từng Trình dược viên trong Thống kê.',
    'Đọc và viết bình luận trên hồ sơ để hỏi hoặc trao đổi.',
  ],
  khongLam: [
    'Không lập hồ sơ và không sửa nội dung hồ sơ. Muốn đổi gì thì trả lại để Trình dược viên sửa.',
    'Không xuất hợp đồng, không bàn giao bản cứng. Đó là việc của Kế toán và Sale Admin.',
    'Không sửa thông tin khách hàng, chỉ Trình dược viên phụ trách mới sửa được.',
    'Chỉ thấy hồ sơ được chọn gửi tới bạn. Trưởng bộ phận khác không thấy và không mở được hồ sơ của bạn.',
  ],
  ngayLamViec: [
    'Mở Tổng quan và đọc khối “Việc của tôi”: hồ sơ nào hạn gần nhất thì xử lý trước.',
    'Mở từng hồ sơ chờ bạn, đọc thông tin khách hàng và bảng dòng sản phẩm, chú ý dòng đỏ và dòng đã thay đổi.',
    'Ký số duyệt nếu ổn; nếu chưa ổn thì trả lại, ghi lý do đủ rõ để Trình dược viên sửa một lần là xong.',
    'Nếu sau khi ký bạn thấy cần xem lại, dùng Hoàn duyệt (chỉ khi hồ sơ chưa có hiệu lực).',
    'Cuối tuần, vào Thống kê xem tốc độ duyệt và chất lượng hồ sơ của từng Trình dược viên.',
  ],
  trang: [
    {
      id: 'tong-quan',
      duong: '/',
      ten: 'Tổng quan',
      mucDich: 'Cho bạn biết hồ sơ nào đang chờ bạn ký và hồ sơ nào sắp quá hạn.',
      khoi: [
        'Dải thẻ: Chờ TBP duyệt, Sắp quá hạn, Quá hạn, Đang chờ, Đang có hiệu lực.',
        'Việc của tôi: hồ sơ đang chờ chính bạn ký, hạn gần nhất đứng trước.',
        'Bảng hồ sơ theo từng Trình dược viên, ở cuối trang.',
      ],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đọc dải thẻ',
          noiDung: [
            'Thẻ “Chờ TBP duyệt” là số hồ sơ đang chờ bạn ký. Bấm vào thẻ nào thì mở danh sách hồ sơ đã lọc sẵn đúng bằng con số đó.',
            'Hồ sơ chờ lâu sẽ quá hạn: mỗi bước có hạn 14 ngày, tính cả cuối tuần. Hồ sơ còn dưới 24 giờ có vạch đỏ ở bên trái và nằm ở thẻ “Sắp quá hạn”.',
          ],
          anh: ANH('tbp/tong-quan.png', 'Trang Tổng quan của Trưởng bộ phận.'),
        },
        {
          tieuDe: 'Xử lý “Việc của tôi”',
          noiDung: [
            'Khối này chỉ gồm hồ sơ đang chờ bạn, xếp theo hạn gần nhất trước, tối đa 5 hồ sơ mỗi trang. Bấm vào một dòng để mở hồ sơ.',
            'Không thấy hồ sơ nào nghĩa là bạn không còn việc, không phải hệ thống lỗi.',
          ],
        },
        {
          tieuDe: 'Xem từng Trình dược viên',
          noiDung: [
            'Bảng ở cuối trang đếm hồ sơ theo từng Trình dược viên. Bấm một dòng để mở đúng danh sách hồ sơ của người đó.',
          ],
        },
      ],
      loiThuong: [
        {
          hoi: 'Có hồ sơ của Trình dược viên mà tôi không thấy trong danh sách?',
          traLoi: 'Hồ sơ chỉ nằm ở bàn bạn khi Trình dược viên chọn đúng tên bạn lúc gửi duyệt. Nếu họ chọn nhầm người, nhờ họ báo lại để gửi lại cho đúng.',
        },
      ],
    },
    {
      id: 'khach-hang',
      duong: '/khach-hang',
      ten: 'Khách hàng',
      mucDich: 'Tra cứu thông tin khách hàng của hồ sơ bạn đang duyệt. Bạn chỉ xem, không sửa.',
      khoi: ['Danh sách khách hàng, tìm theo tên, địa chỉ hoặc mã số thuế.', 'Chi tiết khách hàng, hồ sơ pháp lý và lịch sử các CSBH đã lập.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Tra cứu khách hàng',
          noiDung: [
            'Trong hồ sơ đang duyệt, bấm vào Mã khách hàng để mở trang khách hàng. Ở đó bạn xem được hồ sơ pháp lý và lịch sử các CSBH trước đây của khách.',
            'Chỉ Trình dược viên phụ trách mới sửa được thông tin khách hàng. Thấy thông tin sai thì trả lại hồ sơ kèm lý do để họ sửa.',
          ],
          anh: ANH('tbp/khach-hang.png', 'Danh sách khách hàng của Trưởng bộ phận.'),
        },
      ],
    },
    {
      id: 'danh-sach-ho-so',
      duong: '/ho-so',
      ten: 'Hồ sơ CSBH: danh sách',
      mucDich: 'Nhìn toàn bộ hồ sơ theo trạng thái, và tìm lại bất kỳ hồ sơ nào trong phạm vi của bạn.',
      khoi: ['Kanban theo trạng thái, hoặc dạng Bảng.', 'Bộ lọc và nút Xuất Excel.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đọc bảng Kanban',
          noiDung: [
            'Mỗi trạng thái một cột, theo đúng thứ tự luồng duyệt. Cột tô viền xanh “Việc của bạn” là Chờ TBP duyệt: hồ sơ đang chờ bạn.',
            'Các cột khác để bạn theo dõi hồ sơ đã ký đi tới đâu. Cột nào không có hồ sơ thì ẩn. Bấm nút gập ở đầu cột để thu gọn cột đó.',
            'Nút Kanban | Bảng đổi sang dạng bảng. Kanban không kéo thả: đổi trạng thái hồ sơ bằng nút trên trang hồ sơ.',
          ],
          anh: ANH('tbp/ho-so-kanban.png', 'Danh sách hồ sơ dạng Kanban, cột Chờ TBP duyệt là việc của bạn.'),
        },
        {
          tieuDe: 'Lọc và xuất Excel',
          noiDung: [
            'Bộ lọc có 9 tiêu chí kết hợp được với nhau: ngày áp dụng, ngày duyệt, mã và tên khách hàng, tên và nhóm sản phẩm, Trình dược viên phụ trách, trạng thái, hạn xử lý. Điều kiện lọc được giữ trong phiên làm việc, bấm “Xoá bộ lọc” để về danh sách đầy đủ.',
            'Nút Xuất Excel xuất đúng danh sách đang lọc.',
          ],
        },
      ],
    },
    {
      id: 'duyet-ho-so',
      duong: '/ho-so',
      ten: 'Duyệt một hồ sơ',
      mucDich: 'Đọc hồ sơ Trình dược viên gửi lên và quyết định ký hay trả lại.',
      khoi: [
        'Thông tin chung: khách hàng, người đề nghị, phiên bản.',
        'Tiến trình duyệt: hồ sơ đã qua những bước nào.',
        'Bảng dòng sản phẩm.',
        'Bản mềm và bản cứng của phiên bản trước, chỉ để đối chiếu.',
        'Bình luận và Lịch sử.',
      ],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đọc thông tin chung',
          noiDung: [
            'Phần đầu cho biết hồ sơ thuộc khách hàng nào, ai đề nghị và phiên bản thứ mấy. Tên khách hàng, địa chỉ và công nợ ở đây là thông tin lúc Trình dược viên gửi duyệt, không đổi theo hôm nay, đúng như sẽ in trên tờ giấy khách ký.',
            'Hai nút Ký số duyệt và Trả lại chỉnh sửa nằm ở góc trên bên phải. Chúng chỉ hiện khi hồ sơ đang chờ bạn.',
            'Khối Tiến trình duyệt bên phải cho biết hồ sơ đã qua những bước nào, ai làm và lúc nào.',
          ],
          anh: ANH('tbp/duyet-ho-so.png', 'Hồ sơ đang chờ Trưởng bộ phận duyệt, với hai nút Ký số duyệt và Trả lại chỉnh sửa.'),
        },
        {
          tieuDe: 'Rà bảng dòng sản phẩm',
          noiDung: [
            'Tỷ lệ chiết khấu màu đỏ nghĩa là vượt ngưỡng chiết khấu của quy định. Màu này chỉ để bạn nhìn thấy, hệ thống không chặn. Rê chuột vào dấu ? ở cột QĐCK để xem quy định đang áp dụng.',
            'Nhãn Trạng thái cho biết dòng so với phiên bản trước: Bổ sung (mặt hàng mới), Đang áp dụng (giữ nguyên) hoặc Chỉnh sửa (đã đổi). Dòng Chỉnh sửa có dấu tam giác cạnh giá trị đã đổi: xanh hướng lên là tăng, đỏ hướng xuống là giảm, rê chuột để xem giá trị cũ. Cột Tỷ lệ CK cũ cho bạn so ngay.',
            'Dòng bị mờ và ghi Đã xoá là mặt hàng Trình dược viên rút khỏi phiên bản mới. Mặt hàng ấy sẽ không còn trong CSBH khi hồ sơ có hiệu lực.',
          ],
          anh: ANH('tbp/bang-san-pham.png', 'Bảng dòng sản phẩm với nhãn trạng thái và dấu tam giác chênh lệch.'),
        },
        {
          tieuDe: 'Đối chiếu với phiên bản trước',
          noiDung: [
            'Nếu hồ sơ thay thế một CSBH cũ, khối “Bản mềm và bản cứng của phiên bản trước” cho bạn xem và tải bản mềm, bản cứng của phiên bản đó để đối chiếu. Khối này chỉ đọc.',
          ],
        },
        {
          tieuDe: 'Ký số duyệt',
          noiDung: [
            'Bấm Ký số duyệt, hộp thoại hỏi “Xác nhận thực hiện thao tác này?”, bấm Xác nhận. Hồ sơ sang bước Chờ KT duyệt L1 và Kế toán được chọn nhận thư báo.',
            'Từ đây bạn không phải làm gì thêm. Hợp đồng do Kế toán hoặc Sale Admin xuất, bạn không tham gia các bước sau.',
          ],
          anh: ANH('tbp/ky-so.png', 'Hộp thoại xác nhận khi bấm Ký số duyệt.'),
        },
        {
          tieuDe: 'Trả lại chỉnh sửa',
          noiDung: [
            'Bấm Trả lại chỉnh sửa và nhập lý do. Lý do bắt buộc, nên viết đủ rõ: sai ở đâu, cần sửa gì. Trình dược viên sẽ đọc đúng câu này ở khối “Lý do gần nhất”.',
            'Hồ sơ về trạng thái Yêu cầu chỉnh sửa. Trình dược viên sửa xong sẽ gửi lại chính hồ sơ ấy, và nó trở về bàn bạn, không phải chọn lại người duyệt.',
            'Hệ thống không có nút Từ chối. Nếu hồ sơ không làm tiếp, Trình dược viên sẽ tự xoá nó sau khi bị trả lại.',
          ],
          anh: ANH('tbp/tra-lai.png', 'Hộp thoại Trả lại chỉnh sửa, bắt buộc nhập lý do.'),
        },
        {
          tieuDe: 'Hoàn duyệt: rút lại chữ ký',
          noiDung: [
            'Nếu sau khi ký bạn phát hiện vấn đề, mở lại hồ sơ và bấm Hoàn duyệt. Việc này làm được ở các bước sau chữ ký: Chờ KT duyệt L1, Sale Admin đang xử lý, Sale Admin sửa bản cứng và KT duyệt bản cứng. Lý do bắt buộc.',
            'Hồ sơ về Yêu cầu chỉnh sửa, chữ ký của bạn bị xoá và vòng duyệt đi lại từ đầu. Trình dược viên, Kế toán và Sale Admin đều được báo, vì hồ sơ đang nằm trên bàn của người khác.',
            'Ở bước Chờ TBP duyệt thì không có nút này, vì đã có Trả lại chỉnh sửa. Hồ sơ đã có hiệu lực cũng không hoàn duyệt được: muốn đổi, Trình dược viên lập phiên bản mới.',
          ],
          anh: ANH('tbp/hoan-duyet.png', 'Hộp thoại Hoàn duyệt trên hồ sơ đã ký.'),
        },
      ],
      loiThuong: [
        {
          hoi: 'Tôi mở hồ sơ mà không thấy nút Ký số duyệt?',
          traLoi: 'Hồ sơ không còn ở bước chờ bạn (đã ký, đã trả lại, hoặc quá hạn). Nút chỉ hiện đúng việc bạn làm được ở bước hiện tại. Hồ sơ quá hạn thì không còn nút nào.',
        },
        {
          hoi: 'Tôi ký nhầm hồ sơ, làm sao?',
          traLoi: 'Nếu hồ sơ chưa có hiệu lực, dùng Hoàn duyệt kèm lý do để rút chữ ký. Hồ sơ sẽ về Trình dược viên để làm lại từ đầu.',
        },
        {
          hoi: 'Hồ sơ chờ quá hạn thì sao?',
          traLoi: 'Hồ sơ quá 14 ngày ở một bước sẽ chuyển Quá hạn duyệt, không ai thao tác được nữa, và sau 3 ngày tự chuyển Đã xoá. Hãy xử lý hồ sơ có vạch đỏ trước.',
        },
      ],
    },
    {
      id: 'binh-luan',
      duong: '/ho-so',
      ten: 'Bình luận trên hồ sơ',
      mucDich: 'Hỏi và trao đổi với những người cùng làm trên hồ sơ, ngay trên chính hồ sơ.',
      khoi: ['Khối Bình luận nằm ngay trên Lịch sử, ở cuối trang hồ sơ.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Viết và nhắc tên',
          noiDung: [
            'Gõ vào ô ở cuối khối rồi nhấn Enter (hoặc bấm Gửi). Shift + Enter để xuống dòng. Trên điện thoại, Enter là xuống dòng, hãy bấm nút Gửi.',
            'Gõ @ rồi vài chữ của tên hoặc email để nhắc một người đứng tên trên hồ sơ. Người được nhắc nhận thông báo trên chuông.',
            'Có thể trả lời một bình luận, thả cảm xúc, và đính kèm ảnh, PDF, Word, Excel (tối đa 5 tệp, mỗi tệp 10MB).',
            'Bạn sửa và xoá được bình luận của chính mình qua nút ⋯. Không ai sửa hay xoá được bình luận của người khác.',
          ],
          anh: ANH('tbp/binh-luan.png', 'Khối Bình luận ở cuối trang hồ sơ.'),
        },
      ],
      loiThuong: [
        {
          hoi: 'Bình luận của phiên bản cũ đâu rồi?',
          traLoi: 'Mỗi phiên bản có luồng bình luận riêng. Phiên bản mới bắt đầu với luồng trống; luồng của bản cũ vẫn đọc được khi mở bản cũ.',
        },
      ],
    },
    {
      id: 'san-pham-chiet-khau',
      duong: '/san-pham',
      ten: 'Sản phẩm và Chiết khấu',
      mucDich: 'Tra giá bán Công ty và quy định chiết khấu để đối chiếu khi duyệt.',
      khoi: ['Danh mục sản phẩm, giá hiện hành và lịch sử giá.', 'Quy định chiết khấu theo nhóm sản phẩm và loại khách hàng.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Tra khi duyệt',
          noiDung: [
            'Hai trang này chỉ để xem. Khi một dòng vượt ngưỡng, bạn mở Chiết khấu để đọc quy định đang áp dụng cho nhóm sản phẩm và loại khách hàng đó.',
            'Muốn đổi danh mục hoặc quy định thì nhờ Quản trị hệ thống.',
          ],
        },
      ],
    },
    {
      id: 'thong-ke',
      duong: '/thong-ke',
      ten: 'Thống kê',
      mucDich: 'Nhìn lại tốc độ duyệt và chất lượng hồ sơ của từng Trình dược viên theo kỳ.',
      khoi: ['Các biểu đồ theo tuần, tháng, quý, năm.', 'Theo dõi từng Trình dược viên: xếp hạng, cơ cấu chất lượng, số ngày sửa lại.', 'Nút xuất Excel.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Chọn kỳ và đọc biểu đồ',
          noiDung: [
            'Bốn nút Tuần, Tháng, Quý, Năm ở đầu trang. Trưởng bộ phận mở lên theo tuần. Kỳ đang chạy chưa đủ ngày nên điểm cuối luôn thấp hơn thực tế, và được tô nhạt hơn.',
            'Muốn biết một chỉ số tính theo mốc nào thì mở khối “Cách tính” ở cuối trang. Các chỉ số đo việc chạy hồ sơ CSBH, không đo doanh số bán hàng.',
          ],
          anh: ANH('tbp/thong-ke.png', 'Trang Thống kê của Trưởng bộ phận.'),
        },
        {
          tieuDe: 'Theo dõi từng Trình dược viên',
          noiDung: [
            'Bảng xếp hạng liệt kê từng người đã gửi hồ sơ tới bạn: số hồ sơ, nhãn xu hướng và đường nhỏ sáu kỳ gần nhất. Bấm một dòng để lọc cả màn hình theo người đó, bấm lại để bỏ chọn.',
            'Cơ cấu chất lượng cho thấy với mỗi người bao nhiêu phần trăm hồ sơ ký thẳng, bị trả lại một lần hay từ hai lần. Số ngày sửa lại là quãng từ lúc bạn trả lại tới lúc họ gửi lại, quãng này ăn vào hạn 14 ngày của hồ sơ.',
          ],
        },
      ],
    },
  ],
};

const KE_TOAN: HuongDanVaiTro = {
  tieuDe: 'Hướng dẫn cho Kế toán',
  gioiThieu:
    'Bạn tiếp nhận hồ sơ CSBH hai lần: lần 1 sau khi Trưởng bộ phận ký, lần 2 khi bản cứng đã ký được bàn giao. Bạn cũng là người xuất hợp đồng, và có thể bắt in lại bản cứng nếu bản giấy có lỗi. CSBH có hiệu lực đúng lúc bạn tiếp nhận lần 2.',
  lamGi: [
    'Tiếp nhận lần 1: kiểm tra hồ sơ sau khi Trưởng bộ phận ký, chọn Sale Admin xử lý tiếp.',
    'Xuất hợp đồng bằng mẫu hợp đồng của công ty.',
    'Tiếp nhận lần 2: đối chiếu bản cứng đã ký với bản mềm, rồi cho CSBH có hiệu lực.',
    'Trả lại hồ sơ kèm lý do ở lần 1 hoặc lần 2, hoặc yêu cầu Sale Admin in lại bản cứng.',
    'Đọc và viết bình luận trên hồ sơ để hỏi hoặc trao đổi.',
  ],
  khongLam: [
    'Không lập hồ sơ, không sửa nội dung hồ sơ và không sửa thông tin khách hàng. Muốn đổi gì thì trả lại để Trình dược viên sửa.',
    'Không ký số duyệt. Đó là việc của Trưởng bộ phận.',
    'Chỉ thấy hồ sơ đã từng tới bàn bạn, tức sau khi Trưởng bộ phận đã ký. Hồ sơ còn đang chờ Trưởng bộ phận chưa hiện trong danh sách của bạn.',
  ],
  ngayLamViec: [
    'Mở Tổng quan và đọc khối “Việc của tôi”: cả hồ sơ chờ tiếp nhận lần 1 lẫn lần 2 nằm chung một danh sách, hạn gần nhất đứng trước.',
    'Hồ sơ vừa được Trưởng bộ phận ký: đọc rồi Tiếp nhận lần 1, hoặc Trả lại kèm lý do.',
    'Xuất hợp đồng khi cần, từ sau tiếp nhận lần 1.',
    'Khi Sale Admin bàn giao bản cứng: đối chiếu bản cứng với bản mềm và file scan, rồi Tiếp nhận lần 2, hoặc Trả lại, hoặc Yêu cầu in lại.',
    'Cuối tuần, vào Thống kê xem lại số liệu theo kỳ.',
  ],
  trang: [
    {
      id: 'tong-quan',
      duong: '/',
      ten: 'Tổng quan',
      mucDich: 'Cho bạn biết hồ sơ nào đang chờ bạn tiếp nhận và hồ sơ nào sắp quá hạn.',
      khoi: [
        'Dải thẻ: Chờ KT duyệt L1, KT duyệt bản cứng, Sắp quá hạn, Quá hạn, Đang chờ, Đang có hiệu lực.',
        'Việc của tôi: một danh sách duy nhất gồm cả lần 1 và lần 2.',
        'Bảng hồ sơ theo từng Trình dược viên, ở cuối trang.',
      ],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đọc dải thẻ',
          noiDung: [
            'Thẻ “Chờ KT duyệt L1” là hồ sơ chờ bạn tiếp nhận lần 1, thẻ “KT duyệt bản cứng” là hồ sơ chờ bạn tiếp nhận lần 2. Bấm vào thẻ nào thì mở danh sách hồ sơ đã lọc sẵn đúng bằng con số đó.',
            'Mỗi bước có hạn 14 ngày, tính cả cuối tuần. Hồ sơ còn dưới 24 giờ có vạch đỏ ở bên trái và nằm ở thẻ “Sắp quá hạn”.',
          ],
          anh: ANH('ke-toan/tong-quan.png', 'Trang Tổng quan của Kế toán.'),
        },
        {
          tieuDe: 'Xử lý “Việc của tôi”',
          noiDung: [
            'Cả hồ sơ lần 1 và lần 2 xếp chung một danh sách, theo hạn gần nhất trước, nên việc gấp nhất luôn ở đầu dù thuộc lần nào. Mỗi dòng có nhãn trạng thái có màu riêng để bạn biết ngay đó là lần nào.',
            'Mỗi trang tối đa 5 hồ sơ. Không thấy hồ sơ nào nghĩa là bạn không còn việc, không phải hệ thống lỗi.',
          ],
        },
        {
          tieuDe: 'Xem từng Trình dược viên',
          noiDung: [
            'Bảng ở cuối trang đếm hồ sơ theo từng Trình dược viên. Bấm một dòng để mở đúng danh sách hồ sơ của người đó.',
          ],
        },
      ],
      loiThuong: [
        {
          hoi: 'Tôi biết có hồ sơ vừa gửi duyệt nhưng không thấy trong danh sách của mình?',
          traLoi: 'Hồ sơ chỉ hiện với Kế toán sau khi Trưởng bộ phận đã ký, dù tên bạn đã được chọn từ lúc gửi duyệt. Khi Trưởng bộ phận trả hồ sơ về Trình dược viên thì bạn cũng không thấy nó.',
        },
      ],
    },
    {
      id: 'khach-hang',
      duong: '/khach-hang',
      ten: 'Khách hàng',
      mucDich: 'Tra cứu thông tin khách hàng của hồ sơ bạn đang tiếp nhận. Bạn chỉ xem, không sửa.',
      khoi: ['Danh sách khách hàng, tìm theo tên, địa chỉ hoặc mã số thuế.', 'Chi tiết khách hàng, hồ sơ pháp lý và lịch sử các CSBH đã lập.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Tra cứu khách hàng',
          noiDung: [
            'Trong hồ sơ, bấm vào Mã khách hàng để mở trang khách hàng. Ở đó bạn xem được hồ sơ pháp lý, công nợ và lịch sử các CSBH trước đây của khách.',
            'Chỉ Trình dược viên phụ trách mới sửa được thông tin khách hàng. Thấy thông tin sai thì trả lại hồ sơ kèm lý do để họ sửa.',
          ],
          anh: ANH('ke-toan/khach-hang.png', 'Danh sách khách hàng của Kế toán.'),
        },
      ],
    },
    {
      id: 'danh-sach-ho-so',
      duong: '/ho-so',
      ten: 'Hồ sơ CSBH: danh sách',
      mucDich: 'Nhìn các hồ sơ đã tới bàn bạn theo trạng thái, và tìm lại bất kỳ hồ sơ nào.',
      khoi: ['Kanban theo trạng thái, hoặc dạng Bảng.', 'Bộ lọc và nút Xuất Excel.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đọc bảng Kanban',
          noiDung: [
            'Mỗi trạng thái một cột, theo đúng thứ tự luồng duyệt. Hai cột tô viền xanh “Việc của bạn” là Chờ KT duyệt L1 và KT duyệt bản cứng.',
            'Các cột còn lại để bạn theo dõi hồ sơ đi tới đâu, ví dụ Sale Admin đang xử lý hay Sale Admin sửa bản cứng. Cột nào không có hồ sơ thì ẩn. Bấm nút gập ở đầu cột để thu gọn cột đó.',
            'Nút Kanban | Bảng đổi sang dạng bảng. Kanban không kéo thả: đổi trạng thái hồ sơ bằng nút trên trang hồ sơ.',
          ],
          anh: ANH('ke-toan/ho-so-kanban.png', 'Danh sách hồ sơ dạng Kanban, hai cột Việc của bạn là Chờ KT duyệt L1 và KT duyệt bản cứng.'),
        },
        {
          tieuDe: 'Lọc và xuất Excel',
          noiDung: [
            'Bộ lọc có 9 tiêu chí kết hợp được với nhau: ngày áp dụng, ngày duyệt, mã và tên khách hàng, tên và nhóm sản phẩm, Trình dược viên phụ trách, trạng thái, hạn xử lý. Điều kiện lọc được giữ trong phiên làm việc, bấm “Xoá bộ lọc” để về danh sách đầy đủ.',
            'Nút Xuất Excel xuất đúng danh sách đang lọc.',
          ],
        },
      ],
    },
    {
      id: 'tiep-nhan-l1',
      duong: '/ho-so',
      ten: 'Tiếp nhận lần 1',
      mucDich: 'Kiểm tra hồ sơ sau khi Trưởng bộ phận ký và chuyển nó sang Sale Admin, hoặc trả lại.',
      khoi: [
        'Thông tin chung, Tiến trình duyệt và bảng dòng sản phẩm.',
        'Hai nút Tiếp nhận lần 1 và Trả lại (L1) ở góc trên bên phải.',
        'Bình luận và Lịch sử.',
      ],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đọc hồ sơ',
          noiDung: [
            'Mở hồ sơ ở trạng thái Chờ KT duyệt L1. Đọc thông tin khách hàng và công nợ, rồi rà bảng dòng sản phẩm: giá bán buôn, các khoản CPBH, giá thu về và tỷ lệ chiết khấu. Tỷ lệ màu đỏ là vượt ngưỡng chiết khấu, hệ thống chỉ đánh dấu chứ không chặn.',
            'Nhãn Trạng thái từng dòng cho biết dòng so với phiên bản trước: Bổ sung, Đang áp dụng hoặc Chỉnh sửa. Dòng Chỉnh sửa có dấu tam giác cạnh giá trị đã đổi, rê chuột để xem giá trị cũ.',
            'Tên khách hàng, địa chỉ và công nợ ở đây là thông tin lúc Trình dược viên gửi duyệt, đúng như sẽ in trên tờ giấy khách ký. Khối “Tiến trình duyệt” gọi bước của bạn là “KT duyệt bản mềm”.',
          ],
          anh: ANH('ke-toan/tiep-nhan-l1.png', 'Hồ sơ chờ Kế toán tiếp nhận lần 1, với hai nút Tiếp nhận lần 1 và Trả lại (L1).'),
        },
        {
          tieuDe: 'Tiếp nhận lần 1 và chọn Sale Admin',
          noiDung: [
            'Bấm Tiếp nhận lần 1. Hộp thoại yêu cầu bạn chọn Sale Admin xử lý: người sẽ in bản cứng, trình Ban lãnh đạo ký, scan và bàn giao lại. Chọn xong bấm Xác nhận.',
            'Chỉ người bạn chọn mới thấy hồ sơ trong hộp việc của họ. Hồ sơ chỉ hỏi chọn Sale Admin ở lượt đầu; nếu hồ sơ phải đi vòng thứ hai thì hộp không còn ô chọn.',
          ],
          anh: ANH('ke-toan/tiep-nhan-l1-hop-thoai.png', 'Hộp thoại Tiếp nhận lần 1, chọn Sale Admin xử lý.'),
        },
        {
          tieuDe: 'Trả lại (L1)',
          noiDung: [
            'Nếu hồ sơ chưa đạt, bấm Trả lại (L1) và nhập lý do. Lý do bắt buộc, nên viết đủ rõ: sai ở đâu, cần sửa gì. Trình dược viên sẽ đọc đúng câu này ở khối “Lý do gần nhất”.',
            'Hồ sơ về trạng thái Yêu cầu chỉnh sửa. Trình dược viên sửa xong gửi lại thì hồ sơ đi lại từ đầu vòng duyệt, bắt đầu từ Trưởng bộ phận.',
          ],
          anh: ANH('ke-toan/tra-lai.png', 'Hộp thoại Trả lại (L1), bắt buộc nhập lý do.'),
        },
        {
          tieuDe: 'Trao đổi bằng bình luận',
          noiDung: [
            'Có điều cần hỏi Trình dược viên hay Sale Admin thì viết ở khối Bình luận, gõ @ để nhắc tên người đứng tên trên hồ sơ. Bạn xem và viết được bình luận từ lúc Trưởng bộ phận đã ký.',
          ],
        },
      ],
      loiThuong: [
        {
          hoi: 'Ô chọn Sale Admin trống, tôi không chọn được ai?',
          traLoi: 'Chưa có tài khoản Sale Admin nào đang hoạt động. Nhờ Quản trị hệ thống tạo hoặc kích hoạt tài khoản rồi mở lại hộp thoại.',
        },
        {
          hoi: 'Tôi trả lại nhầm một hồ sơ?',
          traLoi: 'Hồ sơ đã về Trình dược viên và không rút lại được. Nhắn họ qua bình luận hoặc trực tiếp để sửa nhanh và gửi lại.',
        },
      ],
    },
    {
      id: 'xuat-hop-dong',
      duong: '/ho-so',
      ten: 'Xuất hợp đồng',
      mucDich: 'Tạo file PDF hợp đồng từ dữ liệu hồ sơ, bằng mẫu hợp đồng của công ty.',
      khoi: ['Nút Xuất hợp đồng ở góc trên bên phải trang hồ sơ, có từ sau khi bạn tiếp nhận lần 1.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Xuất hợp đồng',
          noiDung: [
            'Mở hồ sơ đã qua tiếp nhận lần 1 và bấm Xuất hợp đồng. Chọn văn bản mẫu rồi bấm Xem để xem trước cả tờ giấy.',
            'Tải PDF về máy rồi in từ đó, nên bản in ở mọi máy giống hệt nhau. Hệ thống không có nút In.',
          ],
          anh: ANH('ke-toan/xuat-hop-dong.png', 'Hồ sơ đã qua lần 1, có nút Xuất hợp đồng ở góc trên bên phải.'),
        },
        {
          tieuDe: 'Chọn văn bản mẫu',
          noiDung: [
            'Mỗi mẫu có bố cục và tập cột bảng sản phẩm riêng. Chọn mẫu hợp đồng công ty đang dùng.',
            'Hệ thống không lưu file hợp đồng. Mỗi lần bấm là dựng lại từ dữ liệu hiện tại của hồ sơ, nên nếu địa chỉ khách hàng vừa đổi thì bản mới mang địa chỉ mới.',
          ],
          anh: ANH('ke-toan/xuat-hop-dong-hop-thoai.png', 'Hộp thoại Xem hợp đồng, chọn văn bản mẫu.'),
        },
      ],
      loiThuong: [
        {
          hoi: 'Ô chọn văn bản mẫu trống hoặc xuất hợp đồng báo lỗi?',
          traLoi: 'Công ty chưa có mẫu hợp đồng nào đang áp dụng. Mẫu do Quản trị hệ thống tải lên ở trang Văn bản mẫu, nên báo Quản trị hoặc Sale Admin để bổ sung.',
        },
        {
          hoi: 'Sao tôi không thấy nút Xuất hợp đồng?',
          traLoi: 'Nút chỉ hiện sau khi hồ sơ đã được tiếp nhận lần 1. Hồ sơ còn ở Chờ KT duyệt L1 thì chưa có nút.',
        },
      ],
    },
    {
      id: 'tiep-nhan-l2',
      duong: '/ho-so',
      ten: 'Tiếp nhận lần 2 và in lại',
      mucDich: 'Nhận bản cứng đã ký, đối chiếu với bản mềm, rồi cho CSBH có hiệu lực, hoặc trả lại, hoặc yêu cầu in lại.',
      khoi: [
        'Khối Bản mềm và File SCAN bản cứng do Sale Admin đưa vào.',
        'Ba nút: Tiếp nhận lần 2, Trả lại (L2), Yêu cầu in lại.',
      ],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đối chiếu bản cứng',
          noiDung: [
            'Khi Sale Admin bàn giao, hồ sơ sang trạng thái KT duyệt bản cứng. Bạn nhận bản giấy đã ký, rồi mở khối Bản mềm và File SCAN bản cứng ở cuối trang hồ sơ để xem và tải về đối chiếu.',
            'Bấm hình con mắt để xem tệp ngay trên màn hình, hoặc mũi tên xuống để tải. Hồ sơ thay thế một CSBH cũ còn có thêm khối bản mềm và bản cứng của phiên bản trước để so.',
          ],
          anh: ANH('ke-toan/ban-mem-ban-cung.png', 'Khối Bản mềm và File SCAN bản cứng của một hồ sơ.'),
        },
        {
          tieuDe: 'Tiếp nhận lần 2',
          noiDung: [
            'Bản cứng đúng và đủ thì bấm Tiếp nhận lần 2. CSBH có hiệu lực ngay lúc này, không phải lúc Trưởng bộ phận ký.',
            'Nếu khách hàng đang có một CSBH cũ, bản cũ hết hiệu lực cùng lúc. Mỗi khách hàng chỉ có một CSBH hiệu lực và không có ngày hết hạn.',
          ],
          anh: ANH('ke-toan/tiep-nhan-l2.png', 'Hồ sơ ở bước KT duyệt bản cứng với ba nút Tiếp nhận lần 2, Trả lại (L2), Yêu cầu in lại.'),
        },
        {
          tieuDe: 'Chọn giữa Trả lại (L2) và Yêu cầu in lại',
          noiDung: [
            'Trả lại (L2): nội dung hồ sơ có vấn đề. Hồ sơ về Trình dược viên ở trạng thái Yêu cầu chỉnh sửa, và vòng duyệt đi lại từ đầu, bao gồm cả chữ ký của Trưởng bộ phận.',
            'Yêu cầu in lại: nội dung đúng nhưng bản giấy có lỗi (thiếu dấu giáp lai, ký sai chỗ). Hồ sơ sang trạng thái Sale Admin sửa bản cứng. Sale Admin in lại, tải bản scan mới rồi bàn giao lại, và hồ sơ trở về bàn bạn. Cả hai nút đều bắt buộc nhập lý do.',
          ],
          anh: ANH('ke-toan/yeu-cau-in-lai.png', 'Hộp thoại Yêu cầu in lại, bắt buộc nhập lý do.'),
        },
      ],
      loiThuong: [
        {
          hoi: 'Sau khi bấm Yêu cầu in lại, hồ sơ đi đâu?',
          traLoi: 'Về Sale Admin ở trạng thái Sale Admin sửa bản cứng. Bản scan cũ vẫn còn để họ xem lỗi ở đâu. Khi họ bàn giao lại, hồ sơ trở về bàn bạn ở bước KT duyệt bản cứng.',
        },
        {
          hoi: 'Hồ sơ đã có hiệu lực mà tôi phát hiện sai thì sao?',
          traLoi: 'Hồ sơ đã có hiệu lực không sửa được. Muốn đổi, Trình dược viên lập phiên bản mới và nó đi lại luồng duyệt.',
        },
      ],
    },
    {
      id: 'san-pham-chiet-khau',
      duong: '/san-pham',
      ten: 'Sản phẩm và Chiết khấu',
      mucDich: 'Tra giá bán Công ty và quy định chiết khấu để đối chiếu khi tiếp nhận hồ sơ.',
      khoi: ['Danh mục sản phẩm, giá hiện hành và lịch sử giá.', 'Quy định chiết khấu theo nhóm sản phẩm và loại khách hàng.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Tra khi tiếp nhận',
          noiDung: [
            'Hai trang này chỉ để xem. Khi một dòng vượt ngưỡng, bạn mở Chiết khấu để đọc quy định đang áp dụng cho nhóm sản phẩm và loại khách hàng đó.',
            'Muốn đổi danh mục hoặc quy định thì nhờ Quản trị hệ thống.',
          ],
        },
      ],
    },
    {
      id: 'thong-ke',
      duong: '/thong-ke',
      ten: 'Thống kê',
      mucDich: 'Nhìn lại khối lượng và tốc độ xử lý hồ sơ theo kỳ.',
      khoi: ['Các biểu đồ theo tuần, tháng, quý, năm.', 'Nút xuất Excel.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Chọn kỳ và đọc biểu đồ',
          noiDung: [
            'Bốn nút Tuần, Tháng, Quý, Năm ở đầu trang. Kế toán mở lên theo tuần. Kỳ đang chạy chưa đủ ngày nên điểm cuối luôn thấp hơn thực tế, và được tô nhạt hơn.',
            'Muốn biết một chỉ số tính theo mốc nào thì mở khối “Cách tính” ở cuối trang. Các chỉ số đo việc chạy hồ sơ CSBH, không đo doanh số bán hàng.',
          ],
          anh: ANH('ke-toan/thong-ke.png', 'Trang Thống kê của Kế toán.'),
        },
      ],
    },
  ],
};

const SALE_ADMIN: HuongDanVaiTro = {
  tieuDe: 'Hướng dẫn cho Sale Admin',
  gioiThieu:
    'Bạn là người chuẩn bị tờ giấy cho hồ sơ CSBH: tạo bản mềm để in và trình Ban lãnh đạo ký, tải lên bản scan của bản giấy đã ký, rồi bàn giao để Kế toán tiếp nhận lần 2. Nếu Kế toán thấy bản giấy có lỗi, bạn in lại.',
  lamGi: [
    'Tạo và lưu bản mềm của hồ sơ bằng mẫu hồ sơ đầy đủ.',
    'In bản mềm, trình Ban lãnh đạo ký, nhận lại rồi scan.',
    'Tải bản scan lên hồ sơ, rồi Bàn giao cho Kế toán.',
    'Sửa bản cứng khi Kế toán yêu cầu in lại.',
    'Xuất hợp đồng và đọc, viết bình luận trên hồ sơ.',
  ],
  khongLam: [
    'Không lập hồ sơ, không sửa nội dung hồ sơ và không ký duyệt.',
    'Không tải mẫu văn bản lên. Mẫu hồ sơ và mẫu hợp đồng do Quản trị hệ thống quản lý.',
    'Không tải bản mềm lên từ máy của bạn. Bản mềm do hệ thống dựng từ dữ liệu hồ sơ.',
  ],
  ngayLamViec: [
    'Mở Tổng quan, đọc khối “Việc của tôi” và để ý cảnh báo đỏ nếu công ty chưa có mẫu hợp đồng.',
    'Với hồ sơ Kế toán vừa tiếp nhận lần 1: tạo bản mềm, in, trình Ban lãnh đạo ký.',
    'Nhận lại bản giấy đã ký, scan, tải bản scan lên hồ sơ.',
    'Bấm Bàn giao để chuyển hồ sơ cho Kế toán tiếp nhận lần 2.',
    'Nếu có hồ sơ bị yêu cầu in lại: đọc lý do, in lại, thay bản scan, rồi bàn giao lại.',
  ],
  trang: [
    {
      id: 'tong-quan',
      duong: '/',
      ten: 'Tổng quan',
      mucDich: 'Cho bạn biết hồ sơ nào đang chờ bạn xử lý và có hồ sơ nào phải in lại không.',
      khoi: [
        'Dải thẻ: Trình ký, Lỗi bản cứng, Sắp quá hạn, Quá hạn, Đang chờ, Đang có hiệu lực.',
        'Cảnh báo đỏ khi công ty chưa có mẫu hợp đồng nào đang áp dụng.',
        'Việc của tôi và bảng hồ sơ theo từng Trình dược viên.',
      ],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Hiểu hai thẻ của Sale Admin',
          noiDung: [
            'Trình ký: Kế toán vừa tiếp nhận lần 1. Việc của bạn là in, trình Ban lãnh đạo ký, nhận lại, scan và tải lên.',
            'Lỗi bản cứng: Kế toán đã nhận bản giấy và bắt in lại. Bản scan cũ vẫn còn để bạn xem bản giấy hỏng ở đâu. Hồ sơ mang trạng thái Sale Admin sửa bản cứng.',
            'Bấm vào thẻ nào thì mở danh sách hồ sơ đã lọc sẵn đúng bằng con số đó. Hồ sơ còn dưới 24 giờ có vạch đỏ và nằm ở thẻ Sắp quá hạn.',
          ],
          anh: ANH('sale-admin/tong-quan.png', 'Trang Tổng quan của Sale Admin.'),
        },
        {
          tieuDe: 'Cảnh báo thiếu mẫu hợp đồng',
          noiDung: [
            'Nếu công ty chưa có mẫu hợp đồng nào đang áp dụng, một khung cảnh báo đỏ hiện ở đầu trang. Lúc đó Kế toán không xuất được hợp đồng. Hãy báo Quản trị hệ thống tải mẫu hợp đồng lên.',
          ],
        },
        {
          tieuDe: 'Xử lý “Việc của tôi”',
          noiDung: [
            'Khối này gồm hồ sơ đang chờ chính bạn, hạn gần nhất đứng trước, tối đa 5 hồ sơ mỗi trang. Bảng ở cuối trang đếm hồ sơ theo từng Trình dược viên, bấm một dòng để mở đúng danh sách của người đó.',
          ],
        },
      ],
    },
    {
      id: 'khach-hang',
      duong: '/khach-hang',
      ten: 'Khách hàng',
      mucDich: 'Tra cứu thông tin khách hàng của hồ sơ bạn đang xử lý. Bạn chỉ xem, không sửa.',
      khoi: ['Danh sách khách hàng, tìm theo tên, địa chỉ hoặc mã số thuế.', 'Chi tiết khách hàng, hồ sơ pháp lý và lịch sử các CSBH đã lập.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Tra cứu khách hàng',
          noiDung: [
            'Trong hồ sơ, bấm vào Mã khách hàng để mở trang khách hàng, xem hồ sơ pháp lý và lịch sử các CSBH trước đây của khách.',
            'Chỉ Trình dược viên phụ trách mới sửa được thông tin khách hàng.',
          ],
          anh: ANH('sale-admin/khach-hang.png', 'Danh sách khách hàng của Sale Admin.'),
        },
      ],
    },
    {
      id: 'danh-sach-ho-so',
      duong: '/ho-so',
      ten: 'Hồ sơ CSBH: danh sách',
      mucDich: 'Nhìn các hồ sơ trong phạm vi của bạn theo trạng thái, và tìm lại bất kỳ hồ sơ nào.',
      khoi: ['Kanban theo trạng thái, hoặc dạng Bảng.', 'Bộ lọc và nút Xuất Excel.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đọc bảng Kanban',
          noiDung: [
            'Mỗi trạng thái một cột, theo thứ tự luồng duyệt. Hai cột tô viền xanh “Việc của bạn” là Sale Admin đang xử lý và Sale Admin sửa bản cứng.',
            'Cột KT duyệt bản cứng cho bạn theo dõi hồ sơ đã bàn giao. Cột nào không có hồ sơ thì ẩn, bấm nút gập ở đầu cột để thu gọn.',
            'Nút Kanban | Bảng đổi sang dạng bảng. Kanban không kéo thả: đổi trạng thái hồ sơ bằng nút trên trang hồ sơ.',
          ],
          anh: ANH('sale-admin/ho-so-kanban.png', 'Danh sách hồ sơ dạng Kanban, hai cột Việc của bạn là hai bước của Sale Admin.'),
        },
        {
          tieuDe: 'Lọc và xuất Excel',
          noiDung: [
            'Bộ lọc có 9 tiêu chí kết hợp được với nhau, và được giữ trong phiên làm việc. Bấm “Xoá bộ lọc” để về danh sách đầy đủ. Nút Xuất Excel xuất đúng danh sách đang lọc.',
          ],
        },
      ],
    },
    {
      id: 'xu-ly-ho-so',
      duong: '/ho-so',
      ten: 'Xử lý một hồ sơ',
      mucDich: 'Nắm các nút và các khối bạn dùng ở bước Sale Admin đang xử lý.',
      khoi: [
        'Ba nút ở góc trên bên phải: Xem bản mềm, Xuất hợp đồng, Bàn giao.',
        'Khối Bản mềm và khối File SCAN bản cứng, gần cuối trang.',
        'Bình luận và Lịch sử.',
      ],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đọc hồ sơ và nút thao tác',
          noiDung: [
            'Hồ sơ ở trạng thái Sale Admin đang xử lý có ba nút. Xem bản mềm dựng nhanh tờ giấy để bạn xem, không lưu gì. Xuất hợp đồng tạo PDF hợp đồng. Bàn giao chuyển hồ sơ cho Kế toán tiếp nhận lần 2.',
            'Nút Bàn giao xám cho tới khi hồ sơ có bản scan, và một dòng chữ ngay dưới tiêu đề nói rõ còn thiếu gì. Tải bản scan lên là nút dùng được ngay, không cần tải lại trang.',
            'Hồ sơ cần cả hai tệp trước khi bàn giao: bản mềm đã lưu và bản scan của bản giấy đã ký.',
          ],
          anh: ANH('sale-admin/xu-ly-ho-so.png', 'Hồ sơ ở bước Sale Admin đang xử lý, nút Bàn giao còn xám vì chưa có bản scan.'),
        },
        {
          tieuDe: 'Hai khối tệp gần cuối trang',
          noiDung: [
            'Bản mềm: tờ CSBH do hệ thống dựng từ dữ liệu hồ sơ. File SCAN bản cứng: bản scan của tờ giấy đã in, ký và nhận lại.',
            'Khối nào chưa có tệp vẫn hiện, kèm chỗ để thêm, để câu hỏi “bản cứng đâu” luôn có chỗ trả lời.',
          ],
          anh: ANH('sale-admin/ban-mem-scan.png', 'Khối Bản mềm và File SCAN bản cứng khi chưa có tệp nào.'),
        },
      ],
      loiThuong: [
        {
          hoi: 'Vì sao nút Bàn giao bị xám?',
          traLoi: 'Hồ sơ chưa có bản scan. Tải bản scan lên ở khối File SCAN bản cứng rồi nút dùng được ngay. Nếu hồ sơ chưa có bản mềm, bấm Bàn giao sẽ mở bước tạo bản mềm trước.',
        },
      ],
    },
    {
      id: 'ban-mem',
      duong: '/ho-so',
      ten: 'Bản mềm',
      mucDich: 'Tạo bản mềm CSBH để in, trình ký và bàn giao.',
      khoi: ['Nút Tạo bản mềm trong khối Bản mềm.', 'Nút Xem bản mềm ở góc trên bên phải, để xem nhanh.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Tạo bản mềm để lưu',
          noiDung: [
            'Trong khối Bản mềm, bấm Tạo bản mềm. Chọn văn bản mẫu rồi bấm Xem trước để xem cả tờ giấy. Chỉ mẫu hồ sơ đầy đủ dùng được ở đây, vì đây là bản đem trình ký và bàn giao cho Kế toán, nên phải có đủ cột kể cả giá thu về và tỷ lệ chiết khấu.',
          ],
          anh: ANH('sale-admin/tao-ban-mem.png', 'Hộp thoại Tạo bản mềm, chọn văn bản mẫu.'),
        },
        {
          tieuDe: 'Xem trước và lưu',
          noiDung: [
            'Xem tờ giấy ngay trên màn hình. Đúng rồi thì bấm Lưu bản mềm. Muốn lấy file về máy thì bấm Tải xuống.',
            'Lưu xong là đóng băng: nó là một tệp PDF nằm trong hồ sơ, giống bản scan. Quản trị sửa hay vô hiệu hoá mẫu về sau cũng không đụng tới bản đã lưu.',
            'Lưu được nhiều bản: khi Kế toán yêu cầu in lại, bạn dựng bản mới và bản cũ ở lại làm vết. Tên tệp mang mã hồ sơ và mốc thời gian nên dễ nhận ra bản mới nhất.',
          ],
          anh: ANH('sale-admin/xem-truoc-ban-mem.png', 'Xem trước bản mềm trước khi lưu, có nút Lưu bản mềm và Tải xuống.'),
        },
        {
          tieuDe: 'Nút Xem bản mềm ở đầu trang',
          noiDung: [
            'Khác với Tạo bản mềm, nút Xem bản mềm ở góc trên chỉ dựng lại tờ giấy để bạn xem mỗi lần bấm và không lưu gì. Nó chọn được cả mẫu rút gọn, là bản đưa cho khách hàng.',
            'Chỉ Sale Admin thấy nút này. Các vai trò khác chỉ xem và tải được bản mềm đã lưu.',
          ],
          anh: ANH('sale-admin/xem-ban-mem.png', 'Hộp thoại Xem bản mềm từ nút ở góc trên bên phải.'),
        },
      ],
      loiThuong: [
        {
          hoi: 'Ô chọn văn bản mẫu không có mẫu nào?',
          traLoi: 'Công ty chưa có mẫu hồ sơ đầy đủ nào đang áp dụng. Mẫu do Quản trị hệ thống tải lên ở trang Văn bản mẫu, nên báo Quản trị.',
        },
        {
          hoi: 'Tôi muốn tải bản mềm từ máy của mình lên?',
          traLoi: 'Không làm được. Bản mềm do hệ thống dựng để luôn khớp dữ liệu hồ sơ. Muốn đổi nội dung thì phải trả lại hồ sơ để Trình dược viên sửa.',
        },
      ],
    },
    {
      id: 'scan-ban-giao',
      duong: '/ho-so',
      ten: 'Bản scan và bàn giao',
      mucDich: 'Tải bản scan của bản giấy đã ký lên hồ sơ, rồi bàn giao cho Kế toán.',
      khoi: ['Vùng “Thêm bản scan hoặc bấm để chọn” trong khối File SCAN bản cứng.', 'Nút Bàn giao.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Tải bản scan lên',
          noiDung: [
            'Sau khi in bản mềm, trình Ban lãnh đạo ký và nhận lại bản giấy, hãy scan nó. Kéo tệp vào vùng “Thêm bản scan” trong khối File SCAN bản cứng, hoặc bấm vào giữa vùng để chọn từ máy.',
            'Mỗi tệp là một thẻ có ảnh thu nhỏ. Rê chuột lên thẻ để hiện hai nút: con mắt để xem ngay trong phần mềm, mũi tên xuống để tải về. Dấu ✕ ở góc là gỡ tệp.',
            'Gỡ tệp là xoá hẳn khỏi hệ thống. Chỉ Sale Admin thêm và gỡ được bản scan.',
          ],
        },
        {
          tieuDe: 'Bàn giao',
          noiDung: [
            'Khi hồ sơ đã có cả bản mềm và bản scan, bấm Bàn giao rồi Xác nhận. Hồ sơ sang bước KT duyệt bản cứng và Kế toán nhận thư báo.',
            'Từ đây việc của bạn trên hồ sơ này xong, trừ khi Kế toán yêu cầu in lại.',
          ],
        },
      ],
      loiThuong: [
        {
          hoi: 'Tôi tải nhầm bản scan?',
          traLoi: 'Bấm ✕ trên thẻ tệp đó để gỡ rồi tải tệp đúng. Làm được khi hồ sơ còn ở bước của bạn, tức trước khi bàn giao hoặc sau khi Kế toán yêu cầu in lại.',
        },
      ],
    },
    {
      id: 'sua-ban-cung',
      duong: '/ho-so',
      ten: 'Sửa bản cứng khi bị yêu cầu in lại',
      mucDich: 'Làm lại bản giấy khi Kế toán phát hiện lỗi, rồi bàn giao lại.',
      khoi: ['Khối Lý do gần nhất: Kế toán yêu cầu in lại vì sao.', 'Bản scan cũ vẫn còn để đối chiếu.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đọc lý do',
          noiDung: [
            'Hồ sơ ở trạng thái Sale Admin sửa bản cứng. Khối Lý do gần nhất nói ai yêu cầu, từ bước nào và vì sao, ví dụ thiếu dấu giáp lai ở trang 2.',
            'Nội dung hồ sơ không sai. Chỉ bản giấy cần làm lại, nên bạn không phải chờ Trình dược viên hay Trưởng bộ phận.',
          ],
          anh: ANH('sale-admin/sua-ban-cung.png', 'Hồ sơ bị Kế toán yêu cầu in lại, khối Lý do gần nhất nêu rõ lỗi.'),
        },
        {
          tieuDe: 'In lại, thay bản scan và bàn giao lại',
          noiDung: [
            'In lại và trình ký lại. Bản scan cũ vẫn còn để bạn đối chiếu xem bản giấy hỏng ở đâu. Khi có bản mới, gỡ bản scan cũ và tải bản scan mới lên. Cần thì tạo thêm một bản mềm mới.',
            'Bấm Bàn giao. Hồ sơ trở về bàn Kế toán ở bước KT duyệt bản cứng.',
          ],
        },
      ],
    },
    {
      id: 'xuat-hop-dong',
      duong: '/ho-so',
      ten: 'Xuất hợp đồng',
      mucDich: 'Tạo file PDF hợp đồng từ dữ liệu hồ sơ khi cần.',
      khoi: ['Nút Xuất hợp đồng ở góc trên bên phải trang hồ sơ.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Xuất hợp đồng',
          noiDung: [
            'Bấm Xuất hợp đồng, chọn văn bản mẫu rồi bấm Xem. Tải PDF về máy và in từ đó. Hệ thống không có nút In và không lưu file hợp đồng: mỗi lần bấm là dựng lại từ dữ liệu hiện tại của hồ sơ.',
            'Cả Kế toán và Sale Admin xuất được hợp đồng. Nút có từ sau khi Kế toán tiếp nhận lần 1.',
          ],
        },
      ],
      loiThuong: [
        {
          hoi: 'Xuất hợp đồng báo lỗi hoặc ô mẫu trống?',
          traLoi: 'Công ty chưa có mẫu hợp đồng nào đang áp dụng. Khi đó Tổng quan của bạn có cảnh báo đỏ. Báo Quản trị hệ thống tải mẫu hợp đồng lên.',
        },
      ],
    },
    {
      id: 'san-pham-chiet-khau',
      duong: '/san-pham',
      ten: 'Sản phẩm và Chiết khấu',
      mucDich: 'Tra giá bán Công ty và quy định chiết khấu khi cần.',
      khoi: ['Danh mục sản phẩm, giá hiện hành và lịch sử giá.', 'Quy định chiết khấu theo nhóm sản phẩm và loại khách hàng.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Tra cứu',
          noiDung: [
            'Hai trang này chỉ để xem. Muốn đổi danh mục hoặc quy định thì nhờ Quản trị hệ thống.',
          ],
        },
      ],
    },
    {
      id: 'thong-ke',
      duong: '/thong-ke',
      ten: 'Thống kê',
      mucDich: 'Nhìn lại khối lượng và tốc độ xử lý hồ sơ theo kỳ.',
      khoi: ['Các biểu đồ theo tuần, tháng, quý, năm.', 'Nút xuất Excel.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Chọn kỳ và đọc biểu đồ',
          noiDung: [
            'Bốn nút Tuần, Tháng, Quý, Năm ở đầu trang. Sale Admin mở lên theo tuần. Kỳ đang chạy chưa đủ ngày nên điểm cuối luôn thấp hơn thực tế, và được tô nhạt hơn.',
            'Muốn biết một chỉ số tính theo mốc nào thì mở khối “Cách tính” ở cuối trang. Các chỉ số đo việc chạy hồ sơ CSBH, không đo doanh số bán hàng.',
          ],
          anh: ANH('sale-admin/thong-ke.png', 'Trang Thống kê của Sale Admin.'),
        },
      ],
    },
  ],
};

const BAN_LANH_DAO: HuongDanVaiTro = {
  tieuDe: 'Hướng dẫn cho Ban lãnh đạo',
  gioiThieu:
    'Bạn theo dõi toàn bộ tình hình CSBH của công ty: hồ sơ đang ở đâu, tắc ở bước nào, ai đang chạy tốt. Bạn không nằm trong luồng duyệt nên không có hồ sơ nào chờ bạn xử lý, và không có nút ghi nào ở bất kỳ trang nào.',
  lamGi: [
    'Xem sức khoẻ luồng duyệt ngay ở Tổng quan: tỷ lệ trả lại, số ngày chờ, hồ sơ tắc ở bước nào.',
    'Mở bất kỳ hồ sơ nào để đọc chi tiết, kể cả lịch sử và bình luận.',
    'Xem Thống kê theo tuần, tháng, quý, năm và theo dõi từng Trình dược viên.',
    'Xuất Excel danh sách hồ sơ để phân tích thêm.',
    'Viết bình luận trên hồ sơ khi cần hỏi hoặc chỉ đạo.',
  ],
  khongLam: [
    'Không lập, không sửa, không ký duyệt và không bàn giao gì. Phần mềm không có nút ghi nào cho vai trò này.',
    'Không nhận thư báo và thông báo trên chuông. Muốn biết tình hình thì mở phần mềm.',
    'Không được nhắc tên trong bình luận và không nhận thông báo bình luận.',
    'Không vào Nhật ký hệ thống. Chuyện một hồ sơ đã đi qua tay ai thì đọc ở Lịch sử trong chính hồ sơ ấy.',
  ],
  ngayLamViec: [
    'Mở Tổng quan, đọc năm thẻ đầu để biết hồ sơ sắp quá hạn và quá hạn.',
    'Nhìn “Sức khoẻ luồng duyệt” và “Đang tắc ở bước nào” để biết nghẽn ở đâu.',
    'Cần xem một hồ sơ cụ thể thì mở nó từ thẻ trạng thái hoặc từ danh sách hồ sơ.',
    'Cuối tuần hoặc cuối kỳ, vào Thống kê xem xu hướng và so sánh các Trình dược viên.',
  ],
  trang: [
    {
      id: 'tong-quan',
      duong: '/',
      ten: 'Tổng quan',
      mucDich: 'Bức tranh tổng hợp toàn hệ thống ngay lúc này. Đây là trang bạn nên mở đầu tiên mỗi ngày.',
      khoi: [
        'Dải thẻ đếm hồ sơ ở cả 11 trạng thái, cộng thẻ Sắp quá hạn.',
        'Sức khoẻ luồng duyệt: tỷ lệ trả lại, số ngày chờ trung bình, số hồ sơ đến hạn hôm nay.',
        'Đang tắc ở bước nào.',
        'Theo trình dược viên.',
      ],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đọc dải thẻ',
          noiDung: [
            'Dòng chữ ở đầu trang nhắc bạn không nằm trong luồng duyệt, nên đây là bản tổng hợp chỉ để xem. Mỗi thẻ là số hồ sơ ở một trạng thái, từ Nháp tới Đã xoá.',
            'Thẻ Sắp quá hạn đếm hồ sơ còn dưới 24 giờ. Thẻ Quá hạn duyệt là hồ sơ đã quá 14 ngày ở một bước và không ai thao tác được nữa. Bấm vào bất kỳ thẻ nào để mở danh sách hồ sơ đã lọc sẵn đúng trạng thái đó.',
          ],
          anh: ANH('ban-lanh-dao/tong-quan.png', 'Trang Tổng quan của Ban lãnh đạo: dải thẻ 11 trạng thái, sức khoẻ luồng duyệt và các bước đang tắc.'),
        },
        {
          tieuDe: 'Sức khoẻ luồng duyệt',
          noiDung: [
            'Tỷ lệ trả lại cho biết bao nhiêu phần trăm hồ sơ đã gửi duyệt bị trả về. Tỷ lệ cao nghĩa là hồ sơ hay sai ngay từ đầu.',
            'Số ngày chờ trung bình tính cả thứ bảy và chủ nhật, vì hạn xử lý 14 ngày cũng tính vậy. Đến hạn hôm nay là số hồ sơ còn dưới 24 giờ.',
            'Biểu đồ “Đang tắc ở bước nào” cho thấy hồ sơ đang dồn ở bước nào: chờ Trưởng bộ phận ký, Kế toán tiếp nhận lần 1, Sale Admin bàn giao hay Kế toán tiếp nhận lần 2.',
          ],
        },
        {
          tieuDe: 'Theo trình dược viên',
          noiDung: [
            'Ở cuối trang, bảng này đếm hồ sơ theo từng Trình dược viên. Bấm một dòng để mở đúng danh sách hồ sơ của người đó.',
          ],
          anh: ANH('ban-lanh-dao/tong-quan-day-du.png', 'Toàn bộ trang Tổng quan, kể cả bảng Theo trình dược viên ở cuối.'),
        },
      ],
      loiThuong: [
        {
          hoi: 'Tôi không thấy khối “Việc của tôi”?',
          traLoi: 'Ban lãnh đạo không có hồ sơ nào chờ xử lý, nên không có khối này. Trang này là bản tổng hợp toàn hệ thống.',
        },
      ],
    },
    {
      id: 'khach-hang',
      duong: '/khach-hang',
      ten: 'Khách hàng',
      mucDich: 'Tra cứu bất kỳ khách hàng nào và các CSBH đã lập cho họ. Bạn chỉ xem, không sửa.',
      khoi: ['Danh sách khách hàng, tìm theo tên, địa chỉ hoặc mã số thuế.', 'Chi tiết khách hàng, hồ sơ pháp lý và lịch sử các CSBH.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Tra cứu khách hàng',
          noiDung: [
            'Gõ vào ô tìm kiếm để tìm theo tên, địa chỉ hoặc mã số thuế. Mở một khách hàng để xem thông tin, hồ sơ pháp lý và lịch sử CSBH của họ.',
            'Mỗi khách có một Trình dược viên phụ trách. Chỉ người đó mới sửa được thông tin khách hàng.',
          ],
          anh: ANH('ban-lanh-dao/khach-hang.png', 'Danh sách khách hàng của Ban lãnh đạo.'),
        },
      ],
    },
    {
      id: 'danh-sach-ho-so',
      duong: '/ho-so',
      ten: 'Hồ sơ CSBH: danh sách',
      mucDich: 'Xem tất cả hồ sơ theo trạng thái, tìm bất kỳ hồ sơ nào và xuất Excel.',
      khoi: ['Kanban theo trạng thái, hoặc dạng Bảng.', 'Bộ lọc 9 tiêu chí.', 'Nút Xuất Excel.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đọc bảng Kanban',
          noiDung: [
            'Mỗi trạng thái một cột, theo đúng thứ tự luồng duyệt. Vì bạn không có việc nào trong luồng nên không có cột nào tô viền xanh. Cột không có hồ sơ thì ẩn, bấm nút gập ở đầu cột để thu gọn.',
            'Nút Kanban | Bảng đổi sang dạng bảng. Mỗi thẻ hiện mã hồ sơ, khách hàng, Trình dược viên và ngày áp dụng. Bấm vào thẻ để mở hồ sơ.',
          ],
          anh: ANH('ban-lanh-dao/ho-so-kanban.png', 'Danh sách hồ sơ dạng Kanban của Ban lãnh đạo.'),
        },
        {
          tieuDe: 'Lọc và xuất Excel',
          noiDung: [
            'Bộ lọc gồm ngày áp dụng, ngày duyệt, mã và tên khách hàng, tên và nhóm sản phẩm, Trình dược viên phụ trách, trạng thái, hạn xử lý. Điều kiện lọc được giữ trong phiên làm việc.',
            'Nút Xuất Excel ở góc trên bên phải xuất đúng danh sách đang lọc, nên số dòng trong file khớp con số “N hồ sơ khớp điều kiện” dưới tiêu đề. Việc xuất chạy nền: bấm xong bạn dùng tiếp trang khác, khi file sẵn sàng nút đổi thành “Tải file”.',
            'Mỗi sản phẩm là một dòng riêng trong file, cột tiền là số nên cộng và lọc được ngay trong Excel.',
          ],
        },
      ],
    },
    {
      id: 'xem-ho-so',
      duong: '/ho-so',
      ten: 'Xem một hồ sơ',
      mucDich: 'Đọc chi tiết một hồ sơ: ai làm gì, đã đi tới đâu, lý do trả về, bình luận.',
      khoi: [
        'Thông tin chung và Tiến trình duyệt.',
        'Bảng dòng sản phẩm với nhãn trạng thái và chênh lệch so với phiên bản trước.',
        'Bản mềm và File SCAN bản cứng, nếu đã có.',
        'Bình luận và Lịch sử.',
      ],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đọc hồ sơ',
          noiDung: [
            'Trang hồ sơ của bạn không có nút thao tác nào. Khối Tiến trình duyệt bên phải cho biết hồ sơ đã qua những bước nào, ai làm và lúc nào.',
            'Tỷ lệ chiết khấu màu đỏ là vượt ngưỡng quy định. Nhãn Trạng thái của từng dòng (Bổ sung, Đang áp dụng, Chỉnh sửa) cho biết dòng so với phiên bản trước, và dấu tam giác cạnh giá trị đã đổi cho biết tăng hay giảm.',
            'Khối Lịch sử ở cuối trang kể hồ sơ đã đi qua tay ai, kể cả các lần bị trả lại và lý do. Bạn không cần Nhật ký hệ thống để biết điều đó.',
          ],
          anh: ANH('ban-lanh-dao/xem-ho-so.png', 'Hồ sơ mở bằng tài khoản Ban lãnh đạo: không có nút thao tác nào.'),
        },
        {
          tieuDe: 'Bình luận',
          noiDung: [
            'Khối Bình luận nằm ngay trên Lịch sử. Bạn đọc và viết được bình luận, trả lời, thả cảm xúc và đính kèm tệp.',
            'Bạn không được nhắc tên bằng @ và không nhận thông báo bình luận. Nếu cần một người cụ thể thấy ngay, hãy nhắn họ qua kênh khác.',
          ],
        },
      ],
    },
    {
      id: 'san-pham-chiet-khau',
      duong: '/san-pham',
      ten: 'Sản phẩm và Chiết khấu',
      mucDich: 'Xem danh mục sản phẩm, giá và quy định chiết khấu đang áp dụng.',
      khoi: ['Danh mục sản phẩm, giá hiện hành và lịch sử giá.', 'Quy định chiết khấu theo nhóm sản phẩm và loại khách hàng.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Tra cứu',
          noiDung: [
            'Hai trang này chỉ để xem. Khi cần hiểu vì sao một dòng bị đánh dấu vượt ngưỡng, mở Chiết khấu để đọc quy định áp cho nhóm sản phẩm và loại khách hàng đó.',
            'Muốn đổi danh mục hoặc quy định thì nhờ Quản trị hệ thống.',
          ],
        },
      ],
    },
    {
      id: 'thong-ke',
      duong: '/thong-ke',
      ten: 'Thống kê',
      mucDich: 'Nhìn xu hướng theo kỳ và so sánh các Trình dược viên.',
      khoi: [
        'Bốn nút Tuần, Tháng, Quý, Năm.',
        'Vào luồng và ra khỏi luồng, Kết cục của hồ sơ, Luồng duyệt rơi rụng ở đâu.',
        'Chiết khấu bình quân theo nhóm sản phẩm.',
        'Hồ sơ nằm ở bàn ai bao lâu.',
        'Ai đang chạy tốt, ai đang chững.',
      ],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Chọn kỳ và đọc biểu đồ',
          noiDung: [
            'Ban lãnh đạo mở lên theo quý, đổi sang tuần, tháng hoặc năm bất kỳ lúc nào. Thống kê nói về dòng chảy trong kỳ, khác với Tổng quan nói về những gì đang tồn tại ngay lúc này.',
            'Kỳ đang chạy chưa đủ ngày nên điểm cuối luôn thấp hơn thực tế, và được phủ dải mờ để bạn không đọc nhầm là đang rơi. Tuần bắt đầu từ thứ Hai, kỳ cắt theo giờ Việt Nam.',
            'Muốn biết một chỉ số tính theo mốc nào thì mở khối “Cách tính các chỉ số” ở cuối trang. “Lập”, “gửi duyệt” và “có hiệu lực” trong tháng là ba con số khác nhau.',
          ],
          anh: ANH('ban-lanh-dao/thong-ke-day-du.png', 'Trang Thống kê của Ban lãnh đạo theo quý.'),
        },
        {
          tieuDe: 'Theo dõi từng Trình dược viên',
          noiDung: [
            'Bảng xếp hạng liệt kê mỗi người: số CSBH có hiệu lực, nhãn xu hướng và đường nhỏ sáu kỳ gần nhất. Bấm một dòng để lọc cả màn hình theo người đó, bấm lại để bỏ chọn.',
            'Biểu đồ phân tán “Làm nhiều và làm chuẩn” đặt số CSBH có hiệu lực ở trục ngang và tỷ lệ bị trả lại ở trục dọc. Vùng xanh nhạt là nơi nên nằm: nhiều hồ sơ và ít bị trả lại.',
            'Nhãn xu hướng so trung bình ba kỳ đã đóng gần nhất với ba kỳ trước đó, và chỉ đổi nhãn khi lệch từ 15%. Kỳ đang chạy không tham gia phép so.',
          ],
        },
        {
          tieuDe: 'Chiết khấu bình quân theo nhóm sản phẩm',
          noiDung: [
            'Bảng riêng của Ban lãnh đạo, tính trên sáu kỳ gần nhất kèm số dòng vượt ngưỡng của từng nhóm. Nhóm nào chiết khấu leo cao liên tục là chỗ cần xem lại quy định.',
          ],
        },
      ],
      loiThuong: [
        {
          hoi: 'Các chỉ số này có phải doanh số không?',
          traLoi: 'Không. Bốn chỉ số hiệu quả (số CSBH có hiệu lực, tỷ lệ bị trả lại, số ngày duyệt, tổng giá thu về) đo việc chạy hồ sơ CSBH. Phần mềm không có dữ liệu bán hàng.',
        },
        {
          hoi: 'Hồ sơ nhập từ dữ liệu cũ đâu rồi?',
          traLoi: 'Chúng bị loại khỏi mọi con số vì không đi qua luồng duyệt nên không có mốc nào để tính vào kỳ. Số bị loại ghi ngay dưới bảng.',
        },
      ],
    },
  ],
};

const QUAN_TRI: HuongDanVaiTro = {
  tieuDe: 'Hướng dẫn cho Quản trị hệ thống',
  gioiThieu:
    'Bạn giữ cho phần mềm vận hành trơn tru: tạo và quản lý tài khoản, giữ danh mục sản phẩm, giá và quy định chiết khấu, quản lý văn bản mẫu, và theo dõi tình trạng hệ thống. Bạn không tham gia duyệt hồ sơ CSBH.',
  lamGi: [
    'Tạo tài khoản, vô hiệu hoá tài khoản kèm bàn giao, đổi Trình dược viên phụ trách một khách hàng.',
    'Quản lý sản phẩm, nhóm sản phẩm, giá bán Công ty và quy định chiết khấu.',
    'Quản lý văn bản mẫu: mẫu hồ sơ đầy đủ, mẫu hồ sơ rút gọn và mẫu hợp đồng.',
    'Đọc Nhật ký để biết ai làm gì và lúc nào.',
    'Theo dõi Vận hành: sức khoẻ hệ thống, ổ đĩa, sao lưu, tệp log, thư gửi hỏng và các lịch tự động.',
  ],
  khongLam: [
    'Không lập, không duyệt hồ sơ CSBH, và không có trang Hồ sơ CSBH. Quản trị đứng ngoài luồng duyệt.',
    'Không xoá được người dùng. Nhật ký tham chiếu tới tài khoản nên chỉ vô hiệu hoá được.',
    'Không đổi được vai trò, tên tài khoản và email của tài khoản đã kích hoạt. Cần đổi vai trò thì vô hiệu hoá tài khoản cũ rồi tạo tài khoản mới.',
    'Không phục hồi dữ liệu từ bản sao lưu trên phần mềm. Việc đó do người vận hành máy chủ làm.',
  ],
  ngayLamViec: [
    'Mở Tổng quan, đọc cảnh báo đỏ nếu có thư gửi hỏng, rồi xem các con số người dùng và sản phẩm.',
    'Xử lý yêu cầu về tài khoản: tạo người dùng mới, gửi lại thư mời, vô hiệu hoá người nghỉ việc.',
    'Cập nhật danh mục khi có sản phẩm mới hoặc đổi giá, và quy định chiết khấu khi chính sách đổi.',
    'Mở trang Vận hành định kỳ, xử lý các việc cần chú ý trong thẻ Sức khoẻ.',
  ],
  trang: [
    {
      id: 'tong-quan',
      duong: '/',
      ten: 'Tổng quan',
      mucDich: 'Cho bạn biết hệ thống có việc gì cần xử lý ngay và quy mô hiện tại.',
      khoi: [
        'Cảnh báo đỏ khi có thư chưa gửi được và chưa ai xử lý.',
        'Sức khoẻ hệ thống: thư hỏng, người dùng, tài khoản chưa kích hoạt, tài khoản đang bị khoá, sản phẩm đang áp dụng.',
        'Hoạt động hôm nay và nhật ký gần đây.',
      ],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đọc các thẻ',
          noiDung: [
            'Dòng chữ ở đầu trang nhắc bạn không nằm trong luồng duyệt, nên không có con số hồ sơ nào ở đây.',
            'Khung đỏ “thư chưa gửi được” là quan trọng nhất: người phụ trách ở những bước đó không nhận được thông báo, họ sẽ không biết có hồ sơ đang chờ cho tới khi tự mở phần mềm. Bấm thẻ “Thư hỏng chưa xử lý” để mở danh sách và gửi lại.',
            'Thẻ Chưa kích hoạt là số tài khoản đã được mời nhưng chưa đặt mật khẩu. Nếu con số này lớn và đứng yên, hãy gửi lại thư mời.',
          ],
          anh: ANH('quan-tri/tong-quan.png', 'Trang Tổng quan của Quản trị hệ thống.'),
        },
      ],
    },
    {
      id: 'nguoi-dung',
      duong: '/nguoi-dung',
      ten: 'Người dùng',
      mucDich: 'Tạo và quản lý tài khoản của mọi vai trò.',
      khoi: ['Bảng tài khoản kèm ô tìm theo họ tên.', 'Nút Tạo người dùng.', 'Ở mỗi dòng: Xem, Vô hiệu hoá, Gửi lại thư mời.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Tìm tài khoản',
          noiDung: [
            'Ô tìm khớp họ tên và không cần gõ dấu: gõ “do thi huong” ra “Đỗ Thị Hường”. Ô tìm cố ý không khớp email, để màn hình này không thành chỗ tra địa chỉ thư của cả công ty. Cột Tài khoản đứng ngay cạnh Họ tên nếu bạn cần tìm theo tên tài khoản.',
          ],
          anh: ANH('quan-tri/nguoi-dung.png', 'Danh sách người dùng.'),
        },
        {
          tieuDe: 'Tạo tài khoản mới',
          noiDung: [
            'Bấm Tạo người dùng. Biểu mẫu chỉ có bốn ô, giống nhau cho cả sáu vai trò: vai trò, họ tên, tên tài khoản và email. Không có ô “người quản lý”, vì ai xử lý hồ sơ của ai được chọn ngay trên từng hồ sơ.',
            'Không có mật khẩu mặc định. Hệ thống gửi thư mời tới email đã khai, và liên kết trong thư là đường duy nhất để tài khoản có mật khẩu. Hãy đọc kỹ ô email trước khi bấm Tạo, vì thư gửi nhầm địa chỉ nghĩa là người khác đặt được mật khẩu.',
            'Email phải thuộc tên miền công ty đã khai lúc cài đặt. Miền con thì được (an@hn.nutricare.vn), nhưng nutricare.com.vn không phải miền con của nutricare.vn mà là một tên miền khác. Gõ địa chỉ ngoài danh sách thì màn hình báo lỗi ngay dưới ô email và không tạo tài khoản.',
            'Nên tạo theo thứ tự Trưởng bộ phận, Kế toán, Sale Admin, Trình dược viên. Trình dược viên chỉ gửi duyệt được khi đã có ít nhất một Trưởng bộ phận và một Kế toán đã kích hoạt để chọn.',
          ],
          anh: ANH('quan-tri/tao-nguoi-dung.png', 'Hộp thoại Tạo người dùng với bốn ô.'),
        },
        {
          tieuDe: 'Sửa, gửi lại thư mời',
          noiDung: [
            'Bấm Xem rồi Sửa thông tin (nút chỉ hiện ở tài khoản chưa kích hoạt). Tài khoản chưa kích hoạt sửa được họ tên, tên tài khoản, email và vai trò; bấm Lưu thì thư mời cũ chết ngay và một thư mới đi tới email đang có trong ô, kể cả khi bạn chỉ sửa họ tên. Dùng khi gõ sai email lúc tạo.',
            'Tài khoản đã kích hoạt chỉ sửa được họ tên. Vai trò, tên tài khoản và email khoá từ lúc kích hoạt.',
            'Gửi lại thư mời chỉ hiện với tài khoản chưa kích hoạt, và làm liên kết cũ chết ngay. Liên kết trong thư hết hạn sau 72 giờ.',
          ],
        },
        {
          tieuDe: 'Vô hiệu hoá và bàn giao',
          noiDung: [
            'Bấm Vô hiệu hoá ở dòng tài khoản. Hộp thoại tự đếm tài khoản đang giữ bao nhiêu hồ sơ và khách hàng, kèm mã để bạn đọc trước khi quyết định.',
            'Chọn người nhận bàn giao: bắt buộc nếu còn hồ sơ hoặc khách hàng, và phải cùng vai trò, đang hoạt động, đã kích hoạt. Hồ sơ và khách hàng chuyển sang người đó nguyên trạng thái, kể cả bản Nháp và hồ sơ đang có hiệu lực. Người nhận nhận một thư báo.',
            'Cuối cùng gõ lại tên đăng nhập của tài khoản bị vô hiệu hoá. Dùng tên đăng nhập chứ không phải họ tên, vì họ tên có thể trùng. Người đó bị đăng xuất và không đăng nhập lại được trong vòng một phút.',
            'Bật lại tài khoản không hỏi gì, nhưng không trả lại hồ sơ hay khách hàng đã bàn giao. Bàn giao là một chiều.',
          ],
          anh: ANH('quan-tri/vo-hieu-hoa.png', 'Hộp thoại Vô hiệu hoá tài khoản: số hồ sơ và khách hàng sẽ chuyển, người nhận và ô gõ lại tên đăng nhập.'),
        },
      ],
      loiThuong: [
        {
          hoi: 'Tôi muốn đổi vai trò của một người?',
          traLoi: 'Tài khoản chưa kích hoạt thì sửa được: Xem, rồi Sửa thông tin. Tài khoản đã kích hoạt thì không đổi trực tiếp được, vì hồ sơ ghi thẳng tên người xử lý nên đổi vai trò sẽ bỏ rơi các hồ sơ đang chờ họ. Hãy vô hiệu hoá tài khoản cũ kèm bàn giao, rồi tạo tài khoản mới.',
        },
        {
          hoi: 'Người dùng nói không nhận được thư mời?',
          traLoi: 'Kiểm tra email đã khai đúng chưa. Nếu gõ sai thì Xem, Sửa thông tin để sửa (thư mới tự đi). Nếu đúng thì bấm Gửi lại thư mời. Nếu vẫn không tới, xem thẻ Thư & hàng đợi ở trang Vận hành để biết thư có bị gửi hỏng không.',
        },
      ],
    },
    {
      id: 'khach-hang',
      duong: '/khach-hang',
      ten: 'Khách hàng',
      mucDich: 'Tra cứu khách hàng, và đổi Trình dược viên phụ trách của một khách hàng.',
      khoi: ['Danh sách khách hàng.', 'Chi tiết khách hàng, có nút Đổi TDV phụ trách.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Tra cứu khách hàng',
          noiDung: [
            'Danh sách bày mọi khách hàng. Bạn xem được thông tin nhưng không sửa được. Chỉ Trình dược viên phụ trách mới sửa thông tin khách hàng.',
            'Phần CSBH của khách hàng không hiện với bạn, vì hồ sơ không thuộc phạm vi của Quản trị.',
          ],
          anh: ANH('quan-tri/khach-hang.png', 'Danh sách khách hàng của Quản trị hệ thống.'),
        },
        {
          tieuDe: 'Đổi Trình dược viên phụ trách',
          noiDung: [
            'Mở chi tiết khách hàng, bấm Đổi TDV phụ trách và chọn người mới. Đây là quyền riêng của Quản trị.',
            'Mọi hồ sơ của khách hàng đi theo khách hàng sang người mới, trừ hồ sơ đã xoá, để người tiếp quản đọc được lịch sử chính sách của khách đó.',
          ],
          anh: ANH('quan-tri/khach-hang-chi-tiet.png', 'Trang chi tiết khách hàng với nút Đổi TDV phụ trách.'),
        },
      ],
    },
    {
      id: 'san-pham',
      duong: '/san-pham',
      ten: 'Sản phẩm',
      mucDich: 'Giữ danh mục sản phẩm, nhóm sản phẩm và giá bán Công ty.',
      khoi: ['Hai thẻ Sản phẩm và Nhóm sản phẩm.', 'Ô tìm theo tên và ô chọn nhóm.', 'Nút Nhập từ Excel và Thêm sản phẩm.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Làm nhóm sản phẩm trước',
          noiDung: [
            'Mỗi sản phẩm phải thuộc một nhóm, và quy định chiết khấu cũng khai theo nhóm. Chưa có nhóm nào thì nút Thêm sản phẩm không bấm được, nên hãy làm thẻ Nhóm sản phẩm trước.',
            'Không xoá được nhóm đang có sản phẩm. Xoá một nhóm đòi gõ lại mã nhóm, vì hai nhóm trùng tên là chuyện có thật.',
          ],
          anh: ANH('quan-tri/nhom-san-pham.png', 'Thẻ Nhóm sản phẩm.'),
        },
        {
          tieuDe: 'Thêm sản phẩm',
          noiDung: [
            'Bấm Thêm sản phẩm, điền mã vật tư, tên, nhóm và giá bán Công ty. Giá bắt buộc ngay khi tạo, và ngày áp dụng luôn là hôm nay. Mã vật tư không sửa được sau khi tạo vì hồ sơ CSBH đã lập đóng băng mã này.',
            'Danh mục chỉ có một loại giá là giá bán Công ty. Giá bán buôn do Trình dược viên nhập trong từng hồ sơ, không khai ở đây.',
          ],
          anh: ANH('quan-tri/them-san-pham.png', 'Hộp thoại Thêm sản phẩm.'),
        },
        {
          tieuDe: 'Sửa, đổi giá, đổi nhóm, vô hiệu hoá',
          noiDung: [
            'Mọi lượt Sửa đều đòi gõ lại mã vật tư, vì màn hình này đổi được giá và giá đóng băng vào mọi hồ sơ gửi duyệt từ lúc ấy. Mở hộp Sửa không ghi gì, chỉ bấm Lưu mới ghi, và chỉ khi con số thật sự khác.',
            'Lịch sử giá ở cuối hộp thoại Sửa giữ đủ mọi lần, kể cả nhiều lần trong một ngày. Dòng có nhãn Đang áp dụng là giá hiện hành.',
            'Đổi nhóm sản phẩm là đổi quy định chiết khấu áp cho sản phẩm. Hồ sơ chứa sản phẩm đó mà ngưỡng hoặc quy định khác đi sẽ hiện trong khối Yêu cầu cập nhật của người phụ trách.',
            'Vô hiệu hoá chỉ chặn hồ sơ lập mới, hồ sơ cũ giữ nguyên số đã đóng băng. Không có đường xoá hẳn một sản phẩm. Bật lại thì không đòi gì.',
          ],
        },
        {
          tieuDe: 'Nhập và ngừng bán hàng loạt từ Excel',
          noiDung: [
            'Bấm Nhập từ Excel, tải file mẫu về. File chứa toàn bộ danh mục hiện tại, có 5 cột: mã vật tư, tên sản phẩm, mã nhóm, giá bán Công ty và “Đang có hiệu lực” là một ô chọn Đang bán hoặc Ngừng bán. File phải chứa đủ mọi mã đang có.',
            'Sửa trên file rồi tải lên. Hệ thống không ghi ngay mà hiện bảng xem trước các thay đổi, gõ lại GHI DE để xác nhận. Ô giá để trống nghĩa là giữ nguyên giá cũ.',
            'Bỏ một dòng khỏi file nghĩa là ngừng bán sản phẩm đó, và bảng xem trước liệt kê rõ để bạn khỏi bỏ nhầm. Không xoá được sản phẩm qua đường nhập.',
          ],
          anh: ANH('quan-tri/nhap-excel.png', 'Hộp thoại Nhập sản phẩm từ Excel.'),
        },
      ],
      loiThuong: [
        {
          hoi: 'Nút Thêm sản phẩm bị xám?',
          traLoi: 'Danh mục chưa có nhóm sản phẩm nào. Mở thẻ Nhóm sản phẩm và tạo ít nhất một nhóm trước.',
        },
      ],
    },
    {
      id: 'chiet-khau',
      duong: '/chiet-khau',
      ten: 'Chiết khấu',
      mucDich: 'Khai ngưỡng chiết khấu để cảnh báo khi lập hồ sơ.',
      khoi: ['Bảng quy định chiết khấu với hai ô lọc Nhóm sản phẩm và Loại khách hàng.', 'Nút Thêm quy định, và Sửa, Xoá ở mỗi dòng.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Hiểu một quy định',
          noiDung: [
            'Mỗi quy định là một ngưỡng chiết khấu cho một phạm vi: một nhóm sản phẩm, một loại khách hàng, hoặc cả hai. Ô để trống nghĩa là mọi giá trị. Đây là nguồn ngưỡng duy nhất: sản phẩm không có quy định nào phủ thì dòng hồ sơ của nó không có ngưỡng.',
            'Nhiều quy định cùng khớp một tình huống là bình thường. Quy định cụ thể hơn thắng: nhóm sản phẩm mạnh hơn loại khách hàng. Khi bằng nhau thì quy định mới hơn thắng.',
            'Vượt ngưỡng không bị chặn, chỉ được đánh dấu đỏ cho người duyệt nhìn thấy.',
          ],
          anh: ANH('quan-tri/chiet-khau.png', 'Trang Chiết khấu.'),
        },
        {
          tieuDe: 'Thêm quy định',
          noiDung: [
            'Bấm Thêm quy định. Mã quy định do bạn đặt, nên đặt mã đọc được và nói lên phạm vi, ví dụ CK-SUA-L1, vì mã này hiện lại trong cột QĐCK của từng dòng hồ sơ. Mã không phân biệt hoa thường và không sửa được sau khi tạo.',
            'Khai trùng đúng phạm vi và đúng ngày hiệu lực với một dòng đã có thì hệ thống từ chối. Hãy sửa ngưỡng của dòng đang có, hoặc khai ngày hiệu lực muộn hơn để đè lên. Ô để trống cũng tính là trùng.',
          ],
          anh: ANH('quan-tri/them-quy-dinh.png', 'Hộp thoại Thêm quy định chiết khấu.'),
        },
        {
          tieuDe: 'Sửa và xoá',
          noiDung: [
            'Sửa và xoá không làm đổi hồ sơ đã lập, vì mỗi dòng hồ sơ giữ ngưỡng đã chụp lúc lập. Thay đổi chỉ áp cho hồ sơ lập từ đây về sau.',
            'Xoá đòi gõ lại mã quy định. Hồ sơ đã gửi duyệt còn dùng quy định ấy sẽ hiện trong khối Yêu cầu cập nhật của người phụ trách, với ngưỡng mới là rỗng. Hệ thống không gửi thư báo việc này.',
          ],
        },
      ],
    },
    {
      id: 'van-ban-mau',
      duong: '/van-ban-mau',
      ten: 'Văn bản mẫu',
      mucDich: 'Quản lý các mẫu Word mà bản mềm hồ sơ và hợp đồng được dựng từ đó.',
      khoi: ['Ba thẻ: Hồ sơ mẫu đầy đủ, Hồ sơ mẫu rút gọn, Mẫu hợp đồng.', 'Ở mỗi dòng: Xem, Vô hiệu hoá (hoặc Dùng lại).'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Ba thẻ mẫu',
          noiDung: [
            'Hồ sơ mẫu đầy đủ là bản nội bộ để duyệt và trình ký, có đủ cột kể cả giá thu về và tỷ lệ chiết khấu. Hồ sơ mẫu rút gọn là bản đưa khách hàng, không in ba con số tính ngược ra chiết khấu. Mẫu hợp đồng dùng khi xuất hợp đồng.',
            'Ba mẫu mặc định có sẵn từ lúc cài đặt, tên kết thúc bằng “(bản mặc định)”. Bạn muốn dùng mẫu riêng thì tải mẫu của mình lên rồi vô hiệu hoá mẫu mặc định. Nó nằm im, không tự hiện lại.',
          ],
          anh: ANH('quan-tri/van-ban-mau.png', 'Thẻ Hồ sơ mẫu đầy đủ.'),
        },
        {
          tieuDe: 'Thêm một mẫu mới',
          noiDung: [
            'Ở thẻ tương ứng, bấm nút Tải mẫu (ví dụ “Tải mẫu hồ sơ đầy đủ”). Chọn tệp Word (.docx), đặt tên cho mẫu hoặc để trống để lấy tên tệp. Phần mềm đọc các ô trống {{…}} trong tệp và đoán sẵn nguồn dữ liệu cho từng ô, phần lớn mẫu ánh xạ xong ngay.',
            'Bảng sản phẩm thì chỉ đặt ô {{bang_san_pham}}, đừng vẽ bảng bằng tay. Phần mềm dựng bảng theo đúng số cột CPBH của từng hồ sơ và các cột bạn chọn.',
            'Soát lại bảng ánh xạ rồi bấm Lưu. Khổ giấy lấy từ chính tệp Word: soạn ngang thì bản mềm ra ngang.',
          ],
          anh: ANH('quan-tri/tai-mau.png', 'Trang thêm mẫu: chọn tệp Word và bảng các ô dữ liệu có thể đặt.'),
        },
        {
          tieuDe: 'Xem, vô hiệu hoá và dùng lại',
          noiDung: [
            'Xem mở chi tiết mẫu: các cột bảng sản phẩm, từng ô trống lấy dữ liệu từ đâu, và nút tải tệp gốc về để sửa trong Word rồi tải lên thành mẫu mới.',
            'Mẫu không xoá được, chỉ vô hiệu hoá, vì xoá một mẫu là lấy đi một cách in của mọi hồ sơ. Bản mềm đã lưu trong hồ sơ không bị ảnh hưởng, nó là một tệp PDF cố định. Cột Trạng thái cho biết mẫu nào đang dùng được; Dùng lại để bật lại.',
          ],
        },
        {
          tieuDe: 'Mẫu hợp đồng',
          noiDung: [
            'Mẫu hợp đồng làm giống hệt mẫu hồ sơ, chỉ khác là không có mục bắt buộc nào. Nếu công ty không có mẫu hợp đồng nào đang áp dụng thì Kế toán và Sale Admin không xuất được hợp đồng, và Sale Admin thấy cảnh báo đỏ trên Tổng quan.',
          ],
          anh: ANH('quan-tri/mau-hop-dong.png', 'Thẻ Mẫu hợp đồng.'),
        },
      ],
      loiThuong: [
        {
          hoi: 'Lưu mẫu báo thiếu mục bắt buộc?',
          traLoi: 'Mẫu hồ sơ đầy đủ phải có một số mục tối thiểu của tờ CSBH. Trang thêm mẫu nói mục nào còn thiếu. Thêm ô trống tương ứng vào tệp Word rồi tải lại.',
        },
      ],
    },
    {
      id: 'thong-ke',
      duong: '/thong-ke',
      ten: 'Thống kê',
      mucDich: 'Xem hoạt động của hệ thống theo kỳ.',
      khoi: ['Bốn nút Tuần, Tháng, Quý, Năm.', 'Các biểu đồ hoạt động của hệ thống, đếm từ nhật ký.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Đọc hoạt động theo kỳ',
          noiDung: [
            'Quản trị không thấy con số hồ sơ nào, vì hồ sơ không thuộc phạm vi dữ liệu của vai trò này và mọi ô sẽ là 0 gây hiểu nhầm. Thay vào đó là hoạt động của hệ thống theo kỳ, đếm từ nhật ký trong cửa sổ 6 tháng gần nhất.',
          ],
          anh: ANH('quan-tri/thong-ke.png', 'Trang Thống kê của Quản trị hệ thống.'),
        },
      ],
    },
    {
      id: 'nhat-ky',
      duong: '/nhat-ky',
      ten: 'Nhật ký',
      mucDich: 'Tra ai đã làm gì, lúc nào, và đã đổi giá trị nào.',
      khoi: ['Sáu ô lọc: từ ngày, đến ngày, người thực hiện, hành động, đối tượng, địa chỉ IP.', 'Nút Xem thay đổi ở những dòng có sửa dữ liệu.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Tra nhật ký',
          noiDung: [
            'Nhật ký giữ 6 tháng gần nhất và mở mặc định ở tháng này. Cột Người thực hiện hiện họ tên, dòng nhỏ bên dưới là tên đăng nhập và vai trò.',
            'Bấm Xem thay đổi ở những dòng có sửa dữ liệu để đọc giá trị trước và sau, kèm lý do. Bấm mã tra cứu để xem cả chuỗi: một thao tác của người dùng thường sinh ra nhiều dòng ở nhiều phần khác nhau của hệ thống, và mã này nối chúng lại.',
            'Nhật ký chỉ đọc tại chỗ, không có nút xuất file. Khi người dùng báo lỗi, hãy hỏi họ đang làm gì và lúc mấy giờ, rồi tìm theo tên tài khoản và thời gian.',
          ],
          anh: ANH('quan-tri/nhat-ky.png', 'Trang Nhật ký với các ô lọc.'),
        },
      ],
    },
    {
      id: 'van-hanh',
      duong: '/van-hanh',
      ten: 'Vận hành',
      mucDich: 'Trông coi phần mềm mà không cần vào máy chủ: hệ thống có ổn không, ổ đĩa còn bao nhiêu, bản sao lưu nằm đâu.',
      khoi: ['Sáu thẻ: Sức khoẻ, Ổ đĩa, Sao lưu, Tệp log, Thư & hàng đợi, Lịch tự động.'],
      chiTiet: true,
      buoc: [
        {
          tieuDe: 'Sức khoẻ',
          noiDung: [
            'Thẻ mở sẵn. Phần đầu là danh sách việc cần chú ý, mỗi dòng có nút Xem dẫn thẳng tới thẻ để xử lý. Không có việc gì thì trang ghi “Mọi thứ đang hoạt động bình thường”. Trang tự làm mới mỗi 15 giây, và nhãn thẻ đếm số việc cần chú ý.',
            'Phần dưới là bốn ô số và bảng thành phần hệ thống kèm trạng thái.',
          ],
          anh: ANH('quan-tri/van-hanh-suc-khoe.png', 'Thẻ Sức khoẻ khi có việc cần chú ý. Số liệu minh hoạ từ môi trường chạy thử.'),
        },
        {
          tieuDe: 'Ổ đĩa',
          noiDung: [
            'Cho biết mức dùng của ổ dữ liệu và ổ bản sao ngoài, đường 30 ngày gần nhất và dự báo “đầy sau khoảng N ngày”.',
            'Có một ngưỡng cảnh báo, mặc định 80%. Khi mức dùng vừa vượt ngưỡng, mọi Quản trị nhận một thư và một thông báo trên chuông, không lặp lại mỗi giờ.',
          ],
          anh: ANH('quan-tri/van-hanh-o-dia.png', 'Thẻ Ổ đĩa: mức dùng, dự báo ngày đầy và ngưỡng cảnh báo.'),
        },
        {
          tieuDe: 'Sao lưu',
          noiDung: [
            'Hai khối: Cơ sở dữ liệu và Kho tệp (bản scan, bản mềm, giấy tờ, văn bản mẫu). Mỗi khối có lịch tự động sửa ngay tại chỗ: tần suất, giờ chạy và giữ tối đa bao nhiêu bản. Có nút Sao lưu ngay.',
            'Giảm số bản giữ lại thì không xoá gì lúc bấm Lưu, lượt chạy kế tiếp mới dọn bản cũ nhất. Muốn có chỗ trống ngay thì bấm Xoá từng bản. Bản mới nhất không xoá được để luôn còn ít nhất một bản phục hồi.',
            'Nút Sao lưu ngay đôi khi bị xám kèm dòng “Máy chủ chưa sẵn sàng nhận lệnh”. Sao lưu theo lịch vẫn chạy bình thường, bạn chỉ cần báo người vận hành máy chủ.',
          ],
          anh: ANH('quan-tri/van-hanh-sao-luu.png', 'Thẻ Sao lưu.'),
        },
        {
          tieuDe: 'Tệp log',
          noiDung: [
            'Xem nhật ký hoạt động hôm nay của từng thành phần, lọc theo lỗi hoặc cảnh báo, hoặc tìm theo mã tra cứu ở mọi thành phần. Bên dưới là danh sách các tệp nén theo ngày để tải về hoặc xoá, và lịch nén.',
          ],
          anh: ANH('quan-tri/van-hanh-tep-log.png', 'Thẻ Tệp log.'),
        },
        {
          tieuDe: 'Thư và hàng đợi',
          noiDung: [
            'Danh sách thư gửi hỏng, có nút Gửi lại, cùng các sự kiện đang chờ gửi đi hoặc xử lý hỏng. Thẻ này cũng là chỗ đổi hạn xử lý hồ sơ, tính bằng ngày.',
          ],
          anh: ANH('quan-tri/van-hanh-thu-hang-doi.png', 'Thẻ Thư & hàng đợi, với dữ liệu minh hoạ của môi trường chạy thử.'),
        },
        {
          tieuDe: 'Lịch tự động',
          noiDung: [
            'Mọi việc định kỳ ở một chỗ: lịch, số bản giữ, lần chạy cuối, kết quả và nút Sửa, kèm lịch sử các lượt chạy. Phục hồi dữ liệu từ bản sao lưu không làm trên trang này, đó là việc của người vận hành máy chủ.',
          ],
          anh: ANH('quan-tri/van-hanh-lich.png', 'Thẻ Lịch tự động.'),
        },
      ],
      loiThuong: [
        {
          hoi: 'Tôi nhận thư cảnh báo ổ đĩa, làm gì?',
          traLoi: 'Mở thẻ Ổ đĩa để xem hạng mục nào chiếm nhiều chỗ và dự báo ngày đầy, rồi báo người vận hành máy chủ. Bạn có thể xoá bớt bản sao lưu cũ ở thẻ Sao lưu và tệp log cũ ở thẻ Tệp log.',
        },
      ],
    },
  ],
};

export const HUONG_DAN_THEO_VAI_TRO: Record<VaiTro, HuongDanVaiTro> = {
  TDV,
  TBP,
  KE_TOAN,
  SALE_ADMIN,
  BAN_LANH_DAO,
  QUAN_TRI,
};

/** Vai trò lạ (phiên hỏng) thì không có hướng dẫn riêng: chỉ phần chung. */
export const huongDanCua = (vaiTro: string | undefined): HuongDanVaiTro | null =>
  vaiTro && vaiTro in HUONG_DAN_THEO_VAI_TRO
    ? HUONG_DAN_THEO_VAI_TRO[vaiTro as VaiTro]
    : null;

/** Mọi tệp ảnh được nhắc tới — để ca kiểm đòi chúng tồn tại. */
export const moiAnh = (): string[] => {
  const ra: string[] = [];
  for (const h of Object.values(HUONG_DAN_THEO_VAI_TRO)) {
    for (const t of h.trang) for (const b of t.buoc ?? []) if (b.anh) ra.push(b.anh.tep);
  }
  return ra;
};
