# Keyboard shortcuts

You can operate Meetingtime entirely from the keyboard. Every shortcut uses a modifier (`Alt`, `Ctrl`, or `Ctrl + Shift`) so the same keys work whether or not the host is typing in the notes. The help dialog is reachable from the question-mark button in the header.

## Meeting (Alt)

| Shortcut | Action | Role |
| --- | --- | --- |
| `Alt + Enter` | Start, resume or pause the meeting | Host |
| `Alt + ⌫` | End the meeting (with confirmation) | Host |
| `Alt + H` | Raise or lower your hand | All |
| `Alt + N` | Collapse or expand the notes panel | All |

## Participants (Ctrl)

| Shortcut | Action | Role |
| --- | --- | --- |
| `Ctrl + ↑ / ↓` | Navigate the participant list | All |
| `Ctrl + Enter` | Grant or revoke the floor for the focused participant | Host |

## Topics (Ctrl + Shift)

| Shortcut | Action | Role |
| --- | --- | --- |
| `Ctrl + Shift + ↑ / ↓` | Navigate the agenda | All |
| `Ctrl + Shift + Enter` | Start or stop the focused topic | Host |

## Miscellaneous

| Shortcut | Action |
| --- | --- |
| `Esc` | Close the currently open dialog |

## Implementation notes

All shortcuts are registered through `client/src/lib/keyboard.ts`. The dispatcher listens for `keydown` in the capture phase on `document` and calls `stopPropagation()` and `stopImmediatePropagation()` after a binding matches. This is what intercepts the event before CodeMirror gets it, and is the only reason `Ctrl + Enter` can grant the floor without also inserting a newline in the notes editor. The dispatcher goes inert while a modal dialog is open (a shortcut firing behind a dialog would mutate the meeting invisibly; Escape is handled by the dialog helper itself).

On macOS, `Cmd` acts as `Ctrl` for the letter and Enter shortcuts (the conventional mapping), but not for the arrow shortcuts, where `Cmd + ↑/↓` must keep its system meaning (jump to start/end of the text) inside the notes editor. Alt+letter bindings also match on the physical key (`e.code`), because Option+letter types a special character on macOS (`Option + H` produces "˙") and would otherwise never match.

Every binding sets `allowInEditable: true` so it fires even when the focus is inside an `<input>`, a `<textarea>` or CodeMirror. That is the entire reason a modifier (Alt, Ctrl or Ctrl + Shift) is required on every shortcut: a plain letter would otherwise be swallowed by the editor as soon as the host typed.

The semantic axes are:

- `Alt` for actions on the meeting as a whole.
- `Ctrl` for actions on the participants.
- `Ctrl + Shift` mirrors the participant shortcuts but applies to the topics.

Meetingtime deliberately avoids browser conflicts: no `Ctrl + P`, `Ctrl + T`, `Ctrl + L`, `Ctrl + H`, `Ctrl + N` or `Ctrl + J` is bound, since those are reserved by every major browser for printing, new-tab, address-bar focus, history, new-window and downloads respectively. `Alt + Space` is also avoided because Windows hosts running PowerToys (or just the native window-menu accelerator) intercept it before the browser ever sees the event.
