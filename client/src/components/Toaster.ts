export type ToastType = "info" | "success" | "error";

interface ToastOpts {
  durationMs?: number;
  type?: ToastType;
}

let counter = 0;
const queue = new Map<number, HTMLElement>();

function root(): HTMLElement {
  let r = document.getElementById("toast-root");
  if (!r) {
    r = document.createElement("div");
    r.id = "toast-root";
    r.setAttribute("aria-live", "polite");
    document.body.appendChild(r);
  }
  return r;
}

export function mountToaster(): void {
  root();
}

export function toast(message: string, opts: ToastOpts = {}): number {
  const id = ++counter;
  const timeoutMs = opts.durationMs ?? 4000;
  const type: ToastType = opts.type ?? "info";
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  // role="alert" makes assistive tech announce errors immediately.
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.textContent = message;
  root().appendChild(el);
  queue.set(id, el);
  setTimeout(() => {
    el.classList.add("toast--leaving");
    setTimeout(() => {
      el.remove();
      queue.delete(id);
    }, 300);
  }, timeoutMs);
  return id;
}
