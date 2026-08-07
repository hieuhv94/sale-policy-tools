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

---

## Chặng đã lên kế hoạch

| Chặng | Nội dung | Trạng thái |
|---|---|---|
| **P1** | Monorepo `impl/`, hạ tầng Docker, migration 9 schema + 9 DB role, bốn bất biến ở tầng CSDL, `VERSION`, khung test | **xong** — 27/27 xanh |
| **P2** | `domain-policy` thuần: công thức chiết khấu, làm tròn, máy trạng thái | chưa |
| **P3** | `identity`: JWT, 6 vai trò, cây phân quyền đệ quy, seed 10 tài khoản | chưa |
| **P4** | `catalog` + `customer` | chưa |
| **P5** | `policy`: hồ sơ, đóng băng giá, phiên bản, hiệu lực | chưa |
| **P6** | `document`, `notification`, `sla-worker` | chưa |
| **P7** | `reporting`, `audit`, `gateway`, `web` | chưa |

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
