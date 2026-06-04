# Architecture

## Overview

```text
┌────────────────────────────────────────────────────────────────────┐
│  Browser                                                            │
│  ┌────────────────┐   Socket.IO   ┌────────────────────────────┐    │
│  │ Vite/TS client │ ◄──────────► │  Express 5 + Socket.IO + Yjs│    │
│  │  - pages/      │   WebSocket   │       Node.js 24           │    │
│  │  - components/ │ ◄──────────► │  In-memory MeetingStore    │    │
│  │  - state/      │   /yjs/<id>   │  Map<id, Meeting>          │    │
│  │  - i18n/       │               │  Map<id, Y.Doc>            │    │
│  │  - lib/        │               │                            │    │
│  └────────────────┘               └────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
```

Two WebSocket channels share the same port. **Socket.IO** (mounted on `/socket.io`) carries meeting commands such as starting the meeting, granting the floor, raising a hand or moving topics, as well as the periodic `meeting:state` broadcasts that drive the entire UI. **Yjs** (mounted on `/yjs/<meetingId>?token=…`) carries the CRDT synchronisation for the collaborative Markdown notes plus the awareness payload that produces the coloured remote cursors. There is no separate persistence layer: everything lives in server memory, and a meeting is garbage-collected after `HOST_TIMEOUT_MS` of inactivity or after `POST_END_GC_MS` once it has been ended explicitly.

## Workspaces

The repo is a three-workspace npm monorepo. `shared/` holds the TypeScript contracts (the `Meeting` shape, the `ClientToServerEvents` / `ServerToClientEvents` signatures and the permission helpers). It has no runtime dependencies so it can be imported from either Node or the browser. `server/` is the Express 5 backend plus the Socket.IO server and the Yjs bridge; it compiles to `server/dist/`. `client/` is a Vite 8 + vanilla TypeScript frontend that bundles to `server/dist/public/`, which the server then serves as static assets in production.

## Server

`meetings/Meeting.ts` is the state machine for one meeting. All transitions (start, pause, end, grant or revoke speaker, raise or lower hand, add or remove topics, promote or demote a host, reorder participants or topics, toggle the time-box) live as methods on the class. The socket handlers must never mutate `meeting.state` directly; they call a method and rebroadcast. The per-speaker and per-topic accumulators (`flushSpeaker`, `flushTopic`) run on every transition that pauses or hands off timing, and that bookkeeping only lives inside the class methods so it cannot be bypassed. A monotonic counter `orderSeq` assigns a unique `order` value to each participant: two participants created in the same millisecond would otherwise collide on `Date.now()` alone and the up/down reorder would silently fail. `grantSpeaker` and `setCurrentTopic` are no-ops outside the `running` or `paused` phases. `end()` flushes the accumulators, clears `currentSpeakerId` and `currentTopicId` (so the UI treats `ended` as fully idle) and records `endedAt`. The optional password is stored privately on the instance; only `state.hasPassword` is broadcast, and verification goes through `verifyPassword(supplied)` using a constant-time-ish comparison (length check first, then per-character XOR).

`meetings/MeetingStore.ts` is the in-memory map of active meetings and their Yjs documents. A periodic GC sweep deletes empty meetings whose `lastActivity` is older than `HOST_TIMEOUT_MS`. The store also exposes `scheduleDeleteAfterEnd(id, delayMs)`, called by the `meeting:end` handler so a terminated meeting (with its tokens, password, participants, topics and Y.Doc) is wiped from memory after `POST_END_GC_MS` (default five minutes). The delay leaves enough time for the client to export the Markdown notes from the still-live Yjs document.

`meetings/hostFallback.ts` is the safety net that auto-promotes the oldest connected participant when no host remains, so an accidental disconnect of every host does not lock the meeting.

`socket/handlers.ts` wires each Socket.IO event to a `Meeting` method and rebroadcasts the state. `socket/authorize.ts` carries the `requireHost` guard that gates every host-sensitive event on the participant's `isHost` flag. The exceptions are `hand:raise`/`hand:lower` and the participant-driven `speaker:claim`/`speaker:release`: a participant takes or releases the floor for themselves (reusing `grantSpeaker`/`revokeSpeaker`, so the host can still override). Presence is multi-socket aware: a participant connected from two devices stays connected until their last socket drops, and an identity-flow join whose first name, last name and role match an existing participant reuses that participant instead of creating a duplicate (so a laptop plus a phone is one identity, not two). `yjs/ywsBridge.ts` is the minimal y-websocket-compatible bridge that drops doc updates coming from non-hosts so guests cannot tamper with the notes.

`lib/locales.ts` is the canonical server-side list of supported locales plus the `pickLocale(acceptLanguage)` content-negotiation helper used by the manifest route. Any new locale must be added here and in the matching client list at the same time.

## Client

The client has no UI framework. Components are functions that return a handle of the shape `{ el: HTMLElement; update(): void; tick?(): void; stop?(): void; destroy?(): void }`. `pages/MeetingPage.ts` is canonical: it builds every component once, subscribes to `meeting$` to call `update()` on state changes, and runs a single five-hundred-millisecond ticker that calls `spotlight.update()`, `list.tick()` and `agenda.tick()`. The single ticker means every component reads the same `Date.now()` value, so the spotlight chronometer and the participant-row chronometer cannot drift apart by a second.

Below a 900-pixel viewport, `MeetingPage` hands the participant experience to `components/MobileMeetingView.ts` instead of building the desktop dashboard; the host is expected on a large screen, and the page re-renders if the viewport crosses the breakpoint.

The `update()` / `tick()` split keeps hot paths fast and stable. `update()` rebuilds the full DOM on state change and is therefore destructive (it clobbers focus, hover and in-progress drag). `tick()` only mutates the live numeric fields (chronometer text, progress-bar width). Both `ParticipantList` and `AgendaPanel` use this split so dragging a row no longer flickers every five hundred milliseconds. `SpeakerSpotlight` follows a similar pattern in place: the DOM is built once and the chronometer text and turn-bar width are mutated per tick.

`state/socket.ts` exposes the typed Socket.IO wrapper plus the observables `meeting$`, `myParticipantId$`, `socket$`, and `connection$` (`"connected" | "reconnecting" | "disconnected"`, which drives the persistent connection banner). `state/session.ts` persists `{participantId, token}` per meeting in **localStorage** so a reload rejoins automatically, and a separate `savePassword(id, pwd)` / `loadPassword(id)` pair persists the join password in **sessionStorage** only (tab-scoped, never written to disk). Both are wiped when the meeting transitions to `ended` and again when the user explicitly leaves via the ended-banner "Home" button. `state/store.ts` is the tiny home-grown observable primitive.

`router.ts` is a hash-router with **per-route code splitting** (each page is loaded with a dynamic `import()`) and a monotonic token that ignores stale loads if the user navigates faster than the dynamic import resolves. It also sets `document.body.dataset.route` on every render so CSS can target the current route, which is how the floating background and the home-only gradient are scoped.

`i18n/index.ts` exposes `t(key, params)` with a fallback chain (current locale → French → raw key), `setLocale`, `toggleLocale` and the canonical `SUPPORTED_LOCALES` array used by the picker. Dictionaries live in `client/src/i18n/locales/{fr,en}.json`.

`components/Avatar.ts` is the round avatar with initials, a deterministic colour and a status badge (speaking or hand-raised). It carries `role="img"` plus a reconstructed `aria-label` (full name, role, connection or status).

`components/SpeakerSpotlight.ts` is the big card showing who currently holds the floor. The DOM is built once; ticks only mutate text content and the width of the secondary progress bar. When `timeboxEnabled` is active, a small secondary chronometer of the form `mm:ss / mm:ss` appears under the main chrono with a thin horizontal bar that fills left to right (green, then orange, then red, depending on the ratio). On overshoot, only the small chrono and its bar pulse; the whole card no longer flashes red, which previously felt aggressive. Audible ticks fire at 10, 5, 3, 2 and 1 seconds before the limit. A visually hidden live region scoped to the spotlight announces only speaker-identity changes, so screen-reader users are not flooded by every chronometer tick.

`components/ParticipantList.ts` is the participant cards. Each row carries a fill bar proportional to that participant's share of the total speaking time (deterministic colour plus a stripe pattern whose angle varies by index, so two close hues stay distinguishable for colour-blind viewers). Reorder is handled by chevron buttons and by native HTML5 drag-and-drop, the row being marked `draggable=true` only while the user holds the dedicated drag handle, so inner button clicks never start an accidental drag. The leading speaker control (grant or revoke) and the host actions (promote, demote, reorder, remove) are gated on `phase !== "ended"`.

`components/HandRaiseBanner.ts` is the full-width banner that surfaces a queue of raised hands. The first hand is highlighted; subsequent hands appear as chips. Hosts can click a chip to grant the floor directly to that participant.

`components/CollaborativeEditor.ts` wraps CodeMirror 6, `y-codemirror.next` and the Yjs `WebsocketProvider`. The theme switches dynamically (light or dark) through a CodeMirror `Compartment`, with no reload needed.

`components/NotesPanel.ts` is the foldable notes side panel. The header carries the title plus the action buttons (preview, split, export). A permanent description points to the Markdown help dialog. Three modes are offered: edit, preview and a horizontal split. Non-hosts get a read-only banner. The meeting page imports it on demand, so the notes editor (CodeMirror, Yjs, Shiki) is never downloaded on the mobile participant view.

`components/MobileMeetingView.ts` is the phone-sized participant view rendered below the breakpoint. It shows the meeting timer, the current speaker and the topic under discussion, with a large take/release-the-floor button, a raise-hand button, and sound and vibration toggles, and it holds a Screen Wake Lock so the phone does not dim mid-meeting. It reuses `SpeakerSpotlight` and `MeetingTimer` and deliberately omits the agenda, participant list and notes editor.

`components/MarkdownPreview.ts` renders Markdown through Marked, with syntax highlighting from a lazy-loaded **Shiki** highlighter (dual themes `github-light` and `github-dark`, fifteen bundled languages). The output is sanitised by DOMPurify with `ADD_ATTR: ["style"]` so Shiki's inline styles are preserved.

`components/MarkdownHelpDialog.ts`, `AddTopicDialog.ts`, `AddParticipantDialog.ts`, `ConfirmDialog.ts`, `KeyboardHelpDialog.ts` and `ShareMeetingDialog.ts` are the modal dialogs (backdrop plus dialog plus actions, Escape and click-outside to close). `ShareMeetingDialog` shows the direct join link (`#/join?id=…`, with the password deliberately kept out of the URL since URLs leak via history and the Referer header), the meeting ID, the password (only if known locally), and a ready-to-paste invitation message. It is also reachable from the meeting header via a Share button.

`components/AgendaPanel.ts` is the agenda. Topics carry a live chronometer; the header carries a count badge and an add button; an empty state offers the host a CTA. Like the participant list, it splits `update()` (full rebuild) from `tick()` (chronometer only) to preserve hover and in-progress drag. It exposes `focusedId()` and `focusNext(dir)` for keyboard navigation through `Ctrl + Shift + ↑/↓`.

`components/MeetingTimer.ts` is the global meeting chronometer. When a `plannedDurationMs` is set, the card fills from the bottom up in blue, then orange, then red, depending on the ratio of elapsed to planned time. The fill carries a water-like animation produced by two slowly rotating near-circular pseudo-elements; the meeting phase being `ended` freezes the chronometer at `endedAt`.

`components/LocaleSwitcher.ts` is the extensible dropdown picker (FR, EN currently, sorted alphabetically by native name).

`components/FloatingBackground.ts` is the decorative background of slow-floating icons on the home page. It is mounted **once** directly under `<body>` (not inside `#app`) because the router clears `#app` on every render, which would restart every CSS animation and produce a visible flicker. Visibility is driven by `body[data-route="/"]` set by the router. Each icon receives a random `depth ∈ [0,1]` that derives its size, blur, animation speed and base opacity together, producing a genuine sense of multiple planes rather than visual noise. Cursor proximity repels nearby icons gently.

`lib/meetingImport.ts` parses, serialises and downloads JSON meeting templates. See `meeting_import.md`.

`lib/markdownExport.ts` composes the final `.md` document (header, speaking-time table, agenda, notes body) and triggers a browser download named `YYYYMMDD_Meetingtime_<id>.md`.

`lib/sounds.ts` synthesises sounds through the Web Audio API. No binary audio asset ships.

`lib/haptics.ts` gates optional vibration feedback (taking or releasing the floor, timebox overrun) behind a persisted, user-toggleable preference, and only on devices that expose the Vibration API.

`lib/keyboard.ts` is the central keyboard registry. See `keyboard.md` for the full table and the capture-phase dispatcher trick that makes shortcuts work uniformly inside CodeMirror.

`lib/color.ts` exposes `colorByPosition(idx, total, salt)` which produces visually distinct colours deterministically for one meeting.

## Event flow (example: raising a hand)

1. The participant clicks the hand button; the client emits `hand:raise`.
2. `socket/handlers.ts` receives the event, calls `meeting.raiseHand(participantId)`, broadcasts `hand:raised` and then `meeting:state`.
3. Every connected client receives `meeting:state`; `meeting$` is updated.
4. `MeetingPage` detects the newly raised hand, plays the discreet alert sound, displays a toast for hosts, shows `HandRaiseBanner` at the top of the left column with a Grant button, and adds a hand badge on the avatar of the requester.

## Data model

The canonical shape lives in `shared/src/models.ts`.
