# Nhật ký triển khai — Phần mềm CSBH

Ghi lại quá trình viết mã: đã làm gì, quyết định gì, **lệch so với bản thiết kế ở đâu và vì sao**,
vướng gì và gỡ ra sao, test chạy được bao nhiêu.

Không phải danh sách công việc. Thứ đáng ghi ở đây là những điều mà sáu tháng sau đọc lại mã nguồn
sẽ không tự suy ra được.

| | |
|---|---|
| **Kho mã sản phẩm** | `impl/` |
| **Thư mục chạy thử** | `workspace/` — log, báo cáo, dump; nằm trong `.gitignore`, không bao giờ commit |
| **Thiết kế** | `agents/KIEN-TRUC-CSBH.md` · nghiệp vụ: `agents/YEU-CAU-NGHIEP-VU-CSBH.md` v4.1 |
| **Nhánh** | `v1.0` — commit sau mỗi chặng test xanh, **không push** |
| **Quy tắc môi trường** | Mọi thứ chạy trong Docker. Không lệnh nào chạy Node native trên máy |
| **Bàn giao** | Sau P7 phải có ba tài liệu: chạy test toàn hệ · dựng demo local · user guide (chặng P8) |

---

## Chặng đã lên kế hoạch

| Chặng | Nội dung | Trạng thái |
|---|---|---|
| **P1** | Monorepo `impl/`, hạ tầng Docker, migration 9 schema + 9 DB role, bốn bất biến ở tầng CSDL, `VERSION`, khung test | **xong** — 27/27 xanh |
| **P2** | `domain-policy` thuần: công thức chiết khấu, làm tròn, máy trạng thái | **xong** — 71/71 xanh |
| **P3a** | `identity` phần dữ liệu: 6 vai trò, cây phân quyền đệ quy, seed 10 tài khoản | **xong** — 89/89 xanh |
| **P3b** | `identity` phần HTTP: JWT RS256, đăng nhập, xoay vòng refresh token, khoá tài khoản, **vòng đời tài khoản** | **xong** — 125/125 xanh |
| **P4** | `catalog` + `customer` | **xong** — 188/188 xanh, hoãn 2 case chờ `document` |
| **P5** | `policy`: hồ sơ, đóng băng giá, phiên bản, hiệu lực | **xong** — 256/256 xanh |
| **P5.5** | Yêu cầu phi chức năng: sao lưu, phân trang, chống phình CSDL | **xong** — nhóm test `OPS` mới |
| **P5.6** | Vòng hai phi chức năng: PITR thật, múi giờ, bí mật, tắt máy êm | **xong** — 285/285 xanh |
| **P6a** | `notification` + đường truyền outbox → RabbitMQ | **xong** — 305/305 xanh |
| **P6b** | `document`: file, ký số nội bộ, bản CSBH A4 | **xong** — 322/322 xanh |
| **P6c** | `document`: mẫu hợp đồng và xuất hợp đồng | **xong** — 348/348 xanh |
| **P6d** | `sla-worker` | **xong** — 363/363 xanh |
| **P7a** | `audit` + `trace_id` xuyên suốt | **xong** — 373/373 xanh |
| **P7b** | `reporting`: bộ lọc, báo cáo, xuất Excel | **xong** — 414/414 xanh |
| **P7c** | `gateway` + Caddy: giới hạn tần suất, header an toàn, CORS | **xong** — 446/446 xanh |
| **P7d** | `web`: giao diện React | **xong** — 493/493 xanh |
| **P8** | Ảnh chạy thật, chồng demo một lệnh, ba tài liệu bàn giao | **xong** — 497/497 xanh |

---

## 07/08/2026 — Chuẩn bị môi trường

### Docker bị chặn quyền, và cách gỡ

Kiểm tra đầu tiên đã chạm ngay điều kiện chặn: mọi lệnh `docker` đều trả
`permission denied ... /var/run/docker.sock`.

Nguyên nhân không phải thiếu cấu hình mà là **credential của phiên shell đã cũ**:

- `/etc/group` có `docker:x:984:hieuhv` — người dùng *đã* thuộc nhóm.
- Nhưng `id -nG` trong shell của tôi không liệt kê `docker`, vì thay đổi nhóm chỉ có hiệu lực với
  phiên đăng nhập mới, còn shell của tôi kế thừa từ phiên mở trước đó.
- `sudo` đòi mật khẩu nên không dùng được trong phiên không tương tác.

**Cách gỡ đang dùng:** bọc mọi lệnh docker trong `sg docker -c '…'`. `sg` xin lại quyền nhóm ngay
trong tiến trình hiện tại, và vì `/etc/group` đã liệt kê đúng nên nhân cho phép. Không phải nới lỏng
ràng buộc "chỉ chạy bằng Docker" nào.

> Nếu về sau thấy lệnh docker lại `permission denied`, kiểm tra `getent group docker` trước khi nghi
> ngờ daemon. Mở một terminal mới là hết, nhưng trong phiên tự động thì `sg` là đường duy nhất.

**Máy chạy:** Docker 29.2.1, Compose v5.0.2, 16 nhân, 64 GB RAM, còn 145 GB đĩa. Mạng tới được
registry của Docker Hub và npm.

---

## P1 — Nền móng và hạ tầng kiểm thử

### Đã dựng

```
impl/
├─ VERSION                     1.0.0 — nguồn duy nhất của số phiên bản
├─ package.json                pnpm workspace, Node 22, vitest
├─ tsconfig.base.json          strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
├─ vitest.config.ts            fileParallelism: false (xem lý do bên dưới)
├─ Makefile                    mọi mục tiêu đều gọi qua docker compose
├─ db/migrations/
│  ├─ 0001_init.sql            9 schema, enum trạng thái, pol.policy, pol.policy_line,
│  │                           aud.audit_log, sys.app_release + 4 bất biến
│  └─ 0002_roles.sql           9 login role, thu hồi quyền PUBLIC
├─ scripts/migrate.sh          runner: áp dụng theo thứ tự tên, kiểm checksum
├─ docker/Dockerfile.dev       node:22.9-alpine + pnpm + psql client
├─ deploy/compose.yml          postgres · redis · rabbitmq · minio · mailpit · migrate
└─ deploy/compose.test.yml     trình chạy test, mount mã nguồn và workspace
```

### Quyết định và chỗ lệch so với bản thiết kế

**1. Migration bằng SQL thuần, không dùng Prisma Migrate.** *(lệch so với §05 của thiết kế)*

Bốn bất biến quan trọng nhất đều là DDL mà không ORM nào diễn đạt được: partial unique index, trigger
chặn xoá, trigger chặn sửa nhật ký, và phân quyền theo schema. Nếu dùng Prisma Migrate thì vẫn phải
viết tay đúng những dòng SQL đó rồi nhét vào file migration do Prisma sinh, cộng thêm việc bật cờ
`multiSchema` còn ở diện xem trước. Đổi lại chẳng được gì.

Hướng đi: **SQL là nguồn sự thật của lược đồ**; khi service cần client thì dùng `prisma db pull` để
sinh model từ CSDL có sẵn. Runner tự viết chỉ 40 dòng, có kiểm checksum nên sửa một migration đã áp
dụng sẽ báo lỗi thay vì âm thầm bỏ qua.

**2. Chặn xoá hồ sơ Từ chối bằng trigger, không bằng RULE.** *(lệch so với §06 của thiết kế)*

Thiết kế ghi `CREATE RULE ... DO INSTEAD NOTHING`. Nhưng rule **nuốt lặng** lệnh xoá: `DELETE` trả về
0 dòng và ứng dụng tưởng đã xoá thành công. Dùng trigger `RAISE EXCEPTION` thì lỗi nổ ra ngay và test
khẳng định được đúng mã lỗi. Đây là cải tiến so với thiết kế, cần cập nhật lại tài liệu.

**3. Danh sách trạng thái là kiểu enum của Postgres, không phải cột text.**

YCNV §4 nói đây là danh sách đóng. Để enum thì CSDL từ chối giá trị lạ ngay, không phụ thuộc vào việc
tầng ứng dụng có nhớ kiểm hay không. Giá phải trả là thêm một trạng thái sau này cần migration —
chấp nhận được, vì thêm trạng thái vốn dĩ là thay đổi lớn.

**4. `node_modules` nằm trong volume Docker, không nằm trên máy.**

Mã nguồn bind-mount vào container, nhưng `node_modules` là một volume có tên đè lên. Nhờ vậy máy thật
không có thư mục phụ thuộc nào, và không có cách nào lỡ tay chạy `pnpm test` native.

**5. `fileParallelism: false` trong vitest.**

Test ràng buộc CSDL dùng chung một Postgres thật. Chạy song song thì hai file test cùng chèn vào
`pol.policy` rồi đổ lỗi cho nhau bằng những lỗi rất khó đọc. Tuần tự chậm hơn nhưng thông tin lỗi
trung thực.

**6. Báo cáo test ghi thẳng vào `workspace/`.**

`vitest.config.ts` trỏ junit ra `/workspace/reports/junit.xml`, và `workspace/` được mount vào
container. Không có file sinh ra nào rơi vào cây mã nguồn.

### Vướng mắc đã gỡ

**Cờ `--reporter` trên dòng lệnh đè toàn bộ `reporters` trong config.** Script `test` ban đầu là
`vitest run --reporter=verbose`, nên danh sách `['verbose','junit']` trong config bị bỏ qua và không
có file junit nào được ghi — mà vitest không hề báo lỗi. Bỏ cờ đó khỏi script, để config quyết định.

**`exactOptionalPropertyTypes` bắt lỗi ngay ở hàm helper đầu tiên.** Kiểu trả về
`{ code?: string }` không nhận được `{ code: string | undefined }`. Đây đúng là điều mong muốn của
cờ này, nên sửa kiểu chứ không tắt cờ.

### Kết quả test

**27/27 xanh**, chạy trong container, mất 1,2 giây.

| Nhóm | Số case | Nội dung |
|---|---|---|
| `EFF-02` | 2 | Partial unique index chặn CSBH hiệu lực thứ hai; nhiều bản hết hiệu lực thì vẫn cho |
| `POL-02` | 1 | Không trùng sản phẩm trong một hồ sơ |
| `POL-14` | 2 | Xoá hồ sơ Từ chối bị chặn kèm lỗi rõ ràng; trạng thái khác vẫn xoá được |
| `AUD-03/04` | 4 | INSERT được; UPDATE, DELETE, TRUNCATE đều bị chặn kể cả bằng tài khoản quản trị |
| `CALC` | 2 | Cột sinh tính đúng CPBH tổng, giá thu về, cờ vượt ngưỡng; giá bán Công ty = 0 bị chặn |
| `WF-02` | 2 | Trạng thái lạ bị từ chối; đúng 11 giá trị |
| `MIG-01/02` | 2 | Chấp nhận bản ghi legacy thiếu mốc thời gian; có sẵn cột `source`, `import_batch_id` |
| `AD-02` | 5 | 9 schema, 9 role; không đọc chéo được schema của service khác |
| `AUD-03` (role) | 3 | `csbh_aud` chỉ có INSERT và SELECT, bị chặn ở tầng quyền trước cả trigger |
| `SEC-11` | 1 | PUBLIC không còn quyền mặc định |
| `VER-01/04` | 3 | `VERSION` đúng semver; không `package.json` nào giữ số phiên bản; `APP_VERSION` tới được tiến trình |

Đáng chú ý: nhật ký bị chặn ở **hai lớp độc lập** — tầng quyền (`csbh_aud` không có `UPDATE`) và
tầng trigger (chặn cả chủ sở hữu bảng). Test khẳng định cả hai, vì mỗi lớp bảo vệ trước một kiểu tấn
công khác nhau.

### Đã kiểm chứng về môi trường

- `impl/node_modules` trên máy thật là **thư mục rỗng** — phụ thuộc nằm trong volume Docker, nên
  không có cách nào lỡ tay chạy test native.
- `workspace/` bị `git status` bỏ qua đúng như yêu cầu.

### Commit

`P1: nen mong impl/ — 9 schema, 9 DB role, 4 bat bien o tang CSDL`


---

## P2 — `domain-policy`: công thức và máy trạng thái

Toàn bộ chặng này là **logic thuần**: không chạm CSDL, không chạm mạng, không đọc giờ hệ thống.
Nhờ vậy 44 test chạy xong trong chưa tới một giây và không cần hạ tầng nào — đúng chỗ đáng đặt phần
rủi ro nghiệp vụ cao nhất.

### Quyết định đáng kể nhất: tỷ lệ chiết khấu KHÔNG dùng số thực

YCNV §7 đòi con số hiển thị, con số in ra và con số dùng so ngưỡng phải là **một**. Số thực nhị phân
không biểu diễn chính xác được 12,35 — sớm muộn sẽ có màn hình hiện 12,35% mà phép so lại thấy
12,349999.

Cách làm: giữ tỷ lệ dưới dạng **số nguyên đã nhân 100** (kiểu `Rate2`). 12,35% lưu là `1235`. Phép so
ngưỡng trở thành phép so số nguyên, không bao giờ lệch.

Phép làm tròn xảy ra **đúng một lần**, ngay trong `computeLine`:

```ts
const scaled = divRoundHalfUp((companyPrice - netPrice) * 10_000n, companyPrice);
```

Nhân 10.000 trước rồi mới chia, nên không có bước trung gian nào mất chữ số. `divRoundHalfUp` làm
việc trên `bigint` và làm tròn nửa đi xa khỏi 0 — 12,345 thành 12,35 như tài liệu yêu cầu.

Tiền cũng là `bigint` chứ không phải `number`: YCNV §7 nói tiền luôn là số nguyên đồng, và `bigint`
biến điều đó thành ràng buộc kiểu chứ không phải quy ước.

### Máy trạng thái nằm gọn trong một bảng

13 luật chuyển bước khai báo trong một mảng `RULES`, không rải `if/else` khắp controller. Mỗi luật
mang theo bốn thông tin: ai được làm, cột mốc thời gian nào phải ghi, có bắt buộc nhập lý do không,
có tạo phiên bản mới không.

Nhờ khai báo tập trung, ba tính chất được kiểm bằng cách **duyệt toàn bộ bảng** thay vì viết tay từng
trường hợp:

- Ban lãnh đạo không có bất kỳ hành động ghi nào — test quét mọi cặp (trạng thái × hành động).
- Từ chối là trạng thái kết thúc — test quét cả 13 hành động, không hành động nào đi ra được.
- Luồng tuần tự — không cặp (trạng thái, hành động) nào dẫn tới hai đích khác nhau.

### Chỗ dễ cài sai đã được test khoá lại

**Yêu cầu in lại là ngoại lệ duy nhất không tạo phiên bản mới.** Ba nhánh trả lại khác đều đặt
`createsNewVersion: true` và bắt buộc lý do; riêng `KT_REQUEST_REPRINT` quay về Sale Admin với
`createsNewVersion: false` — hồ sơ không phải ký số lại. Nếu ai đó gộp nhánh này chung với ba nhánh
kia cho "gọn", test `WF-18/19` sẽ đỏ ngay.

**Quá hạn duyệt là lớp phủ, không phải một bước.** `markOverdue` trả về kèm `pendingStep`, và
`resumeFromOverdue` đưa hồ sơ về đúng nhánh cũ. Chỉ bốn trạng thái chờ mới quá hạn được.

### Kết quả test

**71/71 xanh** (27 của P1 + 44 mới), chạy trong container, 1,7 giây.

| Nhóm | Số case |
|---|---|
| `CALC-01/03/05` công thức và bộ số chuẩn của tài liệu | 4 |
| `CALC-06/07/08` làm tròn rồi mới so ngưỡng, gồm cả trường hợp bằng đúng ngưỡng | 4 |
| `CALC-09` quét 500 bộ số, khẳng định số hiển thị luôn bằng số đem so | 1 |
| `CALC-10/11/12/19` giá không hợp lệ, giá thu về âm, tiền nguyên, ổn định qua 1000 lần chạy | 8 |
| `WF-01…WF-27` đường đi chính, ba nhánh trả lại, từ chối, in lại, chuyển bước sai | 22 |
| `AUTH-13/14` Ban lãnh đạo và Quản trị không có hành động ghi | 3 |
| `NTF-10/11` quá hạn và quay lại đúng nhánh | 2 |

### Commit

`P2: domain-policy — cong thuc chiet khau va may trang thai`


---

## P3a — `identity`: cây phân quyền và tài khoản mẫu

### Phạm vi dữ liệu là một hàm trong CSDL, không phải logic rải rác

`idn.scope_user_ids(user_id)` trả về tập người dùng mà một người được xem hồ sơ. Đây là **một nơi
định nghĩa duy nhất** cho câu hỏi "ai thấy được gì"; mọi service gọi hàm này chứ không tự suy diễn.

Cây tổ chức có **hai cấu trúc độc lập**, đúng như YCNV §2.1 mô tả và đây là chỗ dễ cài sai nhất:

- `idn.user_node` — chuỗi Sale Admin → kế toán → TDV, truy vấn bằng CTE đệ quy.
- `idn.department_approver` — nhánh duyệt của Trưởng bộ phận, **không liên quan gì** tới chuỗi trên.

Test `AUTH-12` khoá đúng tính độc lập đó: `tbp01` thấy `tdv01` mà không hề thấy `kt01`, dù `tdv01`
nằm dưới `kt01` trong nhánh kế toán.

Vai trò Trưởng bộ phận gán **theo bộ phận**, nên đổi người giữ chức chỉ là đổi một dòng trong
`department_approver` — không đụng tới hồ sơ nào. Người duyệt thay chỉ là thêm một dòng nữa.

### Chặn vòng lặp trong cây tổ chức phải dùng trigger

Không ràng buộc khai báo nào của Postgres diễn đạt được "đồ thị không chu trình". Thiếu nó thì một
lần gán cấp trên sai sẽ làm CTE đệ quy chạy vô tận và treo mọi truy vấn phạm vi. Trigger
`idn.forbid_cycle` đi ngược lên cây trước khi cho ghi, kèm chặn độ sâu 50 để bản thân phép kiểm cũng
không treo.

### Vướng mắc đã gỡ: test làm bẩn dữ liệu dùng chung

Hai test kiểm việc chuyển TDV sang kế toán khác và đổi người giữ chức TBP đều **sửa dữ liệu mẫu rồi
sửa trả lại ở cuối**. Lần chạy đầu, một assertion sai ném lỗi giữa chừng nên dòng hoàn tác không bao
giờ chạy — dữ liệu mẫu bị hỏng, và **lần chạy sau đỏ ở ba test hoàn toàn khác**. Đây là kiểu lỗi tốn
nhiều thời gian nhất để tìm, vì chỗ đỏ nằm xa chỗ gây ra.

Cách chữa tận gốc: thêm `inRollback(db, fn)` bọc mọi test có sửa dữ liệu trong một transaction rồi
`ROLLBACK` trong khối `finally`. Hoàn tác xảy ra kể cả khi assertion ném lỗi. Kiểm chứng bằng cách
chạy `make test` **hai lần liên tiếp** và đối chiếu kết quả — đây thành quy tắc cho mọi test sau.

Bản thân assertion sai cũng là một bài học: tôi kỳ vọng phạm vi của `tbp02` sau khi nhận BP01 sẽ
*bằng* phạm vi cũ của `tbp01`, nhưng `tbp02` vốn đã phụ trách BP02 nên phải là hợp của hai bộ phận.

### Chốt an toàn cho script seed

`scripts/seed.ts` tự thoát nếu `NODE_ENV=production` (test `SEC-14`). Mật khẩu băm bằng scrypt của
Node, so sánh theo thời gian hằng định.

### Kết quả test

**89/89 xanh** (71 trước đó + 18 mới), chạy hai lần liên tiếp cùng kết quả.

| Nhóm | Số case | Nội dung |
|---|---|---|
| `AUTH-08` | 2 | Đúng 6 vai trò; 10 tài khoản mẫu phủ đủ |
| `AUTH-09/10/11/19` | 5 | TDV chỉ thấy mình; kế toán thấy đúng nhánh; Sale Admin thấy cây sâu 3 cấp |
| `AUTH-12` | 3 | Nhánh TBP độc lập hoàn toàn với nhánh kế toán |
| `AUTH-13/14` | 2 | Ban lãnh đạo thấy toàn bộ; Quản trị không có phạm vi hồ sơ |
| `AUTH-15` | 1 | Chuyển TDV sang kế toán khác, phạm vi đổi theo |
| `AUTH-17` | 3 | Chặn vòng lặp và tự làm cấp trên của chính mình |
| `AUTH-18/20` | 2 | Người duyệt thay; đổi người giữ chức không đụng hồ sơ |

### Commit

`P3a: identity — cay phan quyen va 10 tai khoan mau`

---

## P3b — `identity`: tầng HTTP và vòng đời tài khoản

### Yêu cầu nghiệp vụ phát sinh trong chặng này

Người dùng bổ sung: *tài khoản do quản trị tạo bằng email, quản trị tự đặt mật khẩu mặc định, hệ
thống gửi mail yêu cầu xác nhận và đổi mật khẩu.* Rà lại thì **yêu cầu này chưa có ở đâu cả** — YCNV
chỉ nói Quản trị hệ thống "quản lý tài khoản" mà không mô tả tài khoản ra đời bằng cách nào, và
trong 308 test case không có case nào chạm tới. Đã bổ sung trước khi viết mã:

- YCNV lên **v4.2**: thêm mục 2.8, thêm mục 9 vào Phụ lục A, thêm nhóm *Tài khoản* vào Phụ lục B
  (quyết định thứ 42).
- Artifact kiến trúc: thêm mục *Vòng đời tài khoản* trong §9, thêm **nhóm test `ONB` gồm 15 case**.
  Tổng test case trong tài liệu: 308 → **323**.

### Chỗ yêu cầu chưa nói rõ, và cách đã chọn

Mật khẩu mặc định *dùng được để đăng nhập* hay chỉ là chỗ giữ chỗ cho tới khi mở email? Hai cách đọc
đều hợp lý, nên đã làm **cả hai đường và tách hai cột**:

| Cột | Trả lời câu hỏi |
|---|---|
| `activated_at` | Đã tự đặt mật khẩu chưa — đường nào cũng tính |
| `email_verified_at` | Đã **chứng minh hộp thư có thật** chưa — chỉ liên kết trong email mới tính |

Gộp một cột thì mất khả năng phát hiện quản trị gõ nhầm địa chỉ email: tài khoản vẫn chạy, thư mời
thì bay vào hư không, và không ai biết. Tách ra thì danh sách quản trị chỉ thẳng ra được (ONB-14).

Đăng nhập bằng mật khẩu mặc định vào được nhưng token mang cờ `pwd_reset`: chỉ `GET /auth/me` và
`POST /auth/change-password` chạy, mọi route khác trả 403 `PASSWORD_CHANGE_REQUIRED` (ONB-05, ONB-06).

### Quyết định kỹ thuật

**JWT tự viết trên `node:crypto`** thay vì kéo thư viện. 60 dòng, đổi lại là đóng dứt điểm được lỗ
hổng *alg confusion*: `verifyJwt` xác minh chữ ký **trước** khi đọc payload, và thuật toán đọc từ
hằng số trong mã chứ không đọc từ header — thư viện nào chọn khóa theo `header.alg` đều dính
`alg:none` hoặc trò đổi RS256 sang HS256 rồi ký bằng chính public key.

**RS256 chứ không HS256.** Chín service kia chỉ cần *xác minh* nên chỉ nhận public key; đọc được mã
nguồn hay ảnh Docker của chúng cũng không phát hành được token. Với HS256 thì mọi service đều tự cấp
token cho mình được.

**Audience tách đôi** (`csbh-app` cho người dùng, `csbh-internal` cho service). Không tách thì access
token của một TDV gọi thẳng được `/internal/*` (AUTH-21).

**Guard đăng ký ở phạm vi toàn cục** — mặc định chặn, mở ra phải khai báo `@Public()` ngay tại route.
Chiều ngược lại (mặc định mở, nhớ thì mới chặn) là cách quên một route rồi hở cả hệ thống.

### Đi chệch bản thiết kế

| Bản thiết kế | Đã làm | Lý do |
|---|---|---|
| Băm mật khẩu **Argon2id** | **scrypt** của `node:crypto` | Argon2 trên Node cần module biên dịch gốc, kéo toolchain C vào ảnh Docker của cả 10 service. scrypt nằm sẵn trong thư viện chuẩn, được RFC 7914 chuẩn hoá và OWASP chấp nhận. Bản băm lưu kèm tiền tố thuật toán nên sau này đổi sang Argon2id không phải reset mật khẩu ai. **Đã sửa lại tài liệu kiến trúc cho khớp**, không để tài liệu nói một đằng mã chạy một nẻo |
| `class-validator` cho DTO | Hàm kiểm tự viết trong `infra/validate.ts` | `class-validator` đọc metadata của decorator, tức là buộc mọi service giữ đồng bộ trình biên dịch của runtime với của test. Ở kích thước dữ liệu vào của identity thì cái giá đó không đáng |

### Ba lỗi đã sửa

**1. esbuild không sinh được `emitDecoratorMetadata`.** Tiêm phụ thuộc của NestJS đọc đúng metadata
đó để biết constructor cần gì; thiếu là mọi provider vào `undefined`. Vite dùng esbuild mặc định nên
phải cắm `unplugin-swc` vào `vitest.config.ts`.

**2. `node_modules` bị ghi ra máy thật.** pnpm sinh một `node_modules` cho **mỗi** package, mà volume
cũ chỉ che `/app/node_modules`. Kết quả: `services/identity/node_modules` nằm trên máy người dùng, do
`root` sở hữu — đúng thứ mà yêu cầu "mọi thứ chạy trong Docker" muốn tránh. Đã thêm một named volume
cho mỗi package trong `compose.test.yml`; **mỗi package mới phải thêm một dòng**.

**3. Thu hồi họ token bị `ROLLBACK` nuốt mất — lỗi nghiêm trọng nhất chặng này.** Nhánh phát hiện
dùng lại refresh token vừa phải *ghi* (thu hồi cả họ) vừa phải *báo lỗi*. Ném exception từ bên trong
`db.tx` kích hoạt ROLLBACK, nên việc thu hồi bị hoàn tác **trong im lặng**: người gọi vẫn nhận 401
nên nhìn từ ngoài tưởng đã chặn, thực tế toàn bộ token của họ đó vẫn sống. Sửa bằng cách cho kết quả
đi *ra* khỏi transaction dưới dạng union rồi mới ném lỗi. Test `AUTH-04` bắt được vì nó kiểm thêm
một bước: token *vừa xoay vòng ra* có chết theo không.

### Một test lúc xanh lúc đỏ, và nó đúng

`ONB-13` xanh lần đầu, đỏ lần chạy thứ hai. Không phải test hỏng: mốc `password_changed_at` đưa vào
access token đang tính bằng **giây**. Đăng nhập rồi đổi mật khẩu trong cùng một giây cho hai giá trị
bằng nhau, phép so `<` không thành, token của phiên cũ sống sót. Đổi sang mili giây. Bài học giữ lại
từ P3a vẫn đúng: **chạy `make test` ít nhất hai lần liên tiếp mới được coi là xanh** — lần này đã
chạy bốn lần.

### Kết quả

| Nhóm | Số test | Nội dung |
|---|---|---|
| `AUTH-01` | 3 | Đăng nhập bằng tên hoặc email; hạn token 15 phút và 8 giờ |
| `AUTH-02` | 2 | Khoá 15 phút sau 5 lần sai; tài khoản không tồn tại trả lời **giống hệt** tài khoản sai mật khẩu |
| `AUTH-03` | 2 | Token hết hạn; refresh đổi được token mới |
| `AUTH-04` | 1 | Dùng lại token đã xoay vòng → thu hồi cả họ |
| `AUTH-05` | 2 | Sửa chữ ký; sửa payload giữ nguyên chữ ký cũ |
| `AUTH-06` | 1 | Đăng xuất thu hồi cả họ |
| `AUTH-07` | 2 | Vô hiệu hoá qua API chặn ngay; đi vòng ngoài API thì cửa sổ trễ ≤ 60 giây |
| `AUTH-14` | 2 | Chỉ `QUAN_TRI` vào được nhóm route quản trị |
| `AUTH-21` | 3 | Thiếu token dịch vụ; token người dùng không thay thế được; đúng audience thì trả đúng phạm vi |
| `ONB-01…15` | 18 | Toàn bộ vòng đời tài khoản, gồm cả ràng buộc CSDL từ chối lưu token thô |

**125/125 xanh**, chạy bốn lần liên tiếp cùng kết quả. Kiểm `AUTH-07` không ngồi chờ 60 giây mà đọc
thẳng TTL còn lại của khoá Redis — kiểm đúng thứ cần kiểm, và test chạy trong một phần giây.

### Commit

`P3b: identity HTTP — JWT RS256, vong doi tai khoan, 15 test ONB moi`

---

## P4 — `catalog` và `customer`

### Tách `@csbh/http-kit` trước khi viết service thứ hai

Guard, JWT, kiểm dữ liệu vào, nạp khoá, `DbPool` — nếu để nguyên trong `identity` thì ba service
thành ba bản chép, và chúng lệch nhau lúc nào không ai biết. Đã chuyển sang một package dùng chung
ngay đầu chặng, chạy lại toàn bộ test cũ để chắc refactor không làm vỡ gì (125/125 giữ nguyên).

**`AccountSource` có hai bản cài đặt.** `identity` đọc thẳng CSDL vì nó sở hữu lược đồ `idn`; chín
service kia không có quyền trên schema đó nên phải hỏi `identity` qua API nội bộ. Cả hai ghi vào
**cùng một khoá Redis**, nên cam kết *"vô hiệu hoá tài khoản có hiệu lực chậm nhất sau 60 giây"*
đúng trên toàn hệ chứ không riêng `identity`. Nếu mỗi service tự cache theo cách riêng thì `identity`
xoá cache của nó cũng vô nghĩa với các service khác.

Khi `identity` không trả lời được, `RemoteAccountSource` **từ chối** chứ không cho qua — cho qua là
biến sự cố của một service thành lỗ hổng xác thực của cả hệ.

### `catalog`

Điểm cụ thể (`specificity`) là **cột sinh sẵn trong CSDL**, trọng số 4/2/1 cho nhóm SP / loại KH /
kênh. Hai dòng chiết khấu cùng khớp một tình huống là chuyện bình thường chứ không phải lỗi cấu
hình, nên phải chọn được dòng cụ thể hơn một cách **tất định** — nếu không thì cùng một hồ sơ lúc
vượt ngưỡng lúc không, tuỳ thứ tự Postgres trả về. Thứ tự sắp xếp có ba tầng để không bao giờ hoà:
điểm cụ thể → ngày hiệu lực → id.

**Nhật ký giá trị trước/sau đi qua outbox, không INSERT chéo schema.** Role `csbh_cat` không có
quyền ghi vào `aud`, nên ranh giới AD-02 ép ra đúng kiến trúc: một transaction, một nguồn sự thật.
`CAT-13` (nhật ký) và `CAT-18` (rà soát khi đổi giá) dùng chung đường này.

Nhập Excel tách đôi: `excel.ts` chỉ **phân tích**, không chạm CSDL; toàn bộ lô ghi trong một
transaction. Dòng hợp lệ đứng trước dòng lỗi cũng không được ghi, và thông báo kèm **số dòng trong
file** — người dùng sửa file Excel chứ không đọc mã nguồn.

### `customer`

`customer` gọi `catalog` để kiểm mã danh mục và gọi `identity` để giải phạm vi dữ liệu. Test dựng
**cả ba service chạy thật**, `identity` và `catalog` nghe trên cổng ngẫu nhiên — không có bản giả
nào, nên đường token dịch vụ giữa các service được chạy qua trong mọi test.

Mã khách hàng là **khoá định danh, chặn sửa bằng trigger** chứ không chỉ bằng việc không lộ trường
đó ra API: sửa được nó là mọi hồ sơ CSBH cũ trỏ sang một khách hàng khác trong im lặng, và đó là loại
lỗi không sửa lại được sau khi đã xảy ra.

Trùng CCCD/MST thì **vẫn lưu, chỉ kèm cảnh báo** — một chủ hộ mở nhiều điểm bán là nghiệp vụ có
thật, chặn cứng là chặn nhầm.

### Đi chệch bản thiết kế: khoá ngoại `pol.policy` → `cus.customer`

Bản thiết kế nói không ràng buộc chéo schema. Ở đây đã đặt khoá ngoại, có chủ ý.

*"Không xoá được khách hàng đã có hồ sơ CSBH"* (`CUST-16`) là ràng buộc toàn vẹn cứng. Cách thuần
microservice — `customer` giữ một cờ do sự kiện `policy.*` cập nhật — chỉ **nhất quán cuối cùng**:
hồ sơ lập trước lệnh xoá vài mili giây vẫn lọt. Khoá ngoại thì không bao giờ lọt.

Cái giá: hai schema buộc phải ở chung một instance Postgres. Bản thiết kế đã chốt đúng mô hình đó
(một Postgres, nhiều schema) nên cái giá bằng không ở hiện tại; muốn tách CSDL sau này thì phải gỡ
ràng buộc này trước. Về quyền thì không mất gì: Postgres kiểm khoá ngoại bằng quyền của chủ bảng,
nên `csbh_pol` **không** cần quyền đọc `cus.customer` — ranh giới AD-02 nguyên vẹn.

### Lỗi nghiêm trọng nhất chặng này — test tự tạo rác không xoá nổi

Thêm khoá ngoại làm migration `0006` **thất bại**: `pol.policy` đang có **135 dòng** với
`customer_id` bịa ra. Truy ngược thì `constraints.test.ts` từ P1 chèn dữ liệu mà **không bọc
transaction**, mỗi lần chạy lại bồi thêm. Tệ hơn: trong đó có hồ sơ `TU_CHOI`, mà chính trigger do
bộ test ấy chứng minh lại **cấm xoá hồ sơ Từ chối**. Rác test biến thành rác vĩnh viễn.

Ba việc đã làm:

1. Bọc **mọi** test có ghi trong `inRollback`, gồm cả các test `aud` và `pol`.
2. Thêm `expectSqlErrorInTx` dùng `SAVEPOINT`: Postgres đưa cả transaction vào trạng thái abort ngay
   khi một câu lệnh lỗi, nên `expectSqlError` cũ làm mọi câu lệnh sau đó hỏng theo với mã `25P02`.
   Có savepoint thì test còn kiểm được hiện trạng sau đó — ví dụ *"hồ sơ Từ chối vẫn còn nguyên sau
   khi DELETE bị chặn"*.
3. Dựng lại CSDL từ đầu và **kiểm cả 6 migration chạy sạch trên CSDL trống**.

Khoá ngoại cũng buộc `constraints.test.ts` phải trỏ vào khách hàng **có thật** thay vì UUID bịa —
test trung thực hơn hẳn bản cũ. Sau khi sửa, chạy ba lần liên tiếp thì `pol.policy` còn **0 dòng**.

### Hai test case hoãn sang P6

`CUST-11` và `CUST-12` — tải hồ sơ pháp lý PDF và chặn file sai định dạng, không để lại object rác
trên MinIO. File do service `document` giữ; bảng `cus.customer_document` và endpoint đọc danh sách đã
có sẵn, chỉ thiếu đường tải lên. **Đây là hai case duy nhất trong nhóm CAT và CUST chưa phủ.**

### Kết quả

| Nhóm | Số test | Ghi chú |
|---|---|---|
| `CAT-01…18` | 24 | Đủ 18 mã, có mã tách nhiều test |
| `CUST-01…17` | 26 | Thiếu `CUST-11`, `CUST-12` |
| `AD-02` bổ sung | 2 | `csbh_cat` và `csbh_cus` không đọc chéo được |
| Test cũ sửa lại | 5 | `constraints` và `roles` theo khoá ngoại mới |

**188/188 xanh**, chạy ba lần liên tiếp cùng kết quả. Máy thật vẫn không có một file phụ thuộc nào —
tám thư mục `node_modules` đều là điểm gắn rỗng.

### Commit

`P4a: catalog — danh muc, gia, chiet khau quy dinh, nguoi ky`
`P4b: customer — khach hang, pham vi du lieu, khoa ngoai sang policy`

---

## P5 — `policy`: hồ sơ, luồng duyệt, hiệu lực

Chặng lớn nhất: **60 test case** (POL 19 · WF 28 · EFF 13). Bốn service chạy thật trong test —
`identity`, `catalog`, `customer` nghe trên cổng ngẫu nhiên, `policy` gọi cả ba bằng HTTP kèm token
dịch vụ.

Máy trạng thái viết từ P2 dùng lại **nguyên vẹn**, không sửa một dòng. `WorkflowService` chỉ lo bốn
việc mà logic thuần không làm được: kiểm phạm vi, ghi mốc thời gian, khoá lạc quan, và transaction.
Đây là lần đầu thấy rõ giá trị của việc tách domain thuần ra từ đầu.

### Hai lỗi đáng giá, cả hai đều do tầng CSDL bắt được

**1. Tham số SQL biến mất khi hành động không có mốc thời gian.** Câu lệnh `UPDATE` ghép chuỗi
`${stamp}_by = $4`; ba hành động không có mốc (từ chối, yêu cầu in lại, phát hành liên kết) làm `$4`
biến mất khỏi câu lệnh nhưng vẫn nằm trong mảng tham số, và Postgres trả `could not determine data
type of parameter $4`. Lỗi **chỉ lộ ra ở đúng ba hành động đó** — thử luồng thuận thì không bao giờ
gặp. Sửa bằng cách dựng mảng tham số động và đánh số theo `params.length`.

**2. Thứ tự vô hiệu / kích hoạt.** Bản đầu kích hoạt bản mới trước rồi mới vô hiệu bản cũ. Partial
unique index `uq_policy_active_per_customer` kiểm **ngay sau từng câu lệnh** chứ không hoãn tới
`COMMIT`, nên có một khoảnh khắc hai bản cùng `DANG_CO_HIEU_LUC` và CSDL từ chối. Phải đảo lại: vô
hiệu bản cũ trước, kích hoạt bản mới sau, **vẫn trong một transaction**.

Đây đúng là lý do đặt bất biến ở tầng CSDL từ P1. Nếu chỉ kiểm ở tầng ứng dụng thì thứ tự sai này
lọt qua êm, và lỗi chỉ hiện ra dưới dạng dữ liệu hỏng nhiều tháng sau.

Nhân đó cũng dịch luôn lỗi bất biến sang `409 ALREADY_ACTIVE_POLICY` kèm hướng dẫn, thay vì để rơi
xuống `500` — người dùng cần biết phải lập bản BỔ SUNG hoặc CHỈNH SỬA.

### Quyết định thiết kế

**Hỏi lại thay vì đoán.** Khách đã có CSBH mà lập hồ sơ mới thì trả `409` kèm đúng một trong hai câu
hỏi của YCNV, **đúng từng chữ**. Chỉ khi người dùng gửi lại kèm `mode` thì mới dựng hồ sơ. Tự đoán ý
định là cách chắc chắn tạo ra phiên bản sai.

**Chép trước, đè sau.** Phiên bản mới chép nguyên toàn bộ dòng của bản đang hiệu lực rồi mới áp các
dòng người dùng gửi lên đè. Nhờ vậy *"phiên bản mới phải chứa lại toàn bộ sản phẩm cũ"* đúng theo
mặc định, không phụ thuộc người dùng nhớ liệt kê đủ.

**Kiểm thiếu sản phẩm thừa kế lúc GỬI DUYỆT, không phải lúc lập.** Người dùng cần được phép xoá nhầm
rồi thêm lại trong lúc còn nháp.

**TDV gửi kèm `companyPrice` hay `thresholdRate2` thì 400, không im lặng bỏ qua.** YCNV cho phép cả
hai cách; chọn báo lỗi vì im lặng thì người dùng tưởng con số mình gửi đã được dùng.

**Ký số lần hai trả `ALREADY_SIGNED` chứ không rơi vào `INVALID_TRANSITION` chung** — nguyên nhân
khác hẳn: không phải sai bước mà là bấm lặp, và người dùng cần biết chữ ký cũ vẫn còn nguyên.

### Phần chưa phủ, và lý do

| Phần | Hoãn sang | Ghi chú |
|---|---|---|
| Số email trong Mailpit (`WF-01`, `WF-04`, `WF-28`) | P6 `notification` | `policy` đã phát **đủ 6 sự kiện đúng danh sách người nhận** qua outbox; test khẳng định tới đó. Việc gửi thư là của `notification` |
| Object trên MinIO (`WF-13`, `WF-18`, `WF-21`) | P6 `document` | `policy` giữ **con trỏ file** và luật nghiệp vụ quanh nó — không có scan thì không bàn giao được, yêu cầu in lại thì xoá con trỏ và phát `policy.scan_discarded`. Việc xoá object thật là của `document` |

Cách chia này theo đúng ranh giới sở hữu dữ liệu: mỗi service chỉ được kiểm tới lớp nó thật sự chịu
trách nhiệm, phần còn lại kiểm ở chặng của service sở hữu nó.

### Kết quả

| Nhóm | Số test |
|---|---|
| `POL-01…19` | 24 |
| `WF-01…28` | 25 |
| `EFF-01…13` | 14 |
| `AD-02` bổ sung | 1 |

**256/256 xanh**, chạy ba lần liên tiếp cùng kết quả, `pol.policy` còn 0 dòng sau khi chạy.

### Commit

`P5: policy — ho so, luong duyet 10 buoc, hieu luc va phien ban`

---

## P5.5 — Yêu cầu phi chức năng

Người dùng yêu cầu rà lại kiến trúc trước khi sang P6, tập trung vào khả năng mở rộng, phình CSDL và
sao lưu. Rà soát cho kết quả **chưa đạt**, với ba lỗ hổng thuộc loại chặn vận hành.

### Điều bản thiết kế bỏ sót

Danh mục 323 test case có nhóm `PERF` đo **hiệu năng**, nhưng không có nhóm nào kiểm **vận hành**.
Đó là hai thứ khác nhau: PERF trả lời "có nhanh không", còn câu hỏi chưa ai đặt là "chạy ba năm thì
sao, và mất ổ cứng thì làm gì". Bổ sung nhóm **`OPS` gồm 7 mã**, tổng test case trong tài liệu:
323 → **330**.

### Ba lỗ hổng chặn

| | Hiện trạng khi rà | Đã làm |
|---|---|---|
| **Sao lưu** | Không một dòng nào. `archive_mode=off`. Toàn bộ dữ liệu nằm trong một Docker volume | `pg_dump -Fc` tự kiểm mục lục ngay sau khi ghi, giữ 14 bản; lưu trữ WAL liên tục; `make restore-drill` phục hồi vào CSDL **nháp** rồi đối chiếu và kiểm lại bốn bất biến |
| **Phân trang** | Không có ở bất kỳ endpoint danh sách nào — trả về cả bảng | Bắt buộc mọi endpoint: mặc định 50, trần 200, kèm tổng số thật qua `count(*) OVER()` |
| **Kết nối** | 10 service × 8 = 80, `max_connections` mặc định 100 | 200, kèm tinh chỉnh bộ đệm và `work_mem` cho VM 8GB |

`restore.sh` **mặc định phục hồi vào CSDL nháp**, muốn đè lên CSDL sống phải truyền `RESTORE_DB=csbh`
một cách có ý thức — phục hồi nhầm lên CSDL đang chạy là cách mất dữ liệu nhanh nhất trong lúc đang
hoảng.

### Chống phình CSDL

Bảng nhật ký là ca khó nhất: chính bất biến *chỉ ghi thêm* khiến nó **không dọn được bằng DELETE**.
Cách duy nhất còn lại là **phân vùng theo tháng**, rồi `DETACH` vùng cũ đem lưu trữ — dữ liệu vẫn
còn, chỉ rời khỏi bảng nóng. Việc này **phải làm trước khi có dữ liệu thật**: chuyển một bảng vài
trăm nghìn dòng đang chạy sang bảng phân vùng thì phải dừng hệ thống.

Bốn bảng còn lại (`refresh_token`, `activation_token`, ba bảng `outbox`) dọn bằng
`sys.run_retention()`. Hàm này **chỉ xoá sự kiện outbox đã gửi** — bản chưa gửi là việc còn nợ — và
**không bao giờ đụng tới nhật ký**.

### Bốn lỗi phát hiện trong lúc sửa

**1. `migrate.sh` không bọc transaction.** Migration `0008` hỏng giữa chừng để lại CSDL nửa vời và
**không được ghi nhận**, nên lần chạy sau áp dụng lại từ đầu lên một lược đồ đã đổi một nửa. Đã thêm
`--single-transaction` để file migration và dòng ghi nhận cùng một transaction. Đây là khiếm khuyết
có từ P1, chỉ lộ ra khi có migration đủ phức tạp để hỏng.

**2. Thay nguyên `postgresql.conf` là mất `listen_addresses` của ảnh gốc.** Postgres quay về mặc
định `localhost`: container khoẻ mạnh, healthcheck **vẫn xanh** (vì `pg_isready` đi qua socket Unix),
mà không service nào kết nối được.

**3. `archive_command` hỏng lặng lẽ.** Volume Docker sinh ra thuộc `root`, Postgres chạy dưới uid 70
nên không ghi được — 5 lần lưu trữ hỏng liên tiếp mà CSDL vẫn chạy bình thường. Đây đúng là kịch bản
tệ nhất: **mất khả năng phục hồi theo thời điểm mà không ai biết cho tới lúc cần dùng**. Đã thêm
service `pg-init` chỉnh quyền, và `OPS-02` kiểm `failed_count = 0`.

**4. `now()` là thời điểm bắt đầu TRANSACTION, không phải thời điểm chạy câu lệnh.** Mọi sự kiện phát
trong cùng một transaction mang dấu thời gian giống hệt nhau, nên `ORDER BY created_at` trả về thứ tự
tuỳ ý — test `WF-28` lúc xanh lúc đỏ. Với publisher ở P6 thì đây không phải chuyện nhỏ: gửi
`policy.publish_signed` trước `policy.tbp_sign` là email tới kế toán trước email báo đã ký. Đã thêm
cột `seq` tự tăng cho cả ba bảng outbox.

### Chống quét toàn bảng

Tìm khách hàng dùng `ILIKE '%…%'` — không index B-tree nào dùng được. Đã thêm index **GIN trigram
trên biểu thức ghép**, và sửa truy vấn dùng đúng biểu thức đó: lệch một ký tự là Postgres không bao
giờ chọn index, kể cả khi bảng đã lớn.

Lập hồ sơ *n* dòng trước đây là *n* vòng mạng nối tiếp sang catalog. Đã thêm endpoint tra **theo lô**.

### Nói thẳng về "scale khi thêm người dùng"

50 → 200 người dùng **không phải vấn đề CPU** — tải nghiệp vụ này rất nhẹ. Nút thắt thật là phân
trang và số kết nối, cả hai đã xử lý. Và kiến trúc microservice **không giúp gì** cho việc này: 10
service ăn 10× kết nối và 10× RAM nền trong khi tải vẫn thế. Đó là cái giá đã biết trước khi chốt
kiến trúc, không phải phát hiện mới.

### Commit

`P5.5: yeu cau phi chuc nang — sao luu, phan trang, chong phinh CSDL`

---

## P5.6 — Vòng hai phi chức năng

Rà lại lần hai theo yêu cầu. Bảy điểm còn lại, trong đó **bốn cái làm chết hệ thống** chứ không chỉ
làm chậm. Nhóm `OPS` mở rộng lên 11 mã; tài liệu **334 test case**.

### Sai lầm của chính P5.5 phải sửa lại

**`pg_dump` + lưu trữ WAL KHÔNG tự ghép thành PITR.** Phục hồi theo thời điểm cần một bản sao lưu
**vật lý** làm điểm xuất phát; bản dump logic không đóng vai đó được. P5.5 bật `archive_mode=on` rồi
chỉ chạy `pg_dump` — kết quả là WAL chất đống mà **không dùng được vào việc gì**.

Đã bổ sung `pg_basebackup`, và giữ cả hai kiểu vì chúng phục vụ hai việc khác nhau:

| | Dùng để | Điểm phục hồi sớm nhất |
|---|---|---|
| `pg_dump -Fc` | Phục hồi từng bảng, mang sang máy chủ Postgres phiên bản khác | Lúc chạy dump — mất tối đa 24 giờ |
| `pg_basebackup` + WAL | Phục hồi theo thời điểm | ~5 phút (`archive_timeout = 300`) |

### Bốn thứ làm chết hệ thống

**1. `/archive` đã 208 MB sau vài giờ chạy test, không có gì dọn.** Nghịch lý: cơ chế thêm vào để
*bảo vệ* dữ liệu lại là thứ làm đầy ổ, và ổ đầy thì Postgres **dừng ghi**. Đã thêm
`pg_archivecleanup` chạy sau mỗi bản sao lưu vật lý, cắt WAL cũ hơn bản còn giữ sớm nhất — thư mục
xuống còn **16 MB**.

**2. Bản sao lưu nằm cùng ổ với dữ liệu.** `pgdata`, `pgarchive`, `pgbackup` đều là Docker volume
trên một VM: hỏng ổ mất cả ba. Sao lưu chưa rời khỏi máy thì mới chống được lỗi người dùng, chưa
chống được lỗi phần cứng — đúng rủi ro đã nêu ở P5.5 mà chưa đóng hết. Đã thêm `BACKUP_MIRROR_DIR`;
ở production thiếu biến này thì job sao lưu **báo lỗi và dừng** thay vì im lặng chạy tiếp.

**3. Máy chủ chạy giờ GMT.** Hồ sơ tiếp nhận lúc 06:00 sáng ngày 8 giờ Việt Nam (= 23:00 GMT ngày 7)
bị ghi thành **ngày 7** — lệch một ngày ở *ngày áp dụng*, ở hiệu lực giá và ở SLA. Loại lỗi chỉ xảy
ra vào sáng sớm nên rất lâu mới lộ. Đặt `timezone = 'Asia/Ho_Chi_Minh'`; dấu thời gian vẫn lưu UTC,
chỉ cách đọc **theo ngày** là đổi.

**4. Log Docker không giới hạn dung lượng.** Cùng hậu quả với mục 1. Đã đặt `max-size 10m`, giữ 5 file.

### Ba thứ về an toàn và vận hành

**Bí mật là biến môi trường** — lộ ra ở `docker inspect` và `/proc/<pid>/environ`. Thêm
`readSecret()` ưu tiên `*_FILE`, và `make secrets` sinh file ngẫu nhiên vào thư mục đã bị gitignore.
Ở production thiếu bí mật thì **dừng**, không chạy tiếp với mật khẩu đoán được.

**Khoá JWT sinh tạm khi không có file** — mười service mỗi cái một khoá riêng thì không cái nào xác
minh nổi token của cái khác. `OPS-11` chứng minh trực tiếp: ký ở "service A", xác minh ở "service B"
cùng file khoá thì được; bỏ file đi thì không.

**Không tắt máy êm, `healthz` không chạm CSDL.** Mỗi lần deploy là cắt ngang request đang chạy; và
healthcheck trả `ok` kể cả khi Postgres đã chết thì không phát hiện được gì. Đã thêm
`enableShutdownHooks()` và `SELECT 1` trong healthz.

### Một lỗi phụ

`pg_basebackup` cần kết nối **nhân bản**, mà `pg_hba.conf` của ảnh gốc chỉ mở nhân bản qua socket cục
bộ. Job sao lưu chạy ở container khác nên bị từ chối. Đã thêm file `pg_hba.conf` riêng, vẫn bắt buộc
`scram-sha-256` cho mạng nội bộ — cùng mạng không phải căn cứ để tin nhau.

### Còn nợ, đã ghi nhận

Không giới hạn tốc độ đăng nhập (mới khoá theo tài khoản, rải 1 lần/tài khoản không bị chặn) · chưa
có lịch tự động cho sao lưu và dọn dẹp · `trace_id` có cột nhưng không ai điền · **chưa có cảnh báo**
— chính lỗi `archive_command` hỏng lặng lẽ là ví dụ sống · chưa có migration lùi · một VM, chưa ghi
cam kết RPO/RTO. Xử lý cùng P7 khi dựng gateway và Caddy.

### Commit

`P5.6: PITR that, mui gio ICT, bi mat tu file, tat may em`

---

## P6a — `notification` và đường truyền sự kiện

Chặng đầu tiên có **hai service nói chuyện với nhau qua hàng đợi** chứ không qua HTTP. Mẫu outbox
đã có nửa đầu từ P4 (ghi nghiệp vụ và ghi sự kiện cùng một transaction); ở đây mới có nửa sau.
**305/305 xanh**, ba lần liên tiếp.

### Đã dựng

```
packages/bus/                 topology, Bus (amqplib), OutboxRelay
services/notification/        consumer, mẫu thư, chống trùng, DLQ, hai chốt an toàn
db/migrations/0010            ntf.sent_mail · ntf.dead_letter · ntf.reminder · idn.notify_targets()
services/policy/consumers/    price-changed → policy.price_impact
services/{policy,catalog}/infra/outbox.relay.ts
```

### Bảo đảm thật sự đạt được là "ít nhất một lần", không phải "đúng một lần"

Giữa `bus.publish` và `UPDATE published_at` luôn có một khe: tiến trình chết đúng lúc đó thì lần bơm
sau phát lại sự kiện đã phát. **Không cố bịt khe đó** — bịt được ở một chỗ thì lại hở ở chỗ khác.
Chốt chống trùng đặt ở bên NHẬN, bằng ràng buộc `UNIQUE (event_id)` trong CSDL.

Chỗ đó quan trọng hơn vẻ ngoài: kiểm bằng `SELECT` rồi `INSERT` thì hai bản notification chạy song
song đều thấy "chưa có" và **cả hai đều gửi**. Test `NTF-06` chạy đúng hai lời gọi song song để
chứng minh ràng buộc CSDL chặn được, còn phép kiểm ở tầng ứng dụng thì không.

### Đánh đổi phải chọn: mất thư hay gửi trùng

Ghi trước rồi gửi thì **mất thư** nếu chết giữa hai bước; gửi trước rồi ghi thì **gửi trùng**. Chọn
vế thứ nhất, và lý do nằm ở phía người dùng chứ không ở phía kỹ thuật:

- Gửi trùng là thứ họ **thấy** và không sửa được — bốn thư giống hệt nhau làm họ mất tin vào mọi
  thông báo sau đó.
- Mất một thư thì hồ sơ vẫn nằm trong danh sách "chờ tôi xử lý" ở trang chủ (`NTF-07`), tức là vẫn
  còn một đường thấy việc.

Gửi hỏng thì chỗ đã giữ được **trả lại** rồi mới ghi DLQ. Thiếu bước trả lại thì sự kiện vĩnh viễn bị
coi là đã gửi và mọi lần gửi lại đều bị chặn vì trùng `event_id` — `NTF-05` kiểm đúng chỗ này.

### Ba lỗi không bản giả nào phát hiện được

**1. Queue phải khai báo TRƯỚC sự kiện đầu tiên.** RabbitMQ vứt bỏ **trong im lặng** thư gửi vào
exchange chưa ai bind — không lỗi, không cảnh báo, không log. Nếu để consumer tự khai báo lúc khởi
động thì mọi sự kiện phát trong lúc notification chưa từng chạy sẽ mất hẳn. Cả bên phát lẫn bên nhận
đều gọi `declareConsumer` lúc khởi động; nhờ vậy `INT-06` (tắt notification rồi duyệt hồ sơ) mới
đúng: thư nằm chờ trong queue bền và được giao bù khi service trở lại.

**2. `publish` của amqplib không báo lỗi khi broker từ chối.** Nó trả về ngay sau khi ghi vào socket.
Đã đổi sang **kênh có xác nhận** (`createConfirmChannel` + `waitForConfirms`), nếu không thì "đã phát
sự kiện" chỉ có nghĩa là "đã ghi vào socket".

**3. `prefetch(1)`.** Thứ tự các bước duyệt của một hồ sơ phải giữ nguyên. Với prefetch lớn thì hai
thư của cùng hồ sơ chạy song song và thư "chuyển sang chờ kế toán" có thể tới trước thư "Trưởng bộ
phận đã ký".

### Sự kiện phải TỰ NÓ đủ nghĩa

`notification` không đọc được schema `cus`, nên mã và tên khách hàng được nhét thẳng vào sự kiện lúc
phát. Cách còn lại — để notification gọi ngược sang customer lúc gửi thư — làm hỏng chính thứ mẫu
outbox sinh ra để tránh: sự kiện chỉ gửi được khi customer đang sống. Thêm một lợi ích không nhắm
tới: đọc lại sự kiện ba tháng sau, khi khách hàng đã đổi tên, vẫn thấy đúng tên **tại thời điểm gửi thư**.

Giá phải trả: một lời gọi nội bộ cho mỗi lần chuyển bước.

### Gộp luồng thư làm bằng header, không bằng tiêu đề

Mọi thư của một khách hàng trỏ `References` về **một gốc chung** sinh từ mã khách hàng, nên chúng nối
thành chuỗi dù gửi cách nhau nhiều tuần và không thư nào là trả lời thư nào. `NTF-04` kiểm cả hai
chiều: cùng `References`, nhưng **sáu `Message-ID` khác nhau** — gộp luồng không được biến sáu thư
thành một.

### Lệch so với thiết kế: sáu thư, không phải mười hai

Bản thiết kế ghi luồng 10 bước sinh "12 email". Số đúng là **6**: một bước gửi một thư cho nhiều
người nhận, không phải mỗi người một thư. Đó cũng là điều kiện để chúng gộp được vào một luồng. Con
số 12 đếm theo lượt người nhận (thực ra là 14). `NTF-01` khẳng định 6 thư kèm **đúng tập địa chỉ của
từng thư**, chặt hơn một phép đếm.

### Hai chốt an toàn email, kiểm lúc KHỞI ĐỘNG

Production trỏ vào Mailpit, hoặc môi trường test trỏ vào SMTP thật mà chưa đặt `MAIL_REDIRECT_ALL` —
cả hai đều làm service **không khởi động nổi**. Kiểm lúc gửi thì một service chạy êm mà gửi nhầm địa
chỉ, tới lúc có người phàn nàn mới biết.

Chi tiết đáng giữ: tên máy chủ **chưa từng gặp bị coi là relay THẬT**. Mặc định ngược lại — an toàn
trừ khi nhận ra là thật — nghĩa là mọi tên lạ đều lọt qua và chốt an toàn không chặn được gì.

### Ba lỗi gỡ trong lúc làm

**Lập sản phẩm cũng ghi một sự kiện đổi giá.** `NTF-13` bơm outbox rồi lấy thư đầu tiên, và thư đó là
của lần **đặt giá đầu tiên** (100.000) chứ không phải lần đổi giá đang thử (120.000). Lỗi của test,
nhưng nó chỉ ra một điều thật về hệ thống: outbox tích luỹ, nên "bơm rồi lấy thư đầu tiên" không bao
giờ là phép kiểm đúng.

**`nack` trên kênh đã đóng thành unhandled rejection.** Service đang tắt thì kênh đóng trước khi
handler chạy xong. Thư chưa ack nên RabbitMQ giao lại cho bản sau — đúng hành vi mong muốn, nhưng
ném ra ngoài thì Node giết tiến trình.

**`redis.quit()` lúc tắt máy ném "Connection is closed".** Nest biến nó thành lỗi khi đóng ứng dụng
và **che mất nguyên nhân thật** của lần tắt đó. Tắt máy không được phép ném lỗi.

### Còn nợ của chặng này

`notification` và `bus` chưa có mặt trong `deploy/compose.yml` — cũng như identity, catalog, customer
và policy, vì chưa chặng nào dựng container cho service ứng dụng. Làm một lượt ở P7 cùng gateway.

### Commit

`P6a: notification + duong truyen outbox -> RabbitMQ`

---

## P6b — `document`: file, ký số, bản CSBH A4

Chặng đầu tiên có **file thật** và **PDF thật**. MinIO thật, Chromium thật, và PDF sinh ra được
**đọc lại** bằng `pdfjs-dist` để đối chiếu chữ, bằng `pdf-lib` để đo khổ giấy. **322/322 xanh**, ba
lần liên tiếp.

### Lệch so với thiết kế: một Chromium, không phải hai

Bản thiết kế đặt **Playwright + Chromium ngay trong ảnh của `document`** cho phần HTML, và Gotenberg
chỉ để chuyển `.docx`. Ở đây cả hai đường đều đi qua Gotenberg. Ba lý do:

1. Gotenberg *chính là* Chromium chạy trong container, nên yêu cầu "bản PDF khớp bản đang xem" vẫn
   giữ nguyên — vẫn là engine của trình duyệt.
2. Ngân sách RAM ở thiết kế đã tính "Chromium theo đợt 900MB **cộng** Gotenberg 700MB ≈ 6,2GB lúc bận
   nhất, biên an toàn mỏng". Dùng chung một Chromium cắt hẳn một nửa con số đó.
3. Ảnh của `document` không phải kéo theo trình duyệt và bộ thư viện hệ thống của nó.

Cái mất: không điều khiển được trình duyệt ở mức chi tiết (chờ selector, chụp ảnh màn hình). Bản CSBH
A4 là HTML tĩnh nên không cần tới.

### "PDF khớp bản đang xem" bảo đảm bằng cấu trúc, không bằng lời hứa

`GET /policies/:id/render?format=html` trả về **chính chuỗi HTML** mà bản PDF được dựng từ đó. Giao
diện nhúng đúng chuỗi ấy, nên hai bản không thể lệch nhau. Hệ quả kèm theo: PDF không chứa menu hay
nút thao tác — không phải vì có bước lọc chúng đi, mà vì bố cục này chưa bao giờ có chúng.

Khổ giấy khai **một chỗ duy nhất**: `@page` trong CSS, cộng `preferCssPageSize` phía Gotenberg. Khai
cả ở hai nơi là có hai nguồn sự thật và chúng sẽ lệch nhau vào ngày ai đó sửa một bên.

### Liên kết file: hạn ngắn **và** gắn người dùng, thiếu một là hỏng

Không dùng liên kết ký sẵn của MinIO. Liên kết ký sẵn hợp lệ với **bất kỳ ai** cầm được nó, tức là
gửi liên kết đi là gửi luôn quyền xem. Ở đây mọi lượt tải đi qua `document` với ba lớp kiểm:

1. token còn hạn 5 phút **và cấp cho đúng người đang gọi** — dán vào chat nhóm không có tác dụng
2. người đó có quyền xem hồ sơ chủ của file — **kiểm lại**, không tin token
3. nội dung trên kho khớp bản băm ghi lúc tải lên

`DOC-09` kiểm cả hai chiều: tdv03 dùng đúng liên kết của tdv01 thì 403 `LINK_NOT_YOURS`; tdv03 tự xin
liên kết thì 403 `OUT_OF_SCOPE`. Liên kết **không bao giờ** thay thế phép kiểm phạm vi.

### Hai quyết định về khoá object

**Khoá không mang tên file người dùng đặt.** Tên tiếng Việt có dấu, dấu cách và ký tự Unicode tổ hợp;
đưa thẳng vào khoá S3 là sinh ra khoá tải về được ở máy này và 404 ở máy khác vì chuẩn hoá NFC/NFD
khác nhau. Khoá là uuid, tên hiển thị nằm trong CSDL và được chuẩn hoá **NFC** — macOS gửi NFD,
Windows gửi NFC, không chuẩn hoá thì cùng một cái tên thành hai chuỗi khác nhau.

**Kiểm định dạng bằng số nhận dạng đầu file**, không bằng phần mở rộng hay `Content-Type`. Cả hai thứ
kia đều do client đặt: đổi tên `virus.exe` thành `giay-phep.pdf` là qua được mọi phép kiểm dựa trên tên.

### Kiểm hết rồi mới ghi lên MinIO

Thứ tự không đảo được. Ghi trước rồi kiểm thì file sai định dạng vẫn để lại một object không ai trỏ
tới, không ai biết để dọn. `CUST-12` kiểm đúng chỗ này: sau hai lần tải lên hỏng, số object dưới tiền
tố của khách hàng đó **không đổi**, và `doc.stored_file` không có dòng nào.

### Ký số: hai object, không ghi đè

Bản đã ký là object **mới**, trỏ ngược về bản nháp qua `signed_from_id`. Ghi đè thì câu hỏi "văn bản
đã đổi gì so với lúc chưa ký" vĩnh viễn không trả lời được. `DOC-05` khẳng định cả hai object **cùng
tồn tại** trên MinIO và hai bản băm khác nhau.

`DOC-07` kiểm hai lớp: không phụ thuộc nào gợi ý HSM/CA/chứng thư số, và chữ ký chỉ gồm **đúng ba
trường** — họ tên, vai trò, dấu thời gian. Không chuỗi tin cậy, không chứng thư. Đó là quyết định
nghiệp vụ đã chốt, không phải chỗ chưa làm xong.

### Lệch nhỏ có chủ ý: 413 thay vì 400

`CUST-12` ghi mong đợi **400** cho file quá 20MB; ở đây trả **413 Payload Too Large**. 413 là mã dành
riêng cho đúng tình huống này. Quan trọng hơn: multer chặn **ngay trên dòng dữ liệu**, trước khi 21MB
kịp nằm hết trong RAM — dời phép kiểm vào service để lấy được mã 400 là đánh đổi ngược. Phần quan
trọng của yêu cầu — chặn được, không để lại object rác — không đổi.

### Ba lỗi gỡ trong lúc làm

**Ném lại lỗi từ trong một exception filter không quay về đường xử lý của Nest.** Nó thành unhandled
rejection, và mọi lỗi 400 bình thường của endpoint đó biến mất. Phải kế thừa `BaseExceptionFilter` và
gọi `super.catch`.

**`@nestjs/platform-express` đã đổi `MulterError` thành `PayloadTooLargeException`** trước khi filter
chạy, nên nhận dạng theo tên lớp của multer không bao giờ khớp. Mất một vòng chạy để tìm ra.

**`DOC-02` đỏ oan vì "Gửi duyệt".** Chuỗi đó nằm trong danh sách "thứ không được có trong PDF", nhưng
nó là **nhãn của một mốc thời gian** trên chính bản CSBH chứ không phải cái nút. Danh sách giờ chỉ
gồm thứ thật sự thuộc về giao diện.

### Một lỗi CÓ SẴN TỪ P4 mà chặng này làm lộ ra

`CAT-15` lấy `before` từ `total` rồi đối chiếu với `items` của trang đầu. Hai con số chỉ bằng nhau
khi danh mục còn **dưới 200 sản phẩm** — đúng trần phân trang. Test xanh suốt từ P4, rồi đỏ ở P6b khi
`DOC-19` nạp thêm 60 sản phẩm và tổng vượt 200.

Đáng ghi lại vì nó là loại lỗi mà chạy lại toàn bộ test cũ sau mỗi chặng mới bắt được: bản thân P6b
không đụng gì tới catalog.

### Lệch nhỏ: `DOC-19` dùng 60 dòng thay vì 200

Mỗi dòng cần một sản phẩm riêng trong danh mục, và 200 lượt tạo sản phẩm làm test chạy vài phút mà
không chứng minh thêm gì. Điều cần chứng minh là **có ngắt trang, dòng tiêu đề lặp lại ở mỗi trang,
và không mất dòng cuối** — 60 dòng đã tràn sang trang thứ hai nên đủ để kiểm cả ba.

### Còn nợ của chặng này

`DOC-20` mới khẳng định năm lượt render song song đều ra PDF hợp lệ, **chưa** có hàng đợi BullMQ giới
hạn 2 tiến trình Chromium như thiết kế — hiện dựa vào giới hạn nội tại của Gotenberg. Nhóm hợp đồng
(`DOC-10` … `DOC-16`, `DOC-21` … `DOC-35`) chuyển sang **P6c**.

### Commit

`P6b: document — file, ky so noi bo, ban CSBH A4 qua Gotenberg`

---

## P6c — Mẫu hợp đồng và xuất hợp đồng

Chặng khó nhất của P6, và cái khó nằm ở chỗ không ai đoán trước: `.docx`. **348/348 xanh**, ba lần
liên tiếp.

### Một mâu thuẫn trong danh mục test, đã xử lý dứt điểm

`DOC-16` ghi *"Hợp đồng có trạng thái riêng và tải được bản scan"*. Điều đó **mâu thuẫn trực tiếp**
với `DOC-28` và muc 8.3, vốn nói không có bảng hợp đồng, không mã, không trạng thái, không bản scan.

`DOC-16` là mức `P1` và có từ trước quyết định "hợp đồng là một phép biến đổi"; `DOC-28` là `P0` và
viện dẫn thẳng muc 8.3 của bản hợp nhất. **Bản hợp nhất thắng, `DOC-16` nghỉ.** Quyết định đó không
nằm trong một dòng ghi chú mà nằm trong một test chạy được: nó quét `information_schema` để khẳng
định không có cột `status`, `scan_file_id` hay `contract_code` ở đâu cả — nếu sáu tháng sau ai đó
thêm lại, test đỏ ngay.

Phần **duy nhất** của `DOC-16` còn giá trị — liên kết ngược về hồ sơ nguồn — được giữ, nhưng ở trên
chính hồ sơ (`contract_issued_at/by`) chứ không ở một bản ghi hợp đồng.

> **Phải nói rõ với khách hàng:** hệ thống **không trả lời được** câu hỏi *"hợp đồng nào đã ký, hợp
> đồng nào chưa"*. Muốn theo dõi việc ký hợp đồng thì phải bổ sung lưu trữ, và khi đó nên thêm cả ảnh
> chụp dữ liệu tại thời điểm xuất chứ không chỉ thêm cột trạng thái.

### `DOC-28` là test giữ kiến trúc, không phải test chức năng

Nó quét ba nơi và cả ba đều phải sạch: lược đồ CSDL (không bảng `contract`), bảng định tuyến của
Express (không route `/contracts/:id`), và kho MinIO (số object **trước và sau** khi xuất bằng nhau).
PDF trả thẳng về người bấm và không bao giờ đi qua kho.

### Cái khó thật sự: Word cắt ô trống thành nhiều mảnh

Word cắt một đoạn văn thành nhiều `<w:r>` bất cứ lúc nào nó muốn — sửa một chữ, bật kiểm tra chính
tả, đổi phông giữa chừng. Nên `{{customer.name}}` gõ liền mạch trên màn hình rất thường nằm rải trong
XML thành `{{cus`, `tomer.`, `name}}`.

Tìm chuỗi trên từng `<w:t>` sẽ **không thấy gì cả**, và đó là kiểu hỏng im lặng tệ nhất: file vẫn
sinh ra, chỉ là ô trống không được điền. Cách xử lý là gộp toàn bộ `<w:t>` trong **cùng một `<w:p>`**
rồi mới tìm và thay. Có một test riêng dựng đúng cấu trúc XML bị cắt rời đó.

Cái giá: định dạng khác nhau giữa các đoạn chữ **trong cùng một đoạn văn** bị san phẳng theo đoạn chữ
đầu tiên. Chấp nhận được với mẫu hợp đồng — định dạng ở đó theo đoạn văn, không theo từng chữ.

### Không dùng thư viện trộn mẫu

`docxtemplater` và tương tự làm được nhiều hơn nhu cầu ở đây nhiều lần, đổi lại là một cú pháp mẫu
riêng mà Sale Admin phải học và một phụ thuộc lớn phải theo dõi vá lỗi. Việc cần làm chỉ có ba: liệt
kê ô trống, thay giá trị, nhân bản dòng bảng. `fflate` mở zip, phần còn lại là xử lý chuỗi.

### Hai lỗi `.docx` mất nhiều thời gian nhất

Cả hai đều cho ra **đúng một dòng** `uno exception` từ LibreOffice, không nói gì thêm.

**1. File `.docx` tối thiểu của tôi quá tối thiểu.** Ba file — bảng kiểu nội dung, quan hệ gốc, thân
tài liệu — đủ để `placeholdersOf` đọc hoàn toàn bình thường, nên nó *trông như đã xong*. Thiếu
`word/_rels/document.xml.rels` (kể cả rỗng) và `<w:tblGrid>` trong bảng. Word tự suy ra được cả hai;
LibreOffice thì không. Nói cách khác: **đọc được không có nghĩa là mở được.**

**2. Thuộc tính XML trùng lặp.** Hàm ghi chữ vào đoạn văn nối thêm `xml:space="preserve"` vào thẻ
`<w:t>` sẵn có, mà thẻ đó **đã có** thuộc tính ấy → `<w:t xml:space="preserve" xml:space="preserve">`.
XML thuộc tính trùng là XML không hợp lệ. Đã đổi sang dựng lại thẻ mở từ đầu.

Cách gỡ cả hai: **ghi file ra rồi tự chuyển bằng `curl`**, tách hẳn khỏi đường ứng dụng. File chưa
trộn chuyển được (200) mà file đã trộn thì không → biết ngay lỗi nằm ở bước trộn, không phải ở bước
dựng. Đọc log Gotenberg thì không bao giờ ra.

### Ba lỗi của chính test, mỗi lỗi chỉ ra một điều thật

**`DOC-12` — sản phẩm của hồ sơ A có mặt trong hợp đồng của hồ sơ B, và đó là ĐÚNG.** B là bản chỉnh
sửa của A, mà *"phiên bản mới phải chứa lại toàn bộ sản phẩm cũ"* (muc 5.1). Khẳng định ngược lại sẽ
ép hệ thống vi phạm luật đó. Thứ phân biệt hai bản hợp đồng là **mã hồ sơ**, không phải danh sách sản phẩm.

**`DOC-24` — đường trả về phải đúng máy trạng thái.** Sau khi tiếp nhận L1, hồ sơ đã ở bước Sale Admin
xử lý nên `KT_RETURN_L1` không còn hợp lệ. Kịch bản thật là kế toán từ chối ở **lần hai**.

**LibreOffice ngắt dòng trong ô bảng hẹp,** nên `ZZHD-SP-16-21919` ra khỏi trình trích chữ thành
`ZZHD- SP-16- 21919`. Chuyện trình bày, không phải dữ liệu thiếu — phép so mã sản phẩm bỏ hết khoảng
trắng trước khi đối chiếu.

### Ba chỗ chặn sớm thay vì chặn muộn

- **Ánh xạ tới trường nguồn không tồn tại → 400 ngay lúc LƯU** (`DOC-29`), không đợi tới lúc kế toán
  bấm xuất hai tuần sau. Một danh sách trường nguồn dùng cho cả hai việc — kiểm và trộn — là cách duy
  nhất bảo đảm "lưu được thì xuất được".
- **Phát hành mẫu còn ô trống chưa ánh xạ → 409 kèm danh sách ô thiếu** (`DOC-30`). Không chặn thì
  hợp đồng in ra mang nguyên chuỗi `{{...}}` gửi cho khách hàng.
- **File mẫu hỏng → 400, mẫu đang dùng không bị ảnh hưởng** (`DOC-33`). Đọc ô trống **trước** khi ghi
  bất cứ thứ gì. Test kiểm cả hai đường hỏng: không phải zip, và zip hợp lệ nhưng không có
  `word/document.xml`.

### Đúng một mẫu đang dùng — cưỡng chế ở CSDL

`CREATE UNIQUE INDEX ... ON doc.contract_template ((true)) WHERE is_active`. Kiểm bằng `SELECT` rồi
`UPDATE` thì hai lần bấm phát hành gần như đồng thời cho qua cả hai. Thứ tự hạ-mẫu-cũ-trước cũng
giống hệt bài học ở `EFF-01` của policy: partial unique index kiểm ngay sau từng câu lệnh, không hoãn
tới `COMMIT`.

### Ghi dấu vết SAU khi đã có PDF trong tay

Gotenberg chết mà đã ghi `contract_issued_at` trước là hồ sơ mang dấu "đã xuất hợp đồng" cho một lần
xuất **không hề xảy ra**. `DOC-34` tắt Gotenberg giữa chừng và khẳng định cột đó vẫn `NULL`.

### Một lỗi phụ dọn luôn

`document` hỏi người ký qua `/internal/catalog/lookups?kind=signer`, mà endpoint đó dựng tên bảng từ
tham số `kind` → truy vấn `cat.undefined` → 500. Lời gọi có `.catch()` bọc ngoài nên **chạy được
suốt**, chỉ để lại một núi lỗi trong log mà không ai đọc. Đã thêm endpoint `/internal/catalog/signers`
riêng.

### Còn nợ của chặng này

`DOC-20` vẫn chưa có hàng đợi BullMQ giới hạn 2 tiến trình Chromium — hiện dựa vào giới hạn nội tại
của Gotenberg. Mẫu mặc định seed sẵn là bản tối giản, đủ để hệ thống chạy được ngay sau khi triển
khai; mẫu thật do Sale Admin tải lên.

### Commit

`P6c: mau hop dong va xuat hop dong — mot phep bien doi, khong phai ban ghi`

---

## P6d — `sla-worker`: hạn xử lý, nhắc trước một ngày, quá hạn

Service cuối của P6, và là service đầu tiên **không có controller nào** — tiến trình nền thuần.
**363/363 xanh**, ba lần liên tiếp. P6 hoàn tất.

### Đồng hồ là một ĐẦU VÀO, không phải một lời gọi

SLA là 14 ngày và nhắc trước một ngày. Không có cách nào kiểm hai con số đó bằng cách chờ, nên đồng
hồ phải tiêm được. Kèm theo một ràng buộc dễ quên: **mọi phép so hạn phải làm trong JavaScript hoặc
truyền mốc thời gian vào SQL làm tham số.** Viết `WHERE sla_due_at < now()` là bỏ qua đồng hồ tiêm,
và hai con số 13/14 ngày vĩnh viễn không kiểm được — câu lệnh vẫn chạy, test vẫn xanh, chỉ là nó
không kiểm điều nó nói.

### *Quá hạn duyệt* là một cái NHÃN, không phải một chặng mới

Đây là quyết định thiết kế đáng nhớ nhất của chặng. Máy trạng thái **không có luật nào đi ra từ**
`QUA_HAN_DUYET`. Thêm luật cho nó sẽ nhân đôi mọi luật hiện có — mỗi luật một bản "bình thường" và
một bản "quá hạn", và hai bản đó sẽ lệch nhau vào ngày ai đó sửa một bên.

Thay vào đó: `effectiveStatus(status, pendingStep)` gỡ nhãn ra và trả về trạng thái thật bên dưới.
Một hàm bốn dòng thay cho mười hai luật trùng lặp. Hệ quả kiểm được: hồ sơ quá hạn ở bước Trưởng bộ
phận thì **kế toán vẫn bị chặn**, và thông báo lỗi trả về trạng thái thật (`CHO_TBP_DUYET`) chứ không
phải cái nhãn — nhãn quá hạn không nới quyền cho ai.

### Ba chốt chống trùng, mỗi cái chặn một kiểu hỏng khác nhau

| Chốt | Chặn được gì | Không chặn được gì |
|---|---|---|
| Khoá Redis `SET NX PX` | Hai bản worker cùng quét một lượt | Lượt quét chạy quá TTL 60 giây |
| Khoá chính `(hồ sơ, loại, ngày)` | Nhắc trùng, kể cả sau restart | — |
| `row_version` trong `WHERE` | Đánh dấu quá hạn đè lên việc vừa duyệt xong | — |

Chốt thứ hai là chốt cuối cùng và là chốt duy nhất không có lỗ: khoá Redis hết TTL giữa chừng thì hai
bản chạy song song, và lúc đó chỉ ràng buộc CSDL cứu được. `NTF-14` dựng hẳn một bản worker **mới**
để mô phỏng container restart — bộ nhớ tiến trình mất sạch, chốt phải nằm ở CSDL thì mới còn.

Chi tiết ở khoá Redis: **chỉ bản giữ khoá mới được xoá nó** — so token trước khi `DEL`. Không so thì
một lượt quét chạy quá TTL sẽ xoá khoá mà bản sau vừa lấy được, và hai bản chạy song song đúng vào
lúc dữ liệu nhiều nhất.

### Đổi SLA: tính từ lúc BẮT ĐẦU CHỜ, không phải từ hạn cũ

`NTF-12` đổi 14 ngày sang 7. Hạn mới = `sla_started_at + N ngày`, **không phải** "hạn cũ trừ 7 ngày".
Hai cách chỉ trùng nhau khi SLA đổi đúng một lần; đổi lần thứ hai thì cách sau làm hạn phụ thuộc vào
lịch sử thay đổi cấu hình, và không ai giải thích nổi cho kế toán vì sao hai hồ sơ vào cùng ngày lại
có hai hạn khác nhau. Đã thêm cột `sla_started_at` cho đúng phép tính đó.

Số ngày đọc từ `pol.sla_config` **ngay trong câu lệnh SQL**, không phải hằng số trong mã: hồ sơ
chuyển bước sau khi đổi cấu hình dùng số mới ngay, không chờ triển khai lại.

### Sửa lại hai quyết định sai của chính mình

**1. `ntf.reminder` nằm ở schema không ai ghi vào được.** Migration 0010 dựng bảng đó với lý lẽ "để
sla-worker ở chặng sau không phải kèm migration riêng". Lý lẽ đó bỏ qua AD-02: `sla-worker` chạy dưới
role `csbh_pol` (nó đọc `pol.policy`), mà `csbh_pol` không có quyền ghi vào schema `ntf`. Đã chuyển
sang `pol.sla_reminder` và bỏ bảng cũ — nó chưa từng có một dòng nào.

> **"Để sẵn cho chặng sau" là lúc dễ đặt bảng nhầm schema nhất**, vì lúc đó chưa có mã nào chạm vào
> nó để mà lộ ra.

**2. `GRANT EXECUTE` không đủ để gọi một hàm.** 0013 cấp `EXECUTE` trên `sys.run_retention()` cho
`csbh_pol` và đặt `SECURITY DEFINER` — đúng, nhưng lời gọi vẫn dừng ở `permission denied for schema
sys`. Gọi hàm còn cần `USAGE` trên **schema** chứa nó. Hai lớp quyền cho một lời gọi, và `GRANT
EXECUTE` thành công không hề cảnh báo rằng nó chưa đủ.

Không có `SECURITY DEFINER` thì câu "sla-worker gọi `run_retention` mỗi ngày" ở bản thiết kế là câu
**không thực hiện được**: hàm xoá ở bốn schema mà role đó chỉ có quyền trên một. Kèm `SET search_path`
cố định — bắt buộc với mọi hàm `SECURITY DEFINER`, nếu không người gọi trỏ tên bảng sang bảng của họ
và hàm xoá nhầm dưới quyền chủ sở hữu.

### Trang chủ: hai điều kiện, thiếu một là sai theo hai kiểu

`NTF-07` — danh sách việc đang chờ **chính người đăng nhập**: đúng bước (trạng thái chờ ứng với vai
trò) **và** đúng phạm vi (hồ sơ trong cây tổ chức của người đó). Kế toán không thấy hồ sơ đang chờ
Trưởng bộ phận; Trưởng bộ phận BP01 không thấy hồ sơ của TDV thuộc BP02. Ban lãnh đạo và Quản trị
nhận danh sách **rỗng** — một bên chỉ đọc, một bên nằm ngoài luồng duyệt.

Hồ sơ quá hạn **vẫn hiện**, ở đúng ô của người đang phải xử lý. Đó là lý do `pending_step` phải lưu.

### Một lỗi của test đáng ghi

Vòng quét là **toàn cục** — nó không biết test nào đang chạy. Hồ sơ do test trước để lại vẫn đang chờ
với hạn 14 ngày, nên lượt quét sau khi đẩy đồng hồ 13 ngày nhắc cả chúng và mọi phép đếm lệch. Không
phải chuyện riêng của test: nó phản ánh đúng việc worker chạy trên toàn bộ CSDL. Đã đẩy hạn của mọi
hồ sơ đang chờ ra xa trước mỗi test.

### Còn nợ của chặng này

`PERF-07` (quét 20.000 hồ sơ dưới 60 giây) chưa chạy — cần bộ dữ liệu lớn, để cùng nhóm `PERF` ở P7.
Bộ hẹn giờ dùng `setInterval` chứ chưa phải cron thật; đủ cho một tiến trình luôn chạy, nhưng lịch
sao lưu và dọn dẹp ở mức hệ điều hành vẫn nằm trong danh sách nợ từ P5.6.

### Commit

`P6d: sla-worker — han xu ly, nhac truoc mot ngay, qua han`

---

## P7a — `audit`: nhật ký chỉ ghi thêm, và `trace_id` cuối cùng có người điền

**373/373 xanh**, ba lần liên tiếp. Chặng này đóng luôn một món nợ ghi từ P5.6.

### Đã dựng

```
services/audit/                     consumer nghe '#', API chỉ đọc, báo cáo hoạt động
packages/http-kit/request-context   AsyncLocalStorage: trace_id + IP
packages/http-kit/trace.middleware  mở ngữ cảnh trước mọi guard
services/policy/infra/denied.filter ghi lại nỗ lực vượt quyền
migration 0015                      event_id + ba index
services/{customer,document}/infra/outbox.relay.ts
```

### `occurred_at` và chống ghi trùng phải đi cùng nhau

Đây là chỗ dễ làm sai nhất của chặng, và nó không lộ ra khi thử tay.

Bảng nhật ký đã phân vùng theo `occurred_at` từ P5.5. Index duy nhất trên bảng phân vùng **bắt buộc
phải chứa khoá phân vùng**, nên khoá chống trùng là `(occurred_at, event_id)` chứ không thể là
`(event_id)`. Mà khoá đó **chỉ chặn được trùng khi `occurred_at` giống nhau giữa hai lần giao**.

Suy ra: `occurred_at` phải lấy từ payload — thời điểm việc xảy ra trong nghiệp vụ — chứ không phải
`now()` lúc ghi dòng. Lấy `now()` thì hai lần giao ra hai giá trị, rơi vào hai vùng, và khoá duy nhất
không chặn được gì. Ràng buộc kỹ thuật ở đây trùng khớp với nghĩa đúng của cột: nhật ký nói *"việc
này xảy ra lúc nào"*, không nói *"tôi ghi nó lúc nào"*.

Chuyện này không phải sự gọn gàng: `AUD-09` đếm theo **dòng**, nên một sự kiện ghi hai lần là một con
số sai gửi lên Ban lãnh đạo.

### `trace_id` — món nợ từ P5.6, đóng bằng `AsyncLocalStorage`

P5.6 ghi: *"`trace_id` có cột nhưng không ai điền"*. Vấn đề thật là IP và `trace_id` chỉ có ở tầng
HTTP, còn nơi phát sự kiện nằm sâu trong service. Truyền tay xuống từng lời gọi nghĩa là đổi chữ ký
của gần như mọi hàm — và **bỏ sót một chỗ thì dòng nhật ký đó thiếu vết, mà thiếu vết là thứ không ai
phát hiện ra cho tới lúc cần điều tra**.

`AsyncLocalStorage` giữ ngữ cảnh đúng theo từng request kể cả khi nhiều request chạy xen kẽ — khác
hẳn một biến toàn cục, vốn sẽ trộn IP của người này vào nhật ký của người kia dưới tải.

Middleware đặt ở **trước mọi guard**: một lời gọi bị guard chặn cũng cần `trace_id`. Và `trace_id`
**nhận từ đầu vào** nếu header có sẵn, chỉ sinh mới khi chưa có — sinh mới ở mỗi chặng thì mỗi chặng
một mã và không nối lại được. `INT-11` chạy một request phát ba sự kiện rồi dựng lại cả chuỗi bằng
một truy vấn.

Header do client gửi nên chỉ nhận mã đúng dạng `[A-Za-z0-9_-]{8,64}`: chuỗi tuỳ ý sẽ lọt thẳng vào
truy vấn tra log lẫn vào bản ghi nhật ký.

### Đảo lại một quyết định của chính mình, trong cùng một chặng

Bộ lọc ghi "nỗ lực vượt quyền" ban đầu ghi kiểu **bắn đi rồi quên** (`void`), với lý lẽ "ghi là việc
phụ, không được làm chậm phản hồi". Lý lẽ đó sai ở đây:

- Tiến trình tắt đúng lúc đó thì bản ghi mất hẳn, và **mất trong im lặng**.
- Một bản ghi an ninh *thường* được ghi thì không phải bản ghi an ninh.

Nó cũng làm test đỏ ngẫu nhiên — nhưng đó chỉ là **triệu chứng**, không phải lý do sửa. Cái giá của
việc chờ: một câu `INSERT`, cỡ một mili-giây, trên đúng nhánh mà người dùng vừa bị từ chối. Ghi hỏng
thì vẫn trả 403: không ghi được nhật ký là lỗi vận hành, không phải lý do cho qua thao tác vượt quyền.

> Đáng ghi lại vì cách tìm ra: bản đầu **chạy đúng** ở lần chạy đơn lẻ và chỉ đỏ một trong ba lần
> chạy toàn bộ. Nới thời gian chờ lên 30 giây làm nó xanh thêm được một lượt rồi lại đỏ. Chỗ sai
> không nằm ở con số nào cả.

### `audit` nghe TẤT CẢ, và không có đường ghi nào

Ba queue kia lọc theo nhu cầu; queue nhật ký bind `#`. Bất kỳ sự kiện nào không tới được đều là một
khoảng trống trong vết, và khoảng trống đó chỉ lộ ra lúc cần điều tra — tức là quá muộn.

API chỉ có `GET`. `AUD-05` quét bảng định tuyến Express và đỏ ngay nếu một route ghi xuất hiện — cùng
kiểu test giữ kiến trúc như `DOC-28`.

Role `csbh_aud` là role duy nhất chỉ có `SELECT` và `INSERT`; `UPDATE`/`DELETE` bị thu hồi từ
migration 0002 và trigger chặn thêm một lớp. Ngay cả khi service này có lỗ hổng thì nó cũng không sửa
được một dòng nhật ký nào.

### `AUD-10` — báo cáo vẫn đúng khi nhật ký chết

Tắt hẳn audit rồi chạy ba bước duyệt: mọi cột mốc thời gian trên `pol.policy` vẫn đủ. Đó là toàn bộ ý
nghĩa của quyết định §10 *"mốc thời gian là cột riêng trên hồ sơ"* — nhật ký chỉ dùng truy vết, sập
nó không làm sai một báo cáo nào. Bật lại thì vết được ghi bù từ queue bền (`AUD-11`).

### Còn nợ của chặng này

`AUD-08` mới ghi ở `policy`; các service khác chưa có bộ lọc tương tự — sẽ gom về một chỗ ở gateway
(P7c) thay vì nhân bản filter ra sáu service. Nửa "báo cáo tiến độ và SLA" của `AUD-10` chờ
`reporting` ở P7b.

### Commit

`P7a: audit — nhat ky chi ghi them, trace_id xuyen suot`

---

## P7b — `reporting`: 14 tiêu chí lọc, ba báo cáo, xuất Excel chạy nền

### Đã dựng

- Migration `0016_reporting.sql` — `rpt.policy_row` (read-model phẳng, một dòng một hồ sơ),
  `rpt.export_job`, và một nhánh mới trong `sys.run_retention` để dọn file kết xuất hết hạn.
- Service `reporting`: `sync.service.ts` (dựng lại dòng từ nguồn), `filter.ts` (14 tiêu chí),
  `reports.service.ts` (danh sách + ba báo cáo), `filter-store.ts` (bộ lọc theo phiên),
  `exports/` (dựng file `.xlsx` chạy nền), `normalize.ts` (bỏ dấu tiếng Việt).
- Queue `rpt.events` bind `policy.#` và `customer.#`, khai báo ở cả hai relay.
- Bốn API nội bộ mở rộng: `customer` trả thêm ba mã phân loại, `catalog` trả nhóm theo lô sản phẩm,
  `identity` trả tên người dùng theo lô, `policy` trả thêm bảy cột.
- `tests/http/reporting.test.ts` — 40 test.

### Một lỗ hổng có sẵn, lộ ra vì read-model cần dữ liệu

Lập hồ sơ và lập khách hàng **không phát sự kiện nào**. Trước P7b không ai để ý, vì cả bốn bên nhận
đều chỉ quan tâm những gì xảy ra *sau* khi hồ sơ được gửi duyệt.

Hậu quả rộng hơn báo cáo: `audit` bind `#` nhưng không có gì để nghe, nên **nhật ký không có một dòng
nào cho thao tác mở đầu mọi hồ sơ**. Mục 10 hở đúng ở chỗ đó, và hở theo kiểu chỉ phát hiện được khi
có người đi tìm "ai đã lập hồ sơ này" và không tìm thấy.

Thêm `policy.created`, `policy.updated`, `policy.deleted`, `customer.created` — cùng transaction với
việc ghi nghiệp vụ, như mọi sự kiện khác. `customers.create` phải chuyển từ một câu `INSERT` sang
`tx()` để làm được điều đó.

`policy.deleted` là chỗ dễ bỏ sót nhất: xoá hồ sơ mà không báo thì dòng read-model nằm lại vĩnh viễn,
và **không có sự kiện nào về sau để sửa** — hồ sơ đã không còn tồn tại để phát sự kiện nữa.

### Sự kiện là TÍN HIỆU, không phải dữ liệu

`sync.service.ts` nhận sự kiện rồi **đọc lại nguồn** qua bốn API nội bộ thay vì dùng nội dung sự kiện.
Đắt hơn — bốn vòng mạng cho mỗi thay đổi — nhưng đổi lại hai thứ mà cách kia không có:

- **Giao lại không hại gì.** Outbox chỉ bảo đảm *ít nhất một lần*. Mỗi lần đồng bộ ghi lại toàn bộ
  dòng, không cộng dồn, nên chạy hai lần cho ra đúng một kết quả.
- **Sai thứ tự không hại gì.** Thư "đã ký" tới sau thư "chờ kế toán" vẫn cho trạng thái đúng.

Cách còn lại — nhét sẵn mọi trường vào sự kiện — buộc bốn service phải biết read-model cần gì, và
thêm một tiêu chí lọc là sửa cả bốn cộng một lần nạp lại dữ liệu cũ.

Vẫn cần một chốt: `src_row_version`. Sự kiện giao lại lần hai có thể đọc nguồn ở thời điểm *sớm hơn*
lần đồng bộ đang có; `ON CONFLICT ... WHERE policy_row.src_row_version <= EXCLUDED.src_row_version`
chặn việc hồ sơ **lùi trạng thái** trong báo cáo.

### Chữ `đ` — chỗ `unaccent` của Postgres làm sai trong im lặng

`RPT-05` đòi lọc địa chỉ không phân biệt có dấu / không dấu. Lối đi hiển nhiên là extension
`unaccent`, và nó **sai**: `đ` (U+0111) không phải `d` cộng một dấu phụ mà là một ký tự Unicode độc
lập, `NFD` không phân rã được.

Người gõ `da nang` không tìm ra `Đà Nẵng`. Và lỗi này không kêu: mọi tỉnh thành khác vẫn tìm được
bình thường, nên không ai nghi ngờ gì cho tới lúc có người khẳng định chắc chắn là hồ sơ đó tồn tại.

Chuẩn hoá làm tay trong `normalize.ts`, và làm ở **đúng một chỗ** — cột `*_norm` lúc đồng bộ và từ
khoá lúc truy vấn đi qua cùng một hàm. Hai bên chuẩn hoá theo hai kiểu là kiểu hỏng tệ nhất: tìm được
vài chuỗi, không tìm được vài chuỗi khác, không có thông báo lỗi nào.

### `OFFSET` không dùng được cho danh sách sắp theo thời gian giảm dần

`RPT-13` hỏi đúng chỗ đau. Hồ sơ mới chèn vào **đầu** danh sách, nên một hồ sơ được lập trong lúc
người dùng bấm sang trang 2 đẩy toàn bộ xuống một dòng: dòng thứ 50 của trang 1 hiện lại ở đầu trang
2, **và một dòng khác biến mất khỏi cả hai trang**.

Không có thông báo lỗi. Người dùng chỉ thấy một hồ sơ lặp, và không có cách nào biết mình đã bỏ sót
gì. Phân trang bằng con trỏ `(created_at, policy_id)` neo vào **dữ liệu** chứ không vào vị trí; thành
phần thứ hai để hai hồ sơ lập trong cùng một mili-giây vẫn có thứ tự tất định.

Đây là chỗ duy nhất trong hệ không dùng `pageOf`/`paged` dùng chung — có chủ ý, và lý do ghi ngay tại
hàm `list()`.

### Phạm vi áp TRƯỚC bộ lọc: `tdv_user_id` mang hai nghĩa

`RPT-09`. Cùng một cột xuất hiện ở hai chỗ với hai nghĩa khác nhau, và trộn lẫn chúng là lỗ hổng:

- `scopeUserIds` do identity trả về — người dùng không đụng vào được, **luôn là điều kiện đầu tiên**.
- `tdvUserId` là tiêu chí lọc số 10 do người dùng gõ — chỉ **thu hẹp** trong phạm vi đã có.

Cách dựng câu lệnh chọn theo hướng đó: điều kiện phạm vi nối cứng trong `build()` chứ không nằm trong
danh sách tiêu chí, nên **không có đường nào để một tiêu chí quên nó**. Test kiểm cả hướng ngược:
tdv01 gõ thẳng id của tdv03 thì kết quả rỗng, không phải mở rộng.

### Ba chi tiết của file Excel, cả ba không lộ ra khi mở bằng mắt

1. **Tiền phải là số.** Ghi `"87.000 đ"` thì file mở ra đẹp nhưng không cộng được, không lọc được
   ">1 triệu", không vẽ biểu đồ — hỏng đúng thứ người ta xuất Excel để làm. Ghi số rồi đặt `numFmt`.
2. **Ngày phải là `Date`.** Chuỗi `"07/08/2026"` sắp theo thứ tự chữ cái, nên tháng 12 nằm trước
   tháng 2.
3. **Thứ tự cột là hợp đồng.** Người dùng dựng công thức tham chiếu cột E; chèn một cột vào giữa ở
   bản sau là làm hỏng file của họ trong im lặng. `COLUMNS` chỉ được thêm vào cuối, và test so cả
   hàng tiêu đề.

### Xuất file chạy nền vì Node chỉ có một vòng lặp sự kiện

Dựng 5000 dòng mất vài giây **CPU**, không phải chờ I/O. Xuất đồng bộ làm đứng mọi request khác của
cùng tiến trình, kể cả `/healthz`: một người bấm xuất file thì cả phòng thấy hệ thống treo.

Bấm xuất tạo một việc rồi trả `202` ngay. Test kiểm cả ba vế: request trả về dưới 2 giây, `/healthz`
vẫn phục vụ được trong lúc file đang dựng, và cả việc xong dưới 10 giây.

File nằm trong `bytea` chứ không trên MinIO, có chủ ý: kho đối tượng do `document` sở hữu và mọi
đường ghi vào đó đều kèm luật nghiệp vụ về hồ sơ. Một file kết xuất tạm sống vài giờ không thuộc luật
đó. Cái giá là phải có hạn dọn — `expires_at` cộng một nhánh trong `sys.run_retention`, xoá **nội
dung** nhưng giữ **bản ghi việc**: người dùng vẫn tra được "hôm qua tôi xuất file gì".

File chỉ **người yêu cầu** tải được, kể cả cấp trên. Không phải trùng với kiểm phạm vi: nội dung đã
chốt theo phạm vi của người bấm, cho người khác tải là cho họ đọc một tập dữ liệu dựng theo quyền của
người kia — kiểu leo thang khó thấy nhất, vì mọi API còn lại vẫn kiểm phạm vi đầy đủ.

### Một chỗ mơ hồ trong yêu cầu — đã hỏi và đã CHỐT (08/08/2026)

"Thời gian duyệt" ở muc 9.2 đọc được theo hai nghĩa: lúc Trưởng bộ phận ký ở B4, hay lúc hồ sơ có
hiệu lực sau B10. Tài liệu dùng chữ "duyệt" cho B4 (`Chờ TBP duyệt`, `Quá hạn duyệt`), nhưng một bộ
lọc báo cáo hỏi "duyệt trong tháng 7" thì gần như chắc chắn muốn nói *có hiệu lực trong tháng 7* —
hồ sơ được ký rồi bị trả lại thì chưa hề duyệt xong.

**CHỐT: là thời điểm hồ sơ CÓ HIỆU LỰC sau B10**, tức cột `effective_from` — đúng như đã dựng, nên
không phải sửa dòng mã nào. Cột `tbp_signed_at` vẫn giữ trong read-model; nó không còn là đường lùi
mà là dữ liệu cho báo cáo về nhánh duyệt của Trưởng bộ phận.

Hệ quả cần nhớ khi đọc báo cáo: **hồ sơ chưa qua B10 thì `approved_at` rỗng**, nên mọi bộ lọc theo
thời gian duyệt đều loại hết hồ sơ đang chờ. Đó là đúng nghĩa, không phải thiếu dữ liệu.

Ghi ở đây chứ không ghi vào `0016_reporting.sql`: `migrate.sh` so md5 của mỗi file đã áp dụng và
**dừng hẳn khi nội dung đổi**, kể cả đổi mỗi dòng chú thích. Chốt chặn đó đúng — nó ngăn việc sửa
lược đồ đã chạy — nên quyết định nghiệp vụ phải nằm ở nhật ký, không nằm trong migration.

### Hai lỗi có sẵn, cả hai do chạy lại toàn bộ test mới lộ ra

Không lỗi nào thuộc `reporting`. Cả hai đã nằm sẵn trong mã từ P4, và chỉ đỏ khi bộ test đầy đủ chạy
lại sau khi P7b làm xê dịch thứ tự dòng và số lượng sự kiện.

**1. `ORDER BY name` không có khoá phá hoà** (`cus.customer`, `OPS-07`). Khi khoá sắp xếp bị hoà,
Postgres được phép trả về theo thứ tự bất kỳ — và nó thực sự đổi thứ tự giữa hai lời gọi
`LIMIT/OFFSET` liên tiếp. Trang 2 lặp lại một dòng của trang 1 **và bỏ mất một dòng khác**. Không có
thông báo lỗi; người dùng chỉ thấy một khách hàng hiện hai lần.

Trùng tên là chuyện thường ở nghiệp vụ này (chuỗi nhà thuốc cùng thương hiệu), nên đây không phải
tình huống hiếm. Đã thêm `id` vào ba chỗ phân trang khác cùng loại: danh sách hồ sơ, trang chủ, và
hai màn hình thư của `notification`. Đúng cùng một họ lỗi với `RPT-13`, chỉ khác là ở đó nó là yêu
cầu ghi sẵn còn ở đây thì không ai nghĩ tới.

**2. Test tự tính ngày theo UTC.** `RPT-01` tiêu chí 2 xanh ở lượt chạy đầu, đỏ ở lượt sau. Nguyên
nhân không phải cuộc đua: `toISOString()` trả **ngày UTC**, còn bộ lọc so `approved_at >= $::date`
với `::date` được Postgres diễn giải theo múi giờ phiên — ICT. Bảy tiếng mỗi đêm (17:00–24:00 UTC)
hai ngày đó lệch nhau một đơn vị, và lượt chạy thứ hai rơi vào đúng khoảng đó.

Sản phẩm đúng, test sai — nhưng sai theo cách đáng ghi: đây chính là bẫy `OPS-09` đã lường trước ở
mức thiết kế, và nó vẫn lọt vào chỗ không ai ngờ. Test giờ hỏi thẳng CSDL
(`AT TIME ZONE 'Asia/Ho_Chi_Minh'`) thay vì tính bằng đồng hồ của Node. Một test xanh nhờ chạy đúng
giờ thì không phải test.

### Còn nợ của chặng này

- Đồng bộ một hồ sơ tốn bốn vòng mạng; một hồ sơ đổi bốn lần trong một giây bị đọc lại bốn lần. Ở quy
  mô 50 người dùng thì rẻ hơn việc phải giữ thứ tự và tính lũy kế, nhưng không co giãn được.
- Việc xuất file vẫn chưa qua hàng đợi thật — cùng món nợ `DOC-20`. `SKIP LOCKED` đủ để hai bản
  service không giành nhau một việc; cái còn thiếu là **giới hạn số việc chạy song song**.
- Chưa có lệnh nạp lại toàn bộ read-model từ đầu. Cần khi đổi lược đồ `rpt.policy_row`.
- `PERF-07` (quét SLA trên 20.000 hồ sơ dưới 60 giây) vẫn chưa đo.

### Commit

`P7b: reporting — 14 tieu chi loc, ba bao cao, xuat Excel chay nen`

---

## P7c — `gateway` + Caddy: biên mạng, và gom việc ghi vượt quyền về một chỗ

### Đã dựng

- Service `gateway`: chuyển tiếp theo **danh sách trắng** tiền tố, giới hạn tần suất bằng Redis,
  CORS theo danh sách trắng origin, nối `trace_id`, gắn `X-App-Version`, và `/readyz` gom trạng thái
  cả hệ.
- `deploy/caddy/Caddyfile`: TLS, phục vụ SPA, và bộ header an toàn.
- `deploy/RPO-RTO.md`: cam kết phục hồi, trả món nợ ghi ở P5.6.
- `tests/http/security.test.ts` — 32 test cho `SEC-01, 03, 04, 07, 09, 10, 12, 14, 15` và `AUD-08`.
- Gỡ `DeniedAuditFilter` khỏi `policy`.

### Vì sao giới hạn tần suất KHÔNG nằm ở Caddy

Lý do hiển nhiên là Caddy 2 không có sẵn tính năng đó — phải dựng lại ảnh bằng `xcaddy`. Nhưng lý do
thật nằm ở chỗ khác: **bộ đếm ở đường xuất file phải theo NGƯỜI**, mà Caddy không đọc được JWT. Nó
chỉ thấy địa chỉ IP, và cả phòng kinh doanh ngồi sau một địa chỉ NAT duy nhất — một người bấm xuất
file mười lần sẽ chặn cả phòng.

Nên hai đường đếm theo hai khoá khác nhau, và sự khác nhau đó là nội dung của quyết định:

- **Đăng nhập đếm theo IP.** Chưa có danh tính nào để đếm, và danh tính chính là thứ đang bị dò.
  Điều này cũng đóng đúng lỗ hổng ghi ở P5.6: khoá tài khoản sau 5 lần sai (`AUTH-09`) chỉ thấy được
  kiểu dò **một** tài khoản; rải một lần trên mỗi tài khoản thì không lớp nào chặn. Đếm theo IP thấy.
- **Xuất file đếm theo người dùng**, vì lúc đó đã xác thực xong.

### Ghi nỗ lực vượt quyền: một chỗ, không phải bảy

`AUD-08` ở P7a là một `ExceptionFilter` trong `policy`. Nhân bản nó ra sáu service còn lại là cách
chắc chắn nhất để có ngày một service quên mất — và **cái thiếu đó không ai phát hiện được**, vì
nhật ký vẫn đầy dòng, chỉ là không có dòng nào của đúng service bị quên.

Gateway thấy 403 của mọi service nên nó là chỗ đúng. Điều kiện để đúng: **không có đường nào đi vòng
qua gateway từ bên ngoài**, và đó chính là thứ `SEC-10` giữ — chỉ Caddy mở cổng, mà Caddy chỉ trỏ
vào gateway.

Phải **gỡ** filter cũ chứ không giữ cả hai. Hai bộ ghi cho một lần bị từ chối là hai dòng nhật ký,
mà `AUD-09` đếm theo **dòng** — con số sai gửi lên Ban lãnh đạo. Có một test riêng khẳng định đúng
một dòng.

Phát thẳng lên bus, không qua outbox: outbox tồn tại để việc ghi nghiệp vụ và việc phát sự kiện cùng
thành công hoặc cùng thất bại, mà ở đây **không có việc ghi nghiệp vụ nào** — thao tác vừa bị từ
chối. Vẫn **chờ** phát xong rồi mới trả 403, giữ nguyên lý lẽ đã chốt ở P7a.

### `bodyParser: false` — dòng dễ mất nhất trong cả chặng

Trình phân tích thân request của Nest đọc cạn luồng dữ liệu **trước** khi tới middleware chuyển tiếp.
Bật nó lên thì mọi request `POST` đi tiếp với thân **rỗng**, và triệu chứng là lỗi "thiếu trường" ở
service phía sau — trông y hệt lỗi kiểm dữ liệu vào, không ai nghĩ tới gateway. Có một test riêng
canh đúng dòng này, ở cả `main.ts` lẫn `testing.ts`.

### So khớp theo ĐOẠN đường dẫn, không theo chuỗi con

`path.startsWith('/auth')` cũng khớp `/authorize-me` và sẽ chuyển tiếp một đường dẫn lạ sang
identity. Danh sách trắng chỉ có nghĩa khi phép so khớp cũng chặt: `path === prefix` hoặc
`path.startsWith(prefix + '/')`.

Cùng lý do đó, `internal/**` **không có mặt** trong bảng định tuyến. Token dịch vụ đã chặn ở tầng
service (`AUTH-21`), nhưng đó là lớp thứ hai; lớp thứ nhất là gateway không có đường nào dẫn tới.

### `SEC-04` — hoá ra không cần chống, nhưng cần chứng minh

Yêu cầu nói "chặn cả công thức bắt đầu bằng `=`" khi xuất Excel. Cách chống quen thuộc là chèn dấu
nháy đơn vào đầu ô. Trước khi làm, tôi dựng thử một file và **đọc XML thô** bên trong:

```
<si><t>=HYPERLINK(&quot;http://evil.test&quot;,&quot;x&quot;)</t></si>
```

Ô mang kiểu `t="s"` — chuỗi dùng chung — và **không có phần tử `<f>` nào**. Định dạng `.xlsx` phân
biệt tường minh giữa ô văn bản và ô công thức, nên một chuỗi bắt đầu bằng `=` vẫn là văn bản. Rủi ro
chèn công thức là chuyện của **CSV**, nơi không có kiểu dữ liệu; hệ này không xuất CSV.

Nên **không** thêm dấu nháy đơn: nó sẽ bóp méo tên khách hàng hoặc địa chỉ thật bắt đầu bằng dấu trừ
hay dấu cộng, để đổi lấy việc chống một rủi ro mà định dạng đã chống sẵn. Thay vào đó test khẳng
định đúng bất biến cần giữ — không ô nào là công thức — và khẳng định **trên XML thô**, vì đọc lại
bằng chính `exceljs` chỉ chứng minh nó tự hiểu được file của nó.

### `/readyz` — biến sự cố im lặng thành sự cố ồn ào

Bài học `archive_command` ở P5.6: thứ giết hệ thống không phải sự cố ồn ào mà là sự cố **im lặng**.
Một service chết trong khi chín service kia vẫn xanh thì không ai biết cho tới lúc có người bấm đúng
chức năng đó.

`/readyz` hỏi song song `/healthz` của mọi service và trả **503** khi có bất kỳ service nào không
trả lời. 503 chứ không phải 200-kèm-cảnh-báo-trong-thân: công cụ giám sát đọc **mã trạng thái**, và
một sự cố chỉ nằm trong thân phản hồi là một sự cố không ai thấy.

Tách bạch với `/healthz`, và khác biệt này là quyết định vận hành: `/healthz` nói "tiến trình gateway
còn sống" và Docker dùng nó để quyết định khởi động lại; `/readyz` nói "cả hệ phục vụ được". **Không**
dùng `/readyz` làm healthcheck của Docker — một service phụ thuộc chết sẽ làm gateway bị khởi động
lại liên tục, mà khởi động lại gateway thì không chữa được service kia.

### Ba lỗi của chính test, mỗi lỗi chỉ ra một điều thật

1. **Test tự khoá tài khoản mình cần dùng.** Bài dò mật khẩu gõ sai 20 lần vào `tdv01` — và
   `AUTH-09` khoá tài khoản sau 5 lần sai. Các test sau nhận 401 vì lý do hoàn toàn khác, rồi lượt
   chạy kế tiếp chết ngay ở `beforeAll` vì khoá còn nằm lại trong CSDL. Sửa: dò vào một tên **không
   tồn tại** (bộ đếm theo IP vẫn chạy như thường), và gỡ khoá **trước** khi đăng nhập chứ không chỉ
   ở `beforeEach`.
2. **So một con số toàn cục với một con số đã lọc.** Đếm tổng số dòng `ACCESS_DENIED` rồi chờ
   "nhiều hơn một" — trong khi CSDL dùng chung còn giữ 17 dòng của các lượt chạy trước. Sửa: chờ
   dòng của **đúng đường dẫn** vừa sinh ra.
3. **Quên bật service đang được kiểm.** `security.denied` chỉ thành dòng nhật ký khi có người tiêu
   thụ, mà file test không dựng `audit`. Thông báo lỗi lại trông như gateway không phát gì.

### Một sự cố hạ tầng test, và một quyết định tôi đã đảo lại

Ba lượt chạy toàn bộ liên tiếp làm lộ một lỗi không thuộc P7c: `DOC-28` treo cho tới lúc hết giờ,
kèm một **ngoại lệ không ai bắt** từ trong thư viện `minio`:

```
Error: Entity expansion limit exceeded: 1002 > 1000
  ❯ Transform._flush  minio/dist/esm/transformers.js:55
```

Bucket test dùng chung tích luỹ qua từng lượt chạy và đã vượt một nghìn object. Trình phân tích XML
trong `minio` 8.0.1 từ chối một trang kết quả lớn hơn thế — và nó ném từ bên trong `Transform._flush`,
nên `try/catch` quanh `for await` **không hề nhận được lỗi**: vòng lặp chỉ treo. Tôi đã viết bản vá
tự chia nhỏ tiền tố khi gặp lỗi, chạy thử, và nó không chạy vì đúng lý do đó. Ghi lại vì bản vá ấy
trông rất hợp lý trên giấy.

Sau đó tôi thử cho **mỗi lượt chạy một bucket riêng**. Bản vá đó tệ hơn hẳn và tôi đã gỡ bỏ: Postgres
sống qua các lượt chạy còn bucket thì không, nên mọi dòng `doc.contract_template` trỏ vào object của
bucket cũ — 14 test hợp đồng đỏ với 409 *"chưa có mẫu nào"*. **Hai kho dữ liệu phải được đặt lại
cùng nhau hoặc không cái nào cả.**

Cách sửa cuối cùng đơn giản hơn cả hai: `DOC-28` quét theo **từng mục đích** thay vì quét cả bucket
bằng tiền tố rỗng. Vừa bị chặn dưới ngưỡng, vừa nói đúng điều cần nói hơn — bất biến là "hợp đồng
không mang mục đích nào trong danh sách", vì nó không được lưu. Kèm một khẳng định rằng danh sách
mục đích trong test **phủ hết** enum trong CSDL, nếu không thì thêm một mục đích mới là quét sót
đúng chỗ hợp đồng có thể lọt vào.

### Một lỗi sản phẩm thật, tìm ra nhờ sự cố trên

Khi bucket bị thay, `ensureDefault` vẫn thoát sớm vì **có dòng mẫu trong CSDL** — mà file thì không
còn. Kết quả: mọi lần xuất hợp đồng trả 409 *"chưa có mẫu nào"*, trong khi màn hình quản trị hiển
thị rõ ràng là có.

Đây không phải chuyện riêng của test. CSDL và kho đối tượng ghi riêng nên chúng lệch nhau được:
phục hồi CSDL từ bản sao lưu cũ hơn MinIO, dựng lại MinIO, hoặc xoá nhầm một object. Đã sửa để
**tự chữa, nhưng chỉ cho mẫu mặc định** — nó do hệ thống sinh ra và dựng lại được y hệt. Mẫu do Sale
Admin tải lên thì không: thay thầm nội dung hợp đồng bằng một mẫu khác tệ hơn nhiều so với báo lỗi.

### Test giả định "cả bảng vừa một trang"

`CAT-07` đỏ ở lượt chạy thứ ba: nó lấy `/catalog/products?limit=200` rồi khẳng định sản phẩm vừa
tạo có trong đó. Danh mục đã vượt 200 sản phẩm — các test của P7b tạo một sản phẩm cho mỗi hồ sơ —
và danh sách sắp theo mã, nên bản mới không nhất thiết nằm ở trang đầu. Test cũ xanh chỉ vì bảng
còn nhỏ.

Cùng một họ với lỗi `ORDER BY name` ở P7b: **giả định về kích thước dữ liệu, không phải giả định về
hành vi**. Loại này luôn xanh ở ngày đầu và luôn hỏng về sau, nên nó đáng sửa ở tầng test chứ không
đáng nới ngưỡng. Đã sửa để duyệt hết các trang.

### Còn nợ của chặng này

- Lịch tự động cho sao lưu và dọn dẹp — chuyển sang P8 cùng tài liệu triển khai, vì nó là việc của
  máy chủ triển khai chứ không của mã nguồn.
- Chưa có migration lùi.
- `compose.yml` chưa khai báo mười service Node và Caddy: cần một `Dockerfile` production, thuộc P8.
  Test `SEC-10` đã canh sẵn bất biến "chỉ caddy publish cổng" nên lúc thêm vào sẽ đỏ ngay nếu sai.
- Đẩy bản sao lưu ra khỏi VM, và cảnh báo tự động trên `pg_stat_archiver` — ghi trong `RPO-RTO.md`.

### Commit

`P7c: gateway + Caddy — bien mang, gioi han tan suat, gom AUD-08 ve mot cho`

---

## P7d — `web`: giao diện React, và một lần đi chệch bản thiết kế

### Đã dựng

- `apps/web` — Vite + React 18, tự viết bộ định tuyến và toàn bộ thành phần giao diện.
- Bảng token màu (`tokens.css`) là nguồn duy nhất của mọi màu, khoảng cách, cỡ chữ.
- Bảng quyền (`can.ts`) là nguồn duy nhất của "ai thấy nút gì".
- Chín màn hình: đăng nhập, đổi mật khẩu bắt buộc, việc của tôi, hồ sơ + bộ lọc 14 tiêu chí,
  chi tiết hồ sơ, khách hàng + chi tiết, báo cáo, danh mục, nhật ký.
- `tests/web/` — 47 test.

### Bỏ Ant Design — đi chệch bản thiết kế, có chủ ý

Bản thiết kế chọn **Ant Design 5**. Tôi đã không dùng, và lý do không phải sở thích:

1. **`FE-38` đặt trần 250KB nén cho gói dùng chung.** Riêng Ant Design đã chiếm phần lớn con số
   đó trước khi viết dòng mã nghiệp vụ đầu tiên.
2. **`FE-03` không dùng được component bảng nào có sẵn.** Yêu cầu là dưới 640px bảng thành thẻ mà
   **không cột nào biến mất** — thư viện nào cũng giải bài toán này bằng cách ẩn bớt cột. Bốn ô
   CPBH quyết định giá thu về, giá thu về quyết định tỷ lệ chiết khấu; ẩn đi là bắt người duyệt ký
   vào một con số họ không kiểm được. Bảng này phải viết tay dù có dùng thư viện hay không.
3. **`FE-19` cấm mọi mã màu nằm ngoài bảng token**, mà mọi thư viện component đều mang bảng màu
   riêng của nó.

Kết quả đo được: **56,9KB JS + 2,7KB CSS sau khi nén** — bằng khoảng một phần tư ngân sách. Test
`FE-38` dựng thật rồi đo, và có thêm một khẳng định rằng `dependencies` chỉ gồm `react` và
`react-dom`, để lần sau ai thêm thư viện nặng sẽ thấy đỏ ngay tại đây thay vì thấy ở máy người dùng
dùng mạng 4G.

Cùng lý do đó, `react-router` cũng bị thay bằng ~60 dòng tự viết: ứng dụng có chín đường dẫn, không
route lồng nhau, không tải dữ liệu ở tầng route.

### Ba cách bố trí, MỘT cây DOM

`FE-03`, `FE-04`, `FE-05` là ba bố cục khác nhau, không phải ba mức thu nhỏ của một bố cục. Cách làm
hiển nhiên là đọc `window.innerWidth` rồi dựng cây tương ứng — và nó **sai ở đúng `FE-06`**: xoay
ngang điện thoại giữa lúc đang gõ CPBH sẽ tháo và dựng lại ô nhập, mất nội dung và mất tiêu điểm.

Nên cả ba dùng chung một cây DOM và chỉ khác CSS. Bảng và danh sách thẻ đều được render; media query
quyết định cái nào hiện. Tốn thêm một ít DOM, đổi lấy việc xoay máy không làm mất gì.

### `FE-27` — chỗ dễ sai nhất trong toàn bộ giao diện

Tỷ lệ chiết khấu phải **khớp tuyệt đối** con số API trả về. Viết `Number(v).toFixed(2)` là phản xạ
tự nhiên và nó sai: `toFixed` làm tròn theo dấu phẩy động, nên `12.345` ra `12,35` ở màn hình trong
khi máy chủ đã chốt `12,34` — và chính con số của máy chủ mới là con số đem so ngưỡng. Giao diện
**không tính toán**; nó chỉ đổi dấu chấm thành dấu phẩy.

Cùng họ với nó là tiền: API trả `bigint` dạng chuỗi vì tiền của hệ này vượt `2^53`. Chèn dấu phân
cách **trên chuỗi**, không qua `Number`. Có test lấy `9007199254740993` làm ví dụ.

### Một lỗi thật, do test bắt được

Test "năm request cùng nhận 401 chỉ gọi làm mới MỘT lần" đỏ, và không phải vì test sai. Tôi đặt lại
biến gộp lời gọi làm mới bằng `setTimeout(…, 0)`; nếu lượt sau bắt đầu trước khi bộ đếm nổ thì nó
dùng **kết quả của lượt trước** — token cũ, và cả phiên bị đá ra. Sửa bằng `.finally()`: mọi bên
đang chờ đã cầm sẵn tham chiếu tới lời hứa nên vẫn đọc được kết quả, còn biến được xoá ngay khi lời
hứa kết thúc.

Không gộp lời gọi làm mới thì năm request xoay vòng token song song, bốn cái sau dùng token đã bị
thu hồi. Đây là loại lỗi chỉ xuất hiện khi một màn hình tải nhiều thứ cùng lúc — tức là gần như
không bao giờ thấy khi thử tay.

### Phiên hết hạn KHÔNG dỡ màn hình

`FE-33` nói đăng nhập xong phải quay đúng màn hình cũ với dữ liệu còn nguyên. Cách hay gặp là lưu
bản nháp rồi khôi phục sau khi đăng nhập — nhiều việc và dễ sót trường.

Ở đây lớp phủ đăng nhập lại nằm **đè lên** màn hình đang mở thay vì thay thế nó. State React bên
dưới không hề bị tháo, nên không có gì phải khôi phục. Bản nháp trong `sessionStorage` vẫn có, nhưng
để dùng cho nhánh buộc tải lại khi đổi phiên bản MAJOR.

### Bốn test quét MÃ NGUỒN thay vì quét màn hình

`FE-19` (màu ngoài bảng token), `FE-21` (không có chức năng in phía máy người dùng), `FE-08` (vùng
chạm 44px), `FE-11` (không đặt cỡ chữ bằng px) đều kiểm bằng cách đọc mã nguồn. Lý do: cái sai là
**sự có mặt của một dòng mã**, ở một màn hình mà người kiểm có thể không nghĩ tới. Mở từng màn hình
để tìm một dòng `@media print` là việc không bao giờ làm đủ.

Thêm một test cùng loại không nằm trong danh mục: **không màn hình nào được so sánh vai trò bằng
chuỗi viết thẳng**. Không có nó thì `FE-23` quét bảng quyền và báo xanh trong khi một màn hình nào
đó vẫn có `role === 'TBP'` rải bên trong.

### Còn nợ của chặng này — phần lớn cần TRÌNH DUYỆT THẬT

Ảnh nền là Alpine, mà Playwright cần glibc; chạy được thì phải thêm một ảnh riêng
(`mcr.microsoft.com/playwright`). Chưa làm, nên những mục sau chưa có test tự động:

- `FE-01`, `FE-02`, `FE-04`, `FE-05` phần hình học — jsdom không áp dụng media query nên các test
  hiện tại chỉ khẳng định **cả ba bố cục đều có mặt và không dữ liệu nào bị bỏ**, không đo được bề
  ngang thật.
- `FE-06` xoay máy, `FE-07` bàn phím ảo, `FE-34` quét axe-core, `FE-35` đi trọn luồng bằng bàn phím,
  `FE-37` ảnh chụp đối chiếu, `FE-38` phần thời gian tải trên 4G mô phỏng.
- `FE-16`, `FE-20`, `FE-22` thuộc đường sinh PDF ở máy chủ, đã có ở P6b/P6c.
- Màn hình lập và sửa hồ sơ (thêm/bớt dòng sản phẩm), quản trị danh mục, ánh xạ trường mẫu hợp đồng
  và quản trị người dùng mới ở mức đọc; phần ghi chưa dựng.

### Commit

`P7d: web — giao dien React, khong dung thu vien component`

---

## P8 — chạy được thật: ảnh production, chồng demo, ba tài liệu bàn giao

### Đã dựng

- `docker/Dockerfile` — một ảnh cho cả mười service, chọn bằng `ARG SERVICE`.
- `deploy/compose.demo.yml` — mười service + Caddy, chỉ Caddy mở cổng.
- `make demo` — một lệnh từ máy trắng tới màn hình đăng nhập.
- `docs/01-CHAY-TEST.md`, `docs/02-CHAY-DEMO.md`, `docs/03-HUONG-DAN-SU-DUNG.md`.

### Bốn lỗi chỉ lộ ra khi CHẠY THẬT

493 test xanh không nói được gì về việc hệ thống có khởi động nổi hay không. Mỗi lỗi dưới đây đều
nằm ngoài tầm với của bộ test, vì test dựng service **trong tiến trình** và gọi **thẳng** vào từng
service.

**1. `tsx` không sinh được `emitDecoratorMetadata` — nghiêm trọng nhất.**

Ảnh đầu tiên chạy service bằng `tsx`. Mọi service khởi động sạch sẽ, log đẹp, ánh xạ đủ route — rồi
**mọi request** chết với:

```
TypeError: Cannot read properties of undefined (reading 'getAllAndOverride')
```

`AuthGuard` nhận `undefined` thay cho `Reflector`: `tsx` chạy bằng esbuild, mà esbuild không sinh
được metadata của decorator — thứ tiêm phụ thuộc của NestJS đọc để biết constructor cần gì. Đây là
ràng buộc đã ghi từ P1 cho *vitest*, và tôi đã không nghĩ tới nó khi dựng ảnh chạy thật.

Thử `@swc-node/register`: cũng hỏng, kiểu khác — không phân giải nổi các đường dẫn `./x.js` trỏ tới
tệp `.ts`. Cuối cùng dùng `vite-node` với **đúng cấu hình swc mà 493 test đang chạy qua**. Nó là con
đường duy nhất trong repo này đã được chứng minh.

**2. Gateway định tuyến theo tiền tố là không đủ.**

`document` phục vụ ba đường nằm **dưới** `/policies` (`contract.pdf`, `render`, `sign-file`) vì
chúng thuộc vòng đời file chứ không thuộc máy trạng thái hồ sơ. Bảng tiền tố đẩy tất cả sang
`policy` → xuất hợp đồng trả 404.

Và hai tiền tố bị **bỏ sót hẳn**: `/contract-templates`, `/admin/users`. Không test nào bắt được vì
mọi test đều gọi thẳng service.

Sửa xong, tôi thêm một test **suy ra tiền tố từ chính mã nguồn** (`@Controller('…')`) rồi đối chiếu
với bảng định tuyến. Thiếu một tiền tố là đỏ ngay, không phải chờ ai đó mở đúng màn hình đó.

**3. Ba mật khẩu, ba nơi, không nơi nào biết nơi nào.**

Migration tạo chín DB role với mật khẩu mặc định; mười service đọc mật khẩu từ **file bí mật**;
MinIO nhận mật khẩu qua **biến môi trường**. Ba đường độc lập, và khi lệch nhau thì thông báo lỗi
không hề nhắc tới mật khẩu — MinIO nói *"The request signature we calculated does not match"*.

Sửa: `migrate.sh` **đồng bộ lại mật khẩu chín role ở mỗi lần chạy** (không phải một migration —
xoay mật khẩu là việc vận hành lặp lại, không phải đổi lược đồ), và `make demo` sinh `deploy/.env`
để compose nội suy đúng bí mật đó vào MinIO.

Riêng chỗ này còn dính thêm hai lần: `psql` **không** thay biến `:'pwd'` bên trong khối
`DO $$ … $$`, và cũng **không** thay ở `-c`. Chỉ đầu vào dạng tệp/stdin mới được thay.

**4. `notification` từ chối khởi động — và nó ĐÚNG.**

Với `NODE_ENV=production`, `assertSafeMailConfig` chặn hộp thư giả: *"Production trỏ vào hộp thư giả
mailpit — mọi thông báo sẽ rơi vào hư vô"*. Bản demo cố ý dùng Mailpit.

Không thêm biến `MAIL_ALLOW_FAKE` để đi vòng — biến đó rồi sẽ có ngày xuất hiện trên máy chủ thật.
Bản demo khai đúng mình là gì: `NODE_ENV=demo`. Mọi cấu hình còn lại vẫn qua file bí mật như
production.

### Demo và test giành nhau hạ tầng

Sau khi bản demo chạy được, `make test` đỏ 18 test ở bốn tệp khác nhau — không tệp nào có lỗi thật.
Hai chồng dùng **chung một Postgres, một RabbitMQ, một MinIO**: consumer của bản demo giành mất sự
kiện trên hàng đợi, `/readyz` thấy service mà bộ test tưởng đang tắt, và hai bản `reporting` cùng
ghi vào một read-model.

Trước đó còn một lỗi nặng hơn cùng gốc: `migrate.sh` giờ đặt lại mật khẩu chín DB role ở **mỗi lần
chạy**, nên chạy demo xong thì cả bộ test chết ở dòng kết nối đầu tiên với *"password authentication
failed"* — 24 test đỏ, không dòng nào nhắc tới nguyên nhân. Sửa bằng cách cho **mỗi chồng tự đặt lại
mật khẩu cho chính nó**, và `make test` luôn chạy `migrate` trước thay vì tin vào trạng thái
container còn sót.

Với việc giành hàng đợi thì `make test` **dừng hẳn kèm lời nhắc** thay vì tự tắt bản demo — người
dùng có thể đang trình bày cho khách hàng.

### Một lỗi giao diện, cũng do chạy thật

`can.ts` cho `QUAN_TRI` thấy mục *Mẫu hợp đồng*, trong khi máy chủ chỉ cho `SALE_ADMIN` (`DOC-26`:
mẫu hợp đồng là văn bản nghiệp vụ của Sale Admin). Một mục menu luôn dẫn tới 403. Bảng quyền phía
giao diện không phải lớp bảo mật, nhưng lệch với máy chủ thì nó bày ra đúng thứ nó sinh ra để tránh.

### Mã sinh trong test quay vòng sau 100 giây

Lượt chạy thứ ba đỏ một test với `productId: phải là chuỗi` — thông báo chẳng liên quan gì tới
nguyên nhân. Tám tệp test dùng chung một cách sinh mã: `${P}-${k}-${++n}-${Date.now() % 100000}`.
Phần thời gian **quay vòng sau đúng 100 giây**, còn mã sản phẩm thì ở lại CSDL vĩnh viễn, nên hai
lượt chạy cách nhau bội số của 100 giây sinh ra trùng mã. Lời gọi tạo sản phẩm trả 409, **không ai
kiểm status**, và `undefined` đi tiếp ba mươi dòng rồi mới nổ.

Hai chỗ sửa, và chỗ thứ hai quan trọng hơn:

1. Gom về một hàm `maDuyNhat` trong `tests/http/app.ts`, hậu tố là số ngẫu nhiên **của lượt chạy**.
2. **Kiểm status ngay tại chỗ gọi.** Không kiểm thì mọi lỗi hạ tầng đều hiện ra dưới dạng một lỗi
   kiểm dữ liệu vào ở chỗ khác — và người đọc sẽ đi sửa nhầm chỗ.

Cùng họ với hai lỗi đã ghi ở P7b và P7c: **giả định về dữ liệu tích luỹ**, luôn xanh ở ngày đầu.

### Dữ liệu demo: 5.509 hồ sơ xuống còn 5

Bản demo dùng chung Postgres với bộ test, nên nó thừa hưởng **11.372 sản phẩm, 5.651 khách hàng,
5.509 hồ sơ** — toàn bản ghi `ZZ*` do test sinh ra. Mở màn hình khách hàng ra là một danh sách vô
nghĩa; không ai thử được gì trên đó.

`scripts/seed-demo.ts` xoá sạch dữ liệu nghiệp vụ rồi nạp lại **6 sản phẩm, 4 khách hàng, 5 hồ sơ**.
Ba quyết định:

**Nạp qua API THẬT, không `INSERT` thẳng.** Chèn SQL nhanh hơn nhưng đi vòng qua máy trạng thái, qua
việc đóng băng giá, qua phép tính chiết khấu — và dữ liệu demo sẽ nằm ở những trạng thái mà phần mềm
không bao giờ tạo ra được. Đi qua API thì nó đúng theo đúng nghĩa phần mềm hiểu.

**Năm hồ sơ ở năm trạng thái khác nhau**, để mỗi vai trò đăng nhập vào là có ngay việc để xem. Hồ sơ
thứ năm — bị Trưởng bộ phận trả lại — thêm vào sau khi thử: hộp thư đến của TDV chỉ hiện hồ sơ bị
trả lại, nên không có nó thì `tdv01` mở phần mềm ra thấy trang chủ **trống**. Đúng về hành vi, nhưng
là một bản demo tệ.

**Đúng một dòng vượt ngưỡng trong chín dòng.** Lần đầu tôi đặt số bừa và bốn trên tám dòng vượt
ngưỡng — một bảng mà dòng nào cũng đỏ thì người duyệt thôi không nhìn nữa, và dấu cảnh báo mất hết ý
nghĩa. Đã tính lại từng con số.

### Hai lỗi tìm ra khi dựng dữ liệu demo

**Công nợ bằng 0 bị từ chối.** `debt` dùng `money()`, vốn bắt buộc `> 0` — đúng cho GIÁ BÁN (bán
không đồng là nhập sai) nhưng sai cho công nợ: khách vừa thanh toán xong là nợ 0. Không lập nổi một
khách hàng không nợ gì, và thông báo lỗi *"phải lớn hơn 0"* khiến người nhập tưởng mình gõ thiếu.
Thêm `moneyKhongAm()` và hai test.

**Sửa script seed rồi chạy lại nạp bản CŨ.** Mã nguồn được sao chép vào ảnh lúc build chứ không gắn
từ máy thật, nên `make demo-data` dùng bản trong ảnh — và không có gì báo cho biết. Đã cho
`demo-data` dựng lại trước, và xếp lại tầng của Dockerfile (`pnpm fetch` theo lockfile trước, sao
chép mã nguồn sau) để việc dựng lại đó rẻ. Gộp làm một thì sửa một ký tự là tải lại toàn bộ phụ
thuộc — hai phút cho một thay đổi một dòng, và người ta sẽ thôi không dựng lại nữa mà đoán xem mã
đang chạy là bản nào.

### Còn nợ sau P8

- **Ảnh chạy thật vẫn biến đổi TypeScript lúc chạy.** Nên biên dịch sẵn ra JavaScript để bỏ hẳn
  tầng đó — nhanh hơn lúc khởi động và ảnh nhỏ hơn.
- **Chưa có lịch tự động** cho `make backup` và `make retention`.
- **Chưa có migration lùi.**
- Test trình duyệt thật (Playwright) từ P7d.
- Màn hình lập/sửa hồ sơ và quản trị danh mục mới ở mức đọc.

### Commit

`P8: chay duoc that — anh production, chong demo mot lenh, ba tai lieu ban giao`

---

## P9 — Giao diện: thiết kế lại theo mẫu quản trị, và hai bảng màu

### Đã dựng

- `tokens.css` viết lại: **hai bảng màu đầy đủ** (sáng / tối) cộng bảng khoảng cách, cỡ chữ, bo góc.
- `app.css` viết lại quanh bố cục **thanh bên cố định + cột nội dung**, thay cho hàng tab ngang.
- `lib/giao-dien.ts` — chọn giao diện, ba trạng thái. `components/NutGiaoDien.tsx` — nút đổi.
- `components/BieuTuong.tsx` — 13 biểu tượng SVG vẽ tay.
- Màn hình *Báo cáo* có bốn ô số liệu và thanh so sánh theo trạng thái.
- `tests/web/giao-dien.test.tsx` — 9 test. Tổng bộ test giao diện: **56**.

Đo lại gói: **58,5KB JS + 4,4KB CSS** sau khi nén, trần `FE-38` là 250KB.

### Vì sao thanh bên, không phải hàng tab

Tám mục điều hướng với nhãn tiếng Việt dài ("Việc của tôi", "Mẫu hợp đồng") xếp ngang thì tràn dòng
ngay ở màn hình 1280px, và một hàng tab tràn thành hai dòng trông như lỗi hiển thị chứ không như một
thiết kế. Cột dọc thì thêm mục thứ chín cũng không đổi bố cục.

### Ba trạng thái giao diện, không phải hai

Đây là phần dễ làm sai nhất, và cái sai không nhìn thấy được.

Cách hiển nhiên là lưu `'sang'` hoặc `'toi'` vào `localStorage` ngay lần chạy đầu, đọc từ
`prefers-color-scheme`. Nó **đóng băng** cài đặt của máy tại đúng giây người dùng mở phần mềm lần
đầu: máy tự chuyển tối lúc chiều muộn thì phần mềm đứng yên, và người dùng không có cách nào biết
tại sao — họ đâu có bấm gì.

Nên trạng thái mặc định là **chưa chọn**: không ghi `localStorage`, không đặt thuộc tính nào lên
`<html>`, để `@media (prefers-color-scheme: dark)` trong `tokens.css` tự lo. Bấm nút mới sinh ra
lựa chọn, và lựa chọn đó thắng theo **cả hai chiều**.

### CSP không cho chèn script chống nháy màu

Mọi mẫu quản trị đều chèn một đoạn script nội tuyến vào `<head>` để đặt `data-theme` trước khi trang
vẽ. Ở đây **không làm được**: CSP của Caddy đặt `script-src 'self'` (SEC-09), script nội tuyến bị
chặn thẳng.

Hoá ra không cần. Vì bảng màu sáng nằm ở `:root` và bảng tối nằm trong `@media (prefers-color-scheme)`,
người **chưa chọn gì** đã đúng màu ngay từ khung hình đầu — CSS chạy trước JavaScript. Chỉ người đã
chọn tay NGƯỢC với cài đặt máy mới thấy một nháy đổi màu. Nới CSP để tránh một nháy màu cho một
nhóm nhỏ là một cái giá quá đắt.

### Màu trạng thái ở giao diện tối không phải màu sáng bị làm tối đi

Cặp (chữ, nền) của mỗi nhãn trạng thái phải đi **ngược chiều nhau** khi đổi giao diện: chữ sáng lên
để đọc được trên nền tối, nền tối xuống để không chói. Lấy nguyên cặp của bảng sáng rồi giảm độ sáng
đều cho ra bốn nhãn xám xịt không phân biệt được với nhau.

Cùng loại vấn đề, hai chỗ khác:

- **Màu thương hiệu phải tách khỏi nền nút chính.** Ở bảng tối màu thương hiệu phải sáng lên mới đọc
  được trên nền tối, nhưng cùng màu ấy làm nền nút thì chữ trắng trên nó chỉ còn tương phản ~4:1,
  dưới ngưỡng AA. Hai vai trò khác nhau thì phải là hai token khác nhau.
- **Dấu vượt ngưỡng chuyển từ tròn tô đặc sang tròn viền.** Tô đặc buộc chữ bên trong phải nghịch
  màu, mà ở bảng tối màu lỗi là một sắc đỏ nhạt — chữ trắng trên nó rơi xuống dưới AA. Viền thì dùng
  đúng một màu cho cả hai giao diện.
- **Thanh bên phải đi ngược hướng.** Ở bảng sáng nó tối hơn nền nên tự tách ra; ở bảng tối, làm nó
  tối hơn nữa thì cả hai cùng chạm đáy. Dựng thử ra ảnh mới thấy: thanh bên hoà thẳng vào nền trang.

### Tự soi thiết kế bằng Gotenberg

Không có Playwright trong ảnh Alpine (nợ từ P7d), nên không chụp được màn hình. Nhưng trong chồng đã
có **Gotenberg**, tức là một Chromium thật.

Dựng tám trang HTML tĩnh nhúng **chính** `tokens.css` + `app.css` của sản phẩm, đẩy qua
`/forms/chromium/convert/html` với `printBackground=true`, khổ giấy đặt bằng bề rộng màn hình. Ra
tám bản PDF đọc được bằng mắt.

Ba lỗi chỉ phát hiện được nhờ nhìn, không test nào bắt: thanh bên hoà vào nền ở giao diện tối, hộp
trắng quanh logo, và ô số liệu đầu tiên có vạch màu quá nhạt.

Script dựng nằm ở thư mục nháp, tệp sinh ra nằm trong `workspace/` — không có gì vào git.

### Logo không hề có nền trong suốt

Chú thích trong `BoCuc.tsx` khẳng định *"logo nền TRONG SUỐT... file .png có kênh alpha"*. Sai. Giải
mã ra: ảnh bảng màu 64 màu, **không có chunk `tRNS`**, điểm ảnh góc là `#ffffff` đặc. Trên thanh tiêu
đề xanh của bản cũ nó đã hiện một hộp trắng rồi — chỉ là không ai để ý, và chú thích thì nói ngược
lại nên cũng không ai đi kiểm.

Cách vòng qua hiển nhiên — khai màu trắng thành trong suốt — cũng **sai**: 26.679 điểm ảnh trắng nằm
bên trong lòng logo, là nền của biểu tượng và của chữ NUTRICARE. Trong suốt hoá thì chữ xanh rơi
thẳng xuống nền navy.

Nên logo được đặt lên một **ô trắng bo góc có chủ ý**, như một dấu hiệu thương hiệu. Và chú thích đã
sửa lại cho đúng với file thật.

### Một test đỏ theo xác suất, lộ ra đúng lượt này

`DOC-03` đỏ ở lượt chạy đầu sau khi sửa giao diện — mà thay đổi thì chỉ nằm ở frontend, không chạm
vào bộ sinh PDF.

Nguyên nhân: mã khách hàng `ZZDOC-KH-9-6ff1a4cd` bị `pdfjs` trích ra thành `ZZDOC-KH-9-6 ff 1a4cd`.
Chỗ tách phụ thuộc vào chính các ký tự trong mã, mà mã mang hậu tố ngẫu nhiên **của mỗi lượt chạy**
(chính cơ chế thêm ở P8). Nên test này không sai hẳn — nó đỏ mỗi vài chục lượt một lần.

`DOC-02` ngay bên trên đã xử lý đúng chuyện này từ P6b, bằng một hàm `lien` bỏ hết khoảng trắng
trước khi so — nhưng hàm đó là biến cục bộ trong thân test. `DOC-03` viết sau, không nhìn thấy nó,
và lặp lại lỗi. Đã đưa `lien` ra ngoài phạm vi module cùng với ghi chú lý do.

Đây là lần thứ tư cùng một họ lỗi: **một giả định đúng ở hôm nay, sai ở một lượt chạy nào đó về sau.**

### Còn nợ sau P9

- Vẫn chưa có test trình duyệt thật. Bản dựng bằng Gotenberg kiểm được **màu và bố cục tĩnh**, không
  kiểm được ngăn kéo mở ra, tiêu điểm bàn phím, hay `axe-core`.
- Chưa đo tương phản bằng công cụ — mới tính tay ở những cặp màu đáng ngờ.
- Màn hình lập/sửa hồ sơ và quản trị danh mục vẫn ở mức đọc (nợ từ P7d).

---

## P10 — Trang tổng quan: sáu bộ nội dung theo vai trò

### Đã dựng

- `pages/TongQuan.tsx` thay `ViecCuaToi` ở `/`. Mục menu đổi tên **Việc của tôi → Tổng quan**;
  "Việc của tôi" lùi xuống làm tiêu đề một khối bên trong.
- `lib/tong-quan.ts` — hai bảng tra: `THE_TRANG_THAI` (vai trò → dải thẻ) và `KHOI_THEO_VAI_TRO`.
- `components/khoi/` — `Khung`, `HopViec`, `SoLieu`, `HeThong`.
- `lib/bao-cao.ts` (kiểu + hook chung cho ba báo cáo), `lib/tai.ts` (hook nạp một endpoint).
- Router đọc được chuỗi truy vấn; `DanhSachHoSo` nhận bộ lọc từ liên kết.
- `tests/web/tong-quan.test.ts` + `router.test.tsx` — **78 test giao diện**, tăng từ 56.

Không thêm một endpoint nào. Toàn bộ dữ liệu đã có sẵn và đã nằm trong danh sách trắng của gateway.

### Lỗi đang sửa: hai vai trò đăng nhập vào trang trắng

`/policies/inbox` có một bảng `waitingFor` ánh xạ vai trò → trạng thái đang chờ họ, và nó **không có
nhánh cho `BAN_LANH_DAO` với `QUAN_TRI`** — đúng về nghiệp vụ, cả hai đứng ngoài luồng duyệt. Nhưng
trang chủ chỉ có đúng hộp việc, nên hai vai trò đó mở phần mềm ra là một màn hình trống trơn, không
một dòng chữ.

Bốn vai trò còn lại thì thiếu một thứ khác: gửi duyệt xong là **mất dấu hồ sơ**. Không màn hình nào
trả lời "hồ sơ tôi gửi đang nằm ở bước nào".

### Quản trị hệ thống có phạm vi dữ liệu RỖNG

Phát hiện quan trọng nhất của đợt này, và nó nằm trong SQL chứ không nằm trong mã ứng dụng:
`idn.scope_user_ids` (0003_identity.sql) trả `RETURN;` — tức tập rỗng — cho `QUAN_TRI`.

Hệ quả: mọi lời gọi `/reports/*` và `/customers` của Quản trị đều trả về **0**. Không phải vì hệ
thống trống, mà vì hồ sơ không thuộc phạm vi của vai trò đó.

Nên bộ khối của họ **không có một ô đếm hồ sơ nào**. Bày "Tổng hồ sơ: 0" là một con số đúng nhưng
đọc ra nghĩa hoàn toàn sai — người xem sẽ tưởng chưa ai nhập gì. Thay bằng dải sức khoẻ hệ thống
(thư hỏng, người dùng, danh mục) cộng một câu nói thẳng vì sao không có hồ sơ. Test khoá cả hai điều
này lại.

### Thẻ trạng thái chỉ nói việc của CHÍNH vai trò đó

Yêu cầu của người dùng, và nó đúng: một TDV nhìn ô "Chờ Kế toán L2: 7" thì không làm được gì với con
số ấy, mà nó vẫn chiếm chỗ và vẫn bắt phải đọc.

Chỗ dễ làm ẩu là để test suy ngược bảng "trạng thái này là việc của ai" từ chính `THE_TRANG_THAI` —
làm thế thì test chỉ đang lặp lại dữ liệu nó cần kiểm và luôn xanh. Nên `BAN_CUA` được khai RIÊNG,
độc lập, rồi đối chiếu.

Ngoại lệ có chủ ý: `BAN_LANH_DAO` thấy đủ cả 11 trạng thái — vai trò duy nhất giám sát toàn luồng.

### Một phép so vai trò suýt lọt qua

Bản đầu tôi viết `themTheDangCho={vaiTro === 'TDV'}` trong JSX. `quyen.test.ts` cấm đúng dạng này —
so vai trò bằng chuỗi viết thẳng ngoài `can.ts` — và lệnh cấm ấy có lý do: một phép so rải trong JSX
là chỗ không ai nghĩ tới khi thêm vai trò. Đã chuyển thành bảng `CO_THE_DANG_CHO`.

Đáng nói vì test này viết từ P7d cho một mục đích khác (bảng quyền là nguồn duy nhất) và nó **bắt
được một lỗi ở đợt sau, ở một màn hình chưa tồn tại lúc test ra đời**.

### Router phải tách đường dẫn khỏi chuỗi truy vấn

Thẻ bấm được dẫn tới `/ho-so?status=CHO_TBP_DUYET`. Bộ định tuyến tự viết đặt `datDuong(d)` với
NGUYÊN chuỗi truyền vào, nên `duong` thành `'/ho-so?status=CHO_TBP_DUYET'`, `App` so
`duong === '/ho-so'` trượt, và người dùng bấm một con số lại rơi vào màn hình *"không có màn hình
nào ở địa chỉ này"*.

Sửa xong lại lộ ra cái thứ hai: `di()` bỏ qua lời gọi khi đường dẫn không đổi. Bấm thẻ "Nháp" rồi
bấm thẻ "Từ chối" — cùng trỏ về `/ho-so` — thì lần thứ hai bị coi là "đã ở đó rồi" và màn hình đứng
yên với bộ lọc cũ. Con số vừa bấm và danh sách đang hiện không khớp nhau, mà không có dấu hiệu gì.
Phải so **cả** chuỗi truy vấn.

### Một tiêu chí lọc không có ô nhập

`tdvUserId` nhận uuid, chỉ đến từ việc bấm một dòng trên trang tổng quan — biểu mẫu 14 tiêu chí
không có ô nào cho nó, nên cũng không có cách nào gỡ nó ra. Người dùng sẽ thấy danh sách ngắn bất
thường mà không biết vì sao.

Thêm một dải "Đang lọc theo Trình dược viên ×". Cả dải là nút chứ không phải chỉ dấu ×: một dấu ×
rộng 24px là mục tiêu chạm quá nhỏ (`FE-08`), mà bọc riêng nó trong vùng 44px thì dải chip cao gấp
đôi cần thiết.

### Ba lỗi bố cục chỉ thấy được bằng ảnh

Lại dựng qua Gotenberg như P9, nhưng lần này khác một điểm quan trọng: các khối được render bằng
**chính component React của sản phẩm** qua `renderToStaticMarkup`, không phải HTML gõ tay. Nên thứ
nhìn thấy đúng là thứ người dùng sẽ thấy, kể cả tên lớp CSS.

- Dải thẻ gãy **4+1**: `minmax(200px, 1fr)` chỉ cho 4 thẻ lọt một hàng ở 1280px (5×200 + 4 khe = 1048
  > 1020 chỗ trống), nên hàng cuối còn một thẻ lẻ loi. Xuống 170px là vừa 5.
- Câu giải thích "Ban lãnh đạo không nằm trong luồng duyệt" nằm **sau** mười một con số — đọc sau thì
  đã muộn. Dựng riêng, trước dải thẻ.
- Nhãn "Chờ Kế toán tiếp nhận lần 1" ngắt hai dòng trong cột nhãn hẹp.

### Còn nợ sau P10

- **"Khách hàng chưa có CSBH nào hiệu lực"** — số đáng giá cho TDV nhưng chưa truy vấn được: không
  có phép nối nào giữa `cus.customer` và `rpt.policy_row` cho ra "khách không xuất hiện".
- **"Chờ xuất hợp đồng"** cho Kế toán — `contract_issued_at` nằm ở `pol.policy` nhưng không được sao
  sang `rpt.policy_row`. Cần migration.
- Chưa có màn hình danh sách thư hỏng; Quản trị mới chỉ thấy con số.
- Vẫn chưa có test trình duyệt thật (nợ từ P7d).

---

## P11a — Quản trị người dùng, bộ phận, và kích hoạt tài khoản

Đợt đầu của P11. Phạm vi đợt này dựng từ một phép rà **ngược từ máy chủ**: liệt kê mọi route ghi
trong bảy service, đối chiếu `QUYEN_GHI` và `App.tsx`, xếp từng route vào một đợt. Vòng rà trước đi
xuôi — liệt kê màn hình muốn có — và bỏ sót bảy nhóm việc.

### Ba thứ hỏng, không phải ba việc còn thiếu

Khác nhau ở chỗ: thiếu thì người dùng không thấy gì, còn hỏng thì người dùng bấm vào và nhận về một
màn hình sai.

**Hai mục menu dẫn tới màn hình không tồn tại.** `DIEU_HUONG` khai `/mau-hop-dong` cho Sale Admin và
`/nguoi-dung` cho Quản trị từ P7d, `BieuTuong.tsx` vẽ sẵn biểu tượng cho cả hai, mà `App.tsx` chưa
bao giờ bắt hai đường dẫn đó. Bấm vào là "Không có màn hình nào ở địa chỉ này". Cả bộ test vẫn xanh
suốt bốn chặng: `FE-25` kiểm **chữ trong nhãn menu**, không kiểm nhãn đó dẫn tới đâu.

**Thư mời kích hoạt trỏ tới trang không tồn tại.** `users.service.ts` sinh liên kết
`${webBaseUrl}/kich-hoat?token=…` từ P3b. Không có màn hình nào ở đó. Tức là chức năng tạo người
dùng — đã có API, đã có test HTTP, đã chạy đúng — vẫn không dùng được từ đầu tới cuối.

**Nút "Xuất hợp đồng (PDF)" không chạy.** `ChiTietHoSo.tsx` dùng `<a href="/api/policies/…">`. Thẻ
neo của trình duyệt không gửi header `Authorization`, và không nơi nào trong gateway hay `http-kit`
đọc cookie — token chỉ đi qua header. Bấm vào là 401. Lỗi này sống từ P7d và không test nào chạm tới
vì nó nằm ở một thuộc tính HTML, không ở một hàm.

### Bộ phận: lỗ hổng sâu hơn giao diện

`idn.department` và `idn.department_approver` chỉ được điền bởi `scripts/seed.ts` — không có endpoint
nào. Mà chính `department_approver` quyết định hồ sơ của TDV chạy tới TBP nào
(`0003_identity.sql:113-114`).

Hệ quả nếu chỉ dựng giao diện trên API sẵn có: tạo một TBP qua màn hình mới thì người đó có tài khoản
đúng, vai trò đúng, quyền đúng — và **không nhận được hồ sơ nào**. Không lỗi nào báo, không con số
nào lệch. Nên đợt này phải thêm phía máy chủ: `GET/POST /admin/departments`, gán và gỡ người duyệt,
và `PATCH /admin/users/:id` (route sửa người dùng trước đó cũng chưa tồn tại).

Chặn ngay ở service: **chỉ vai trò `TBP` làm người duyệt được**. Không chặn thì gán nhầm một TDV vào
là hồ sơ đi vào ngõ cụt — `scope_user_ids` vẫn định tuyến tới người đó, mà người đó không có hành
động `TBP_SIGN` nào để làm, nên hồ sơ đứng im tới lúc quá hạn.

### "Chọn TBP" ở giao diện, "lưu theo bộ phận" ở CSDL

Người dùng yêu cầu: tạo TDV phải có trường chọn Trưởng bộ phận quản lý, và Quản trị sửa lại được.

Đọc theo nghĩa đen thì phải thêm cột `approver_user_id` vào `app_user` — nhưng `0003_identity.sql:44`
chốt ngược lại: *"Trưởng bộ phận cấu hình theo bộ phận, có người duyệt thay (muc 2.3). Không gán
cứng một cá nhân"*. Gán cứng thì đổi người giữ chức phải sửa lại hàng trăm TDV, và mất cơ chế duyệt
thay khi TBP đi vắng.

Giải: ô chọn hiện **người**, phần lưu ghi **bộ phận mà người đó duyệt**. Giao diện đúng thứ người
dùng yêu cầu, mô hình giữ nguyên quyết định nghiệp vụ. Màn hình hiện luôn dòng *"Hồ sơ sẽ đi tới bộ
phận: …"* để chỗ dịch đó nhìn thấy được thay vì xảy ra ngầm.

### `opt()` xoá mất tín hiệu "gỡ liên kết"

`PATCH /admin/users/:id` cần phân biệt hai thứ: thiếu trường = không đụng tới, chuỗi rỗng = gỡ liên
kết. Nhưng `opt()` trong `validate.ts:92` biến `''` thành `undefined` — hợp lý cho hầu hết trường,
và ở đây nó gộp mất đúng hai trường hợp cần tách. Triệu chứng: bấm Lưu để gỡ cấp trên, không lỗi
nào, mà giá trị cũ vẫn còn nguyên.

Hai trường liên kết đọc thẳng từ thân request qua một hàm `lienKet()` riêng, không đi qua `validate`.
Test bắt được chỗ này ngay lượt chạy đầu.

### Test mới bắt được cả một lớp lỗi

`dieu-huong.test.tsx`: **mọi mục trong `DIEU_HUONG` phải dẫn tới một màn hình thật**. So KIỂU phần tử
React trả về, không so chuỗi tiêu đề — sửa câu chữ cho dễ hiểu hơn không được làm đỏ một test chẳng
liên quan. Không dựng cây React: gọi thẳng `noiDung()`, nên không kéo theo `usePhien`, `useDuong` và
một loạt lời gọi mạng có thể hỏng vì lý do khác.

Lượt chạy đầu nó đỏ đúng chỗ cần đỏ — `/mau-hop-dong`, mục menu chết còn lại, thuộc đợt P11c. Không
nới lỏng test; tạm gỡ mục menu đó khỏi `DIEU_HUONG` và đặt lại cùng lượt dựng màn hình. Không tính
năng nào mất đi: chưa từng có màn hình ở đó.

`quyen.test.ts` cũng bắt được một vi phạm mới: `NguoiDung.tsx` viết `u.role === 'TBP'` để lọc danh
sách Trưởng bộ phận. Thay bằng `can(u.role, 'kySo')` — dùng lại chính bảng quyền, và đọc ra đúng
nghĩa nghiệp vụ: người duyệt là người ký số được.

### Kết quả

Web 78 → 103 case. HTTP thêm 16 case cho bộ phận và sửa người dùng.

### Còn nợ sau P11a

- `/mau-hop-dong` (Sale Admin) — mục menu đã tạm gỡ, màn hình dựng ở P11c.
- Toàn bộ phần ghi của danh mục, cấu hình SLA, thư hỏng — P11b.
- Tệp đính kèm, bản CSBH A4, hồ sơ pháp lý khách hàng — P11c.
- Lập/sửa hồ sơ và khách hàng — P11d.

---

## P11b — Danh mục, hạn xử lý, thư hỏng: phần còn lại của Quản trị

Năm thẻ ở `/danh-muc` và một thẻ thứ ba ở `/nguoi-dung`. Sau đợt này Quản trị hệ thống làm được trọn
việc của vai trò mình trên giao diện.

### Ba thứ dễ làm sai, và cách đặt chúng vào chỗ nhìn thấy được

**Giá không phải một ô trên sản phẩm.** Nó là một chuỗi dòng có ngày hiệu lực, và giá hiện hành là
dòng mới nhất có ngày *không ở tương lai* (`CAT-05`). Nên màn hình không có ô "sửa giá" — nó có nút
*Đặt giá mới* và một bảng lịch sử. Dựng một ô sửa được thì người dùng sẽ tin rằng đổi số trong ô là
đổi giá ngay, mà thực tế đặt giá cho ngày mai thì hôm nay vẫn dùng giá cũ.

**Ngưỡng chiết khấu lưu bằng phần vạn.** Máy chủ khai `int(0, 10_000)`, tức 10 000 = 100%; người
dùng nhập và đọc bằng phần trăm. Phép quy đổi để ở đúng một chỗ (`lib/danh-muc.ts`) chứ không rải
phép chia 100 khắp màn hình. Đây là loại lỗi tệ nhất trong hệ thống: sai 100 lần thì hoặc mọi dòng
đều bị đánh dấu vượt ngưỡng, hoặc không dòng nào bị đánh dấu — và không con số nào trông bất thường.

**Nhập Excel là cả lô một transaction.** Một dòng lỗi thì không dòng nào được ghi (`CAT-15`). Người
dùng quen kiểu nhập từng dòng bỏ qua dòng hỏng, nên hộp thoại nói trước điều đó — biết trước thì họ
sửa file rồi nhập lại, không biết thì họ đi tìm xem đã ghi được tới đâu.

### Thứ tự thẻ là thứ tự phụ thuộc

`MUC_DANH_MUC` xếp *Nhóm sản phẩm* trước *Sản phẩm* vì phải có nhóm mới tạo được sản phẩm, và có một
test khẳng định đúng thứ tự đó. Cùng lý do với thứ tự bộ phận → TBP → TDV ở P11a: người quản trị mở
màn hình lần đầu không biết ràng buộc nào có trước, và thứ tự các thẻ là chỗ rẻ nhất để nói điều đó.

Nhóm sản phẩm tải ở **cấp trang**, không trong từng thẻ: ba thẻ cùng cần nó, và tải ba lần thì ba
nơi lệch nhau ngay sau khi thêm một nhóm mới.

### Vai trò không quản trị thấy hai thẻ, không phải năm thẻ rỗng

`/danh-muc` mở cho mọi vai trò. Bày cả năm thẻ rồi ẩn hết nút bên trong là bắt họ bấm qua ba màn
hình trống mới hiểu ra không có gì cho mình. Lọc còn *Sản phẩm* và *Quy định chiết khấu* — hai thứ
cần tra khi lập và khi duyệt hồ sơ — và bảng sản phẩm giữ nguyên bốn cột của bản trước P11b, vì đó
là màn hình năm vai trò kia đã quen từ bản demo.

### Một endpoint trả sai kiểu tên

`/notifications/dead-letters` là nhóm route DUY NHẤT trả thẳng tên cột snake_case; mọi endpoint khác
đều đặt bí danh camelCase. Không test nào phụ thuộc vào tên đó, nên sửa ở máy chủ thay vì viết một
DTO đi ngược cả ứng dụng. Thêm một khẳng định vào `notification.test.ts` để nó không lặng lẽ quay
lại — bảng thư hỏng đọc `routingKey`/`failedAt`, quay lại snake_case là bảng hiện toàn ô trống mà
không lỗi nào báo.

### Cảnh báo trước khi bấm, không phải sau

Đổi số ngày SLA **tính lại hạn cho mọi hồ sơ đang chờ**, kể cả hồ sơ nộp từ trước — rút ngắn hạn có
thể làm một loạt hồ sơ chuyển sang *Quá hạn duyệt* ngay lập tức. Câu cảnh báo đó nằm trên biểu mẫu,
trước nút Lưu, chứ không nằm trong thông báo sau khi lưu.

Ở thư hỏng: kết quả `duplicate` **không phải lỗi** — sự kiện đã gửi thành công ở một lượt khác. Gộp
nó vào "hỏng" là bắt người quản trị đi tìm một vấn đề không tồn tại.

### Một lượt đỏ theo xác suất, và nó là lỗi thật của bộ test

Lượt chạy đầy đủ đầu tiên đỏ một case: `RPT-10` báo `expected 29 to be 28` ở trạng thái `NHAP`.
P11b không chạm gì tới `policy` hay `reporting`, nên phải tìm nguyên nhân thật trước khi đổ cho
môi trường.

`flushSync` chờ sai điều kiện: nó chờ dòng read-model **tồn tại**, không chờ dòng đó **đúng trạng
thái**. Trình tự làm nó hỏng:

1. `draft()` tạo hồ sơ → chiếu sang read-model với `NHAP`.
2. `SUBMIT` đổi nguồn sang `CHO_TBP_DUYET`, sinh sự kiện thứ hai.
3. `flushSync` thấy dòng ĐÃ CÓ từ bước 1 nên trả về ngay, trong khi projection còn ghi `NHAP`.

Báo cáo đếm thừa đúng một hồ sơ ở `NHAP`, và thông điệp lỗi không nhắc gì tới độ trễ. Sửa: điều
kiện dừng là trạng thái read-model khớp trạng thái nguồn, và `pumpOnce()` gọi TRONG vòng lặp vì sự
kiện thứ hai có thể chưa nằm trong outbox lúc bơm lần đầu. Ba lượt chạy riêng tệp này đều xanh sau
khi sửa.

Cùng loại với `DOC-03` ở P9: một case đỏ hoá ra là lỗi của bộ test chứ không của sản phẩm — và cũng
như lần đó, đọc kỹ trước khi sửa test là việc đáng làm.

### Kết quả

Web 103 → 116 case. `DaiThe` rút ra `Chung.tsx` vì giờ có ba chỗ dùng dải thẻ.


### Bổ sung ngay trong đợt: sửa và xoá quy định chiết khấu, người ký

Ghi vào nợ xong thì người dùng bảo làm luôn. Trước đó cả hai nhóm chỉ có `POST` — khai nhầm một dòng
thì phải vào thẳng CSDL, tức là một thao tác không đi qua nhật ký nào.

**Xoá quy định chiết khấu KHÔNG viết lại lịch sử.** `pol.policy_line.threshold_snap`
(`0001_init.sql:92`) đã đóng băng ngưỡng vào từng dòng hồ sơ lúc lập, nên xoá chỉ đổi cách tính cho
hồ sơ lập từ đây về sau. Không có chỗ này thì xoá là thao tác nguy hiểm và đáng lẽ phải cấm.

**Sửa chỉ mở hai ô: ngưỡng và ngày kết thúc.** Ba khoá khớp (nhóm · loại khách · kênh) không sửa
được, vì đổi chúng là đổi `specificity` — tức đổi thứ tự ưu tiên khi nhiều dòng cùng khớp
(`CAT-11`). Một lần bấm có thể lặng lẽ đảo thứ tự ưu tiên của cả bảng mà không gì trên màn hình nói
ra. Khai nhầm phạm vi thì xoá rồi khai lại: hai việc rõ ràng thay vì một việc mập mờ. Ba ô đó hiện
dạng CHỮ trong hộp thoại sửa, không dạng ô nhập.

**Người ký thì NGỪNG là thao tác chính, XOÁ là ngoại lệ.** Cột `is_active` đã có sẵn từ P4. Hệ thống
không lưu file hợp đồng, nên bản giấy khách hàng đang giữ là dấu vết duy nhất — và nó dẫn chiếu tới
một cái tên mà CSDL phải còn giải thích được. Họ tên và ngày bắt đầu cũng không sửa: đổi họ tên là
biến bản ghi thành một người khác trong khi hợp đồng đã xuất vẫn mang tên cũ.

Cả bốn thao tác đều phát `catalog.changed` kèm giá trị TRƯỚC (`CAT-13`), có test khẳng định.

Gặp lại đúng cái bẫy `opt()` của P11a ở `effectiveTo` và `validTo`: chuỗi rỗng phải giữ nghĩa "gỡ
ngày kết thúc", mà `opt()` biến nó thành `undefined` = "không đụng tới". Đọc thẳng từ thân request,
như đã làm ở `PATCH /admin/users/:id`.

Một test của tôi sai chứ không phải mã: khẳng định sau khi cắt hiệu lực thì tra ngưỡng rơi về
`PRODUCT_DEFAULT`, nhưng sản phẩm trong test không có ngưỡng mặc định nên API trả 404
`THRESHOLD_NOT_CONFIGURED`. Sửa test cho sản phẩm có mặc định, và thêm hai khẳng định hai phía mốc
thời gian — cắt hiệu lực chứ không xoá.

### Còn nợ sau P11b

- `/mau-hop-dong` (Sale Admin) — mục menu vẫn đang tạm gỡ, màn hình dựng ở P11c.
- Tệp đính kèm, bản CSBH A4, hồ sơ pháp lý khách hàng — P11c.
- Lập/sửa hồ sơ và khách hàng, đổi TDV phụ trách — P11d.

---

## P11c — Mẫu hợp đồng, tệp đính kèm, bản CSBH A4

Đợt này đóng mục menu chết cuối cùng và mở phần file — thứ đã có API đầy đủ từ P6b/P6c mà giao diện
chưa chạm tới dòng nào.

### Mục menu chết cuối cùng

`/mau-hop-dong` khai trong `DIEU_HUONG` từ P7d, `App.tsx` chưa bao giờ bắt. P11a tạm gỡ mục menu sau
khi `dieu-huong.test.tsx` bắt được; giờ đặt lại cùng lượt dựng màn hình. Test đó là thứ bảo đảm hai
việc luôn đi cùng nhau — không có nó thì "tạm gỡ" rất dễ thành "quên hẳn".

### Tải file: hai bước, và không bước nào bỏ được

`GET /files/:id/link` cấp một token gắn với ĐÚNG người đang gọi, rồi mới tải nội dung (`DOC-09`).
Không có URL công khai nào trên kho, nên không thể chỉ đặt một thẻ neo — mà thẻ neo cũng không gửi
header `Authorization`, đúng lỗi đã sửa ở P11a.

Tải LÊN cũng hai bước, và hai bước đó thuộc hai service khác nhau: `document` nhận file thật rồi trả
`objectKey`, `policy` (hoặc `customer`) ghi con trỏ. Gộp lại là bắt `policy` đụng vào MinIO và
`document` phải biết luật nghiệp vụ.

### Một cột thiếu trong projection

`pol.policy_attachment` có `object_key` nhưng `policies.service.ts` không trả ra, nên danh sách tệp
hiện được TÊN mà không nối được sang file để lấy đường tải — đúng tình trạng từ P7d. Thêm một cột
vào câu SELECT là đủ; khoá kho không phải bí mật, mọi lượt tải vẫn qua token cấp riêng, và
`files.controller.ts` cũng đã trả trường này.

Đổi `objectKey` sang `fileId` hỏi ĐÚNG LÚC BẤM, không tải sẵn danh sách file lúc mở màn hình: phần
lớn lượt xem hồ sơ không tải tệp nào, và một lời gọi thừa trên mọi lượt mở để phục vụ một thao tác
hiếm là đánh đổi sai.

### "Lưu và ban hành" phải lưu thật

`publish` đọc ánh xạ đã lưu ở CSDL, không đọc bảng đang mở. Bản đầu tôi viết nút gọi thẳng `publish`
— người dùng vừa điền xong cả bảng vẫn nhận `TEMPLATE_INCOMPLETE`, một thông báo đúng về kỹ thuật và
vô nghĩa với người đang nhìn bảng đầy đủ trước mặt. Nút gọi `PUT mapping` rồi mới `publish`.

Cùng loại lỗi ở điều kiện bật nút: bản đầu đọc `unmapped` của lần tải đầu, tức một ảnh chụp lúc mở
màn hình. Điền hết bảng thì nút vẫn xám. `banHanhDuoc` nhận tập ô ĐANG CHỌN trên bảng.

### Danh sách hồ sơ pháp lý đọc từ `document`, không từ `customer`

`GET /customers/:id/documents` không trả mã file, mà không có mã file thì không xin được đường tải.
Đọc từ `GET /files?ownerKind=CUSTOMER&ownerId=` thay thế. Lúc tải lên vẫn ghi cả hai bảng —
`customer` giữ phân loại nghiệp vụ, `document` giữ file thật.

### Một test đối chiếu hai phía

`DINH_DANG` ở giao diện là bản sao của `FORMATS` trong `services/document/src/contracts/sources.ts`;
máy chủ không có endpoint nào trả danh sách này ra. Bản sao là chỗ lệch, nên test đọc thẳng tệp
nguồn của máy chủ và đối chiếu. Thêm một định dạng ở máy chủ mà quên ở đây thì test đỏ, chứ không
phải Sale Admin phát hiện khi ô chọn thiếu mục. Cùng cách với `TIEN_TO_DONG` / `LINE_PREFIX`.

### Kết quả

Web 116 → 126 case.

### Còn nợ sau P11c

- Lập/sửa/xoá hồ sơ và khách hàng, đổi TDV phụ trách — P11d, đợt cuối.
- `DELETE /files/:id` chỉ mở cho TDV và Sale Admin nên nút "Gỡ" của Kế toán chỉ gỡ con trỏ khỏi hồ
  sơ, file vẫn nằm trên kho. Đúng thiết kế của máy chủ, nhưng chưa có màn hình nào cho thấy điều đó.
- Vẫn chưa có test trình duyệt thật (nợ từ P7d).

---

## P11d — Lập/sửa hồ sơ và khách hàng: đợt cuối của P11

Sau đợt này TDV làm được việc chính của mình trên giao diện. Trước đó họ chỉ thao tác được với dữ
liệu do `make demo-data` bơm qua API.

### Không chép công thức sang giao diện

Câu hỏi thiết kế lớn nhất của đợt: nhập dòng sản phẩm có tính chiết khấu tại chỗ không?

Tính tại chỗ thì phải có công thức ở giao diện. Mà `bundle.test.ts` chốt phụ thuộc của web đúng
`react` + `react-dom`, nên không import được `@csbh/domain-policy`; chép tay thì đó là một công thức
CÓ LUẬT LÀM TRÒN, và so ngưỡng xảy ra SAU khi làm tròn — đúng loại thứ hai bên lệch nhau vào ngày ai
đó sửa một bên, mà lệch thì không ai đọc ra ngay.

Chọn: hồ sơ tạo ra ở Nháp trước, rồi thêm từng dòng. `POST /policies/:id/lines` trả về NGUYÊN hồ sơ
đã tính lại, nên mỗi lần thêm một dòng là thấy ngay giá thu về và tỷ lệ chiết khấu của nó. Một vòng
mạng cho mỗi dòng, đổi lại công thức ở đúng một chỗ.

### Câu hỏi Bổ sung / Chỉnh sửa phải hỏi ở giao diện

Máy chủ có sẵn cơ chế: `POST /policies` không kèm `mode` cho khách đã có CSBH thì trả 409 kèm
`SUPPLEMENT_REQUIRED` hoặc `AMEND_REQUIRED` — và nó chọn câu hỏi dựa trên danh sách dòng gửi lên.

Nhưng theo cách dựng ở trên, hồ sơ tạo ra khi chưa có dòng nào, nên `hasNew` luôn false và câu máy
chủ chọn luôn là "đã có, muốn CHỈNH SỬA không?" — đọc ra sai với người định thêm sản phẩm mới. Nên
giao diện hỏi thẳng bằng hai nút, và gửi `mode` ngay từ đầu. Cơ chế của máy chủ vẫn còn nguyên như
một chốt chặn cho mọi client khác.

### Sale Admin không có cách nào lấy danh sách TDV

`doiTdvPhuTrach` mở cho Sale Admin, mà `/admin/users` chỉ Quản trị gọi được. Nguồn thay thế duy nhất
là `byHandler` của báo cáo tiến độ — nhưng nó chỉ liệt kê TDV **đã có hồ sơ**, nên một TDV mới tuyển
không bao giờ xuất hiện và không ai giao khách được cho họ.

Thêm `GET /admin/users/assignable-tdv`, mở cho `SALE_ADMIN` và `QUAN_TRI`. `@Roles` cấp phương thức
ghi đè cấp lớp (`auth.guard.ts` dùng `getAllAndOverride`) nên nó thật sự nới quyền chứ không bị lớp
`@Roles('QUAN_TRI')` chặn lại. Đặt dưới tiền tố `/admin/users` để dùng lại danh sách trắng gateway
đã có.

`QUAN_TRI` phải xử lý riêng: `scope_user_ids` trả RỖNG cho họ theo thiết kế, nên nếu chỉ lọc theo
phạm vi thì ô chọn của Quản trị luôn trống.

### Xoá hồ sơ: bắt gõ lại mã, không phải hỏi "Chắc chưa?"

Nút xoá nằm cùng màn hình với những nút dùng hàng ngày, và xoá không lùi được. Một hộp thoại xác
nhận thường bị bấm qua theo phản xạ; gõ lại mã hồ sơ thì không thể bấm nhầm.

Nút ẩn hẳn với hồ sơ **Từ chối** — trạng thái kết thúc, không ai xoá được kể cả Quản trị (`POL-14`).
Máy chủ chặn; ẩn nút để không ai bấm vào một thứ chắc chắn hỏng.

### Suy "sửa được" từ câu trả lời của máy chủ

Hồ sơ sửa được khi `allowed-actions` có `SUBMIT` hoặc `RESUBMIT_AFTER_EDIT` — hai hành động chỉ tồn
tại ở đúng `NHAP` và `YEU_CAU_CHINH_SUA`. Chép danh sách trạng thái sang giao diện là thêm một bản
sao phải giữ đồng bộ với máy trạng thái.

Test đọc thẳng `ACTION_OF` trong `state-machine.ts` và khẳng định: tập hành động đi RA TỪ hai trạng
thái sửa được đúng là hai mã đang dùng. Đổi trạng thái nguồn của `SUBMIT` ở máy chủ thì giao diện
ngừng hiện nút sửa — không lỗi nào báo, chỉ là TDV thấy một hồ sơ Nháp không sửa được. Test bắt.

### Cột thao tác là cột THÊM VÀO

`BangSanPham` nhận `xoaDong` tuỳ chọn. Chú thích đầu tệp cấm ẩn bớt cột, và bốn ô CPBH vẫn là thứ
quyết định giá thu về dù màn hình đang ở chế độ sửa — nên cột thao tác cộng thêm vào cả hai bố cục
(bảng và thẻ), không thay chỗ cột nào.

### Kết quả

Web 126 → 133 case, HTTP thêm 4 case. Toàn bộ 17 quyền ghi trong `QUYEN_GHI` giờ đều có màn hình.

### Còn nợ sau P11d

- Xoá khách hàng (`DELETE /customers/:id`) — máy chủ có, chưa có nút. Chưa rõ luật nghiệp vụ khi
  khách đã có hồ sơ, nên chưa dựng.
- `DELETE /files/:id` chỉ mở cho TDV và Sale Admin: nút "Gỡ" của Kế toán chỉ gỡ con trỏ khỏi hồ sơ.
- Vẫn chưa có test trình duyệt thật (nợ từ P7d) — cần ảnh riêng vì ảnh nền Alpine không có glibc.

---

## P12 — Bỏ khái niệm "bộ phận", và dấu sao cho trường bắt buộc

Hai yêu cầu đi cùng một lượt, và chúng gặp nhau ở đúng một chỗ: ô "Trưởng bộ phận quản lý" của biểu
mẫu tạo TDV vừa là thứ thay cho bộ phận, vừa là trường bắt buộc đầu tiên được máy chủ chặn thật.

### P12a — Một cột thay cho hai bảng

Trước đây một TDV nối với người duyệt qua **hai bước gián tiếp**: `app_user.department_id` →
`department_approver.user_id`. Bộ phận là một thực thể riêng phải tạo trước, gán người duyệt cho nó,
rồi mới gán TDV vào — ba thao tác quản trị cho một quan hệ mà nghiệp vụ chỉ nhìn thấy là *"TDV này
do Trưởng bộ phận nào duyệt"*.

Sau `0017_bo_bo_phan.sql` nó là một cột: `app_user.approver_user_id`.

Ở P11a tôi đã bảo vệ mô hình cũ bằng lập luận "đổi người giữ chức chỉ sửa một dòng thay vì sửa hàng
trăm TDV". Lập luận đó đúng về mặt số phép ghi, nhưng nó trả giá bằng một thực thể mà người dùng
không có khái niệm tương ứng — và **chi phí đó rơi vào mọi lần tạo TDV**, còn lợi ích chỉ xuất hiện
khi đổi người giữ chức. Người dùng chọn bỏ; tôi cho là chọn đúng.

**Đánh đổi đã chấp nhận**: mất cơ chế người duyệt thay (`department_approver.is_primary`, muc 2.3).

**Hai hàm phải sửa cùng lượt**, vì cả hai đọc bảng sắp bị xoá — và Postgres **không** theo dõi phụ
thuộc vào bảng bên trong thân plpgsql, nên đảo thứ tự thì không có gì báo lỗi lúc migrate, chỉ hỏng
lúc chạy:

| Hàm | Đổi gì |
|---|---|
| `idn.scope_user_ids` (0003) | nhánh TBP: `approver_user_id = p_user_id` thay cho hai phép nối |
| `idn.notify_targets` (0010) | CTE `approver`: một phép nối thẳng thay cho hai |

**Trigger `trg_app_user_approver`** giữ cột luôn trỏ vào một tài khoản TBP, vì `CHECK` không diễn đạt
được điều kiện nằm ở dòng khác. Gán nhầm một kế toán vào đây là hồ sơ đi vào **ngõ cụt**: định tuyến
vẫn chạy tới người đó, mà họ không có hành động `TBP_SIGN` nào để làm — hồ sơ đứng im tới khi quá
hạn và không có gì chỉ ra nguyên nhân. Tầng service cũng chặn (để trả `VALIDATION_FAILED` kèm tên
trường thay vì `check_violation` không dấu), nhưng seed và sửa tay bằng SQL đi vòng qua service.

**TDV không có người duyệt bị từ chối ngay lúc tạo.** Trước đây không có ràng buộc nào như vậy, và
hệ quả chỉ lộ ra ở hồ sơ đầu tiên của người đó.

### Một lỗ hổng lộ ra nhờ đi ngang qua

`make typecheck` **đã đỏ từ P11d** với `TS6142`: `tests/web/sua-ho-so.test.ts` là `.ts`, dự án gốc
gom `tests/**/*.ts` mà không bật `jsx`, nên nó không được phép import thẳng `SuaHoSo.tsx`.
`make test` không chạy `tsc` nên chuyện đó lọt qua cả một đợt commit. Chuyển `suaDuoc` sang
`lib/sua-ho-so.ts`: logic thuần ở `lib/`, JSX ở `components/`.

### P12b — Dấu sao phải nói lên điều gì đó

Bảng `BAT_BUOC` ở `lib/bat-buoc.ts` khai trường bắt buộc của 11 biểu mẫu, khoá là **tên trường của
máy chủ**. `bat-buoc.test.ts` đọc thẳng `*.controller.ts`, tách khối `validate(…, { … })` và khẳng
định: trường nào không bọc `opt()` thì phải có trong bảng, và ngược lại.

Hai kiểu sai, hỏng theo hai cách khác nhau — nên test bắt cả hai chiều:

- Máy chủ bắt buộc mà giao diện không đánh dấu → người dùng điền xong, bấm Lưu, nhận
  `VALIDATION_FAILED` cho một ô không có gì báo là phải điền.
- Giao diện đánh dấu mà máy chủ không bắt buộc → nút Lưu chết mà không ai hiểu vì sao.

`CHAT_HON` là danh sách ngoại lệ cho chiều thứ hai, mỗi mục phải có lý do. Hiện có đúng một:
`ho-so.appliedDate` — `POST /policies` nhận hồ sơ không có ngày áp dụng vì nó dựng để tạo nháp rồi
điền dần, nhưng màn hình Lập hồ sơ tạo hồ sơ ngay tại chỗ nên ô trống ở đó chỉ xảy ra khi người dùng
xoá nó đi, và kết quả là một hồ sơ chạy qua cả bốn bước duyệt với ô ngày để trống trên bản A4.

**Năm biểu mẫu có cùng một lỗ**, và cả năm đều là ô ngày: Lập hồ sơ · Đặt giá · Quy định chiết khấu ·
Người ký · Sửa ngày áp dụng. Ô ngày có sẵn giá trị hôm nay nên **nhìn như đã điền**, mà xoá trắng đi
thì `<input type="date">` trả chuỗi rỗng và không có gì trên màn hình đổi khác. Dấu sao đã có từ
trước; cái thiếu là điều kiện `disabled` của nút gửi.

`thieuTruong()` đo bằng `undefined | null | chuỗi rỗng sau khi cắt khoảng trắng`, **không** bằng
phép kiểm falsy: `customerType` là số, và loại khách hàng `0` hay công nợ `0` phải tính là đã điền.

### Kết quả

Web 155 case (thêm 24), toàn bộ 616 case xanh. Xoá `departments.test.ts` (19 case của một nhóm route
không còn tồn tại).

### Còn nợ sau P12

- Vẫn nợ từ trước: nút "Tải file" của xuất Excel dùng `<a href>` nên trả 401 · `sign-file` không có
  ai gọi · chưa có màn hình lịch sử hồ sơ · chưa có test trình duyệt thật.
- Chưa chạy phép thử cuối trên chồng demo: tạo TBP → tạo TDV chọn TBP đó → kích hoạt qua
  `make demo-mail` → gửi một hồ sơ và xác nhận nó tới đúng người.

---

## P12c — `make demo` bắt đầu từ CSDL trống, chỉ một tài khoản quản trị

Trước đây `make demo` nạp 10 tài khoản mẫu và một bộ dữ liệu nghiệp vụ mẫu. Điều đó tiện để xem
phần mềm chạy, nhưng nó **giấu mất đúng thứ vừa dựng xong ở P11 và P12**: đường onboarding. Quản trị
dựng cây tài khoản, khai danh mục và quy định chiết khấu, rồi TDV lập khách hàng và hồ sơ — cả nhánh
đó chưa từng được chạy thử một lần nào từ đầu tới cuối.

Giờ `make demo` dựng lại CSDL từ đầu và tạo đúng một tài khoản: `admin01`.

### Xoá CSDL, không TRUNCATE từng bảng

`reset-db.sh` gọi `DROP DATABASE` rồi `CREATE DATABASE`. Cách kia — liệt kê bảng rồi TRUNCATE — bắt
danh sách bảng phải giữ đồng bộ với 17 migration, mà **quên một bảng thì chỗ "sạch" đó lặng lẽ còn
dữ liệu cũ**: đúng thứ khó nhìn ra nhất khi đang thử nghiệp vụ. `DROP DATABASE` không có danh sách
nào để quên.

Hai chi tiết phải đúng, cả hai đều hỏng theo kiểu thông báo không nói lên nguyên nhân:

- **Ngắt kết nối còn sót trước khi xoá** (`pg_terminate_backend`). Một service của lượt trước còn mở
  kết nối là `DROP DATABASE` hỏng với *"is being accessed by other users"*, và Postgres không nói ai
  đang giữ. `make demo` cũng chạy `$(DEMO) down` trước mọi thứ vì lý do này.
- **Nối vào `postgres`, không vào CSDL sắp xoá.** Không ai xoá được cái CSDL mà chính mình đang nối
  vào — và `PGDATABASE` trong container `migrate` mặc định là `csbh`.

Chín DB role nằm ở cấp cụm nên sống sót; quyền của chúng thì không, vì quyền gắn với đối tượng trong
CSDL vừa bị xoá. `0002_roles` cấp lại toàn bộ ở lượt migrate ngay sau đó.

### Một hệ quả phải xử lý, không phải chuyện phụ

Bản demo và bộ test **dùng chung một Postgres**. `make demo` giờ xoá luôn 10 tài khoản mẫu mà bộ test
dựa vào — mà không tệp test nào tự nạp chúng. Chạy demo rồi chạy test là hàng chục case đỏ ở
*"đăng nhập tdv01 hỏng: 401"*, không dòng nào nhắc tới nguyên nhân.

`make test` giờ phụ thuộc `seed`. `seed.ts` dùng `ON CONFLICT DO UPDATE` nên chạy lại bao nhiêu lần
cũng được. Đây là chỗ đáng lẽ phải có từ đầu: bộ test không nên dựa vào một lệnh mà người chạy phải
nhớ gõ.

### Chốt an toàn

`reset-db.sh` là script **nguy hiểm nhất** trong repo — nó xoá sạch. Nó từ chối chạy khi
`NODE_ENV=production`, cùng chốt với `seed.ts` và `seed-admin.ts`, và `SEC-14` giờ kiểm cả ba. Test
của `reset-db.sh` không chỉ đo mã thoát: nó đếm lại `idn.app_user` sau đó, vì nếu script vẫn chạy
tới lệnh `DROP` thì mã thoát cũng khác 0 nhưng vì lý do hoàn toàn khác.

### Kiểm chứng

Chạy thật `make demo`: CSDL còn đúng 1 dòng `app_user`, 0 sản phẩm, 0 khách hàng, 0 hồ sơ, 0 nhật ký
kiểm toán. `admin01` đăng nhập được và nhận token vai trò `QUAN_TRI`. Mẫu hợp đồng mặc định vẫn được
`document` nạp lúc khởi động nên Kế toán xuất được hợp đồng ngay từ đầu.

Rồi `make demo-down && make test` trên chính CSDL vừa bị xoá: **621/621 xanh** — đúng kịch bản đáng
lo nhất, và `seed` trong danh sách phụ thuộc lo được.

Bộ mẫu cũ vẫn còn: `make demo-mau` nạp 10 tài khoản và dữ liệu nghiệp vụ mẫu vào bản demo đang chạy.

---

## P13 — Bỏ mật khẩu mặc định, thêm quên mật khẩu

### P13a — Không còn mật khẩu nào để bàn giao

Trước đây quản trị đặt một **mật khẩu mặc định** khi tạo tài khoản: dùng được thật, dùng được đúng
một lần, và phải bàn giao cho người dùng qua một kênh nào đó ngoài hệ thống. Chính cái "kênh nào đó"
là chỗ rò rỉ — tin nhắn, giấy tờ, lời nói — và không có gì trong sản phẩm nhìn thấy nó.

Giờ `POST /admin/users` **không nhận mật khẩu**. `password_hash` nhận băm của một chuỗi ngẫu nhiên
32 byte mà không ai biết, nên mọi phép so đều trượt. Đường DUY NHẤT để tài khoản có mật khẩu là liên
kết trong thư mời.

Chọn "băm của chuỗi ngẫu nhiên" chứ không phải cho cột nhận NULL, và đó là quyết định về an toàn:
để `password_hash` nhận NULL thì **mọi** đường đăng nhập phải thêm một nhánh kiểm, và quên một nhánh
là một lỗ xác thực. Một giá trị không ai đoán được thì không đường nào phải sửa.

**Một khả năng mất đi, cố ý**: `ONB-14` cũ cho phép kích hoạt KHÔNG qua email — quản trị bàn giao
mật khẩu ngoài luồng, người dùng đăng nhập rồi tự đổi, tài khoản hoạt động mà `email_verified_at`
vẫn rỗng. Nhánh đó biến mất hoàn toàn. Đổi lại, **địa chỉ email phải đúng**: gõ nhầm là thư mời đi
vào hộp thư người khác, và người đó đặt được mật khẩu. Đã ghi vào tài liệu hướng dẫn.

### P13b — Quên mật khẩu

Bỏ mật khẩu mặc định làm lộ ra một lỗ đã có sẵn: `resendInvite` từ chối tài khoản đã kích hoạt, và
không có endpoint nào đặt lại mật khẩu — **người dùng quên mật khẩu là mất tài khoản vĩnh viễn**.

`0018_quen_mat_khau.sql` thêm cột `purpose` vào `idn.activation_token` thay vì dựng bảng thứ hai:
hai loại token có vòng đời giống hệt nhau (một lần dùng, có hạn, thu hồi được, chỉ lưu bản băm), và
chép lại cả bộ máy đó là mời sửa một bên quên bên kia ở đúng những chỗ không được sai.

Ba thứ ĐƯỜNG CÔNG KHAI này không được làm, và phần lớn test của `quen-mat-khau.test.ts` kiểm đúng
những thứ đó:

| Không được | Vì sao | Cách chặn |
|---|---|---|
| Nói ra tài khoản nào có thật | Thành máy dò danh sách tài khoản (AUTH-02) | Luôn trả `{ok:true}`, cả hai bên máy chủ và giao diện cùng im |
| Gửi thư dồn dập | Ai cũng bơm được thư vào hộp thư người khác | Đã có liên kết còn hạn chưa dùng trong 2 phút thì không phát hành thêm |
| Thu hồi token của thư mời | Gọi lặp lại là vô hiệu hoá được mọi lời mời vừa gửi | Chỉ thu hồi token **cùng loại** |
| Cho dùng chéo hai loại token | Mã lỗi khác nhau là nói cho người thử biết họ cầm token thật, chỉ nộp nhầm cửa | `purpose` nằm trong ĐIỀU KIỆN TÌM, không kiểm sau khi tìm thấy |

Hạn liên kết đặt lại là **2 giờ**, không phải 72 như thư mời: người quên mật khẩu đang ngồi trước
máy, còn liên kết sống lâu là liên kết nằm lại trong hộp thư — chỗ có thể bị đọc trộm muộn hơn nhiều
so với lúc gửi.

Cả hai loại token đều đặt `email_verified_at`. Thứ cột đó ghi nhận là "hộp thư có thật và người dùng
đọc được nó" (0004), mà đi qua được liên kết đặt lại thì chứng minh đúng điều ấy chẳng kém gì liên
kết kích hoạt.

### Một cái bẫy đã dính

`db.one()` trả **`undefined`** khi không có dòng, không phải `null` (`http-kit/src/db.ts:28`). Hàm
chặn gửi dồn viết `gan !== null` nên nó luôn đúng: mọi lượt đều bị coi là gửi dồn và **không thư nào
được gửi** — không lỗi, không log, chỉ là tính năng chết trong im lặng. Tám test đỏ với
"Cannot read properties of undefined (reading 'text')" và không cái nào trỏ vào nguyên nhân.

### Hai test đỏ vì CSDL dùng chung

`scope.test.ts` có hai chỗ chốt cứng "bảng người dùng có đúng 10 dòng". Từ khi `make demo` bắt đầu
từ CSDL trống và người thử tự tạo tài khoản, những dòng đó nằm lại trong cùng một Postgres mà bộ
test dùng. Đã đổi sang so với chính bảng người dùng (`bld01` thấy MỌI tài khoản) và lọc đúng bộ 10
tên tài khoản mẫu — cả hai đều là điều test thật sự muốn kiểm, con số 10 chỉ là hệ quả.

### Kết quả

Thêm `tests/http/quen-mat-khau.test.ts` (13 case). Gỡ ONB-14 cũ, viết lại ONB-05/06 thành "tài khoản
chưa kích hoạt thì không mật khẩu nào vào được".

---

## P14 — Một lỗi triển khai chờ sẵn, và cơ chế gửi thư

Tìm ra khi trả lời một câu hỏi tưởng là vô hại: *"thư kích hoạt để địa chỉ người gửi là gì"*.

### Hai service, hai tên biến

`notification` đọc `MAIL_HOST ?? SMTP_HOST`. `identity` chỉ đọc `SMTP_HOST`. `deploy/` chỉ đặt
`MAIL_HOST`. Kiểm trong container demo đang chạy:

```
SMTP_HOST = undefined | MAIL_HOST = mailpit | MAIL_FROM = undefined
```

Nghĩa là identity **bỏ qua toàn bộ cấu hình triển khai** và chạy bằng giá trị mặc định viết cứng
`mailpit:1025`. Bản demo chạy đúng hoàn toàn do trùng hợp.

Trên máy chủ thật: đặt `MAIL_HOST=smtp.nutricare.com.vn`, notification dùng đúng, identity vẫn gõ
cửa `mailpit` — **mọi thư kích hoạt và đặt lại mật khẩu hỏng**. Mà từ P13, thư kích hoạt là đường
DUY NHẤT để tài khoản có mật khẩu. Triệu chứng là **không ai đăng nhập được vào hệ thống vừa triển
khai**, và không có dòng log nào nhắc tới nguyên nhân.

Đây là loại lỗi mà bộ test không bắt được vì cả hai đầu đều đúng khi chạy ở môi trường test. Nó chỉ
lộ ra khi đọc chéo hai tệp cấu hình cạnh nhau.

`loadMailConfig` chuyển sang `packages/http-kit`; identity gọi nó ở tầng module nên hai chốt an toàn
của `NTF-16` giờ áp cho cả identity — cấu hình nguy hiểm thì service **không khởi động nổi**.
`MAIL_REDIRECT_ALL` và `MAIL_ALLOWLIST` cũng áp cho thư mời, trước đây thì không: dồn thư về hộp thư
QA mà thư mời vẫn bay tới người thật là đúng thứ biến đó dựng ra để chặn.

### Không gộp hai đường gửi thư — và vì sao

Đề nghị ban đầu của tôi là đẩy thư mời qua `notification` để có thử lại và hàng thư hỏng. **Sai**, và
chỗ sai lộ ra khi đọc lược đồ: `ntf.dead_letter.payload jsonb` lưu NGUYÊN thân sự kiện, và người
quản trị đọc được nó ở màn hình *Hệ thống*. Đẩy thư mời qua đó là đưa **token kích hoạt thô** vào một
bảng có người đọc — ai mở được màn hình thư hỏng là chiếm được tài khoản chưa kích hoạt. Hiện tại
token thô chỉ tồn tại trong bộ nhớ và trong thân email; CSDL chỉ giữ bản băm (`ONB-15`).

Nên identity giữ đường gửi riêng, và tự lo phần thiếu:

- **Thử lại ba lần** (0,2s · 1s · 3s) ngay trong tiến trình. SMTP chớp một nhịp là chuyện thường, mà
  không thử lại thì nhịp đó làm hỏng đúng cái thư người dùng đang chờ để vào hệ thống lần đầu.
- **Gửi hỏng không làm mất tài khoản.** Thư gửi sau khi transaction đã commit, nên ném ra là quản trị
  nhận 500 và không biết mình vừa tạo xong hay chưa — rồi thử lại và nhận 409. Giờ trả 201 kèm
  `inviteMailSent: false`, và màn hình nói đúng một câu có ích: tài khoản đã tạo, thư chưa đi, bấm
  *Gửi lại thư mời*. Nút đó **sinh token mới** chứ không phát lại token cũ — đúng cách thử lại một
  thư chứa bí mật dùng một lần.

### Chỗ nguy hiểm nhất của lượt này

`forgot-password` cũng gọi mailer. Ném ra thì **tài khoản có thật + SMTP hỏng trả 500, còn tài khoản
không tồn tại vẫn trả 200** — và chênh lệch đó chính là thứ cả đường ấy dựng ra để không có. Người
dò chỉ cần làm SMTP nghẽn một nhịp là đọc được danh sách tài khoản của công ty. Đã nuốt lỗi và có
test `PWD-09` thay tạm hàm gửi thư bằng một hàm luôn ném, rồi so cả mã lẫn thân phản hồi.

### Kết quả

637 case (thêm 5). Tài liệu `02-CHAY-DEMO.md` có mục *Email: cơ chế gửi* — địa chỉ người gửi, hai
đường gửi và vì sao tách, bảng biến môi trường, hai chốt an toàn.

### Còn nợ

`MAIL_FROM` vẫn là `csbh-noreply@nutricare.test`. `.test` là tên miền dành riêng cho thử nghiệm
(RFC 6761) nên nó không bao giờ gửi ra Internet thật được — phải đổi trước khi lên máy chủ, kèm khai
SPF · DKIM · DMARC cho tên miền thật.

---

## P14c — `make demo-mail` mở nhầm cổng, và một test đổi nguồn bằng chứng

Người dùng báo: *"make demo-mail chưa expose port 8025 từ docker ra host thì phải"*. Đúng, và hỏng
theo **hai tầng** chứ không phải một.

### Vì sao `--service-ports` không mở cổng nào

Lệnh cũ là `docker compose run --rm --service-ports mailpit`. `--service-ports` publish những cổng
**đã khai trong service**, mà `mailpit` không khai `ports:` nào cả — nên nó publish đúng không cổng
nào. Cờ đó có mặt và không làm gì, đó là lý do lỗi sống lâu.

Tầng thứ hai tệ hơn: `run` dựng một container **thứ hai**. Kể cả cổng có mở thì người ta vẫn nhìn vào
một tiến trình Mailpit riêng với hộp thư rỗng — không phải cái đang nhận thư của hệ thống.

### Một lớp phủ riêng, không phải thêm `ports:` vào `compose.yml`

`SEC-10` quét ba tệp compose và bắt đỏ nếu có service nào ngoài `caddy` publish cổng. Bất biến "chỉ
biên mạng mở cổng" chỉ có nghĩa khi phá nó là hành động **phải gõ ra**, nên phần mở cổng nằm ở
`deploy/compose.mail.yml` và chỉ vào theo `make demo-mail`, ra theo `make demo-mail-down`. Giao diện
Mailpit đọc được MỌI thư của hệ thống — kể cả liên kết kích hoạt và đặt lại mật khẩu, tức là chiếm
được mọi tài khoản — nên nó không được mở thường trực. `SEC-10` có thêm test biết đến tệp mới, để
danh sách ngoại lệ không phình ra trong im lặng.

Mailpit cũng được `MP_DATABASE` và một volume: mở hộp thư mà xoá mất thư cần xem thì mở làm gì.
`make demo` thêm bước dọn kho MinIO — xoá CSDL mà giữ nguyên object là để lại rác không ai dọn.

Kiểm trên chồng demo đầy đủ: 17 container trước và sau (không sinh container thừa),
`0.0.0.0:8025->8025/tcp`, HTTP 200, và thư gửi **trước** khi mở giao diện vẫn còn đó.

### `DOC-28` treo — bốn hướng, cả bốn đều sai

Một case đỏ suốt lượt này: `contract.test.ts › DOC-28` liệt kê MinIO để chứng minh không object hợp
đồng nào nằm lại, và lượt liệt kê không bao giờ kết thúc. Triệu chứng gốc là một ngoại lệ **không bắt
được** ném từ trong luồng — `Entity expansion limit exceeded: 1002 > 1000`, từ `fast-xml-parser` bên
trong `minio`, ở `Transform._flush`. `for await` không nhận được lỗi ném ra lúc `prefinish` nên nó
đứng chờ mãi một luồng đã chết; đổi sang nghe sự kiện `error` kèm trần thời gian biến 120 giây câm
lặng thành một thông báo rõ ràng, nhưng không chữa được nguyên nhân.

Bốn giả thuyết, mỗi cái một lượt chạy, **cả bốn đều bị bác**:

| Giả thuyết | Phép thử | Kết quả |
|---|---|---|
| Số object tích luỹ qua các lượt chạy | Xoá sạch bucket còn 0 object | Vẫn treo |
| Thư viện `minio` hỏng | Cùng lời gọi, tiến trình sạch, cùng máy chủ | 28ms |
| Socket/agent dùng lại bị hỏng | Dựng `Client` mới cho riêng lượt liệt kê | Vẫn treo |
| Dùng chung `XMLParser` với bộ trộn DOCX | Đọc `pnpm-lock.yaml` | `fast-xml-parser` chỉ có một người phụ thuộc là `minio`; `docx.ts` dùng `fflate` + regex, không đụng tới |

Giả thuyết cuối là hướng tôi tin lâu nhất và nó sai hoàn toàn — đã sửa lại chú thích ở `listKeys`,
vì một lời giải thích sai để lại trong mã còn tệ hơn không có lời giải thích nào.

### Đổi nguồn bằng chứng, không nới bất biến

Chưa tìm ra nguyên nhân gốc, nên câu hỏi là: điều cần chứng minh có nhất thiết phải đi qua lượt liệt
kê ấy không. Không. Bất biến là *"xuất hợp đồng không để lại gì trong kho"*, và `doc.stored_file` trả
lời đúng câu đó — mọi lượt ghi MinIO của ứng dụng đều kèm một dòng ở bảng này.

Điều kiện ấy là thứ làm phép thay nguồn có giá trị, nên nó được **ghim lại thành test riêng**: quét
`services/document/src` và khẳng định chỉ `files.service.ts` gọi `storage.put`, đúng hai điểm, cả hai
đều ghi CSDL ngay sau đó. Thêm một đường ghi kho thứ ba là test đỏ — chứ không phải phép soi kho qua
CSDL âm thầm mù đúng chỗ hợp đồng có thể lọt vào.

Hai chi tiết nhỏ nhưng cố ý: so **cả tập dòng** chứ không so số đếm (một cặp thêm-rồi-xoá giữ nguyên
số đếm nhưng vẫn là dấu vết), và phần kiểm enum `doc.file_purpose` tách thành test riêng khai thẳng
sáu giá trị — hợp đồng không được lưu nên nó không có mục đích lưu trữ nào, thêm giá trị mới thì
người thêm phải nói rõ nó dùng cho việc gì.

`listKeys` vẫn còn, `document.test.ts` vẫn dùng nó với tiền tố hẹp theo từng khách hàng và không
treo. Nguyên nhân gốc còn nợ lại.

---

## P15 — Ba chỗ sai ở màn hình người dùng

Ba lỗi hiển thị, nhưng một trong ba là lỗi **hướng dẫn sai**, không phải lỗi câu chữ.

### "Cấp trên" là nói sai về công ty

Kế toán không phải cấp trên của trình dược viên theo nghĩa tổ chức. Quan hệ ấy chỉ quyết định phạm
vi dữ liệu — ai nhìn thấy hồ sơ của ai — và gọi nó là "cấp trên" trên màn hình là để phần mềm phát
biểu một điều về cơ cấu công ty mà không ai yêu cầu nó phát biểu.

Thành bảng tra `NHAN_CAP_TREN`: TDV → *Kế toán quản lý*, Kế toán → *Sale Admin quản lý*. Sửa cả
nhánh kế toán chứ không riêng TDV, vì lý do áp dụng y hệt. Cột trong bảng danh sách mang hai nghĩa
tuỳ vai trò của dòng nên để nhãn chung là *Người quản lý*.

### Một câu 409 đúng ngữ pháp và sai việc

`ConflictException({ code: 'EMAIL_DUPLICATE' })` không kèm `message`, nên giao diện rơi xuống câu
mặc định cho mọi mã 409: *"Dữ liệu vừa được người khác thay đổi. Hãy tải lại rồi thử lại."*

Câu đó viết cho tranh chấp ghi đồng thời. Ở đây nó **sai hướng dẫn**: người quản trị tải lại bao
nhiêu lần thì tên tài khoản kia vẫn đang có người dùng. Việc phải làm là ĐỔI, mà câu kia không hề
nói điều đó — và người đọc làm đúng theo nó sẽ lặp lại đúng thao tác vừa hỏng.

Thêm `USERNAME_DUPLICATE`, và trùng cả hai thì báo cả hai trong một lần: sửa xong một cái rồi vẫn
nhận 409 là hai lượt bực mình liên tiếp cho cùng một việc. Test khẳng định thông báo **không chứa
chữ "tải lại"**.

### Kết quả

644 case. Hai cột người quản lý cùng hiển thị tên tài khoản — một cột họ tên cạnh một cột username
trông như hai loại dữ liệu khác nhau và không đối chiếu được với cột *Tài khoản*.

---

## P16 — Trưởng bộ phận thôi bắt buộc, và màn hình của chính mình

### Dời chỗ chặn, không xoá nó

Bỏ bắt buộc Trưởng bộ phận lúc tạo TDV là yêu cầu nghiệp vụ: lúc tạo thường chưa biết ai sẽ duyệt.
Nhưng bỏ trắng thì hồ sơ của TDV đó rơi vào **ngõ cụt im lặng** — hộp việc của TBP suy từ
`approver_user_id`, chưa gán thì hồ sơ nằm ở *Chờ TBP duyệt* mà không vào hộp việc của ai, đứng tới
khi quá hạn, và không màn hình nào nói vì sao.

Nên chốt chặn **dời sang lúc gửi hồ sơ** (`NO_APPROVER`, 422): chỗ hồ sơ vẫn là bản nháp, chưa mất
gì, và câu báo nói thẳng phải nhờ Quản trị gán trước. Việc này cần một đường hỏi mới giữa `policy`
và `identity` — `GET /internal/approver/:tdvUserId`. Trả riêng câu hỏi hẹp "có hay không" thay vì
dùng lại `notify-targets`, vì câu kia trả kèm địa chỉ thư của mọi người liên quan, và một service
chỉ cần biết có/không thì không nên cầm chỗ dữ liệu đó.

Bỏ luôn phép cấm **gỡ** liên kết ở `update()`. Giữ lại thì chẳng chặn được gì — tạo mới đã không bắt
buộc — chỉ làm người quản trị không sửa nổi một liên kết gán nhầm.

### Thu hẹp một yêu cầu, và nói ra

Yêu cầu là *"trừ email và username, mọi thông tin khác người dùng đổi được"*. Một tài khoản chỉ có
bốn trường: username, email, họ tên, **vai trò**. Nên "mọi thông tin khác" đúng nghĩa đen gồm cả vai
trò — mà đó là đường tự nâng mình lên Quản trị hệ thống. Đã khoá vai trò cùng hai trường kia và báo
lại người dùng thay vì im lặng làm hẹp.

Màn hình nói rõ vì sao từng trường bị khoá, thay vì hiện ô xám không giải thích: người không đọc
được lý do sẽ đi mở phiếu hỗ trợ hỏi đúng câu đó.

### Kết quả

653 case. Vào màn hình bằng cách bấm thẻ tên ở thanh trên cùng — chỗ người ta bấm khi muốn sửa tên
mình chính là chỗ đang hiện tên mình.

---

## P17 — Hỏi lại trước mọi thao tác không lùi được

Rà toàn bộ mã giao diện tìm mọi lời gọi ghi, xếp theo hậu quả, rồi chọn **ba mức** thay vì một hộp
thoại dùng chung.

| Mức | Dùng cho | Vì sao |
|---|---|---|
| Gõ lại định danh | Ban hành · ngừng dùng mẫu hợp đồng | Đổi hành vi của cả hệ thống. Gõ lại tên buộc người bấm phải đọc xem mình đang đứng ở dòng nào |
| Nêu hậu quả | 10 thao tác xoá và gửi ra ngoài | Đủ để dừng lại một nhịp, không đủ nặng để thành nghi thức |
| Hoàn tác | Bật/tắt người ký · kích hoạt lại tài khoản | Lùi được bằng một cú bấm. Hỏi trước ở đây là thêm một cú bấm cho một trăm lần đúng, để đỡ một lần sai vốn tự sửa được |

### Câu hỏi phải nói ra thứ sẽ hỏng

*"Bạn có chắc không?"* không thêm một thông tin nào; người đọc xong vẫn không biết mình sắp làm hỏng
cái gì, và lần thứ ba thì bấm theo phản xạ. Có **test quét mã nguồn cấm chính câu đó** trong giao
diện — và nó bắt nhầm ngay lượt đầu: các dòng CHÚ THÍCH giải thích vì sao không dùng câu ấy cũng bị
tính là vi phạm. Sửa để bỏ qua chú thích, vì cấm cả chú thích thì lời giải thích phải biến mất theo.

### Test giữ bất biến, không phải test đếm hộp thoại

Cái đáng giá hơn cả các hộp thoại là phép quét: tệp nào gọi `xoa()` hoặc chạm một trong năm đường
ghi ra ngoài hệ thống mà không có lớp hỏi lại thì đỏ. Một nút Xoá thêm ở màn hình mới sáu tháng nữa
sẽ bị bắt ngay, không chờ ai nhớ ra.

661 case. Cũng phát hiện `DELETE /customers/:id` có ở máy chủ và trong bảng quyền nhưng **không có
nút nào trên giao diện** — chưa thêm, vì đó là quyết định nghiệp vụ chứ không phải việc gắn hộp thoại.

---

## P18 — Đổi vai trò có chốt chặn, và tự đổi người quản lý

### Đảo một quyết định cũ, giữ lại lý do của nó

P11 cố ý **cấm** đổi vai trò: *"đổi vai trò làm lệch cây phân quyền và làm hồ sơ đang dở mắc kẹt
giữa luồng"*. Yêu cầu nghiệp vụ mở nó ra. Lý do cũ vẫn đúng nguyên, nên cái cấm thành **chốt chặn có
điều kiện** chứ không biến mất: `identity` hỏi `policy` qua `POST /internal/dang-do`, và trả 409 kèm
**danh sách mã hồ sơ** — "còn 3 hồ sơ" thì người quản trị không tra ra được ba hồ sơ nào.

`identity` gửi kèm phạm vi dữ liệu tính sẵn thay vì để `policy` hỏi ngược lại — vòng gọi ngược giữa
lúc `identity` đang xử lý request của chính nó là thêm một điểm hỏng cho một phép tra mà bên gọi đã
có sẵn câu trả lời.

### Chỗ dễ sót nhất, tìm ra khi đang viết test

Đổi vai trò xong phải dọn liên kết cây. Tôi định điều kiện là *"vai trò mới có ô cấp trên không"* —
**sai**. Đổi TDV → Kế toán thì ô cấp trên vẫn còn, nhưng người đang nằm trong đó là một kế toán,
trong khi cấp trên của kế toán phải là Sale Admin. Giữ lại là để một quan hệ **sai kiểu** trong cây,
và phạm vi dữ liệu suy ra từ đó thì sai mà không có lỗi nào báo. Điều kiện đúng là *"người đang gán
có đúng vai trò mà vai trò MỚI đòi hỏi không"*, tính bằng SQL vì câu trả lời nằm ở dòng của người kia.

### Hai lượt đỏ, cả hai là lỗi thật

1. `ThongTin.tsx` so vai trò bằng chuỗi viết thẳng — đúng thứ `quyen.test.ts` cấm, và cấm có lý: một
   chỗ sót kiểu đó thì không test nào bắt. Bảng tra cần dùng đã có sẵn từ P15.
2. Danh sách hồ sơ mắc lại **cắt nhầm đầu**: sắp theo mã rồi cắt ở 20, nên với `tdv01` — tài khoản
   gần như tệp test nào cũng dùng — hai mươi hồ sơ trả về là hai mươi cái **cũ nhất**, đúng những
   cái ít liên quan nhất tới việc vừa bị chặn. Sửa thành mới nhất trước, và trả thêm `count` là tổng
   thật: nói "còn 3 hồ sơ" trong khi thực tế còn 300 là nói sai với người đang phải quyết định.

### Tự đổi người quản lý — một quyết định nghiệp vụ, không phải tiện ích

Cho TDV tự chọn Trưởng bộ phận nghĩa là họ tự chọn người duyệt cho mình, và tự chuyển mình ra khỏi
tầm nhìn của kế toán đang quản lý. Đã nêu rõ trước khi làm và người dùng chọn cho tự do. Hộp thoại
xác nhận nói thẳng: hồ sơ đang chờ duyệt **chuyển sang hộp việc của người mới ngay lập tức**.

`/auth/managers` là đường riêng chỉ trả tên và tài khoản — `/admin/users` trả email của cả công ty,
và một TDV chọn TBP thì không cần danh bạ đó.

679 case, gồm cả hai nhánh của chốt chặn (hồ sơ do chính mình lập, và hồ sơ đang chờ đúng bước của
mình) cùng nhánh hồ sơ quá hạn — nhánh này giấu bước thật trong `pending_step` nên có truy vấn riêng.

---

## P19 — Danh mục sản phẩm chỉ còn Giá bán Công ty

Bỏ ô chọn loại giá thay vì để một ô chỉ có một lựa chọn: ô nhập mang thẳng nhãn *Giá bán Công ty*,
máy chủ tự điền loại. Bắt gửi một trường chỉ có đúng một giá trị hợp lệ là bắt gõ lại một hằng số.

Kiểm lại thì `GIA_BAN_BUON` **vốn đã là dữ liệu chết**: không service nào đọc, `catalog` chỉ tra
`GIA_BAN_CONG_TY` khi đóng băng giá cho hồ sơ. Và mục 6.1 của yêu cầu nghiệp vụ đã ghi sẵn *"Giá bán
buôn — Người đề nghị nhập"*, tức nó thuộc từng dòng của từng hồ sơ, khác nhau theo khách hàng. Một
con số cấp danh mục không tả được thứ đó.

### Ba quyết định ở tầng CSDL

- **Không xoá nhãn khỏi enum.** Postgres không xoá được nhãn enum tại chỗ — phải dựng type mới và
  đổi mọi thứ phụ thuộc, mà chẳng đổi lại được gì vì chốt chặn thật nằm ở `CHECK`.
- **Không xoá dòng lịch sử đã lỡ ghi.** Lịch sử giá là bản ghi một việc đã xảy ra; xoá nó là sửa lại
  quá khứ cho hiện tại trông gọn hơn.
- **`CHECK ... NOT VALID`** — chặn mọi dòng mới, không quét lại dòng cũ. Di trú chạy được trên CSDL
  đang có dữ liệu cũ mà không phải chọn giữa "hỏng" và "xoá dữ liệu người ta".

Bảng nhãn phía giao diện **rộng hơn** danh sách chọn được: vẫn biết `GIA_BAN_BUON` để bảng lịch sử
đọc ra chữ thay vì mã enum trần.

### Một lượt đỏ không phải của mình

80 case đỏ ở 17 tệp, kiểu lỗi trông như nghiệp vụ (`null value in column "tdv_user_id"`). Thực ra
Redis và Postgres rớt giữa lượt chạy — log đầy `ECONNREFUSED`, và các test của chính lượt sửa này
thậm chí bị **bỏ qua** chứ chưa chạy. Chạy lại cùng mã: 680/680 xanh.

Đáng ghi lại vì mất một lượt chạy mới nhận ra: `check-demo-down` chỉ kiểm container `gateway`, nên
chồng container bị gỡ giữa chừng thì không có gì cản, và triệu chứng đội lốt lỗi nghiệp vụ.

---

## P20 — Danh mục còn ba thẻ, thêm tìm kiếm, gỡ mục Người ký

Năm thẻ → ba: *Sản phẩm* · *Quy định chiết khấu* · *Giấy tờ mẫu*. Hai thẻ cũ **không mất chức năng**,
chúng thành khối bên trong: nhóm sản phẩm nằm dưới bảng sản phẩm (việc thường ngày là tra sản phẩm,
thêm nhóm là việc hiếm), danh mục tra cứu vào thẻ chiết khấu (kênh phân phối là một chiều của chính
quy định chiết khấu).

### Suýt làm hỏng bộ gõ tiếng Việt

Tôi viết một `OTimKiem` mới cho ô tìm kiếm. Typecheck báo **trùng tên** — đã có sẵn một cái xử lý
`compositionstart`/`compositionend` theo `FE-31`. Bản của tôi gọi lọc ở mỗi lần `change`, tức là gõ
Telex "Đà Nẵng" đi qua trạng thái trung gian "Dda Nawng" sẽ bị React ghi đè giữa lúc bộ gõ đang bỏ
dấu — **mất dấu hoặc mất ký tự**. Đã bỏ bản mới, dùng bản có sẵn.

Đây là lần thứ hai trong dự án một quy tắc cũ cứu một đoạn mã mới, sau `quyen.test.ts` ở P18.

### Gỡ màn hình không phải là xoá nghiệp vụ

*Người ký* gỡ khỏi giao diện vì yêu cầu chưa rõ: không có mô tả nào nói người ký dùng ở đâu trong
luồng, ai gán, và đổi người giữ chức thì hồ sơ đã ký chịu ảnh hưởng gì. API `/catalog/signers` và
test của nó vẫn còn — một màn hình mà người dùng điền vào cũng không biết để làm gì thì tệ hơn là
không có.

### Một thẻ rỗng, và vì sao không giấu nó đi

Thẻ *Giấy tờ mẫu* lượt này không có gì: mẫu hợp đồng vẫn thuộc Sale Admin theo quyết định 06/08
(`DOC-26` bắt Quản trị nhận 403), còn mẫu hồ sơ CSBH tách sang lượt sau. Vẫn dựng thẻ với trạng thái
rỗng nói rõ sẽ có gì và mẫu hợp đồng nằm ở đâu — người quản trị đi tìm ở đây rồi kết luận hệ thống
thiếu chức năng thì tệ hơn một thẻ trống có lời giải thích.

685 case. Tìm kiếm khớp **cả tên lẫn mã** và **bỏ dấu**: người dùng đọc mã từ hoá đơn giấy nhiều hơn
là nhớ tên đầy đủ, nên ô chỉ ăn tên sẽ làm họ tưởng sản phẩm không tồn tại.

### Còn nợ sau lượt này

Mẫu hồ sơ CSBH tải lên. Khi làm phải trả lời trước một câu: **nếu mẫu do người dùng soạn, hệ thống
không còn bảo đảm được 13 mục bắt buộc của mục 8.2 có mặt.**

---

## P22 — "Danh mục" tách thành ba mục menu

Năm thẻ trong một mục menu là **một tầng điều hướng thứ hai nằm trong tầng thứ nhất**: bấm "Danh
mục" rồi vẫn phải bấm tiếp mới tới thứ mình cần, và thanh bên không cho biết mình đang đứng ở đâu.
Ba mục ngang hàng — Sản phẩm · Chiết khấu · Giấy tờ mẫu — thì bấm một lần là tới, và mục đang mở tự
sáng lên.

Hai quyết định kèm theo:

- **Giữ `/danh-muc` trỏ về màn hình Sản phẩm.** Liên kết đã lưu trong trình duyệt và trong tài liệu
  chạy demo vẫn còn dùng đường đó; bỏ hẳn là để người ta bấm vào một trang "không có màn hình nào ở
  địa chỉ này".
- **Xoá bảng thẻ `MUC_DANH_MUC`.** Từ giờ `DIEU_HUONG` bên `can.ts` là nguồn duy nhất — hai bảng
  cùng khai một danh sách là hai bảng sẽ lệch nhau.

Thẻ *Giấy tờ mẫu* rỗng, và nói rõ vì sao: mẫu hợp đồng thuộc Sale Admin ở màn hình riêng (quyết định
06/08, `DOC-26`), mẫu hồ sơ CSBH tách sang lượt sau.

685 case.

---

## P23 — Sản phẩm và Nhóm sản phẩm thành hai thẻ

Hai bảng xếp chồng thì bảng nhóm nằm dưới một bảng sản phẩm dài, phải cuộn qua hết mới tới — mà nó
lại là thứ phải làm **trước** khi tạo sản phẩm đầu tiên, vì chưa có nhóm nào thì nút *Tạo sản phẩm*
không bấm được.

Thẻ *Sản phẩm* vẫn đứng trước dù thứ tự phụ thuộc là nhóm-trước-sản-phẩm: tra sản phẩm là việc hàng
ngày, thêm nhóm là việc vài lần một năm. Bù lại, hướng dẫn sử dụng nói thẳng "làm thẻ Nhóm trước nếu
danh mục còn trống".

Phải sửa lại lời của chính mình ở P22: chú thích trong `lib/danh-muc.ts` viết "KHÔNG còn bảng thẻ ở
đây" — câu đó nói về bảng **mục menu**, để nguyên thì mâu thuẫn với bảng thẻ vừa thêm. Một dải thẻ
NẰM TRONG một màn hình không phải một tầng điều hướng.

687 case.

---

## P24 — Chiết khấu vô thời hạn, và định dạng số khi đang gõ

### Xoá cột chứ không để lại NULL

Quy định chiết khấu bỏ ngày hết hiệu lực, theo đúng luật của chính CSBH. **Xoá hẳn cột** `effective_to`
thay vì để nó luôn NULL: một cột luôn NULL là một cột người đọc mã phải dừng lại để hỏi "còn dùng
không", và câu trả lời chỉ nằm trong lịch sử git.

### Tên khách hàng hiện sai ở màn hình lập hồ sơ

Lớp `.viec-lien` viết cho thẻ `<a>`, nhưng màn hình chọn khách hàng đặt nó lên `<button>` — bấm là
chọn, không đi đâu cả. Không có luật reset thì trình duyệt vẽ nút mặc định **đè lên**: chữ về phông
hệ thống cỡ nhỏ, canh giữa, nằm trong một hộp xám co lại vừa nội dung.

### Ô nhập số

Đơn vị hiện ngay **trên** ô, không đặt trong ô (lẫn với con số đang gõ) cũng không đặt sau ô (trên
điện thoại nó rơi xuống dòng dưới). Tiền hiện dấu phân nhóm nghìn ngay khi gõ nhưng vẫn báo ra chuỗi
số trần — gửi "90.000" thì `money()` bên máy chủ từ chối.

Ô phần trăm cắt hai chữ số thập phân **lúc đang gõ**, và nó phải chịu được trạng thái gõ dở: `"12,"`
là chuỗi người dùng bắt buộc phải đi qua để gõ `"12,5"`. Chuẩn hoá quá tay ở đây là ô tự xoá ký tự
vừa gõ, và không nhập được phần thập phân nữa.

Đổi sang dấu phẩy kéo theo một lỗi phải sửa luôn: `Number("12,34")` ra `NaN`, nên ô ngưỡng sẽ báo
"không phải số". Thêm `doiSoThapPhan` nhận cả dấu phẩy lẫn dấu chấm — bàn phím số trên laptop chỉ có
dấu chấm.

### `POL-12` đỏ, và cách viết test mới là vấn đề

Test khẳng định `threshold` bằng đúng `'15.00'`, tức ngầm giả định thêm một điều kiện — *không quy
định chiết khấu nào khớp sản phẩm này* — mà điều kiện đó phụ thuộc dữ liệu của **tệp test khác đang
chạy song song** trên cùng CSDL (`catalog.test` có bước `DELETE FROM cat.discount_rule`). Đổi sang
hỏi thẳng danh mục rồi so. Bỏ ngày hết hiệu lực làm giả định cũ càng dễ vỡ.

693 case.

---

## P25 — CPBH số lượng tự do theo từng dòng

Bỏ bốn cột cứng `cpbh1..cpbh4`, thay bằng một **mảng**. Mỗi sản phẩm có số khoản chi phí khác nhau;
bắt điền đủ bốn là bắt gõ số 0 vào những ô không có nghĩa gì, rồi ba cột số 0 ấy đi thẳng ra bản in.

### Mảng chứ không bảng con

Cân nhắc cả hai. Các khoản CPBH **không có thuộc tính riêng** — không tên, không loại, không ghi
chú; chúng chỉ là một dãy số có thứ tự. Bảng con đúng "chuẩn" hơn nhưng đổi lại là một phép nối cho
mỗi lần đọc hồ sơ và xoá-rồi-chèn cả nhóm cho mỗi lần sửa, mà không mua được gì.

Hai cột tự tính phải dựng lại vì chúng sinh từ bốn cột sắp biến mất. Tổng một mảng cần một hàm
`IMMUTABLE` thì cột sinh mới nhận; mảng rỗng phải cho **0 chứ không NULL** — `sum()` của mảng rỗng
trả NULL, và `net_price` mà NULL thì mọi phép so sánh sau đó im lặng sai.

Nạp lại dữ liệu cũ giữ **đủ bốn phần tử kể cả số 0**: số 0 người dùng đã nhập là một con số họ đã
nhập, cắt đi là tự ý sửa hồ sơ đã lập của họ.

### Luật in

Số cột lấy theo dòng **nhiều khoản nhất**, dòng ít hơn để **ô trống** — không điền số 0 thay, vì số
0 là một con số *có nghĩa* ("khoản này bằng không") còn ô trống nói đúng điều cần nói. Luật này viết
ở hai chỗ (bản A4 và bảng trên màn hình) và có chú thích chéo giữa chúng: hai con số lệch nhau nghĩa
là bản trên màn hình khác bản đem ký.

### Một quy ước bị phá, và test bắt được

Khai `cpbh: danhSach(...)` mà không bọc `opt()`. `danhSach` tự trả mảng rỗng khi thiếu trường nên nó
**thực tế** là không bắt buộc — nhưng `opt()` mới là dấu hiệu duy nhất của "không bắt buộc" trong cả
kho mã, và `bat-buoc.test` đọc chính dấu hiệu đó để đối chiếu dấu sao trên biểu mẫu với DTO. Bỏ nó
thì giao diện gắn sao cho ô CPBH và nút Lưu chết mà không ai hiểu vì sao.

703 case.

---

## P26 — Sửa được dòng sản phẩm, không chỉ xoá

Trước đây giao diện chỉ có Xoá, nên đổi một con số nghĩa là xoá dòng rồi thêm lại — gõ lại cả giá
bán buôn lẫn mọi khoản chi phí, và giữa hai thao tác thì hồ sơ thiếu mất một sản phẩm.

### Một phán đoán sai, và test bắt ngay

Tôi tưởng máy chủ đã làm được: `POST .../lines` trông như upsert. **Sai** — đường
`ON CONFLICT DO UPDATE` nằm ở lối TẠO hồ sơ, còn thêm dòng thì cố ý trả 409 `DUPLICATE_PRODUCT`
(`POL-02`). Nếu tin vào phán đoán ấy mà bỏ qua bước chạy test thì nút *Sửa* sẽ luôn báo lỗi khi bấm.

### Đường riêng, không cho POST ghi đè

`PATCH /policies/:id/lines/:lineId`. Trùng sản phẩm lúc **thêm** là một nhầm lẫn — người dùng tưởng
mình đang thêm mặt hàng mới — và biến nó thành ghi đè im lặng là đánh mất một cái chặn đúng để đổi
lấy một chức năng khác hẳn.

Ba điều khoá lại:

- **`productId` không nằm trong DTO.** Đổi sản phẩm của một dòng là xoá dòng này và thêm dòng khác;
  hai việc có ý nghĩa nghiệp vụ khác nhau và để lại vết khác nhau trong nhật ký.
- **Giá bán Công ty và ngưỡng chụp lại theo danh mục** tại thời điểm sửa. Hồ sơ chưa gửi duyệt thì
  con số của nó phải là con số hiện hành — nếu không thì sửa một khoản chi phí lại vô tình giữ
  nguyên một mức giá đã cũ.
- Sự kiện `LINE_UPDATED` tách khỏi `LINE_ADDED`/`LINE_REMOVED`.

Giao diện dùng lại đúng biểu mẫu thêm dòng, ô chọn sản phẩm **khoá lại** khi sửa. Sản phẩm đã vô
hiệu hoá vẫn hiện đúng tên: danh sách chọn lọc bỏ chúng nhưng hồ sơ cũ vẫn giữ, nên ô chọn tự thêm
một mục dựng từ chính dòng đang sửa — không có nó thì ô hiện rỗng và người dùng tưởng dữ liệu hỏng.

712 case.

---

## P28 — Trùng và thiếu quy định chiết khấu

Câu hỏi mở màn: *một sản phẩm thoả mãn hai quy định chiết khấu thì sao?* Đọc mã thì hệ thống đã xử
đúng — `ORDER BY specificity DESC, effective_from DESC, id` — nhưng tầng thứ ba là một cái hố.

### Vì sao chỉ có tầng ba là hố

Trọng số của `specificity` là **4/2/1**, tức là nhị phân, nên tám tổ hợp cho tám con số phân biệt:
**hai phạm vi khác nhau không bao giờ hoà điểm**. Suy ra hoà điểm ⇒ hai dòng khai cùng bộ chiều; mà
cả hai cùng khớp một truy vấn ⇒ ba giá trị phạm vi giống hệt nhau. Nói cách khác, **hoà điểm chỉ xảy
ra khi trùng phạm vi**, và lúc đó `effective_from DESC` — cơ chế đổi ngưỡng duy nhất còn lại sau
`0020` — vẫn xử đúng.

Chỉ còn đúng một tình huống chạm tới `id`: trùng phạm vi **và** trùng ngày hiệu lực. Tất định thì có
tất định, nhưng `gen_random_uuid()` không mang ý nghĩa nghiệp vụ nào. Người khai hai dòng 15% và 20%
không có cách nào biết trước dòng nào ăn.

### Bịt ở chỗ đúng

Không sửa `ORDER BY` mà **không cho tồn tại** hai dòng trùng phạm vi. Chỉ mục duy nhất trên bốn cột
phạm vi + ngày, và mấu chốt là **`NULLS NOT DISTINCT`**: mặc định Postgres coi mỗi NULL là một giá
trị riêng, nên hai dòng *"mọi nhóm, mọi loại KH, mọi kênh"* cùng ngày vẫn lọt qua chỉ mục thường —
mà đó chính là cặp dễ khai trùng nhất, vì nó là dòng người ta khai đầu tiên khi chưa nghĩ tới phạm
vi. Cần Postgres 15+; hệ thống chạy 16.

Sau chỉ mục ấy, tầng `id` không còn với tới được. **Vẫn giữ nó trong `ORDER BY`** — lưới an toàn
phòng khi chỉ mục bị gỡ, bỏ hẳn thì mất tính tất định trong đúng cái tình huống lẽ ra không xảy ra.

Từ chối chứ không ghi đè, mã riêng `RULE_SCOPE_DUPLICATE`: người khai có thể đang định sửa ngưỡng
dòng cũ, mà cũng có thể đang khai nhầm dòng thứ hai. Ghi đè là đoán hộ họ ý thứ nhất và xoá mất dữ
liệu nếu đoán sai.

Migration dọn dữ liệu trùng có sẵn trước khi dựng chỉ mục, **giữ lại đúng dòng đang có hiệu lực**
(`id` nhỏ nhất — chính là dòng `resolve` vẫn chọn). Các dòng bị xoá đã bị che từ lúc được khai và
chưa từng được chọn, nên không hồ sơ nào đổi kết quả.

### Nửa còn lại: không quy định nào khớp

Hồ sơ vẫn lập được, ngưỡng rơi về mặc định của sản phẩm — nhưng trước P28 **không ai biết điều đó
đã xảy ra**. Ba lớp:

- **Dòng hồ sơ nhớ nguồn** — `threshold_source` và `rule_id_snap`, đóng băng cùng lúc với
  `threshold_snap` từ cùng một lời gọi `resolve`. `NULL` là **không rõ** (dòng lập trước `0022`),
  không phải `PRODUCT_DEFAULT`: tô vàng hàng loạt dòng cũ chỉ vì thiếu dữ liệu là báo động giả, và
  báo động giả hàng loạt thì lần sau không ai nhìn màu vàng nữa. Một `CHECK` giữ hai cột khớp nhau.
- **Cảnh báo lúc chọn sản phẩm**, không phải sau khi lưu — ngưỡng đóng băng ngay lúc bấm Lưu, biết
  sau thì phải xoá dòng, nhờ Quản trị khai quy định, rồi nhập lại từ đầu. Cần một đường mới,
  `GET /policies/:id/threshold-preview`: ngưỡng phụ thuộc loại khách và kênh, mà hộp thoại sửa dòng
  chỉ cầm mã hồ sơ. Bắt giao diện tự đi lấy khách hàng rồi ghép tham số là chép luật tra ngưỡng sang
  giao diện.
- **Nền vàng + dấu ◆ + chú thích màu.** Dòng vừa vượt ngưỡng vừa thiếu quy định: nền **đỏ** thắng
  (nó là thứ phải xử lý), dấu ◆ vẫn còn vì hai chuyện khác nhau.

### Ba quyết định nhỏ đáng ghi

- **Không khoá ngoại** từ `rule_id_snap` sang `cat.discount_rule`: `policy` không đọc được schema
  `cat` (AD-02), và ảnh chụp phải sống sót khi quy định bị xoá — khoá ngoại thì hoặc chặn xoá hoặc
  xoá luôn dấu vết.
- **Lỗi mạng lúc xem trước không hiện gì.** Đây là thông tin thêm, không phải điều kiện để lưu; một
  khối đỏ cạnh biểu mẫu đang gõ dở chỉ làm người dùng tưởng mình vừa làm hỏng thứ gì. Máy chủ vẫn
  tra lại lúc lưu.
- **Chú thích màu nằm trong `BangSanPham`**, không ở trang gọi — mọi chỗ bày bảng đều bày cùng bộ
  màu, để trang tự thêm thì sớm muộn có một trang quên.

### Hai test đỏ, và cả hai đều đúng

Chú thích màu cố tình dùng **đúng** lớp `.dau-vuot` và `.dau-mac-dinh` của dấu thật — một chú thích
vẽ ký hiệu khác thì không đối chiếu được, tức là không còn là chú thích. Nên
`document.querySelectorAll('.dau-vuot')` đếm dư đúng một cái, và hai test cũ đỏ ngay.

Sửa **test**, không sửa mã: câu hỏi các test ấy đặt ra là *"dòng nào mang dấu"*, không phải *"có dấu
nào trên trang"*. Thêm `dauTrongDuLieu()` khoanh vùng vào `.bang-san-pham` và `.the-san-pham`.

743 case (712 → 743).

### Còn nợ

- Bản in A4 **không hiện** dấu thiếu quy định. Người ký bản cứng không thấy được điều mà người duyệt
  trên màn hình thấy. Chưa làm vì chưa rõ nó nên hiện thành cột riêng hay chú thích chân trang.
- `rule_id_snap` **chưa có màn hình nào đọc** — nó dành cho truy vết bằng truy vấn. Đủ dùng, nhưng
  nghĩa là không lối nào trên giao diện bảo vệ nó khỏi bị bỏ quên khi sửa mã sau này; chỉ có test
  HTTP giữ.

---

## P29 — Gỡ cái chặn sai, và đường truy vết bằng mã quy định

Bốn việc, mà ba trong số đó là một chuỗi.

### Cái chặn sai

P28 để nguyên `THRESHOLD_NOT_CONFIGURED`: sản phẩm không có cả quy định lẫn ngưỡng mặc định thì
**không thêm dòng vào hồ sơ được**. Người dùng gặp ngay, và họ đúng.

Cái chặn ấy sai về nghiệp vụ. Ngưỡng chỉ để **cảnh báo** — vượt ngưỡng còn không chặn gửi duyệt
(muc 6.3). Không có ngưỡng thì chỉ có nghĩa là không đối chiếu được, chứ hồ sơ vẫn đủ mọi con số của
nó. Nó còn đẩy người lập vào ngõ cụt: TDV không có quyền khai quy định chiết khấu lẫn ngưỡng mặc
định của sản phẩm, nên việc duy nhất họ làm được là dừng lại chờ Quản trị.

Thêm giá trị thứ ba `KHONG_CO` thay vì để `threshold_source` NULL: NULL đã có nghĩa sẵn là "dòng lập
trước `0022`, không rõ nguồn". Gộp hai thứ đó lại thì không phân biệt được **"đã tra và biết chắc là
không có"** với **"chưa từng tra"**.

Hai chỗ suýt sai, cả hai đều lặng lẽ:

- **`threshold: 0` thay cho `undefined`.** `computeLine` hiểu `undefined` là "không đối chiếu được",
  còn `0` là "ngưỡng bằng không" — mọi dòng sẽ bị đánh dấu vượt ngưỡng. Truyền có điều kiện, và có
  một test lấy chiết khấu 90% để chứng minh cờ vẫn tắt.
- **Cột sinh `over_threshold`** đã có sẵn `threshold_snap IS NOT NULL` từ `0001`, nên tầng CSDL vốn
  đã đúng. Nếu không thì `NULL > x` cho NULL, và một cột boolean NULL đọc ra là "không vượt" ở chỗ
  này, "không xác định" ở chỗ khác.

Bản in A4 cũng vốn đã đúng: `pct()` trả `—` cho NULL.

### Chuỗi ba việc: Id · QĐCK · bỏ Độ cụ thể

Ba yêu cầu rời nhau trên giấy nhưng là một chuyện. Cột *Độ cụ thể* từng là câu trả lời cho "vì sao
hồ sơ này lấy ngưỡng 25% chứ không 30%" — nhưng nó bắt người đọc tự học luật trọng số 4/2/1, trong
khi cột *Áp dụng cho* ngay bên cạnh đã nói rõ dòng nào hẹp hơn.

Câu trả lời mới đi thẳng: dòng hồ sơ mang **mã của đúng quy định** đã cho ra ngưỡng của nó (cột
QĐCK), bảng quy định có cột **Id** cùng mã, và ô tìm kiếm khớp **chuỗi con của mã**. Chép — dán —
xong. Bỏ *Độ cụ thể* mà quên một trong hai mảnh kia là bỏ đi một câu trả lời và không đưa lại gì;
tệp test cho bảng quy định nói đúng câu đó ở phần đầu.

Ba quyết định nhỏ:

- **Mã hiện nguyên vẹn**, không cắt. Cắt bớt là cắt luôn công dụng của cột. Đổi lại dùng chữ đơn
  cách cỡ nhỏ — uuid đọc theo từng ký tự nên chữ đơn cách dễ dò hơn hẳn, và hẹp hơn khoảng một phần
  năm trong một bảng vốn đã mười cột.
- **Ô QĐCK để TRỐNG** khi không có, không phải "—" hay "không có". Cột kế bên đã mang dấu ◆ nói đúng
  điều đó rồi.
- **Bố trí thẻ (<640px) chỉ hiện QĐCK khi có.** Một ô rỗng mang nhãn ở màn hình hẹp nhất là một dòng
  chữ không nói gì — khác với bảng, nơi cột phải đều nhau.

Ô tìm khớp **con số đang hiện trên màn hình** (`25,00`) chứ không phải giá trị lưu (`2500`): gõ cái
mình đang nhìn thấy mới là điều người ta làm. Có test cho cả hai phía.

`rule_id_snap` từ chỗ "chưa màn hình nào đọc" — món nợ P29 tự ghi — thành thứ nằm giữa đường đi hàng
ngày. Nợ đóng bằng cách dùng nó, không phải bằng cách xoá nó.

773 case (743 → 773).

### Còn nợ

- Bản in A4 vẫn **không hiện** dấu thiếu quy định lẫn cột QĐCK. Người ký bản cứng không thấy được
  điều người duyệt trên màn hình thấy.
- Ô tìm quy định lọc **phía giao diện**, trên 200 dòng đầu như bảng sản phẩm. Vượt 200 quy định thì
  phải chuyển sang lọc phía máy chủ; chưa tới ngưỡng đó nên chưa làm.

---

## P30 — `make demo-mau` chết bằng một vết ngăn xếp không nói gì

Không phải lỗi trong mã: bộ dữ liệu mẫu nạp **qua API thật** nên nó đòi mười service đang sống, mà
chồng demo lúc ấy đã hạ. Chạy lại với chồng đang chạy thì xanh ngay, không sửa một dòng nào.

Cái đáng sửa là **cách nó hỏng**. Lệnh dựng lại ảnh gateway mất khoảng một phút, in bốn mươi dòng
log docker, rồi chết bằng:

```
TypeError: fetch failed
  [cause]: Error: getaddrinfo ENOTFOUND gateway
```

Một vết ngăn xếp Node không nhắc gì tới chồng demo. Đọc xong không biết phải làm gì tiếp — và đây là
lệnh người dùng gõ đúng vào lúc họ vừa mất dữ liệu demo, tức là lúc dễ hoang mang nhất.

Thêm `check-demo-up`, đúng điều kiện NGƯỢC LẠI của `check-demo-down` đã có sẵn. Cần một cái riêng
chứ không dùng chung: `make test` chỉ đòi CSDL không bị ai giành, còn `demo-data` đòi cả mười service
sống. Gắn vào `demo-mau` và cả `demo-data` — ai gọi thẳng `demo-data` cũng phải được chặn.

Nó dừng trong **không giây** thay vì sau một phút build, và nói đủ ba điều: chuyện gì, làm gì tiếp,
và hệ quả (`make demo` xoá sạch CSDL demo). Kiểm cả hai chiều: chồng đang chạy thì mã thoát 0, hạ
gateway xuống thì mã thoát 1 kèm đúng câu ấy.

### Điều đáng ghi hơn cả

Kho mã này đã có `check-demo-down` từ lâu, tức là **cái bẫy "demo và test giành nhau một CSDL" đã
được nhận ra và đã được rào một nửa**. Nửa còn lại không ai nghĩ tới cho tới khi có người vấp. Một
cái rào dựng theo hướng mình vừa đi qua thường chỉ chắn đúng hướng đó.

---

## P31 — Loại khách hàng: hiện ra, và sửa được

Hai yêu cầu rời nhau, nhưng chúng vá đúng một lỗ. Loại khách hàng quyết định ngưỡng chiết khấu của
**mọi dòng sản phẩm** trong mọi hồ sơ của khách ấy — mà màn hình khách hàng không hiện nó ở đâu cả,
và biểu mẫu sửa thì khoá nó lại.

### Một quyết định cũ bị lật, và vì sao lật là đúng

Bản trước chốt "loại khách hàng không sửa được sau khi lưu: nó quyết định ngưỡng chiết khấu". Nghe
hợp lý, và nó sai — vì cái giá của lệnh cấm không được cân.

Khách hàng **có** đổi hạng. Khi đổi, cách duy nhất còn lại là lập một khách hàng mới với mã mới, tức
là **cắt đôi lịch sử CSBH của cùng một khách**: báo cáo hết đọc được liên tục, và màn hình "CSBH
đang áp dụng" của khách cũ vĩnh viễn trỏ vào một bản ghi không còn ai dùng. Đổi lấy điều gì? Một rủi
ro mà `threshold_snap` đã chặn từ `0001`.

### Cái phải chứng minh không phải "sửa được", mà "sửa an toàn"

Bốn test HTTP, và cái đầu quan trọng nhất: **hồ sơ Nháp đã lập giữ nguyên ngưỡng cũ sau khi đổi
loại.** Nếu ngưỡng tự đổi theo thì một con số trong hồ sơ đang mở thay đổi dưới tay người đang xem,
không do thao tác nào của họ gây ra — thứ khó tin hơn hẳn một con số cũ.

Sản phẩm dựng riêng cho nhóm test này có **ba ngưỡng khác nhau** cho ba loại khách (10% · 20% · 30%).
Dùng sản phẩm ngưỡng đều nhau thì cả bốn test đều xanh kể cả khi mã sai hoàn toàn.

Đường tự cập nhật duy nhất là mở hồ sơ ra, bấm *Sửa* ở từng dòng — `upsertLine` tra lại `resolve` mỗi
lần ghi. Câu ấy nằm nguyên văn trên hộp thoại, và có một test đi đúng đường đó.

### Hai chi tiết nhỏ, cùng một lối nghĩ

- **Cảnh báo chỉ hiện khi ô THẬT SỰ đổi giá trị.** Bày sẵn một khối vàng ở mọi lượt sửa tên hay địa
  chỉ là dạy người dùng bỏ qua nó, và tới lúc họ đổi loại thật thì nó đã thành nền.
- **`customerType` chỉ gửi khi đã đổi.** Gửi kèm ở mọi lượt sửa thì một lần sửa địa chỉ cũng ghi một
  dòng "đổi loại khách hàng" vào nhật ký kiểm toán — nhật ký đầy những thay đổi không có thật thì
  không ai đọc nữa. Có test đọc thẳng thân request để chốt cả hai chiều, và chốt luôn rằng nó gửi
  dạng **số** chứ không phải chuỗi (`int(1, 3)` ở máy chủ).

`nhanLoaiKhach()` thay cho bốn chỗ nội suy `Loại ${n}`: khi nghiệp vụ đặt tên thật cho ba loại thì
chỉ sửa một chỗ.

790 case (773 → 790).

### Còn nợ

- Hồ sơ **Nháp** của khách vừa đổi loại mang ngưỡng cũ mà **không có dấu hiệu nào** trên màn hình nói
  ra điều đó. Người lập phải nhớ. Một dấu "ngưỡng chụp theo loại cũ" trên dòng sản phẩm sẽ đóng chỗ
  này, nhưng nó cần dòng hồ sơ nhớ luôn loại khách lúc chụp — chưa có cột đó.

---

## P32 — Mã quy định do người dùng đặt, và một nguồn ngưỡng duy nhất

Hai yêu cầu, và cả hai đều là **dọn lại thứ P28–P29 vừa dựng**.

### Mã: uuid đi ra tới mặt người dùng là một lỗi thiết kế

`0023` đưa mã quy định lên ba chỗ người dùng nhìn thấy — cột *Id*, cột *QĐCK*, ô tìm kiếm — trong khi
nó vẫn là `gen_random_uuid()`. Ba mươi sáu ký tự không ai đọc được, nhớ được, hay đọc qua điện thoại
được. Một mã được **chép ra khỏi hệ thống** thì phải do người dùng đặt.

`code text` thành khoá chính, `id uuid` biến mất. Có tiền lệ ngay trong kho: `cat.province` (CAT-16)
chốt "khoá chính là MÃ, không phải id sinh tự động". Ở đây lý do còn mạnh hơn.

Chuẩn hoá `upper(btrim(code))` như mã vật tư (CAT-02): hai mã chỉ khác hoa thường là hai mã người
dùng đọc ra giống hệt nhau, và một trong hai sẽ không bao giờ tìm được bằng ô tìm kiếm.

Nạp lại dữ liệu cũ sinh mã từ tám ký tự đầu của uuid. Xấu, nhưng **không mất liên kết** — và nhánh
`coalesce` dựng mã từ chính uuid mồ côi là cần thiết: quy định có thể đã bị xoá trong khi dòng hồ sơ
vẫn phải nhớ nó đã dùng dòng nào. Bỏ nhánh ấy thì `nguon_nguong_hop_le` vỡ ngay giữa migration.

**Một test đỏ dạy đúng bài học.** Trùng mã đến từ **HAI** ràng buộc — `discount_rule_pkey` khi trùng
y nguyên, `uq_rule_code_norm` khi chỉ khác hoa thường. Bản đầu dò chuỗi `'code'` trong tên ràng buộc
nên bỏ sót cái thứ nhất, và trùng mã y nguyên lại báo là *trùng phạm vi*. Sửa bằng cách nhận diện
theo **đúng một tên** — `uq_rule_pham_vi` — rồi coi mọi tên còn lại là trùng mã. Danh sách trắng một
phần tử bền hơn danh sách đen dò chuỗi.

### Ngưỡng mặc định: một nguồn thứ hai, và nó vô hình

Ba cột `default_rate2_type1/2/3` trên sản phẩm là **nguồn ngưỡng thứ hai** song song với bảng quy
định — trong khi chính `0005` đã chốt bảng quy định là "NGUỒN DUY NHẤT kiểm vượt ngưỡng".

Điều tệ hơn: nguồn thứ hai ấy **không có màn hình nhập**. Nó chỉ vào hệ thống qua nhập Excel và qua
script, rồi âm thầm thắng ở mọi sản phẩm chưa khai quy định. Người dùng nhìn màn hình Chiết khấu thấy
bảng trống mà hồ sơ vẫn có ngưỡng, và không có gì giải thích con số ấy từ đâu.

Xoá cột chứ không để lại, cùng lý do đã ghi ở `0020`. `PRODUCT_DEFAULT` **giữ nguyên trong ràng
buộc**: dòng hồ sơ đã lập theo nguồn ấy vẫn còn, và ngưỡng của chúng vẫn đúng tại thời điểm lập. Cấm
nhãn cũ là làm hỏng chính những dòng ấy.

File Excel mẫu cũ vẫn nhập được, ba cột thừa bị **bỏ qua** chứ không báo lỗi — chặn là bắt người dùng
sửa lại một file họ đã có, để đổi lấy đúng con số không.

### Cái giá phải trả, ở chỗ không ngờ

Bộ test. `makeProduct` của `policy.test.ts` từng dựa vào ngưỡng mặc định 15% để mọi phép so sánh có
một con số; giờ nền của cả tệp phải **khai một quy định**, đúng như người dùng thật sẽ phải làm. Và
fixture ba ngưỡng của P31 — thứ chứng minh việc đổi loại khách hàng là an toàn — chuyển từ ba cột
trên sản phẩm thành **ba dòng quy định**. Nó đúng chỗ hơn hẳn.

Đó là dấu hiệu tốt: khi bỏ một đường tắt, chỗ đau nhất là những nơi đã quen dùng đường tắt ấy.

806 case (773 → 806).

### Còn nợ

- Bản in A4 vẫn không hiện cột QĐCK lẫn dấu thiếu quy định.
- **Sản phẩm cũ giờ không có ngưỡng nào** cho tới khi Quản trị khai quy định. Trên bản demo thì
  `make demo-mau` lo việc đó; trên dữ liệu thật, `0025` xoá ba cột mà **không** sinh quy định thay
  thế — cố ý, vì đoán hộ phạm vi cho một quy định là đoán sai. Cần một lượt khai tay trước khi chạy
  thật.

---

## P33 — Chiết khấu chỉ còn hai yếu tố, và ba danh mục địa lý biến khỏi phần mềm

Một câu yêu cầu, hai việc rất khác nhau về độ rủi ro: thu chiều khớp của quy định chiết khấu từ ba
xuống hai, và **xoá hẳn** tỉnh/thành · bệnh viện · kênh khỏi mọi tầng.

### Vì sao xoá chứ không để lại cho chắc

Cám dỗ ở đây là giữ cột lại "phòng khi cần". Nhưng cột còn thì màn hình nhập còn, người dùng còn gõ,
và **dữ liệu gõ vào ấy sẽ được ai đó tin là có nghĩa** — trong khi không có một dòng mã nào đọc tới
nó nữa. Một trường không dẫn tới quyết định nào mà vẫn bắt người dùng điền là một lời nói dối nhỏ
lặp lại mỗi ngày.

Phép rà cho ra đúng ba đường đi, và chỉ một trong ba là thật:

- `cat.channel` → chiều thứ ba của quy định chiết khấu. Đường **duy nhất** mà một trong ba mã đổi
  được kết quả tính toán — và nghiệp vụ vừa chốt là nó không được đổi.
- `cat.province`, `cat.hospital` → ba cột trên `cus.customer` → chép sang `rpt.policy_row` → ba tiêu
  chí lọc và ba cột Excel. Toàn bộ vòng đời: gõ vào rồi đọc lại.

Nên bỏ cả ba, một lượt, ở mọi tầng: bảng danh mục, API `/catalog/lookups`, `validate-codes` mà
`customer` gọi sang, ba cột khách hàng, ba cột read-model, ba tiêu chí lọc, ba cột Excel, màn hình
*Danh mục tra cứu*, ba ô chọn trong biểu mẫu khách hàng, ô *Kênh bán* trong biểu mẫu quy định.

### Gộp quy định: giữ dòng RỘNG, không giữ dòng hẹp

Bỏ một chiều khớp thì hai dòng từng khác nhau (cùng nhóm, cùng loại khách, khác kênh) trở thành cùng
một phạm vi — mà `uq_rule_pham_vi` không cho hai dòng cùng phạm vi tồn tại. Phải gộp trước khi dựng
lại chỉ mục, và câu hỏi là **giữ dòng nào**.

Giữ dòng **không khai kênh**. Dòng ấy vốn đã nói "mọi kênh", nên giữ nó là giữ nguyên nghĩa cũ; giữ
một dòng khai riêng cho một kênh thì lặng lẽ áp ngưỡng của kênh đó lên mọi kênh còn lại. Đây là loại
lựa chọn mà cả hai hướng đều "chạy được" và chỉ một hướng không đổi hành vi cho đa số dữ liệu.

### Đổi tên `lookups.service.ts` là một phần của việc

Sau khi gỡ ba danh mục, tệp ấy chỉ còn giữ người ký. Để nguyên tên thì sáu tháng nữa có người đi tìm
danh mục tra cứu trong một tệp không còn danh mục nào. Đổi thành `signers/signers.service.ts` —
`SignersService`. Cái giá là một va chạm nhỏ: trường tiêm `signers` trùng tên phương thức
`signers()` trong `internal.controller`, TypeScript báo `TS2300`. Đổi phương thức thành `listSigners`.

### Ba chỗ tài liệu nói sai sau khi xoá, và cách sửa từng chỗ

- **CUST-08** ("ba mã phân loại phải có trong danh mục") — luật mất chủ thể. Gạch đi, ghi rõ đã bỏ ở
  `0026`, và thay test cũ bằng test **đường cũ không gãy**: biểu mẫu chưa cập nhật gửi kèm
  `provinceCode` thì khách hàng vẫn lập được, trường ấy rơi mất chứ không thành 400.
- **RPT-06** ("đổi tên tỉnh thì bộ lọc theo mã vẫn đúng") — không còn cặp mã/tên nào trong read-model
  để dựng lại phép thử. Xoá test, giữ lại một khối chú thích nói nó đi đâu.
- **CAT-16** ("khoá chính là MÃ") — luật vẫn đúng, chỉ là ví dụ của nó (danh mục tỉnh) đã chết. Phát
  biểu lại trên nhóm sản phẩm, nơi luật ấy vẫn đang được kiểm thật.

Ba cách xử lý khác nhau cho ba tình huống nghe giống nhau. Xoá nhầm luật còn hiệu lực chỉ vì ví dụ
của nó đã cũ là cách đánh mất một ràng buộc mà không ai nhận ra.

### Một lỗi P32 để lại, lộ ra ở đây

`scripts/seed-demo.ts` vẫn gửi `defaultRate2Type1/2/3` khi tạo sản phẩm — ba trường P32 đã xoá. Máy
chủ bỏ im lặng mọi trường lạ, nên script chạy xanh và **chồng demo không có một ngưỡng nào**. Không
test nào bắt được: bộ test không chạy qua seed demo.

Sửa bằng bốn dòng quy định thật, và chọn bốn dòng ấy để chồng demo bày ra được chính cái luật khó
nhất của màn hình này: khách loại 1 mua sữa bột lấy 18% từ `CK-SUA-L1`, khách loại 3 mua đúng sản
phẩm ấy lấy 15% từ `CK-SUA`.

805 case (806 → 805): thêm 8, bỏ 9 — ba tiêu chí lọc, CUST-08, RPT-06 và test đổi tên tỉnh không còn
đối tượng để kiểm.

### Còn nợ

- Bộ lọc **11 tiêu chí** thay vì 14. Nếu về sau cần lọc theo địa bàn thật, đường đúng là một trường
  có cấu trúc trên khách hàng chứ không phải dựng lại ba danh mục vừa bỏ.
- Dữ liệu ba trường ấy trên chồng demo và trên mọi CSDL đã chạy migration **mất hẳn**, không có bản
  lưu tạm.

---

## P34 — Màu đúng chỗ, dấu hỏi biết trả lời, và một ô ghi chú

Hai yêu cầu nhỏ về giao diện, và một trong hai hoá ra là sửa một quyết định của chính P28.

### Nền cả dòng là tô sai chỗ

P28 tô nền cả dòng cho hai cảnh báo. Đọc được — nhưng nền phủ lên Giá bán Công ty và các khoản CPBH,
những con số **hoàn toàn bình thường**, trong khi thứ duy nhất đáng ngờ là tỷ lệ chiết khấu. Tệ hơn:
nền đỏ làm mọi ô trên dòng khó đọc hơn đúng lúc người duyệt cần đọc chúng kỹ nhất.

Chuyển màu về đúng con số. `lopDong()` biến mất, `lopTyLe()` thay chỗ. Cùng với nó là bốn luật CSS
biến mất — trong đó có hai luật khai lại nền cho **cột khoá** ở dải 640–1023px, thứ chỉ tồn tại vì
cột khoá có nền riêng để che phần đang cuộn phía dưới. Bỏ nền dòng thì cả nhánh phụ thuộc ấy tự rụng.

Ô màu trong chú thích cũng phải đổi: từ nền nhạt sang **màu đặc**. Mẫu màu phải là chính cái màu
người dùng nhìn thấy, mà giờ nó là màu chữ chứ không phải màu nền.

### Dấu `?`: `<button>` chứ không phải `<span title>`

`title` chỉ hiện khi có CHUỘT. Trên điện thoại — nơi `FE-03` bắt cả bảng gập thành thẻ — và với
người dùng bàn phím, một `span` mang `title` là một dấu hỏi không bao giờ trả lời được. Nút thì nhận
tiêu điểm, `aria-label` mang nguyên câu ấy, nên trình đọc màn hình và người dùng Tab đều tới được
cùng một nội dung. `cursor: help` giữ nguyên để nó không trông như một thao tác giữa bảng tiền.

Lý do là **một câu đủ nghĩa**, không phải một nhãn: người bấm vào đang hỏi "vì sao con số này có
màu", nên câu trả lời nói cả nguyên nhân lẫn hệ quả, và khi hai lý do cùng đúng thì nói **cả hai**.

### `note`: cột duy nhất trên dòng không phải ảnh chụp

Mọi cột `*_snap` cạnh nó là bản sao của danh mục tại thời điểm lập. `note` không có bản gốc nào để
chụp — nó là chữ người lập gõ vào chính dòng này. Kéo theo ba quyết định:

- **Đi theo dòng sang phiên bản mới**, cùng luật với `wholesale_price` và `cpbh` (POL-05).
- **Vắng mặt là XOÁ, không phải "giữ nguyên"** — hộp thoại sửa dòng gửi lên toàn bộ nội dung dòng,
  nên không có ô ghi chú nghĩa là người dùng vừa bỏ nó đi. Cùng ngữ nghĩa với `cpbh` ngay bên cạnh.
- **In ra bản A4.** Ghi chú chỉ hiện trên màn hình là ghi chú vô dụng: bản A4 mới là thứ được ký, và
  nếu nó thiếu đúng phần chữ người lập viết ra thì người lập quay về cách cũ — gọi điện nói miệng.

Cột đứng **CUỐI** cả trên màn hình lẫn trên giấy: nó là cột chữ duy nhất giữa một bảng số, xen vào
giữa thì mọi cột tiền bên phải mất thế thẳng hàng, và bảng tiền không đọc được theo cột dọc là bảng
không kiểm được.

### Ba test đỏ, một nguyên nhân: chưa đọc kỹ `opt()`

`opt()` map chuỗi rỗng **thành `undefined`**, không ném lỗi. Nên:

- Test "chuỗi rỗng thì 400" sai từ tiền đề — và hành vi thật lại **tốt hơn** thứ tôi định làm: ô ghi
  chú của biểu mẫu gửi lên được ở mọi lượt lưu mà không phải tự quyết định khi nào bỏ trường đi. Đổi
  test thành "chuỗi rỗng = không ghi chú, lưu xuống thành null", và thêm một test cho chuỗi toàn
  khoảng trắng — cái đó thì 400 thật, vì `str()` cắt khoảng trắng trước khi đo độ dài.
- Mã ứng dụng cũng đơn giản đi theo: gửi thẳng `note: ghiChu.trim()` thay vì spread có điều kiện.

Lỗi thứ ba thì thẳng thắn hơn: DTO của `PATCH .../lines/:lineId` là một shape **riêng**, không dùng
lại `lineShape`. Thêm trường vào một chỗ mà quên chỗ kia, và triệu chứng là "sửa xong ghi chú không
đổi" — không có lỗi nào, không có log nào.

827 case (805 → 827).

### Còn nợ

- Bản in A4 giờ có cột Ghi chú nhưng **vẫn không có cột QĐCK lẫn dấu thiếu quy định** — nợ từ P32,
  vẫn chưa rõ nên là một cột hay một dòng chú thích chân trang.
- Bề rộng cột Ghi chú trên giấy chặn cứng ở 45mm. Chưa đo thật trên hồ sơ nhiều cột CPBH; máy không
  có LibreOffice nên chỉ kiểm được bằng cách đếm ô trong HTML.

---

## P35 — Gỡ hai ký hiệu và khối chú thích, giữ nguyên luật đứng sau chúng

Hai yêu cầu ngắn, và cả hai đều chạm vào `FE-28` — luật "không bao giờ chỉ dùng màu". Việc ở đây
không phải là chọn giữa yêu cầu và luật, mà là nhận ra **vật mang tin đổi được còn luật thì không**.

### `!` và `◆`: ký hiệu thứ hai cạnh một ký hiệu đã đủ việc

Lý do người dùng đưa ra là hình thức, nhưng nó đúng về chức năng: hai ký hiệu chen vào giữa một cột
số làm con số hết thẳng hàng, mà trong bảng tiền thì thế thẳng hàng của cột số chính là thứ giúp dò
nhanh. `font-variant-numeric: tabular-nums` ở `.so` sinh ra để giữ đúng cái thế ấy, và hai ký hiệu
độ rộng khác nhau phá nó ngay ở dòng đầu tiên.

Điều làm yêu cầu này an toàn là **dấu `?` vừa thêm ở P34**. Nó là ký hiệu nhìn thấy được, hiện đúng
ở dòng có màu và biến mất ở dòng thường, và `title`/`aria-label` của nó nói rõ đây là màu gì. Nghĩa
là `FE-28` vẫn còn đủ ba lớp — chỉ là lớp "ký hiệu" đổi từ hai dấu câm sang một dấu biết trả lời.
Nếu P34 chưa có dấu `?`, yêu cầu này sẽ là một sự đánh đổi thật và tôi đã phải nói ra.

Một chi tiết theo sau: `.dau-hoi` chuyển sang `color: inherit`. Khi nó là dấu hiệu duy nhất của ô,
cho nó màu riêng là tách nó khỏi con số đúng lúc cần dính vào con số nhất.

### Khối chú thích: đúng nội dung, sai chỗ và sai lúc

`ChuThichMau` do chính tôi thêm ở P28, với lập luận "người dùng gặp dòng đỏ đầu tiên vào lúc đang lập
hồ sơ dở, và đó là lúc tệ nhất để đi tìm xem màu đỏ nghĩa là gì". Lập luận ấy vẫn đúng — nhưng nó
biện minh cho việc **có sẵn lời giải thích**, không biện minh cho việc **in bốn dòng chữ dưới mọi hồ
sơ**, kể cả hồ sơ không có dòng nào mang màu.

Dấu `?` giải đúng bài toán ấy tốt hơn: lời giải thích nằm cạnh chính con số gây thắc mắc, và chỉ
xuất hiện khi có gì để thắc mắc. Cái mất đi là khả năng đọc trước khi gặp; đổi lại là không phải đọc
gì khi không cần.

Gỡ nó kéo theo hai thứ nhỏ: `.o-mau-loi`/`.o-mau-canh-bao` — vừa mới đổi từ nền nhạt sang màu đặc ở
P34 — biến mất luôn; và `dauTrongDuLieu()` trong test mất lý do tồn tại ban đầu (nó sinh ra để bỏ qua
chính khối chú thích). Giữ hàm lại: câu hỏi nó đặt ra vẫn đúng, và khối chú thích nào thêm lại sau
này cũng sẽ dùng đúng những lớp ấy.

### Một dấu ◆ mồ côi ở chỗ không ai nghĩ tới

Hộp thoại thêm dòng sản phẩm mở đầu khối cảnh báo bằng `◆` — cố ý, để nối lời cảnh báo với ký hiệu
người dùng sắp thấy trong bảng. Ký hiệu ấy giờ không còn, nên dấu ◆ ở đó trỏ tới một thứ họ sẽ không
tìm thấy. Gỡ.

Đây là loại rác mà `grep` một lớp CSS không tìm ra: nó là **ký tự**, không phải lớp. Nên test mới
kiểm cả hai — không còn `.dau-vuot`/`.dau-mac-dinh`, **và** `document.body.textContent` không chứa
`◆`. Đổi lớp mà giữ ký tự thì test cũ xanh còn màn hình vẫn y nguyên.

829 case (827 → 829).

### Còn nợ

- Chưa nhìn bằng mắt trên trình duyệt thật: `make demo` đang tắt (phải hạ để chạy `make test`).
- `FE-28` giờ dựa vào một `<button>` nhỏ 1,15em. Kiểm tương phản thật của nó trên nền vàng ở giao
  diện tối là việc chưa làm — `--mau-canh-bao` vốn được chọn cho chữ đậm, không cho viền mảnh.

---

## P36 — Sửa được ngày hiệu lực, và một cột bớt đi bốn chữ lặp

Hai việc nhỏ, và cái thứ hai giải thích cái thứ nhất.

### "– vô thời hạn" là luật, không phải dữ liệu

Cột *Hiệu lực* in `01/01/2026 – vô thời hạn` ở mọi dòng. Bốn chữ ấy **giống hệt nhau trên mọi dòng**,
nên chúng không phân biệt dòng nào với dòng nào — mà phân biệt là toàn bộ việc của một ô trong bảng.
Chúng là một luật của cả bảng, và chỗ của luật ấy là câu ghi chú đầu bảng, nơi nó được nói **đúng
một lần**.

Không xoá thẳng: câu ấy chuyển lên đoạn ghi chú trên đầu bảng, cùng chỗ với câu "ngưỡng chỉ để cảnh
báo". Test khoá lại cả hai nửa — bảng không chứa chữ ấy, **và** trang vẫn nói nó đúng một lần. Chỉ
kiểm nửa đầu thì xoá nhầm cả thông tin cũng xanh.

### Ngày hiệu lực: cái không sửa được lẽ ra vẫn phải sửa được

`0020` chốt "sửa quy định chỉ đổi được ngưỡng", và tôi đã gộp ngày hiệu lực vào cùng nhóm với hai ô
phạm vi. Gộp sai. Hai thứ ấy khác nhau về bản chất:

- **Nhóm sản phẩm và loại khách hàng** quyết định `specificity`, tức thứ tự ưu tiên giữa các phạm vi
  KHÁC nhau. Đổi một ô là đảo thứ tự của cả bảng, và không có gì trên màn hình nói ra điều đó.
- **Ngày hiệu lực** chỉ xếp thứ tự giữa các dòng CÙNG phạm vi — mà đó chính là cơ chế đổi ngưỡng duy
  nhất còn lại sau `0020`: khai một dòng mới cùng phạm vi, ngày muộn hơn, dòng cũ tự bị che.

Cái giá của việc gộp sai: gõ nhầm một ngày nghĩa là **xoá dòng rồi khai lại**, và giữa hai thao tác
ấy mọi hồ sơ lập ra đều mất ngưỡng. Một lỗi gõ phím đổi lấy một khoảng thời gian dữ liệu sai.

**Vắng mặt là GIỮ NGUYÊN**, ngược với `note` ở `0027`. Lý do không phải là sở thích: cột `NOT NULL`,
không có trạng thái "không có giá trị" nào để một lần gửi thiếu diễn đạt, nên "vắng mặt = xoá" thậm
chí không biểu diễn được. Ngữ nghĩa của một trường tuỳ chọn suy ra từ lược đồ, không phải từ thói
quen.

### Một 409 phải trả về đúng mã cũ

Dời ngày có thể đâm vào một dòng cùng phạm vi đã giữ đúng ngày đó — `uq_rule_pham_vi` chặn. Đường
sửa dùng lại `trungGiNao()` của đường tạo thay vì tự dựng thông báo: người dùng gặp cùng một tình
huống thì phải đọc cùng một câu, và mã lỗi `RULE_SCOPE_DUPLICATE` là thứ giao diện sẽ bắt.

Trên đường sửa, mã quy định không đổi nên `uq_rule_pham_vi` là ràng buộc duy nhất còn có thể vỡ —
`trungGiNao()` phân loại đúng mà không cần biết nó đang được gọi từ đâu.

### Một bẫy nhỏ ở ô ngày

`pg` dựng cột `date` thành chuỗi ISO có cả phần giờ, còn `<input type="date">` chỉ nhận `yyyy-mm-dd`.
Không cắt mười ký tự đầu thì ô ngày mở ra **rỗng**, và người dùng đọc ra là "dữ liệu hỏng" chứ không
phải "định dạng lệch". Test khoá `o.value` bằng đúng `2026-01-01`.

838 case (829 → 838).

### Còn nợ

- Vẫn chưa nhìn bằng mắt: chồng demo đang tắt từ P35.
- Dời ngày của một quy định **về quá khứ** không tính lại hồ sơ nào — đúng thiết kế (`threshold_snap`
  đóng băng), nhưng chưa có gì trên màn hình nói điều đó ra ngay lúc bấm Lưu.

---

## P37 — Hồ sơ Nháp sống theo danh mục, hồ sơ đã gửi thì được nhắc

Đợt lớn nhất từ P11: năm việc, và bốn trong năm đều xoay quanh một câu hỏi duy nhất — **con số trên
hồ sơ đóng băng lúc nào**.

Bốn quyết định hỏi trước khi làm, vì mỗi hướng dẫn tới một khối lượng và một hành vi khác hẳn: làm
mới Nháp lúc nào, phát hiện hồ sơ lệch bằng cách nào, box có gồm hồ sơ đang hiệu lực không, và làm
mới hỏng thì xử ra sao. Hỏi trước rẻ hơn nhiều so với dựng xong rồi tháo.

### Lằn ranh đóng băng dời từ "lúc lập" sang "lúc gửi duyệt"

Trước đợt này, mỗi lần ghi một dòng là một lần chụp — và không bao giờ chụp lại. Hệ quả nghe hợp lý
("hồ sơ đang mở không tự đổi số dưới tay người xem") nhưng dẫn tới điều tệ hơn: người lập đọc một con
số, bấm *Gửi duyệt*, và thứ đóng băng là một con số **khác**. Con số vẫn đổi dưới tay họ — chỉ là
muộn hơn và ở chỗ họ không nhìn thấy.

Giờ có đúng một lằn ranh: **Nháp sống theo danh mục, gửi duyệt thì đóng băng**. Làm mới ở hai chỗ —
mỗi lần mở hồ sơ, và một lần cuối ngay trước khi chuyển trạng thái. Chỗ thứ hai không thừa: giữa lúc
người lập mở màn hình và lúc họ bấm Gửi có thể là nửa tiếng.

Điều này **đảo ngược một quyết định của P31**, và hai test của P31 đỏ đúng chỗ đáng đỏ. Không sửa
mã cho test xanh — sửa test, và ghi lý do đảo ngược ngay trong tệp test.

### Ba thứ `lamMoiDong` cố ý KHÔNG chạm

- **`row_version`.** Đó là khoá lạc quan của luồng duyệt. Một lượt ĐỌC làm hỏng thẻ khoá người dùng
  đang cầm là một 409 không giải thích được cho họ. Có test riêng khoá điều này lại.
- **Giá bán buôn và CPBH.** Con số người dùng nhập, không phải ảnh chụp danh mục. Làm mới chỉ tính
  lại ba thứ đến từ danh mục.
- **Sự kiện `policy.updated`.** Không có người nào vừa sửa gì.

### Làm mới hỏng: chặn ở đâu là cả một quyết định

Sản phẩm vô hiệu hoá, hoặc chưa có giá tại ngày áp dụng. Chặn lúc MỞ hồ sơ là nhốt người lập ngoài
chính hồ sơ họ cần vào để xoá cái dòng hỏng — cách chắc chắn nhất để biến một lỗi dữ liệu thành một
lỗi không sửa được. Nên: mở thì giữ số cũ, **gửi duyệt thì 422 kèm tên sản phẩm**. Đó mới là lúc con
số đi vào một văn bản sắp ký.

### Tại sao phép rà không được lọc theo `rule_code_snap`

Đây là chỗ dễ làm sai nhất của cả đợt. Trực giác nói: quy định X đổi thì tìm hồ sơ có
`rule_code_snap = X`. Sai — một quy định **mới**, cụ thể hơn, thắng quy định đã chụp, mà hồ sơ không
hề nhắc tới mã của nó. Lọc theo mã bỏ sót đúng cái trường hợp khó thấy nhất.

Nên consumer **tra lại rồi so**, chấp nhận một lượt rà toàn bộ hồ sơ đã đóng băng mỗi lần quy định
đổi. Việc nặng, nhưng chạy đúng lúc danh mục đổi — mà đó là việc hiếm, và nó là một consumer chứ
không phải một đường request. Có test riêng cho đúng tình huống này.

### So với danh mục HÔM NAY, không phải với ngày áp dụng

Hai phép so khác nhau, và trộn chúng là hỏng cả hai:

- **Nháp** tra theo **ngày áp dụng** — đó là con số sẽ được đóng băng.
- **Đã đóng băng** so với **hôm nay** — câu hỏi của người đọc box là "hồ sơ này còn khớp với bảng giá
  đang bán không", chứ không phải "lúc lập nó có đúng không". Lúc lập thì nó luôn đúng.

### Một bẫy múi giờ suýt lọt

`ngayISO()` không dùng `toISOString().slice(0,10)`. Cột `date` của Postgres về tới Node thành `Date`
lúc nửa đêm giờ máy chủ; đổi sang UTC trước khi cắt thì ở múi giờ dương như Việt Nam nó **lùi về ngày
hôm trước**. Một hồ sơ áp dụng 01/09 sẽ tra bảng giá của 31/08 — sai đúng một ngày, và đúng một ngày
là đủ để rơi vào bên kia một mốc đổi giá.

### Đổi tên consumer

`price-changed.consumer.ts` giờ nghe cả `catalog.changed`, nên nó thành `catalog-impact.consumer.ts`.
Cùng lối nghĩ với `lookups → signers` ở P33: để nguyên tên là để một cái bẫy cho người sau.

868 case (838 → 868).

### Còn nợ

- **Giá khai trước, hiệu lực sau.** Impact so với giá HÔM NAY, mà `catalog.price_changed` phát lúc
  KHAI. Khai hôm nay một dòng giá hiệu lực 01/10 thì tới 01/10 hồ sơ mới thật sự lệch — và không có
  sự kiện nào vào ngày ấy. Đóng lại cần một lượt quét định kỳ, chỗ đúng là `sla-worker` (đã quét 5
  phút một lần). Chưa làm.
- Rà toàn bộ khi quy định đổi là O(số hồ sơ đã đóng băng). Với vài nghìn CSBH đang hiệu lực thì một
  lần đổi quy định là vài nghìn lượt so. Chưa đo thật.
- Box chưa có phân trang; `limit=50` là cứng.
- Vẫn chưa nhìn bằng mắt trên trình duyệt: chồng demo tắt từ P35.

---

## P38 — Phân trang: 20 mục một trang, mọi danh sách

Yêu cầu một câu, và cái hay của nó nằm ở chữ "tất cả": nó biến một loạt quyết định rời rạc thành một
luật. Trước đợt này mỗi màn hình tự chọn một con số — hồ sơ 50, người dùng 200, nhật ký 100, hộp việc
100, sản phẩm 200. Không con số nào sai riêng lẻ.

Vấn đề không phải hiệu năng mà là **sự im lặng**. Không màn hình nào nói cho người dùng biết họ đang
nhìn một phần hay toàn bộ, mà với một danh sách bị cắt lặng lẽ thì người dùng **luôn tin mình đang
nhìn toàn bộ**. Đó chính là món nợ tôi tự ghi ở box *Yêu cầu cập nhật* hai lượt trước, và hoá ra nó
không phải nợ của một box — nó là nợ của cả ứng dụng.

### Hai kiểu cắt, và chọn kiểu nào KHÔNG tuỳ tiện

- **Máy chủ cắt** (`useTrangMay`) — hồ sơ, khách hàng, nhật ký, thư hỏng, hộp việc, box Yêu cầu cập
  nhật. Danh sách lớn tuỳ dữ liệu; tải 20 dòng thì chỉ tốn 20 dòng.
- **Màn hình cắt** (`useTrangTaiCho`) — sản phẩm, chiết khấu, người dùng, mẫu hợp đồng.

Kiểu thứ hai nghe như đi lùi, nhưng cắt ở máy chủ những chỗ này là **gãy đúng một việc khác**:

- Sản phẩm và Chiết khấu có ô tìm kiếm bỏ dấu chạy tại chỗ. Cắt ở máy chủ thì nó thành "tìm trong 20
  dòng đang hiện" — gãy đúng cái việc nó sinh ra để làm. Muốn cắt ở máy chủ thì phải đưa tìm kiếm bỏ
  dấu xuống SQL trước, và `cat.product` chưa có cột chuẩn hoá nào.
- Người dùng thì lý do khác hẳn: `ds` không chỉ nuôi cái bảng, **mọi hộp thoại tạo và sửa đều lấy ô
  chọn "Trưởng bộ phận quản lý" từ chính nó**. Cắt ở máy chủ thì ô chọn ấy chỉ còn thấy 20 tài khoản
  đầu, và một TDV sẽ không gán được vào Trưởng bộ phận thứ 21 — không có gì trên màn hình nói vì sao.

Đây là loại quyết định mà "cho nhất quán" là lời khuyên tệ: hai cơ chế khác nhau vì hai ràng buộc
khác nhau, và ép chúng thành một là hỏng một trong hai.

### Danh sách hồ sơ: ngăn xếp con trỏ

Màn hình này phân trang bằng **con trỏ** neo vào `(createdAt, policyId)`, không phải `offset` — với
`offset`, một hồ sơ mới lập giữa lúc người dùng bấm *Sau* sẽ đẩy mọi dòng xuống một bậc, và họ nhận
lại một dòng đã đọc trong khi một dòng khác biến mất. Cái giá: con trỏ chỉ đi TỚI được.

Nên giữ một **ngăn xếp con trỏ mở đầu mỗi trang đã qua**: `moTrang[i]` là con trỏ để lấy trang `i+1`,
lùi là đọc lại phần tử trước. Và đổi bộ lọc thì **vứt cả ngăn xếp**, không chỉ về trang 1 — mọi con
trỏ đã ghi đều trỏ vào tập kết quả cũ.

Điều này quyết định luôn hình dạng thanh phân trang: **không có dãy số trang**, vì màn hình này không
nhảy thẳng tới trang 9 được. Một thanh có số bấm được ở chỗ này và không bấm được ở chỗ kia là hai
thanh khác nhau đội lốt một.

### Một bẫy React lặp lại ba lần

`useTrangTaiCho` là hook, nên nó phải nằm **trên mọi `return` sớm**. Ba màn hình đều có sẵn nếp
`if (!ds) return <DangTai />;` rồi mới lọc — đặt hook sau đó là đổi số hook giữa hai lần vẽ và React
ném. Phải chuyển phép lọc lên trước, đọc `ds ?? []`.

### Cái không phân trang, và vì sao

Bảng dòng sản phẩm trong một hồ sơ, lịch sử giá, tệp đính kèm: **nội dung của một hồ sơ**, không phải
danh sách để duyệt. Bản A4 in ra phải khớp đúng bản trên màn hình (muc 11.1), nên cắt trang ở đó là
làm người ký nhìn thiếu dòng. Các ô chọn trong biểu mẫu cũng không — một ô chọn phân trang là một ô
chọn không dùng được.

880 case (868 → 880).

### Còn nợ

- Bốn màn hình cắt tại chỗ vẫn tải **tối đa 200 dòng**. Quá 200 sản phẩm thì danh sách im lặng cụt —
  đúng cái bệnh đợt này đi chữa, chỉ là ở một ngưỡng cao hơn. Chữa dứt cần tìm kiếm bỏ dấu ở SQL
  (một cột chuẩn hoá trên `cat.product`), rồi chuyển sang máy chủ cắt.
- `/contract-templates` là endpoint danh sách DUY NHẤT còn trả mảng trần, không `{ items, total }`.
- Khối *Hoạt động gần đây* giữ 8 dòng cố định: nó là bản tóm tắt, không phải danh sách để duyệt.

---

## P39 — Bộ dữ liệu demo đủ lớn để nhìn thấy phân trang

P38 dựng phân trang cho mười một màn hình, rồi chạy 880 case xanh và dừng ở đó. Nhưng chồng demo chỉ
có 6 sản phẩm, 4 khách hàng và 5 hồ sơ — **không màn hình nào hiện nổi thanh phân trang**, vì
`PhanTrang` ẩn hẳn khi chỉ có một trang. Chức năng vừa làm xong không nhìn được bằng mắt ở bất cứ đâu.

Đợt này chỉ làm một việc: nâng bộ mẫu của `make demo-mau` để **mọi đối tượng vượt 20**.

### Đầu viết tay, đuôi sinh ra

20 dòng viết tay cho mười màn hình là 200 dòng dữ liệu không ai đọc và không ai giữ đúng được. Nhưng
sinh hết bằng vòng lặp thì mất những ca đã chọn kỹ: hồ sơ bị trả lại kèm lý do, một dòng vượt ngưỡng
nằm cạnh hai dòng dưới ngưỡng, hai khách thuộc hai TDV khác nhau.

Nên tách hẳn hai phần: **năm hồ sơ viết tay đứng đầu, phần sinh ra xếp sau**. Người mở demo lần đầu
vẫn gặp đúng những ca đã chọn cho họ; người thử phân trang có đủ khối lượng.

| Đối tượng | Trước | Sau |
|---|---|---|
| Người dùng | 10 | 26 |
| Nhóm sản phẩm | 2 | 24 |
| Sản phẩm | 6 | 35 |
| Quy định chiết khấu | 4 | 27 |
| Khách hàng | 4 | 28 |
| Hồ sơ CSBH | 5 | 137 |
| Mẫu hợp đồng | 0 | 22 |
| Thư hỏng | 0 | 24 |
| Hồ sơ cần cập nhật | 0 | 87 |

Hộp việc của cả bốn vai trò trong luồng cũng vượt một trang: 22 chờ `tbp01`, 23 chờ `kt01`, 21 chờ
`sa01`, 22 trả lại `tdv01`. Nạp hết mất một phút rưỡi.

### Tài khoản thêm KHÔNG được nằm trong `seed.ts`

Lần đầu tôi thêm 16 tài khoản vào `scripts/seed.ts` cho gọn. `make test` đỏ **bảy ca** ở
`tests/db/scope.test.ts` và `tests/http/auth.test.ts`.

Lý do đúng và đáng nhớ: `seed.ts` là **kho tài khoản của bộ test**, không phải chỗ chứa dữ liệu trình
diễn — và các ca kiểm thử phân quyền khẳng định từng phạm vi bằng **danh sách đóng** (`sa01` thấy
đúng 6 người, `tbp01` thấy đúng `tdv01` và `tdv02`). Thêm một TDV vào `tbp01` là làm sai đúng những
ca ấy.

Cám dỗ ở đây là nới các khẳng định đó thành "chứa ít nhất". Đừng: `toHaveLength(6)` là thứ bắt được
một truy vấn phạm vi trả về cả công ty, và nới nó ra là bỏ mất chính cái nó canh.

Cách đúng: tài khoản thêm **do `seed-demo.ts` tạo qua `POST /admin/users`**, và treo vào một nhánh tổ
chức tách hẳn — `sa02 → kt03/kt04 → tdv04…tdv15`, người duyệt `tbp03`. Không nhánh nào trong số đó
xuất hiện trong bất kỳ phạm vi nào bộ test đang khẳng định, nên cả bảy ca xanh trở lại mà không phải
sửa một dòng test nào.

Kèm theo là một cái bẫy của CSDL dùng chung: 16 tài khoản của lần chạy hỏng **vẫn nằm lại trong CSDL**
sau khi `seed.ts` đã trả về nguyên trạng, nên `make test` tiếp theo vẫn đỏ. Phải xoá tay. `seed.ts`
dùng `ON CONFLICT DO UPDATE` — nó thêm và sửa, không bao giờ xoá.

### `scripts/` chưa từng được biên dịch kiểm tra

`tsconfig.json` liệt kê `packages`, `services`, `tests` — **không có `scripts`**. Tức `seed-demo.ts`
chưa bao giờ đi qua `tsc`, và cái giá đã trả rồi: ở P33 phát hiện nó vẫn gửi ba trường
`defaultRate2Type1/2/3` đã bị xoá khỏi API từ P32, nên chồng demo chạy suốt một thời gian với **bảng
quy định chiết khấu rỗng**. Không test nào bắt được, vì test không chạy bộ nạp demo.

Thêm `scripts/**/*.ts` vào `include`. Đợt này viết thêm 400 dòng script; đưa nó vào tầm kiểm tra
trước khi viết là điều kiện cần, không phải việc dọn dẹp thêm.

### Nhóm sản phẩm — danh sách sót lại của P38

Seed 24 nhóm thì lộ ra thẻ *Nhóm sản phẩm* chưa phân trang. Nó dùng chung mảng `nhom` mà `useNhom`
tải trọn để nuôi ô chọn của thẻ Sản phẩm và thẻ Chiết khấu, nên đúng kiểu **màn hình tự cắt** —
`useTrangTaiCho`, y như bốn màn hình kia.

### Một ca kiểm thử xanh vì lý do sai

`make test` đỏ một ca ở `tests/http/catalog.test.ts` — trên cả mã đã commit, không phải do đợt này.

Ca ấy nhập một sản phẩm từ Excel rồi tìm lại bằng `/catalog/products?q=<mã>&limit=50`. Sự thật:
**`/catalog/products` không có tham số `q` nào cả** (`products.service.ts:159` chỉ nhận `forNewPolicy`
và phân trang). Máy chủ bỏ `q` đi trong im lặng và trả 50 sản phẩm đầu theo mã. Chừng nào bảng còn
dưới 50 dòng thì "50 dòng đầu" tình cờ là "tất cả", nên ca này xanh — vì lý do sai.

CSDL của bộ test dùng chung và các tệp test khác không dọn sản phẩm của mình. Tới 1.337 dòng thì sản
phẩm vừa nhập rơi ra ngoài 50 dòng đầu, và ca đỏ mà chẳng liên quan gì tới việc nhập Excel. Sửa: đọc
sản phẩm theo id qua `/catalog/products/:id`, không lọc trên danh sách.

Đây cũng là gốc của món nợ 200 dòng ghi ở P38: bốn màn hình cắt tại chỗ không phải "chưa chuyển sang
máy chủ cắt" — mà là **máy chủ không có gì để chuyển sang**, vì endpoint sản phẩm không nhận từ khoá
tìm kiếm.

880 case, không đổi số lượng.

### Còn nợ

- Vẫn **chưa nhìn bằng mắt trong trình duyệt**. Chồng demo đang lên và dữ liệu đã đúng; phần còn lại
  là mở `http://localhost:8080` ra xem.
- `/catalog/products` và `/catalog/discount-rules` vẫn không nhận `q`. Đây mới là việc phải làm trước
  khi bỏ được trần 200 dòng.

---

## P40 — Bỏ cây tổ chức: phân công nằm trên hồ sơ

Yêu cầu đổi bốn điểm cùng lúc: người dùng thôi quản lý lẫn nhau; TDV chọn Trưởng bộ phận và Kế toán
lúc gửi duyệt, sau khi xem bản CSBH A4 dạng PDF; Kế toán chọn Sale Admin lúc tiếp nhận L1; và rà lại
toàn bộ ca kiểm thử.

### Cây tổ chức đang gánh bốn việc, không phải một

Trước khi viết dòng nào phải đếm xem gỡ nó ra thì cái gì rơi:

| Việc | Chỗ dựa cũ | Chỗ dựa mới |
|---|---|---|
| Ai thấy hồ sơ / khách / báo cáo nào | `idn.scope_user_ids` đệ quy trên `user_node` | bốn ô người trên `pol.policy` |
| Thư của một hồ sơ gửi cho ai | `idn.notify_targets(tdv)` leo ngược cây | bốn id đi kèm mọi sự kiện |
| Chốt chặn lúc gửi duyệt | `approverOf` — "TDV này có người duyệt chưa" | `checkUsers` — "người vừa chọn nhận việc được không" |
| Ô chọn TDV để giao khách | lọc qua `scope_user_ids` | `GET /auth/nguoi-theo-vai-tro/:role` |

Bốn chỗ này phải có chỗ dựa mới **trong cùng một migration**. Gỡ cây trước rồi dựng cái thay thế sau
là để hở phân quyền giữa hai lần chạy.

### Câu hỏi phải hỏi trước, không phải đoán

Bỏ cây thì phạm vi dữ liệu mất nền, và không có phương án nào suy ra được từ yêu cầu. Hỏi bốn câu,
và câu thứ hai đẻ ra một câu thứ năm đáng giá hơn cả bốn câu kia: **vì sao Sale Admin được đổi TDV
phụ trách?**

Tra ba nguồn thì ra sự thật: **không yêu cầu nghiệp vụ nào cấp quyền ấy.** YCNV §6.1 chỉ nói "khách
hàng do TDV tạo"; §2.5 liệt kê bảy đầu việc của Sale Admin, không có việc giao khách; §2.4 lại nói
việc gắn khách với TDV là của **Kế toán**, làm ngoài phần mềm. Quyền đó do tôi tự thêm ở P11d, và lý
do thật — không ghi ở đâu — là *Sale Admin đứng ở gốc nhánh cây chứa TDV đó*. Tức là căn cứ duy nhất
của nó chính là thứ đang bị bỏ.

Chuyển sang Quản trị hệ thống: đây là vế sau của một việc hành chính họ đã làm — vô hiệu hoá tài
khoản TDV nghỉ việc rồi chuyển khách của người đó.

### Phạm vi: bốn cột, một phép so

`scope_user_ids` co lại còn ba nhánh và không còn đệ quy — Ban lãnh đạo thấy tất cả, Quản trị thấy
rỗng, còn lại thấy **chính mình**. Phần "còn thấy gì nữa" chuyển sang `pol.policy`:

```sql
WHERE (tdv_user_id = ANY($1) OR tbp_user_id = ANY($1)
       OR ke_toan_user_id = ANY($1) OR sale_admin_user_id = ANY($1))
```

Vẫn `= ANY` chứ không `= $1`, vì Ban lãnh đạo có phạm vi là mọi người dùng — giữ MỘT dạng câu cho cả
sáu vai trò thì không có nhánh nào để quên. Cùng phép so ấy lặp lại ở `reporting` và ở `document`;
ba chỗ lệch nhau là một hồ sơ mở được ở màn hình này mà biến mất ở màn hình kia.

Hộp việc thì lọc theo **đúng một cột** của vai trò mình, không phải bốn: Kế toán đã tiếp nhận L1 vẫn
ĐỌC được hồ sơ ấy ở bước Sale Admin, nhưng nó không còn là việc của họ. Để nó nằm lại trong hộp việc
là biến hộp việc thành một danh sách hồ sơ.

### Quyền không được đến muộn

Khách hàng nằm ở schema `cus`, phân công nằm ở `pol`. Bản đầu tôi dựng `cus.customer_access` như một
read-model, do một consumer nghe `policy.#` ghi vào — đúng mẫu outbox của `rpt.policy_row`.

Bỏ, và lý do đáng ghi lại: **quyền tới muộn là loại lỗi tệ nhất trong một phép kiểm quyền.** Người
vừa được giao hồ sơ mở màn hình khách hàng ra, nhận 403, vài giây sau lại được — không ai tin một hệ
thống hành xử như vậy, và không ai tra ra nguyên nhân. Thay bằng lời gọi đồng bộ
`POST /internal/customers/:id/access` ngay sau khi ghi phân công. Chiều gọi policy → customer đã tồn
tại sẵn (policy hỏi mã và tên khách để nhét vào sự kiện), nên không thêm điểm hỏng mới nào.

### Một sự kiện thiếu ba khoá = một lá thư mất

Ba khoá phân công ban đầu tôi chỉ gắn vào sự kiện của hành động. `policy.publish_signed` là sự kiện
**tự động** phát sau khi TBP ký, gửi cho Kế toán — nó không có ba khoá ấy, nên `notify_targets` chỉ
trả về người lập, `pick` không tìm thấy Kế toán nào, và lá thư rơi vào bảng thư hỏng. Triệu chứng:
`chỉ có 5/6 thư sau 15000ms`. Sửa bằng cách đưa ba khoá vào `ctx` — thứ mà **mọi** sự kiện của hành
động đều trải ra.

Cùng bệnh ở `sla-worker`: thư nhắc hạn cũng phải mang theo phân công, nếu không nó chỉ tới người lập.

### Rà test: 170 → 85 → 32 → 0

Chạy thật, không ước lượng.

**Đòn bẩy lớn nhất là các helper.** Mỗi tệp test có một `act()` riêng, và ~94 chỗ gọi
`act(id,'SUBMIT','tdv01')` không chỗ nào quan tâm ai duyệt. Thêm `phanCongMacDinh()` vào
`tests/http/app.ts` rồi sửa **7 helper** — mặc định `tbp01`/`kt01`/`sa01`, đúng những người mà cây cũ
vẫn chọn cho `tdv01`, nên hành vi ca cũ không đổi. Một lượt đó gỡ 85 ca.

85 ca còn lại phần lớn đỏ **vì chúng đúng** — chúng canh đúng luật vừa bị thay:

- `tests/db/scope.test.ts` — viết lại hẳn. Bản cũ khẳng định `sa01` thấy 6 người, `tbp01` thấy
  `tdv01`+`tdv02`. Cám dỗ ở đây là nới `toHaveLength(6)` thành "chứa ít nhất"; **đừng** — đó chính là
  thứ bắt được một truy vấn phạm vi trả về cả công ty. Thay bằng ca khẳng định cây đã bị gỡ thật
  (`to_regclass` NULL, cột không còn, không còn bản `notify_targets(uuid)` một tham số).
- `vai-tro.test.ts` — bỏ cả khối "tự đổi người quản lý" (12 ca). Tính năng ấy có hệ quả không nhỏ:
  định tuyến suy từ `approver_user_id` nên đổi một ô là chuyển ngay mọi hồ sơ đang chờ duyệt sang hộp
  việc người khác, kể cả hồ sơ gửi từ tuần trước.
- `contract.test.ts` — `DOC-21` đổi nghĩa: Sale Admin chưa được giao thì **403 trước 409**. Đúng thứ
  tự — không nói cho người ngoài phạm vi biết hồ sơ đang ở bước nào. Tách nửa còn lại thành một ca
  riêng dùng người đã được giao, để phép kiểm nói về CỔNG chứ không về phạm vi.
- `reporting` — các ca đối chiếu read-model với nguồn chuyển sang đọc bằng `bld01`: Sale Admin không
  còn "đứng trên cả cây", vai trò duy nhất còn thấy toàn bộ là Ban lãnh đạo.

Ca **mới**: thiếu ô chọn → 422 kèm tên ô · chọn sai vai trò → 422 kèm vai trò thật · chọn tài khoản
đã vô hiệu hoá → 422 · hồ sơ ghi lại đúng hai id và chỉ hiện ở hộp việc người được chọn · TBP không
được chọn thì không đọc nổi hồ sơ · kế toán không đọc được hồ sơ còn Nháp · Quản trị thấy mọi khách ·
`nguoi-xu-ly.test.ts` quét bảng ô chọn của giao diện.

**881/881 xanh.**

### Hai thứ tìm ra dọc đường, không do đợt này gây ra

- **CSDL test không có mẫu hợp đồng nào đang dùng** — 54 dòng mẫu, 0 dòng `is_active`. Một lượt chạy
  hỏng trước đó vô hiệu hết rồi chết trước khi phát hành lại. `ensureDefault` kiểm "bảng có dòng
  nào không" nên thấy "đã có mẫu" và không làm gì; mọi lần xuất hợp đồng 409 **vĩnh viễn**, khởi động
  lại service cũng không chữa. Đổi điều kiện thành "có mẫu nào ĐANG DÙNG không" — tự chữa được.
- **Migration đã áp dụng mà sửa nội dung thì runner chặn** (checksum lệch). Đúng hành vi. `0031` chưa
  phát hành nên cập nhật lại sổ; với một migration đã lên máy chủ thật thì phải viết migration mới.

### Còn nợ

- **Chưa nhìn bằng mắt trong trình duyệt.** Chồng demo đang lên với dữ liệu mới, phạm vi kiểm bằng
  API đã đúng (tdv01 136 hồ sơ · tbp01 115 · sa01 54 · bld01 137 · admin01 0), nhưng hộp thoại gửi
  duyệt kèm khung PDF thì chưa ai mở ra xem.
- **Hồ sơ mắc kẹt khi người được giao nghỉ việc.** Chốt chặn `ROLE_CHANGE_BLOCKED` vẫn chặn đổi vai
  trò, nhưng không có đường **giao lại** một hồ sơ đang chờ cho người khác. Trước đây Quản trị đổi
  `approver_user_id` là xong; giờ id nằm cứng trên hồ sơ.
- `assertKhongConDangDo` vẫn gửi `scopeUserIds` sang `policy` dù `dang-do.controller` không còn đọc.

---

## P41 — Vai trò cố định, và vô hiệu hoá phải bàn giao

Ba yêu cầu, và yêu cầu thứ hai chính là món nợ tôi ghi ở cuối P40: *hồ sơ mắc kẹt khi người được
giao nghỉ việc*.

### Đổi vai trò: từ cấm, sang chốt chặn, rồi cấm hẳn

Chức năng này đi hết một vòng. Ban đầu cấm hoàn toàn; P11a mở ra kèm chốt chặn có điều kiện — *còn
hồ sơ dở dang thì không đổi được, và nói rõ hồ sơ nào*; giờ đóng lại hẳn.

Lý do đóng đáng ghi lại, vì chốt chặn nghe có vẻ đủ: **nó chỉ dời vấn đề.** Chốt chặn bắt người quản
trị đi xử lý cho hết hồ sơ trước khi đổi vai trò — mà "xử lý cho hết" không phải việc của họ. Người
quản trị không ký số được, không tiếp nhận được, không bàn giao được. Chốt chặn ấy trong thực tế là
một cánh cửa không bao giờ mở, chỉ khác là người dùng phải tự phát hiện ra điều đó.

Đường đi đúng còn lại đúng một: vô hiệu hoá tài khoản cũ (kèm bàn giao) rồi tạo tài khoản mới.

Gỡ theo: `assertKhongConDangDo`, mã lỗi `ROLE_CHANGE_BLOCKED`, và cả `internal/dang-do` bên policy.

### Ba cửa cho một thao tác

`POST /admin/users/:id/deactivate` giờ đi qua ba cửa, mỗi cửa chặn một kiểu hỏng khác nhau:

1. **Gõ lại họ tên.** Chặn bấm nhầm dòng — danh sách có 26 dòng và các nút nằm sát nhau; bấm lệch
   một dòng là khoá nhầm người, và người bị khoá chỉ biết vào sáng hôm sau. So sau khi chuẩn hoá
   khoảng trắng và chữ hoa: người quản trị chép tên từ màn hình sang, một dấu cách thừa không phải
   là bấm nhầm.
2. **Người nhận bàn giao, cùng vai trò.** Bắt buộc khi còn hồ sơ. Cùng vai trò là điều kiện cứng:
   hồ sơ đang chờ ở bước của vai trò ấy, giao cho vai trò khác là chuyển nó tới người không có hành
   động nào để làm — đúng cái ngõ cụt việc này sinh ra để chữa.
3. **Chuyển giao chạy trước, hỏng thì cả thao tác hỏng.**

### Fail closed, và cái giá của nó

`deactivate` gọi sang `policy` để hỏi "người này đang giữ hồ sơ nào". Không hỏi được thì **không vô
hiệu hoá** — mục đích của cả tính năng là "không hồ sơ nào bị treo", mà không hỏi được thì không biết.

Cái giá lộ ra ngay ở bộ test: `auth.test.ts` và `quen-mat-khau.test.ts` chỉ dựng `identity`, nên
`deactivate` trả 500. Tôi **không** nới điều kiện để hai tệp ấy xanh lại — tôi dựng thêm `policy`
trong chúng. Nới điều kiện là bỏ đúng thứ vừa xây.

### Vết nằm ở nhật ký của CHÍNH hồ sơ

Ghi vào `pol.policy_event` với `action = 'HANDOVER'`, không chỉ vào nhật ký kiểm toán chung. Người
mở hồ sơ ra ba tháng sau phải thấy được vì sao nó đổi tay; nếu vết chỉ nằm ở nhật ký hệ thống thì họ
phải biết trước là có chuyện gì để mà đi tìm.

Hai chi tiết nhỏ nhưng cố ý: `from_status` = `to_status` = trạng thái hiện tại — chuyển giao **không
đổi trạng thái**, và đặt hai giá trị lệch nhau là bịa ra một bước chuyển không có thật. `seq` tính
tại chỗ cho từng hồ sơ, vì nhật ký hồ sơ là một chuỗi liên tục không được có lỗ.

### Hồ sơ nào chuyển, hồ sơ nào không

Mọi hồ sơ **chưa kết thúc** ở cột của vai trò ấy — kể cả **Nháp** (bản nháp của một TDV bị khoá cũng
không ai mở được nữa) và kể cả **Đang có hiệu lực**. Cái thứ hai dễ bỏ sót: hồ sơ hiệu lực không
phải "việc đang chờ", nhưng người phụ trách nó là người nhận thư khi giá hay quy định chiết khấu đổi
(muc 7.2), và gửi thư cho một tài khoản đã vô hiệu hoá là gửi vào chỗ không ai đọc.

Không chuyển: `TU_CHOI` và `HET_HIEU_LUC`.

Người nhận còn được cấp luôn **quyền xem khách hàng** của những hồ sơ vừa nhận — không thì họ mở hồ
sơ ra mà không mở nổi khách hàng trong đó (`0031`).

### Test: phủ cả sáu vai trò

+17 ca. Ca đắt nhất là bất biến phát biểu thẳng:

> Sau khi vô hiệu hoá, **không tồn tại một hồ sơ chưa kết thúc nào còn trỏ tới tài khoản đó ở bất kỳ
> cột nào trong bốn cột.**

Chạy cho `TDV`, `TBP`, `KE_TOAN`, `SALE_ADMIN`, cộng hai ca cho `BAN_LANH_DAO` và `QUAN_TRI` (không
cầm hồ sơ nên vô hiệu hoá thẳng, không hỏi người nhận).

Bốn vai trò trong luồng dựng bằng cách **đặt thẳng cột người** trên hồ sơ rồi vô hiệu hoá tài khoản
dùng một lần ấy — chính cột đó là thứ mọi phép lọc phạm vi và mọi hộp việc đọc, nên đó là phép thử
đúng. Không dùng `tdv01`/`kt01`/`sa01`: các tệp test chạy **song song** trên cùng một CSDL, và vô
hiệu hoá một trong ba tài khoản ấy dù chỉ vài trăm mili giây cũng đủ làm một tệp khác đỏ.

Ca âm cũng đủ: gõ sai tên → 400 · thiếu tên → 400 · thiếu người nhận → 422 · sai vai trò → 422 ·
chọn chính mình → 422 · chọn người chưa kích hoạt → 422. Mọi ca âm đều khẳng định thêm **tài khoản
vẫn đang hoạt động** — chặn phải là chặn thật, không phải cảnh báo rồi vẫn ghi.

898/898 xanh (881 → 898).

### Còn nợ

- **Khách hàng của một TDV bị vô hiệu hoá không tự chuyển.** Hồ sơ thì chuyển, nhưng
  `cus.customer.tdv_user_id` vẫn trỏ vào tài khoản đã khoá — và read-model báo cáo lấy phạm vi từ
  cột ấy. Quản trị đổi tay được qua *Khách hàng ▸ Sửa*, nhưng không có gì nhắc họ làm.
- ~~Không có đường giao lại một hồ sơ lẻ~~ — **KHÔNG PHẢI NỢ**, khách hàng chốt không hỗ trợ. Xem
  cuối P42.
- Vẫn **chưa nhìn hộp thoại bàn giao bằng mắt** trong trình duyệt.

---

## P42 — Khách hàng đi cùng hồ sơ khi bàn giao

Món nợ ghi ở cuối P41, đóng lại. Vô hiệu hoá một TDV thì hồ sơ chuyển tay, nhưng
`cus.customer.tdv_user_id` vẫn trỏ vào tài khoản đã khoá.

### Vì sao đây không phải chuyện nhỏ

Hai hệ quả, và hệ quả thứ hai nặng hơn:

- **Khách hàng mồ côi.** Không TDV nào khác nhìn thấy, và người duy nhất còn thấy thì vừa bị khoá.
- **Read-model báo cáo lấy phạm vi từ chính cột ấy** (`sync.service.ts`: `cus.tdvUserId || src.tdv_user_id`).
  Chuyển hồ sơ mà bỏ lại khách hàng là để hai bên nói hai chuyện khác nhau — hồ sơ đã sang người
  mới, còn dòng báo cáo của nó vẫn tính cho người cũ.

### Vì sao identity gọi thẳng customer, không nhờ policy

Cám dỗ là để `policy` làm nốt trong lượt chuyển hồ sơ — nó đã gọi `customer` sẵn để cấp quyền xem.
Nhưng `policy` **chỉ biết những khách hàng CÓ hồ sơ**. Khách chưa có hồ sơ nào thì nó không thấy — mà
đó chính là loại khách dễ mồ côi nhất, và cũng đúng loại mà P40 đã viện dẫn để cấp cho Quản trị
quyền thấy toàn bộ khách hàng.

Nên identity gọi hai service: `customer` cho khách, `policy` cho hồ sơ. identity là nơi điều phối
việc vô hiệu hoá tài khoản, và đó là vai trò đúng của nó.

### Thứ tự hai lời gọi là bắt buộc

**Khách hàng trước, hồ sơ sau.** Hai lời gọi mạng nối tiếp, không transaction nào bọc chúng.

Với thứ tự ngược lại: hồ sơ chuyển xong mà khách hàng hỏng, lượt bấm lại sẽ thấy `dangGiu` đã về 0
**và** `khach` cũng về 0 (vì khách chưa chuyển nhưng điều kiện đọc sai)… không, chính xác hơn: nó
thấy hồ sơ đã hết, còn khách vẫn còn — nhưng nếu người quản trị bấm lại và điều kiện chỉ đếm hồ sơ
thì hệ thống vô hiệu hoá thẳng, bỏ lại đúng đống khách mồ côi vừa đi chữa. Đặt khách trước thì mọi
lượt bấm lại vẫn còn ít nhất một vế khác 0 cho tới khi cả hai xong.

### Điều kiện "cần người nhận" phải đếm cả hai

Đây là chỗ bản đầu của `0032` để lọt: điều kiện chỉ đếm hồ sơ. Một TDV có 5 khách mà chưa lập hồ sơ
nào thì vô hiệu hoá thẳng được — và 5 khách ấy mồ côi ngay. Giờ `dangGiu.count > 0 || khach.count > 0`.

### Vết trong nhật ký

Một dòng `customer.changed` với `action: 'HANDOVER'` cho **mỗi** khách hàng, không phải một dòng
gộp: người đi tra sau này tra theo khách hàng, không tra theo lượt bàn giao.

### Test

+5 ca, và ca đắt nhất là ca không có hồ sơ nào:

- TDV chỉ có khách hàng, không hồ sơ → **vẫn phải chọn người nhận**
- khách chuyển **cùng** hồ sơ sang đúng người
- khách **chưa có hồ sơ nào** cũng chuyển — ca này canh đúng lý do identity gọi thẳng `customer`
- vai trò khác TDV thì `customerCount` luôn 0
- bất biến: không khách hàng nào còn trỏ vào tài khoản đã khoá

Kèm theo, `auth.test.ts` phải dựng thêm `customer` — tài khoản thử nghiệm ở đó là TDV. Cùng lý do
với việc phải dựng `policy` ở P41: `deactivate` **fail closed**, và tôi không nới điều kiện để test
xanh lại.

903/903 xanh (898 → 903).

### Còn nợ

- Vẫn **chưa nhìn hộp thoại bàn giao bằng mắt** trong trình duyệt.

### Quyết định: KHÔNG hỗ trợ giao lại một hồ sơ lẻ `16/08`

Tôi đề xuất thêm thao tác *"Giao lại hồ sơ này"* cho một hồ sơ đơn, giữ nguyên trạng thái và SLA —
để xử lý bốn tình huống: chọn nhầm người lúc gửi duyệt, người phụ trách nghỉ phép, ốm đột xuất, và
san tải giữa các đồng nghiệp. **Khách hàng trả lời: không hỗ trợ.**

Ghi lại ở đây để lần rà sau không đề xuất lại, và để người đọc mã không tưởng đây là chỗ bỏ sót.

**Đổi người phụ trách một hồ sơ chỉ có đúng hai đường**, cả hai đều đã có:

1. Lúc **chọn người** — `SUBMIT`, `RESUBMIT_AFTER_EDIT`, `KT_RECEIVE_L1`.
2. Lúc **vô hiệu hoá tài khoản** — chuyển toàn bộ, kèm khách hàng nếu là TDV.

**Hệ quả phải nói thẳng, vì nó không hiển nhiên:** chọn nhầm người lúc gửi duyệt thì **không có
đường lùi**. Hồ sơ nằm ở hộp việc của người không liên quan; người lập không sửa được, người đáng lẽ
phải nhận thì không nhìn thấy hồ sơ để mà nhận, và Quản trị cũng không có nút nào.

Điều đó làm **bước xác nhận lúc gửi duyệt trở thành chốt chặn cuối cùng**, không phải một lớp lịch
sự. Ai sửa hộp thoại ấy về sau — bỏ khung xem trước, bỏ nút xác nhận, tự điền sẵn người của lần
trước — cần biết là mình đang tháo cái phanh duy nhất.

Đường đi vòng duy nhất còn lại là **trả lại hồ sơ** để người lập gửi lại và chọn người khác. Nó chỉ
dùng được ở đúng bước Trưởng bộ phận, và nó **bịa ra một sự kiện nghiệp vụ không có thật**: nhật ký
ghi *Yêu cầu chỉnh sửa* trong khi nội dung chẳng sai gì, hồ sơ lùi trạng thái, SLA đếm lại từ đầu.
Đọc lịch sử ba tháng sau sẽ hiểu sai chuyện đã xảy ra.

---

## P43 — Xoá hẳn đối tượng "Người ký"

Câu hỏi của khách hàng — *"tại sao vẫn còn đối tượng Người ký"* — chạm đúng một chỗ nửa vời tôi để
lại từ 15/08 rồi không quay lại.

### Trạng thái nửa vời, và vì sao nó tệ hơn cả hai đầu

`cat.signer` là người ký hợp đồng thay mặt Công ty, khác hẳn Trưởng bộ phận ký số. Rà lại thì nó ở
đúng giữa hai bờ:

| | |
|---|---|
| Lược đồ + API | Đủ CRUD, có test |
| Nơi đọc | ĐÚNG MỘT: ba ô trộn `{{signer.*}}` của mẫu hợp đồng. Bản A4 **không** dùng — chỗ ghi `signerName` ở đó lấy tên TBP, một thứ khác trùng tên biến |
| Màn hình nhập liệu | **Không có.** Gỡ 15/08 vì yêu cầu chưa rõ |

Hệ quả thật: trên một bản triển khai mới **không ai tạo được người ký nào**. `clients.signer()` trả
`undefined`, ba ô trộn ra rỗng, và nếu Sale Admin đánh dấu chúng bắt buộc thì xuất hợp đồng trả 422
`CONTRACT_FIELDS_MISSING` mà không màn hình nào cho phép sửa.

Bài học đáng ghi: **gỡ màn hình mà giữ lược đồ nghe như một nước đi thận trọng, nhưng nó tạo ra một
tính năng vừa tồn tại vừa không dùng được.** Ai đọc danh sách "xoá được những gì" sẽ thấy nó và
tưởng nó chạy. Khách hàng phải hỏi mới lộ ra.

### Đề xuất ba đường, khách chọn xoá

Dựng lại màn hình · xoá hẳn · giữ nhưng bỏ ba ô trộn khỏi danh sách nguồn. Khách chốt **xoá hẳn**:
hợp đồng không cần in tên người ký của Công ty.

Điều đó đúng với thiết kế sẵn có: ba chỗ ký trên hợp đồng vốn là **chỗ trống để ký tay trên giấy**,
và phần mềm chưa bao giờ có bước nào cho việc Ban lãnh đạo ký bản cứng (muc 2.6).

### Một bước dọn dễ quên

Migration xoá ánh xạ đang trỏ tới nguồn sắp biến mất TRƯỚC khi drop bảng:

```sql
DELETE FROM doc.contract_template_field WHERE source LIKE 'signer.%';
```

Hôm nay CSDL không có dòng nào, và tôi vẫn viết câu đó — một bản triển khai khác có thể đã có Sale
Admin ánh xạ ba ô ấy. Bỏ qua thì bảng còn dòng trỏ tới một `source` mà `sources.ts` không phân giải
được nữa, và lỗi chỉ lộ ra ở lần xuất hợp đồng tiếp theo dưới dạng một ô trống không ai giải thích
được.

### Xoá những gì

`cat.signer` · `SignersService` và cả thư mục · 5 route công khai + 1 route nội bộ · `clients.signer()`
· ba resolver `signer.*` và trường `signer` trong `Ctx` · nhãn `signer: 'Người ký'` bên giao diện ·
lời gọi trong `seed-demo` · hai khối test `CAT-17` và *sửa và xoá người ký*.

894/894 xanh (903 → 894: −9 ca của hai khối vừa xoá).

### Còn nợ

- Vẫn **chưa nhìn hộp thoại gửi duyệt và hộp thoại bàn giao bằng mắt** trong trình duyệt.

---

## P44 — Ngừng hợp tác: gộp hai nút thành một

Hai yêu cầu, và yêu cầu thứ hai đóng lại lỗ hổng tôi phát hiện khi trả lời câu hỏi *"tại sao khách
hàng lại xoá mà không phải vô hiệu hoá"*: `cus.customer` không có cột trạng thái nào, nên tình huống
khách ngừng giao dịch **không có cơ chế nào cả**.

### Gộp được, vì hai nút trả lời cùng một câu hỏi

Người dùng chỉ hỏi một câu: *"cho khách này biến khỏi danh sách làm việc của tôi"*. Việc có lịch sử
phải giữ hay không là chi tiết của hệ thống, không phải quyết định của họ. Nên: **một nút, một điều
kiện, hai kết cục do hệ thống chọn.**

| Khách hàng | Kết cục |
|---|---|
| Chưa có hồ sơ nào | **Xoá hẳn** dòng — đây là ca lập nhầm, và một bản ghi như thế mang nhãn *Ngừng hợp tác* sẽ nằm lại trong mọi danh sách mãi mãi |
| Đã có hồ sơ | `NGUNG_HOP_TAC`, mọi CSBH đang hiệu lực → `HET_HIEU_LUC`. **Không xoá dòng**: hồ sơ trỏ vào khách bằng khoá ngoại, xoá là mất tên khách trên mọi hồ sơ cũ |

Điều kiện: **không CSBH nào đang chờ**, kể cả `NHAP`. Bản nháp chưa chờ ai duyệt, nhưng nó là việc
đang dở của chính người lập — chặn và bắt xoá nháp trước thì họ biết mình đang bỏ cái gì.

### Chiều gọi customer → policy, và vì sao lần này được

`0031` tôi từ chối đúng chiều này cho đường đọc danh sách khách hàng. Lý do vẫn nguyên: đó là hot
path, mở mỗi lần vào màn hình, và policy chậm là màn hình khách hàng chết theo dù chẳng cần gì ở đó.

Ở đây khác: một thao tác **ghi**, hiếm, do người dùng bấm, và nó **vốn phải hỏng** nếu không hỏi
được — không có câu trả lời thì không biết khách còn hồ sơ nào đang chờ. Cùng lập luận với
`grantCustomerAccess` đi chiều ngược lại.

### Thứ tự và chốt chặn kép

Cho hồ sơ hết hiệu lực TRƯỚC, đổi trạng thái khách SAU. Ngược lại thì một lượt hỏng giữa chừng để
lại khách đã ngừng mà CSBH vẫn đang hiệu lực — một chính sách còn hiệu lực cho một khách không còn
giao dịch, và không màn hình nào cho thấy mâu thuẫn ấy.

`policy` kiểm "còn hồ sơ đang chờ" **lần thứ hai** bên trong transaction có `FOR UPDATE`, dù
`customer` đã hỏi trước. Giữa hai lời gọi có một khe và một hồ sơ mới có thể gửi vào đó; phép kiểm
đứng cùng transaction với phép ghi mới là phép kiểm thật.

Và chặn ở đường vào: `POST /policies` từ chối khách đã ngừng (`CUSTOMER_RETIRED`). Chỉ giấu khỏi ô
chọn là không đủ — ô chọn là thứ người dùng đi vòng được, và một hồ sơ lập cho khách đã ngừng sẽ
chặn luôn chính việc ngừng hợp tác ấy.

### Quyền: chặt hơn phạm vi đọc

`@Roles('TDV')` cộng `assertChinhTdv` — **đúng TDV phụ trách**, không phải mọi TDV. Trưởng bộ phận
và Kế toán được giao một CSBH của khách này thì ĐỌC được khách (`0031`), nhưng ngừng hợp tác là
quyết định về quan hệ khách hàng, không phải một bước xử lý hồ sơ.

Quản trị hệ thống cũng không, dù họ thấy mọi khách hàng: họ đổi được TDV phụ trách, và đó là đúng
vai trò hành chính của họ — quyết định nghiệp vụ thuộc người làm nghiệp vụ.

### Test: 19 ca, phủ từng trạng thái một

Tám ca cho tám trạng thái chờ (`NHAP` … `QUA_HAN_DUYET`), mỗi ca khẳng định thêm **khách vẫn nguyên
trạng và hồ sơ vẫn nguyên trạng** — chặn phải là chặn thật. Hai ca cho hai trạng thái kết thúc
(`TU_CHOI`, `HET_HIEU_LUC`): giữ lại khách, không hết hiệu lực gì. Cộng: xoá hẳn, hết hiệu lực,
nhật ký hồ sơ, ngừng hai lần, TDV khác, bốn vai trò còn lại, giấu khỏi ô chọn nhưng còn trong danh
sách, và hai ca xem trước.

913/913 xanh (894 → 913).

### Tôi tự làm hỏng CSDL dùng chung, và bài học

Một ca tôi viết ban đầu — *"nhiều CSBH đang hiệu lực thì hết hiệu lực tất cả"* — dùng
`ALTER TABLE pol.policy DISABLE TRIGGER ALL` để dựng dữ liệu. Hai chuyện xảy ra:

1. Nó **không dựng được**: `uq_policy_active_per_customer` là một **unique index riêng phần**, và
   tắt trigger không tắt được index. Ca ấy bất khả thi theo thiết kế — tôi thay bằng một ca khẳng
   định đúng điều đó, để nếu ai gỡ index kia thì test đỏ trước khi hồ sơ hỏng.
2. Nó **chết giữa chừng nên `ENABLE TRIGGER ALL` không bao giờ chạy** — và `DISABLE TRIGGER ALL`
   tắt luôn **các trigger nội bộ thực thi khoá ngoại**. CSDL dùng chung mất kiểm tra FK, sinh ra
   475 dòng `policy_event` mồ côi, làm đỏ thêm ba ca ở hai tệp khác: `constraints.test.ts` (FK đáng
   lẽ phải chặn mà lại cho qua) và `ops.test.ts` (`pg_restore` không dựng lại nổi khoá ngoại).

Bài học: **`DISABLE TRIGGER ALL` trên một CSDL dùng chung là một cú tắt phanh toàn cục**, không phải
một tiện ích dựng dữ liệu. Nếu buộc phải dùng thì bọc trong `try/finally`, và tốt hơn là đừng —
trạng thái nào dựng không được bằng đường thường thường là trạng thái mà hệ thống không cho phép tồn
tại, tức là chính câu trả lời mình đang đi tìm.

### Còn nợ

- Vẫn **chưa nhìn ba hộp thoại mới bằng mắt** trong trình duyệt: gửi duyệt, bàn giao, ngừng hợp tác.

---

## P45 — Một từ vựng trên màn hình: "Xoá"

Khách hàng chốt: nút chỉ mang nhãn **Xoá**, không phải *Ngừng hợp tác*.

Đổi nhãn thì dễ, nhưng nó kéo theo một quyết định không tránh được: **nhãn trạng thái sau khi bấm**.
Bấm nút *Xoá* rồi thấy bản ghi mang nhãn *Đã ngừng hợp tác* là bắt người dùng tự dịch giữa hai cách
gọi cho một việc họ vừa làm. Nên thống nhất **một từ vựng ở mọi chỗ người dùng nhìn thấy**:

| Chỗ | Trước | Sau |
|---|---|---|
| Nút trên màn hình khách hàng | Ngừng hợp tác | **Xoá** |
| Tiêu đề hộp thoại | Ngừng hợp tác với X | **Xoá khách hàng X** |
| Nút xác nhận trong hộp thoại | Xoá khách hàng / Ngừng hợp tác | **Xoá** (một nhãn cho cả hai kết cục) |
| Nhãn trạng thái | Đã ngừng hợp tác | **Đã xoá** |
| Khoá phân quyền | `ngungHopTac` | `xoaKhachHang` |
| Thông điệp lỗi của máy chủ | "…mới ngừng hợp tác được" | "…mới xoá được" |

Nút xác nhận trước đây đổi nhãn theo kết cục — *Xoá khách hàng* khi sẽ xoá hẳn, *Ngừng hợp tác* khi
sẽ giữ lại. Bỏ luôn: người dùng không quyết định giữa hai kết cục ấy, hệ thống quyết. Một nút đổi
nhãn theo một điều người bấm không chọn được chỉ làm họ nghĩ là mình đang chọn.

### Cái KHÔNG đổi, và vì sao

Bên trong vẫn là `NGUNG_HOP_TAC`: enum của CSDL, mã lỗi `CUSTOMER_ALREADY_RETIRED`, sự kiện
`policy.customer_retired`, hành động `CUSTOMER_RETIRED` trong nhật ký hồ sơ. Đó là **hai lớp từ
vựng khác nhau, có chủ ý**:

* Người dùng nói "xoá" vì với họ khách hàng ấy biến khỏi công việc hàng ngày.
* Hệ thống nói "retired" vì dòng dữ liệu **vẫn còn** — hồ sơ CSBH trỏ vào khách hàng bằng khoá
  ngoại, và xoá hẳn là mất tên khách trên mọi hồ sơ cũ, kể cả hồ sơ đã ký.

Đổi enum theo nhãn màn hình sẽ tạo ra một cái tên nói dối về thứ nó lưu. Chỗ nối hai lớp là hộp thoại
— nó nói thẳng: *"bản ghi được giữ lại để tra cứu hồ sơ cũ, nhưng đánh dấu Đã xoá"*.

Không đổi test nào: chúng khẳng định mã lỗi và enum, không khẳng định nhãn. 913/913 xanh.

---

## P46 — TDV xoá được hồ sơ bị trả lại

Yêu cầu: TDV xoá được **những hồ sơ mình sửa được** — bị *Yêu cầu chỉnh sửa*, hoặc L1/L2 không tiếp
nhận. Hồ sơ đó chuyển sang trạng thái mới **Đã xoá**, ghi vào lịch sử giống *Từ chối*. Riêng hồ sơ
**chưa gửi duyệt** thì xoá không cần lưu lịch sử, để tránh spam.

### Lỗ hổng đang bịt

Trước đợt này, `YEU_CAU_CHINH_SUA` có đúng **một** đường đi ra: sửa rồi gửi lại. Không có đường bỏ.
Nên những hồ sơ sẽ không bao giờ được gửi lại — khách đổi ý, lập nhầm khách, đã có bản khác thay —
nằm mãi trong hộp việc của chính người lập, và mãi trong ô *Yêu cầu chỉnh sửa* của báo cáo tỷ lệ
trả lại.

### Điều kiện là `EDITABLE`, không phải một danh sách riêng

"Xoá được đúng những hồ sơ sửa được" là nguyên văn yêu cầu, nên nó viết thành **cùng một hằng số**
mà `mustEdit()` đang dùng. Ba đường trả về (TBP yêu cầu chỉnh sửa, KT không tiếp nhận L1, KT không
tiếp nhận L2) đều đổ về `YEU_CAU_CHINH_SUA`, nên cả ba tự động nằm trong. Giao diện cũng không chép
danh sách trạng thái: nút Xoá hiện đúng khi `dangSua` bật.

### Hai kết cục, hệ thống chọn

| Hồ sơ ở | Kết cục | Vì sao |
|---|---|---|
| `NHAP` | Xoá hẳn dòng, **không** dòng nhật ký nào | Chưa ai ngoài người lập thấy nó. Ghi một dòng "đã xoá" cho mỗi lần lập nhầm là chống spam ngược — người lập sẽ ngại mở bản nháp |
| `YEU_CAU_CHINH_SUA` | `DA_XOA` + `policy_event` như `TU_CHOI` | Hồ sơ đã qua tay người khác, đã bị trả lại kèm lý do. Xoá sạch là làm biến mất luôn phần việc của họ |

Cùng một nút, cùng một `DELETE /policies/:id` — người dùng không chọn giữa hai kết cục. Cùng nếp với
`0034` (xoá khách hàng). Hộp thoại xác nhận **nói đúng cái sắp xảy ra**, hai câu chữ khác nhau: nói
chung chung cho cả hai là đúng một nửa ở mỗi vế.

### Ba quyết định đáng ghi

**`DA_XOA` KHÔNG có luật nào trong máy trạng thái.** Thêm nó vào `RULES` sẽ làm
`allowedActions('YEU_CAU_CHINH_SUA')` mọc thêm một hành động, và giao diện bày nó giữa dải nút
*Thao tác* — ngay cạnh "Gửi lại duyệt", đúng chỗ dễ bấm nhầm nhất — trong khi xoá phải đứng riêng và
phải gõ lại mã hồ sơ mới chạy. Có một test khẳng định thẳng điều này: quét mọi `(trạng thái, hành
động, vai trò)` và đòi không tổ hợp nào dẫn tới `DA_XOA`.

**`policy.discarded`, không phải `policy.deleted`.** Hai khoá cho hai chuyện khác hẳn ở phía
reporting: `policy.deleted` nghĩa là dòng nguồn không còn và `sync.service.ts` **xoá** dòng
read-model theo nó. Dùng lại khoá ấy thì hồ sơ `DA_XOA` biến mất khỏi mọi báo cáo — đúng thứ việc
giữ lại lịch sử sinh ra để tránh.

**Sửa một lỗi có sẵn: điều kiện "đúng người" đọc nhầm cột.** `remove()` so với `created_by`. Cột đó
đứng yên khi hồ sơ đổi tay lúc bàn giao (`0032`), nên sau khi một TDV nghỉ việc thì người kế nhiệm
không xoá được hồ sơ mình đang phải xử lý, còn người xoá được thì đã bị vô hiệu hoá — đúng loại hồ sơ
treo mà cả đợt bàn giao sinh ra để dọn. Giờ so với `tdv_user_id`.

### Quét lại mọi chỗ đếm "trạng thái kết thúc"

Thêm một trạng thái kết thúc không phải chỉ là thêm một dòng vào enum. Bốn chỗ phải sửa cùng lúc, và
**quên chỗ nào cũng cho ra một ngõ cụt kín** — hồ sơ không đi tiếp được mà cũng không ai gỡ được:

* `ngung-hop-tac.controller.ts` — hồ sơ `DA_XOA` vẫn bị đếm là "đang chờ" thì khách hàng của nó
  không xoá được nữa, vĩnh viễn.
* `ban-giao.controller.ts` — bàn giao một hồ sơ đã bỏ chỉ làm dài thêm bảng xem trước.
* `trg_forbid_delete_rejected` ở CSDL — mở rộng sang `DA_XOA` (tên trigger giữ nguyên: đổi tên là
  sửa `seed-demo.ts`, bốn tệp test và một phép khẳng định đọc thẳng `pg_trigger.tgname`).
* Bốn bảng nhãn: giao diện, thư, bản A4, và `TERMINAL` của `@csbh/domain-policy`.

### Quyền thu lại

`DELETE /policies/:id` từ `WRITERS + QUAN_TRI` xuống còn `TDV`, và `QUYEN_GHI.xoaHoSo` cũng vậy.
Bốn vai trò kia có mặt ở đó từ P11d mà **chưa bao giờ xoá được gì** — `remove()` luôn đòi hồ sơ ở
trạng thái của người lập và đúng người phụ trách. Bày ra một quyền chỉ dẫn tới 403 là mời người đọc
bảng phân quyền hiểu sai.

### Test

+32 ca, **945/945 xanh**. Phần đáng kể nhất là bảng dựng từng hồ sơ tới **đúng mười hai trạng thái**
rồi thử xoá ở mỗi cái — thêm một trạng thái vào enum mà quên thử xoá ở đó là đúng loại lỗ hổng chỉ lộ
ra khi có người bấm trúng. Hai trạng thái phải đặt bằng SQL vì không lời gọi nào tới được: `QUA_HAN_DUYET`
(chỉ `sla-worker` đặt) và `TBP_DA_KY_SO` (chớp nhoáng — `TBP_SIGN` tự chuyển tiếp trong cùng
transaction).

---

## P47 — Danh mục biến mất cũng là thay đổi · xác nhận bằng cách gõ lại · thư cho mọi người đã tác động

Bốn yêu cầu, và ba trong số đó bịt những lỗ đã mở sẵn từ lâu.

### 1. Vô hiệu hoá hay xoá sản phẩm cũng là một thay đổi (`0036`)

Box *Yêu cầu cập nhật* (`0029`) nhận ra đúng hai loại lệch: giá và ngưỡng. Thiếu loại thứ ba, và nó
**nặng hơn cả hai**: một CSBH đang có hiệu lực cho mặt hàng không còn bán nữa không phải "lệch vài
đồng" — nó là một điều khoản không thực hiện được.

Hai lỗ, cùng một gốc:

* `catalog.changed` với `entity = 'product'` bị consumer **bỏ qua hoàn toàn**. Vô hiệu hoá một sản
  phẩm không đổi giá của nó, mà phép rà chỉ so giá và ngưỡng — nên nó lọt qua sạch.
* Sản phẩm bị **xoá hẳn** thì lời gọi tra ảnh chụp trả 404 cho cả lô và consumer `continue`, bỏ qua
  **toàn bộ hồ sơ**. Một sản phẩm biến mất che mất mọi chênh lệch còn lại của chính hồ sơ đó. Giờ
  đường nhanh vẫn là một lời gọi cả lô, hỏng mới lùi về hỏi từng cái — đường chậm chỉ chạy đúng lúc
  có sản phẩm bị xoá.

`null` ở cột `new_value` giờ mang hai nghĩa tuỳ loại, và cả thư lẫn màn hình đều phải nói đúng nghĩa:
ở `RULE` là "không còn quy định nào phủ", ở `PRODUCT` là "đã xoá khỏi danh mục". Nhãn `Sản phẩm` tô
**đỏ**, hai nhãn kia thì không — đỏ dành cho thứ không làm gì được nữa, không dành cho một con số để
cân nhắc.

Xoá quy định chiết khấu thì **đã chạy đúng từ trước** (ngưỡng về rỗng là một chênh lệch `RULE`), chỉ
thiếu ca kiểm thử khẳng định điều đó. Giờ có.

### 2. Xác nhận bằng cách gõ lại mã (`0036`)

Nếp đã có từ `0032` cho tài khoản, giờ thành hàm dùng chung `xacNhanGoLai` ở `http-kit` và phủ bốn
đường: xoá nhóm sản phẩm, xoá quy định chiết khấu, **vô hiệu hoá** sản phẩm, vô hiệu hoá tài khoản.

Ba quyết định:

**Mã nghiệp vụ, không phải uuid.** Yêu cầu viết "nhập id hoặc username". Với người dùng thì username
đúng nguyên văn; với sản phẩm và quy định thì thứ hiện trên màn hình và gõ lại được là **mã** —
uuid thì không ai gõ, họ sẽ sao chép, mà sao chép cũng phản xạ y như bấm nút, tức là chốt chặn biến
thành một bước thừa không chặn được gì.

**Tài khoản đổi từ họ tên sang tên đăng nhập.** Họ tên **không duy nhất** — hai người trùng tên trong
một danh sách là chuyện bình thường — nên gõ đúng họ tên không chứng minh được người quản trị đang
nhìn đúng dòng, mà đó là toàn bộ việc phép kiểm này phải làm.

**Chỉ thao tác PHÁ HUỶ mới đòi.** Đổi tên sản phẩm không đòi, bật lại sản phẩm đã vô hiệu hoá không
đòi. Bắt gõ mã cho mọi lần lưu là làm mòn chính chốt chặn ấy: người dùng gõ mãi thành phản xạ rồi gõ
luôn cả lúc vô hiệu hoá.

### 3. Thư cho mọi người đã tác động, và liên kết dẫn tới nhật ký (`0036`, `0037`)

Nguồn người nhận là **nhật ký của chính hồ sơ**, không phải bốn cột phân công. Hai tập ấy khác nhau ở
đúng ca đáng quan tâm: Trưởng bộ phận trả hồ sơ về, người lập sửa rồi gửi cho một Trưởng bộ phận
khác — người thứ nhất biến khỏi cột `tbp_user_id` nhưng vẫn là người đã đọc hồ sơ và đã viết lý do.

**Hai lá thư, không phải một lá gửi cho nhiều người hơn.** Hai nhóm cần hai đường dẫn khác nhau, và
một lá thư chỉ mang được một liên kết. Trừ ba nhóm khỏi lá thứ hai: người vừa nhận lá thứ nhất,
người vừa bấm nút, và tài khoản đã vô hiệu hoá.

**KHÔNG gắn observers vào `PUBLISH_SIGNED`** — đó là bước hệ thống tự chạy trong cùng transaction với
`TBP_SIGN`, và lá thư của bước ký vừa bay đi một khoảnh khắc trước.

**Lỗi đáng ghi nhất của đợt.** Bản đầu tôi nhét hậu tố vào chính `event_id` (`<uuid>:theo-doi`) làm
khoá chống trùng cho lá thư thứ hai. Cột kiểu `uuid` từ chối — và nó từ chối ở đúng chỗ tệ nhất: lỗi
ném ra SAU khi lá thư chính đã gửi xong, nhánh dọn dẹp xoá chỗ đã giữ của lá thư ấy rồi đẩy cả sự
kiện vào bảng thư hỏng, nên gửi lại từ đó là gửi trùng lá thư chính. `0037` đổi khoá chống trùng
thành cặp `(event_id, kind)`, và thêm một cờ để nhánh `catch` không trả lại chỗ đã giữ của một lá
thư đã bay đi.

**Sửa một liên kết hỏng từ đầu dự án.** Mọi lá thư trỏ tới `${webBaseUrl}/policies/:id` — đường của
**API**, không phải của giao diện. `App.tsx` không bắt nó, nên mọi liên kết trong mọi thông báo từ
trước tới nay đều dẫn tới "Không có màn hình nào ở địa chỉ này". Giờ là `/ho-so/:id`, và có một ca
kiểm thử trong `dieu-huong.test.tsx` quét cả hai đường dẫn xuất hiện trong thư.

### 4. Màn hình Nhật ký hồ sơ (`0036`)

`GET /policies/:id/events` có từ chặng đầu và **không màn hình nào gọi nó**, nên mọi câu hỏi kiểu
"ai trả hồ sơ này về, lý do gì" chỉ trả lời được bằng cách đọc thẳng cơ sở dữ liệu.

Màn hình RIÊNG ở `/ho-so/:id/nhat-ky`, không phải một khối gập trong trang chi tiết — nó cần một địa
chỉ để dán vào thư. Đường API giờ trả kèm **tên** người thao tác; đọc "e207b271-… đã ký số" không
trả lời được câu hỏi người ta vào đây để hỏi.

Bảng nhãn hành động viết RIÊNG, không dùng lại `HANH_DONG_NHAN`: bảng kia là nhãn **nút** (mệnh
lệnh, "Ký số duyệt" — đọc trong lịch sử thì nghe như việc đang chờ làm) và chỉ có những hành động
**có nút**. Nhật ký còn chứa `PUBLISH_SIGNED`, `SLA_OVERDUE`, `HANDOVER`, `CUSTOMER_RETIRED` — thiếu
chúng thì đúng những dòng khó hiểu nhất lại hiện ra dưới dạng mã viết hoa.

### Test

+56 ca, **1001/1001 xanh**. Ba bảng phủ theo trạng thái: vô hiệu hoá sản phẩm × 12 trạng thái (bảy
vào box, năm không), nhật ký đọc được × 12 trạng thái, và ma trận xác nhận cho bốn đường phá huỷ.

---

## P48 — Dải nút *Thao tác* chỉ hiện việc vai trò ấy làm được

Không có tệp migration nào ở đợt này — `0038` là NHÃN của một đợt chỉ đụng tầng service và giao diện.
Cùng nếp với `0028`, `0030` và `0032`.

### Lỗi

`GET /policies/:id/allowed-actions` trả về `allowedActions(status)` — lọc theo **trạng thái**, không
xét ai hỏi. `ChiTietHoSo` đem thẳng danh sách ấy ra vẽ nút. Ba nhóm nút chắc chắn hỏng khi bấm:

1. **Nút của vai trò khác.** Trình dược viên mở hồ sơ của chính mình đang *Chờ TBP duyệt* thấy đủ
   "Ký số duyệt", "Trả lại chỉnh sửa", "Từ chối hồ sơ" — cả ba trả 403 `FORBIDDEN_ROLE`.
2. **Nút của HỆ THỐNG.** `PUBLISH_SIGNED` (tự chạy sau khi ký) và `SUPERSEDE` (tự chạy khi bản mới có
   hiệu lực) không ai bấm, vẫn hiện — và vì không có nhãn tiếng Việt nên hiện **nguyên mã viết hoa**.
3. **Ban lãnh đạo.** Vai trò chỉ đọc (muc 2.6) vẫn thấy nguyên dải nút của bước hiện tại.

### Sửa ở MÁY CHỦ trước

`allowedActionsFor(status, role)` suy thẳng từ `RULES` — không khai thêm bảng vai trò thứ hai, vì
bảng ấy sẽ có ngày lệch với chính máy trạng thái, và lệch về phía "thừa" thì lại đúng kiểu lỗi này.
Mọi client nhận cùng một câu trả lời, kể cả màn hình viết sau này.

**Thông báo lỗi thì NGƯỢC LẠI**: `INVALID_TRANSITION` vẫn liệt kê đủ hành động của trạng thái. Câu đó
nói về trạng thái — "ở đây chỉ đi tiếp được bằng X hoặc Y" — nên phải kể cả việc của người khác. Lọc
luôn ở đó thì Kế toán bấm nhầm đọc được "hành động được phép: không có", và hiểu ra là hồ sơ hỏng chứ
không phải đang chờ Trưởng bộ phận.

### Bảy quyền khai từ P11 mà chưa ai gọi

`traLai` · `tuChoi` · `tiepNhanL1` · `banGiao` · `tiepNhanL2` · `yeuCauInLai` · `guiDuyet` — đều nằm
trong `QUYEN_GHI` với **0 chỗ dùng**. Chúng được viết ra đúng cho việc này rồi bỏ quên. Giờ nối lại
qua bảng `QUYEN_HANH_DONG`.

Và ca kiểm thử đối chiếu bảng ấy với máy trạng thái **bắt được một lỗi ngay lúc viết**: `traLai:
['TBP','KE_TOAN']` là một khoá quá thô cho ba hành động của hai người khác nhau — nó nói Kế toán trả
lại được ở bước của Trưởng bộ phận. Tách thành `traLaiTbp` và `traLaiKt`.

Giữ lớp giao diện dù máy chủ đã lọc, vì hai lý do cụ thể: `FE-23` quét chính bảng quyền để khẳng định
Ban lãnh đạo không có nút ghi nào — một khẳng định đọc được ngay trong mã thay vì phải dựng máy chủ
lên mới biết; và một danh sách cũ còn trong bộ nhớ trình duyệt sau khi đổi tài khoản thì đây là thứ
chặn nó. Nó là bản sao **được kiểm**, không phải bảng thứ hai tự do trôi.

### Rà nốt các màn hình còn lại

Quét mọi tệp có lời gọi ghi rồi đối chiếu với `can()`: **không có ổ thứ hai**. Mười một tệp không tự
gác quyền đều là component con đã được cha gác — `TepDinhKem` và `HoSoPhapLy` nhận `choPhepGhi` từ
cha; ba thẻ danh mục nằm sau `can(vaiTro,'quanTriDanhMuc')`; `MauHopDong` nằm sau `xem(vaiTro,
'mauHopDong')` ở tầng định tuyến; các hộp thoại chỉ mở được từ nút đã gác; ba màn hình mật khẩu là
tự phục vụ, mọi vai trò đều dùng.

### Test

+21 ca, **1023/1023 xanh**. Hai bảng phủ: máy chủ × 11 trạng thái × 5 vai trò (kỳ vọng viết TAY, không
suy từ chính hàm đang kiểm), và giao diện × mọi cặp (trạng thái × vai trò) đối chiếu với máy trạng
thái. Sửa thêm một ca mong manh: `lech()` cắt ở `limit=50` trong khi hồ sơ lệch cộng dồn trên CSDL
dùng chung, nên hồ sơ vừa dựng rơi ra ngoài trang đầu.

---

## P49 — TDV xoá được hồ sơ đã bị Từ chối

Không có tệp migration — `0039` là nhãn của một đợt chỉ đụng service và giao diện, cùng nếp với
`0028`, `0030`, `0032`, `0038`.

### Điều luật cũ nói ngược lại, và nó không bị bỏ

`POL-14` / YCNV muc 4: *"Hồ sơ ở Từ chối không ai xóa được, kể cả người tạo — giữ nguyên trong lịch
sử và trong báo cáo tỷ lệ hồ sơ bị trả lại."*

Điều ấy bảo vệ **dấu vết**, không bảo vệ con số trên thẻ đếm. Từ `0035` "xoá" một hồ sơ đã vào luồng
đã không còn nghĩa là xoá dòng — nó chuyển `DA_XOA` và ghi thêm một dòng nhật ký. Nên yêu cầu mới
không đụng vào thứ `POL-14` giữ:

| `POL-14` giữ gì | Sau `0039` |
|---|---|
| Dòng dữ liệu | Còn nguyên. `trg_forbid_delete_rejected` vẫn chặn XOÁ DÒNG ở cả `TU_CHOI` lẫn `DA_XOA` |
| Lịch sử | Dài thêm một dòng `DELETE`, lý do từ chối của TBP còn nguyên |
| Báo cáo tỷ lệ trả lại | Không đổi — xem dưới |

Cái mất đi đúng bằng cái người dùng muốn mất: hồ sơ thôi nằm trong thẻ *Từ chối* của người lập.

### Chỗ suýt hỏng, và hỏng theo hướng đẹp lên

Báo cáo tỷ lệ trả lại đếm `count(*) FILTER (WHERE status = 'TU_CHOI')`. Với `0039` thì **mỗi lần dọn
màn hình là một lần tỷ lệ từ chối của chính người đó tụt xuống** — một chỉ số tự bào mòn, và bào theo
hướng không ai nhìn ra vì nó chỉ nhỏ đi.

Đổi sang đếm theo `rejected_at IS NOT NULL` (và `returned_at` cho vế trả lại): mốc **đã xảy ra**,
không đảo ngược được. Đây cũng đúng nguyên văn muc 4 — "giữ nguyên trong báo cáo tỷ lệ hồ sơ bị trả
lại" — chỉ là giữ bằng cột mốc thay vì bằng trạng thái.

### `xoaDuoc` là cờ do máy chủ tính

Tới `0035` giao diện suy điều kiện xoá từ `allowed-actions`: hồ sơ nào còn `SUBMIT` hoặc
`RESUBMIT_AFTER_EDIT` thì sửa được, mà sửa được thì xoá được. `0039` **cắt đứt phép suy ấy** —
`TU_CHOI` xoá được mà không có hành động nào đi ra.

Trả về một cờ boolean thay vì chép danh sách trạng thái sang giao diện: máy chủ vẫn là nơi duy nhất
biết luật, và nó đã tính sẵn cả phần "đúng TDV đang phụ trách" mà giao diện không biết. Cùng lý do
`XOA_DUOC` tách khỏi `EDITABLE` — hai câu hỏi giờ có hai câu trả lời, gộp một chỗ là sẽ sai khi một
trong hai đổi tiếp.

### Hai câu chữ phải đổi theo

* **Hộp thoại** nói "lý do **từ chối**" thay vì "lý do trả lại" khi hồ sơ ở `TU_CHOI`, và nói thêm
  một câu về báo cáo — đó là chỗ người lập dễ hiểu nhầm nhất, họ dễ tưởng xoá là xoá khỏi mọi con số.
* **Tiêu đề thư** bỏ chữ "bị trả lại": `DELETE: 'Trình dược viên đã xoá hồ sơ'`. Một tiêu đề đúng cho
  nửa số trường hợp là tiêu đề sai.

### Test

+9 ca, **1032/1032 xanh**. `POL-14` tách làm ba ca thay vì một: không xoá được dòng (kể cả SQL thô) ·
năm vai trò kia vẫn không đụng được · chính TDV phụ trách thì chuyển được sang `DA_XOA`. Thêm ma trận
cờ `xoaDuoc` ở đủ 12 trạng thái, và một ca khẳng định báo cáo **không đổi** sau khi xoá.

---

## P50 — Đăng nhập xong là vào trang tổng quan

Nhãn `0040`, không có tệp migration — chỉ đụng giao diện.

### Trước đó

Không có bước điều hướng nào sau khi đăng nhập: màn hình hiện ra là bất cứ đường dẫn nào đang nằm
trên thanh địa chỉ. Mở app ở `/` thì tình cờ đúng, nên lỗi này khuất — nhưng mở lại một tab cũ đang
đứng ở `/nguoi-dung` hay `/bao-cao` thì người dùng rơi thẳng vào giữa một màn hình con, và với vai
trò không xem được màn hình ấy thì rơi vào *"Bạn không có quyền"* NGAY SAU khi đăng nhập thành công.

### Ngoại lệ có chủ ý: lớp phủ phiên hết hạn

`DangNhap` phục vụ hai tình huống, và chỉ tình huống thứ nhất được điều hướng:

| Tình huống | Sau khi đăng nhập |
|---|---|
| Đăng nhập đầu (toàn màn hình) | Về `/` |
| Phiên hết hạn giữa chừng (`lopPhu`) | **Ở nguyên chỗ cũ** |

Vế thứ hai là `FE-33`: lớp phủ không dỡ màn hình bên dưới, nên state React của biểu mẫu đang dở vẫn
còn nguyên. Đá người dùng về trang tổng quan ở đó là làm mất đúng thứ lớp phủ ấy sinh ra để giữ.

**Đánh đổi phải nói ra**: liên kết sâu từ email (`/ho-so/:id`) giờ cũng bị đưa về trang tổng quan nếu
người nhận chưa đăng nhập. Đó là hệ quả trực tiếp của yêu cầu — "luôn vào trang tổng quan" và "giữ
liên kết sâu" không cùng đúng được. Muốn giữ liên kết thì điều kiện đổi thành "chỉ điều hướng khi
đường dẫn hiện tại là `/`", một dòng.

### Test

+14 ca. Hai ca cho **mỗi** vai trò trong sáu vai trò: mở ở `/` rồi đăng nhập, và mở ở `/nguoi-dung`
rồi đăng nhập — đường dẫn thứ hai chọn có chủ ý vì năm trong sáu vai trò không xem được nó.

Thêm hai ca ngoài ma trận:

* **Trang tổng quan dựng XONG, không khối nào nổ giữa chừng.** Khẳng định "về đúng đường dẫn" chưa
  đủ — một khối nổ lúc dựng thì đường dẫn vẫn là `/` mà màn hình trắng. Chính chuyện đó xảy ra khi
  viết tệp này: stub trả `byTdv` trong khi máy chủ trả `byHandler`, khối *Theo từng TDV* của Sale
  Admin chết, và ca kiểm thử vẫn xanh vì nó chỉ soi đường dẫn. Ca mới bắt `console.error` và đòi
  không có "Uncaught" nào.
* **Màn hình công khai không bị đá về trang tổng quan** — `/quen-mat-khau` đứng trước lớp kiểm phiên.

**1047/1047 xanh.**

---

## P51 — Giữ liên kết sâu từ thư báo khi đăng nhập

Nhãn `0041`. Sửa đúng cái đánh đổi đã nêu ở `P50`.

### Câu tôi đề xuất ở P50 là SAI

Tôi viết: *"muốn giữ liên kết thì đổi điều kiện thành: chỉ điều hướng khi đường dẫn hiện tại là `/`"*.
Điều kiện đó **vô tác dụng** — `di('/')` khi đang ở `/` vốn đã không làm gì (`router.tsx` thoát sớm
khi đường dẫn không đổi). Nó bằng đúng việc gỡ bỏ `0040`, và tab cũ đứng ở `/nguoi-dung` lại rơi vào
"Bạn không có quyền" như trước.

### Tín hiệu thật để phân biệt

Hai tình huống trông giống hệt nhau ở tầng mã — chưa đăng nhập, đường dẫn khác `/` — mà người dùng
muốn hai kết cục ngược nhau:

| Tình huống | Đường dẫn thường gặp | Muốn gì |
|---|---|---|
| Tab cũ mở lại | `/nguoi-dung`, `/bao-cao`, `/ho-so` | Về trang tổng quan |
| Bấm liên kết trong thư | `/ho-so/<id>`, `/ho-so/<id>/nhat-ky` | Vào đúng hồ sơ đó |

Phân biệt được bằng đúng một thứ: **đường dẫn có trỏ vào một bản ghi cụ thể không**. Danh sách và màn
hình quản trị thì không; `/ho-so/<id>` thì có. `GIU_DUONG` vì thế chỉ chứa đường CÓ THAM SỐ — thêm
một đường không tham số vào đó là mở lại đúng tình huống thứ nhất.

`/ho-so/moi` khớp mẫu `/ho-so/:id` mà không phải bản ghi — cùng cái bẫy `App.tsx` phải xử bằng thứ
tự. Loại thẳng, và loại là đúng chứ không chỉ để tránh bẫy: phiên nằm ở `sessionStorage` nên mất
phiên là mất luôn nội dung đang gõ, trả người dùng về một biểu mẫu trống không giúp được gì.

### Test

+4 ca. Một ca dựng THẬT màn hình chi tiết qua liên kết sâu và đòi thấy mã hồ sơ trên màn hình, chứ
không chỉ đòi đúng đường dẫn — bài học từ `P50`. Ba ca còn lại kiểm thẳng `duongSauDangNhap`: giữ ba
đường bản ghi, đưa về `/` mười một đường danh sách và quản trị, và loại `/ho-so/moi`.

**1051/1051 xanh.**

---

## P52 — Không phải đăng nhập lại chừng nào không có gì thay đổi

Nhãn `0042`.

### Yêu cầu nói "bỏ refresh token", nhưng bỏ nó cho kết quả NGƯỢC LẠI

Refresh token chính là thứ giữ người dùng khỏi phải đăng nhập lại. Bỏ nó đi thì chỉ còn access token
**15 phút** — cứ mười lăm phút một lần đăng nhập. Điều thật sự bắt người dùng đăng nhập lại là hai
thứ khác:

| Nguyên nhân | Trước `0042` | Sau |
|---|---|---|
| Hạn refresh token | 8 giờ | **30 ngày**, đọc được từ `REFRESH_TTL_SEC` (hạ xuống **7 ngày** ở `P54`) |
| Nơi giữ phiên | `sessionStorage` — chết theo TAB | **`localStorage`** |

Vế thứ hai mới là thứ người dùng gặp hàng ngày: dù hạn token có ba mươi ngày, đóng trình duyệt là
phải đăng nhập lại. Kéo dài hạn mà vẫn để ở `sessionStorage` thì không đổi được gì.

### 30 ngày là "nghỉ bao lâu", không phải "làm việc bao lâu"

Refresh token đã XOAY VÒNG sẵn từ đầu: mỗi lần làm mới, token cũ bị đánh dấu đã dùng và một token mới
ra đời với hạn tính lại từ đầu. Nên con số này là trần của thời gian KHÔNG DÙNG. Người dùng mở phần
mềm mỗi tuần thì không bao giờ gặp lại màn hình đăng nhập — đúng nguyên văn yêu cầu.

### Cái giá, và bốn thứ trả nó

Một token sống ba mươi ngày chỉ chấp nhận được khi thu hồi được. Cả bốn đường thu hồi đã có sẵn trong
mã từ trước, đợt này chỉ kiểm chúng từng cái vì giờ chúng gánh nhiều hơn hẳn:

1. **Đổi mật khẩu** → `revokeAllSessions`, cắt cả phiên ở máy khác.
2. **Vô hiệu hoá tài khoản** → mỗi lần làm mới đọc `is_active` TƯƠI từ CSDL, không qua cache, nên
   không phải chờ hết 60 giây của `accountCacheTtlSec`.
3. **Đăng xuất** → thu hồi cả họ token, không riêng cái đang cầm.
4. **Dùng lại một token đã xoay vòng** → dấu hiệu bị đánh cắp, thu hồi cả họ.

`nhap-tam.ts` **giữ nguyên `sessionStorage`**, và khác biệt là có chủ ý: phiên thì thu hồi được từ xa
và người dùng thấy rõ mình đang đăng nhập, còn nội dung hồ sơ khách hàng nằm lại trong `localStorage`
sau khi người ta rời khỏi một máy dùng chung thì không ai thu hồi được và không ai biết nó ở đó.

### Một quả bom hẹn giờ dọn tiện tay

`reporting.test.ts` dựng mã số thuế bằng `` `0${Date.now() % 1_000_000_000}` ``. Phần dư ấy rơi xuống
8 chữ số suốt **~28 giờ trong mỗi chu kỳ 11,6 ngày**, và khi ấy mã chỉ còn 9 ký tự — máy chủ từ chối,
hai ca đỏ mà chẳng dính gì tới điều đang kiểm. Khoảng 10% số ngày là đỏ. Thêm `padStart(9, '0')`.

### Test

+6 ca. Một ca khẳng định xoay vòng gia hạn lại từ đầu (điểm dễ hiểu nhầm nhất của con số 30 ngày), và
bốn ca cho bốn đường thu hồi — mỗi ca dùng một tài khoản tạo riêng, vì chúng thu hồi sạch phiên và
mượn `tdv01` thì ca chạy sau mất phiên vì lý do chẳng liên quan.

**1056/1056 xanh.**

---

## P53 — Token xoay vòng phải được ghi lại, nếu không phiên chết khi mở lại trình duyệt

Nhãn `0043`. Đây là lỗi CHẶN yêu cầu "tắt trình duyệt bật lại vẫn giữ phiên" mà `0042` một mình chưa
làm được.

### Lỗi

`lamMoiToken()` ở `api.ts` cập nhật biến `phien` TRONG BỘ NHỚ sau mỗi lần xoay vòng, và không ghi
xuống kho. Chuỗi sự việc:

1. Đăng nhập → kho lưu `R1`.
2. Mười lăm phút sau, một lời gọi nhận 401 → làm mới → máy chủ đánh dấu `R1` đã dùng, trả về `R2`.
   Bộ nhớ giữ `R2`, **kho vẫn giữ `R1`**.
3. Người dùng đóng trình duyệt.
4. Mở lại → nạp `R1` từ kho → lời gọi đầu 401 → gửi `R1` lên làm mới.
5. Máy chủ thấy `used_at IS NOT NULL` → `REFRESH_REUSED` → **thu hồi CẢ HỌ**.

Kết cục tệ gấp đôi việc chỉ mất phiên: người dùng vừa phải đăng nhập lại, vừa mất luôn phiên đang mở
ở máy khác — vì phép phát hiện đánh cắp làm đúng việc của nó với một tín hiệu mà chính giao diện tạo
ra.

Trước `0042` lỗi này gần như vô hình: phiên nằm ở `sessionStorage` và chết theo tab, nên hiếm khi có
ai mở lại với một token đã lưu. Đúng lúc phiên phải sống qua việc đóng trình duyệt thì nó lộ ra.

### Sửa

Thêm móc `dangKyLuuPhien(fn)` ở `api.ts`, gọi ngay sau khi xoay vòng thành công. `auth.tsx` đăng ký
một hàm ghi cặp token mới đè lên bản lưu, giữ nguyên phần `user` — lời gọi làm mới chỉ trả về hai
token, không trả hồ sơ người dùng.

### Test

+2 ca. Ca thứ hai dựng đúng kịch bản người dùng mô tả: **đăng nhập · làm việc · tắt trình duyệt · bật
lại**, trong đó "tắt trình duyệt" là xoá phiên trong bộ nhớ rồi nạp lại từ kho — đúng những gì
`PhienProvider` làm lúc khởi động. Máy chủ giả từ chối token đã dùng, nên ca này đỏ trước `0043`.

**1058/1058 xanh.**

---

## P54 — Hạ cửa sổ phiên từ 30 ngày xuống 7 ngày

Nhãn `0044`. Khách hàng chốt sau khi được hỏi rõ hai cách hiểu của "hết 30 ngày".

**Vẫn tính từ LẦN DÙNG GẦN NHẤT**, không phải từ lần đăng nhập — đó là điều đã hỏi và đã chốt. Nên
tính chất quan trọng nhất không đổi: người dùng mở phần mềm hàng tuần thì **không bao giờ** gặp lại
màn hình đăng nhập. Chỉ có trần của thời gian NGHỈ ngắn lại, nên một máy bị bỏ quên hết hiệu lực sau
một tuần thay vì một tháng.

Đổi đúng một hằng số mặc định; `REFRESH_TTL_SEC` vẫn ghi đè được cho từng môi trường.

**Khoá màn hình khi rảnh**: đã hỏi, khách hàng trả lời **chưa cần bây giờ**. Người rời máy tự bấm
*Đăng xuất*, và hướng dẫn sử dụng đã nói rõ điều đó ở phần máy dùng chung. Ghi lại ở đây để lần sau
không phải hỏi lại.

---

## P55 — Dải thẻ trang tổng quan viết lại theo bản khách hàng chốt

Khách hàng đưa thẳng bốn danh sách thẻ và hai định nghĩa, kèm một yêu cầu: **bấm được vào mọi thẻ**.

| Vai trò | Thẻ |
|---|---|
| TDV | Yêu cầu chỉnh sửa · Nháp · Đang chờ · Đang có hiệu lực · Từ chối |
| TBP | Chờ TBP duyệt · Đang chờ · Đang có hiệu lực · Từ chối |
| Kế toán | KT duyệt bản mềm · KT duyệt bản cứng · Đang chờ · Đang có hiệu lực |
| Sale Admin | Trình ký · Lỗi bản cứng · Đang chờ · Đang có hiệu lực |

Bốn điểm phải hỏi lại trước khi sửa, vì mỗi điểm đổi hẳn con số trên thẻ.

### Điểm một: hồ sơ quá hạn — tôi đã nói ngược lại khách hàng, và giữ nguyên ý đó

Khách hàng trả lời *"không cần thẻ cho trạng thái này, vì khi đã quá hạn coi như hồ sơ đó đã chết,
không thể thao tác được nữa"*.

Tiền đề ấy **không đúng với hệ đang chạy**. `QUA_HAN_DUYET` là một cái nhãn dán chồng: bước đang chờ
cất riêng ở `pending_step`, `effectiveStatus()` gỡ nhãn ra rồi xét trạng thái thật, và người phụ
trách vẫn duyệt / trả lại / từ chối bình thường. `TERMINAL` chỉ có `TU_CHOI` và `DA_XOA`.

Nói thẳng chỗ đó rồi vẫn làm theo quyết định — **không có thẻ *Quá hạn duyệt*** — nhưng đổi cách
đếm: thẻ của bốn bước chờ đếm theo **bước** (`coalesce(pending_step, …)`) thay vì theo **trạng
thái**, nên hồ sơ quá hạn nằm trong chính thẻ của bước nó đang tắc, kèm dòng đỏ *"trong đó N quá
hạn"*. Danh sách thẻ ra đúng bản đã chốt, và không hồ sơ nào biến mất.

Bỏ thẻ mà vẫn đếm theo trạng thái thì đúng những hồ sơ trễ nhất rơi khỏi màn hình của người duy nhất
xử lý được chúng — sai theo hướng không ai phát hiện ra, vì một ô vắng mặt không báo lỗi.

Nếu khách hàng thật sự muốn quá hạn thành trạng thái chết hẳn thì đó là việc khác: máy trạng thái,
sla-worker, YCNV mục 4. Đã nêu ra như một đợt riêng.

### Điểm hai: "Đang chờ" suy ra, không khai tay

Định nghĩa khách hàng chốt: hồ sơ **trong phạm vi nhưng hiện không cần thao tác gì**. Suy từ
`BUOC_CUA` — mọi bước chờ trừ bước của chính vai trò ấy — chứ không khai bốn danh sách. Khai tay thì
thêm một bước vào luồng là bốn chỗ phải nhớ sửa.

`TBP_DA_KY_SO` **không** có ô đếm, và không phải bỏ sót: hệ thống chuyển nó sang `CHO_KT_L1` ngay
trong cùng transaction với lần TBP ký (B5), nên không hồ sơ nào từng nằm lại ở đó. Thẻ *TBP đã ký
số* của bản cũ luôn bằng 0 — thêm một lý do nó đáng bỏ.

### Điểm ba: hai thẻ của Sale Admin cần một cột mới

*Trình ký* và *Lỗi bản cứng* **cùng là `SA_DANG_XU_LY`**. Khác nhau ở đường đi tới: B8 bình thường,
hay B10C kế toán bắt in lại (bản scan cũ bị xoá khỏi hệ thống, phải làm lại từ đầu). Trạng thái ghi
hồ sơ *đang ở đâu*, không ghi nó *tới đó bằng đường nào*.

Suy từ nhật ký thì được nhưng là một phép quét `pol.policy_event` cho mỗi hồ sơ ở mỗi lần đếm thẻ.
`0045` thêm `reprint_requested_at` trên `pol.policy`, chép sang `rpt.policy_row`, backfill từ nhật ký
cho dữ liệu cũ. Bất biến: **đặt khi vào bằng B10C, xoá khi ra bằng B9** — hai lối duy nhất ra vào
`SA_DANG_XU_LY`, nên không cần chỗ dọn thứ ba.

### Điểm bốn: đổi tên hai trạng thái khắp phần mềm

`CHO_KT_L1` → **KT duyệt bản mềm**, `CHO_KT_L2` → **KT duyệt bản cứng**. Bốn bảng nhãn: giao diện,
thư báo (hai bảng), bản A4. Cộng YCNV, kiến trúc, hướng dẫn sử dụng, hướng dẫn demo.

### Con số trên thẻ và danh sách mở ra phải là một tập

Đây là bất biến của cả đợt, và là chỗ dễ hỏng nhất. Thẻ *Chờ TBP duyệt* đếm cả hồ sơ quá hạn ở bước
ấy; lọc `?status=CHO_TBP_DUYET` mở ra danh sách **ngắn hơn con số vừa bấm** — người dùng đếm được, và
không có phép kiểm nào tự bắt lỗi đó.

Nên `duongThe()` khai **cùng một chỗ** với phép đếm, và thêm hai tiêu chí lọc: `pendingStep` (đọc
`coalesce(pending_step, …)`, khớp đúng phép đếm) và `reprint` (0/1, tách hai nửa B8). Cả hai để
**riêng khỏi `FILTER_KEYS`**: màn hình dựng biểu mẫu lọc từ danh sách kia, nối vào là mọc thêm hai ô
nhập không ai gõ nổi. Con số *11 tiêu chí ở mục 9.2* giữ nguyên.

`reprint` nhận giá trị lạ thì **400**, không im lặng bỏ qua: bỏ qua ở đây nghĩa là mở rộng kết quả ra
cả hai nhóm — sai theo hướng trả về nhiều hơn.

### Ba lỗi tự gây trong lúc làm

**Trang tổng quan trắng bóc trong test đăng nhập.** Stub `/reports/progress` thiếu khoá
`byStepDetail` → `bo.tienDo.byStepDetail[o]` nổ giữa lúc dựng. Đúng cái bẫy P50 đã dựng ca kiểm thử
để bắt, và nó bắt được. Sửa stub, **và** đọc bằng `?.` trên chính bảng: một khoá thiếu ở API không
đáng đổi lấy một màn hình rỗng không lời giải thích.

**`nhan` rỗng trong bảng dữ liệu.** Bản đầu tôi để `nhan: ''` cho thẻ trạng thái rồi định điền lúc
dựng. Đổi sang `nhan?: string` và `nhanThe()` mượn tên ở `NHAN_TRANG_THAI` — một trạng thái mang đúng
một tên trên mọi màn hình, không có nguồn thứ hai để lệch.

**`TheoBuoc` vẫn lọc theo trạng thái.** Khối *Đang tắc ở bước nào* của Ban lãnh đạo đếm theo
`byPendingStep` (đã gồm quá hạn) mà bấm vào lại lọc `?status=` — cùng đúng cái lỗi lệch tập. Sửa
luôn sang `?pendingStep=`.

### Một ca đỏ KHÔNG do đợt này

`notification.test.ts` — *"policy chưa tiêu thụ xong catalog.changed — quá 15000ms"*. Cất tạm toàn bộ
thay đổi rồi chạy lại: **vẫn đỏ trên mã đã commit**, thậm chí đỏ hai ca.

Nguyên nhân: đổi một quy định chiết khấu buộc rà lại **mọi** hồ sơ đã đóng băng, mỗi hồ sơ một lượt
hỏi khách hàng và một lượt hỏi danh mục, nối đuôi nhau. CSDL của bộ test không bị dọn giữa các lượt
chạy nên số hồ sơ đóng băng chỉ tăng — mỗi `make test` bồi thêm vài trăm. Tới mốc 1300 hồ sơ thì lượt
rà vượt 15 giây.

Hai việc đã làm:

1. **Nhớ tạm khách hàng và ảnh chụp sản phẩm trong một lượt rà**, và **bỏ hẳn transaction cho hồ sơ
   không lệch gì và không mang sẵn dấu vết**. Nhớ tạm còn đúng hơn bản cũ: một lượt rà là một phép so
   tại MỘT thời điểm, chứ không phải hồ sơ đầu danh sách so với bảng giá lúc 9:00 còn hồ sơ cuối so
   với bảng giá lúc 9:01.
2. **Nới hạn chờ của ca ấy lên 120 giây.** Ca này khẳng định lá thư nói về *ngưỡng* chứ không nói về
   *giá*; nó không khẳng định gì về tốc độ rà, nên buộc nó vào một ngân sách thời gian là bắt nó gãy
   vì lý do nó không nói tới.

**Còn nợ, đã báo khách hàng**: nhớ tạm không cứu được chính bộ test, vì ở đó mỗi hồ sơ có một khách
hàng riêng và một sản phẩm riêng nên không có gì để dùng lại. Phép rà vẫn là O(số hồ sơ) vòng mạng
nối đuôi. Ở 20 nghìn hồ sơ thật, một lần đổi quy định chiết khấu là hàng phút chạy nền. Không ai phải
chờ nó, nhưng muốn gọn thì cần một endpoint tra khách hàng theo lô và gộp ảnh chụp theo loại khách
hàng — một đợt riêng.

### Kiểm chứng

`make test` — 47 tệp, 1078/1078 xanh. Thêm 30 ca ở `tests/web/tong-quan.test.ts` (dải thẻ chốt cứng
theo bản khách hàng đọc, mọi thẻ bấm được, thẻ bước không lọc theo trạng thái, `reprint` chỉ kèm khi
lấy đúng một nửa B8) và 6 ca ở `tests/http/reporting.test.ts` (đặt và xoá mốc in lại, tách hai ô đếm,
`reprint` sai thì 400, **hồ sơ quá hạn vẫn nằm trong thẻ của bước nó đang tắc**, và con số trên thẻ
bằng đúng số dòng danh sách mở ra).

---

## P56 — Thư nhắc SLA gửi hai lần, và vì sao cách sửa đầu tiên của tôi sai

Khách hàng hỏi *"khi nào hệ thống gửi mail thông báo hồ sơ quá hạn"*. Tra để trả lời thì lộ ra một
lỗi: **thư nhắc "sắp quá hạn" gửi hai lần** ở gần như mọi hồ sơ.

Khoá chống trùng là `(hồ sơ, loại, NGÀY GỬI)` với ngày lấy theo UTC, trong khi cửa sổ nhắc rộng đúng
24 giờ. Cửa sổ ấy gần như luôn vắt qua nửa đêm UTC (07:00 giờ Việt Nam), và sang ngày mới thì khoá mở
lại:

```
Hạn 15/08 15:00 giờ VN
  14/08 15:05 → nhắc lần 1, khoá theo ngày UTC 14/08
  15/08 07:05 → nhắc lần 2, khoá theo ngày UTC 15/08   ← thừa
  15/08 15:05 → chuyển Quá hạn duyệt
```

### Cách sửa đầu tiên tôi đề xuất KHÔNG đủ, và tôi đã nói ra trước khi làm

Ý đầu là lấy ngày theo `Asia/Ho_Chi_Minh` thay vì UTC, cùng cách `format.ts` làm với mọi ngày hiển
thị. **Sai.** Cửa sổ rộng đúng 24 giờ thì nó luôn cắt qua một ranh giới ngày, dù ranh giới ấy đặt ở
múi giờ nào — đổi múi giờ chỉ dời chỗ hỏng sang một khung giờ khác. Bất kỳ khoá nào theo NGÀY đều
hỏng như nhau.

### Khoá đúng là mốc hạn, không phải ngày lịch

`0046` đổi khoá chính của `pol.sla_reminder` từ `for_date date` sang `due_at timestamptz`. Mốc hạn
nhận diện được *"lần chờ này"*, điều mà một ngày lịch không làm được. Ba tình huống, cùng một khoá:

| Tình huống | Khoá theo ngày | Khoá theo mốc hạn |
|---|---|---|
| Cửa sổ 24 giờ vắt qua nửa đêm | **2 thư** | 1 thư ✓ |
| Trả lại rồi gửi lại trong cùng ngày | 1 thư — **nuốt mất** lần chờ thứ hai | 2 thư, mỗi lần chờ một ✓ |
| Quản trị đổi số ngày SLA, hạn tính lại | 1 thư — nói về cái hạn đã biến mất | nhắc lại theo hạn mới ✓ |

Cột thứ hai đáng chú ý: nếu chỉ đổi khoá sang **ngày của mốc hạn** (cách sửa gọn hơn, tôi có cân
nhắc) thì chặn được thư trùng nhưng lại nuốt mất một lá thư THẬT. Hai lần chờ bắt đầu cùng ngày có
hai mốc hạn cách nhau vài giờ mà trùng ngày lịch — mà trả lại lúc 10 giờ rồi sửa xong gửi lại lúc 14
giờ là chuyện thường ngày.

Backfill lấy `sla_due_at` hiện tại của hồ sơ còn đang chờ, nên hồ sơ đã được nhắc hôm nay không bị
nhắc lại lúc triển khai. Có bước dọn những hàng do chính lỗi này sinh ra, nếu không khoá chính mới
không tạo được.

### Vì sao ca kiểm thử cũ không bắt được

`NTF-09` quét bốn lần tại **cùng một thời điểm** — bốn lần đều rơi vào một ngày lịch, khoá giữ đúng,
không ai thấy gì. Nhảy theo ngày (`advanceDays`) thì vĩnh viễn không chạm được vào chỗ hỏng.

Thêm `Clock.advanceHours` và hai ca:

1. **Quét từng giờ suốt 23 giờ cuối** — dù bộ test chạy vào giờ nào trong ngày cũng chắc chắn cắt qua
   ít nhất một nửa đêm, cả UTC lẫn giờ Việt Nam. Khẳng định vẫn đúng một thư, và hộp thư thật cũng
   chỉ có một lá.
2. **Gửi lại trong cùng ngày** — chốt mặt trái, để không ai "sửa gọn" khoá về ngày của mốc hạn.

Ca thứ hai tôi viết sai lần đầu: dời hạn thêm 4 tiếng thì hồ sơ rời khỏi cửa sổ 24 giờ, phải đẩy đồng
hồ theo. Không đẩy thì nó đỏ vì cửa sổ chứ không vì chuyện chống trùng — một ca đỏ nói sai chuyện nó
đang kiểm.

### Trả lời cho câu hỏi ban đầu

Thư *"Hồ sơ đã quá hạn duyệt"* gửi **một lần duy nhất**, ở vòng quét đầu tiên sau khi hạn trôi qua
(chậm nhất 5 phút). Đúng một lần vì gửi xong thì trạng thái chuyển `QUA_HAN_DUYET`, mà trạng thái này
không nằm trong danh sách chờ nên vòng quét sau không nhặt lại. Người nhận: người phải xử lý ở bước
đang tắc, TDV lập hồ sơ, và mọi người đã từng thao tác (thư *để biết*, liên kết mở nhật ký).

---

## P57 — Quá hạn duyệt thành trạng thái chết, tự xoá sau 3 ngày

Ba yêu cầu, và yêu cầu đầu **đảo ngược YCNV mục 4 cùng tiêu chí NTF-11** — quyết định "hồ sơ quá hạn
đi tiếp đúng nhánh cũ" đã nằm trong máy trạng thái từ đầu dự án. Khách hàng nêu ý này lần đầu ở vòng
hỏi P55 (*"khi đã quá hạn coi như hồ sơ đó đã chết"*), tôi đã nói rõ nó trái với hệ đang chạy và tách
ra thành một đợt riêng; giờ họ nêu lại thành yêu cầu, nên làm.

### 1. Quá hạn là kết thúc

- `TERMINAL` thêm `QUA_HAN_DUYET`. `allowedActionsFor` trả rỗng cho mọi vai trò — nút biến mất.
- **Xoá `effectiveStatus()` và `resumeFromOverdue()`**, và để lại một khối chú thích ngay chỗ trống
  ấy. Hai hàm đó trông rất hợp lý; người đọc mã sau này rất dễ viết lại chúng, mà viết lại là mở
  đúng cái đường `0047` vừa đóng.
- Chặn bằng lỗi RIÊNG `POLICY_OVERDUE` chứ không để rơi vào `INVALID_TRANSITION` chung. Câu chung là
  *"hành động được phép: không có"* — đúng nhưng không nói vì sao, mà đây đúng lúc người dùng cần
  biết nhất: hồ sơ sắp biến mất và việc phải làm là **lập bản mới**, không phải thử lại.
- Hồ sơ quá hạn **rời hộp việc**. Hộp việc chỉ có nghĩa khi mọi dòng trong đó đều bấm được.
- `pending_step` VẪN lưu, nhưng đổi vai trò: từ "đi tiếp nhánh nào" sang "chết ở bước nào" — thứ duy
  nhất nói được ai đã để hồ sơ chết, và nó vào thư báo lẫn nhật ký.

Tự xoá: cột `overdue_at` (`0047`) làm mốc đếm, vòng quét thứ hai trong sla-worker chuyển `DA_XOA`
sau 3 ngày (`SLA_DISCARDED`, actor `SYSTEM`). "Xoá" **không xoá gì cả** — đúng nghĩa `0035` và
`0039`: đổi trạng thái, ghi thêm một dòng nhật ký, mọi thứ khác còn nguyên.

Số ngày để ở `SLA_DISCARD_DAYS` chứ không ở `pol.sla_config`: cột kia có màn hình cho Quản trị sửa
(NTF-12), con số này chưa có, và một cột CSDL không ai sửa được qua giao diện chỉ tạo cảm giác sai
rằng nó sửa được.

### 2. Thư nhắc chỉ tới người phải thao tác

Trước: `[chủ bước, TDV]` cộng người theo dõi. Giờ: **chỉ chủ bước**. Thư nhắc là cú huých tới người
còn kịp làm gì đó; gửi rộng thì phần lớn người nhận không làm gì được với nó và học rất nhanh cách bỏ
qua cả loại thư này — kể cả lá *đã quá hạn* sau đó, lá họ thật sự cần đọc.

Thư **quá hạn** và thư **hệ thống đã xoá** vẫn gửi rộng: lúc ấy là tin phải báo, không còn là việc
phải làm. Thư xoá tới TDV lập hồ sơ (công sức vừa mất, phải lập lại) và người phụ trách bước hồ sơ
chết ở đó.

### 3. Thẻ *Sắp quá hạn*

Có ở cả năm vai trò nhìn thấy hồ sơ, **không** có ở Quản trị hệ thống — phạm vi dữ liệu của họ rỗng
nên ô ấy vĩnh viễn bằng 0, mà một cảnh báo đỏ luôn bằng 0 dạy người ta bỏ qua mọi cảnh báo đỏ khác.

Đếm hồ sơ ở **mọi bước** trong phạm vi, không riêng bước của vai trò đó — đúng chữ "tất cả người dùng
liên quan". Người đang giữ hồ sơ chính là người đã không xử lý suốt 13 ngày qua; người gọi nhắc được
là những người khác. Màu **đỏ**, không vàng: vàng là "có việc tồn", đỏ là "sắp mất".

Con số suy từ tổng `soon` của `byStepDetail` chứ không thêm một khoá riêng trong báo cáo — hai con số
suy từ cùng một phép đếm thì không có đường nào lệch nhau, mà thẻ và các ô bước nằm ngay cạnh nhau.

**`byStepDetail` đổi chiều so với `0045`**, và ca kiểm thử cũ được giữ lại nguyên chỗ để đọc ra được
cả hai lần đổi ý: `0045` đếm hồ sơ quá hạn VÀO thẻ của bước (khi ấy nó còn xử lý được, bỏ ra là làm
hồ sơ trễ nhất biến mất); `0047` loại nó HẲN (giờ nó chết, đếm vào ô đếm việc là nói dối về lượng
việc). Chỗ nó để lại là `soon`.

Kèm theo: `BUOC_DANG_CHO` rút gọn còn `STEP_FROM_STATUS`, nên hồ sơ quá hạn tự rơi khỏi cả phép đếm
lẫn bộ lọc theo bước — đếm và lọc phải cho ra cùng một tập, nếu không thẻ ghi 12 mà bấm vào ra 9 dòng.

### Ba lần tôi tự làm hỏng

**Backtick trong template literal.** Viết `(`0047`)` vào một chú thích SQL bên trong template literal
— trình biên dịch đọc ra số bát phân. Đúng cái bẫy đã ghi trong CLAUDE.md, dính hai lần trong một
đợt.

**Đồng hồ tiêm không với tới Postgres.** Cờ `sapQuaHan` và tiêu chí `dueSoon` so với `now()` của
Postgres, nên `clock.advanceDays(13)` không làm gì cả và ca kiểm thử đỏ với `expected false to be
true`. Chính cái bẫy ghi ở đầu `clock.ts`. Sửa bằng cách đặt thẳng `sla_due_at` vào CSDL thay vì đẩy
đồng hồ.

**Ca kiểm thử quá chặt.** Tôi khẳng định mọi vai trò nhận 409 `POLICY_OVERDUE`; Kế toán và Sale Admin
nhận **403** vì chưa được phân công vào hồ sơ đang ở bước TBP. Cũng là chặn, nhưng chặn ở lớp phạm vi
và không nói gì về `0047` — sửa ca kiểm thử, không sửa mã.

Và một cái bẫy của bộ test: `parkExistingPolicies` đẩy `sla_due_at` đi 10 năm nhưng **không** đẩy
`overdue_at`, nên vòng quét tự xoá nuốt luôn 26 hồ sơ quá hạn tồn từ các lượt chạy trước — kéo theo
26 lá thư làm sai lệch mọi phép đếm thư của cả file.

### Món nợ ở P55 đã tới hạn

Ba ca đỏ ở lượt chạy đầy đủ đều là phép rà lại danh mục hết giờ — đúng món nợ tôi đã báo cuối P55
(*"phép rà vẫn là O(số hồ sơ) vòng mạng nối đuôi"*). Bộ test giờ có ~1400 hồ sơ đã đóng băng.

Sửa bằng **chạy song song theo lô 8**. Mỗi hồ sơ là một đơn vị độc lập — khác khách hàng, khác
transaction, khác sự kiện — nên chồng lên nhau được; 8 đủ lấp thời gian chờ mạng mà không mở 1400 kết
nối rồi làm cạn pool của chính mình. Không cần endpoint mới, không đổi giao thức.

### Kiểm chứng

Thêm ca cho: không nước nào đi ra khỏi quá hạn với bất kỳ vai trò nào · dải nút rỗng · rời hộp việc ·
chưa đủ 3 ngày thì không xoá · đủ 3 ngày thì xoá và **nhật ký cùng dòng sản phẩm còn nguyên** · quét
lại không xoá lần hai · thư tới đúng hai người · hồ sơ quá hạn rơi khỏi mọi thẻ đếm nhưng vẫn tra ra
được bằng bộ lọc trạng thái · thẻ *Sắp quá hạn* không đếm nhầm hồ sơ đã chết · con số trên thẻ khớp
danh sách mở ra.

---

## P58 — Thẻ *Quá hạn*, và ẩn hẳn thao tác không làm được

Hai yêu cầu, và yêu cầu đầu **đảo lại một phán đoán của chính tôi**.

### Thẻ *Quá hạn* — tôi đã sai ở `0047`

Ở `0047` tôi cố ý không làm thẻ này, lập luận rằng đếm một thứ không bấm được vào ô đếm việc là nói
dối về lượng việc, và khách hàng đã hai lần nói quá hạn là chết. Tôi có ghi rõ trong báo cáo rằng
mình chọn không làm.

Khách hàng yêu cầu lại, và **lý do của họ đúng hơn lý do của tôi**: giữa lúc quá hạn và lúc hệ thống
xoá có đúng **3 ngày**, và đó là cửa sổ duy nhất để người ta biết mình vừa mất cái gì và lập lại bản
mới trước khi hồ sơ rời khỏi mọi màn hình. Lập luận của tôi đúng về *ô đếm việc* nhưng bỏ sót rằng
đây không phải ô đếm việc.

Nên thẻ đứng **riêng**, ngay sau *Sắp quá hạn*, và không gộp vào thẻ của bước như `0045` từng làm:

| Thẻ | Nghĩa | Còn làm gì được |
|---|---|---|
| *Sắp quá hạn* | Dưới 24 giờ | Còn cứu — xử lý ngay, hoặc gọi người đang giữ |
| *Quá hạn* | Đã chết, xoá sau 3 ngày | Không gì. Lập CSBH mới |

Thứ tự có kiểm bằng test: *Quá hạn* phải đứng NGAY SAU *Sắp quá hạn*. Đảo lại là bắt người đọc nhảy
ngược dòng thời gian.

### Ẩn thao tác — hoá ra rộng hơn chuyện quá hạn

Yêu cầu nói về hồ sơ quá hạn, nhưng rà ra thì dải nút *Thao tác* **đã đúng** từ trước: nó đọc
`/allowed-actions`, mà máy trạng thái không có nước nào đi ra khỏi `QUA_HAN_DUYET` nên danh sách
rỗng. `Sửa` và `Xoá` cũng đã đúng.

Ba nút còn lại thì **chỉ chặn theo VAI TRÒ**, không xét trạng thái:

- *Tải tệp lên* và *Gỡ* — hiện với bất kỳ ai có quyền đính kèm, ở **mọi** hồ sơ. Máy chủ chỉ nhận ở
  `NHAP`/`YEU_CAU_CHINH_SUA` (loại `HO_SO`) và `SA_DANG_XU_LY` (loại `SCAN`), nên ở hồ sơ khác là
  409 — sau khi người dùng đã chọn xong file.
- *Xuất hợp đồng (PDF)* — hiện với Kế toán và Sale Admin ở mọi hồ sơ, kể cả bản còn đang chờ TBP ký.
  Cổng thật là mốc `kt_l1_received_at`.

Sửa theo đúng tiền lệ `xoaDuoc` của `0039`: **máy chủ tính cờ, giao diện AND với bảng quyền**. Ba cờ
mới trên `byId` — `loaiTepGhiDuoc` (một mảng, không phải boolean), `tepXoaDuoc`, `xuatHopDongDuoc`.
Chép danh sách trạng thái sang giao diện là dựng bản sao thứ hai sẽ có ngày lệch với máy trạng thái.

`loaiTepGhiDuoc` là mảng vì nó trả lời được cả câu hỏi thứ hai: hộp thoại tải tệp **không hỏi loại**
khi chỉ có một loại hợp lệ. Một ô chọn với đúng một lựa chọn dùng được và một lựa chọn trả 409 thì
không phải lựa chọn, mà là một cái bẫy.

Ba cờ khai **tuỳ chọn** ở phía giao diện, đọc kèm giá trị lùi an toàn (`?? []`, `=== true`). Máy chủ
cũ hơn giao diện thì mất một nút, chứ không mất cả màn hình — và giá trị lùi chọn phía ẩn nút, không
phải phía hiện một nút sẽ hỏng.

### Ca kiểm thử không chép bảng trạng thái

Phép kiểm cho ba cờ **không** so với một bảng chép tay — chép tay thì test và mã cùng sai một kiểu.
Nó so cờ với **việc máy chủ có nhận thật không**: với mỗi trạng thái, gọi đính kèm cả hai loại rồi
đối chiếu 201/409 với nội dung cờ. Bật cờ mà 409, hoặc tắt cờ mà 201, đều đỏ.

### Hai lần tôi tự làm hỏng

**Stub thiếu khoá mới → trang trắng.** `dang-nhap.test.tsx` không trả `loaiTepGhiDuoc`, và
`undefined.length` làm nổ cả trang chi tiết. Đúng lớp lỗi đã gặp với `byStepDetail` ở `0045`, và lại
do chính ca kiểm thử "không khối nào nổ giữa chừng" bắt được.

**Người gọi ngoài phạm vi.** Ca kiểm thử đính kèm dùng `sa01`, nhưng Sale Admin chưa được phân công
vào hồ sơ còn ở *Nháp* nên nhận 403 — đỏ vì phạm vi chứ không vì cái cờ nó đang đo. Đổi sang `tdv01`,
người luôn nằm trong phạm vi hồ sơ của chính mình ở mọi trạng thái. Đây là lần thứ hai trong hai đợt
liên tiếp tôi dính đúng lỗi này.

---

## P59 — Box *Yêu cầu cập nhật* gấp lại theo từng hồ sơ

Khách hàng: *"làm ngắn gọn lại, chỉ show danh sách hồ sơ, khi người dùng bấm vào mới show thông tin
cụ thể tại sao cần cập nhật"*.

Bản trước trải hết mọi dòng lệch của mọi hồ sơ ra ngay trên trang tổng quan. Mười hồ sơ, mỗi hồ sơ ba
dòng, là ba mươi dòng số đẩy hộp việc xuống dưới màn hình — mà box này đứng TRƯỚC hộp việc chính vì
nó phải được đọc trước khi ký.

### Chỗ dễ cắt quá tay

Cắt đúng chữ "chỉ hiện danh sách hồ sơ" thì dòng gấp lại còn mã hồ sơ và trạng thái. Nhưng khi ấy
mười hồ sơ lệch trông **y hệt nhau**, và người dùng phải mở từng cái mới biết cái nào mất sản phẩm —
một điều khoản không thực hiện được — với cái nào chỉ lệch giá vài đồng mà duyệt tiếp cũng chẳng sao.

Nên dòng gấp lại **vẫn mang nhãn LOẠI** (*Sản phẩm* · *Giá* · *Ngưỡng*) và số điểm lệch, vẫn gọn
trong một hàng. Cái được gấp lại là **con số**: sản phẩm nào, từ đâu sang đâu. Đó mới là phần dài.

Nhãn **không lặp** khi một hồ sơ có nhiều dòng cùng loại, và xếp **nặng nhất trước** — cùng thứ tự
với thư báo, để *Sản phẩm* không bao giờ đứng sau *Giá* ở bất kỳ chỗ nào trong sản phẩm.

### Một hàng không được làm hai việc

Dòng ngoài trước đây là `<Lien>` đi tới hồ sơ. Giờ nó là nút gấp/mở, nên liên kết chuyển **vào phần
mở ra**. Không ghép cả hai lên một hàng: một hàng vừa đi tới địa chỉ khác vừa gấp mở tuỳ chỗ bấm là
hàng người dùng bấm sai ít nhất một lần trước khi hiểu nó.

Dùng lại đúng mẫu gấp/mở đã có ở `BangSanPham` (`<button aria-expanded>` + mũi tên ▼/▲) và lớp
`button.viec-lien` đã có sẵn trong CSS — không dựng mẫu thứ hai cho cùng một cử chỉ.

Câu dẫn ở đầu box rút từ ba câu xuống một, giữ lại đúng mệnh đề *"không tự cập nhật"* (có ca kiểm thử
canh) và thêm lời mời bấm.

### Kiểm chứng

Ca cũ soi con số nay phải MỞ hồ sơ ra trước. Thêm bốn ca cho chính `0049`: dòng gấp lại có nhãn loại
nhưng chưa có con số · nhãn không lặp mà số điểm lệch vẫn đếm đủ · *Sản phẩm* đứng trước *Giá* · bấm
lần nữa thì gấp lại. Và một ca canh chỗ dễ mất nhất: **gấp lại thì chưa có liên kết, mở ra thì phải
có** — mất nó thì box thành bảng thông báo cụt, biết hồ sơ nào lệch mà không có đường tới đó.

---

## P60 — Nhãn *Giá* vô hình suốt một năm, và cảnh báo lệch lên màn hình hồ sơ

### Nhãn *Giá* không có nền, và không ai thấy được vì sao

Khách hàng báo nhãn *Giá* "bị chìm mất". Nguyên nhân:

```css
.nhan-lech { color: var(--mau-nen); }        /* trắng ở giao diện sáng */
.nhan-lech.gia { background: var(--mau-chinh); }
```

**`--mau-chinh` chưa bao giờ được khai ở `tokens.css`.** Trình duyệt bỏ nguyên khai báo hỏng, nhãn
không có nền, và chữ trắng nằm trên thẻ trắng. Nhãn *Giá* — loại lệch hay gặp nhất — vô hình từ
`0029` tới giờ. Cùng biến ấy còn nằm ở `.dau-hoi:focus-visible`, nên viền tiêu điểm của nút trợ giúp
cũng hỏng theo.

Đổi sang `--mau-thuong-hieu`: xanh thương hiệu ở giao diện sáng (tương phản ~8,6:1 với chữ trắng),
xanh nhạt ở giao diện tối với chữ nền sẫm — cùng cách hai nhãn kia đã làm.

### Vì sao `FE-19` không bắt được

`FE-19` cấm **mã màu viết thẳng**, nên `var(--mau-chinh)` đi qua sạch sẽ — nó trông y hệt một biến
hợp lệ. Không màn hình nào đỏ, không ca kiểm thử nào đỏ; nhãn chỉ đơn giản là không hiện.

Thêm `0050`: **quét ngược từ chỗ DÙNG về chỗ KHAI** — mọi `var(--x)` trong `.css` và `.tsx` phải có
mặt trong `tokens.css`, trừ khi có đường lùi `var(--x, giá-trị)`. Đã thử bằng cách đặt lại lỗi cũ:
ca kiểm thử đỏ đúng dòng 519. Một chốt rẻ cho một lớp lỗi im lặng.

### Cảnh báo lệch lên màn hình hồ sơ

Tới `0049` thông tin "số này đã lỗi thời" **chỉ có ở box *Yêu cầu cập nhật*** trên trang tổng quan.
Nhưng người sắp ký thường mở **thẳng hồ sơ** — từ thư báo, từ hộp việc, từ danh sách — và ở đó không
có gì nói ra điều đó. Box kia chỉ cứu được người tình cờ ghé qua trang tổng quan trước.

`byId` giờ trả kèm `lech`, đọc theo `DA_DONG_BANG` y như `impacted()`. Hồ sơ còn ở Nháp thì `byId`
vừa làm mới giá ngay phía trên nên không thể lệch — trả một dòng dấu vết còn sót ở đó là cảnh báo về
một chênh lệch đã tự biến mất, người dùng đi tìm mãi không thấy. Có ca kiểm thử canh đúng chỗ này.

Màn hình hồ sơ hiện khối vàng **NGAY TRƯỚC** bảng dòng sản phẩm. Đặt dưới bảng thì đọc sau khi đã
quét hết mười cột số — đã muộn, người ta tin vào những con số ấy rồi. Có ca kiểm thử canh cả thứ tự
ấy, không chỉ sự có mặt.

Phần vẽ tách ra `components/Lech.tsx` dùng chung cho cả hai chỗ. Hai bản sao của cùng một cách đọc số
là hai bản sẽ có ngày nói hai chuyện khác nhau về cùng một dòng dữ liệu — mà đây đúng là loại thông
tin người ta đọc rồi đặt bút ký.

---

## P61 — Dữ liệu demo quá hạn, và một lỗi binding đã sống lâu

Khách hàng muốn `demo-mau` có hồ sơ **sắp quá hạn** và **đã quá hạn**. Đi làm thì lộ ra lý do vì sao
nó chưa từng có: dựng được dữ liệu ấy cũng chưa đủ để nó hiện lên màn hình.

### Lỗi tìm được: hồ sơ quá hạn KHÔNG BAO GIỜ tới read-model

sla-worker phát `sla.overdue`. Hàng đợi reporting buộc `['policy.#', 'customer.#']`. **Không khớp
cái nào.** Read-model vì thế không bao giờ biết một hồ sơ đã quá hạn, và bốn thứ hỏng theo:

- thẻ *Quá hạn* (`0048`) vĩnh viễn bằng 0;
- hồ sơ quá hạn VẪN bị đếm vào thẻ của bước cũ — đúng thứ `0047` gỡ ra;
- lọc `?status=QUA_HAN_DUYET` không ra gì;
- và tệ nhất: nó còn lọt vào thẻ *Sắp quá hạn*, vì read-model giữ trạng thái chờ cũ với một mốc hạn
  đã trôi qua.

Lỗi này có từ trước `0045`, và **mọi ca kiểm thử đều che mất nó**: các ca `0047` gọi thẳng
`sync.refreshPolicy()` nên chúng xanh mà không hề chứng minh đường đi qua bus.

Sửa: thêm `sla.#` vào binding của reporting. Nghe cả nhánh chứ không riêng `sla.overdue` — binding
hẹp quá là đúng nguyên nhân sinh ra lỗi này.

**Hai chốt, và chốt thứ hai là bắt buộc.** Binding của RabbitMQ cộng dồn và nằm lại trên broker: hàng
đợi đã buộc `sla.#` một lần thì giữ mãi, kể cả khi ai đó lùi dòng khai báo trong mã. Ca tích hợp sẽ
vẫn xanh trên broker cũ trong khi môi trường dựng mới lại hỏng — nên có thêm một ca đọc thẳng bảng
khai báo, không đụng tới broker.

### Dữ liệu demo

Chín hồ sơ: 5 sắp quá hạn (còn 3–20 giờ, rải cả bốn bước chờ) và 4 đã quá hạn (1–2 ngày, mỗi bước
một cái). Giữ **dưới 3 ngày** có chủ ý — đúng 3 ngày là sla-worker tự xoá, và một bản demo mà dữ liệu
tự biến mất sau vài phút là một bản demo khó tin.

Đây là ngoại lệ THỨ HAI của "nạp qua API thật", sau thư hỏng, và cùng một lẽ. Hồ sơ vẫn lập qua API
và đẩy tới bước bằng đúng những hành động giao diện gọi; chỉ mốc thời gian vặn tay. Nhóm quá hạn phát
kèm `sla.overdue` **đúng khoá và đúng hình dạng sla-worker phát** — ghi thẳng vào `rpt.policy_row`
thì nhanh hơn nhưng dựng ra một bản demo mà các đường ống không hề chạy, đúng thứ dễ làm người xem
tin nhầm.

Vị trí trong luồng nạp cũng là một ràng buộc: phải đứng TRƯỚC khối `DANG_CO_HIEU_LUC`, vì đợt ấy
chiếm mỗi khách một suất (`uq_policy_active_per_customer`) và lập sau thì hết khách trống.

### Kiểm chứng bằng cách chạy thật

`make demo && make demo-mau`, rồi soi cả bốn tầng:

| Kiểm | Kết quả |
|---|---|
| Nguồn ↔ read-model | 4 ↔ 4 quá hạn, `pending_step` đủ bốn bước |
| Thẻ theo vai trò | tdv01/tbp01/kt01/bld01 thấy 4 và 5 |
| Bấm vào thẻ | `?status=QUA_HAN_DUYET` → 4 dòng · `?dueSoon=1` → 5 dòng |
| Thư quá hạn | 4 lá, mỗi lá tới chủ bước **và** TDV |
| Thư nhắc | 5 lá, **chỉ** tới chủ bước — đúng `0047` |

`sa01` thấy **2** chứ không phải 4 và 5, và đó là ĐÚNG: hồ sơ chưa qua tay Sale Admin thì
`sale_admin_user_id` còn rỗng nên nằm ngoài phạm vi của họ. Một chỗ nữa nhìn thấy phạm vi hoạt động
thật, nên đã ghi vào hướng dẫn demo thay vì coi là lệch.

Ghi lại một lỗi đọc của chính tôi: lần đầu soi `pol.outbox` tôi kết luận sự kiện không được chèn, vì
`| head` cắt mất hai dòng cuối bảng — `policy.updated` và `sla.overdue` sắp sau `policy.tbp_reject`
theo thứ tự chữ cái. Suýt đi sửa một thứ không hỏng.

---

## P62 — *Việc của tôi* lên trước, mỗi trang 5 hồ sơ, bỏ thẻ *Nháp* của TDV

### Đảo thứ tự — và vì sao giờ mới đảo được

`0029` chốt *Yêu cầu cập nhật* phải đứng TRƯỚC hộp việc, với một lý do vững: nó là chỗ **duy nhất**
nói cho người sắp ký biết con số trên hồ sơ đã lỗi thời. Đặt dưới một danh sách việc dài thì không ai
cuộn tới, mà cuộn tới thì cũng đã ký xong rồi.

`0050` gỡ đúng cái ràng buộc ấy: cảnh báo lệch giờ hiện **ngay trên màn hình hồ sơ**, phía trên bảng
số. Không còn đường nào mở hồ sơ ra mà không thấy nó. Khối trên trang tổng quan không phải chặn cửa
nữa, nên việc phải làm hôm nay lên trước — đó mới là thứ người ta mở phần mềm ra để xem.

Ca kiểm thử cũ khẳng định thứ tự ngược lại, giờ khẳng định thứ tự mới, và **ghi rõ điều kiện để đảo
lại**: nếu ai gỡ khối cảnh báo ở `ChiTietHoSo` thì thứ tự này phải xét lại. Ca `0050` canh đúng chỗ ấy.

### Mỗi trang 5 hồ sơ

`useTrangMay` nhận thêm tham số `moiTrang`, mặc định vẫn `MOI_TRANG = 20`. Hai khối trên trang tổng
quan truyền `MOI_TRANG_TONG_QUAN = 5`.

Cắt ở MÁY CHỦ chứ không vẽ ít đi ở giao diện: hỏi 20 dòng rồi vẽ 5 là tải thừa gấp bốn trên mỗi lần
mở trang tổng quan, và số trang hiện ra cũng sai.

**Một hệ quả phải xử lý.** Hai danh sách của Kế toán dùng chung MỘT thanh phân trang. Với 20 dòng mỗi
trang thì hầu như luôn thấy cả hai nhóm; với 5 thì trang này có thể toàn hồ sơ lần 1 trong khi lần 2
đang chờ ở trang sau — và câu *"Không có hồ sơ nào chờ tiếp nhận lần 2"* lúc ấy là **nói sai**, người
dùng đọc xong rồi thôi không bấm sang trang nữa. Câu rỗng giờ đổi theo việc còn trang sau hay không.

### Bỏ thẻ *Nháp*, đưa Nháp vào hộp việc

Hai thứ nói cùng một chuyện — "hồ sơ bạn chưa gửi đi" — nên bày cả hai là bắt người dùng đọc một con
số ở trên rồi đọc lại chính danh sách ấy ở dưới. Hộp việc thắng vì bấm thẳng vào từng hồ sơ mà sửa
tiếp được; con số trên thẻ phải bấm thêm một lần nữa mới tới nơi.

Chỗ dễ hỏng: bỏ thẻ mà **quên** thêm vào hộp việc thì hồ sơ nháp biến mất khỏi trang tổng quan — và
đó là thứ duy nhất TDV mở phần mềm ra để làm tiếp. Có ca kiểm thử canh cả hai chiều.

`NHAP` chỉ vào hộp việc của **TDV**. Ba vai trò còn lại không: hồ sơ chưa gửi duyệt chưa từng rời khỏi
bàn người lập, và cũng chưa có ai khác được phân công vào nó. Bốn ca kiểm thử: nháp nằm trong hộp việc
của người lập · gửi duyệt xong thì rời sang hộp việc TBP · ba vai trò kia không thấy · nháp của TDV
khác cũng không lọt vào hộp việc của mình.

---

## P63 — Cột *Hạn xử lý* thay *Số dòng*, và gỡ dòng đếm khỏi thẻ *Đang chờ*

### Đổi cột trên danh sách hồ sơ

*Số dòng* là con số **không ai làm gì với nó** ở màn hình danh sách: muốn biết hồ sơ có gì thì phải
mở ra, mà mở ra thì đã có cả bảng sản phẩm. Chỗ ấy để cho thứ quyết định được thứ tự xử lý — hồ sơ
nào sắp hết giờ.

Cờ `sapQuaHan` tính ở **máy chủ**, bằng đúng biểu thức `SAP_QUA_HAN` mà thẻ *Sắp quá hạn* và tiêu chí
`dueSoon` đang dùng. Ba chỗ hiện cùng một khái niệm thì phải đọc từ cùng một định nghĩa; suy lại ở
giao diện từ `slaDueAt` là dựng bản sao thứ tư, và nó sẽ lệch ở đúng chỗ khó thấy nhất — hồ sơ đã quá
hạn vẫn có `sla_due_at`, chỉ là đã trôi qua.

Ca kiểm thử vì thế không so cờ với một bảng chép tay mà so **hai đường đọc với nhau**: tập dòng mang
cờ và tập mà `?dueSoon=1` trả về phải khớp tuyệt đối.

Thêm cột vào `LIST_COLUMNS` **không** đụng tới file Excel — `COLUMNS` bên `exports/sheet.ts` khai
riêng theo tên khoá. Có một ca khẳng định thẳng điều đó, để lần sau ai thêm cột cũng phải tự hỏi nó
có thuộc về bảng tính hay không.

Dùng chữ **"Sắp quá hạn"** chứ không phải "sắp hết hạn" như trong yêu cầu: thẻ, tiêu đề thư và hướng
dẫn đều đang gọi như vậy, và hai tên cho một thứ là đúng loại lệch mà mấy đợt vừa rồi phải đi dọn.

### Gỡ dòng đếm khỏi thẻ *Đang chờ*

Thẻ ấy đếm hồ sơ ở bàn **người khác** — theo đúng định nghĩa khách hàng chốt, phần không cần mình làm
gì. Treo *"trong đó N sắp quá hạn"* lên đó là mời người đọc lo một việc họ không bấm được, mà thẻ
*Sắp quá hạn* ngay bên cạnh đã đếm sẵn toàn phạm vi rồi.

Giữ nguyên dòng ấy trên thẻ của **chính bước mình**: ở đó nó nói "trong mười hai việc của bạn, hai
cái sắp hết giờ" — thứ quyết định thứ tự xử lý sáng nay, và không chỗ nào khác nói ra được.

Hai ca kiểm thử **dựng số liệu rồi soi kết quả** chứ không quét mã: thứ cần khẳng định là con số hiện
ra trên màn hình, không phải một nhánh `if` nào đó còn nguyên. Đổi `tong-quan.test.ts` thành `.tsx`
và thêm `@vitest-environment jsdom` để dựng được component.

### Ghi lại một cái bẫy đã dính lần thứ ba

Backtick trong chú thích SQL nằm bên trong template literal — trình biên dịch đọc ra số bát phân.
`make typecheck` bắt được ngay nên không lọt, nhưng đây là lần thứ ba trong dự án. Không thêm test:
`tsc` ĐÃ là chốt và nó hoạt động; thứ hỏng là thói quen gõ của tôi, không phải lưới an toàn.

### Một ca đỏ theo xác suất, không do đợt này

`INT-06` đỏ ở lượt chạy đầy đủ, xanh khi chạy riêng — dấu hiệu quen thuộc. Ca ấy tắt notification rồi
khẳng định **hộp thư rỗng hẳn**, nhưng `ntf.close()` không chờ lá thư đang gửi dở của ca trước hoàn
tất: lá ấy đáp xuống SAU `mailpitClear()` và bị đếm thành thư của ca này.

Lần sửa đầu tôi lọc thư theo mã hồ sơ — **sai**, vì chủ đề thư mang TÊN KHÁCH HÀNG, mà mọi khách
hàng trong file test đều dùng chung một tên. Ca chuyển sang đỏ vì tìm không đủ 6 lá.

Sửa đúng chỗ hỏng: **dọn hộp thư lặp lại cho tới khi một lượt dọn không nhặt được gì mới**. Đó là dấu
hiệu duy nhất đáng tin rằng không còn lá nào trên đường, và nó không đụng tới điều ca ấy muốn khẳng
định.

---

## P64 — Gọi đúng tên "QĐ chiết khấu", và dựng chi tiết lệch thành bảng

### Đổi tên loại lệch `RULE`

"Ngưỡng" → **"QĐ chiết khấu"**. Thứ đã đổi là **quy định** chiết khấu; ngưỡng chỉ là con số nó sinh
ra. Gọi theo con số thì người đọc đi tìm một trường tên "ngưỡng" để sửa, mà cái sửa được nằm ở màn
hình *Danh mục ▸ Quy định chiết khấu*.

Đổi ở **cả ba chỗ** cùng lúc: box *Yêu cầu cập nhật*, khối cảnh báo trên màn hình hồ sơ (`0050` dùng
chung một component nên đi theo), và **nhãn trong thư báo** (`catalog-impact.consumer.ts`). Sót chỗ
thứ ba thì lá thư nói "Ngưỡng" còn màn hình nói "QĐ chiết khấu" về cùng một dòng dữ liệu — đúng loại
lệch mấy đợt vừa rồi phải đi dọn.

Viết tắt "QĐ" chứ không "Quy định": dạng đầy đủ đẩy cột đầu rộng gấp đôi cột giá trị. Bảng dòng sản
phẩm đã dùng "QĐCK" cho cùng khái niệm.

### Chi tiết lệch thành bảng

Bản trước xếp bốn mẩu trên **một dòng chảy**: `[nhãn] mã-sp giá-cũ → giá-mới`. Nhãn dài ngắn khác
nhau nên mã sản phẩm và con số bắt đầu ở một cột khác nhau trên mỗi dòng — đọc ba dòng thì mắt phải
dò lại từ đầu ba lần, mà đây đúng là chỗ người ta cần **so con số theo cột**.

Giờ là bảng bốn cột: *Lệch ở · Sản phẩm · Trên hồ sơ · Danh mục hiện tại*. Hai giá trị nằm ở hai cột
riêng thay vì hai mẩu chữ nối bằng mũi tên.

Dùng lại lớp `bang` và `khung-cuon` của các bảng khác trong sản phẩm — cuộn ngang được trên điện
thoại, và đọc quen một bảng là quen mọi bảng. Thêm `white-space: nowrap` cho nhãn: "QĐ chiết khấu" đủ
dài để bị ngắt dòng trong một ô hẹp, và một cái nhãn hai dòng trông như hai nhãn.

Dọn luôn `.lech-muc` — không component nào còn dùng, và CSS chết là thứ người sau sẽ tưởng còn sống.

### Kiểm chứng

Ba ca mới: nhãn `RULE` đọc ra "QĐ chiết khấu" **và không còn chữ "Ngưỡng"** · chi tiết là `table` với
đúng bốn tiêu đề cột · một hàng cho ra đúng bốn ô `['Giá', 'NC-GOLD-900', '615.000 đ', '680.000 đ']`
· bảng nằm trong `.khung-cuon` để còn cuộn được trên điện thoại.

---

## P65 — Bỏ thư báo TDV khi CSBH đang hiệu lực bị lệch danh mục

Khách hàng yêu cầu bỏ. Đây là gỡ một **yêu cầu nghiệp vụ đã chốt** — tiêu chí NTF-13, NTF-13b,
NTF-13c và một dòng ở YCNV muc 7.2 — nên mã, bộ kiểm và tài liệu gỡ cùng lúc.

### Gỡ những gì

| Thứ | Vì sao đi theo |
|---|---|
| `baoTdv()` và sự kiện `policy.catalog_impact` | Chính lá thư |
| Bốn nhãn tiêu đề `*_IMPACT` ở `templates.ts` | Không sự kiện nào dùng nữa |
| `NHAN_LOAI`, `nhanLech()`, `giaTriLech()` | Chỉ dựng phần `extra` của lá thư ấy |
| Giá trị trả về của `dongBoDauVet()` | Nó trả về "những dòng lệch MỚI XUẤT HIỆN", chỉ để quyết định có gửi thư hay không |

`dongBoDauVet` vẫn ghi và xoá `pol.policy_impact` như cũ — box *Yêu cầu cập nhật* và khối cảnh báo
trên màn hình hồ sơ (`0050`) đọc bảng ấy. Chỉ phép so "mới hay cũ" là mất.

Ba chỗ đều để lại **chú thích mộ chí** thay vì xoá lặng lẽ: đầu consumer, chỗ bốn nhãn cũ, và trên
`dongBoDauVet`. Không có chúng thì người đọc sau sẽ tự hỏi vì sao consumer này phát hiện ra chênh
lệch mà không báo cho ai — rồi thêm lại.

### Bộ kiểm đổi chiều, không xoá

Hai ca đang khẳng định lá thư giờ khẳng định **dấu vết được ghi VÀ không lá thư nào đi ra**. Vế thứ
hai là nửa quan trọng: gỡ một tính năng mà không có gì canh thì nó lặng lẽ quay lại ở lần sửa sau.

Một hệ quả dễ chịu: ca `0029` trước đây phải lục cả hộp thư dùng chung để tìm đúng lá của hồ sơ mình
— đổi một quy định làm consumer quét toàn bộ hồ sơ đã đóng băng nên nó sinh thư cho cả TDV của tệp
test khác, và "lá mới nhất là lá của tôi" đã đỏ một lần với địa chỉ `tdv02`. Bỏ thư thì khẳng định
gọn lại thành "hộp thư trống", không còn phụ thuộc ai vừa nhận gì.

### Một điều cần nói với khách hàng

Sau đợt này, **không còn kênh ĐẨY nào** báo rằng một CSBH đang có hiệu lực đã lệch khỏi danh mục.
Người dùng chỉ biết khi họ tự mở phần mềm: box *Yêu cầu cập nhật* trên trang Tổng quan, hoặc khối
cảnh báo trên màn hình hồ sơ. Với hồ sơ **đang chờ duyệt** thì không sao — người ta mở nó ra để ký,
và khối cảnh báo nằm ngay trên bảng số. Với hồ sơ **đang có hiệu lực** thì khác: không ai có lý do mở
nó ra hằng ngày.

Đã ghi rõ trong hướng dẫn sử dụng, kèm câu nhắc nhìn trang Tổng quan mỗi sáng.

---

## P66 — Khối lưu ý bỏ nền vàng, và dải "ai đã duyệt" ở đầu màn hình hồ sơ

### Nền vàng đổi thành thẻ có vạch màu

Nền vàng kín khối có hai vấn đề, và cái thứ hai mới là cái người dùng thấy:

1. Nó dùng **cùng sắc độ** cho cả khung lẫn bảng nằm trong. Từ `0054` khối chênh lệch chứa một bảng,
   nên viền bảng nằm trên vàng nhạt và mọi thứ đục lại.
2. Trên màn hình hồ sơ có **hai khối vàng liền nhau** — *Lý do gần nhất* và *chênh lệch danh mục* —
   nên trang trông như đang báo lỗi dù chẳng có gì hỏng.

Thay bằng **thẻ nền thường + vạch màu 4px bên trái**, chỉ dòng tiêu đề giữ màu. Không phải sáng tạo
gì: `.chi-so` đã dùng đúng mẫu ấy từ đầu, nên đọc quen một khối là quen mọi khối.

Một chi tiết tôi định làm rồi bỏ: bắt `> strong` thành `display: block` để không phải sửa JSX. Ba chỗ
dùng `hop-canh-bao` có `strong` **nằm giữa câu**, có chỗ tới hai cái — quy tắc ấy sẽ cắt câu làm ba
khúc. Đổi sang một lớp `hop-tieu-de` tường minh ở hai chỗ tôi kiểm soát markup.

### Và một lỗi CSS của chính tôi từ `0054`

Lúc dọn CSS chết ở `0054` tôi để lại một `.canh-bao-lech` **lơ lửng** ngay trên một chú thích:

```
.canh-bao-lech
(chú thích)
.bang-lech { … }
```

Chú thích không cắt được selector, nên hai dòng dính thành `.canh-bao-lech .bang-lech`: cả bộ kiểu chỉ
áp trong khối cảnh báo, còn bảng trong box *Yêu cầu cập nhật* thì trần trụi. **CSS vẫn hợp lệ, không
lỗi nào nổi lên** — chỉ một bảng trông khác bảng kia, và chốt kiểm biến-CSS của `0050` không thấy gì.

Thêm chốt `0056`: dò **selector lơ lửng** — một dòng chỉ chứa selector mà dòng có nghĩa kế tiếp lại mở
khối mới. Đã thử bằng cách đặt lại đúng lỗi cũ: đỏ ngay dòng 457.

Hai lần tự làm hỏng khi viết chính chốt ấy. Bản đầu soi từng dòng thô và báo mười hai chỗ sai — toàn
là dòng kết thúc của chú thích nhiều dòng, vì chúng không chứa dấu ngoặc nhọn nên trông y hệt selector
đứng một mình; sửa bằng cách cắt hết chú thích trước rồi mới quét. Rồi chính chú thích giải thích việc
ấy lại chứa ký hiệu kết thúc chú thích và tự đóng sớm, làm cả tệp test không tải được.

### Dải "ai đã duyệt"

Trước đó đầu màn hình chỉ có mã, phiên bản, ngày áp dụng và trạng thái — nên câu hỏi thường gặp nhất
khi mở một hồ sơ đã đi được vài bước, *"ai ký cái này?"*, phải trả lời bằng cách sang màn hình *Nhật
ký*. Một chuyến đi cho một dòng thông tin.

Bốn ô theo thứ tự luồng, **chỉ hiện bước đã xảy ra**. Mốc thời gian đi **kèm** tên: biết ai ký mà
không biết lúc nào thì vẫn phải mở nhật ký để biết hồ sơ nằm đó bao lâu, mà đó chính là câu hỏi tiếp
theo của người vừa đọc cái tên.

**Người ký đọc từ `tbp_signed_by`, không từ `tbp_user_id`.** Cột sau là người ĐƯỢC PHÂN CÔNG, và hai
cột khác nhau khi có người duyệt thay. Đọc cột sai là ghi công sai người — loại sai không ai phát hiện
được từ màn hình, vì cả hai đều là tên một Trưởng bộ phận có thật. Có ca kiểm thử đổi người được phân
công sang `tbp02` rồi khẳng định dải vẫn ghi `tbp01`.

Ca ấy đỏ lần đầu vì tôi đọc bằng `tbp01`: đổi người phân công làm chính họ rơi khỏi phạm vi hồ sơ và
`GET /policies/:id` trả 403. Đọc bằng TDV phụ trách — người luôn trong phạm vi hồ sơ của mình.

---

## P67 — Ô số trong bảng căn trái, và đổi tên cột "Đã cập nhật"

### Vì sao trông "lệch"

`th, td` căn trái; `.so` căn phải. Nên tiêu đề cột nằm sát mép trái còn con số dưới nó nằm sát mép
phải. Cột càng rộng thì khoảng hở càng lớn, và mắt phải bắc cầu qua chỗ trống ấy để biết con số này
thuộc tiêu đề nào.

Hai cách sửa, và cả hai đều làm hết "lệch": đưa tiêu đề sang phải, hoặc đưa con số sang trái. Khách
hàng chọn **căn trái cả hai**.

**Đánh đổi, đã nói với khách hàng**: tiền nhiều chữ số không còn thẳng hàng đơn vị theo cột dọc — thứ
mà căn phải sinh ra để làm. `font-variant-numeric: tabular-nums` vẫn giữ chữ số đều bề ngang nên các
số cùng độ dài vẫn thẳng; chỉ số dài ngắn khác nhau thì lệch ở đuôi.

Đây là đảo một vế của tiêu chí **FE-29** ("căn phải, chữ số đều cột"), nên đã sửa cả dòng tiêu chí
trong kiến trúc thay vì để mã và tài liệu nói hai chuyện.

Phạm vi **chỉ trong bảng**: `th.so, td.so`. `.so` đứng một mình — con số cuối dải thanh so sánh, dòng
tổng cộng — vẫn căn phải, vì ở đó không có tiêu đề cột nào để mà khớp.

Chốt kiểm quét CSS chứ không dựng trình duyệt: jsdom không tính kiểu xếp tầng, nên `getComputedStyle`
chỉ trả lại đúng thứ vừa viết chứ không kiểm được gì.

### Đổi tên cột

*"Danh mục hiện tại"* → **"Đã cập nhật"**. Ngắn hơn hẳn, và cặp *Trên hồ sơ · Đã cập nhật* đọc thành
một cặp đối nhau rõ ràng hơn *Trên hồ sơ · Danh mục hiện tại*.

---

## P68 — Cột đầu của bảng chênh lệch hết dính mép

`0054` đặt `padding-left: 0` cho cột đầu của `.bang-lech`, để chữ trong bảng thẳng hàng với đoạn văn
ngay trên nó. Lúc ấy bảng nằm trên một mảng nền vàng phẳng nên trông tạm được.

`0056` đổi khối lưu ý thành thẻ có viền và vạch màu bên trái — và chữ cột đầu dính sát vào mép trong
của thẻ, hụt hẳn một khoảng thở so với mọi bảng khác trong sản phẩm. Một quyết định đúng ở bối cảnh
cũ thành sai ở bối cảnh mới, mà không có gì báo.

Gỡ luật ấy đi: cột đầu nhận đệm như mọi cột khác. Thẳng hàng với đoạn văn không đáng đổi lấy chuyện
đó — một bảng là một khối riêng, mắt đọc nó theo lưới của chính nó chứ không nối tiếp dòng văn phía
trên.

Nhân tiện tôi đã nới cả đệm DỌC từ `--k1` lên `--k2` rồi trả lại: khách hàng báo chật theo chiều
ngang, còn `--k1` là con số chọn có chủ ý ở `0054` (bảng lồng trong khối, gọn hơn bảng thường). Sửa
kèm một thứ không ai hỏi là cách làm một lượt sửa nhỏ trở thành thứ phải xem lại.

---

## P69 — Thẻ *Sắp quá hạn* bấm vào ra toàn bộ hồ sơ

### Lỗi

Bấm thẻ mở `/ho-so?dueSoon=1`, và màn hình hồ sơ hiện **124 hồ sơ thay vì 5**. Đo trên chồng demo.

`DanhSachHoSo` chỉ nhận những tham số có tên trong `TIEU_CHI_AN` / `TIEU_CHI`; tham số lạ bị **bỏ
trong im lặng**. `0047` thêm thẻ và thêm tiêu chí `dueSoon` bên reporting, nhưng quên khai bên màn
hình hồ sơ. Không lỗi, không cảnh báo — chỉ một danh sách dài hơn con số vừa bấm vào.

### Vì sao phép kiểm không bắt

Ca canh chuyện này (`0045`) liệt kê TAY hai khoá rồi quét mã nguồn tìm chúng:

```ts
expect(nguon).toContain('pendingStep:');
expect(nguon).toContain('reprint:');
```

Nó xanh mãi mãi. Một phép kiểm liệt kê tay **không lớn theo mã** — thêm khoá thứ ba thì nó vẫn xanh.

Bản mới SUY RA danh sách khoá từ chính `duongThe()` của **mọi thẻ, mọi vai trò**, rồi đối chiếu với
`KHOA_NHAN_TU_LIEN_KET` xuất từ màn hình hồ sơ. Thêm thẻ mới mang tham số mới là nó tự bắt. Đã thử
bằng cách gỡ lại dòng vừa thêm: đỏ ở cả bốn vai trò.

### Một lỗ hổng thứ hai, cùng bộ lọc

Rà tiếp thì thấy `SAP_QUA_HAN` còn thiếu một vế. `discardOverdue` (`0047`) chuyển hồ sơ quá hạn quá 3
ngày sang `DA_XOA` mà **không xoá `sla_due_at`**. Với hai vế cũ — "chưa mang `QUA_HAN_DUYET`" và "hạn
trong vòng 24 giờ" — hồ sơ ấy thoả cả hai và lọt vào bộ lọc vĩnh viễn.

Mà thẻ thì đếm qua `byStepDetail`, vốn đã lọc theo bước, nên nó KHÔNG đếm hồ sơ ấy: **thẻ ghi 5, bấm
vào ra 6 dòng**. Chưa lộ ra vì vòng quét xoá chưa chạy trên dữ liệu demo — nhưng nó sẽ lộ ở môi
trường thật sau đúng ba ngày.

Thêm vế ba: `BUOC_DANG_CHO IS NOT NULL`. Dựng TỪ `BUOC_DANG_CHO` chứ không viết lại điều kiện, nên
phép đếm và phép lọc đọc chung một định nghĩa — và khối phải chuyển xuống nằm sau nó.

Chữa bằng cách xoá `sla_due_at` lúc discard cũng được, nhưng vế ba mạnh hơn: nó đúng bất kể còn trạng
thái nào khác giữ lại một mốc hạn cũ.

---

## P70 — Ô *Hạn xử lý* trong bộ lọc, thay cho tham số `dueSoon`

Khách hàng hỏi cách tìm hồ sơ sắp quá hạn **từ biểu mẫu lọc**. Câu trả lời lúc ấy: không có — `dueSoon`
là tham số chỉ đến từ liên kết, cố ý để ngoài biểu mẫu vì nó nhận đúng một giá trị `1`.

Cách sạch không phải thêm ô `dueSoon` mà là một Ô CHỌN gom cả hai câu hỏi về hạn:

> **Hạn xử lý**: — tất cả — · Sắp quá hạn (dưới 24 giờ) · Đã quá hạn

### Thay chứ không thêm

`dueSoon` bị **gỡ hẳn**, đổi thành `han` với hai giá trị. Giữ cả hai là hai tham số cho hai nửa của
cùng một câu hỏi — hai chỗ phải nhớ, và có ngày một chỗ sửa còn chỗ kia quên.

`han=QUA_HAN` trùng nghĩa với `status=QUA_HAN_DUYET`, và trùng là chấp nhận được: người đi tìm theo
HẠN không nhất thiết nghĩ nó là một trạng thái.

Thẻ *Quá hạn* cũng chuyển sang `?han=QUA_HAN` thay vì `?status=…`. Hai đường cho ra cùng một tập,
nhưng đường này để lại đúng cái ô chọn người dùng thấy trong biểu mẫu — bấm thẻ rồi mở *Bộ lọc* là
hiểu ngay mình đang lọc theo gì, và đổi sang nửa kia bằng một cú chọn. Kéo theo `The` có thêm ô `den`
để ghi đè đường dẫn mặc định suy từ `dem`.

### Chỗ đặt trong biểu mẫu

Ngay **sau *Trạng thái***, không phải cuối danh sách. Hai ô cùng trả lời "hồ sơ đang ở tình trạng
nào", chỉ khác một cái theo bước còn một cái theo đồng hồ. Đặt cuối thì người đi tìm hồ sơ sắp hết
giờ phải quét qua mã số thuế và tên sản phẩm trước khi gặp nó.

Ô CHỌN chứ không ô gõ: hai giá trị là mã viết hoa, và một ô nhập tự do cho hai giá trị cố định là một
ô người dùng gõ sai được. Giá trị lạ vẫn trả **400** chứ không im lặng bỏ qua.

### Đổi tên `KHOA_TU_LIEN_KET`

Tên cũ nghĩa là "chỉ đến từ liên kết", và `han` phá vỡ điều đó — nó có ô thật trong biểu mẫu. Đổi
thành `KHOA_NGOAI_MUC_92`: ranh giới thật sự là "trong hay ngoài mười một tiêu chí của muc 9.2", vì
`GET /reports/filter-keys` công bố đúng con số ấy và trộn vào là làm một tài liệu nghiệp vụ nói sai
về chính nó.

### Kiểm chứng trên chồng demo

| Bộ lọc | Kết quả |
|---|---|
| không lọc | 124 hồ sơ |
| `han=SAP_QUA_HAN` | 5 |
| `han=QUA_HAN` | 4 |
| `status=QUA_HAN_DUYET` | 4 — khớp, đúng như mong đợi |
| `han=SAI` | 400 |

## P71 — Đầu màn hình hồ sơ dựng lại: thông tin tách dòng, thao tác lên đầu, lịch sử xuống cuối

Ba yêu cầu cùng chạm một màn hình, và cả ba đều là chuyện BỐ CỤC:

1. Thông tin hồ sơ **không dồn hết lên một dòng** — phiên bản, trạng thái, ngày soạn thảo, ngày áp
   dụng, người đề nghị, và thông tin khách hàng.
2. **Thao tác lên góc trên bên phải**, ngang hàng với mã hồ sơ.
3. **Nhật ký → Lịch sử**, thành mục cuối cùng, kiểu sổ ra khi bấm.

### Thứ đáng nói nhất: màn hình hồ sơ không hiện khách hàng

Đi làm yêu cầu 1 thì mới thấy: tới `0060` màn hình chi tiết hồ sơ **không hiện khách hàng nào cả**.
`customerId` có trong dữ liệu, nhưng không vẽ ra đâu hết. Nghĩa là người sắp ký một chính sách bán
hàng không đọc được nó dành cho ai, trừ khi tải bản A4 về.

Đây là lỗ hổng sống từ P7d, không phải hệ quả của đợt này. Nó lọt lưới vì mọi test đều đi từ danh
sách hoặc từ hộp việc — hai chỗ đều có tên khách hàng ngay cạnh mã hồ sơ, nên đường vào nào cũng đã
biết sẵn khách là ai.

`byId` giờ gọi sang `customer` và trả kèm `khachHang`. Hai điểm cố ý:

- **Hỏng thì trả `null`**, không ném. Mất khối khách hàng thì khó chịu; mất cả màn hình hồ sơ vì
  `customer` đang khởi động lại thì người đang chờ ký không làm được gì. Cùng lẽ với `userNames`.
- **Chấp nhận thêm một vòng mạng** ở đây, dù `0031` đã từ chối đúng chiều gọi này. Khác biệt: `0031`
  là danh sách khách hàng — hot path, mỗi lượt mở màn hình một lời gọi cho N dòng. Đây là chi tiết
  MỘT hồ sơ, và nó chạy song song với `userNames` chứ không nối tiếp.

### Người đề nghị đọc từ `created_by`, không phải `tdv_user_id`

Hai cột khác nhau, và Sale Admin đổi được cột sau (`doiTdvPhuTrach`). Đọc nhầm sang đó thì bàn giao
khách hàng xong là hồ sơ cũ đổi luôn tên người đề nghị — viết lại lịch sử của một văn bản đã gửi đi.
Cùng loại lỗi với `tbp_signed_by` ở `0056`, và cùng loại "không ai phát hiện ra được từ màn hình" vì
cả hai giá trị đều là tên một TDV có thật.

### Trạng thái rời khỏi góc phải

Góc trên bên phải giờ là chỗ của nút thao tác, nên nhãn trạng thái chuyển vào lưới thông tin — vẫn là
ô ĐẦU TIÊN và vẫn vẽ bằng `<Nhan>`, có màu, đọc được từ xa. Không nhân đôi: một nhãn ở góc và một
dòng "Trạng thái: …" cách nhau 200px là hai chỗ nói cùng một điều.

*Xoá hồ sơ* **không** lên theo. Nó ở lại cuối trang, tách khỏi nhóm nút của luồng duyệt: đặt một nút
huỷ hoại cạnh nút ký là mời người ta bấm nhầm.

### Lịch sử: `<details>` của trình duyệt, tải khi mở

Không tự dựng nút gập bằng `useState` + `<button>`. `<details>` có sẵn phím tắt bàn phím,
`aria-expanded`, và tìm-trong-trang của trình duyệt mở được nó ra — bản viết lại thường thiếu thứ ba.

**Tải khi mở, không tải sẵn.** Phần lớn người mở hồ sơ là để xem số và bấm một nút. Đây cũng là ca
kiểm thử đáng giá nhất tệp mới: tải sẵn thì nhìn bằng mắt không thấy khác gì, chỉ khác ở chỗ mỗi lượt
mở màn hình được mở nhiều nhất của phần mềm lại tốn thêm một vòng mạng.

### Màn hình `/ho-so/:id/nhat-ky` VẪN GIỮ

Thư *để biết* dán thẳng liên kết vào đó. Gỡ địa chỉ này là làm chết liên kết trong mọi lá thư đã gửi.
Bảng thì dùng chung — `components/LichSu.tsx` — vì hai bản dựng riêng sẽ lệch nhau sau lần sửa câu chữ
đầu tiên. Nhãn trong thư đổi thành "Xem lịch sử hồ sơ" cho khớp.

Đổi tên vì phần mềm có **hai** thứ tên *Nhật ký*: nhật ký kiểm toán toàn hệ thống (mục menu của Quản
trị) và cái này. Trùng tên ở hai thứ khác hẳn phạm vi là một câu hỏi lặp lại mãi trong mọi buổi hướng
dẫn sử dụng.

### Kiểm chứng

`tests/web/chi-tiet-ho-so.test.tsx` — 14 ca, dựng thật cả màn hình (`PhienProvider` + `BoDinhTuyen`,
chặn `fetch` theo ĐƯỜNG DẪN chứ không theo thứ tự lời gọi). `tests/http/policy.test.ts` thêm hai ca
`0061`: khối khách hàng có mặt và công nợ là chuỗi; người đề nghị không đổi khi đổi TDV phụ trách.

## P72 — Thẻ tên sổ xuống thành menu tài khoản, đăng xuất không còn bày sẵn

Yêu cầu: bỏ nút *Đăng xuất* đứng cạnh thẻ tên; bấm vào tên mình thì sổ xuống — dòng đầu là email, hai
dòng sau là *Thông tin tài khoản* và *Đăng xuất*.

### Vấn đề thật nằm ở khoảng cách giữa hai nút

Thanh trên cùng có hai thứ đứng SÁT nhau: thẻ tên dẫn sang *Thông tin của tôi*, và ngay bên phải nó
là nút cắt phiên. Bấm trượt một lần thì mất phiên **và mất cả biểu mẫu đang nhập dở** — mà `dangXuat`
xoá luôn bản nháp trong `sessionStorage`, khác hẳn với phiên hết hạn (thứ đã được `FE-33` lo cho).

Gom vào menu thì việc nguy hiểm cần hai cú bấm có chủ ý, và thanh trên cùng thưa ra một khối.

### Không dùng `role="menu"`

Nội dung có một dòng chữ không bấm được (email), mà `role="menu"` thì mọi con của nó phải là
`menuitem`. Đây là mẫu **disclosure** — một nút `aria-expanded` mở ra một khối — và nó mô tả đúng thứ
đang xảy ra hơn. Kèm theo: Escape đóng và **trả tiêu điểm về nút đã mở**, nếu không người dùng bàn
phím rơi về đầu trang.

Đóng bằng `mousedown` chứ không `click`: bấm ra ngoài phải đóng ngay lúc ngón tay chạm xuống. Nghe
`click` thì thứ tự sự kiện đổi theo trình duyệt và có máy nuốt mất cú bấm đầu tiên.

### Mũi tên là dấu hiệu DUY NHẤT

Thẻ tên trước đây là `<a>`, giờ là `<button>`. Không thêm mũi tên thì nó trông y hệt một nhãn tĩnh —
và không ai bấm vào một nhãn. Nó xoay 180° khi mở.

### Chỗ chưa tốt, nói trước

Dưới 640px `.nguoi-dung-chu` bị ẩn (FE-15), nên thẻ tên chỉ còn ảnh đại diện, và menu sổ ra chỉ có
email. Trên điện thoại **không màn hình nào hiện tên và vai trò của chính mình** ngoài
*/thong-tin*. Đây là tình trạng có từ trước, không phải đợt này gây ra — nhưng menu tài khoản là chỗ
tự nhiên để sửa nó nếu khách hàng thấy vướng.

### Kiểm chứng

`tests/web/menu-tai-khoan.test.tsx` — 8 ca, dựng thật `BoCuc`. Ca chính: **lúc chưa bấm gì thì không
có nút Đăng xuất nào trên màn hình**; email không phải liên kết; *Thông tin tài khoản* là thẻ neo
thật (mở tab mới, sao chép địa chỉ, bấm chuột giữa — cả ba chỉ chạy trên liên kết).

## P73 — Thẻ tài khoản hiện tên đăng nhập, vai trò tách ra đứng riêng

Hai sửa nhỏ trên thanh trên cùng, cùng một lẽ: **thẻ tài khoản nói về TÀI KHOẢN, không về con người**.

- Thẻ hiện `username` thay cho họ tên. Nó trả lời "máy đang chạy bằng tài khoản nào" — câu hỏi của
  người dùng chung máy ở quầy, và của người vừa đổi tài khoản để thử một vai trò khác. Họ tên không
  trả lời được: hai tài khoản của cùng một người mang y hệt một cái tên.
- Vai trò ra khỏi thẻ, thành một viên riêng bên trái. Nó quyết định người dùng thấy gì trên MỌI màn
  hình, nên nó là câu trả lời cho "vì sao menu của tôi không có mục kia" — nhét làm dòng phụ dưới tên
  thì nó đọc như một chú thích của cái tên.

### Ảnh đại diện GIỮ chữ tắt của họ tên

Không đổi sang chữ tắt của `username`: `tdv01` và `tdv02` đều cho ra "TD", tức là ảnh đại diện thành
vô nghĩa đúng ở chỗ nó có ích. Giữ "VH" cho *Nguyen Van Hung* thì nó vẫn phân biệt được hai người, mà
vẫn không phạm yêu cầu — nó là hình, `aria-hidden`, và tên đọc được của nút vẫn đúng là `tdv01`.

### Lấp một lỗ hổng có từ trước

Dưới 640px, `.nguoi-dung-chu` bị ẩn hoàn toàn (FE-15) vì họ tên tiếng Việt đủ dài để đẩy vỡ thanh
trên cùng — hệ quả là trên điện thoại **không màn hình nào cho người dùng biết mình đang là ai**.

`tdv01` là năm ký tự nên nó ở lại được. Thứ phải đi là viên vai trò, và đó là đánh đổi đúng: tên đăng
nhập là thứ đổi giữa các lần đăng nhập, còn vai trò thì suy được từ chính các mục menu đang hiện.

## P74 — Mỗi trạng thái một màu, và gỡ hẳn trạng thái *TBP đã ký số*

Khách hàng duyệt bảng màu (artifact `99bab873`) với bốn chỉnh sửa, và chỉnh sửa thứ tư là một quyết
định nghiệp vụ chứ không phải chuyện màu sắc.

### Màu

Trước đợt này `nhomTrangThai()` gom mười hai trạng thái vào NĂM nhóm, và bốn bước chờ rơi hết vào
một. Dải thẻ của Ban lãnh đạo có năm ô cùng màu — không ai đọc được hồ sơ đang tắc ở đâu nếu không
đọc chữ trên từng ô.

Giờ nó là một BẢNG TRA, mỗi trạng thái một dòng. Không còn `if (s.startsWith('CHO_'))` — chính phép
suy ấy đã trói bốn bước chờ vào một màu, và nó cũng sẽ lặng lẽ nuốt bất kỳ trạng thái mới nào bắt
đầu bằng `CHO_`.

Bốn bước chờ đi thành chuỗi **chàm → lam → ngọc → mòng két**, đúng thứ tự hồ sơ đi qua. Ô đếm theo
BƯỚC mượn màu của đúng trạng thái nó đại diện: bấm thẻ *Chờ TBP duyệt* rồi rơi vào danh sách toàn
nhãn màu khác thì người dùng phải học bảng màu lần thứ hai.

Mọi cặp chữ/nền đạt WCAG AA ở cả hai giao diện — thấp nhất 4,61. Tính bằng công thức, không ướm mắt;
hai màu trong đề xuất đầu (xanh lá 4,42 và cam 4,45) đã phải chỉnh vì rớt ngưỡng.

### Yêu cầu tự mâu thuẫn, và cách xử lý

Yêu cầu gốc: *"không có 2 thẻ trùng màu nhau"*. Hai chỉ đạo sau đó — gộp *Từ chối* với *Quá hạn
duyệt*, gộp *Hết hiệu lực* với *Đã xoá* — lật lại chính nó, vì **cả hai cặp đều đứng chung một dải
thẻ** (cặp đầu ở TDV, TBP và BLĐ; cặp sau ở BLĐ).

Guard mới bắt được ngay ở lần chạy đầu, và đó là lý do viết nó trước khi sửa xong. Bất biến còn giữ
được là bản hẹp hơn: ngoài hai cặp ĐÃ CHỐT ra, không ô nào được trùng ô nào — và hai cặp ấy khai
tường minh bằng tên thẻ, không phải bằng phép đếm. Đếm thì một cặp trùng MỚI vẫn lọt qua miễn tổng
số không đổi.

### Gỡ `TBP_DA_KY_SO`

Khách hàng nói nó chỉ là trạng thái thoáng qua và gây nhận hai thư. **Cả hai vế đều đúng**, kiểm
chứng được trong mã:

- `TBP_SIGN` đặt trạng thái rồi một khối ngay dưới cập nhật lần thứ hai sang `CHO_KT_L1`, trong CÙNG
  transaction. Không lời đọc nào ngoài transaction ấy từng thấy một hồ sơ đang ở đó.
- `RECIPIENTS.TBP_SIGN = ['KE_TOAN','TDV']` và `policy.publish_signed → ['KE_TOAN']`. Kế toán có tên
  trong cả hai. Chính test cũ cũng ghi nhận: *"Ba thư: gửi duyệt, ký số, và bước tự động sau ký."*

Ghi chú cũ ở khối ấy CÓ lo đúng chuyện này, nhưng chỉ gỡ `observers` — người nhận CHÍNH vẫn trùng.
Sửa nửa vời ấy sống được sáu đợt.

Giờ `CHO_TBP_DUYET --TBP_SIGN--> CHO_KT_L1` là một nước. `sla_due_at` vẫn được đặt lại vì
`CHO_KT_L1` nằm trong `WAITING`, nên câu lệnh UPDATE chung đã lo; `tbp_signed_at`/`tbp_signed_by`
vẫn ghi theo `stamp`, nên dải "ai đã duyệt" không đổi một chữ.

### Ranh giới: tập trạng thái ĐẾN ĐƯỢC hẹp lại, tập NHÃN thì không

Postgres **không xoá được** một giá trị khỏi enum, mà `pol.policy_event` có hàng nghìn dòng ghi
`TBP_DA_KY_SO` ở `from_status`/`to_status`. Nên:

- `STATUSES`, `MOI_TRANG_THAI`, `BAN_CUA` — còn **11**.
- `NHAN_TRANG_THAI`, `STATUS_LABEL`, `NHOM_MAU`, `TITLE.PUBLISH_SIGNED` — vẫn **12**, để màn hình
  *Lịch sử* đọc được dòng cũ và để một sự kiện còn kẹt trong bảng thư hỏng gửi lại được đúng tiêu đề.

Đây là ranh giới đáng nhớ: **cái gì đã ghi vào lịch sử thì phải đọc được mãi, dù không sinh ra nữa.**

### Kiểm chứng

13 ca đỏ sau lần chạy đầu, toàn bộ là test đếm cứng hai bước / ba thư — đúng tập đã lường. Luồng đầy
đủ giờ sinh **5 thư** (trước là 6) và **6 dòng lịch sử** (trước là 7). Bốn ca mới ở
`nguon-giao-dien.test.ts` canh bảng màu, trong đó có ca đòi mọi biến `--mau-tt-*` khai đủ ở CẢ BA
khối của `tokens.css` — thiếu khối `[data-theme='toi']` thì chỉ người bật giao diện tối BẰNG TAY mới
thấy hỏng, và đó là loại lỗi không ai báo.

**1157/1157 xanh.**

### Một quả mìn hẹn giờ gỡ tiện thể

Lần chạy đầy đủ thứ hai đỏ đúng một ca chẳng liên quan gì tới màu: *"hồ sơ chưa gửi duyệt nằm trong
hộp việc của người lập"*. Nó gọi `/policies/inbox?limit=200` — đúng trần của `pageOf` — rồi khẳng
định hồ sơ vừa lập có mặt.

Hộp việc xếp `sla_due_at NULLS LAST, created_at`, mà hồ sơ nháp không có hạn, nên hồ sơ MỚI NHẤT nằm
ở CUỐI. Tệp `policy.test.ts` đã tự tích đủ 200 hồ sơ nháp cho `tdv01`, và cái vừa lập rơi khỏi trang
đầu. Hai ca `0061` thêm ở P71 là giọt nước cuối; lần chạy trước còn qua, lần này thì không.

Sửa bằng cách đọc HẾT các trang thay vì nâng trần. Nâng trần chỉ dời quả mìn sang một con số khác.

## P75 — Xoá `TBP_DA_KY_SO` khỏi enum CSDL, và rà sạch mọi dấu vết

`0064` gỡ trạng thái khỏi máy trạng thái nhưng để giá trị enum ở lại, lý do: Postgres không có
`ALTER TYPE ... DROP VALUE`, và `pol.policy_event` có thể còn dòng lịch sử ghi nó. Khách hàng chốt:
**xoá luôn, dựng lại CSDL**. Phần mềm chưa chạy thật, dữ liệu duy nhất là của `make demo-mau` — cái
giá của việc dựng lại dữ liệu mẫu rẻ hơn cái giá của việc mang mãi một giá trị không ai dùng nữa.

### Migration `0048`

Không có lệnh xoá giá trị enum, nên phải đi vòng: đổi tên kiểu cũ → dựng kiểu mới 11 giá trị →
chuyển ba cột sang → bỏ kiểu cũ. Ba chi tiết đáng ghi:

- **Ba chỉ mục phải bỏ trước rồi dựng lại.** `ALTER COLUMN TYPE` tự dựng lại chỉ mục, nhưng vị từ của
  hai chỉ mục riêng phần mang hằng số thuộc kiểu CŨ (`status = 'DANG_CO_HIEU_LUC'`). Sau bước đổi
  tên, hằng số thuộc `policy_status_cu` còn cột thuộc kiểu mới, và Postgres dừng với "operator does
  not exist".
- **Ánh xạ nằm trong mệnh đề `USING`, không phải một câu `UPDATE`.** `ALTER` viết lại bảng mà KHÔNG
  kích hoạt trigger dòng, nên không phải tắt chốt bảo vệ nào của `pol.policy_event`.
- **Giá trị mặc định `'NHAP'` cũng mang kiểu cũ** — gỡ trước, đặt lại sau.

Cả file chạy trong một transaction (`scripts/migrate.sh --single-transaction`), nên hỏng giữa chừng
không để lại lược đồ nửa vời.

### Rà sạch: cái gì đi theo, cái gì ở lại

Vì giá trị enum đã đi, mọi nhãn giữ lại "để đọc dòng lịch sử cũ" mất luôn lý do tồn tại. Đã gỡ:

| Chỗ | Thứ gỡ |
|---|---|
| `format.ts` | `NHAN_TRANG_THAI.TBP_DA_KY_SO`, `NHOM_MAU.TBP_DA_KY_SO`, `NHAN_HANH_DONG.PUBLISH_SIGNED` |
| `templates.ts` | `STATUS_LABEL.TBP_DA_KY_SO`, `TITLE.PUBLISH_SIGNED` |
| `sheet.ts` | nhãn trên bản A4 |
| `policies.service.ts` | `DA_DONG_BANG` |
| `tong-quan.test.tsx` · `nguon-giao-dien.test.ts` | phép trừ và cặp màu thứ ba, giờ thừa |
| `policy.test.ts` | bốn vòng lặp phủ trạng thái, và ca dựng hồ sơ ở trạng thái ấy bằng SQL |

**Ở lại**: mọi chú thích kể lại chuyện đã xảy ra. Chúng là thứ duy nhất trả lời được "vì sao bước B5
biến mất" cho người đọc mã sau này.

Hai ca kiểm thử mới ở `constraints.test.ts` canh giữ chỗ này: enum đúng 11 nhãn theo đúng thứ tự, và
`policy_status_cu` **không còn tồn tại** — đổi tên kiểu rồi quên bỏ là để lại một kiểu mồ côi mang
đúng giá trị vừa gỡ, và lần sau ai đó khai cột theo nó thì giá trị quay lại mà không ai thấy.

### Ca `hành động của HỆ THỐNG không lọt ra` phải đổi chỗ đứng

Nó dựng hồ sơ ở `TBP_DA_KY_SO` bằng SQL để kiểm `PUBLISH_SIGNED` không mọc thành nút. Cả hai đã đi,
nên câu SQL ấy giờ **hỏng** chứ không chỉ vô nghĩa. Chuyển sang `DANG_CO_HIEU_LUC` — trạng thái duy
nhất còn lại có một hành động HỆ THỐNG (`SUPERSEDE`) đi ra.

### Kiểm chứng

Cả hai đường đều chạy:

- **Nâng cấp** — `make test` áp `0048` lên CSDL test đã có sẵn: **1153/1153 xanh**.
- **Dựng mới** — `make demo` xoá sạch rồi migrate 38 file từ đầu, `make demo-mau` seed lại.

Trên chồng demo mới, đếm trực tiếp trong CSDL: enum 11 nhãn · `policy_status_cu` = 0 · `pol.policy`,
`pol.policy_event`, `rpt.policy_row` không dòng nào mang `TBP_DA_KY_SO` · không dòng nào mang
`PUBLISH_SIGNED` · outbox không sự kiện `policy.publish_signed` · đủ 10 chỉ mục trên `pol.policy`.

Rồi ký một hồ sơ thật bằng `tbp01`:

```
trang thai sau khi ky: CHO_KT_L1
so dong lich su: 3
    1 CREATE   None           -> NHAP           | TDV
    2 SUBMIT   NHAP           -> CHO_TBP_DUYET  | TDV
    3 TBP_SIGN CHO_TBP_DUYET  -> CHO_KT_L1      | TBP
nguoi nhan thu tbp_sign: ["KE_TOAN", "TDV"]
```

Một lần bấm, một dòng lịch sử, một lá thư.

## P76 — Dọn thanh gập *Lịch sử*: bỏ chữ nhỏ, mũi tên ra mép phải

Khách hàng chê khối *Lịch sử* xấu. Hai thứ bị bỏ, một thứ đổi chỗ.

### Hai dòng chữ nhỏ màu xám

- Trên thanh gập: *"Từng bước hồ sơ đã đi qua, do ai, vì sao"*. Một mục tên *Lịch sử* trên màn hình
  hồ sơ thì không cần ai giải thích.
- Trên bảng: *"Toàn bộ các bước hồ sơ đã đi qua, cũ nhất trước. Lịch sử chỉ ghi thêm — không dòng nào
  sửa hay xoá được."* Câu này nói hai thứ bảng đã tự nói: thứ tự đọc ra được từ cột `#`, còn tính bất
  biến thì **không ai kiểm được bằng mắt** — nó là một lời hứa, và chỗ hứa đúng là tài liệu hướng
  dẫn, nơi nó vẫn còn nguyên.

### Mũi tên ra mép phải

Trước đó nó là `::before`, đứng ngay trước tên mục. Hệ quả: vị trí của nó **trôi theo độ dài tên**,
nên mắt phải đi tìm ở một chỗ khác nhau trên mỗi khối gập. Giờ là `::after` với
`justify-content: space-between` — luôn ở đúng một chỗ.

Kèm một chỉnh nhỏ đáng ghi: hình vuông xoay 45° có **tâm thị giác thấp hơn tâm hình học**, nên căn
giữa theo hộp thì nó trông như bị tụt. `margin-top: -2px` khi gập, `+2px` khi mở.

### Kiểm chứng

Hai ca mới ở `chi-tiet-ho-so.test.tsx`: `<summary>` có ĐÚNG một phần tử con và nó là `<h2>`; thân
khối gập không còn `.ghi-chu` nào, và phần tử đầu tiên trong đó là khung cuộn của bảng chứ không phải
một đoạn chữ. **1155/1155 xanh.**

## P77 — Ba sửa trong nội dung thư, và thư báo CSBH hết hiệu lực

Khách hàng review bản trình bày luồng email và chốt ba việc: sửa M-01, sửa M-03, và làm M-08. Kèm
một yêu cầu thứ tư phát trong lúc đang làm — bỏ số thứ tự bước khỏi thân thư.

### M-01 — dòng phụ in giờ UTC thô

Hai lá thư SLA in `Hạn xử lý: 2026-09-03T07:00:00.000Z`, trong khi sáu dòng còn lại của **chính lá
thư ấy** đã đổi sang giờ Việt Nam từ lâu. Người nhận đọc lệch 7 tiếng, và lệch theo hướng làm họ
tưởng mình đã trễ.

Sửa ở `bodyFor`, **không** ở nơi phát sự kiện. Thân sự kiện là dữ liệu máy đọc — nó nằm lại trong
`pol.outbox`, trong hàng thư hỏng, và được đọc lại khi gửi bù. Giờ địa phương thuộc về *cách trình
bày*, và lá thư là nơi duy nhất có người đọc. Đúng luật đang áp cho trường `at`.

Nhận diện bằng một biểu thức chính quy ISO-8601 áp lên mọi giá trị trong `extra`. Không phải đoán mò:
`extra` chỉ mang chuỗi, và một chuỗi khớp đúng khuôn ấy thì đích thị là dấu thời gian máy sinh —
người dùng không gõ tay `2026-09-03T07:00:00.000Z` vào ô nào của phần mềm.

### M-03 — dòng phụ lệch khỏi cột

Bảy dòng cố định được **đệm tay** bằng khoảng trắng viết sẵn trong chuỗi, còn các dòng của `extra`
in `${k}: ${v}`. Nên "Hạn xử lý" và "Số ngày quá hạn" nằm lệch hẳn, thân thư trông như bị vá thêm ở
cuối.

Giờ dựng danh sách CẶP nhãn–giá trị rồi mới căn theo nhãn **dài nhất thực tế có trong lá thư này**.
Thêm một khoá `extra` dài hơn "Bước đang duyệt" thì cả khối tự giãn — không ai phải nhớ đi sửa lại
bảy chuỗi đệm tay.

Ca kiểm thử so **vị trí giá trị**, không so số khoảng trắng: đó là thứ mắt người nhìn thấy. Nó cũng
là chốt chặn cho một lỗi âm thầm — nhãn tiếng Việt lưu ở dạng NFD thì `String.length` đếm thừa và cả
khối lệch, mà mã nguồn nhìn vẫn y hệt.

### Bỏ số thứ tự bước khỏi thân thư

`Bước 4 — Trưởng bộ phận duyệt và ký số` → `Trưởng bộ phận duyệt và ký số`. Ba lý do, lý do thứ hai
là lý do thật:

1. Người nhận thư không thuộc bảng mười bước; "Bước 4" không thêm gì mà phần chữ chưa nói.
2. Bốn con số ấy **nhảy cóc 4 · 6 · 8 · 10** — các bước lẻ là việc của người khác, không sinh thư.
   Người đọc thấy hồ sơ "nhảy từ bước 4 sang bước 6" và tưởng mình bỏ lỡ mất một bước.
3. Thêm hoặc bớt một bước trong quy trình là phải sửa lại toàn bộ các số, và không gì bắt lỗi nếu
   quên.

Ca kiểm thử khẳng định **cả hai vế**: có phần chữ, và không còn `/Bước \d/` nào. Bỏ số là cả điểm
của thay đổi, nên phải có ca giữ nó bị bỏ.

### M-08 — CSBH hết hiệu lực trong im lặng

**HAI đường** làm một CSBH đang hiệu lực mất hiệu lực, và trước P77 cả hai đều không báo cho ai:

| Đường | Sự kiện | Trạng thái trước P77 |
|---|---|---|
| Có phiên bản mới được duyệt | `policy.superseded` | Có sự kiện, **không có `recipients`** → notification bỏ qua |
| Khách hàng ngừng hợp tác | `policy.customer_retired` | Sự kiện TỔNG KẾT về khách hàng, không dùng gửi thư được |

#### Vì sao không gửi cho tất cả

Bước `KT_RECEIVE_L2` đã gửi cho **cả bốn người của bản mới** lá *CSBH bắt đầu có hiệu lực* — cùng
khách hàng, cùng một giây, cùng một transaction. Gửi thêm lá "bản cũ hết hiệu lực" cho chính họ là
đúng thứ đã phải **gỡ hẳn một trạng thái khỏi máy trạng thái** ở P74 mới dứt được.

Nên lọc ở **nơi phát sự kiện**, bằng `infra/nguoi-nhan.ts`: vai trò nào của bản cũ mà người giữ nó
không nằm trong bốn người của bản mới. `notification` không lọc được — nó xử lý từng sự kiện độc
lập, không có cách nào biết hai sự kiện vừa ghi cùng transaction sẽ tới cùng một hộp thư.

Kết quả: **thường là rỗng, và rỗng mới là bình thường.** Lá thư sinh ra cho đúng ca hiếm mà nó có
ích — người đã ký bản cũ nhưng không tham gia bản mới. Có một ca kiểm thử riêng khẳng định trường
hợp thường gặp **không** sinh thêm thư nào.

#### Đường ngừng hợp tác

Một sự kiện thư cho **mỗi hồ sơ**, thêm bên cạnh sự kiện tổng kết chứ không thay nó: lá thư phải nói
về một hồ sơ cụ thể — mã hồ sơ, liên kết mở nó, bốn người của riêng nó — còn sự kiện tổng kết là vết
của một thao tác trên KHÁCH HÀNG, và nhật ký kiểm toán cần đúng câu đó.

Mã và tên khách hàng do **customer đưa sang** trong thân request. `policy` không đọc được schema
`cus`, mà gọi ngược lại `customer` để hỏi thì tệ hơn hẳn: `customer` đang chờ lời gọi này trả lời,
nên đó là vòng gọi lồng nhau — với một pool kết nối nhỏ nó khoá chết cả hai. Bên kia vốn đã đọc sẵn
dòng khách hàng trước khi gọi sang.

Trừ người vừa bấm nút: chỉ TDV phụ trách bấm được *Ngừng hợp tác*, và họ vừa nhìn thấy kết quả trên
màn hình.

### Một sửa lộ ra trong lúc viết test

`notification.test.ts` dựng policy bằng `createTestApp()` — **không nghe cổng nào**. Ca ngừng hợp
tác đi customer → policy bằng HTTP, và `POLICY_URL` mặc định trỏ vào một container không có ở đó.
Đổi sang `bootPolicyListening()` để sự kiện thư rơi vào **cùng một** `pol.outbox` mà `pumpOnce()`
đang bơm.

### Kiểm chứng

Ba ca mới ở `notification.test.ts` (bản cũ khác người → có thư; bản cũ cùng người → **không** thư
nào; ngừng hợp tác → ba người còn lại), hai nhóm khẳng định mới ở `sla.test.ts` cho M-01 và M-03,
và hai vế của việc bỏ số bước ở cả hai tệp. **1158/1158 xanh.**

### Sáu điểm còn lại — đã duyệt, giữ nguyên (19/08)

Khách hàng xem xong và chốt **không sửa** sáu điểm còn mở. Ghi lại thành quyết định chứ không để
chúng lơ lửng như câu hỏi chưa trả lời — ba tháng nữa đọc lại sẽ tưởng là việc bỏ quên:

| Mã | Quyết định |
|---|---|
| M-02 | Tiêu đề thư **không** thêm mã hồ sơ. Tên khách hàng là thứ người nhận nhận ra nhanh hơn một dãy mã, và mã hồ sơ đã nằm ở dòng thứ ba của thân thư. |
| M-04 | TDV **không** nhận thư xác nhận khi gửi duyệt — họ vừa thấy kết quả trên màn hình. |
| M-05 | Thư nhắc trước hạn **chỉ** tới người đang phải xử lý, không kèm TDV. |
| M-06 | Ban lãnh đạo và Quản trị **không** nhận thư nào — họ theo dõi trên màn hình. |
| M-07 | Xoá hồ sơ vẫn báo cả TBP lẫn Kế toán, kể cả khi Kế toán chưa chạm vào hồ sơ. Thà báo thừa. |
| M-09 | Thư *để biết* vẫn gửi ở **mọi** bước, không chặn trần theo mốc lớn. |

Toàn bộ mười điểm của bản rà soát luồng email đã đóng. Không còn điểm nào chờ trả lời.

## P78 — N-05: tìm và lọc chuyển hẳn sang máy chủ

Khách hàng cụ thể hoá yêu cầu, và cụ thể hoá theo hướng **đơn giản hơn** hẳn bản tôi đề xuất:

| Màn hình | Chốt |
|---|---|
| Sản phẩm | Ô tìm chỉ khớp **tên**, nhãn nói đúng điều đó; thêm **ô chọn nhóm sản phẩm** bên cạnh |
| Người dùng | Chỉ tìm theo **họ tên** |
| Chiết khấu | **Bỏ hẳn ô gõ tự do**, thay bằng hai ô chọn: nhóm sản phẩm · loại khách hàng |

Chốt thứ ba gỡ đúng mảnh khó nhất. Ô tìm cũ của Chiết khấu khớp trên bốn thứ, trong đó **hai thứ là
chuỗi do giao diện dựng ra** — câu mô tả phạm vi và con số phần trăm đang hiển thị. Không có cột nào
mang chúng, nên đưa xuống SQL là phải dựng lại cả hai bằng join và phép định dạng. Hai ô chọn hợp
với dữ liệu hơn hẳn: cả hai chiều đều là **tập giá trị đóng**, người dùng chọn từ danh sách chứ
không phải nhớ để gõ đúng.

### Bỏ dấu ở phía SQL, và vì sao không dùng `unaccent`

`ILIKE '%sua%'` không ra "Sữa". Extension `unaccent` thì **không bỏ được dấu chữ đ** — `đ` là ký tự
Unicode độc lập U+0111, `normalize(..., NFD)` không tách ra được. Người gõ "Da Nang" không tìm thấy
"Đà Nẵng", còn mọi chuỗi khác vẫn tìm được nên không ai nghi ngờ gì. `reporting/normalize.ts` đã ghi
đúng lý do ấy từ lâu và tự viết `norm()`.

Nên `0049` đưa cùng phép chuẩn hoá xuống SQL: `sys.khong_dau()`, cộng **cột sinh** `name_norm` và
`full_name_norm` với index GIN trigram.

**Cột sinh chứ không index biểu thức**: index biểu thức bắt câu lệnh nhắc lại nguyên văn biểu thức,
lệch một ký tự là Postgres bỏ index và quay về quét toàn bảng — không lỗi, chỉ chậm dần. Repo đã
dính đúng bẫy ấy một lần, ghi ở `customers.service.ts`.

### Ca kiểm thử đối chiếu bắt lỗi ngay lượt chạy đầu

Phép chuẩn hoá giờ có **hai bản cài đặt** và không tránh được — một ở TypeScript cho từ khoá, một ở
SQL cho cột sinh. Ca `0049` ở `tests/db/constraints.test.ts` chạy mười chuỗi tiếng Việt qua cả hai
và so mảng.

Nó đỏ ngay: `norm()` **gộp khoảng trắng và cắt lề**, hàm SQL bản đầu thì không. Hậu quả nếu lọt: một
sản phẩm lỡ gõ hai dấu cách lưu cột chuẩn hoá hai dấu cách, người dùng gõ một dấu cách thì mẫu tìm
có một — **không khớp, không lỗi, người dùng kết luận sản phẩm không tồn tại**. Đúng loại hỏng mà ca
này sinh ra để bắt, và nó bắt được ở lượt chạy đầu tiên.

### Ba thứ lộ ra khi sửa

**Màn hình Chiết khấu hỏng với năm trên sáu vai trò.** `TrangChietKhau` gọi `useNhom(quanTri)` —
hook không tải gì khi không phải Quản trị — rồi `if (!nhom) return <DangTai />`. Vòng quay chờ
**vĩnh viễn**. Không ca kiểm thử nào bắt được vì phần này chưa từng được vẽ ra thật; đúng thứ món nợ
*chưa có test trình duyệt* đã hứa sẽ có. Sửa kèm, vì `0049` cần nhóm sản phẩm cho mọi vai trò.

**`locTbp` và hai prop `ds` đã chết từ `0031`.** Chú thích ở màn hình Người dùng viện đúng chúng làm
lý do không được cắt trang ở máy chủ. Gỡ cả ba — để lại là người đọc sau tin rằng ràng buộc vẫn còn.

**Một `<th>` mồ côi**: bảng người dùng khai sáu cột tiêu đề, thân bảng chỉ vẽ năm ô. Cột *Trưởng bộ
phận quản lý* rụng nội dung từ `0031` mà tiêu đề nằm lại.

### Bẫy đã dính, ghi để lần sau khỏi mất thì giờ

- **Sửa file migration sau khi nó đã áp dụng** → `migrate` từ chối vì checksum lệch, và triệu chứng
  là cả bộ test không khởi động được. Migration này chưa phát hành nên gỡ dòng sổ rồi chạy lại; file
  viết idempotent (`DROP COLUMN IF EXISTS` rồi `ADD`) nên chạy lại luôn cho ra giá trị khớp hàm
  hiện hành.
- **Backtick trong SQL comment nằm trong template literal** làm gãy biên dịch. Lần thứ hai dính.
- **`uq_rule_pham_vi` là UNIQUE với `NULLS NOT DISTINCT`** — mỗi ngày hiệu lực chỉ tồn tại ĐÚNG MỘT
  quy định "mọi nhóm · mọi loại". Ca kiểm thử dựng hai dòng như vậy nhận 409. Nguy hơn: một dòng như
  thế khớp **mọi sản phẩm**, nên nó đổi kết quả các ca tra ngưỡng ở phía trên tệp — và vì dữ liệu
  test không dọn giữa các lượt, nó đổi cả **lượt chạy sau**. Ca duy nhất cần nó tự dọn bằng `finally`.
- **Tiền đề của một ca kiểm thử sai, không phải mã sai**: `q=duong` khớp cả "dinh dưỡng", vì "dưỡng"
  cũng chuẩn hoá thành "duong". Phải gõ đủ cụm mới tách được nhánh đ→d khỏi nhánh bỏ dấu thường.

### Cố ý KHÔNG làm

Ô chọn sản phẩm trong màn hình lập/sửa hồ sơ vẫn chặn ở 200 dòng. Muc 11.3 miễn phân trang cho ô
chọn, và cách đúng cho nó là tìm-theo-phím-gõ kèm câu "còn N kết quả nữa" chứ không phải phân trang
— một việc khác, không nằm trong yêu cầu lượt này.

### Kiểm chứng

`0049` một migration; `?q=` và `?groupCode=` cho sản phẩm, hai ô chọn cho chiết khấu, `?q=` cho
người dùng; bốn màn hình đổi sang `useTrangMay`. Test mới: 9 ca sản phẩm và 7 ca chiết khấu ở
`catalog.test.ts`, 6 ca người dùng ở `onboarding.test.ts`, 3 ca đối chiếu TS↔SQL ở
`constraints.test.ts`, 10 ca hai ô chọn ở `bang-chiet-khau.test.tsx`. Hai khối test cũ của
`locSanPham`/`locQuyDinh` gỡ theo chính hai hàm ấy. **1177/1177 xanh.**

## P79–P81 — Bản scan, xem tệp trực tiếp, và vết tải xuống (N-01, N-02)

Bốn yêu cầu của khách hàng, chia làm ba đợt vì chúng chồng lên nhau: đợt sau dùng lại thứ đợt trước
dựng ra.

### P79 — Yêu cầu in lại KHÔNG còn xoá bản scan

Luật cũ (muc 10): kế toán bấm *yêu cầu in lại* thì bản scan biến mất khỏi cả `pol` lẫn kho lưu trữ.
Khách hàng đảo ngược, và **lý do của họ đứng vững hơn luật cũ**: kế toán chê bản **giấy**, mà nhiều
khi chỉ so với bản scan đang có mới thấy hỏng ở đâu. Xoá ngay là lấy mất vật đối chiếu của đúng
người sắp phải sửa.

Gỡ theo: sự kiện `policy.scan_discarded`, `ScanDiscardConsumer`, binding của nó, và
`FilesService.discardByObjectKey`. Đường vào `discard()` giờ chỉ còn một — `DELETE /files/:id` do
người dùng bấm.

**Khe mở ra, và cách bịt.** Hồ sơ quay về `SA_DANG_XU_LY` mà WF-14 chỉ đòi CÓ bản scan, nên bấm bàn
giao ngay là gửi lại đúng bản vừa bị chê. Thêm cờ `banScanCu` + khối cảnh báo: **nói ra, không
chặn** — chặn là đi ngược yêu cầu "Sale Admin chủ động", và có lần bản giấy hỏng lúc chuyển phát chứ
không phải bản in sai.

Cờ suy từ **mốc tải lên so với lần yêu cầu in lại gần nhất**, không phải một cờ lưu trên hồ sơ: cờ
lưu thì phải nhớ xoá đúng lúc Sale Admin tải bản mới, và quên xoá là cảnh báo dính vĩnh viễn.

### P80 — Xem tệp trong phần mềm (N-02)

Hộp `XemTep` dùng chung. Mảnh quan trọng nhất đã có sẵn từ `0031`: `xemTruoc()` tải nội dung qua
`goi()` rồi dựng `blob:` URL. Nhúng thẳng `<iframe src="/api/...">` là **401** — thẻ ấy không gửi
header `Authorization`, đúng lỗi mà nút *Xuất hợp đồng* từng mắc với `<a href>`.

- PDF → `<iframe>`, ảnh → `<img>`, kiểu khác → **nói thẳng** là không xem trực tiếp được. Word trong
  iframe cho ra trang trắng hoặc âm thầm kích hoạt tải xuống; cả hai tệ hơn một câu nói rõ.
- Nút **Đóng** luôn hiện, kể cả lúc đang tải và lúc lỗi (muc 11.1). `HopThoai` chỉ đóng bằng Escape
  và bấm ra ngoài — hai đường không ai nhìn thấy.
- `blob:` thu hồi ở nhánh dọn của `useEffect`: mở vài chục bản scan trong một phiên mà không thu hồi
  là vài trăm MB nằm lại trong bộ nhớ tab.
- Nút *Xem hợp đồng* theo **đúng cổng quyền** của nút *Xuất hợp đồng* (FE-24). Không thì nó thành
  một đường vòng quanh phép kiểm đó.

### P81 — Ai đã tải bản mềm, ai đã tải hợp đồng (N-01)

Gộp hai việc vào một đường nội bộ `POST /internal/policies/:id/da-sinh-van-ban`, vì chúng luôn xảy
ra cùng lúc: đóng dấu lần xuất hợp đồng, và ghi một dòng *Lịch sử*.

**Hai cờ tách rời, và tách là có chủ ý:**

| | Xem (`xem=1`) | Tải |
|---|---|---|
| Dòng Lịch sử | không | **có** |
| Dấu đã xuất hợp đồng | **có** | có |

Xem không ghi vì một dòng cho mỗi lần liếc màn hình sẽ dìm chết những dòng nói về bước duyệt — thứ
mà lịch sử sinh ra để kể. Dấu xuất hợp đồng thì đóng ở cả hai đường: xem hay tải thì máy chủ đều đã
trộn xong bản đầy đủ và đưa tới mắt người ấy, và câu hỏi của muc 8.3 là *"hồ sơ này đã có hợp đồng
chưa"*, không phải *"ai giữ file"*.

**Mặc định là TẢI, không phải xem.** Đặt ngược lại thì mọi lời gọi quên đặt cờ đều lọt qua không để
lại vết, và cái lọt ấy im lặng; theo chiều này thì quên cờ chỉ làm dư một dòng — nhìn thấy được.

Kèm một lỗ suýt lọt: nút *Tải xuống* **bên trong** hộp xem lúc đầu dùng lại chính đường có `xem=1`,
tức là một lối tải không để lại vết nào — đúng cái lỗ N-01 sinh ra để bịt. Thêm prop `duongTai`.

### Lỗi tương tranh mà bộ test bắt được

`DOC-20` (năm lượt render song song) đỏ với **500**. `coalesce(max(seq), 0) + 1` viết ngay trong câu
INSERT nhìn như đã đủ an toàn, nhưng `max(seq)` **chỉ thấy dòng đã COMMIT**: năm lượt song song đọc
ra cùng một con số và bốn lượt vỡ ở `UNIQUE (policy_id, seq)`.

Sửa bằng `SELECT … FOR UPDATE` trên dòng hồ sơ trong cùng transaction. Không dùng vòng thử lại: nó
biến một phép xếp hàng tất định thành phép may rủi, và với năm lượt cùng lúc thì lượt cuối phải thử
năm lần. Khoá giữ trong đúng một lệnh INSERT — phần chậm (Gotenberg dựng PDF) đã xong từ trước.

Thêm một ca riêng khẳng định năm lượt song song ra đủ **năm dòng `seq` liên tiếp**, vì "không lỗi
500" chưa đủ: nuốt mất một dòng cũng là hỏng, mà nó im lặng.

### Còn nợ sau ba đợt

- ~~Xem tệp chưa ghi vết~~ — **khách hàng bỏ hẳn yêu cầu ấy ngày 19/08**, không phải hoãn. Muc 10
  và muc 9.2 đã sửa theo: bỏ *"xem file"* khỏi danh sách phải lưu, và bỏ *"số lần xem"* khỏi báo cáo
  nhật ký người dùng — hệ quả trực tiếp, vì không chỗ nào ghi lượt xem thì một cột đếm lượt xem
  vĩnh viễn bằng không.
- ~~Tải tệp đính kèm chưa ghi vết~~ — **làm nốt ở `0053`** theo yêu cầu khách hàng. Mọi lượt tải
  tệp thuộc hồ sơ đều vào Lịch sử, hai nhãn tách nhau: *Tải bản scan bản cứng* (`purpose = SCAN`) và
  *Tải tệp đính kèm*. Tách vì bản scan là bản mang chữ ký khách hàng — đúng tệp mà câu "ai đã tải nó
  về" có giá trị nhất.

  Ba chi tiết đáng ghi:
  - Chỉ tệp `owner_kind = POLICY`. Tệp của khách hàng và mẫu hợp đồng không có màn hình lịch sử nào
    để ghi vào; có một ca kiểm thử giữ phép lọc ấy khỏi bị nới thành "mọi tệp", vốn sẽ đâm vào một
    `owner_id` không phải id hồ sơ.
  - Ghi **trước** khi trả nội dung, ngược với hai đường kia. Bản CSBH và hợp đồng ghi sau vì phần
    đắt nhất là dựng PDF và nó hỏng được; ở đây nội dung đã nằm sẵn trong tay.
  - Bảng tra `HANH_DONG_TAI` thay cho chuỗi `?:`: bốn loại rồi, và thêm loại thứ năm mà quên sửa
    nhánh cuối thì nó âm thầm rơi vào nhãn của loại khác — một dòng lịch sử SAI tệ hơn không có dòng.

  **N-01 đóng hoàn toàn.**
- Hồ sơ pháp lý của khách hàng (`HoSoPhapLy`) vẫn chỉ có nút tải — chưa nối hộp xem vào, vì yêu cầu
  chỉ nêu bản scan, hồ sơ và hợp đồng.
- Ba đợt này **chưa mở lần nào trong trình duyệt thật** (N-08). Hộp xem là màn hình đầu tiên của
  phần mềm có `<iframe>` chiếm gần hết chiều cao — đúng loại bố cục mà test cấu trúc không nói được
  gì về nó.

**1208/1208 xanh.**

## P83–P85 — Xem bản mềm, và mẫu hồ sơ CSBH do Quản trị soạn

Ba yêu cầu, và yêu cầu thứ ba hoá ra là một hạng mục mà bản yêu cầu đã ghi "chưa làm" từ 15/08.

### P83 — Đổi nhãn, và dồn ba nút thành một

*Tệp đính kèm* → **Bản cứng**, *Tải văn bản* → **Xem bản mềm**. Tên cũ tả cơ chế, tên mới tả thứ
người dùng nhìn thấy — và cặp *mềm · cứng* nói ngay ra hai thứ khác nhau ở chỗ nào.

Ba nút của bản CSBH dồn thành **một nút ở góc trên bên phải**. Hộp thoại hỏi khổ giấy trước rồi mới
hiện nội dung, và đảo thứ tự ấy là cả điểm: bản cũ bắt chọn khổ **trước khi** nhìn thấy nội dung,
trong khi chính nội dung mới nói được khổ nào vừa. Hộp gợi ý khổ theo số dòng sản phẩm.

Nhóm nút ở tiêu đề **bỏ điều kiện `thaoTac.length > 0`** — trước đó vai trò chỉ-đọc không thấy nút
nào. Ca kiểm thử cũ khẳng định nhóm nút biến mất; giờ nó khẳng định nhóm chỉ chứa đúng nút xem,
không lọt nút ghi nào.

### P84–P85 — Bản mềm sinh từ mẫu

Muc 6.4 để ngỏ đúng một câu khi chốt rằng bản A4 chưa nhận mẫu tải lên: *"nếu mẫu do người dùng
soạn, hệ thống không còn bảo đảm được 13 mục kia có mặt"*. Câu trả lời là **kiểm lúc PHÁT HÀNH** —
báo cho người sửa được, ở màn hình họ đang đứng, chứ không báo lúc kế toán mở bản A4.

**Ba quyết định định hình cả thiết kế:**

| | Quyết định | Vì sao |
|---|---|---|
| Bảng mẫu | Dùng lại `doc.contract_template`, thêm `kind` | Hai bảng song sinh là hai chỗ phải sửa mỗi lần đổi cơ chế, và cái thứ hai luôn là cái bị quên |
| Khổ giấy | Mỗi khổ MỘT mẫu | `.docx` tự mang khổ của nó, không xoay được lúc trộn — nên "mẫu **phù hợp**" nghĩa là đúng khổ |
| Bảng sản phẩm | Hệ thống dựng, mẫu chỉ đặt `{{policy.lines_table}}` | Muc 7.1 đòi số cột CPBH bằng dòng nhiều khoản nhất, mà mỗi dòng nhận tới 50 khoản; bảng vẽ sẵn trong Word có số cột cố định |

Ranh giới của quyết định thứ ba rơi đúng chỗ: người soạn mẫu nắm phần chữ, đầu trang, khối công ty
và chỗ ký; hệ thống giữ bảo đảm về **bảng số** — thứ mà người ký đặt bút xuống dưới.

### Bốn thứ lộ ra khi làm, cả bốn đều im lặng

- **Index "đang dùng" cũ cho đúng MỘT mẫu trong toàn bảng.** Giữ nguyên thì Quản trị phát hành mẫu
  hồ sơ là kế toán mất khả năng xuất hợp đồng ngay lúc ấy — một hệ quả không đường nào đoán ra. Tách
  theo `(kind, paper_size)`, và tách thành HAI index vì `coalesce(paper_size::text, '-')` bị Postgres
  từ chối: phép ép enum sang text không IMMUTABLE.
- **`makeDocx` không khai khổ giấy**, nên mẫu khổ ngang ra trang dọc. `w:orient` không đủ một mình —
  LibreOffice vẫn lấy kích thước từ `w:w`/`w:h`, phải đảo cả hai số.
- **Ô bảng rộng 1800 twip cố định.** Với bảng bốn cột của hợp đồng thì vừa; với bảng sản phẩm 12 cột
  thì gấp đôi bề rộng khổ A4 dọc, và cột bên phải chạy ra ngoài mép giấy. Cột biến mất đầu tiên là
  *Ghi chú*. Đổi sang tự co theo bề rộng trang.
- **Hàng tiêu đề không lặp lại qua trang** — `w:tblHeader` là bản Word của
  `thead { display: table-header-group }`. Hồ sơ 60 dòng tràn sáu trang, và từ trang 2 người đọc
  nhìn một bảng số không có tên cột.

### `format=html` gỡ hẳn

Nó từng trả về chính chuỗi HTML mà PDF được dựng từ đó — cách bảo đảm *"file tải về khớp bản đang
xem"* bằng cấu trúc. Từ `0055` bản mềm sinh từ `.docx` nên không còn bản HTML nào, và lời bảo đảm ấy
đúng theo cách mạnh hơn: **chỉ còn một đường dựng**. `sheetHtml` ở lại, chỉ phục vụ bản lưu ký số —
bản ấy cần khối "ĐÃ KÝ SỐ" và cần khác bản nháp từng byte (DOC-05).

### Một ca kiểm thử tự làm hỏng lượt chạy sau

Ca *"sửa mẫu thì bản mềm đổi theo"* phát hành một mẫu mới, và mẫu đang dùng là trạng thái **toàn
cục**. Dữ liệu test không dọn giữa các lượt, nên nó để lại một mẫu cụt cho mọi ca sau — và ca "seed
sẵn mỗi khổ một mẫu" đỏ ở **lượt chạy thứ hai**, không phải lượt đầu. Trả nguyên trạng bằng `finally`.

### Màn hình

*Giấy tờ mẫu* dùng lại nguyên thành phần của *Mẫu hợp đồng*, tham số hoá theo loại: cùng cơ chế —
tải `.docx`, đọc ô trống, ánh xạ, ban hành — chỉ khác chủ sở hữu, đường API và cách nói. Chép thành
hai màn hình 560 dòng là hai chỗ phải sửa mỗi lần đổi cơ chế.

**1231/1231 xanh.**

## P86–P87 — Khoá tiếng Việt, bảng A4 đổi cột, trang thêm mẫu

Ba câu hỏi đặt ra ở bản thiết kế 19/08 đều được chốt, và cả ba đều chọn vế tốn công hơn.

### C-01 — khoá tiếng Việt cho CẢ HAI loại mẫu

`{{customer.name}}` → `{{ho_so.ten_khach_hang}}`. **Một nhóm `ho_so.` cho tất cả**, kể cả thông tin
khách hàng và người xử lý: người soạn mẫu nghĩ theo câu hỏi *"trong hồ sơ này có gì"*, không nghĩ
theo lược đồ CSDL. `cong_ty.` đứng riêng vì nó không thuộc hồ sơ.

**Đổi tên, không thêm bí danh.** Giữ cả hai cách gọi nghĩa là hai bảng khoá cùng đúng, và người soạn
mẫu thứ hai sẽ chép nhầm bảng của người thứ nhất — rồi hỏi vì sao mẫu của mình không ánh xạ được.

Migration `0051` đổi tên nguồn tại chỗ cho mẫu đã tải lên. `placeholder` thì KHÔNG đổi được — nó là
chuỗi nằm trong chính file `.docx`, và phần mềm không sửa file người dùng. Nên tên ô và tên nguồn
hơi lệch nhau ở những mẫu cũ; đó là cái giá rẻ nhất, vì cách duy nhất để chúng khớp lại là bắt Sale
Admin soạn lại mọi mẫu. Mẫu **mặc định** thì xoá hẳn để `ensureDefault` dựng lại với ô trống tiếng
Việt — nó do hệ thống sinh ra nên không có gì để mất.

### C-02 — bỏ hẳn cột *Ngưỡng*

Bảng A4 giờ: STT · Mã sản phẩm · Tên sản phẩm · Giá công ty · Giá bán buôn · **CPBH tổng** ·
CPBH1…CPBHn · Giá thu về · Tỷ lệ CK · Ghi chú.

Đã nêu hệ quả trước khi làm và khách hàng chấp nhận: bản giấy không còn nói mức chiết khấu tối đa
cho phép, nên **hồ sơ vượt ngưỡng và hồ sơ đúng ngưỡng trông giống hệt nhau trên giấy**.

**Ghi chú tự xuống dòng** đòi đổi bố cục bảng sang bề rộng CỐ ĐỊNH theo trọng số từng cột. Để
`autofit` thì LibreOffice nong cột ra theo nội dung — một ghi chú dài đẩy cả bảng ra ngoài mép giấy,
và cột cuối cùng biến mất khỏi bản in mà không báo gì. Mẫu hợp đồng vẫn `autofit`: bảng bốn cột chữ
ngắn, tự co đọc đẹp hơn.

### Khoá mới `{{ho_so.chu_ky_so_TBP}}`

Khối hai dòng: *TBP đã ký số* và ngày ký. `setParagraphText` đã đổi `\n` thành `<w:br/>` từ trước
nên không phải thêm gì.

**Chưa ký thì trả về RỖNG**, không phải chữ "chưa ký": một khối chữ ký trên văn bản chưa ai ký là
một tuyên bố sai, và bản CSBH ở trạng thái Nháp vẫn xem được nên tình huống này xảy ra hằng ngày.

Khoá này làm lộ một lỗi im lặng: `PLACEHOLDER_RE` chỉ nhận **chữ thường**, nên `TBP` viết hoa lọt
qua không khớp — `placeholdersOf` không thấy nó, bảng ánh xạ không có dòng ấy, và bản in mang nguyên
chuỗi `{{...}}`.

### C-03 — trang riêng, hướng dẫn nằm ngay trên trang

Hộp thoại ba ô đổi thành một trang: biểu mẫu bên trái, danh sách khoá bên phải, **bấm một khoá là
chép**. Hộp thoại cũ gỡ hẳn — mẫu hợp đồng cũng dùng trang này, nên chỉ còn MỘT đường tải mẫu lên.

Ca kiểm thử đáng giá nhất là phép **đối chiếu hai phía**: bảng hướng dẫn phải liệt kê đúng những
khoá máy chủ nhận. Thiếu một khoá thì người soạn mẫu không biết nó tồn tại; thừa một khoá thì họ gõ
vào file, ánh xạ không được, và thông báo lỗi nói *"không có trường nguồn"* về đúng thứ phần mềm vừa
mời họ dùng.

### Hai bẫy môi trường

- **Container `document` đang chạy mã cũ** vẫn seed mẫu mặc định lúc khởi động, bằng khoá cũ. Bộ
  test dựng app trong tiến trình nên nó thấy "đã có mẫu" và bỏ qua — bản mềm ra thiếu bảng, và triệu
  chứng là ba ca đỏ chẳng liên quan gì tới nhau. Xoá mẫu mặc định rồi chạy lại là xong.
- **`userEvent.setup()` tự cài clipboard giả của riêng nó** lên `navigator`, đè mất bản giả của ca
  kiểm thử. Dùng `fireEvent` cho ca chép khoá.

**1241/1241 xanh.**

## P88 — Bộ mẫu hồ sơ soạn sẵn trong `templates/`

Trang thêm mẫu ở P87 đã trả lời câu *"gõ khoá nào vào đâu"*. Còn một câu nữa nó không trả lời được:
**trang giấy trắng**. Quản trị mở Word ra, biết đủ hai mươi khoá, và vẫn phải tự bày ra một bố cục
hồ sơ CSBH trông thế nào — thứ mà chính họ chưa từng thấy bao giờ.

Nên bàn giao kèm **ba file `.docx` thật**, nằm trong `templates/` ở gốc bộ mã:

| File | Khổ | Vai trò |
|---|---|---|
| `mau-ho-so-a4-doc.docx` | A4 dọc | Bố cục đầy đủ — mọi khoá, cả khối duyệt |
| `mau-ho-so-a4-ngang.docx` | A4 ngang | Cùng bố cục, cho hồ sơ nhiều cột CPBH |
| `mau-ho-so-a4-doc-rut-gon.docx` | A4 dọc | **Đúng 13 mục bắt buộc, không hơn** |

Bản rút gọn không phải để dùng thẳng. Nó trả lời bằng chính nó câu hỏi *"ít nhất phải có gì thì mới
ban hành được"* — mở file ra là thấy đáp án, thay vì đọc một danh sách trong tài liệu rồi đối chiếu
bằng mắt.

### Vì sao là FILE trong repo, không phải dựng lúc chạy

Hai lý do, cái thứ hai mới là cái quyết định:

- Quản trị **tải về sửa được**. Sửa câu chữ trên một mẫu có sẵn không cần nhớ khoá nào cả.
- Chúng là **đầu vào của `make demo-mau`**. Bản demo vì thế chạy đúng thứ người dùng thật sẽ dùng,
  không phải một bố cục chỉ tồn tại trong mã seed. Bố cục hỏng thì hỏng ở nơi có người nhìn thấy.

Sinh lại bằng `scripts/tao-mau-ho-so.ts`, dùng chính `makeDocx`/`para` của service `document` — nên
file mẫu và bộ trộn không bao giờ lệch nhau về cách dựng OOXML.

### `namMauHoSo()` trong seed demo

Nạp theo đúng đường người dùng đi, không cắm thẳng vào CSDL: tải file lên `/policy-templates` với tư
cách `admin01` → đọc `/placeholders` → **suy ánh xạ từ chính tên ô trống** → ban hành. Đường tắt qua
`INSERT` sẽ bỏ qua đúng những phép kiểm mà bản demo có nghĩa vụ chứng minh là chạy được.

Hai mẫu đầy đủ được ban hành; bản rút gọn để **chưa ban hành** — mỗi khổ chỉ một mẫu hiệu lực, và
đây cũng là cách bản demo có sẵn một mẫu ở trạng thái nháp để xem.

### Một lỗi cũ lộ ra khi làm

Bản demo **chưa từng ban hành mẫu hợp đồng nào**: seed tải file lên rồi dừng, không ánh xạ, không
phát hành. Nghĩa là mọi lần bấm *Xuất hợp đồng* trên chồng demo đều trả 409 — từ lâu, và không ai
bắt được vì bộ test dùng mẫu riêng của nó. Sửa luôn trong lượt này.

### Ca canh giữ

File `.docx` là **binary trong git**. Một lượt commit hỏng, hay một trình soạn thảo lỡ mở ra rồi lưu
lại dạng text, biến chúng thành file mà máy chủ từ chối ở bước tải lên — và triệu chứng chỉ hiện ra
lúc ai đó chạy `make demo-mau`. Bốn ca ở `contract.test.ts` canh chỗ đó:

- Bốn byte đầu phải là `PK\x03\x04`.
- Mọi ô trống trong cả ba file phải là một khoá máy chủ **nhận** — một ô lạ là một mẫu không ban
  hành được.
- Bản rút gọn phải có **đủ 13 mục bắt buộc**. Nó mà thiếu một mục thì chính nó là câu trả lời sai.
- Mẫu ngang phải khai khổ ngang **cả bằng `w:orient` lẫn bằng `w:w`/`w:h`**. Thiếu một trong hai thì
  LibreOffice vẫn in ra dọc — đúng lỗi đã gặp ở P86.

`.gitignore` gốc chặn `*.docx` (ba tài liệu nguồn của khách hàng), nên phải thêm ngoại lệ
`!impl/templates/*.docx`. Không có nó thì thư mục trông như đã commit mà máy khác clone về lại trống.

**1245/1245 xanh.**

## P89 — Chọn MẪU thay vì chọn khổ giấy

Khách hàng chốt sáu điểm ngày 20/08. Năm điểm là gỡ bỏ, một điểm là làm thật — và điểm ấy đổi một
giả định nằm sâu trong lược đồ từ `0050`.

### Câu hỏi sai đã hỏi suốt ba chặng

Hộp *Xem bản mềm* hỏi **khổ giấy**. Nó hỏi thế vì lược đồ được dựng quanh câu hỏi ấy: mỗi khổ một
mẫu, tra mẫu theo khổ, và "chưa có văn bản mẫu phù hợp" nghĩa là *chưa có mẫu đúng khổ đang xem*.

Nhưng khổ giấy chưa bao giờ là thứ người dùng muốn chọn. Họ muốn chọn **bản trình bày** — và khổ
giấy chỉ là một thuộc tính của bản trình bày ấy, nằm sẵn trong file `.docx` do Quản trị soạn. Hỏi
khổ giấy là bắt người dùng ghép hai mảnh mà phần mềm ghép được.

Từ `0058`: ô chọn liệt kê **mẫu đang dùng**, mẫu đầu danh sách mở sẵn, đổi mẫu là xem lại ngay. Cùng
một hộp dùng cho cả hồ sơ lẫn hợp đồng.

### Ba thứ ở tầng dưới phải đổi theo

**Bỏ hai partial unique index.** `0050` giữ đúng MỘT mẫu đang dùng cho mỗi (loại × khổ) — luật đúng
khi hệ thống tự tra mẫu, vì hai mẫu cùng đang dùng thì `LIMIT 1` chọn bừa một cái. Giờ người dùng
chọn, nên nhiều mẫu cùng dùng được **không còn là mập mờ — nó LÀ cái danh sách**. Giữ index lại thì
ban hành mẫu thứ hai lặng lẽ hạ mẫu thứ nhất, và Quản trị không bao giờ có nổi hai mẫu để chọn.

Nghĩa của hai nút đổi theo, và đây là chỗ dễ quên nhất: *Ban hành* từ "đặt làm mẫu duy nhất" thành
"đưa vào danh sách chọn"; *Ngừng dùng* từ "bỏ trống chỗ ấy" thành "rút khỏi danh sách". Câu chữ hộp
xác nhận viết lại hẳn, và **bắt gõ lại tên mẫu chỉ còn khi rút mẫu CUỐI CÙNG** — thao tác không lùi
được duy nhất còn lại.

**Khổ giấy đọc từ file, không hỏi người tải lên.** Ô ấy từng bắt buộc vì nó là khoá tra mẫu. Giờ nó
chỉ còn là cái nhãn cạnh tên mẫu — và *một ô nhập tay không còn hậu quả gì là một ô sẽ nói dối*:
Quản trị tải file ngang lên rồi chọn nhầm "A4 dọc", không gì trên đời phát hiện ra. `khoGiayCua()`
đọc `w:orient` từ chính file, cho cả hai loại mẫu.

**Mẫu mở sẵn phải là một câu trả lời xác định.** Thứ tự danh sách là
`is_default ASC, published_at DESC, paper_size, id`. `is_default` xếp **sau cùng**, không phải
trước: mẫu mặc định là bản sơ sài hệ thống tự seed để chạy được từ phút đầu, nên ngày Quản trị ban
hành một mẫu thật thì mẫu thật phải là cái mở ra sẵn.

Hai mẫu mặc định A4 dọc và ngang trước đây seed trong **hai giao dịch riêng**, chênh nhau vài mili
giây — vô hại khi mẫu tra theo khổ, nhưng từ `0058` nó quyết định mẫu nào mở sẵn, và cái seed sau
(khổ ngang) luôn thắng. Sửa hai đầu: `ensureDefault` seed cả hai trong **một** giao dịch để
`published_at` bằng nhau, và migration hoà lại mốc của những cài đặt đã chạy.

### Cái giá phải trả: trạng thái mẫu là TOÀN CỤC

Phần khó nhất của lượt này không phải viết mã mà là **dọn sau các ca kiểm thử**. Trước đây phát hành
tự hạ mẫu cũ, nên một ca ban hành mẫu riêng của nó cũng tự dọn hộ. Giờ không còn thế, và các tệp
kiểm thử dùng chung một CSDL.

Ba lần đỏ, lần nào triệu chứng cũng ở nơi khác hẳn nguyên nhân:

- `DOC-20` đỏ với *"expected 842 to be 595"* — bản mềm mặc định bỗng ra khổ ngang, vì một ca ở tệp
  khác mượn tạm mẫu ngang rồi phát hành lại.
- `DOC-02`/`DOC-03` đỏ vì bản mềm mặc định thiếu tiêu đề — một mẫu cụt của ca khác đang đứng đầu.
- *"seed sẵn mỗi khổ một mẫu"* đỏ ở **lượt chạy thứ hai** chứ không phải lượt đầu.

Ba cách chữa, và cả ba đều là quy tắc chứ không phải vá:

1. Ca nào khẳng định về **nội dung** bản mềm thì gọi kèm `mauId`, không dựa vào mẫu mở sẵn.
2. Ca nào ban hành mẫu thì `finally` phải **gỡ nó xuống**, và hoà lại mốc của hai mẫu mặc định.
3. Ca "không chọn mẫu" so với **đầu danh sách**, không so với một khổ giấy cố định — *"mẫu mở sẵn là
   mẫu đứng đầu ô chọn"* mới là bất biến thật.

### Năm điểm gỡ bỏ

| Mã | Chốt |
|---|---|
| **N-04** QĐCK trên bản A4 | Bỏ. Cột *Ngưỡng* đã gỡ ở `0056`; bản giấy không nói mức tối đa cho phép. |
| **N-06** phân trang danh sách mẫu | Không cần, cho cả hai loại mẫu. |
| **N-07** logo trên A4 và hợp đồng | Không cần — **định dạng nằm sẵn trong file .docx** người dùng soạn. Đây là hệ quả đẹp nhất của việc chuyển sang mẫu tải lên: cả một nhóm yêu cầu trình bày biến mất vì người dùng tự làm được. |
| **N-09** quét lại danh mục O(n) · **N-10** va chạm `version_no` | Vẫn để lại. |

### Mẫu hợp đồng trong `templates/`

File thứ tư: `mau-hop-dong-a4-doc.docx`. Khác ba mẫu hồ sơ ở đúng một chỗ cốt lõi — **bảng vẽ tay**.
Mẫu hồ sơ đặt `{{bang_san_pham}}` vì số cột CPBH đổi theo từng hồ sơ; hợp đồng nêu bốn cột cố định
nên người soạn vẽ bảng trong Word và đặt `{{san_pham.*}}` vào một dòng thân, hệ thống nhân bản đúng
dòng ấy.

**KHÔNG nạp vào `make demo-mau`** theo yêu cầu: nó thuộc Sale Admin, người khác và màn hình khác, và
bản demo đã có mẫu hợp đồng riêng. Ca kiểm thử canh cả hai chiều — mẫu hợp đồng không được mang
`{{bang_san_pham}}`, và không mẫu hồ sơ nào được lẫn khoá `{{san_pham.*}}`; lẫn thì bản in ra mang
nguyên chuỗi `{{...}}` mà không có thông báo lỗi nào.

**1259/1259 xanh.**

## P90 — Bỏ lịch sử tải bản mềm và hợp đồng (N-01 thu hẹp)

Khách hàng đảo lại một phần yêu cầu ngày 20/08: **không lưu lịch sử tải xuống bản mềm và hợp đồng
nữa**. Bản scan và tệp đính kèm thì giữ.

Điều đáng ghi lại là **lý do đảo trùng khít với lý do đã dùng để loại lượt XEM** ở `0052`. Khi ấy
tôi viết: *"một dòng lịch sử cho mỗi lần liếc màn hình thì dìm chết những dòng nói về bước duyệt —
thứ mà lịch sử sinh ra để kể"*. Lập luận ấy đúng, chỉ là dừng lại sớm một bước: bản mềm và hợp đồng
**bản thân chúng** là thứ người ta mở ra ĐỌC, và kế toán tải lại hồ sơ ba lần trong một buổi cũng
bình thường như xem nó ba lần. Ranh giới đúng không nằm giữa *xem* và *tải*, mà nằm giữa **văn bản
hệ thống tự dựng lại được bất cứ lúc nào** và **bản cứng mang chữ ký khách hàng**.

### Con dấu KHÔNG đi theo dòng lịch sử

Đây là chỗ dễ gỡ nhầm nhất, vì tới `0058` cả hai nằm trong **cùng một lời gọi** sang `policy` và
được điều khiển bằng hai cờ.

| | Trả lời câu gì | Số phận |
|---|---|---|
| Dòng *Tải bản hợp đồng* | "ai đã lấy file ra" | **Bỏ** |
| `contract_issued_at/by` | "hồ sơ này đã có hợp đồng chưa" (muc 8.3) | **Giữ**, vẫn đóng ở cả đường xem lẫn đường tải |

Cái thứ hai không phải lịch sử mà là **trạng thái của hồ sơ**, và báo cáo tiến độ đọc nó.

### Một tham số biến mất vì nó hết việc

`daSinhVanBan(policyId, loai, me, ghiLichSu)` mất cờ cuối. Sau khi bỏ hai loại, `loai` quyết định
tất cả và mỗi loại làm đúng **một** việc: `HOP_DONG` → đóng dấu; `BAN_SCAN`/`TEP_DINH_KEM` → ghi
lịch sử. Giữ cờ lại là giữ một công tắc mà mọi đường gọi đều truyền cùng một giá trị. `HO_SO` rời
khỏi cả kiểu dữ liệu: bản mềm không còn lý do nào để gọi sang `policy`.

Cờ `?xem=1` trên hai đường ấy cũng hết nghĩa. **Vẫn nhận nhưng bỏ qua**, không từ chối: `validate`
gạt mọi khoá lạ, nên xoá hẳn là đổi mọi liên kết cũ còn sót — thư đã gửi, tab đang mở — từ "xem
được" thành lỗi 400.

### Dữ liệu cũ ở lại

Những dòng `TAI_HO_SO` và `TAI_HOP_DONG` đã ghi **không xoá**: nhật ký chỉ ghi thêm (AUD-03/04), và
những lượt tải ấy có thật. Giao diện giữ nguyên hai nhãn để hồ sơ cũ vẫn đọc được. `action` là cột
`text` chứ không phải enum nên không có gì phải sửa ở lược đồ — `0059` không có migration.

### Một ca kiểm thử phải chuyển nhà

Ca *"năm lượt tải song song, `seq` liên tiếp"* là ca **đã bắt được lỗi thật**: `coalesce(max(seq),0)+1`
trong câu INSERT chỉ thấy dòng đã commit, nên năm lượt song song đọc cùng một số và bốn lượt vỡ ở
ràng buộc UNIQUE. Đường tải bản mềm không chạm tới `seq` nữa, nên ca ấy chuyển sang
`document.test.ts`, trên **đường tải bản scan** — nơi lịch sử vẫn ghi và phép khoá `FOR UPDATE` vẫn
phải đúng. Bỏ nó đi thì mất một ca canh giữ cho một lỗi đã xảy ra một lần.

### Bẫy môi trường gặp giữa chừng

`S3Error: The specified key does not exist` ở mọi lượt dựng bản mềm: MinIO mất object trong khi CSDL
vẫn giữ dòng mẫu. `ensureDefaultHopDong` tự chữa được tình huống này, nhưng **chỉ cho mẫu hợp đồng**
— mẫu hồ sơ không có nhánh tự chữa. Xoá sạch `doc.contract_template*` rồi để service seed lại là
xong. Ghi lại vì triệu chứng (500 ở đường xem bản mềm) không chỉ về phía nguyên nhân chút nào.

**1257/1257 xanh.**

## P91 — Dọn sạch nhật ký cũ, và vá lỗ hổng MinIO mất object

Ba việc, và việc thứ ba đổi cách làm hai việc đầu: **coi hệ thống được dựng từ dữ liệu sạch**. Phần
mềm chưa bàn giao, nên mọi dòng dữ liệu đang có đều do bộ nạp demo hoặc các lượt chạy kiểm thử sinh
ra — không có gì để bảo tồn.

### Xoá thay vì giữ

P90 để lại những dòng `TAI_HO_SO`/`TAI_HOP_DONG` đã ghi, với lý do *"nhật ký chỉ ghi thêm, và những
lượt tải ấy có thật"*. Lý do ấy đúng cho một hệ thống **đang chạy thật**. Ở đây nó sai theo một cách
cụ thể: màn hình *Lịch sử* của bản demo bày ra một loại dòng mà phần mềm không còn sinh nữa, và
người xem demo không có cách nào biết đó là dấu vết của một yêu cầu đã bỏ.

Migration `0059` xoá hẳn, nhãn gỡ khỏi `format.ts`, và cờ `?xem=1` — vốn giữ lại vì "liên kết cũ
trong thư đã gửi" — cũng bỏ hẳn khỏi hai đường ấy, vì không có liên kết cũ nào đang sống.

> Ràng buộc chỉ-ghi-thêm của AUD-03/04 nằm ở `aud.audit_log`, **không** ở `pol.policy_event`. Nhật
> ký kiểm toán toàn hệ thống vẫn nguyên vẹn — câu DELETE không phá lời hứa nào.

`seq` sau khi xoá thủng lỗ, và để nguyên là đúng: nó là số để SẮP XẾP và để chống chen ngang, không
phải một phép đếm ai đó đọc ra. Đánh số lại thì phải UPDATE mọi dòng của mọi hồ sơ — nhiều rủi ro
hơn hẳn cái nó chữa.

### Lỗ hổng MinIO: hai đường, tuỳ mẫu ai làm ra

Sự cố gặp ở P90: `S3Error: The specified key does not exist` → HTTP 500 kèm vết ngăn xếp của thư
viện minio, trong khi màn hình *Giấy tờ mẫu* vẫn hiển thị mẫu ấy đang dùng bình thường. Triệu chứng
không chỉ về phía nguyên nhân chút nào.

| Mẫu | Xử lý |
|---|---|
| **Mặc định** (hệ thống sinh) | `vaFileMacDinh` **dựng lại file** lúc khởi động — dựng ra đúng file cũ nên không có gì để mất |
| **Người dùng tải lên** | `docxCua` ném **409 `TEMPLATE_FILE_MISSING`**, nói rõ ai tải lại được |

Ranh giới ấy vốn đã có, nhưng nó **nằm lẫn trong `ensureDefaultHopDong`** — nên mẫu hồ sơ, thứ mọi
vai trò mở hằng ngày, lại là thứ duy nhất không tự chữa được. Tách thành một bước riêng chạy cho cả
bảng thì không loại mẫu nào bị bỏ quên.

Và không dựng lại mẫu người dùng soạn là quyết định giữ nguyên, có lý do: thay thầm nội dung một văn
bản nghiệp vụ bằng bố cục mặc định thì **người ký sẽ đặt bút xuống dưới một thứ không phải thứ họ
soạn**. Nhưng báo lỗi phải là báo lỗi ĐÚNG — 409 với câu chữ chỉ đúng người sửa được, không phải 500.

`Storage.get` bắt mã lỗi `NoSuchKey`/`NotFound` rồi ném `ObjectMissingError`. Bắt theo **mã** chứ
không theo chuỗi thông báo: thông báo đổi theo phiên bản thư viện, mã thì không.

### Dữ liệu demo dựng lại từ đầu

`make demo` rồi `make demo-mau`. Kết quả kiểm trên chồng demo thật, qua gateway, bằng tài khoản
`kt01`:

- Tải **bản mềm** (27KB) và **hợp đồng** (20KB) → lịch sử hồ sơ chỉ có `CREATE`, `SUBMIT`,
  `TBP_SIGN`, `KT_RECEIVE_L1`. **Không dòng tải nào.**
- `contract_issued_at`/`_by` **đã đóng dấu** — thứ phải giữ thì giữ.
- Ba mẫu hồ sơ nạp đúng (2 đang dùng, bản rút gọn để nháp), mẫu hợp đồng trong `templates/` đúng là
  **không** nạp.

Một lỗi nhỏ lộ ra ở đây: dòng tổng kết của bộ nạp đếm `BO_MAU.length` nên báo *"4 mẫu hồ sơ"* trong
khi CSDL có 3. Đếm số **nạp thật**, vì một con số kể cả mẫu cố ý đứng ngoài thì mỗi lần ai đó soi
CSDL lại phải đi tìm xem mình vừa mất một mẫu ở đâu.

**1261/1261 xanh** (chạy trước khi dựng demo — `make test` từ chối chạy khi chồng demo đang bật).

## P92 — Mẫu hợp đồng về tay Quản trị: một trang *Văn bản mẫu*, hai thẻ

DOC-26 giao mẫu hợp đồng cho Sale Admin vì nó là *"văn bản nghiệp vụ của người bán"*. Khách hàng
chốt lại ngày 20/08: gộp về Quản trị hệ thống.

Lý do gộp không phải là cho gọn. Hai loại mẫu dùng **chung một bộ máy** — tải `.docx` lên, đọc ô
trống, ánh xạ trường, ban hành — và bộ máy ấy là **việc kỹ thuật**: nó đòi hiểu khoá trộn, hiểu vì
sao Word cắt rời một ô trống thành ba mảnh XML, hiểu `{{bang_san_pham}}` khác gì `{{san_pham.*}}`.
Chia đôi cho hai vai trò nghĩa là hai người phải học cùng một thứ, và người ít dùng hơn sẽ quên.

Sale Admin **không mất gì trong luồng**: vẫn xuất hợp đồng, vẫn chọn mẫu nào lúc xuất.

### Một bất đối xứng cố ý

`/contract-templates/available` là đường DUY NHẤT của nhóm mà **Quản trị không vào được**, và là
đường duy nhất Kế toán với Sale Admin vào được. Không mâu thuẫn: nó phục vụ người **xuất** hợp đồng,
không phục vụ người **quản lý** mẫu — Quản trị không xuất hợp đồng bao giờ. Đúng hình dạng mà
`policy-templates/available` đã có từ `0058`: mở cho năm vai trò đọc hồ sơ, đóng với chính Quản trị.

### Vì sao KHÔNG gộp luôn hai controller

Sau lượt này hai controller chỉ còn khác nhau ở `available`. Vẫn tách, và lý do cũ mất đi một:

1. ~~Vai trò khác nhau~~ — không còn.
2. **Luật khác nhau, không phải cấu hình khác nhau.** Mẫu hồ sơ có 13 mục bắt buộc kiểm lúc ban
   hành và `{{bang_san_pham}}` do hệ thống dựng; mẫu hợp đồng không có mục bắt buộc nào và vẽ bảng
   bằng tay. Gộp lại là một controller đầy nhánh `if (kind === 'HO_SO')`.
3. **`available` của hai loại mở cho hai tập vai trò khác hẳn nhau** — gộp đường dẫn là gộp luôn hai
   phép kiểm quyền không gộp được.

### Ca kiểm thử: đổi chiều chứ không xoá

Ca `DOC-26` cũ khẳng định *"Quản trị gọi API mẫu hợp đồng thì 403"*. Cách nhanh là xoá nó đi. Cách
đúng là **giữ nguyên hình dạng và đảo mọi khẳng định**, rồi thêm nửa còn lại — vì một lượt "nới
quyền" rất dễ bỏ quên nửa kia: mở cho Quản trị mà quên đóng cho Sale Admin thì cả hai cùng vào được,
và không có gì đỏ.

Ba ca thay cho một: Quản trị quản lý được · Sale Admin **không** còn quản lý được · nhưng Sale Admin
và Kế toán **vẫn** chọn được mẫu lúc xuất.

### Hai cái bẫy gặp trong lượt này

- **Phép quét theo dòng bỏ sót lời gọi trải nhiều dòng.** Đổi `'sa01'` → `'admin01'` cho mọi dòng
  chứa `/contract-templates`, nhưng một lời gọi `uploadTemplate(` xuống dòng nên tham số `'sa01'`
  nằm một mình ở dòng sau. Kết quả: upload trả 403, `t.body.id` là `undefined`, `WHERE id =
  undefined` cho Postgres nổ, và triệu chứng là **HTTP 500 ở bước publish** — cách xa nguyên nhân ba
  bước.
- **`make demo` để lại dữ liệu mẫu của demo trong CSDL của bộ test.** Sau `make demo-down`, `make
  test` seed lại tài khoản nhưng KHÔNG động vào `doc.contract_template`, nên bộ test chạy trên 22
  mẫu hợp đồng của demo và không có mẫu mặc định nào — sáu ca đỏ với `409 NO_ACTIVE_TEMPLATE` và
  *"thiếu mẫu mặc định cho khổ a4l"*. Xoá bảng mẫu rồi để service seed lại là xong. Đây là lần thứ
  hai cái bẫy này cắn; nó đã có trong CLAUDE.md.

**1268/1268 xanh.**

## P93 — Văn bản mẫu làm lại: một lượt lưu, không vòng đời, chọn cột theo mẫu

Khách hàng chốt lại toàn bộ cách nhập mẫu ngày 20/08 — mười bốn điểm. Đợt này làm phần lõi; đặc
điểm chung của gần hết danh sách là **bỏ bớt**, và mỗi thứ bỏ đi đều là một câu hỏi sai.

### Ba bước thành một

| Trước | Sau |
|---|---|
| Tải lên → mẫu **nháp** | Chọn file → đọc ô trống, **không tạo dòng nào** |
| Ánh xạ ở một hộp thoại mở sau | Bảng ánh xạ ngay dưới ô chọn tệp |
| Ban hành | *(không còn)* — lưu được là dùng được |
| Ngừng dùng · Sửa | *(không còn)* — chỉ còn **Xoá** |

Vòng đời cũ sinh ra khi mỗi khổ giấy chỉ được có MỘT mẫu đang dùng: ban hành mẫu này nghĩa là hạ mẫu
kia. `0058` bỏ luật ấy, và từ đó *ban hành* chỉ còn nghĩa là "đưa vào danh sách chọn" — mà một mẫu đã
ánh xạ xong thì còn lý do gì để nằm ngoài danh sách? Trạng thái **nháp** vì thế là một phòng chờ
không dẫn tới đâu, và **đã ngừng** là một cách xoá nửa vời.

Hệ quả được nhất: **không còn trạng thái nửa vời**. Trước `0067` một lượt hỏng giữa chừng để lại mẫu
nháp hoặc mẫu đã ánh xạ mà chưa ban hành, và không màn hình nào nói cho người dùng biết họ đang đứng
ở đâu. Có ca kiểm thử canh đúng điều đó: lưu hỏng thì bảng KHÔNG thêm dòng nào.

*Sửa* bỏ đi vì lý do khác: sửa một mẫu **đang được dùng** nghĩa là bản mềm hôm nay và bản mềm hôm qua
khác nhau mà không chỗ nào ghi lại. Xoá-rồi-thêm để lại dấu vết đúng như nó vốn là.

### Hai nhóm khoá biến mất

**`cong_ty.`** — tên, địa chỉ, mã số thuế Công ty là **cố định ở mọi hồ sơ**. Người soạn gõ thẳng vào
Word. Một ô trống cho một giá trị không bao giờ đổi chỉ thêm đúng một bước có thể quên, và quên thì
bản in mang chuỗi `{{cong_ty.ten}}` ở ngay dòng đầu — chỗ dễ thấy nhất của một văn bản đem đi ký.

> Hệ quả phải nói ra: phép kiểm mục bắt buộc của muc 11.1 **từ 13 xuống 12**. Mục *thông tin công ty*
> giờ do người soạn tự chịu trách nhiệm — đây là chỗ DUY NHẤT của muc 11.1 mà bảo đảm tự động không
> với tới. Một bảo đảm 12/13 mà tưởng là 13/13 tệ hơn hẳn một bảo đảm 12/13 đã biết.

**`san_pham.`** — nhóm trường theo dòng, phục vụ bảng **vẽ tay** trong mẫu hợp đồng. Bỏ nó kéo theo
việc mẫu hợp đồng cũng dùng `{{bang_san_pham}}`, và cơ chế nhân bản dòng bảng trong `mergeDocx` gỡ
hẳn. Một cơ chế không ai dùng mà vẫn chạy là một cơ chế sẽ hỏng lặng lẽ — không ca kiểm thử nào của
người dùng thật đi qua nó nữa.

### Chọn cột bảng sản phẩm — phương án A

`cot_bang jsonb` trên từng mẫu. Đây là chỗ đúng để đặt nó: từ `0058` người xem **chọn mẫu**, tức là
chọn bản trình bày, mà tập cột là một thuộc tính của bản trình bày. Quản trị soạn được *"bản đầy đủ
cho nội bộ"* và *"bản gọn đưa khách hàng"* mà không cần ai lập trình.

Ba luật của tính năng này, cả ba đều đáng ghi:

1. **`cpbh` là MỘT lựa chọn nở ra thành N cột.** Số cột bằng dòng nhiều khoản nhất (muc 7.1), và con
   số ấy chỉ biết lúc dựng bảng cho một hồ sơ cụ thể — còn tập cột thì khai lúc soạn mẫu, trước khi
   biết hồ sơ nào sẽ dùng nó.
2. **`ten_san_pham` và `cpbh_tong` không tắt được.** Bảng gánh đúng hai mục của muc 11.1; tắt chúng
   là lưu một mẫu vi phạm mà không phép kiểm nào bắt được. Hệ thống **thêm lại** thay vì báo lỗi —
   người dùng không làm gì sai, họ chỉ không biết luật.
3. **Thứ tự cột do danh mục quyết định**, không do người dùng gõ vào. Cho khai thứ tự là mở ra một
   tập vô hạn bố cục mà không ai kiểm được cái nào đọc được.

### Định dạng và cờ bắt buộc: hai ô hỏi sai

`format` hỏi *"công nợ hiển thị kiểu tiền hay kiểu chữ?"* — câu ấy chỉ có một đáp án đúng, và đáp án
đi theo TRƯỜNG chứ không theo mẫu. Hỏi hai mươi lần cho hai mươi ô là mời người dùng trả lời sai ở
đúng một trong số đó, và cái sai chỉ lộ ra trên bản in. Giờ nó gắn cứng trong `sources.ts`.

`required` chỉ đổi **thời điểm** báo lỗi, và báo cho người KHÔNG sửa được: kế toán bấm xuất rồi nhận
*"hồ sơ khách hàng thiếu chức danh người đại diện"*, trong khi sửa hồ sơ khách hàng là việc của TDV
còn sửa mẫu là việc của Quản trị. Bỏ nó thì trường rỗng in ra rỗng — nhìn thấy ngay trên bản xem
trước, mà từ `0060` bản xem trước là đường DUY NHẤT dẫn tới nút tải.

### Cái bẫy của lượt này: mẫu bỏ quên

Bỏ vòng đời làm lộ ra một chuyện bộ kiểm thử vốn đã sai mà không ai thấy: **các ca không dọn mẫu
chúng tạo ra**. Trước `0067` mẫu bỏ quên nằm ở trạng thái nháp hoặc đã ngừng nên vô hại; giờ nó là
mẫu MỚI NHẤT, tức là mẫu mặc định của mọi lời gọi không kèm `mauId`.

Triệu chứng: mười ca đỏ ở những chỗ chẳng liên quan gì tới nhau, tất cả với dạng
*"expected 'đứng dọc' to contain …"* — nội dung của một mẫu do ca khác bỏ lại. Chữa bằng hai quy tắc:
`beforeAll` xoá mẫu của lượt chạy trước **trước khi dựng app** (dọn sau thì `ensureDefault` đã bỏ qua
vì thấy có mẫu, và ta xoá nốt thứ nó nhìn thấy), và mọi ca tạo mẫu đều `finally` xoá.

**1276/1276 xanh.**

## P94 — Chọn mẫu TRƯỚC khi xem, và phần còn lại của danh sách 20/08

Điểm cuối của danh sách: *"khi xem một file phải yêu cầu người dùng chọn văn bản mẫu trước khi
preview"*. `0058` làm đúng ngược lại — mở sẵn mẫu đầu danh sách để bấm một nút là thấy nội dung.

Đảo lại là đúng, và lý do nằm ở chính `0067`: từ khi mỗi mẫu có **tập cột riêng**, hai mẫu của cùng
một hồ sơ ra hai bản giấy khác hẳn nhau — bản đủ mười cột để đối chiếu nội bộ, bản bốn cột để đưa
khách hàng. Mở sẵn một cái nghĩa là phần lớn người dùng **không bao giờ biết cái kia tồn tại**, và họ
gửi đi bản phần mềm đưa ra trước chứ không phải bản họ định gửi.

Ô chọn *Mẫu* trên bản đang xem thì giữ: nó để **đổi** mà không phải đóng hộp ra chọn lại.

### Kiểm trên chồng demo thật

Cùng một hồ sơ, hai mẫu, đọc cột ra từ chính PDF:

```
gọn → STT · Tên sản phẩm · CPBH tổng · Giá thu về
đầy → STT · Mã sản phẩm · Tên sản phẩm · Giá công ty · Giá bán buôn · CPBH tổng · CPBH1 ·
      Giá thu về · Tỷ lệ CK · Ghi chú
```

Bộ nạp demo cũng đổi theo: mẫu rút gọn nạp kèm tập cột gọn. Không có mẫu nào khai tập cột thì ô chọn
cột trên màn hình thêm mẫu là một chức năng không ai thấy hoạt động.

**1277/1277 xanh.**

## P95 — Hộp ánh xạ tách riêng, và khoá đọc bằng chính tên nó

Sáu điểm sửa giao diện sau khi khách hàng dùng thử trang thêm mẫu của `0067`.

### Bảng ánh xạ ra hộp thoại riêng

`0067` đặt nó thẳng vào cột trái, ngay dưới ô chọn tệp — đúng như yêu cầu lúc ấy. Nhưng với mẫu hai
mươi ô trống thì cột ấy **dài gấp ba phần còn lại**, và hai thứ đáng chú ý nhất — ô chọn cột bảng và
nút *Lưu* — bị đẩy khỏi tầm mắt.

Giờ nó là một hộp thoại rộng, mở **ngay** khi đọc xong ô trống (đọc xong mà không bày ra thì người
dùng phải đoán rằng có một bước nữa). Chỗ cũ còn một dòng tóm tắt — *"3/5 đã chọn trường"* — kèm nút
mở lại.

**Không cho tràn khung**, và chặn ở CSS chứ không ở chỗ dựng giao diện, vì hai nguyên nhân đều thuộc
về trình duyệt: khoá dài không có khoảng trắng (`{{ho_so.chuc_danh_dai_dien}}`) thì không tìm được
chỗ ngắt nên nó nong ô ra, còn `<select>` thì mặc định rộng bằng `<option>` dài nhất.

### Khoá đọc bằng chính tên nó

Ba đổi nhỏ cùng một hướng — **cái người dùng cần đối chiếu phải là cái hiện ra**:

| Chỗ | Trước | Sau |
|---|---|---|
| Bảng hướng dẫn | `{{ho_so.ten_khach_hang}}` | `ho_so.ten_khach_hang` trong thẻ nền xám |
| Ô chọn trường | *Tên khách hàng* | `ho_so.ten_khach_hang` |
| Cột chú thích | *Người đề nghị — Trình dược viên lập hồ sơ* | *Người đề nghị* |

Ô chọn là chỗ rõ nhất: người dùng vừa đọc tên ô trống ở cột bên trái và đang đi tìm cái trùng với nó.
Bày chú thích tiếng Việt ra đó là bắt họ **dịch hai chiều** giữa hai cách gọi tên, từng dòng một.

Hai cặp ngoặc thì bỏ khỏi bảng — lặp lại ở hai mươi dòng mà không nói gì mới, vì câu ngay trên đã dạy
cách viết chúng. Thẻ nền xám thay chúng để mắt vẫn nhận ra đây là thứ phải gõ y nguyên.

### Một chỗ tôi hỏi lại trước khi làm

Câu ví dụ đổi thành `{{ten_khach_hang}}`, nhưng khoá thật là `{{ho_so.ten_khach_hang}}`. Hai cách
hiểu, khối lượng khác hẳn: bỏ tiền tố `ho_so.` khỏi mọi khoá (hợp lý vì sau khi bỏ `cong_ty.` và
`san_pham.` thì chỉ còn MỘT nhóm, tiền tố không phân biệt gì nữa) — hay chỉ sửa câu chữ.

Khách hàng chốt: **giữ `ho_so.`, chỉ sửa câu ví dụ**. Ghi lại ở đây vì hệ quả có thật — câu ví dụ
trong hướng dẫn giờ trỏ tới một khoá không tồn tại, và người soạn gõ theo nó sẽ bị máy chủ từ chối
với `SOURCE_UNKNOWN`. Đã nêu trước khi làm và khách hàng chọn như vậy.

**1282/1282 xanh.**
