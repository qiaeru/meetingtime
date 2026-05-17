import type { Server } from "socket.io";
import type { Meeting } from "../meetings/Meeting.js";

export function broadcastState(io: Server, meeting: Meeting): void {
  io.to(roomFor(meeting.state.id)).emit("meeting:state", meeting.publicState());
}

export function roomFor(meetingId: string): string {
  return `meeting:${meetingId}`;
}
