import type { Meeting } from "@meetingtime/shared";
import { formatMs } from "../lib/format.js";
import { t } from "../i18n/index.js";

export function renderMeetingTimer(getMeeting: () => Meeting | null): { el: HTMLElement; stop: () => void } {
  const el = document.createElement("div");
  el.className = "global-timer";
  el.dataset.zone = "none";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "off");

  // Height = elapsed / planned. The wave effect is purely CSS (see the
  // ::before / ::after rules on .global-timer-fill in components.css).
  const fill = document.createElement("span");
  fill.className = "global-timer-fill";
  fill.setAttribute("aria-hidden", "true");
  fill.style.height = "0%";

  const label = document.createElement("span");
  label.className = "global-timer-label";

  const value = document.createElement("span");
  value.className = "global-timer-value";

  const planned = document.createElement("span");
  planned.className = "global-timer-planned";
  planned.hidden = true;

  el.append(fill, label, value, planned);

  const tick = () => {
    const m = getMeeting();
    label.textContent = t("meeting.global");
    if (!m || !m.startedAt) {
      value.textContent = "00:00";
      fill.style.height = "0%";
      el.dataset.zone = "none";
      if (m?.plannedDurationMs && m.plannedDurationMs > 0) {
        planned.textContent = formatMs(m.plannedDurationMs);
        planned.hidden = false;
      } else {
        planned.hidden = true;
      }
      return;
    }
    // Freeze on endedAt once the meeting is over; otherwise the counter
    // would keep climbing against wall-clock time.
    const now = m.phase === "ended" && m.endedAt ? m.endedAt : Date.now();
    let elapsed = now - m.startedAt - m.pauseAccumulatedMs;
    if (m.phase === "paused" && m.pausedSince) {
      elapsed -= now - m.pausedSince;
    }
    value.textContent = formatMs(elapsed);

    if (m.plannedDurationMs && m.plannedDurationMs > 0) {
      planned.textContent = formatMs(m.plannedDurationMs);
      planned.hidden = false;
      const ratio = elapsed / m.plannedDurationMs;
      const clamped = Math.max(0, Math.min(1, ratio));
      fill.style.height = `${clamped * 100}%`;
      el.dataset.zone = ratio < 0.8 ? "ok" : ratio < 1 ? "warn" : "over";
    } else {
      planned.hidden = true;
      fill.style.height = "0%";
      el.dataset.zone = "none";
    }
  };
  tick();
  const id = window.setInterval(tick, 500);
  return { el, stop: () => clearInterval(id) };
}
