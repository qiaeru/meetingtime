import type { Meeting } from "@meetingtime/shared";
import { icon } from "./Icon.js";
import { t } from "../i18n/index.js";

export function renderHandRaiseIndicator(getMeeting: () => Meeting | null): {
  el: HTMLElement;
  update: () => void;
} {
  const el = document.createElement("div");
  el.className = "hand-indicator";
  el.setAttribute("aria-live", "polite");
  el.setAttribute("aria-atomic", "true");

  const update = () => {
    const m = getMeeting();
    el.innerHTML = "";
    if (!m) {
      el.dataset.state = "empty";
      return;
    }
    const raised = Object.values(m.participants)
      .filter((p) => p.handRaised)
      .sort((a, b) => (a.handRaisedAt ?? 0) - (b.handRaisedAt ?? 0));
    if (raised.length === 0) {
      el.dataset.state = "empty";
      return;
    }
    el.dataset.state = "raised";
    const first = raised[0];
    const i = icon("Hand", { size: 28, className: "hand-icon-pulse" });
    el.appendChild(i);
    const txt = document.createElement("span");
    txt.textContent = t("meeting.handRaisedBy", { name: `${first.firstName} ${first.lastName}` });
    el.appendChild(txt);
    if (raised.length > 1) {
      const more = document.createElement("span");
      more.className = "hand-more";
      more.textContent = `+${raised.length - 1}`;
      el.appendChild(more);
    }
  };

  update();
  return { el, update };
}
