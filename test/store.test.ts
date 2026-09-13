import { test, expect } from "bun:test";
import { Store, newRunId } from "../src/daemon/store";

test("run ids are sortable and short", async () => {
  const a = newRunId(); await Bun.sleep(2); const b = newRunId();
  expect(a < b).toBe(true); expect(a.length).toBeLessThanOrEqual(14);
});

test("sessions and runs", () => {
  const s = new Store(":memory:");
  const sess = s.touchSession("sess1", "/proj", undefined);
  expect(sess.title).toBe("proj");
  const r = s.createRun({ id: newRunId(), sessionId: "sess1", title: "t", cwd: "/proj", provider: "p", model: "m", thinking: "high" });
  expect(r.status).toBe("queued");
  s.updateRun(r.id, { status: "running", started: 5 });
  expect(s.getRun(r.id)!.status).toBe("running");
  expect(s.listRuns("sess1")).toHaveLength(1);
  expect(s.listSessions()[0].id).toBe("sess1");
  expect(s.failInFlight("daemon restarted")).toBe(1);
  expect(s.getRun(r.id)!.error).toBe("daemon restarted");
});
