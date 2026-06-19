import type { ParticipantIdentity } from "@meetingtime/shared";
import { headerBar } from "./HomePage.js";
import { t } from "../i18n/index.js";
import { socket$, meeting$, myParticipantId$ } from "../state/socket.js";
import { saveSession, savePassword } from "../state/session.js";
import { navigate } from "../router.js";
import { icon } from "../components/Icon.js";
import { toast } from "../components/Toaster.js";
import { downloadMeetingTemplate, parseMeetingJSON, type MeetingDraft } from "../lib/meetingImport.js";
import { showShareMeetingDialog } from "../components/ShareMeetingDialog.js";
import { siteFooter } from "../components/SiteFooter.js";

export function renderHostSetup(root: HTMLElement): void {
  const page = document.createElement("main");
  page.className = "page page-form";
  page.appendChild(headerBar());

  const wrap = document.createElement("section");
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
  addPreBtn.appendChild(document.createTextNode(" " + t("common.addParticipant")));
  preWrap.appendChild(addPreBtn);
  form.appendChild(preWrap);

  const renderPreList = (): void => {
    preList.innerHTML = "";
    preParticipants.forEach((p, idx) => {
      const row = document.createElement("div");
      row.className = "inline-row";
      const f = makeInput(t("common.firstName"), p.firstName, (v) => (p.firstName = v));
      const l = makeInput(t("common.lastName"), p.lastName, (v) => (p.lastName = v));
      const r = makeInput(t("common.role"), p.role, (v) => (p.role = v));
      const up = reorderBtn("ChevronUp", () => move(preParticipants, idx, -1, renderPreList), idx === 0);
      const down = reorderBtn(
        "ChevronDown",
        () => move(preParticipants, idx, 1, renderPreList),
        idx === preParticipants.length - 1
      );
      const remove = removeBtn(() => {
        preParticipants.splice(idx, 1);
        renderPreList();
      });
      row.append(f, l, r, up, down, remove);
      preList.appendChild(row);
    });
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
  addTopicBtn.appendChild(document.createTextNode(" " + t("host.addTopic")));
  topicsWrap.appendChild(addTopicBtn);
  form.appendChild(topicsWrap);

  const renderTopicsList = (): void => {
    topicsList.innerHTML = "";
    topics.forEach((label, idx) => {
      const row = document.createElement("div");
      row.className = "inline-row";
      const i = makeInput(t("host.addTopic"), label, (v) => (topics[idx] = v));
      const up = reorderBtn("ChevronUp", () => move(topics, idx, -1, renderTopicsList), idx === 0);
      const down = reorderBtn(
        "ChevronDown",
        () => move(topics, idx, 1, renderTopicsList),
        idx === topics.length - 1
      );
      const remove = removeBtn(() => {
        topics.splice(idx, 1);
        renderTopicsList();
      });
      row.append(i, up, down, remove);
      topicsList.appendChild(row);
    });
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
  plannedInput.max = "600";
  plannedInput.step = "5";
  // No numeric placeholder: "60" reads as a default, but blank means "no
  // planned duration" (the hint below spells it out).
  plannedInput.setAttribute("aria-label", t("host.plannedDuration"));
  const plannedHint = document.createElement("p");
  plannedHint.className = "hint";
  plannedHint.textContent = t("host.plannedDurationHint");
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
  timeboxInput.max = "60";
  timeboxInput.step = "1";
  timeboxInput.setAttribute("aria-label", t("host.timebox"));
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = t("host.timeboxHint");
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
      toggle.title = label;
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
  passwordHint.textContent = t("host.passwordHint");
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

  async function handleImportFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const draft = parseMeetingJSON(text);
      applyDraft(draft);
      toast(t("host.importSuccess"), { type: "success" });
    } catch (e) {
      toast(t("host.importError", { reason: (e as Error).message }), { type: "error" });
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
    const cleanedPre = preParticipants.filter((p) => p.firstName.trim() && p.lastName.trim() && p.role.trim());
    const cleanedTopics = topics.map((t) => t.trim()).filter(Boolean);
    const minutes = parseFloat(timeboxInput.value);
    const timeboxMs = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60_000) : undefined;
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
        meeting$.set(resp.meeting);
        myParticipantId$.set(resp.participantId);
        saveSession({ meetingId: resp.meetingId, participantId: resp.participantId, token: resp.token });
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
}

interface IdentityFieldsHandle {
  el: HTMLElement;
  value: () => ParticipantIdentity | undefined;
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

  const first = placeholderInput(t("common.firstName"));
  const last = placeholderInput(t("common.lastName"));
  const role = placeholderInput(t("common.role"));

  row.append(first, last, role);
  fs.appendChild(row);

  return {
    el: fs,
    value: () => {
      const f = first.value.trim();
      const l = last.value.trim();
      const r = role.value.trim();
      if (!f || !l || !r) return undefined;
      return { firstName: f, lastName: l, role: r };
    },
    set: (identity) => {
      first.value = identity.firstName;
      last.value = identity.lastName;
      role.value = identity.role;
    },
  };
}

function placeholderInput(placeholder: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.required = true;
  input.maxLength = 60;
  input.placeholder = placeholder;
  input.setAttribute("aria-label", placeholder);
  return input;
}

function makeInput(placeholder: string, value: string, onChange: (v: string) => void): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.setAttribute("aria-label", placeholder);
  input.value = value;
  input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    onChange(input.value);
  });
  return input;
}

function reorderBtn(
  iconName: "ChevronUp" | "ChevronDown",
  onClick: () => void,
  disabled: boolean
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "icon-btn";
  const label = t(iconName === "ChevronUp" ? "meeting.moveUp" : "meeting.moveDown");
  b.setAttribute("aria-label", label);
  b.title = label;
  b.appendChild(icon(iconName));
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

function removeBtn(onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "icon-btn danger";
  b.setAttribute("aria-label", t("common.remove"));
  b.title = t("common.remove");
  b.appendChild(icon("Trash2"));
  b.addEventListener("click", onClick);
  return b;
}

function move<T>(arr: T[], idx: number, dir: -1 | 1, rerender: () => void): void {
  const next = idx + dir;
  if (next < 0 || next >= arr.length) return;
  [arr[idx], arr[next]] = [arr[next], arr[idx]];
  rerender();
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

