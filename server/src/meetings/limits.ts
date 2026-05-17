// Hard caps re-enforced inside Meeting.* methods. The socket handlers
// validate first; these are the defensive backstop for any future caller
// that bypasses sanitizeIdentity().
export const MAX_IDENTITY_FIELD = 60;
export const MAX_TOPIC_LABEL = 200;
export const MAX_PARTICIPANTS = 200;
export const MAX_TOPICS = 100;
export const MAX_PASSWORD = 128;
export const MAX_TIMEBOX_MS = 60 * 60 * 1000;
export const MAX_PLANNED_MS = 24 * 60 * 60 * 1000;

export function clampString(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

export function clampPositiveMs(value: unknown, max: number): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.floor(n), max);
}
