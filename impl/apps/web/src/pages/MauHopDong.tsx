/**
 * **Văn bản mẫu** — một trang, hai thẻ, chỉ Quản trị hệ thống (`0060`).
 *
 * Màn hình này chỉ còn HAI việc (`0067`): xem danh sách, và xoá một mẫu. Việc
 * thứ ba — thêm mẫu — mở sang một trang riêng, vì nó cần cả hướng dẫn dài lẫn
 * bảng ánh xạ (`ThemMau.tsx`).
 *
 * KHÔNG CÒN SỬA, và đó là chốt của khách hàng ngày 20/08: muốn đổi một mẫu thì
 * xoá đi rồi thêm mẫu mới. Nghe như thêm việc, nhưng nó gỡ đúng thứ khó nhất của
 * bản cũ — sửa một mẫu ĐANG ĐƯỢC DÙNG nghĩa là bản mềm hôm nay và bản mềm hôm
 * qua khác nhau mà không chỗ nào ghi lại điều đó.
 *
 * KHÔNG CÒN TRẠNG THÁI: mọi mẫu trong danh sách đều dùng được. Vòng đời cũ
 * (nháp → đang dùng → đã ngừng) sinh ra khi mỗi khổ giấy chỉ được có một mẫu
 * đang dùng; `0058` bỏ luật ấy, và `0067` bỏ nốt phần vòng đời còn lại.
 */
import { useCallback, useEffect, useState } from 'react';
import { layJson, xoa as xoaApi } from '../lib/api.js';
import { ngayGio } from '../lib/format.js';
import {
  CAU_HINH_MAU,
  NHAN_KHO,
  type LoaiMau,
  type MauHopDong as MauDto,
} from '../lib/mau-hop-dong.js';
import { BaoLoi, DaiThe, DangTai, HopThoaiXacNhan, Trong } from '../components/Chung.js';
import { ThemMau } from './ThemMau.js';

export function VanBanMau() {
  const [the, datThe] = useState<LoaiMau>('HO_SO');
  return (
    <>
      <DaiThe
        nhanVung="Loại văn bản mẫu"
        dangChon={the}
        chon={datThe}
        muc={[
          { khoa: 'HO_SO' as LoaiMau, nhan: 'Mẫu hồ sơ CSBH' },
          { khoa: 'HOP_DONG' as LoaiMau, nhan: 'Mẫu hợp đồng' },
        ]}
      />
      {/*
        `key` bắt React DỰNG LẠI hẳn khi đổi thẻ, không tái dùng cây cũ.

        Không có nó thì trạng thái trong `MauVanBan` — danh sách đang tải, hộp
        xác nhận đang mở, trang thêm mẫu đang dở — sống sót qua lần đổi thẻ, và
        người dùng thấy hộp hỏi xoá mẫu hồ sơ khi đang đứng ở thẻ mẫu hợp đồng.
      */}
      <MauVanBan key={the} loai={the} />
    </>
  );
}

function MauVanBan({ loai }: { loai: LoaiMau }) {
  const ch = CAU_HINH_MAU[loai];
  const [ds, datDs] = useState<MauDto[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);
  const [dangThem, datDangThem] = useState(false);
  const [hoiXoa, datHoiXoa] = useState<MauDto | null>(null);
  const [dangXoa, datDangXoa] = useState<string | null>(null);

  const taiLai = useCallback(() => datLan((n) => n + 1), []);

  useEffect(() => {
    const huy = new AbortController();
    datDs(null);
    layJson<MauDto[]>(ch.duong, huy.signal)
      .then(datDs)
      .catch((e: unknown) => {
        if (!huy.signal.aborted) datLoi(e);
      });
    return () => huy.abort();
  }, [ch.duong, lan]);

  const xoa = async (m: MauDto) => {
    datLoi(null);
    datDangXoa(m.id);
    try {
      await xoaApi(`${ch.duong}/${m.id}`);
      taiLai();
    } catch (e) {
      datLoi(e);
    } finally {
      datDangXoa(null);
    }
  };

  if (dangThem) {
    return (
      <ThemMau
        loai={loai}
        quayLai={() => datDangThem(false)}
        xong={() => {
          datDangThem(false);
          taiLai();
        }}
      />
    );
  }

  if (ds === null) return loi !== null ? <BaoLoi loi={loi} thuLai={taiLai} /> : <DangTai />;

  return (
    <section className="trang">
      <div className="dau-trang">
        <div>
          <h1>{ch.tieuDe}</h1>
          <p className="mo-ta-trang">{ch.moTa}</p>
        </div>
        {/*
          MỘT nút thao tác, ở góc trên bên phải (`0067`).

          Bản trước có *Tải mẫu lên* ở giữa trang, rồi từng dòng lại có *Ánh xạ*,
          *Ban hành* và *Ngừng dùng* — bốn nút cho một việc, và người dùng phải
          biết thứ tự bấm mới ra được một mẫu dùng được.
        */}
        <div className="nhom-nut nhom-nut-dau">
          <button type="button" className="nut nut-chinh" onClick={() => datDangThem(true)}>
            {ch.nhanTaiLen}
          </button>
        </div>
      </div>

      {/*
        Danh sách RỖNG là một cảnh báo, không phải một khoảng trống.

        Không còn mẫu nào thì mọi lượt bấm *Xem bản mềm* hay *Xuất hợp đồng* đều
        hỏng, mà người bấm không có quyền vào đây và cũng không đoán ra nguyên
        nhân. Chỉ Quản trị chữa được, nên câu ấy phải nằm ở đây.
      */}
      {ds.length === 0 && (
        <div className="bao-loi" role="alert">
          <p className="bao-loi-chinh">Chưa có mẫu nào.</p>
          <p className="bao-loi-phu">
            {ch.bangDoHeThongDung
              ? 'Mọi lượt bấm Xem bản mềm đều báo lỗi cho tới khi bạn thêm một mẫu.'
              : 'Kế toán và Sale Admin không xuất được hợp đồng cho tới khi bạn thêm một mẫu.'}
          </p>
        </div>
      )}

      {loi !== null && <BaoLoi loi={loi} thuLai={taiLai} />}

      {ds.length === 0 ? (
        <Trong
          tieuDe={`Chưa có ${ch.tieuDe.toLowerCase()} nào`}
          moTa="Tải lên một file .docx có ô trống dạng {{ten_o}}, ánh xạ từng ô tới một trường dữ liệu, rồi lưu."
        />
      ) : (
        <div className="khung-cuon" role="region" aria-label={ch.tieuDe} tabIndex={0}>
          <table className="bang">
            <thead>
              <tr>
                <th>Tên mẫu</th>
                <th>Khổ giấy</th>
                <th>Thêm lúc</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {ds.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.paperSize ? NHAN_KHO[t.paperSize] : '—'}</td>
                  <td>{ngayGio(t.updatedAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="nut nut-nhe nut-canh-bao"
                      disabled={dangXoa === t.id}
                      onClick={() => datHoiXoa(t)}
                    >
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hoiXoa && (
        <HopThoaiXacNhan
          tieuDe={`Xoá mẫu "${hoiXoa.name}"`}
          hauQua={
            ds.length > 1 ? (
              <p>
                Mẫu này biến mất khỏi ô chọn của người xem. Còn <strong>{ds.length - 1}</strong> mẫu
                khác, nên{' '}
                {ch.bangDoHeThongDung ? 'bản mềm vẫn xem được' : 'hợp đồng vẫn xuất được'} — chỉ là
                không chọn được mẫu này nữa. <strong>Không khôi phục lại được</strong>: muốn dùng
                lại thì thêm mẫu mới từ chính file ấy.
              </p>
            ) : (
              <p>
                Đây là <strong>mẫu cuối cùng</strong>. Xoá nó thì{' '}
                {ch.bangDoHeThongDung
                  ? 'mọi lượt bấm Xem bản mềm đều báo lỗi'
                  : 'kế toán và Sale Admin không xuất được hợp đồng'}
                , cho tới khi bạn thêm một mẫu khác.
              </p>
            )
          }
          nhanNut="Xoá mẫu"
          // Gõ lại TÊN MẪU: xoá là thao tác không lùi được duy nhất còn lại của
          // màn hình này, và với mẫu cuối cùng thì nó làm cả chức năng ngừng chạy.
          goLai={hoiXoa.name}
          dangChay={dangXoa === hoiXoa.id}
          dong={() => datHoiXoa(null)}
          xacNhan={() => void xoa(hoiXoa).then(() => datHoiXoa(null))}
        />
      )}
    </section>
  );
}
