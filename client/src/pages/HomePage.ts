import { t } from "../i18n/index.js";
import { renderThemeToggle } from "../components/ThemeToggle.js";
import { renderLocaleSwitcher } from "../components/LocaleSwitcher.js";
import { icon } from "../components/Icon.js";
import { showKeyboardHelp } from "../components/KeyboardHelpDialog.js";
import { mountFloatingBackground } from "../components/FloatingBackground.js";
import { siteFooter } from "../components/SiteFooter.js";

export function renderHome(root: HTMLElement): void {
  // Visibility on/off is owned by FloatingBackground itself (CSS keyed on
  // body[data-route]). We just make sure it's mounted.
  mountFloatingBackground();

  const page = document.createElement("div");
  page.className = "page page-home";

  const header = headerBar();
  page.appendChild(header);

  const hero = document.createElement("main");
  hero.className = "hero";

  const h1 = document.createElement("h1");
  h1.textContent = t("app.name");
  const p = document.createElement("p");
  p.className = "hero-subtitle";
  p.textContent = t("home.subtitle");

  const cta = document.createElement("div");
  cta.className = "hero-cta";

  // Links, not buttons: they navigate, so middle-click and "open in a new
  // tab" must work.
  const create = document.createElement("a");
  create.href = "#/host";
  create.className = "btn btn-primary big-cta";
  create.appendChild(icon("CirclePlus", { size: 20 }));
  const createLbl = document.createElement("span");
  createLbl.textContent = t("home.create");
  create.appendChild(createLbl);

  const join = document.createElement("a");
  join.href = "#/join";
  join.className = "btn btn-secondary big-cta";
  const joinIcon = icon("CircleArrowRight", { size: 20 });
  joinIcon.classList.add("cta-icon-tight");
  join.appendChild(joinIcon);
  const joinLbl = document.createElement("span");
  joinLbl.textContent = t("home.join");
  join.appendChild(joinLbl);

  cta.append(create, join);
  hero.append(h1, p, cta);
  page.appendChild(hero);

  page.appendChild(siteFooter());
  root.appendChild(page);
}

export function headerBar(): HTMLElement {
  const header = document.createElement("header");
  header.className = "app-header";
  const brand = document.createElement("a");
  brand.href = "#/";
  brand.className = "brand";
  brand.textContent = t("app.name");
  const left = document.createElement("div");
  left.className = "header-left";
  const home = document.createElement("a");
  home.href = "#/";
  home.className = "icon-btn";
  home.setAttribute("aria-label", t("common.backHome"));
  home.title = t("common.backHome");
  home.appendChild(icon("Home"));
  left.append(home, brand);

  const right = document.createElement("div");
  right.className = "header-actions";
  const help = document.createElement("button");
  help.type = "button";
  help.className = "icon-btn";
  help.setAttribute("aria-label", t("a11y.help"));
  help.title = t("a11y.help");
  help.appendChild(icon("HelpCircle"));
  help.addEventListener("click", showKeyboardHelp);
  right.append(renderLocaleSwitcher(), renderThemeToggle(), help);
  header.append(left, right);
  return header;
}
