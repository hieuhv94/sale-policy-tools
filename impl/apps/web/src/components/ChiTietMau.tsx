/**
 * **Chi tiết văn bản mẫu** — bảng ánh xạ, tập cột, và nút lấy file về (`0150`).
 *
 * Trước lượt này, một mẫu đã lưu là HỘP ĐEN. Bảng quản trị hiện tên, khổ giấy,
 * ngày sửa, trạng thái — và thao tác duy nhất là vô hiệu hoá. Không có đường nào
 * xem lại ô trống nào lấy trường nào, không có đường nào lấy file `.docx` về.
 *
 * Chỗ hở ấy KHÔNG phải một tính năng bị bỏ quên, và đó là điều đáng ghi: `0067`
 * bỏ hẳn việc sửa mẫu với lý do viết thẳng trong migration — *"muốn đổi thì XOÁ
 * đi và thêm mẫu mới"* — rồi `0098` bỏ luôn quyền xoá, vì mẫu đã đóng băng vào
 * hồ sơ. Đường thoát mà `0067` dựa vào bị lấy đi, và không ai để ý rằng khi ấy
 * không còn đường nào cả.
 *
 * CHỈ ĐỌC. Sửa mẫu vẫn là thứ không có: sửa một mẫu đã gắn vào hồ sơ đã ký là
 * sửa chính văn bản đã duyệt. Muốn đổi thì tải mẫu mới lên rồi vô hiệu mẫu cũ —
 * và nút *Tải file .docx* ở đây là bước đầu tiên của việc ấy.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { layJson, taiVe } from '../lib/api.js';
import { ngayGio } from '../lib/format.js';
import { NHAN_KHO, NHAN_KHOA, type KhoGiay } from '../lib/mau-hop-dong.js';
import { BaoLoi, DangTai, HopThoai } from './Chung.js';
import { useBaoLoi } from '../lib/bao-loi.js';

type ChiTiet = {
  id: string;
  name: string;
  paperSize: KhoGiay | null;
  fileId: string;
  updatedAt: string;
  voHieuHoaLuc: string | null;
  nhanCot: string[] | null;
  anhXa: { placeholder: string; source: string }[];
};

/**
 * Tên nguồn dữ liệu, dịch sang tiếng Việt khi biết.
 *
 * Không biết thì hiện NGUYÊN mã khoá chứ không đoán: một khoá lạ ở đây nghĩa là
 * mẫu mang một nguồn mà bảng từ vựng của giao diện chưa biết, và bịa ra một cái
 * tên nghe hợp lý cho nó là giấu mất đúng thứ người đọc cần thấy.
 */
const nhanNguon = (khoa: string): string => NHAN_KHOA[khoa] ?? khoa;

/**
 * Một ô nhãn–giá trị trong khối tóm tắt.
 *
 * Bản sao của `O` trong `ChiTietHoSo` — hàm ấy là hàm cục bộ, không xuất ra. Ba
 * dòng, và `<div>` bọc là bắt buộc chứ không phải thói quen: lưới CSS của
 * `.tom-tat-nhom dl` xếp theo phần tử con, nên `<dt>` với `<dd>` trần thành hai
 * ô rời nhau ở hai hàng khác nhau.
 */
function O({ nhan, children }: { nhan: string; children: ReactNode }) {
  return (
    <div>
      <dt>{nhan}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function ChiTietMau({
  mau,
  duong,
  dong,
}: {
  mau: { id: string; name: string };
  /** `/policy-templates` hoặc `/contract-templates`. */
  duong: string;
  dong: () => void;
}) {
  const { bao } = useBaoLoi();
  const [ct, datCt] = useState<ChiTiet | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangTai, datDangTai] = useState(false);

  useEffect(() => {
    const huy = new AbortController();
    layJson<ChiTiet>(`${duong}/${mau.id}/chi-tiet`, huy.signal)
      .then(datCt)
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [duong, mau.id]);

  /**
   * Lấy file `.docx` gốc về.
   *
   * Đi qua `/files/:id/link` rồi mới tải nội dung (`DOC-09`) — cùng đường với
   * mọi tệp khác, và không có URL công khai nào trên kho lưu trữ để mà đặt thẳng
   * một thẻ neo.
   */
  const taiFile = async () => {
    if (!ct) return;
    datDangTai(true);
    try {
      const link = await layJson<{ url: string; fileName: string }>(`/files/${ct.fileId}/link`);
      await taiVe(link.url, link.fileName || `${ct.name}.docx`);
    } catch (e) {
      bao(e);
    } finally {
      datDangTai(false);
    }
  };

  return (
    <HopThoai tieuDe={`Văn bản mẫu — ${mau.name}`} dong={dong} co="rong">
      {loi !== null ? (
        <BaoLoi loi={loi} />
      ) : ct === null ? (
        <DangTai />
      ) : (
        <>
          <div className="tom-tat">
            <section className="tom-tat-nhom">
              <dl>
                <O nhan="Khổ giấy">{ct.paperSize ? NHAN_KHO[ct.paperSize] : '—'}</O>
                <O nhan="Cập nhật lúc">{ngayGio(ct.updatedAt)}</O>
                <O nhan="Trạng thái">
                  {ct.voHieuHoaLuc ? (
                    <span className="nhan nhan-thuong">Đã vô hiệu</span>
                  ) : (
                    <span className="nhan nhan-tot">Đang dùng</span>
                  )}
                </O>
              </dl>
            </section>
          </div>

          {/*
            TẬP CỘT đứng TRƯỚC bảng ánh xạ, và không phải để cho đẹp.

            `{{bang_san_pham}}` là MỘT dòng trong bảng ánh xạ, nhưng nó nở ra
            thành mười cột hay bốn cột tuỳ chính tập cột này — đó là khác biệt
            lớn nhất giữa bản nội bộ và bản đưa khách hàng. Đọc bảng ánh xạ
            trước rồi mới thấy tập cột là đọc ngược chiều.
          */}
          <h3 className="tieu-de-nhom-xem-truoc">Cột của bảng sản phẩm</h3>
          <p className="ghi-chu">
            {ct.nhanCot === null
              ? 'Mẫu này không đặt tập cột riêng — bảng sản phẩm in ĐỦ mọi cột.'
              : ct.nhanCot.join(' · ')}
          </p>

          <h3 className="tieu-de-nhom-xem-truoc">Ô trống và nguồn dữ liệu</h3>
          {ct.anhXa.length === 0 ? (
            <p className="ghi-chu">
              Mẫu này <strong>không có ô trống nào</strong> — nó in ra đúng một nội dung cố định.
            </p>
          ) : (
            <div className="khung-cuon" role="region" aria-label="Ô trống và nguồn" tabIndex={0}>
              <table className="bang">
                <thead>
                  <tr>
                    <th scope="col">Ô trống trên file</th>
                    <th scope="col">Lấy dữ liệu từ</th>
                  </tr>
                </thead>
                <tbody>
                  {ct.anhXa.map((a) => (
                    <tr key={a.placeholder}>
                      <td>
                        <code>{a.placeholder}</code>
                      </td>
                      <td>{nhanNguon(a.source)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="nhom-nut">
            <button type="button" className="nut" disabled={dangTai} onClick={() => void taiFile()}>
              {dangTai ? 'Đang tải…' : 'Tải file .docx'}
            </button>
            <button type="button" className="nut nut-nhe" onClick={dong}>
              Đóng
            </button>
          </div>
        </>
      )}
    </HopThoai>
  );
}
