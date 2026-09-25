// Themed replacement for the native `title` tooltip: any element carrying
// `data-tooltip` gets one shared bubble on hover (not touch) and on keyboard
// focus. The bubble is visual only (aria-hidden): every trigger already
// exposes the same text through its accessible name or its own content.
const SHOW_DELAY_MS = 350;
const GAP = 8;
const EDGE = 8;

let bubble: HTMLElement;
let current: HTMLElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | undefined;
let watchTimer: ReturnType<typeof setInterval> | undefined;

function triggerOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>("[data-tooltip]") : null;
}

function hide(): void {
  clearTimeout(showTimer);
  clearInterval(watchTimer);
  current = null;
  bubble.dataset.visible = "false";
}

function schedule(el: HTMLElement): void {
  hide();
  current = el;
  showTimer = setTimeout(() => reveal(el), SHOW_DELAY_MS);
}

function reveal(el: HTMLElement): void {
  const text = el.dataset.tooltip;
  if (!text || !el.isConnected) return hide();
  // A truncated name or role repeats its own text: only worth showing when
  // the ellipsis actually hides part of it.
  if (text === el.textContent && el.scrollWidth <= el.clientWidth) return;

  bubble.textContent = text;
  bubble.style.left = "0px";
  bubble.style.top = "0px";
  const r = el.getBoundingClientRect();
  const b = bubble.getBoundingClientRect();
  let top = r.top - b.height - GAP;
  let placement = "top";
  if (top < EDGE) {
    top = r.bottom + GAP;
    placement = "bottom";
  }
  const center = r.left + r.width / 2;
  const left = Math.min(Math.max(center - b.width / 2, EDGE), window.innerWidth - b.width - EDGE);
  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;
  bubble.style.setProperty("--arrow-x", `${Math.min(Math.max(center - left, 12), b.width - 12)}px`);
  bubble.dataset.placement = placement;
  bubble.dataset.visible = "true";
  // Rows rebuilt under the pointer detach the trigger without any pointer event.
  watchTimer = setInterval(() => {
    if (!current?.isConnected) hide();
  }, 250);
}

export function initTooltips(): void {
  bubble = document.createElement("div");
  bubble.className = "tooltip";
  bubble.setAttribute("aria-hidden", "true");
  document.body.appendChild(bubble);

  document.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const el = triggerOf(e.target);
    if (el === current) return;
    if (el) schedule(el);
    else hide();
  });
  document.addEventListener("pointerout", (e) => {
    if (current && !(e.relatedTarget instanceof Node && current.contains(e.relatedTarget))) hide();
  });
  document.addEventListener("focusin", (e) => {
    const el = triggerOf(e.target);
    if (el?.matches(":focus-visible")) schedule(el);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}
