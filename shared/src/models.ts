export type Locale = "fr" | "en" | "es" | "it" | "de";

export type MeetingPhase = "lobby" | "running" | "paused" | "ended";

export interface ParticipantIdentity {
  firstName: string;
  lastName: string;
  role: string;
}

export interface Participant extends ParticipantIdentity {
  id: string;
  isHost: boolean;
  joinedAt: number;
  // Lower = earlier in the list. Optional so older states (no reorder yet)
  // can fall back to `joinedAt` on the client side.
  order?: number;
  connected: boolean;
  handRaised: boolean;
  handRaisedAt?: number;
  totalSpeakingMs: number;
}

export interface Topic {
  id: string;
  label: string;
  totalMs: number;
}

export interface Meeting {
  id: string;
  createdAt: number;
  phase: MeetingPhase;
  startedAt?: number;
  endedAt?: number;
  pauseAccumulatedMs: number;
  pausedSince?: number;
  timeboxMs?: number;
  // Host-toggleable runtime flag; distinct from timeboxMs (the configured value).
  timeboxEnabled?: boolean;
  // Informational only. The meeting is never stopped automatically.
  plannedDurationMs?: number;
  // The password itself is never serialized to clients, only this boolean.
  hasPassword?: boolean;
  currentTopicId?: string;
  currentTopicStartedAt?: number;
  topics: Topic[];
  participants: Record<string, Participant>;
  currentSpeakerId?: string;
  currentSpeakerStartedAt?: number;
}
