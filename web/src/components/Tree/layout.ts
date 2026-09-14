// Pure geometry for the SVG spawn tree. No DOM, no React: given a
// SessionTree this returns every rectangle, edge, tool tick and time-axis
// tick in one coordinate space so the renderer stays dumb.
//
// Time flows down. Runs are placed on a vertical time axis at `started`;
// runs that overlap in time are pushed into separate columns (greedy
// interval partitioning). Subagents hang off their parent's extent line at
// `spawnedAt`, indented one step to the right, recursively. Queued runs
// have no `started` and sit in a band at the bottom, never at epoch 0.

import type {
  RunTree,
  SessionTree,
  SubagentNode,
  ToolCall,
} from "../../api/types";

export type LayoutNodeKind = "session" | "run" | "subagent";

export type LayoutNode = {
  id: string;
  kind: LayoutNodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Original data node this rectangle represents. */
  ref: SessionTree | RunTree | SubagentNode;
  /** The run this node belongs to (null for the session card). */
  runId: string | null;
  /** Subagent index for `#/r/<id>/sub/<index>` navigation. */
  index: number | null;
  depth: number;
  started: number | null;
  ended: number | null;
  queued: boolean;
  status: string;
  /** Vertical extent line, if the node has a time interval. */
  extent: { y1: number; y2: number } | null;
};

export type LayoutEdge = {
  from: string;
  to: string;
  /** Polyline points for the elbow. */
  points: Array<[number, number]>;
};

export type LayoutTick = {
  id: string;
  nodeId: string;
  runId: string;
  tool: ToolCall;
  t: number;
  x: number;
  y: number;
  err: boolean;
};

export type LayoutAxisTick = {
  t: number;
  y: number;
  label: string;
};

export type LayoutOptions = {
  nodeWidth?: number;
  nodeHeight?: number;
  subWidth?: number;
  subHeight?: number;
  /** Horizontal gap between overlapping run columns. */
  gap?: number;
  /** Indent of a subagent relative to its parent's extent line. */
  indent?: number;
  /** Width of the left time-tick gutter. */
  gutter?: number;
  /** Vertical space kept for the session card before the axis starts. */
  axisTop?: number;
  padRight?: number;
  padBottom?: number;
  /** Preferred total height used to pick a time scale. */
  targetHeight?: number;
  /** Explicit pixels per millisecond; overrides the fitted scale. */
  pxPerMs?: number;
  minScale?: number;
  maxScale?: number;
};

export type Layout = {
  width: number;
  height: number;
  gutter: number;
  axisLeft: number;
  axisTop: number;
  t0: number;
  t1: number;
  pxPerMs: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  ticks: LayoutTick[];
  axisTicks: LayoutAxisTick[];
  /** Top of the queued band, or null when there are no queued runs. */
  queuedTop: number | null;
};

const DEFAULTS = {
  nodeWidth: 220,
  nodeHeight: 54,
  subWidth: 200,
  subHeight: 46,
  gap: 24,
  indent: 40,
  gutter: 60,
  axisTop: 64,
  padRight: 24,
  padBottom: 32,
  targetHeight: 720,
  minScale: 0.001,
  maxScale: 0.05,
} as const;

const SESSION_Y = 8;
const SESSION_H = 40;
const QUEUED_GAP = 28;
const QUEUED_ROW_GAP = 8;
const MIN_CHILD_OFFSET = 24;

/** Picks a "nice" time step (ms) so `span` yields roughly `target` ticks. */
export function niceTimeStep(span: number, target = 8): number {
  const raw = Math.max(1, span / Math.max(1, target));
  const steps = [
    1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000,
    60000, 120000, 300000, 600000, 900000, 1800000, 3600000, 7200000, 21600000,
    43200000, 86400000,
  ];
  for (const step of steps) if (step >= raw) return step;
  return steps[steps.length - 1];
}

/** Elapsed-time axis label, e.g. `0s`, `15s`, `2m`, `1.5h`. */
export function axisLabel(ms: number): string {
  if (ms <= 0) return "0s";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function elbow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Array<[number, number]> {
  if (Math.abs(y2 - y1) < 0.5 || Math.abs(x2 - x1) < 0.5) {
    return [
      [x1, y1],
      [x2, y2],
    ];
  }
  const midX = x1 + (x2 - x1) / 2;
  return [
    [x1, y1],
    [midX, y1],
    [midX, y2],
    [x2, y2],
  ];
}

function collectTimes(
  nodes: SubagentNode[],
  out: number[],
): void {
  for (const node of nodes) {
    if (node.started !== null) out.push(node.started);
    if (node.ended !== null) out.push(node.ended);
    if (node.spawnedAt !== null) out.push(node.spawnedAt);
    for (const tool of node.tools) {
      if (tool.t0 !== null) out.push(tool.t0);
      if (tool.t1 !== null) out.push(tool.t1);
    }
    collectTimes(node.children, out);
  }
}

function toolTicks(
  node: LayoutNode,
  tools: ToolCall[],
  yFor: (t: number) => number,
  out: LayoutTick[],
): void {
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    out.push({
      id: `${node.id}/tool/${i}`,
      nodeId: node.id,
      runId: node.runId ?? "",
      tool,
      t: tool.t0,
      x: node.x,
      y: yFor(tool.t0),
      err: tool.err,
    });
  }
}

/**
 * Lays out one session's spawn tree.
 *
 * @param tree Session tree as returned by `GET /api/sessions/:id/tree`.
 * @param opts Geometry overrides (all optional).
 */
export function layoutSession(
  tree: SessionTree,
  opts: LayoutOptions = {},
): Layout {
  const nodeWidth = opts.nodeWidth ?? DEFAULTS.nodeWidth;
  const nodeHeight = opts.nodeHeight ?? DEFAULTS.nodeHeight;
  const subWidth = opts.subWidth ?? DEFAULTS.subWidth;
  const subHeight = opts.subHeight ?? DEFAULTS.subHeight;
  const gap = opts.gap ?? DEFAULTS.gap;
  const indent = opts.indent ?? DEFAULTS.indent;
  const gutter = opts.gutter ?? DEFAULTS.gutter;
  const axisTop = opts.axisTop ?? DEFAULTS.axisTop;
  const padRight = opts.padRight ?? DEFAULTS.padRight;
  const padBottom = opts.padBottom ?? DEFAULTS.padBottom;
  const minScale = opts.minScale ?? DEFAULTS.minScale;
  const maxScale = opts.maxScale ?? DEFAULTS.maxScale;

  const axisLeft = gutter;

  // ---- time range / scale ---------------------------------------------
  const times: number[] = [];
  for (const run of tree.children) {
    if (run.started !== null) times.push(run.started);
    if (run.ended !== null) times.push(run.ended);
    for (const tool of run.tools) {
      if (tool.t0 !== null) times.push(tool.t0);
      if (tool.t1 !== null) times.push(tool.t1);
    }
    collectTimes(run.children, times);
  }
  const t0 = times.length > 0 ? Math.min(...times) : 0;
  const t1 = times.length > 0 ? Math.max(...times) : t0;
  const span = Math.max(1, t1 - t0);
  const fitted = (opts.targetHeight ?? DEFAULTS.targetHeight) / span;
  const pxPerMs =
    opts.pxPerMs ?? Math.min(maxScale, Math.max(minScale, fitted));
  const yFor = (t: number) => axisTop + (t - t0) * pxPerMs;

  // ---- runs: greedy columns over time ---------------------------------
  const timedRuns = tree.children
    .filter((run) => run.started !== null)
    .slice()
    .sort((a, b) => (a.started ?? 0) - (b.started ?? 0));
  const queuedRuns = tree.children.filter((run) => run.started === null);

  const laneEnds: number[] = [];
  const runNodes: LayoutNode[] = [];
  for (const run of timedRuns) {
    const start = run.started as number;
    // A still-running run occupies its column indefinitely; a finished one
    // only until `ended`.
    const end = run.ended ?? (run.status === "running" ? Infinity : start);
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = end;

    const x = axisLeft + lane * (nodeWidth + gap);
    const y = yFor(start);
    const extentEnd = yFor(run.ended ?? start);
    const node: LayoutNode = {
      id: `run:${run.id}`,
      kind: "run",
      x,
      y,
      w: nodeWidth,
      h: nodeHeight,
      ref: run,
      runId: run.id,
      index: null,
      depth: 0,
      started: start,
      ended: run.ended,
      queued: false,
      status: run.status,
      extent: {
        y1: y,
        y2: Math.max(extentEnd, y + (run.status === "running" ? 8 : 0)),
      },
    };
    runNodes.push(node);
  }

  // ---- queued band -----------------------------------------------------
  const axisBottom = yFor(t1);
  let timedBottom = axisBottom;
  for (const node of runNodes) {
    timedBottom = Math.max(timedBottom, node.y + node.h, node.extent?.y2 ?? 0);
  }
  const queuedNodes: LayoutNode[] = [];
  let queuedTop: number | null = null;
  if (queuedRuns.length > 0) {
    queuedTop = timedBottom + QUEUED_GAP;
    for (let i = 0; i < queuedRuns.length; i++) {
      const run = queuedRuns[i];
      queuedNodes.push({
        id: `run:${run.id}`,
        kind: "run",
        x: axisLeft,
        y: queuedTop + i * (nodeHeight + QUEUED_ROW_GAP),
        w: nodeWidth,
        h: nodeHeight,
        ref: run,
        runId: run.id,
        index: null,
        depth: 0,
        started: null,
        ended: null,
        queued: true,
        status: run.status,
        extent: null,
      });
    }
  }

  // ---- session card ----------------------------------------------------
  const columns = Math.max(1, laneEnds.length);
  const contentWidth = columns * nodeWidth + (columns - 1) * gap;
  const sessionNode: LayoutNode = {
    id: `session:${tree.id}`,
    kind: "session",
    x: axisLeft,
    y: SESSION_Y,
    w: Math.max(contentWidth, nodeWidth),
    h: SESSION_H,
    ref: tree,
    runId: null,
    index: null,
    depth: -1,
    started: null,
    ended: null,
    queued: false,
    status: "session",
    extent: null,
  };

  // ---- subagents (recursive, indented) --------------------------------
  const subNodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const ticks: LayoutTick[] = [];

  const placeChildren = (
    parent: LayoutNode,
    run: RunTree,
    children: SubagentNode[],
    depth: number,
  ): void => {
    for (const child of children) {
      const spawnedAt = child.spawnedAt ?? parent.started ?? t0;
      const rawY = yFor(spawnedAt);
      const y = Math.max(rawY, parent.y + Math.max(MIN_CHILD_OFFSET, parent.h + 8));
      const x = parent.x + indent;
      const node: LayoutNode = {
        id: `${parent.id}/sub/${child.index}`,
        kind: "subagent",
        x,
        y,
        w: subWidth,
        h: subHeight,
        ref: child,
        runId: run.id,
        index: child.index,
        depth,
        started: child.started,
        ended: child.ended,
        queued: false,
        status: child.status,
        extent:
          child.started !== null
            ? {
                y1: yFor(child.started),
                y2: Math.max(
                  yFor(child.ended ?? child.started),
                  yFor(child.started) + 6,
                ),
              }
            : null,
      };
      subNodes.push(node);
      edges.push({
        from: parent.id,
        to: node.id,
        points: elbow(parent.x, yFor(spawnedAt), node.x, node.y + node.h / 2),
      });
      toolTicks(node, child.tools, yFor, ticks);
      placeChildren(node, run, child.children, depth + 1);
    }
  };

  for (const node of runNodes) {
    const run = node.ref as RunTree;
    toolTicks(node, run.tools, yFor, ticks);
    placeChildren(node, run, run.children, 1);
  }

  const nodes = [sessionNode, ...runNodes, ...queuedNodes, ...subNodes];

  // ---- axis ticks ------------------------------------------------------
  const axisTicks: LayoutAxisTick[] = [];
  if (tree.children.some((run) => run.started !== null)) {
    const step = niceTimeStep(t1 - t0);
    for (let t = t0; t <= t1 + step * 0.5; t += step) {
      axisTicks.push({ t, y: yFor(t), label: axisLabel(t - t0) });
      if (axisTicks.length > 400) break;
    }
  } else {
    axisTicks.push({ t: t0, y: axisTop, label: "0s" });
  }

  // ---- bounds ----------------------------------------------------------
  let maxX = sessionNode.x + sessionNode.w;
  let maxY = sessionNode.y + sessionNode.h;
  for (const node of nodes) {
    maxX = Math.max(maxX, node.x + node.w);
    maxY = Math.max(maxY, node.y + node.h);
  }
  maxY = Math.max(maxY, axisBottom);

  return {
    width: maxX + padRight,
    height: maxY + padBottom,
    gutter,
    axisLeft,
    axisTop,
    t0,
    t1,
    pxPerMs,
    nodes,
    edges,
    ticks: ticks.sort((a, b) => a.y - b.y),
    axisTicks,
    queuedTop,
  };
}
