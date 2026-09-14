// App shell: TopBar over a responsive pane layout. App owns the always-mounted
// keyboard handler and the route -> store reconciliation, so list/tree mode and
// deep links behave the same at every breakpoint.

import { useEffect, useMemo, useRef } from "react";
import { TopBar } from "./components/TopBar";
import { Rail } from "./components/Rail";
import { RunList } from "./components/RunList";
import { RunDetail } from "./components/RunDetail";
import { TreeView } from "./components/Tree/TreeView";
import { SubagentView } from "./components/Tree/SubagentView";
import { KeyOverlay } from "./components/KeyOverlay";
import {
  cancelRun,
  getRun,
  getSessionRuns,
  getSessions,
  getStats,
} from "./api/client";
import { useGlobalStatus } from "./api/sse";
import { shortPath } from "./lib/format";
import { useKeys } from "./lib/keys";
import { navigate, useRoute } from "./lib/router";
import { Empty } from "./ui/Empty";
import type { Run } from "./api/types";
import {
  patchRun,
  selectRun,
  selectSession,
  selectSessionForRun,
  selectSub,
  setOverlayOpen,
  setRunsForSession,
  setSessions,
  setStats,
  setView,
  useStore,
} from "./state/store";

const EMPTY_RUNS: Run[] = [];

function isTerminal(status: string): boolean {
  return status === "done" || status === "failed" || status === "cancelled";
}

/** Find a run across every cached session, for deep-link reconciliation. */
function findRun(bySession: Record<string, Run[]>, id: string): Run | null {
  for (const list of Object.values(bySession)) {
    const found = list.find((run) => run.id === id);
    if (found) return found;
  }
  return null;
}

/** Middle-column header. Rendered by App in both list and tree modes so the
 *  List | Tree control is always reachable; RunList/TreeView only paint bodies. */
function RunsHeader() {
  const sessions = useStore((s) => s.sessions);
  const selectedSession = useStore((s) => s.selectedSession);
  const view = useStore((s) => s.view);

  const session = sessions.find((s) => s.id === selectedSession) ?? null;
  const cwds = session?.cwds ?? [];
  const title = session ? session.title || session.id : "Runs";

  return (
    <header className="border-b border-line bg-bg px-4 pb-2 pt-3">
      <div className="flex items-center gap-3">
        <h2 className="min-w-0 flex-1 truncate text-15 font-semibold tracking-[-0.01em] text-fg">
          {title}
        </h2>
        <div
          role="group"
          aria-label="Runs view"
          className="inline-flex h-7 shrink-0 items-center rounded-6 border border-line p-0.5"
        >
          {(["list", "tree"] as const).map((mode) => {
            const active = view === mode;
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={active}
                title={`${mode === "list" ? "List" : "Tree"} view (g)`}
                onClick={() => setView(mode)}
                className={[
                  "h-6 rounded-[4px] px-2.5 text-11 capitalize transition-colors duration-150",
                  active ? "bg-hover text-fg" : "text-fg3 hover:text-fg",
                ].join(" ")}
              >
                {mode}
              </button>
            );
          })}
        </div>
      </div>
      {cwds.length > 0 ? (
        <p className="mt-1 truncate font-mono text-11 text-fg3">
          {cwds.map(shortPath).join("  ·  ")}
        </p>
      ) : null}
    </header>
  );
}

export default function App() {
  const sessions = useStore((s) => s.sessions);
  const runsBySession = useStore((s) => s.runsBySession);
  const selectedSession = useStore((s) => s.selectedSession);
  const selectedRun = useStore((s) => s.selectedRun);
  const selectedSub = useStore((s) => s.selectedSub);
  const view = useStore((s) => s.view);
  const overlayOpen = useStore((s) => s.overlayOpen);
  const runsMaybe = useStore((s) =>
    selectedSession ? s.runsBySession[selectedSession] : undefined,
  );
  const runs = runsMaybe ?? EMPTY_RUNS;
  const route = useRoute();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load of sessions and global stats.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [nextSessions, nextStats] = await Promise.all([getSessions(), getStats()]);
        if (cancelled) return;
        setSessions(nextSessions);
        setStats(nextStats);
      } catch {
        /* daemon not reachable yet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Default selection when on the home route.
  useEffect(() => {
    if (route.name === "home" && !selectedSession && sessions.length > 0) {
      selectSession(sessions[0].id);
    }
  }, [sessions, selectedSession, route.name]);

  // Reconcile the hash route into store selection.
  useEffect(() => {
    if (route.name === "session") selectSession(route.sessionId);
    else if (route.name === "run") {
      selectRun(route.runId);
      selectSub(route.sub);
    }
  }, [route]);

  // A run deep link must also select the run's session so the rail, runs
  // column and back navigation all agree. The run may not be cached yet, so
  // fetch it once when it is missing.
  useEffect(() => {
    if (route.name !== "run") return;
    const cached = findRun(runsBySession, route.runId);
    if (cached) {
      selectSessionForRun(cached.sessionId);
      return;
    }
    let cancelled = false;
    void getRun(route.runId)
      .then((run) => {
        if (!cancelled) selectSessionForRun(run.sessionId);
      })
      .catch(() => {
        /* run may have vanished; RunDetail renders the empty state */
      });
    return () => {
      cancelled = true;
    };
  }, [route, runsBySession]);

  // Load runs whenever the selected session (or session list) changes.
  useEffect(() => {
    if (!selectedSession) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await getSessionRuns(selectedSession);
        if (!cancelled) setRunsForSession(selectedSession, next);
      } catch {
        /* ignore transient errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSession, sessions]);

  // Global status frames patch the run, then debounce a list refresh.
  const scheduleRefresh = useRef(() => {
    if (refreshTimer.current !== null) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void (async () => {
        try {
          const [nextSessions, nextStats] = await Promise.all([
            getSessions(),
            getStats(),
          ]);
          setSessions(nextSessions);
          setStats(nextStats);
        } catch {
          /* ignore */
        }
      })();
    }, 300);
  });

  useGlobalStatus<Run>((run) => {
    patchRun(run);
    scheduleRefresh.current();
  });

  useEffect(
    () => () => {
      if (refreshTimer.current !== null) clearTimeout(refreshTimer.current);
    },
    [],
  );

  // j/k walk the middle column. Tree mode follows the vertical time order the
  // SVG paints (started ascending, queued last); list mode follows created.
  const orderedRuns = useMemo(() => {
    const copy = runs.slice();
    if (view === "tree") {
      copy.sort((a, b) => {
        const as = a.started ?? Number.POSITIVE_INFINITY;
        const bs = b.started ?? Number.POSITIVE_INFINITY;
        if (as !== bs) return as - bs;
        return (a.created || 0) - (b.created || 0);
      });
    } else {
      copy.sort((a, b) => (b.created || 0) - (a.created || 0));
    }
    return copy;
  }, [runs, view]);

  const moveSessions = (delta: number) => {
    if (sessions.length === 0) return;
    const index = sessions.findIndex((s) => s.id === selectedSession);
    const start = index < 0 ? (delta > 0 ? -1 : sessions.length) : index;
    const next = sessions[Math.max(0, Math.min(sessions.length - 1, start + delta))];
    selectSession(next.id);
    navigate({ name: "session", sessionId: next.id });
  };

  const moveRuns = (delta: number) => {
    if (orderedRuns.length === 0) return;
    const index = orderedRuns.findIndex((r) => r.id === selectedRun);
    const start = index < 0 ? (delta > 0 ? -1 : orderedRuns.length) : index;
    const next =
      orderedRuns[Math.max(0, Math.min(orderedRuns.length - 1, start + delta))];
    selectRun(next.id);
  };

  const openSelected = () => {
    if (route.name === "home") {
      const session = sessions.find((s) => s.id === selectedSession) ?? sessions[0];
      if (!session) return;
      selectSession(session.id);
      navigate({ name: "session", sessionId: session.id });
      return;
    }
    if (orderedRuns.length === 0) return;
    const id = selectedRun ?? orderedRuns[0].id;
    selectRun(id);
    navigate({ name: "run", runId: id, sub: null });
  };

  const cancelSelected = () => {
    const run = runs.find((r) => r.id === selectedRun) ?? null;
    if (!run || isTerminal(run.status)) return;
    if (!window.confirm(`Cancel run “${run.title}”?`)) return;
    void cancelRun(run.id)
      .then((next) => patchRun(next))
      .catch(() => {
        /* the status stream may still settle the run */
      });
  };

  const goBack = () => {
    if (route.name === "run") {
      if (route.sub !== null) navigate({ name: "run", runId: route.runId, sub: null });
      else if (selectedSession)
        navigate({ name: "session", sessionId: selectedSession });
      else navigate({ name: "home" });
    } else if (route.name === "session") {
      navigate({ name: "home" });
    }
  };

  // Single always-mounted key handler (TopBar/RunList no longer bind these).
  useKeys({
    "g": () => {
      if (overlayOpen) return;
      setView(view === "tree" ? "list" : "tree");
    },
    "j": () => {
      if (overlayOpen) return;
      if (route.name === "home") moveSessions(1);
      else moveRuns(1);
    },
    "k": () => {
      if (overlayOpen) return;
      if (route.name === "home") moveSessions(-1);
      else moveRuns(-1);
    },
    Enter: (event) => {
      if (overlayOpen || event.defaultPrevented) return;
      openSelected();
    },
    Escape: () => {
      if (overlayOpen) {
        setOverlayOpen(false);
        return;
      }
      goBack();
    },
    c: () => {
      if (overlayOpen) return;
      cancelSelected();
    },
  });

  // Below 1100px only the route-appropriate pane shows; 700-1099 adds the rail;
  // at >=1100 all three panes are laid out side by side.
  const isHome = route.name === "home";
  const isSession = route.name === "session";
  const isRun = route.name === "run";

  const railVisibility = `${isHome ? "block" : "hidden"} min-[700px]:block`;
  const runsVisibility = `${isSession ? "block" : "hidden"} min-[1100px]:block`;
  const detailVisibility = `${isRun ? "block" : "hidden"} min-[1100px]:block`;

  const railWidth = "w-full shrink-0 min-[700px]:w-[240px] min-[1100px]:w-[280px]";
  const runsWidth =
    view === "tree"
      ? "w-full min-[700px]:flex-1 min-[1100px]:w-[46%] min-[1100px]:min-w-[420px] min-[1100px]:max-w-[46%] min-[1100px]:flex-none"
      : "w-full min-[700px]:flex-1 min-[1100px]:w-[360px] min-[1100px]:flex-none";
  const detailWidth = "w-full min-[700px]:flex-1";

  const showRunDetail = selectedSub === null && selectedRun !== null;

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <TopBar />
      <div className="flex min-h-0 flex-1 flex-row">
        <aside
          className={`${railVisibility} ${railWidth} min-h-0 overflow-y-auto border-line min-[700px]:border-r`}
        >
          <Rail />
        </aside>

        <section
          className={`${runsVisibility} ${runsWidth} flex min-h-0 flex-col border-line min-[700px]:border-r`}
        >
          <RunsHeader />
          <div className="min-h-0 flex-1 overflow-auto">
            {view === "tree" ? (
              <TreeView />
            ) : runs.length > 0 ? (
              <RunList />
            ) : (
              <Empty
                title={selectedSession ? "No runs yet" : "No session selected"}
                hint={selectedSession ? undefined : "Pick a session on the left."}
              />
            )}
          </div>
        </section>

        <main
          className={`${detailVisibility} ${detailWidth} min-h-0 ${
            showRunDetail
              ? "flex flex-col overflow-hidden"
              : "overflow-y-auto"
          }`}
        >
          {selectedSub !== null ? (
            <SubagentView />
          ) : selectedRun ? (
            <RunDetail />
          ) : (
            <Empty title="No run selected" hint="Choose a run to see its log." />
          )}
        </main>
      </div>

      {overlayOpen ? <KeyOverlay onClose={() => setOverlayOpen(false)} /> : null}
    </div>
  );
}
