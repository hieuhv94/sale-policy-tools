# Mọi thứ chạy trong Docker. Không có mục tiêu nào chạy Node native trên máy.
SHELL       := /bin/sh
APP_VERSION := $(shell cat VERSION)
GIT_SHA     := $(shell git rev-parse --short HEAD 2>/dev/null || echo nogit)
export APP_VERSION GIT_SHA

COMPOSE  := docker compose -f deploy/compose.yml -f deploy/compose.test.yml
DEMO     := docker compose --env-file deploy/.env -f deploy/compose.yml -f deploy/compose.demo.yml
RUN      := $(COMPOSE) run --rm -T test
WORKSPACE := ../workspace
KHO_LOG   ?= ../logarchive
export KHO_LOG

.PHONY: help up down migrate install typecheck test seed clean ps logs psql version \
        luu-log nen-log luu-audit luu-thang \
        backup restore restore-drill retention secrets demo demo-down demo-logs demo-seed \
        demo-env demo-mail demo-mail-down check-demo-down demo-data demo-reset \
        demo-admin demo-mau demo-reset-files

help:
	@echo "up        dựng hạ tầng (postgres, redis, rabbitmq, minio, mailpit) + migration"
	@echo "install   cài phụ thuộc trong container"
	@echo "test      chạy toàn bộ test trong container"
	@echo "down      dừng và xoá container"
	@echo "clean     xoá luôn volume dữ liệu và thư mục workspace"
	@echo "backup    sao lưu CSDL vào volume pgbackup, tự kiểm mục lục"
	@echo "restore-drill  phục hồi thử vào CSDL nháp rồi đối chiếu số dòng"
	@echo "retention xoá dữ liệu hết vòng đời (token, outbox đã gửi)"
	@echo "luu-log   thu log mọi container vào $(KHO_LOG) — chạy HẰNG NGÀY"
	@echo "luu-thang nén log tháng trước + trích nhật ký kiểm toán — chạy ĐẦU THÁNG"
	@echo ""
	@echo "demo      dựng hệ chạy thử ở http://localhost:8080 — CSDL TRỐNG, chỉ có tài khoản quản trị"
	@echo "demo-mau  nạp thêm 10 tài khoản mẫu và dữ liệu nghiệp vụ mẫu vào bản đang chạy"
	@echo "demo-down dừng bản chạy thử"
	@echo "demo-logs xem log của bản chạy thử"

up:
	@mkdir -p $(WORKSPACE)/logs $(WORKSPACE)/reports
	$(COMPOSE) up --exit-code-from pg-init pg-init
	$(COMPOSE) up -d --wait postgres redis rabbitmq minio mailpit
	$(COMPOSE) up --exit-code-from migrate migrate

migrate:
	$(COMPOSE) up --exit-code-from migrate migrate

install:
	$(RUN) pnpm install --frozen-lockfile=false --config.store-dir=/pnpm-store

typecheck:
	$(RUN) pnpm typecheck

seed:
	$(RUN) pnpm seed

# Luôn chạy migrate TRƯỚC, không tin vào trạng thái container còn sót lại.
#
# Chồng demo và môi trường test dùng chung một Postgres, và mỗi bên đặt mật khẩu
# chín DB role theo bí mật của mình. Chạy demo rồi chạy test mà bỏ bước này thì
# cả bộ test chết ở dòng kết nối đầu tiên — 24 test đỏ với "password
# authentication failed", không dòng nào nhắc tới nguyên nhân.
# `seed` nằm trong danh sách phụ thuộc, không phải việc người chạy phải nhớ.
#
# Bộ test dựa vào 10 tài khoản mẫu (`tdv01`, `tbp01`, …) để kiểm cây phân quyền,
# mà không tệp test nào tự nạp chúng. Từ khi `make demo` DỰNG LẠI CSDL từ đầu,
# chạy demo rồi chạy test là mất sạch tài khoản đó — và triệu chứng là hàng chục
# case đỏ ở "đăng nhập tdv01 hỏng: 401", không dòng nào nhắc tới nguyên nhân.
# `seed.ts` dùng ON CONFLICT DO UPDATE nên chạy lại bao nhiêu lần cũng được.
test: check-demo-down migrate seed
	@mkdir -p $(WORKSPACE)/reports
	$(RUN) pnpm test

# Chồng demo và bộ test dùng CHUNG một Postgres, một RabbitMQ, một MinIO.
#
# Chạy đồng thời thì hỏng theo kiểu khó đoán nhất: consumer của bản demo giành
# mất sự kiện trên hàng đợi, `/readyz` thấy service mà bộ test tưởng đang tắt,
# và read-model bị hai bản reporting cùng ghi. Đo được 18 test đỏ ở đủ bốn tệp
# khác nhau, không tệp nào có lỗi thật.
#
# Dừng hẳn thay vì tự tắt bản demo của người dùng: họ có thể đang trình bày.
check-demo-down:
	@if [ -n "$$(docker compose -f deploy/compose.yml -f deploy/compose.demo.yml ps -q gateway 2>/dev/null)" ]; then \
	  echo ""; \
	  echo "  DỪNG: chồng demo đang chạy và dùng chung CSDL với bộ test."; \
	  echo "  Chạy 'make demo-down' rồi thử lại."; \
	  echo ""; \
	  exit 1; \
	fi

# Điều kiện NGƯỢC LẠI của `check-demo-down`, và cần một cái riêng chứ không dùng
# chung: `demo-data` nạp qua API THẬT nên nó đòi mười service đang sống, chứ
# không phải chỉ đòi CSDL.
#
# Thiếu bước này thì `make demo-mau` chạy trên chồng đã hạ sẽ dựng lại ảnh
# gateway mất một phút, rồi chết bằng `TypeError: fetch failed` kèm
# `ENOTFOUND gateway` — một vết ngăn xếp Node không nhắc gì tới chồng demo, và
# đọc xong không biết phải làm gì tiếp.
check-demo-up:
	@if [ -z "$$(docker compose -f deploy/compose.yml -f deploy/compose.demo.yml ps -q gateway 2>/dev/null)" ]; then \
	  echo ""; \
	  echo "  DỪNG: chồng demo chưa chạy, mà bộ dữ liệu mẫu nạp qua API thật."; \
	  echo "  Chạy 'make demo' trước, rồi 'make demo-mau'."; \
	  echo "  Lưu ý: 'make demo' XOÁ SẠCH CSDL demo rồi seed lại admin01."; \
	  echo ""; \
	  exit 1; \
	fi

secrets:
	sh scripts/gen-secrets.sh deploy/secrets

# --- Đóng gói bản giao (`0105`) ----------------------------------------------
#
# Ba ảnh — `csbh-service`, `csbh-web`, `csbh-ops` — và MỘT tệp nén để chép lên
# máy chủ khách. Tệp nén KHÔNG chứa ảnh: máy chủ kéo chúng từ registry.
#
# `anh` dựng, `day` đẩy lên registry, `goi` gói tệp nén. `dong-goi` làm cả dựng
# và gói; đẩy thì tách riêng vì nó cần đăng nhập và không nên chạy nhầm.
anh:
	sh scripts/dong-goi.sh anh

day-anh:
	sh scripts/dong-goi.sh day

# Đẩy RIÊNG ảnh MinIO nhân bản (`0247`) — không đẩy ảnh phần mềm nào.
day-minio:
	sh scripts/dong-goi.sh day-minio

goi:
	sh scripts/dong-goi.sh goi

dong-goi:
	sh scripts/dong-goi.sh tat-ca

backup:
	@mkdir -p $(WORKSPACE)/backup-mirror
	$(COMPOSE) run --rm -T --entrypoint /bin/sh migrate /backup.sh
	$(COMPOSE) run --rm -T --entrypoint /bin/sh migrate /basebackup.sh

# Phục hồi vào CSDL NHÁP rồi đối chiếu — không đụng CSDL đang chạy.
restore-drill:
	$(COMPOSE) run --rm -T --entrypoint /bin/sh migrate /restore.sh

# Đè lên CSDL đang chạy. Phải gõ RESTORE_DB=csbh một cách có ý thức.
restore:
	$(COMPOSE) run --rm -T -e RESTORE_DB=csbh --entrypoint /bin/sh migrate /restore.sh $(FILE)

retention:
	$(COMPOSE) exec -T postgres psql -U postgres -d csbh -c "SELECT sys.run_retention()"
	$(COMPOSE) exec -T postgres psql -U postgres -d csbh -c "SELECT sys.don_idn_outbox()"

# --- Kho lưu trữ log (`0092`) ------------------------------------------------
#
# `KHO_LOG` mặc định là `../logarchive` — NGOÀI `workspace/`, và đó là chủ ý:
# `make clean` xoá sạch `workspace/`, nên để kho lưu trữ ở đó là dựng một cái
# kho mà một lệnh dọn thường ngày xoá mất.
#
# Ba lệnh, ba nhịp: `luu-log` hằng ngày, hai lệnh còn lại đầu mỗi tháng.
luu-log:
	@mkdir -p $(KHO_LOG)
	sh scripts/luu-log.sh

nen-log:
	sh scripts/nen-log-thang.sh

luu-audit:
	$(COMPOSE) run --rm -T -e KHO_LOG=/logarchive -e THANG_TRICH --entrypoint /bin/sh migrate /luu-audit-thang.sh

# Cả ba việc của đầu tháng, đúng thứ tự: thu nốt phần còn lại của tháng cũ rồi
# mới nén, và trích audit sau cùng vì nó không phụ thuộc hai bước kia.
luu-thang: luu-log nen-log luu-audit

version:
	@echo "APP_VERSION=$(APP_VERSION) GIT_SHA=$(GIT_SHA)"

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs --no-color --tail=200 > $(WORKSPACE)/logs/compose.log 2>&1; \
	echo "đã ghi $(WORKSPACE)/logs/compose.log"

psql:
	$(COMPOSE) exec postgres psql -U postgres -d csbh

down:
	$(COMPOSE) down --remove-orphans

clean:
	$(COMPOSE) down -v --remove-orphans
	rm -rf $(WORKSPACE)/logs/* $(WORKSPACE)/reports/* $(WORKSPACE)/tmp/*

# --- Chạy thử trên máy local -------------------------------------------------
#
# Một lệnh, từ máy trắng tới màn hình đăng nhập. Xem deploy/HUONG-DAN-DEMO.md.
# Bản chạy thử luôn bắt đầu từ CSDL TRỐNG, chỉ có một tài khoản quản trị.
#
# Không nạp sẵn tài khoản mẫu và dữ liệu nghiệp vụ mẫu nữa: cái đáng thử chính
# là đường onboarding thật — quản trị dựng cây tài khoản, khai danh mục và quy
# định chiết khấu, rồi TDV lập khách hàng và hồ sơ. Nạp sẵn thì không phân biệt
# được dữ liệu mình vừa nhập với dữ liệu có sẵn, và cả nhánh onboarding không
# bao giờ được chạy thử.
#
# Muốn bộ mẫu cũ thì `make demo-mau` sau khi bản demo đã lên.
demo: secrets demo-env
	@mkdir -p $(WORKSPACE)/logs
	# Dừng chồng cũ TRƯỚC khi xoá CSDL. Một service của lượt trước còn mở kết
	# nối là `DROP DATABASE` hỏng, và thông báo của Postgres không nói ai giữ.
	$(DEMO) down
	$(DEMO) up --exit-code-from pg-init pg-init
	$(DEMO) up -d --wait postgres redis rabbitmq minio mailpit gotenberg
	$(MAKE) demo-reset
	$(DEMO) up --exit-code-from migrate migrate
	# Nêu TÊN từng service. `up caddy` chỉ kéo theo những gì caddy phụ thuộc, mà
	# caddy chỉ phụ thuộc gateway — tám service còn lại sẽ không chạy, và triệu
	# chứng là màn hình đăng nhập hiện ra rồi mọi thứ trả 502.
	$(DEMO) up -d --build --wait \
	  identity catalog customer policy document notification audit reporting \
	  sla-worker gateway caddy
	$(MAKE) demo-admin
	@echo ""
	@echo "  Giao diện:   http://localhost:$${DEMO_PORT:-8080}"
	@echo "  Hộp thư thử: chạy 'make demo-mail' rồi mở http://localhost:8025"
	@echo "  Tài khoản:   admin01 / Test@1234 — CSDL trống, tự tạo phần còn lại"
	@echo ""
	@echo "  Thứ tự dựng: Trưởng bộ phận -> Kế toán -> Sale Admin -> Trình dược viên"
	@echo "  Muốn dữ liệu mẫu như trước: make demo-mau"
	@echo ""

# Xoá và dựng lại CSDL. Chạy TRƯỚC migrate, sau khi Postgres đã khoẻ.
demo-reset: demo-reset-files
	$(DEMO) run --rm -T -e NODE_ENV= --entrypoint /bin/sh migrate /reset-db.sh

# Dọn sạch kho tệp cùng lượt với CSDL.
#
# Xoá CSDL mà giữ nguyên MinIO thì mọi object còn lại là RÁC: không dòng nào
# trong CSDL trỏ tới chúng nữa, không màn hình nào hiện chúng, và không có gì
# dọn chúng. Chúng chỉ lớn dần.
#
# Đã hỏng thật vì chuyện này: `document` nạp một mẫu hợp đồng mặc định ở MỖI lần
# khởi động khi chưa có mẫu nào trong CSDL, nên mỗi lượt `make demo` để lại thêm
# một object dưới `mau_hd/`. Tới lượt bộ test quét kho, thư viện minio ném
# "Entity expansion limit exceeded" TỪ BÊN TRONG luồng — không bắt được, và test
# chỉ treo tới lúc hết giờ, không có dòng nào nói vì sao.
demo-reset-files:
	@$(DEMO) exec -T minio sh -c '\
	  mc alias set l http://localhost:9000 "$$MINIO_ROOT_USER" "$$MINIO_ROOT_PASSWORD" > /dev/null && \
	  mc rm --recursive --force l/csbh/ > /dev/null 2>&1; \
	  mc mb --ignore-existing l/csbh > /dev/null' \
	  && echo "demo-reset-files: đã dọn sạch kho tệp" || true

# Đúng MỘT tài khoản quản trị, không gì khác.
#
# NODE_ENV để TRỐNG một cách có chủ ý: chính script này từ chối chạy khi
# NODE_ENV=production (SEC-14), và đó là hành vi đúng — tài khoản có mật khẩu
# ai cũng đoán được thì không bao giờ được nạp lên máy chủ thật.
demo-admin:
	$(DEMO) run --rm -T -e NODE_ENV= --entrypoint sh identity -c "pnpm seed:admin"

# Bộ mẫu cũ: 10 tài khoản phủ đủ sáu vai trò + dữ liệu nghiệp vụ mẫu.
#
# TÁCH RIÊNG khỏi `make demo` — xem chú thích ở đó. Chạy được bất cứ lúc nào
# trên bản demo đang lên.
demo-mau: check-demo-up demo-seed demo-data
	@echo ""
	@echo "  Tài khoản mẫu: tdv01 / tbp01 / kt01 / sa01 / bld01 / admin01 — mật khẩu Test@1234"
	@echo ""

# Nối bí mật vào chỗ compose.yml nội suy chúng.
#
# MinIO và Postgres nhận mật khẩu qua BIẾN MÔI TRƯỜNG (`MINIO_ROOT_PASSWORD`),
# không đọc được file bí mật; mười service thì đọc file. Không nối hai đường đó
# lại thì hai bên dùng hai mật khẩu khác nhau, và triệu chứng là một lỗi S3 dài
# dòng không nhắc gì tới mật khẩu: "The request signature we calculated does not
# match". Đã dính đúng lỗi này.
demo-env:
	@printf 'MINIO_PASSWORD=%s\n' "$$(cat deploy/secrets/minio_password.txt)" > deploy/.env
	@printf 'APP_VERSION=%s\n' "$(APP_VERSION)" >> deploy/.env
	@chmod 600 deploy/.env

# Nạp tài khoản và danh mục mẫu.
#
# NODE_ENV để TRỐNG một cách có chủ ý: chính script này từ chối chạy khi
# NODE_ENV=production (SEC-14), và đó là hành vi đúng — tài khoản mẫu có mật
# khẩu ai cũng đoán được thì không bao giờ được nạp lên máy chủ thật.
demo-seed:
	$(DEMO) run --rm -T -e NODE_ENV= --entrypoint sh identity -c "pnpm seed"

# Dữ liệu nghiệp vụ mẫu: NHỎ và thật.
#
# Chạy SAU khi mười service đã sống, vì nó nạp qua API thật chứ không INSERT
# thẳng — dữ liệu demo phải đi qua đúng máy trạng thái và đúng phép tính chiết
# khấu, nếu không nó sẽ ở những trạng thái mà phần mềm không tạo ra được.
demo-data: check-demo-up
	# Dựng lại TRƯỚC khi chạy. Mã nguồn được sao chép vào ảnh lúc build chứ không
	# gắn từ máy thật, nên sửa `seed-demo.ts` rồi chạy thẳng sẽ nạp bản cũ — và
	# không có gì báo cho biết điều đó.
	$(DEMO) build gateway
	$(DEMO) run --rm -T -e NODE_ENV= --entrypoint sh gateway -c "pnpm exec tsx scripts/seed-demo.ts"

demo-down:
	$(DEMO) down

demo-logs:
	$(DEMO) logs -f --tail=100

# Mở hộp thư thử ra ngoài. TÁCH RIÊNG khỏi `make demo` vì nó mở thêm một cổng,
# và bất biến "chỉ Caddy mở cổng" chỉ có nghĩa khi việc phá nó là một hành động
# rõ ràng, có chủ ý.
#
# `up -d mailpit` với lớp phủ `compose.mail.yml`, KHÔNG phải `run`.
#
# Bản cũ dùng `run --service-ports`, và nó hỏng theo hai tầng cùng lúc:
#   * `--service-ports` publish những cổng ĐÃ KHAI trong service, mà `mailpit`
#     không khai `ports:` nào — nên nó publish đúng không cổng nào, và
#     `localhost:8025` không kết nối được;
#   * `run` dựng một container THỨ HAI, tức một tiến trình Mailpit riêng với hộp
#     thư rỗng của chính nó. Kể cả cổng có mở thì thứ nhìn thấy vẫn là một hộp
#     thư trống, không phải hộp thư đang nhận thư của hệ thống.
demo-mail:
	$(DEMO) -f deploy/compose.mail.yml up -d --wait mailpit
	@echo ""
	@echo "  Hộp thư thử: http://localhost:$${MAILPIT_PORT:-8025}"
	@echo "  Đóng lại:    make demo-mail-down"
	@echo ""

# Đóng cổng 8025, giữ nguyên thư đã nhận (thư nằm ở volume `mailpitdata`).
demo-mail-down:
	$(DEMO) up -d --wait --force-recreate mailpit
	@echo "  Đã đóng cổng 8025. Thư cũ vẫn còn."
