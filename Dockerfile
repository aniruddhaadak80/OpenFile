# syntax=docker/dockerfile:1.7
# OpenFile container image: ghcr.io/aniruddhaadak80/openfile
#
#   docker run --rm -p 8080:8080 ghcr.io/aniruddhaadak80/openfile:latest
#
# Stage 1 builds the static app with Node. It runs on the build machine's own platform because the
# output (HTML, JS, CSS, wasm) is the same for every CPU, so a multi-arch build compiles it once.
# Stage 2 is a small Caddy server that runs as a non-root user and only serves files.

ARG NODE_VERSION=22
ARG CADDY_VERSION=2.11

FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
ENV CI=true \
    NODE_OPTIONS=--max-old-space-size=6144 \
    npm_config_fund=false \
    npm_config_audit=false \
    npm_config_update_notifier=false \
    ONNXRUNTIME_NODE_INSTALL_CUDA=skip
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
# the app is served from the domain root inside the container
RUN npm run build \
 && test -f dist/index.html \
 && test -f dist/sw.js \
 && node packages/container/precompress.mjs dist

FROM caddy:${CADDY_VERSION}-alpine AS runtime
ARG VERSION=dev
ARG REVISION=unknown
ARG CREATED=unknown
LABEL org.opencontainers.image.title="OpenFile" \
      org.opencontainers.image.description="OpenFile: 300+ free, private, in-browser tools for PDF, images, video, audio and developers. Files never leave the browser." \
      org.opencontainers.image.source="https://github.com/aniruddhaadak80/OpenFile" \
      org.opencontainers.image.url="https://github.com/aniruddhaadak80/OpenFile" \
      org.opencontainers.image.documentation="https://github.com/aniruddhaadak80/OpenFile/blob/main/docs/SELF_HOSTING.md" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Aniruddha Adak" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}"

# unprivileged user that owns only Caddy's data and config dirs
# copying the binary drops its file capability (cap_net_bind_service), so the server also starts with
# --cap-drop ALL and no-new-privileges; it listens on 8080 and never needs a low port
RUN cp /usr/bin/caddy /usr/bin/caddy.tmp && mv -f /usr/bin/caddy.tmp /usr/bin/caddy && chmod 0755 /usr/bin/caddy \
 && addgroup -S -g 10001 openfile \
 && adduser -S -D -H -u 10001 -G openfile -s /sbin/nologin openfile \
 && mkdir -p /data /config \
 && chown -R 10001:10001 /data /config
ENV PORT=8080 \
    OPENFILE_CROSS_ORIGIN_ISOLATION=false \
    XDG_DATA_HOME=/data \
    XDG_CONFIG_HOME=/config

COPY --chown=root:root --chmod=0644 packages/container/Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=root:root /app/dist /srv

USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
STOPSIGNAL SIGTERM
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
