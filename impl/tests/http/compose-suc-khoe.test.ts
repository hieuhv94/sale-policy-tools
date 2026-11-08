/**
 * `0272` — healthcheck của RabbitMQ phải nói thật về CỔNG AMQP.
 *
 * `rabbitmq-diagnostics -q ping` chỉ hỏi máy ảo Erlang có sống không: nó báo khoẻ khi ứng dụng
 * còn đang khởi động và cổng 5672 CHƯA MỞ. Mười service Node chờ `service_healthy` nên khởi
 * động vào khoảng hở ấy, nhận ECONNREFUSED, và chết (`Bus.channel()` không thử lại). Trên VPS
 * thật khoảng hở >6 giây khiến `up -d --wait` coi container đang khởi động lại là hỏng — lượt
 * cài đầu đỏ ở bước kiểm nghiệm. Trên máy phát triển khoảng hở ~2 giây nên bộ kiểm không bao
 * giờ thấy: đây là một lỗi chỉ lộ ra ở máy chậm hơn, nên chốt phải là chốt về CÁCH VIẾT.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const COMPOSE = readFileSync('deploy/compose.yml', 'utf8');
const KHOI = /\n {2}rabbitmq:\n([\s\S]*?)(?=\n {2}[a-z-]+:\n)/.exec(COMPOSE)?.[1] ?? '';
const KIEM = /^\s+test: (\[.*\])$/m.exec(KHOI.split('healthcheck:')[1] ?? '')?.[1] ?? '';

describe('`0272` healthcheck RabbitMQ', () => {
  it('rút được khối rabbitmq và lệnh healthcheck của nó — biểu thức không lạc hậu', () => {
    expect(KHOI.length).toBeGreaterThan(100);
    expect(KIEM).toContain('rabbitmq-diagnostics');
  });

  it('KHÔNG phải `ping` — nó báo khoẻ khi cổng AMQP còn đóng', () => {
    expect(KIEM).not.toMatch(/"ping"/);
  });

  it('hỏi CÁC CỔNG (`check_port_connectivity`) — khoẻ nghĩa là kết nối được', () => {
    expect(KIEM).toContain('check_port_connectivity');
  });

  it('mọi service Node chờ rabbitmq bằng `service_healthy`, không chờ `service_started`', () => {
    // Nếu ai đó đổi sang `started` thì healthcheck đúng cũng vô nghĩa.
    const prod = readFileSync('deploy/compose.prod.yml', 'utf8');
    expect(prod).toMatch(/rabbitmq: *\{ *condition: service_healthy *\}/);
    expect(prod).not.toMatch(/rabbitmq: *\{ *condition: service_started/);
  });
});
