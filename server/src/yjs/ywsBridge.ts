import type { IncomingMessage } from "node:http";
import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { meetingStore } from "../meetings/MeetingStore.js";
import { log } from "../log.js";
import { config } from "../config.js";
import { allowIP, ipFromRequest } from "../plugins/rateLimit.js";

function isOriginAllowed(origin: string | undefined): boolean {
  if (config.corsOrigin === "*") return true;
  if (!origin) return false;
  return origin === config.corsOrigin;
}

const MAX_WS_PAYLOAD = 64 * 1024;
const PING_INTERVAL_MS = 30_000;
const WS_MSG_LIMIT = 200;
const WS_MSG_WINDOW_MS = 10_000;
const MAX_MEETING_ID_LEN = 32;

// Minimal y-websocket-compatible bridge. Wire format: one varuint message
// type (MESSAGE_SYNC | MESSAGE_AWARENESS) followed by the corresponding
// y-protocols payload. Sync writes (STEP_2/UPDATE) require participant.isHost;
// awareness updates are always accepted (cursor presence is benign).
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

interface DocState {
  ydoc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Set<number>>;
  // Kept so releaseDocState can detach it; awareness.destroy() clears its own
  // observers, but the ydoc "update" listener must be removed explicitly.
  onUpdate: (update: Uint8Array, origin: unknown) => void;
}

const docStates = new Map<string, DocState>();

// Called by MeetingStore on deletion so dead DocState entries don't
// accumulate across meeting churn.
export function releaseDocState(meetingId: string): void {
  const state = docStates.get(meetingId);
  if (!state) return;
  for (const ws of state.conns.keys()) {
    try { ws.close(); } catch { /* socket may already be gone */ }
  }
  state.ydoc.off("update", state.onUpdate);
  state.awareness.destroy();
  docStates.delete(meetingId);
}

function getOrCreateDocState(meetingId: string): DocState | undefined {
  let state = docStates.get(meetingId);
  if (state) return state;
  const ydoc = meetingStore.getYDoc(meetingId);
  if (!ydoc) return undefined;
  const awareness = new awarenessProtocol.Awareness(ydoc);
  const conns = new Map<WebSocket, Set<number>>();

  const onUpdate = (update: Uint8Array, origin: unknown): void => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const msg = encoding.toUint8Array(encoder);
    for (const ws of conns.keys()) {
      if (ws !== origin) safeSend(ws, msg);
    }
  };
  ydoc.on("update", onUpdate);

  state = { ydoc, awareness, conns, onUpdate };
  docStates.set(meetingId, state);

  awareness.on(
    "update",
    ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      // Track which awareness clientIDs each connection controls, so cleanup
      // can remove them the moment the socket closes; otherwise the departed
      // user's cursor lingers until the 30 s awareness timeout.
      const controlled = conns.get(origin as WebSocket);
      if (controlled) {
        for (const clientID of added) controlled.add(clientID);
        for (const clientID of removed) controlled.delete(clientID);
      }
      const changed = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
      const msg = encoding.toUint8Array(encoder);
      for (const ws of conns.keys()) {
        if (ws !== origin) safeSend(ws, msg);
      }
    }
  );

  return state;
}

function safeSend(ws: WebSocket, data: Uint8Array): void {
  try {
    if (ws.readyState === ws.OPEN) ws.send(data);
  } catch (e) {
    log.warn({ err: (e as Error).message }, "yjs ws send failed");
  }
}

function parseUpgrade(req: IncomingMessage): { meetingId: string; token: string } | undefined {
  if (!req.url) return undefined;
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith(`${config.yjsPath}/`)) return undefined;
  const meetingId = url.pathname.slice(config.yjsPath.length + 1).replace(/\/$/, "");
  const token = url.searchParams.get("token") ?? "";
  // Cap path and token before any map lookup so megabyte-sized garbage can't
  // even reach the meeting store.
  if (!meetingId || meetingId.length > MAX_MEETING_ID_LEN) return undefined;
  if (!token || token.length > 128) return undefined;
  return { meetingId, token };
}

export function attachYjsBridge(httpServer: HttpServer): { close: () => void } {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD });

  httpServer.on("upgrade", (req, socket, head) => {
    const parsed = parseUpgrade(req);
    if (!parsed) return;
    if (!allowIP(ipFromRequest(req, config.trustProxy))) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\nRetry-After: 60\r\n\r\n");
      socket.destroy();
      return;
    }
    // Origin check blocks Cross-Site WebSocket Hijacking before any auth.
    if (!isOriginAllowed(req.headers.origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    const meeting = meetingStore.get(parsed.meetingId);
    const participant = meeting?.participantByToken(parsed.token);
    if (!meeting || !participant) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, parsed.meetingId, participant.id);
    });
  });

  wss.on(
    "connection",
    (ws: WebSocket, _req: IncomingMessage, meetingId: string, participantId: string) => {
      const state = getOrCreateDocState(meetingId);
      if (!state) {
        ws.close();
        return;
      }
      const meeting = meetingStore.get(meetingId)!;

      state.conns.set(ws, new Set());

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(encoder, state.ydoc);
      safeSend(ws, encoding.toUint8Array(encoder));

      const awarenessStates = state.awareness.getStates();
      if (awarenessStates.size > 0) {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          enc,
          awarenessProtocol.encodeAwarenessUpdate(state.awareness, Array.from(awarenessStates.keys()))
        );
        safeSend(ws, encoding.toUint8Array(enc));
      }

      // Each incoming message is decoded and rebroadcast to every other peer
      // in the room, so the amplification factor justifies a per-connection
      // budget on top of the per-IP one.
      let msgWindowStart = Date.now();
      let msgCount = 0;
      const allowMessage = (): boolean => {
        const now = Date.now();
        if (now - msgWindowStart > WS_MSG_WINDOW_MS) {
          msgWindowStart = now;
          msgCount = 1;
          return true;
        }
        msgCount++;
        return msgCount <= WS_MSG_LIMIT;
      };

      ws.on("message", (raw: Buffer) => {
        if (!allowMessage()) {
          log.warn({ meetingId, participantId }, "yjs ws message budget exceeded; terminating");
          try { ws.terminate(); } catch { /* already gone */ }
          return;
        }
        try {
          const data = new Uint8Array(raw);
          const decoder = decoding.createDecoder(data);
          const encoder = encoding.createEncoder();
          const messageType = decoding.readVarUint(decoder);

          switch (messageType) {
            case MESSAGE_SYNC: {
              encoding.writeVarUint(encoder, MESSAGE_SYNC);
              const syncType = decoding.readVarUint(decoder);
              const isWrite =
                syncType === syncProtocol.messageYjsSyncStep2 ||
                syncType === syncProtocol.messageYjsUpdate;
              if (isWrite) {
                const writer = meeting.state.participants[participantId];
                if (!writer?.isHost) return;
              }
              // readSyncMessage expects the sub-type prefix in the decoder, so
              // rebuild one positioned right after the message-type byte.
              const subDecoder = decoding.createDecoder(data);
              decoding.readVarUint(subDecoder);
              syncProtocol.readSyncMessage(subDecoder, encoder, state.ydoc, ws);
              if (encoding.length(encoder) > 1) safeSend(ws, encoding.toUint8Array(encoder));
              break;
            }
            case MESSAGE_AWARENESS: {
              awarenessProtocol.applyAwarenessUpdate(
                state.awareness,
                decoding.readVarUint8Array(decoder),
                ws
              );
              break;
            }
            default:
              break;
          }
        } catch (e) {
          log.warn({ err: (e as Error).message }, "yjs message error");
        }
      });

      // Heartbeat: marks alive=false before each ping, the pong handler
      // flips it back. Two missed pings = laptop closed / NAT timeout =
      // terminate so the slot can be reused.
      let alive = true;
      ws.on("pong", () => {
        alive = true;
      });
      const heartbeat = setInterval(() => {
        if (!alive) {
          try { ws.terminate(); } catch { /* already gone */ }
          return;
        }
        alive = false;
        try { ws.ping(); } catch { /* socket may be closing */ }
      }, PING_INTERVAL_MS);

      const cleanup = () => {
        clearInterval(heartbeat);
        const controlled = state.conns.get(ws);
        state.conns.delete(ws);
        if (controlled && controlled.size > 0) {
          awarenessProtocol.removeAwarenessStates(state.awareness, Array.from(controlled), ws);
        }
      };

      ws.on("close", cleanup);
      ws.on("error", cleanup);
    }
  );

  return {
    close: () => {
      for (const client of wss.clients) {
        try { client.close(1001, "server_shutting_down"); } catch { /* already gone */ }
      }
      wss.close();
    },
  };
}
