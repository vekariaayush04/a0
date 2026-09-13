// Inline keyboard key.

import type { ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[18px] items-center justify-center rounded-6 border border-line px-1 font-mono text-10 leading-[16px] text-fg2">
      {children}
    </kbd>
  );
}
