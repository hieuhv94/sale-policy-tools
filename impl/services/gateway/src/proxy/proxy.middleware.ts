/**
 * Chuyển tiếp request tới service phía sau, và làm bốn việc xuyên suốt mà không
 * service nào nên phải tự lo: giới hạn tần suất, gắn số phiên bản, nối `trace_id`,
 * và ghi lại nỗ lực vượt quyền.
 *
 * KHÔNG kiểm quyền ở đây. Gateway chỉ ĐỌC token đủ để biết đang đếm tần suất cho
 * ai; quyết định cho phép hay không vẫn nằm ở từng service, nơi biết luật nghiệp
 * vụ. Nhân bản phép kiểm quyền lên gateway là tạo ra hai nguồn sự thật, và bên
 * sai sẽ là bên nới lỏng.
 */
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getKeyPair, JWT, TRACE_HEADER, traceIdFrom } from '@csbh/http-kit';
import { verifyJwt } from '@csbh/identity-core';
import { resolveUpstream } from './routes.js';
import { RateLimiter, RULES, type Rule } from './rate-limit.js';
import { DeniedPublisher } from './denied.publisher.js';

const APP_VERSION = process.env.APP_VERSION ?? '0.0.0-dev';

/**
 * Trần thân request. Vượt là 413 ngay tại gateway, không chuyển tiếp.
 *
 * Cao hơn trần 20MB của `document` một chút để service kia vẫn là nơi ra thông
 * báo lỗi đúng nghiệp vụ — gateway chỉ chặn thứ lớn tới mức vô lý.
 */
const MAX_BODY = 25 * 1024 * 1024;

/**
 * Header KHÔNG được chuyển tiếp.
 *
 * `host` phải bỏ, nếu không service phía sau nhận tên miền công khai thay vì tên
 * container. `connection`, `keep-alive`, `transfer-encoding`… là header
 * hop-by-hop: chúng mô tả chặng kết nối này, không mô tả thông điệp, nên mang
 * sang chặng sau là sai theo đúng nghĩa của HTTP.
 */
const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
]);

type Req = IncomingMessage & { originalUrl?: string; ip?: string };

@Injectable()
export class ProxyMiddleware implements NestMiddleware {
  private readonly log = new Logger(ProxyMiddleware.name);

  constructor(
    private readonly limiter: RateLimiter,
    private readonly denied: DeniedPublisher,
  ) {}

  async use(req: Req, res: ServerResponse, next: () => void): Promise<void> {
    const raw = req.originalUrl ?? req.url ?? '/';
    const [path = '/', query] = splitOnce(raw, '?');

    const upstream = resolveUpstream(path);
    // Không khớp tiền tố nào → để Nest xử lý (`/healthz`, `/version`) rồi 404.
    if (!upstream) return next();

    const traceId = traceIdFrom(req.headers[TRACE_HEADER]);
    const ip = clientIp(req);
    res.setHeader(TRACE_HEADER, traceId);
    res.setHeader('x-app-version', APP_VERSION);

    const who = this.peek(req);

    const rule = ruleFor(req.method ?? 'GET', path);
    if (rule) {
      // Đăng nhập đếm theo IP: chưa có danh tính nào để đếm, và đó chính là thứ
      // đang bị dò. Xuất file đếm theo NGƯỜI: cả phòng ngồi sau một địa chỉ NAT
      // thì đếm theo IP là một người xuất file làm cả phòng bị chặn.
      const key = rule === RULES.login ? `ip:${ip ?? 'unknown'}` : `user:${who?.id ?? ip ?? 'anon'}`;
      const v = await this.limiter.hit(rule, key);
      res.setHeader('x-ratelimit-limit', String(rule.limit));
      res.setHeader('x-ratelimit-remaining', String(v.remaining));
      if (!v.allowed) {
        res.setHeader('retry-after', String(v.retryAfterSec));
        return json(res, 429, {
          code: 'RATE_LIMITED',
          message: `Quá nhiều yêu cầu. Thử lại sau ${v.retryAfterSec} giây.`,
          retryAfterSec: v.retryAfterSec,
        });
      }
    }

    let body: Buffer;
    try {
      body = await readBody(req);
    } catch {
      return json(res, 413, { code: 'BODY_TOO_LARGE' });
    }

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (HOP_BY_HOP.has(k) || v === undefined) continue;
      headers[k] = Array.isArray(v) ? v.join(', ') : v;
    }
    headers[TRACE_HEADER] = traceId;
    // Địa chỉ thật của người gọi. Service phía sau ghi nó vào nhật ký, và không
    // có dòng này thì mọi bản ghi đều mang địa chỉ của container gateway.
    if (ip) headers['x-forwarded-for'] = ip;

    const target = `${upstream.url()}${path}${query ? `?${query}` : ''}`;
    let upRes: Response;
    try {
      upRes = await fetch(target, {
        method: req.method ?? 'GET',
        headers,
        ...(body.length > 0 ? { body } : {}),
        redirect: 'manual',
      });
    } catch (e) {
      // Service phía sau đang tắt hoặc đang khởi động lại. 502 chứ không 500:
      // hai thứ đó dẫn tới hai việc phải làm khác hẳn nhau khi trực vận hành.
      this.log.error(`không gọi được ${upstream.name} tại ${target}: ${String(e)}`);
      return json(res, 502, { code: 'UPSTREAM_UNAVAILABLE', service: upstream.name });
    }

    const buf = Buffer.from(await upRes.arrayBuffer());

    if (upRes.status === 403) {
      // CHỜ ghi xong rồi mới trả lời — xem lý lẽ ở denied.publisher.ts.
      await this.denied.record({
        actorId: who?.id ?? null,
        actorRole: who?.role ?? null,
        method: req.method ?? 'GET',
        path,
        reason: reasonOf(buf, upRes),
        upstream: upstream.name,
        traceId,
        actorIp: ip,
      });
    }

    for (const [k, v] of upRes.headers.entries()) {
      if (HOP_BY_HOP.has(k.toLowerCase())) continue;
      // Không đè hai header gateway vừa đặt: `trace_id` phải là của chặng này,
      // và số phiên bản là của bản đang triển khai, không phải của từng service.
      if (k.toLowerCase() === TRACE_HEADER || k.toLowerCase() === 'x-app-version') continue;
      res.setHeader(k, v);
    }
    res.statusCode = upRes.status;
    res.end(buf);
  }

  /**
   * Đọc token đủ để biết ai đang gọi. KHÔNG từ chối khi token hỏng — việc đó là
   * của service phía sau, và trả lời hai kiểu 401 ở hai chỗ là hai thông điệp
   * lỗi phải giữ đồng bộ mãi mãi.
   */
  private peek(req: Req): { id: string; role: string | null } | undefined {
    const h = req.headers['authorization'];
    const v = Array.isArray(h) ? h[0] : h;
    if (!v?.startsWith('Bearer ')) return undefined;
    try {
      const p = verifyJwt(v.slice(7), getKeyPair().publicKey, {
        issuer: JWT.issuer,
        audience: JWT.audUser,
      });
      return { id: String(p.sub), role: typeof p['role'] === 'string' ? p['role'] : null };
    } catch {
      return undefined;
    }
  }
}

const splitOnce = (s: string, sep: string): [string, string | undefined] => {
  const i = s.indexOf(sep);
  return i === -1 ? [s, undefined] : [s.slice(0, i), s.slice(i + 1)];
};

/** Hai đường tốn kém nhất của hệ, theo đúng chữ của SEC-07 — cộng hai cửa Google của đăng nhập. */
function ruleFor(method: string, path: string): Rule | undefined {
  if (method === 'POST' && path === '/auth/login') return RULES.login;
  // Đăng nhập Google (`0241`) đếm CHUNG xô với đăng nhập mật khẩu: cùng một câu
  // hỏi (một IP thử vào bao nhiêu lần), và tách xô là nhân đôi trần cho kẻ dò.
  if (method === 'POST' && path === '/auth/google/exchange') return RULES.login;
  if (method === 'GET' && path === '/auth/google/callback') return RULES.login;
  if (method === 'POST' && path === '/reports/exports') return RULES.export;
  return undefined;
}

function clientIp(req: Req): string | null {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || null;
}

function reasonOf(buf: Buffer, res: Response): string {
  if (!res.headers.get('content-type')?.includes('json')) return 'FORBIDDEN';
  try {
    const b = JSON.parse(buf.toString('utf8')) as { code?: unknown };
    return typeof b.code === 'string' ? b.code : 'FORBIDDEN';
  } catch {
    return 'FORBIDDEN';
  }
}

function readBody(req: Req): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error('BODY_TOO_LARGE'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
