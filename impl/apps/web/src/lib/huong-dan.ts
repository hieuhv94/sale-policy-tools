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
 * hình nói thẳng điều đó thay vì để một mục trống. Các vai trò khác TDV đang ở
 * trạng thái này, viết dần theo từng chặng.
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
      'Đổi mật khẩu hoặc sửa họ tên: bấm tên của bạn ở góc trên bên phải. Họ tên bạn tự sửa được; email và vai trò thì chỉ Quản trị hệ thống đổi.',
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
  gioiThieu: 'Bạn là người ký số duyệt hồ sơ CSBH mà Trình dược viên gửi lên, hoặc trả lại để họ chỉnh sửa.',
  lamGi: ['Ký số duyệt hồ sơ được chọn gửi tới bạn.', 'Trả lại hồ sơ kèm lý do để Trình dược viên chỉnh sửa.', 'Hoàn duyệt: rút lại chữ ký của chính mình ở các bước sau.'],
  khongLam: ['Không lập hồ sơ, không xuất hợp đồng.', 'Chỉ thấy hồ sơ được chọn gửi tới bạn.'],
  ngayLamViec: ['Mở Tổng quan, xử lý các hồ sơ ở “Việc của tôi”.', 'Ký hoặc trả lại từng hồ sơ.', 'Xem Thống kê để theo dõi từng Trình dược viên.'],
  trang: [
    trangChuaViet('tong-quan', 'Tổng quan', 'Việc đang chờ bạn ký.', '/'),
    trangChuaViet('duyet-ho-so', 'Duyệt một hồ sơ', 'Đọc hồ sơ, ký hoặc trả lại.', '/ho-so'),
    trangChuaViet('thong-ke', 'Thống kê', 'Theo dõi kết quả từng Trình dược viên.', '/thong-ke'),
  ],
};

const KE_TOAN: HuongDanVaiTro = {
  tieuDe: 'Hướng dẫn cho Kế toán',
  gioiThieu: 'Bạn tiếp nhận hồ sơ hai lần, xuất hợp đồng và có thể yêu cầu in lại bản cứng.',
  lamGi: ['Tiếp nhận lần 1 (duyệt bản mềm) và lần 2 (duyệt bản cứng).', 'Xuất hợp đồng.', 'Trả lại hồ sơ kèm lý do, hoặc yêu cầu Sale Admin in lại.'],
  khongLam: ['Không lập hồ sơ.', 'Chỉ thấy hồ sơ đã từng tới bàn bạn, tức sau khi Trưởng bộ phận ký.'],
  ngayLamViec: ['Mở Tổng quan, xử lý các hồ sơ ở “Việc của tôi”.', 'Tiếp nhận lần 1 và xuất hợp đồng.', 'Khi bản cứng về, tiếp nhận lần 2 để hồ sơ có hiệu lực.'],
  trang: [
    trangChuaViet('tong-quan', 'Tổng quan', 'Việc đang chờ bạn tiếp nhận.', '/'),
    trangChuaViet('tiep-nhan', 'Tiếp nhận và xuất hợp đồng', 'Hai lần tiếp nhận, xuất hợp đồng.', '/ho-so'),
    trangChuaViet('thong-ke', 'Thống kê', 'Theo dõi số liệu theo kỳ.', '/thong-ke'),
  ],
};

const SALE_ADMIN: HuongDanVaiTro = {
  tieuDe: 'Hướng dẫn cho Sale Admin',
  gioiThieu: 'Bạn in bản mềm, tải File SCAN bản cứng và bàn giao hồ sơ cho Kế toán tiếp nhận lần 2.',
  lamGi: ['Tạo và lưu bản mềm bằng mẫu hồ sơ đầy đủ.', 'Tải File SCAN bản cứng, rồi bàn giao.', 'Xuất hợp đồng.', 'Sửa bản cứng khi Kế toán yêu cầu in lại.'],
  khongLam: ['Không lập hồ sơ, không ký duyệt.'],
  ngayLamViec: ['Mở Tổng quan, xử lý các hồ sơ ở “Việc của tôi”.', 'Tạo bản mềm, in, thu bản cứng và tải bản scan.', 'Bàn giao hồ sơ.'],
  trang: [
    trangChuaViet('tong-quan', 'Tổng quan', 'Việc đang chờ bạn xử lý, cảnh báo thiếu mẫu hợp đồng.', '/'),
    trangChuaViet('ban-giao', 'Bản mềm, bản scan và bàn giao', 'Chuẩn bị đủ hai tệp rồi bàn giao.', '/ho-so'),
    trangChuaViet('thong-ke', 'Thống kê', 'Theo dõi số liệu theo kỳ.', '/thong-ke'),
  ],
};

const BAN_LANH_DAO: HuongDanVaiTro = {
  tieuDe: 'Hướng dẫn cho Ban lãnh đạo',
  gioiThieu: 'Bạn xem toàn bộ tình hình CSBH và bình luận trên hồ sơ. Bạn không có nút ghi nào.',
  lamGi: ['Xem sức khoẻ luồng duyệt, hồ sơ đang tắc ở bước nào.', 'Xem Thống kê và từng Trình dược viên, xuất Excel.', 'Bình luận trên hồ sơ.'],
  khongLam: ['Không lập, không duyệt, không sửa gì.', 'Không nhận thư và thông báo.', 'Không vào Nhật ký hệ thống.'],
  ngayLamViec: ['Mở Tổng quan để xem tình hình chung.', 'Vào Thống kê khi cần xem chi tiết theo kỳ hoặc theo người.'],
  trang: [
    trangChuaViet('tong-quan', 'Tổng quan', 'Tình hình chung của luồng duyệt.', '/'),
    trangChuaViet('thong-ke', 'Thống kê', 'Biểu đồ theo kỳ, theo từng Trình dược viên, xuất Excel.', '/thong-ke'),
  ],
};

const QUAN_TRI: HuongDanVaiTro = {
  tieuDe: 'Hướng dẫn cho Quản trị hệ thống',
  gioiThieu: 'Bạn quản lý người dùng, danh mục, văn bản mẫu và giữ cho hệ thống chạy ổn định. Bạn không tham gia duyệt hồ sơ.',
  lamGi: ['Tạo tài khoản, vô hiệu hoá, đổi Trình dược viên phụ trách khách.', 'Quản lý sản phẩm, giá, chiết khấu.', 'Quản lý văn bản mẫu.', 'Theo dõi Nhật ký và Vận hành.'],
  khongLam: ['Không lập, không duyệt hồ sơ và không thấy danh sách hồ sơ.'],
  ngayLamViec: ['Mở Tổng quan, xem thư hỏng và cảnh báo.', 'Xử lý yêu cầu về tài khoản, danh mục.', 'Xem trang Vận hành định kỳ.'],
  trang: [
    trangChuaViet('tong-quan', 'Tổng quan', 'Thư hỏng, hoạt động hôm nay.', '/'),
    trangChuaViet('nguoi-dung', 'Người dùng', 'Tạo và quản lý tài khoản.', '/nguoi-dung'),
    trangChuaViet('san-pham-chiet-khau', 'Sản phẩm và Chiết khấu', 'Danh mục, giá, quy định chiết khấu.', '/san-pham'),
    trangChuaViet('van-ban-mau', 'Văn bản mẫu', 'Mẫu hồ sơ và hợp đồng.', '/van-ban-mau'),
    trangChuaViet('nhat-ky', 'Nhật ký', 'Vết các thao tác trong hệ thống.', '/nhat-ky'),
    trangChuaViet('van-hanh', 'Vận hành', 'Sức khoẻ hệ thống, sao lưu, ổ đĩa.', '/van-hanh'),
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
