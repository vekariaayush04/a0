// Types for the a0 daemon API. Kept verbatim with the API contract in
// .superpowers/react/DESIGN-WEB.md so the daemon and web app share one shape.

export type Status = "queued" | "running" | "done" | "failed" | "cancelled";

export type Run = {
  id: string;
  sessionId: string;
  title: string;
  cwd: string;
  provider: string;
  model: string;
  thinking: string;
  status: Status;
  created: number;
  started: number | null;
  ended: number | null;
  exitCode: number | null;
  piSessionId: string | null;
  result: string | null;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  error: string | null;
};

export type Session = {
  id: string;
  cwd: string;
  title: string;
  firstSeen: number;
  lastSeen: number;
  runCount: number;
  runningCount: number;
  totalCost: number;
  cwds: string[];
};

export type Stats = {
  running: number;
  queued: number;
  runsToday: number;
  costToday: number;
  totalRuns: number;
  totalCost: number;
  tiers: { l1: string; l2: string; l3: string };
};

export type ToolCall = {
  name: string;
  target: string;
  t0: number;
  t1: number | null;
  err: boolean;
};

export type SubagentNode = {
  kind: "subagent";
  id: string;
  index: number;
  agent: string;
  model: string;
  task: string;
  status: "done" | "failed" | "running";
  cost: number;
  turns: number;
  started: number | null;
  ended: number | null;
  spawnedAt: number | null;
  tools: ToolCall[];
  children: SubagentNode[];
};

export type RunTree = {
  kind: "run";
  id: string;
  title: string;
  status: string;
  model: string;
  tier: string;
  cost: number;
  started: number | null;
  ended: number | null;
  tools: ToolCall[];
  children: SubagentNode[];
};

export type SessionTree = {
  kind: "session";
  id: string;
  title: string;
  runCount: number;
  totalCost: number;
  children: RunTree[];
};

export type TranscriptRecord = {
  ts: number;
  role: string;
  text?: string;
  tool?: { name: string; args: unknown; result: unknown; err: boolean };
};

export type Transcript = {
  agent: string;
  model: string;
  input: string;
  output: string;
  records: TranscriptRecord[];
};

// ---- Pi event stream (per-run SSE `event: event`) ----------------------

export type PiTextContent = { type: "text"; text: string };
export type PiThinkingContent = { type: "thinking" };
export type PiContent = PiTextContent | PiThinkingContent;

export type PiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  turns?: number;
};

export type PiMessageEndEvent = {
  type: "message_end";
  message: {
    role: string;
    content: PiContent[];
    usage?: PiUsage;
    stopReason?: string;
    errorMessage?: string;
  };
  ts: number;
};

export type PiToolStartEvent = {
  type: "tool_execution_start";
  toolCallId: string;
  toolName: string;
  args: unknown;
  ts: number;
};

export type PiToolEndEvent = {
  type: "tool_execution_end";
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError: boolean;
  ts: number;
};

export type PiEvent =
  | PiMessageEndEvent
  | PiToolStartEvent
  | PiToolEndEvent
  | { type: string; ts: number; [key: string]: unknown };
