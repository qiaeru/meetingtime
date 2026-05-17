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

  const update = () => {
    const m = args.getMeeting();
    el.innerHTML = "";
    if (!m) {
      el.hidden = true;
      return;
    }
    const raised = Object.values(m.participants)
      .filter((p) => p.handRaised)
      .sort((a, b) => (a.handRaisedAt ?? 0) - (b.handRaisedAt ?? 0));
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
        queue.appendChild(renderQueueChip(p, args));
      }
      left.appendChild(queue);
    }

    el.appendChild(left);

    const right = document.createElement("div");
    right.className = "hand-banner-right";
    if (args.isHost()) {
      const grant = document.createElement("button");
      grant.type = "button";
      grant.className = "btn btn-on-accent";
      grant.appendChild(icon("Megaphone", { size: 16 }));
      const span = document.createElement("span");
      span.textContent = " " + t("meeting.giveFloor");
      grant.appendChild(span);
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

function renderQueueChip(p: Participant, args: Args): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "hand-banner-queue-item";
  const fullName = `${p.firstName} ${p.lastName}`.trim();
  if (args.isHost()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hand-banner-chip hand-banner-chip-button";
    btn.setAttribute("aria-label", `${t("meeting.giveFloor")} — ${fullName}`);
    btn.title = `${t("meeting.giveFloor")} — ${fullName}`;
    btn.textContent = fullName;
    btn.addEventListener("click", () =>
      args.socket.emit("speaker:grant", { participantId: p.id })
    );
    li.appendChild(btn);
  } else {
    const span = document.createElement("span");
    span.className = "hand-banner-chip";
    span.textContent = fullName;
    li.appendChild(span);
  }
  return li;
}
