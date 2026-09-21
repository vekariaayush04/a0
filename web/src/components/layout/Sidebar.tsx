// Left sidebar: brand, the session list, and a footer with the theme toggle
// and the shortcuts button. 260px fixed at >=1100px; below that the same body
// is rendered inside a Sheet (see AppShell).

import { Keyboard, Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SessionList } from "@/features/sessions/SessionList";
import { cn } from "@/lib/utils";
import { cycleTheme, setOverlayOpen, useStore } from "@/state/store";

/** Sentinel mark: a ring with a centre dot. */
function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className={cn("h-[18px] w-[18px]", className)}
    >
      <circle cx="9" cy="9" r="6.75" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="2.25" fill="currentColor" />
    </svg>
  );
}

export function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const theme = useStore((s) => s.theme);
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 px-4">
        <Mark className="text-foreground" />
        <span className="text-13 font-semibold tracking-[-0.01em] text-foreground">
          Sentinel
        </span>
        <span className="mt-px font-mono text-10 text-muted-foreground">
          v{__APP_VERSION__}
        </span>
      </div>

      <div className="px-4 pb-2 pt-1">
        <p className="text-10 font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Sessions
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SessionList onNavigate={onNavigate} />
      </div>

      <div className="flex h-11 shrink-0 items-center gap-1 border-t border-border px-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={cycleTheme}
              className="h-7 gap-1.5 px-2 text-11 text-muted-foreground hover:text-foreground"
            >
              <ThemeIcon className="h-3.5 w-3.5" />
              <span className="capitalize">{theme}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Cycle theme (t)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Keyboard shortcuts"
              onClick={() => setOverlayOpen(true)}
              className="ml-auto h-7 w-7 text-muted-foreground hover:text-foreground"
            >
              <Keyboard className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Keyboard shortcuts (?)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-sidebar shrink-0 border-r border-border bg-elev-0 min-[1100px]:block">
      <SidebarBody />
    </aside>
  );
}
