// Sticky bottom stats strip: tokens, cost, duration, exit code, Pi session id
// (click to copy) and any run error.

import { useEffect, useState } from "react";
import { fmtCost, fmtMs } from "../../lib/format";
import { useNow, useRunDetail } from "./data";
import { firstLine, runDuration } from "./derive";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the execCommand path */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-9999px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function StatsStrip() {
  const { run } = useRunDetail();
  const [copied, setCopied] = useState(false);
  const running = run?.status === "running";
  const now = useNow(running);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!run) return null;

  const duration = runDuration(run, now);
  const sessionId = run.piSessionId;

  const onCopy = async () => {
    if (!sessionId) return;
    const ok = await copyText(sessionId);
    if (ok) setCopied(true);
  };

  return (
    <div className="sticky bottom-0 z-10 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-t border-line bg-bg px-4 py-2 text-11 text-fg2">
      <span>
        tokens{" "}
        <span className="text-fg">{run.inputTokens.toLocaleString()}</span> in ·{" "}
        <span className="text-fg">{run.outputTokens.toLocaleString()}</span> out
      </span>

      <span>
        cost <span className="text-fg">{fmtCost(run.cost)}</span>
      </span>

      <span>
        duration <span className="text-fg">{fmtMs(duration)}</span>
      </span>

      <span>
        exit <span className="text-fg">{run.exitCode ?? "—"}</span>
      </span>

      {sessionId ? (
        <button
          type="button"
          onClick={onCopy}
          title={`Copy Pi session id: ${sessionId}`}
          className="inline-flex items-center gap-1 rounded-6 px-1 py-0.5 transition-colors duration-150 hover:bg-hover hover:text-fg"
        >
          pi session{" "}
          <span className="font-mono text-fg">
            {copied ? "copied" : `${sessionId.slice(0, 8)}…`}
          </span>
        </button>
      ) : null}

      {run.error ? (
        <span className="min-w-0 truncate text-fg" title={run.error}>
          error {firstLine(run.error, 72)}
        </span>
      ) : null}
    </div>
  );
}
