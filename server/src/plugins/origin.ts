import { config } from "../config.js";

// Browsers always send Origin on cross-site WebSocket handshakes and CORS
// requests, and CORS alone never stops a WebSocket, so both real-time
// channels check it themselves to block Cross-Site WebSocket Hijacking.
export function isOriginAllowed(origin: string | undefined): boolean {
  if (config.corsOrigin === "*") return true;
  if (!origin) return false;
  return origin === config.corsOrigin;
}
