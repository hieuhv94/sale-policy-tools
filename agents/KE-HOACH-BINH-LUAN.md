# Kế hoạch: Bình luận trên hồ sơ CSBH

> **TRẠNG THÁI (07/11/2026): Bước 1 XONG — mockup bản 2 ĐÃ DUYỆT. Bước 2 XONG — mọi quyết định đã chép vào
> `comment_system_requirements.md` (2.2 · 3.2 · 4 · 6.2 · 6.3 · 9.6 · 9.7 · AC 20/31a/31b). **
> **P297 (`0261`) XONG 07/11** — lược đồ + API ở `policy`, 3185/3185 xanh.
> **P298 (`0262`) XONG 07/11** — thông báo chuông, kiểm quyền lúc đọc, tự đọc theo bình luận, 3207/3207 xanh.
> **P299 (`0263`) XONG 07/11** — tệp đính kèm: mục đích `BINH_LUAN`, quyền đọc hỏi `policy`, dọn ở *Dọn dữ liệu*.
> **P300 (`0264`) XONG 07/11** — giao diện theo mockup bản 2; QA ảnh thật để P301.
> **Kế tiếp: P301 (`0265`) demo, tài liệu, QA hình ảnh.**
> Lệch so với kế hoạch: nhắc tên lưu TRONG CHỮ dạng `@{uuid}` (không có bảng `binh_luan_nhac`, không gửi vị trí);
> tệp đính kèm chưa có ở P297 (để P299 như kế hoạch). Xem nhật ký P297.
>
> **Đánh số lại**: P296 (`0260`) đã có người dùng (*Ban lãnh đạo không nhận bất kỳ thông báo nào*), nên
> các chặng của tính năng này là **P297–P301**, mã **`0261`–`0265`**. Số TỆP migration vẫn bắt đầu từ `0128_`.
>
> | Thứ | Ở đâu |
> |---|---|
> | Yêu cầu đã duyệt | `agents/comment_system_requirements.md` |
> | Kế hoạch (tệp này) | `agents/KE-HOACH-BINH-LUAN.md` |
> | Mockup (đã publish) | https://claude.ai/artifact/M9CzyKU338eAmjFuVpMip9 — bản 2 |
> | Mã nguồn mockup | `artifacts/binh-luan-mockup.html` — publish lại bằng `Artifact` kèm `url` trên |
>
> **Quyết định đã chốt THÊM sau khi viết yêu cầu** (chưa chép vào `comment_system_requirements.md`
> — đó là việc đầu của Bước 2):
> - Ban lãnh đạo ĐƯỢC bình luận (viết, reply, cảm xúc) — ngoại lệ có chủ ý của "BLĐ chỉ đọc".
> - Ban lãnh đạo **KHÔNG được nhắc tên, KHÔNG nhận thông báo bình luận** (chốt 07/11, theo P296 `0260`).
> - Thông báo bình luận TỰ tính là đã đọc khi bình luận hiện trên màn hình người nhận.
> - Danh sách nhắc tên = bốn cột người của hồ sơ (Kế toán khi `da_qua_tbp`), đang hoạt động, trừ chính mình.
>   **Không cần** đường identity "mọi BLĐ" nữa.
> - `di()` đã tách `#` từ `0255` — mục 9.6 của yêu cầu ghi sai; việc còn lại là cuộn tới bình luận.
> - Luồng nhiều phản hồi: chỉ hiện **3 phản hồi mới nhất**, nút *Xem N phản hồi trước* mở từng đợt
>   **20**, mở hết thì *Thu gọn*; phản hồi mới luôn vào cuối, không bị thu gọn (người dùng hỏi, đã
>   thêm vào mockup bản 2) → đường `phan-hoi` phải phân trang 20.
>
> **Chỗ mockup tự quyết, ĐÃ được duyệt cùng mockup (nay là luật, mục 9.7):** vai trò hiện cạnh tên; sửa và trả lời
> ngay tại chỗ (không dùng ô soạn chung); ảnh đại diện reply 28px (yêu cầu ghi 32px); dòng trích đoạn
> in nghiêng trong chuông; dòng *Tự cập nhật · 15 giây trước* ở đầu khối.


## Context

Chủ sản phẩm đã duyệt [agents/comment_system_requirements.md](agents/comment_system_requirements.md) (viết lại 06/11/2026):
bình luận chữ thuần + `@` nhắc tên + liên kết, reply một cấp, sửa (nhãn *Đã sửa*), xoá mềm chỉ của
tác giả, reaction 6 emoji, tệp đính kèm (dọn khi xoá), thông báo CHỈ trên chuông ở bậc VIỆC, tự cập
nhật ≤ 30 giây bằng hỏi định kỳ, không lưu nháp, quyền = phạm vi hồ sơ, chỉ trên hồ sơ CSBH.

Chốt thêm trong lượt lập kế hoạch:
- **Ban lãnh đạo ĐƯỢC bình luận** (viết, reply, reaction, được nhắc) — ngoại lệ có chủ ý của luật
  "BLĐ chỉ đọc"; SEC-13 thêm danh sách miễn trừ có lý do, chỉ cho các đường bình luận.
- **Thông báo tự tính là đã đọc** khi bình luận tương ứng hiện trên màn hình của người nhận.

Yêu cầu của người dùng cho lượt này: **bước đầu là mockup giao diện để duyệt**; giao diện theo
[professional-frontend-design-skill.md](agents/professional-frontend-design-skill.md) và khớp giao diện
đã làm lại ở P288–P295; **ca kiểm phủ mọi trường hợp và mọi lỗi có thể xảy ra**.

Dữ kiện đã dò được (ảnh hưởng thiết kế):
- BLĐ có phạm vi = mọi người dùng → thấy mọi hồ sơ; Quản trị phạm vi rỗng
  (`db/migrations/0031_phan_cong_thay_cay_to_chuc.sql:121`).
- Không có đường "ai mở được hồ sơ này" — phải dựng; identity chưa có đường "mọi BLĐ đang hoạt động".
- Mọi `policy.*` làm `reporting` tính lại hồ sơ (`services/reporting/src/sync.service.ts:36`) → sự kiện
  bình luận dùng khoá định tuyến **`binh_luan.*`**, không `policy.*`; thêm binding cho `notification`
  ở `packages/bus/src/topology.ts` (audit đã nghe `#`).
- `assertCanRead` của `document` **không áp luật Kế toán `da_qua_tbp`** — tệp bình luận phải hỏi đúng
  phạm vi của `policy`.
- `di()` đã tách `#` từ `0255`; thiếu bước **cuộn tới bình luận** sau khi chuyển trang.
- Migration kế tiếp là tệp `0128_*.sql` (nhãn mã thay đổi tiếp theo `0260`).
- `ADD VALUE` enum phải ở migration riêng (bài học `0121`/`0122`).

## Bước 1 — Mockup để duyệt (CỔNG: không viết mã sản phẩm trước khi duyệt)

Một trang Artifact tương tác, công khai riêng tư, bằng tiếng Việt. Khi làm: gọi
`Artifact action: quickstart, intent: other` + nạp skill `artifact-design` trước khi viết tệp.

**Hướng thiết kế (bám hệ đang có, không phát minh phong cách mới):**
- Chép **giá trị token thật** từ `impl/apps/web/src/styles/tokens.css` (màu `--mau-*`, khoảng `--k1…k6`,
  chữ `--chu-*`, bo góc, bóng, `--vung-cham`) cả ba bảng (sáng / tối hệ thống / tối tay) vào trang.
- Phông Be Vietnam Pro (mockup dùng Google Fonts; sản phẩm tự host — không đổi gì).
- Dựng lại đúng bối cảnh `ChiTietHoSo`: đầu trang (mã + nhãn trạng thái + nút), cụm hai cột (*Thông
  tin chung* · *Tiến trình duyệt*), bảng sản phẩm thu gọn, khối tệp, **khối Bình luận** đặt ngay trên
  *Lịch sử* (`LichSuGap`), theo ngôn ngữ `.khoi-gap`/`h2` của trang chứ không phải một thẻ nổi riêng.
- Ảnh đại diện = `.anh-dai-dien` (32px, chữ cái đầu, nền thương hiệu nhạt); biểu tượng SVG nét 1.75
  kiểu `components/BieuTuong.tsx`; nút `.nut-chinh` / `.nut-nhe` / `.nut-canh-bao` (viền đỏ ngoài hộp
  thoại); xác nhận xoá dùng hình `HopThoaiXacNhan`.
- Bình luận là **luồng hội thoại, không bọc mỗi bình luận trong một thẻ**: phân cách bằng khoảng trắng,
  reply thụt lề với đường nối mảnh màu `--mau-vien`; menu thao tác hiện khi rê/tiêu điểm, luôn hiện trên
  cảm ứng (lối `0132`).
- Mention: chữ màu thương hiệu + nền nhạt, không viền. Liên kết gạch chân.

**Nội dung mockup (một bộ chuyển trạng thái + bộ chuyển khổ 1440 / 768 / 390 + sáng/tối):**
1. Luồng bình thường: 3 bình luận gốc, một có 2 reply, một *Đã sửa*, một mang ảnh + PDF, reaction có số.
2. Thread dài thu gọn *Xem tất cả N phản hồi*; nút *Xem bình luận cũ hơn* ở đầu.
3. Bình luận đã xoá (có reply còn lại).
4. Ô soạn: trống · đang gõ có mention · **danh sách gợi ý `@`** (đang tải / có kết quả tô phần khớp /
   không tìm thấy / lỗi) · chế độ trả lời (*Đang trả lời …*) · chế độ sửa (*Lưu* / *Huỷ*) · tệp đang tải
   (tiến trình) · tệp lỗi (*Thử lại* / *Gỡ*) · đang gửi (nút xám) · gửi lỗi (câu dưới ô, giữ chữ).
5. Chỉ báo *N bình luận mới* khi đang cuộn lên; bình luận mới tô nổi chốc lát.
6. Trạng thái khối: chưa có bình luận · đang tải (khung xương) · không tải được · mất quyền.
7. Bình luận đang trả lời bị xoá (câu báo).
8. Hộp xác nhận xoá.
9. Chuông thông báo: dòng *"… đã nhắc đến bạn trong một bình luận"* / *"… đã phản hồi một bình luận
   của bạn"* (kẻ xanh bậc VIỆC, ba dòng: câu · mã hồ sơ + khách · trích đoạn) cùng dòng mất quyền (chỉ
   còn tiêu đề).
10. Khổ 390: menu thao tác luôn hiện, ô soạn dính đáy khối, vùng chạm 44px.

Kèm dưới mockup: ghi chú các quyết định thiết kế + tự chấm theo thang 100 điểm của tài liệu thiết kế
(chấm thận trọng, nói rõ chỗ chưa kiểm). **Đưa link cho người dùng duyệt; sửa theo phản hồi; chỉ sang
Bước 2 khi được duyệt.**

## Bước 2 — Đồng bộ tài liệu yêu cầu (sau khi duyệt mockup, cùng chặng đầu)

Sửa `agents/comment_system_requirements.md`: BLĐ được bình luận (2.2, bảng quyền, SEC-13); thông báo tự
đọc khi thấy trên trang (6.3); danh sách nhắc tên = bốn cột người (Kế toán khi `da_qua_tbp`) + mọi BLĐ
đang hoạt động (4); 9.6 ghi đúng là `di()` đã tách `#`, việc còn lại là cuộn tới bình luận; mọi điều
mockup chốt khác.

## Bước 3 — Triển khai theo chặng (mỗi chặng đủ 6 việc của `CLAUDE.md`)

Mỗi chặng: sửa ở nguồn → ca kiểm → **phá lại** (đỏ đúng tầng, ghi ca nào xanh và vì sao) → đồng bộ YCNV
(thân bài + Phụ lục B) và HDSD → khai mã lỗi ở `loi.ts` → mục nhật ký `## P<số>` kết bằng `**N/N
xanh.**` → commit `P<số>: …` trên `v1.0`, không push.

### P297 (`0261`) — Lược đồ + API bình luận ở `policy`
- Migration `0128_binh_luan.sql` (schema `pol`, quyền mặc định của `csbh_pol` đã tự cấp):
  - `pol.binh_luan`: `id`, `policy_id` FK `ON DELETE CASCADE` (bản Nháp xoá hẳn thì mất theo),
    `parent_id` (NULL = gốc; CHECK cha phải là gốc qua trigger), `tac_gia_id`, `noi_dung`, `tao_luc`,
    `sua_luc`, `xoa_luc`, `ma_gui uuid UNIQUE` (chống gửi trùng khi thử lại sau mất mạng),
    `stt_doi bigint` lấy từ sequence ở mọi INSERT/UPDATE (trigger) — mốc đơn điệu cho đường hỏi thay đổi
    (không dùng `now()`, bẫy `0126`).
  - `pol.binh_luan_nhac (binh_luan_id, user_id, tu, den)` — vị trí đếm theo **code point** sau chuẩn hoá NFC.
  - `pol.binh_luan_tep (binh_luan_id, file_id UNIQUE, ten, mime, co, go_luc)`.
  - `pol.binh_luan_cam_xuc (binh_luan_id, user_id, loai, PRIMARY KEY (…))`, `loai` CHECK 6 giá trị;
    thả/gỡ đẩy `stt_doi` của bình luận.
  - Chỉ mục: `(policy_id, parent_id, tao_luc)`, `(policy_id, stt_doi)`.
- Phần THUẦN ở `packages/domain-policy` (giao diện dùng chung, không chép số): `GIOI_HAN_BINH_LUAN`
  (5.000 ký tự, 20 nhắc, 5 tệp, 10MB, 6 loại cảm xúc, nhịp 15s/30s) và `binh-luan.ts`: `chuanNoiDung`
  (NFC, cắt khoảng trắng đầu-cuối), `kiemNhac` (vị trí hợp lệ, không chồng, không trùng người quá hạn),
  `tachLienKet` (chỉ `http(s)://`).
- Đường (gateway đã định tuyến `/policies/*` về `policy`, không sửa `routes.ts`):
  - `GET  /policies/:id/binh-luan?truoc=<id>&limit=20` — 20 gốc mới nhất (trả tăng dần) + 3 reply mới
    nhất mỗi gốc + số reply + cảm xúc gom + tệp + mốc `stt`.
  - `GET  /policies/:id/binh-luan/:bid/phan-hoi?truoc=<id>&limit=20` — phân trang lùi, 20 mỗi lượt
  - `GET  /policies/:id/binh-luan/thay-doi?tu=<stt>` — mọi bình luận/reply có `stt_doi > tu`.
  - `GET  /policies/:id/binh-luan/nguoi-nhac?q=` — người đứng tên trên hồ sơ: bốn cột (KT khi
    `da_qua_tbp`), lọc tên/email, tối đa 10, bỏ tài khoản vô hiệu hoá, bỏ chính mình. **Không BLĐ.**
  - `POST /policies/:id/binh-luan` `{maGui, noiDung, nhac:[{userId,tu,den}], parentId?, tep:[fileId]}`
  - `PATCH /policies/:id/binh-luan/:bid` `{noiDung, nhac, tep}`
  - `DELETE /policies/:id/binh-luan/:bid`
  - `PUT|DELETE /policies/:id/binh-luan/:bid/cam-xuc/:loai` (idempotent)
- Mọi đường: `assertPolicyInScope` (giữ `da_qua_tbp` trong SELECT); ghi: `@Roles('TDV','TBP','KE_TOAN',
  'SALE_ADMIN','BAN_LANH_DAO')`; tác giả lấy từ token; máy chủ tự kiểm lại mọi người được nhắc (tồn tại,
  hoạt động, trong phạm vi) và mọi tệp (của chính người gửi, mục đích `BINH_LUAN`, gắn đúng hồ sơ, chưa
  gắn bình luận khác).
- Outbox `pol.outbox` khoá `binh_luan.tao|sua|xoa|cam_xuc` (payload: policyId, binhLuanId, parentId,
  tacGiaId, nguoiDuocNhacMoi[], tacGiaGoc, trích đoạn); `audit` ghi *ai, lúc nào, hành động*, **không
  nội dung**.
- `internal.controller` KHÔNG trả bình luận (ca ghim).
- Gateway: luật `binhLuan` (30/phút/người) và `timNguoiNhac` (60/phút/người) ở `rate-limit.ts` + `ruleFor`.
- Mã lỗi mới (khai `loi.ts`): `BINH_LUAN_RONG`, `BINH_LUAN_QUA_DAI`, `BINH_LUAN_KHONG_TIM_THAY`,
  `BINH_LUAN_DA_XOA`, `KHONG_PHAI_TAC_GIA`, `PHAN_HOI_LONG_NHAU`, `BINH_LUAN_GOC_DA_XOA`,
  `NHAC_TEN_KHONG_HOP_LE`, `QUA_NHIEU_NHAC_TEN`, `QUA_NHIEU_TEP`, `TEP_KHONG_HOP_LE`,
  `CAM_XUC_KHONG_HOP_LE`.
- SEC-13: thêm `MIEN_BLD_CO_LY_DO` chỉ gồm các đường bình luận, kèm ca chiều ngược (đường khác cho BLĐ
  vẫn đỏ).

### P298 (`0262`) — Thông báo bình luận
- `topology.ts`: hàng đợi `notification` nghe thêm `binh_luan.#`.
- `notify.service.handle()`: nhánh sớm cho `binh_luan.tao|sua` (lối `oDia`): người nhận = người mới
  được nhắc ∪ tác giả gốc (khi là reply) − người hành động − tài khoản vô hiệu hoá; một người một dòng;
  `ghiThongBao` kind `CHINH`, **không** `claim`/`mailer.send` (ghi chú ngoại lệ `0096` tại chỗ); câu
  chữ đúng hai câu đã chốt, `mo_ta` = mã hồ sơ · tên khách + trích đoạn 100 ký tự; `duong_dan` =
  `/ho-so/:id#binh-luan-:bid`.
- Migration `0129_…`: `ntf.thong_bao` thêm `binh_luan_id`.
- **Kiểm quyền lúc đọc**: `GET /notifications/cua-toi` hỏi `policy` (`POST /internal/policies/trong-pham-vi`
  — userId + danh sách policyId) cho các dòng bình luận; mất quyền → chỉ trả tiêu đề.
- **Tự đọc khi thấy**: `POST /notifications/da-doc-binh-luan {binhLuanIds}` — giao diện gọi khi bình
  luận lọt vào khung nhìn (`IntersectionObserver`); trả số đếm mới để chuông cập nhật ngay; đồng bộ
  tab khác bằng `BroadcastChannel`.
- `NHIP_HOI_MS` 60 → 30 giây.

### P299 (`0263`) — Tệp đính kèm bình luận
- Migration `0130_…` riêng: `ALTER TYPE doc.file_purpose ADD VALUE 'BINH_LUAN'`.
- `files.service`: `ALLOWED.BINH_LUAN` = jpeg/png/webp/pdf/docx/xlsx (byte đầu), trần 10MB riêng mục
  đích này; `POST /files` nhận `purpose=BINH_LUAN` với `ownerKind=POLICY`, mở cho `BAN_LANH_DAO` chỉ ở
  mục đích này (vào miễn trừ SEC-13).
- Quyền đọc tệp `BINH_LUAN`: hỏi `policy` theo đúng `assertPolicyInScope` (có luật `da_qua_tbp`),
  không dùng `mucDocHoSo` bốn cột.
- Dọn: `sla-worker` thêm bước vào `runRetention` (lượt `DON_DU_LIEU`): `policy` liệt kê tệp phải dọn
  (bình luận đã xoá, tệp đã gỡ khi sửa), `document` (đường `@ServiceOnly`) xoá object MinIO + dòng
  `doc.stored_file`, cộng tệp `BINH_LUAN` không ai gắn quá 24 giờ. Số đã dọn vào `chi_tiet` của
  `ops.lan_chay` (hiện ở *Vận hành → Lịch tự động*).

### P300 (`0264`) — Giao diện
- `components/BinhLuan/`: `KhoiBinhLuan` (khối trên trang, đặt trước `LichSuGap` trong `ChiTietHoSo`),
  `DongBinhLuan`, `OSoanBinhLuan` (ô nhập tự viết, tự giãn, Enter/Shift+Enter, mention token, kéo-thả
  + nút chọn tệp qua `guiTep`, `beforeunload` + hỏi lại khi điều hướng trong ứng dụng), `GoiYNhac`
  (`role="listbox"`, ↑/↓/Enter/Esc, chờ 250ms), `CamXuc`. Ảnh mở bằng `XemTep`.
- `lib/binh-luan.ts` (thuần, có export cho test): hợp nhất kết quả hỏi thay đổi vào danh sách (khử
  trùng theo id), dựng đoạn chữ từ token nhắc + liên kết, thời gian tương đối giờ VN.
- Hook hỏi định kỳ 15s (dừng khi tab ẩn, hỏi ngay khi quay lại / sau khi tự gửi), lỗi hụt **nuốt có lý
  do** (khai `NUOT_CO_LY_DO`), 403/404 → trạng thái mất quyền.
- Liên kết `#binh-luan-:bid`: tải đủ tới bình luận rồi cuộn + tô nổi; *Sao chép liên kết*.
- Câu lỗi mọi mã mới ở `loi.ts`; `aria-live` cho gửi thành công/thất bại; `prefers-reduced-motion`.
- Không thêm phụ thuộc nào (bundle test giữ đúng ba gói).

### P301 (`0265`) — Demo, tài liệu, QA hình ảnh
- `seed-demo.ts`: vài luồng bình luận mẫu (có reply, nhắc tên, cảm xúc, một bình luận đã xoá) — kèm ca
  `tests/db/bo-nap-demo.test.ts` đối chiếu cột.
- YCNV + Phụ lục B, HDSD mục bình luận, `04-TRIEN-KHAI` nếu cần.
- **QA hình ảnh bắt buộc** (mục 7 tài liệu thiết kế, cách P293): `pnpm build:web` lên chồng demo, chụp
  ảnh thật 1440×900 / 768×1024 / 390×844, sáng + tối, mọi trạng thái của Bước 1; so với mockup đã duyệt;
  sửa rồi chụp lại; tự chấm điểm.
- Đo tải nhịp hỏi trên chồng demo thật, dán số vào nhật ký.

## Danh mục ca kiểm (đủ mọi trường hợp + lỗi)

Tầng: **T** = thuần (`domain-policy`/`lib`), **H** = HTTP với Postgres thật (`tests/http/binh-luan*.test.ts`),
**N** = notification (Mailpit thật), **W** = `tests/web` (jsdom), **Q** = quét mã nguồn.

**Nội dung & kiểm hợp lệ (T + H)**
- Rỗng, chỉ khoảng trắng, chỉ xuống dòng → `BINH_LUAN_RONG`; chỉ có tệp → được.
- 5.000 ký tự → được; 5.001 → `BINH_LUAN_QUA_DAI`; đếm theo code point (emoji 2 đơn vị UTF-16 vẫn là 1);
  chuỗi NFD được chuẩn hoá NFC trước khi đếm và lưu.
- `<script>`, `<img onerror>`, `&lt;` lưu và hiện nguyên văn (W kiểm không có phần tử nào được tạo).
- `https://a.b` → liên kết, `target=_blank` + `rel=noopener noreferrer`; `javascript:`, `data:`, `www.x`
  → không; liên kết dính dấu câu cuối (`…/x).`) cắt đúng.
- Từ rất dài không làm tràn khối (W kiểm lớp `overflow-wrap`).
- Thiếu trường / sai kiểu / `parentId` không phải uuid → `VALIDATION_FAILED`.

**Phạm vi & quyền (H)** — cho TỪNG đường (đọc, trang, phản hồi, thay đổi, người nhắc, tạo, sửa, xoá, cảm xúc, tải tệp):
- TDV phụ trách, TBP đã chọn, Kế toán sau `da_qua_tbp`, Sale Admin đã chọn, BLĐ → được.
- Kế toán trước khi TBP ký → 403; sau khi ký thấy cả bình luận lúc Nháp.
- TDV khác, TBP khác, Kế toán khác → 403; Quản trị → 403.
- Đổi người duyệt / đổi TDV phụ trách → người cũ 403 ngay lượt kế.
- Hồ sơ không tồn tại → 404; bình luận không thuộc hồ sơ trong URL (đổi ID) → 404.
- Giả mạo `tacGiaId` trong thân → bị bỏ qua.
- Người khác sửa / xoá → `KHONG_PHAI_TAC_GIA`; BLĐ sửa bình luận người khác → 403.
- Bình luận được ở mọi trạng thái hồ sơ (bảng ca theo `STATUSES`, gồm `DA_XOA`, `HET_HIEU_LUC`, `QUA_HAN_DUYET`).
- Bản Nháp bị xoá → bình luận, nhắc, cảm xúc, tham chiếu tệp biến mất (cascade).
- Phiên bản mới → luồng trống; bản cũ vẫn đọc được.
- SEC-13: mọi đường ghi bình luận có `@Roles` đủ 5 vai trò; miễn trừ BLĐ chỉ đúng các đường ấy (ca ngược).

**Reply, sửa, xoá (H)**
- Reply vào gốc → được; reply vào reply → `PHAN_HOI_LONG_NHAU`; `parentId` của hồ sơ khác → 404.
- Reply vào gốc đã xoá → `BINH_LUAN_GOC_DA_XOA`; reply cũ vẫn trả về.
- Sửa → `sua_luc`, nội dung mới; sửa bình luận đã xoá → `BINH_LUAN_DA_XOA`; xoá lại lần hai → `BINH_LUAN_DA_XOA`.
- Xoá → nội dung không còn trong MỌI phản hồi API (kể cả đường thay đổi) cho mọi người, kể cả tác giả.
- Cảm xúc trên bình luận đã xoá → `BINH_LUAN_DA_XOA`; loại ngoài 6 → `CAM_XUC_KHONG_HOP_LE`.
- Cùng `maGui` gửi hai lần (giả lập mất phản hồi) → một bình luận, lần hai trả lại bản đã có.
- Hai lượt gửi song song cùng `maGui` → một dòng (ràng buộc CSDL, `Promise.all` thật sự song song).
- Thả cùng cảm xúc hai lần song song → một dòng; gỡ khi chưa thả → 204 không lỗi.

**Phân trang & hỏi thay đổi (H + W)**
- 45 gốc → trang 1 = 20 mới nhất tăng dần; `truoc` hai lần đủ 45, không trùng, không sót.
- Thread 10 reply → trang đầu 3 + số 10; `phan-hoi` trả đủ 10 tăng dần.
- `thay-doi?tu=X` trả bình luận mới, đã sửa, đã xoá (không nội dung), cảm xúc đổi; không trả gì khi không đổi.
- Hai bình luận ghi trong cùng transaction đều có mốc riêng (không lọt).
- Bình luận mới đến trong lúc đang tải trang cũ → không trùng, không mất (W).

**Nhắc tên (T + H + W)**
- `nguoi-nhac`: lọc tên có dấu/không dấu? (khớp không phân biệt hoa thường, theo NFC), lọc email; tối đa 10.
- Không có người ngoài phạm vi, không tài khoản vô hiệu hoá, không chính mình, **không BLĐ**, KT chỉ sau `da_qua_tbp`.
- Gửi mention bằng ID một người BLĐ → `NHAC_TEN_KHONG_HOP_LE`. Reply vào bình luận của BLĐ → BLĐ không có dòng thông báo nào.
- Gửi nhắc người ngoài phạm vi / không tồn tại / vô hiệu hoá → `NHAC_TEN_KHONG_HOP_LE`; 21 người → `QUA_NHIEU_NHAC_TEN`.
- Vị trí nhắc ngoài chuỗi, chồng nhau, không khớp chữ `@tên` → `NHAC_TEN_KHONG_HOP_LE`.
- Nhắc một người 3 lần → 1 dòng nhắc, 1 thông báo.
- Đổi tên người được nhắc → bình luận cũ hiện tên mới.
- W: gõ `@` mở danh sách; ↑/↓/Enter/Esc; Enter khi danh sách mở chọn người, không gửi; chuột chọn;
  xoá lùi vào token xoá cả token; trạng thái đang tải / rỗng / lỗi; chờ 250ms (đồng hồ giả).

**Thông báo (N + H + W)**
- Được nhắc → đúng câu *"… đã nhắc đến bạn trong một bình luận"*, `kind=CHINH`, đúng `duong_dan`.
- Reply bình luận của mình → *"… đã phản hồi một bình luận của bạn"*.
- Vừa được nhắc vừa là tác giả gốc → MỘT dòng.
- Tự nhắc mình / tự trả lời mình → không dòng nào.
- Sửa thêm người mới → chỉ người mới nhận; sửa không đổi người nhắc → không gì.
- Người nhận đã vô hiệu hoá → không dòng.
- **Không thư nào** tới Mailpit cho mọi sự kiện bình luận.
- Cảm xúc, xoá → không thông báo.
- Sự kiện bình luận **không** làm `reporting` tính lại hồ sơ (đếm lượt `refreshPolicy`).
- Mất quyền → danh sách chỉ còn tiêu đề (không mã, không tên khách, không trích đoạn).
- `da-doc-binh-luan` chỉ đánh dấu dòng của chính mình; ID người khác → không đổi gì; trả số đếm mới.
- Đọc / đánh dấu thông báo của người khác → 404/403 (ca có sẵn, chạy lại).
- W: dòng bình luận có lớp `tb-viec`; bình luận vào khung nhìn → gọi đánh dấu; tab khác nhận tin qua
  `BroadcastChannel` giả; chuông hỏi 30 giây.

**Tệp (H + W)**
- JPG/PNG/WebP/PDF/DOCX/XLSX → được; `.exe` đổi đuôi `.png` → `FILE_TYPE_NOT_ALLOWED`; 10MB → được,
  10MB+1 → `FILE_TOO_LARGE`; 6 tệp → `QUA_NHIEU_TEP`; tệp rỗng → `FILE_EMPTY`.
- Gắn tệp của người khác / của hồ sơ khác / mục đích khác / đã gắn bình luận khác → `TEP_KHONG_HOP_LE`.
- Người ngoài phạm vi tải bằng ID tệp → 403; Kế toán trước `da_qua_tbp` → 403.
- Xoá bình luận → lượt dọn xoá object MinIO + dòng; gỡ tệp khi sửa → cũng dọn; tệp không gắn 23 giờ →
  còn, 25 giờ → dọn (đồng hồ giả); tệp của bình luận còn sống → KHÔNG đụng.
- Lượt dọn lỗi giữa chừng (MinIO chết) → `ops.lan_chay` ghi `LOI`, lượt sau làm tiếp, không xoá dòng khi
  object chưa xoá được.
- W: tiến trình, *Thử lại* / *Gỡ*, nút Gửi xám khi đang tải; ảnh mở `XemTep`.

**Tự cập nhật & ô soạn (W, đồng hồ giả)**
- Hỏi mỗi 15s; tab ẩn → không lượt nào; quay lại → hỏi ngay; sau khi tự gửi → hỏi ngay.
- Bình luận mới khi ở cuối → hiện tại chỗ; khi đang cuộn lên → chỉ báo *N bình luận mới*, không cuộn.
- Bình luận của chính mình không hiện hai lần.
- Đang gõ dở khi có cập nhật → giá trị, tiêu điểm, vị trí con trỏ giữ nguyên.
- Lượt hỏi lỗi mạng → không dải lỗi; lượt sau lấy bù; 403 → *Bạn không còn quyền xem hồ sơ này*, ngừng hỏi.
- Gửi lỗi mạng / 500 → chữ + tệp còn trong ô, câu lỗi dưới ô, *Thử lại* dùng lại `maGui` cũ.
- Bấm gửi hai lần nhanh → một lượt gọi.
- Bình luận đang trả lời bị xoá → câu báo; gửi → `BINH_LUAN_GOC_DA_XOA` hiện câu đúng.
- Đang sửa thì chính bình luận bị xoá ở tab khác → `BINH_LUAN_DA_XOA` hiện câu đúng.
- `beforeunload` chỉ gắn khi ô có chữ/tệp; điều hướng trong ứng dụng khi có chữ → hỏi lại.
- Tải lại trang → ô trống (không gì trong `localStorage`/`sessionStorage`).
- Enter gửi, Shift+Enter xuống dòng; khổ cảm ứng Enter xuống dòng.
- Liên kết `#binh-luan-x` tới bình luận ngoài trang đầu → tải tới, cuộn, tô nổi; bình luận đã xoá → cuộn tới dòng đã xoá.
- Trạng thái khối: rỗng / khung xương / không tải được + *Thử lại* / mất quyền.
- Bàn phím đi được mọi thao tác; nút biểu tượng có `aria-label`; `aria-live` báo gửi xong / lỗi.

**Quét mã nguồn & chốt chung (Q)**
- `loi.test.tsx`: mọi mã mới có câu.
- `nuot-loi.test.tsx`: hook hỏi bình luận trong `NUOT_CO_LY_DO`.
- `bundle.test.ts`: không thêm phụ thuộc, dưới 250KB.
- Không `dangerouslySetInnerHTML` / `innerHTML` trong `components/BinhLuan/`.
- Giới hạn chỉ khai ở `domain-policy` (giao diện và máy chủ cùng đọc) — ca đối chiếu.
- `internal.controller` không chứa `binh_luan`.
- Bẫy `*/` trong chú thích CSS (ca P293 có sẵn).
- Bộ nạp demo đối chiếu cột.

Mỗi chặng **phá lại** từng chốt chính (bỏ `assertPolicyInScope`, bỏ lọc `da_qua_tbp`, bỏ khử trùng
người nhận, gửi thư, bỏ `UNIQUE ma_gui`, bỏ kiểm tệp của người khác, bỏ dọn tệp, bỏ khử trùng ở giao
diện…) và ghi ca nào đỏ, ca nào xanh và vì sao.

## Kiểm tra cuối

- `cd impl && make demo-down && make test` (đầy đủ, migrate + seed) — đọc **tổng số ca**, không chỉ chữ xanh.
- Demo bật: chỉ `tests/web` + kiểm thuần bằng ảnh rời `csbh-test` `--network none` (không gõ lệnh nào
  dùng `compose.test.yml`).
- `make demo && make demo-mau`, đăng nhập hai tài khoản ở hai trình duyệt (tdv01 + tbp01) trao đổi thật,
  đo độ trễ ≤ 30s, chuông, tệp, xoá + lượt dọn trên *Vận hành → Lịch tự động*.
- QA hình ảnh ba khổ, sáng/tối, so với mockup đã duyệt.
