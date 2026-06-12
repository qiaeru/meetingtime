# Contributing to Meetingtime

Thank you for considering a contribution. The project is intentionally small and must stay approachable to non-technical maintainers who run their own instance. Changes that keep it simple are the ones most likely to land.

## Ground rules

- **English everywhere in the source tree.** This applies to comments, commit messages, pull request descriptions, documentation, identifiers (variables, functions, route paths, Socket.IO event names) and anything else a reviewer reads. The only French strings allowed in the codebase live in `client/src/i18n/locales/fr.json`.
- **No external network calls at runtime.** The app is fully self-contained and must keep running on an air-gapped host. Fonts are self-hosted through `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono`; syntax-highlighting grammars and themes ship bundled via Shiki; nothing else is fetched from a third party.
- **No new mandatory tooling** such as linters, formatters or test frameworks that a non-technical maintainer would have to run locally. Build-time tools like Vite and `tsc -b` are fine as long as they remain invisible inside the Docker build.
- **No telemetry, no analytics, no third-party trackers.**

## Development setup

Prerequisites:

- Node.js 24 or later (the version pinned by the Dockerfile).
- Docker with the Compose plugin, optional for frontend-only work.
- A modern browser.

The backend has zero native dependencies: Express 5, Socket.IO and Yjs are pure JavaScript, and there is no database. Nothing to compile, no prebuilt binary, and no toolchain beyond Node itself.

```bash
# Clone
git clone https://github.com/qiaeru/meetingtime.git
cd meetingtime

# Install every workspace in one pass
npm install

# Run server (tsx watch) + Vite client in parallel
npm run dev
```

The client is served at `http://localhost:5173` and proxies `/socket.io`, `/yjs` and `/manifest.webmanifest` to the API on port 3000. Open two browser windows to validate multi-participant scenarios manually.

## Workflow

Branch from `main`, open a pull request, and let the `build` CI check pass. Keep commits atomic (one feature, one bug-fix, one refactor) and use Conventional Commit prefixes (`fix:`, `feat:`, `chore:`, `docs:`, `refactor:`) optionally scoped with the touched area (`fix(notes):`, `feat(spotlight):`). Pull request titles follow the same rule and stay at or below seventy characters.

Before pushing, review every added comment in the diff, update the relevant `docs/*.md` if the change affects public behavior, and tighten the `[Unreleased]` section of `CHANGELOG.md`.

## Code style

- Components are functions returning a handle `{ el, update(), tick?, stop?, destroy? }`. No UI framework, no class hierarchies.
- State lives in small home-grown observables under `client/src/state/`.
- Every user-visible string goes through `t("key")`; never hardcode natural-language strings in code or HTML.
- No `innerHTML` for arbitrary content. Sanitised Markdown (DOMPurify) and Lucide inline SVG are the only allowed exceptions.

## Documentation

If the change touches public behavior, configuration, the Socket.IO event surface, the meeting state machine, or anything a host or contributor might look up later, update both `CHANGELOG.md` (under `[Unreleased]`) and the relevant page under `docs/`. Pick the page the change belongs to (architecture, deployment, configuration, security, i18n, accessibility, keyboard or meeting_import).

## Reporting issues

Open a GitHub issue with a minimal reproduction and the browser plus operating system you observed it on. For security-sensitive reports, open a private security advisory on GitHub instead of a public issue.

## License

By submitting a contribution, you agree that it is released under the MIT license shipped with this repo.
