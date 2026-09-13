// Lightweight hover/focus tooltip (no portal, no dependency).

import type { ReactNode } from "react";

export type TooltipProps = {
  label: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Tooltip({ label, children, className = "" }: TooltipProps) {
  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-6 border border-line bg-raised px-2 py-1 text-11 text-fg opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
