/**
 * Thẻ Quy định chiết khấu — ngưỡng cảnh báo khi lập hồ sơ.
 *
 * HAI ô phạm vi (nhóm sản phẩm · loại khách hàng) đều bỏ trống được, và bỏ
 * trống nghĩa là "mọi". Nhiều dòng cùng khớp một tình huống là chuyện BÌNH
 * THƯỜNG chứ không phải lỗi cấu hình: dòng cụ thể hơn thắng.
 *
 * Chiều thứ ba — kênh bán — đã bỏ ở `0026`: ngưỡng chỉ phụ thuộc bản chất hàng
 * hoá và loại khách hàng.
 *
 * Bảng KHÔNG còn cột "Độ cụ thể" `0023`. Nó là con số nội bộ máy chủ dùng để xếp
 * thứ tự, và bày ra thì người đọc phải tự học luật trọng số mới hiểu — trong khi
 * chính cột "Áp dụng cho" ngay bên cạnh đã nói rõ dòng nào hẹp hơn dòng nào.
 * Câu hỏi "vì sao hồ sơ này lấy ngưỡng 25% chứ không phải 30%" giờ trả lời bằng
 * cột **Id**: mỗi dòng hồ sơ mang mã của đúng quy định đã cho ra ngưỡng của nó,
 * dán mã ấy vào ô tìm kiếm ở đây là ra thẳng dòng cần xem.
 */
import { useState } from 'react';
import { dang, va, xoa } from '../../lib/api.js';
import { ngay } from '../../lib/format.js';
import {
  LOAI_KHACH_HANG,
  doiSoThapPhan,
  nguongTuPhanTram,
  phamViChietKhau,
  phanTramTuNguong,
  type NhomSanPham,
  type QuyDinhChietKhau,
} from '../../lib/danh-muc.js';
import {
  BaoLoi,
  ChuThichBatBuoc,
  DangTai,
  HopThoai,
  HopThoaiXacNhan,
  ONhapPhanTram,
  Trong,
  Truong,
} from '../Chung.js';
import { thieuTruong } from '../../lib/bat-buoc.js';
import { PhanTrang } from '../PhanTrang.js';
import { useTrangMay } from '../../lib/phan-trang.js';
import { useBaoLoi } from '../../lib/bao-loi.js';

export function TheChietKhau({ nhom, chiXem = false }: { nhom: NhomSanPham[]; chiXem?: boolean }) {
  const [moTao, datMoTao] = useState(false);
  const [sua, datSua] = useState<QuyDinhChietKhau | null>(null);
  const [dangXoa, datDangXoa] = useState<string | null>(null);
  const [hoiXoa, datHoiXoa] = useState<QuyDinhChietKhau | null>(null);
  const [locNhom, datLocNhom] = useState('');
  const [locLoai, datLocLoai] = useState('');
  const [loiGo, datLoiGo] = useState<unknown>(null);

  /*
   * HAI Ô CHỌN thay cho ô gõ tự do (`0049`).
   *
   * Ô tìm chữ cũ khớp trên bốn thứ, và hai trong số đó là chuỗi do chính màn
   * hình dựng ra: câu mô tả phạm vi, và con số phần trăm đang hiển thị. Không
   * đưa xuống máy chủ được, mà giữ ở màn hình thì nó chỉ tìm trong 200 dòng đầu.
   *
   * Hai ô chọn hợp với dữ liệu hơn hẳn: nhóm sản phẩm và loại khách hàng đều là
   * tập giá trị ĐÓNG, người dùng chọn từ danh sách chứ không phải nhớ để gõ
   * đúng. Cả hai là cột thật, lọc bằng phép so bằng, chạy trên toàn bảng.
   */
  const truyVan = new URLSearchParams();
  if (locNhom !== '') truyVan.set('groupCode', locNhom);
  if (locLoai !== '') truyVan.set('customerType', locLoai);
  const duoi = truyVan.toString();

  const {
    muc: ds,
    tong,
    loi,
    trang,
    soTrang,
    doiTrang,
    taiLai,
  } = useTrangMay<QuyDinhChietKhau>(`/catalog/discount-rules${duoi ? `?${duoi}` : ''}`);

  const dangLoc = locNhom !== '' || locLoai !== '';

  const go = async (q: QuyDinhChietKhau) => {
    datLoiGo(null);
    datDangXoa(q.code);
    try {
      await xoa(`/catalog/discount-rules/${encodeURIComponent(q.code)}`, { confirm: q.code });
      taiLai();
    } catch (e) {
      datLoiGo(e);
    } finally {
      datDangXoa(null);
    }
  };

  if (loi !== null && ds === null) return <BaoLoi loi={loi} thuLai={taiLai} />;
  if (!ds) return <DangTai />;

  return (
    <>
      {!chiXem && (
        <div className="hang-thao-tac">
          <button type="button" className="nut nut-chinh" onClick={() => datMoTao(true)}>
            Thêm quy định
          </button>
        </div>
      )}

      <p className="ghi-chu">
        Ngưỡng chỉ để <strong>cảnh báo</strong>. Hồ sơ vượt ngưỡng vẫn gửi duyệt được — nó chỉ được
        đánh dấu để người duyệt nhìn thấy. Cột <em>Hiệu lực</em> là <strong>ngày bắt đầu</strong>:
        mọi quy định đều vô thời hạn, chạy từ ngày đó cho tới khi bị xoá hoặc bị một dòng cụ thể hơn
        đè lên.
      </p>

      {loi !== null && <BaoLoi loi={loi} thuLai={taiLai} />}
      {loiGo !== null && <BaoLoi loi={loiGo} />}

      <div className="hang-tim">
        <Truong id="loc-nhom-ck" nhan="Nhóm sản phẩm">
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={locNhom}
              onChange={(e) => datLocNhom(e.target.value)}
            >
              <option value="">— Mọi nhóm —</option>
              {nhom.map((x) => (
                <option key={x.id} value={x.code}>
                  {x.name} ({x.code})
                </option>
              ))}
            </select>
          )}
        </Truong>
        <Truong id="loc-loai-ck" nhan="Loại khách hàng">
          {(p) => (
            <select
              {...p}
              className="o-nhap"
              value={locLoai}
              onChange={(e) => datLocLoai(e.target.value)}
            >
              <option value="">— Mọi loại —</option>
              {LOAI_KHACH_HANG.map((l) => (
                <option key={l} value={String(l)}>
                  Loại {l}
                </option>
              ))}
            </select>
          )}
        </Truong>
        {dangLoc && (
          <span className="ghi-chu" role="status">
            {tong} quy định khớp
          </span>
        )}
      </div>

      {dangLoc && (
        <p className="ghi-chu">
          Danh sách gồm cả quy định <strong>chung</strong> — dòng áp cho mọi nhóm hoặc mọi loại
          khách vẫn áp cho lựa chọn này, nên giấu chúng đi là đưa ra một bức tranh thiếu đúng
          dòng đang có hiệu lực.
        </p>
      )}

      {ds.length === 0 ? (
        dangLoc ? (
          <Trong
            tieuDe="Không có quy định nào khớp"
            moTa="Không quy định nào áp cho nhóm và loại khách đang chọn. Mở một trong hai ô về “Mọi …” để xem rộng hơn."
          />
        ) : (
          <Trong
            tieuDe="Chưa có quy định chiết khấu nào"
            moTa="Chưa có quy định thì không dòng sản phẩm nào bị đánh dấu vượt ngưỡng."
          />
        )
      ) : (
        <div className="khung-cuon" role="region" aria-label="Quy định chiết khấu" tabIndex={0}>
          <table className="bang">
            <thead>
              <tr>
                <th>Id</th>
                <th>Áp dụng cho</th>
                <th>Ngưỡng</th>
                <th>Hiệu lực</th>
                {!chiXem && <th>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {ds.map((q) => (
                <tr key={q.code}>
                  <td className="ma-quy-dinh">{q.code}</td>
                  <td>{phamViChietKhau(q)}</td>
                  <td className="so">{phanTramTuNguong(q.thresholdRate2)}%</td>
                  {/* CHỈ ngày bắt đầu (`0028`). Chữ "– vô thời hạn" lặp lại y
                      nguyên ở mọi dòng nên nó không phân biệt dòng nào với dòng
                      nào; nó là một luật của CẢ BẢNG, và chỗ của luật ấy là câu
                      ghi chú trên đầu bảng — nơi nó được nói đúng một lần. */}
                  <td>{ngay(q.effectiveFrom)}</td>
                  {!chiXem && (
                    <td>
                      <div className="nhom-nut nhom-nut-gon">
                        <button type="button" className="nut nut-nhe" onClick={() => datSua(q)}>
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="nut nut-canh-bao"
                          disabled={dangXoa === q.code}
                          onClick={() => datHoiXoa(q)}
                        >
                          Xoá
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PhanTrang
        trang={trang}
        soTrang={soTrang}
        tong={tong}
        doiTrang={doiTrang}
        nhan="quy định"
      />

      {hoiXoa && (
        /* `goLai` — gõ lại MÃ quy định (`0036`). Máy chủ đòi đúng chuỗi ấy
           trong thân request, nên đây không phải một hộp thoại lịch sự mà là
           một phần của lời gọi. */
        <HopThoaiXacNhan
          tieuDe="Xoá quy định chiết khấu"
          hauQua={
            <p>
              Ngưỡng riêng của tổ hợp này biến mất. Hồ sơ lập sau đó rơi về{' '}
              <strong>quy định rộng hơn</strong> nếu có; không có quy định nào khác phủ thì dòng sản
              phẩm sẽ <strong>không có ngưỡng nào để đối chiếu</strong> — vẫn lập được, vẫn duyệt
              được, chỉ là không đánh dấu vượt ngưỡng được nữa.
            </p>
          }
          nhanNut="Xoá quy định"
          goLai={hoiXoa.code}
          dangChay={dangXoa === hoiXoa.code}
          dong={() => datHoiXoa(null)}
          xacNhan={() => void go(hoiXoa).then(() => datHoiXoa(null))}
        />
      )}

      {moTao && (
        <HopThoaiTaoQuyDinh
          nhom={nhom}
          dong={() => datMoTao(false)}
          xong={() => {
            datMoTao(false);
            taiLai();
          }}
        />
      )}

      {sua && (
        <HopThoaiSuaQuyDinh
          q={sua}
          dong={() => datSua(null)}
          xong={() => {
            datSua(null);
            taiLai();
          }}
        />
      )}
    </>
  );
}

/**
 * Sửa HAI ô: ngưỡng và ngày hiệu lực (`0028`).
 *
 * Hai khoá khớp (nhóm · loại khách) vẫn hiện ra dạng CHỮ, không dạng ô nhập —
 * đổi chúng là đổi `specificity`, tức đổi thứ tự ưu tiên khi nhiều dòng cùng
 * khớp (`CAT-11`). Máy chủ cũng không nhận. Khai nhầm phạm vi thì xoá rồi khai
 * lại.
 *
 * Ngày hiệu lực thì mở ra sửa được: nó không đổi phạm vi của dòng nào, chỉ đổi
 * thứ tự giữa các dòng CÙNG phạm vi — đúng cái cơ chế "khai ngày muộn hơn để đè
 * lên" đã chốt ở `0020`. Trước `0028`, gõ nhầm một ngày nghĩa là xoá dòng rồi
 * khai lại, và giữa hai thao tác thì mọi hồ sơ lập ra mất ngưỡng.
 */
function HopThoaiSuaQuyDinh({
  q,
  dong,
  xong,
}: {
  q: QuyDinhChietKhau;
  dong: () => void;
  xong: () => void;
}) {
  const { bao } = useBaoLoi();
  const [nguong, datNguong] = useState(phanTramTuNguong(q.thresholdRate2));
  // `<input type="date">` chỉ nhận `yyyy-mm-dd`. Máy chủ trả về `date` của
  // Postgres, mà `pg` dựng nó thành chuỗi ISO có cả phần giờ — cắt lấy mười ký
  // tự đầu, nếu không ô ngày mở ra RỖNG và người dùng tưởng dữ liệu hỏng.
  const [tuNgay, datTuNgay] = useState(String(q.effectiveFrom).slice(0, 10));
  const [dangGui, datDangGui] = useState(false);

  const n = doiSoThapPhan(nguong);
  const hopLe = nguong !== '' && Number.isFinite(n) && n >= 0 && n <= 100 && tuNgay !== '';

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datDangGui(true);
    try {
      await va(`/catalog/discount-rules/${encodeURIComponent(q.code)}`, {
        thresholdRate2: nguongTuPhanTram(nguong),
        effectiveFrom: tuNgay,
      });
      xong();
    } catch (err) {
      bao(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe="Sửa quy định chiết khấu" dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        <p className="ghi-chu">
          Mã <strong>{q.code}</strong> — áp dụng cho <strong>{phamViChietKhau(q)}</strong>. Hai ô
          phạm vi không sửa được: đổi chúng là đổi thứ tự ưu tiên của cả bảng. Khai nhầm phạm vi thì
          xoá dòng này rồi khai lại.
        </p>

        <Truong
          id="ck-sua-nguong"
          nhan="Ngưỡng chiết khấu" donVi="phần trăm, hai chữ số thập phân"
          bắtBuộc
          loi={nguong !== '' && !hopLe ? 'Nhập một số từ 0 đến 100.' : undefined}
        >
          {(p) => <ONhapPhanTram {...p} giaTri={nguong} doi={datNguong} />}
        </Truong>

        <Truong id="ck-sua-tu" nhan="Hiệu lực từ" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              type="date"
              value={tuNgay}
              onChange={(e) => datTuNgay(e.target.value)}
            />
          )}
        </Truong>
        <p className="ghi-chu">
          Quy định <strong>vô thời hạn</strong> — muốn dừng thì xoá dòng, hoặc khai một dòng cụ thể
          hơn đè lên. Đã có một quy định khác <strong>cùng phạm vi và cùng ngày</strong> thì hệ thống
          từ chối, vì hai dòng như vậy không phân xử được. Sửa <strong>không</strong> làm đổi hồ sơ
          đã lập: mỗi dòng hồ sơ giữ ngưỡng đã chụp lúc lập.
        </p>

        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || !hopLe}>
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

function HopThoaiTaoQuyDinh({
  nhom,
  dong,
  xong,
}: {
  nhom: NhomSanPham[];
  dong: () => void;
  xong: () => void;
}) {
  const { bao } = useBaoLoi();
  const [ma, datMa] = useState('');
  const [maNhom, datMaNhom] = useState('');
  const [loaiKhach, datLoaiKhach] = useState('');
  const [tuNgay, datTuNgay] = useState(() => new Date().toISOString().slice(0, 10));
  const [nguong, datNguong] = useState('');
  const [dangGui, datDangGui] = useState(false);

  const n = doiSoThapPhan(nguong);
  const thieu = thieuTruong('chiet-khau', {
    code: ma,
    effectiveFrom: tuNgay,
    thresholdRate2: nguong,
  });
  const hopLe = thieu.length === 0 && Number.isFinite(n) && n >= 0 && n <= 100;

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    datDangGui(true);
    try {
      await dang('/catalog/discount-rules', {
        code: ma.trim(),
        ...(maNhom ? { productGroupCode: maNhom } : {}),
        ...(loaiKhach ? { customerType: Number(loaiKhach) } : {}),
        effectiveFrom: tuNgay,
        thresholdRate2: nguongTuPhanTram(nguong),
      });
      xong();
    } catch (err) {
      bao(err);
    } finally {
      datDangGui(false);
    }
  };

  return (
    <HopThoai tieuDe="Thêm quy định chiết khấu" dong={dong}>
      <form onSubmit={gui}>
        <ChuThichBatBuoc />

        {/* MÃ đứng đầu biểu mẫu vì nó là thứ người dùng sẽ nhìn thấy lại: cột
            *Id* ở bảng này, cột *QĐCK* trên từng dòng hồ sơ, và là thứ họ gõ vào
            ô tìm kiếm. Đặt cuối thì nó trông như một trường phụ. */}
        <Truong id="ck-ma" nhan="Mã quy định" bắtBuộc>
          {(p) => (
            <input
              {...p}
              className="o-nhap"
              autoComplete="off"
              placeholder="VD: CK-SUA-L1"
              value={ma}
              onChange={(e) => datMa(e.target.value)}
            />
          )}
        </Truong>
        <p className="ghi-chu">
          Mã <strong>không sửa được sau khi tạo</strong> — hồ sơ đã lập ghi lại mã này để truy vết.
          Đặt nhầm thì xoá dòng rồi khai lại. Mã <strong>không phân biệt hoa thường</strong>:{' '}
          <code>CK-01</code> và <code>ck-01</code> là một.
        </p>

        <p className="ghi-chu">
          Ngưỡng chỉ phụ thuộc <strong>hai yếu tố</strong>: nhóm sản phẩm và loại khách hàng. Bỏ
          trống một ô nghĩa là <strong>áp dụng cho mọi giá trị</strong> của ô đó; điền cả hai thì
          quy định cụ thể hơn và nó thắng khi nhiều dòng cùng khớp.
        </p>

        <Truong id="ck-nhom" nhan="Nhóm sản phẩm">
          {(p) => (
            <select {...p} className="o-nhap" value={maNhom} onChange={(e) => datMaNhom(e.target.value)}>
              <option value="">— Mọi nhóm —</option>
              {nhom.map((x) => (
                <option key={x.id} value={x.code}>
                  {x.name} ({x.code})
                </option>
              ))}
            </select>
          )}
        </Truong>

        <Truong id="ck-loai" nhan="Loại khách hàng">
          {(p) => (
            <select {...p} className="o-nhap" value={loaiKhach} onChange={(e) => datLoaiKhach(e.target.value)}>
              <option value="">— Mọi loại —</option>
              {LOAI_KHACH_HANG.map((l) => (
                <option key={l} value={l}>
                  Loại {l}
                </option>
              ))}
            </select>
          )}
        </Truong>

        <Truong
          id="ck-nguong"
          nhan="Ngưỡng chiết khấu" donVi="phần trăm, hai chữ số thập phân"
          bắtBuộc
          loi={nguong !== '' && !hopLe ? 'Nhập một số từ 0 đến 100.' : undefined}
        >
          {(p) => <ONhapPhanTram {...p} giaTri={nguong} doi={datNguong} />}
        </Truong>

        <Truong id="ck-tu" nhan="Hiệu lực từ" bắtBuộc>
          {(p) => (
            <input {...p} className="o-nhap" type="date" value={tuNgay} onChange={(e) => datTuNgay(e.target.value)} />
          )}
        </Truong>
        <p className="ghi-chu">
          Quy định có hiệu lực từ ngày trên và <strong>vô thời hạn</strong> — cùng luật với chính
          CSBH. Muốn dừng thì xoá dòng, hoặc khai một dòng cụ thể hơn đè lên.
        </p>

        <div className="nhom-nut">
          <button type="submit" className="nut nut-chinh" disabled={dangGui || !hopLe}>
            {dangGui ? 'Đang tạo…' : 'Tạo'}
          </button>
          <button type="button" className="nut nut-nhe" onClick={dong}>
            Huỷ
          </button>
        </div>
      </form>
    </HopThoai>
  );
}
