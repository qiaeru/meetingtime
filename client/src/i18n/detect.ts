import type { Locale } from "@meetingtime/shared";

// `supported` has no default on purpose: a hardcoded list here would silently
// freeze detection when a locale is added to SUPPORTED_LOCALES.
export function detectLocale(supported: readonly Locale[], fallback: Locale = "en"): Locale {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of langs) {
    const base = raw.toLowerCase().split("-")[0] as Locale;
    if (supported.includes(base)) return base;
  }
  return fallback;
}
