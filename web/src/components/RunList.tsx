// Run rows for the selected session. The column header (title + List | Tree
// control) is rendered by App so it survives both list and tree modes; this
// file only paints rows and handles clicks.

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { Run } from "../api/types";
import { ago, fmtCost, fmtMs, tierLabel } from "../lib/format";
import { navigate } from "../lib/router";
import { selectRun, useStore } from "../state/store";
import { Glyph } from "../ui/Glyph";
import { Pill } from "../ui/Pill";

/** Elapsed wall time for a row; running runs read the current tick. */
function duration(run: Run, now: number): string {
  if (run.started === null) return "";
  const end = run.ended ?? (run.status === "running" ? now : run.started);
  return fmtMs(end - run.started);
}

/** A running row ticks its elapsed time once a second on its own, so the rest
 *  of the list neither re-renders nor re-sorts every second. */
function LiveDuration({ run }: { run: Run }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <>{duration(run, now)}</>;
}

// Stable empty array so `useStore` never sees a fresh snapshot reference.
const EMPTY_RUNS: Run[] = [];

export function RunList() {
  const selectedSession = useStore((s) => s.selectedSession);
  const selectedRun = useStore((s) => s.selectedRun);
  const tiers = useStore((s) => s.stats?.tiers ?? null);
  const runsBySession = useStore((s) => s.runsBySession);
  const runs = selectedSession
    ? (runsBySession[selectedSession] ?? EMPTY_RUNS)
    : EMPTY_RUNS;

  const ordered = runs.slice().sort((a, b) => (b.created || 0) - (a.created || 0));

  // `ago` only needs a slow tick; running rows use LiveDuration for seconds.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Keep the selected row in view when it changes via keyboard.
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    if (!selectedRun) return;
    rowRefs.current[selectedRun]?.scrollIntoView({ block: "nearest" });
  }, [selectedRun]);

  // Drop stale row refs when switching sessions so the map cannot grow.
  useEffect(() => {
    rowRefs.current = {};
  }, [selectedSession]);

  const openRun = (run: Run) => {
    selectRun(run.id);
    navigate({ name: "run", runId: run.id, sub: null });
  };

  return (
    <div className="flex flex-col">
      {ordered.map((run) => {
        const selected = run.id === selectedRun;
        const tier = tierLabel(run.model, tiers);
        const meta: ReactNode[] = [
          run.model || null,
          run.status === "running" ? (
            <LiveDuration key="duration" run={run} />
          ) : (
            duration(run, now) || null
          ),
          run.cost > 0 ? fmtCost(run.cost) : null,
        ].filter((part) => part !== null && part !== "");

        return (
          <button
            key={run.id}
            type="button"
            ref={(el) => {
              rowRefs.current[run.id] = el;
            }}
            onClick={() => openRun(run)}
            className={[
              "relative flex h-[60px] w-full flex-col justify-center gap-0.5 border-b border-line px-4 text-left transition-colors duration-150",
              selected ? "bg-hover" : "hover:bg-hover",
            ].join(" ")}
          >
            {selected ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-0.5 bg-fg"
              />
            ) : null}

            <span className="flex min-w-0 items-center gap-2">
              <Glyph status={run.status} />
              <span className="min-w-0 flex-1 truncate text-13 font-medium tracking-[-0.01em] text-fg">
                {run.title || run.id}
              </span>
              <Pill mono>{tier}</Pill>
              <span className="shrink-0 text-11 text-fg4">
                {ago(run.ended ?? run.started ?? run.created, now)}
              </span>
            </span>

            <span className="truncate text-11 text-fg3">
              {meta.map((part, index) => (
                <Fragment key={index}>
                  {index > 0 ? " · " : ""}
                  {part}
                </Fragment>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
