import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  hostTimeoutMs: Number(process.env.HOST_TIMEOUT_MS ?? 30 * 60 * 1000),
  // Delay before an ended meeting (plus its Yjs doc, participants, tokens
  // and password) is wiped from memory. Long enough for a late notes export,
  // short enough to limit confidentiality exposure.
  postEndGcMs: Number(process.env.POST_END_GC_MS ?? 5 * 60 * 1000),
  // Enable only behind a reverse proxy that strips inbound X-Forwarded-*
  // from client requests, otherwise an attacker can spoof their source IP.
  trustProxy: process.env.TRUST_PROXY === "1",
  yjsPath: "/yjs",
  socketIoPath: "/socket.io",
} as const;
