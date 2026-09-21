// One labelled stat column. Shared by the run and subagent stats strips so a
// column of numbers lines up identically under both. Labels are muted
// uppercase; values are mono and tabular.

import { cn } from "@/lib/utils";

export function Cell({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5 px-3.5 py-2", className)}>
      <span className="text-10 uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <span className="truncate font-mono text-11 tabular-nums text-foreground">
        {children}
      </span>
    </div>
  );
}
