import { connection$ } from "../state/socket.js";
import { icon } from "./Icon.js";
import { t } from "../i18n/index.js";

// Stays up until the connection is restored so a dropped WebSocket can't be
// mistaken for an unresponsive UI.
export function renderConnectionBanner(): { el: HTMLElement; destroy: () => void } {
  const el = document.createElement("div");
  el.className = "connection-banner";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  const text = document.createElement("span");
  el.append(icon("CloudOff", { size: 16 }), text);
  const destroy = connection$.subscribe((status) => {
    el.dataset.status = status;
    el.hidden = status === "connected";
    if (status !== "connected") {
      text.textContent =
        status === "reconnecting" ? t("meeting.connReconnecting") : t("meeting.connDisconnected");
    }
  });
  return { el, destroy };
}
