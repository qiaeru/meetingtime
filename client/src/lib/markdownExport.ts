import type { Meeting } from "@meetingtime/shared";
import { formatDateDMY, formatDateYMDCompact, formatMs, formatTime, formatPercent } from "./format.js";
import { t } from "../i18n/index.js";

// Filename pattern: YYYYMMDD_Meetingtime_<id-with-underscores>.md so files
// from different meetings sort chronologically in any file browser.
export function exportNotes(meeting: Meeting, notesBody: string): void {
  const md = buildMarkdown(meeting, notesBody);
  const ymd = formatDateYMDCompact(meeting.startedAt ?? meeting.createdAt);
  const idSafe = meeting.id.replace(/-/g, "_");
  const filename = `${ymd}_Meetingtime_${idSafe}.md`;
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dateSlash(ts: number): string {
  return formatDateDMY(ts).replace(/-/g, "/");
}

export function buildMarkdown(meeting: Meeting, notesBody: string): string {
  const lines: string[] = [];
  const startedAt = meeting.startedAt ?? meeting.createdAt;
  const endedAt = meeting.endedAt ?? Date.now();
  const total = meeting.startedAt ? endedAt - meeting.startedAt - meeting.pauseAccumulatedMs : 0;

  lines.push(`# ${t("export.title", { date: dateSlash(startedAt) })}`);
  lines.push("");
  if (meeting.startedAt) {
    lines.push(`- ${t("export.startedAt")} : ${formatTime(meeting.startedAt)}`);
    lines.push(`- ${t("export.endedAt")} : ${formatTime(endedAt)}`);
    lines.push(`- ${t("export.duration")} : ${formatMs(total)}`);
  } else {
    lines.push(`- ${t("export.createdAt")} : ${formatTime(meeting.createdAt)}`);
  }
  lines.push("");

  const totalSpeaking = Object.values(meeting.participants).reduce(
    (acc, p) => acc + p.totalSpeakingMs,
    0
  );

  lines.push(`## ${t("export.participantsHeading")}`);
  lines.push("");
  lines.push(`| ${t("export.colParticipant")} | ${t("export.colRole")} | ${t("export.colSpeakingTime")} |`);
  lines.push("|---|---|---|");
  for (const p of Object.values(meeting.participants).sort(
    (a, b) => b.totalSpeakingMs - a.totalSpeakingMs
  )) {
    const ratio = totalSpeaking > 0 ? p.totalSpeakingMs / totalSpeaking : 0;
    lines.push(
      `| ${escapePipe(p.firstName + " " + p.lastName)} | ${escapePipe(p.role)} | ${formatMs(p.totalSpeakingMs)} (${formatPercent(ratio)}) |`
    );
  }
  lines.push("");

  if (meeting.topics.length > 0) {
    lines.push(`## ${t("export.topicsHeading")}`);
    lines.push("");
    lines.push(`| ${t("export.colTopic")} | ${t("export.colDuration")} |`);
    lines.push("|---|---|");
    for (const topic of meeting.topics) {
      lines.push(`| ${escapePipe(topic.label)} | ${formatMs(topic.totalMs)} |`);
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

function escapePipe(s: string): string {
  return s.replace(/\|/g, "\\|");
}
