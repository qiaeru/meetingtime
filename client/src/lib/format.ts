export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

import type { Locale } from "@meetingtime/shared";

// Screen-reader output. Intl carries the unit words and each language's
// plural rules, so no locale table lives in code.
const spokenUnit = (lang: Locale, unit: "hour" | "minute" | "second", n: number): string =>
  new Intl.NumberFormat(lang, { style: "unit", unit, unitDisplay: "long" }).format(n);

export function formatMsSpoken(ms: number, lang: Locale = "fr"): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  // Mirror formatMs: speak the hours component once the duration passes an
  // hour, otherwise the spoken time ("75 minutes") diverges from the visible
  // chrono ("1:15:00") on long meetings.
  const parts: string[] = [];
  if (h > 0) parts.push(spokenUnit(lang, "hour", h));
  parts.push(spokenUnit(lang, "minute", m));
  parts.push(spokenUnit(lang, "second", s));
  return parts.join(" ");
}

export function formatDateDMY(ts: number = Date.now()): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

// YYYYMMDD format keeps exported filenames in chronological order when
// listed alphabetically.
export function formatDateYMDCompact(ts: number = Date.now()): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// French typographic convention puts an NBSP between the number and the %
// sign. Written as the escape so the source file stays free of irregular
// whitespace.
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) ratio = 0;
  return `${Math.round(ratio * 100)}\u00A0%`;
}
