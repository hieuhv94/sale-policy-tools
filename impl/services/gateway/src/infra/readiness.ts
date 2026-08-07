/**
 * Gom trạng thái của mọi service phía sau vào MỘT lời gọi.
 *
 * Vì sao cần, khi từng service đã có `/healthz` riêng: người trực không đi hỏi
 * mười địa chỉ. Quan trọng hơn — bài học `archive_command` ở P5.6 — thứ giết hệ
 * thống không phải sự cố ồn ào mà là **sự cố im lặng**: một service chết trong
 * khi chín service kia vẫn xanh, và không ai biết cho tới lúc có người bấm đúng
 * chức năng đó. Một điểm hỏi duy nhất là điều kiện để giám sát bên ngoài dựng
 * được cảnh báo, vì nó chỉ cần theo dõi một URL.
 *
 * Phân biệt `/healthz` với `/readyz`, và khác biệt này là quyết định vận hành:
 *
 *   - `/healthz` — "tiến trình gateway còn sống không". Docker dùng cái này để
 *     quyết định có khởi động lại container hay không.
 *   - `/readyz` — "cả hệ có phục vụ được không". KHÔNG dùng cho healthcheck của
 *     Docker: một service phụ thuộc chết sẽ làm gateway bị khởi động lại liên
 *     tục, mà khởi động lại gateway thì không chữa được service kia.
 */
import { Injectable, Logger } from '@nestjs/common';
import { UPSTREAMS } from '../proxy/routes.js';

const TIMEOUT_MS = Number(process.env.READY_TIMEOUT_MS ?? 2000);

export type ServiceState = { service: string; ok: boolean; status?: number; error?: string };

@Injectable()
export class Readiness {
  private readonly log = new Logger(Readiness.name);

  async check(): Promise<{ ok: boolean; services: ServiceState[] }> {
    // Mỗi service chỉ hỏi MỘT lần dù có nhiều tiền tố trỏ vào nó.
    const byName = new Map<string, () => string>();
    for (const u of UPSTREAMS) if (!byName.has(u.name)) byName.set(u.name, u.url);

    // Hỏi song song: mười lời gọi nối tiếp, mỗi lời gọi chờ tối đa 2 giây, cho
    // ra một endpoint giám sát có thể mất 20 giây — dài hơn hầu hết ngưỡng chờ
    // của công cụ giám sát, nên chính nó lại báo động giả.
    const services = await Promise.all(
      [...byName.entries()].map(([name, url]) => this.one(name, url())),
    );
    return { ok: services.every((s) => s.ok), services };
  }

  private async one(service: string, base: string): Promise<ServiceState> {
    try {
      const res = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      return { service, ok: res.ok, status: res.status };
    } catch (e) {
      this.log.warn(`${service} không trả lời: ${String(e)}`);
      return { service, ok: false, error: e instanceof Error ? e.name : 'ERROR' };
    }
  }
}
