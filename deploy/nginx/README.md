# Meetingtime behind nginx (HTTPS)

This variant targets hosts that already run nginx and prefer to manage their Let's Encrypt certificates with `certbot`.

## Prerequisites

- Familiarity with nginx.
- A domain name whose DNS record points to your server.
- An existing or freshly issued Let's Encrypt certificate in `/etc/letsencrypt/live/<your-domain>/`.
- Docker and the Docker Compose plugin installed.

## Steps

1. Edit `deploy/nginx/nginx.conf` and replace `meetingtime.example.com` with your real hostname. Adjust the certificate paths if your layout differs from the default.
2. Generate the certificate once, outside of Docker, for example:

   ```bash
   certbot certonly --webroot -w /var/www/certbot -d meetingtime.example.com
   ```

3. Launch the stack:

   ```bash
   docker compose -f deploy/nginx/docker-compose.nginx.yml up -d
   ```

## Renewals

Schedule `certbot renew --quiet && docker compose -f deploy/nginx/docker-compose.nginx.yml exec nginx nginx -s reload` to run weekly.

## Notes

- The nginx container mounts `/etc/letsencrypt` read-only, so renewed certificates are picked up without a container restart. Only the `nginx -s reload` after renewal is needed.
- The provided `nginx.conf` keeps the proxy read and send timeouts at one hour. Without that, the long-lived Socket.IO and Yjs WebSocket connections would be closed by the default sixty-second timeout, kicking hosts and guests out mid-meeting.
- The `X-Forwarded-*` headers are forwarded to the app, which reads them because `TRUST_PROXY=1` is set in the compose file.
