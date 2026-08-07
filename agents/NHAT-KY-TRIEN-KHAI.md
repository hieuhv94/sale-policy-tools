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
| **P6** | `document`, `notification`, `sla-worker` | chưa |
| **P7** | `reporting`, `audit`, `gateway`, `web` | chưa |
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
