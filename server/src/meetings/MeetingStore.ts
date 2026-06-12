import type { ParticipantIdentity } from "@meetingtime/shared";
import * as Y from "yjs";
import { Meeting } from "./Meeting.js";
import { generateMeetingId } from "./idGenerator.js";
import { releaseDocState } from "../yjs/ywsBridge.js";
import { config } from "../config.js";
import { log } from "../log.js";

interface Entry {
  meeting: Meeting;
  ydoc: Y.Doc;
  lastActivity: number;
}

export class MeetingStore {
  private readonly entries = new Map<string, Entry>();

  constructor() {
    setInterval(() => this.collectIdle(), 60_000).unref?.();
  }

  create(
    host: ParticipantIdentity,
    opts?: {
      topics?: string[];
      timeboxMs?: number;
      plannedDurationMs?: number;
      password?: string;
      initialParticipants?: ParticipantIdentity[];
    }
  ): Meeting {
    let id = generateMeetingId();
    while (this.entries.has(id)) id = generateMeetingId();

    const meeting = new Meeting(id, host, {
      topics: opts?.topics,
      timeboxMs: opts?.timeboxMs,
      plannedDurationMs: opts?.plannedDurationMs,
      password: opts?.password,
    });
    for (const ident of opts?.initialParticipants ?? []) {
      meeting.addParticipant(ident, false);
    }
    this.entries.set(id, { meeting, ydoc: new Y.Doc(), lastActivity: Date.now() });
    log.info({ meetingId: id }, "meeting created");
    return meeting;
  }

  get(id: string): Meeting | undefined {
    const e = this.entries.get(id);
    if (!e) return undefined;
    e.lastActivity = Date.now();
    return e.meeting;
  }

  getYDoc(id: string): Y.Doc | undefined {
    return this.entries.get(id)?.ydoc;
  }

  delete(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    // Release the bridge state before destroying the doc, otherwise any
    // queued sync message would land on a freed doc and crash.
    releaseDocState(id);
    e.ydoc.destroy();
    this.entries.delete(id);
    log.info({ meetingId: id }, "meeting deleted");
  }

  scheduleDeleteAfterEnd(id: string, delayMs: number): void {
    setTimeout(() => {
      const e = this.entries.get(id);
      if (!e) return;
      if (e.meeting.state.phase === "ended") this.delete(id);
    }, delayMs).unref?.();
  }

  private collectIdle(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      const anyConnected = Object.values(entry.meeting.state.participants).some((p) => p.connected);
      // Presence counts as activity: without this, lastActivity stays frozen
      // at the last join and a momentary full disconnect (network blip) after
      // hostTimeoutMs of meeting would delete a live meeting on the next sweep.
      if (anyConnected) {
        entry.lastActivity = now;
        continue;
      }
      if (now - entry.lastActivity > config.hostTimeoutMs) {
        this.delete(id);
      }
    }
  }
}

export const meetingStore = new MeetingStore();
