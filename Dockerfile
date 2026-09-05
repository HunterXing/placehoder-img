# placehoder-img Docker 镜像
# 多阶段构建：先装依赖再精简运行时

# 阶段 1：构建
FROM node:22-alpine AS build
WORKDIR /app
# 清掉可能继承的代理配置（本机 ~/.npmrc 有残留代理），指向国内镜像源
RUN npm config set proxy "" && npm config set https-proxy "" && npm config set registry https://registry.npmmirror.com
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY server.js ./
COPY config.js ./
COPY public/ ./public/

# 阶段 2：运行时
FROM node:22-alpine
# sharp 需要 libvips 相关系统库；用国内镜像源加速字体下载
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories && \
    apk add --no-cache \
    libc6-compat \
    vips \
    fontconfig \
    font-noto-cjk \
    ttf-dejavu \
    && rm -rf /var/cache/apk/*
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8227
# 运行时配置说明：
#   - 底部署名 / 广告位等通过 -e PH_* 环境变量，或挂载 ./config.json:/app/config.json 可热更新
#   - 示例: docker run -d -p 8227:8227 \
#             -e PH_ICP='京ICP备00000000号-1' \
#             -e PH_POLICE='京公网安备 11000000000000号' \
#             -e PH_AD_ENABLED=1 \
#             -v $(pwd)/config.json:/app/config.json \
#             placehoder-img
COPY --from=build /app/package.json /app/
COPY --from=build /app/node_modules/ /app/node_modules/
COPY --from=build /app/server.js /app/server.js
COPY --from=build /app/config.js /app/config.js
COPY --from=build /app/public/ /app/public/

# 非 root 运行
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 8227
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8227/100x100 >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
