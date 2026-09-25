import type { Meeting, Participant } from "@meetingtime/shared";

// The server only banks elapsed time on transitions; while the meeting runs,
// the segment since the current start timestamp has to be added on read.

export function speakingDisplayMs(m: Meeting, p: Participant): number {
  const live =
    m.currentSpeakerId === p.id && m.currentSpeakerStartedAt && m.phase === "running"
      ? Date.now() - m.currentSpeakerStartedAt
      : 0;
  return p.totalSpeakingMs + live;
}

export function topicDisplayMs(m: Meeting, topicId: string): number {
  const topic = m.topics.find((x) => x.id === topicId);
  if (!topic) return 0;
  const live =
    m.currentTopicId === topicId && m.currentTopicStartedAt && m.phase === "running"
      ? Date.now() - m.currentTopicStartedAt
      : 0;
  return topic.totalMs + live;
}
