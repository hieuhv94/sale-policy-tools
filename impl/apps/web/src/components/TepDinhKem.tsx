/**
 * Tệp đính kèm: tải lên, tải xuống, gỡ.
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
import { useState } from 'react';
import { dang, guiTep, layJson, taiVe, xoa } from '../lib/api.js';
import { ngayGio } from '../lib/format.js';
import { BaoLoi, HopThoai, HopThoaiXacNhan, Truong } from './Chung.js';
import { XemTep } from './XemTep.js';

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
  const [loi, datLoi] = useState<unknown>(null);
  const [dangChay, datDangChay] = useState<string | null>(null);
  const [moTai, datMoTai] = useState(false);

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
    datLoi(null);
    datDangChay(t.id);
    try {
      const fileId = await layFileId(t);
      const link = await layJson<{ url: string; fileName: string }>(`/files/${fileId}/link`);
      await taiVe(link.url, link.fileName || t.fileName);
    } catch (e) {
      datLoi(e);
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
  const [dangXem, datDangXem] = useState<{ duong: string; tenTep: string } | null>(null);

  const xem = async (t: TepDto) => {
    datLoi(null);
    datDangChay(t.id);
    try {
      const fileId = await layFileId(t);
      const link = await layJson<{ url: string; fileName: string }>(`/files/${fileId}/link`);
      datDangXem({ duong: link.url, tenTep: link.fileName || t.fileName });
    } catch (e) {
      datLoi(e);
    } finally {
      datDangChay(null);
    }
  };

  const go = async (t: TepDto) => {
    datLoi(null);
    datDangChay(t.id);
    try {
      // Gỡ con trỏ ở hồ sơ. File trên kho do `document` giữ và có vòng đời
      // riêng — `DELETE /files/:id` chỉ mở cho TDV và Sale Admin, nên không gọi
      // ở đây: Kế toán gỡ được tệp khỏi hồ sơ mà vẫn không xoá được file.
      await xoa(`/policies/${hoSoId}/attachments/${t.id}`);
      taiLai();
    } catch (e) {
      datLoi(e);
    } finally {
      datDangChay(null);
    }
  };

  return (
    <>
      <h2>Tệp đính kèm</h2>

      {loaiGhiDuoc.length > 0 && (
        <div className="nhom-nut">
          <button type="button" className="nut nut-nhe" onClick={() => datMoTai(true)}>
            Tải tệp lên
          </button>
        </div>
      )}

      {loi !== null && <BaoLoi loi={loi} />}

      {tep.length === 0 ? (
        <p className="trong">Chưa có tệp nào.</p>
      ) : (
        <ul className="danh-sach-tep">
          {tep.map((t) => (
            <li key={t.id}>
              <span className="loai">{NHAN_LOAI[t.kind] ?? t.kind}</span>
              <span>{t.fileName}</span>
              <span className="phu">{ngayGio(t.uploadedAt)}</span>
              <div className="nhom-nut nhom-nut-gon">
                {/*
                  *Xem* đứng TRƯỚC *Tải xuống* (`0051`): với bản scan thì xem là
                  việc hay làm hơn hẳn — Kế toán mở ra đối chiếu chữ ký rồi đóng
                  lại, không cần một bản sao nằm lại trong thư mục tải xuống.
                */}
                <button
                  type="button"
                  className="nut nut-nhe"
                  disabled={dangChay === t.id}
                  onClick={() => void xem(t)}
                >
                  Xem
                </button>
                <button
                  type="button"
                  className="nut nut-nhe"
                  disabled={dangChay === t.id}
                  onClick={() => tai(t)}
                >
                  {dangChay === t.id ? 'Đang tải…' : 'Tải xuống'}
                </button>
                {choPhepXoa && (
                  <button
                    type="button"
                    className="nut nut-canh-bao"
                    disabled={dangChay === t.id}
                    onClick={() => datHoiGo(t)}
                  >
                    Gỡ
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {dangXem && (
        <XemTep
          tieuDe={dangXem.tenTep}
          duong={dangXem.duong}
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

      {moTai && (
        <HopThoaiTaiTep
          hoSoId={hoSoId}
          loaiGhiDuoc={loaiGhiDuoc}
          dong={() => datMoTai(false)}
          xong={() => {
            datMoTai(false);
            taiLai();
          }}
        />
      )}
    </>
  );
}

function HopThoaiTaiTep({
  hoSoId,
  loaiGhiDuoc,
  dong,
  xong,
}: {
  hoSoId: string;
  loaiGhiDuoc: string[];
  dong: () => void;
  xong: () => void;
}) {
  // Mặc định là loại ĐẦU TIÊN máy chủ cho phép, không phải `HO_SO` cứng: ở bước
  // Sale Admin thì chỉ `SCAN` tải lên được, và mở hộp thoại ra đã chọn sẵn một
  // loại sẽ hỏng là mời người dùng bấm Gửi rồi nhận 409.
  const [loai, datLoai] = useState<string>(loaiGhiDuoc[0] ?? 'HO_SO');
  const [tep, datTep] = useState<File | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tep) return;
    datLoi(null);
    datDangGui(true);
    try {
      const form = new FormData();
      form.append('file', tep);
      // Tên file đi kèm ĐÃ MÃ HOÁ URL: multer giải mã theo latin1, nên tên tiếng
      // Việt qua đường `originalname` thành ký tự lạ (DOC-18).
      const f = await guiTep<{ objectKey: string; sizeBytes: string }>(
        `/files?ownerKind=POLICY&ownerId=${hoSoId}&purpose=${loai}` +
          `&fileName=${encodeURIComponent(tep.name)}`,
        form,
      );
      await dang(`/policies/${hoSoId}/attachments`, {
        kind: loai,
        fileName: tep.name,
        objectKey: f.objectKey,
        sizeBytes: f.sizeBytes,
      });
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe="Tải tệp lên" dong={dong}>
      <form onSubmit={gui}>
          {/*
            Chỉ bày ô chọn khi thật sự CÓ gì để chọn (`0048`). Ở bước Sale Admin
            chỉ tải được bản scan, ở hồ sơ nháp chỉ tải được tệp hồ sơ — một ô
            chọn với đúng một lựa chọn hợp lệ và một lựa chọn trả 409 thì không
            phải lựa chọn, mà là một cái bẫy.
          */}
          {loaiGhiDuoc.length > 1 ? (
            <Truong id="tep-loai" nhan="Loại tệp" bắtBuộc>
              {(p) => (
                <select {...p} className="o-nhap" value={loai} onChange={(e) => datLoai(e.target.value)}>
                  {loaiGhiDuoc.map((k) => (
                    <option key={k} value={k}>
                      {NHAN_LOAI[k] ?? k}
                    </option>
                  ))}
                </select>
              )}
            </Truong>
          ) : (
            <p className="mo-ta-truong">
              Loại tệp: <strong>{NHAN_LOAI[loai] ?? loai}</strong>
            </p>
          )}
          <Truong id="tep-file" nhan="Tệp" bắtBuộc>
            {(p) => (
              <input
                {...p}
                className="o-nhap"
                type="file"
                onChange={(e) => datTep(e.target.files?.[0] ?? null)}
              />
            )}
          </Truong>
          <p className="ghi-chu">Tối đa 20MB mỗi tệp.</p>

        {loi !== null && <BaoLoi loi={loi} />}
        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || tep === null}>
            {dangGui ? 'Đang tải…' : 'Tải lên'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}
