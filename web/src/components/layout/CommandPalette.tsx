// Cmd/Ctrl-K command palette: every session and every cached run, plus the
// handful of view actions. Selecting an item navigates; the App owns the open
// state so the `k` list shortcut and the palette cannot both fire.

import { useMemo } from "react";
import { Moon, PanelsTopLeft, Sun } from "lucide-react";

import type { Run } from "@/api/types";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { StatusGlyph } from "@/features/runs/status";
import { fmtCost, shortPath, tierLabel } from "@/lib/format";
import { navigate } from "@/lib/router";
import {
  cycleTheme,
  selectRun,
  selectSession,
  useStore,
} from "@/state/store";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const runsBySession = useStore((s) => s.runsBySession);
  const tiers = useStore((s) => s.stats?.tiers ?? null);

  // Runs from every cached session, newest first, capped so the list stays fast.
  const runs = useMemo(() => {
    const all: Run[] = [];
    for (const list of Object.values(runsBySession)) all.push(...list);
    all.sort((a, b) => (b.created || 0) - (a.created || 0));
    return all.slice(0, 100);
  }, [runsBySession]);

  const close = () => onOpenChange(false);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search sessions and runs…" />
      <CommandList className="max-h-[22rem]">
        <CommandEmpty>No matches.</CommandEmpty>

        <CommandGroup heading="Sessions">
          {sessions.map((session) => (
            <CommandItem
              key={session.id}
              value={`session ${session.title} ${session.id} ${session.cwd}`}
              onSelect={() => {
                selectSession(session.id);
                navigate({ name: "session", sessionId: session.id });
                close();
              }}
            >
              <PanelsTopLeft className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {session.title || session.id}
              </span>
              <span className="shrink-0 font-mono text-10 text-muted-foreground">
                {session.runCount} · {fmtCost(session.totalCost)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        {runs.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Runs">
              {runs.map((run) => (
                <CommandItem
                  key={run.id}
                  value={`run ${run.title} ${run.id} ${run.model} ${run.cwd}`}
                  onSelect={() => {
                    selectSession(run.sessionId);
                    selectRun(run.id);
                    navigate({ name: "run", runId: run.id, sub: null });
                    close();
                  }}
                >
                  <StatusGlyph status={run.status} className="h-3.5 w-3.5" />
                  <span className="min-w-0 flex-1 truncate">
                    {run.title || run.id}
                  </span>
                  <span className="shrink-0 font-mono text-10 text-muted-foreground">
                    {tierLabel(run.model, tiers)} · {shortPath(run.cwd)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="toggle theme dark light"
            onSelect={() => {
              cycleTheme();
              close();
            }}
          >
            <Sun className="h-3.5 w-3.5 text-muted-foreground dark:hidden" />
            <Moon className="hidden h-3.5 w-3.5 text-muted-foreground dark:block" />
            Cycle theme
            <CommandShortcut>t</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
