import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ParticipantIdentity,
} from "@meetingtime/shared";
import { meetingStore } from "../meetings/MeetingStore.js";
import { requireHost } from "./authorize.js";
import { broadcastState, roomFor } from "./broadcast.js";
import { log } from "../log.js";
import { config } from "../config.js";
import { allowSocketEvent } from "../plugins/rateLimit.js";

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type SK = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerHandlers(io: IO): void {
  io.on("connection", (socket) => onConnection(io, socket));
}

function onConnection(io: IO, socket: SK): void {
  log.debug({ sid: socket.id }, "socket connected");

  // Sockets that never authenticate sit on the per-IP connection slot.
  // Ten minutes is long enough for a host to fill the create form without
  // being kicked, short enough that idle sockets don't accumulate.
  const JOIN_GRACE_MS = 10 * 60_000;
  const joinTimer = setTimeout(() => {
    if (!socket.ctx) {
      log.warn({ sid: socket.id }, "socket did not authenticate in time; disconnecting");
      socket.disconnect(true);
    }
  }, JOIN_GRACE_MS);
  joinTimer.unref?.();
  socket.on("disconnect", () => clearTimeout(joinTimer));

  socket.use((_event, next) => {
    if (allowSocketEvent(socket)) return next();
    next(new Error("rate_limited"));
  });
  socket.on("error", (err) => {
    if (err.message === "rate_limited") {
      log.warn({ sid: socket.id }, "socket rate-limited; disconnecting");
      socket.disconnect(true);
    }
  });

  // Socket.IO does not catch listener exceptions, and index.ts shuts the whole
  // process down on uncaughtException, so a malformed frame (missing payload,
  // non-function ack) from any client must never escape a handler.
  const on = <E extends keyof ClientToServerEvents>(
    event: E,
    handler: ClientToServerEvents[E]
  ): void => {
    // Socket.IO's generic `on` overloads reject a wrapper typed per-event, so
    // register through a loosened signature; `event`/`handler` stay typed at
    // the call sites above.
    (socket.on as (ev: string, listener: (...args: unknown[]) => void) => void)(
      event,
      (...args: unknown[]) => {
        try {
          (handler as (...a: unknown[]) => void)(...args);
        } catch (e) {
          log.warn({ sid: socket.id, event, err: (e as Error).message }, "socket handler threw");
          const ack = args[args.length - 1];
          if (typeof ack === "function") {
            (ack as (r: unknown) => void)({ ok: false, error: "invalid_payload" });
          }
        }
      }
    );
  };

  on("meeting:create", (payload, ack) => {
    try {
      const host = sanitizeIdentity(payload.host);
      if (!host) return ack({ ok: false, error: "invalid_identity" });
      const initial = (payload.initialParticipants ?? [])
        .map(sanitizeIdentity)
        .filter((p): p is ParticipantIdentity => p !== undefined);
      const meeting = meetingStore.create(host, {
        initialParticipants: initial,
        topics: payload.topics,
        timeboxMs: payload.timeboxMs,
        plannedDurationMs: payload.plannedDurationMs,
        password: payload.password,
      });
      const hostId = meeting.hostId()!;
      const token = meeting.tokenFor(hostId)!;
      attach(socket, meeting.state.id, hostId, token);
      meeting.setConnected(hostId, true);
      socket.join(roomFor(meeting.state.id));
      ack({
        ok: true,
        meetingId: meeting.state.id,
        participantId: hostId,
        token,
        meeting: meeting.publicState(),
      });
      broadcastState(io, meeting);
    } catch (e) {
      ack({ ok: false, error: passthroughOrInternal(e) });
    }
  });

  on("meeting:join", (payload, ack) => {
    try {
      const meeting = meetingStore.get(payload.meetingId);
      if (!meeting) return ack({ ok: false, error: "meeting_not_found" });

      let participantId: string;
      let token: string;

      if ("token" in payload && payload.token) {
        const existing = meeting.participantByToken(payload.token);
        if (!existing) return ack({ ok: false, error: "invalid_token" });
        participantId = existing.id;
        token = payload.token;
      } else if ("identity" in payload) {
        // Password is only checked on identity-flow joins; the token flow is
        // already authenticated.
        if (!meeting.verifyPassword(payload.password)) {
          return ack({ ok: false, error: "invalid_password" });
        }
        const identity = sanitizeIdentity(payload.identity);
        if (!identity) return ack({ ok: false, error: "invalid_identity" });
        // Same person joining from a second device (laptop + phone): reuse the
        // existing participant instead of cloning them, so speaking time and
        // host status stay on a single identity.
        const twin = meeting.participantByIdentity(identity);
        if (twin) {
          participantId = twin.id;
          token = meeting.tokenFor(twin.id)!;
        } else {
          const added = meeting.addParticipant(identity, false);
          participantId = added.participant.id;
          token = added.token;
        }
      } else {
        return ack({ ok: false, error: "missing_credentials" });
      }

      // Same socket re-joining a different meeting: cleanly detach from the
      // previous one, otherwise the client receives both meetings' broadcasts
      // and the previous meeting forever shows the participant as connected.
      // Another device of the same participant may still be in the previous
      // meeting, so only mark them disconnected once their last socket leaves.
      const prev = socket.ctx;
      if (prev && (prev.meeting !== meeting || prev.participant.id !== participantId)) {
        socket.leave(roomFor(prev.meeting.state.id));
        if (!hasOtherSocketFor(io, prev.meeting.state.id, prev.participant.id, socket.id)) {
          prev.meeting.setConnected(prev.participant.id, false);
          broadcastState(io, prev.meeting);
        }
      }

      attach(socket, meeting.state.id, participantId, token);
      meeting.setConnected(participantId, true);
      socket.join(roomFor(meeting.state.id));
      ack({
        ok: true,
        meetingId: meeting.state.id,
        participantId,
        token,
        meeting: meeting.publicState(),
      });
      broadcastState(io, meeting);
    } catch (e) {
      ack({ ok: false, error: passthroughOrInternal(e) });
    }
  });

  on("meeting:start", (ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    ctx.meeting.start();
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("meeting:pause", (ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    ctx.meeting.pause();
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("meeting:resume", (ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    ctx.meeting.start();
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("meeting:end", (ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    // Idempotent: a second end would re-stamp endedAt and reschedule the GC.
    if (ctx.meeting.state.phase === "ended") return ack?.({ ok: true });
    ctx.meeting.end();
    broadcastState(io, ctx.meeting);
    // The summary was already broadcast and the client exports notes
    // independently; drop the live meeting (password, tokens, Yjs doc) from
    // memory after the configured grace period.
    meetingStore.scheduleDeleteAfterEnd(ctx.meeting.state.id, config.postEndGcMs);
    ack?.({ ok: true });
  });

  on("meeting:setTimebox", (payload, ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    if (ctx.meeting.state.phase === "ended") return ack?.({ ok: false, error: "meeting_ended" });
    ctx.meeting.setTimebox(payload.timeboxMs);
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("meeting:setTimeboxEnabled", (payload, ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    if (ctx.meeting.state.phase === "ended") return ack?.({ ok: false, error: "meeting_ended" });
    ctx.meeting.setTimeboxEnabled(Boolean(payload.enabled));
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("participant:add", (payload, ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    if (ctx.meeting.state.phase === "ended") return ack?.({ ok: false, error: "meeting_ended" });
    const identity = sanitizeIdentity(payload.identity);
    if (!identity) return ack?.({ ok: false, error: "invalid_identity" });
    try {
      ctx.meeting.addParticipant(identity, false);
    } catch (e) {
      return ack?.({ ok: false, error: (e as Error).message || "internal_error" });
    }
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("participant:remove", (payload, ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    if (ctx.meeting.state.phase === "ended") return ack?.({ ok: false, error: "meeting_ended" });
    ctx.meeting.removeParticipant(payload.participantId);
    // ctxOf would already reject their next emit; the pre-emptive disconnect
    // saves the round-trip and gives the affected client an explicit signal.
    disconnectParticipant(io, ctx.meeting.state.id, payload.participantId);
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("participant:reorder", (payload, ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    if (ctx.meeting.state.phase === "ended") return ack?.({ ok: false, error: "meeting_ended" });
    if ("toIndex" in payload) {
      if (!Number.isInteger(payload.toIndex)) return ack?.({ ok: false, error: "invalid_payload" });
      ctx.meeting.moveParticipant(payload.participantId, payload.toIndex);
    } else if (payload.direction === "up" || payload.direction === "down") {
      ctx.meeting.reorderParticipant(payload.participantId, payload.direction);
    } else {
      return ack?.({ ok: false, error: "invalid_direction" });
    }
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("host:promote", (payload, ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    if (ctx.meeting.state.phase === "ended") return ack?.({ ok: false, error: "meeting_ended" });
    ctx.meeting.promote(payload.participantId);
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("host:demote", (payload, ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    if (ctx.meeting.state.phase === "ended") return ack?.({ ok: false, error: "meeting_ended" });
    ctx.meeting.demote(payload.participantId);
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("hand:raise", (ack) => {
    const ctx = socket.ctx;
    if (!ctx) return ack?.({ ok: false, error: "not_joined" });
    if (ctx.meeting.state.phase === "ended") return ack?.({ ok: false, error: "meeting_ended" });
    ctx.meeting.raiseHand(ctx.participant.id);
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("hand:lower", (ack) => {
    const ctx = socket.ctx;
    if (!ctx) return ack?.({ ok: false, error: "not_joined" });
    if (ctx.meeting.state.phase === "ended") return ack?.({ ok: false, error: "meeting_ended" });
    ctx.meeting.lowerHand(ctx.participant.id);
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("speaker:grant", (payload, ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    ctx.meeting.grantSpeaker(payload.participantId);
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("speaker:revoke", (ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    ctx.meeting.revokeSpeaker();
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  // Any participant can take the floor for themselves. grantSpeaker already
  // no-ops outside running/paused, so no phase guard is needed here.
  on("speaker:claim", (ack) => {
    const ctx = socket.ctx;
    if (!ctx) return ack?.({ ok: false, error: "not_joined" });
    ctx.meeting.grantSpeaker(ctx.participant.id);
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  // Releasing only affects the caller's own turn; a participant can never
  // revoke someone else.
  on("speaker:release", (ack) => {
    const ctx = socket.ctx;
    if (!ctx) return ack?.({ ok: false, error: "not_joined" });
    if (ctx.meeting.state.currentSpeakerId !== ctx.participant.id) return ack?.({ ok: true });
    ctx.meeting.revokeSpeaker();
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("topic:add", (payload, ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    if (ctx.meeting.state.phase === "ended") return ack?.({ ok: false, error: "meeting_ended" });
    try {
      ctx.meeting.addTopic(payload.label ?? "");
    } catch (e) {
      return ack?.({ ok: false, error: (e as Error).message || "internal_error" });
    }
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("topic:remove", (payload, ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    if (ctx.meeting.state.phase === "ended") return ack?.({ ok: false, error: "meeting_ended" });
    ctx.meeting.removeTopic(payload.topicId);
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("topic:reorder", (payload, ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    if (ctx.meeting.state.phase === "ended") return ack?.({ ok: false, error: "meeting_ended" });
    if ("toIndex" in payload) {
      if (!Number.isInteger(payload.toIndex)) return ack?.({ ok: false, error: "invalid_payload" });
      ctx.meeting.moveTopic(payload.topicId, payload.toIndex);
    } else if (payload.direction === "up" || payload.direction === "down") {
      ctx.meeting.reorderTopic(payload.topicId, payload.direction);
    } else {
      return ack?.({ ok: false, error: "invalid_direction" });
    }
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  on("topic:setCurrent", (payload, ack) => {
    const ctx = requireHost(socket);
    if (!ctx) return ack?.({ ok: false, error: "forbidden" });
    if (ctx.meeting.state.phase === "ended") return ack?.({ ok: false, error: "meeting_ended" });
    ctx.meeting.setCurrentTopic(payload.topicId);
    broadcastState(io, ctx.meeting);
    ack?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const ctx = socket.ctx;
    if (!ctx) return;
    // Another device of the same participant (laptop + phone) may still be
    // connected; only mark them gone once their last socket drops.
    if (hasOtherSocketFor(io, ctx.meeting.state.id, ctx.participant.id, socket.id)) return;
    ctx.meeting.setConnected(ctx.participant.id, false);
    broadcastState(io, ctx.meeting);
  });
}

function attach(socket: SK, meetingId: string, participantId: string, token: string): void {
  const meeting = meetingStore.get(meetingId);
  if (!meeting) return;
  const participant = meeting.state.participants[participantId];
  if (!participant) return;
  socket.ctx = { meeting, participant, token };
}

// True if a socket other than `exceptSid` is still attached to this
// participant in the room (a second device of the same person).
function hasOtherSocketFor(
  io: IO,
  meetingId: string,
  participantId: string,
  exceptSid: string
): boolean {
  for (const sid of io.of("/").adapter.rooms.get(roomFor(meetingId)) ?? []) {
    if (sid === exceptSid) continue;
    if (io.sockets.sockets.get(sid)?.ctx?.participant.id === participantId) return true;
  }
  return false;
}

function disconnectParticipant(io: IO, meetingId: string, participantId: string): void {
  const room = roomFor(meetingId);
  for (const sock of io.of("/").adapter.rooms.get(room) ?? []) {
    const s = io.sockets.sockets.get(sock);
    if (s?.ctx?.participant.id === participantId) s.disconnect(true);
  }
}

// Stops dependency internals, file paths and library traces from leaking back
// to clients via ack messages. Only known business codes pass through.
const KNOWN_ERROR_CODES = new Set([
  "invalid_identity",
  "participant_cap_reached",
  "topic_cap_reached",
  "empty_label",
]);
function passthroughOrInternal(e: unknown): string {
  const msg = (e as Error).message;
  log.warn({ err: msg }, "socket handler error");
  return KNOWN_ERROR_CODES.has(msg) ? msg : "internal_error";
}

function sanitizeIdentity(raw: ParticipantIdentity | undefined): ParticipantIdentity | undefined {
  if (!raw) return undefined;
  const firstName = String(raw.firstName ?? "").trim().slice(0, 60);
  const lastName = String(raw.lastName ?? "").trim().slice(0, 60);
  const role = String(raw.role ?? "").trim().slice(0, 60);
  if (!firstName || !lastName || !role) return undefined;
  return { firstName, lastName, role };
}
