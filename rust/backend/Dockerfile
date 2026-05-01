# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM rust:1.88-slim AS builder

# System dependencies required by chromiumoxide and sqlx
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY Cargo.toml ./
COPY shared/Cargo.toml shared/
COPY backend/Cargo.toml backend/

# Remove 'frontend' from workspace members so wasm deps aren't pulled in
RUN sed -i 's/, *"frontend"//g; s/"frontend", *//g' Cargo.toml

# Create stub src files so Cargo can resolve the workspace graph
RUN mkdir -p shared/src backend/src \
    && echo 'pub fn stub() {}' > shared/src/lib.rs \
    && echo 'fn main() {}' > backend/src/main.rs

# Fetch and compile dependencies only (cached layer)
RUN cargo build --release --package backend 2>&1 | tail -5 || true

# Now copy the real source code
COPY shared/src shared/src
COPY backend/src backend/src
COPY migrations migrations

# Touch files to force recompile of our crates
RUN touch shared/src/lib.rs backend/src/main.rs

# Build the real binary
RUN cargo build --release --package backend

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

# Install Chromium (headless) + dependencies for PDF rendering
RUN apt-get update && apt-get install -y \
    chromium \
    ca-certificates \
    libssl3 \
    fonts-liberation \
    fonts-noto \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1001 appuser

WORKDIR /app

# Copy the compiled binary
COPY --from=builder /app/target/release/backend ./llcm-backend

# Copy migrations (run at startup)
COPY --from=builder /app/migrations ./migrations

# Uploads directory
RUN mkdir -p uploads && chown -R appuser:appuser /app

USER appuser

# Tell chromiumoxide where to find Chromium
ENV CHROMIUM_PATH=/usr/bin/chromium

EXPOSE 4000

ENTRYPOINT ["./llcm-backend"]
