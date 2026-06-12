import type { Meeting, Participant } from "@meetingtime/shared";
import type { MeetingSocket } from "../state/socket.js";
import { icon } from "./Icon.js";
import { renderAvatar } from "./Avatar.js";
import { confirmDialog } from "./ConfirmDialog.js";
import { t } from "../i18n/index.js";
import { formatMs, formatMsSpoken, formatPercent } from "../lib/format.js";
import { locale$ } from "../i18n/index.js";
import { colorByPosition } from "../lib/color.js";

// Sort key falls back to joinedAt for legacy meetings written before the
// `order` field existed. Exported because colorByPosition is keyed on the
// sorted index: every consumer (spotlight, notes cursor color) must sort
// participants exactly like this list or colors desynchronize.
const participantSortKey = (p: Participant): number => p.order ?? p.joinedAt;
export const sortedParticipants = (m: Meeting): Participant[] =>
  Object.values(m.participants).sort((a, b) => participantSortKey(a) - participantSortKey(b));

// Module-scoped so it survives the update() rebuild that runs on every
// meeting-state push.
let dragState: { sourceId: string; sourceIdx: number } | null = null;

// Must match the just-spoke-fade animation duration in animations.css.
const JUST_SPOKE_MS = 3000;
const justSpokeAt = new Map<string, number>();
let lastObservedSpeakerId: string | null = null;

// Populated by update(), consumed by tick() so the chrono and fill bar can
// refresh without rebuilding the DOM (which would clobber hover, focus and
// in-progress drag state).
interface RowRefs {
  timeText: HTMLElement;
  pctText: HTMLElement;
  fill: HTMLElement;
  timing: HTMLElement;
}

interface Args {
  getMeeting: () => Meeting | null;
  myId: () => string | null;
  socket: MeetingSocket;
  onFocusChange?: (participantId: string | null) => void;
}

export function renderParticipantList(args: Args): {
  el: HTMLElement;
  update: () => void;
  tick: () => void;
  focusedId: () => string | null;
  focusNext: (dir: 1 | -1) => void;
} {
  // Plain list semantics: the previous role="listbox"/"option" markup was a
  // broken composite (options with interactive children, no
  // aria-activedescendant); the virtual focus is keyboard-driven via the
  // documented Ctrl+Arrow shortcuts and exposed visually with data-focused.
  const el = document.createElement("ul");
  el.className = "participant-list";
  el.setAttribute("aria-label", t("meeting.participants"));

  let focused: string | null = null;
  const rowRefs = new Map<string, RowRefs>();

  const computeTotals = (m: Meeting): { totals: Map<string, number>; sum: number } => {
    const totals = new Map<string, number>();
    let sum = 0;
    for (const p of Object.values(m.participants)) {
      let live = 0;
      if (m.currentSpeakerId === p.id && m.currentSpeakerStartedAt && m.phase === "running") {
        live = Date.now() - m.currentSpeakerStartedAt;
      }
      const total = p.totalSpeakingMs + live;
      totals.set(p.id, total);
      sum += total;
    }
    return { totals, sum };
  };

  const update = () => {
    const m = args.getMeeting();
    // The rebuild destroys the focused element; remember which action button
    // held keyboard focus so it can be re-focused on the fresh DOM (without
    // this, every chevron press dumps the user back to the top of the page).
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active && el.contains(active) ? active.dataset.focusKey : undefined;
    el.innerHTML = "";
    rowRefs.clear();
    if (!m) return;

    // Speaker transitions live here (not in tick()) because they come from a
    // meeting-state push, not from wall-clock time.
    if (lastObservedSpeakerId && lastObservedSpeakerId !== m.currentSpeakerId) {
      justSpokeAt.set(lastObservedSpeakerId, Date.now());
    }
    lastObservedSpeakerId = m.currentSpeakerId ?? null;
    const now = Date.now();
    for (const [id, ts] of justSpokeAt) {
      if (now - ts >= JUST_SPOKE_MS) justSpokeAt.delete(id);
    }
    const meId = args.myId();
    const meIsHost = meId ? m.participants[meId]?.isHost : false;
    const participants = sortedParticipants(m);

    if (participants.length === 0) {
      const empty = document.createElement("li");
      empty.className = "participant-empty";
      empty.textContent = t("meeting.participantsEmpty");
      el.appendChild(empty);
      return;
    }

    const { totals, sum: sumTotals } = computeTotals(m);

    participants.forEach((p, idx) => {
      const color = colorByPosition(idx, participants.length, m.id);
      const total = totals.get(p.id) ?? 0;
      const ratio = sumTotals > 0 ? total / sumTotals : 0;
      const { el: row, refs } = renderRow(
        p,
        color,
        idx,
        m,
        meIsHost,
        meId,
        args.socket,
        focused === p.id,
        total,
        ratio,
        idx === 0,
        idx === participants.length - 1,
        (next) => {
          focused = next;
          args.onFocusChange?.(next);
          update();
        }
      );
      el.appendChild(row);
      rowRefs.set(p.id, refs);
    });

    if (focused && !m.participants[focused]) {
      focused = null;
      args.onFocusChange?.(null);
    }

    if (focusKey) {
      el.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
    }
  };

  const tick = () => {
    const m = args.getMeeting();
    if (!m || rowRefs.size === 0) return;
    const { totals, sum } = computeTotals(m);
    for (const [id, refs] of rowRefs) {
      const total = totals.get(id) ?? 0;
      const ratio = sum > 0 ? total / sum : 0;
      refs.timeText.textContent = formatMs(total);
      refs.pctText.textContent = `(${formatPercent(ratio)})`;
      refs.fill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
      const desc = `${formatMsSpoken(total, locale$.get())}, ${formatPercent(ratio)}`;
      refs.timing.title = `${t("meeting.totalSpeakingTime")}: ${desc}`;
      // Keep the spoken description in step with the visible chrono, or a
      // screen reader inspecting the row reads a stale duration.
      const p = m.participants[id];
      if (p) refs.timing.setAttribute("aria-label", `${p.firstName} ${p.lastName}: ${desc}`);
    }
  };

  return {
    el,
    update,
    tick,
    focusedId: () => focused,
    focusNext: (dir) => {
      const m = args.getMeeting();
      if (!m) return;
      // Walk the same order as the rendered rows; sorting by joinedAt here
      // would make the focus ring jump around after a host reorder.
      const ids = sortedParticipants(m).map((p) => p.id);
      if (ids.length === 0) return;
      const cur = focused ? ids.indexOf(focused) : -1;
      const next = ids[(cur + dir + ids.length) % ids.length];
      focused = next;
      args.onFocusChange?.(focused);
      update();
    },
  };
}

// Stripe-orientation gives a second visual channel on top of hue, so
// color-blind viewers can still tell two close fills apart.
const FILL_PATTERN_ANGLES = [20, 70, 110, 160, 45, 135];

function renderRow(
  p: Participant,
  color: string,
  idx: number,
  m: Meeting,
  meIsHost: boolean,
  meId: string | null,
  socket: MeetingSocket,
  isFocused: boolean,
  total: number,
  ratio: number,
  isFirst: boolean,
  isLast: boolean,
  setFocus: (id: string) => void
): { el: HTMLElement; refs: RowRefs } {
  const li = document.createElement("li");
  li.className = "participant";
  li.dataset.id = p.id;
  li.dataset.connected = String(p.connected);
  li.dataset.handRaised = String(p.handRaised);
  const isSpeaking = m.currentSpeakerId === p.id;
  li.dataset.speaking = String(isSpeaking);
  // Halo only applies when not currently speaking; the speaking style wins.
  if (!isSpeaking) {
    const yieldedAt = justSpokeAt.get(p.id);
    if (yieldedAt && Date.now() - yieldedAt < 3000) {
      li.dataset.justSpoke = "true";
    }
  }
  li.dataset.host = String(p.isHost);
  li.dataset.me = String(p.id === meId);
  if (isFocused) {
    li.dataset.focused = "true";
  }

  // The <li> is only marked draggable while the user mousedowns on this
  // handle, so clicks on inner buttons never accidentally start a drag.
  let dragHandle: HTMLElement | null = null;
  if (meIsHost) {
    li.dataset.draggable = "true";
    dragHandle = document.createElement("span");
    dragHandle.className = "drag-handle";
    dragHandle.setAttribute("aria-hidden", "true");
    dragHandle.title = t("meeting.dragToReorder");
    dragHandle.appendChild(icon("GripVertical", { size: 14 }));
  }

  // Width = this participant's share of the cumulative speaking time. The
  // stripe orientation rotates per row to double the hue channel for
  // color-blind viewers (see FILL_PATTERN_ANGLES).
  const fill = document.createElement("span");
  fill.className = "participant-fill";
  fill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  const angle = FILL_PATTERN_ANGLES[idx % FILL_PATTERN_ANGLES.length];
  fill.style.backgroundColor = `color-mix(in srgb, ${color} 22%, transparent)`;
  fill.style.backgroundImage = `repeating-linear-gradient(${angle}deg, transparent 0 6px, var(--fill-stripe) 6px 8px)`;
  fill.setAttribute("aria-hidden", "true");
  li.appendChild(fill);

  if (dragHandle) li.appendChild(dragHandle);

  // Hidden entirely when the meeting hasn't started: the action would no-op.
  const meetingLive = m.phase === "running" || m.phase === "paused";
  if (meIsHost && (m.currentSpeakerId === p.id || meetingLive)) {
    li.dataset.leading = "true";
    if (m.currentSpeakerId === p.id) {
      const stop = iconBtn("Square", t("meeting.revokeFloor"), () =>
        socket.emit("speaker:revoke")
      );
      stop.classList.add("danger");
      stop.dataset.focusKey = `${p.id}:floor`;
      li.appendChild(stop);
    } else {
      const give = iconBtn("Speech", t("meeting.giveFloor"), () =>
        socket.emit("speaker:grant", { participantId: p.id })
      );
      give.classList.add("primary-action");
      give.dataset.focusKey = `${p.id}:floor`;
      li.appendChild(give);
    }
  }

  const badge: "speaking" | "hand" | null =
    m.currentSpeakerId === p.id ? "speaking" : p.handRaised ? "hand" : null;
  const avatar = renderAvatar({ participant: p, color, size: 34, connected: p.connected, badge });
  li.appendChild(avatar);

  const main = document.createElement("div");
  main.className = "participant-main";
  const nameRow = document.createElement("div");
  nameRow.className = "participant-name-row";
  const name = document.createElement("span");
  name.className = "participant-name";
  name.textContent = `${p.firstName} ${p.lastName}`;
  nameRow.appendChild(name);
  if (p.id === meId) {
    const meTag = document.createElement("span");
    meTag.className = "tag tag-muted";
    meTag.textContent = t("meeting.youTag");
    nameRow.appendChild(meTag);
  }
  if (p.isHost) {
    const hostTag = document.createElement("span");
    hostTag.className = "tag tag-host";
    hostTag.appendChild(icon("Crown", { size: 11 }));
    const hostLabel = document.createElement("span");
    hostLabel.textContent = t("meeting.hostTag");
    hostTag.appendChild(hostLabel);
    nameRow.appendChild(hostTag);
  }
  const role = document.createElement("div");
  role.className = "participant-role";
  role.textContent = p.role;
  main.append(nameRow, role);

  const timing = document.createElement("div");
  timing.className = "participant-time";
  const timeText = document.createElement("span");
  timeText.className = "participant-time-value";
  timeText.textContent = formatMs(total);
  const pctText = document.createElement("span");
  pctText.className = "participant-time-pct";
  pctText.textContent = `(${formatPercent(ratio)})`;
  timing.append(timeText, pctText);
  const timingDescription = `${formatMsSpoken(total, locale$.get())}, ${formatPercent(ratio)}`;
  timing.setAttribute(
    "aria-label",
    `${p.firstName} ${p.lastName}: ${timingDescription}`
  );
  // Hover tooltip exposes the long-form breakdown that doesn't fit in the
  // compact mm:ss chrono.
  timing.title = `${t("meeting.totalSpeakingTime")}: ${timingDescription}`;

  const actions = document.createElement("div");
  actions.className = "participant-actions";
  if (meIsHost) {
    const ended = m.phase === "ended";
    if (p.isHost && p.id !== meId) {
      const demote = iconBtn("ShieldOff", t("meeting.demoteHost"), () =>
        socket.emit("host:demote", { participantId: p.id })
      );
      demote.disabled = ended;
      // promote/demote share one key so focus survives the swap after a click
      demote.dataset.focusKey = `${p.id}:hostrole`;
      actions.appendChild(demote);
    } else if (!p.isHost) {
      const promote = iconBtn("Crown", t("meeting.promoteHost"), () =>
        socket.emit("host:promote", { participantId: p.id })
      );
      promote.disabled = ended;
      promote.dataset.focusKey = `${p.id}:hostrole`;
      actions.appendChild(promote);
    }
    const up = iconBtn("ChevronUp", t("meeting.moveUp"), () =>
      socket.emit("participant:reorder", { participantId: p.id, direction: "up" })
    );
    up.disabled = isFirst || ended;
    up.dataset.focusKey = `${p.id}:up`;
    actions.appendChild(up);
    const down = iconBtn("ChevronDown", t("meeting.moveDown"), () =>
      socket.emit("participant:reorder", { participantId: p.id, direction: "down" })
    );
    down.disabled = isLast || ended;
    down.dataset.focusKey = `${p.id}:down`;
    actions.appendChild(down);
    const remove = iconBtn("Trash2", t("common.remove"), async () => {
      const ok = await confirmDialog(
        t("meeting.removeConfirm", { name: `${p.firstName} ${p.lastName}` })
      );
      if (ok) socket.emit("participant:remove", { participantId: p.id });
    });
    remove.classList.add("danger");
    remove.disabled = ended;
    remove.dataset.focusKey = `${p.id}:remove`;
    actions.appendChild(remove);
  }

  li.append(main, timing, actions);
  li.addEventListener("click", () => setFocus(p.id));

  // Native HTML5 DnD. Keyboard users have the chevron buttons.
  if (meIsHost && dragHandle) {
    li.draggable = false;
    dragHandle.addEventListener("mousedown", () => {
      li.draggable = true;
    });
    const resetDraggable = () => {
      li.draggable = false;
    };
    li.addEventListener("mouseup", resetDraggable);
    li.addEventListener("mouseleave", resetDraggable);
    li.addEventListener("dragstart", (ev) => {
      dragState = { sourceId: p.id, sourceIdx: idx };
      if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", p.id);
      }
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
      li.draggable = false;
      dragState = null;
    });
    li.addEventListener("dragover", (ev) => {
      if (!dragState || dragState.sourceId === p.id) return;
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
      li.classList.add("drag-target");
    });
    li.addEventListener("dragleave", () => {
      li.classList.remove("drag-target");
    });
    li.addEventListener("drop", (ev) => {
      ev.preventDefault();
      li.classList.remove("drag-target");
      const state = dragState;
      dragState = null;
      if (!state || state.sourceId === p.id) return;
      const direction = idx > state.sourceIdx ? "down" : "up";
      const steps = Math.abs(idx - state.sourceIdx);
      for (let i = 0; i < steps; i++) {
        socket.emit("participant:reorder", { participantId: state.sourceId, direction });
      }
    });
  }

  return { el: li, refs: { timeText, pctText, fill, timing } };
}

function iconBtn(
  iconName: Parameters<typeof icon>[0],
  label: string,
  onClick: () => void
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "row-action";
  b.setAttribute("aria-label", label);
  b.title = label;
  b.appendChild(icon(iconName, { size: 14 }));
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}
