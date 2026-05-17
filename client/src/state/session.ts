export interface Session {
  meetingId: string;
  participantId: string;
  token: string;
}

const KEY = (meetingId: string) => `mt:session:${meetingId}`;

export function saveSession(s: Session): void {
  try {
    localStorage.setItem(KEY(s.meetingId), JSON.stringify(s));
  } catch {
    /* localStorage unavailable */
  }
}

export function loadSession(meetingId: string): Session | undefined {
  try {
    const raw = localStorage.getItem(KEY(meetingId));
    if (!raw) return undefined;
    return JSON.parse(raw) as Session;
  } catch {
    return undefined;
  }
}

export function clearSession(meetingId: string): void {
  try {
    localStorage.removeItem(KEY(meetingId));
  } catch {
    /* noop */
  }
}

// Password lives in sessionStorage on purpose: available to the share dialog
// during the tab's lifetime, never written to disk.
const PWD_KEY = (meetingId: string): string => `mt:pwd:${meetingId}`;

export function savePassword(meetingId: string, password: string | undefined): void {
  try {
    if (password) sessionStorage.setItem(PWD_KEY(meetingId), password);
    else sessionStorage.removeItem(PWD_KEY(meetingId));
  } catch {
    /* sessionStorage unavailable */
  }
}

export function loadPassword(meetingId: string): string | undefined {
  try {
    return sessionStorage.getItem(PWD_KEY(meetingId)) ?? undefined;
  } catch {
    return undefined;
  }
}
