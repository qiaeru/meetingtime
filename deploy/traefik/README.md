# Meetingtime behind Traefik v3 (HTTPS)

This variant fits hosts that already use Traefik as their reverse proxy and want certificate management driven by Docker labels.

## Prerequisites

- A domain name whose DNS record points to your server.
- An email address for Let's Encrypt notifications.
- Ports 80 and 443 open in your firewall.
- Docker and the Docker Compose plugin installed.

## Steps

1. Export the two required variables and start the stack from the project root:

   ```bash
   export MEETINGTIME_DOMAIN=meetingtime.example.com
   export LETSENCRYPT_EMAIL=you@example.com
   docker compose -f deploy/traefik/docker-compose.traefik.yml up -d
   ```

2. Open `https://meetingtime.example.com`. The first request triggers the ACME HTTP challenge; subsequent requests use the cached certificate.

## Notes

- The Traefik service mounts the Docker socket read-only. If your host already runs Traefik, drop the `traefik` service from the compose file and keep only the `meetingtime` service plus its labels; Traefik will pick the new router up automatically.
- WebSocket upgrades (Socket.IO, Yjs) work out of the box with Traefik's default router because v3 keeps long-lived connections open. No timeout tweak is needed.
- Certificates are persisted in the `letsencrypt` Docker volume. Back it up if you want to keep certificates across host rebuilds.
- `CORS_ORIGIN` defaults to `https://<MEETINGTIME_DOMAIN>`; override only if you embed Meetingtime in a different origin.
