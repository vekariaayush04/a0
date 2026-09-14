// SVG spawn tree, rendered in the runs column when the store view is "tree".
//
// The geometry comes entirely from `./layout`; this file only paints it and
// wires up navigation. Titles are ellipsized with a canvas `measureText` so
// they fit the fixed 220px node width in any font. Tool ticks are HTML
// overlays (they need the shared `Tooltip` primitive); everything else is
// SVG.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RunTree, SessionTree, SubagentNode } from "../../api/types";
import { getSessionTree } from "../../api/client";
import { useGlobalStatus } from "../../api/sse";
import { fmtCost, fmtMs } from "../../lib/format";
import { navigate } from "../../lib/router";
import { Empty } from "../../ui/Empty";
import { Tooltip } from "../../ui/Tooltip";
import { useStore } from "../../state/store";
import { layoutSession, type Layout, type LayoutNode } from "./layout";

const FONT_TITLE =
  '500 13px -apple-system, "SF Pro Text", system-ui, sans-serif';
const FONT_MONO = '10px ui-monospace, "SF Mono", Menlo, monospace';

let measureCanvas: HTMLCanvasElement | null = null;

/** Width of `text` in `font`, using a lazily-created hidden canvas. */
function measureText(text: string, font: string): number {
  if (typeof document === "undefined") return text.length * 6.5;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return text.length * 6.5;
  ctx.font = font;
  return ctx.measureText(text).width;
}

function ellipsize(text: string, maxWidth: number, font: string): string {
  if (maxWidth <= 0) return "";
  if (measureText(text, font) <= maxWidth) return text;
  const ellipsis = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureText(text.slice(0, mid) + ellipsis, font) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}

function titleOf(node: LayoutNode): string {
  if (node.kind === "session") return (node.ref as SessionTree).title;
  if (node.kind === "run") return (node.ref as RunTree).title;
  return (node.ref as SubagentNode).agent || "subagent";
}

function durationOf(node: LayoutNode): string {
  if (node.kind === "session") return "";
  if (node.queued) return "queued";
  if (node.started === null) return "";
  const end = node.ended ?? Date.now();
  return fmtMs(Math.max(0, end - node.started));
}

function metaOf(node: LayoutNode): string {
  if (node.kind === "session") {
    const tree = node.ref as SessionTree;
    return `${tree.runCount} run${tree.runCount === 1 ? "" : "s"} · ${fmtCost(
      tree.totalCost,
    )}`;
  }
  if (node.kind === "run") {
    const run = node.ref as RunTree;
    const cost = fmtCost(run.cost);
    return node.queued ? `${run.model} · queued` : `${durationOf(node)} · ${cost}`;
  }
  const child = node.ref as SubagentNode;
  return `${child.model || "subagent"} · ${fmtCost(child.cost)}`;
}

function tierLabelOf(node: LayoutNode): string | null {
  if (node.kind === "run") return (node.ref as RunTree).tier || null;
  return null;
}

function statusOf(node: LayoutNode): string {
  if (node.kind === "session") return "session";
  return node.status;
}

/** Status glyph drawn directly in SVG (the shared `Glyph` is HTML-only). */
function SvgGlyph({
  status,
  cx,
  cy,
}: {
  status: string;
  cx: number;
  cy: number;
}) {
  if (status === "running") {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="var(--accent)"
        className="pulse"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    );
  }
  if (status === "done") {
    return <circle cx={cx} cy={cy} r={4} fill="var(--fg)" />;
  }
  if (status === "failed") {
    return (
      <g stroke="var(--fg-4)" strokeWidth={1.5} fill="none">
        <circle cx={cx} cy={cy} r={4.75} />
        <path
          d={`M${cx - 2} ${cy - 2}l4 4M${cx + 2} ${cy - 2}l-4 4`}
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (status === "cancelled") {
    return (
      <path
        d={`M${cx - 3} ${cy}h6`}
        stroke="var(--fg-4)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    );
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4.25}
      fill="none"
      stroke="var(--fg-3)"
      strokeWidth={1.5}
    />
  );
}

/** Session card mark: a small ring with a centre dot. */
function SessionMark({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g stroke="var(--fg-2)" fill="none">
      <circle cx={cx} cy={cy} r={5.5} strokeWidth={1.4} />
      <circle cx={cx} cy={cy} r={1.6} fill="var(--fg-2)" stroke="none" />
    </g>
  );
}

function SvgPill({ x, y, label }: { x: number; y: number; label: string }) {
  const width = measureText(label, FONT_MONO) + 12;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={16}
        rx={6}
        fill="none"
        stroke="var(--line)"
      />
      <text
        x={x + width / 2}
        y={y + 8}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={10}
        fill="var(--fg-2)"
        className="font-mono"
      >
        {label}
      </text>
    </g>
  );
}

function NodeGlyph({ node }: { node: LayoutNode }) {
  if (node.kind === "session") {
    return <SessionMark cx={node.x + 14} cy={node.y + node.h / 2} />;
  }
  const cy = node.kind === "subagent" ? node.y + 15 : node.y + 17;
  return <SvgGlyph status={statusOf(node)} cx={node.x + 14} cy={cy} />;
}

function TreeNode({
  node,
  selected,
  onOpen,
}: {
  node: LayoutNode;
  selected: boolean;
  onOpen: (node: LayoutNode) => void;
}) {
  const focusable = node.kind !== "session";
  const title = titleOf(node);
  const meta = metaOf(node);
  const tier = tierLabelOf(node);
  const titleX = node.x + 26;
  const titleY = node.kind === "subagent" ? node.y + 19 : node.y + 21;
  const metaY = node.kind === "subagent" ? node.y + 37 : node.y + 42;

  const pillWidth = tier ? measureText(tier, FONT_MONO) + 12 : 0;
  const pillX = node.x + node.w - 12 - pillWidth;
  const pillY = node.kind === "subagent" ? node.y + 7 : node.y + 9;
  const titleMax = tier ? pillX - titleX - 8 : node.x + node.w - 12 - titleX;

  const titleText = ellipsize(title, Math.max(0, titleMax), FONT_TITLE);

  const open = () => {
    if (!focusable) return;
    onOpen(node);
  };

  return (
    <g
      role={focusable ? "button" : undefined}
      tabIndex={focusable ? 0 : undefined}
      aria-label={focusable ? title : undefined}
      className={`group outline-none ${focusable ? "cursor-pointer" : ""}`}
      onClick={open}
      onKeyDown={(event) => {
        if (!focusable) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
    >
      <rect
        x={node.x}
        y={node.y}
        width={node.w}
        height={node.h}
        rx={8}
        fill={selected ? "var(--hover)" : "var(--bg)"}
        stroke={selected ? "var(--fg-3)" : "var(--line)"}
        strokeWidth={1}
        className={focusable ? "transition-colors hover:fill-[var(--hover)]" : ""}
      />
      <rect
        x={node.x - 1.5}
        y={node.y - 1.5}
        width={node.w + 3}
        height={node.h + 3}
        rx={9.5}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        className="pointer-events-none opacity-0 group-focus-visible:opacity-100"
      />
      <NodeGlyph node={node} />
      <text
        x={titleX}
        y={titleY}
        fontSize={node.kind === "session" ? 15 : 13}
        fontWeight={node.kind === "session" ? 600 : 500}
        fill="var(--fg)"
        className="font-sans"
      >
        {titleText}
      </text>
      {tier ? <SvgPill x={pillX} y={pillY} label={tier} /> : null}
      <text
        x={node.x + 14}
        y={metaY}
        fontSize={11}
        fill="var(--fg-3)"
        className="font-sans"
      >
        {meta}
      </text>
    </g>
  );
}

/** Tool-tick labels are small, so keep the tooltip content compact. */
function tickLabel(tick: Layout["ticks"][number]): string {
  const target = tick.tool.target ? ` ${tick.tool.target}` : "";
  const took =
    tick.tool.t1 !== null ? ` · ${fmtMs(tick.tool.t1 - tick.tool.t0)}` : "";
  return `${tick.tool.name}${target}${took}`;
}

export type TreeCanvasProps = {
  layout: Layout;
  selectedRun: string | null;
  selectedSub: number | null;
  onOpen: (node: LayoutNode) => void;
  label?: string;
};

/** Pure SVG rendering of a computed layout. Exported for render tests. */
export function TreeCanvas({
  layout,
  selectedRun,
  selectedSub,
  onOpen,
  label,
}: TreeCanvasProps) {
  return (
    <div className="relative inline-block min-w-full align-top">
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="block font-sans"
        role="group"
        aria-label={label}
      >
        <g>
          {layout.axisTicks.map((tick) => (
            <g key={`axis-${tick.t}`}>
              <line
                x1={layout.gutter - 10}
                y1={tick.y}
                x2={layout.axisLeft - 4}
                y2={tick.y}
                stroke="var(--fg-4)"
                strokeWidth={1}
              />
              <text
                x={layout.gutter - 14}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--fg-4)"
                className="font-mono"
              >
                {tick.label}
              </text>
            </g>
          ))}
        </g>

        {/* extents (behind nodes) */}
        <g>
          {layout.nodes.map((node) =>
            node.extent ? (
              <line
                key={`extent-${node.id}`}
                x1={node.x}
                y1={node.extent.y1}
                x2={node.x}
                y2={node.extent.y2}
                stroke="var(--fg-4)"
                strokeWidth={1}
              />
            ) : null,
          )}
        </g>

        {/* spawn elbows */}
        <g fill="none" stroke="var(--line)" strokeWidth={1}>
          {layout.edges.map((edge) => (
            <path
              key={`edge-${edge.to}`}
              d={edge.points
                .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`)
                .join(" ")}
            />
          ))}
        </g>

        {/* queued band label */}
        {layout.queuedTop !== null ? (
          <text
            x={layout.axisLeft}
            y={layout.queuedTop - 10}
            fontSize={10}
            fill="var(--fg-4)"
            className="font-mono"
            letterSpacing="0.08em"
          >
            QUEUED
          </text>
        ) : null}

        {/* nodes */}
        <g>
          {layout.nodes.map((node) => {
            const selected =
              node.kind === "run"
                ? selectedRun === node.runId && selectedSub === null
                : node.kind === "subagent"
                  ? selectedRun === node.runId && selectedSub === node.index
                  : false;
            return (
              <TreeNode
                key={node.id}
                node={node}
                selected={selected}
                onOpen={onOpen}
              />
            );
          })}
        </g>
      </svg>

      {/* tool ticks are HTML overlays so they can use the shared Tooltip */}
      <div
        className="pointer-events-none absolute left-0 top-0"
        style={{ width: layout.width, height: layout.height }}
      >
        {layout.ticks.map((tick) => (
          <div
            key={tick.id}
            className="absolute"
            style={{ left: tick.x - 6, top: tick.y - 6 }}
          >
            <Tooltip label={tickLabel(tick)}>
              <span className="pointer-events-auto flex h-3 w-3 items-center justify-center">
                <span
                  className={`h-1 w-1 rounded-full ${
                    tick.err ? "bg-fg" : "bg-fg4"
                  }`}
                />
              </span>
            </Tooltip>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TreeView() {
  const sessionId = useStore((state) => state.selectedSession);
  const selectedRun = useStore((state) => state.selectedRun);
  const selectedSub = useStore((state) => state.selectedSub);

  const [tree, setTree] = useState<SessionTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSession = useRef<string | null>(null);

  const load = useCallback(async (id: string) => {
    const token = ++requestId.current;
    try {
      const next = await getSessionTree(id);
      if (token !== requestId.current) return;
      setTree(next);
      setError(null);
      setLoading(false);
    } catch (caught) {
      if (token !== requestId.current) return;
      const message = caught instanceof Error ? caught.message : String(caught);
      setTree(null);
      setError(
        message.includes("404")
          ? "Tree view needs the updated daemon"
          : "Could not load tree",
      );
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    activeSession.current = sessionId;
    if (!sessionId) {
      setTree(null);
      setError(null);
      setLoading(false);
      return;
    }
    setTree(null);
    setError(null);
    setLoading(true);
    void load(sessionId);
  }, [sessionId, load]);

  // Global status frames mean a run changed: debounce a tree refetch.
  const scheduleRefresh = useRef(() => {});
  scheduleRefresh.current = () => {
    const id = activeSession.current;
    if (!id) return;
    if (refreshTimer.current !== null) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void load(id);
    }, 300);
  };
  useGlobalStatus(() => scheduleRefresh.current());

  useEffect(
    () => () => {
      if (refreshTimer.current !== null) clearTimeout(refreshTimer.current);
    },
    [],
  );

  const layout = useMemo(() => (tree ? layoutSession(tree) : null), [tree]);

  const onOpen = useCallback((node: LayoutNode) => {
    if (node.kind === "run" && node.runId) {
      navigate({ name: "run", runId: node.runId, sub: null });
    } else if (node.kind === "subagent" && node.runId && node.index !== null) {
      navigate({ name: "run", runId: node.runId, sub: node.index });
    }
  }, []);

  if (!sessionId) {
    return <Empty title="No session selected" hint="Pick a session on the left." />;
  }
  if (loading && !tree) {
    return (
      <div className="space-y-3 p-6" aria-busy="true" aria-label="Loading tree">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[54px] w-[220px] animate-pulse rounded-10 bg-hover"
            style={{ marginLeft: i * 16 }}
          />
        ))}
      </div>
    );
  }
  if (error) {
    return <Empty title={error} hint="Reload once the daemon is updated." />;
  }
  if (!tree || tree.children.length === 0) {
    return <Empty title="No runs yet" />;
  }
  if (!layout) return null;

  return (
    <TreeCanvas
      layout={layout}
      selectedRun={selectedRun}
      selectedSub={selectedSub}
      onOpen={onOpen}
      label={`Spawn tree for ${tree.title}`}
    />
  );
}
