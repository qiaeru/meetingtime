# Meetingtime behind nginx (HTTPS)

This variant targets hosts that already run nginx and prefer to manage their Let's Encrypt certificates with `certbot`.

## Prerequisites

- Familiarity with nginx.
- A domain name whose DNS record points to your server.
- `certbot` installed on the host.
- Docker and the Docker Compose plugin installed.

## Steps

1. Edit `deploy/nginx/nginx.conf` and replace `meetingtime.example.com` with your real hostname. Adjust the certificate paths if your layout differs from the default.
2. Get the first certificate before starting the stack. nginx cannot start without it, so certbot answers the challenge itself on port 80:

   ```bash
   sudo certbot certonly --standalone -d meetingtime.example.com
   ```

3. Export your domain name and launch the stack:

   ```bash
   sudo mkdir -p /var/www/certbot
   export MEETINGTIME_DOMAIN=meetingtime.example.com
   docker compose -f deploy/nginx/docker-compose.nginx.yml up -d
   ```

## Renewals

Run this from the project root on a schedule. Weekly is a good default. Once the stack runs, nginx holds port 80, so renewals go through the `/var/www/certbot` directory it serves:

```bash
sudo certbot renew --quiet --webroot -w /var/www/certbot \
  --deploy-hook "docker compose -f deploy/nginx/docker-compose.nginx.yml exec nginx nginx -s reload"
```

## Notes

- The nginx container mounts `/etc/letsencrypt` read-only, so renewed certificates are picked up without a container restart. Only the `nginx -s reload` after renewal is needed, and the deploy hook runs it only when a certificate actually changed.
- The provided `nginx.conf` keeps the proxy read and send timeouts at one hour. Without that, the long-lived Socket.IO and Yjs WebSocket connections would be closed by the default sixty-second timeout, kicking hosts and guests out mid-meeting.
- The `X-Forwarded-*` headers are forwarded to the app, which reads them because `TRUST_PROXY=1` is set in the compose file. `X-Forwarded-For` is overwritten with the real client address rather than appended to, so a client cannot spoof its IP to escape the rate limit.
- `CORS_ORIGIN` defaults to `https://<MEETINGTIME_DOMAIN>` so cross-origin Socket.IO and Yjs connections from other sites are rejected.
- To update the stack: `git pull && docker compose -f deploy/nginx/docker-compose.nginx.yml up -d --build`.
