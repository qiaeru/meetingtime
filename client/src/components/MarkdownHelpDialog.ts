import { t } from "../i18n/index.js";
import { installDialogA11y } from "../lib/dialogA11y.js";

interface Entry {
  labelKey: string;
  // Resolves to a multi-line string (newlines split samples). Locale-aware
  // so the prose inside the snippets is translated.
  samplesKey: string;
}

const ENTRIES: Entry[] = [
  { labelKey: "md.headings", samplesKey: "md.headings.samples" },
  { labelKey: "md.bold", samplesKey: "md.bold.samples" },
  { labelKey: "md.italic", samplesKey: "md.italic.samples" },
  { labelKey: "md.strike", samplesKey: "md.strike.samples" },
  { labelKey: "md.lists", samplesKey: "md.lists.samples" },
  { labelKey: "md.orderedLists", samplesKey: "md.orderedLists.samples" },
  { labelKey: "md.taskLists", samplesKey: "md.taskLists.samples" },
  { labelKey: "md.link", samplesKey: "md.link.samples" },
  { labelKey: "md.image", samplesKey: "md.image.samples" },
  { labelKey: "md.quote", samplesKey: "md.quote.samples" },
  { labelKey: "md.codeInline", samplesKey: "md.codeInline.samples" },
  { labelKey: "md.codeBlock", samplesKey: "md.codeBlock.samples" },
  { labelKey: "md.table", samplesKey: "md.table.samples" },
  { labelKey: "md.hr", samplesKey: "md.hr.samples" },
];

export function markdownHelpDialog(): Promise<void> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";

    const dlg = document.createElement("div");
    dlg.className = "dialog dialog-wide";
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("aria-modal", "true");
    dlg.setAttribute("aria-labelledby", "md-help-title");

    const h = document.createElement("h2");
    h.id = "md-help-title";
    h.textContent = t("notes.markdownHelpTitle");
    dlg.appendChild(h);

    const list = document.createElement("dl");
    list.className = "md-help-list";
    for (const e of ENTRIES) {
      const dt = document.createElement("dt");
      dt.textContent = t(e.labelKey);
      const dd = document.createElement("dd");
      const pre = document.createElement("pre");
      pre.textContent = t(e.samplesKey);
      dd.appendChild(pre);
      list.append(dt, dd);
    }
    dlg.appendChild(list);

    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "btn btn-primary";
    close.textContent = t("common.close");
    actions.appendChild(close);
    dlg.appendChild(actions);

    backdrop.appendChild(dlg);
    document.body.appendChild(backdrop);

    let teardown: () => void = () => undefined;
    const closeAll = (): void => {
      teardown();
      backdrop.remove();
      resolve();
    };
    close.addEventListener("click", closeAll);
    teardown = installDialogA11y(backdrop, dlg, closeAll, { initialFocus: close });
  });
}
