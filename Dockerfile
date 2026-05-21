FROM oven/bun:1.3.5-slim

WORKDIR /app

# Install deps first (cached layer)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# App source
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
