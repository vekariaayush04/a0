// Pure derivations for the subagent detail pane. A transcript is a flat record
// list, so folding it into the run Log's entry shape lets the shared `Log`
// render it and lets Timeline chips scroll the matching row by id — the same
// contract the run detail relies on.

import type { SubagentNode, Transcript, TranscriptRecord } from "@/api/types";
import { toolTarget, type LogEntry } from "@/features/runs/derive";

/** Depth-first search of a run's subagent tree for the node with `index`. */
export function findSubagent(
  nodes: SubagentNode[],
  index: number,
): SubagentNode | null {
  for (const node of nodes) {
    if (node.index === index) return node;
    const nested = findSubagent(node.children, index);
    if (nested) return nested;
  }
  return null;
}

/** Map transcript records onto the run log's entry shape. Any record carrying
 *  a tool call becomes a collapsible tool row; user and assistant prose become
 *  text blocks. Transcript tools carry no timing, so their `startTs`/`endTs`
 *  stay null and the run Log renders them as resolved rows with no duration. */
export function transcriptEntries(records: TranscriptRecord[]): LogEntry[] {
  const entries: LogEntry[] = [];
  records.forEach((record, index) => {
    const tool = record.tool;
    if (tool) {
      entries.push({
        kind: "tool",
        id: `tool-${index}`,
        toolCallId: "",
        name: tool.name || "tool",
        target: toolTarget(tool.args),
        args: tool.args,
        result: tool.result,
        isError: tool.err === true,
        startTs: null,
        endTs: null,
      });
      return;
    }
    const text = record.text ?? "";
    if (!text.trim()) return;
    entries.push({
      kind: "assistant",
      id: `msg-${index}`,
      ts: typeof record.ts === "number" ? record.ts : null,
      text,
    });
  });
  return entries;
}

export type SubagentStats = {
  agent: string;
  model: string;
  status: string;
  cost: number;
  turns: number;
  durationMs: number | null;
};

/** Node facts with the transcript as a fallback when the run tree is
 *  unavailable. Timestamps are guarded: the daemon omits them on some trees. */
export function subagentStats(
  node: SubagentNode | null,
  transcript: Transcript,
): SubagentStats {
  const started = node?.started ?? null;
  const ended = node?.ended ?? null;
  return {
    agent: node?.agent || transcript.agent || "subagent",
    model: node?.model || transcript.model,
    status: node?.status ?? "done",
    cost: node?.cost ?? 0,
    turns: node?.turns ?? 0,
    durationMs:
      started !== null && ended !== null ? Math.max(0, ended - started) : null,
  };
}
