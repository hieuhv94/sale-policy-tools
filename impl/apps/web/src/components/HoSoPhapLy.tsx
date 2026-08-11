/**
 * Hồ sơ pháp lý của khách hàng — giấy phép kinh doanh, chứng chỉ hành nghề…
 *
 * Danh sách đọc từ `document` (`GET /files?ownerKind=CUSTOMER&ownerId=`) chứ
 * không từ `GET /customers/:id/documents`: bản của `customer` không trả về mã
 * file, mà không có mã file thì không xin được đường tải. Hai bảng vẫn được ghi
 * đủ khi tải lên — `customer` giữ siêu dữ liệu nghiệp vụ, `document` giữ file
 * thật (`customers.service.ts:263`).
 *
 * Hệ thống KHÔNG cảnh báo giấy tờ hết hạn — đó là điểm đã chốt là không làm
 * (muc 16 của hướng dẫn sử dụng). Màn hình này chỉ lưu và lấy lại.
 */
import { useCallback, useEffect, useState } from 'react';
import { dang, guiTep, layJson, taiVe } from '../lib/api.js';
import { ngayGio } from '../lib/format.js';
import { BaoLoi, DangTai, HopThoai, Truong } from './Chung.js';

type TepPhapLy = {
  id: string;
  fileName: string;
  purpose: string;
  sizeBytes: string;
  uploadedAt: string;
};

export function HoSoPhapLy({ khachHangId, choPhepGhi }: { khachHangId: string; choPhepGhi: boolean }) {
  const [ds, datDs] = useState<TepPhapLy[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);
  const [moTai, datMoTai] = useState(false);
  const [dangChay, datDangChay] = useState<string | null>(null);

  const taiLai = useCallback(() => datLan((x) => x + 1), []);

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    layJson<TepPhapLy[]>(`/files?ownerKind=CUSTOMER&ownerId=${khachHangId}`, huy.signal)
      .then(datDs)
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [khachHangId, lan]);

  const tai = async (t: TepPhapLy) => {
    datLoi(null);
    datDangChay(t.id);
    try {
      const link = await layJson<{ url: string; fileName: string }>(`/files/${t.id}/link`);
      await taiVe(link.url, link.fileName || t.fileName);
    } catch (e) {
      datLoi(e);
    } finally {
      datDangChay(null);
    }
  };

  return (
    <>
      <h2>Hồ sơ pháp lý</h2>

      {choPhepGhi && (
        <div className="nhom-nut">
          <button type="button" className="nut nut-nhe" onClick={() => datMoTai(true)}>
            Tải hồ sơ lên
          </button>
        </div>
      )}

      {loi !== null && <BaoLoi loi={loi} thuLai={taiLai} />}

      {!ds ? (
        <DangTai />
      ) : ds.length === 0 ? (
        <p className="trong">Chưa có hồ sơ pháp lý nào.</p>
      ) : (
        <ul className="danh-sach-tep">
          {ds.map((t) => (
            <li key={t.id}>
              <span>{t.fileName}</span>
              <span className="phu">{ngayGio(t.uploadedAt)}</span>
              <button
                type="button"
                className="nut nut-nhe"
                disabled={dangChay === t.id}
                onClick={() => tai(t)}
              >
                {dangChay === t.id ? 'Đang tải…' : 'Tải xuống'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {moTai && (
        <HopThoaiTaiPhapLy
          khachHangId={khachHangId}
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

function HopThoaiTaiPhapLy({
  khachHangId,
  dong,
  xong,
}: {
  khachHangId: string;
  dong: () => void;
  xong: () => void;
}) {
  const [loai, datLoai] = useState('GIAY_PHEP_KINH_DOANH');
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
      const f = await guiTep<{ objectKey: string; sizeBytes: string }>(
        `/files?ownerKind=CUSTOMER&ownerId=${khachHangId}&purpose=PHAP_LY` +
          `&fileName=${encodeURIComponent(tep.name)}`,
        form,
      );
      // Ghi con trỏ ở `customer` nữa: file thật do `document` giữ, còn phân loại
      // nghiệp vụ thuộc về hồ sơ khách hàng.
      await dang(`/customers/${khachHangId}/documents`, {
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
    <HopThoai tieuDe="Tải hồ sơ pháp lý" dong={dong}>
      <form onSubmit={gui}>
        <Truong id="pl-loai" nhan="Loại giấy tờ" bắtBuộc>
          {(p) => (
            <select {...p} className="o-nhap" value={loai} onChange={(e) => datLoai(e.target.value)}>
              <option value="GIAY_PHEP_KINH_DOANH">Giấy phép kinh doanh</option>
              <option value="CHUNG_CHI_HANH_NGHE">Chứng chỉ hành nghề</option>
              <option value="GIAY_TO_TUY_THAN">Giấy tờ tuỳ thân</option>
              <option value="KHAC">Khác</option>
            </select>
          )}
        </Truong>
        <Truong id="pl-tep" nhan="Tệp" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              type="file"
              onChange={(e) => datTep(e.target.files?.[0] ?? null)}
            />
          )}
        </Truong>
        <p className="ghi-chu">
          Tối đa 20MB. Hệ thống <strong>không</strong> cảnh báo giấy tờ hết hạn — phải tự theo dõi.
        </p>

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
