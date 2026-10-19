import { MAX_TIMEBOX_MS } from "@meetingtime/shared";
import { t } from "../i18n/index.js";
import { installDialogA11y } from "../lib/dialogA11y.js";

// Asks the host for the per-turn speaking time before turning it on.
// Resolves to milliseconds, or null on cancel.
export function timeboxDialog(currentMs: number | undefined): Promise<number | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";

    const dlg = document.createElement("form");
    dlg.className = "dialog";
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("aria-modal", "true");
    dlg.setAttribute("aria-labelledby", "timebox-title");

    const h = document.createElement("h2");
    h.id = "timebox-title";
    h.textContent = t("meeting.timeboxEnable");
    dlg.appendChild(h);

    const wrap = document.createElement("label");
    wrap.className = "field";
    const span = document.createElement("span");
    span.textContent = t("meeting.timeboxMinutes");
    const input = document.createElement("input");
    input.type = "number";
    input.required = true;
    input.min = "1";
    input.max = String(MAX_TIMEBOX_MS / 60_000);
    input.step = "1";
    if (currentMs) input.value = String(Math.round(currentMs / 60_000));
    wrap.append(span, input);
    dlg.appendChild(wrap);

    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-secondary";
    cancel.textContent = t("common.cancel");
    const ok = document.createElement("button");
    ok.type = "submit";
    ok.className = "btn btn-primary";
    ok.textContent = t("meeting.timeboxApply");
    actions.append(cancel, ok);
    dlg.appendChild(actions);

    backdrop.appendChild(dlg);
    document.body.appendChild(backdrop);

    let teardown: () => void = () => undefined;
    const close = (value: number | null): void => {
      teardown();
      backdrop.remove();
      resolve(value);
    };
    cancel.addEventListener("click", () => close(null));
    // The browser validates min/max/step before submit fires.
    dlg.addEventListener("submit", (e) => {
      e.preventDefault();
      close(Number(input.value) * 60_000);
    });
    teardown = installDialogA11y(backdrop, dlg, () => close(null), { initialFocus: input });
  });
}
