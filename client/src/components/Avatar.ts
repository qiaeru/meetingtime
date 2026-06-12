import type { Participant } from "@meetingtime/shared";
import { icon } from "./Icon.js";
import { t } from "../i18n/index.js";

interface Args {
  participant: Pick<Participant, "firstName" | "lastName" | "role">;
  color: string;
  size?: number;
  connected?: boolean;
  badge?: "speaking" | "hand" | null;
}

function initials(p: { firstName: string; lastName: string }): string {
  const a = (p.firstName.trim()[0] ?? "?").toUpperCase();
  const b = (p.lastName.trim()[0] ?? "").toUpperCase();
  return a + b;
}

export function renderAvatar(args: Args): HTMLElement {
  const size = args.size ?? 40;
  const wrap = document.createElement("span");
  wrap.className = "avatar";
  wrap.style.width = `${size}px`;
  wrap.style.height = `${size}px`;
  wrap.dataset.connected = String(args.connected ?? true);
  if (args.badge) wrap.dataset.badge = args.badge;

  // Screen readers get the full name + role + state instead of just the
  // two initials rendered visually.
  const p = args.participant;
  const fullName = `${p.firstName} ${p.lastName}`.trim();
  const parts = [fullName];
  if (p.role) parts.push(p.role);
  if (args.connected === false) parts.push(t("a11y.offline"));
  if (args.badge === "speaking") parts.push(t("meeting.currentSpeaker"));
  else if (args.badge === "hand") parts.push(t("meeting.raiseHand"));
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", parts.join(", "));

  const inner = document.createElement("span");
  inner.className = "avatar-inner";
  inner.style.background = args.color;
  inner.setAttribute("aria-hidden", "true");
  inner.style.fontSize = `${Math.max(10, Math.round(size * 0.34))}px`;
  inner.textContent = initials(args.participant);
  wrap.appendChild(inner);

  if (args.badge === "hand") {
    const b = document.createElement("span");
    b.className = "avatar-badge avatar-badge--hand";
    b.style.width = `${Math.max(16, Math.round(size * 0.4))}px`;
    b.style.height = `${Math.max(16, Math.round(size * 0.4))}px`;
    b.appendChild(icon("Hand", { size: Math.max(9, Math.round(size * 0.24)) }));
    wrap.appendChild(b);
  } else if (args.badge === "speaking") {
    const b = document.createElement("span");
    b.className = "avatar-badge avatar-badge--speaking";
    b.style.width = `${Math.max(16, Math.round(size * 0.4))}px`;
    b.style.height = `${Math.max(16, Math.round(size * 0.4))}px`;
    b.appendChild(icon("Speech", { size: Math.max(9, Math.round(size * 0.24)) }));
    wrap.appendChild(b);
  }

  return wrap;
}
