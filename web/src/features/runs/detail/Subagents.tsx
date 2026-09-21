// Subagents strip: one chip per subagent the run's Pi agent spawned, each
// opening that subagent's transcript. Renders nothing for runs without any.

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";

import { getRunTree } from "@/api/client";
import type { Run, SubagentNode } from "@/api/types";
import { isTerminal } from "@/features/runs/derive";
import { fmtCost } from "@/lib/format";
import { navigate } from "@/lib/router";

import { StatusGlyph } from "../status";

export function Subagents({ run }: { run: Run }) {
  const [nodes, setNodes] = useState<SubagentNode[]>([]);
  const terminal = isTerminal(run.status);

  // Refetch while the run is live (subagents appear mid-flight), once after.
  useEffect(() => {
    let alive = true;
    const load = () =>
      getRunTree(run.id)
        .then((tree) => alive && setNodes(tree.children))
        .catch(() => {
          /* the strip is optional; the log still shows the spawn calls */
        });
    setNodes([]);
    void load();
    const timer = terminal ? null : setInterval(load, 5000);
    return () => {
      alive = false;
      if (timer !== null) clearInterval(timer);
    };
  }, [run.id, terminal]);

  if (nodes.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border px-5 py-2">
      <span className="shrink-0 text-10 uppercase tracking-[0.1em] text-muted-foreground">
        Subagents
      </span>
      {nodes.map((node) => (
        <button
          key={node.index}
          type="button"
          onClick={() => navigate({ name: "run", runId: run.id, sub: node.index })}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-left transition-colors duration-150 hover:border-foreground/30"
        >
          <Bot className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-12 font-medium text-foreground">
            {node.agent || `subagent ${node.index}`}
          </span>
          <span className="font-mono text-10 text-muted-foreground">{node.model}</span>
          <span className="font-mono text-10 tabular-nums text-muted-foreground">
            {fmtCost(node.cost)}
          </span>
          <StatusGlyph status={node.status} className="h-3 w-3" />
        </button>
      ))}
    </div>
  );
}
