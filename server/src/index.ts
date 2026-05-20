import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import compression from "compression";
import cors from "cors";
import { Server as IOServer } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@meetingtime/shared";
import { config } from "./config.js";
import { log } from "./log.js";
import { pickLocale } from "./lib/locales.js";
import { allowIP, ipFromRequest } from "./plugins/rateLimit.js";
import { securityHeaders } from "./plugins/securityHeaders.js";
import { registerHandlers } from "./socket/handlers.js";
import { attachYjsBridge } from "./yjs/ywsBridge.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
if (config.trustProxy) app.set("trust proxy", 1);
app.use(securityHeaders());
app.use(cors({ origin: config.corsOrigin }));
// gzip the JS bundle, CSS, locale JSON and the SPA index. The default 1 KB
// threshold skips tiny bodies where the encoder overhead beats the savings.
// Helps self-hosted deployments served over a tunnel or VPN where wire bytes
// dominate the cold-start cost.
app.use(compression({ threshold: 1024 }));
// HTTP path of the per-IP gate. WS upgrades hit the same allowIP() in
// io.use() and in the Yjs bridge, so the limit cannot be bypassed by
// jumping straight to the upgrade.
app.use((req, res, next) => {
  if (!allowIP(ipFromRequest(req, config.trustProxy))) {
    res.status(429).set("Retry-After", "60").end("Too Many Requests");
    return;
  }
  next();
});
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// __dirname is server/dist/ in production but server/src/ under `tsx watch`;
// fall back to the source client/public/ so dev still serves the manifests.
const distPublic = path.resolve(__dirname, "public");
const devPublic = path.resolve(__dirname, "..", "..", "client", "public");
const publicDir = existsSync(distPublic) ? distPublic : devPublic;

// One manifest file per locale on disk; the locale-neutral URL goes through
// content negotiation here. Must be declared before express.static so the
// static middleware doesn't try to resolve /manifest.webmanifest first.
app.get("/manifest.webmanifest", (req, res) => {
  const locale = pickLocale(req.headers["accept-language"]);
  const file = path.join(publicDir, `manifest.${locale}.webmanifest`);
  try {
    const data = readFileSync(file, "utf8");
    res.type("application/manifest+json");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(data);
  } catch {
    res.status(404).end();
  }
});

app.use(express.static(publicDir, { fallthrough: true }));
// SPA fallback. Express 5 reserves `*` for path-to-regexp v8, hence the
// middleware shape instead of `app.get("*", ...)`.
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  if (req.path.startsWith("/socket.io") || req.path.startsWith(config.yjsPath)) return next();
  res.sendFile(path.join(publicDir, "index.html"), (err) => {
    if (err) next();
  });
});

const httpServer = createServer(app);

const io = new IOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  path: config.socketIoPath,
  cors: { origin: config.corsOrigin },
  // Tighten the default 1 MB cap so a malicious peer cannot fill memory
  // with one giant message. Real meeting events are <10 KB.
  maxHttpBufferSize: 100_000,
});
io.use((socket, next) => {
  const ip = ipFromRequest(socket.request, config.trustProxy);
  if (!allowIP(ip)) {
    next(new Error("rate_limited"));
    return;
  }
  next();
});
registerHandlers(io);

const yjsBridge = attachYjsBridge(httpServer);

httpServer.listen(config.port, () => {
  log.info({ port: config.port }, "Meetingtime server listening");
});

// On SIGTERM (container stop) / SIGINT (Ctrl-C) we stop accepting new
// connections, disconnect everyone cleanly (so the client banner says
// "disconnected" instead of hanging), then exit. A hard 10 s deadline
// prevents a stuck connection from blocking the container restart.

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "shutting down");

  const hardExit = setTimeout(() => {
    log.warn("graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000);
  hardExit.unref();

  httpServer.close((err) => {
    if (err) log.warn({ err: err.message }, "http server close error");
  });
  io.disconnectSockets(true);
  io.close();
  yjsBridge.close();

  // Give in-flight close frames a tick to flush, then exit cleanly.
  setTimeout(() => process.exit(0), 500).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Crashes: log with as much context as we can, then exit so the orchestrator
// can restart on a clean slate. Swallowing them would leave the process in
// an unknown state where data corruption becomes likely.
process.on("uncaughtException", (err) => {
  log.fatal({ err: err.message, stack: err.stack }, "uncaught exception");
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  log.fatal({ err: err.message, stack: err.stack }, "unhandled promise rejection");
  shutdown("unhandledRejection");
});
