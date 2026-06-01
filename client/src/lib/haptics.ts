import { Observable } from "../state/store.js";

// Mobile-only haptic feedback (take/release the floor, timebox overrun). On by
// default; the preference is shared across the app and persisted, mirroring the
// mute toggle in lib/sounds.ts.
export const vibrationEnabled$ = new Observable<boolean>(loadVibration());

function loadVibration(): boolean {
  try {
    return localStorage.getItem("mt:vibration") !== "0";
  } catch {
    return true;
  }
}

vibrationEnabled$.subscribe((on) => {
  try {
    localStorage.setItem("mt:vibration", on ? "1" : "0");
  } catch {
    /* ignore */
  }
});

// True only where the Vibration API exists (essentially phones), so callers can
// hide the toggle on devices that can't vibrate.
export function hapticsSupported(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

export function vibrate(pattern: number | number[]): void {
  if (!vibrationEnabled$.get()) return;
  navigator.vibrate?.(pattern);
}

export function toggleVibration(): void {
  vibrationEnabled$.set(!vibrationEnabled$.get());
}
