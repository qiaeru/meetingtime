import type { Locale } from "@meetingtime/shared";
import { icon } from "./Icon.js";
import { locale$, setLocale, SUPPORTED_LOCALES, t } from "../i18n/index.js";

export function renderLocaleSwitcher(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "locale-picker";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn";
  btn.setAttribute("aria-label", t("a11y.languageToggle"));
  btn.title = t("a11y.languageToggle");
  btn.setAttribute("aria-haspopup", "menu");
  btn.setAttribute("aria-expanded", "false");
  btn.appendChild(icon("Languages"));
  wrap.appendChild(btn);

  const menu = document.createElement("ul");
  menu.className = "locale-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  wrap.appendChild(menu);

  const renderMenu = (): void => {
    menu.innerHTML = "";
    for (const { code: c, native } of SUPPORTED_LOCALES) {
      const li = document.createElement("li");
      const item = document.createElement("button");
      item.type = "button";
      item.className = "locale-menu-item";
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-checked", String(c === locale$.get()));
      item.dataset.active = String(c === locale$.get());
      const nameEl = document.createElement("span");
      nameEl.className = "locale-name";
      nameEl.textContent = native;
      item.append(nameEl);
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const target = c as Locale;
        setLocale(target);
        close();
        // Page re-render is owned by main.ts's locale subscriber. Calling
        // rerender() here too races itself in the microtask queue and can
        // leave the page stuck in the old language.
      });
      li.appendChild(item);
      menu.appendChild(li);
    }
  };

  const open = (): void => {
    renderMenu();
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    document.addEventListener("click", onOutside, true);
    document.addEventListener("keydown", onKey);
  };
  const close = (): void => {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onOutside, true);
    document.removeEventListener("keydown", onKey);
  };
  const onOutside = (e: MouseEvent): void => {
    if (!wrap.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hidden) open();
    else close();
  });

  // No teardown: the picker is rebuilt on every page render, the orphan
  // subscription becomes a no-op once `menu` is detached.
  locale$.subscribe(() => {
    if (!menu.hidden) renderMenu();
  });

  return wrap;
}

