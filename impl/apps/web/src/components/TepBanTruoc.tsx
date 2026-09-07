/**
 * Bản mềm và file scan của PHIÊN BẢN LIỀN TRƯỚC — chỉ đọc (`0183`, chốt 07/09).
 *
 * Khách hàng: *"khi một CSBH sửa đổi/bổ sung được TDV gửi vào luồng duyệt thì
 * vẫn cần hiển thị bản mềm và bản cứng đã lưu ở phiên bản ngay trước đó cho TBP
 * và Kế toán có thể xem và so sánh"*.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO MỘT COMPONENT RIÊNG, KHÔNG THÊM MỘT KHỐI VÀO `TepDinhKem`
 * ---------------------------------------------------------------------------
 *
 * `TepDinhKem` dựng hai khối của CHÍNH hồ sơ đang mở, và mọi đường của nó —
 * `layFileId`, `themTep`, `go` — đóng đinh vào `hoSoId` ấy. Tệp ở đây thuộc một
 * hồ sơ KHÁC, nên dùng lại là phải luồn một id thứ hai qua sáu chỗ, và mỗi chỗ
 * là một dịp gọi nhầm id — mà gọi nhầm ở đường `go` thì gỡ mất tệp của bản đã
 * ký.
 *
 * Khối này KHÔNG BAO GIỜ ghi: không vùng kéo thả, không dấu ✕, không nút tạo.
 * Đó là cả tính chất của nó, và một component riêng nói ra điều đó bằng chính
 * hình dạng của mình — cùng lối `0162` đã chọn khi mang khối *Hồ sơ pháp lý*
 * sang trang hồ sơ với `choPhepGhi={false}`.
 *
 * ---------------------------------------------------------------------------
 * MÁY CHỦ QUYẾT ĐỊNH KHỐI NÀY CÓ MẶT HAY KHÔNG
 * ---------------------------------------------------------------------------
 *
 * Giao diện KHÔNG tự suy từ trạng thái hồ sơ. `policy` trả `banTruoc` = `null`
 * khi hồ sơ chưa đi trong luồng duyệt hoặc không có phiên bản trước, và đó cũng
 * chính là điều kiện mà phép nới quyền bên `document` dùng để cho đọc tệp. Hai
 * chỗ tự trả lời là hai chỗ sẽ lệch — và lệch theo hướng tệ nhất: khối hiện ra
 * rồi mỗi tệp trong nó trả 403.
 */
import { useState } from 'react';
import { layJson, taiVe } from '../lib/api.js';
import { ngayGio } from '../lib/format.js';
import { Lien } from '../lib/router.js';
import { TheTep } from './TheTep.js';
import { XemTep } from './XemTep.js';
import { useBaoLoi } from '../lib/bao-loi.js';
import type { TepDto } from './TepDinhKem.js';

export type BanTruocDto = {
  id: string;
  code: string;
  versionNo: number;
  /** CHỈ `BAN_MEM` và `SCAN` — máy chủ đã lọc, giao diện không lọc lại. */
  attachments: TepDto[];
};

type FileDto = { id: string; objectKey: string };

/**
 * Nhãn loại tệp trên từng thẻ.
 *
 * Ở `TepDinhKem` loại nằm ở TIÊU ĐỀ KHỐI nên thẻ không lặp lại nó (`0097`). Ở
 * đây ngược lại: một khối chứa cả hai loại, nên thẻ là chỗ duy nhất nói được
 * mình là bản mềm hay bản scan.
 */
const NHAN_LOAI: Record<string, string> = {
  BAN_MEM: 'Bản mềm',
  SCAN: 'File SCAN bản cứng',
};

export function TepBanTruoc({ banTruoc }: { banTruoc: BanTruocDto }) {
  const { bao } = useBaoLoi();
  const [dangChay, datDangChay] = useState<string | null>(null);
  const [dangXem, datDangXem] = useState<{
    duong: string;
    duongTai: string;
    tenTep: string;
  } | null>(null);

  /**
   * `objectKey` → `fileId`, hỏi ĐÚNG LÚC BẤM.
   *
   * Cùng lối `TepDinhKem` dùng, và cùng lý do: phần lớn lượt mở hồ sơ không tải
   * tệp nào. Đường `/files?ownerKind=POLICY&ownerId=` ở đây trỏ vào hồ sơ CŨ,
   * và máy chủ lọc danh sách ấy xuống đúng hai loại được phép (`0183`).
   */
  const layFileId = async (t: TepDto): Promise<string> => {
    const ds = await layJson<FileDto[]>(
      `/files?ownerKind=POLICY&ownerId=${encodeURIComponent(banTruoc.id)}`,
    );
    const f = ds.find((x) => x.objectKey === t.objectKey);
    if (!f) throw new Error('Không tìm thấy tệp trên kho lưu trữ.');
    return f.id;
  };

  const xem = async (t: TepDto) => {
    datDangChay(t.id);
    try {
      const fileId = await layFileId(t);
      const link = await layJson<{ url: string; fileName: string }>(`/files/${fileId}/link`);
      // `xem=1` cho đường XEM, đường TẢI thì không — chỉ lượt tải mới vào Lịch
      // sử (`0053`).
      datDangXem({
        duong: `${link.url}&xem=1`,
        duongTai: link.url,
        tenTep: link.fileName || t.fileName,
      });
    } catch (e) {
      bao(e);
    } finally {
      datDangChay(null);
    }
  };

  const tai = async (t: TepDto) => {
    datDangChay(t.id);
    try {
      const fileId = await layFileId(t);
      const link = await layJson<{ url: string; fileName: string }>(`/files/${fileId}/link`);
      await taiVe(link.url, link.fileName || t.fileName);
    } catch (e) {
      bao(e);
    } finally {
      datDangChay(null);
    }
  };

  return (
    <>
      <section className="khoi-tep khoi-ban-truoc">
        {/*
          TIÊU ĐỀ NÓI RÕ ĐÂY LÀ HỒ SƠ KHÁC, và mã hồ sơ bấm được.

          Không có dòng ấy thì hai khối bên trên và khối này trông như bốn nhóm
          tệp của cùng một hồ sơ — và người duyệt đối chiếu nhầm chính thứ họ mở
          khối này ra để đối chiếu.
        */}
        <h2>Bản mềm và bản cứng của phiên bản trước</h2>
        <p className="ghi-chu">
          Của hồ sơ <Lien den={`/ho-so/${banTruoc.id}`}>{banTruoc.code}</Lien> (phiên bản{' '}
          {banTruoc.versionNo}) — bản mà hồ sơ này thay thế. <strong>Chỉ để đối chiếu</strong>: xem
          và tải được, không sửa được.
        </p>

        {banTruoc.attachments.length === 0 ? (
          // Nói THÀNH LỜI, không ẩn khối. Một khối biến mất đọc ra là "hệ thống
          // không có tính năng này"; câu dưới đây nói đúng chuyện đã xảy ra.
          <p className="trong">
            Phiên bản trước chưa lưu bản mềm hay file scan nào — nó chưa đi tới bước Sale Admin xử
            lý.
          </p>
        ) : (
          <div className="luoi-tep">
            {banTruoc.attachments.map((t) => (
              <TheTep
                key={t.id}
                tenTep={t.fileName}
                // Loại ĐỨNG TRƯỚC mốc thời gian: câu hỏi đầu tiên ở khối này là
                // "đây là bản mềm hay bản scan", không phải "lưu lúc nào".
                phu={`${NHAN_LOAI[t.kind] ?? t.kind} · ${ngayGio(t.uploadedAt)}`}
                duongXem={null}
                dangChay={dangChay === t.id}
                choPhepGo={false}
                xem={() => void xem(t)}
                tai={() => void tai(t)}
                go={() => undefined}
              />
            ))}
          </div>
        )}
      </section>

      {dangXem && (
        <XemTep
          tieuDe={dangXem.tenTep}
          duong={dangXem.duong}
          duongTai={dangXem.duongTai}
          tenTep={dangXem.tenTep}
          dong={() => datDangXem(null)}
        />
      )}
    </>
  );
}
