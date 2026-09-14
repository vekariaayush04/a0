// App shell: real TopBar plus a responsive 3-column grid. Rail, RunList,
// RunDetail and Tree bodies are placeholders owned by later waves.

import { useEffect, useRef } from "react";
import { TopBar } from "./components/TopBar";
import { Rail } from "./components/Rail";
import { RunList } from "./components/RunList";
import { Header } from "./components/RunDetail/Header";
import { Timeline } from "./components/RunDetail/Timeline";
import { Log } from "./components/RunDetail/Log";
import { StatsStrip } from "./components/RunDetail/StatsStrip";
import { Brief } from "./components/RunDetail/Brief";
import { TreeView } from "./components/Tree/TreeView";
import { SubagentView } from "./components/Tree/SubagentView";
import { getSessionRuns, getSessions, getStats } from "./api/client";
import { useGlobalStatus } from "./api/sse";
import { useRoute } from "./lib/router";
import { Empty } from "./ui/Empty";
import type { Run } from "./api/types";
import {
  patchRun,
  selectRun,
  selectSession,
  selectSub,
  setRunsForSession,
  setSessions,
  setStats,
  useStore,
} from "./state/store";

const EMPTY_RUNS: Run[] = [];

export default function App() {
  const sessions = useStore((s) => s.sessions);
  const selectedSession = useStore((s) => s.selectedSession);
  const selectedRun = useStore((s) => s.selectedRun);
  const selectedSub = useStore((s) => s.selectedSub);
  const view = useStore((s) => s.view);
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
          const [nextSessions, nextStats] = await Promise.all([getSessions(), getStats()]);
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

  const desktopCols =
    view === "tree"
      ? "min-[1100px]:grid-cols-[280px_minmax(420px,46%)_minmax(0,1fr)]"
      : "min-[1100px]:grid-cols-[280px_360px_minmax(0,1fr)]";

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <TopBar />
      <div
        className={`grid min-h-0 flex-1 grid-cols-1 min-[700px]:grid-cols-[240px_minmax(0,1fr)] ${desktopCols}`}
      >
        <aside className="min-h-0 overflow-y-auto min-[700px]:border-r min-[700px]:border-line">
          <Rail />
        </aside>

        <section className="min-h-0 overflow-y-auto min-[700px]:border-r min-[700px]:border-line">
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
        </section>

        <main className="min-h-0 overflow-y-auto">
          {selectedSub !== null ? (
            <SubagentView />
          ) : selectedRun ? (
            <div className="flex h-full flex-col">
              <Header />
              <Brief />
              <Timeline />
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Log />
              </div>
              <StatsStrip />
            </div>
          ) : (
            <Empty title="No run selected" hint="Choose a run to see its log." />
          )}
        </main>
      </div>
    </div>
  );
}
