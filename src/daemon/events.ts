export type PiEvent = { type: string; [k: string]: any };
export type RunSummary = { piSessionId?: string; result: string; inputTokens: number; outputTokens: number; cost: number; error?: string };

export function parseLine(line: string): PiEvent | null {
  const t = line.trim();
  if (!t.startsWith("{")) return null;
  try { const o = JSON.parse(t); return typeof o?.type === "string" ? o : null; } catch { return null; }
}

const textOf = (m: any) => Array.isArray(m?.content) ? m.content.filter((c: any) => c?.type === "text").map((c: any) => c.text).join("") : "";

export function summarize(events: PiEvent[]): RunSummary {
  const s: RunSummary = { result: "", inputTokens: 0, outputTokens: 0, cost: 0 };
  for (const e of events) {
    if (e.type === "session" && typeof e.id === "string") s.piSessionId = e.id;
    if (e.type === "message_end" && e.message?.role === "assistant") {
      const m = e.message;
      s.inputTokens += m.usage?.input ?? 0;
      s.outputTokens += m.usage?.output ?? 0;
      s.cost += m.usage?.cost?.total ?? 0;
      if (m.stopReason === "error") s.error = String(m.errorMessage ?? "unknown error");
      const text = textOf(m);
      if (text) s.result = text;
    }
  }
  return s;
}
