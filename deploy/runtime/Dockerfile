# syntax=docker/dockerfile:1
#
# Multi-stage build: compile the engine to a native Linux binary, then ship only
# that binary on debian-slim — the same binary the VM runs under systemd. The
# build context is the engine submodule (set in docker-compose.yml). The Pack is
# not baked in; it's mounted at /data/pack at run time.

# ---- builder ----
FROM rust:bookworm AS builder
WORKDIR /app
# Cache the cargo registry + target across builds; copy the binary out before the
# stage ends (cache mounts aren't persisted in layers).
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release --bin open-geocode \
 && cp target/release/open-geocode /usr/local/bin/open-geocode

# ---- runtime ----
# bookworm-slim matches the builder's glibc; the serve path is pure-Rust, so no
# extra packages are needed.
FROM debian:bookworm-slim
RUN useradd --system --uid 10001 oguser
COPY --from=builder /usr/local/bin/open-geocode /usr/local/bin/open-geocode
USER oguser
EXPOSE 8080
# No demo/ or basemap in the image, so serve runs API-only. 0.0.0.0 is correct
# inside the container's own network namespace.
ENTRYPOINT ["open-geocode", "serve", "--pack", "/data/pack", "--bind", "0.0.0.0:8080"]
