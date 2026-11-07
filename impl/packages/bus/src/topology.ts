/**
 * Tên exchange, queue và khoá định tuyến — khai ở MỘT chỗ.
 *
 * Bên phát và bên nhận gõ lại chuỗi giống nhau là cách kinh điển để sinh ra một
 * hệ thống chạy êm mà không sự kiện nào tới đích: RabbitMQ không báo lỗi khi
 * publish vào exchange không ai bind, thư cứ thế rơi vào hư vô.
 */
export const BUS = {
  exchange: 'csbh.events',
  /** Exchange nhận thư mà consumer từ chối hẳn — để nhìn thấy được, không để im lặng mất. */
  dlx: 'csbh.dlx',
  queues: {
    notification: 'ntf.events',
    notificationDlq: 'ntf.events.dlq',
    document: 'doc.events',
    documentDlq: 'doc.events.dlq',
    policy: 'pol.events',
    policyDlq: 'pol.events.dlq',
    audit: 'aud.events',
    auditDlq: 'aud.events.dlq',
    reporting: 'rpt.events',
    reportingDlq: 'rpt.events.dlq',
  },
  /**
   * notification nghe mọi thứ; document chỉ quan tâm vòng đời file; policy nghe
   * lại đúng một sự kiện của catalog — đổi giá sản phẩm.
   *
   * policy vừa PHÁT vừa NHẬN, và điều đó không mâu thuẫn: nó phát sự kiện về hồ
   * sơ, nhận sự kiện về danh mục. Đổi giá là việc của catalog, còn "hồ sơ nào
   * đang hiệu lực có sản phẩm đó" thì chỉ policy trả lời được (NTF-13).
   */
  bindings: {
    // `van_hanh.o_dia_vuot_nguong` (`0253`) — ĐÚNG một khoá: mọi sự kiện khác của
    // `van-hanh` là vết nhật ký, không phải thư.
    // `binh_luan.tao` / `binh_luan.sua` (`0262`) — ĐÚNG hai khoá: xoá bình luận và đổi cảm xúc
    // không sinh thông báo nào (yêu cầu 6.2), nên không nghe chúng.
    notification: [
      'policy.#',
      'catalog.#',
      'customer.#',
      'sla.#',
      'van_hanh.o_dia_vuot_nguong',
      'binh_luan.tao',
      'binh_luan.sua',
    ],
    // `policy.scan_discarded` gỡ ở `0050`: yêu cầu in lại không còn xoá bản
    // scan nữa, nên không còn sự kiện nào để nghe.
    document: ['policy.rejected'],
    /**
     * `catalog.changed` thêm ở `0029`: đổi QUY ĐỊNH CHIẾT KHẤU cũng làm hồ sơ đã
     * đóng băng lệch khỏi danh mục, đúng như đổi giá. Consumer tự lọc `entity`
     * — hàng đợi không lọc mịn hơn `catalog.#` được, và `catalog.changed` mang
     * cả thay đổi nhóm sản phẩm lẫn người ký.
     */
    policy: ['catalog.price_changed', 'catalog.changed'],
    /**
     * Nhật ký nghe TẤT CẢ. Khác với ba queue trên vốn lọc theo nhu cầu, ở đây
     * bất kỳ sự kiện nào không tới được đều là một khoảng trống trong vết —
     * và khoảng trống đó chỉ lộ ra lúc cần điều tra, tức là quá muộn.
     */
    audit: ['#'],
    /**
     * Read-model báo cáo nghe vòng đời hồ sơ và mọi thay đổi khách hàng.
     *
     * KHÔNG nghe `catalog.#`: tên và mã sản phẩm đã ĐÓNG BĂNG vào dòng hồ sơ lúc
     * lập, nên đổi danh mục không làm sai một dòng báo cáo nào. Tỉnh/thành đổi
     * tên cũng vậy — read-model giữ MÃ, tên chỉ tra lúc hiển thị (RPT-06).
     *
     * `sla.#` thêm ở `0051`, và nó là một LỖI ĐÃ SỐNG LÂU. sla-worker phát
     * `sla.overdue` khi hồ sơ quá hạn — một lần đổi trạng thái thật sự, ghi thẳng
     * vào `pol.policy` — nhưng khoá ấy không khớp `policy.#`, nên read-model
     * không bao giờ nghe thấy. Hệ quả trên màn hình:
     *
     *   - thẻ *Quá hạn* vĩnh viễn bằng 0;
     *   - hồ sơ quá hạn VẪN bị đếm vào thẻ của bước cũ, đúng thứ `0047` gỡ ra;
     *   - lọc `?status=QUA_HAN_DUYET` không ra gì;
     *   - và tệ nhất: nó còn lọt vào thẻ *Sắp quá hạn*, vì read-model vẫn giữ
     *     trạng thái chờ cũ với một mốc hạn đã trôi qua.
     *
     * Nghe cả `sla.#` chứ không riêng `sla.overdue`: binding hẹp quá là đúng
     * nguyên nhân sinh ra lỗi này, và một sự kiện `sla.*` về sau có đổi hồ sơ thì
     * cũng lại rơi vào im lặng y hệt. Đồng bộ lại một hồ sơ không đổi gì là một
     * lượt ghi thừa vô hại — rẻ hơn nhiều so với một con số sai không ai báo.
     */
    reporting: ['policy.#', 'customer.#', 'sla.#'],
  },
} as const;

export const RABBITMQ_URL = (): string => process.env.RABBITMQ_URL ?? 'amqp://rabbitmq:5672';
