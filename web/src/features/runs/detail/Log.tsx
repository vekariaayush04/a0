// Live run log, virtualized with @tanstack/react-virtual.
//
// Rows have wildly different heights (a one-line tool call vs. a 40-line
// assistant block vs. an expanded JSON result), so the virtualizer measures
// every row it mounts; expanding a Collapsible re-measures through the same
// ResizeObserver, which is why the tool row calls `measure()` on toggle.
//
// Errors stay monochrome: an Alert with a 2px foreground bar, no red.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "motion/react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  durationBetween,
  logDomId,
  stringifyCapped,
  type LogEntry,
} from "@/features/runs/derive";
import { Markdown } from "@/features/runs/Markdown";
import { toolIcon } from "@/features/runs/status";
import { fmtMs } from "@/lib/format";
import { useMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** A capped JSON/args/result body in a bounded mono scroll area. */
function JsonBlock({
  label,
  value,
}: {
  label: string;
  value: { text: string; truncated: boolean };
}) {
  if (!value.text) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1 text-10 font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <ScrollArea className="max-h-56 rounded-md border border-border bg-muted">
        <pre className="whitespace-pre-wrap break-words p-2.5 font-mono text-10 leading-[1.6] text-muted-foreground">
          {value.text}
          {value.truncated ? "\n… truncated" : ""}
        </pre>
      </ScrollArea>
    </div>
  );
}

function ToolRow({
  tool,
  terminal,
  measure,
}: {
  tool: Extract<LogEntry, { kind: "tool" }>;
  terminal: boolean;
  measure: () => void;
}) {
  const [open, setOpen] = useState(false);
  const duration = durationBetween(tool.startTs, tool.endTs);
  const unresolved = tool.startTs !== null && tool.endTs === null;
  // A tool start with no end is only "running" while the run is live; once the
  // run is terminal it can never finish, so it reads as failed.
  const running = unresolved && !terminal;
  const failed = tool.isError || (unresolved && terminal);
  const args = useMemo(() => stringifyCapped(tool.args), [tool.args]);
  const result = useMemo(() => stringifyCapped(tool.result), [tool.result]);
  const Icon = toolIcon(tool.name);

  // Let the virtualizer re-measure once the Collapsible has laid out.
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    requestAnimationFrame(measure);
  };

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="py-0.5">
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left",
          "transition-colors duration-150",
          failed
            ? "border-foreground/25 bg-card"
            : "border-transparent hover:border-border hover:bg-card",
        )}
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            failed ? "text-foreground" : "text-muted-foreground",
          )}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-11 text-foreground">
          {tool.name}
          {tool.target ? (
            <span className="text-muted-foreground"> {tool.target}</span>
          ) : null}
        </span>
        {duration !== null ? (
          <span className="shrink-0 font-mono text-10 tabular-nums text-muted-foreground">
            {fmtMs(duration)}
          </span>
        ) : running ? (
          <span className="shrink-0 font-mono text-10 text-live">running…</span>
        ) : unresolved ? (
          <span className="shrink-0 font-mono text-10 text-muted-foreground">
            no result
          </span>
        ) : null}
        {open ? (
          <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden">
        <div className="ml-[7px] mt-1.5 flex flex-col gap-2 border-l border-border pb-1 pl-3">
          <JsonBlock label="args" value={args} />
          {tool.endTs !== null || tool.result !== undefined ? (
            <JsonBlock label={tool.isError ? "error" : "result"} value={result} />
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const LogBody = memo(function LogBody({
  entry,
  terminal,
  measure,
}: {
  entry: LogEntry;
  terminal: boolean;
  measure: () => void;
}) {
  if (entry.kind === "assistant") {
    return (
      <div className="max-w-[78ch] py-2">
        <Markdown text={entry.text} />
      </div>
    );
  }
  if (entry.kind === "error") {
    // shadcn Alert, held monochrome: a 2px foreground bar carries the weight
    // that colour would carry elsewhere.
    return (
      <div
        role="alert"
        className="my-2 flex gap-2.5 rounded-md border border-border border-l-2 border-l-foreground bg-card px-3 py-2"
      >
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-foreground" />
        <div className="min-w-0">
          <p className="text-11 font-medium text-foreground">Error</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-11 leading-[1.6] text-muted-foreground">
            {entry.text}
          </p>
        </div>
      </div>
    );
  }
  return <ToolRow tool={entry} terminal={terminal} measure={measure} />;
});

export type LogProps = {
  entries: LogEntry[];
  terminal: boolean;
  /** Bumped by the parent as entries fold in; `entries` is a stable buffer. */
  version?: number;
};

export function Log({ entries, terminal, version }: LogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const { reduced } = useMotion();

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    overscan: 8,
    getItemKey: (index) => entries[index]?.id ?? index,
  });

  const items = virtualizer.getVirtualItems();

  // Stay pinned to the bottom as entries stream in, but only if already there.
  useEffect(() => {
    if (!atBottomRef.current || entries.length === 0) return;
    virtualizer.scrollToIndex(entries.length - 1, { align: "end" });
    // `version` is the streaming signal: the array identity never changes.
  }, [entries.length, version, virtualizer]);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const atBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 32;
    atBottomRef.current = atBottom;
    setShowJump(!atBottom && entries.length > 0);
  }, [entries.length]);

  const jumpToLatest = () => {
    if (entries.length === 0) return;
    virtualizer.scrollToIndex(entries.length - 1, { align: "end" });
    atBottomRef.current = true;
    setShowJump(false);
  };

  if (entries.length === 0) {
    return (
      <div className="px-5 py-4">
        <p className="text-12 text-muted-foreground">
          {terminal ? "No output recorded." : "Waiting for output…"}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto px-5 py-2"
      >
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}
        >
          {items.map((item) => {
            const entry = entries[item.index];
            if (!entry) return null;
            return (
              <div
                key={item.key}
                id={logDomId(entry.id)}
                data-index={item.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <motion.div
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduced ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  <LogBody
                    entry={entry}
                    terminal={terminal}
                    measure={() => virtualizer.measure()}
                  />
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>

      {showJump ? (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border bg-popover px-3 py-1 text-11 text-muted-foreground shadow-float transition-colors duration-150 hover:text-foreground"
        >
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}
