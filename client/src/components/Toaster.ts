import { t } from "../i18n/index.js";
import { icon } from "./Icon.js";

export type ToastType = "info" | "success" | "error";

interface ToastOpts {
  durationMs?: number;
  type?: ToastType;
}

// Must match the toast-out animation duration in components.css.
const LEAVE_MS = 200;

// Shipped in index.html so the live region exists before the first toast.
const root = (): HTMLElement => document.getElementById("toast-root")!;

// Errors stay until dismissed: they name a recovery step the user has to be
// able to read at their own pace. Other toasts fade out on their own.
export function toast(message: string, opts: ToastOpts = {}): void {
  const type: ToastType = opts.type ?? "info";
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  // role="alert" makes assistive tech announce errors immediately. The role
  // sits on the message only, so the close button's name is not read with it.
  const msg = document.createElement("span");
  msg.className = "toast-message";
  msg.setAttribute("role", type === "error" ? "alert" : "status");
  msg.textContent = message;
  el.appendChild(msg);

  const dismiss = (): void => {
    if (el.classList.contains("toast--leaving")) return;
    el.classList.add("toast--leaving");
    setTimeout(() => el.remove(), LEAVE_MS);
  };

  if (type === "error") {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast-close";
    close.setAttribute("aria-label", t("common.close"));
    close.dataset.tooltip = t("common.close");
    close.appendChild(icon("X", { size: 16 }));
    close.addEventListener("click", dismiss);
    el.appendChild(close);
  } else {
    setTimeout(dismiss, opts.durationMs ?? 4000);
  }
  root().appendChild(el);
}
