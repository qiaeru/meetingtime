type Renderer = (root: HTMLElement, params: URLSearchParams) => void | (() => void);
type RouteLoader = () => Promise<Renderer>;

// Routes load on demand: CodeMirror, Yjs and Shiki only download when the
// user actually opens the meeting view, not on the home page.
const routes: Array<{ path: string; load: RouteLoader }> = [
  { path: "/", load: () => import("./pages/HomePage.js").then((m) => m.renderHome) },
  { path: "/host", load: () => import("./pages/HostSetupPage.js").then((m) => m.renderHostSetup) },
  { path: "/join", load: () => import("./pages/JoinPage.js").then((m) => m.renderJoin) },
  { path: "/meeting", load: () => import("./pages/MeetingPage.js").then((m) => m.renderMeeting) },
];

let currentTeardown: (() => void) | void;
// Lets render() drop stale dynamic-import resolutions when the user
// navigates again before the previous load finishes.
let renderToken = 0;

function parseHash(): { path: string; params: URLSearchParams } {
  const raw = location.hash.startsWith("#") ? location.hash.slice(1) : "/";
  const [path, query = ""] = raw.split("?");
  return { path: path || "/", params: new URLSearchParams(query) };
}

async function render(): Promise<void> {
  const myToken = ++renderToken;
  if (typeof currentTeardown === "function") currentTeardown();
  currentTeardown = undefined;

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
    return;
  }
  if (myToken !== renderToken) return;

  const root = document.getElementById("app")!;
  root.innerHTML = "";
  currentTeardown = renderFn(root, params) ?? undefined;

  // Move focus to the new page's <main> so keyboard users (and the skip
  // link's target) land in the new view instead of a stale element.
  const main = root.querySelector<HTMLElement>("main");
  if (main) {
    main.id = "main-content";
    main.setAttribute("tabindex", "-1");
    main.focus({ preventScroll: true });
  }
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
