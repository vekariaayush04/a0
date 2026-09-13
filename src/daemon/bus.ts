export type BusMsg = { runId: string; kind: "event" | "status"; data: any };
export class Bus {
  private subs = new Map<string, Set<(m: BusMsg) => void>>();
  subscribe(key: string, fn: (m: BusMsg) => void) {
    if (!this.subs.has(key)) this.subs.set(key, new Set());
    this.subs.get(key)!.add(fn);
    return () => { this.subs.get(key)?.delete(fn); };
  }
  publish(m: BusMsg) { for (const k of [m.runId, "*"]) this.subs.get(k)?.forEach(fn => fn(m)); }
}
