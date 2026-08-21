/**
 * **Xuất Excel** — tạo việc, hỏi lại tới khi xong, rồi tải về (`0077`).
 *
 * Tách khỏi `BaoCao.tsx`, nơi cả chu trình này từng nằm thẳng trong thân trang.
 * Lý do tách không phải gọn gàng: từ `0077` màn hình **Hồ sơ** mới là chỗ xuất
 * file, vì chỉ ở đó mới có bộ lọc để mà xuất *kết quả tìm kiếm*.
 *
 * XUẤT THEO ĐÚNG BỘ LỌC ĐANG ÁP. Trước đợt này nút ở trang Báo cáo gửi lên `{}`,
 * tức là xuất toàn bộ phạm vi — mà máy chủ vốn nhận và tôn trọng một bộ lọc từ
 * ngày đầu (`POST /reports/exports`). Cả một khả năng đã dựng xong nằm đó không
 * ai gọi tới, còn màn hình có bộ lọc thì không có nút nào.
 *
 * KHÔNG CHẶN MÀN HÌNH (`RPT-08`): bấm xong nhận mã việc, file dựng ở máy chủ,
 * đóng màn hình giữa chừng cũng không hỏng.
 */
import { useEffect, useState } from 'react';
import { dang, layJson, taiVe } from '../lib/api.js';
import { BaoLoi } from './Chung.js';

type ViecXuat = {
  jobId: string;
  status: string;
  rowCount: number | null;
  downloadUrl: string | null;
};

export function NutXuatExcel({
  boLoc,
  tenTep = 'CSBH.xlsx',
}: {
  /** Bộ lọc gửi lên máy chủ. Rỗng nghĩa là cả phạm vi dữ liệu của người dùng. */
  boLoc: Record<string, string>;
  /**
   * Tên dùng khi máy chủ KHÔNG đặt tên — đường lùi, không phải tên thật.
   *
   * Tên thật là `CSBH_20260821_143012.xlsx` do máy chủ đặt trong
   * `Content-Disposition` lúc dựng xong file (`0078`); `taiVe()` đọc header ấy
   * trước, và chỉ rơi về đây khi header vắng mặt.
   */
  tenTep?: string;
}) {
  const [viec, datViec] = useState<ViecXuat | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangTai, datDangTai] = useState(false);

  useEffect(() => {
    if (!viec || viec.status === 'XONG' || viec.status === 'LOI') return;
    const h = setTimeout(() => {
      void layJson<ViecXuat>(`/reports/exports/${viec.jobId}`)
        .then(datViec)
        .catch(() => undefined);
    }, 700);
    return () => clearTimeout(h);
  }, [viec]);

  /*
   * Đổi bộ lọc là VỨT việc đang có.
   *
   * Không có nhánh này thì người dùng bấm xuất, đổi điều kiện, rồi bấm "Tải
   * file" — và nhận về file của bộ lọc CŨ, mang đúng số dòng của một danh sách
   * không còn trên màn hình. Không có gì báo sai, chỉ có một file sai.
   */
  const khoa = JSON.stringify(boLoc);
  useEffect(() => {
    datViec(null);
    datLoi(null);
  }, [khoa]);

  const xuat = async () => {
    datLoi(null);
    try {
      datViec(await dang<ViecXuat>('/reports/exports', boLoc));
    } catch (e) {
      datLoi(e);
    }
  };

  const tai = () => {
    if (!viec?.downloadUrl) return;
    datLoi(null);
    datDangTai(true);
    /*
     * Tải qua `taiVe()`, KHÔNG phải `<a href={GOC_API + downloadUrl}>`.
     *
     * Bản trước dùng thẻ neo, và thẻ neo không gửi header `Authorization` —
     * đường tải file nằm sau `@Roles(...)` nên nó trả về 401, và trình duyệt
     * hiện một trang lỗi thay vì tải file. Đúng lỗi mà nút *Xuất hợp đồng* từng
     * mắc và `taiVe()` sinh ra để bịt; nó lọt lại ở đây vì bộ kiểm thử gọi
     * đường ấy từ phía máy chủ, nơi header luôn có sẵn.
     */
    taiVe(viec.downloadUrl, tenTep)
      .catch(datLoi)
      .finally(() => datDangTai(false));
  };

  const dangChay = viec !== null && viec.status !== 'XONG' && viec.status !== 'LOI';

  return (
    <>
      {viec?.status === 'XONG' && viec.downloadUrl ? (
        <button type="button" className="nut nut-chinh" disabled={dangTai} onClick={tai}>
          {dangTai ? 'Đang tải…' : `Tải file (${viec.rowCount} dòng)`}
        </button>
      ) : (
        <button type="button" className="nut" disabled={dangChay} onClick={() => void xuat()}>
          {dangChay ? 'Đang dựng file…' : 'Xuất Excel'}
        </button>
      )}

      {/* Lỗi hiện NGAY CẠNH nút, không ở cuối trang: nút nằm ở góc trên bên
          phải, và một dòng lỗi ở cuối trang thì người vừa bấm không nhìn thấy. */}
      {loi !== null && <BaoLoi loi={loi} />}
      {viec?.status === 'LOI' && (
        <p className="bao-loi" role="alert">
          Dựng file hỏng. Bấm <strong>Xuất Excel</strong> để thử lại.
        </p>
      )}
    </>
  );
}
