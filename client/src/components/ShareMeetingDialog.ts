import { t } from "../i18n/index.js";
import { icon } from "./Icon.js";
import { toast } from "./Toaster.js";
import { installDialogA11y } from "../lib/dialogA11y.js";

interface ShareInfo {
  meetingId: string;
  password?: string;
}

export function showShareMeetingDialog(info: ShareInfo): Promise<void> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";
    backdrop.dataset.share = "1";

    const dlg = document.createElement("div");
    dlg.className = "dialog dialog-wide";
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("aria-modal", "true");
    dlg.setAttribute("aria-labelledby", "share-title");

    const h = document.createElement("h2");
    h.id = "share-title";
    h.textContent = t("share.title");
    dlg.appendChild(h);

    const intro = document.createElement("p");
    intro.className = "dialog-intro";
    intro.textContent = t("share.intro");
    dlg.appendChild(intro);

    // Password is deliberately kept out of the URL: URLs leak via history,
    // the Referer header and screen sharing.
    const origin = window.location.origin;
    const path = window.location.pathname;
    const joinLink = `${origin}${path}#/join?id=${encodeURIComponent(info.meetingId)}`;

    const grid = document.createElement("div");
    grid.className = "share-grid";

    addRow(grid, t("share.link"), joinLink);
    addRow(grid, t("share.meetingId"), info.meetingId);
    if (info.password) {
      addRow(grid, t("common.password"), info.password, { sensitive: true });
    }

    dlg.appendChild(grid);

    const messageLabel = document.createElement("label");
    messageLabel.className = "share-message-label";
    messageLabel.textContent = t("share.message");
    dlg.appendChild(messageLabel);

    const messageText = info.password
      ? t("share.messageTemplate", { link: joinLink, id: info.meetingId, password: info.password })
      : t("share.messageTemplateNoPassword", { link: joinLink, id: info.meetingId });

    const messageArea = document.createElement("textarea");
    messageArea.className = "share-message";
    messageArea.rows = info.password ? 5 : 4;
    messageArea.readOnly = true;
    messageArea.value = messageText;
    dlg.appendChild(messageArea);

    const messageActions = document.createElement("div");
    messageActions.className = "share-message-actions";
    const copyMessage = document.createElement("button");
    copyMessage.type = "button";
    copyMessage.className = "btn btn-secondary";
    copyMessage.appendChild(icon("Copy", { size: 14 }));
    const copyLbl = document.createElement("span");
    copyLbl.textContent = " " + t("share.copyMessage");
    copyMessage.appendChild(copyLbl);
    copyMessage.addEventListener("click", () => copyToClipboard(messageText, copyMessage, 14));
    messageActions.appendChild(copyMessage);
    dlg.appendChild(messageActions);

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
      resolve();
    };
    close.addEventListener("click", onClose);
    teardown = installDialogA11y(backdrop, dlg, onClose, { initialFocus: close });
  });
}

function addRow(
  grid: HTMLElement,
  label: string,
  value: string,
  opts: { sensitive?: boolean } = {}
): void {
  const labelEl = document.createElement("div");
  labelEl.className = "share-label";
  labelEl.textContent = label;
  const valueWrap = document.createElement("div");
  valueWrap.className = "share-value";
  const valueText = document.createElement("code");
  valueText.className = "share-value-text";
  // The password is plainly visible: this modal is host-only and the host
  // explicitly opened it to copy the credentials. The `sensitive` flag just
  // adjusts the monospace styling to highlight that this is the secret.
  if (opts.sensitive) valueText.dataset.sensitive = "true";
  valueText.textContent = value;
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "icon-btn share-copy";
  copyBtn.setAttribute("aria-label", t("common.copy"));
  copyBtn.title = t("common.copy");
  copyBtn.appendChild(icon("Copy", { size: 14 }));
  copyBtn.addEventListener("click", () => copyToClipboard(value, copyBtn, 14));
  valueWrap.append(valueText, copyBtn);
  grid.append(labelEl, valueWrap);
}

async function copyToClipboard(
  text: string,
  btn?: HTMLButtonElement,
  iconSize = 14
): Promise<void> {
  if (await tryCopy(text)) {
    toast(t("share.copied"), { type: "success" });
    if (btn) flashCopied(btn, iconSize);
  } else {
    toast(t("share.copyFailed"), { type: "error" });
  }
}

// navigator.clipboard.writeText only exists in secure contexts (HTTPS or
// localhost), so a plain-HTTP LAN deployment would otherwise see the Copy
// button silently do nothing. Fall back to the legacy execCommand path.
async function tryCopy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to execCommand
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function flashCopied(btn: HTMLButtonElement, iconSize: number): void {
  const original = btn.querySelector("svg");
  if (!original) return;
  const check = icon("Check", { size: iconSize });
  btn.replaceChild(check, original);
  btn.dataset.copied = "true";
  window.setTimeout(() => {
    if (btn.dataset.copied !== "true") return;
    delete btn.dataset.copied;
    const cur = btn.querySelector("svg");
    if (cur) btn.replaceChild(icon("Copy", { size: iconSize }), cur);
  }, 1500);
}
