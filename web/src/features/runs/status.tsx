// Shared run vocabulary: the status glyph, the tier badge and the per-tool
// icon. Every screen that shows a run should pull these from here so a run
// looks identical in the list, the detail header, the timeline and the tree.

import {
  Bot,
  CheckCircle2,
  Circle,
  FileText,
  Globe,
  Loader2,
  MinusCircle,
  Pencil,
  Search,
  Terminal,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { Status } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Status glyph. Monochrome for every state except `running`, which is the one
 * place the accent is allowed: a spinning Loader2 in `text-live`.
 */
export function StatusGlyph({
  status,
  className,
}: {
  status: Status | string;
  className?: string;
}) {
  const base = cn("h-3.5 w-3.5 shrink-0", className);
  switch (status) {
    case "running":
      return (
        <Loader2
          aria-label="running"
          className={cn(base, "animate-spin text-live")}
        />
      );
    case "done":
      return (
        <CheckCircle2 aria-label="done" className={cn(base, "text-foreground")} />
      );
    case "failed":
      return (
        <XCircle aria-label="failed" className={cn(base, "text-foreground")} />
      );
    case "cancelled":
      return (
        <MinusCircle
          aria-label="cancelled"
          className={cn(base, "text-muted-foreground")}
        />
      );
    default:
      return (
        <Circle
          aria-label="queued"
          className={cn(base, "text-muted-foreground")}
        />
      );
  }
}

/** Small pulsing accent dot. The only other accent-bearing element. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="running"
      className={cn("live-dot relative h-1.5 w-1.5 shrink-0 rounded-full bg-live", className)}
    />
  );
}

/** Tier chip (L1 / L2 / L3 / custom). Mono, because it is an identifier. */
export function TierBadge({ tier, className }: { tier: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-[18px] shrink-0 rounded-md border-border px-1.5 font-mono text-10 font-medium tracking-tight text-muted-foreground",
        className,
      )}
    >
      {tier}
    </Badge>
  );
}

/** Status chip used in the run detail header. */
export function StatusBadge({ status }: { status: Status | string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 gap-1.5 rounded-md border-border px-2 text-11 font-medium capitalize",
        status === "running" ? "text-live" : "text-foreground",
      )}
    >
      <StatusGlyph status={status} className="h-3 w-3" />
      {status}
    </Badge>
  );
}

/** Map a Pi tool name to its lucide icon. Unknown tools get a wrench. */
export function toolIcon(name: string): LucideIcon {
  const key = name.toLowerCase();
  if (key.includes("subagent") || key.includes("agent") || key.includes("task")) {
    return Bot;
  }
  if (key.includes("bash") || key.includes("shell") || key.includes("exec")) {
    return Terminal;
  }
  if (key.includes("grep") || key.includes("search") || key.includes("find") || key.includes("glob")) {
    return Search;
  }
  if (key.includes("edit") || key.includes("write") || key.includes("patch") || key.includes("create")) {
    return Pencil;
  }
  if (key.includes("read") || key.includes("cat") || key.includes("file") || key.includes("notebook")) {
    return FileText;
  }
  if (key.includes("fetch") || key.includes("http") || key.includes("web") || key.includes("url")) {
    return Globe;
  }
  return Wrench;
}
