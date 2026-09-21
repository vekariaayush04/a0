// Session rows for the sidebar.
//
// Each row is an elevated surface (card step) rather than a hairline list
// item: monogram avatar, title, cwd subtitle, and meta chips for run count
// and spend. Selection is a surface step plus a 2px foreground bar, never a
// colour; a running session gets the one accent as a pulsing dot.

import { useEffect, useState } from "react";
import { motion } from "motion/react";

import type { Session } from "@/api/types";
import { LiveDot } from "@/features/runs/status";
import { ago, fmtCost, shortPath } from "@/lib/format";
import { useMotion } from "@/lib/motion";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { selectSession, useStore } from "@/state/store";

/** Two letters from the title, for the monogram avatar. Falls back to the id. */
export function monogram(title: string, id: string): string {
  const source = (title || id).trim();
  const words = source.split(/[\s\-_/.]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[18px] items-center rounded-md bg-muted px-1.5 font-mono text-10 leading-none text-muted-foreground">
      {children}
    </span>
  );
}

export function SessionRow({
  session,
  selected,
  now,
  onSelect,
}: {
  session: Session;
  selected: boolean;
  now: number;
  onSelect: () => void;
}) {
  const running = session.runningCount > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group relative flex w-full items-start gap-2.5 overflow-hidden rounded-lg border px-2.5 py-2 text-left",
        "transition-[background-color,border-color] duration-150",
        selected
          ? "border-border bg-card"
          : "border-transparent hover:border-border/70 hover:bg-card/60",
      )}
    >
      {selected ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-foreground"
        />
      ) : null}

      <span
        aria-hidden="true"
        className={cn(
          "mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border font-mono text-10 font-medium",
          selected
            ? "bg-secondary text-foreground"
            : "bg-muted text-muted-foreground group-hover:text-foreground",
        )}
      >
        {monogram(session.title, session.id)}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-13 font-medium tracking-[-0.01em] text-foreground">
            {session.title || session.id}
          </span>
          {running ? <LiveDot /> : null}
          <span className="shrink-0 font-mono text-10 text-muted-foreground">
            {ago(session.lastSeen, now)}
          </span>
        </span>

        <span className="truncate font-mono text-10 text-muted-foreground">
          {shortPath(session.cwd)}
        </span>

        <span className="flex items-center gap-1">
          <MetaChip>
            {session.runCount} {session.runCount === 1 ? "run" : "runs"}
          </MetaChip>
          <MetaChip>{fmtCost(session.totalCost)}</MetaChip>
        </span>
      </span>
    </button>
  );
}

export function SessionList({ onNavigate }: { onNavigate?: () => void }) {
  const sessions = useStore((s) => s.sessions);
  const selectedSession = useStore((s) => s.selectedSession);
  const { rise, list } = useMotion(sessions.length);

  // Relative timestamps only need a slow tick.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  if (sessions.length === 0) {
    return (
      <div className="px-2.5 py-6">
        <p className="text-12 text-muted-foreground">No sessions yet</p>
        <p className="mt-1 text-11 text-muted-foreground/70">
          In Claude Code, say “use a0 to …”
        </p>
      </div>
    );
  }

  return (
    <motion.div
      variants={list}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-0.5 px-2 pb-2"
    >
      {sessions.map((session) => (
        <motion.div key={session.id} variants={rise}>
          <SessionRow
            session={session}
            selected={session.id === selectedSession}
            now={now}
            onSelect={() => {
              selectSession(session.id);
              navigate({ name: "session", sessionId: session.id });
              onNavigate?.();
            }}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
