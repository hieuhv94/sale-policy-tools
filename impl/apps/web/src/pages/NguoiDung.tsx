/**
 * Quản trị người dùng và bộ phận (ONB-02) — chỉ Quản trị hệ thống.
 *
 * Hai thẻ trong MỘT màn hình. Bộ phận không có mục menu riêng: nó là dữ liệu phụ
 * trợ của việc quản trị người dùng, và thêm mục menu thứ chín cho một bảng hai
 * cột là làm nặng thanh bên của cả năm vai trò còn lại.
 *
 * Thứ tự hai thẻ có chủ ý — bộ phận phải tồn tại TRƯỚC khi tạo được TBP, mà
 * người quản trị mở màn hình này lần đầu thì chưa biết điều đó; nên thẻ Bộ phận
 * đứng ngay cạnh và khối rỗng của nó nói thẳng ra.
 */
import { useCallback, useEffect, useState } from 'react';
import { dang, layJson, va, xoa } from '../lib/api.js';
import { VAI_TRO, can, type VaiTro } from '../lib/can.js';
import {
  NHAN_VAI_TRO,
  TRUONG_THEM,
  VAI_TRO_CAP_TREN,
  boPhanCuaTbp,
  matKhauNgauNhien,
  trangThaiTaiKhoan,
  type BoPhanDto,
  type NguoiDungDto,
} from '../lib/nguoi-dung.js';
import { BaoLoi, DangTai, HopThoai, Trong, Truong } from '../components/Chung.js';

type The = 'nguoi-dung' | 'bo-phan';

export function NguoiDung() {
  const [the, datThe] = useState<The>('nguoi-dung');
  const [ds, datDs] = useState<NguoiDungDto[] | null>(null);
  const [boPhan, datBoPhan] = useState<BoPhanDto[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);

  const taiLai = useCallback(() => datLan((x) => x + 1), []);

  useEffect(() => {
    const huy = new AbortController();
    datLoi(null);
    Promise.all([
      layJson<{ items: NguoiDungDto[] }>('/admin/users?limit=200', huy.signal),
      layJson<BoPhanDto[]>('/admin/departments', huy.signal),
    ])
      .then(([u, b]) => {
        datDs(u.items);
        datBoPhan(b);
      })
      .catch((e) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [lan]);

  if (loi !== null && ds === null) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (!ds || !boPhan) return <DangTai />;

  return (
    <section className="trang">
      <div className="dau-trang">
        <div>
          <h1>Người dùng</h1>
          <p className="mo-ta-trang">Tài khoản, cây phân quyền và bộ phận duyệt.</p>
        </div>
      </div>

      <div className="dai-the" role="tablist" aria-label="Nhóm nội dung">
        <button
          type="button"
          role="tab"
          aria-selected={the === 'nguoi-dung'}
          className={the === 'nguoi-dung' ? 'the-chon dang-chon' : 'the-chon'}
          onClick={() => datThe('nguoi-dung')}
        >
          Người dùng ({ds.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={the === 'bo-phan'}
          className={the === 'bo-phan' ? 'the-chon dang-chon' : 'the-chon'}
          onClick={() => datThe('bo-phan')}
        >
          Bộ phận ({boPhan.length})
        </button>
      </div>

      {loi !== null && <BaoLoi loi={loi} thuLai={taiLai} />}

      {the === 'nguoi-dung' ? (
        <TheNguoiDung ds={ds} boPhan={boPhan} taiLai={taiLai} />
      ) : (
        <TheBoPhan ds={ds} boPhan={boPhan} taiLai={taiLai} />
      )}
    </section>
  );
}

// --- Thẻ Người dùng ---------------------------------------------------------

function TheNguoiDung({
  ds,
  boPhan,
  taiLai,
}: {
  ds: NguoiDungDto[];
  boPhan: BoPhanDto[];
  taiLai: () => void;
}) {
  const [mo, datMo] = useState<{ kieu: 'tao' } | { kieu: 'sua'; u: NguoiDungDto } | null>(null);
  const [dangChay, datDangChay] = useState<string | null>(null);
  const [loi, datLoi] = useState<unknown>(null);

  const chay = async (id: string, fn: () => Promise<unknown>) => {
    datLoi(null);
    datDangChay(id);
    try {
      await fn();
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

      <div className="khung-cuon" role="region" aria-label="Danh sách người dùng" tabIndex={0}>
        <table className="bang">
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Tài khoản</th>
              <th>Vai trò</th>
              <th>Bộ phận</th>
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
                <td>{u.departmentName ?? '—'}</td>
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
          boPhan={boPhan}
          dong={() => datMo(null)}
          xong={() => {
            datMo(null);
            taiLai();
          }}
        />
      )}
      {mo?.kieu === 'sua' && (
        <HopThoaiSua
          u={mo.u}
          ds={ds}
          boPhan={boPhan}
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
  ds,
  boPhan,
  dong,
  xong,
}: {
  ds: NguoiDungDto[];
  boPhan: BoPhanDto[];
  dong: () => void;
  xong: () => void;
}) {
  const [vaiTro, datVaiTro] = useState<VaiTro>('TDV');
  const [hoTen, datHoTen] = useState('');
  const [taiKhoan, datTaiKhoan] = useState('');
  const [thu, datThu] = useState('');
  const [matKhau, datMatKhau] = useState(matKhauNgauNhien);
  const [tbpId, datTbpId] = useState('');
  const [maBoPhan, datMaBoPhan] = useState('');
  const [duyetChinh, datDuyetChinh] = useState(true);
  const [capTren, datCapTren] = useState('');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const truong = TRUONG_THEM[vaiTro];
  // "Trưởng bộ phận" suy ra từ BẢNG QUYỀN, không so chuỗi vai trò: người duyệt
  // là đúng người ký số được. Máy chủ chặn vai trò khác ở `departments.service.ts`,
  // và `quyen.test.ts` cấm mọi so sánh vai trò viết thẳng ngoài `can.ts`.
  const dsTbp = ds.filter((u) => can(u.role, 'kySo'));
  const vaiTroCha = VAI_TRO_CAP_TREN[vaiTro];
  const dsCapTren = vaiTroCha ? ds.filter((u) => u.role === vaiTroCha) : [];

  // Bộ phận suy ra từ TBP đã chọn — đây là chỗ ô chọn NGƯỜI được dịch thành
  // `departmentCode` gửi lên. Xem chú thích ở `lib/nguoi-dung.ts`.
  const boPhanSuyRa = tbpId ? boPhanCuaTbp(boPhan, tbpId) : undefined;

  const thieuBoPhan =
    (truong.includes('tbp-quan-ly') && tbpId !== '' && boPhanSuyRa === undefined) ||
    (truong.includes('bo-phan-phu-trach') && maBoPhan === '');

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      const ma = truong.includes('tbp-quan-ly') ? boPhanSuyRa?.code : maBoPhan || undefined;
      const nguoi = await dang<{ id: string }>('/admin/users', {
        email: thu.trim(),
        username: taiKhoan.trim(),
        fullName: hoTen.trim(),
        role: vaiTro,
        defaultPassword: matKhau,
        ...(ma ? { departmentCode: ma } : {}),
        ...(capTren ? { parentUsername: capTren } : {}),
      });

      // TBP mới phải được ghi vào `department_approver`, nếu không tài khoản đúng
      // và quyền đúng mà không nhận được hồ sơ nào — xem `departments.service.ts`.
      if (truong.includes('bo-phan-phu-trach')) {
        const bp = boPhan.find((b) => b.code === maBoPhan);
        if (bp) {
          await dang(`/admin/departments/${bp.id}/approvers`, {
            userId: nguoi.id,
            isPrimary: duyetChinh,
          });
        }
      }
      xong();
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
    matKhau.length >= 8 &&
    !thieuBoPhan;

  return (
    <HopThoai tieuDe="Tạo người dùng" dong={dong}>
      <form onSubmit={gui}>
        <Truong id="nd-vai-tro" nhan="Vai trò" bắtBuộc>
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={vaiTro}
              onChange={(e) => {
                datVaiTro(e.target.value as VaiTro);
                // Xoá các ô cây khi đổi vai trò: giữ lại một `tbpId` của lượt
                // trước rồi gửi kèm cho một vai trò không có trường đó là cách
                // âm thầm gán sai bộ phận.
                datTbpId('');
                datMaBoPhan('');
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
          <Truong
            id="nd-tbp"
            nhan="Trưởng bộ phận quản lý"
            loi={
              tbpId !== '' && boPhanSuyRa === undefined
                ? 'Trưởng bộ phận này chưa duyệt bộ phận nào. Gán họ vào một bộ phận ở thẻ Bộ phận trước.'
                : undefined
            }
          >
            {(p) => (
              <select {...p} className="o-nhap" value={tbpId}
                onChange={(e) => datTbpId(e.target.value)}>
                <option value="">— Chưa gán —</option>
                {dsTbp.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.username})
                  </option>
                ))}
              </select>
            )}
          </Truong>
        )}
        {boPhanSuyRa && (
          <p className="ghi-chu">Hồ sơ sẽ đi tới bộ phận: <strong>{boPhanSuyRa.name}</strong></p>
        )}

        {truong.includes('bo-phan-phu-trach') && (
          <>
            <Truong id="nd-bo-phan" nhan="Bộ phận phụ trách" bắtBuộc>
              {(p) => (
                <select {...p} className="o-nhap" value={maBoPhan}
                  onChange={(e) => datMaBoPhan(e.target.value)}>
                  <option value="">— Chọn bộ phận —</option>
                  {boPhan.map((b) => (
                    <option key={b.id} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            </Truong>
            <label className="o-danh-dau">
              <input type="checkbox" checked={duyetChinh}
                onChange={(e) => datDuyetChinh(e.target.checked)} />
              Là người duyệt chính của bộ phận
            </label>
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

        <Truong id="nd-mat-khau" nhan="Mật khẩu mặc định" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" value={matKhau}
              onChange={(e) => datMatKhau(e.target.value)} />
          )}
        </Truong>
        <p className="ghi-chu">
          Người dùng phải đổi mật khẩu ngay lần đăng nhập đầu. Thư mời kích hoạt gửi tự động.
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
  boPhan,
  dong,
  xong,
}: {
  u: NguoiDungDto;
  ds: NguoiDungDto[];
  boPhan: BoPhanDto[];
  dong: () => void;
  xong: () => void;
}) {
  const [hoTen, datHoTen] = useState(u.fullName);
  const [maBoPhan, datMaBoPhan] = useState(u.departmentCode ?? '');
  const [capTren, datCapTren] = useState(u.parentUsername ?? '');
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const truong = TRUONG_THEM[u.role];
  const vaiTroCha = VAI_TRO_CAP_TREN[u.role];
  const dsCapTren = vaiTroCha ? ds.filter((x) => x.role === vaiTroCha && x.id !== u.id) : [];
  const coBoPhan = truong.includes('tbp-quan-ly') || truong.includes('bo-phan-phu-trach');

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
        ...(coBoPhan ? { departmentCode: maBoPhan } : {}),
        ...(vaiTroCha ? { parentUsername: capTren } : {}),
      });
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe={`Sửa ${u.username}`} dong={dong}>
      <form onSubmit={gui}>
        <p className="ghi-chu">
          Vai trò <strong>{NHAN_VAI_TRO[u.role]}</strong> không đổi được. Đổi vai trò làm hồ sơ đang
          dở mắc kẹt giữa luồng — vô hiệu hoá tài khoản này và tạo tài khoản mới.
        </p>

        <Truong id="sua-ho-ten" nhan="Họ tên" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" value={hoTen}
              onChange={(e) => datHoTen(e.target.value)} />
          )}
        </Truong>

        {coBoPhan && (
          <Truong id="sua-bo-phan" nhan="Bộ phận">
            {(p) => (
              <select {...p} className="o-nhap" value={maBoPhan}
                onChange={(e) => datMaBoPhan(e.target.value)}>
                <option value="">— Không thuộc bộ phận nào —</option>
                {boPhan.map((b) => (
                  <option key={b.id} value={b.code}>
                    {b.name}
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
          <button type="submit" className="nut nut-chinh" disabled={dangGui || hoTen.trim().length < 2}>
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

// --- Thẻ Bộ phận ------------------------------------------------------------

function TheBoPhan({
  ds,
  boPhan,
  taiLai,
}: {
  ds: NguoiDungDto[];
  boPhan: BoPhanDto[];
  taiLai: () => void;
}) {
  const [moTao, datMoTao] = useState(false);
  const [ma, datMa] = useState('');
  const [ten, datTen] = useState('');
  const [themVao, datThemVao] = useState<BoPhanDto | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  // "Trưởng bộ phận" suy ra từ BẢNG QUYỀN, không so chuỗi vai trò: người duyệt
  // là đúng người ký số được. Máy chủ chặn vai trò khác ở `departments.service.ts`,
  // và `quyen.test.ts` cấm mọi so sánh vai trò viết thẳng ngoài `can.ts`.
  const dsTbp = ds.filter((u) => can(u.role, 'kySo'));

  const tao = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await dang('/admin/departments', { code: ma.trim(), name: ten.trim() });
      datMa('');
      datTen('');
      datMoTao(false);
      taiLai();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  const go = async (b: BoPhanDto, userId: string) => {
    datLoi(null);
    try {
      await xoa(`/admin/departments/${b.id}/approvers/${userId}`);
      taiLai();
    } catch (err) {
      datLoi(err);
    }
  };

  return (
    <>
      <div className="nhom-nut">
        <button type="button" className="nut nut-chinh" onClick={() => datMoTao(true)}>
          Tạo bộ phận
        </button>
      </div>

      {loi !== null && <BaoLoi loi={loi} />}

      {boPhan.length === 0 ? (
        <Trong
          tieuDe="Chưa có bộ phận nào"
          moTa="Hồ sơ của Trình dược viên đi tới Trưởng bộ phận theo bộ phận. Chưa có bộ phận nào thì chưa tạo được Trưởng bộ phận nhận việc."
        />
      ) : (
        <div className="luoi-bo-phan">
          {boPhan.map((b) => (
            <article key={b.id} className="the-khoi">
              <h3>
                {b.name} <span className="ma-phu">{b.code}</span>
              </h3>
              {b.approvers.length === 0 ? (
                <p className="trong">
                  Chưa có người duyệt — hồ sơ của bộ phận này sẽ không tới được ai.
                </p>
              ) : (
                <ul className="danh-sach-tep">
                  {b.approvers.map((a) => (
                    <li key={a.userId}>
                      <span className="loai">{a.isPrimary ? 'Duyệt chính' : 'Duyệt thay'}</span>
                      <span>
                        {a.fullName} ({a.username})
                      </span>
                      <button type="button" className="nut nut-nhe" onClick={() => go(b, a.userId)}>
                        Gỡ
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="nut nut-nhe" onClick={() => datThemVao(b)}>
                Thêm người duyệt
              </button>
            </article>
          ))}
        </div>
      )}

      {moTao && (
        <HopThoai tieuDe="Tạo bộ phận" dong={() => datMoTao(false)}>
          <form onSubmit={tao}>
            <Truong id="bp-ma" nhan="Mã bộ phận" bắtBuộc>
              {(p) => (
                <input {...p} className="o-nhap" value={ma}
                  onChange={(e) => datMa(e.target.value)} />
              )}
            </Truong>
            <Truong id="bp-ten" nhan="Tên bộ phận" bắtBuộc>
              {(p) => (
                <input {...p} className="o-nhap" value={ten}
                  onChange={(e) => datTen(e.target.value)} />
              )}
            </Truong>
            {loi !== null && <BaoLoi loi={loi} />}
            <div className="nhom-nut">
              <button type="submit" className="nut nut-chinh"
                disabled={dangGui || ma.trim() === '' || ten.trim() === ''}>
                {dangGui ? 'Đang tạo…' : 'Tạo'}
              </button>
              <button type="button" className="nut nut-nhe" onClick={() => datMoTao(false)}>
                Huỷ
              </button>
            </div>
          </form>
        </HopThoai>
      )}

      {themVao && (
        <HopThoaiThemNguoiDuyet
          boPhan={themVao}
          dsTbp={dsTbp}
          dong={() => datThemVao(null)}
          xong={() => {
            datThemVao(null);
            taiLai();
          }}
        />
      )}
    </>
  );
}

function HopThoaiThemNguoiDuyet({
  boPhan,
  dsTbp,
  dong,
  xong,
}: {
  boPhan: BoPhanDto;
  dsTbp: NguoiDungDto[];
  dong: () => void;
  xong: () => void;
}) {
  const [userId, datUserId] = useState('');
  const [chinh, datChinh] = useState(boPhan.approvers.length === 0);
  const [loi, datLoi] = useState<unknown>(null);
  const [dangGui, datDangGui] = useState(false);

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datLoi(null);
    datDangGui(true);
    try {
      await dang(`/admin/departments/${boPhan.id}/approvers`, { userId, isPrimary: chinh });
      xong();
    } catch (err) {
      datLoi(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe={`Thêm người duyệt — ${boPhan.name}`} dong={dong}>
      <form onSubmit={gui}>
        {dsTbp.length === 0 ? (
          <p className="ghi-chu">
            Chưa có tài khoản Trưởng bộ phận nào. Chỉ vai trò Trưởng bộ phận làm người duyệt được.
          </p>
        ) : (
          <Truong id="nd-duyet" nhan="Trưởng bộ phận" bắtBuộc>
            {(p) => (
              <select {...p} className="o-nhap" value={userId}
                onChange={(e) => datUserId(e.target.value)}>
                <option value="">— Chọn —</option>
                {dsTbp.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.username})
                  </option>
                ))}
              </select>
            )}
          </Truong>
        )}
        <label className="o-danh-dau">
          <input type="checkbox" checked={chinh} onChange={(e) => datChinh(e.target.checked)} />
          Là người duyệt chính
        </label>

        {loi !== null && <BaoLoi loi={loi} />}

        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || userId === ''}>
            {dangGui ? 'Đang lưu…' : 'Thêm'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}
