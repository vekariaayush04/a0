// Small hairline pill used for tiers and statuses.

import type { ReactNode } from "react";

export type PillProps = {
  children: ReactNode;
  mono?: boolean;
  className?: string;
  title?: string;
};

export function Pill({ children, mono = false, className = "", title }: PillProps) {
  return (
    <span
      title={title}
      className={[
        "inline-flex items-center rounded-6 border border-line px-1.5 py-0.5 text-10 leading-4 text-fg2",
        mono ? "font-mono" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
