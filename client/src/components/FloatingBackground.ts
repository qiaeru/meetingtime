import { icon } from "./Icon.js";

const ICONS = [
  "Users",
  "Clock",
  "Mic",
  "FileText",
  "MessageSquare",
  "Calendar",
  "BarChart3",
  "Hand",
  "Speech",
  "Timer",
  "ListChecks",
  "PenLine",
  "Presentation",
  "Briefcase",
  "Lightbulb",
  "Target",
] as const;

// Mounted ONCE directly under <body>. Outside #app on purpose: the router
// clears #app on every navigation (and locale-driven rerender), which would
// detach the wrap and restart every CSS animation.
let mounted = false;

export function mountFloatingBackground(count = 22): void {
  if (mounted) return;
  mounted = true;

  const wrap = document.createElement("div");
  wrap.className = "floating-bg";
  wrap.setAttribute("aria-hidden", "true");

  const items: HTMLElement[] = [];
  for (let i = 0; i < count; i++) {
    const name = ICONS[i % ICONS.length];
    const item = document.createElement("span");
    item.className = "floating-icon";

    // Single depth value drives size, blur, speed and opacity together so
    // the parallax reads as actual depth instead of random visual noise.
    const depth = Math.random();
    const left = Math.random() * 100;
    const top = Math.random() * 100;
    const size = Math.round(120 - depth * 70);
    const blur = (depth * 3.5).toFixed(2);
    const baseOpacity = (0.5 - depth * 0.35).toFixed(2);
    const duration = 14 + depth * 20;
    const delay = -Math.random() * duration;
    const drift = (Math.random() * 40 - 20).toFixed(1);
    const rotate = (Math.random() * 30 - 15).toFixed(1);

    item.style.left = `${left}%`;
    item.style.top = `${top}%`;
    item.style.animationDuration = `${duration.toFixed(1)}s`;
    item.style.animationDelay = `${delay.toFixed(1)}s`;
    item.style.setProperty("--drift", `${drift}px`);
    item.style.setProperty("--rotate", `${rotate}deg`);
    item.style.setProperty("--blur", `${blur}px`);
    item.style.setProperty("--base-opacity", baseOpacity);
    // Closer icons paint over farther ones when they cross paths.
    item.style.zIndex = String(Math.round((1 - depth) * 10));
    item.appendChild(icon(name as Parameters<typeof icon>[0], { size }));
    wrap.appendChild(item);
    items.push(item);
  }

  // Insert before #app: stacking is handled in layout.css; visibility is
  // gated by body[data-route="/"] set by the router.
  document.body.insertBefore(wrap, document.body.firstChild);

  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) {
    const REPEL_RADIUS = 180;
    const REPEL_MAX = 32;
    let rafId = 0;
    let mx = -9999;
    let my = -9999;
    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (!rafId) rafId = requestAnimationFrame(apply);
    };
    const apply = () => {
      rafId = 0;
      for (const el of items) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = cx - mx;
        const dy = cy - my;
        const dist = Math.hypot(dx, dy);
        if (dist < REPEL_RADIUS && dist > 0.1) {
          const force = (1 - dist / REPEL_RADIUS) * REPEL_MAX;
          const ox = (dx / dist) * force;
          const oy = (dy / dist) * force;
          el.style.setProperty("--repel-x", `${ox.toFixed(1)}px`);
          el.style.setProperty("--repel-y", `${oy.toFixed(1)}px`);
          el.style.setProperty("--repel-opacity", "0.55");
        } else {
          el.style.setProperty("--repel-x", "0px");
          el.style.setProperty("--repel-y", "0px");
          el.style.setProperty("--repel-opacity", "");
        }
      }
    };
    window.addEventListener("mousemove", onMove);
  }
}
