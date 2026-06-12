import type { Locale } from "@meetingtime/shared";
import { Observable } from "../state/store.js";
import { detectLocale } from "./detect.js";
import fr from "./locales/fr.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import it from "./locales/it.json";
import de from "./locales/de.json";

type Dict = Record<string, string>;

const dicts: Record<Locale, Dict> = { fr, en, es, it, de };

// Sorted by native name so the picker order doesn't depend on insertion
// order (which carried no meaning).
export const SUPPORTED_LOCALES: ReadonlyArray<{ code: Locale; native: string; flag: string }> = (
  [
    { code: "fr", native: "Français", flag: "🇫🇷" },
    { code: "en", native: "English", flag: "🇬🇧" },
    { code: "es", native: "Español", flag: "🇪🇸" },
    { code: "it", native: "Italiano", flag: "🇮🇹" },
    { code: "de", native: "Deutsch", flag: "🇩🇪" },
  ] as const
)
  .slice()
  .sort((a, b) => a.native.localeCompare(b.native));

const LOCALE_CODES: readonly Locale[] = SUPPORTED_LOCALES.map((l) => l.code);
const STORAGE_KEY = "mt:locale";

const initial: Locale = (() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved && LOCALE_CODES.includes(saved)) return saved;
  } catch {
    /* ignore */
  }
  return detectLocale(LOCALE_CODES);
})();

export const locale$ = new Observable<Locale>(initial);

locale$.subscribe((l) => {
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l;
});

// Fallback chain: active locale → French → raw key.
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = dicts[locale$.get()];
  const raw = dict[key] ?? dicts.fr[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_m, k: string) => String(params[k] ?? `{${k}}`));
}

export function setLocale(l: Locale): void {
  locale$.set(l);
}
