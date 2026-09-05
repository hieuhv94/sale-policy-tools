/**
 * Hồ sơ pháp lý của khách hàng — giấy phép kinh doanh, chứng chỉ hành nghề…
 *
 * Danh sách đọc từ `customer` (`GET /customers/:id/documents`) chứ không từ
 * `document`: dòng ở đây mang mã để GỠ và mang loại giấy tờ, hai thứ chỉ
 * `customer` biết. Mã file để XEM và TẢI thì tra thêm từ `document` khi cần —
 * hai bảng nối nhau bằng `objectKey` (`0069`).
 *
 * Hệ thống KHÔNG cảnh báo giấy tờ hết hạn — đó là điểm đã chốt là không làm
 * (muc 16 của hướng dẫn sử dụng). Màn hình này chỉ lưu và lấy lại.
 */
import { useCallback, useEffect, useState } from 'react';
import { dang, guiTep, layJson, taiVe, xoa } from '../lib/api.js';
import { ngayGio } from '../lib/format.js';
import { BaoLoi, DangTai, HopThoai, HopThoaiXacNhan, Truong } from './Chung.js';
import { TheTep } from './TheTep.js';
import { VungTaiLen } from './VungTaiLen.js';
import { XemTep } from './XemTep.js';
import { useBaoLoi } from '../lib/bao-loi.js';

type TepPhapLy = {
  id: string;
  kind: string;
  fileName: string;
  objectKey: string;
  sizeBytes: string;
  uploadedAt: string;
};

type FileDto = { id: string; objectKey: string };

/**
 * Nhãn bốn loại giấy tờ (`sửa 0175`, chốt 05/09).
 *
 * KHOÁ GIỮ NGUYÊN, chỉ đổi CHỮ HIỆN RA. Bốn khoá ấy đã nằm trong `doc.kind` của
 * mọi tệp đã tải lên; đổi khoá là phải viết migration cho dữ liệu cũ, và mọi tệp
 * chưa kịp chuyển sẽ rơi về nhánh `?? t.kind` — hiện ra một chuỗi in hoa gạch
 * dưới thay vì một cái tên.
 *
 * Ba nhãn đổi theo đúng chữ khách hàng dùng ở nhà thuốc: *Giấy đăng ký kinh
 * doanh* (không phải "giấy phép"), *Giấy GPP* (chứng nhận Thực hành tốt cơ sở
 * bán lẻ thuốc — thứ ngành dược gọi tắt như vậy), và *Căn cước công dân*.
 */
const NHAN_LOAI: Record<string, string> = {
  GIAY_PHEP_KINH_DOANH: 'Giấy đăng ký kinh doanh',
  CHUNG_CHI_HANH_NGHE: 'Giấy GPP',
  GIAY_TO_TUY_THAN: 'Căn cước công dân',
  KHAC: 'Khác',
};

const laAnh = (ten: string): boolean => /\.(png|jpe?g|gif|webp|bmp)$/i.test(ten);

export function HoSoPhapLy({
  khachHangId,
  choPhepGhi,
  tieuDe = 'Hồ sơ pháp lý',
  moTa,
}: {
  khachHangId: string;
  /**
   * Nhãn của mục (`0162`).
   *
   * Trang khách hàng để mặc định. Trang HỒ SƠ CSBH phải nói rõ *"của khách
   * hàng"*: ở đó đã có hai mục tệp khác — *Giấy tờ hồ sơ* và *Bản cứng* — và ba
   * cái tên gần nhau là ba cái tên người dùng đọc nhầm.
   */
  tieuDe?: string;
  /** Một dòng giải thích dưới nhãn. Bỏ trống thì không hiện gì. */
  moTa?: string;
  /**
   * Thêm và gỡ được không — CHỈ TDV phụ trách chính khách hàng này (`0069`).
   *
   * Tới `0068` là mọi vai trò ghi, cho mọi khách trong phạm vi của mình. Giấy tờ
   * pháp lý là thứ TDV xin của khách và mang về; ba vai trò kia không cầm bản
   * gốc bao giờ. Máy chủ cũng chặn đúng luật ấy, nên cờ này chỉ để không bày ra
   * một vùng tải lên chắc chắn trả 403.
   */
  choPhepGhi: boolean;
}) {
  const { bao } = useBaoLoi();
  const [ds, datDs] = useState<TepPhapLy[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);
  const [dangChay, datDangChay] = useState<string | null>(null);
  const [dangTaiLen, datDangTaiLen] = useState(false);
  const [tepMoi, datTepMoi] = useState<File | null>(null);
  const [hoiGo, datHoiGo] = useState<TepPhapLy | null>(null);
  const [duongAnh, datDuongAnh] = useState<Record<string, string>>({});
  const [dangXem, datDangXem] = useState<{ duong: string; duongTai: string; tenTep: string } | null>(
    null,
  );

  const taiLai = useCallback(() => datLan((x) => x + 1), []);

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    layJson<TepPhapLy[]>(`/customers/${khachHangId}/documents`, huy.signal)
      .then((ds) => {
        /*
         * KIỂM HÌNH DẠNG trước khi nhận (`0162`).
         *
         * Đường này trả về MẢNG TRẦN, không phải `{ items }`. Nhận nhầm một
         * object rồi `ds.map` là **ném lỗi ngay lúc dựng**, và React tháo cả cây
         * — tức là một câu trả lời sai hình dạng ở đây làm trắng CẢ TRANG.
         *
         * Trước `0162` khối này chỉ sống ở trang khách hàng, nơi nó gần như là
         * cả trang. Giờ nó còn nằm trên trang HỒ SƠ CSBH, và ở đó một khối phụ
         * không được phép kéo sập phần còn lại.
         *
         * KHÔNG nuốt lỗi (`0089`): hình dạng lạ đi vào `BaoLoi` như mọi lỗi
         * khác, chỉ khác là nó ở trong phạm vi khối này.
         */
        if (!Array.isArray(ds)) {
          throw new Error('Danh sách hồ sơ pháp lý trả về sai hình dạng');
        }
        datDs(ds);
      })
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [khachHangId, lan]);

  /**
   * Mã file bên `document`, tra từ `objectKey`.
   *
   * Hỏi ĐÚNG LÚC BẤM chứ không tải sẵn: phần lớn lượt mở màn hình khách hàng
   * không đụng tới giấy tờ nào.
   */
  const layFileId = async (t: TepPhapLy): Promise<string> => {
    const fs = await layJson<FileDto[]>(`/files?ownerKind=CUSTOMER&ownerId=${khachHangId}`);
    const f = fs.find((x) => x.objectKey === t.objectKey);
    if (!f) throw new Error('Không tìm thấy tệp trên kho lưu trữ.');
    return f.id;
  };

  // Ảnh thu nhỏ: chỉ xin liên kết cho TỆP ẢNH, và chỉ khi có — xem `TepDinhKem`.
  useEffect(() => {
    const anh = (ds ?? []).filter((t) => laAnh(t.fileName));
    if (anh.length === 0) return;
    const huy = new AbortController();
    void (async () => {
      try {
        const fs = await layJson<FileDto[]>(
          `/files?ownerKind=CUSTOMER&ownerId=${khachHangId}`,
          huy.signal,
        );
        for (const t of anh) {
          const f = fs.find((x) => x.objectKey === t.objectKey);
          if (!f || huy.signal.aborted) continue;
          const link = await layJson<{ url: string }>(`/files/${f.id}/link`, huy.signal);
          if (!huy.signal.aborted) datDuongAnh((cu) => ({ ...cu, [t.id]: `${link.url}&xem=1` }));
        }
      } catch {
        // Hỏng thì thẻ hiện đuôi file. Ảnh thu nhỏ là thứ trang trí.
      }
    })();
    return () => huy.abort();
  }, [khachHangId, ds]);

  const tai = async (t: TepPhapLy) => {
    datLoi(null);
    datDangChay(t.id);
    try {
      const link = await layJson<{ url: string; fileName: string }>(
        `/files/${await layFileId(t)}/link`,
      );
      await taiVe(link.url, link.fileName || t.fileName);
    } catch (e) {
      bao(e);
    } finally {
      datDangChay(null);
    }
  };

  const xem = async (t: TepPhapLy) => {
    datLoi(null);
    datDangChay(t.id);
    try {
      const link = await layJson<{ url: string; fileName: string }>(
        `/files/${await layFileId(t)}/link`,
      );
      // `xem=1` cho đường XEM, đường TẢI thì không — chỉ lượt tải mới vào Lịch sử.
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

  const go = async (t: TepPhapLy) => {
    datLoi(null);
    datDangChay(t.id);
    try {
      // Chỉ gỡ con trỏ ở `customer`; file bên `document` có vòng đời riêng và
      // `sys.run_retention()` dọn theo vòng đời chung.
      await xoa(`/customers/${khachHangId}/documents/${t.id}`);
      taiLai();
    } catch (e) {
      bao(e);
    } finally {
      datDangChay(null);
    }
  };

  return (
    <>
      <h2>{tieuDe}</h2>
      {moTa !== undefined && <p className="ghi-chu">{moTa}</p>}

      {loi !== null && <BaoLoi loi={loi} thuLai={taiLai} />}

      {!ds ? (
        <DangTai />
      ) : ds.length === 0 && !choPhepGhi ? (
        <p className="trong">Chưa có hồ sơ pháp lý nào.</p>
      ) : (
        <div className="luoi-tep">
          {ds.map((t) => (
            <TheTep
              key={t.id}
              tenTep={t.fileName}
              phu={`${NHAN_LOAI[t.kind] ?? t.kind} · ${ngayGio(t.uploadedAt)}`}
              duongXem={duongAnh[t.id] ?? null}
              dangChay={dangChay === t.id}
              choPhepGo={choPhepGhi}
              xem={() => void xem(t)}
              tai={() => void tai(t)}
              go={() => datHoiGo(t)}
            />
          ))}
          {choPhepGhi && (
            <VungTaiLen
              nhan="Thêm giấy tờ"
              dangTai={dangTaiLen}
              chon={(f: File) => datTepMoi(f)}
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
          tieuDe={`Gỡ "${hoiGo.fileName}"`}
          hauQua={
            <p>
              Giấy tờ này không còn trong hồ sơ khách hàng nữa. Tải lại được, nhưng phải có bản gốc
              trong tay.
            </p>
          }
          nhanNut="Gỡ giấy tờ"
          dangChay={dangChay === hoiGo.id}
          dong={() => datHoiGo(null)}
          xacNhan={() => void go(hoiGo).then(() => datHoiGo(null))}
        />
      )}

      {/*
        Chọn xong file thì HỎI LOẠI GIẤY TỜ rồi mới tải.

        Khác `TepDinhKem`: ở đó loại tệp do trạng thái hồ sơ quyết định nên chỉ
        có một đáp án, còn ở đây bốn loại đều hợp lệ và chỉ người tải mới biết
        mình đang cầm cái gì. Đoán hộ thì giấy tờ vào nhầm mục, và không màn hình
        nào sửa lại được.
      */}
      {tepMoi && (
        <HoiLoaiGiayTo
          tep={tepMoi}
          dangTai={dangTaiLen}
          dong={() => datTepMoi(null)}
          gui={async (loai) => {
            datLoi(null);
            datDangTaiLen(true);
            try {
              const form = new FormData();
              form.append('file', tepMoi);
              const f = await guiTep<{ objectKey: string; sizeBytes: string }>(
                `/files?ownerKind=CUSTOMER&ownerId=${khachHangId}&purpose=PHAP_LY` +
                  `&fileName=${encodeURIComponent(tepMoi.name)}`,
                form,
              );
              // Ghi con trỏ ở `customer` nữa: file thật do `document` giữ, còn
              // phân loại nghiệp vụ thuộc về hồ sơ khách hàng.
              await dang(`/customers/${khachHangId}/documents`, {
                kind: loai,
                fileName: tepMoi.name,
                objectKey: f.objectKey,
                sizeBytes: f.sizeBytes,
              });
              datTepMoi(null);
              taiLai();
            } catch (err) {
              bao(err);
            } finally {
              datDangTaiLen(false);
            }
          }}
        />
      )}
    </>
  );
}

function HoiLoaiGiayTo({
  tep,
  dangTai,
  dong,
  gui,
}: {
  tep: File;
  dangTai: boolean;
  dong: () => void;
  gui: (loai: string) => void;
}) {
  const [loai, datLoai] = useState('GIAY_PHEP_KINH_DOANH');
  return (
    <HopThoai tieuDe="Loại giấy tờ" dong={dong}>
      <p className="ghi-chu">
        Tệp: <strong>{tep.name}</strong>
      </p>
      <Truong id="pl-loai" nhan="Loại giấy tờ" bắtBuộc>
        {(p) => (
          <select {...p} className="o-nhap" value={loai} onChange={(e) => datLoai(e.target.value)}>
            {Object.entries(NHAN_LOAI).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
      </Truong>
      <p className="ghi-chu">Tối đa 20MB mỗi tệp.</p>
      <div className="nhom-nut">
        <button
          type="button"
          className="nut nut-chinh"
          disabled={dangTai}
          onClick={() => gui(loai)}
        >
          {dangTai ? 'Đang tải…' : 'Tải lên'}
        </button>
        <button type="button" className="nut nut-nhe" onClick={dong}>
          Huỷ
        </button>
      </div>
    </HopThoai>
  );
}
