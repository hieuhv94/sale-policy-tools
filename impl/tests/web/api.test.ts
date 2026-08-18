/**
 * @vitest-environment jsdom
 *
 * FE-32 · FE-33 — mất mạng và token hết hạn.
 *
 * Hai tình huống này quyết định người dùng có mất công nhập lại hay không, và
 * cả hai đều khó thử bằng tay nên rất dễ làm sai mà không ai biết.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LoiApi,
  dangKyHetPhien,
  dangKyLuuPhien,
  datPhien,
  goi,
  guiTep,
  taiVe,
} from '@csbh/web/api';

const phanHoi = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  datPhien(null);
  // Gỡ móc ghi phiên: ca sau không được nhận vào mảng của ca trước (`0043`).
  dangKyLuuPhien(() => undefined);
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

describe('gửi file — multipart', () => {
  it('KHÔNG tự đặt content-type cho FormData', async () => {
    // Trình duyệt phải tự sinh header kèm `boundary`. Đặt tay
    // `multipart/form-data` không boundary thì máy chủ không tách nổi phần file,
    // và lỗi hiện ra tận trong multer với thông điệp không nhắc gì tới header.
    const f = vi.fn().mockResolvedValue(phanHoi(201, { id: 'x' }));
    vi.stubGlobal('fetch', f);

    const form = new FormData();
    form.append('file', new Blob(['abc']), 'a.xlsx');
    await guiTep('/catalog/products/import', form);

    const headers = f.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers['content-type']).toBeUndefined();
    expect(f.mock.calls[0]![1].body).toBeInstanceOf(FormData);
  });

  it('vẫn gắn token và vẫn làm mới MỘT lần khi 401 (FE-33)', async () => {
    // Đi qua `goi()` chứ không viết `fetch` thứ hai — nếu tách ra thì đường gửi
    // file mất cả làm mới token lẫn phân biệt lỗi mạng.
    datPhien({ accessToken: 'cu', refreshToken: 'r1' });
    let lan = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (String(url).endsWith('/auth/refresh')) {
          return Promise.resolve(phanHoi(200, { accessToken: 'moi', refreshToken: 'r2' }));
        }
        lan += 1;
        return Promise.resolve(lan === 1 ? phanHoi(401, { code: 'TOKEN_EXPIRED' }) : phanHoi(201, { id: 'x' }));
      }),
    );

    const form = new FormData();
    form.append('file', new Blob(['abc']), 'a.xlsx');
    await expect(guiTep<{ id: string }>('/files', form)).resolves.toEqual({ id: 'x' });
    expect(lan).toBe(2);
  });

  it('phần thân JSON vẫn được đặt content-type như cũ', async () => {
    const f = vi.fn().mockResolvedValue(phanHoi(200, { ok: true }));
    vi.stubGlobal('fetch', f);
    await goi('/policies', { method: 'POST', body: { a: 1 } });
    const headers = f.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
  });
});

describe('tải file xuống — mang theo token', () => {
  const nenTai = () => {
    // jsdom không cài `createObjectURL`, và không có `click()` thật.
    const url = 'blob:test';
    const tao = vi.fn().mockReturnValue(url);
    const thuHoi = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: tao, revokeObjectURL: thuHoi }));
    return { tao, thuHoi };
  };

  it('gọi qua fetch có Authorization, KHÔNG dùng thẻ neo', async () => {
    // Thẻ `<a href="/api/…">` không gửi header `Authorization`, và không nơi nào
    // trong gateway hay http-kit đọc cookie — một liên kết như vậy luôn nhận 401.
    // Nút "Xuất hợp đồng" đã hỏng đúng kiểu này cho tới P11a.
    nenTai();
    datPhien({ accessToken: 'abc', refreshToken: 'r1' });
    const f = vi.fn().mockResolvedValue(
      new Response('%PDF-1.4', {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
    );
    vi.stubGlobal('fetch', f);

    await taiVe('/policies/p1/contract.pdf', 'HopDong.pdf');

    const headers = f.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer abc');
  });

  it('thu hồi object URL sau khi tải, không để rò bộ nhớ', async () => {
    const { thuHoi } = nenTai();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('x', { status: 200, headers: { 'content-type': 'application/pdf' } })),
    );
    await taiVe('/policies/p1/contract.pdf', 'HopDong.pdf');
    expect(thuHoi).toHaveBeenCalledWith('blob:test');
  });

  it('lỗi nghiệp vụ khi tải vẫn là LoiApi đọc được, không phải file rỗng', async () => {
    // Nếu bỏ qua nhánh lỗi thì người dùng nhận về một file .pdf chứa JSON lỗi —
    // mở ra là hỏng, mà không có gì nói vì sao.
    nenTai();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(phanHoi(403, { code: 'FORBIDDEN' })));
    const loi = (await taiVe('/policies/p1/contract.pdf', 'x.pdf').catch((e: unknown) => e)) as LoiApi;
    expect(loi).toBeInstanceOf(LoiApi);
    expect(loi.status).toBe(403);
  });
});

// =============================================================================
// `0043` — token xoay vòng phải được GHI LẠI
//
// Refresh token dùng được đúng một lần: máy chủ xoay sang token mới ngay lần làm
// mới đầu tiên. Không ghi lại thì bản lưu mang mãi token của lần đăng nhập, và
// lần MỞ LẠI TRÌNH DUYỆT kế tiếp gửi lên một token đã dùng — máy chủ đọc ra là
// bị đánh cắp, thu hồi cả họ, người dùng vừa bị bắt đăng nhập lại vừa mất luôn
// phiên ở máy khác.
//
// Trước `0042` lỗi gần như vô hình vì phiên chết theo tab. Từ lúc phiên phải
// sống qua việc đóng trình duyệt thì nó thành đúng thứ chặn yêu cầu ấy.
// =============================================================================

describe('`0043` giữ phiên qua việc tắt rồi bật lại trình duyệt', () => {
  it('token mới sau mỗi lần làm mới được ghi lại ngay', async () => {
    const daLuu: { accessToken: string; refreshToken: string }[] = [];
    dangKyLuuPhien((p) => daLuu.push(p));
    datPhien({ accessToken: 'A1', refreshToken: 'R1' });

    let daGoiLamMoi = false;
    vi.stubGlobal(
      'fetch',
      vi.fn((duong: unknown, tuyChon?: { body?: unknown }) => {
        const d = String(duong);
        if (d.endsWith('/auth/refresh')) {
          // Máy chủ nhận token CŨ và trả về một cặp MỚI — đúng phép xoay vòng.
          expect(JSON.parse(String(tuyChon?.body)).refreshToken).toBe('R1');
          daGoiLamMoi = true;
          return Promise.resolve(phanHoi(200, { accessToken: 'A2', refreshToken: 'R2' }));
        }
        // Lời gọi đầu 401 (access token đã hết hạn), lời gọi sau thành công.
        return Promise.resolve(
          daGoiLamMoi ? phanHoi(200, { ok: true }) : phanHoi(401, { code: 'TOKEN_EXPIRED' }),
        );
      }),
    );

    await goi('/policies');

    expect(daGoiLamMoi, 'phải thử làm mới trước khi bỏ cuộc').toBe(true);
    expect(daLuu, 'token xoay vòng phải được ghi lại').toEqual([
      { accessToken: 'A2', refreshToken: 'R2' },
    ]);
  });

  it('KỊCH BẢN THẬT: đăng nhập · làm việc · tắt trình duyệt · bật lại', async () => {
    /*
     * Đây là ca dựng đúng thứ người dùng làm, và là ca đỏ trước `0043`.
     *
     * "Tắt trình duyệt" mô phỏng bằng cách xoá phiên trong bộ nhớ rồi nạp lại từ
     * kho — đúng những gì `PhienProvider` làm lúc khởi động.
     */
    const kho = new Map<string, string>();
    dangKyLuuPhien((p) => kho.set('phien', JSON.stringify(p)));

    // 1. Đăng nhập: lưu R1.
    kho.set('phien', JSON.stringify({ accessToken: 'A1', refreshToken: 'R1' }));
    datPhien({ accessToken: 'A1', refreshToken: 'R1' });

    // 2. Làm việc một lúc — access token hết hạn, hệ thống tự làm mới sang R2.
    let daXoay = false;
    vi.stubGlobal(
      'fetch',
      vi.fn((duong: unknown, tuyChon?: { body?: unknown }) => {
        const d = String(duong);
        if (d.endsWith('/auth/refresh')) {
          const gui = JSON.parse(String(tuyChon?.body)).refreshToken as string;
          // Token đã dùng thì máy chủ TỪ CHỐI — đây là phép phát hiện đánh cắp.
          if (gui !== 'R1') return Promise.resolve(phanHoi(401, { code: 'REFRESH_REUSED' }));
          daXoay = true;
          return Promise.resolve(phanHoi(200, { accessToken: 'A2', refreshToken: 'R2' }));
        }
        return Promise.resolve(daXoay ? phanHoi(200, { ok: true }) : phanHoi(401, {}));
      }),
    );
    await goi('/policies');
    expect(daXoay).toBe(true);

    // 3. TẮT TRÌNH DUYỆT: bộ nhớ mất, chỉ còn thứ đã ghi vào kho.
    datPhien(null);

    // 4. BẬT LẠI: nạp phiên từ kho, đúng như lúc khởi động.
    const luuTru = JSON.parse(kho.get('phien')!) as {
      accessToken: string;
      refreshToken: string;
    };
    expect(luuTru.refreshToken, 'kho phải giữ token MỚI, không phải token lúc đăng nhập').toBe(
      'R2',
    );
    datPhien(luuTru);
  });
});
