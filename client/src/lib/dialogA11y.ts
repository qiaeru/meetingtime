// Shared a11y plumbing for every home-grown modal: Tab trap (re-queried on
// each Tab so dynamically added controls stay in the trap), Escape-to-close,
// backdrop-click-to-close, initial focus, and restore-focus-on-teardown.
// The caller owns the backdrop's lifecycle (`.remove()`); this helper only
// returns the listener-removal function.
export function installDialogA11y(
  backdrop: HTMLElement,
  dialog: HTMLElement,
  close: () => void,
  opts: { initialFocus?: HTMLElement } = {},
): () => void {
  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const getFocusables = (): HTMLElement[] =>
    Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => !el.hidden && el.offsetParent !== null,
    );

  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = getFocusables();
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const onBackdrop = (e: MouseEvent): void => {
    if (e.target === backdrop) close();
  };

  document.addEventListener("keydown", onKey);
  backdrop.addEventListener("click", onBackdrop);

  // RAF lets the dialog body render and CSS hidden-toggles settle before
  // we query focusables.
  requestAnimationFrame(() => {
    const target = opts.initialFocus ?? getFocusables()[0] ?? dialog;
    target.focus({ preventScroll: true });
  });

  return () => {
    document.removeEventListener("keydown", onKey);
    backdrop.removeEventListener("click", onBackdrop);
    // The opener may have been destroyed by a state-driven rebuild while the
    // dialog was open (confirming "remove participant" rebuilds the list);
    // focusing a detached node is a silent no-op, so fall back to the page.
    if (previouslyFocused?.isConnected) {
      try {
        previouslyFocused.focus({ preventScroll: true });
      } catch {
        /* element may have been removed from the DOM */
      }
    } else {
      document.getElementById("main-content")?.focus({ preventScroll: true });
    }
  };
}
