/**
 * *Thống kê* — hoạt động theo tuần · tháng · quý · năm, vẽ bằng HÌNH (`0094`).
 *
 * Bản `0093` bày mỗi vai trò một bảng 6–8 cột × 12 dòng và khách hàng bác thẳng:
 * *"thể hiện dưới dạng biểu đồ, để nhìn được tổng quan chứ không dùng số liệu"*.
 * Ba chỗ hỏng của bảng số, và không chỗ nào sửa được bằng cách thêm cột:
 *
 *   1. **Không nhìn ra xu hướng.** 96 ô buộc người đọc tự dựng đường trong đầu.
 *   2. **Không soi được ai.** Mọi con số là tổng của cả phạm vi.
 *   3. **Sáu bảng vẫn là bảng.** Vai trò khác nhau cần HÌNH DẠNG khác nhau.
 *
 * Màn hình này không tự quyết gì: nó đọc `KHOI_THEO_VAI_TRO` ở `lib/thong-ke.ts`
 * rồi dựng theo. Thêm một vai trò là thêm một dòng ở bảng đó.
 */
import { useState } from 'react';
import { usePhien } from '../lib/auth.js';
import type { VaiTro } from '../lib/can.js';
import { ngay, tien, tyLe } from '../lib/format.js';
import {
  chuoiChiSo,
  KHOI_CAN_NHOM,
  KHOI_CAN_SO_LIEU,
  KHOI_CAN_TDV,
  KHOI_THEO_VAI_TRO,
  KY_MAC_DINH,
  LY_DO_KHONG_CO_SO,
  mocKy,
  MOI_KY,
  NEO,
  NHAN_KY,
  tyLeKyThang,
  useHoatDong,
  useThongKe,
  useThongKeNhom,
  useThongKeTdv,
  type BoHoatDong,
  type BoTheoNhom,
  type BoTheoTdv,
  type BoThongKe,
  type Ky,
  type NguoiThongKe,
  type TenKhoiTk,
} from '../lib/thong-ke.js';
import { Cot, Duong, Pheu, PhanTan, ThanhNgang, ThanhNguong, ThanhTyLe } from '../components/bieu-do/BieuDo.js';
import { XepHang } from '../components/bieu-do/XepHang.js';
import { Trong } from '../components/Chung.js';
import { Khoi, ViSaoKhongCoViec } from '../components/khoi/Khung.js';

/** SLA 14 ngày — mốc so của mọi thanh thời gian trên trang (muc 3). */
const SLA_NGAY = 14;

export function ThongKe() {
  const { nguoiDung } = usePhien();
  const vaiTro = (nguoiDung?.role ?? '') as VaiTro;
  const khoi = KHOI_THEO_VAI_TRO[vaiTro] ?? [];

  const [ky, datKy] = useState<Ky>(KY_MAC_DINH[vaiTro] ?? 'thang');
  /*
   * Người đang được chọn ở bảng xếp hạng — LỌC TẠI CHỖ, không mở màn hình riêng
   * (chốt 23/08). Bấm lần nữa là bỏ chọn.
   */
  const [aiDo, datAiDo] = useState<string | null>(null);

  const co = (ds: TenKhoiTk[]) => khoi.some((k) => ds.includes(k));
  const { du: bo, loi } = useThongKe(ky, co(KHOI_CAN_SO_LIEU));
  const { du: tdv, loi: loiTdv } = useThongKeTdv(ky, co(KHOI_CAN_TDV));
  const { du: nhom, loi: loiNhom } = useThongKeNhom(ky, co(KHOI_CAN_NHOM));
  const { du: hoatDong, loi: loiHoatDong } = useHoatDong(ky, co(['hoat-dong']));

  const nguoi = tdv?.nguoi.find((n) => n.userId === aiDo) ?? null;

  const veKhoi = (ten: TenKhoiTk) => {
    switch (ten) {
      case 'vi-sao-khong-co-so':
        return null;

      case 'luong':
        return (
          <O key={ten} tieuDe="Vào luồng và ra khỏi luồng" hoi={`${bo?.chuoi.length ?? 0} kỳ gần nhất`} loi={loi} co={bo}>
            {bo && (
              <>
                <p className="o-phu">
                  Khoảng cách giữa hai đường chính là lượng hồ sơ đang nằm trong luồng.
                </p>
                <Duong
                  moc={mocKy(bo)}
                  moTa={`Hồ sơ lập mới và hồ sơ có hiệu lực qua ${bo.chuoi.length} kỳ`}
                  chuoi={[
                    { nhan: 'Lập mới', diem: chuoiChiSo(bo, 'lapMoi'), mau: 'bd-1', vung: true },
                    { nhan: 'Có hiệu lực', diem: chuoiChiSo(bo, 'coHieuLuc'), mau: 'bd-2' },
                  ]}
                />
                <ChuThich muc={['lapMoi', 'coHieuLuc']} mau={['bd-1', 'bd-2']} duong />
              </>
            )}
          </O>
        );

      case 'ket-cuc':
        return (
          <O key={ten} tieuDe="Kết cục của hồ sơ" hoi="cột chồng theo kỳ" loi={loi} co={bo}>
            {bo && (
              <>
                <p className="o-phu">
                  Phần đỏ dày lên là dấu hiệu sớm — nó hiện trước khi tổng số kịp giảm.
                </p>
                <Cot
                  moc={mocKy(bo)}
                  moTa="Cơ cấu kết cục hồ sơ theo từng kỳ"
                  lop={[
                    { nhan: 'Có hiệu lực', diem: chuoiChiSo(bo, 'coHieuLuc'), mau: 'bd-tot' },
                    { nhan: 'Bị trả lại', diem: chuoiChiSo(bo, 'traLai'), mau: 'bd-canh' },
                    { nhan: 'Bị từ chối', diem: chuoiChiSo(bo, 'tuChoi'), mau: 'bd-xau' },
                    { nhan: 'Quá hạn', diem: chuoiChiSo(bo, 'quaHan'), mau: 'bd-mo' },
                  ]}
                />
                <ChuThich
                  muc={['coHieuLuc', 'traLai', 'tuChoi', 'quaHan']}
                  mau={['bd-tot', 'bd-canh', 'bd-xau', 'bd-mo']}
                />
              </>
            )}
          </O>
        );

      case 'pheu': {
        const k = bo?.soSanh.kyNay;
        return (
          <O key={ten} tieuDe="Luồng duyệt rơi rụng ở đâu" hoi={k?.nhan ?? ''} loi={loi} co={bo}>
            {k && (
              <>
                <p className="o-phu">
                  Tính trên hồ sơ đi qua từng bước <strong>trong kỳ này</strong>; con số đỏ bên phải
                  là phần hụt so với bước trước.
                </p>
                <Pheu
                  moTa="Số hồ sơ qua từng bước duyệt trong kỳ"
                  buoc={[
                    { ten: 'Gửi duyệt', so: k.dem['guiDuyet'] ?? 0, mau: 'bd-1' },
                    { ten: 'TBP ký', so: k.dem['tbpKy'] ?? 0, mau: 'bd-3' },
                    { ten: 'KT nhận L1', so: k.dem['ktNhanL1'] ?? 0, mau: 'bd-1' },
                    { ten: 'SA bàn giao', so: k.dem['banGiao'] ?? 0, mau: 'bd-2' },
                    { ten: 'Có hiệu lực', so: k.dem['coHieuLuc'] ?? 0, mau: 'bd-tot' },
                  ]}
                />
                {/*
                  Câu này bắt buộc: năm con số ấy KHÔNG phải năm chặng của cùng
                  một lô hồ sơ. Mỗi bước neo vào mốc của chính nó, nên hồ sơ gửi
                  cuối kỳ trước mà ký đầu kỳ này chỉ có mặt ở bước thứ hai. Đọc
                  nó như một lô duy nhất là đọc sai — và không có gì trên hình
                  nói ra điều đó.
                */}
                <p className="ghi-chu">
                  Mỗi bước đếm theo mốc của chính nó, nên đây không phải một lô hồ sơ đi từ trên
                  xuống — hồ sơ gửi cuối kỳ trước mà ký trong kỳ này chỉ có mặt ở bước *TBP ký*.
                </p>
              </>
            )}
          </O>
        );
      }

      case 'chiet-khau':
        return (
          <O
            key={ten}
            tieuDe="Chiết khấu bình quân theo nhóm sản phẩm"
            hoi="toàn danh mục"
            loi={loiNhom}
            co={nhom}
          >
            {nhom && <TheoNhom bo={nhom} />}
          </O>
        );

      case 'thoi-gian-buoc': {
        const b = bo ? bo.buoc[bo.soSanh.kyNay?.ma ?? ''] : undefined;
        return (
          <O key={ten} tieuDe="Hồ sơ nằm ở bàn ai bao lâu" hoi="trung bình, kỳ này" loi={loi} co={bo}>
            {bo &&
              (b === undefined ? (
                <Trong tieuDe="Kỳ này chưa có hồ sơ nào đi hết luồng" />
              ) : (
                <>
                  <p className="o-phu">
                    Chỉ tính hồ sơ <strong>đã đi hết luồng</strong> trong kỳ — hồ sơ đang dở dang
                    chưa có đủ bốn quãng để cộng.
                  </p>
                  <ThanhNguong
                    moTa="Số ngày trung bình hồ sơ nằm ở từng bước, so với hạn 14 ngày"
                    nguong={SLA_NGAY}
                    nhanNguong={`SLA ${SLA_NGAY} ngày`}
                    tong={tongBuoc(b)}
                    phan={[
                      { nhan: 'Chờ TBP', so: b.choTbp ?? 0, mau: 'bd-3' },
                      { nhan: 'Chờ KT L1', so: b.choKtL1 ?? 0, mau: 'bd-1' },
                      { nhan: 'Sale Admin', so: b.saLamBanCung ?? 0, mau: 'bd-2' },
                      { nhan: 'Chờ KT L2', so: b.choKtL2 ?? 0, mau: 'bd-canh' },
                    ]}
                  />
                  <ChuThich
                    muc={['Chờ TBP', 'Chờ KT L1', 'Sale Admin làm bản cứng', 'Chờ KT L2']}
                    mau={['bd-3', 'bd-1', 'bd-2', 'bd-canh']}
                    tho
                  />
                </>
              ))}
          </O>
        );
      }

      case 'tdv-hieu-qua':
        return (
          <Khoi key={ten} tieuDe="Ai đang chạy tốt, ai đang chững" loi={loiTdv} dangTai={tdv === null}>
            {tdv && (
              <HieuQuaTdv bo={tdv} bo0={bo} aiDo={aiDo} chon={datAiDo} nguoi={nguoi} ky={ky} />
            )}
          </Khoi>
        );

      case 'tdv-gui-len':
        return (
          <Khoi key={ten} tieuDe="Ai đang chạy tốt, ai đang chững" loi={loiTdv} dangTai={tdv === null}>
            {tdv && (
              <div className="o">
                <p className="o-phu">
                  Đếm <strong>hồ sơ gửi tới bàn bạn</strong>, và chỉ những người có hồ sơ trong phạm
                  vi của bạn. Ai không gửi gì trong kỳ này vẫn hiện với số 0 — đó là ca chững nặng
                  nhất, và giấu nó đi thì không ai thấy.
                </p>
                <XepHang
                  nhanCot="Hồ sơ gửi lên"
                  dangChon={aiDo}
                  chon={(ma) => datAiDo(ma === aiDo ? null : ma)}
                  dong={tdv.nguoi.map((n) => ({
                    ma: n.userId,
                    ten: n.ten,
                    so: n.kyNay.guiDuyet,
                    chuoi: n.chuoiGui,
                    xuHuong: n.xuHuongGui,
                  }))}
                />
                <LuatXuHuong />
              </div>
            )}
          </Khoi>
        );

      case 'tdv-chat-luong':
        return (
          <O
            key={ten}
            tieuDe="Hồ sơ gửi tới bàn tôi đi về đâu"
            hoi={bo?.soSanh.kyNay?.nhan ?? ''}
            loi={loiTdv}
            co={tdv}
          >
            {tdv && <ChatLuongTdv bo={tdv} aiDo={aiDo} />}
          </O>
        );

      case 'tdv-sua-lai':
        return (
          <O key={ten} tieuDe="Trả lại rồi bao lâu mới quay lại" hoi="trung bình, ngày" loi={loiTdv} co={tdv}>
            {tdv && <SuaLai bo={tdv} />}
          </O>
        );

      case 'viec-tbp': {
        const b = bo ? bo.buoc[bo.soSanh.kyNay?.ma ?? ''] : undefined;
        return (
          <Khoi key={ten} tieuDe="Việc của tôi" loi={loi} dangTai={bo === null}>
            {bo && (
              <div className="luoi-o">
                <div className="o">
                  <div className="o-dau">
                    <span className="o-ten">Tôi ký bao nhiêu, trả lại bao nhiêu</span>
                  </div>
                  <Cot
                    moc={mocKy(bo)}
                    nhom
                    moiN={2}
                    moTa="Số hồ sơ đã ký, bị trả lại và bị từ chối theo từng kỳ"
                    lop={[
                      { nhan: 'Đã ký', diem: chuoiChiSo(bo, 'tbpKy'), mau: 'bd-1' },
                      { nhan: 'Trả lại', diem: chuoiChiSo(bo, 'traLai'), mau: 'bd-canh' },
                      { nhan: 'Từ chối', diem: chuoiChiSo(bo, 'tuChoi'), mau: 'bd-xau' },
                    ]}
                  />
                  <ChuThich muc={['tbpKy', 'traLai', 'tuChoi']} mau={['bd-1', 'bd-canh', 'bd-xau']} />
                </div>
                <div className="o">
                  <div className="o-dau">
                    <span className="o-ten">Hồ sơ nằm trên bàn tôi bao lâu</span>
                    <span className="o-hoi">trung bình</span>
                  </div>
                  {b?.choTbp === undefined || b?.choTbp === null ? (
                    <Trong tieuDe="Kỳ này chưa có hồ sơ nào đi qua bàn bạn" />
                  ) : (
                    <ThanhNguong
                      moTa={`Trung bình ${b.choTbp} ngày, so với hạn ${SLA_NGAY} ngày`}
                      nguong={SLA_NGAY}
                      nhanNguong={`SLA ${SLA_NGAY} ngày`}
                      tong={b.choTbp}
                      phan={[{ nhan: 'Chờ TBP ký', so: b.choTbp, mau: 'bd-3' }]}
                    />
                  )}
                </div>
              </div>
            )}
          </Khoi>
        );
      }

      case 'toi-so-voi-chung':
        return (
          <O key={ten} tieuDe="Hồ sơ của tôi" hoi="so với mặt bằng chung" loi={loi} co={bo}>
            {bo && (
              <>
                <p className="o-phu">
                  Đường đứt nét là <strong>trung vị của một trình dược viên</strong> trên toàn công
                  ty — biết mình đứng ở đâu mà không phải bày tên ai khác ra.
                </p>
                <Duong
                  moc={mocKy(bo)}
                  moTa="Hồ sơ có hiệu lực và bị trả lại của tôi, so với trung vị công ty"
                  chuoi={[
                    { nhan: 'Có hiệu lực', diem: chuoiChiSo(bo, 'coHieuLuc'), mau: 'bd-1', vung: true },
                    { nhan: 'Bị trả lại', diem: chuoiChiSo(bo, 'traLai'), mau: 'bd-canh' },
                    {
                      nhan: 'Trung vị',
                      diem: bo.chuoi.map((k) => bo.trungVi[k.ma] ?? 0),
                      mau: 'bd-mo',
                      mo: true,
                    },
                  ]}
                />
                <ChuThich
                  muc={['coHieuLuc', 'traLai', 'Trung vị công ty']}
                  mau={['bd-1', 'bd-canh', 'bd-mo']}
                  duong
                />
              </>
            )}
          </O>
        );

      case 'hai-hang-doi':
        return (
          <O key={ten} tieuDe="Hai lần tiếp nhận" hoi="theo kỳ" loi={loi} co={bo}>
            {bo && (
              <>
                <p className="o-phu">
                  Hai hàng đợi vẽ riêng: chúng lệch pha nhau khoảng một kỳ vì bản cứng phải đi qua
                  giấy.
                </p>
                <Cot
                  moc={mocKy(bo)}
                  nhom
                  moiN={2}
                  moTa="Số hồ sơ tiếp nhận lần 1 và lần 2 theo từng kỳ"
                  lop={[
                    { nhan: 'Tiếp nhận L1', diem: chuoiChiSo(bo, 'ktNhanL1'), mau: 'bd-1' },
                    { nhan: 'Tiếp nhận L2', diem: chuoiChiSo(bo, 'coHieuLuc'), mau: 'bd-2' },
                  ]}
                />
                <ChuThich muc={['ktNhanL1', 'coHieuLuc']} mau={['bd-1', 'bd-2']} />
              </>
            )}
          </O>
        );

      case 'gia-tri':
        return (
          <O key={ten} tieuDe="Giá trị CSBH có hiệu lực" hoi="triệu đồng" loi={loi} co={bo}>
            {bo && (
              <>
                <Cot
                  moc={mocKy(bo)}
                  moTa="Tổng giá thu về của hồ sơ có hiệu lực theo từng kỳ"
                  dinhDang={(v) => String(Math.round(v))}
                  lop={[
                    {
                      nhan: 'Giá trị',
                      // Chia về TRIỆU ĐỒNG trước khi vẽ: trục tung mang số hàng
                      // tỷ thì nhãn dài hơn cả biểu đồ, và mắt không so được.
                      diem: bo.chuoi.map((k) => Math.round(k.giaTri / 1_000_000)),
                      mau: 'bd-2',
                    },
                  ]}
                />
                <p className="ghi-chu">
                  Đơn vị: triệu đồng. Kỳ gần nhất đạt{' '}
                  <strong>{tien(bo.soSanh.kyNay?.giaTri ?? 0)} đồng</strong>.
                </p>
              </>
            )}
          </O>
        );

      case 'ban-cung':
        return (
          <Khoi key={ten} tieuDe="Bản cứng" loi={loi} dangTai={bo === null}>
            {bo && (
              <div className="luoi-o">
                <div className="o">
                  <div className="o-dau">
                    <span className="o-ten">Bàn giao xong</span>
                    <span className="o-hoi">theo kỳ</span>
                  </div>
                  <Cot
                    moc={mocKy(bo)}
                    nhom
                    moiN={2}
                    moTa="Số bản cứng bàn giao và số hợp đồng xuất theo từng kỳ"
                    lop={[
                      { nhan: 'Bàn giao', diem: chuoiChiSo(bo, 'banGiao'), mau: 'bd-2' },
                      { nhan: 'Xuất hợp đồng', diem: chuoiChiSo(bo, 'hopDong'), mau: 'bd-1' },
                    ]}
                  />
                  <ChuThich muc={['banGiao', 'hopDong']} mau={['bd-2', 'bd-1']} />
                </div>
                <div className="o">
                  <div className="o-dau">
                    <span className="o-ten">Số ngày làm bản cứng</span>
                    <span className="o-hoi">trung bình mỗi kỳ</span>
                  </div>
                  <p className="o-phu">
                    Quãng dài nhất của cả luồng vì nó đi qua giấy — và là quãng duy nhất bạn tự rút
                    ngắn được.
                  </p>
                  <Duong
                    moc={mocKy(bo)}
                    moTa="Số ngày trung bình từ lúc kế toán nhận bản mềm tới lúc bàn giao bản cứng"
                    dinhDang={(v) => `${Math.round(v)}n`}
                    chuoi={[
                      {
                        nhan: 'Số ngày',
                        diem: bo.chuoi.map((k) => bo.buoc[k.ma]?.saLamBanCung ?? 0),
                        mau: 'bd-2',
                        vung: true,
                      },
                    ]}
                  />
                </div>
              </div>
            )}
          </Khoi>
        );

      case 'hoat-dong':
        return (
          <O key={ten} tieuDe="Hệ thống bận ở đâu" hoi="cửa sổ nhật ký 6 tháng" loi={loiHoatDong} co={hoatDong}>
            {hoatDong && <HoatDong bo={hoatDong} />}
          </O>
        );
    }
  };

  return (
    <section className="trang">
      <div className="dau-trang">
        <h1>Thống kê</h1>
      </div>
      <p className="mo-ta-trang">
        Hoạt động theo kỳ, trong phạm vi dữ liệu của bạn. Tình trạng hiện tại của hồ sơ nằm ở trang{' '}
        <strong>Tổng quan</strong>.
      </p>

      {khoi.includes('vi-sao-khong-co-so') && (
        <ViSaoKhongCoViec ly_do={LY_DO_KHONG_CO_SO[vaiTro] ?? ''} />
      )}

      <ChonNhip ky={ky} datKy={datKy} />
      {bo !== null && bo.loaiTruLegacy > 0 && (
        <p className="ghi-chu">
          Đã loại {bo.loaiTruLegacy} hồ sơ nhập từ dữ liệu cũ khỏi mọi hình — chúng không đi qua
          luồng duyệt nên không có mốc nào để tính vào kỳ.
        </p>
      )}

      {khoi.map(veKhoi)}
    </section>
  );
}

/**
 * Bộ chọn nhịp — bốn nút dính liền, không phải ô chọn xổ xuống.
 *
 * Bốn lựa chọn của MỘT ô, và người dùng đổi qua đổi lại giữa chúng để so: một ô
 * xổ xuống bắt hai cú bấm mỗi lần đổi.
 */
function ChonNhip({ ky, datKy }: { ky: Ky; datKy: (k: Ky) => void }) {
  return (
    <div className="chon-nhip" role="group" aria-label="Nhịp thống kê">
      {MOI_KY.map((k) => (
        <button
          key={k}
          type="button"
          className={k === ky ? 'nut nut-nhip nut-nhip-chon' : 'nut nut-nhip'}
          aria-pressed={k === ky}
          onClick={() => datKy(k)}
        >
          {NHAN_KY[k]}
        </button>
      ))}
    </div>
  );
}

/** Một ô biểu đồ có tiêu đề, tự lo phần đang tải và phần lỗi. */
function O({
  tieuDe,
  hoi,
  loi,
  co,
  children,
}: {
  tieuDe: string;
  hoi?: string;
  loi: unknown;
  co: unknown;
  children?: React.ReactNode;
}) {
  return (
    <Khoi tieuDe={tieuDe} loi={loi} dangTai={co === null}>
      <div className="o">
        {hoi !== undefined && hoi !== '' && (
          <div className="o-dau">
            <span className="o-hoi">{hoi}</span>
          </div>
        )}
        {children}
      </div>
    </Khoi>
  );
}

/**
 * Chú thích màu — và NÓI RA MỐC của từng đường.
 *
 * Bắt buộc, không phải trang trí: "tháng này có bao nhiêu CSBH" là câu chưa đủ
 * nghĩa, và một cái tên cột như *Có hiệu lực* không tự nói ra nó đếm theo mốc
 * nào. Chú thích là chỗ duy nhất còn lại để nói.
 */
function ChuThich({
  muc,
  mau,
  duong,
  tho,
}: {
  muc: string[];
  mau: string[];
  duong?: boolean;
  /** Nhãn đã là câu chữ sẵn, không tra bảng `NEO`. */
  tho?: boolean;
}) {
  return (
    <ul className="chu-thich">
      {muc.map((m, i) => {
        const n = tho ? undefined : NEO[m];
        return (
          <li key={m} className={mau[i]}>
            <i className={duong ? 'dau-duong' : 'dau-o'} aria-hidden="true" />
            <span className="chu-thich-ten">{n?.nhan ?? m}</span>
            {n && <span className="chu-thich-moc">{n.moc}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Luật tính nhãn xu hướng — in ra màn hình, không giấu trong mã. */
const LuatXuHuong = () => (
  <p className="ghi-chu">
    Nhãn xu hướng so <strong>trung bình 3 kỳ đã đóng gần nhất với 3 kỳ trước đó</strong>, lệch từ
    15% trở lên mới đổi nhãn. Kỳ đang chạy không tham gia phép so — nó chưa đủ ngày. Cột số vẫn là
    kỳ đang chạy: so người với người thì công bằng vì ai cũng cùng chừng ấy ngày, chỉ so với quá
    khứ mới không.
  </p>
);

const tongBuoc = (b: { choTbp: number | null; choKtL1: number | null; saLamBanCung: number | null; choKtL2: number | null }) =>
  Number(((b.choTbp ?? 0) + (b.choKtL1 ?? 0) + (b.saLamBanCung ?? 0) + (b.choKtL2 ?? 0)).toFixed(2));

/**
 * Ban lãnh đạo soi từng TDV: xếp hạng ĐỨNG CẠNH phân tán.
 *
 * Hai hình trả lời hai câu khác nhau, và câu thứ hai mới là câu khó: xếp hạng
 * nói ai nhiều hồ sơ nhất, phân tán nói **ai làm nhiều mà hỏng nhiều**.
 */
function HieuQuaTdv({
  bo,
  bo0,
  aiDo,
  chon,
  nguoi,
  ky,
}: {
  bo: BoTheoTdv;
  bo0: BoThongKe | null;
  aiDo: string | null;
  chon: (ma: string | null) => void;
  nguoi: NguoiThongKe | null;
  ky: Ky;
}) {
  return (
    <>
      <p className="o-phu o-phu-canh">
        Bốn chỉ số dưới đây đo <strong>việc chạy hồ sơ CSBH</strong> — không đo doanh số bán hàng.
      </p>
      <div className="luoi-o luoi-o-2-3">
        <div className="o">
          <div className="o-dau">
            <span className="o-ten">CSBH có hiệu lực trong kỳ</span>
            <span className="o-hoi">{bo.nguoi.length} trình dược viên</span>
          </div>
          <XepHang
            nhanCot="Số CSBH"
            dangChon={aiDo}
            chon={(ma) => chon(ma === aiDo ? null : ma)}
            dong={bo.nguoi.map((n) => ({
              ma: n.userId,
              ten: n.ten,
              so: n.kyNay.coHieuLuc,
              chuoi: n.chuoiHieuLuc,
              xuHuong: n.xuHuong,
            }))}
          />
          <LuatXuHuong />
        </div>
        <div className="o">
          <div className="o-dau">
            <span className="o-ten">Làm nhiều và làm chuẩn</span>
            <span className="o-hoi">kỳ này</span>
          </div>
          <p className="o-phu">
            Trục ngang: số CSBH có hiệu lực. Trục dọc: tỷ lệ hồ sơ bị trả lại. Vùng xanh nhạt là nơi
            nên nằm; chấm to là giá trị hồ sơ lớn.
          </p>
          {bo.nguoi.length === 0 ? (
            <Trong tieuDe="Chưa có trình dược viên nào trong phạm vi của bạn" />
          ) : (
            <PhanTan
              moTa="Mỗi trình dược viên một chấm: số CSBH có hiệu lực và tỷ lệ bị trả lại"
              nhanX="số CSBH có hiệu lực →"
              nhanY={(v) => `${Math.round(v)}%`}
              diem={bo.nguoi.map((n) => ({
                ten: n.ten.split(' ').slice(-2).join(' '),
                x: n.kyNay.coHieuLuc,
                y: n.tyLeTraLai ?? 0,
                r: n.kyNay.giaTri,
              }))}
            />
          )}
        </div>
      </div>

      {nguoi !== null && bo0 !== null && (
        <div className="o o-chon">
          <div className="o-dau">
            <span className="o-ten">{nguoi.ten}</span>
            <button type="button" className="lien-phu" onClick={() => chon(null)}>
              Bỏ chọn
            </button>
          </div>
          <p className="o-phu">
            Cùng nhịp <strong>{NHAN_KY[ky].toLowerCase()}</strong>, đường đứt nét là trung vị công
            ty.
          </p>
          <Duong
            moc={bo.chuoi.map((k) => k.nhan)}
            moiN={1}
            moTa={`CSBH có hiệu lực của ${nguoi.ten} so với trung vị công ty`}
            chuoi={[
              { nhan: nguoi.ten, diem: nguoi.chuoiHieuLuc, mau: 'bd-1', vung: true },
              {
                nhan: 'Trung vị',
                diem: bo.chuoi.map((k) => bo0.trungVi[k.ma] ?? 0),
                mau: 'bd-mo',
                mo: true,
              },
            ]}
          />
        </div>
      )}
    </>
  );
}

/** Cơ cấu chất lượng hồ sơ theo từng người — thanh 100%, không phải số tuyệt đối. */
function ChatLuongTdv({ bo, aiDo }: { bo: BoTheoTdv; aiDo: string | null }) {
  const dong = [...bo.nguoi].sort((a, b) => (tyLeKyThang(b.chatLuong) ?? -1) - (tyLeKyThang(a.chatLuong) ?? -1));
  if (dong.length === 0) return <Trong tieuDe="Chưa có ai gửi hồ sơ tới bàn bạn trong kỳ này" />;

  return (
    <>
      <p className="o-phu">
        Mỗi thanh là <strong>100% hồ sơ của người đó</strong>, không phải số tuyệt đối — nếu không
        thì người gửi nhiều luôn có vệt đỏ dài nhất và không so được với ai. Xếp theo phần
        <em> ký thẳng</em> giảm dần, nên người cần kèm cặp nằm dưới cùng.
      </p>
      <ul className="chat-luong">
        {dong.map((n) => {
          const c = n.chatLuong;
          const tong = c.kyThang + c.traLai1 + c.traLaiNhieu + c.tuChoi + c.dangXuLy;
          return (
            <li key={n.userId} className={n.userId === aiDo ? 'chon' : undefined}>
              <span className="chat-luong-ten">{n.ten}</span>
              <ThanhTyLe
                moTa={`${n.ten}: ${c.kyThang} ký thẳng, ${c.traLai1} trả lại một lần, ${c.traLaiNhieu} trả lại từ hai lần, ${c.tuChoi} từ chối, ${c.dangXuLy} đang xử lý`}
                phan={[
                  { nhan: 'Ký thẳng', so: c.kyThang, mau: 'bd-tot' },
                  { nhan: 'Trả lại 1 lần', so: c.traLai1, mau: 'bd-canh' },
                  { nhan: 'Trả lại từ 2 lần', so: c.traLaiNhieu, mau: 'bd-4' },
                  { nhan: 'Từ chối', so: c.tuChoi, mau: 'bd-xau' },
                  { nhan: 'Đang xử lý', so: c.dangXuLy, mau: 'bd-mo' },
                ]}
              />
              <span className="chat-luong-so">{tong}</span>
            </li>
          );
        })}
      </ul>
      <ChuThich
        muc={['Ký thẳng lần đầu', 'Trả lại 1 lần', 'Trả lại từ 2 lần', 'Từ chối', 'Đang xử lý']}
        mau={['bd-tot', 'bd-canh', 'bd-4', 'bd-xau', 'bd-mo']}
        tho
      />
      <p className="ghi-chu">
        Tính theo <strong>lúc gửi</strong>: hồ sơ gửi kỳ trước mà ký trong kỳ này không nằm ở đây.
        Ô <em>Đang xử lý</em> là hồ sơ chưa ngã ngũ — bỏ nó đi thì thanh của kỳ đang chạy nói dối.
      </p>
    </>
  );
}

function SuaLai({ bo }: { bo: BoTheoTdv }) {
  const dong = bo.nguoi
    .filter((n) => n.suaLaiNgay !== null)
    .sort((a, b) => (a.suaLaiNgay ?? 0) - (b.suaLaiNgay ?? 0))
    .map((n) => ({ ten: n.ten.split(' ').slice(-2).join(' '), so: n.suaLaiNgay ?? 0 }));

  if (dong.length === 0) {
    return <Trong tieuDe="Chưa có hồ sơ nào bị trả lại rồi gửi lại trong khoảng này" />;
  }
  return (
    <>
      <p className="o-phu">
        Quãng này <strong>ăn thẳng vào hạn {SLA_NGAY} ngày</strong> của chính hồ sơ ấy. Người sửa
        chậm là chỗ hồ sơ chết mà không ai để ý, vì lúc đó nó nằm ở bàn TDV.
      </p>
      <ThanhNgang
        moTa="Số ngày trung bình từ lúc bị trả lại tới lúc gửi lại, theo từng người"
        dong={dong}
        nguong={5}
        nhanNguong="quá 5 ngày là chậm"
      />
    </>
  );
}

function TheoNhom({ bo }: { bo: BoTheoNhom }) {
  const nhom = [...new Set(bo.dong.map((d) => d.nhom))].sort();
  if (nhom.length === 0) return <Trong tieuDe="Chưa có hồ sơ nào có hiệu lực trong khoảng này" />;

  const tra = new Map(bo.dong.map((d) => [`${d.nhom}|${d.maKy}`, d]));
  // Bốn nhóm là đủ đọc; nhiều hơn thì các đường bện vào nhau và không tách được
  // bằng mắt. Chọn theo SỐ DÒNG, tức là theo nhóm đang thật sự bán.
  const dem = (n: string) => bo.dong.filter((d) => d.nhom === n).reduce((a, d) => a + d.soDong, 0);
  const chon = [...nhom].sort((a, b) => dem(b) - dem(a)).slice(0, 4);
  const mau = ['bd-1', 'bd-2', 'bd-3', 'bd-4'];

  return (
    <>
      <p className="o-phu">
        Một kỳ nhích nửa điểm phần trăm trên toàn danh mục là con số không ai thấy được bằng cách
        mở từng hồ sơ.
      </p>
      <Duong
        moc={bo.chuoi.map((k) => k.nhan)}
        moiN={1}
        dinhDang={(v) => `${Math.round(v)}%`}
        moTa="Chiết khấu bình quân theo nhóm sản phẩm qua các kỳ"
        chuoi={chon.map((n, i) => ({
          nhan: n === '' ? 'Chưa gán nhóm' : n,
          diem: bo.chuoi.map((k) => tra.get(`${n}|${k.ma}`)?.chietKhauTb ?? 0),
          mau: mau[i] ?? 'bd-1',
        }))}
      />
      <ul className="chu-thich">
        {chon.map((n, i) => (
          <li key={n} className={mau[i]}>
            <i className="dau-duong" aria-hidden="true" />
            <span className="chu-thich-ten">{n === '' ? 'Chưa gán nhóm' : n}</span>
          </li>
        ))}
      </ul>
      {nhom.length > chon.length && (
        <p className="ghi-chu">
          Còn {nhom.length - chon.length} nhóm nữa không vẽ ở đây — bốn đường là mức mắt còn tách
          được.
        </p>
      )}
    </>
  );
}

function HoatDong({ bo }: { bo: BoHoatDong }) {
  if (bo.chuoi.length === 0) return <Trong tieuDe="Không có hoạt động nào trong cửa sổ nhật ký" />;

  // Bốn đối tượng bận nhất; phần còn lại gộp làm một để tổng của cột vẫn đúng
  // bằng tổng số việc đã ghi.
  const tong: Record<string, number> = {};
  for (const k of bo.chuoi) {
    for (const [d, n] of Object.entries(k.theoDoiTuong)) tong[d] = (tong[d] ?? 0) + n;
  }
  const chinh = Object.entries(tong)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([d]) => d);
  const mau = ['bd-1', 'bd-2', 'bd-3', 'bd-4'];
  const conLai = (k: (typeof bo.chuoi)[number]) =>
    Object.entries(k.theoDoiTuong).reduce((a, [d, n]) => a + (chinh.includes(d) ? 0 : n), 0);

  return (
    <>
      <p className="o-phu">
        Đếm việc đã ghi trong nhật ký, tách theo đối tượng. Phạm vi dữ liệu của bạn không có hồ sơ
        nào, nên đây là thứ duy nhất nói được hệ thống đang bận ở đâu.
      </p>
      <Cot
        moc={bo.chuoi.map((k) => k.nhan)}
        moTa="Số việc đã ghi trong nhật ký theo từng kỳ, tách theo đối tượng"
        lop={[
          ...chinh.map((d, i) => ({
            nhan: d,
            diem: bo.chuoi.map((k) => k.theoDoiTuong[d] ?? 0),
            mau: mau[i] ?? 'bd-1',
          })),
          { nhan: 'Khác', diem: bo.chuoi.map(conLai), mau: 'bd-mo' },
        ]}
      />
      <ChuThich muc={[...chinh, 'Khác']} mau={[...mau.slice(0, chinh.length), 'bd-mo']} tho />
      <p className="ghi-chu">
        Nhật ký chỉ tra được {bo.window.months} tháng gần nhất, tính từ {ngay(bo.window.from)}.
        {bo.kyBiCat !== undefined && bo.kyBiCat > 0 && ` Đã bỏ ${bo.kyBiCat} kỳ nằm ngoài khoảng đó.`}
      </p>
    </>
  );
}

/** Giữ `tyLe` được dùng — nhãn phần trăm của phân tán và chất lượng. */
export const nhanPhanTram = (v: number | null): string => (v === null ? '—' : tyLe(v));
