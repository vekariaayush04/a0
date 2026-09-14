// Collapsible brief: the first user message from the run's event stream.
// Closed by default.

import { useMemo } from "react";
import { useRunDetail } from "./data";
import { briefText } from "./derive";

export function Brief() {
  const { events } = useRunDetail();
  const text = useMemo(() => briefText(events), [events]);

  if (!text) return null;

  return (
    <details className="group border-b border-line px-4 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-11 uppercase tracking-[0.08em] text-fg3 transition-colors duration-150 hover:text-fg2 [&::-webkit-details-marker]:hidden">
        <span className="inline-block transition-transform duration-150 group-open:rotate-90">
          ▸
        </span>
        Brief
      </summary>
      <p className="mt-2 whitespace-pre-wrap font-mono text-11 leading-[1.6] text-fg2">
        {text}
      </p>
    </details>
  );
}
