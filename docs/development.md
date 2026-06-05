# Development

## Prerequisites

Node.js 24 or later is the only mandatory dependency. npm ships with Node, so no separate installation is needed.

## Install

From the repo root, run `npm install`. This walks the three workspaces (`shared`, `server`, `client`) and resolves every dependency in one pass. On Windows, the npm workspace symlinks occasionally desync after a fresh clone and the server build will then complain that it cannot resolve `@meetingtime/shared`: rerun `npm install` and the link is repaired.

## Root scripts

| Command | Effect |
| --- | --- |
| `npm run dev` | Starts the server (`tsx watch`) and the Vite client in parallel. Client on `:5173`, API on `:3000`. |
| `npm run build` | Builds in order `shared` → `client` → `server`. Client output lands in `server/dist/public/`. |
| `npm start` | Runs the built single-process server (serves both the API and the static client bundle). |
| `npm run typecheck` | Runs `tsc -b shared server client` using TypeScript project references. |
| `npm run lint` | ESLint flat config (`eslint.config.js`). |
| `npm run format` | Prettier. |

## Workspace boundaries

`shared/` ships the wire-level TypeScript contracts (models, Socket.IO event signatures, permissions). It has no runtime dependencies and can be imported from either Node or the browser. `server/` is the Express 5 backend plus the Socket.IO and Yjs servers; it builds to `server/dist/`. `client/` is the Vite 8 + vanilla TypeScript frontend; it builds to `server/dist/public/` so the server can serve it as static assets in production.

## Conventions

No heavyweight UI framework on the client: components are functions that return an `HTMLElement` plus an `update()` / `tick()` / `destroy()` handle. Global state lives as small home-grown observables in `client/src/state/`. Every user-visible string goes through `t("key")` (see `i18n.md`). No mutable strings are injected via `innerHTML` outside of the sanitised Markdown preview (DOMPurify) and the Lucide inline SVG helper. Required form fields carry the `.required` class on the `<legend>` or `<span>`, and CSS adds the red asterisk through a `::after` rule. ESLint runs as a flat config (ESLint 9 with typescript-eslint 8).

## Adding a Socket.IO event

1. Add the signature in `shared/src/events.ts`.
2. Add the state-machine method on `Meeting` in `server/src/meetings/Meeting.ts` (all state mutations live there, never in the handler).
3. Wire the handler in `server/src/socket/handlers.ts`: authorize via `requireHost` if it is a host-only event, call the method, then `broadcastState`.
4. Rebuild `shared` (`npm run dev`'s `tsx watch` handles it automatically), then emit from the client.

## Tests

No automated test suite ships with this release. The app is real-time UI on top of a fairly small state machine; manual multi-participant scenarios (two browser windows) are the validation path. Recommended for the future: Playwright with multiple browser contexts so the multi-participant flow can be replayed in CI.
