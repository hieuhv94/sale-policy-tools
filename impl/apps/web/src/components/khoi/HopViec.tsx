/**
 * Hộp việc — hồ sơ đang chờ CHÍNH người đăng nhập xử lý.
 *
 * Đọc `/policies/inbox`, tức đọc THẲNG dữ liệu gốc chứ không qua read-model báo
 * cáo. Read-model trễ vài giây; một hồ sơ vừa chuyển tới bàn người dùng mà chưa
 * hiện ở đây là việc bị bỏ sót (`RPT-14`). Các ô đếm phía trên thì ngược lại —
 * trễ vài giây không sao.
 */
import { ngay } from '../../lib/format.js';
import { Lien } from '../../lib/router.js';
import { Nhan, Trong } from '../Chung.js';

export type MucViec = {
  id: string;
  code: string;
  customerId: string;
  versionNo: number;
  status: string;
  pendingStep: string | null;
  slaDueAt: string | null;
  overdue: boolean;
};

export function DanhSachViec({
  muc,
  trongTieuDe,
  trongMoTa,
}: {
  muc: MucViec[];
  trongTieuDe: string;
  trongMoTa?: string;
}) {
  if (muc.length === 0) {
    return <Trong tieuDe={trongTieuDe} {...(trongMoTa === undefined ? {} : { moTa: trongMoTa })} />;
  }

  return (
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
  );
}
