// Top bar inside the content area: breadcrumb on the left, live stats and the
// command-palette button on the right. The menu button (sidebar sheet) and the
// back chevron only appear at the breakpoints that need them.

import { ChevronLeft, ChevronRight, Menu, Search } from "lucide-react";

import type { Run } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveDot } from "@/features/runs/status";
import { fmtCost } from "@/lib/format";
import { navigate, useRoute } from "@/lib/router";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";

/** A stat chip. `live` is the only one allowed the accent, and only when >0. */
function StatChip({
  value,
  label,
  live = false,
}: {
  value: string | number;
  label: string;
  live?: boolean;
}) {
  return (
    <Badge
      variant="outline"
      className="h-6 gap-1.5 rounded-md border-border px-2 text-11 font-normal text-muted-foreground"
    >
      {live ? <LiveDot /> : null}
      <span
        className={cn(
          "font-mono font-medium",
          live ? "text-live" : "text-foreground",
        )}
      >
        {value}
      </span>
      {label}
    </Badge>
  );
}

function Crumb({
  children,
  onClick,
  current = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  current?: boolean;
}) {
  const className = cn(
    "max-w-[14rem] truncate rounded-md px-1 text-12",
    current
      ? "font-medium text-foreground"
      : "text-muted-foreground transition-colors duration-150 hover:text-foreground",
  );
  if (current || !onClick) {
    return (
      <span aria-current={current ? "page" : undefined} className={className}>
        {children}
      </span>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

export function Topbar({
  run,
  onOpenSidebar,
  onOpenCommand,
  onBack,
}: {
  run: Run | null;
  onOpenSidebar: () => void;
  onOpenCommand: () => void;
  onBack: () => void;
}) {
  const stats = useStore((s) => s.stats);
  const sessions = useStore((s) => s.sessions);
  const selectedSession = useStore((s) => s.selectedSession);
  const route = useRoute();

  const session = sessions.find((s) => s.id === selectedSession) ?? null;
  const running = stats?.running ?? 0;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-elev-0 px-3">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open sessions"
        onClick={onOpenSidebar}
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground min-[1100px]:hidden"
      >
        <Menu className="h-4 w-4" />
      </Button>

      {route.name !== "home" ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back"
          title="Back (Esc)"
          onClick={onBack}
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground min-[700px]:hidden"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      ) : null}

      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-0.5">
        {session ? (
          <Crumb
            current={route.name !== "run"}
            onClick={() => navigate({ name: "session", sessionId: session.id })}
          >
            {session.title || session.id}
          </Crumb>
        ) : (
          <Crumb current>Sentinel</Crumb>
        )}

        {route.name === "run" ? (
          <>
            <ChevronRight
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
            />
            <Crumb current>{run?.title ?? "Run"}</Crumb>
          </>
        ) : null}
      </nav>

      <div className="hidden shrink-0 items-center gap-1.5 min-[860px]:flex">
        <StatChip value={running} label="running" live={running > 0} />
        <StatChip value={stats?.queued ?? 0} label="queued" />
        <StatChip value={stats?.runsToday ?? 0} label="today" />
        <StatChip value={fmtCost(stats?.costToday ?? 0)} label="spend" />
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onOpenCommand}
        className="h-7 shrink-0 gap-1.5 px-2 text-11 text-muted-foreground hover:text-foreground"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="ml-0.5 hidden rounded border border-border px-1 font-mono text-10 leading-4 sm:inline">
          ⌘K
        </kbd>
      </Button>
    </header>
  );
}
