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
