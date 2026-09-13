// Typed fetchers for every daemon GET route, plus cancelRun (POST).
// All paths are same-origin: the daemon serves the built app at `/`.

import type {
  Run,
  Session,
  SessionTree,
  Stats,
  RunTree,
  Transcript,
} from "./types";

async function json<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const getSessions = () => json<Session[]>("/api/sessions");
export const getRuns = () => json<Run[]>("/api/runs");
export const getSessionRuns = (sessionId: string) =>
  json<Run[]>(`/api/sessions/${encodeURIComponent(sessionId)}/runs`);
export const getRun = (runId: string) =>
  json<Run>(`/api/runs/${encodeURIComponent(runId)}`);
export const getStats = () => json<Stats>("/api/stats");
export const getRunTree = (runId: string) =>
  json<RunTree>(`/api/runs/${encodeURIComponent(runId)}/tree`);
export const getSessionTree = (sessionId: string) =>
  json<SessionTree>(`/api/sessions/${encodeURIComponent(sessionId)}/tree`);
export const getSubagentTranscript = (runId: string, index: number) =>
  json<Transcript>(
    `/api/runs/${encodeURIComponent(runId)}/subagents/${index}/transcript`,
  );

export const waitRun = (runId: string, timeoutSeconds?: number) => {
  const q =
    timeoutSeconds !== undefined ? `?timeout=${encodeURIComponent(String(timeoutSeconds))}` : "";
  return json<Run>(`/api/runs/${encodeURIComponent(runId)}/wait${q}`);
};

export async function getRunResult(runId: string): Promise<string> {
  const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/result`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

export async function cancelRun(runId: string): Promise<Run> {
  const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as Run;
}
