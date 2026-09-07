/**
 * Tệp của hồ sơ: tải lên, xem, tải xuống, gỡ. **HAI KHỐI, không phải một**.
 *
 * Nhãn trên màn hình đổi từ *Tệp đính kèm* sang *Bản cứng* ở `0054`. Tên cũ tả
 * cơ chế ("đây là mấy file đính vào"), tên mới tả THỨ NGƯỜI DÙNG NHÌN THẤY: bản
 * giấy đã ký, đã scan lại. Đứng cạnh nút *Xem bản mềm* thì cặp mềm–cứng nói
 * ngay ra hai thứ khác nhau ở chỗ nào.
 *
 * NHƯNG MỘT CÁI TÊN PHẢI PHỦ HAI THỨ, VÀ NÓ PHỦ SAI (`0097`, chốt 23/08). Khối
 * ấy chứa cả hai loại tệp, nên ở hồ sơ **Nháp** người dùng thấy một vùng *Thêm
 * hồ sơ* nằm dưới tiêu đề **Bản cứng** — và đọc ra là "tôi đang tải bản cứng lên
 * lúc hồ sơ còn nháp", một câu vô lý với chính người vừa làm việc đó. Bản cứng
 * là bản giấy đã ký, chưa tồn tại cho tới bước B8.
 *
 * Hai khối, mỗi khối một loại tệp (`sửa 0172` — khối thứ ba, *Giấy tờ hồ sơ*,
 * đã bỏ; xem `KHOI` bên dưới):
 *
 *   *Bản mềm*  — `BAN_MEM`, Sale Admin DỰNG TỪ MẪU ở bước *Sale Admin đang xử lý*.
 *   *Bản cứng* — `SCAN`, Sale Admin tải lên ở cùng bước ấy.
 *
 * Khối rỗng vẫn hiện, kèm một câu nói **ai** tải lên và **lúc nào**. Ẩn nó đi
 * thì câu hỏi "bản cứng đâu" không có chỗ nào trả lời; để nó rỗng không lời thì
 * người xem tưởng có thứ gì đó đang thiếu.
 *
 * Tải xuống là HAI BƯỚC ở phía máy chủ (`DOC-09`): `GET /files/:id/link` cấp một
 * token gắn với đúng người đang gọi, rồi mới tải nội dung. Không có URL công
 * khai nào trên kho lưu trữ, nên không thể chỉ đặt một thẻ neo.
 *
 * Tải lên cũng hai bước, và hai bước đó thuộc HAI SERVICE khác nhau: `document`
 * nhận file thật rồi trả `objectKey`, `policy` ghi con trỏ vào hồ sơ. Gộp lại
 * thành một là bắt `policy` đụng vào MinIO, và `document` phải biết luật nghiệp
 * vụ của hồ sơ.
 */
import { useEffect, useState } from 'react';
import { dang, guiTep, layJson, taiVe, xoa } from '../lib/api.js';
import { ngayGio } from '../lib/format.js';
import { BaoLoi, HopThoaiXacNhan } from './Chung.js';
import { TheTep } from './TheTep.js';
import { VungTaiLen } from './VungTaiLen.js';
import { XemTep } from './XemTep.js';
import { useBaoLoi } from '../lib/bao-loi.js';

export type TepDto = {
  id: string;
  kind: string;
  fileName: string;
  objectKey: string;
  uploadedAt: string;
};

type FileDto = { id: string; objectKey: string };

/*
 * `NHAN_LOAI` ĐÃ GỠ (`0172`) — nó là mã chết từ `0097`, lượt đưa loại tệp lên
 * TIÊU ĐỀ KHỐI: mỗi khối chỉ chứa một loại, nên in lại cái tên ấy trên từng thẻ
 * là in một chữ giống hệt nhau lên mọi thẻ trong cùng một khối. Bảng tra ở lại
 * mà không ai đọc, và không lượt dịch nào báo — một hằng cấp mô-đun không dùng
 * tới không làm `tsc` đỏ. (`HoSoPhapLy` có bảng CÙNG TÊN và nó thì dùng thật:
 * ở đó một khối chứa nhiều loại giấy tờ.)
 */

/**
 * Hai khối, theo thứ tự thời gian của hồ sơ (`0097`).
 *
 * *Bản mềm* đứng trước *Bản cứng* vì Sale Admin dựng bản mềm, in ra, trình ký,
 * rồi mới scan lại. Đọc từ trên xuống là đọc đúng chiều hồ sơ đi.
 *
 * `trong` nói AI tải lên và LÚC NÀO — đó là cả lý do khối rỗng vẫn hiện. Câu
 * "Chưa có tệp nào" của bản trước đúng mà vô dụng: nó không cho biết tệp ấy do
 * ai đưa vào, nên người đang thiếu nó không biết phải hỏi ai.
 *
 * ---------------------------------------------------------------------------
 * KHỐI *GIẤY TỜ HỒ SƠ* (`HO_SO`) ĐÃ BỎ HẲN (`0172`, chốt 01/09)
 * ---------------------------------------------------------------------------
 *
 * Khách hàng: *"bỏ mục giấy tờ hồ sơ, không cần trong thông tin của hồ sơ"* —
 * câu tiếp theo của `0171`, lượt bỏ dòng *File đính kèm* khỏi hai mẫu hồ sơ.
 *
 * Bỏ khỏi ĐÂY chứ không chỉ bỏ khỏi trang: `ChiTietHoSo` là nơi duy nhất dựng
 * component này, nên một mục ở lại bảng mà không trang nào bày ra là một cơ chế
 * không ai dùng mà vẫn chạy — thứ sẽ hỏng lặng lẽ vì không lượt thử tay nào đi
 * qua nó nữa.
 *
 * Đường máy chủ GIỮ NGUYÊN (`kind: 'HO_SO'` vẫn nằm trong `oneOf` của
 * `POST /policies/:id/attachments`, vẫn có chốt vai trò và trạng thái): tệp của
 * hồ sơ cũ còn nguyên trong CSDL lẫn trên kho, và cần bày lại thì chỉ phải dựng
 * lại phần màn hình.
 */
const KHOI: {
  loai: string;
  tieuDe: string;
  trong: string;
  them: string;
  /**
   * Tệp của khối này do HỆ THỐNG DỰNG, không tải lên từ máy (`0167`).
   *
   * Khối *Bản mềm* là khối duy nhất như vậy: nó không có vùng kéo thả, mà một
   * nút mở hộp chọn mẫu → xem trước → lưu. Cờ này là thứ quyết định vẽ cái nào.
   */
  dungTuMau?: boolean;
}[] = [
  {
    /*
     * BẢN MỀM đứng TRƯỚC, và thứ tự ấy theo đúng chiều hồ sơ đi (`0167`).
     *
     * Sale Admin dựng bản mềm trước, in ra, trình ký, rồi mới scan lại thành bản
     * cứng. Đặt nó sau *Bản cứng* là đọc ngược chiều công việc.
     */
    loai: 'BAN_MEM',
    tieuDe: 'Bản mềm',
    trong:
      'Chưa có bản mềm. Sale Admin dựng từ một mẫu hồ sơ đầy đủ ở bước Sale Admin đang xử lý.',
    them: 'Tạo bản mềm',
    dungTuMau: true,
  },
  {
    /*
     * *Bản cứng* → ***File SCAN bản cứng*** (`0181`, chốt 07/09).
     *
     * Tiêu đề cũ gọi tên VẬT — tờ giấy đã ký — trong khi thứ nằm dưới nó là một
     * danh sách FILE. Hai nghĩa ấy lệch nhau đúng ở câu người dùng hay hỏi:
     * *"bản cứng đâu?"* có thể là *"tờ giấy ai đang giữ?"* hoặc *"file scan có
     * chưa?"*, và khối này chỉ trả lời được câu thứ hai.
     *
     * Chỉ đổi Ở ĐÂY. Chữ *bản cứng* ở mọi chỗ khác — *KT duyệt bản cứng*, *Sale
     * Admin bàn giao bản cứng*, khối *Bản cứng* của màn hình Thống kê — vẫn nói
     * về vật ấy chứ không về file, nên đổi chúng theo là làm sai nghĩa cả một
     * bước duyệt lẫn hai biểu đồ đếm lượt bàn giao.
     */
    loai: 'SCAN',
    tieuDe: 'File SCAN bản cứng',
    trong:
      'Chưa có file scan bản cứng. Sale Admin scan bản đã ký rồi tải lên ở bước ' +
      'Sale Admin đang xử lý.',
    them: 'Thêm bản scan',
  },
];

export function TepDinhKem({
  hoSoId,
  tep,
  loaiGhiDuoc,
  taoBanMem,
  taiLai,
}: {
  hoSoId: string;
  tep: TepDto[];
  /**
   * Loại tệp tải lên được NGAY BÂY GIỜ — vai trò AND trạng thái hồ sơ (`0048`).
   *
   * Trước đó chỗ này là một cờ chỉ xét VAI TRÒ, nên ai có quyền đính kèm cũng
   * thấy nút *Tải tệp lên* ở mọi hồ sơ — kể cả hồ sơ đang chờ duyệt hay đã quá
   * hạn, nơi máy chủ trả 409 sau khi người ta đã chọn xong file.
   *
   * Rỗng thì không có nút. Một phần tử thì hộp thoại không hỏi loại nữa — chỉ có
   * một lựa chọn thì bày ra một ô chọn là bắt người dùng xác nhận điều hiển nhiên.
   *
   * ĐÂY CŨNG LÀ NGUỒN DUY NHẤT CHO NÚT GỠ (`0097`). Trước đó có thêm một cờ
   * `choPhepXoa` suy từ `tepXoaDuoc` của máy chủ — một `boolean` cho CẢ HAI loại
   * tệp — nên ở bước *Sale Admin xử lý*, Sale Admin thấy dấu ✕ trên cả giấy tờ
   * do TDV đính từ lúc lập, bấm vào thì 403. Chính cái hỏng mà chú thích ở
   * `assertNguoiGhiTep` nói nó sinh ra để chặn: *nút hiện rồi trả 403*.
   *
   * Máy chủ vốn đã gỡ theo LOẠI của từng tệp (`workflow.detach`), nên câu trả
   * lời đúng nằm sẵn ở đây: gỡ được đúng những loại tải lên được.
   */
  loaiGhiDuoc: string[];
  /*
   * `chiKhoi` ĐÃ GỠ (`0172`).
   *
   * `0170` thêm nó để tách *Giấy tờ hồ sơ* khỏi hai khối kia — khách hàng đưa
   * *Bản mềm* và *Bản cứng* xuống cuối trang, sau khối *Hồ sơ pháp lý*, nên ba
   * khối thôi đứng liền nhau và trang phải gọi component này HAI LẦN.
   *
   * `0172` bỏ hẳn khối *Giấy tờ hồ sơ*, nên hai khối còn lại lại đứng liền nhau
   * và một lượt gọi là đủ. Giữ prop ấy là giữ một phép lọc không lọc gì.
   *
   * Được một khoản: lượt gọi `/files` dựng ảnh thu nhỏ trở lại MỘT lần cho cả
   * trang — cái giá mà `0170` đã đo và chấp nhận.
   */
  /**
   * Mở hộp TẠO BẢN MỀM (`0167`). Bỏ trống thì khối *Bản mềm* không có nút thêm.
   *
   * Hộp thoại sống ở `ChiTietHoSo` chứ không ở đây, vì nó có HAI cửa vào: nút
   * trong khối này, và lượt bấm *Bàn giao* khi hồ sơ chưa có bản mềm. Dựng hai
   * bản của cùng một hộp là hai chỗ phải sửa mỗi lần đổi luật chọn mẫu.
   */
  taoBanMem?: () => void;
  taiLai: () => void;
}) {
  const { bao } = useBaoLoi();
  const [dangChay, datDangChay] = useState<string | null>(null);
  const [dangTaiLen, datDangTaiLen] = useState(false);
  /** Đường xem của từng tệp, xin dần để dựng ảnh thu nhỏ (`0069`). */
  const [duongAnh, datDuongAnh] = useState<Record<string, string>>({});

  /**
   * Đổi `objectKey` của dòng đính kèm sang `fileId` của `document`.
   *
   * Hỏi ĐÚNG LÚC BẤM chứ không tải sẵn cả danh sách file lúc mở màn hình: phần
   * lớn lượt xem hồ sơ không tải tệp nào, và một lời gọi thừa trên mọi lượt mở
   * để phục vụ một thao tác hiếm là đánh đổi sai.
   */
  const layFileId = async (t: TepDto): Promise<string> => {
    const ds = await layJson<FileDto[]>(`/files?ownerKind=POLICY&ownerId=${hoSoId}`);
    const f = ds.find((x) => x.objectKey === t.objectKey);
    if (!f) throw new Error('Không tìm thấy tệp trên kho lưu trữ.');
    return f.id;
  };

  const tai = async (t: TepDto) => {
    datDangChay(t.id);
    try {
      const fileId = await layFileId(t);
      const link = await layJson<{ url: string; fileName: string }>(`/files/${fileId}/link`);
      await taiVe(link.url, link.fileName || t.fileName);
    } catch (e) {
      bao(e);
    } finally {
      datDangChay(null);
    }
  };

  /** Tệp đang chờ xác nhận gỡ. */
  const [hoiGo, datHoiGo] = useState<TepDto | null>(null);

  /**
   * Tệp đang mở xem, kèm đường tải nội dung đã có token (`0051`).
   *
   * Phải xin liên kết TRƯỚC rồi mới mở hộp xem, chứ không để hộp tự xin: đường
   * `/files/:id/content` đòi một token cấp riêng cho người đang gọi (DOC-09),
   * và id của file thì phải tra từ `objectKey` — hai lời gọi mà hộp xem không
   * nên biết. Nó chỉ nhận một đường và vẽ.
   */
  const [dangXem, datDangXem] = useState<{
    duong: string;
    duongTai: string;
    tenTep: string;
  } | null>(null);

  const xem = async (t: TepDto) => {
    datDangChay(t.id);
    try {
      const fileId = await layFileId(t);
      const link = await layJson<{ url: string; fileName: string }>(`/files/${fileId}/link`);
      // `xem=1` cho đường XEM, đường TẢI thì không — chỉ lượt tải mới vào Lịch
      // sử (`0053`). Dùng chung một đường cho cả hai là mở một lối tải không để
      // lại vết nào.
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

  /*
   * Xin đường xem cho ẢNH, và chỉ cho ảnh (`0069`).
   *
   * Ảnh thu nhỏ chỉ dựng được từ nội dung thật, mà nội dung thật đòi hai lời gọi
   * (tra `fileId` rồi xin liên kết có token). Với bản scan PDF — phần lớn tệp ở
   * đây — thẻ hiện đuôi file, nên KHÔNG gọi gì cả.
   *
   * Danh sách file xin MỘT LẦN cho cả nhóm chứ không mỗi tệp một lần: nó là cùng
   * một lời gọi trả về mọi tệp của hồ sơ.
   */
  useEffect(() => {
    const anh = tep.filter((t) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(t.fileName));
    if (anh.length === 0) return;
    const huy = new AbortController();
    void (async () => {
      try {
        const ds = await layJson<FileDto[]>(
          `/files?ownerKind=POLICY&ownerId=${hoSoId}`,
          huy.signal,
        );
        for (const t of anh) {
          const f = ds.find((x) => x.objectKey === t.objectKey);
          if (!f || huy.signal.aborted) continue;
          const link = await layJson<{ url: string }>(`/files/${f.id}/link`, huy.signal);
          // `xem=1`: dựng ảnh thu nhỏ KHÔNG phải một lượt tải, nên nó không được
          // để lại dòng nào trong *Lịch sử* (`0053`).
          if (!huy.signal.aborted) {
            datDuongAnh((cu) => ({ ...cu, [t.id]: `${link.url}&xem=1` }));
          }
        }
      } catch {
        // Hỏng thì thẻ hiện đuôi file — ảnh thu nhỏ là thứ trang trí, không phải
        // đường vào duy nhất. Báo lỗi đỏ ở đây là dựng một cảnh báo cho một việc
        // không ai yêu cầu.
      }
    })();
    return () => huy.abort();
  }, [hoSoId, tep]);

  /**
   * Tải một tệp lên — hai bước ở HAI service, đúng như trước (`0069`).
   *
   * Loại tệp KHÔNG hỏi nữa: `loaiGhiDuoc` do máy chủ tính theo trạng thái hồ sơ
   * và vai trò người đang xem, và ở mọi trạng thái nó chỉ ra đúng MỘT loại. Hộp
   * thoại cũ hỏi loại là hỏi một câu chỉ có một đáp án.
   */
  const taiLen = async (loai: string, f: File) => {
    /*
     * LOẠI đến từ CHÍNH KHỐI đang bấm, không phải `loaiGhiDuoc[0]` (`0167`).
     *
     * Bản trước lấy phần tử đầu, và nó đúng chừng nào hàm ấy trả về nhiều nhất
     * một loại. `0167` cho Sale Admin ghi HAI loại cùng lúc ở bước
     * `SA_DANG_XU_LY` (`['SCAN', 'BAN_MEM']`), nên phần tử đầu là một cái tên
     * bất kỳ trong hai — và tệp tải lên ở khối *Bản cứng* sẽ được ghi dưới nhãn
     * của khối kia, im lặng.
     */
    if (!loaiGhiDuoc.includes(loai)) return;
    datDangTaiLen(true);
    try {
      const form = new FormData();
      form.append('file', f);
      // Tên file đi kèm ĐÃ MÃ HOÁ URL: multer giải mã theo latin1, nên tên tiếng
      // Việt qua đường `originalname` thành ký tự lạ (DOC-18).
      const x = await guiTep<{ objectKey: string; sizeBytes: string }>(
        `/files?ownerKind=POLICY&ownerId=${hoSoId}&purpose=${loai}` +
          `&fileName=${encodeURIComponent(f.name)}`,
        form,
      );
      await dang(`/policies/${hoSoId}/attachments`, {
        kind: loai,
        fileName: f.name,
        objectKey: x.objectKey,
        sizeBytes: x.sizeBytes,
      });
      taiLai();
    } catch (e) {
      bao(e);
    } finally {
      datDangTaiLen(false);
    }
  };

  const go = async (t: TepDto) => {
    datDangChay(t.id);
    try {
      // Gỡ con trỏ ở hồ sơ. File trên kho do `document` giữ và có vòng đời
      // riêng — `DELETE /files/:id` chỉ mở cho TDV và Sale Admin, nên không gọi
      // ở đây: Kế toán gỡ được tệp khỏi hồ sơ mà vẫn không xoá được file.
      await xoa(`/policies/${hoSoId}/attachments/${t.id}`);
      taiLai();
    } catch (e) {
      bao(e);
    } finally {
      datDangChay(null);
    }
  };

  return (
    <>
      {KHOI.map((k) => {
        const cua = tep.filter((t) => t.kind === k.loai);
        const ghiDuoc = loaiGhiDuoc.includes(k.loai);

        return (
          <section key={k.loai} className="khoi-tep">
            <h2>{k.tieuDe}</h2>

            {/*
              MỘT LƯỚI cho cả tệp đã có lẫn chỗ thêm tệp (`0069`).

              Bản trước là một nút *Tải tệp lên* ở trên, rồi một danh sách gạch
              đầu dòng ở dưới, mỗi dòng ba nút chữ. Người dùng phải đọc tên file
              để biết đó là cái gì — mà tệp ở đây gần như luôn là bản scan giấy
              tờ, tên kiểu `IMG_4821.jpg`.
            */}
            {cua.length === 0 && !ghiDuoc ? (
              <p className="trong">{k.trong}</p>
            ) : (
              <div className="luoi-tep">
                {cua.map((t) => (
                  <TheTep
                    key={t.id}
                    tenTep={t.fileName}
                    /*
                      Chỉ còn MỐC THỜI GIAN. Loại tệp đã nằm ở tiêu đề khối, và
                      lặp lại nó trên từng thẻ là in một chữ giống hệt nhau lên
                      mọi thẻ trong cùng một khối (`0097`).
                    */
                    phu={ngayGio(t.uploadedAt)}
                    duongXem={duongAnh[t.id] ?? null}
                    dangChay={dangChay === t.id}
                    choPhepGo={ghiDuoc}
                    xem={() => void xem(t)}
                    tai={() => void tai(t)}
                    go={() => datHoiGo(t)}
                  />
                ))}

                {/*
                  Vùng tải lên đứng CUỐI, cạnh những tệp đã có — chỗ để thêm nằm
                  ngay sau chỗ đang có, nên không phải đi tìm nút ở đâu khác rồi
                  quay lại.

                  Chỉ hiện cho người CÓ QUYỀN, và chỉ ở ĐÚNG KHỐI của loại tệp
                  ấy: `loaiGhiDuoc` do máy chủ tính theo cả trạng thái hồ sơ lẫn
                  vai trò (`0069`). Ở hồ sơ Nháp nó là `['HO_SO']`, nên vùng này
                  hiện dưới *Giấy tờ hồ sơ* và KHÔNG hiện dưới *Bản cứng*.
                */}
                {ghiDuoc &&
                  (k.dungTuMau === true ? (
                    /*
                      Một NÚT, không phải vùng kéo thả (`0167`). Bản mềm không
                      nằm sẵn trên máy ai để mà chọn — nó được dựng ra từ dữ liệu
                      hồ sơ và một mẫu, nên câu hỏi đầu tiên là *"mẫu nào"*.
                    */
                    taoBanMem !== undefined && (
                      <button type="button" className="vung-tai-len" onClick={taoBanMem}>
                        {/*
                          DÙNG LẠI `.vung-tai-len` cho cái nút này, dù nó không
                          nhận file nào: hai khối đứng cạnh nhau trong cùng một
                          lưới, và một ô vuông nét đứt bên cạnh một nút chữ nhật
                          làm cái lưới ấy trông như bị hỏng. Hình dạng nói "chỗ
                          để thêm một tệp", và đó đúng là việc nó làm.
                        */}
                        {k.them}
                      </button>
                    )
                  ) : (
                    <VungTaiLen
                      nhan={k.them}
                      dangTai={dangTaiLen}
                      chon={(f: File) => void taiLen(k.loai, f)}
                    />
                  ))}
              </div>
            )}
          </section>
        );
      })}

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
          tieuDe={`Gỡ tệp "${hoiGo.fileName}"`}
          /*
            Hậu quả nói ĐÚNG loại tệp đang gỡ (`0097`). Bản trước mở đầu bằng
            "Nếu đây là bản scan thì…" — một câu điều kiện mà người đọc phải tự
            trả lời, trong khi màn hình biết thừa câu trả lời.
          */
          hauQua={
            hoiGo.kind === 'SCAN' ? (
              <p>
                Tệp không còn gắn với hồ sơ này nữa, và <strong>bước bàn giao bị chặn lại</strong>{' '}
                cho tới khi có bản scan mới — mà tải lại thì phải có bản giấy trong tay.
              </p>
            ) : (
              /*
                BẢN MỀM, nhánh còn lại từ `0172` (trước đó nhánh này nói về giấy
                tờ do TDV đính). Bàn giao cũng bị chặn — `BAN_MEM_REQUIRED` của
                `0167` — nhưng khác bản cứng ở chỗ QUAN TRỌNG: dựng lại được ngay
                từ một mẫu, không phải đi tìm tờ giấy.
              */
              <p>
                Bản mềm này không còn gắn với hồ sơ nữa, và{' '}
                <strong>bước bàn giao bị chặn lại</strong> cho tới khi có bản mềm mới. Dựng lại được
                ngay từ một mẫu hồ sơ đầy đủ.
              </p>
            )
          }
          nhanNut="Gỡ tệp"
          dangChay={dangChay === hoiGo.id}
          dong={() => datHoiGo(null)}
          xacNhan={() => void go(hoiGo).then(() => datHoiGo(null))}
        />
      )}

    </>
  );
}
