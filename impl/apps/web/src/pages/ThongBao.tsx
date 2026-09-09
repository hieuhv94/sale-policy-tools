/**
 * Trang thông báo đầy đủ (`0096`).
 *
 * Bảng sổ xuống từ cái chuông chỉ giữ mười dòng gần nhất — đủ cho câu hỏi "có
 * gì mới", không đủ cho câu "tuần trước tôi bỏ lỡ cái gì". Trang này trả lời câu
 * thứ hai, và nó là chỗ duy nhất lọc được *chỉ chưa đọc*.
 *
 * KHÔNG có mục menu ở thanh bên. Cùng lý do với *Thông tin tài khoản*: đây là
 * màn hình của CHÍNH mình, mọi vai trò đều vào được, và chỗ tìm nó tự nhiên là
 * cái chuông chứ không phải một mục thứ chín trong danh sách điều hướng.
 */
import { useState } from 'react';
import { BaoLoi, DangTai, Trong } from '../components/Chung.js';
import { PhanTrang } from '../components/PhanTrang.js';
import { ngayGio } from '../lib/format.js';
import { useTrangMay } from '../lib/phan-trang.js';
import { Lien } from '../lib/router.js';
import {
  danhDauDaDoc,
  danhDauDaDocHet,
  lopDong,
  MOI_TRANG_THONG_BAO,
  thoiGianTuongDoi,
  useChuaDoc,
  type ThongBao as Dong,
} from '../lib/thong-bao.js';

export function ThongBao() {
  const [chiChuaDoc, datChiChuaDoc] = useState(false);
  const chuaDoc = useChuaDoc();
  // Nút và số đếm nói về CẢ HỘP, không riêng bậc nào — trang này không lọc theo
  // bậc, chỉ theo *đã đọc / chưa đọc* (`0192`).
  const soChuaDoc = chuaDoc.viec + chuaDoc.tin;
  const { muc, tong, loi, trang, soTrang, doiTrang, taiLai } = useTrangMay<Dong>(
    `/notifications/cua-toi${chiChuaDoc ? '?chuaDoc=true' : ''}`,
    MOI_TRANG_THONG_BAO,
  );

  /*
   * Tải LẠI cả trang sau khi đánh dấu, không sửa tại chỗ như bảng sổ xuống.
   *
   * Hai màn hình, hai cách, và có lý do: ở bảng sổ xuống người dùng đang RỜI ĐI
   * — sửa tại chỗ là cách duy nhất kịp thấy. Ở đây họ ở lại, và khi bộ lọc *chỉ
   * chưa đọc* đang bật thì dòng vừa đọc phải BIẾN MẤT khỏi danh sách. Sửa tại
   * chỗ sẽ để nó nằm lại, mâu thuẫn với chính bộ lọc đang hiện.
   */
  const doc = (tb: Dong) => {
    if (tb.daDocLuc) return;
    void danhDauDaDoc(tb.id).then(taiLai);
  };

  const docHet = () => {
    void danhDauDaDocHet().then(taiLai);
  };

  return (
    <section className="trang">
      <div className="dau-trang">
        <div>
          <h1>Thông báo</h1>
          <p className="mo-ta-trang">
            Mỗi việc gửi email cho bạn đều để lại một dòng ở đây. Giữ{' '}
            <strong>6 tháng gần nhất</strong>.
          </p>
        </div>
        {soChuaDoc > 0 && (
          <button type="button" className="nut nut-nhe" onClick={docHet}>
            Đánh dấu đã đọc hết
          </button>
        )}
      </div>

      <div className="tb-loc">
        {/*
          Công tắc thật (`aria-pressed`) chứ không hai thẻ giả: nó bật/tắt đúng
          một tiêu chí, và trình đọc màn hình đọc ra được trạng thái ấy.
        */}
        <button
          type="button"
          className="nut nut-nhe"
          aria-pressed={chiChuaDoc}
          onClick={() => datChiChuaDoc((x) => !x)}
        >
          Chỉ chưa đọc{soChuaDoc > 0 ? ` (${soChuaDoc})` : ''}
        </button>
      </div>

      {loi ? (
        <BaoLoi loi={loi} thuLai={taiLai} />
      ) : muc === null ? (
        <DangTai />
      ) : muc.length === 0 ? (
        <Trong
          tieuDe={chiChuaDoc ? 'Bạn đã đọc hết' : 'Chưa có thông báo nào'}
          moTa={
            chiChuaDoc
              ? 'Không còn thông báo nào chưa đọc.'
              : 'Khi có hồ sơ chuyển bước hoặc khách hàng được bàn giao cho bạn, thông báo sẽ hiện ở đây.'
          }
        />
      ) : (
        <ul className="tb-danh-sach tb-danh-sach-trang">
          {muc.map((tb) => (
            <li key={tb.id}>
              <Lien den={tb.duongDan} className={lopDong(tb)} truocKhiDi={() => doc(tb)}>
                <span className="tb-cham" aria-hidden="true" />
                <span className="tb-than">
                  {/* Bậc ở LỚP của cả dòng (`0192`) — xem `lopDong`. */}
                  <span className="tb-tieu-de">{tb.tieuDe}</span>
                  {tb.moTa && <span className="tb-mo-ta">{tb.moTa}</span>}
                  <span className="tb-luc" title={ngayGio(tb.xayRaLuc)}>
                    {thoiGianTuongDoi(tb.xayRaLuc)}
                  </span>
                </span>
              </Lien>
            </li>
          ))}
        </ul>
      )}

      <PhanTrang
        trang={trang}
        soTrang={soTrang}
        tong={tong}
        doiTrang={doiTrang}
        nhan="thông báo"
      />
    </section>
  );
}
