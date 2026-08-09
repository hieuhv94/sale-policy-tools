# Ảnh chạy thật, dùng chung cho cả mười service Node.
#
# MỘT ảnh cho mười service, chọn theo biến `SERVICE` lúc chạy. Mười Dockerfile
# gần giống nhau là mười chỗ phải nhớ cập nhật khi đổi phiên bản Node, và chỗ bị
# quên sẽ chạy bình thường trên một phiên bản khác phần còn lại.
#
# CHẠY THẲNG TypeScript qua swc, không biên dịch sẵn ra JavaScript.
#
# Và KHÔNG dùng `tsx`: nó chạy bằng esbuild, mà esbuild không sinh được
# `emitDecoratorMetadata` — thứ tiêm phụ thuộc của NestJS đọc để biết constructor
# cần gì. Hỏng theo kiểu tệ nhất: service khởi động sạch sẽ, log đẹp, rồi MỌI
# request chết với "Cannot read properties of undefined (reading
# 'getAllAndOverride')" vì guard nhận `undefined` thay cho `Reflector`.
#
# `@swc-node/register` cũng đã thử và cũng hỏng (không phân giải nổi các đường
# dẫn `./x.js` trỏ tới tệp `.ts`). `vite-node` dùng ĐÚNG pipeline swc mà 493 test
# đang chạy qua, nên nó là con đường duy nhất trong repo này đã được chứng minh.
#
# Món nợ còn lại: bản dựng thật nên biên dịch sẵn ra JavaScript để bỏ hẳn tầng
# biến đổi lúc chạy. Ghi ở P8.
FROM node:22.9-alpine

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
# `curl` cho healthcheck; `tini` để tín hiệu TERM tới được tiến trình Node thay
# vì bị PID 1 nuốt mất — không có nó thì `docker stop` luôn phải chờ hết 10 giây
# rồi giết cứng, và các bước tắt êm ở `onModuleDestroy` không chạy.
RUN apk add --no-cache curl tini

WORKDIR /app
COPY . .

# Cài ĐẦY ĐỦ, gồm cả devDependencies: `tsx` nằm ở đó và là thứ chạy service.
RUN pnpm install --frozen-lockfile --config.store-dir=/pnpm-store \
 && rm -rf /pnpm-store

# Đặt SAU khi cài. Đặt trước thì pnpm bỏ qua devDependencies và ảnh không có tsx.
#
# `production` bật hai chốt chặn ở mã nguồn: thiếu file bí mật thì DỪNG thay vì
# dùng mật khẩu mặc định, và thiếu file khoá JWT cũng DỪNG thay vì mỗi service
# tự sinh một khoá riêng rồi không service nào xác minh nổi token của service kia.
ENV NODE_ENV=production

ARG SERVICE=gateway
ENV SERVICE=${SERVICE}

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "exec pnpm exec vite-node --config vite.service.config.ts services/${SERVICE}/src/main.ts"]
