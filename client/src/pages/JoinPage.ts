import { headerBar } from "./HomePage.js";
import { t } from "../i18n/index.js";
import { socket$, meeting$, myParticipantId$ } from "../state/socket.js";
import { clearSession, loadSession, saveSession, savePassword } from "../state/session.js";
import { navigate } from "../router.js";
import { toast } from "../components/Toaster.js";
import { icon } from "../components/Icon.js";

export function renderJoin(root: HTMLElement, params: URLSearchParams): void {
  const page = document.createElement("main");
  page.className = "page page-form";
  page.appendChild(headerBar());

  const wrap = document.createElement("section");
  wrap.className = "form-card";
  const h = document.createElement("h1");
  h.textContent = t("join.title");
  wrap.appendChild(h);

  const form = document.createElement("form");
  form.className = "stack";

  const idLabel = document.createElement("label");
  idLabel.className = "field";
  const idSpan = document.createElement("span");
  idSpan.className = "required";
  idSpan.textContent = t("join.meetingId");
  const idInput = document.createElement("input");
  idInput.required = true;
  idInput.maxLength = 20;
  idInput.autocomplete = "off";
  idInput.value = (params.get("id") ?? "").toUpperCase();
  idInput.addEventListener("input", () => {
    idInput.value = idInput.value.toUpperCase();
    refreshResume();
  });
  idLabel.append(idSpan, idInput);
  const idHint = document.createElement("p");
  idHint.className = "hint";
  idHint.textContent = t("join.idHint");
  idLabel.appendChild(idHint);
  form.appendChild(idLabel);

  const fields = identityFields();
  form.appendChild(fields.el);

  // Empty by default. Server replies invalid_password when needed; we focus
  // this field on that error.
  const passwordLabel = document.createElement("label");
  passwordLabel.className = "field";
  const passwordSpan = document.createElement("span");
  passwordSpan.textContent = t("common.password");
  const passwordInput = document.createElement("input");
  passwordInput.type = "password";
  passwordInput.autocomplete = "current-password";
  passwordInput.maxLength = 64;
  passwordLabel.append(passwordSpan, passwordInput);
  const passwordHint = document.createElement("p");
  passwordHint.className = "hint";
  passwordHint.textContent = t("join.passwordHint");
  passwordLabel.appendChild(passwordHint);
  form.appendChild(passwordLabel);

  const resume = document.createElement("div");
  resume.className = "resume-banner";
  resume.hidden = true;
  const resumeBtn = document.createElement("button");
  resumeBtn.type = "button";
  resumeBtn.className = "btn btn-secondary";
  resumeBtn.textContent = t("join.resume");
  const resumeHint = document.createElement("span");
  resumeHint.textContent = t("join.resumeHint");
  resume.append(resumeHint, resumeBtn);
  form.appendChild(resume);

  function refreshResume(): void {
    const id = idInput.value.trim();
    const sess = id ? loadSession(id) : undefined;
    // Treat malformed entries (missing token/participantId) as no session.
    const valid = Boolean(sess && sess.token && sess.participantId);
    resume.hidden = !valid;
  }
  refreshResume();

  resumeBtn.addEventListener("click", () => {
    const id = idInput.value.trim();
    if (!id) {
      toast(t("errors.invalid_identity"), { type: "error" });
      return;
    }
    const sess = loadSession(id);
    if (!sess?.token) {
      toast(t("errors.invalid_token"), { type: "error" });
      refreshResume();
      return;
    }
    const s = socket$.get();
    if (!s) return;
    s.timeout(10_000).emit("meeting:join", { meetingId: id, token: sess.token }, (timeoutErr, resp) => {
      if (timeoutErr) {
        toast(t("errors.connection"), { type: "error" });
        return;
      }
      if (!resp.ok) {
        toast(t(`errors.${resp.error}`) || resp.error, { type: "error" });
        // Stale session: clean it so the banner stops showing.
        if (resp.error === "invalid_token" || resp.error === "meeting_not_found") {
          clearSession(id);
          refreshResume();
        }
        return;
      }
      meeting$.set(resp.meeting);
      myParticipantId$.set(resp.participantId);
      saveSession({ meetingId: resp.meetingId, participantId: resp.participantId, token: resp.token });
      navigate("/meeting", { id: resp.meetingId });
    });
  });

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "btn btn-primary";
  submit.style.alignSelf = "flex-start";
  submit.appendChild(icon("CircleArrowRight", { size: 16 }));
  const submitLabel = document.createElement("span");
  submitLabel.textContent = " " + t("join.join");
  submit.appendChild(submitLabel);
  form.appendChild(submit);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = idInput.value.trim();
    const identity = fields.value();
    if (!id || !identity) return;
    submit.disabled = true;
    submitLabel.textContent = " " + t("join.joining");
    const s = socket$.get();
    if (!s) return;
    const password = passwordInput.value.trim() || undefined;
    // 10 s ack timeout: see HostSetupPage for the rationale.
    s.timeout(10_000).emit("meeting:join", { meetingId: id, identity, password }, (timeoutErr, resp) => {
      submit.disabled = false;
      submitLabel.textContent = " " + t("join.join");
      if (timeoutErr) {
        toast(t("errors.connection"), { type: "error" });
        return;
      }
      if (!resp.ok) {
        toast(t(`errors.${resp.error}`) || resp.error, { type: "error" });
        if (resp.error === "invalid_password") passwordInput.focus();
        return;
      }
      meeting$.set(resp.meeting);
      myParticipantId$.set(resp.participantId);
      saveSession({ meetingId: resp.meetingId, participantId: resp.participantId, token: resp.token });
      // Stays tab-scoped (sessionStorage) so the guest can re-share it
      // from the meeting page if needed.
      savePassword(resp.meetingId, password);
      navigate("/meeting", { id: resp.meetingId });
    });
  });

  wrap.appendChild(form);
  page.appendChild(wrap);
  root.appendChild(page);
  (idInput.value ? fields.firstInput : idInput).focus();
}

function identityFields(): { el: HTMLElement; value: () => { firstName: string; lastName: string; role: string } | undefined; firstInput: HTMLInputElement } {
  const fs = document.createElement("fieldset");
  fs.className = "fieldset";
  const leg = document.createElement("legend");
  leg.className = "required";
  leg.textContent = t("common.yourIdentity");
  fs.appendChild(leg);
  const row = document.createElement("div");
  row.className = "inline-row";
  const first = labeled(t("common.firstName"));
  const last = labeled(t("common.lastName"));
  const role = labeled(t("common.role"));
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
    firstInput: first.input,
  };
}

function labeled(label: string): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.required = true;
  input.maxLength = 60;
  wrap.append(span, input);
  return { wrap, input };
}
