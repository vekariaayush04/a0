// App frame for Sentinel UI v3.
//
//   Sidebar (260px, Sheet below 1100px)
//   └ content
//     ├ Topbar (breadcrumb + live stats + ⌘K)
//     └ ResizablePanelGroup
//       ├ runs panel  — run list           (min 340px)
//       └ detail panel — RunDetail / SubagentView
//
// App owns the always-mounted keyboard handler and the route -> store
// reconciliation, so keys and deep links behave identically at every
// breakpoint. Below 700px only the route's own pane mounts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { cancelRun, getRun, getSessionRuns, getSessions, getStats } from "@/api/client";
import { useGlobalStatus } from "@/api/sse";
import type { Run } from "@/api/types";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { ShortcutsDialog } from "@/components/layout/ShortcutsDialog";
import { Sidebar, SidebarBody } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { ThemeProvider } from "@/components/theme-provider";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HomeView } from "@/features/home/HomeView";
import { RunDetail } from "@/features/runs/detail/RunDetail";
import { RunsPanel } from "@/features/runs/RunsPanel";
import { SubagentView } from "@/features/runs/SubagentView";
import { useKeys } from "@/lib/keys";
import { useMotion } from "@/lib/motion";
import { navigate, useRoute } from "@/lib/router";
import { BREAKPOINTS, useMediaQuery } from "@/lib/use-media-query";
import {
  cycleTheme,
  patchRun,
  selectRun,
  selectSession,
  selectSessionForRun,
  selectSub,
  setOverlayOpen,
  setRunsForSession,
  setSessions,
  setStats,
  useStore,
} from "@/state/store";

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

/** Animated pane wrapper; route changes crossfade through AnimatePresence.
 *  `className` defaults to a full-height flex column, which is right for a
 *  pane that owns its own scrolling. A pane rendered *inside* a scroll region
 *  (a scrolling list body) must pass `min-h-full` instead, or `h-full` would clip
 *  content taller than the viewport. */
function Pane({
  paneKey,
  children,
  className = "flex h-full min-h-0 flex-col",
}: {
  paneKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { pane } = useMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={paneKey}
        variants={pane}
        initial="hidden"
        animate="visible"
        exit="exit"
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** Runs panel: the one scroll region for the run list. */
function RunsPane() {
  return (
    <div className="h-full min-h-0 overflow-auto overscroll-contain">
      <RunsPanel />
    </div>
  );
}

function DetailPane() {
  const selectedSub = useStore((s) => s.selectedSub);
  const selectedRun = useStore((s) => s.selectedRun);

  if (selectedSub !== null) {
    return (
      <div className="h-full min-h-0 overflow-y-auto">
        <SubagentView />
      </div>
    );
  }
  if (!selectedRun) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="text-13 font-medium text-foreground">No run selected</p>
        <p className="mt-1.5 text-11 text-muted-foreground">
          Choose a run to see its timeline and log.
        </p>
      </div>
    );
  }
  return <RunDetail />;
}

export default function App() {
  const sessions = useStore((s) => s.sessions);
  const runsBySession = useStore((s) => s.runsBySession);
  const selectedSession = useStore((s) => s.selectedSession);
  const selectedRun = useStore((s) => s.selectedRun);
  const overlayOpen = useStore((s) => s.overlayOpen);
  const runsMaybe = useStore((s) =>
    selectedSession ? s.runsBySession[selectedSession] : undefined,
  );
  const runs = runsMaybe ?? EMPTY_RUNS;
  const route = useRoute();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const twoPane = useMediaQuery(BREAKPOINTS.twoPane);

  // ---- data -------------------------------------------------------------

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

  // No session is auto-selected: the home route is the session-less overview
  // (`<HomeView />`), so an empty selection is a real destination, not a gap.
  useEffect(() => {
    if (route.name === "session") selectSession(route.sessionId);
    else if (route.name === "run") {
      selectRun(route.runId);
      selectSub(route.sub);
    }
  }, [route]);

  // A run deep link must also select the run's session so the sidebar, runs
  // panel and back navigation all agree.
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
        /* the run may have vanished; RunDetail renders the empty state */
      });
    return () => {
      cancelled = true;
    };
  }, [route, runsBySession]);

  // Load the selected session's runs, and reload when the daemon reports a
  // different run count for it. Depending on the whole `sessions` array would
  // re-fire (and cancel) this fetch on every stats refresh, which can leave
  // the panel permanently empty while status frames are arriving.
  const selectedRunCount =
    sessions.find((s) => s.id === selectedSession)?.runCount ?? 0;

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
  }, [selectedSession, selectedRunCount]);

  useEffect(() => {
    if (!twoPane || route.name !== "session" || selectedRun || runs.length === 0) return;
    const newest = runs
      .slice()
      .sort((a, b) => (b.created || 0) - (a.created || 0))[0];
    if (newest) selectRun(newest.id);
  }, [twoPane, route, selectedRun, runs]);

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

  // ---- keyboard ---------------------------------------------------------

  // j/k walk the runs panel in the order the list paints (newest first).
  const orderedRuns = useMemo(
    () => runs.slice().sort((x, y) => (y.created || 0) - (x.created || 0)),
    [runs],
  );

  const busy = overlayOpen || commandOpen || sheetOpen;

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
    const next = orderedRuns[Math.max(0, Math.min(orderedRuns.length - 1, start + delta))];
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

  const goBack = useCallback(() => {
    if (route.name === "run") {
      if (route.sub !== null) navigate({ name: "run", runId: route.runId, sub: null });
      else if (selectedSession) navigate({ name: "session", sessionId: selectedSession });
      else navigate({ name: "home" });
    } else if (route.name === "session") {
      selectSession(null);
      navigate({ name: "home" });
    }
  }, [route, selectedSession]);

  useKeys({
    j: () => {
      if (busy) return;
      if (route.name === "home") moveSessions(1);
      else moveRuns(1);
    },
    k: () => {
      if (busy) return;
      if (route.name === "home") moveSessions(-1);
      else moveRuns(-1);
    },
    Enter: (event) => {
      if (busy || event.defaultPrevented) return;
      openSelected();
    },
    Escape: () => {
      if (commandOpen) {
        setCommandOpen(false);
        return;
      }
      if (sheetOpen) {
        setSheetOpen(false);
        return;
      }
      if (overlayOpen) {
        setOverlayOpen(false);
        return;
      }
      goBack();
    },
    c: () => {
      if (busy) return;
      cancelSelected();
    },
    "?": () => {
      if (commandOpen) return;
      setOverlayOpen(!overlayOpen);
    },
    t: () => {
      if (busy) return;
      cycleTheme();
    },
  });

  // ⌘K / Ctrl-K is bound separately: `useKeys` maps bare `event.key`, and `k`
  // is already the list-navigation key.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setCommandOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ---- render -----------------------------------------------------------

  const currentRun = selectedRun ? findRun(runsBySession, selectedRun) : null;
  const showDetailOnly = !twoPane && route.name === "run";

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300} skipDelayDuration={0}>
        <div className="flex h-full overflow-hidden bg-background text-foreground">
          <Sidebar />

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="left" className="w-sidebar p-0">
              <SheetTitle className="sr-only">Sessions</SheetTitle>
              <SidebarBody onNavigate={() => setSheetOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar
              run={currentRun}
              onOpenSidebar={() => setSheetOpen(true)}
              onOpenCommand={() => setCommandOpen(true)}
              onBack={goBack}
            />

            <main className="min-h-0 flex-1">
              {route.name === "home" ? (
                <Pane paneKey="home">
                  <HomeView />
                </Pane>
              ) : twoPane ? (
                <ResizablePanelGroup direction="horizontal">
                  <ResizablePanel
                    id="runs"
                    defaultSize="34%"
                    minSize="340px"
                    maxSize="60%"
                    className="min-w-0 border-r border-border"
                  >
                    <RunsPane />
                  </ResizablePanel>
                  <ResizableHandle />
                  <ResizablePanel id="detail" minSize="360px" className="min-w-0">
                    <Pane paneKey={`detail-${selectedRun ?? "none"}`}>
                      <DetailPane />
                    </Pane>
                  </ResizablePanel>
                </ResizablePanelGroup>
              ) : (
                <Pane paneKey={showDetailOnly ? "detail" : "runs"}>
                  {showDetailOnly ? <DetailPane /> : <RunsPane />}
                </Pane>
              )}
            </main>
          </div>

          <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
          <ShortcutsDialog open={overlayOpen} onOpenChange={setOverlayOpen} />
          <Toaster />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}
