import { icon } from "./Icon.js";
import { muted$, toggleMute } from "../lib/sounds.js";
import { t } from "../i18n/index.js";

export function renderMuteButton(): { el: HTMLButtonElement; destroy: () => void } {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "icon-btn";
  el.setAttribute("aria-label", t("a11y.muteToggle"));
  el.dataset.tooltip = t("a11y.muteToggle");
  el.addEventListener("click", toggleMute);
  const destroy = muted$.subscribe((muted) => {
    el.replaceChildren(icon(muted ? "VolumeX" : "Volume2"));
    // The icon is aria-hidden; without this a screen reader cannot tell
    // whether sounds are currently muted.
    el.setAttribute("aria-pressed", String(muted));
  });
  return { el, destroy };
}
