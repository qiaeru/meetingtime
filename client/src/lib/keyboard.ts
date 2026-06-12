type Handler = (e: KeyboardEvent) => void;

interface Binding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  // When true, also fires while focus is inside an editable element.
  allowInEditable?: boolean;
  handler: Handler;
}

const bindings: Binding[] = [];

export function registerShortcut(b: Binding): () => void {
  bindings.push(b);
  return () => {
    const i = bindings.indexOf(b);
    if (i >= 0) bindings.splice(i, 1);
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

// On macOS, Option+letter types a special character (Option+H = "˙"), so an
// alt binding must also match on the physical key code.
function keyMatches(b: Binding, e: KeyboardEvent): boolean {
  if (b.key.toLowerCase() === e.key.toLowerCase()) return true;
  return Boolean(b.alt) && /^[a-z]$/i.test(b.key) && e.code === `Key${b.key.toUpperCase()}`;
}

// On macOS, Cmd+Arrow is the system "jump to start/end" text navigation, so
// only a real Ctrl may trigger arrow bindings there; for letter/Enter keys,
// Cmd keeps acting as Ctrl (the conventional mac mapping).
function ctrlMatches(b: Binding, e: KeyboardEvent): boolean {
  const ctrlLike = b.key.startsWith("Arrow") ? e.ctrlKey : e.ctrlKey || e.metaKey;
  return Boolean(b.ctrl) === ctrlLike;
}

// Capture-phase listener + stopImmediatePropagation lets shortcuts fire
// before CodeMirror sees the event. That's what keeps Ctrl+Enter from
// inserting a newline in the notes while still granting the floor.
export function initKeyboardLayer(): void {
  document.addEventListener(
    "keydown",
    (e) => {
      // Modal dialogs own the keyboard: a global shortcut firing behind an
      // open dialog mutates the meeting invisibly (Escape lives in
      // dialogA11y, so nothing is lost by bailing out here).
      if (document.querySelector(".dialog-backdrop")) return;
      const editable = isEditableTarget(e.target);
      for (const b of bindings) {
        if (!keyMatches(b, e)) continue;
        if (!ctrlMatches(b, e)) continue;
        if (Boolean(b.shift) !== e.shiftKey) continue;
        if (Boolean(b.alt) !== e.altKey) continue;
        if (editable && !b.allowInEditable) continue;
        b.handler(e);
        e.stopPropagation();
        e.stopImmediatePropagation();
        return;
      }
    },
    true
  );
}
