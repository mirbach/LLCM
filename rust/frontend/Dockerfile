# Stage 1: Build with Trunk
FROM rust:1.88-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install wasm target
RUN rustup target add wasm32-unknown-unknown

# Install Trunk
RUN cargo install trunk --locked

WORKDIR /app
COPY Cargo.toml ./
COPY shared/ shared/
COPY frontend/ frontend/

# Remove 'backend' from workspace members so it isn't required
RUN sed -i 's/, *"backend"//g; s/"backend", *//g' Cargo.toml

WORKDIR /app/frontend
# Run cargo directly first to surface compile errors clearly, then trunk
RUN cargo build --target=wasm32-unknown-unknown --release 2>&1 || true
RUN trunk build --release

# Stage 2: Serve with nginx
FROM nginx:1.27-alpine AS runtime

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s CMD wget -qO- http://127.0.0.1/health || exit 1
