import { randomBytes } from "node:crypto";
import { v4 as uuid } from "uuid";
import type {
  Meeting as MeetingState,
  Participant,
  ParticipantIdentity,
  Topic,
} from "@meetingtime/shared";
import { promoteOldestFallback } from "./hostFallback.js";
import {
  MAX_IDENTITY_FIELD,
  MAX_PARTICIPANTS,
  MAX_PASSWORD,
  MAX_PLANNED_MS,
  MAX_TIMEBOX_MS,
  MAX_TOPIC_LABEL,
  MAX_TOPICS,
  clampPositiveMs,
  clampString,
} from "./limits.js";

// All meeting state machine transitions live here. Socket handlers must call
// these methods rather than mutate `state` directly: the per-speaker and
// per-topic flush accumulators only run on this path.
export class Meeting {
  public readonly state: MeetingState;
  private readonly tokens = new Map<string, string>();
  // Two participants added in the same millisecond would otherwise collide on
  // Date.now() and the up/down swap silently no-ops.
  private orderSeq = 0;
  // Never serialized; only state.hasPassword (boolean) is broadcast.
  private readonly password?: string;

  constructor(
    id: string,
    host: ParticipantIdentity,
    opts?: { topics?: string[]; timeboxMs?: number; plannedDurationMs?: number; password?: string }
  ) {
    const rawPassword = clampString(opts?.password, MAX_PASSWORD);
    this.password = rawPassword || undefined;
    const hostParticipant = createParticipant(host, true);
    hostParticipant.order = this.allocateOrder();
    this.state = {
      id,
      createdAt: Date.now(),
      phase: "lobby",
      pauseAccumulatedMs: 0,
      timeboxMs: clampPositiveMs(opts?.timeboxMs, MAX_TIMEBOX_MS),
      timeboxEnabled: false,
      plannedDurationMs: clampPositiveMs(opts?.plannedDurationMs, MAX_PLANNED_MS),
      hasPassword: Boolean(this.password),
      topics: (opts?.topics ?? [])
        .map((label) => clampString(label, MAX_TOPIC_LABEL))
        .filter((label) => label.length > 0)
        .slice(0, MAX_TOPICS)
        .map<Topic>((label) => ({ id: uuid(), label, totalMs: 0 })),
      participants: { [hostParticipant.id]: hostParticipant },
    };
    this.tokens.set(hostParticipant.id, generateToken());
  }

  // Seeded with Date.now() so freshly added participants sort after older ones.
  private allocateOrder(): number {
    this.orderSeq = Math.max(this.orderSeq + 1, Date.now());
    return this.orderSeq;
  }

  // Length-first then XOR keeps the comparison roughly timing-safe; full
  // constant-time isn't justified for an in-memory app of this size.
  verifyPassword(supplied: string | undefined): boolean {
    if (!this.password) return true;
    if (typeof supplied !== "string") return false;
    if (supplied.length !== this.password.length) return false;
    let diff = 0;
    for (let i = 0; i < this.password.length; i++) {
      diff |= this.password.charCodeAt(i) ^ supplied.charCodeAt(i);
    }
    return diff === 0;
  }

  hostId(): string | undefined {
    return Object.values(this.state.participants).find((p) => p.isHost)?.id;
  }

  tokenFor(participantId: string): string | undefined {
    return this.tokens.get(participantId);
  }

  participantByToken(token: string): Participant | undefined {
    for (const [id, t] of this.tokens) {
      if (t === token) return this.state.participants[id];
    }
    return undefined;
  }

  // Lets a single person reconnect from a second device (laptop + phone)
  // without spawning a duplicate that would split their speaking time. Match
  // is trim + case-insensitive on the full identity, so "Jean Martin / Hôte"
  // collapses regardless of casing or stray spaces.
  participantByIdentity(identity: ParticipantIdentity): Participant | undefined {
    const norm = (s: string): string => s.trim().toLowerCase();
    const first = norm(identity.firstName);
    const last = norm(identity.lastName);
    const role = norm(identity.role);
    return Object.values(this.state.participants).find(
      (p) => norm(p.firstName) === first && norm(p.lastName) === last && norm(p.role) === role
    );
  }

  addParticipant(identity: ParticipantIdentity, asHost = false): { participant: Participant; token: string } {
    if (Object.keys(this.state.participants).length >= MAX_PARTICIPANTS) {
      throw new Error("participant_cap_reached");
    }
    const p = createParticipant(identity, asHost);
    p.order = this.allocateOrder();
    this.state.participants[p.id] = p;
    const token = generateToken();
    this.tokens.set(p.id, token);
    return { participant: p, token };
  }

  removeParticipant(participantId: string): void {
    if (this.state.currentSpeakerId === participantId) this.revokeSpeaker();
    delete this.state.participants[participantId];
    this.tokens.delete(participantId);
    this.ensureHostExists();
  }

  setConnected(participantId: string, connected: boolean): void {
    const p = this.state.participants[participantId];
    if (!p) return;
    p.connected = connected;
    if (!connected) {
      p.handRaised = false;
      delete p.handRaisedAt;
    }
    this.ensureHostExists();
  }

  ensureHostExists(): void {
    promoteOldestFallback(this.state);
  }

  promote(participantId: string): void {
    const p = this.state.participants[participantId];
    if (p) p.isHost = true;
  }

  demote(participantId: string): void {
    const p = this.state.participants[participantId];
    if (p) p.isHost = false;
    this.ensureHostExists();
  }

  start(): void {
    if (this.state.phase === "running") return;
    if (!this.state.startedAt) this.state.startedAt = Date.now();
    if (this.state.phase === "paused" && this.state.pausedSince) {
      this.state.pauseAccumulatedMs += Date.now() - this.state.pausedSince;
      delete this.state.pausedSince;
      if (this.state.currentSpeakerId) {
        this.state.currentSpeakerStartedAt = Date.now();
      }
      if (this.state.currentTopicId) {
        this.state.currentTopicStartedAt = Date.now();
      }
    }
    this.state.phase = "running";
  }

  pause(): void {
    if (this.state.phase !== "running") return;
    // Flip the phase before flushing so the flushes park the start timestamps
    // at undefined instead of restarting them; a live timestamp during the
    // pause would charge the whole pause to the speaker and topic on the next
    // flush (grant/revoke/end while paused).
    this.state.phase = "paused";
    this.flushSpeaker();
    this.flushTopic();
    this.state.pausedSince = Date.now();
  }

  end(): void {
    this.flushSpeaker();
    this.flushTopic();
    delete this.state.currentSpeakerId;
    delete this.state.currentSpeakerStartedAt;
    delete this.state.currentTopicId;
    delete this.state.currentTopicStartedAt;
    this.state.phase = "ended";
    this.state.endedAt = Date.now();
    if (this.state.pausedSince) {
      this.state.pauseAccumulatedMs += this.state.endedAt - this.state.pausedSince;
      delete this.state.pausedSince;
    }
  }

  setTimebox(ms: number | undefined): void {
    this.state.timeboxMs = ms === undefined ? undefined : clampPositiveMs(ms, MAX_TIMEBOX_MS);
  }

  setTimeboxEnabled(enabled: boolean): void {
    this.state.timeboxEnabled = enabled;
    // Re-enabling the limit must reset the per-speaker baseline so the
    // countdown starts from "now" instead of charging prior elapsed time.
    if (enabled && this.state.currentSpeakerId && this.state.phase === "running") {
      this.flushSpeaker();
    }
  }

  raiseHand(participantId: string): void {
    const p = this.state.participants[participantId];
    if (!p || p.handRaised) return;
    p.handRaised = true;
    p.handRaisedAt = Date.now();
  }

  lowerHand(participantId: string): void {
    const p = this.state.participants[participantId];
    if (!p) return;
    p.handRaised = false;
    delete p.handRaisedAt;
  }

  grantSpeaker(participantId: string): void {
    if (this.state.phase !== "running" && this.state.phase !== "paused") return;
    if (!this.state.participants[participantId]) return;
    if (this.state.currentSpeakerId === participantId) return;
    this.flushSpeaker();
    this.state.currentSpeakerId = participantId;
    this.state.currentSpeakerStartedAt = this.state.phase === "running" ? Date.now() : undefined;
    this.lowerHand(participantId);
  }

  revokeSpeaker(): void {
    this.flushSpeaker();
    delete this.state.currentSpeakerId;
    delete this.state.currentSpeakerStartedAt;
  }

  private flushSpeaker(): void {
    const { currentSpeakerId, currentSpeakerStartedAt } = this.state;
    if (!currentSpeakerId || !currentSpeakerStartedAt) return;
    const elapsed = Date.now() - currentSpeakerStartedAt;
    const p = this.state.participants[currentSpeakerId];
    if (p) p.totalSpeakingMs += elapsed;
    this.state.currentSpeakerStartedAt = this.state.phase === "running" ? Date.now() : undefined;
  }

  private flushTopic(): void {
    const { currentTopicId, currentTopicStartedAt } = this.state;
    if (!currentTopicId || !currentTopicStartedAt) return;
    const elapsed = Date.now() - currentTopicStartedAt;
    const topic = this.state.topics.find((x) => x.id === currentTopicId);
    if (topic) topic.totalMs += elapsed;
    this.state.currentTopicStartedAt = this.state.phase === "running" ? Date.now() : undefined;
  }

  addTopic(label: string): Topic {
    if (this.state.topics.length >= MAX_TOPICS) {
      throw new Error("topic_cap_reached");
    }
    const clean = clampString(label, MAX_TOPIC_LABEL);
    if (!clean) throw new Error("empty_label");
    const topic: Topic = { id: uuid(), label: clean, totalMs: 0 };
    this.state.topics.push(topic);
    return topic;
  }

  removeTopic(topicId: string): void {
    this.state.topics = this.state.topics.filter((t) => t.id !== topicId);
    if (this.state.currentTopicId === topicId) {
      delete this.state.currentTopicId;
      delete this.state.currentTopicStartedAt;
    }
  }

  reorderParticipant(participantId: string, direction: "up" | "down"): void {
    const sorted = Object.values(this.state.participants).sort(
      (a, b) => (a.order ?? a.joinedAt) - (b.order ?? b.joinedAt)
    );
    const idx = sorted.findIndex((p) => p.id === participantId);
    if (idx < 0) return;
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swap];
    const ao = a.order ?? a.joinedAt;
    const bo = b.order ?? b.joinedAt;
    a.order = bo;
    b.order = ao;
  }

  // Atomic absolute move (drag-and-drop). Splicing the sorted list to the
  // target index then redistributing the existing order values keeps the new
  // sequence stable and leaves freshly added participants (order = now)
  // sorting last, without the race of N single-step swaps.
  moveParticipant(participantId: string, toIndex: number): void {
    const sorted = Object.values(this.state.participants).sort(
      (a, b) => (a.order ?? a.joinedAt) - (b.order ?? b.joinedAt)
    );
    const from = sorted.findIndex((p) => p.id === participantId);
    if (from < 0) return;
    const target = Math.max(0, Math.min(Math.trunc(toIndex), sorted.length - 1));
    if (target === from) return;
    const [moved] = sorted.splice(from, 1);
    sorted.splice(target, 0, moved);
    const orders = sorted.map((p) => p.order ?? p.joinedAt).sort((a, b) => a - b);
    sorted.forEach((p, i) => {
      p.order = orders[i];
    });
  }

  reorderTopic(topicId: string, direction: "up" | "down"): void {
    const idx = this.state.topics.findIndex((t) => t.id === topicId);
    if (idx < 0) return;
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= this.state.topics.length) return;
    const list = this.state.topics;
    [list[idx], list[swap]] = [list[swap], list[idx]];
  }

  moveTopic(topicId: string, toIndex: number): void {
    const from = this.state.topics.findIndex((t) => t.id === topicId);
    if (from < 0) return;
    const target = Math.max(0, Math.min(Math.trunc(toIndex), this.state.topics.length - 1));
    if (target === from) return;
    const [moved] = this.state.topics.splice(from, 1);
    this.state.topics.splice(target, 0, moved);
  }

  setCurrentTopic(topicId: string | null): void {
    // Activating a topic requires the meeting to have started; clearing is
    // always allowed (e.g. when the host ends the meeting).
    if (topicId && this.state.phase !== "running" && this.state.phase !== "paused") return;
    this.flushTopic();
    if (topicId && this.state.topics.some((t) => t.id === topicId)) {
      this.state.currentTopicId = topicId;
      this.state.currentTopicStartedAt = this.state.phase === "running" ? Date.now() : undefined;
    } else {
      delete this.state.currentTopicId;
      delete this.state.currentTopicStartedAt;
    }
  }

  publicState(): MeetingState {
    // Tokens live in a separate map; `state` itself carries no secrets and
    // Socket.IO serializes the value on emit, so no defensive clone is needed.
    return this.state;
  }
}

function createParticipant(identity: ParticipantIdentity, isHost: boolean): Participant {
  // Defensive re-clamp: every handler is supposed to have run sanitizeIdentity
  // first, but enforcing limits here closes any future hole.
  const firstName = clampString(identity?.firstName, MAX_IDENTITY_FIELD);
  const lastName = clampString(identity?.lastName, MAX_IDENTITY_FIELD);
  const role = clampString(identity?.role, MAX_IDENTITY_FIELD);
  if (!firstName || !lastName || !role) throw new Error("invalid_identity");
  const now = Date.now();
  return {
    id: uuid(),
    firstName,
    lastName,
    role,
    isHost,
    joinedAt: now,
    order: now,
    connected: false,
    handRaised: false,
    totalSpeakingMs: 0,
  };
}

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}
