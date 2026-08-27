/**
 * **Văn bản mẫu** — một trang, hai thẻ, chỉ Quản trị hệ thống (`0060`).
 *
 * BA VIỆC: xem danh sách, vô hiệu hoá một mẫu, dùng lại một mẫu đã vô hiệu. Việc
 * thêm mẫu mở sang một trang riêng vì nó cần cả hướng dẫn dài lẫn bảng ánh xạ
 * (`ThemMau.tsx`).
 *
 * KHÔNG CÒN XOÁ (`0098`). Từ khi mẫu hồ sơ đóng băng vào hồ sơ lúc gửi duyệt,
 * xoá một mẫu nghĩa là làm hỏng vĩnh viễn bản mềm của mọi hồ sơ đã gắn nó — mà
 * hồ sơ thì khoá sửa ngay từ lúc ấy, nên không ai chữa được. Vô hiệu hoá làm
 * đúng phần việc mà người dùng thật sự cần: rút mẫu khỏi ô chọn.
 *
 * VẪN KHÔNG CÓ SỬA, và lý do đã đổi. `0067` bỏ sửa vì "bản mềm hôm nay khác bản
 * mềm hôm qua mà không chỗ nào ghi lại"; `0098` trả lời được câu ấy bằng cột
 * `mau_ho_so_id`, nhưng cũng làm cho việc sửa thành vô nghĩa — sửa một mẫu đã
 * gắn vào hồ sơ đã ký là sửa chính văn bản đã duyệt. Thêm mẫu mới, vô hiệu mẫu
 * cũ: hồ sơ cũ giữ nguyên bản của nó, hồ sơ mới dùng bản mới.
 */
import { useCallback, useEffect, useState } from 'react';
import { dang, layJson } from '../lib/api.js';
import { ngayGio } from '../lib/format.js';
import {
  CAU_HINH_MAU,
  NHAN_KHO,
  type LoaiMau,
  type MauHopDong as MauDto,
} from '../lib/mau-hop-dong.js';
import { BaoLoi, DaiThe, DangTai, HopThoaiXacNhan, Trong } from '../components/Chung.js';
import { ThemMau } from './ThemMau.js';
import { useBaoLoi } from '../lib/bao-loi.js';

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
  const { bao } = useBaoLoi();
  const ch = CAU_HINH_MAU[loai];
  const [ds, datDs] = useState<MauDto[] | null>(null);
  const [loi, datLoi] = useState<unknown>(null);
  const [lan, datLan] = useState(0);
  const [dangThem, datDangThem] = useState(false);
  const [hoiVoHieu, datHoiVoHieu] = useState<MauDto | null>(null);
  const [dangChay, datDangChay] = useState<string | null>(null);

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

  /**
   * Một hàm cho cả hai chiều: `confirm` chỉ đi kèm chiều vô hiệu hoá.
   *
   * Máy chủ đòi gõ lại tên khi vô hiệu và không đòi gì khi bật lại (luật
   * `17/08`: chỉ thao tác PHÁ HUỶ mới phải nói ra thứ mình định làm). Giao diện
   * soi đúng luật ấy chứ không tự thêm một hộp xác nhận cho chiều bật lại.
   */
  const doiTrangThai = async (m: MauDto, viec: 'vo-hieu' | 'mo-lai') => {
    datLoi(null);
    datDangChay(m.id);
    try {
      await dang(`${ch.duong}/${m.id}/${viec}`, viec === 'vo-hieu' ? { confirm: m.name } : {});
      taiLai();
    } catch (e) {
      bao(e);
    } finally {
      datDangChay(null);
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
      {/*
        Điều kiện là "KHÔNG CÒN MẪU NÀO DÙNG ĐƯỢC", không phải "bảng rỗng"
        (`0098`). Vô hiệu hết mẫu thì bảng vẫn đầy dòng, mà phần mềm thì đã hỏng
        đúng y như lúc chưa có mẫu nào — và người duy nhất chữa được đang đứng ở
        chính màn hình này.
      */}
      {ds.filter((t) => !t.voHieuHoaLuc).length === 0 && (
        <div className="bao-loi" role="alert">
          <p className="bao-loi-chinh">
            {ds.length === 0 ? 'Chưa có mẫu nào.' : 'Không còn mẫu nào đang dùng được.'}
          </p>
          <p className="bao-loi-phu">
            {ch.bangDoHeThongDung
              ? 'Trình dược viên không gửi duyệt được hồ sơ nào cho tới khi có ít nhất một mẫu dùng được.'
              : 'Kế toán và Sale Admin không xuất được hợp đồng cho tới khi có ít nhất một mẫu dùng được.'}
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
                <th>Trạng thái</th>
                {/* Tên cột ẩn khỏi mắt, giữ cho trình đọc màn hình (`0132`). */}
                <th>
                  <span className="chi-doc-man-hinh">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ds.map((t) => {
                const voHieu = Boolean(t.voHieuHoaLuc);
                return (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{t.paperSize ? NHAN_KHO[t.paperSize] : '—'}</td>
                    <td>{ngayGio(t.updatedAt)}</td>
                    {/*
                      Trạng thái bằng CHỮ, không chỉ bằng màu hay bằng việc dòng
                      mờ đi — cùng luật với cảnh báo vượt ngưỡng (muc 11.2).
                    */}
                    <td>
                      {voHieu ? (
                        <span className="nhan nhan-thuong">Đã vô hiệu</span>
                      ) : (
                        <span className="nhan nhan-tot">Đang dùng</span>
                      )}
                    </td>
                    <td className="o-thao-tac-re-chuot">
                      {voHieu ? (
                        <button
                          type="button"
                          className="nut nut-nhe"
                          disabled={dangChay === t.id}
                          onClick={() => void doiTrangThai(t, 'mo-lai')}
                        >
                          Dùng lại
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="nut nut-nhe nut-canh-bao"
                          disabled={dangChay === t.id}
                          onClick={() => datHoiVoHieu(t)}
                        >
                          Vô hiệu hoá
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hoiVoHieu && (
        <HopThoaiXacNhan
          tieuDe={`Vô hiệu hoá mẫu "${hoiVoHieu.name}"`}
          hauQua={
            <>
              <p>
                Mẫu này biến khỏi ô chọn.{' '}
                {ch.bangDoHeThongDung
                  ? 'Trình dược viên không chọn được nó khi gửi duyệt nữa.'
                  : 'Kế toán và Sale Admin không chọn được nó khi xuất hợp đồng nữa.'}
              </p>
              {/*
                CÂU QUAN TRỌNG NHẤT của hộp này, và nó phải nói điều NGƯỢC với thứ
                người dùng đang sợ. "Vô hiệu hoá" nghe như tắt: người quản trị dễ
                tưởng những hồ sơ đang dùng mẫu này sẽ hỏng, nên họ sẽ không dám
                bấm — rồi giữ mãi một danh sách mẫu cũ mà không ai dọn.
              */}
              {ch.bangDoHeThongDung && (
                <p>
                  Hồ sơ <strong>đã gắn mẫu này vẫn xem được bản mềm bình thường</strong>. Mẫu chỉ
                  rời khỏi ô chọn, không rời khỏi những hồ sơ đã dùng nó.
                </p>
              )}
              <p>
                Bấm <strong>Dùng lại</strong> ở dòng ấy là mẫu trở vào ô chọn — không mất gì.
              </p>
            </>
          }
          nhanNut="Vô hiệu hoá"
          // Vẫn gõ lại TÊN MẪU dù bật lại được: giữa hai lần bấm ấy, cả công ty
          // mất một lựa chọn — và với mẫu cuối cùng thì không ai gửi duyệt được.
          goLai={hoiVoHieu.name}
          dangChay={dangChay === hoiVoHieu.id}
          dong={() => datHoiVoHieu(null)}
          xacNhan={() => void doiTrangThai(hoiVoHieu, 'vo-hieu').then(() => datHoiVoHieu(null))}
        />
      )}
    </section>
  );
}
