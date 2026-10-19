import type { IncomingMessage } from "node:http";
import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { YJS_MESSAGE_NOTES_FULL } from "@meetingtime/shared";
import { meetingStore } from "../meetings/MeetingStore.js";
import { log } from "../log.js";
import { config } from "../config.js";
import { allowIP, ipFromRequest } from "../plugins/rateLimit.js";
import { isOriginAllowed } from "../plugins/origin.js";

// Notes caps, in encoded bytes. The per-meeting one is hundreds of pages of
// Markdown; the process-wide one stops a script spread over many meetings
// from exhausting server memory.
const MAX_NOTES_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_NOTES_BYTES = 200 * 1024 * 1024;
// A frame must hold any single write the notes cap allows: a smaller limit
// closes the socket on a big paste, and y-websocket then resends the same
// frame on every reconnect, losing every later edit.
const MAX_WS_PAYLOAD = MAX_NOTES_BYTES + 64 * 1024;
// Awareness (cursors, names) is stored and relayed to every peer, so it
// keeps the tight limit the whole frame used to have.
const MAX_AWARENESS_BYTES = 64 * 1024;
const PING_INTERVAL_MS = 30_000;
const WS_MSG_LIMIT = 200;
const WS_BYTES_LIMIT = 2 * MAX_WS_PAYLOAD;
const WS_MSG_WINDOW_MS = 10_000;
const MAX_MEETING_ID_LEN = 32;
// Exact sizing re-encodes the whole doc, so near the cap it runs at most
// this often per meeting; in between, accepted writes add their own length.
const NOTES_RESIZE_INTERVAL_MS = 1_000;

// Minimal y-websocket-compatible bridge. Wire format: one varuint message
// type (MESSAGE_SYNC | MESSAGE_AWARENESS) followed by the corresponding
// y-protocols payload. Sync writes (STEP_2/UPDATE) require participant.isHost;
// awareness updates are always accepted (cursor presence is benign).
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

interface Conn {
  participantId: string;
  // Awareness clientIDs this connection controls.
  clientIds: Set<number>;
  // Set once a write was refused for the notes cap. Yjs updates from one
  // client must arrive in order, so applying anything after the refused one
  // would only park it as never-integrated pending state.
  writesRefused: boolean;
}

interface DocState {
  ydoc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Conn>;
  // Kept so releaseDocState can detach it; awareness.destroy() clears its own
  // observers, but the ydoc "update" listener must be removed explicitly.
  onUpdate: (update: Uint8Array, origin: unknown) => void;
  notesBytes: number;
  notesMeasuredAt: number;
}

const docStates = new Map<string, DocState>();
let totalNotesBytes = 0;

function setNotesBytes(state: DocState, bytes: number): void {
  totalNotesBytes += bytes - state.notesBytes;
  state.notesBytes = bytes;
}

function notesHaveRoom(state: DocState, incoming: number): boolean {
  const fits = (): boolean =>
    state.notesBytes + incoming <= MAX_NOTES_BYTES &&
    totalNotesBytes + incoming <= MAX_TOTAL_NOTES_BYTES;
  if (fits()) return true;
  // The running estimate only grows (deletions shrink the real doc), so
  // re-measure before refusing.
  const now = Date.now();
  if (now - state.notesMeasuredAt >= NOTES_RESIZE_INTERVAL_MS) {
    state.notesMeasuredAt = now;
    setNotesBytes(state, Y.encodeStateAsUpdate(state.ydoc).byteLength);
  }
  return fits();
}

// Called by MeetingStore on deletion so dead DocState entries don't
// accumulate across meeting churn.
export function releaseDocState(meetingId: string): void {
  const state = docStates.get(meetingId);
  if (!state) return;
  for (const ws of state.conns.keys()) {
    try {
      ws.close();
    } catch {
      /* socket may already be gone */
    }
  }
  state.ydoc.off("update", state.onUpdate);
  state.awareness.destroy();
  setNotesBytes(state, 0);
  docStates.delete(meetingId);
}

// Called when a host removes a participant: the write gate already rejects
// their edits, but an open connection would keep streaming the notes to them.
export function closeYjsConnectionsFor(meetingId: string, participantId: string): void {
  const state = docStates.get(meetingId);
  if (!state) return;
  for (const [ws, conn] of state.conns) {
    if (conn.participantId !== participantId) continue;
    try {
      ws.close();
    } catch {
      /* socket may already be gone */
    }
  }
}

function getOrCreateDocState(meetingId: string): DocState | undefined {
  let state = docStates.get(meetingId);
  if (state) return state;
  const ydoc = meetingStore.getYDoc(meetingId);
  if (!ydoc) return undefined;
  const awareness = new awarenessProtocol.Awareness(ydoc);
  // The server is not a cursor: without this, its own empty presence entry is
  // sent in every initial sync and renewed to every peer every 15 s.
  awareness.setLocalState(null);
  const conns = new Map<WebSocket, Conn>();

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

  state = { ydoc, awareness, conns, onUpdate, notesBytes: 0, notesMeasuredAt: 0 };
  docStates.set(meetingId, state);

  awareness.on(
    "update",
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown
    ) => {
      // Track which awareness clientIDs each connection controls, so cleanup
      // can remove them the moment the socket closes; otherwise the departed
      // user's cursor lingers until the 30 s awareness timeout.
      const controlled = conns.get(origin as WebSocket)?.clientIds;
      if (controlled) {
        for (const clientID of added) controlled.add(clientID);
        for (const clientID of removed) controlled.delete(clientID);
      }
      const changed = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changed)
      );
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

      state.conns.set(ws, { participantId, clientIds: new Set(), writesRefused: false });

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
          awarenessProtocol.encodeAwarenessUpdate(
            state.awareness,
            Array.from(awarenessStates.keys())
          )
        );
        safeSend(ws, encoding.toUint8Array(enc));
      }

      // Each incoming message is decoded and rebroadcast to every other peer
      // in the room, so the amplification factor justifies a per-connection
      // budget on top of the per-IP one.
      let msgWindowStart = Date.now();
      let msgCount = 0;
      let msgBytes = 0;
      const allowMessage = (size: number): boolean => {
        const now = Date.now();
        if (now - msgWindowStart > WS_MSG_WINDOW_MS) {
          msgWindowStart = now;
          msgCount = 0;
          msgBytes = 0;
        }
        msgCount++;
        msgBytes += size;
        return msgCount <= WS_MSG_LIMIT && msgBytes <= WS_BYTES_LIMIT;
      };

      ws.on("message", (raw: Buffer) => {
        if (!allowMessage(raw.byteLength)) {
          log.warn({ meetingId, participantId }, "yjs ws message budget exceeded; terminating");
          try {
            ws.terminate();
          } catch {
            /* already gone */
          }
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
                const writer = meeting.participant(participantId);
                if (!writer?.isHost) return;
                const conn = state.conns.get(ws);
                if (!conn || conn.writesRefused) return;
                const update = decoding.readVarUint8Array(decoder);
                // Pure deletions always pass, so a host at the cap can make room.
                if (Y.decodeUpdate(update).structs.length > 0) {
                  if (!notesHaveRoom(state, update.byteLength)) {
                    conn.writesRefused = true;
                    const full = encoding.createEncoder();
                    encoding.writeVarUint(full, YJS_MESSAGE_NOTES_FULL);
                    safeSend(ws, encoding.toUint8Array(full));
                    return;
                  }
                  setNotesBytes(state, state.notesBytes + update.byteLength);
                }
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
              if (raw.byteLength > MAX_AWARENESS_BYTES) break;
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
          try {
            ws.terminate();
          } catch {
            /* already gone */
          }
          return;
        }
        alive = false;
        try {
          ws.ping();
        } catch {
          /* socket may be closing */
        }
      }, PING_INTERVAL_MS);

      const cleanup = () => {
        clearInterval(heartbeat);
        const controlled = state.conns.get(ws)?.clientIds;
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
        try {
          client.close(1001, "server_shutting_down");
        } catch {
          /* already gone */
        }
      }
      wss.close();
    },
  };
}
