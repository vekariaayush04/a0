// Step timeline: a single horizontally scrollable strip of chips, one per log
// entry, each carrying its tool icon and duration. Clicking a chip scrolls the
// matching Log row into view. The last chip pulses while the run is live.
//
// A strip rather than a wrapping cloud: the run reads left to right as a
// sequence, and the detail pane keeps a fixed header height whatever the run.

import { memo } from "react";
import { AlertTriangle, MessageSquare } from "lucide-react";

import type { Run } from "@/api/types";
import {
  durationBetween,
  firstLine,
  isTerminal,
  logDomId,
  type LogEntry,
} from "@/features/runs/derive";
import { LiveDot, toolIcon } from "@/features/runs/status";
import { fmtMs } from "@/lib/format";
import { cn } from "@/lib/utils";

function chipLabel(entry: LogEntry): string {
  if (entry.kind === "assistant") return firstLine(entry.text, 36) || "message";
  if (entry.kind === "error") return firstLine(entry.text, 32) || "error";
  return entry.target ? `${entry.name} ${entry.target}` : entry.name;
}

function chipTitle(entry: LogEntry): string {
  if (entry.kind === "assistant" || entry.kind === "error") return entry.text;
  const parts = [entry.name, entry.target].filter(Boolean).join(" ");
  return entry.isError ? `${parts} (error)` : parts;
}

function scrollToLog(id: string): void {
  document
    .getElementById(logDomId(id))
    ?.scrollIntoView({ block: "center", behavior: "smooth" });
}

export type TimelineProps = {
  entries: LogEntry[];
  run: Run | null;
  /** Bumped by the parent as entries fold in; `entries` is a stable buffer. */
  version?: number;
};

export const Timeline = memo(function Timeline({ entries, run }: TimelineProps) {
  if (!run || entries.length === 0) return null;

  const terminal = isTerminal(run.status);
  const running = run.status === "running";

  return (
    <div className="relative shrink-0 border-b border-border">
      {/* The strip scrolls; the mask makes a clipped last chip read as more
          content rather than as a rendering bug. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent"
      />
      <div className="flex items-center gap-1.5 overflow-x-auto px-5 py-2.5 [scrollbar-width:thin]">
        {entries.map((entry, index) => {
          const isLast = index === entries.length - 1;
          const duration =
            entry.kind === "tool" ? durationBetween(entry.startTs, entry.endTs) : null;
          const unresolved =
            entry.kind === "tool" && entry.startTs !== null && entry.endTs === null;
          const failed =
            entry.kind === "error" ||
            (entry.kind === "tool" && (entry.isError || (unresolved && terminal)));
          const Icon =
            entry.kind === "tool"
              ? toolIcon(entry.name)
              : entry.kind === "error"
                ? AlertTriangle
                : MessageSquare;

          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => scrollToLog(entry.id)}
              title={unresolved ? `${chipTitle(entry)} — no result recorded` : chipTitle(entry)}
              className={cn(
                "inline-flex h-7 max-w-[15rem] shrink-0 items-center gap-1.5 rounded-md border px-2",
                "font-mono text-10 transition-colors duration-150",
                failed
                  ? "border-foreground/30 bg-card text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground",
              )}
            >
              {isLast && running && !failed ? (
                <LiveDot />
              ) : (
                <Icon className="h-3 w-3 shrink-0" />
              )}
              <span className="truncate">{chipLabel(entry)}</span>
              {duration !== null ? (
                <span className="shrink-0 tabular-nums text-muted-foreground/70">
                  {fmtMs(duration)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
});
