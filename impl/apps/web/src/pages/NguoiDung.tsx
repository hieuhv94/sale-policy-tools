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
import { useCallback, useEffect, useState } from 'react';
import { dang, layJson, va } from '../lib/api.js';
import { VAI_TRO, can, type VaiTro } from '../lib/can.js';
import {
  NHAN_VAI_TRO,
  TRUONG_BAT_BUOC,
  TRUONG_THEM,
  VAI_TRO_CAP_TREN,
  trangThaiTaiKhoan,
  type NguoiDungDto,
} from '../lib/nguoi-dung.js';
import { BaoLoi, ChuThichBatBuoc, DaiThe, DangTai, HopThoai, Truong } from '../components/Chung.js';
import { TheHeThong } from '../components/quan-tri/HeThong.js';

type The = 'nguoi-dung' | 'he-thong';

export function NguoiDung() {
  const [the, datThe] = useState<The>('nguoi-dung');
  const [ds, datDs] = useState<NguoiDungDto[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);

  const taiLai = useCallback(() => datLan((x) => x + 1), []);

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    layJson<{ items: NguoiDungDto[] }>('/admin/users?limit=200', huy.signal)
      .then((u) => datDs(u.items))
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [lan]);

  if (loi !== null && ds === null) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (!ds) return <DangTai />;

  return (
    <section className="trang">
      <div className="dau-trang">
        <div>
          <h1>Người dùng</h1>
          <p className="mo-ta-trang">Tài khoản, cây phân quyền và người duyệt.</p>
        </div>
      </div>

      <DaiThe
        nhanVung="Nhóm nội dung"
        dangChon={the}
        chon={datThe}
        muc={[
          { khoa: 'nguoi-dung', nhan: 'Người dùng', dem: ds.length },
          { khoa: 'he-thong', nhan: 'Hệ thống' },
        ]}
      />

      {loi !== null && <BaoLoi loi={loi} thuLai={taiLai} />}

      {the === 'nguoi-dung' && <TheNguoiDung ds={ds} taiLai={taiLai} />}
      {the === 'he-thong' && <TheHeThong />}
    </section>
  );
}

// --- Thẻ Người dùng ---------------------------------------------------------

function TheNguoiDung({ ds, taiLai }: { ds: NguoiDungDto[]; taiLai: () => void }) {
  const [mo, datMo] = useState<{ kieu: 'tao' } | { kieu: 'sua'; u: NguoiDungDto } | null>(null);
  const [dangChay, datDangChay] = useState<string | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [thuHong, datThuHong] = useState<string | null>(null);

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

  return (
    <>
      <div className="nhom-nut">
        <button type="button" className="nut nut-chinh" onClick={() => datMo({ kieu: 'tao' })}>
          Tạo người dùng
        </button>
      </div>

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
              <th>Trưởng bộ phận quản lý</th>
              <th>Cấp trên</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {ds.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td className="ma-phu">{u.username}</td>
                <td>{NHAN_VAI_TRO[u.role] ?? u.role}</td>
                <td>{u.approverName ?? '—'}</td>
                <td className="ma-phu">{u.parentUsername ?? '—'}</td>
                <td>{trangThaiTaiKhoan(u)}</td>
                <td>
                  <div className="nhom-nut nhom-nut-gon">
                    <button
                      type="button"
                      className="nut nut-nhe"
                      onClick={() => datMo({ kieu: 'sua', u })}
                    >
                      Sửa
                    </button>
                    {u.activatedAt === null && (
                      <button
                        type="button"
                        className="nut nut-nhe"
                        disabled={dangChay === u.id}
                        onClick={() =>
                          chay(u.id, () => dang(`/admin/users/${u.id}/resend-invite`))
                        }
                      >
                        Gửi lại thư mời
                      </button>
                    )}
                    <button
                      type="button"
                      className={u.isActive ? 'nut nut-canh-bao' : 'nut nut-nhe'}
                      disabled={dangChay === u.id}
                      onClick={() =>
                        chay(u.id, () =>
                          dang(
                            `/admin/users/${u.id}/${u.isActive ? 'deactivate' : 'activate-account'}`,
                          ),
                        )
                      }
                    >
                      {u.isActive ? 'Vô hiệu hoá' : 'Kích hoạt lại'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mo?.kieu === 'tao' && (
        <HopThoaiTao
          ds={ds}
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
      {mo?.kieu === 'sua' && (
        <HopThoaiSua
          u={mo.u}
          ds={ds}
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

/**
 * Danh sách tài khoản chọn được làm người duyệt.
 *
 * Suy ra từ BẢNG QUYỀN, không so chuỗi vai trò: người duyệt là đúng người ký số
 * được. Máy chủ chặn vai trò khác ở `users.service.ts:resolveApprover`, và
 * `quyen.test.ts` cấm mọi so sánh vai trò viết thẳng ngoài `can.ts`.
 */
const locTbp = (ds: NguoiDungDto[]) => ds.filter((u) => can(u.role, 'kySo') && u.isActive);

// --- Hộp thoại tạo ----------------------------------------------------------

function HopThoaiTao({
  ds,
  dong,
  xong,
}: {
  ds: NguoiDungDto[];
  dong: () => void;
  /** `daGuiThu` false = tài khoản đã tạo nhưng thư mời không đi được. */
  xong: (daGuiThu: boolean) => void;
}) {
  const [vaiTro, datVaiTro] = useState<VaiTro>('TDV');
  const [hoTen, datHoTen] = useState('');
  const [taiKhoan, datTaiKhoan] = useState('');
  const [thu, datThu] = useState('');
  const [tbp, datTbp] = useState('');
  const [capTren, datCapTren] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const truong = TRUONG_THEM[vaiTro];
  const batBuoc = TRUONG_BAT_BUOC[vaiTro];
  const dsTbp = locTbp(ds);
  const vaiTroCha = VAI_TRO_CAP_TREN[vaiTro];
  const dsCapTren = vaiTroCha ? ds.filter((u) => u.role === vaiTroCha) : [];

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
        ...(truong.includes('tbp-quan-ly') && tbp ? { approverUsername: tbp } : {}),
        ...(capTren ? { parentUsername: capTren } : {}),
      });
      xong(kq.inviteMailSent);
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  const duGiaTri =
    hoTen.trim().length >= 2 &&
    taiKhoan.trim().length >= 2 &&
    thu.trim().length > 0 &&
    // Ô chọn người duyệt là trường BẮT BUỘC của TDV — máy chủ cũng chặn, nhưng
    // chặn luôn ở đây để người dùng thấy ngay thay vì gửi đi rồi nhận về lỗi.
    (!batBuoc.includes('tbp-quan-ly') || tbp !== '');

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
              onChange={(e) => {
                datVaiTro(e.target.value as VaiTro);
                // Xoá các ô cây khi đổi vai trò: giữ lại một người duyệt của lượt
                // trước rồi gửi kèm cho một vai trò không có trường đó là 400 từ
                // `resolveApprover`, với thông báo không liên quan gì tới thao
                // tác vừa làm.
                datTbp('');
                datCapTren('');
              }}
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
        <Truong id="nd-thu" nhan="Thư điện tử" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" type="email" value={thu}
              onChange={(e) => datThu(e.target.value)} />
          )}
        </Truong>

        {truong.includes('tbp-quan-ly') && (
          <>
            <Truong
              id="nd-tbp"
              nhan="Trưởng bộ phận quản lý"
              bắtBuộc={batBuoc.includes('tbp-quan-ly')}
            >
              {(p) => (
                <select {...p} className="o-nhap" value={tbp}
                  onChange={(e) => datTbp(e.target.value)}>
                  <option value="">— Chọn Trưởng bộ phận —</option>
                  {dsTbp.map((u) => (
                    <option key={u.id} value={u.username}>
                      {u.fullName} ({u.username})
                    </option>
                  ))}
                </select>
              )}
            </Truong>
            {dsTbp.length === 0 && (
              <p className="ghi-chu">
                Chưa có tài khoản Trưởng bộ phận nào đang hoạt động. Tạo Trưởng bộ phận trước —
                hồ sơ của Trình dược viên phải có người duyệt, nếu không nó đứng im tới khi quá hạn.
              </p>
            )}
          </>
        )}

        {truong.includes('cap-tren') && vaiTroCha && (
          <Truong id="nd-cap-tren" nhan={`Cấp trên (${NHAN_VAI_TRO[vaiTroCha]})`}>
            {(p) => (
              <select {...p} className="o-nhap" value={capTren}
                onChange={(e) => datCapTren(e.target.value)}>
                <option value="">— Chưa gán —</option>
                {dsCapTren.map((u) => (
                  <option key={u.id} value={u.username}>
                    {u.fullName} ({u.username})
                  </option>
                ))}
              </select>
            )}
          </Truong>
        )}

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

// --- Hộp thoại sửa ----------------------------------------------------------

function HopThoaiSua({
  u,
  ds,
  dong,
  xong,
}: {
  u: NguoiDungDto;
  ds: NguoiDungDto[];
  dong: () => void;
  xong: () => void;
}) {
  const [hoTen, datHoTen] = useState(u.fullName);
  const [tbp, datTbp] = useState(u.approverUsername ?? '');
  const [capTren, datCapTren] = useState(u.parentUsername ?? '');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const truong = TRUONG_THEM[u.role];
  const batBuoc = TRUONG_BAT_BUOC[u.role];
  const vaiTroCha = VAI_TRO_CAP_TREN[u.role];
  const dsCapTren = vaiTroCha ? ds.filter((x) => x.role === vaiTroCha && x.id !== u.id) : [];
  const coTbp = truong.includes('tbp-quan-ly');
  const dsTbp = locTbp(ds).filter((x) => x.id !== u.id);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      // Gửi chuỗi RỖNG chứ không bỏ trường: máy chủ phân biệt "không đụng tới"
      // (thiếu trường) với "gỡ liên kết" (chuỗi rỗng). Bỏ trường đi thì không
      // bao giờ gỡ được một cấp trên đã gán nhầm.
      await va(`/admin/users/${u.id}`, {
        fullName: hoTen.trim(),
        ...(coTbp ? { approverUsername: tbp } : {}),
        ...(vaiTroCha ? { parentUsername: capTren } : {}),
      });
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  const duGiaTri =
    hoTen.trim().length >= 2 && (!batBuoc.includes('tbp-quan-ly') || tbp !== '');

  return (
    <HopThoai tieuDe={`Sửa ${u.username}`} dong={dong}>
      <form onSubmit={gui}>
        <p className="ghi-chu">
          Vai trò <strong>{NHAN_VAI_TRO[u.role]}</strong> không đổi được. Đổi vai trò làm hồ sơ đang
          dở mắc kẹt giữa luồng — vô hiệu hoá tài khoản này và tạo tài khoản mới.
        </p>

        <ChuThichBatBuoc />

        <Truong id="sua-ho-ten" nhan="Họ tên" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" value={hoTen}
              onChange={(e) => datHoTen(e.target.value)} />
          )}
        </Truong>

        {coTbp && (
          <Truong
            id="sua-tbp"
            nhan="Trưởng bộ phận quản lý"
            bắtBuộc={batBuoc.includes('tbp-quan-ly')}
          >
            {(p) => (
              <select {...p} className="o-nhap" value={tbp}
                onChange={(e) => datTbp(e.target.value)}>
                <option value="">— Chọn Trưởng bộ phận —</option>
                {dsTbp.map((x) => (
                  <option key={x.id} value={x.username}>
                    {x.fullName} ({x.username})
                  </option>
                ))}
              </select>
            )}
          </Truong>
        )}

        {vaiTroCha && (
          <Truong id="sua-cap-tren" nhan={`Cấp trên (${NHAN_VAI_TRO[vaiTroCha]})`}>
            {(p) => (
              <select {...p} className="o-nhap" value={capTren}
                onChange={(e) => datCapTren(e.target.value)}>
                <option value="">— Chưa gán —</option>
                {dsCapTren.map((x) => (
                  <option key={x.id} value={x.username}>
                    {x.fullName} ({x.username})
                  </option>
                ))}
              </select>
            )}
          </Truong>
        )}

        {loi !== null && <BaoLoi loi={loi} />}

        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || !duGiaTri}>
            {dangGui ? 'Đang lưu…' : 'Lưu'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}
