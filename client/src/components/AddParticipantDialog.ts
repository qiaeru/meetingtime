import type { ParticipantIdentity } from "@meetingtime/shared";
import { t } from "../i18n/index.js";
import { installDialogA11y } from "../lib/dialogA11y.js";
import { identityInputs } from "./IdentityFields.js";

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
    const identity = identityInputs(false);
    fields.append(...identity.fields);
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
      const value = identity.value();
      if (value) close(value);
    });
    teardown = installDialogA11y(backdrop, dlg, () => close(null), {
      initialFocus: identity.first,
    });
  });
}
