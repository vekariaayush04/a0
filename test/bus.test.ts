import { test, expect } from "bun:test";
import { Bus } from "../src/daemon/bus";
test("bus routes by run and wildcard", () => {
  const b = new Bus(); const got: string[] = [];
  const off = b.subscribe("r1", m => got.push("r1:" + m.kind));
  b.subscribe("*", m => got.push("*:" + m.runId));
  b.publish({ runId: "r1", kind: "status", data: {} });
  b.publish({ runId: "r2", kind: "event", data: {} });
  off(); b.publish({ runId: "r1", kind: "event", data: {} });
  expect(got).toEqual(["r1:status", "*:r1", "*:r2", "*:r1"]);
});
