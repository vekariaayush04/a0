// Runs panel — the reference screen for UI v3.
//
// Runs are card-rows grouped under a day header, not hairline list items:
// status glyph, title, tier badge on line one; model, duration and cost in
// mono on line two. Numbers are right-aligned and tabular so a column of runs
// can be scanned vertically. The accent appears only on a running row.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";

import type { Run } from "@/api/types";
import { StatusGlyph, TierBadge } from "@/features/runs/status";
import { ago, fmtCost, fmtMs, tierLabel } from "@/lib/format";
import { useMotion } from "@/lib/motion";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { selectRun, useStore } from "@/state/store";

const EMPTY_RUNS: Run[] = [];

/** Elapsed wall time for a row; a running row reads the live tick. */
function duration(run: Run, now: number): string {
  if (run.started === null) return "";
  const end = run.ended ?? (run.status === "running" ? now : run.started);
  return fmtMs(end - run.started);
}

/** A running row ticks on its own, so the list neither re-renders nor
 *  re-sorts once a second. */
function LiveDuration({ run }: { run: Run }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <>{duration(run, now)}</>;
}

/** "Today" / "Yesterday" / "12 Mar" for a day group header. */
function dayLabel(ts: number): string {
  const date = new Date(ts);
  const today = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function RunRow({
  run,
  selected,
  now,
  tier,
  onOpen,
  rowRef,
}: {
  run: Run;
  selected: boolean;
  now: number;
  tier: string;
  onOpen: () => void;
  rowRef?: (el: HTMLButtonElement | null) => void;
}) {
  const running = run.status === "running";

  return (
    <button
      type="button"
      ref={rowRef}
      onClick={onOpen}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group relative flex w-full flex-col gap-1 overflow-hidden rounded-lg border px-3 py-2.5 text-left",
        "transition-[background-color,border-color] duration-150",
        selected
          ? "border-border bg-card"
          : "border-transparent hover:border-border/70 hover:bg-card/60",
      )}
    >
      {selected ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-foreground"
        />
      ) : null}

      <span className="flex min-w-0 items-center gap-2">
        <StatusGlyph status={run.status} />
        <span className="min-w-0 flex-1 truncate text-13 font-medium tracking-[-0.01em] text-foreground">
          {run.title || run.id}
        </span>
        <TierBadge tier={tier} />
        <span className="shrink-0 font-mono text-10 text-muted-foreground">
          {ago(run.ended ?? run.started ?? run.created, now)}
        </span>
      </span>

      <span className="flex min-w-0 items-baseline gap-2 pl-[22px]">
        <span className="min-w-0 flex-1 truncate font-mono text-10 text-muted-foreground">
          {run.model || run.provider}
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-10 tabular-nums",
            running ? "text-live" : "text-muted-foreground",
          )}
        >
          {running ? <LiveDuration run={run} /> : duration(run, now) || "—"}
        </span>
        <span className="w-14 shrink-0 text-right font-mono text-10 tabular-nums text-muted-foreground">
          {run.cost > 0 ? fmtCost(run.cost) : "—"}
        </span>
      </span>
    </button>
  );
}

function RunsEmpty({ hasSession }: { hasSession: boolean }) {
  return (
    <div className="flex min-h-[14rem] flex-col items-center justify-center px-8 text-center">
      <p className="text-13 font-medium text-foreground">
        {hasSession ? "No runs in this session yet" : "No session selected"}
      </p>
      <p className="mt-1.5 max-w-[22rem] text-11 leading-relaxed text-muted-foreground">
        {hasSession
          ? "Runs appear here the moment Claude Code dispatches one."
          : "Pick a session on the left to see its runs."}
      </p>
      <p className="mt-4 rounded-md border border-border bg-muted px-2.5 py-1.5 font-mono text-10 text-muted-foreground">
        In Claude Code, say “use a0 to …”
      </p>
    </div>
  );
}

export function RunsPanel() {
  const selectedSession = useStore((s) => s.selectedSession);
  const selectedRun = useStore((s) => s.selectedRun);
  const tiers = useStore((s) => s.stats?.tiers ?? null);
  const runsBySession = useStore((s) => s.runsBySession);
  const runs = selectedSession
    ? (runsBySession[selectedSession] ?? EMPTY_RUNS)
    : EMPTY_RUNS;

  const { rise, list } = useMotion(runs.length);

  // `ago` only needs a slow tick; running rows tick themselves.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Newest first, then bucketed by calendar day.
  const groups = useMemo(() => {
    const ordered = runs.slice().sort((a, b) => (b.created || 0) - (a.created || 0));
    const out: Array<{ label: string; runs: Run[] }> = [];
    for (const run of ordered) {
      const label = dayLabel(run.created || run.started || Date.now());
      const last = out[out.length - 1];
      if (last && last.label === label) last.runs.push(run);
      else out.push({ label, runs: [run] });
    }
    return out;
  }, [runs]);

  // Keep the keyboard selection in view.
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    if (!selectedRun) return;
    rowRefs.current[selectedRun]?.scrollIntoView({ block: "nearest" });
  }, [selectedRun]);
  useEffect(() => {
    rowRefs.current = {};
  }, [selectedSession]);

  if (runs.length === 0) {
    return <RunsEmpty hasSession={Boolean(selectedSession)} />;
  }

  return (
    <motion.div
      variants={list}
      initial="hidden"
      animate="visible"
      className="flex flex-col px-2 pb-4"
    >
      {groups.map((group) => (
        <Fragment key={group.label}>
          <div className="sticky top-0 z-10 bg-background/85 px-1.5 pb-1 pt-3 backdrop-blur-sm">
            <p className="text-10 font-medium uppercase tracking-[0.1em] text-muted-foreground">
              {group.label}
            </p>
          </div>
          <div className="flex flex-col gap-0.5">
            {group.runs.map((run) => (
              <motion.div key={run.id} variants={rise}>
                <RunRow
                  run={run}
                  selected={run.id === selectedRun}
                  now={now}
                  tier={tierLabel(run.model, tiers)}
                  rowRef={(el) => {
                    rowRefs.current[run.id] = el;
                  }}
                  onOpen={() => {
                    selectRun(run.id);
                    navigate({ name: "run", runId: run.id, sub: null });
                  }}
                />
              </motion.div>
            ))}
          </div>
        </Fragment>
      ))}
    </motion.div>
  );
}
