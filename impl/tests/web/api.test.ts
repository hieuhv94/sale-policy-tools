/**
 * @vitest-environment jsdom
 *
 * FE-32 · FE-33 — mất mạng và token hết hạn.
 *
 * Hai tình huống này quyết định người dùng có mất công nhập lại hay không, và
 * cả hai đều khó thử bằng tay nên rất dễ làm sai mà không ai biết.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoiApi, dangKyHetPhien, datPhien, goi } from '@csbh/web/api';

const phanHoi = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  datPhien(null);
});

describe('FE-32 mất mạng giữa chừng', () => {
  it('phân biệt được với lỗi nghiệp vụ', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const loi = await goi('/policies').catch((e: unknown) => e);
    expect(loi).toBeInstanceOf(LoiApi);
    // `laLoiMang` là thứ màn hình dùng để nói "dữ liệu bạn nhập vẫn còn nguyên".
    // Gộp chung với lỗi 400 là bắt người dùng nhập lại hồ sơ 20 dòng vì rớt sóng.
    expect((loi as LoiApi).laLoiMang).toBe(true);
    expect((loi as LoiApi).status).toBe(0);
  });

  it('lỗi nghiệp vụ KHÔNG bị coi là lỗi mạng', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(phanHoi(409, { code: 'POLICY_LOCKED' })));
    const loi = (await goi('/policies').catch((e: unknown) => e)) as LoiApi;
    expect(loi.laLoiMang).toBe(false);
    expect(loi.code).toBe('POLICY_LOCKED');
  });

  it('service phía sau chết (502) tính là lỗi mạng', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(phanHoi(502, { code: 'UPSTREAM_UNAVAILABLE' })));
    const loi = (await goi('/policies').catch((e: unknown) => e)) as LoiApi;
    expect(loi.laLoiMang).toBe(true);
  });

  it('mang theo mã tra cứu để người dùng đọc cho bộ phận hỗ trợ', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(phanHoi(500, { code: 'X' }, { 'x-trace-id': 'trace-abc' })),
    );
    const loi = (await goi('/policies').catch((e: unknown) => e)) as LoiApi;
    expect(loi.traceId).toBe('trace-abc');
  });
});

describe('FE-33 token hết hạn khi đang mở biểu mẫu', () => {
  it('tự làm mới MỘT lần rồi chạy lại request', async () => {
    datPhien({ accessToken: 'cu', refreshToken: 'r1' });
    const f = vi
      .fn()
      .mockResolvedValueOnce(phanHoi(401, { code: 'TOKEN_EXPIRED' }))
      .mockResolvedValueOnce(phanHoi(200, { accessToken: 'moi', refreshToken: 'r2' }))
      .mockResolvedValueOnce(phanHoi(200, { ok: true }));
    vi.stubGlobal('fetch', f);

    await expect(goi<{ ok: boolean }>('/policies')).resolves.toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(3);
    // Lần chạy lại phải mang token MỚI.
    expect((f.mock.calls[2]![1] as RequestInit).headers).toMatchObject({
      authorization: 'Bearer moi',
    });
  });

  it('năm request cùng nhận 401 chỉ gọi làm mới MỘT lần', async () => {
    datPhien({ accessToken: 'cu', refreshToken: 'r1' });
    let soLanLamMoi = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (String(url).endsWith('/auth/refresh')) {
          soLanLamMoi++;
          return Promise.resolve(phanHoi(200, { accessToken: 'moi', refreshToken: 'r2' }));
        }
        const h = (init?.headers ?? {}) as Record<string, string>;
        return Promise.resolve(
          h['authorization'] === 'Bearer moi'
            ? phanHoi(200, { ok: true })
            : phanHoi(401, { code: 'TOKEN_EXPIRED' }),
        );
      }),
    );

    await Promise.all([1, 2, 3, 4, 5].map(() => goi('/policies')));
    // Không gộp thì năm lời gọi xoay vòng token song song; bốn cái sau dùng
    // token đã bị thu hồi và cả phiên bị đá ra.
    expect(soLanLamMoi).toBe(1);
  });

  it('làm mới cũng hỏng thì báo hết phiên, KHÔNG tự xoá dữ liệu đang nhập', async () => {
    datPhien({ accessToken: 'cu', refreshToken: 'r1' });
    const baoHetPhien = vi.fn();
    dangKyHetPhien(baoHetPhien);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          String(url).endsWith('/auth/refresh')
            ? phanHoi(401, { code: 'REFRESH_INVALID' })
            : phanHoi(401, { code: 'TOKEN_EXPIRED' }),
        ),
      ),
    );

    const loi = (await goi('/policies').catch((e: unknown) => e)) as LoiApi;
    expect(loi.code).toBe('PHIEN_HET_HAN');
    expect(baoHetPhien).toHaveBeenCalled();
  });
});
