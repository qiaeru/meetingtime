import type { Meeting } from "@meetingtime/shared";

// Returns the id of the auto-promoted participant when no connected host
// remains, or undefined when nothing changes. Keeps a meeting usable after
// every original host disconnects.
export function promoteOldestFallback(state: Meeting): string | undefined {
  const participants = Object.values(state.participants);
  const hasConnectedHost = participants.some((p) => p.isHost && p.connected);
  if (hasConnectedHost) return undefined;

  const candidate = participants
    .filter((p) => p.connected && !p.isHost)
    .sort((a, b) => a.joinedAt - b.joinedAt)[0];

  if (!candidate) return undefined;
  candidate.isHost = true;
  return candidate.id;
}
