import { t } from "../i18n/index.js";
import { installDialogA11y } from "../lib/dialogA11y.js";

export function addTopicDialog(): Promise<string | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";

    const dlg = document.createElement("form");
    dlg.className = "dialog";
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("aria-modal", "true");
    dlg.setAttribute("aria-labelledby", "add-topic-title");

    const h = document.createElement("h2");
    h.id = "add-topic-title";
    h.textContent = t("host.addTopic");
    dlg.appendChild(h);

    const wrap = document.createElement("label");
    wrap.className = "field";
    const span = document.createElement("span");
    span.textContent = t("host.addTopic");
    const input = document.createElement("input");
    input.type = "text";
    input.required = true;
    input.maxLength = 80;
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
    ok.textContent = t("common.add");
    actions.append(cancel, ok);
    dlg.appendChild(actions);

    backdrop.appendChild(dlg);
    document.body.appendChild(backdrop);

    let teardown: () => void = () => undefined;
    const close = (value: string | null): void => {
      teardown();
      backdrop.remove();
      resolve(value);
    };
    cancel.addEventListener("click", () => close(null));
    dlg.addEventListener("submit", (e) => {
      e.preventDefault();
      const label = input.value.trim();
      if (!label) return;
      close(label);
    });
    teardown = installDialogA11y(backdrop, dlg, () => close(null), { initialFocus: input });
  });
}
