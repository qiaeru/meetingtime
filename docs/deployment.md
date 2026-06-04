# Deployment

Meetingtime ships as a single Docker image. Everything (API, WebSocket server, Yjs notes bridge, static client bundle) runs in one Node process on one port, so any container host or reverse proxy can serve it.

## Quick start (local HTTP)

```bash
docker compose up -d
```

The root `docker-compose.yml` exposes the app on `http://localhost:3000`. This is suitable for local trials and for trusted internal networks; do not expose it to the internet without TLS.

## Production (HTTPS through a reverse proxy)

Three variants live under `deploy/`. Pick the one that matches the reverse proxy you already run, or the one whose certificate management you prefer.

| Variant   | Certificate flow                         | When to pick it                                                                     |
| --------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `caddy`   | Automatic Let's Encrypt, no extra config | Greenfield deployments where you want HTTPS to work out of the box.            |
| `nginx`   | `certbot` outside Docker                 | Hosts where you already run nginx and want to keep `certbot` doing the renewals.    |
| `traefik` | Let's Encrypt via Docker labels          | Stacks that already use Traefik as their reverse proxy and label-based discovery.   |

Each subfolder under `deploy/` ships its own `docker-compose.<proxy>.yml`, the proxy config and a `README.md` with the exact commands. The compose files set `TRUST_PROXY=1` so Express honours the `X-Forwarded-*` headers your proxy sets.

## Environment variables

See `configuration.md` for the full table. The two variables you should always set in production are `CORS_ORIGIN` (so Socket.IO only accepts your own origin) and a reverse proxy in front of port 3000.

## WebSocket considerations

Meetingtime keeps two long-lived WebSocket connections per participant: one for Socket.IO and one for the Yjs notes bridge. Default nginx proxy timeouts (60 seconds) will kick hosts and guests out mid-meeting. The provided `deploy/nginx/nginx.conf` raises `proxy_read_timeout` and `proxy_send_timeout` to one hour. Caddy and Traefik handle long-lived connections natively and need no tweak.

## Updating

Pull the new image and recreate the container:

```bash
docker compose -f deploy/<proxy>/docker-compose.<proxy>.yml pull
docker compose -f deploy/<proxy>/docker-compose.<proxy>.yml up -d
```

Meetings live in server memory, so a redeploy disconnects everyone currently in a meeting. The client reconnects automatically and rejoins through the persisted session token, but any meeting that was running ends up gone. Plan upgrades around quiet hours.

## Backups

There is nothing to back up. No database, no persistent volume (the compose files use bind mounts only for the reverse proxy's certificates). The notes a host did not export end up garbage-collected with the meeting.
