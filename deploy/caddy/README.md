# Meetingtime behind Caddy (HTTPS)

This is the simplest way to expose Meetingtime over HTTPS. Caddy negotiates a Let's Encrypt certificate automatically on first start, with no extra tooling.

## Prerequisites

- A domain name whose DNS record points to your server's public IP address.
- Ports 80 and 443 open in your firewall.
- Docker and the Docker Compose plugin installed.

## Steps

1. Export your domain name and start the stack from the project root:

   ```bash
   export MEETINGTIME_DOMAIN=meetingtime.example.com
   docker compose -f deploy/caddy/docker-compose.caddy.yml up -d
   ```

2. Open `https://meetingtime.example.com`. The host who creates a meeting receives a shareable link of the form `https://meetingtime.example.com/#/join?id=XXXX-XXXX` that other participants can open directly.

## Notes

- `TRUST_PROXY=1` is set automatically so Express honours the `X-Forwarded-*` headers Caddy sets. WebSocket upgrades for Socket.IO and the Yjs notes channel are proxied transparently because Caddy speaks HTTP/2 and HTTP/3 end to end.
- `CORS_ORIGIN` defaults to `https://<MEETINGTIME_DOMAIN>` so cross-origin Socket.IO requests from other hosts are rejected. Override it explicitly only if you embed Meetingtime in a different origin.
- Caddy stores its generated certificates in the `caddy_data` Docker volume. Do not delete the volume, because the next start would then trigger a fresh ACME challenge and possibly run into Let's Encrypt rate limits.
- To update the stack: `docker compose -f deploy/caddy/docker-compose.caddy.yml pull && docker compose -f deploy/caddy/docker-compose.caddy.yml up -d`.
