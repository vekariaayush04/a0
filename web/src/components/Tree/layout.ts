// Tree layout placeholder. Owned by a later wave; exported now so the module
// path and signature exist.

import type { RunTree } from "../../api/types";

export type LayoutNode = {
  id: string;
  kind: "session" | "run" | "subagent";
  x: number;
  y: number;
};

export type LayoutEdge = {
  from: string;
  to: string;
};

export type TreeLayout = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
};

/** Lay out run trees on a time axis. Wave 1 stub: empty layout. */
export function layoutTrees(_trees: RunTree[]): TreeLayout {
  return { nodes: [], edges: [] };
}
