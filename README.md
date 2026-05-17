# Meetingtime

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A self-hosted real-time web app that helps you run better meetings by tracking speaking time and time spent on each topic, with collaborative note-taking.

Hosts create a meeting in one click, share a short identifier (or a direct join link with an optional password), and see in real time who has spoken, for how long, which topic is currently active, and who is raising their hand. The notes panel lets every co-host edit a shared Markdown document with live remote cursors and syntax-highlighted code blocks, and exports the result as a single `.md` file at the end.

The app is fully offline-capable: no telemetry, no analytics, no external network call at runtime. Fonts ship self-hosted, syntax-highlighting grammars ship bundled, and the only persistence is server memory (which means meetings are ephemeral and confidential by design).

## Quick start

### npm

Prerequisites: Node.js 24 or later.

```bash
npm install
npm run dev
```

The client is served at `http://localhost:5173` and proxies `/socket.io`, `/yjs` and `/manifest.webmanifest` to the API on `http://localhost:3000`.

### Production (single Node process)

```bash
npm install
npm run build
npm start
# → http://localhost:3000 serves both the API and the client bundle.
```

### Docker (local HTTP)

```bash
docker compose up -d --build
# → http://localhost:3000
```

### Docker (HTTPS through a reverse proxy)

Pick one of the variants under `deploy/` depending on the reverse proxy you already run. Each subfolder ships its own `docker-compose.<proxy>.yml`, the proxy config and a `README.md`:

- **Caddy** (automatic Let's Encrypt, simplest): `deploy/caddy/`
- **nginx + certbot** (manual certificate management): `deploy/nginx/`
- **Traefik v3** (Let's Encrypt through Docker labels): `deploy/traefik/`

## Environment variables

The full table lives in [docs/configuration.md](docs/configuration.md). The two variables you should always set in production are `CORS_ORIGIN` (so Socket.IO only accepts your own origin) and a reverse proxy in front of port 3000.

## Architecture

```text
shared/   Wire-level Socket.IO contracts and TypeScript models (shared client/server)
server/   Express 5 + Socket.IO + Yjs bridge
client/   Vite 8 + vanilla TypeScript + CodeMirror 6, split into pages / components / lib
```

In-depth walkthrough in [docs/architecture.md](docs/architecture.md).

## Documentation

- [Architecture](docs/architecture.md)
- [Deployment](docs/deployment.md) and [configuration](docs/configuration.md)
- [Security](docs/security.md)
- [Accessibility](docs/accessibility.md)
- [Keyboard shortcuts](docs/keyboard.md)
- [Internationalisation](docs/i18n.md)
- [Meeting templates (JSON)](docs/meeting_import.md)
- [Development](docs/development.md)
- [Changelog](CHANGELOG.md)

## Contributing

Pull requests are welcome. Conventions and the development workflow live in [CONTRIBUTING.md](CONTRIBUTING.md). Be kind: this project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md).

## Credits

Third-party libraries and their licences are listed in [CREDITS.md](CREDITS.md).

## License

[MIT](LICENSE)
