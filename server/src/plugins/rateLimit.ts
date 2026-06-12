import type { IncomingMessage } from "node:http";

// Per-IP connection budget. In-memory only: meant to deter spray attacks,
// not to defeat an attacker rotating IPs. Pair with an upstream WAF or
// reverse proxy for stricter posture. The budget is shared by static HTTP,
// the Socket.IO handshake and the Yjs upgrade; a cold SPA load alone is
// 10-30 requests, so several colleagues behind one office NAT need
// substantially more than a per-person allowance.
const WINDOW_MS = 60_000;
const LIMIT = 300;

interface Counter {
  windowStart: number;
  count: number;
}
const buckets = new Map<string, Counter>();

setInterval(() => {
  const now = Date.now();
  for (const [ip, c] of buckets) {
    if (now - c.windowStart > WINDOW_MS) buckets.delete(ip);
  }
}, WINDOW_MS).unref?.();

export function allowIP(ip: string | undefined): boolean {
  if (!ip) return true;
  const now = Date.now();
  const c = buckets.get(ip);
  if (!c || now - c.windowStart > WINDOW_MS) {
    buckets.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  c.count++;
  return c.count <= LIMIT;
}

export function ipFromRequest(req: IncomingMessage, trustProxy: boolean): string | undefined {
  if (trustProxy) {
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.length > 0) {
      return xff.split(",")[0].trim();
    }
  }
  return req.socket.remoteAddress ?? undefined;
}

// Per-socket event budget. Without it, one authenticated peer can spam any
// cheap event (e.g. speaker:grant) at line rate; each one triggers a
// broadcastState to N participants, turning one emit into N copies of the
// full meeting JSON.
const SOCKET_WINDOW_MS = 10_000;
const SOCKET_LIMIT = 80;

interface Window {
  windowStart: number;
  count: number;
}
const socketWindows = new WeakMap<object, Window>();

export function allowSocketEvent(socketKey: object): boolean {
  const now = Date.now();
  const w = socketWindows.get(socketKey);
  if (!w || now - w.windowStart > SOCKET_WINDOW_MS) {
    socketWindows.set(socketKey, { windowStart: now, count: 1 });
    return true;
  }
  w.count++;
  return w.count <= SOCKET_LIMIT;
}
