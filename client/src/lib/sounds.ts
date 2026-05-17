import { Observable } from "../state/store.js";

export const muted$ = new Observable<boolean>(loadMuted());

function loadMuted(): boolean {
  try {
    return localStorage.getItem("mt:muted") === "1";
  } catch {
    return false;
  }
}

muted$.subscribe((m) => {
  try {
    localStorage.setItem("mt:muted", m ? "1" : "0");
  } catch {
    /* ignore */
  }
});

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (muted$.get()) return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  // Some browsers leave AudioContext suspended until a user gesture.
  if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
  return ctx;
}

type Tone = { freq: number; durationMs: number; type?: OscillatorType; gain?: number; freqEnd?: number };

function play(tones: Tone[]): void {
  const ac = audio();
  if (!ac) return;
  let when = ac.currentTime;
  for (const tone of tones) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = tone.type ?? "sine";
    osc.frequency.setValueAtTime(tone.freq, when);
    if (tone.freqEnd) osc.frequency.exponentialRampToValueAtTime(tone.freqEnd, when + tone.durationMs / 1000);
    const peak = tone.gain ?? 0.15;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + tone.durationMs / 1000);
    osc.connect(gain).connect(ac.destination);
    osc.start(when);
    osc.stop(when + tone.durationMs / 1000 + 0.02);
    when += tone.durationMs / 1000;
  }
}

export function playHandRaise(): void {
  play([{ freq: 880, durationMs: 120, type: "sine" }, { freq: 1320, durationMs: 120, type: "sine" }]);
}

export function playGrant(): void {
  play([{ freq: 440, durationMs: 180, type: "triangle" }]);
}

export function playTimeboxWarn(): void {
  play([
    { freq: 330, durationMs: 90, type: "square", gain: 0.1 },
    { freq: 220, durationMs: 90, type: "square", gain: 0.1 },
  ]);
}

// Discreet pre-warning at ~80% of the timebox; softer than playTimeboxWarn
// so it doesn't interrupt the speaker.
export function playTimeboxNearLimit(): void {
  play([{ freq: 660, durationMs: 80, type: "sine", gain: 0.07 }]);
}

// Quiet countdown tick for the last few seconds of the per-speaker timebox.
export function playTimeboxTick(): void {
  play([{ freq: 880, durationMs: 50, type: "sine", gain: 0.06 }]);
}

export function playGong(): void {
  play([{ freq: 220, freqEnd: 80, durationMs: 700, type: "sine", gain: 0.18 }]);
}

export function toggleMute(): void {
  muted$.set(!muted$.get());
}
