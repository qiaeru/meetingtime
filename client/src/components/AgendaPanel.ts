import type { Meeting } from "@meetingtime/shared";
import type { MeetingSocket } from "../state/socket.js";
import { icon } from "./Icon.js";
import { t } from "../i18n/index.js";
import { formatMs } from "../lib/format.js";
import { addTopicDialog } from "./AddTopicDialog.js";

// Module-scoped so it survives the update() rebuild on every meeting-state push.
let topicDragState: { sourceId: string; sourceIdx: number } | null = null;

interface Args {
  getMeeting: () => Meeting | null;
  socket: MeetingSocket;
  isHost: () => boolean;
}

function topicDisplayMs(meeting: Meeting, topicId: string): number {
  const topic = meeting.topics.find((t) => t.id === topicId);
  if (!topic) return 0;
  let live = 0;
  if (
    meeting.currentTopicId === topicId &&
    meeting.currentTopicStartedAt &&
    meeting.phase === "running"
  ) {
    live = Date.now() - meeting.currentTopicStartedAt;
  }
  return topic.totalMs + live;
}

interface AgendaHandle {
  el: HTMLElement;
  update: () => void;
  tick: () => void;
  focusedId: () => string | null;
  focusNext: (dir: 1 | -1) => void;
}

export function renderAgenda(args: Args): AgendaHandle {
  const wrap = document.createElement("section");
  wrap.className = "agenda";

  // Populated by update(), consumed by tick() so the chrono refreshes
  // without rebuilding the row (which would interrupt hover and drag).
  const timeRefs = new Map<string, HTMLElement>();
  let focusedTopicId: string | null = null;

  const header = document.createElement("div");
  header.className = "list-header";
  const title = document.createElement("h3");
  title.className = "list-title";
  title.textContent = t("common.agenda");
  const countBadge = document.createElement("span");
  countBadge.className = "list-count";
  title.appendChild(countBadge);
  header.appendChild(title);

  const headerActions = document.createElement("div");
  headerActions.className = "list-header-actions";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "icon-btn list-header-icon-btn";
  addBtn.setAttribute("aria-label", t("host.addTopic"));
  addBtn.title = t("host.addTopic");
  addBtn.appendChild(icon("Plus", { size: 16 }));
  addBtn.addEventListener("click", async () => {
    const label = await addTopicDialog();
    if (label) args.socket.emit("topic:add", { label });
  });
  headerActions.appendChild(addBtn);
  header.appendChild(headerActions);
  wrap.appendChild(header);

  const list = document.createElement("ul");
  list.className = "agenda-list";
  wrap.appendChild(list);

  const update = () => {
    const m = args.getMeeting();
    list.innerHTML = "";
    timeRefs.clear();
    if (!m) return;
    countBadge.textContent = String(m.topics.length);
    addBtn.hidden = !args.isHost();
    const ended = m.phase === "ended";
    addBtn.disabled = ended;
    if (m.topics.length === 0) {
      const empty = document.createElement("li");
      empty.className = "agenda-empty";
      if (args.isHost()) {
        empty.textContent = t("meeting.agendaEmptyHost") + " ";
        const cta = document.createElement("button");
        cta.type = "button";
        cta.className = "agenda-empty-cta";
        cta.textContent = t("meeting.agendaEmptyCta");
        cta.addEventListener("click", async () => {
          const label = await addTopicDialog();
          if (label) args.socket.emit("topic:add", { label });
        });
        empty.appendChild(cta);
      } else {
        empty.textContent = t("meeting.agendaEmpty");
      }
      list.appendChild(empty);
      return;
    }
    if (focusedTopicId && !m.topics.some((t) => t.id === focusedTopicId)) {
      focusedTopicId = null;
    }
    m.topics.forEach((topic, idx) => {
      const li = document.createElement("li");
      li.className = "agenda-item";
      li.dataset.current = String(m.currentTopicId === topic.id);
      if (focusedTopicId === topic.id) li.dataset.focused = "true";

      if (args.isHost()) {
        li.dataset.draggable = "true";
        const topicHandle = document.createElement("span");
        topicHandle.className = "drag-handle";
        topicHandle.setAttribute("aria-hidden", "true");
        topicHandle.title = t("meeting.dragToReorder");
        topicHandle.appendChild(icon("GripVertical", { size: 14 }));
        li.appendChild(topicHandle);

        li.draggable = false;
        topicHandle.addEventListener("mousedown", () => {
          li.draggable = true;
        });
        const resetDraggable = () => {
          li.draggable = false;
        };
        li.addEventListener("mouseup", resetDraggable);
        li.addEventListener("mouseleave", resetDraggable);
        li.addEventListener("dragstart", (ev) => {
          topicDragState = { sourceId: topic.id, sourceIdx: idx };
          if (ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = "move";
            ev.dataTransfer.setData("text/plain", topic.id);
          }
          li.classList.add("dragging");
        });
        li.addEventListener("dragend", () => {
          li.classList.remove("dragging");
          li.draggable = false;
          topicDragState = null;
        });
        li.addEventListener("dragover", (ev) => {
          if (!topicDragState || topicDragState.sourceId === topic.id) return;
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
          const state = topicDragState;
          topicDragState = null;
          if (!state || state.sourceId === topic.id) return;
          const direction = idx > state.sourceIdx ? "down" : "up";
          const steps = Math.abs(idx - state.sourceIdx);
          for (let i = 0; i < steps; i++) {
            args.socket.emit("topic:reorder", { topicId: state.sourceId, direction });
          }
        });
      }

      const isActive = m.currentTopicId === topic.id;
      const meetingLive = m.phase === "running" || m.phase === "paused";
      const showHostControl = args.isHost() && (isActive || meetingLive);
      if (showHostControl) {
        const playBtn = document.createElement("button");
        playBtn.type = "button";
        playBtn.className = "row-action play-topic";
        playBtn.setAttribute(
          "aria-label",
          isActive ? t("meeting.clearCurrentTopic") : t("meeting.setCurrentTopic")
        );
        playBtn.title = playBtn.getAttribute("aria-label") ?? "";
        playBtn.appendChild(icon(isActive ? "Pause" : "Play", { size: 14 }));
        playBtn.addEventListener("click", () =>
          args.socket.emit("topic:setCurrent", { topicId: isActive ? null : topic.id })
        );
        li.appendChild(playBtn);
      }

      const label = document.createElement("span");
      label.className = "agenda-label";
      label.textContent = topic.label;
      li.appendChild(label);

      const time = document.createElement("span");
      time.className = "agenda-time";
      time.textContent = formatMs(topicDisplayMs(m, topic.id));
      timeRefs.set(topic.id, time);
      li.appendChild(time);

      if (args.isHost()) {
        const up = rowIconBtn("ChevronUp", t("meeting.moveUp"), () =>
          args.socket.emit("topic:reorder", { topicId: topic.id, direction: "up" })
        );
        up.disabled = idx === 0 || ended;
        li.appendChild(up);
        const down = rowIconBtn("ChevronDown", t("meeting.moveDown"), () =>
          args.socket.emit("topic:reorder", { topicId: topic.id, direction: "down" })
        );
        down.disabled = idx === m.topics.length - 1 || ended;
        li.appendChild(down);

        const remove = rowIconBtn("Trash2", t("common.remove"), () =>
          args.socket.emit("topic:remove", { topicId: topic.id })
        );
        remove.classList.add("danger");
        remove.disabled = ended;
        li.appendChild(remove);
      }
      list.appendChild(li);
    });
  };

  const tick = () => {
    const m = args.getMeeting();
    if (!m || timeRefs.size === 0) return;
    for (const [topicId, el] of timeRefs) {
      el.textContent = formatMs(topicDisplayMs(m, topicId));
    }
  };

  update();
  return {
    el: wrap,
    update,
    tick,
    focusedId: () => focusedTopicId,
    focusNext: (dir) => {
      const m = args.getMeeting();
      if (!m || m.topics.length === 0) return;
      const ids = m.topics.map((t) => t.id);
      const cur = focusedTopicId ? ids.indexOf(focusedTopicId) : -1;
      const next = ids[(cur + dir + ids.length) % ids.length];
      focusedTopicId = next;
      update();
    },
  };
}

function rowIconBtn(
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
  b.addEventListener("click", onClick);
  return b;
}
