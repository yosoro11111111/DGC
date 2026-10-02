FROM node:22-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --omit=dev

# 复制服务端及相关代码
COPY server/ ./server/

# 默认监听端口
ENV PORT=8787
EXPOSE 8787

# 启动对战房间及账户服务器
CMD ["node", "server/room-server.mjs"]
