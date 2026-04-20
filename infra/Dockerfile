# ── Stage 1: Frontend build ─────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Rust build ─────────────────────────────────────────
FROM rust:1.88-slim-bookworm AS backend
WORKDIR /app

RUN apt-get update && apt-get install -y \
    pkg-config \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Fetch dependencies (cached layer unless Cargo.toml/Cargo.lock changes)
COPY backend/Cargo.toml backend/Cargo.lock ./
RUN cargo fetch

# Build
COPY backend/src ./src
COPY backend/migrations ./migrations
RUN cargo build --release

# ── Stage 3: Runtime ────────────────────────────────────────────
FROM debian:bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=backend /app/target/release/nilla ./
COPY --from=backend /app/migrations ./migrations
COPY --from=frontend /app/dist ./dist

RUN addgroup --system app && adduser --system --ingroup app app
RUN mkdir -p /data/uploads && chown -R app:app /app /data
USER app

EXPOSE 8080

CMD ["./nilla"]
