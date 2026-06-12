# Configuration

All operator-facing knobs are environment variables read at boot by `server/src/config.ts` (except `LOG_LEVEL`, read by `server/src/log.ts`). There is no `.env` file shipped; pass the variables through your container runtime (the Docker Compose files in `docker-compose.yml` and under `deploy/` show the canonical layout).

## Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | TCP port the Node process listens on. |
| `CORS_ORIGIN` | `*` | Allowed origin for Socket.IO. Set explicitly in production. |
| `HOST_TIMEOUT_MS` | `1800000` | Idle ms after which an empty meeting is garbage-collected. |
| `POST_END_GC_MS` | `300000` | Delay ms after `meeting:end` before the meeting is wiped. |
| `LOG_LEVEL` | `info` | Pino log level. `debug` for Socket.IO traffic, `warn` to silence. |
| `TRUST_PROXY` | `0` | `1` behind a reverse proxy you control (see warning below). |

`CORS_ORIGIN` defaults to `*` for ease of local development. In production, set it to your own origin (typically `https://meetingtime.example.com`) so cross-origin Socket.IO connections are rejected. All deployment variants under `deploy/` set this automatically based on `MEETINGTIME_DOMAIN`.

`POST_END_GC_MS` is the delay after the host clicks End before the meeting (password, tokens, participants, topics and notes Y.Doc) is wiped from server memory. The default five minutes leaves time for the client to export the Markdown notes from the still-live Yjs document.

`TRUST_PROXY=1` tells Express to honor the `X-Forwarded-*` headers your reverse proxy sets, so the source IP logged by Pino is the real client, not the proxy itself. Enable it only behind a reverse proxy you control and that strips inbound `X-Forwarded-*` headers from client requests. Otherwise a remote caller can spoof `X-Forwarded-For` and the IP that ends up in your logs is whatever they sent. All variants under `deploy/` set this safely.

## Reducing the post-end retention

For environments with strict confidentiality requirements, lower `POST_END_GC_MS` to one minute (`60000`) so the meeting is wiped almost immediately after the host clicks End. Hosts should then export the Markdown notes before clicking End, otherwise they will lose them.

## Adjusting the idle GC

`HOST_TIMEOUT_MS` only affects meetings that are empty (no connected participant) but never officially ended (the host just closed the tab). It will not delete an active meeting. Lowering it to a few minutes is a safe way to reclaim memory aggressively on a small host.

## Reverse-proxy-specific settings

The compose files under `deploy/` accept a `MEETINGTIME_DOMAIN` (Caddy and Traefik) plus `LETSENCRYPT_EMAIL` (Traefik) on top of the variables listed above. Read each variant's `README.md` for the expected command line.
