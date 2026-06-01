// Self-hosted fonts: Vite bundles the woff2 at build time so the app stays
// runnable on an air-gapped host (no fonts.googleapis.com fetch).
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";

import "./styles/reset.css";
import "./styles/theme.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/animations.css";

import { rerender, startRouter } from "./router.js";
import { initTheme } from "./components/ThemeToggle.js";
import { connect } from "./state/socket.js";
import { initKeyboardLayer } from "./lib/keyboard.js";
import { mountToaster } from "./components/Toaster.js";
import { locale$, t } from "./i18n/index.js";

initTheme();
connect();
initKeyboardLayer();
mountToaster();
applyStaticI18n();
locale$.subscribe(() => applyStaticI18n());

// For elements that ship in index.html and must render before JS hydrates
// (currently the skip-link).
function applyStaticI18n(): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  }
}

// Snapshot form values on locale change so they survive the page rebuild.
// The previousLocale guard is required because Observable.subscribe fires
// synchronously on subscription.
let previousLocale = locale$.get();
locale$.subscribe((next) => {
  if (next === previousLocale) return;
  previousLocale = next;
  const snapshot = snapshotFormFields();
  rerender();
  // rerender() resolves async via a dynamic import, so the restore has to
  // wait for the new DOM to actually land.
  queueMicrotask(() => requestAnimationFrame(() => restoreFormFields(snapshot)));
});

interface FieldSnapshot {
  ariaLabel: string | null;
  type: string;
  value: string;
  index: number;
}

function snapshotFormFields(): FieldSnapshot[] {
  const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "#app input, #app textarea"
  );
  return Array.from(inputs).map((el, index) => ({
    ariaLabel: el.getAttribute("aria-label"),
    type: el instanceof HTMLInputElement ? el.type : "textarea",
    value: el.value,
    index,
  }));
}

function restoreFormFields(snapshot: FieldSnapshot[]): void {
  if (snapshot.length === 0) return;
  const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "#app input, #app textarea"
  );
  if (inputs.length === 0) return;
  // Positional match: the /host and /join forms have a locale-independent
  // structure, so matching by index + input type is sufficient and avoids
  // having to track aria-labels across translation.
  if (inputs.length === snapshot.length) {
    snapshot.forEach((s, i) => {
      const el = inputs[i];
      const elType = el instanceof HTMLInputElement ? el.type : "textarea";
      if (elType === s.type && !s.value) return;
      if (elType === s.type) el.value = s.value;
    });
  }
}

startRouter();
