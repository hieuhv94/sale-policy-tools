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
    notification: ['policy.#', 'catalog.#', 'customer.#', 'sla.#'],
    document: ['policy.scan_discarded', 'policy.rejected'],
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
     */
    reporting: ['policy.#', 'customer.#'],
  },
} as const;

export const RABBITMQ_URL = (): string => process.env.RABBITMQ_URL ?? 'amqp://rabbitmq:5672';
