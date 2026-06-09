import type { Meeting, Participant } from "@meetingtime/shared";
import { renderAvatar } from "./Avatar.js";
import { icon } from "./Icon.js";
import { sortedParticipants } from "./ParticipantList.js";
import { colorByPosition } from "../lib/color.js";
import { formatMs } from "../lib/format.js";
import { t } from "../i18n/index.js";
import { playTimeboxWarn, playTimeboxTick, playTimeboxNearLimit } from "../lib/sounds.js";

interface Args {
  getMeeting: () => Meeting | null;
}

// DOM is built once and only text + bar width mutate on tick. A separate
// visually-hidden live region only updates on speaker identity changes so
// assistive tech is not spammed with every chrono frame.
export function renderSpeakerSpotlight(args: Args): { el: HTMLElement; update: () => void; stop: () => void } {
  const root = document.createElement("div");
  root.className = "speaker-spotlight-root";

  const card = document.createElement("section");
  card.className = "speaker-spotlight";

  const idle = document.createElement("div");
  idle.className = "spotlight-empty";
  idle.append(icon("Mic", { size: 28 }));
  const idleText = document.createElement("span");
  idleText.textContent = t("meeting.noSpeaker");
  idle.appendChild(idleText);

  const left = document.createElement("div");
  left.className = "spotlight-left";
  const avatarSlot = document.createElement("span");
  avatarSlot.className = "spotlight-avatar-slot";
  left.appendChild(avatarSlot);

  const meta = document.createElement("div");
  meta.className = "spotlight-meta";
  const metaLabel = document.createElement("span");
  metaLabel.className = "spotlight-label";
  metaLabel.textContent = t("meeting.currentSpeaker");
  const nameEl = document.createElement("span");
  nameEl.className = "spotlight-name";
  const roleEl = document.createElement("span");
  roleEl.className = "spotlight-role";
  meta.append(metaLabel, nameEl, roleEl);
  left.appendChild(meta);

  const right = document.createElement("div");
  right.className = "spotlight-right";

  const timerWrap = document.createElement("div");
  timerWrap.className = "spotlight-timer-wrap";
  timerWrap.dataset.limit = "false";
  const timer = document.createElement("div");
  timer.className = "spotlight-timer";
  timer.textContent = "00:00";
  // Per-turn chrono + bar. Only visible when timebox enforcement is on.
  const turnTimerWrap = document.createElement("div");
  turnTimerWrap.className = "spotlight-turn-timer-wrap";
  turnTimerWrap.hidden = true;
  const turnTimer = document.createElement("div");
  turnTimer.className = "spotlight-turn-timer";
  const turnBar = document.createElement("div");
  turnBar.className = "spotlight-turn-bar";
  const turnBarFill = document.createElement("div");
  turnBarFill.className = "spotlight-turn-bar-fill";
  turnBarFill.style.width = "0%";
  turnBar.appendChild(turnBarFill);
  turnTimerWrap.append(turnTimer, turnBar);
  timerWrap.append(timer, turnTimerWrap);

  right.appendChild(timerWrap);

  card.append(idle, left, right);

  const live = document.createElement("div");
  live.className = "sr-only";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");

  root.append(card, live);

  let warnedForId: string | undefined;
  let nearLimitForId: string | undefined;
  // Reset on every speaker change so a tick that should fire isn't skipped.
  let lastTickRemaining = Infinity;
  const TICK_AT_SECONDS = new Set([10, 5, 3, 2, 1]);
  let lastSpeakerId: string | null = null;
  let lastColor: string | null = null;
  let lastLimitActive = false;
  let initialized = false;

  const setIdleVisible = (idleVisible: boolean) => {
    idle.hidden = !idleVisible;
    left.hidden = idleVisible;
    right.hidden = idleVisible;
  };
  setIdleVisible(true);

  const swapAvatar = (speaker: Participant, color: string) => {
    avatarSlot.innerHTML = "";
    avatarSlot.appendChild(
      renderAvatar({ participant: speaker, color, size: 64, badge: "speaking" })
    );
  };

  const setLimitVisible = (active: boolean) => {
    turnTimerWrap.hidden = !active;
    timerWrap.dataset.limit = String(active);
  };

  const updateOutlineRatio = (ratio: number) => {
    const r = Math.max(0, Math.min(1, ratio));
    turnBarFill.style.width = `${r * 100}%`;
  };

  const update = () => {
    const m = args.getMeeting();
    if (!m) {
      setIdleVisible(true);
      card.dataset.state = "idle";
      card.dataset.zone = "idle";
      lastSpeakerId = null;
      warnedForId = undefined;
      return;
    }

    if (!m.currentSpeakerId) {
      setIdleVisible(true);
      card.dataset.state = "idle";
      card.dataset.zone = "idle";
      warnedForId = undefined;
      if (lastSpeakerId !== null) {
        live.textContent = t("meeting.noSpeaker");
      }
      lastSpeakerId = null;
      setLimitVisible(false);
      lastLimitActive = false;
      initialized = true;
      return;
    }

    const speaker = m.participants[m.currentSpeakerId];
    if (!speaker) return;

    setIdleVisible(false);
    card.dataset.state = "speaking";

    // colorByPosition is keyed on the sorted index, so the colour must
    // match whatever ParticipantList renders for the same row.
    const sorted = sortedParticipants(m);
    const idx = sorted.findIndex((p) => p.id === speaker.id);
    const color = colorByPosition(idx, sorted.length, m.id);

    if (lastSpeakerId !== speaker.id || lastColor !== color) {
      swapAvatar(speaker, color);
      nameEl.textContent = `${speaker.firstName} ${speaker.lastName}`;
      roleEl.textContent = speaker.role;
      lastColor = color;
    }

    if (lastSpeakerId !== speaker.id) {
      live.textContent = `${t("meeting.currentSpeaker")}: ${speaker.firstName} ${speaker.lastName}`;
      lastSpeakerId = speaker.id;
      warnedForId = undefined;
      nearLimitForId = undefined;
      lastTickRemaining = Infinity;
    }

    let baseElapsed = 0;
    if (m.currentSpeakerStartedAt && m.phase === "running") {
      baseElapsed = Date.now() - m.currentSpeakerStartedAt;
    }
    const elapsedTotal = speaker.totalSpeakingMs + baseElapsed;
    timer.textContent = formatMs(elapsedTotal);

    const limitActive = Boolean(m.timeboxEnabled && m.timeboxMs && m.timeboxMs > 0);
    if (limitActive !== lastLimitActive || !initialized) {
      setLimitVisible(limitActive);
      lastLimitActive = limitActive;
    }

    if (limitActive) {
      const timeboxMs = m.timeboxMs ?? 1;
      const ratio = baseElapsed / timeboxMs;
      card.dataset.zone = ratio < 0.7 ? "ok" : ratio < 1 ? "warn" : "over";
      updateOutlineRatio(ratio);
      turnTimer.textContent = `${formatMs(baseElapsed)} / ${formatMs(timeboxMs)}`;
      if (ratio >= 0.8 && ratio < 1 && nearLimitForId !== m.currentSpeakerId) {
        nearLimitForId = m.currentSpeakerId;
        playTimeboxNearLimit();
      }
      if (ratio >= 1 && warnedForId !== m.currentSpeakerId) {
        warnedForId = m.currentSpeakerId;
        playTimeboxWarn();
      }
      const remaining = Math.ceil((timeboxMs - baseElapsed) / 1000);
      if (
        remaining > 0 &&
        remaining < lastTickRemaining &&
        TICK_AT_SECONDS.has(remaining)
      ) {
        playTimeboxTick();
      }
      lastTickRemaining = remaining;
    } else {
      card.dataset.zone = "ok";
      lastTickRemaining = Infinity;
    }
    initialized = true;
  };

  update();
  // No internal ticker: MeetingPage drives every component from a single
  // setInterval so all visible seconds agree.
  return { el: root, update, stop: () => undefined };
}

