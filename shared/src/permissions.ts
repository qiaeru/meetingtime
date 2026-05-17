import type { Participant, Meeting } from "./models.js";

export function isHost(participant: Participant | undefined): boolean {
  return Boolean(participant?.isHost);
}

export function canControl(participant: Participant | undefined): boolean {
  return isHost(participant);
}

export function canEditNotes(participant: Participant | undefined): boolean {
  return isHost(participant);
}

export function connectedHosts(meeting: Meeting): Participant[] {
  return Object.values(meeting.participants).filter((p) => p.isHost && p.connected);
}
