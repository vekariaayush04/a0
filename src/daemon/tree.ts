import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { Run } from "./store";

export type Tiers = { l1: string; l2: string; l3: string };

export type ToolCall = { name: string; target: string; t0: number; t1: number | null; err: boolean };

export type SubagentNode = {
  kind: "subagent"; id: string; index: number; agent: string; model: string; task: string;
  status: "done" | "failed" | "running"; cost: number; turns: number;
  started: number | null; ended: number | null; spawnedAt: number | null;
  tools: ToolCall[]; children: SubagentNode[];
};

export type RunTree = {
  kind: "run"; id: string; title: string; status: string; model: string; tier: string; cost: number;
  started: number | null; ended: number | null; tools: ToolCall[]; children: SubagentNode[];
};

export type TranscriptRecord = { ts: number; role: string; text?: string; tool?: { name: string; args: any; result: any; err: boolean } };
export type Transcript = { agent: string; model: string; input: string; output: string; records: TranscriptRecord[] };

// ---- generic helpers -------------------------------------------------

/** Reads a JSONL file tolerantly: skips blank/malformed lines. */
function readJsonl(path: string): any[] {
  if (!existsSync(path)) return [];
  const out: any[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip malformed line */ }
  }
  return out;
}

const isStart = (e: any) => e.type === "tool_execution_start" || e.sourceEventType === "tool_execution_start";
const isEnd = (e: any) => e.type === "tool_execution_end" || e.sourceEventType === "tool_execution_end";
const toolCallId = (e: any): string | undefined => e.toolCallId ?? e.id;
const toolNameOf = (e: any): string => e.toolName ?? e.name ?? "";

/** args as an object, whether given inline (`args`) or as a JSON string (`argsPayload`). */
function toolArgs(e: any): any {
  if (e.args && typeof e.args === "object") return e.args;
  if (typeof e.argsPayload === "string") { try { return JSON.parse(e.argsPayload); } catch { /* fall through */ } }
  return undefined;
}

/** target = args.path basename, or first 24 chars of args.command / args.query / argsPreview. Tolerant of missing args. */
function toolTarget(e: any): string {
  const args = toolArgs(e);
  if (args && typeof args.path === "string" && args.path) return basename(args.path);
  if (args && typeof args.command === "string") return args.command.slice(0, 24);
  if (args && typeof args.query === "string") return args.query.slice(0, 24);
  if (typeof e.argsPreview === "string") return e.argsPreview.slice(0, 24);
  return "";
}

/** Pairs tool_execution_start/end events (either main-run or subagent-transcript shape) by toolCallId. */
export function pairToolCalls(events: any[]): ToolCall[] {
  const pending = new Map<string, { name: string; target: string; t0: number }>();
  const out: ToolCall[] = [];
  for (const e of events) {
    if (isStart(e)) {
      const id = toolCallId(e); if (!id) continue;
      pending.set(id, { name: toolNameOf(e), target: toolTarget(e), t0: e.ts });
    } else if (isEnd(e)) {
      const id = toolCallId(e); if (!id) continue;
      const s = pending.get(id);
      if (s) { out.push({ name: s.name, target: s.target, t0: s.t0, t1: e.ts ?? null, err: !!e.isError }); pending.delete(id); }
    }
  }
  for (const s of pending.values()) out.push({ name: s.name, target: s.target, t0: s.t0, t1: null, err: false });
  return out.sort((a, b) => a.t0 - b.t0);
}

function tierFor(model: string, tiers: Tiers): string {
  if (model === tiers.l1) return "l1";
  if (model === tiers.l2) return "l2";
  if (model === tiers.l3) return "l3";
  return "custom";
}

// ---- subagent artifact discovery --------------------------------------

type MetaFile = { index: number; agent: string; base: string };

/** Parses `<runId>_<agent>_<index>_meta.json` filenames. Tolerant: skips names that don't match. */
function parseMetaFilename(name: string): MetaFile | null {
  const m = name.match(/^(.+)_([^_]+)_(\d+)_meta\.json$/);
  if (!m) return null;
  return { index: Number(m[3]), agent: m[2], base: name.slice(0, -"_meta.json".length) };
}

function listMetaFiles(artifactsDir: string): MetaFile[] {
  if (!existsSync(artifactsDir)) return [];
  const out: MetaFile[] = [];
  for (const name of readdirSync(artifactsDir)) {
    if (!statSync(join(artifactsDir, name)).isFile()) continue;
    const parsed = parseMetaFilename(name);
    if (parsed) out.push(parsed);
  }
  return out.sort((a, b) => a.index - b.index);
}

type SpawnCall = { agent: string; model: string; task: string; ts: number };

/** Spawn calls from the run's own events.jsonl: tool_execution_start on "subagent" with args.agent set (not args.action, which is a management call like list/models, not a spawn). */
function spawnCallsFromEvents(events: any[]): SpawnCall[] {
  const out: SpawnCall[] = [];
  for (const e of events) {
    if (e.type !== "tool_execution_start" || e.toolName !== "subagent") continue;
    const args = e.args;
    if (!args || typeof args.agent !== "string" || args.action !== undefined) continue;
    out.push({ agent: args.agent, model: typeof args.model === "string" ? args.model : "", task: String(args.task ?? "").slice(0, 200), ts: e.ts });
  }
  return out;
}

function subagentStatus(meta: any | null, hasInput: boolean): "done" | "failed" | "running" {
  if (meta && typeof meta.exitCode === "number") return meta.exitCode === 0 ? "done" : "failed";
  if (hasInput) return "running";
  return "running";
}

/** Builds tool calls for one subagent by reading its transcript.jsonl (if present). */
function subagentTools(artifactsDir: string, base: string): ToolCall[] {
  const events = readJsonl(join(artifactsDir, `${base}_transcript.jsonl`));
  return pairToolCalls(events.filter(e => e.sourceEventType === "tool_execution_start" || e.sourceEventType === "tool_execution_end"));
}

/** Best-effort walk for a nested subagent-artifacts dir belonging to a child run (subagents spawning their own subagents). Not exercised by the sample data; returns [] when absent. */
function nestedChildren(runDir: string, childRunId: string, tiers: Tiers, depth: number): SubagentNode[] {
  if (depth <= 0) return [];
  const candidates = [
    join(runDir, "pi-session", childRunId, "subagent-artifacts"),
    join(runDir, "pi-session", "subagent-artifacts", childRunId, "subagent-artifacts"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return buildChildren(dir, [], runDir, tiers, depth - 1);
  }
  return [];
}

function buildChildren(artifactsDir: string, spawnCalls: SpawnCall[], runDir: string, tiers: Tiers, depth: number): SubagentNode[] {
  const metaFiles = listMetaFiles(artifactsDir);
  const metaByIndex = new Map(metaFiles.map(m => [m.index, m]));
  const maxIndex = Math.max(spawnCalls.length - 1, metaFiles.length ? Math.max(...metaFiles.map(m => m.index)) : -1);
  const children: SubagentNode[] = [];
  for (let i = 0; i <= maxIndex; i++) {
    const spawn = spawnCalls[i];
    const mf = metaByIndex.get(i);
    let meta: any = null;
    if (mf) {
      const metaPath = join(artifactsDir, `${mf.base}_meta.json`);
      try { meta = JSON.parse(readFileSync(metaPath, "utf8")); } catch { meta = null; }
    }
    const hasInput = !!mf && existsSync(join(artifactsDir, `${mf.base}_input.md`));
    const id = meta?.runId ?? mf?.base.split("_")[0] ?? `unknown-${i}`;
    const agent = meta?.agent ?? mf?.agent ?? spawn?.agent ?? "";
    const model = meta?.model ?? spawn?.model ?? "";
    const cost = meta?.usage?.cost ?? 0;
    const turns = meta?.usage?.turns ?? 0;
    const ended = typeof meta?.timestamp === "number" ? meta.timestamp : null;
    const started = ended !== null && typeof meta?.durationMs === "number" ? ended - meta.durationMs : spawn?.ts ?? null;
    const task = spawn?.task ?? (meta?.task ? String(meta.task).slice(0, 200) : "");
    const tools = mf ? subagentTools(artifactsDir, mf.base) : [];
    children.push({
      kind: "subagent", id, index: i, agent, model, task,
      status: subagentStatus(meta, hasInput),
      cost, turns, started, ended, spawnedAt: spawn?.ts ?? null,
      tools, children: nestedChildren(runDir, id, tiers, depth),
    });
  }
  return children;
}

// ---- public API --------------------------------------------------------

/** Builds the full spawn tree for one run from its on-disk state. Pure: does not touch the network or the store beyond the given `run` record. */
export function buildRunTree(run: Run, runDir: string, tiers: Tiers): RunTree {
  const events = readJsonl(join(runDir, "events.jsonl"));
  const tools = pairToolCalls(events.filter(e => e.type === "tool_execution_start" || e.type === "tool_execution_end"));
  const spawnCalls = spawnCallsFromEvents(events);
  const artifactsDir = join(runDir, "pi-session", "subagent-artifacts");
  const children = buildChildren(artifactsDir, spawnCalls, runDir, tiers, 4);
  return {
    kind: "run", id: run.id, title: run.title, status: run.status, model: run.model,
    tier: tierFor(run.model, tiers), cost: run.cost, started: run.started, ended: run.ended,
    tools, children,
  };
}

/** Reads and normalizes one subagent's transcript by its childIndex within the run. Returns null if the run has no subagent artifacts or no subagent at that index. */
export function readSubagentTranscript(runDir: string, index: number): Transcript | null {
  const artifactsDir = join(runDir, "pi-session", "subagent-artifacts");
  const mf = listMetaFiles(artifactsDir).find(m => m.index === index);
  if (!mf) return null;
  const base = mf.base;
  let meta: any = null;
  try { meta = JSON.parse(readFileSync(join(artifactsDir, `${base}_meta.json`), "utf8")); } catch { /* tolerant */ }
  const input = existsSync(join(artifactsDir, `${base}_input.md`)) ? readFileSync(join(artifactsDir, `${base}_input.md`), "utf8") : "";
  const output = existsSync(join(artifactsDir, `${base}_output.md`)) ? readFileSync(join(artifactsDir, `${base}_output.md`), "utf8") : "";
  const lines = readJsonl(join(artifactsDir, `${base}_transcript.jsonl`));

  const results = new Map<string, { text: any; err: boolean }>();
  for (const l of lines) {
    if (l.sourceEventType === "message_end" && l.role === "toolResult" && l.toolCallId) {
      results.set(l.toolCallId, { text: l.text, err: !!l.isError });
    }
  }
  const pendingStarts = new Map<string, { name: string; args: any; ts: number }>();
  const records: TranscriptRecord[] = [];
  for (const l of lines) {
    if (l.sourceEventType === "initial_prompt" || (l.sourceEventType === "message_end" && (l.role === "user" || l.role === "assistant"))) {
      records.push({ ts: l.ts, role: l.role, text: l.text ?? "" });
    } else if (l.sourceEventType === "tool_execution_start") {
      const id = l.toolCallId; if (!id) continue;
      pendingStarts.set(id, { name: toolNameOf(l), args: toolArgs(l), ts: l.ts });
    } else if (l.sourceEventType === "tool_execution_end") {
      const id = l.toolCallId; const s = id ? pendingStarts.get(id) : undefined;
      if (s) {
        const r = id ? results.get(id) : undefined;
        records.push({ ts: s.ts, role: "tool", tool: { name: s.name, args: s.args, result: r?.text ?? null, err: !!l.isError || !!r?.err } });
        pendingStarts.delete(id);
      }
    }
  }
  records.sort((a, b) => a.ts - b.ts);
  return { agent: meta?.agent ?? mf.agent, model: meta?.model ?? "", input, output, records };
}
