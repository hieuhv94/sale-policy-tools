/**
 * Quản trị người dùng (ONB-02) — chỉ Quản trị hệ thống.
 *
 * Hai thẻ trong MỘT màn hình: tài khoản, và cấu hình hệ thống (SLA, thư hỏng).
 *
 * KHÔNG còn thẻ "Bộ phận". Trước 0017, một TDV nối với người duyệt qua hai bước
 * gián tiếp — tạo bộ phận, gán người duyệt cho bộ phận, gán TDV vào bộ phận —
 * ba thao tác quản trị cho một quan hệ mà nghiệp vụ chỉ nhìn thấy là "TDV này do
 * ai duyệt". Giờ nó là một ô chọn trên chính biểu mẫu tạo TDV.
 */
import { useEffect, useState } from 'react';
import { dang, layJson, va } from '../lib/api.js';
import { VAI_TRO, type VaiTro } from '../lib/can.js';
import {
  NHAN_VAI_TRO,
  trangThaiTaiKhoan,
  type NguoiDungDto,
  type XemTruocBanGiao,
} from '../lib/nguoi-dung.js';
import type { NguoiChon } from '../lib/nguoi-xu-ly.js';
import {
  BaoLoi,
  ChuThichBatBuoc,
  DaiThe,
  DangTai,
  OTimKiem,
  HopThoai,
  HopThoaiXacNhan,
  ThanhHoanTac,
  Truong,
} from '../components/Chung.js';
import { PhanTrang } from '../components/PhanTrang.js';
import { useTrangMay } from '../lib/phan-trang.js';
import { TheHeThong } from '../components/quan-tri/HeThong.js';

type The = 'nguoi-dung' | 'he-thong';

export function NguoiDung() {
  const [the, datThe] = useState<The>('nguoi-dung');

  return (
    <section className="trang">
      <div className="dau-trang">
        <div>
          <h1>Người dùng</h1>
          <p className="mo-ta-trang">Tài khoản, cây phân quyền và người duyệt.</p>
        </div>
      </div>

      {/*
        Thẻ *Người dùng* KHÔNG còn ô đếm (`0049`).
        Danh sách giờ do máy chủ cắt trang, nên màn hình chỉ cầm 20 dòng và con
        số duy nhất nó biết là TỔNG SAU KHI LỌC. Dán con số ấy lên nhãn thẻ thì
        nó tụt xuống mỗi lần gõ vào ô tìm, và đọc ra như "công ty vừa mất mấy
        chục tài khoản". Tổng vẫn nói ra, ở thanh phân trang — chỗ nó đúng nghĩa.
      */}
      <DaiThe
        nhanVung="Nhóm nội dung"
        dangChon={the}
        chon={datThe}
        muc={[
          { khoa: 'nguoi-dung', nhan: 'Người dùng' },
          { khoa: 'he-thong', nhan: 'Hệ thống' },
        ]}
      />

      {the === 'nguoi-dung' && <TheNguoiDung />}
      {the === 'he-thong' && <TheHeThong />}
    </section>
  );
}

// --- Thẻ Người dùng ---------------------------------------------------------

function TheNguoiDung() {
  const [tim, datTim] = useState('');

  /*
   * TÌM VÀ CẮT TRANG Ở MÁY CHỦ (`0049`).
   *
   * Chú thích cũ ở đây bảo phải cắt tại chỗ vì các hộp thoại lấy ô chọn "Trưởng
   * bộ phận quản lý" từ chính danh sách này. LÝ DO ẤY ĐÃ CHẾT TỪ `0031` — ô chọn
   * đó không còn tồn tại, `locTbp` không nơi nào gọi, và cả hai hộp thoại vẫn
   * nhận `ds` chỉ vì chưa ai gỡ. Ba thứ đó bị gỡ cùng lượt này, nếu không người
   * đọc sau sẽ tin rằng ràng buộc vẫn còn.
   *
   * Trước `0049` màn hình này KHÔNG có ô tìm nào: nó lấy 200 tài khoản đầu rồi
   * phân trang tại chỗ. Nên đây vừa vá nợ vừa thêm chức năng.
   */
  const {
    muc: ds,
    tong,
    loi: loiTai,
    trang,
    soTrang,
    doiTrang,
    taiLai,
  } = useTrangMay<NguoiDungDto>(
    tim.trim() === '' ? '/admin/users' : `/admin/users?q=${encodeURIComponent(tim.trim())}`,
  );

  const [mo, datMo] = useState<
    | { kieu: 'tao' }
    | { kieu: 'xem'; u: NguoiDungDto }
    | { kieu: 'khoa'; u: NguoiDungDto }
    | null
  >(null);
  const [dangChay, datDangChay] = useState<string | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [thuHong, datThuHong] = useState<string | null>(null);
  /** Thao tác đang chờ xác nhận: vô hiệu hoá, hoặc gửi lại thư mời. */
  const [hoi, datHoi] = useState<{ u: NguoiDungDto; viec: 'khoa' | 'moi' } | null>(null);
  /** Việc vừa làm và cách lùi lại — chỉ dùng cho thao tác lùi được. */
  const [vuaLam, datVuaLam] = useState<{ loi: string; lui: () => void } | null>(null);

  const chay = async (id: string, fn: () => Promise<{ inviteMailSent?: boolean } | unknown>) => {
    datLoi(null);
    datThuHong(null);
    datDangChay(id);
    try {
      const kq = (await fn()) as { inviteMailSent?: boolean } | undefined;
      if (kq?.inviteMailSent === false) {
        datThuHong('Thao tác đã xong nhưng KHÔNG gửi được thư. Kiểm tra cấu hình máy chủ thư.');
      }
      taiLai();
    } catch (e) {
      datLoi(e);
    } finally {
      datDangChay(null);
    }
  };

  if (loiTai !== null && ds === null) return <BaoLoi loi={loiTai} thuLai={taiLai} />;
  if (!ds) return <DangTai />;

  return (
    <>
      {/* Góc trên bên phải của THẺ (`0071`). Tiêu đề trang bị dải thẻ ngăn cách,
          nên hàng thao tác đứng ngay đầu phần nội dung mà nó tác động — cùng quy
          ước với thẻ Sản phẩm, Nhóm và Chiết khấu. */}
      <div className="hang-thao-tac">
        <button type="button" className="nut nut-chinh" onClick={() => datMo({ kieu: 'tao' })}>
          Tạo người dùng
        </button>
      </div>
      <div className="hang-tim">
        <OTimKiem
          id="tim-nguoi-dung"
          // Chỉ họ tên. Khớp cả email thì màn hình quản trị thành chỗ dò địa chỉ
          // thư của cả công ty, và nhãn phải nói ra phạm vi để không ai kết luận
          // sai rằng tài khoản không tồn tại.
          nhan="Tìm theo họ tên"
          giaTri={tim}
          doi={datTim}
        />
        {tim.trim() !== '' && (
          <span className="ghi-chu" role="status">
            {tong} tài khoản khớp
          </span>
        )}
      </div>

      {loiTai !== null && <BaoLoi loi={loiTai} thuLai={taiLai} />}
      {loi !== null && <BaoLoi loi={loi} />}
      {thuHong !== null && (
        <div className="ghi-chu-tra-lai" role="status">
          <p>
            <strong>{thuHong}</strong>
          </p>
          <p className="ghi-chu">
            Tài khoản vẫn được tạo và vẫn ở trạng thái <em>Chờ kích hoạt</em>. Người dùng chưa nhận
            được gì và <strong>chưa đăng nhập được</strong> — sửa xong máy chủ thư thì bấm
            <strong> Gửi lại thư mời</strong>.
          </p>
        </div>
      )}

      <div className="khung-cuon" role="region" aria-label="Danh sách người dùng" tabIndex={0}>
        <table className="bang">
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Tài khoản</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              {/*
                BA CỘT cho ba thao tác, không phải một ô chứa cả ba (`0070`).

                Nút *Gửi lại thư mời* chỉ có ở tài khoản chưa kích hoạt. Nhét cả
                ba vào một ô thì dòng nào thiếu nút ấy sẽ đẩy *Vô hiệu hoá* sang
                trái, và cột thao tác thành một hàng răng cưa — mắt phải đọc chữ
                trên từng nút mới biết mình sắp bấm cái gì.
                Cột bảng thì thẳng hàng theo định nghĩa; một `<div>` bên trong ô
                thì không, vì mỗi ô tự căn theo nội dung của chính nó.
              */}
              <th colSpan={3}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {ds.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td className="ma-phu">{u.username}</td>
                <td>{NHAN_VAI_TRO[u.role] ?? u.role}</td>
                <td>{trangThaiTaiKhoan(u)}</td>
                <td className="o-thao-tac">
                  <button
                    type="button"
                    className="nut nut-nhe"
                    onClick={() => datMo({ kieu: 'xem', u })}
                  >
                    Xem
                  </button>
                </td>
                <td className="o-thao-tac">
                  {/*
                    Ô TRỐNG khi tài khoản đã kích hoạt, chứ không bỏ ô đi: cột
                    vẫn còn thì hai nút hai bên không bị xô chỗ.
                  */}
                  {u.activatedAt === null && (
                    <button
                      type="button"
                      className="nut nut-nhe"
                      disabled={dangChay === u.id}
                      onClick={() => datHoi({ u, viec: 'moi' })}
                    >
                      Gửi lại thư mời
                    </button>
                  )}
                </td>
                <td className="o-thao-tac">
                    <button
                      type="button"
                      className={u.isActive ? 'nut nut-canh-bao' : 'nut nut-nhe'}
                      disabled={dangChay === u.id}
                      onClick={() => {
                        // Vô hiệu hoá là thao tác đá người khác ra khỏi hệ
                        // thống ⇒ hỏi trước. Kích hoạt lại thì lùi được bằng
                        // đúng nút vừa bấm ⇒ cho hoàn tác thay vì hỏi.
                        if (u.isActive) {
                          datMo({ kieu: 'khoa', u });
                          return;
                        }
                        void chay(u.id, () =>
                          dang(`/admin/users/${u.id}/activate-account`),
                        ).then(() =>
                          datVuaLam({
                            loi: `Đã kích hoạt lại tài khoản ${u.username}.`,
                            lui: () => {
                              datVuaLam(null);
                              void chay(u.id, () => dang(`/admin/users/${u.id}/deactivate`));
                            },
                          }),
                        );
                      }}
                    >
                      {u.isActive ? 'Vô hiệu hoá' : 'Kích hoạt lại'}
                    </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PhanTrang trang={trang} soTrang={soTrang} tong={tong} doiTrang={doiTrang} nhan="tài khoản" />

      {hoi?.viec === 'moi' && (
        <HopThoaiXacNhan
          tieuDe={`Gửi lại thư mời cho ${hoi.u.username}`}
          hauQua={
            <p>
              Thư mới mang một liên kết mới, và <strong>liên kết cũ chết ngay lúc này</strong>. Nếu
              người dùng đang cầm thư trước trong tay, họ bấm vào sẽ nhận "liên kết không còn hiệu
              lực" mà không hiểu vì sao — chỉ gửi lại khi họ báo là chưa nhận được hoặc đã hết hạn.
            </p>
          }
          nhanNut="Gửi lại thư mời"
          nguyHiem={false}
          dangChay={dangChay === hoi.u.id}
          dong={() => datHoi(null)}
          xacNhan={() =>
            void chay(hoi.u.id, () => dang(`/admin/users/${hoi.u.id}/resend-invite`)).then(() =>
              datHoi(null),
            )
          }
        />
      )}

      {vuaLam && (
        <ThanhHoanTac loi={vuaLam.loi} hoanTac={vuaLam.lui} dong={() => datVuaLam(null)} />
      )}

      {mo?.kieu === 'tao' && (
        <HopThoaiTao
          dong={() => datMo(null)}
          xong={(daGuiThu) => {
            datMo(null);
            datThuHong(
              daGuiThu ? null : 'Đã tạo tài khoản nhưng KHÔNG gửi được thư mời.',
            );
            taiLai();
          }}
        />
      )}
      {mo?.kieu === 'xem' && (
        <HopThoaiXem
          u={mo.u}
          dong={() => datMo(null)}
          xong={() => {
            datMo(null);
            taiLai();
          }}
        />
      )}

      {mo?.kieu === 'khoa' && (
        <HopThoaiVoHieu
          u={mo.u}
          dong={() => datMo(null)}
          xong={() => {
            datMo(null);
            taiLai();
          }}
        />
      )}
    </>
  );
}

// --- Hộp thoại tạo ----------------------------------------------------------

function HopThoaiTao({
  dong,
  xong,
}: {
  dong: () => void;
  /** `daGuiThu` false = tài khoản đã tạo nhưng thư mời không đi được. */
  xong: (daGuiThu: boolean) => void;
}) {
  const [vaiTro, datVaiTro] = useState<VaiTro>('TDV');
  const [hoTen, datHoTen] = useState('');
  const [taiKhoan, datTaiKhoan] = useState('');
  const [thu, datThu] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      const kq = await dang<{ id: string; inviteMailSent: boolean }>('/admin/users', {
        email: thu.trim(),
        username: taiKhoan.trim(),
        fullName: hoTen.trim(),
        role: vaiTro,
      });
      xong(kq.inviteMailSent);
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  // Bốn trường, giống nhau cho cả sáu vai trò (`0031`). Biểu mẫu này từng đổi
  // hình theo vai trò đang chọn, và mỗi lần đổi hình là một chỗ có thể gán sai.
  const duGiaTri =
    hoTen.trim().length >= 2 && taiKhoan.trim().length >= 2 && thu.trim().length > 0;

  return (
    <HopThoai tieuDe="Tạo người dùng" dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        <Truong id="nd-vai-tro" nhan="Vai trò" bắtBuộc>
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={vaiTro}
              onChange={(e) => datVaiTro(e.target.value as VaiTro)}
            >
              {VAI_TRO.map((v) => (
                <option key={v} value={v}>
                  {NHAN_VAI_TRO[v]}
                </option>
              ))}
            </select>
          )}
        </Truong>

        <Truong id="nd-ho-ten" nhan="Họ tên" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" value={hoTen}
              onChange={(e) => datHoTen(e.target.value)} />
          )}
        </Truong>
        <Truong id="nd-tai-khoan" nhan="Tên tài khoản" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" autoComplete="off" value={taiKhoan}
              onChange={(e) => datTaiKhoan(e.target.value)} />
          )}
        </Truong>
        <Truong id="nd-thu" nhan="Email" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" type="email" value={thu}
              onChange={(e) => datThu(e.target.value)} />
          )}
        </Truong>

        <p className="ghi-chu">
          Hệ thống gửi thư mời tới địa chỉ trên. Người dùng tự đặt mật khẩu qua liên kết trong thư —
          <strong> không có mật khẩu mặc định để bàn giao</strong>, và tài khoản chưa đăng nhập được
          cho tới khi họ đi qua liên kết đó.
        </p>

        {loi !== null && <BaoLoi loi={loi} />}

        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || !duGiaTri}>
            {dangGui ? 'Đang tạo…' : 'Tạo người dùng'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}

// --- Hộp thoại sửa: CHỈ vai trò --------------------------------------------

/**
 * Hộp thoại Sửa của Quản trị thu lại còn ĐÚNG một ô: vai trò.
 *
 * Họ tên và người quản lý chuyển sang chỗ khác — người dùng tự sửa họ tên ở
 * "Thông tin của tôi", còn liên kết cây thì gán ở thẻ Xem. Gộp cả ba vào một
 * biểu mẫu khiến thao tác nặng nhất (đổi vai trò) trông y hệt thao tác nhẹ nhất
 * (sửa lỗi chính tả trong họ tên).
 */
/**
 * Vô hiệu hoá một tài khoản (`0032`).
 *
 * Ba phần, và phần thứ hai mới là lý do hộp thoại này tồn tại:
 *
 *   1. **Bao nhiêu hồ sơ sẽ đổi tay** — hỏi máy chủ ngay khi mở, vì "vô hiệu
 *      hoá tài khoản này sẽ chuyển 14 hồ sơ" là một câu khác hẳn "vô hiệu hoá
 *      tài khoản này".
 *   2. **Chọn người nhận bàn giao** cùng vai trò. Bắt buộc khi còn hồ sơ: id
 *      người xử lý nằm cứng trên từng hồ sơ, nên không chuyển giao là để lại
 *      những hồ sơ không ai nhìn thấy và không ai thao tác được.
 *   3. **Gõ lại tên đăng nhập** — chặn bấm nhầm dòng. Danh sách có hàng chục
 *      dòng và các nút nằm sát nhau. Tên đăng nhập chứ không phải họ tên
 *      (`0036`): họ tên không duy nhất, nên nó không chứng minh được người
 *      quản trị đang nhìn đúng dòng.
 */
function HopThoaiVoHieu({
  u,
  dong,
  xong,
}: {
  u: NguoiDungDto;
  dong: () => void;
  xong: () => void;
}) {
  const [ten, datTen] = useState('');
  const [nguoiNhan, datNguoiNhan] = useState('');
  const [hoSo, datHoSo] = useState<XemTruocBanGiao | null>(null);
  const [ungVien, datUngVien] = useState<NguoiChon[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  useEffect(() => {
    const huy = new AbortController();
    Promise.all([
      layJson<XemTruocBanGiao>(`/admin/users/${u.id}/ban-giao`, huy.signal),
      layJson<NguoiChon[]>(`/auth/nguoi-theo-vai-tro/${u.role}`, huy.signal).catch(() => []),
    ])
      .then(([hs, ds]) => {
        datHoSo(hs);
        // Bỏ chính người đang bị vô hiệu hoá khỏi danh sách ứng viên.
        datUngVien(ds.filter((x) => x.id !== u.id));
      })
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [u.id, u.role]);

  const canNguoiNhan = (hoSo?.count ?? 0) > 0 || (hoSo?.customerCount ?? 0) > 0;
  const duGiaTri =
    ten.trim().length > 0 && hoSo !== null && (!canNguoiNhan || nguoiNhan !== '');

  const gui = async () => {
    datLoi(null);
    datDangGui(true);
    try {
      await dang(`/admin/users/${u.id}/deactivate`, {
        confirmUsername: ten.trim(),
        ...(canNguoiNhan ? { successorId: nguoiNhan } : {}),
      });
      xong();
    } catch (e) {
      datLoi(e);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe={`Vô hiệu hoá tài khoản ${u.username}`} dong={dong}>
      <p>
        <strong>{u.fullName}</strong> bị đăng xuất và không đăng nhập lại được.
      </p>

      {hoSo === null ? (
        <DangTai />
      ) : !canNguoiNhan ? (
        <p className="ghi-chu">
          Tài khoản này không giữ hồ sơ hay khách hàng nào — không có gì phải bàn giao.
        </p>
      ) : (
        <>
          <p>
            Tài khoản đang giữ{' '}
            {hoSo.count > 0 && (
              <>
                <strong>{hoSo.count} hồ sơ</strong> chưa xử lý xong hoặc đang có hiệu lực
              </>
            )}
            {hoSo.count > 0 && hoSo.customerCount > 0 ? ' và ' : ''}
            {hoSo.customerCount > 0 && <strong>{hoSo.customerCount} khách hàng</strong>}. Toàn bộ sẽ{' '}
            <strong>chuyển sang người bạn chọn</strong>. Hồ sơ giữ nguyên trạng thái, và việc chuyển
            giao được ghi vào <strong>nhật ký của từng hồ sơ</strong>.
          </p>
          {hoSo.policies.length > 0 && (
            <p className="ghi-chu">
              {hoSo.policies.map((x) => x.code).join(' · ')}
              {hoSo.count > hoSo.policies.length ? ` … và ${hoSo.count - hoSo.policies.length} hồ sơ nữa` : ''}
            </p>
          )}
          {hoSo.customers.length > 0 && (
            <p className="ghi-chu">
              {hoSo.customers.map((x) => x.code).join(' · ')}
              {hoSo.customerCount > hoSo.customers.length
                ? ` … và ${hoSo.customerCount - hoSo.customers.length} khách nữa`
                : ''}
            </p>
          )}

          <Truong id="nguoi-nhan" nhan={`Người nhận bàn giao (${u.role})`} bắtBuộc>
            {(p) => (
              <>
                <select
                  {...p}
                  className="o-nhap"
                  value={nguoiNhan}
                  onChange={(e) => datNguoiNhan(e.target.value)}
                >
                  <option value="">— Chọn người nhận —</option>
                  {(ungVien ?? []).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.fullName} ({x.username})
                    </option>
                  ))}
                </select>
                {ungVien !== null && ungVien.length === 0 && (
                  <span className="ghi-chu canh-bao">
                    Không có tài khoản {u.role} nào khác đang hoạt động để nhận bàn giao. Tạo và kích
                    hoạt một tài khoản trước, rồi quay lại.
                  </span>
                )}
              </>
            )}
          </Truong>
        </>
      )}

      {/* Gõ lại TÊN ĐĂNG NHẬP, không phải họ tên (`0036`). Họ tên không duy
          nhất — hai người trùng tên trong cùng một danh sách là chuyện bình
          thường — nên gõ đúng nó không chứng minh được đang nhìn đúng dòng, mà
          đó là toàn bộ việc phép xác nhận này phải làm. */}
      <Truong
        id="xac-nhan-ten"
        nhan={`Gõ lại tên đăng nhập "${u.username}" để xác nhận`}
        bắtBuộc
      >
        {(p) => (
          <input
            {...p}
            className="o-nhap"
            autoComplete="off"
            value={ten}
            onChange={(e) => datTen(e.target.value)}
          />
        )}
      </Truong>

      {loi !== null && <BaoLoi loi={loi} />}
      <div className="nhom-nut">
        <button
          type="button"
          className="nut nut-canh-bao"
          disabled={dangGui || !duGiaTri}
          onClick={gui}
        >
          {dangGui ? 'Đang xử lý…' : 'Vô hiệu hoá'}
        </button>
        <button type="button" className="nut nut-nhe" onClick={dong}>
          Huỷ
        </button>
      </div>
    </HopThoai>
  );
}

function HopThoaiXem({
  u,
  dong,
  xong,
}: {
  u: NguoiDungDto;
  dong: () => void;
  xong: () => void;
}) {
  // Hộp thoại này CHỈ CÒN ĐỌC (`0031`). Nó từng mang một biểu mẫu gán "Trưởng
  // bộ phận quản lý" và "Người quản lý" — hai liên kết không còn tồn tại. Việc
  // chọn người xử lý đã chuyển sang từng hồ sơ, ở đúng bước gửi duyệt.
  return (
    <HopThoai tieuDe={`Tài khoản ${u.username}`} dong={dong}>
      <dl className="bang-doc">
        <dt>Họ tên</dt>
        <dd>{u.fullName}</dd>
        <dt>Tên tài khoản</dt>
        <dd className="ma-phu">{u.username}</dd>
        <dt>Email</dt>
        <dd className="ma-phu">{u.email}</dd>
        <dt>Vai trò</dt>
        <dd>{NHAN_VAI_TRO[u.role] ?? u.role}</dd>
        <dt>Trạng thái</dt>
        <dd>{trangThaiTaiKhoan(u)}</dd>
      </dl>

      <div className="nhom-nut">
        <button type="button" className="nut nut-nhe" onClick={dong}>
          Đóng
        </button>
      </div>
    </HopThoai>
  );
}
