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

# Note: do NOT declare VOLUME here — Railway rejects it and mounts the
# volume at the path configured in the dashboard (set it to /data).
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
