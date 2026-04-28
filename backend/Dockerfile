# ============ build 阶段：编译 better-sqlite3 原生模块 ============
FROM node:20-alpine AS builder

WORKDIR /app

# 编译原生模块所需依赖（python/g++/make）；编译完会被 runtime 阶段丢弃
RUN apk add --no-cache python3 make g++

# 先拷贝清单文件以利用 docker 层缓存
COPY package.json package-lock.json* ./

# 仅安装生产依赖。--ignore-scripts 之后再单独触发 better-sqlite3 的编译，
# 避免在某些镜像源上的偶发 postinstall 卡顿
RUN npm ci --omit=dev

# 拷贝源码（tests 等已被 .dockerignore 过滤）
COPY . .

# ============ runtime 阶段：仅含运行所需 ============
FROM node:20-alpine AS runtime

# tini 做 PID 1，正确处理信号；wget 健康检查用
RUN apk add --no-cache tini wget

WORKDIR /app

# 使用非 root 用户提升安全
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs nodejs

# 从 builder 拷贝已构建的依赖与源码
COPY --from=builder --chown=nodejs:nodejs /app /app

# 数据库目录（与 .env 中 DB_FILE 默认值对应）
# 上传目录（KYC / 提现凭证图片）：预建子目录并交给 nodejs 用户，避免运行时 EACCES
RUN mkdir -p /app/data /app/uploads/kyc /app/uploads/withdraw \
 && chown -R nodejs:nodejs /app/data /app/uploads
VOLUME ["/app/data", "/app/uploads"]

USER nodejs

ENV NODE_ENV=production \
    PORT=3000 \
    DB_FILE=/app/data/exchange.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/symbols >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
