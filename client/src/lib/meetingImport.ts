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

// Carries a reason code (localized by the caller under host.importReason.*)
// plus the offending JSON path, instead of an English sentence.
export class MeetingImportError extends Error {
  constructor(
    readonly reason: "json" | "root" | "object" | "array" | "string" | "text" | "number",
    readonly field = ""
  ) {
    super(field ? `${field}: ${reason}` : reason);
  }
}

// See docs/meeting_import.md for the schema. Throws MeetingImportError on
// invalid input.
export function parseMeetingJSON(raw: string): MeetingDraft {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new MeetingImportError("json");
  }
  if (!isObject(data)) throw new MeetingImportError("root");

  const draft: MeetingDraft = { participants: [], topics: [] };

  if ("host" in data && data.host !== undefined) {
    draft.host = parseIdentity(data.host, "host");
  }

  if ("participants" in data && data.participants !== undefined) {
    if (!Array.isArray(data.participants)) throw new MeetingImportError("array", "participants");
    draft.participants = data.participants.map((p, i) => parseIdentity(p, `participants[${i}]`));
  }

  if ("topics" in data && data.topics !== undefined) {
    if (!Array.isArray(data.topics)) throw new MeetingImportError("array", "topics");
    draft.topics = data.topics.map((t, i) => {
      const trimmed = typeof t === "string" ? t.trim() : "";
      if (!trimmed) throw new MeetingImportError("text", `topics[${i}]`);
      return trimmed;
    });
  }

  if ("timeboxMinutes" in data && data.timeboxMinutes !== undefined) {
    if (typeof data.timeboxMinutes !== "number" || data.timeboxMinutes < 0) {
      throw new MeetingImportError("number", "timeboxMinutes");
    }
    draft.timeboxMinutes = data.timeboxMinutes;
  }

  if ("plannedDurationMinutes" in data && data.plannedDurationMinutes !== undefined) {
    if (typeof data.plannedDurationMinutes !== "number" || data.plannedDurationMinutes < 0) {
      throw new MeetingImportError("number", "plannedDurationMinutes");
    }
    draft.plannedDurationMinutes = data.plannedDurationMinutes;
  }

  if ("password" in data && data.password !== undefined) {
    if (typeof data.password !== "string") {
      throw new MeetingImportError("string", "password");
    }
    const trimmed = data.password.trim();
    if (trimmed) draft.password = trimmed;
  }

  return draft;
}

function parseIdentity(raw: unknown, path: string): ParticipantIdentity {
  if (!isObject(raw)) throw new MeetingImportError("object", path);
  const firstName = strField(raw, "firstName", path);
  const lastName = strField(raw, "lastName", path);
  const role = strField(raw, "role", path);
  return { firstName, lastName, role };
}

function strField(o: Record<string, unknown>, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== "string" || !v.trim()) throw new MeetingImportError("text", `${path}.${key}`);
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
