import type { Meeting } from "@meetingtime/shared";
import { headerBar } from "./HomePage.js";
import { t } from "../i18n/index.js";
import { meeting$, myParticipantId$, socket$ } from "../state/socket.js";
import {
  clearSession,
  loadSession,
  loadPassword,
  savePassword,
  saveSession,
} from "../state/session.js";
import { navigate, rerender } from "../router.js";
import { renderMobileMeeting } from "../components/MobileMeetingView.js";
import { renderConnectionBanner } from "../components/ConnectionBanner.js";
import { renderMuteButton } from "../components/MuteButton.js";
import { renderMeetingTimer } from "../components/MeetingTimer.js";
import { renderSpeakerSpotlight } from "../components/SpeakerSpotlight.js";
import { renderHandRaiseBanner } from "../components/HandRaiseBanner.js";
import { renderParticipantList, sortedParticipants } from "../components/ParticipantList.js";
import { addParticipantDialog } from "../components/AddParticipantDialog.js";
import { renderAgenda } from "../components/AgendaPanel.js";
import type { NotesPanelHandle } from "../components/NotesPanel.js";
import { confirmDialog } from "../components/ConfirmDialog.js";
import { showShareMeetingDialog } from "../components/ShareMeetingDialog.js";
import { icon } from "../components/Icon.js";
import { toast } from "../components/Toaster.js";
import { playHandRaise, playGong } from "../lib/sounds.js";
import { registerShortcut } from "../lib/keyboard.js";
import { colorByPosition } from "../lib/color.js";

// Module scope so a re-render (language switch, breakpoint crossing) does not
// offer the export again for a meeting already prompted in this tab.
const exportPromptedFor = new Set<string>();

export function renderMeeting(root: HTMLElement, params: URLSearchParams): () => void {
  const meetingId = params.get("id") ?? meeting$.get()?.id;
  if (!meetingId) {
    navigate("/");
    return () => undefined;
  }

  const socket = socket$.get();
  if (!socket) {
    navigate("/");
    return () => undefined;
  }

  // Joins with the stored token: on a deep link (user pasted a meeting URL
  // into a fresh tab), and again after every Socket.IO reconnect, since the
  // server binds the participant to the socket and a reconnect is a new,
  // anonymous socket that would otherwise never receive the room's state.
  const rejoin = (): void => {
    const sess = loadSession(meetingId);
    if (!sess) {
      navigate("/join", { id: meetingId });
      return;
    }
    // Without the timeout, a server that never acks (restart, dropped
    // frame) would leave the loader below spinning forever.
    socket.timeout(10_000).emit("meeting:join", { meetingId, token: sess.token }, (err, resp) => {
      if (err) {
        toast(t("errors.connection"), { type: "error" });
        navigate("/join", { id: meetingId });
        return;
      }
      if (resp.ok) {
        // Identity first: meeting$ subscribers compare against my id.
        myParticipantId$.set(resp.participantId);
        meeting$.set(resp.meeting);
        saveSession({
          meetingId: resp.meetingId,
          participantId: resp.participantId,
          token: resp.token,
        });
      } else {
        // Wipe the stale session so the next visit lands on the join form
        // instead of looping through this rejoin path.
        if (resp.error === "invalid_token" || resp.error === "meeting_not_found") {
          clearSession(meetingId);
          savePassword(meetingId, undefined);
        }
        toast(t(`errors.${resp.error}`), { type: "error" });
        navigate("/join", { id: meetingId });
      }
    });
  };
  if (meeting$.get()?.id !== meetingId) {
    if (!loadSession(meetingId)) {
      navigate("/join", { id: meetingId });
      return () => undefined;
    }
    rejoin();
  }
  // An ended meeting sends no more state and may already be deleted, so a
  // reconnect then has nothing to recover.
  const onReconnect = (): void => {
    if (meeting$.get()?.phase !== "ended") rejoin();
  };
  socket.io.on("reconnect", onReconnect);

  // On phones, participants get a stripped-down view (current speaker + take/
  // release-the-floor + raise-hand) instead of the desktop dashboard. The host
  // is expected on a large screen. rerender() reruns this page if the viewport
  // crosses the breakpoint (rotation, window resize).
  const MOBILE_BREAKPOINT = 900;
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
  const onBreakpoint = (): void => rerender();
  mql.addEventListener("change", onBreakpoint);
  if (mql.matches) {
    const teardown = renderMobileMeeting(root, meetingId, socket);
    return () => {
      socket.io.off("reconnect", onReconnect);
      mql.removeEventListener("change", onBreakpoint);
      teardown();
    };
  }

  // The header sits outside <main> so it stays a banner landmark and the
  // skip link actually skips it; the router focuses the <main> below.
  const page = document.createElement("div");
  page.className = "page page-meeting";

  // Hides the empty meeting UI flash while the auto-rejoin round-trip and the
  // first meeting:state push are in flight.
  const loader = document.createElement("div");
  loader.className = "meeting-loader";
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");
  loader.textContent = t("meeting.reconnecting");
  if (meeting$.get()?.id !== meetingId) page.appendChild(loader);
  const unsubLoader = meeting$.subscribe((m) => {
    if (m?.id === meetingId) loader.remove();
  });

  const header = headerBar();

  const muteBtn = renderMuteButton();
  header.querySelector(".header-actions")?.prepend(muteBtn.el);

  // Available to everyone (host or guest). The password row only renders if
  // the local participant typed it on join (sessionStorage); otherwise it's
  // simply not in memory on this tab.
  const shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.className = "icon-btn";
  shareBtn.setAttribute("aria-label", t("share.title"));
  shareBtn.dataset.tooltip = t("share.title");
  shareBtn.appendChild(icon("Share2"));
  shareBtn.addEventListener("click", () => {
    const m = getMeeting();
    if (!m) return;
    void showShareMeetingDialog({
      meetingId: m.id,
      password: loadPassword(m.id),
    });
  });
  header.querySelector(".header-actions")?.prepend(shareBtn);

  page.appendChild(header);

  const grid = document.createElement("main");
  grid.className = "meeting-grid";

  const left = document.createElement("section");
  left.className = "meeting-left";

  const pageTitle = document.createElement("h1");
  pageTitle.className = "sr-only";
  pageTitle.textContent = t("meeting.title", { id: meetingId });
  left.appendChild(pageTitle);

  // Speaks the row picked by the Ctrl+Arrow virtual focus, which only moves
  // a visual highlight; a blind host would otherwise act on an unheard row.
  const focusAnnouncer = document.createElement("div");
  focusAnnouncer.className = "sr-only";
  focusAnnouncer.setAttribute("role", "status");
  focusAnnouncer.setAttribute("aria-live", "polite");
  left.appendChild(focusAnnouncer);

  // meeting$ may still hold another meeting (deep link while a previous one
  // is loaded, or a late broadcast from it); never render that one here.
  const getMeeting = (): Meeting | null => {
    const m = meeting$.get();
    return m?.id === meetingId ? m : null;
  };
  const getMyId = (): string | null => myParticipantId$.get();
  const amIHost = (): boolean => {
    const m = getMeeting();
    const id = getMyId();
    return Boolean(id && m?.participants[id]?.isHost);
  };

  const confirmEnd = async (): Promise<void> => {
    const ok = await confirmDialog(t("meeting.endConfirm"), {
      okLabel: t("meeting.end"),
      danger: true,
    });
    if (ok) socket.emit("meeting:end");
  };

  const headerControls = document.createElement("div");
  headerControls.className = "header-controls";
  // The control set depends only on phase and host status; skip the rebuild
  // (and its focus save/restore) when neither changed on a state push.
  let lastHeaderKey: string | null = null;
  const refreshHeaderControls = () => {
    const m = getMeeting();
    const key = m ? `${m.phase}#${+amIHost()}` : "none";
    if (key === lastHeaderKey) return;
    lastHeaderKey = key;
    // Same focus dance as the lists: the rebuild on every state push would
    // otherwise drop keyboard focus the instant Start/Pause is pressed.
    // Start and Pause share one key so focus follows the phase swap.
    const active = document.activeElement as HTMLElement | null;
    const focusKey =
      active && headerControls.contains(active) ? active.dataset.focusKey : undefined;
    headerControls.innerHTML = "";
    if (!m || !amIHost()) return;
    const phase = m.phase;
    const start = headerBtn(
      "Play",
      phase === "paused" ? t("meeting.resume") : t("meeting.start"),
      "btn-success",
      () => socket.emit(phase === "paused" ? "meeting:resume" : "meeting:start")
    );
    start.dataset.focusKey = "phase";
    const pause = headerBtn("Pause", t("meeting.pause"), "btn-secondary", () =>
      socket.emit("meeting:pause")
    );
    pause.dataset.focusKey = "phase";
    const end = headerBtn("Square", t("meeting.end"), "btn-danger", () => void confirmEnd());
    end.dataset.focusKey = "end";
    if (phase === "ended") {
      start.disabled = true;
      end.disabled = true;
      headerControls.append(start, end);
    } else if (phase === "lobby") {
      headerControls.append(start, end);
    } else if (phase === "running") {
      headerControls.append(pause, end);
    } else if (phase === "paused") {
      headerControls.append(start, end);
    }
    if (focusKey) {
      headerControls.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`)?.focus();
    }
  };
  header.querySelector(".header-actions")?.before(headerControls);

  const connBanner = renderConnectionBanner();
  left.appendChild(connBanner.el);

  const handBanner = renderHandRaiseBanner({ getMeeting, socket, isHost: amIHost });
  left.appendChild(handBanner.el);

  const endedBanner = document.createElement("div");
  endedBanner.className = "ended-banner";
  endedBanner.hidden = true;
  endedBanner.setAttribute("role", "status");
  const endedTextWrap = document.createElement("div");
  endedTextWrap.className = "ended-banner-text";
  const endedText = document.createElement("span");
  endedText.textContent = t("meeting.ended");
  // The server wipes the meeting (and its notes) POST_END_GC_MS after the
  // end; without this line nothing tells the user the export is on a timer.
  const endedHint = document.createElement("span");
  endedHint.className = "ended-banner-hint";
  endedHint.textContent = t("meeting.endedGcHint");
  endedTextWrap.append(endedText, endedHint);
  const endedBtn = document.createElement("button");
  endedBtn.type = "button";
  endedBtn.className = "btn btn-on-accent";
  endedBtn.appendChild(icon("Home", { size: 16 }));
  const endedBtnLabel = document.createElement("span");
  endedBtnLabel.textContent = t("common.backHome");
  endedBtn.appendChild(endedBtnLabel);
  endedBtn.addEventListener("click", () => {
    // Drop the local trace (token + password) when the user explicitly
    // leaves; the server-side copy is GC'd by MeetingStore after POST_END_GC_MS.
    clearSession(meetingId);
    savePassword(meetingId, undefined);
    navigate("/");
  });
  endedBanner.append(endedTextWrap, endedBtn);
  left.appendChild(endedBanner);

  const meetingTimer = renderMeetingTimer(getMeeting);
  const spotlight = renderSpeakerSpotlight({ getMeeting });

  const topInfo = document.createElement("div");
  topInfo.className = "top-info";
  topInfo.append(spotlight.el, meetingTimer.el);
  left.appendChild(topInfo);

  const list = renderParticipantList({
    getMeeting,
    myId: getMyId,
    socket,
    onFocusChange: (id) => {
      const p = id ? getMeeting()?.participants[id] : undefined;
      if (p) focusAnnouncer.textContent = `${p.firstName} ${p.lastName}`;
    },
  });

  const listWrap = document.createElement("div");
  listWrap.className = "list-wrap";

  const listHeader = document.createElement("div");
  listHeader.className = "list-header";
  const heading = document.createElement("h3");
  heading.className = "list-title";
  heading.textContent = t("meeting.participants");
  const countBadge = document.createElement("span");
  countBadge.className = "list-count";
  heading.appendChild(countBadge);
  listHeader.appendChild(heading);

  const headerActions = document.createElement("div");
  headerActions.className = "list-header-actions";

  const handBtn = document.createElement("button");
  handBtn.type = "button";
  handBtn.className = "icon-btn list-header-icon-btn";
  handBtn.appendChild(icon("Hand", { size: 16 }));
  handBtn.addEventListener("click", () => toggleHand());
  const refreshHand = () => {
    const m = getMeeting();
    const id = getMyId();
    const me = id ? m?.participants[id] : undefined;
    const raised = Boolean(me?.handRaised);
    handBtn.dataset.raised = String(raised);
    handBtn.setAttribute("aria-label", raised ? t("meeting.lowerHand") : t("meeting.raiseHand"));
    handBtn.dataset.tooltip = raised ? t("meeting.lowerHand") : t("meeting.raiseHand");
    handBtn.disabled = m?.phase === "ended";
  };

  const timeboxBtn = document.createElement("button");
  timeboxBtn.type = "button";
  timeboxBtn.className = "icon-btn list-header-icon-btn";
  timeboxBtn.appendChild(icon("TimerReset", { size: 16 }));
  timeboxBtn.addEventListener("click", () => {
    const m = getMeeting();
    if (!m) return;
    if (!m.timeboxMs || m.timeboxMs <= 0) {
      toast(t("meeting.timeboxUnset"));
      return;
    }
    socket.emit("meeting:setTimeboxEnabled", { enabled: !m.timeboxEnabled });
  });
  const refreshTimeboxBtn = () => {
    const m = getMeeting();
    timeboxBtn.hidden = !amIHost();
    timeboxBtn.disabled = m?.phase === "ended";
    const enabled = Boolean(m?.timeboxEnabled);
    timeboxBtn.dataset.active = String(enabled);
    const label = !m?.timeboxMs
      ? t("meeting.timeboxUnset")
      : enabled
        ? t("meeting.timeboxDisable")
        : t("meeting.timeboxEnable");
    timeboxBtn.setAttribute("aria-label", label);
    timeboxBtn.dataset.tooltip = label;
  };

  const addParticipantBtn = document.createElement("button");
  addParticipantBtn.type = "button";
  addParticipantBtn.className = "icon-btn list-header-icon-btn";
  addParticipantBtn.setAttribute("aria-label", t("common.addParticipant"));
  addParticipantBtn.dataset.tooltip = t("common.addParticipant");
  addParticipantBtn.appendChild(icon("UserPlus", { size: 16 }));
  addParticipantBtn.addEventListener("click", () => openAddParticipantDialog());
  const refreshAddP = () => {
    addParticipantBtn.hidden = !amIHost();
    const m = getMeeting();
    addParticipantBtn.disabled = m?.phase === "ended";
    countBadge.textContent = m ? String(Object.keys(m.participants).length) : "";
  };

  headerActions.append(handBtn, timeboxBtn, addParticipantBtn);
  listHeader.appendChild(headerActions);

  // First-moment nudge: when the host is the only participant, point them at
  // the share dialog so inviting others is one click away.
  const inviteHint = document.createElement("div");
  inviteHint.className = "invite-hint";
  inviteHint.hidden = true;
  const inviteText = document.createElement("span");
  inviteText.textContent = t("meeting.inviteHint") + " ";
  const inviteCta = document.createElement("button");
  inviteCta.type = "button";
  inviteCta.className = "invite-hint-cta";
  inviteCta.textContent = t("meeting.inviteCta");
  inviteCta.addEventListener("click", () => {
    const m = getMeeting();
    if (!m) return;
    void showShareMeetingDialog({ meetingId: m.id, password: loadPassword(m.id) });
  });
  inviteHint.append(inviteText, inviteCta);
  const refreshInviteHint = () => {
    const m = getMeeting();
    const alone = Boolean(m) && Object.keys(m?.participants ?? {}).length === 1;
    inviteHint.hidden = !(amIHost() && m?.phase !== "ended" && alone);
  };

  listWrap.append(listHeader, list.el, inviteHint);
  left.appendChild(listWrap);

  const agenda = renderAgenda({
    getMeeting,
    socket,
    isHost: amIHost,
    onFocusChange: (label) => {
      focusAnnouncer.textContent = label;
    },
  });
  left.appendChild(agenda.el);

  grid.appendChild(left);

  const sess = loadSession(meetingId);
  const participantId = getMyId() ?? sess?.participantId ?? "";
  const token = sess?.token ?? "";

  let prevHandRaised = new Set<string>();
  let prevPhase: Meeting["phase"] | null = null;
  let lastNotesUser: string | null = null;

  // The notes editor (CodeMirror + Yjs + Shiki) is the heaviest module on this
  // route. Loading it dynamically keeps it out of the mobile path entirely:
  // phones render the lightweight MobileMeetingView above and never download
  // this chunk.
  let notes: NotesPanelHandle | null = null;
  // The page can be torn down (navigation, breakpoint rerender) before the
  // dynamic import below resolves; without this flag the late callback would
  // mount an editor whose Yjs WebSocket nothing ever closes.
  let tornDown = false;

  // Offered once, either on the ended transition or, if the meeting was
  // already over when the notes chunk finished loading, from the import
  // callback (otherwise that race would silently skip the prompt).
  const promptNotesExport = (): void => {
    if (exportPromptedFor.has(meetingId) || !notes?.hasContent()) return;
    exportPromptedFor.add(meetingId);
    void confirmDialog(t("meeting.exportNotesPrompt"), {
      okLabel: t("notes.exportNotes"),
      cancelLabel: t("common.later"),
    }).then((ok) => {
      if (ok) notes?.exportNow();
    });
  };
  // Pushes my name and the color the participant list uses for me into Yjs
  // awareness, so my remote cursor matches my row for everyone else. Both
  // can be unknown at render (reload before the first state push).
  const refreshNotesUser = (): void => {
    const m = getMeeting();
    const myId = getMyId();
    const me = myId ? m?.participants[myId] : undefined;
    if (!notes || !m || !me) return;
    const sorted = sortedParticipants(m);
    const idx = sorted.findIndex((p) => p.id === me.id);
    const name = `${me.firstName} ${me.lastName}`;
    const color = colorByPosition(idx, sorted.length, m.id);
    const key = `${name}|${color}`;
    if (key === lastNotesUser) return;
    lastNotesUser = key;
    notes.setUser(name, color);
  };
  void import("../components/NotesPanel.js").then(({ renderNotesPanel }) => {
    if (tornDown) return;
    notes = renderNotesPanel({
      getMeeting,
      meetingId,
      participantId,
      token,
      readOnly: !amIHost(),
    });
    grid.appendChild(notes.el);
    refreshNotesUser();
    if (getMeeting()?.phase === "ended") promptNotesExport();
  });

  page.appendChild(grid);
  root.appendChild(page);
  const unsubMeeting = meeting$.subscribe(() => {
    const m = getMeeting();
    list.update();
    handBanner.update();
    endedBanner.hidden = m?.phase !== "ended";
    agenda.update();
    spotlight.update();
    refreshHeaderControls();
    notes?.setReadOnly(!amIHost());
    refreshAddP();
    refreshHand();
    refreshTimeboxBtn();
    refreshInviteHint();
    if (!m) return;
    refreshNotesUser();

    const currentRaised = new Set<string>();
    for (const p of Object.values(m.participants)) if (p.handRaised) currentRaised.add(p.id);
    // The first state (reload, language switch, breakpoint re-render) only
    // records the baseline: hands raised before it are not new.
    for (const id of currentRaised) {
      if (prevPhase !== null && !prevHandRaised.has(id) && amIHost() && id !== getMyId()) {
        // Sound only: the hand banner is an aria-live region carrying the
        // same name, so a toast would announce the request twice.
        playHandRaise();
      }
    }
    prevHandRaised = currentRaised;

    // Fire end-of-meeting feedback once, on the transition into "ended".
    // No toast: the ended banner is a live region announcing the same thing.
    if (m.phase === "ended" && prevPhase !== null && prevPhase !== "ended") {
      playGong();
      // Wipe the password immediately; the token stays in localStorage for
      // a few more navigations (so the "Home" button still resolves) and is
      // cleared when the user actually leaves via the ended-banner CTA.
      savePassword(m.id, undefined);
      promptNotesExport();
    }
    prevPhase = m.phase;
  });

  // A single ticker drives every component so they all read the same
  // Date.now() value per frame. list.tick() is a lightweight chrono/fill
  // refresh that preserves hover, focus and in-progress drag (which the
  // full update() would clobber).
  const ticker = window.setInterval(() => {
    meetingTimer.tick();
    spotlight.update();
    list.tick();
    agenda.tick();
  }, 500);

  // Every binding uses a modifier + allowInEditable, so the same keys work
  // whether or not the host is typing in the notes editor (see keyboard.md).
  const unsubs: Array<() => void> = [];
  const shortcut = (
    key: string,
    handler: (e: KeyboardEvent) => void,
    opts: { shift?: boolean; ctrl?: boolean; alt?: boolean } = {}
  ): void => {
    const ctrl = opts.ctrl ?? !opts.alt;
    unsubs.push(
      registerShortcut({
        key,
        ctrl,
        shift: opts.shift,
        alt: opts.alt,
        allowInEditable: true,
        handler,
      })
    );
  };

  // Alt+Enter cycles start/resume/pause depending on current phase.
  shortcut(
    "Enter",
    (e) => {
      if (!amIHost()) return;
      const m = getMeeting();
      if (!m || m.phase === "ended") return;
      e.preventDefault();
      if (m.phase === "running") socket.emit("meeting:pause");
      else socket.emit("meeting:start");
    },
    { alt: true }
  );
  shortcut(
    "Backspace",
    async (e) => {
      if (!amIHost()) return;
      const m = getMeeting();
      if (!m || m.phase === "ended") return;
      e.preventDefault();
      await confirmEnd();
    },
    { alt: true }
  );
  shortcut("Enter", (e) => {
    if (!amIHost()) return;
    const m = getMeeting();
    if (!m || m.phase === "ended") return;
    e.preventDefault();
    if (m.currentSpeakerId) socket.emit("speaker:revoke");
    else {
      const focused = list.focusedId();
      if (focused) socket.emit("speaker:grant", { participantId: focused });
    }
  });
  shortcut("ArrowDown", (e) => {
    e.preventDefault();
    list.focusNext(1);
  });
  shortcut("ArrowUp", (e) => {
    e.preventDefault();
    list.focusNext(-1);
  });
  // Agenda uses Ctrl+Shift to avoid clashing with the notes editor where
  // Shift+Arrow extends the text selection.
  shortcut(
    "ArrowDown",
    (e) => {
      e.preventDefault();
      agenda.focusNext(1);
    },
    { shift: true }
  );
  shortcut(
    "ArrowUp",
    (e) => {
      e.preventDefault();
      agenda.focusNext(-1);
    },
    { shift: true }
  );
  shortcut(
    "Enter",
    (e) => {
      if (!amIHost()) return;
      const m = getMeeting();
      if (!m || m.phase === "ended") return;
      if (m.phase !== "running" && m.phase !== "paused") return;
      e.preventDefault();
      const focused = agenda.focusedId();
      if (!focused) return;
      const isActive = m.currentTopicId === focused;
      socket.emit("topic:setCurrent", { topicId: isActive ? null : focused });
    },
    { shift: true }
  );
  shortcut(
    "h",
    (e) => {
      if (getMeeting()?.phase === "ended") return;
      e.preventDefault();
      toggleHand();
    },
    { alt: true }
  );
  shortcut(
    "n",
    (e) => {
      e.preventDefault();
      notes?.toggleCollapsed();
    },
    { alt: true }
  );

  const toggleHand = (): void => {
    const m = getMeeting();
    const id = getMyId();
    if (!m || !id) return;
    const me = m.participants[id];
    if (!me) return;
    socket.emit(me.handRaised ? "hand:lower" : "hand:raise");
  };

  const openAddParticipantDialog = (): void => {
    addParticipantDialog().then((identity) => {
      if (!identity) return;
      // The server can refuse (participant cap, invalid identity); without
      // the ack the dialog closes and the failure is invisible.
      socket.emit("participant:add", { identity }, (resp) => {
        if (!resp.ok) toast(t(`errors.${resp.error}`), { type: "error" });
      });
    });
  };

  return () => {
    tornDown = true;
    socket.io.off("reconnect", onReconnect);
    mql.removeEventListener("change", onBreakpoint);
    notes?.destroy();
    unsubMeeting();
    muteBtn.destroy();
    connBanner.destroy();
    unsubLoader();
    clearInterval(ticker);
    for (const u of unsubs) u();
  };
}

function headerBtn(
  iconName: Parameters<typeof icon>[0],
  label: string,
  variantClass: string,
  onClick: () => void
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `btn ${variantClass} header-btn`;
  b.appendChild(icon(iconName, { size: 16 }));
  const span = document.createElement("span");
  span.textContent = label;
  b.appendChild(span);
  b.addEventListener("click", onClick);
  return b;
}
