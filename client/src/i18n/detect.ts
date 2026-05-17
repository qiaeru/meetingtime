import type { Locale } from "@meetingtime/shared";

export function detectLocale(supported: readonly Locale[] = ["fr", "en"], fallback: Locale = "en"): Locale {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of langs) {
    const base = raw.toLowerCase().split("-")[0] as Locale;
    if (supported.includes(base)) return base;
  }
  return fallback;
}
