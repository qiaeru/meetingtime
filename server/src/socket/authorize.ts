import type { Socket } from "socket.io";
import type { Participant } from "@meetingtime/shared";
import { Meeting } from "../meetings/Meeting.js";

export interface SocketContext {
  meeting: Meeting;
  participant: Participant;
  token: string;
}

declare module "socket.io" {
  interface Socket {
    ctx?: SocketContext;
  }
}

// Live re-resolve of the participant on every call. socket.ctx.participant is
// a reference captured at attach time; without re-reading from state every
// time, a removed-or-demoted participant would keep passing host guards
// until they disconnected on their own.
export function ctxOf(socket: Socket): SocketContext | undefined {
  const ctx = socket.ctx;
  if (!ctx) return undefined;
  const live = ctx.meeting.state.participants[ctx.participant.id];
  if (!live) return undefined;
  return { meeting: ctx.meeting, participant: live, token: ctx.token };
}

export function requireHost(socket: Socket): SocketContext | undefined {
  const ctx = ctxOf(socket);
  if (!ctx || !ctx.participant.isHost) return undefined;
  return ctx;
}
