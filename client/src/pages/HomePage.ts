import { navigate } from "../router.js";
import { t } from "../i18n/index.js";
import { renderThemeToggle } from "../components/ThemeToggle.js";
import { renderLocaleSwitcher } from "../components/LocaleSwitcher.js";
import { icon } from "../components/Icon.js";
import { showKeyboardHelp } from "../components/KeyboardHelpDialog.js";
import { mountFloatingBackground } from "../components/FloatingBackground.js";

export function renderHome(root: HTMLElement): void {
  // Visibility on/off is owned by FloatingBackground itself (CSS keyed on
  // body[data-route]). We just make sure it's mounted.
  mountFloatingBackground();

  const page = document.createElement("main");
  page.className = "page page-home";

  const header = headerBar();
  page.appendChild(header);

  const hero = document.createElement("section");
  hero.className = "hero";

  const h1 = document.createElement("h1");
  h1.textContent = t("app.name");
  const p = document.createElement("p");
  p.className = "hero-subtitle";
  p.textContent = t("home.subtitle");

  const cta = document.createElement("div");
  cta.className = "hero-cta";

  const create = document.createElement("button");
  create.type = "button";
  create.className = "btn btn-primary big-cta";
  create.appendChild(icon("CirclePlus", { size: 20 }));
  const createLbl = document.createElement("span");
  createLbl.textContent = t("home.create");
  create.appendChild(createLbl);
  create.addEventListener("click", () => navigate("/host"));

  const join = document.createElement("button");
  join.type = "button";
  join.className = "btn btn-secondary big-cta";
  const joinIcon = icon("CircleArrowRight", { size: 20 });
  joinIcon.classList.add("cta-icon-tight");
  join.appendChild(joinIcon);
  const joinLbl = document.createElement("span");
  joinLbl.textContent = t("home.join");
  join.appendChild(joinLbl);
  join.addEventListener("click", () => navigate("/join"));

  cta.append(create, join);
  hero.append(h1, p, cta);
  page.appendChild(hero);

  root.appendChild(page);
}

export function headerBar(): HTMLElement {
  const header = document.createElement("header");
  header.className = "app-header";
  const brand = document.createElement("button");
  brand.type = "button";
  brand.className = "brand";
  brand.textContent = "Meetingtime";
  brand.setAttribute("aria-label", t("app.name"));
  brand.addEventListener("click", () => navigate("/"));
  const left = document.createElement("div");
  left.className = "header-left";
  const home = document.createElement("button");
  home.type = "button";
  home.className = "icon-btn";
  home.setAttribute("aria-label", t("common.backHome"));
  home.title = t("common.backHome");
  home.appendChild(icon("Home"));
  home.addEventListener("click", () => navigate("/"));
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
