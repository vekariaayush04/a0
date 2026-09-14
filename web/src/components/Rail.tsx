// Session rail: one 64px row per session, newest first (order comes from the
// API). Selecting a row drives the hash route and the store selection.

import { useEffect, useState } from "react";
import { ago, fmtCost, shortPath } from "../lib/format";
import { navigate } from "../lib/router";
import { selectSession, useStore } from "../state/store";
import { Empty } from "../ui/Empty";

export function Rail() {
  const sessions = useStore((s) => s.sessions);
  const selectedSession = useStore((s) => s.selectedSession);

  // Relative timestamps only need a slow tick; durations are not shown here.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex h-9 items-center border-b border-line bg-bg px-4">
        <span className="text-11 font-medium uppercase tracking-[0.08em] text-fg3">
          Sessions
        </span>
      </div>

      {sessions.length === 0 ? (
        <Empty
          title="No sessions yet"
          hint="In Claude Code, say “use sentinel to …”"
        />
      ) : (
        <div className="flex flex-col">
          {sessions.map((session) => {
            const selected = session.id === selectedSession;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => {
                  selectSession(session.id);
                  navigate({ name: "session", sessionId: session.id });
                }}
                className={[
                  "relative flex h-16 w-full flex-col justify-center gap-0.5 border-b border-line px-4 text-left transition-colors duration-150",
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
                  {session.runningCount > 0 ? (
                    <span
                      role="img"
                      aria-label="running"
                      className="pulse h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                    />
                  ) : null}
                  <span className="truncate text-13 font-medium tracking-[-0.01em] text-fg">
                    {session.title || session.id}
                  </span>
                </span>

                <span className="truncate font-mono text-11 text-fg3">
                  {shortPath(session.cwd)}
                </span>

                <span className="truncate text-11 text-fg3">
                  {session.runCount} {session.runCount === 1 ? "run" : "runs"} ·{" "}
                  {fmtCost(session.totalCost)} · {ago(session.lastSeen, now)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
