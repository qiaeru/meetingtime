# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.0] - 2026-06-19

### Added

- An attribution footer ("Developed by Qiaeru | Source code on GitHub", with the Qiaeru and GitHub logos) now appears on the home, create-meeting and join screens. It is absent from the meeting room to keep that view uncluttered.

### Changed

- Polish UI strings in all five languages: French non-breaking spaces before punctuation, consistent imperative mood on the Italian floor buttons, corrected German grammar on the take-over label, and a clearer "Template imported." confirmation everywhere.
- Large meetings render more smoothly: the participant list, agenda and host controls now rebuild only when something actually changes, not on every half-second tick.
- The syntax-highlighting runtime now ships only the languages the notes editor actually offers, instead of Shiki's full grammar set. The built web assets drop from about 12 MB to under 3 MB and the Docker image builds faster, with no change to the highlighting you see.

### Fixed

- Dragging a participant or an agenda topic across several rows now lands it exactly where you drop it, as a single move.
- On a phone, reloading the page while you hold the floor no longer replays the "you have the floor" chime and buzz.
- The Share dialog can no longer open twice on a fast double-click.
- Screen readers now speak the hours in long speaking times (for example "1 hour 15 minutes") instead of collapsing them into minutes.
- Screen readers now hear the avatar label as "name, role, status" with spoken pauses, as documented, instead of a dash-separated string.
- A server crash now exits with a failure code, so a restart-on-failure orchestrator brings it back up instead of treating the crash as a clean stop.

## [1.3.0] - 2026-06-12

### Added

- The meeting ID field cleans up whatever you paste or type (spaces stripped, dash inserted automatically), so "mrx7 92ab" finds the meeting instead of failing.
- Deleting an agenda topic now asks for confirmation, since the time recorded on it is lost with it.
- On a phone, the big button reads "Take the floor from {name}" with a distinct style when a colleague is speaking, so a tap no longer silently interrupts them.
- Phones play the gong and vibrate when the meeting ends, and chime and vibrate when the host hands you the floor.
- The end-of-meeting banner warns that the meeting and its notes will be deleted from the server within minutes, so nobody postpones the export and loses the notes.
- Server-side refusals that used to fail silently now surface: adding a participant or topic past the caps shows the error, and an incomplete participant row on the create form blocks submission with an explanation instead of silently dropping that person.

### Fixed

- Pause time is no longer charged to the current speaker and topic when the meeting ends (or the speaker changes) without resuming first; exported speaking times are now exact.
- A brief network outage that disconnects everyone at once can no longer delete a meeting older than the idle timeout: presence now counts as activity for the garbage collector.
- Browsers set to Spanish, Italian or German are now served in their language instead of falling back to English.
- Contrast: the Start/End buttons and the mobile take-the-floor button no longer pair white text with light backgrounds in dark theme, and the end-of-meeting banner is readable in light theme.
- Keyboard: focus survives the interface refreshes (reorder chevrons, Start/Pause), global shortcuts no longer fire behind an open dialog, and the Alt/Cmd combos now behave correctly on macOS.
- Confirmation dialogs focus Cancel by default and Enter activates the focused button, so a reflexive Enter no longer ends the meeting or removes a participant.
- Early joiners now see "the meeting has not started" instead of "nobody is speaking" while waiting in the lobby.
- Narrow screens: identity fields wrap instead of being crushed, dialogs scroll instead of clipping, toasts fit small phones.
- With a room full of phones, the last-seconds countdown beeps play only on the current speaker's device.
- Joining a different meeting from a second device no longer marks the participant disconnected in the first meeting while another of their devices is still there.
- A departed participant's cursor is removed from the collaborative notes as soon as they disconnect, instead of lingering for up to 30 seconds.
- Plug slow memory growth over long sessions (theme toggle, language picker, notes panel torn down mid-load).

### Security

- A malformed Socket.IO frame from any client could crash the whole server process; every socket handler is now guarded and answers with an error code instead.

### Changed

- Shrink the Docker image by carrying only the server's production dependencies (the client's packages are already compiled into the bundle), and report container health through the built-in `/healthz` endpoint.
- Raise the per-IP request budget from 60 to 300 per minute so a whole team behind one office network can load the app at meeting start; `/healthz` is exempt.
- The server now sends a single `meeting:state` event; the granular notification events were never consumed by the client and have been removed from the wire contract.
- The collaborative notes preview refreshes at most every 200 ms while others type, instead of re-rendering on every keystroke.
- Client TypeScript is now type-checked during the build, and the Docker build installs dependencies strictly from the committed lockfile.

## [1.2.0] - 2026-06-02

### Added

- Participants can now take and release the floor themselves from their phone, so the host no longer has to switch the active speaker by hand (the host keeps manual control). This ships as a dedicated mobile view showing the current speaker, the meeting timer and the topic under discussion, with a large take/release-the-floor button, a raise-hand button, sound and vibration toggles, and a screen that stays awake while the meeting is open.

### Changed

- Joining the same meeting from a second device with identical first name, last name and role now reuses the existing participant instead of creating a duplicate, so speaking time and host status stay on one identity.
- Load the collaborative notes editor on demand so it is no longer downloaded on the mobile participant view.
- Update dependencies: Yjs, DOMPurify and Lucide, plus the lint and build dev toolchain.

## [1.1.1] - 2026-05-27

### Security

- Raise the `ws` override to `^8.21.0` so the Socket.IO transport also picks up the remote memory exhaustion DoS fix. The notes channel already shipped 8.21.0 in 1.1.0; this closes the same gap on the Socket.IO channel.

## [1.1.0] - 2026-05-27

### Added

- Resizable notes panel: drag the handle on its left edge (or focus it and use the arrow keys) to set the panel width. The chosen width is remembered in the browser, and the existing collapse toggle still works.
- Invite nudge: when the host is alone in the meeting, a discreet hint under the participant list links straight to the share dialog.

### Changed

- Refine the French UI strings: French-typography non-breaking spaces before `:` and `?`, and tighter wording in the tagline and the join hint.

### Security

- Bump `ws` to 8.21.0 to pick up the remote memory exhaustion DoS fix (a peer flooding tiny fragments could crash the server with OOM).

## [1.0.1] - 2026-05-20

### Changed

- gzip HTTP responses (client bundle, CSS, locale JSON, SPA index) via the `compression` middleware so cold loads over a tunnel or VPN ship far fewer bytes.

### Fixed

- Share dialog Copy buttons now fall back to `document.execCommand("copy")` when the async Clipboard API is unavailable, so they work on plain-HTTP LAN deployments instead of silently failing.

### Security

- Pin transitive `ws` to `^8.20.1` via npm `overrides`, clearing GHSA-58qx-3vcg-4xpx (uninitialized memory disclosure) while Socket.IO upstream still ships `engine.io` with `ws@~8.18.3`.

## [1.0.0] - 2026-05-17

- Initial release.
