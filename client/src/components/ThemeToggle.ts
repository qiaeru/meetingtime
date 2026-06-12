import { Observable } from "../state/store.js";
import { icon } from "./Icon.js";
import { t } from "../i18n/index.js";

type Theme = "light" | "dark";

const KEY = "mt:theme";

export const theme$ = new Observable<Theme>("light");

function detect(): Theme {
  try {
    const saved = localStorage.getItem(KEY) as Theme | null;
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

let themeInitialized = false;
let transitionTimer: number | null = null;

function apply(theme: Theme): void {
  // Skip the cross-fade on the very first apply so the initial paint matches
  // the saved theme instantly instead of fading in from the default.
  if (themeInitialized) {
    const root = document.documentElement;
    root.classList.add("theme-transitioning");
    if (transitionTimer !== null) window.clearTimeout(transitionTimer);
    transitionTimer = window.setTimeout(() => {
      root.classList.remove("theme-transitioning");
      transitionTimer = null;
    }, 250);
  }
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  themeInitialized = true;
}

export function initTheme(): void {
  theme$.set(detect());
  theme$.subscribe(apply);
}

export function toggleTheme(): void {
  theme$.set(theme$.get() === "dark" ? "light" : "dark");
}

export function renderThemeToggle(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn";
  btn.setAttribute("aria-label", t("a11y.themeToggle"));
  btn.title = t("a11y.themeToggle");
  // Self-unsubscribe once the button leaves the DOM (the router rebuilds the
  // header on every render); a persistent subscription per render would
  // accumulate listeners and retain detached buttons for the whole session.
  // subscribe() fires synchronously before the button is appended, so the
  // isConnected check must only apply to later notifications.
  let first = true;
  const unsub = theme$.subscribe(() => {
    if (!first && !btn.isConnected) {
      unsub();
      return;
    }
    first = false;
    btn.innerHTML = "";
    btn.appendChild(icon(theme$.get() === "dark" ? "Sun" : "Moon"));
    // Exposes the current state (dark on/off) to assistive tech; the icon
    // swap alone is aria-hidden.
    btn.setAttribute("aria-pressed", String(theme$.get() === "dark"));
  });
  btn.addEventListener("click", toggleTheme);
  return btn;
}
