// Step timeline: wrapping chips derived from the event stream. Chips scroll
// the matching Log row into view; the final chip pulses while the run is live.
// Entries are derived once in the RunDetail parent and passed in.

import { memo } from "react";
import type { Run } from "../../api/types";
import { fmtMs } from "../../lib/format";
import { Glyph } from "../../ui/Glyph";
import {
  durationBetween,
  firstLine,
  isTerminal,
  logDomId,
  type LogEntry,
} from "./derive";

function chipText(entry: LogEntry): string {
  if (entry.kind === "assistant") return `✎ ${firstLine(entry.text, 48)}`;
  if (entry.kind === "error") return `error ${firstLine(entry.text, 40)}`;
  return `${entry.name}${entry.target ? ` ${entry.target}` : ""}`;
}

function chipTitle(entry: LogEntry): string {
  if (entry.kind === "assistant") return entry.text;
  if (entry.kind === "error") return entry.text;
  const parts = [entry.name, entry.target].filter(Boolean).join(" ");
  return entry.isError ? `${parts} (error)` : parts;
}

function scrollToLog(id: string): void {
  const element = document.getElementById(logDomId(id));
  element?.scrollIntoView({ block: "center", behavior: "smooth" });
}

export type TimelineProps = {
  entries: LogEntry[];
  run: Run | null;
  // Bumped by the parent as entries are folded in. The entries array is a
  // stable mutable buffer, so memo needs this to know it changed.
  version?: number;
};

export const Timeline = memo(function Timeline({ entries, run }: TimelineProps) {
  if (!run || entries.length === 0) return null;

  const terminal = isTerminal(run.status);
  const running = run.status === "running";

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5">
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        const duration =
          entry.kind === "tool"
            ? durationBetween(entry.startTs, entry.endTs)
            : null;
        const unresolved =
          entry.kind === "tool" &&
          entry.startTs !== null &&
          entry.endTs === null;
        const failed =
          entry.kind === "error" ||
          (entry.kind === "tool" &&
            (entry.isError || (unresolved && terminal)));
        const title = unresolved
          ? `${chipTitle(entry)} — no result recorded`
          : chipTitle(entry);

        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => scrollToLog(entry.id)}
            title={title}
            className={`inline-flex h-[26px] max-w-[240px] items-center gap-1.5 rounded-full border border-line px-2 font-mono text-11 transition-colors duration-150 hover:bg-hover ${
              failed ? "text-fg" : "text-fg2"
            }`}
          >
            {failed ? <Glyph status="failed" size={10} /> : null}
            {isLast && running && !failed ? (
              <span className="pulse h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            ) : null}
            <span className="truncate">{chipText(entry)}</span>
            {duration !== null ? (
              <span className="shrink-0 text-fg3">· {fmtMs(duration)}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
});
