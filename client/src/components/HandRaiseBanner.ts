import type { Meeting, Participant } from "@meetingtime/shared";
import type { MeetingSocket } from "../state/socket.js";
import { icon } from "./Icon.js";
import { t } from "../i18n/index.js";

interface Args {
  getMeeting: () => Meeting | null;
  socket: MeetingSocket;
  isHost: () => boolean;
}

export function renderHandRaiseBanner(args: Args): { el: HTMLElement; update: () => void } {
  const el = document.createElement("div");
  el.className = "hand-banner";
  el.setAttribute("aria-live", "polite");
  el.setAttribute("aria-atomic", "true");
  el.hidden = true;

  // The element is an aria-live region updated on every meeting:state push;
  // rebuilding it when the raised-hands queue did not change would make
  // screen readers re-announce it on every unrelated state change (and would
  // destroy the Grant button mid-click).
  let lastKey = "";
  const update = () => {
    const m = args.getMeeting();
    const raised = m
      ? Object.values(m.participants)
          .filter((p) => p.handRaised)
          .sort((a, b) => (a.handRaisedAt ?? 0) - (b.handRaisedAt ?? 0))
      : [];
    const key = raised.map((p) => p.id).join(",") + (canGrant(m, args) ? "|grant" : "");
    if (key === lastKey) return;
    lastKey = key;
    el.innerHTML = "";
    if (raised.length === 0) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const [first, ...rest] = raised;

    const left = document.createElement("div");
    left.className = "hand-banner-left";
    const ic = icon("Hand", { size: 24, className: "hand-icon-pulse" });
    left.appendChild(ic);

    const message = document.createElement("span");
    message.className = "hand-banner-message";
    message.textContent = t("meeting.handRaisedBy", {
      name: `${first.firstName} ${first.lastName}`,
    });
    left.appendChild(message);

    // Hosts get clickable chips to grant the floor directly; others get
    // static spans (read-only).
    if (rest.length > 0) {
      const queue = document.createElement("ul");
      queue.className = "hand-banner-queue";
      queue.setAttribute("aria-label", t("meeting.handQueueLabel"));
      for (const p of rest) {
        queue.appendChild(renderQueueChip(p, canGrant(m, args), args));
      }
      left.appendChild(queue);
    }

    el.appendChild(left);

    const right = document.createElement("div");
    right.className = "hand-banner-right";
    if (canGrant(m, args)) {
      const grant = document.createElement("button");
      grant.type = "button";
      grant.className = "btn btn-on-accent";
      grant.appendChild(icon("Megaphone", { size: 16 }));
      const span = document.createElement("span");
      span.textContent = t("meeting.giveFloor");
      grant.appendChild(span);
      grant.setAttribute(
        "aria-label",
        t("a11y.actionOn", {
          action: t("meeting.giveFloor"),
          target: `${first.firstName} ${first.lastName}`,
        })
      );
      grant.addEventListener("click", () =>
        args.socket.emit("speaker:grant", { participantId: first.id })
      );
      right.appendChild(grant);
    }
    el.appendChild(right);
  };

  update();
  return { el, update };
}

// The server only grants the floor while the meeting runs or is paused, so
// hosts get no Grant controls in the lobby or once it has ended.
function canGrant(m: Meeting | null, args: Args): boolean {
  return args.isHost() && (m?.phase === "running" || m?.phase === "paused");
}

function renderQueueChip(p: Participant, grantable: boolean, args: Args): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "hand-banner-queue-item";
  const fullName = `${p.firstName} ${p.lastName}`.trim();
  if (grantable) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hand-banner-chip hand-banner-chip-button";
    const label = t("a11y.actionOn", { action: t("meeting.giveFloor"), target: fullName });
    btn.setAttribute("aria-label", label);
    btn.dataset.tooltip = label;
    btn.textContent = fullName;
    btn.addEventListener("click", () => args.socket.emit("speaker:grant", { participantId: p.id }));
    li.appendChild(btn);
  } else {
    const span = document.createElement("span");
    span.className = "hand-banner-chip";
    span.textContent = fullName;
    span.dataset.tooltip = fullName;
    li.appendChild(span);
  }
  return li;
}
