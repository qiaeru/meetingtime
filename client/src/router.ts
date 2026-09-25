import { t } from "./i18n/index.js";
import { toast } from "./components/Toaster.js";

type Renderer = (root: HTMLElement, params: URLSearchParams) => void | (() => void);
type RouteLoader = () => Promise<Renderer>;

// Routes load on demand: CodeMirror, Yjs and Shiki only download when the
// user actually opens the meeting view, not on the home page.
// `title` names the page in the browser tab and history (null: brand only).
const routes: Array<{
  path: string;
  load: RouteLoader;
  title: (params: URLSearchParams) => string | null;
}> = [
  {
    path: "/",
    load: () => import("./pages/HomePage.js").then((m) => m.renderHome),
    title: () => null,
  },
  {
    path: "/host",
    load: () => import("./pages/HostSetupPage.js").then((m) => m.renderHostSetup),
    title: () => t("host.title"),
  },
  {
    path: "/join",
    load: () => import("./pages/JoinPage.js").then((m) => m.renderJoin),
    title: () => t("join.title"),
  },
  {
    path: "/meeting",
    load: () => import("./pages/MeetingPage.js").then((m) => m.renderMeeting),
    title: (params) => t("meeting.title", { id: params.get("id") ?? "" }),
  },
];

let currentTeardown: (() => void) | void;
// Cleanups registered by widgets built during the current render that the
// page's own teardown does not own (the header controls every page shares).
let widgetTeardowns: Array<() => void> = [];
// Lets render() drop stale dynamic-import resolutions when the user
// navigates again before the previous load finishes.
let renderToken = 0;
const RELOAD_STAMP_KEY = "mt:chunkReloadAt";

function parseHash(): { path: string; params: URLSearchParams } {
  const raw = location.hash.startsWith("#") ? location.hash.slice(1) : "/";
  const [path, query = ""] = raw.split("?");
  return { path: path || "/", params: new URLSearchParams(query) };
}

async function render(): Promise<void> {
  const myToken = ++renderToken;
  if (typeof currentTeardown === "function") currentTeardown();
  currentTeardown = undefined;
  for (const fn of widgetTeardowns) fn();
  widgetTeardowns = [];

  const { path, params } = parseHash();
  const route = routes.find((r) => r.path === path) ?? routes[0];
  // body[data-route] lets CSS target the current page (e.g. the floating
  // background is mounted on body and only shown on the home route).
  document.body.dataset.route = route.path;

  let renderFn: Renderer;
  try {
    renderFn = await route.load();
  } catch (err) {
    console.error("Failed to load route module", err);
    if (myToken !== renderToken) return;
    // Usually a tab opened before a server upgrade, asking for chunk files the
    // new build no longer ships: a reload picks up the new build. The stamp
    // stops a reload loop when something else is broken.
    try {
      const last = Number(sessionStorage.getItem(RELOAD_STAMP_KEY));
      if (navigator.onLine && !(Date.now() - last < 10_000)) {
        sessionStorage.setItem(RELOAD_STAMP_KEY, String(Date.now()));
        location.reload();
        return;
      }
    } catch {
      /* storage blocked: fall through to the error toast */
    }
    toast(t("errors.connection"), { type: "error" });
    return;
  }
  if (myToken !== renderToken) return;

  const root = document.getElementById("app")!;
  root.innerHTML = "";
  currentTeardown = renderFn(root, params) ?? undefined;
  const title = route.title(params);
  document.title = title ? `${title} · ${t("app.name")}` : t("app.name");

  // Move focus to the new page's <main> so keyboard users (and the skip
  // link's target) land in the new view instead of a stale element.
  const main = root.querySelector<HTMLElement>("main");
  if (main) {
    main.id = "main-content";
    main.setAttribute("tabindex", "-1");
    main.focus({ preventScroll: true });
  }
}

// Runs `fn` when the current page is torn down (navigation or re-render).
export function onRouteTeardown(fn: () => void): void {
  widgetTeardowns.push(fn);
}

export function navigate(path: string, params?: Record<string, string>): void {
  const q = params ? "?" + new URLSearchParams(params).toString() : "";
  location.hash = `${path}${q}`;
}

export function startRouter(): void {
  window.addEventListener("hashchange", () => {
    void render();
  });
  void render();
}

export function rerender(): void {
  void render();
}
