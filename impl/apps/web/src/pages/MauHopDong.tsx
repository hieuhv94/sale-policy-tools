/**
 * Mẫu hợp đồng — chỉ Sale Admin (DOC-26).
 *
 * Mục menu này khai từ P7d mà `App.tsx` chưa bao giờ bắt đường dẫn, nên suốt bốn
 * chặng Sale Admin bấm vào mục riêng của mình và nhận "Không có màn hình nào ở
 * địa chỉ này". P11a tạm gỡ mục menu; đây là màn hình thật, và mục menu đặt lại
 * cùng lượt này — `dieu-huong.test.tsx` bắt buộc hai thứ đó đi cùng nhau.
 *
 * Ba việc, theo đúng thứ tự phải làm: tải mẫu lên → ánh xạ từng ô trống tới một
 * trường dữ liệu → ban hành. Ban hành khi còn ô chưa ánh xạ bị máy chủ chặn
 * (`TEMPLATE_INCOMPLETE`), và màn hình nói trước điều đó thay vì để người dùng
 * bấm rồi mới biết.
 */
import { useCallback, useEffect, useState } from 'react';
import { dang, dat, guiTep, layJson } from '../lib/api.js';
import { ngayGio } from '../lib/format.js';
import {
  CAU_HINH_MAU,
  DINH_DANG,
  KHO_GIAY,
  NHAN_DINH_DANG,
  NHAN_KHO,
  TIEN_TO_DONG,
  banHanhDuoc,
  nhomNguon,
  type DinhDang,
  type KhoGiay,
  type LoaiMau,
  type MauHopDong as MauDto,
  type ThongTinOTrong,
} from '../lib/mau-hop-dong.js';
import {
  BaoLoi,
  ChuThichBatBuoc,
  DangTai,
  HopThoai,
  HopThoaiXacNhan,
  Trong,
  Truong,
} from '../components/Chung.js';
import { PhanTrang } from '../components/PhanTrang.js';
import { ThemMau } from './ThemMau.js';
import { useTrangTaiCho } from '../lib/phan-trang.js';

/** Mẫu hợp đồng — Sale Admin (muc 8.2). */
export function MauHopDong() {
  return <MauVanBan loai="HOP_DONG" />;
}

/** Giấy tờ mẫu — mẫu hồ sơ CSBH, Quản trị hệ thống (muc 6.4, `0055`). */
export function GiayToMau() {
  return <MauVanBan loai="HO_SO" />;
}

function MauVanBan({ loai }: { loai: LoaiMau }) {
  const ch = CAU_HINH_MAU[loai];
  const [ds, datDs] = useState<MauDto[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);
  const [moTai, datMoTai] = useState(false);
  const [anhXa, datAnhXa] = useState<MauDto | null>(null);
  const [dangChay, datDangChay] = useState<string | null>(null);
  // Hai thao tác đổi hành vi của CẢ hệ thống nên hỏi ở mức nặng — xem hộp thoại
  // ở cuối tệp.
  const [hoi, datHoi] = useState<{ mau: MauDto; viec: 'publish' | 'deactivate' } | null>(null);

  const taiLai = useCallback(() => datLan((x) => x + 1), []);

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    layJson<MauDto[]>(ch.duong, huy.signal)
      .then(datDs)
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [lan, ch.duong]);

  // `/contract-templates` trả về MẢNG TRẦN, không phân trang ở máy chủ — và đó
  // là endpoint duy nhất còn như vậy. Khối cảnh báo trên trang Tổng quan đọc
  // chính mảng ấy để biết "đã có mẫu nào đang áp dụng chưa"; đổi nó sang
  // `{ items }` là sửa hai chỗ để đổi lấy đúng con số không, vì số mẫu hợp đồng
  // đếm trên đầu ngón tay. Cắt trang tại chỗ.
  const { trang, soTrang, doiTrang, cuaTrang } = useTrangTaiCho(ds ?? []);

  const chay = async (t: MauDto, duong: string) => {
    datLoi(null);
    datDangChay(t.id);
    try {
      await dang(`${ch.duong}/${t.id}/${duong}`);
      taiLai();
    } catch (e) {
      datLoi(e);
    } finally {
      datDangChay(null);
    }
  };

  if (loi !== null && ds === null) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (!ds) return <DangTai />;

  /*
   * Thêm mẫu là một TRANG RIÊNG, không phải hộp thoại (chốt C-03 ngày 19/08).
   *
   * Hướng dẫn đặt khoá dài hơn biểu mẫu vài lần; nhét vào hộp thoại thì phần
   * cuộn được nằm trong chính cái đang che phần còn lại của ứng dụng.
   *
   * Vẫn nằm trong cùng thành phần chứ không thêm một đường dẫn: danh sách và
   * trang thêm dùng chung `taiLai`, và tải lên xong là mở thẳng bảng ánh xạ —
   * việc bắt buộc tiếp theo, không nên bắt người dùng tự đi tìm nút.
   */
  if (moTai) {
    return (
      <ThemMau
        loai={loai}
        quayLai={() => datMoTai(false)}
        xong={(t) => {
          datMoTai(false);
          taiLai();
          datAnhXa(t);
        }}
      />
    );
  }

  /*
   * "Đã đủ mẫu chưa" hỏi theo TỪNG KHỔ GIẤY với mẫu hồ sơ (`0055`).
   *
   * Mẫu hợp đồng chỉ có một bản đang dùng; mẫu hồ sơ có một bản cho mỗi khổ, và
   * thiếu một khổ thì đúng khổ ấy hỏng còn khổ kia vẫn chạy. Một câu "chưa có
   * mẫu nào" chung cho cả hai là câu sai ở nửa số trường hợp.
   */
  const khoThieu = ch.theoKhoGiay
    ? KHO_GIAY.filter((k) => !ds.some((t) => t.isActive && t.paperSize === k))
    : [];
  const dangDung = ch.theoKhoGiay ? khoThieu.length === 0 : ds.some((t) => t.isActive);

  return (
    <section className="trang">
      <div className="dau-trang">
        <div>
          <h1>{ch.tieuDe}</h1>
          <p className="mo-ta-trang">{ch.moTa}</p>
        </div>
      </div>

      {/*
        Cảnh báo này quan trọng hơn mọi thứ khác trên màn hình: không có mẫu đang
        áp dụng thì MỌI lần Kế toán bấm Xuất hợp đồng đều hỏng, mà Kế toán không
        có quyền vào đây và cũng không đoán ra nguyên nhân. Chỉ Sale Admin chữa
        được, nên nó phải nằm ở đây và phải nằm trên đầu.
      */}
      {!dangDung && (
        <div className="bao-loi" role="alert">
          <p className="bao-loi-chinh">
            {ch.theoKhoGiay
              ? `Chưa có mẫu đang áp dụng cho khổ ${khoThieu.map((k) => NHAN_KHO[k]).join(' và ')}.`
              : 'Chưa có mẫu nào đang áp dụng.'}
          </p>
          <p className="bao-loi-phu">
            {ch.theoKhoGiay ? (
              <>
                Người dùng bấm <strong>Xem bản mềm</strong> và chọn khổ ấy sẽ nhận lỗi{' '}
                <em>chưa có văn bản mẫu phù hợp</em>, và họ không sửa được — chỉ bạn ban hành mẫu
                được.
              </>
            ) : (
              <>
                Kế toán bấm <strong>Xuất hợp đồng</strong> sẽ hỏng, và họ không sửa được — chỉ bạn
                ban hành mẫu được.
              </>
            )}
          </p>
        </div>
      )}

      <div className="nhom-nut">
        <button type="button" className="nut nut-chinh" onClick={() => datMoTai(true)}>
          Tải mẫu lên
        </button>
      </div>

      {loi !== null && <BaoLoi loi={loi} thuLai={taiLai} />}

      {ds.length === 0 ? (
        <Trong
          tieuDe={`Chưa có ${ch.tieuDe.toLowerCase()} nào`}
          moTa="Tải lên một file .docx có các ô trống dạng {{ten_o}}, rồi ánh xạ từng ô tới một trường dữ liệu."
        />
      ) : (
        <div className="khung-cuon" role="region" aria-label={ch.tieuDe} tabIndex={0}>
          <table className="bang">
            <thead>
              <tr>
                <th>Tên mẫu</th>
                {ch.theoKhoGiay && <th>Khổ giấy</th>}
                <th>Trạng thái</th>
                <th>Ban hành lúc</th>
                <th>Sửa lần cuối</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {cuaTrang.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  {ch.theoKhoGiay && <td>{t.paperSize ? NHAN_KHO[t.paperSize] : '—'}</td>}
                  <td>
                    {t.isActive ? (
                      <strong>Đang áp dụng</strong>
                    ) : t.publishedAt ? (
                      'Đã ngừng'
                    ) : (
                      'Nháp'
                    )}
                  </td>
                  <td>{t.publishedAt ? ngayGio(t.publishedAt) : '—'}</td>
                  <td>{ngayGio(t.updatedAt)}</td>
                  <td>
                    <div className="nhom-nut nhom-nut-gon">
                      <button type="button" className="nut nut-nhe" onClick={() => datAnhXa(t)}>
                        Ánh xạ trường
                      </button>
                      {t.isActive ? (
                        <button
                          type="button"
                          className="nut nut-canh-bao"
                          disabled={dangChay === t.id}
                          onClick={() => datHoi({ mau: t, viec: 'deactivate' })}
                        >
                          Ngừng dùng
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="nut nut-nhe"
                          disabled={dangChay === t.id}
                          onClick={() => datHoi({ mau: t, viec: 'publish' })}
                        >
                          Ban hành
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PhanTrang
        trang={trang}
        soTrang={soTrang}
        tong={ds?.length ?? 0}
        doiTrang={doiTrang}
        nhan="mẫu"
      />

      {hoi && (
        <HopThoaiXacNhan
          tieuDe={hoi.viec === 'publish' ? `Ban hành mẫu "${hoi.mau.name}"` : `Ngừng dùng mẫu "${hoi.mau.name}"`}
          hauQua={
            hoi.viec === 'publish' ? (
              <>
                <p>
                  Từ lúc bấm,{' '}
                  <strong>
                    {ch.theoKhoGiay
                      ? `mọi bản mềm khổ ${hoi.mau.paperSize ? NHAN_KHO[hoi.mau.paperSize] : ''}`
                      : 'mọi lượt xuất hợp đồng'}
                  </strong>{' '}
                  đều dùng mẫu này. Mẫu đang áp dụng bị thay ngay lập tức.
                </p>
                <p>
                  Hệ thống không lưu lại hợp đồng đã xuất, nên không có bản cũ để đối chiếu và không
                  có phiên bản để quay lại — muốn về mẫu cũ thì phải ban hành lại mẫu đó.
                </p>
              </>
            ) : (
              <p>
                Sau khi ngừng, <strong>không còn mẫu nào đang áp dụng</strong>
                {ch.theoKhoGiay ? ' cho khổ giấy này' : ''}:{' '}
                {ch.theoKhoGiay
                  ? 'người dùng chọn khổ ấy ở Xem bản mềm sẽ nhận lỗi chưa có văn bản mẫu phù hợp'
                  : 'kế toán và Sale Admin bấm Xuất hợp đồng sẽ không xuất được'}
                , cho tới khi có người ban hành một mẫu khác.
              </p>
            )
          }
          nhanNut={hoi.viec === 'publish' ? 'Ban hành' : 'Ngừng dùng'}
          goLai={hoi.mau.name}
          dangChay={dangChay === hoi.mau.id}
          dong={() => datHoi(null)}
          // `chay` tự nuốt lỗi và đặt `loi` của trang, nên đóng hộp thoại ở cả
          // hai đường là đúng: hỏng thì người dùng đọc lỗi trên nền trang, không
          // phải trong một hộp thoại vừa hỏi xong.
          xacNhan={() => void chay(hoi.mau, hoi.viec).then(() => datHoi(null))}
        />
      )}


      {anhXa && (
        <HopThoaiAnhXa
          loai={loai}
          mau={anhXa}
          dong={() => datAnhXa(null)}
          xong={() => {
            datAnhXa(null);
            taiLai();
          }}
        />
      )}
    </section>
  );
}

// --- Ánh xạ trường -----------------------------------------------------------

type Dong = { placeholder: string; source: string; required: boolean; format: DinhDang | '' };

function HopThoaiAnhXa({
  loai,
  mau,
  dong,
  xong,
}: {
  loai: LoaiMau;
  mau: MauDto;
  dong: () => void;
  xong: () => void;
}) {
  const ch = CAU_HINH_MAU[loai];
  const [tt, datTt] = useState<ThongTinOTrong | null>(null);
  const [bang, datBang] = useState<Dong[]>([]);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);
  const [daLuu, datDaLuu] = useState(false);

  useEffect(() => {
    const huy = new AbortController();
    layJson<ThongTinOTrong>(`${ch.duong}/${mau.id}/placeholders`, huy.signal)
      .then((r) => {
        datTt(r);
        // Một dòng cho MỌI ô trống trong file, kể cả ô chưa ánh xạ — bảng phải
        // là bức tranh đầy đủ của mẫu, không phải danh sách những gì đã làm.
        const daCo = new Map(r.mapped.map((m) => [m.placeholder, m]));
        datBang(
          r.placeholders.map((p) => {
            const m = daCo.get(p);
            return {
              placeholder: p,
              source: m?.source ?? '',
              required: m?.required ?? false,
              format: (m?.format as DinhDang | null) ?? '',
            };
          }),
        );
      })
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [mau.id]);

  const sua = (i: number, p: Partial<Dong>) =>
    datBang((cu) => cu.map((d, j) => (j === i ? { ...d, ...p } : d)));

  const guiAnhXa = () =>
    dat(`${ch.duong}/${mau.id}/mapping`, {
      // Chỉ gửi dòng đã chọn nguồn. Gửi cả dòng rỗng thì máy chủ từ chối cả lô
      // vì `source` không nằm trong danh sách nguồn hợp lệ.
      mapping: bang
        .filter((d) => d.source !== '')
        .map((d) => ({
          placeholder: d.placeholder,
          source: d.source,
          required: d.required,
          ...(d.format ? { format: d.format } : {}),
        })),
    });

  const luu = async () => {
    datLoi(null);
    datDaLuu(false);
    datDangGui(true);
    try {
      await guiAnhXa();
      datDaLuu(true);
    } catch (e) {
      datLoi(e);
    } finally {
      datDangGui(false);
    }
  };

  /**
   * LƯU trước rồi mới ban hành, trong một lần bấm.
   *
   * `publish` đọc ánh xạ đã lưu ở CSDL, không đọc bảng đang mở. Gọi thẳng
   * `publish` thì người dùng vừa điền xong cả bảng vẫn nhận `TEMPLATE_INCOMPLETE`
   * — một thông báo đúng về kỹ thuật và vô nghĩa với người đang nhìn bảng đầy đủ
   * trước mặt.
   */
  const banHanh = async () => {
    datLoi(null);
    datDangGui(true);
    try {
      await guiAnhXa();
      await dang(`${ch.duong}/${mau.id}/publish`);
      xong();
    } catch (e) {
      datLoi(e);
    } finally {
      datDangGui(false);
    }
  };

  if (loi !== null && tt === null) return null;
  if (!tt) {
    return (
      <HopThoai tieuDe={`Ánh xạ trường — ${mau.name}`} dong={dong}>
        <DangTai />
      </HopThoai>
    );
  }

  const daChon = new Set(bang.filter((d) => d.source !== '').map((d) => d.placeholder));
  const chuaAnhXa = bang.length - daChon.size;
  const duBanHanh = banHanhDuoc(
    bang.map((d) => d.placeholder),
    daChon,
  );
  const nhom = nhomNguon(tt.knownSources);

  return (
    <HopThoai tieuDe={`Ánh xạ trường — ${mau.name}`} dong={dong}>
      <p className="ghi-chu">
        Mỗi ô trống trong file phải trỏ tới một trường dữ liệu. Ô nào có tiền tố{' '}
        <code>{TIEN_TO_DONG}</code> thì dòng bảng chứa nó sẽ được{' '}
        <strong>nhân bản theo từng dòng sản phẩm</strong>.
      </p>

      {chuaAnhXa > 0 ? (
        <p className="giai-thich">
          Còn <strong>{chuaAnhXa}</strong> ô chưa ánh xạ. Ban hành được khi ánh xạ hết.
        </p>
      ) : (
        <p className="giai-thich">Đã ánh xạ hết — ban hành được.</p>
      )}

      {/*
        Mẫu hồ sơ còn một điều kiện NỮA: đủ 13 mục bắt buộc của muc 11.1 (`0055`).

        Nói ra ngay ở đây thay vì để người dùng bấm Ban hành rồi nhận 409. Danh
        sách đến từ máy chủ, không khai lại ở giao diện: hai bản sao của cùng một
        luật thì bản ở giao diện sẽ trôi, và nó trôi theo hướng nói "đủ rồi" cho
        một mẫu mà máy chủ sắp từ chối.
      */}
      {ch.theoKhoGiay && (tt.thieu?.length ?? 0) > 0 && (
        <div className="hop-canh-bao" role="status">
          <p>
            <strong>Còn thiếu {tt.thieu!.length} mục bắt buộc của bản CSBH.</strong>
          </p>
          <p className="ghi-chu">
            Bản A4 phải có đủ 13 mục ở muc 11.1. Ánh xạ thêm các trường:{' '}
            {tt.thieu!.map((n) => (
              <code key={n}>{n} </code>
            ))}
          </p>
        </div>
      )}

      {ch.theoKhoGiay && tt.coBangSanPham === false && (
        <div className="hop-canh-bao" role="status">
          <p>
            <strong>Mẫu chưa có ô bảng sản phẩm.</strong>
          </p>
          <p className="ghi-chu">
            Thêm <code>{'{{policy.lines_table}}'}</code> vào file .docx ở chỗ muốn đặt bảng. Đây là
            ô DUY NHẤT không cần ánh xạ — hệ thống thay nó bằng cả cái bảng, với đúng số cột CPBH
            của từng hồ sơ.
          </p>
        </div>
      )}

      <div className="khung-cuon" role="region" aria-label="Bảng ánh xạ trường" tabIndex={0}>
        <table className="bang">
          <thead>
            <tr>
              <th>Ô trống trong mẫu</th>
              <th>Trường dữ liệu</th>
              <th>Định dạng</th>
              <th>Bắt buộc</th>
            </tr>
          </thead>
          <tbody>
            {bang.map((d, i) => (
              <tr key={d.placeholder} className={d.source === '' ? 'chua-anh-xa' : undefined}>
                <td className="ma-phu">{d.placeholder}</td>
                <td>
                  <label className="chi-doc-man-hinh" htmlFor={`ax-nguon-${i}`}>
                    Trường dữ liệu cho {d.placeholder}
                  </label>
                  <select
                    id={`ax-nguon-${i}`}
                    className="o-nhap"
                    value={d.source}
                    onChange={(e) => sua(i, { source: e.target.value })}
                  >
                    <option value="">— Chưa chọn —</option>
                    {nhom.map((n) => (
                      <optgroup key={n.nhan} label={n.nhan}>
                        {n.nguon.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td>
                  <label className="chi-doc-man-hinh" htmlFor={`ax-dd-${i}`}>
                    Định dạng cho {d.placeholder}
                  </label>
                  <select
                    id={`ax-dd-${i}`}
                    className="o-nhap"
                    value={d.format}
                    onChange={(e) => sua(i, { format: e.target.value as DinhDang | '' })}
                  >
                    <option value="">Mặc định</option>
                    {DINH_DANG.map((f) => (
                      <option key={f} value={f}>
                        {NHAN_DINH_DANG[f]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <label className="o-danh-dau">
                    <input
                      type="checkbox"
                      checked={d.required}
                      onChange={(e) => sua(i, { required: e.target.checked })}
                    />
                    <span className="chi-doc-man-hinh">Bắt buộc — {d.placeholder}</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loi !== null && <BaoLoi loi={loi} />}
      {daLuu && (
        <p className="ghi-chu" role="status">
          Đã lưu ánh xạ.
        </p>
      )}

      <div className="nhom-nut">
        <button type="button" className="nut nut-chinh" disabled={dangGui} onClick={luu}>
          {dangGui ? 'Đang lưu…' : 'Lưu ánh xạ'}
        </button>
        <button
          type="button"
          className="nut"
          disabled={dangGui || !duBanHanh}
          onClick={banHanh}
          title={chuaAnhXa > 0 ? 'Còn ô chưa ánh xạ' : undefined}
        >
          Lưu và ban hành
        </button>
        <button type="button" className="nut nut-nhe" onClick={dong}>
          Đóng
        </button>
      </div>
    </HopThoai>
  );
}
