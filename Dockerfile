# --- build stage: full toolchain in case better-sqlite3 needs to compile ---
FROM node:22 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc --noEmit

# --- runtime stage ---
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
# SQLite database + models.dev cache live here — mount a volume to persist.
VOLUME /app/data
CMD ["npx", "tsx", "src/main.ts"]
