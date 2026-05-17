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

// Capture-phase listener + stopImmediatePropagation lets shortcuts fire
// before CodeMirror sees the event. That's what keeps Ctrl+Enter from
// inserting a newline in the notes while still granting the floor.
export function initKeyboardLayer(): void {
  document.addEventListener(
    "keydown",
    (e) => {
      const editable = isEditableTarget(e.target);
      for (const b of bindings) {
        if (b.key.toLowerCase() !== e.key.toLowerCase()) continue;
        if (Boolean(b.ctrl) !== (e.ctrlKey || e.metaKey)) continue;
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
