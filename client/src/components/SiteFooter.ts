import { t } from "../i18n/index.js";

const REPO_URL = "https://github.com/qiaeru/meetingtime";
const AUTHOR_URL = "https://qiae.ru";

// Inline GitHub mark (single path) so it ships with the bundle and needs no
// network fetch; the app must run fully offline.
const GITHUB_PATH =
  "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12";

// Attribution footer for the home, host-setup and join screens only (not the
// meeting room). Mirrors the lockup used on the owner's other projects.
export function siteFooter(): HTMLElement {
  const footer = document.createElement("footer");
  footer.className = "site-footer";

  const developedBy = document.createElement("span");
  developedBy.textContent = t("footer.developedBy");

  const author = document.createElement("a");
  author.className = "site-footer-link";
  author.href = AUTHOR_URL;
  author.target = "_blank";
  author.rel = "noopener noreferrer";
  author.setAttribute("aria-label", "Qiaeru");
  // qiae.ru lockup: the head sits on an organic orange blob drawn in CSS
  // (::before), mirroring the source site. The blob is not part of the SVG.
  const logoWrap = document.createElement("span");
  logoWrap.className = "qiaeru-logo";
  const logo = document.createElement("img");
  logo.className = "site-footer-logo";
  logo.src = "/icons/qiaeru.svg";
  logo.alt = "Qiaeru";
  logo.width = 22;
  logo.height = 22;
  logo.draggable = false;
  logoWrap.appendChild(logo);
  author.appendChild(logoWrap);

  const sep = document.createElement("span");
  sep.className = "site-footer-sep";
  sep.setAttribute("aria-hidden", "true");
  sep.textContent = "|";

  const sourceCode = document.createElement("span");
  sourceCode.textContent = t("footer.sourceCode");

  const repo = document.createElement("a");
  repo.className = "site-footer-link";
  repo.href = REPO_URL;
  repo.target = "_blank";
  repo.rel = "noopener noreferrer";
  repo.setAttribute("aria-label", "GitHub");
  const svgNS = "http://www.w3.org/2000/svg";
  const gh = document.createElementNS(svgNS, "svg");
  gh.setAttribute("class", "site-footer-logo");
  gh.setAttribute("viewBox", "0 0 24 24");
  gh.setAttribute("fill", "currentColor");
  gh.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", GITHUB_PATH);
  gh.appendChild(path);
  repo.appendChild(gh);

  footer.append(developedBy, author, sep, sourceCode, repo);
  return footer;
}
