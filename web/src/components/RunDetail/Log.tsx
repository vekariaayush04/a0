// Live run log: assistant text, expandable tool rows and error blocks. New
// entries fade+slide in; the log auto-scrolls while pinned to the bottom and
// offers a "Jump to latest" chip once the user scrolls up. Entries are derived
// once in the RunDetail parent; rows are memoized so status-only renders do
// not rebuild the whole log.

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmtMs } from "../../lib/format";
import { Glyph } from "../../ui/Glyph";
import {
  durationBetween,
  logDomId,
  stringifyCapped,
  type LogEntry,
} from "./derive";

function AnimatedEntry({ id, children }: { id: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    element.animate(
      [
        { opacity: 0, transform: "translateY(4px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 160, easing: "ease-out" },
    );
  }, []);

  return (
    <div ref={ref} id={logDomId(id)} data-log-id={logDomId(id)}>
      {children}
    </div>
  );
}

function JsonBlock({
  label,
  value,
}: {
  label: string;
  value: { text: string; truncated: boolean };
}) {
  if (!value.text) return null;
  return (
    <div>
      <div className="mb-1 text-10 uppercase tracking-[0.08em] text-fg3">
        {label}
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-6 bg-raised p-2 font-mono text-11 leading-[1.5] text-fg2">
        {value.text}
        {value.truncated ? "\n… truncated" : ""}
      </pre>
    </div>
  );
}

function ToolRow({
  tool,
  terminal,
}: {
  tool: Extract<LogEntry, { kind: "tool" }>;
  terminal: boolean;
}) {
  const [open, setOpen] = useState(false);
  const duration = durationBetween(tool.startTs, tool.endTs);
  const unresolved = tool.startTs !== null && tool.endTs === null;
  // A tool start with no end is only "running" while the run is live. Once the
  // run is terminal it can never finish, so show it as failed like Timeline.
  const running = unresolved && !terminal;
  const failed = tool.isError || (unresolved && terminal);
  const args = useMemo(() => stringifyCapped(tool.args), [tool.args]);
  const result = useMemo(() => stringifyCapped(tool.result), [tool.result]);

  return (
    <div className="py-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-6 px-1 py-0.5 text-left font-mono text-11 text-fg2 transition-colors duration-150 hover:bg-hover"
      >
        <span className="w-3 shrink-0 text-fg3">{open ? "▾" : "▸"}</span>
        {failed ? <Glyph status="failed" size={10} /> : null}
        <span className="truncate text-fg" title={`${tool.name} ${tool.target}`}>
          {tool.name}
          {tool.target ? ` ${tool.target}` : ""}
        </span>
        {duration !== null ? (
          <span className="shrink-0 text-fg3">· {fmtMs(duration)}</span>
        ) : running ? (
          <span className="shrink-0 text-accent">· running…</span>
        ) : unresolved ? (
          <span className="shrink-0 text-fg3">· no result</span>
        ) : null}
      </button>

      {open ? (
        <div className="ml-4 mt-1 flex flex-col gap-2 border-l border-line pb-1 pl-3">
          <JsonBlock label="args" value={args} />
          {tool.endTs !== null || tool.result !== undefined ? (
            <JsonBlock label={tool.isError ? "error" : "result"} value={result} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const LogBody = memo(function LogBody({
  entry,
  terminal,
}: {
  entry: LogEntry;
  terminal: boolean;
}) {
  if (entry.kind === "assistant") {
    return (
      <p className="whitespace-pre-wrap py-2 text-13 leading-[1.55] text-fg">
        {entry.text}
      </p>
    );
  }
  if (entry.kind === "error") {
    return (
      <div className="my-2 border-l-2 border-fg py-1 pl-3">
        <p className="whitespace-pre-wrap text-12 leading-[1.55] text-fg">
          {entry.text}
        </p>
      </div>
    );
  }
  return <ToolRow tool={entry} terminal={terminal} />;
});

export type LogProps = {
  entries: LogEntry[];
  terminal: boolean;
};

export function Log({ entries, terminal }: LogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  // Keep pinned to the bottom as entries stream in (only while already there).
  useEffect(() => {
    const element = containerRef.current;
    if (element && atBottomRef.current) element.scrollTop = element.scrollHeight;
  }, [entries.length]);

  const onScroll = () => {
    const element = containerRef.current;
    if (!element) return;
    const atBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 24;
    atBottomRef.current = atBottom;
    setShowJump(!atBottom);
  };

  const jumpToLatest = () => {
    const element = containerRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    atBottomRef.current = true;
    setShowJump(false);
  };

  const emptyText = terminal ? "No output recorded." : "Waiting for output…";

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto px-4 py-3"
      >
        {entries.length === 0 ? (
          <p className="py-2 text-12 text-fg3">{emptyText}</p>
        ) : null}
        {entries.map((entry) => (
          <AnimatedEntry key={entry.id} id={entry.id}>
            <LogBody entry={entry} terminal={terminal} />
          </AnimatedEntry>
        ))}
      </div>

      {showJump ? (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-raised px-3 py-1 text-11 text-fg2 transition-colors duration-150 hover:text-fg"
        >
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}
