import type { Meeting } from "@meetingtime/shared";
import type { MeetingSocket } from "../state/socket.js";
import { meeting$, myParticipantId$, connection$ } from "../state/socket.js";
import { clearSession, savePassword } from "../state/session.js";
import { renderSpeakerSpotlight } from "./SpeakerSpotlight.js";
import { renderMeetingTimer } from "./MeetingTimer.js";
import { renderLocaleSwitcher } from "./LocaleSwitcher.js";
import { renderThemeToggle } from "./ThemeToggle.js";
import { icon } from "./Icon.js";
import { formatMs } from "../lib/format.js";
import { muted$, toggleMute } from "../lib/sounds.js";
import { vibrationEnabled$, toggleVibration, vibrate, hapticsSupported } from "../lib/haptics.js";
import { t } from "../i18n/index.js";

// Focused participant screen for phones: the topic under discussion, the
// current speaker, the overall meeting timer, plus a big take/release-the-floor
// button and a raise-hand button. Read-only beyond those two actions: no agenda
// editing, no participant list, no notes editor (CodeMirror never loads here).
// The host dashboard stays on large screens; see MeetingPage's breakpoint
// branch.
export function renderMobileMeeting(
  root: HTMLElement,
  meetingId: string,
  socket: MeetingSocket
): () => void {
  const getMeeting = (): Meeting | null => meeting$.get();
  const getMyId = (): string | null => myParticipantId$.get();
  let connected = true;
  let cleanedUp = false;

  const page = document.createElement("main");
  page.className = "page page-meeting page-meeting-mobile";

  // Minimal header: brand as plain text (no home link), plus language and
  // theme switchers. No home/help buttons, they are pointless mid-meeting.
  const header = document.createElement("header");
  header.className = "app-header mobile-header";
  const brand = document.createElement("span");
  brand.className = "brand";
  brand.textContent = t("app.name");
  // Mute toggle: the spotlight plays timebox cues on mobile too, so give the
  // participant the same control as the desktop header.
  const muteBtn = document.createElement("button");
  muteBtn.type = "button";
  muteBtn.className = "icon-btn";
  muteBtn.setAttribute("aria-label", t("a11y.muteToggle"));
  muteBtn.title = t("a11y.muteToggle");
  const refreshMute = (): void => {
    muteBtn.replaceChildren(icon(muted$.get() ? "VolumeX" : "Volume2"));
  };
  const unsubMute = muted$.subscribe(refreshMute);
  muteBtn.addEventListener("click", toggleMute);

  // Vibration toggle, next to mute. Only on devices that can actually vibrate.
  let unsubVibration: (() => void) | undefined;
  const vibrationBtn = document.createElement("button");
  if (hapticsSupported()) {
    vibrationBtn.type = "button";
    vibrationBtn.className = "icon-btn";
    vibrationBtn.setAttribute("aria-label", t("a11y.vibrationToggle"));
    vibrationBtn.title = t("a11y.vibrationToggle");
    const refreshVibration = (): void => {
      vibrationBtn.replaceChildren(icon(vibrationEnabled$.get() ? "Vibrate" : "VibrateOff"));
    };
    unsubVibration = vibrationEnabled$.subscribe(refreshVibration);
    vibrationBtn.addEventListener("click", toggleVibration);
  }

  const headerActions = document.createElement("div");
  headerActions.className = "header-actions";
  if (hapticsSupported()) headerActions.append(vibrationBtn);
  headerActions.append(muteBtn, renderLocaleSwitcher(), renderThemeToggle());
  header.append(brand, headerActions);
  page.appendChild(header);

  const wrap = document.createElement("div");
  wrap.className = "mobile-meeting";

  const connBanner = document.createElement("div");
  connBanner.className = "connection-banner";
  connBanner.setAttribute("role", "status");
  connBanner.setAttribute("aria-live", "polite");
  connBanner.hidden = true;
  const connIcon = icon("CloudOff", { size: 16 });
  const connText = document.createElement("span");
  connBanner.append(connIcon, connText);
  wrap.appendChild(connBanner);

  const endedBanner = document.createElement("div");
  endedBanner.className = "ended-banner";
  endedBanner.hidden = true;
  endedBanner.setAttribute("role", "status");
  const endedText = document.createElement("span");
  endedText.textContent = t("meeting.ended");
  // No "back home" on mobile: the home and setup pages aren't built for phones,
  // so just invite the participant to close the page. Local credentials are
  // wiped when the meeting ends (see refresh()).
  const endedHint = document.createElement("span");
  endedHint.textContent = t("meeting.closePageHint");
  endedBanner.append(endedText, endedHint);
  wrap.appendChild(endedBanner);

  // The stage centres the current speaker and the current topic in the space
  // between the top meeting timer and the bottom actions.
  const stage = document.createElement("div");
  stage.className = "mobile-stage";

  const topicEl = document.createElement("div");
  topicEl.className = "mobile-topic";
  topicEl.hidden = true;
  // Label and time share the top line (both small); the topic name sits on its
  // own line below so a long title wraps instead of breaking the layout.
  const topicHead = document.createElement("div");
  topicHead.className = "mobile-topic-head";
  const topicLabel = document.createElement("span");
  topicLabel.className = "mobile-topic-label";
  topicLabel.textContent = t("meeting.currentTopic");
  const topicTime = document.createElement("span");
  topicTime.className = "mobile-topic-time";
  topicHead.append(topicLabel, topicTime);
  const topicName = document.createElement("span");
  topicName.className = "mobile-topic-name";
  topicEl.append(topicHead, topicName);

  // Overall meeting timer pinned to the top, above the centred stage.
  const meetingTimer = renderMeetingTimer(getMeeting);
  wrap.appendChild(meetingTimer.el);

  const spotlight = renderSpeakerSpotlight({ getMeeting });
  stage.append(spotlight.el, topicEl);
  wrap.appendChild(stage);

  const topicDisplayMs = (m: Meeting, topicId: string): number => {
    const topic = m.topics.find((x) => x.id === topicId);
    if (!topic) return 0;
    const live =
      m.currentTopicId === topicId && m.currentTopicStartedAt && m.phase === "running"
        ? Date.now() - m.currentTopicStartedAt
        : 0;
    return topic.totalMs + live;
  };
  const updateTopic = (): void => {
    const m = getMeeting();
    const topic = m?.currentTopicId ? m.topics.find((x) => x.id === m.currentTopicId) : undefined;
    if (!m || !topic) {
      topicEl.hidden = true;
      return;
    }
    topicEl.hidden = false;
    topicName.textContent = topic.label;
    topicTime.textContent = formatMs(topicDisplayMs(m, topic.id));
  };

  const actions = document.createElement("div");
  actions.className = "mobile-actions";

  // Take / release the floor (speaker:claim / speaker:release). Reused server
  // side: grantSpeaker/revokeSpeaker keep the speaking-time accounting correct.
  const claimBtn = document.createElement("button");
  claimBtn.type = "button";
  claimBtn.className = "btn mobile-claim-btn";
  // Icon mirrors the desktop participant row: Speech to take the floor, Square
  // to release it. Set in refresh() since it depends on who holds the floor.
  const claimIconSlot = document.createElement("span");
  claimIconSlot.className = "mobile-claim-icon";
  const claimLabel = document.createElement("span");
  claimBtn.append(claimIconSlot, claimLabel);
  claimBtn.addEventListener("click", () => {
    const m = getMeeting();
    const id = getMyId();
    if (!m || !id) return;
    socket.emit(m.currentSpeakerId === id ? "speaker:release" : "speaker:claim");
    // Light haptic confirmation on supporting phones.
    vibrate(30);
  });

  const handBtn = document.createElement("button");
  handBtn.type = "button";
  handBtn.className = "btn mobile-hand-btn";
  const handIcon = icon("Hand", { size: 28 });
  const handLabel = document.createElement("span");
  handBtn.append(handIcon, handLabel);
  handBtn.addEventListener("click", () => {
    const m = getMeeting();
    const id = getMyId();
    if (!m || !id) return;
    const me = m.participants[id];
    if (!me) return;
    socket.emit(me.handRaised ? "hand:lower" : "hand:raise");
  });

  actions.append(claimBtn, handBtn);
  wrap.appendChild(actions);

  page.appendChild(wrap);
  root.appendChild(page);

  const refresh = (): void => {
    const m = getMeeting();
    const id = getMyId();
    const phase = m?.phase;
    const ended = phase === "ended";
    endedBanner.hidden = !ended;
    // Once the meeting ends there is nothing more to do on this page, so drop
    // the stored token and password (the desktop "Home" button did this).
    if (ended && !cleanedUp) {
      cleanedUp = true;
      clearSession(meetingId);
      savePassword(meetingId, undefined);
    }

    const floorActive = phase === "running" || phase === "paused";
    const iAmSpeaker = Boolean(id && m?.currentSpeakerId === id);
    claimBtn.dataset.active = String(iAmSpeaker);
    claimIconSlot.replaceChildren(icon(iAmSpeaker ? "Square" : "Speech", { size: 36 }));
    // Spell out why the button is inert before the meeting starts or once it
    // has ended, instead of just greying it out.
    let claimText: string;
    if (floorActive) {
      claimText = iAmSpeaker ? t("meeting.releaseFloor") : t("meeting.takeFloor");
    } else if (ended) {
      claimText = t("meeting.ended");
    } else {
      claimText = t("meeting.floorWaiting");
    }
    claimLabel.textContent = claimText;
    claimBtn.setAttribute("aria-label", claimText);
    // A dropped connection silently queues emits, so grey the actions out
    // rather than letting a tap look like it worked.
    claimBtn.disabled = !floorActive || !connected;

    const me = id ? m?.participants[id] : undefined;
    const raised = Boolean(me?.handRaised);
    handBtn.dataset.raised = String(raised);
    const handText = raised ? t("meeting.lowerHand") : t("meeting.raiseHand");
    handLabel.textContent = handText;
    handBtn.setAttribute("aria-label", handText);
    handBtn.disabled = ended || !connected;
  };

  // When the local participant holds the floor past the timebox, nudge them on
  // their own device: the button turns red/pulses and buzzes once.
  let turnOverAlerted = false;
  const updateClaimAlert = (): void => {
    const m = getMeeting();
    const id = getMyId();
    const iAmSpeaker = Boolean(m && id && m.currentSpeakerId === id);
    const over =
      iAmSpeaker &&
      Boolean(
        m &&
          m.timeboxEnabled &&
          m.timeboxMs &&
          m.timeboxMs > 0 &&
          m.currentSpeakerStartedAt &&
          m.phase === "running" &&
          Date.now() - m.currentSpeakerStartedAt >= m.timeboxMs
      );
    claimBtn.dataset.over = String(over);
    if (over && !turnOverAlerted) {
      turnOverAlerted = true;
      vibrate([100, 50, 100]);
    } else if (!over) {
      turnOverAlerted = false;
    }
  };

  const unsubConn = connection$.subscribe((status) => {
    connected = status === "connected";
    connBanner.dataset.status = status;
    if (connected) {
      connBanner.hidden = true;
    } else {
      connBanner.hidden = false;
      connText.textContent =
        status === "reconnecting" ? t("meeting.connReconnecting") : t("meeting.connDisconnected");
    }
    refresh();
  });

  const unsubMeeting = meeting$.subscribe(() => {
    spotlight.update();
    updateTopic();
    refresh();
    updateClaimAlert();
  });

  // Single ticker, like MeetingPage, so the speaker chrono, timebox bar and
  // topic time advance every half second. The global timer self-ticks.
  const ticker = window.setInterval(() => {
    spotlight.update();
    updateTopic();
    updateClaimAlert();
  }, 500);

  refresh();
  updateTopic();
  updateClaimAlert();

  // Keep the phone awake while the meeting is on screen: a timer you glance at
  // shouldn't dim out. The lock is dropped when the tab is hidden, so re-acquire
  // when it becomes visible again. Silently a no-op on browsers without the API
  // or outside a secure context.
  let wakeLock: WakeLockSentinel | null = null;
  const requestWakeLock = async (): Promise<void> => {
    if (!("wakeLock" in navigator) || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    } catch {
      /* unsupported, denied, or non-secure context: ignore */
    }
  };
  const onVisibility = (): void => {
    if (document.visibilityState === "visible") void requestWakeLock();
  };
  void requestWakeLock();
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    spotlight.stop();
    meetingTimer.stop();
    unsubMeeting();
    unsubConn();
    unsubMute();
    unsubVibration?.();
    clearInterval(ticker);
    document.removeEventListener("visibilitychange", onVisibility);
    void wakeLock?.release();
    wakeLock = null;
  };
}
