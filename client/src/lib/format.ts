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

// Locale-aware spoken units for screen-reader output. Plural is the form
// used for any count !== 1 (zero and 2+), adequate for FR, EN, ES, IT and DE.
const SPOKEN_UNITS: Record<Locale, { hr: [string, string]; min: [string, string]; sec: [string, string] }> = {
  fr: { hr: ["heure", "heures"],   min: ["minute", "minutes"], sec: ["seconde", "secondes"] },
  en: { hr: ["hour", "hours"],     min: ["minute", "minutes"], sec: ["second", "seconds"] },
  es: { hr: ["hora", "horas"],     min: ["minuto", "minutos"], sec: ["segundo", "segundos"] },
  it: { hr: ["ora", "ore"],        min: ["minuto", "minuti"],  sec: ["secondo", "secondi"] },
  de: { hr: ["Stunde", "Stunden"], min: ["Minute", "Minuten"], sec: ["Sekunde", "Sekunden"] },
};

export function formatMsSpoken(ms: number, lang: Locale = "fr"): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const units = SPOKEN_UNITS[lang] ?? SPOKEN_UNITS.fr;
  // Mirror formatMs: speak the hours component once the duration passes an
  // hour, otherwise the spoken time ("75 minutes") diverges from the visible
  // chrono ("1:15:00") on long meetings.
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} ${units.hr[h === 1 ? 0 : 1]}`);
  parts.push(`${m} ${units.min[m === 1 ? 0 : 1]}`);
  parts.push(`${s} ${units.sec[s === 1 ? 0 : 1]}`);
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

export function safeFilename(input: string): string {
  return input.replace(/[\\/:*?"<>|\s]+/g, "_");
}

// French typographic convention puts an NBSP between the number and the %
// sign. Written as the escape so the source file stays free of irregular
// whitespace.
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) ratio = 0;
  return `${Math.round(ratio * 100)}\u00A0%`;
}
