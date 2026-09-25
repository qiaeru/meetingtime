import type { Meeting } from "@meetingtime/shared";

// How long a meeting may stay without a connected host before a guest is
// promoted: long enough for a host to reload the page or ride out a short
// network drop, so they come back still in charge.
export const HOST_FALLBACK_GRACE_MS = 15_000;

// Auto-promotes the oldest connected participant when no connected host
// remains. Keeps a meeting usable after every original host disconnects.
// Returns true when it promoted someone.
export function promoteOldestFallback(state: Meeting): boolean {
  const participants = Object.values(state.participants);
  const hasConnectedHost = participants.some((p) => p.isHost && p.connected);
  if (hasConnectedHost) return false;

  const candidate = participants
    .filter((p) => p.connected && !p.isHost)
    .sort((a, b) => a.joinedAt - b.joinedAt)[0];

  if (!candidate) return false;
  candidate.isHost = true;
  return true;
}
