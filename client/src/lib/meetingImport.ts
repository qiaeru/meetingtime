import type { ParticipantIdentity } from "@meetingtime/shared";
import { formatDateYMDCompact } from "./format.js";

export interface MeetingDraft {
  host?: ParticipantIdentity;
  participants: ParticipantIdentity[];
  topics: string[];
  timeboxMinutes?: number;
  plannedDurationMinutes?: number;
  password?: string;
}

// See docs/meeting_import.md for the schema. Throws Error with a
// human-readable reason on invalid input.
export function parseMeetingJSON(raw: string): MeetingDraft {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`JSON parse error: ${(e as Error).message}`, { cause: e });
  }
  if (!isObject(data)) throw new Error("root must be an object");

  const draft: MeetingDraft = { participants: [], topics: [] };

  if ("host" in data && data.host !== undefined) {
    draft.host = parseIdentity(data.host, "host");
  }

  if ("participants" in data && data.participants !== undefined) {
    if (!Array.isArray(data.participants)) throw new Error("participants must be an array");
    draft.participants = data.participants.map((p, i) => parseIdentity(p, `participants[${i}]`));
  }

  if ("topics" in data && data.topics !== undefined) {
    if (!Array.isArray(data.topics)) throw new Error("topics must be an array");
    draft.topics = data.topics.map((t, i) => {
      if (typeof t !== "string") throw new Error(`topics[${i}] must be a string`);
      const trimmed = t.trim();
      if (!trimmed) throw new Error(`topics[${i}] is empty`);
      return trimmed;
    });
  }

  if ("timeboxMinutes" in data && data.timeboxMinutes !== undefined) {
    if (typeof data.timeboxMinutes !== "number" || data.timeboxMinutes < 0) {
      throw new Error("timeboxMinutes must be a positive number");
    }
    draft.timeboxMinutes = data.timeboxMinutes;
  }

  if ("plannedDurationMinutes" in data && data.plannedDurationMinutes !== undefined) {
    if (typeof data.plannedDurationMinutes !== "number" || data.plannedDurationMinutes < 0) {
      throw new Error("plannedDurationMinutes must be a positive number");
    }
    draft.plannedDurationMinutes = data.plannedDurationMinutes;
  }

  if ("password" in data && data.password !== undefined) {
    if (typeof data.password !== "string") {
      throw new Error("password must be a string");
    }
    const trimmed = data.password.trim();
    if (trimmed) draft.password = trimmed;
  }

  return draft;
}

function parseIdentity(raw: unknown, path: string): ParticipantIdentity {
  if (!isObject(raw)) throw new Error(`${path} must be an object`);
  const firstName = strField(raw, "firstName", path);
  const lastName = strField(raw, "lastName", path);
  const role = strField(raw, "role", path);
  return { firstName, lastName, role };
}

function strField(o: Record<string, unknown>, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== "string" || !v.trim()) throw new Error(`${path}.${key} is required and must be a non-empty string`);
  return v.trim();
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function stringifyMeetingDraft(draft: MeetingDraft): string {
  const out: Record<string, unknown> = {};
  if (draft.host) out.host = draft.host;
  if (draft.participants.length > 0) out.participants = draft.participants;
  if (draft.topics.length > 0) out.topics = draft.topics;
  if (typeof draft.timeboxMinutes === "number") out.timeboxMinutes = draft.timeboxMinutes;
  if (typeof draft.plannedDurationMinutes === "number") {
    out.plannedDurationMinutes = draft.plannedDurationMinutes;
  }
  if (typeof draft.password === "string" && draft.password) out.password = draft.password;
  return JSON.stringify(out, null, 2) + "\n";
}

export function downloadMeetingTemplate(draft: MeetingDraft): void {
  const json = stringifyMeetingDraft(draft);
  const filename = `${formatDateYMDCompact()}_Meetingtime_Template.json`;
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
