import { locale$, t } from "../i18n/index.js";

const BREAKPOINT = 900;

export function mountMobileWarning(): void {
  const el = document.createElement("div");
  el.className = "mobile-warning";
  el.setAttribute("role", "alert");
  document.body.appendChild(el);

  const refresh = (): void => {
    const small = window.innerWidth < BREAKPOINT;
    el.style.display = small ? "block" : "none";
    el.textContent = t("mobile.warning");
  };
  window.addEventListener("resize", refresh);
  // Without this, the text would stay in the old locale until the next
  // resize event.
  locale$.subscribe(refresh);
  refresh();
}
