// Canonical server-side locale list. The client mirror is in
// client/src/i18n/index.ts; both must stay in sync (see docs/i18n.md).
export const SUPPORTED_LOCALES = ["en", "fr", "es", "it", "de"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const FALLBACK_LOCALE: SupportedLocale = "en";

// Parses Accept-Language with q-factors and matches by primary subtag, so
// `fr-CA` resolves to `fr`. Falls back to FALLBACK_LOCALE when nothing matches.
export function pickLocale(acceptLanguage: string | undefined): SupportedLocale {
  if (!acceptLanguage) return FALLBACK_LOCALE;
  const tags = acceptLanguage
    .split(",")
    .map((entry) => {
      const [tag, ...params] = entry.trim().split(";");
      let q = 1;
      for (const p of params) {
        const m = p.trim().match(/^q=(\d+(?:\.\d+)?)$/i);
        if (m) q = Number(m[1]);
      }
      return { tag: tag.toLowerCase(), q };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    const primary = tag.split("-")[0];
    if ((SUPPORTED_LOCALES as readonly string[]).includes(primary)) {
      return primary as SupportedLocale;
    }
  }
  return FALLBACK_LOCALE;
}
