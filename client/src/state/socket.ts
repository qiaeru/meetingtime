import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Meeting,
} from "@meetingtime/shared";
import { Observable } from "./store.js";

export type MeetingSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

export const socket$ = new Observable<MeetingSocket | null>(null);
export const meeting$ = new Observable<Meeting | null>(null);
export const myParticipantId$ = new Observable<string | null>(null);
export const connection$ = new Observable<ConnectionStatus>("connected");

export function connect(): MeetingSocket {
  const s: MeetingSocket = io({
    path: "/socket.io",
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    transports: ["websocket", "polling"],
  });
  s.on("meeting:state", (state) => meeting$.set(state));
  s.on("connect", () => connection$.set("connected"));
  s.on("disconnect", () => connection$.set("disconnected"));
  s.io.on("reconnect_attempt", () => connection$.set("reconnecting"));
  s.io.on("reconnect", () => connection$.set("connected"));
  s.io.on("reconnect_failed", () => connection$.set("disconnected"));
  socket$.set(s);
  return s;
}

export function disconnect(): void {
  const s = socket$.get();
  if (s) {
    s.disconnect();
    socket$.set(null);
  }
  meeting$.set(null);
  myParticipantId$.set(null);
}
