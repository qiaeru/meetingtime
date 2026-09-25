import type { ParticipantIdentity } from "@meetingtime/shared";
import { headerBar } from "./HomePage.js";
import { t } from "../i18n/index.js";
import { socket$, meeting$, myParticipantId$ } from "../state/socket.js";
import { saveSession, savePassword } from "../state/session.js";
import { navigate } from "../router.js";
import { icon } from "../components/Icon.js";
import { toast } from "../components/Toaster.js";
import {
  downloadMeetingTemplate,
  parseMeetingJSON,
  MeetingImportError,
  MAX_PLANNED_MINUTES,
  MAX_TIMEBOX_MINUTES,
  type MeetingDraft,
} from "../lib/meetingImport.js";
import { showShareMeetingDialog } from "../components/ShareMeetingDialog.js";
import { siteFooter } from "../components/SiteFooter.js";

// What the host typed, kept in module memory (never in storage) until the
// meeting is created: the page rebuild of a language switch would otherwise
// wipe the participant and topic rows, which only live in this closure.
let savedDraft: { draft: MeetingDraft; passwordConfirm: string } | null = null;

export function renderHostSetup(root: HTMLElement): () => void {
  const page = document.createElement("div");
  page.className = "page page-form";
  page.appendChild(headerBar());

  const wrap = document.createElement("main");
  wrap.className = "form-card";

  const h = document.createElement("h1");
  h.textContent = t("host.title");
  wrap.appendChild(h);

  const form = document.createElement("form");
  form.className = "stack";
  wrap.appendChild(form);

  const importZone = document.createElement("button");
  importZone.type = "button";
  importZone.className = "import-zone";
  importZone.setAttribute("aria-label", t("host.import"));

  const importIcon = document.createElement("span");
  importIcon.className = "import-zone-icon";
  importIcon.appendChild(icon("CloudUpload", { size: 28 }));

  const importText = document.createElement("div");
  importText.className = "import-zone-text";
  const importTitle = document.createElement("strong");
  importTitle.textContent = t("host.import");
  const importHint = document.createElement("span");
  importHint.className = "import-zone-hint";
  importHint.textContent = t("host.importHint");
  importText.append(importTitle, importHint);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json,.json";
  fileInput.hidden = true;

  importZone.append(importIcon, importText, fileInput);
  importZone.addEventListener("click", () => fileInput.click());

  importZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    importZone.dataset.dragover = "true";
  });
  importZone.addEventListener("dragleave", () => {
    delete importZone.dataset.dragover;
  });
  importZone.addEventListener("drop", (e) => {
    e.preventDefault();
    delete importZone.dataset.dragover;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    handleImportFile(file);
  });

  form.appendChild(importZone);

  const hostFields = identityFields(t("common.yourIdentity"));
  form.appendChild(hostFields.el);

  form.appendChild(sectionHeading(t("host.section.people")));

  const preWrap = document.createElement("fieldset");
  preWrap.className = "fieldset";
  const preLegend = document.createElement("legend");
  preLegend.textContent = t("host.preParticipants");
  preWrap.appendChild(preLegend);
  const preList = document.createElement("div");
  preList.className = "stack-sm";
  preWrap.appendChild(preList);
  const preParticipants: ParticipantIdentity[] = [];
  const addPreBtn = document.createElement("button");
  addPreBtn.type = "button";
  addPreBtn.className = "btn btn-secondary";
  addPreBtn.appendChild(icon("Plus", { size: 14 }));
  addPreBtn.appendChild(document.createTextNode(t("common.addParticipant")));
  preWrap.appendChild(addPreBtn);
  form.appendChild(preWrap);

  const renderPreList = (focusKey?: string): void => {
    preList.innerHTML = "";
    preParticipants.forEach((p, idx) => {
      const rowName = t("host.participantRow", { n: idx + 1 });
      const row = listRow(rowName);
      const f = labeledInput(t("common.firstName"), p.firstName, (v) => (p.firstName = v));
      const l = labeledInput(t("common.lastName"), p.lastName, (v) => (p.lastName = v));
      const r = labeledInput(t("common.role"), p.role, (v) => (p.role = v));
      row.append(f.wrap, l.wrap, r.wrap);
      appendRowActions(row, rowName, idx, preParticipants, renderPreList);
      preList.appendChild(row);
    });
    restoreRowFocus(preList, focusKey, addPreBtn);
  };
  addPreBtn.addEventListener("click", () => {
    preParticipants.push({ firstName: "", lastName: "", role: "" });
    renderPreList();
    const inputs = preList.querySelectorAll("input");
    inputs[inputs.length - 3]?.focus();
  });

  const topicsWrap = document.createElement("fieldset");
  topicsWrap.className = "fieldset";
  const topicsLegend = document.createElement("legend");
  topicsLegend.textContent = t("common.agenda");
  topicsWrap.appendChild(topicsLegend);
  const topicsList = document.createElement("div");
  topicsList.className = "stack-sm";
  topicsWrap.appendChild(topicsList);
  const topics: string[] = [];
  const addTopicBtn = document.createElement("button");
  addTopicBtn.type = "button";
  addTopicBtn.className = "btn btn-secondary";
  addTopicBtn.appendChild(icon("Plus", { size: 14 }));
  addTopicBtn.appendChild(document.createTextNode(t("host.addTopic")));
  topicsWrap.appendChild(addTopicBtn);
  form.appendChild(topicsWrap);

  const renderTopicsList = (focusKey?: string): void => {
    topicsList.innerHTML = "";
    topics.forEach((label, idx) => {
      const rowName = t("host.topicRow", { n: idx + 1 });
      const row = listRow(rowName);
      const i = labeledInput(rowName, label, (v) => (topics[idx] = v));
      row.append(i.wrap);
      appendRowActions(row, rowName, idx, topics, renderTopicsList);
      topicsList.appendChild(row);
    });
    restoreRowFocus(topicsList, focusKey, addTopicBtn);
  };
  addTopicBtn.addEventListener("click", () => {
    topics.push("");
    renderTopicsList();
    const inputs = topicsList.querySelectorAll("input");
    inputs[inputs.length - 1]?.focus();
  });

  form.appendChild(sectionHeading(t("host.section.settings")));

  const plannedWrap = document.createElement("fieldset");
  plannedWrap.className = "fieldset";
  const plannedLegend = document.createElement("legend");
  plannedLegend.textContent = t("host.plannedDuration");
  plannedWrap.appendChild(plannedLegend);
  const plannedInput = document.createElement("input");
  plannedInput.type = "number";
  plannedInput.min = "0";
  plannedInput.max = String(MAX_PLANNED_MINUTES);
  // Whole minutes, no coarser step: the hint announces no other constraint.
  plannedInput.step = "1";
  // No numeric placeholder: "60" reads as a default, but blank means "no
  // planned duration" (the hint below spells it out).
  plannedInput.setAttribute("aria-label", t("host.plannedDuration"));
  const plannedHint = document.createElement("p");
  plannedHint.className = "hint";
  plannedHint.id = "host-planned-hint";
  plannedHint.textContent = t("host.plannedDurationHint");
  plannedInput.setAttribute("aria-describedby", plannedHint.id);
  plannedWrap.append(plannedInput, plannedHint);
  form.appendChild(plannedWrap);

  const timeboxWrap = document.createElement("fieldset");
  timeboxWrap.className = "fieldset";
  const timeboxLegend = document.createElement("legend");
  timeboxLegend.textContent = t("host.timebox");
  timeboxWrap.appendChild(timeboxLegend);
  const timeboxInput = document.createElement("input");
  timeboxInput.type = "number";
  timeboxInput.min = "0";
  timeboxInput.max = String(MAX_TIMEBOX_MINUTES);
  timeboxInput.step = "1";
  timeboxInput.setAttribute("aria-label", t("host.timebox"));
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.id = "host-timebox-hint";
  hint.textContent = t("host.timeboxHint");
  timeboxInput.setAttribute("aria-describedby", hint.id);
  timeboxWrap.append(timeboxInput, hint);
  form.appendChild(timeboxWrap);

  // Confirm field is only enforced when the primary is non-empty, so leaving
  // both blank still creates an open meeting.
  const passwordWrap = document.createElement("fieldset");
  passwordWrap.className = "fieldset";
  const passwordLegend = document.createElement("legend");
  passwordLegend.textContent = t("common.password");
  passwordWrap.appendChild(passwordLegend);

  // Each field carries its own toggle so the host can reveal either
  // separately while typing.
  const buildPasswordRow = (
    placeholder: string,
    ariaLabel: string
  ): { row: HTMLElement; input: HTMLInputElement } => {
    const row = document.createElement("div");
    row.className = "password-row";
    const input = document.createElement("input");
    input.type = "password";
    input.autocomplete = "new-password";
    input.placeholder = placeholder;
    input.maxLength = 64;
    input.setAttribute("aria-label", ariaLabel);
    input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "icon-btn password-toggle";
    toggle.setAttribute("aria-pressed", "false");
    const sync = (visible: boolean): void => {
      input.type = visible ? "text" : "password";
      toggle.setAttribute("aria-pressed", String(visible));
      const label = visible ? t("host.passwordHide") : t("host.passwordShow");
      toggle.setAttribute("aria-label", label);
      toggle.dataset.tooltip = label;
      toggle.innerHTML = "";
      toggle.appendChild(icon(visible ? "EyeOff" : "Eye", { size: 16 }));
    };
    toggle.addEventListener("click", () => sync(input.type === "password"));
    sync(false);
    row.append(input, toggle);
    return { row, input };
  };

  const passwordPrimary = buildPasswordRow(t("host.passwordPlaceholder"), t("common.password"));
  passwordWrap.appendChild(passwordPrimary.row);
  const passwordInput = passwordPrimary.input;

  const passwordConfirmRow = buildPasswordRow(
    t("host.passwordConfirmPlaceholder"),
    t("host.passwordConfirm")
  );
  passwordConfirmRow.row.classList.add("password-confirm");
  passwordWrap.appendChild(passwordConfirmRow.row);
  const passwordConfirmInput = passwordConfirmRow.input;

  const passwordHint = document.createElement("p");
  passwordHint.className = "hint";
  passwordHint.id = "host-password-hint";
  passwordHint.textContent = t("host.passwordHint");
  passwordInput.setAttribute("aria-describedby", passwordHint.id);
  passwordConfirmInput.setAttribute("aria-describedby", passwordHint.id);
  passwordWrap.appendChild(passwordHint);
  form.appendChild(passwordWrap);

  const applyDraft = (draft: MeetingDraft): void => {
    if (draft.host) hostFields.set(draft.host);
    if (draft.participants.length > 0) {
      preParticipants.splice(0, preParticipants.length, ...draft.participants);
      renderPreList();
    }
    if (draft.topics.length > 0) {
      topics.splice(0, topics.length, ...draft.topics);
      renderTopicsList();
    }
    if (typeof draft.timeboxMinutes === "number") {
      timeboxInput.value = String(draft.timeboxMinutes);
    }
    if (typeof draft.plannedDurationMinutes === "number") {
      plannedInput.value = String(draft.plannedDurationMinutes);
    }
    if (typeof draft.password === "string") {
      passwordInput.value = draft.password;
      passwordConfirmInput.value = draft.password;
    }
  };

  if (savedDraft) {
    applyDraft(savedDraft.draft);
    // applyDraft fills the confirmation too; restore what was actually typed.
    passwordConfirmInput.value = savedDraft.passwordConfirm;
  }
  const optionalNumber = (v: string): number | undefined => (v ? Number(v) : undefined);

  async function handleImportFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const draft = parseMeetingJSON(text);
      applyDraft(draft);
      toast(t("host.importSuccess"), { type: "success" });
    } catch (e) {
      if (e instanceof MeetingImportError) {
        const reason = t(`host.importReason.${e.reason}`, { field: e.field, max: e.max });
        toast(t("host.importError", { reason }), { type: "error" });
      } else {
        toast(t("errors.internal_error"), { type: "error" });
      }
    } finally {
      fileInput.value = "";
    }
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) handleImportFile(file);
  });

  const actions = document.createElement("div");
  actions.className = "form-actions";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "btn btn-primary";
  submit.appendChild(icon("CirclePlus", { size: 16 }));
  const submitLbl = document.createElement("span");
  submitLbl.textContent = t("host.create");
  submit.appendChild(submitLbl);

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "btn btn-secondary";
  exportBtn.appendChild(icon("Download", { size: 16 }));
  const exportLbl = document.createElement("span");
  exportLbl.textContent = t("host.exportTemplate");
  exportBtn.appendChild(exportLbl);
  exportBtn.addEventListener("click", () => {
    const minutes = parseFloat(timeboxInput.value);
    const draft: MeetingDraft = {
      participants: preParticipants.filter(
        (p) => p.firstName.trim() && p.lastName.trim() && p.role.trim()
      ),
      topics: topics.map((tp) => tp.trim()).filter(Boolean),
    };
    const host = hostFields.value();
    if (host) draft.host = host;
    if (Number.isFinite(minutes) && minutes > 0) draft.timeboxMinutes = minutes;
    const plannedMinutesExport = parseFloat(plannedInput.value);
    if (Number.isFinite(plannedMinutesExport) && plannedMinutesExport > 0) {
      draft.plannedDurationMinutes = plannedMinutesExport;
    }
    const pwdExport = passwordInput.value.trim();
    if (pwdExport) draft.password = pwdExport;
    downloadMeetingTemplate(draft);
    toast(t("host.exportTemplateSuccess"), { type: "success" });
  });

  actions.append(submit, exportBtn);
  form.appendChild(actions);

  let created = false;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const host = hostFields.value();
    if (!host) return;
    // A row with some but not all fields filled would be silently dropped by
    // the filter below; that person missing from the meeting is invisible
    // data loss, so block the submit and point at the gap instead.
    const partialIdx = preParticipants.findIndex((p) => {
      const filled = [p.firstName, p.lastName, p.role].filter((v) => v.trim()).length;
      return filled > 0 && filled < 3;
    });
    if (partialIdx >= 0) {
      toast(t("host.incompleteParticipantRow"), { type: "error" });
      const rowInputs = preList.children[partialIdx]?.querySelectorAll("input") ?? [];
      for (const input of rowInputs) {
        if (!input.value.trim()) {
          input.setAttribute("aria-invalid", "true");
          input.focus();
          break;
        }
      }
      return;
    }
    const cleanedPre = preParticipants.filter(
      (p) => p.firstName.trim() && p.lastName.trim() && p.role.trim()
    );
    const cleanedTopics = topics.map((t) => t.trim()).filter(Boolean);
    const minutes = parseFloat(timeboxInput.value);
    const timeboxMs =
      Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60_000) : undefined;
    const plannedMinutes = parseFloat(plannedInput.value);
    const plannedDurationMs =
      Number.isFinite(plannedMinutes) && plannedMinutes > 0
        ? Math.round(plannedMinutes * 60_000)
        : undefined;
    const password = passwordInput.value.trim() || undefined;
    const passwordConfirm = passwordConfirmInput.value.trim();
    if (password && password !== passwordConfirm) {
      toast(t("host.passwordMismatch"), { type: "error" });
      passwordConfirmInput.setAttribute("aria-invalid", "true");
      passwordConfirmInput.focus();
      return;
    }
    // The socket guard comes first: disabling the button and then bailing
    // would leave the form stuck on "Creating…" forever.
    const s = socket$.get();
    if (!s) {
      toast(t("errors.connection"), { type: "error" });
      return;
    }
    submit.disabled = true;
    submitLbl.textContent = t("host.creating");
    // Without the ack timeout, a dead socket would leave the button stuck
    // on "Creating…" forever because the ack callback never fires.
    s.timeout(10_000).emit(
      "meeting:create",
      {
        host,
        initialParticipants: cleanedPre,
        topics: cleanedTopics,
        timeboxMs,
        plannedDurationMs,
        password,
      },
      (timeoutErr, resp) => {
        if (timeoutErr) {
          submit.disabled = false;
          submitLbl.textContent = t("host.create");
          toast(t("errors.connection"), { type: "error" });
          return;
        }
        if (!resp.ok) {
          submit.disabled = false;
          submitLbl.textContent = t("host.create");
          toast(t(`errors.${resp.error}`), { type: "error" });
          return;
        }
        created = true;
        meeting$.set(resp.meeting);
        myParticipantId$.set(resp.participantId);
        saveSession({
          meetingId: resp.meetingId,
          participantId: resp.participantId,
          token: resp.token,
        });
        // The share dialog (re-openable later from the meeting header) reads
        // the password back from sessionStorage on the meeting page.
        savePassword(resp.meetingId, password);
        // Show the share modal first so the host can copy the join info
        // before entering the meeting.
        void showShareMeetingDialog({
          meetingId: resp.meetingId,
          password,
        }).then(() => navigate("/meeting", { id: resp.meetingId }));
      }
    );
  });

  page.appendChild(wrap);
  page.appendChild(siteFooter());
  root.appendChild(page);
  // No field autofocus: the router focuses <main> after every render (skip
  // link target), which would clobber it anyway.

  return () => {
    savedDraft = created
      ? null
      : {
          draft: {
            host: hostFields.raw(),
            participants: preParticipants.map((p) => ({ ...p })),
            topics: [...topics],
            timeboxMinutes: optionalNumber(timeboxInput.value),
            plannedDurationMinutes: optionalNumber(plannedInput.value),
            password: passwordInput.value || undefined,
          },
          passwordConfirm: passwordConfirmInput.value,
        };
  };
}

interface IdentityFieldsHandle {
  el: HTMLElement;
  value: () => ParticipantIdentity | undefined;
  // As typed, even when incomplete.
  raw: () => ParticipantIdentity;
  set: (identity: ParticipantIdentity) => void;
}

function identityFields(legendText: string): IdentityFieldsHandle {
  const fs = document.createElement("fieldset");
  fs.className = "fieldset";
  const leg = document.createElement("legend");
  leg.className = "required";
  leg.textContent = legendText;
  fs.appendChild(leg);

  const row = document.createElement("div");
  row.className = "inline-row";

  // Visible labels, as on the join page: a placeholder vanishes on the first
  // keystroke and leaves the field unnamed on screen.
  const first = identityInput(t("common.firstName"), "given-name");
  const last = identityInput(t("common.lastName"), "family-name");
  const role = identityInput(t("common.role"), "organization-title");

  row.append(first.wrap, last.wrap, role.wrap);
  fs.appendChild(row);

  return {
    el: fs,
    value: () => {
      const f = first.input.value.trim();
      const l = last.input.value.trim();
      const r = role.input.value.trim();
      if (!f || !l || !r) return undefined;
      return { firstName: f, lastName: l, role: r };
    },
    raw: () => ({
      firstName: first.input.value,
      lastName: last.input.value,
      role: role.input.value,
    }),
    set: (identity) => {
      first.input.value = identity.firstName;
      last.input.value = identity.lastName;
      role.input.value = identity.role;
    },
  };
}

function identityInput(
  label: string,
  autocomplete: string
): { wrap: HTMLElement; input: HTMLInputElement } {
  const { wrap, input } = labeledField(label);
  input.required = true;
  input.maxLength = 60;
  // setAttribute: TypeScript's AutoFill type lacks "organization-title".
  input.setAttribute("autocomplete", autocomplete);
  return { wrap, input };
}

// Rows describing other people: the browser must not offer the host's own
// saved name there.
function labeledInput(
  label: string,
  value: string,
  onChange: (v: string) => void
): { wrap: HTMLElement; input: HTMLInputElement } {
  const { wrap, input } = labeledField(label);
  input.autocomplete = "off";
  input.value = value;
  input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    onChange(input.value);
  });
  return { wrap, input };
}

function labeledField(label: string): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = "text";
  wrap.append(span, input);
  return { wrap, input };
}

// A group named after the row ("Participant 2"), so its fields and buttons
// are announced with the row they act on.
function listRow(name: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "inline-row list-row";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", name);
  return row;
}

// Each rebuild receives the key of the button that should hold focus next, so
// a keyboard user stays on the row they just moved.
function appendRowActions<T>(
  row: HTMLElement,
  rowName: string,
  idx: number,
  arr: T[],
  rerender: (focusKey?: string) => void
): void {
  const on = (action: string): string => t("a11y.actionOn", { action, target: rowName });
  const up = rowButton("ChevronUp", on(t("meeting.moveUp")), () => {
    move(arr, idx, -1);
    rerender(`${idx - 1}:up`);
  });
  up.disabled = idx === 0;
  up.dataset.focusKey = `${idx}:up`;
  const down = rowButton("ChevronDown", on(t("meeting.moveDown")), () => {
    move(arr, idx, 1);
    rerender(`${idx + 1}:down`);
  });
  down.disabled = idx === arr.length - 1;
  down.dataset.focusKey = `${idx}:down`;
  const remove = rowButton("Trash2", on(t("common.remove")), () => {
    arr.splice(idx, 1);
    rerender(`${Math.min(idx, arr.length - 1)}:remove`);
  });
  remove.classList.add("danger");
  remove.dataset.focusKey = `${idx}:remove`;
  const actions = document.createElement("div");
  actions.className = "list-row-actions";
  actions.append(up, down, remove);
  row.appendChild(actions);
}

function restoreRowFocus(
  list: HTMLElement,
  focusKey: string | undefined,
  fallback: HTMLElement
): void {
  if (!focusKey) return;
  const target = list.querySelector<HTMLButtonElement>(`[data-focus-key="${focusKey}"]`);
  if (target && !target.disabled) {
    target.focus();
    return;
  }
  // The moved row reached an end of the list (its chevron is now disabled),
  // or the last row was removed: land on a still-usable control.
  const usable = target
    ?.closest(".list-row")
    ?.querySelector<HTMLButtonElement>(".list-row-actions button:not(:disabled)");
  (usable ?? fallback).focus();
}

function rowButton(
  iconName: "ChevronUp" | "ChevronDown" | "Trash2",
  label: string,
  onClick: () => void
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "icon-btn";
  b.setAttribute("aria-label", label);
  b.dataset.tooltip = label;
  b.appendChild(icon(iconName));
  b.addEventListener("click", onClick);
  return b;
}

function move<T>(arr: T[], idx: number, dir: -1 | 1): void {
  const next = idx + dir;
  if (next < 0 || next >= arr.length) return;
  [arr[idx], arr[next]] = [arr[next], arr[idx]];
}

/** Small caption rendered between two groups of fieldsets. Visually splits
 *  the create form into three logical chapters (your identity / participants
 *  & agenda / meeting settings) so a long page reads as a sequence rather
 *  than an undifferentiated stack. */
function sectionHeading(text: string): HTMLElement {
  const h = document.createElement("h2");
  h.className = "form-section-title";
  h.textContent = text;
  return h;
}
