// One subagent's transcript, shown in the detail column for the
// `#/r/<id>/sub/<n>` route. Records are rendered like the run Log: assistant
// text pre-wrapped, tool rows collapsible to capped JSON, errors marked with
// a left bar. Fetches are token-guarded so a stale response for a route the
// user has already left is dropped.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  SubagentNode,
  Transcript,
  TranscriptRecord,
} from "../../api/types";
import { getRunTree, getSubagentTranscript } from "../../api/client";
import { fmtCost, fmtMs } from "../../lib/format";
import { navigate, useRoute } from "../../lib/router";
import { Empty } from "../../ui/Empty";
import { Glyph } from "../../ui/Glyph";
import { Pill } from "../../ui/Pill";
import { ChevronLeft } from "../../ui/icons";
import { useStore } from "../../state/store";
import { stringifyCapped, toolTarget } from "../RunDetail/derive";

function findSubagent(
  nodes: SubagentNode[],
  index: number,
): SubagentNode | null {
  const direct = nodes.find((node) => node.index === index);
  if (direct) return direct;
  for (const node of nodes) {
    const nested = findSubagent(node.children, index);
    if (nested) return nested;
  }
  return null;
}

function TextBlock({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <p className="whitespace-pre-wrap break-words text-13 leading-[1.55] text-fg">
      {text}
    </p>
  );
}

function ToolRecord({ record }: { record: TranscriptRecord }) {
  const tool = record.tool;
  if (!tool) return null;
  const target = toolTarget(tool.args);
  const args = stringifyCapped(tool.args);
  const result = stringifyCapped(tool.result);
  return (
    <details
      className={`group rounded-6 ${
        tool.err ? "border-l-2 border-fg pl-2" : ""
      }`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-6 px-1 py-1 text-13 text-fg2 hover:bg-hover">
        <span className="text-fg4 transition-transform group-open:rotate-90">
          ▸
        </span>
        <span className="font-mono text-11 text-fg">{tool.name}</span>
        {target ? (
          <span className="truncate font-mono text-11 text-fg3">{target}</span>
        ) : null}
        {tool.err ? <span className="text-11 text-fg">error</span> : null}
      </summary>
      <div className="ml-4 mt-1 space-y-2 border-l border-line pl-3">
        <div>
          <p className="text-11 uppercase tracking-[0.08em] text-fg3">args</p>
          <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-11 text-fg2">
            {args.text}
            {args.truncated ? "\n… truncated" : ""}
          </pre>
        </div>
        {tool.result !== null && tool.result !== undefined ? (
          <div>
            <p className="text-11 uppercase tracking-[0.08em] text-fg3">
              result
            </p>
            <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-11 text-fg2">
              {result.text}
              {result.truncated ? "\n… truncated" : ""}
            </pre>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function RecordRow({ record }: { record: TranscriptRecord }) {
  if (record.tool) return <ToolRecord record={record} />;
  return <TextBlock text={record.text ?? ""} />;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-11 uppercase tracking-[0.08em] text-fg3">{title}</h2>
      {children}
    </section>
  );
}

export function SubagentView() {
  const route = useRoute();
  const storeRun = useStore((state) => state.selectedRun);
  const storeSub = useStore((state) => state.selectedSub);
  const runId =
    route.name === "run" ? route.runId : storeRun;
  const subIndex =
    route.name === "run" && route.sub !== null ? route.sub : storeSub;

  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [node, setNode] = useState<SubagentNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!runId || subIndex === null) {
      setTranscript(null);
      setNode(null);
      setError(null);
      return;
    }
    const token = ++requestId.current;
    setTranscript(null);
    setNode(null);
    setError(null);
    void (async () => {
      try {
        const [nextTranscript, tree] = await Promise.all([
          getSubagentTranscript(runId, subIndex),
          getRunTree(runId).catch(() => null),
        ]);
        if (token !== requestId.current) return;
        setTranscript(nextTranscript);
        setNode(tree ? findSubagent(tree.children, subIndex) : null);
      } catch {
        if (token !== requestId.current) return;
        setError("Could not load subagent transcript");
      }
    })();
  }, [runId, subIndex]);

  if (!runId || subIndex === null) {
    return <Empty title="No subagent selected" />;
  }

  const back = () => navigate({ name: "run", runId, sub: null });

  if (!transcript && !error) {
    return (
      <div className="space-y-4 p-6" aria-busy="true" aria-label="Loading transcript">
        <div className="h-4 w-24 animate-pulse rounded-6 bg-hover" />
        <div className="h-7 w-64 animate-pulse rounded-6 bg-hover" />
        <div className="space-y-2">
          <div className="h-4 w-full animate-pulse rounded-6 bg-hover" />
          <div className="h-4 w-5/6 animate-pulse rounded-6 bg-hover" />
          <div className="h-4 w-2/3 animate-pulse rounded-6 bg-hover" />
        </div>
      </div>
    );
  }

  if (error || !transcript) {
    return (
      <div className="space-y-3 p-6">
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-1 text-12 text-fg2 transition-colors hover:text-fg"
        >
          <ChevronLeft size={14} />
          back to run
        </button>
        <Empty title={error ?? "No transcript"} />
      </div>
    );
  }

  const status = node?.status ?? "done";
  const model = node?.model || transcript.model;
  const duration =
    node && node.started !== null && node.ended !== null
      ? fmtMs(node.ended - node.started)
      : null;
  const stats = [
    fmtCost(node?.cost ?? 0),
    `${node?.turns ?? 0} turn${(node?.turns ?? 0) === 1 ? "" : "s"}`,
    duration,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-2xl">
      <div className="border-b border-line px-6 py-5">
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-1 text-12 text-fg2 transition-colors hover:text-fg"
        >
          <ChevronLeft size={14} />
          back to run
        </button>
        <div className="mt-3 flex items-center gap-2.5">
          <Glyph status={status} size={14} />
          <h1 className="text-26 font-semibold tracking-[-0.02em]">
            {transcript.agent || "subagent"}
          </h1>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill>{status}</Pill>
          {model ? <Pill mono>{model}</Pill> : null}
          <Pill>SUBAGENT</Pill>
          <span className="text-12 text-fg3">{stats}</span>
        </div>
      </div>

      <div className="space-y-6 px-6 py-5">
        <Section title="Input">
          <TextBlock text={transcript.input} />
        </Section>

        <Section title="Records">
          <div className="space-y-2">
            {transcript.records.length === 0 ? (
              <p className="text-12 text-fg3">No records.</p>
            ) : (
              transcript.records.map((record, index) => (
                <RecordRow key={`${record.ts}-${index}`} record={record} />
              ))
            )}
          </div>
        </Section>

        <Section title="Output">
          <TextBlock text={transcript.output} />
        </Section>
      </div>
    </div>
  );
}
