# CIと同じNode 22系（.github/workflows/ci.yml に合わせる）。
FROM mcr.microsoft.com/devcontainers/javascript-node:22-bookworm

# cloudflared: CLAUDE.md「実機での確認」で使うトンネル。
# Service Worker と navigator.share は secure context 必須で、LAN の http:// では動かないため、
# コンテナ内から `cloudflared tunnel --url http://localhost:4173` を叩けるようにしておく。
RUN mkdir -p --mode=0755 /usr/share/keyrings \
    && curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg \
    && echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
        > /etc/apt/sources.list.d/cloudflared.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends cloudflared \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
