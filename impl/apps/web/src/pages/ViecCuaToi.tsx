/**
 * Trang chủ — CHỈ hồ sơ đang chờ chính người đăng nhập xử lý (NTF-07).
 *
 * Đọc `/policies/inbox`, tức là đọc THẲNG dữ liệu gốc chứ không qua read-model
 * báo cáo. Read-model trễ vài giây; một hồ sơ vừa chuyển tới bàn của người dùng
 * mà chưa hiện ở đây là việc bị bỏ sót (`RPT-14`).
 */
import { useEffect, useState } from 'react';
import { layJson } from '../lib/api.js';
import { usePhien } from '../lib/auth.js';
import { ngay } from '../lib/format.js';
import { Lien } from '../lib/router.js';
import { BaoLoi, DangTai, Nhan, Trong } from '../components/Chung.js';

type Muc = {
  id: string;
  code: string;
  customerId: string;
  versionNo: number;
  status: string;
  pendingStep: string | null;
  slaDueAt: string | null;
  overdue: boolean;
};

export function ViecCuaToi() {
  const { nguoiDung } = usePhien();
  const [muc, datMuc] = useState<Muc[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    layJson<{ items: Muc[] }>('/policies/inbox?limit=100', huy.signal)
      .then((r) => datMuc(r.items))
      .catch((e) => {
        if (huy.signal.aborted) return;
        datLoi(e);
      });
    return () => huy.abort();
  }, [lan]);

  return (
    <section className="trang">
      <h1>Việc của tôi</h1>
      <p className="mo-ta-trang">
        Hồ sơ đang chờ chính bạn xử lý, sắp theo hạn gần nhất trước.
      </p>

      {loi !== null && <BaoLoi loi={loi} thuLai={() => datLan((x) => x + 1)} />}
      {muc === null && loi === null && <DangTai />}

      {muc?.length === 0 && (
        <Trong
          tieuDe="Không có hồ sơ nào đang chờ bạn"
          moTa={
            nguoiDung?.role === 'TDV'
              ? 'Lập hồ sơ mới từ mục Hồ sơ CSBH, hoặc chờ hồ sơ được trả lại để chỉnh sửa.'
              : 'Hồ sơ sẽ hiện ở đây khi tới bước bạn phụ trách.'
          }
        />
      )}

      {muc && muc.length > 0 && (
        <ul className="danh-sach-viec">
          {muc.map((m) => (
            <li key={m.id} className={m.overdue ? 'viec qua-han' : 'viec'}>
              <Lien den={`/ho-so/${m.id}`} className="viec-lien">
                <span className="viec-ma">{m.code}</span>
                <Nhan trangThai={m.status} />
                <span className="viec-han">
                  {m.overdue ? 'Quá hạn từ ' : 'Hạn xử lý '}
                  {ngay(m.slaDueAt)}
                </span>
              </Lien>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
