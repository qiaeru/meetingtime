# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The footer shows the updated Qiaeru logo, which is also lighter (14 KB instead of 66 KB).
- Hover hints are now themed bubbles that match the interface instead of the browser's plain boxes. They also appear on keyboard focus, close with Escape, and show a participant's name or role only when it is cut off.
- Tables in the Markdown export use spaced separators (`| --- |`), the usual formatting, easier to read in the raw file.
- The meeting page does less work every half second, and the notes server no longer sends an empty presence message to every participant every 15 seconds.
- A host who reloads the page or briefly loses the connection keeps the role: a guest is now promoted host only after fifteen seconds without any connected host.

### Fixed

- Code blocks in the notes preview now get their syntax colors instead of staying on "Loading syntax highlighter…": the content security policy blocked the WebAssembly engine the highlighter needs. If it still cannot load, the code shows without colors.
- The monospace font no longer fails to load for Cyrillic characters in the notes.
- The focus outline of the notes editor now shows on its left edge too.
- The "Skip to main content" link no longer sends you back to the home page, which could make you leave a meeting in progress.
- Turning the per-turn speaking time on while the meeting is paused now restarts the current speaker's countdown from zero, as it already did while the meeting runs.
- Changing the language while filling in the meeting creation form no longer wipes the participants, topics and settings already entered. The form keeps what you typed until the meeting is created.
- Importing a template with minutes the form refuses (not a whole number, or above 60 per turn or 600 per meeting) now fails with a message naming the field, instead of reporting success and then blocking "Create".
- The notes export made during a pause no longer overstates the meeting duration, writes the date with the month spelled out in the interface language (04/09 was ambiguous between countries), and keeps a topic containing a line break on one table row.
- Sounds no longer replay after a page refresh or a language change: the hand-raise chime for hands already up and, on a phone, the end-of-meeting gong and the "you have the floor" cue.
- Keyboard focus stays on the "Grant the floor" button when another participant raises a hand.
- Once the meeting has ended, hosts can no longer drag participants or topics, or open the add-topic dialog from an empty agenda.
- A tab left open across a server upgrade now reloads once to fetch the new version when a page fails to load, instead of doing nothing.
- The button borders on the hand-raise banner are visible again in dark mode.

- After a network drop or a laptop waking from sleep, the meeting page rejoins the meeting on its own. It used to look connected while receiving no more updates, and host actions were silently refused.

### Security

- The server accepts at most ten new meetings per minute from one IP address, so a single client can no longer fill its memory with abandoned meetings.

- A meeting deleted a few minutes after it ends is no longer reachable from a tab left open on it.
## [1.5.0] - 2026-09-25

### Changed

- The nginx deployment now requires `MEETINGTIME_DOMAIN`, like the Caddy and Traefik variants, and restricts connections to that origin instead of accepting any. The stack refuses to start without it: export it before updating.
- Pausing the meeting no longer resets the current speaker's time-box: the turn chronometer freezes during the pause and picks up where it stopped.
- Confirmation buttons now name their action ("End the meeting", "Remove", "Delete topic") instead of a generic "Confirm", in red for irreversible actions, and the questions say what is lost.
- Error messages now say what to do next, and error notifications stay on screen until you close them.
- The meeting creation form shows visible labels on every field (they used to vanish as you typed), and each participant or topic row is easier to tell apart.
- The expected meeting duration accepts any number of minutes, not only multiples of five.
- The per-turn speaking time uses one name everywhere, and its toggle explains why it does nothing when no duration was set.
- Long topic titles wrap instead of being cut off, and long names or roles show in full on hover.
- Offline participants get an "Offline" tag instead of a dimmed avatar alone.
- On a phone held sideways, the take-the-floor and raise-hand buttons sit next to the timer instead of below the fold.
- Each page now has its own browser tab title.
- The notes export made during a meeting now counts the ongoing speaking turn and the running topic.
- Template import errors are now written in the interface language and name the faulty field.
- The author link in the attribution footer now points to qiaeru.com, following the domain move.
- Fingerprinted web assets are cached by the browser for a year, so reloading the page no longer re-checks each file.
- The update procedure in the docs now rebuilds the image (`git pull`, then `up -d --build`); `docker compose pull` alone kept running the old version.
- Multi-architecture release images build faster: the build stage no longer runs under emulation for arm64.
- The `ws` override is gone: Socket.IO now requires the patched `ws` release itself.

### Fixed

- On a 320px phone, the header no longer pushes the theme or help button off the screen, and the current speaker's name no longer breaks one letter per line.
- On narrow desktop windows, the notes panel no longer squeezes the meeting column until the participant list disappears, and the Start, Pause and End buttons no longer cover the share button.
- Text over colored backgrounds (participant rows, avatar initials, hand-raise chips, the raised-hand button, the timer when overtime) and input borders now meet the WCAG contrast minimums in both themes.
- Keyboard focus is visible on the "Back home" button of the ended-meeting banner, on the notes resize handle, on the notes editor in dark mode, and on text fields in Windows high-contrast mode.
- Screen readers now name the notes editor and the invitation message, say which row a repeated button acts on, announce the participant or topic picked with the keyboard shortcuts, and tell which topic is running.
- Reordering participants or topics on the creation form keeps keyboard focus on the moved row.
- With reduced motion enabled, the row that just spoke keeps a static highlight, and switching themes no longer fades.
- Creating a new meeting from the same tab no longer leaves the previous one attached: its broadcasts could replace the new meeting on screen, and the old meeting was never cleaned from memory.
- An ended meeting can no longer be restarted.
- In the hand-raise banner, hosts no longer get "Give the floor" buttons before the meeting starts or after it ends, since those clicks did nothing.
- A participant removed by the host immediately stops receiving the notes.
- After a page reload, your cursor in the notes now shows your name to the others instead of "?", and the notes placeholder follows host promotions and demotions.
- Keyboard focus on the notes "Markdown syntax" link no longer jumps away whenever the meeting state changes.
- The "Export the notes?" prompt appears once per ended meeting, not again after a language switch or a screen rotation.
- Screen readers announce a raised hand on an avatar as "hand raised" instead of the "Raise hand" command, and read the question of confirmation dialogs.
- The Markdown export uses the right label separator in every language ("Durée : 10:00" in French, "Duration: 10:00" elsewhere).
- On a phone, leaving the meeting view while the screen wake lock was being acquired no longer keeps the screen on.
- A crash on a server with no connected client now also exits with a failure code.
- The Traefik deployment starts again on recent Docker Engine versions, which refuse Traefik 3.1: it now follows the latest 3.x release.
- The nginx deployment guide works as written: the first certificate is issued in standalone mode, and renewals go through a challenge directory that nginx now serves (they used to fail silently after 90 days). The image follows the stable nginx release.
- The Caddy deployment now serves your domain: `MEETINGTIME_DOMAIN` never reached the Caddy container, which fell back to `localhost` and never obtained a certificate for it.

### Security

- Wrong meeting passwords are limited to ten per minute per IP address and fifty per minute per meeting, so a guesser only locks out their own address, not the colleagues who have the password.
- Behind the shipped nginx configuration, a client can no longer fake its IP address to escape the rate limit.
- Socket.IO now rejects connections from other websites when `CORS_ORIGIN` is set, as the notes channel already did.
- A crafted participant ID can no longer alter the server state shared by every meeting.
- Inline CSS in the notes is dropped from the preview, except Shiki's own syntax colors.
- The content security policy only allows connections to the app's own origin.
- Failed join attempts no longer keep an abandoned meeting in memory.

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
