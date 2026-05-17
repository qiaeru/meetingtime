import type { ParticipantIdentity } from "@meetingtime/shared";
import { t } from "../i18n/index.js";
import { installDialogA11y } from "../lib/dialogA11y.js";

export function addParticipantDialog(): Promise<ParticipantIdentity | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";

    const dlg = document.createElement("form");
    dlg.className = "dialog";
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("aria-modal", "true");
    dlg.setAttribute("aria-labelledby", "add-p-title");

    const h = document.createElement("h2");
    h.id = "add-p-title";
    h.textContent = t("common.addParticipant");
    dlg.appendChild(h);

    const fields = document.createElement("div");
    fields.className = "stack-sm";
    const first = field(t("common.firstName"));
    const last = field(t("common.lastName"));
    const role = field(t("common.role"));
    fields.append(first.wrap, last.wrap, role.wrap);
    dlg.appendChild(fields);

    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-secondary";
    cancel.textContent = t("common.cancel");
    const ok = document.createElement("button");
    ok.type = "submit";
    ok.className = "btn btn-primary";
    ok.textContent = t("common.add");
    actions.append(cancel, ok);
    dlg.appendChild(actions);

    backdrop.appendChild(dlg);
    document.body.appendChild(backdrop);

    let teardown: () => void = () => undefined;
    const close = (value: ParticipantIdentity | null): void => {
      teardown();
      backdrop.remove();
      resolve(value);
    };
    cancel.addEventListener("click", () => close(null));
    dlg.addEventListener("submit", (e) => {
      e.preventDefault();
      const fn = first.input.value.trim();
      const ln = last.input.value.trim();
      const ro = role.input.value.trim();
      if (!fn || !ln || !ro) return;
      close({ firstName: fn, lastName: ln, role: ro });
    });
    teardown = installDialogA11y(backdrop, dlg, () => close(null), { initialFocus: first.input });
  });
}

function field(label: string): { wrap: HTMLElement; input: HTMLInputElement } {
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
