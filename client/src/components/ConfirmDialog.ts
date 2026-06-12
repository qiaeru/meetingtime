import { t } from "../i18n/index.js";
import { installDialogA11y } from "../lib/dialogA11y.js";

export function confirmDialog(message: string, opts: { okLabel?: string } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";

    const dlg = document.createElement("div");
    dlg.className = "dialog";
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("aria-modal", "true");

    const msg = document.createElement("p");
    msg.textContent = message;
    dlg.appendChild(msg);

    const actions = document.createElement("div");
    actions.className = "dialog-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-secondary";
    cancel.textContent = t("common.cancel");

    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "btn btn-primary";
    ok.textContent = opts.okLabel ?? t("common.confirm");

    actions.append(cancel, ok);
    dlg.appendChild(actions);
    backdrop.appendChild(dlg);
    document.body.appendChild(backdrop);

    let teardown: () => void = () => undefined;
    const close = (value: boolean): void => {
      teardown();
      backdrop.remove();
      document.removeEventListener("keydown", onEnter);
      resolve(value);
    };
    // Enter confirms; Escape (cancel) is handled by the shared helper. When
    // the Cancel button has focus (keyboard user tabbed to it), Enter must
    // activate Cancel, not confirm over it.
    const onEnter = (e: KeyboardEvent): void => {
      if (e.key === "Enter") {
        e.preventDefault();
        close(document.activeElement !== cancel);
      }
    };
    document.addEventListener("keydown", onEnter);

    cancel.addEventListener("click", () => close(false));
    ok.addEventListener("click", () => close(true));
    // Cancel takes the initial focus: every caller guards a destructive or
    // irreversible action, so a reflexive Enter must be the safe choice.
    teardown = installDialogA11y(backdrop, dlg, () => close(false), { initialFocus: cancel });
  });
}
