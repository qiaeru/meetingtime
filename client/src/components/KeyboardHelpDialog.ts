import { t } from "../i18n/index.js";
import { installDialogA11y } from "../lib/dialogA11y.js";

interface ShortcutGroup {
  titleKey: string;
  items: Array<{ keys: () => string; labelKey: string }>;
}

// Modifier names are language-neutral on every keyboard layout we ship for;
// only Enter and Escape have a French abbreviation that diverges. Arrows and
// Backspace use their universal Unicode glyph.
const PLUS = " + ";
const groups: ShortcutGroup[] = [
  {
    titleKey: "shortcuts.groupGlobal",
    items: [
      { keys: () => `Alt${PLUS}${t("keys.enter")}`, labelKey: "shortcuts.altEnter" },
      { keys: () => `Alt${PLUS}⌫`, labelKey: "shortcuts.altDelete" },
      { keys: () => `Alt${PLUS}H`, labelKey: "shortcuts.h" },
      { keys: () => `Alt${PLUS}N`, labelKey: "shortcuts.ctrlB" },
    ],
  },
  {
    titleKey: "shortcuts.groupParticipants",
    items: [
      { keys: () => `Ctrl${PLUS}↑ / ↓`, labelKey: "shortcuts.upDown" },
      { keys: () => `Ctrl${PLUS}${t("keys.enter")}`, labelKey: "shortcuts.space" },
    ],
  },
  {
    titleKey: "shortcuts.groupTopics",
    items: [
      { keys: () => `Ctrl${PLUS}Shift${PLUS}↑ / ↓`, labelKey: "shortcuts.shiftUpDown" },
      { keys: () => `Ctrl${PLUS}Shift${PLUS}${t("keys.enter")}`, labelKey: "shortcuts.shiftSpace" },
    ],
  },
  {
    titleKey: "shortcuts.groupMisc",
    items: [{ keys: () => t("keys.escape"), labelKey: "shortcuts.escape" }],
  },
];

export function showKeyboardHelp(): void {
  if (document.querySelector(".dialog-backdrop[data-kbd]")) return;
  const backdrop = document.createElement("div");
  backdrop.className = "dialog-backdrop";
  backdrop.dataset.kbd = "1";

  const dlg = document.createElement("div");
  dlg.className = "dialog dialog-wide";
  dlg.setAttribute("role", "dialog");
  dlg.setAttribute("aria-modal", "true");
  dlg.setAttribute("aria-labelledby", "kbd-help-title");

  const h = document.createElement("h2");
  h.id = "kbd-help-title";
  h.textContent = t("shortcuts.title");
  dlg.appendChild(h);

  // subgrid keeps the kbd column aligned across every group; the widest
  // shortcut defines the track.
  const grid = document.createElement("div");
  grid.className = "shortcut-grid";
  for (const g of groups) {
    const section = document.createElement("section");
    section.className = "shortcut-group";
    const heading = document.createElement("h3");
    heading.className = "shortcut-group-title";
    heading.textContent = t(g.titleKey);
    section.appendChild(heading);
    const list = document.createElement("dl");
    list.className = "shortcut-list";
    for (const s of g.items) {
      const dt = document.createElement("dt");
      const kbd = document.createElement("kbd");
      kbd.textContent = s.keys();
      dt.appendChild(kbd);
      const dd = document.createElement("dd");
      dd.textContent = t(s.labelKey);
      list.append(dt, dd);
    }
    section.appendChild(list);
    grid.appendChild(section);
  }
  dlg.appendChild(grid);

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
  const onClose = (): void => {
    teardown();
    backdrop.remove();
  };
  close.addEventListener("click", onClose);
  teardown = installDialogA11y(backdrop, dlg, onClose, { initialFocus: close });
}
