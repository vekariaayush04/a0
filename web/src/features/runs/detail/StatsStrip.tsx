// Bottom stats strip: tokens, cost, duration, exit code and the Pi session id
// with a copy button. A bordered strip of labelled cells rather than a run of
// inline text, so the numbers line up under the log's right edge.

import { memo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import type { Run } from "@/api/types";
import { Button } from "@/components/ui/button";
import { firstLine, runDuration } from "@/features/runs/derive";
import { useNow } from "@/features/runs/hooks";
import { copyText } from "@/lib/clipboard";
import { fmtCost, fmtMs } from "@/lib/format";
import { Cell } from "./StatsCell";

export const StatsStrip = memo(function StatsStrip({ run }: { run: Run | null }) {
  const [copied, setCopied] = useState(false);
  const running = run?.status === "running";
  const now = useNow(running);

  if (!run) return null;

  const sessionId = run.piSessionId;

  const onCopy = async () => {
    if (!sessionId) return;
    if (await copyText(sessionId)) {
      setCopied(true);
      toast("Pi session id copied", { description: sessionId });
      setTimeout(() => setCopied(false), 1400);
    } else {
      toast("Could not copy to the clipboard");
    }
  };

  return (
    <footer className="shrink-0 border-t border-border bg-elev-1">
      <div className="flex flex-wrap items-stretch divide-x divide-border">
        <Cell label="tokens">
          {run.inputTokens.toLocaleString()} ↓ {run.outputTokens.toLocaleString()} ↑
        </Cell>
        <Cell label="cost">{fmtCost(run.cost)}</Cell>
        <Cell label="duration">{fmtMs(runDuration(run, now))}</Cell>
        <Cell label="exit">{run.exitCode ?? "—"}</Cell>

        {sessionId ? (
          <div className="flex min-w-0 flex-col gap-0.5 px-3.5 py-2">
            <span className="text-10 uppercase tracking-[0.1em] text-muted-foreground">
              pi session
            </span>
            <div className="flex items-center gap-1">
              <span className="truncate font-mono text-11 text-foreground">
                {sessionId.slice(0, 8)}…
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Copy Pi session id"
                title={sessionId}
                onClick={onCopy}
                className="h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground"
              >
                {copied ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        ) : null}

        {run.error ? (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 border-l-2 border-l-foreground px-3.5 py-2">
            <span className="text-10 uppercase tracking-[0.1em] text-muted-foreground">
              error
            </span>
            <span className="truncate text-11 text-foreground" title={run.error}>
              {firstLine(run.error, 96)}
            </span>
          </div>
        ) : null}
      </div>
    </footer>
  );
});
