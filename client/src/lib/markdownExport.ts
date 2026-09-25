import type { Meeting } from "@meetingtime/shared";
import { formatDateYMDCompact, formatMs, formatTime, formatPercent } from "./format.js";
import { meetingElapsedMs, speakingDisplayMs, topicDisplayMs } from "./liveTime.js";
import { downloadFile } from "./download.js";
import { locale$, t } from "../i18n/index.js";

// Filename pattern: YYYYMMDD_Meetingtime_<id-with-underscores>.md so files
// from different meetings sort chronologically in any file browser.
export function exportNotes(meeting: Meeting, notesBody: string): void {
  const md = buildMarkdown(meeting, notesBody);
  const ymd = formatDateYMDCompact(meeting.startedAt ?? meeting.createdAt);
  const idSafe = meeting.id.replace(/-/g, "_");
  downloadFile(`${ymd}_Meetingtime_${idSafe}.md`, md, "text/markdown;charset=utf-8");
}

function buildMarkdown(meeting: Meeting, notesBody: string): string {
  const lines: string[] = [];
  const startedAt = meeting.startedAt ?? meeting.createdAt;
  const endedAt = meeting.endedAt ?? Date.now();
  const total = meetingElapsedMs(meeting);
  // Month spelled out: 04/09 reads as April 9 in the US and September 4 in Europe.
  const date = new Intl.DateTimeFormat(locale$.get(), { dateStyle: "long" }).format(startedAt);

  lines.push(`# ${t("export.title", { date })}`);
  lines.push("");
  if (meeting.startedAt) {
    lines.push(`- ${field("export.startedAt", formatTime(meeting.startedAt))}`);
    lines.push(`- ${field("export.endedAt", formatTime(endedAt))}`);
    lines.push(`- ${field("export.duration", formatMs(total))}`);
  } else {
    lines.push(`- ${field("export.createdAt", formatTime(meeting.createdAt))}`);
  }
  lines.push("");

  // Includes the live segment, so an export mid-meeting counts the current
  // speaker's ongoing turn and the running topic.
  const speaking = new Map(
    Object.values(meeting.participants).map((p) => [p, speakingDisplayMs(meeting, p)])
  );
  const totalSpeaking = [...speaking.values()].reduce((acc, ms) => acc + ms, 0);

  lines.push(`## ${t("export.participantsHeading")}`);
  lines.push("");
  lines.push(
    `| ${t("export.colParticipant")} | ${t("export.colRole")} | ${t("export.colSpeakingTime")} |`
  );
  lines.push("| --- | --- | --- |");
  for (const [p, ms] of [...speaking].sort((a, b) => b[1] - a[1])) {
    const ratio = totalSpeaking > 0 ? ms / totalSpeaking : 0;
    lines.push(
      `| ${escapePipe(p.firstName + " " + p.lastName)} | ${escapePipe(p.role)} | ${formatMs(ms)} (${formatPercent(ratio)}) |`
    );
  }
  lines.push("");

  if (meeting.topics.length > 0) {
    lines.push(`## ${t("export.topicsHeading")}`);
    lines.push("");
    lines.push(`| ${t("export.colTopic")} | ${t("export.colDuration")} |`);
    lines.push("| --- | --- |");
    for (const topic of meeting.topics) {
      lines.push(`| ${escapePipe(topic.label)} | ${formatMs(topicDisplayMs(meeting, topic.id))} |`);
    }
    lines.push("");
  }

  const trimmed = notesBody.trim();
  if (trimmed) {
    lines.push(`## ${t("export.notesHeading")}`);
    lines.push("");
    lines.push(trimmed);
    lines.push("");
  }

  return lines.join("\n");
}

// The label/value separator is locale-specific ("Durée : 10:00" in French,
// "Duration: 10:00" elsewhere), so it lives in the catalogue.
function field(labelKey: string, value: string): string {
  return t("export.field", { label: t(labelKey), value });
}

// A line break (possible in an imported topic) would end the table row.
function escapePipe(s: string): string {
  return s.replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|");
}
