/**
 * **Bản cứng** — tệp đính kèm của hồ sơ: tải lên, xem, tải xuống, gỡ.
 *
 * Nhãn trên màn hình đổi từ *Tệp đính kèm* sang *Bản cứng* ở `0054`. Tên cũ tả
 * cơ chế ("đây là mấy file đính vào"), tên mới tả THỨ NGƯỜI DÙNG NHÌN THẤY: bản
 * giấy đã ký, đã scan lại. Đứng cạnh nút *Xem bản mềm* thì cặp mềm–cứng nói
 * ngay ra hai thứ khác nhau ở chỗ nào.
 *
 * Tải xuống là HAI BƯỚC ở phía máy chủ (`DOC-09`): `GET /files/:id/link` cấp một
 * token gắn với đúng người đang gọi, rồi mới tải nội dung. Không có URL công
 * khai nào trên kho lưu trữ, nên không thể chỉ đặt một thẻ neo.
 *
 * Tải lên cũng hai bước, và hai bước đó thuộc HAI SERVICE khác nhau: `document`
 * nhận file thật rồi trả `objectKey`, `policy` ghi con trỏ vào hồ sơ. Gộp lại
 * thành một là bắt `policy` đụng vào MinIO, và `document` phải biết luật nghiệp
 * vụ của hồ sơ.
 */
import { useEffect, useState } from 'react';
import { dang, guiTep, layJson, taiVe, xoa } from '../lib/api.js';
import { ngayGio } from '../lib/format.js';
import { BaoLoi, HopThoaiXacNhan } from './Chung.js';
import { TheTep } from './TheTep.js';
import { VungTaiLen } from './VungTaiLen.js';
import { XemTep } from './XemTep.js';
import { useBaoLoi } from '../lib/bao-loi.js';

export type TepDto = {
  id: string;
  kind: string;
  fileName: string;
  objectKey: string;
  uploadedAt: string;
};

type FileDto = { id: string; objectKey: string };

const NHAN_LOAI: Record<string, string> = { HO_SO: 'Hồ sơ', SCAN: 'Bản scan' };

export function TepDinhKem({
  hoSoId,
  tep,
  loaiGhiDuoc,
  choPhepXoa,
  taiLai,
}: {
  hoSoId: string;
  tep: TepDto[];
  /**
   * Loại tệp tải lên được NGAY BÂY GIỜ — vai trò AND trạng thái hồ sơ (`0048`).
   *
   * Trước đó chỗ này là một cờ chỉ xét VAI TRÒ, nên ai có quyền đính kèm cũng
   * thấy nút *Tải tệp lên* ở mọi hồ sơ — kể cả hồ sơ đang chờ duyệt hay đã quá
   * hạn, nơi máy chủ trả 409 sau khi người ta đã chọn xong file.
   *
   * Rỗng thì không có nút. Một phần tử thì hộp thoại không hỏi loại nữa — chỉ có
   * một lựa chọn thì bày ra một ô chọn là bắt người dùng xác nhận điều hiển nhiên.
   */
  loaiGhiDuoc: string[];
  choPhepXoa: boolean;
  taiLai: () => void;
}) {
  const { bao } = useBaoLoi();
  const [dangChay, datDangChay] = useState<string | null>(null);
  const [dangTaiLen, datDangTaiLen] = useState(false);
  /** Đường xem của từng tệp, xin dần để dựng ảnh thu nhỏ (`0069`). */
  const [duongAnh, datDuongAnh] = useState<Record<string, string>>({});

  /**
   * Đổi `objectKey` của dòng đính kèm sang `fileId` của `document`.
   *
   * Hỏi ĐÚNG LÚC BẤM chứ không tải sẵn cả danh sách file lúc mở màn hình: phần
   * lớn lượt xem hồ sơ không tải tệp nào, và một lời gọi thừa trên mọi lượt mở
   * để phục vụ một thao tác hiếm là đánh đổi sai.
   */
  const layFileId = async (t: TepDto): Promise<string> => {
    const ds = await layJson<FileDto[]>(`/files?ownerKind=POLICY&ownerId=${hoSoId}`);
    const f = ds.find((x) => x.objectKey === t.objectKey);
    if (!f) throw new Error('Không tìm thấy tệp trên kho lưu trữ.');
    return f.id;
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

  /** Tệp đang chờ xác nhận gỡ. */
  const [hoiGo, datHoiGo] = useState<TepDto | null>(null);

  /**
   * Tệp đang mở xem, kèm đường tải nội dung đã có token (`0051`).
   *
   * Phải xin liên kết TRƯỚC rồi mới mở hộp xem, chứ không để hộp tự xin: đường
   * `/files/:id/content` đòi một token cấp riêng cho người đang gọi (DOC-09),
   * và id của file thì phải tra từ `objectKey` — hai lời gọi mà hộp xem không
   * nên biết. Nó chỉ nhận một đường và vẽ.
   */
  const [dangXem, datDangXem] = useState<{
    duong: string;
    duongTai: string;
    tenTep: string;
  } | null>(null);

  const xem = async (t: TepDto) => {
    datDangChay(t.id);
    try {
      const fileId = await layFileId(t);
      const link = await layJson<{ url: string; fileName: string }>(`/files/${fileId}/link`);
      // `xem=1` cho đường XEM, đường TẢI thì không — chỉ lượt tải mới vào Lịch
      // sử (`0053`). Dùng chung một đường cho cả hai là mở một lối tải không để
      // lại vết nào.
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

  /*
   * Xin đường xem cho ẢNH, và chỉ cho ảnh (`0069`).
   *
   * Ảnh thu nhỏ chỉ dựng được từ nội dung thật, mà nội dung thật đòi hai lời gọi
   * (tra `fileId` rồi xin liên kết có token). Với bản scan PDF — phần lớn tệp ở
   * đây — thẻ hiện đuôi file, nên KHÔNG gọi gì cả.
   *
   * Danh sách file xin MỘT LẦN cho cả nhóm chứ không mỗi tệp một lần: nó là cùng
   * một lời gọi trả về mọi tệp của hồ sơ.
   */
  useEffect(() => {
    const anh = tep.filter((t) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(t.fileName));
    if (anh.length === 0) return;
    const huy = new AbortController();
    void (async () => {
      try {
        const ds = await layJson<FileDto[]>(
          `/files?ownerKind=POLICY&ownerId=${hoSoId}`,
          huy.signal,
        );
        for (const t of anh) {
          const f = ds.find((x) => x.objectKey === t.objectKey);
          if (!f || huy.signal.aborted) continue;
          const link = await layJson<{ url: string }>(`/files/${f.id}/link`, huy.signal);
          // `xem=1`: dựng ảnh thu nhỏ KHÔNG phải một lượt tải, nên nó không được
          // để lại dòng nào trong *Lịch sử* (`0053`).
          if (!huy.signal.aborted) {
            datDuongAnh((cu) => ({ ...cu, [t.id]: `${link.url}&xem=1` }));
          }
        }
      } catch {
        // Hỏng thì thẻ hiện đuôi file — ảnh thu nhỏ là thứ trang trí, không phải
        // đường vào duy nhất. Báo lỗi đỏ ở đây là dựng một cảnh báo cho một việc
        // không ai yêu cầu.
      }
    })();
    return () => huy.abort();
  }, [hoSoId, tep]);

  /**
   * Tải một tệp lên — hai bước ở HAI service, đúng như trước (`0069`).
   *
   * Loại tệp KHÔNG hỏi nữa: `loaiGhiDuoc` do máy chủ tính theo trạng thái hồ sơ
   * và vai trò người đang xem, và ở mọi trạng thái nó chỉ ra đúng MỘT loại. Hộp
   * thoại cũ hỏi loại là hỏi một câu chỉ có một đáp án.
   */
  const taiLen = async (f: File) => {
    const loai = loaiGhiDuoc[0];
    if (!loai) return;
    datDangTaiLen(true);
    try {
      const form = new FormData();
      form.append('file', f);
      // Tên file đi kèm ĐÃ MÃ HOÁ URL: multer giải mã theo latin1, nên tên tiếng
      // Việt qua đường `originalname` thành ký tự lạ (DOC-18).
      const x = await guiTep<{ objectKey: string; sizeBytes: string }>(
        `/files?ownerKind=POLICY&ownerId=${hoSoId}&purpose=${loai}` +
          `&fileName=${encodeURIComponent(f.name)}`,
        form,
      );
      await dang(`/policies/${hoSoId}/attachments`, {
        kind: loai,
        fileName: f.name,
        objectKey: x.objectKey,
        sizeBytes: x.sizeBytes,
      });
      taiLai();
    } catch (e) {
      bao(e);
    } finally {
      datDangTaiLen(false);
    }
  };

  const go = async (t: TepDto) => {
    datDangChay(t.id);
    try {
      // Gỡ con trỏ ở hồ sơ. File trên kho do `document` giữ và có vòng đời
      // riêng — `DELETE /files/:id` chỉ mở cho TDV và Sale Admin, nên không gọi
      // ở đây: Kế toán gỡ được tệp khỏi hồ sơ mà vẫn không xoá được file.
      await xoa(`/policies/${hoSoId}/attachments/${t.id}`);
      taiLai();
    } catch (e) {
      bao(e);
    } finally {
      datDangChay(null);
    }
  };

  return (
    <>
      <h2>Bản cứng</h2>


      {/*
        MỘT LƯỚI cho cả tệp đã có lẫn chỗ thêm tệp (`0069`).

        Bản trước là một nút *Tải tệp lên* ở trên, rồi một danh sách gạch đầu
        dòng ở dưới, mỗi dòng ba nút chữ. Người dùng phải đọc tên file để biết
        đó là cái gì — mà tệp ở đây gần như luôn là bản scan giấy tờ, tên kiểu
        `IMG_4821.jpg`.
      */}
      {tep.length === 0 && loaiGhiDuoc.length === 0 ? (
        <p className="trong">Chưa có tệp nào.</p>
      ) : (
        <div className="luoi-tep">
          {tep.map((t) => (
            <TheTep
              key={t.id}
              tenTep={t.fileName}
              phu={`${NHAN_LOAI[t.kind] ?? t.kind} · ${ngayGio(t.uploadedAt)}`}
              duongXem={duongAnh[t.id] ?? null}
              dangChay={dangChay === t.id}
              choPhepGo={choPhepXoa}
              xem={() => void xem(t)}
              tai={() => void tai(t)}
              go={() => datHoiGo(t)}
            />
          ))}

          {/*
            Vùng tải lên đứng CUỐI, cạnh những tệp đã có — chỗ để thêm nằm ngay
            sau chỗ đang có, nên không phải đi tìm nút ở đâu khác rồi quay lại.

            Chỉ hiện cho người CÓ QUYỀN: `loaiGhiDuoc` do máy chủ tính theo cả
            trạng thái hồ sơ lẫn vai trò (`0069`), nên bản cứng chỉ Sale Admin
            thấy vùng này, còn giấy tờ hồ sơ thì chỉ TDV.
          */}
          {loaiGhiDuoc.length > 0 && (
            <VungTaiLen
              nhan={`Thêm ${NHAN_LOAI[loaiGhiDuoc[0]!]?.toLowerCase() ?? 'tệp'}`}
              dangTai={dangTaiLen}
              chon={(f: File) => void taiLen(f)}
            />
          )}
        </div>
      )}

      {dangXem && (
        <XemTep
          tieuDe={dangXem.tenTep}
          duong={dangXem.duong}
          duongTai={dangXem.duongTai}
          tenTep={dangXem.tenTep}
          dong={() => datDangXem(null)}
        />
      )}

      {hoiGo && (
        <HopThoaiXacNhan
          tieuDe={`Gỡ tệp "${hoiGo.fileName}"`}
          hauQua={
            <p>
              Tệp không còn gắn với hồ sơ này nữa. Nếu đây là <strong>bản scan</strong> thì bước bàn
              giao bị chặn lại cho tới khi có bản scan mới — mà tải lại thì phải có bản giấy trong
              tay.
            </p>
          }
          nhanNut="Gỡ tệp"
          dangChay={dangChay === hoiGo.id}
          dong={() => datHoiGo(null)}
          xacNhan={() => void go(hoiGo).then(() => datHoiGo(null))}
        />
      )}

    </>
  );
}
