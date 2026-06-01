// Socket.IO wire contracts. The string keys are canonical: renaming any of
// them is a breaking change for every connected client mid-rollout.
import type { Meeting, MeetingSummary, MeetingPhase, ParticipantIdentity, Topic } from "./models.js";


export interface ClientToServerEvents {
  "meeting:create": (
    payload: {
      host: ParticipantIdentity;
      initialParticipants?: ParticipantIdentity[];
      topics?: string[];
      timeboxMs?: number;
      plannedDurationMs?: number;
      password?: string;
    },
    ack: (response: AckCreate) => void
  ) => void;

  "meeting:join": (
    payload:
      | { meetingId: string; identity: ParticipantIdentity; password?: string }
      | { meetingId: string; token: string },
    ack: (response: AckJoin) => void
  ) => void;

  "meeting:start": (ack?: AckSimple) => void;
  "meeting:pause": (ack?: AckSimple) => void;
  "meeting:resume": (ack?: AckSimple) => void;
  "meeting:end": (ack?: AckSimple) => void;
  "meeting:setTimebox": (payload: { timeboxMs?: number }, ack?: AckSimple) => void;
  "meeting:setTimeboxEnabled": (payload: { enabled: boolean }, ack?: AckSimple) => void;

  "participant:add": (payload: { identity: ParticipantIdentity }, ack?: AckSimple) => void;
  "participant:remove": (payload: { participantId: string }, ack?: AckSimple) => void;
  "participant:reorder": (
    payload: { participantId: string; direction: "up" | "down" },
    ack?: AckSimple
  ) => void;

  "host:promote": (payload: { participantId: string }, ack?: AckSimple) => void;
  "host:demote": (payload: { participantId: string }, ack?: AckSimple) => void;

  "hand:raise": (ack?: AckSimple) => void;
  "hand:lower": (ack?: AckSimple) => void;

  "speaker:grant": (payload: { participantId: string }, ack?: AckSimple) => void;
  "speaker:revoke": (ack?: AckSimple) => void;
  // Participant-driven floor: a participant takes the floor for themselves and
  // releases it. Unlike speaker:grant/revoke these are not host-gated.
  "speaker:claim": (ack?: AckSimple) => void;
  "speaker:release": (ack?: AckSimple) => void;

  "topic:add": (payload: { label: string }, ack?: AckSimple) => void;
  "topic:remove": (payload: { topicId: string }, ack?: AckSimple) => void;
  "topic:setCurrent": (payload: { topicId: string | null }, ack?: AckSimple) => void;
  "topic:reorder": (payload: { topicId: string; direction: "up" | "down" }, ack?: AckSimple) => void;
}

export interface ServerToClientEvents {
  "meeting:state": (state: Meeting) => void;
  "meeting:phaseChanged": (payload: { phase: MeetingPhase }) => void;
  "meeting:ended": (payload: { summary: MeetingSummary }) => void;

  "participant:joined": (payload: { participantId: string }) => void;
  "participant:left": (payload: { participantId: string }) => void;

  "host:changed": (payload: { participantId: string; isHost: boolean }) => void;

  "hand:raised": (payload: { participantId: string }) => void;
  "hand:lowered": (payload: { participantId: string }) => void;

  "speaker:changed": (payload: { participantId: string | null; startedAt?: number }) => void;

  "topic:changed": (payload: { topics: Topic[]; currentTopicId?: string }) => void;

  "error:msg": (payload: { code: string; message: string }) => void;
}

export type AckSimple = (response: { ok: true } | { ok: false; error: string }) => void;

export type AckCreate =
  | { ok: true; meetingId: string; participantId: string; token: string; meeting: Meeting }
  | { ok: false; error: string };

export type AckJoin =
  | { ok: true; meetingId: string; participantId: string; token: string; meeting: Meeting }
  | { ok: false; error: string };

export interface SocketAuth {
  token?: string;
  meetingId?: string;
}
