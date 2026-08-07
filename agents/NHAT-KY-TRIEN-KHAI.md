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
| **P7b** | `reporting`: bộ lọc, báo cáo, xuất Excel | chưa |
| **P7c** | `gateway`: Caddy, giới hạn tần suất, header an toàn | chưa |
| **P7d** | `web`: giao diện React | chưa |
| **P8** | Tài liệu bàn giao: hướng dẫn chạy test toàn hệ, hướng dẫn dựng demo local, user guide cho người dùng web | chưa |

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
