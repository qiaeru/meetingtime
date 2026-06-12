import type { Meeting } from "@meetingtime/shared";
import { icon } from "./Icon.js";
import { t } from "../i18n/index.js";
import { mountCollaborativeEditor, type CollaborativeEditor } from "./CollaborativeEditor.js";
import { renderMarkdownInto } from "./MarkdownPreview.js";
import { exportNotes } from "../lib/markdownExport.js";
import { markdownHelpDialog } from "./MarkdownHelpDialog.js";

const COLLAPSE_KEY = "mt:notes:collapsed";
const WIDTH_KEY = "mt:notes:width";
const MIN_WIDTH = 320;
// Cap relative to the viewport so the panel can never swallow the meeting
// column whole, with a hard ceiling for very wide monitors and a guaranteed
// 380px for the left column (just above the JS mobile breakpoint, 70% of the
// window would otherwise crush the spotlight below its intrinsic minimum).
const maxWidth = (): number =>
  Math.min(820, Math.round(window.innerWidth * 0.7), window.innerWidth - 380);
const clampWidth = (w: number): number => Math.max(MIN_WIDTH, Math.min(maxWidth(), w));

interface Args {
  getMeeting: () => Meeting | null;
  // Explicit so the Yjs WebSocket can attach even before meeting$ has
  // received its first state push (deep-link rejoin case).
  meetingId: string;
  participantId: string;
  displayName: string;
  token: string;
  readOnly: boolean;
}

export interface NotesPanelHandle {
  el: HTMLElement;
  toggleCollapsed: () => void;
  togglePreview: () => void;
  focusEditor: () => void;
  exportNow: () => void;
  hasContent: () => boolean;
  setReadOnly: (readOnly: boolean) => void;
  setUserColor: (color: string) => void;
  destroy: () => void;
}

export function renderNotesPanel(args: Args): NotesPanelHandle {
  const aside = document.createElement("aside");
  aside.className = "notes-panel";
  aside.setAttribute("aria-label", t("notes.title"));

  let collapsed = false;
  try {
    collapsed = localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    /* ignore */
  }
  if (collapsed) aside.dataset.collapsed = "true";

  // Width is driven by a CSS variable so the [data-collapsed] rule (which sets
  // a literal 48px) keeps winning over the user-chosen width when collapsed.
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) aside.style.setProperty("--notes-width", `${clampWidth(n)}px`);
    }
  } catch {
    /* ignore */
  }

  // Chevron flips direction via CSS based on [data-collapsed].
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "notes-handle icon-btn";
  handle.setAttribute("aria-label", t("a11y.notesPanelToggle"));
  handle.title = t("a11y.notesPanelToggle");
  handle.setAttribute("aria-expanded", String(!collapsed));
  handle.appendChild(icon("ChevronRight"));
  handle.addEventListener("click", () => toggleCollapsed());

  const header = document.createElement("div");
  header.className = "notes-header";
  const title = document.createElement("h2");
  title.textContent = t("notes.title");
  header.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "notes-actions";

  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "btn btn-secondary btn-compact btn-icon-only";
  previewBtn.setAttribute("aria-label", t("notes.preview"));
  previewBtn.title = t("notes.preview");
  previewBtn.appendChild(icon("Eye", { size: 16 }));

  const splitBtn = document.createElement("button");
  splitBtn.type = "button";
  splitBtn.className = "btn btn-secondary btn-compact btn-icon-only";
  splitBtn.setAttribute("aria-label", t("notes.split"));
  splitBtn.title = t("notes.split");
  splitBtn.appendChild(icon("Rows2", { size: 16 }));

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "btn btn-primary btn-compact";
  const exportLabel = document.createElement("span");
  exportLabel.textContent = t("notes.export");
  exportBtn.append(icon("Download", { size: 14 }), exportLabel);

  actions.append(previewBtn, splitBtn, exportBtn);
  header.appendChild(actions);

  const body = document.createElement("div");
  body.className = "notes-body";

  const editorMount = document.createElement("div");
  editorMount.className = "notes-editor";

  const previewMount = document.createElement("div");
  previewMount.className = "notes-preview";
  previewMount.hidden = true;

  body.append(editorMount, previewMount);

  // Rebuilt on setReadOnly() so the read-only notice appears or disappears
  // when permissions change mid-meeting (promote/demote).
  const description = document.createElement("div");
  description.className = "notes-description";
  header.appendChild(description);

  const refreshDescription = (readOnly: boolean): void => {
    description.innerHTML = "";

    const mdLine = document.createElement("p");
    mdLine.className = "notes-description-line";
    mdLine.appendChild(document.createTextNode(t("notes.markdownInfo") + " "));
    const helpLink = document.createElement("button");
    helpLink.type = "button";
    helpLink.className = "notes-description-link";
    helpLink.textContent = t("notes.markdownSyntaxLink");
    helpLink.addEventListener("click", () => {
      void markdownHelpDialog();
    });
    mdLine.appendChild(helpLink);
    mdLine.appendChild(document.createTextNode("."));
    description.appendChild(mdLine);

    if (readOnly) {
      const ro = document.createElement("p");
      ro.className = "notes-description-line";
      ro.textContent = t("notes.readonly");
      description.appendChild(ro);
    }
  };
  refreshDescription(args.readOnly);

  const resizer = document.createElement("div");
  resizer.className = "notes-resizer";
  resizer.setAttribute("role", "separator");
  resizer.setAttribute("aria-orientation", "vertical");
  resizer.setAttribute("aria-label", t("a11y.notesPanelResize"));
  resizer.tabIndex = 0;

  const currentWidth = (): number => aside.getBoundingClientRect().width;
  // Value semantics give screen readers position feedback while resizing.
  const refreshResizerValue = (w: number): void => {
    resizer.setAttribute("aria-valuemin", String(MIN_WIDTH));
    resizer.setAttribute("aria-valuemax", String(maxWidth()));
    resizer.setAttribute("aria-valuenow", String(Math.round(w)));
  };
  const applyWidth = (w: number): void => {
    const clamped = clampWidth(w);
    aside.style.setProperty("--notes-width", `${clamped}px`);
    refreshResizerValue(clamped);
    try {
      localStorage.setItem(WIDTH_KEY, String(clamped));
    } catch {
      /* ignore */
    }
  };
  refreshResizerValue(parseInt(aside.style.getPropertyValue("--notes-width"), 10) || 480);

  let dragStartX = 0;
  let dragStartWidth = 0;
  const onPointerMove = (e: PointerEvent): void => {
    // Panel sits on the right, so dragging the edge leftwards widens it.
    applyWidth(dragStartWidth + (dragStartX - e.clientX));
  };
  const onPointerUp = (e: PointerEvent): void => {
    resizer.releasePointerCapture(e.pointerId);
    delete aside.dataset.resizing;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };
  resizer.addEventListener("pointerdown", (e) => {
    if (aside.dataset.collapsed === "true") return;
    e.preventDefault();
    dragStartX = e.clientX;
    dragStartWidth = currentWidth();
    aside.dataset.resizing = "true";
    resizer.setPointerCapture(e.pointerId);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });
  resizer.addEventListener("keydown", (e) => {
    if (aside.dataset.collapsed === "true") return;
    const step = e.shiftKey ? 64 : 16;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      applyWidth(currentWidth() + step);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      applyWidth(currentWidth() - step);
    }
  });

  aside.append(handle, resizer, header, body);

  const editor: CollaborativeEditor = mountCollaborativeEditor({
    container: editorMount,
    meetingId: args.meetingId,
    participantId: args.participantId,
    displayName: args.displayName,
    token: args.token,
    readOnly: args.readOnly,
  });

  // Splitting is an extra layer over previewing: when splitting, both panes
  // render regardless of the previewing flag.
  let previewing = false;
  let splitting = false;

  const previewVisible = () => previewing || splitting;
  const editorVisible = () => !previewing || splitting;

  const refreshPreview = () => {
    if (!previewVisible()) return;
    renderMarkdownInto(previewMount, editor.ytext.toString());
  };
  // Each remote keystroke lands as one Yjs transaction; re-parsing the whole
  // document (Marked + Shiki + DOMPurify) at typing speed would thrash, so
  // the observer-driven refresh trails by 200 ms.
  let previewTimer = 0;
  const schedulePreview = () => {
    if (!previewVisible()) return;
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(refreshPreview, 200);
  };
  editor.ytext.observe(schedulePreview);

  const refreshViewState = () => {
    editorMount.hidden = !editorVisible();
    previewMount.hidden = !previewVisible();
    body.dataset.split = String(splitting);
    const previewLabel = previewing ? t("notes.edit") : t("notes.preview");
    previewBtn.setAttribute("aria-label", previewLabel);
    previewBtn.title = previewLabel;
    previewBtn.dataset.active = String(previewing);
    const previewIconFresh = icon(previewing ? "Pencil" : "Eye", { size: 16 });
    previewBtn.replaceChild(previewIconFresh, previewBtn.firstChild as Node);
    splitBtn.dataset.active = String(splitting);
    refreshPreview();
  };

  function togglePreview(): void {
    previewing = !previewing;
    refreshViewState();
  }
  previewBtn.addEventListener("click", togglePreview);

  function toggleSplit(): void {
    splitting = !splitting;
    refreshViewState();
  }
  splitBtn.addEventListener("click", toggleSplit);

  refreshViewState();

  function toggleCollapsed(): void {
    const next = aside.dataset.collapsed === "true" ? false : true;
    if (next) aside.dataset.collapsed = "true";
    else delete aside.dataset.collapsed;
    handle.setAttribute("aria-expanded", String(!next));
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function focusEditor(): void {
    if (aside.dataset.collapsed === "true") toggleCollapsed();
    if (previewing && !splitting) togglePreview();
    editor.view.focus();
  }

  function exportNow(): void {
    const m = args.getMeeting();
    if (!m) return;
    exportNotes(m, editor.ytext.toString());
  }
  exportBtn.addEventListener("click", exportNow);

  return {
    el: aside,
    toggleCollapsed,
    togglePreview,
    focusEditor,
    exportNow,
    hasContent: () => editor.ytext.toString().trim().length > 0,
    setReadOnly: (ro: boolean) => {
      editor.setReadOnly(ro);
      refreshDescription(ro);
    },
    setUserColor: (color: string) => editor.setUserColor(color),
    destroy: () => {
      window.clearTimeout(previewTimer);
      editor.destroy();
    },
  };
}
