// Real top bar: brand, live stats chips, theme toggle, `?` key overlay.

import { useState } from "react";
import { fmtCost } from "../lib/format";
import { useKeys } from "../lib/keys";
import { cycleTheme, useStore } from "../state/store";
import { Auto, Mark, Moon, Sun } from "../ui/icons";
import { KeyOverlay } from "./KeyOverlay";

function Chip({
  value,
  label,
  dot = false,
}: {
  value: number | string;
  label: string;
  dot?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-12 text-fg2">
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
      <span className="font-semibold text-fg">{value}</span>
      {label}
    </span>
  );
}

export function TopBar() {
  const stats = useStore((s) => s.stats);
  const theme = useStore((s) => s.theme);
  const [showKeys, setShowKeys] = useState(false);

  // App owns the single /api/events subscription and keeps `stats` fresh.
  useKeys({
    "?": () => setShowKeys((open) => !open),
    t: () => cycleTheme(),
  });

  const running = stats?.running ?? 0;
  const queued = stats?.queued ?? 0;
  const runsToday = stats?.runsToday ?? 0;
  const costToday = stats?.costToday ?? 0;

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Auto;

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between border-b border-line bg-bg px-4 shadow-[0_1px_0_var(--line)]">
      <a
        href="#"
        className="flex items-center gap-2 text-15 font-semibold tracking-[-0.01em] text-fg"
      >
        <Mark size={18} />
        <span>Sentinel</span>
      </a>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-4 min-[700px]:flex">
          <Chip value={running} label="running" dot={running > 0} />
          <Chip value={queued} label="queued" />
          <Chip value={runsToday} label="runs today" />
          <span className="whitespace-nowrap text-12 text-fg2">
            <span className="font-semibold text-fg">{fmtCost(costToday)}</span> today
          </span>
        </div>

        <button
          type="button"
          aria-label={`Theme: ${theme}`}
          title={`Theme: ${theme} (t)`}
          className="rounded-6 p-1.5 text-fg2 transition-colors duration-150 hover:bg-hover hover:text-fg"
          onClick={cycleTheme}
        >
          <ThemeIcon size={16} />
        </button>

        <button
          type="button"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          className="rounded-6 px-1.5 py-0.5 text-13 text-fg3 transition-colors duration-150 hover:bg-hover hover:text-fg"
          onClick={() => setShowKeys(true)}
        >
          ?
        </button>
      </div>

      {showKeys ? <KeyOverlay onClose={() => setShowKeys(false)} /> : null}
    </header>
  );
}
