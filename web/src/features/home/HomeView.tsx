// Home — the overview shown when no session is selected.
//
// Four cards over the app ground: today's numbers, a 24-hour spend curve, the
// newest runs across every session, and the sessions carrying the most spend.
// Every number is mono and right-aligned; the only accent is the live running
// state. Spend history is derived client-side (bucket `created` by hour) so
// no new daemon route or SSE channel is needed — `/api/runs` is fetched once to
// seed the store, and the view then reads `runsBySession`, which the per-run
// SSE status frames keep current.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getRuns } from "@/api/client";
import type { Run, Session, Stats } from "@/api/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LiveDot, StatusGlyph } from "@/features/runs/status";
import { fmtCost } from "@/lib/format";
import { useMotion } from "@/lib/motion";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { selectSession, setRuns, useStore } from "@/state/store";

const HOUR = 3_600_000;
const BUCKETS = 24;

type HourPoint = { t: number; label: string; full: string; cost: number };

function hourLabel(t: number, withMinutes = false): string {
  return new Date(t).toLocaleTimeString([], {
    hour: "numeric",
    ...(withMinutes ? { minute: "2-digit" } : {}),
  });
}

/** A titled card surface. Depth is surface + border, never a shadow. */
function HomeCard({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card
      className={cn(
        "flex h-full flex-col rounded-xl border-border bg-card shadow-none",
        className,
      )}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="text-10 font-medium uppercase tracking-[0.1em] text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      <div className="min-h-0 flex-1 p-4">{children}</div>
    </Card>
  );
}

/** One labelled number. `live` is the only accent allowed on this screen. */
function Metric({
  label,
  value,
  live = false,
}: {
  label: string;
  value: string;
  live?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-10 uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        {live ? <LiveDot /> : null}
        <span
          className={cn(
            "font-mono text-20 tabular-nums",
            live ? "text-live" : "text-foreground",
          )}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

function TodayCard({ stats }: { stats: Stats | null }) {
  const running = stats?.running ?? 0;
  return (
    <HomeCard title="Today">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        <Metric label="Runs" value={String(stats?.runsToday ?? 0)} />
        <Metric label="Spend" value={fmtCost(stats?.costToday ?? 0)} />
        <Metric label="Running" value={String(running)} live={running > 0} />
        <Metric label="Queued" value={String(stats?.queued ?? 0)} />
      </div>
    </HomeCard>
  );
}

function SessionsCard({ sessions }: { sessions: Session[] }) {
  const top = useMemo(
    () => sessions.slice().sort((a, b) => b.totalCost - a.totalCost).slice(0, 3),
    [sessions],
  );

  return (
    <HomeCard title="Sessions">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-20 tabular-nums text-foreground">
          {sessions.length}
        </span>
        <span className="text-11 text-muted-foreground">
          {sessions.length === 1 ? "session tracked" : "sessions tracked"}
        </span>
      </div>

      {top.length > 0 ? (
        <div className="mt-3 flex flex-col gap-0.5">
          {top.map((session, index) => (
            <button
              key={session.id}
              type="button"
              onClick={() => {
                selectSession(session.id);
                navigate({ name: "session", sessionId: session.id });
              }}
              className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-left transition-[background-color,border-color] duration-150 hover:border-border/70 hover:bg-accent"
            >
              <span className="w-3 shrink-0 font-mono text-10 tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-12 text-foreground">
                {session.title || session.id}
              </span>
              <span className="shrink-0 font-mono text-10 tabular-nums text-muted-foreground">
                {fmtCost(session.totalCost)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-11 text-muted-foreground">No sessions yet.</p>
      )}
    </HomeCard>
  );
}

type SpendTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: HourPoint }>;
};

function SpendTooltip({ active, payload }: SpendTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-float">
      <p className="font-mono text-10 text-muted-foreground">{point.full}</p>
      <p className="mt-0.5 font-mono text-11 tabular-nums text-foreground">
        {fmtCost(point.cost)}
      </p>
    </div>
  );
}

function SpendCard({ runs }: { runs: Run[] }) {
  const { data, total } = useMemo(() => {
    const end = Math.floor(Date.now() / HOUR) * HOUR;
    const start = end - (BUCKETS - 1) * HOUR;
    const points: HourPoint[] = Array.from({ length: BUCKETS }, (_, index) => {
      const t = start + index * HOUR;
      return { t, label: hourLabel(t), full: hourLabel(t, true), cost: 0 };
    });
    for (const run of runs) {
      if (!run.created) continue;
      const index = Math.floor((run.created - start) / HOUR);
      if (index >= 0 && index < BUCKETS) points[index].cost += run.cost || 0;
    }
    return {
      data: points,
      total: points.reduce((sum, point) => sum + point.cost, 0),
    };
  }, [runs]);

  return (
    <HomeCard
      title="Spend, last 24h"
      action={
        <span className="font-mono text-10 tabular-nums text-muted-foreground">
          {fmtCost(total)}
        </span>
      }
    >
      <div className="h-[150px] w-full text-foreground">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "currentColor", strokeOpacity: 0.15 }}
              padding={{ left: 16, right: 16 }}
              tick={{
                fontSize: 10,
                fontFamily: "Geist Mono",
                fill: "currentColor",
                fillOpacity: 0.55,
              }}
              interval={5}
              tickMargin={8}
            />
            <YAxis hide domain={[0, "auto"]} />
            <ChartTooltip
              cursor={{ stroke: "currentColor", strokeOpacity: 0.18 }}
              content={<SpendTooltip />}
            />
            <Area
              type="monotone"
              dataKey="cost"
              stroke="currentColor"
              strokeWidth={1.5}
              fill="currentColor"
              fillOpacity={0.08}
              dot={false}
              activeDot={{ r: 3, fill: "currentColor", stroke: "none" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </HomeCard>
  );
}

function RecentRunsCard({
  runs,
  sessionTitle,
}: {
  runs: Run[];
  sessionTitle: (id: string) => string;
}) {
  return (
    <HomeCard title="Recent runs">
      <div className="grid grid-cols-1 gap-0.5 md:grid-cols-2 md:gap-x-3">
        {runs.map((run) => (
          <a
            key={run.id}
            href={`#/r/${encodeURIComponent(run.id)}`}
            className="group flex min-w-0 items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 transition-[background-color,border-color] duration-150 hover:border-border/70 hover:bg-accent"
          >
            <StatusGlyph status={run.status} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-12 font-medium tracking-[-0.01em] text-foreground">
                {run.title || run.id}
              </span>
              <span className="truncate text-10 text-muted-foreground">
                {sessionTitle(run.sessionId)}
              </span>
            </span>
            <span className="shrink-0 font-mono text-10 tabular-nums text-muted-foreground">
              {run.cost > 0 ? fmtCost(run.cost) : "—"}
            </span>
            <ChevronRight
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100"
            />
          </a>
        ))}
      </div>
    </HomeCard>
  );
}

/** First-load placeholder: the same card grid with skeleton content, so the
 *  overview never paints a row of zeros before the runs arrive. */
function HomeSkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        <header>
          <h1 className="text-20 font-semibold tracking-[-0.02em] text-foreground">
            Overview
          </h1>
          <p className="mt-0.5 text-12 text-muted-foreground">
            Today's activity across every session.
          </p>
        </header>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <HomeCard title="Today">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              {["Runs", "Spend", "Running", "Queued"].map((label) => (
                <div key={label} className="flex flex-col gap-1">
                  <span className="text-10 uppercase tracking-[0.1em] text-muted-foreground">
                    {label}
                  </span>
                  <Skeleton className="h-5 w-16 rounded-md" />
                </div>
              ))}
            </div>
          </HomeCard>
          <HomeCard title="Sessions">
            <Skeleton className="h-5 w-20 rounded-md" />
            <div className="mt-3 flex flex-col gap-2">
              <Skeleton className="h-3.5 w-full rounded-md" />
              <Skeleton className="h-3.5 w-5/6 rounded-md" />
              <Skeleton className="h-3.5 w-4/6 rounded-md" />
            </div>
          </HomeCard>
          <HomeCard title="Spend, last 24h" className="lg:col-span-2">
            <Skeleton className="h-[150px] w-full rounded-md" />
          </HomeCard>
          <HomeCard title="Recent runs" className="lg:col-span-2">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-x-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          </HomeCard>
        </div>
      </div>
    </div>
  );
}

export function HomeView() {
  const stats = useStore((s) => s.stats);
  const sessions = useStore((s) => s.sessions);
  const runsBySession = useStore((s) => s.runsBySession);
  const [loading, setLoading] = useState(true);
  const { rise, list } = useMotion(4);

  // Seed the store once. From then on the overview reads the same
  // `runsBySession` cache the per-run SSE status frames patch, so it stays
  // live without refetching on every stats/session change.
  useEffect(() => {
    let cancelled = false;
    void getRuns()
      .then((next) => {
        if (!cancelled) setRuns(next);
      })
      .catch(() => {
        /* keep whatever the store already holds */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runs = useMemo(
    () => Object.values(runsBySession).flat(),
    [runsBySession],
  );

  const recent = useMemo(
    () =>
      runs
        .slice()
        .sort((a, b) => (b.created || 0) - (a.created || 0))
        .slice(0, 8),
    [runs],
  );

  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const session of sessions) map.set(session.id, session.title || session.id);
    return map;
  }, [sessions]);

  const sessionTitle = (id: string) => titleById.get(id) ?? id.slice(0, 8);

  if (loading) {
    return <HomeSkeleton />;
  }

  if (runs.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center px-8 text-center">
        <p className="text-13 font-medium text-foreground">No runs yet</p>
        <p className="mt-1.5 max-w-[24rem] text-11 leading-relaxed text-muted-foreground">
          Once Claude Code dispatches a run, today's activity will show up here.
        </p>
        <p className="mt-4 rounded-md border border-border bg-muted px-2.5 py-1.5 font-mono text-10 text-muted-foreground">
          In Claude Code, say “use a0 to …”
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        <header>
          <h1 className="text-20 font-semibold tracking-[-0.02em] text-foreground">
            Overview
          </h1>
          <p className="mt-0.5 text-12 text-muted-foreground">
            Today's activity across every session.
          </p>
        </header>

        <motion.div
          variants={list}
          initial="hidden"
          animate="visible"
          className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2"
        >
          <motion.div variants={rise}>
            <TodayCard stats={stats} />
          </motion.div>
          <motion.div variants={rise}>
            <SessionsCard sessions={sessions} />
          </motion.div>
          <motion.div variants={rise} className="lg:col-span-2">
            <SpendCard runs={runs} />
          </motion.div>
          <motion.div variants={rise} className="lg:col-span-2">
            <RecentRunsCard runs={recent} sessionTitle={sessionTitle} />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
