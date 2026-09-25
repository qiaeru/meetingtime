import type { Meeting } from "@meetingtime/shared";

// Auto-promotes the oldest connected participant when no connected host
// remains. Keeps a meeting usable after every original host disconnects.
export function promoteOldestFallback(state: Meeting): void {
  const participants = Object.values(state.participants);
  const hasConnectedHost = participants.some((p) => p.isHost && p.connected);
  if (hasConnectedHost) return;

  const candidate = participants
    .filter((p) => p.connected && !p.isHost)
    .sort((a, b) => a.joinedAt - b.joinedAt)[0];

  if (candidate) candidate.isHost = true;
}
