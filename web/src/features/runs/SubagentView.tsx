// One subagent's transcript, shown in the detail pane for
// `#/r/<id>/sub/<n>`. Composed like the run detail: a header with the back
// button and status/model/cost facts, a Timeline strip of tool chips, a
// Log | Input | Output tab set, and a stats footer. The transcript is fetched
// per route with a request token so a stale response for a run the user has
// already left is dropped.

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";

import { getRunTree, getSubagentTranscript } from "@/api/client";
import type { SubagentNode, Transcript } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Log } from "@/features/runs/detail/Log";
import { isTerminal, logDomId, type LogEntry } from "@/features/runs/derive";
import {
  findSubagent,
  subagentStats,
  transcriptEntries,
  type SubagentStats,
} from "@/features/runs/subagent-derive";
import { StatusBadge, toolIcon } from "@/features/runs/status";
import { fmtCost, fmtMs } from "@/lib/format";
import { navigate, useRoute } from "@/lib/router";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-12 text-muted-foreground transition-colors duration-150 hover:text-foreground"
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      Back to run
    </button>
  );
}

function Header({
  stats,
  loading,
  onBack,
}: {
  stats: SubagentStats | null;
  loading: boolean;
  onBack: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-border px-5 pb-4 pt-4">
      <BackButton onClick={onBack} />

      <h1 className="mt-2.5 truncate text-20 font-semibold tracking-[-0.02em] text-foreground">
        {stats?.agent || "subagent"}
      </h1>

      {loading ? (
        <div className="mt-3 flex items-center gap-2">
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-[18px] w-20 rounded-md" />
          <Skeleton className="h-[18px] w-48 rounded-md" />
        </div>
      ) : stats ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
          <StatusBadge status={stats.status} />

          <Badge
            variant="outline"
            className="h-[18px] shrink-0 rounded-md border-border px-1.5 font-mono text-10 font-medium tracking-tight text-muted-foreground"
          >
            SUBAGENT
          </Badge>

          {stats.model ? (
            <Badge
              variant="outline"
              className="h-[18px] max-w-[18rem] shrink-0 rounded-md border-border px-1.5 font-mono text-10 font-medium tracking-tight text-foreground"
              title={stats.model}
            >
              <span className="truncate">{stats.model}</span>
            </Badge>
          ) : null}

          <span className="font-mono text-11 tabular-nums text-muted-foreground">
            {fmtCost(stats.cost)} · {stats.turns} turn
            {stats.turns === 1 ? "" : "s"} · {fmtMs(stats.durationMs)}
          </span>
        </div>
      ) : null}
    </header>
  );
}

/** The run timeline's chip row, built from the transcript's tool records.
 *  Clicking a chip reveals the Log and scrolls its matching row into view. */
function SubagentTimeline({
  entries,
  onPick,
}: {
  entries: LogEntry[];
  onPick: (id: string) => void;
}) {
  const tools = entries.filter((entry) => entry.kind === "tool");
  if (tools.length === 0) return null;

  return (
    <div className="relative shrink-0 border-b border-border">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent"
      />
      <div className="flex items-center gap-1.5 overflow-x-auto px-5 py-2.5 [scrollbar-width:thin]">
        {tools.map((entry) => {
          if (entry.kind !== "tool") return null;
          const Icon = toolIcon(entry.name);
          const label = entry.target ? `${entry.name} ${entry.target}` : entry.name;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onPick(entry.id)}
              title={entry.isError ? `${label} (error)` : label}
              className={cn(
                "inline-flex h-7 max-w-[15rem] shrink-0 items-center gap-1.5 rounded-md border px-2",
                "font-mono text-10 transition-colors duration-150",
                entry.isError
                  ? "border-foreground/30 bg-card text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground",
              )}
            >
              <Icon className="h-3 w-3 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Prose({ text, empty }: { text: string; empty: string }) {
  if (!text.trim()) {
    return <p className="px-5 py-4 text-12 text-muted-foreground">{empty}</p>;
  }
  return (
    <ScrollArea className="h-full">
      <p className="whitespace-pre-wrap break-words px-5 py-4 font-mono text-11 leading-[1.7] text-muted-foreground">
        {text}
      </p>
    </ScrollArea>
  );
}

function StatsCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-3.5 py-2">
      <span className="text-10 uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <span className="truncate font-mono text-11 tabular-nums text-foreground">
        {children}
      </span>
    </div>
  );
}

function StatsStrip({
  runId,
  index,
  stats,
}: {
  runId: string;
  index: number;
  stats: SubagentStats;
}) {
  return (
    <footer className="shrink-0 border-t border-border bg-elev-1">
      <div className="flex flex-wrap items-stretch divide-x divide-border">
        <div className="flex min-w-0 flex-col gap-0.5 px-3.5 py-2">
          <span className="text-10 uppercase tracking-[0.1em] text-muted-foreground">
            parent run
          </span>
          <a
            href={`#/r/${encodeURIComponent(runId)}`}
            title={runId}
            className="truncate font-mono text-11 text-foreground underline-offset-2 transition-colors duration-150 hover:underline"
          >
            {runId.slice(0, 8)}…
          </a>
        </div>
        <StatsCell label="index">{`#${index}`}</StatsCell>
        <StatsCell label="cost">{fmtCost(stats.cost)}</StatsCell>
        <StatsCell label="turns">{stats.turns}</StatsCell>
        <StatsCell label="duration">{fmtMs(stats.durationMs)}</StatsCell>
      </div>
    </footer>
  );
}

function LoadingBody() {
  return (
    <div
      className="flex flex-1 flex-col gap-3 px-5 py-4"
      aria-busy="true"
      aria-label="Loading transcript"
    >
      <Skeleton className="h-3.5 w-3/4 rounded-md" />
      <Skeleton className="h-3.5 w-full rounded-md" />
      <Skeleton className="h-3.5 w-5/6 rounded-md" />
      <Skeleton className="h-8 w-full rounded-md" />
      <Skeleton className="h-8 w-full rounded-md" />
      <Skeleton className="h-8 w-2/3 rounded-md" />
    </div>
  );
}

function CenteredEmpty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <p className="text-13 font-medium text-foreground">{title}</p>
      <p className="mt-1.5 max-w-[22rem] text-11 leading-relaxed text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

export function SubagentView() {
  const route = useRoute();
  const storeRun = useStore((state) => state.selectedRun);
  const storeSub = useStore((state) => state.selectedSub);
  const runId = route.name === "run" ? route.runId : storeRun;
  const subIndex =
    route.name === "run" && route.sub !== null ? route.sub : storeSub;

  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [node, setNode] = useState<SubagentNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("log");
  const requestId = useRef(0);

  useEffect(() => {
    if (!runId || subIndex === null) {
      setTranscript(null);
      setNode(null);
      setError(null);
      return;
    }
    const token = ++requestId.current;
    setTranscript(null);
    setNode(null);
    setError(null);
    setTab("log");
    void (async () => {
      try {
        const [nextTranscript, tree] = await Promise.all([
          getSubagentTranscript(runId, subIndex),
          getRunTree(runId).catch(() => null),
        ]);
        if (token !== requestId.current) return;
        setTranscript(nextTranscript);
        setNode(tree ? findSubagent(tree.children, subIndex) : null);
      } catch {
        if (token !== requestId.current) return;
        setError("Could not load subagent transcript");
      }
    })();
  }, [runId, subIndex]);

  const entries = useMemo(
    () => (transcript ? transcriptEntries(transcript.records) : []),
    [transcript],
  );
  const stats = useMemo(
    () => (transcript ? subagentStats(node, transcript) : null),
    [node, transcript],
  );

  if (!runId || subIndex === null) {
    return (
      <div className="flex h-full flex-col">
        <CenteredEmpty
          title="No subagent selected"
          hint="Pick a subagent from the run tree to read its transcript."
        />
      </div>
    );
  }

  const back = () => navigate({ name: "run", runId, sub: null });

  const onPick = (id: string) => {
    setTab("log");
    window.setTimeout(() => {
      document
        .getElementById(logDomId(id))
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 0);
  };

  const terminal = stats ? isTerminal(stats.status) : true;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header stats={stats} loading={!transcript && !error} onBack={back} />

      {error ? (
        <CenteredEmpty
          title={error}
          hint="The subagent may have been removed from this run, or the daemon is still starting it."
        />
      ) : !transcript || !stats ? (
        <LoadingBody />
      ) : (
        <>
          <SubagentTimeline entries={entries} onPick={onPick} />

          <Tabs
            value={tab}
            onValueChange={setTab}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="shrink-0 border-b border-border px-5 py-2">
              <TabsList className="h-7 bg-muted p-0.5">
                <TabsTrigger value="log" className="h-6 px-2.5 text-11">
                  Log
                </TabsTrigger>
                <TabsTrigger value="input" className="h-6 px-2.5 text-11">
                  Input
                </TabsTrigger>
                <TabsTrigger value="output" className="h-6 px-2.5 text-11">
                  Output
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="log" className="mt-0 min-h-0 flex-1 outline-none">
              <Log entries={entries} terminal={terminal} />
            </TabsContent>
            <TabsContent
              value="input"
              className="mt-0 min-h-0 flex-1 outline-none"
            >
              <Prose
                text={transcript.input}
                empty="No input captured for this subagent."
              />
            </TabsContent>
            <TabsContent
              value="output"
              className="mt-0 min-h-0 flex-1 outline-none"
            >
              <Prose
                text={transcript.output}
                empty={
                  terminal
                    ? "This subagent recorded no output."
                    : "The output arrives when the subagent finishes."
                }
              />
            </TabsContent>
          </Tabs>

          <StatsStrip runId={runId} index={subIndex} stats={stats} />
        </>
      )}
    </div>
  );
}

export default SubagentView;
