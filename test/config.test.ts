import { test, expect } from "bun:test";
import { loadConfig } from "../src/config";

test("defaults", () => {
  const c = loadConfig({ HOME: "/h" });
  expect(c.port).toBe(4747);
  expect(c.home).toBe("/h/.local/share/a0");
  expect(c.piBin).toBe("pi");
  expect(c.provider).toBe("opencode-go");
  expect(c.model).toBe("deepseek-v4.1-flash");
  expect(c.thinking).toBe("high");
  expect(c.concurrency).toBe(4);
  expect(c.timeout).toBe(1800);
  expect(c.tiers).toEqual({ l1: "muse-spark-1.3-contributor", l2: "deepseek-v4.1-flash", l3: "glm-5.3" });
});

test("env overrides", () => {
  const c = loadConfig({ HOME: "/h", A0_PORT: "5000", A0_HOME: "/x", A0_CONCURRENCY: "2", A0_MODEL: "glm-5.3" });
  expect(c.port).toBe(5000); expect(c.home).toBe("/x"); expect(c.concurrency).toBe(2); expect(c.model).toBe("glm-5.3");
});

test("tier overrides", () => {
  const c = loadConfig({ HOME: "/h", A0_TIER_L3: "kimi-k2.7-code" });
  expect(c.tiers.l3).toBe("kimi-k2.7-code");
  expect(c.tiers.l1).toBe("muse-spark-1.3-contributor");
  expect(c.tiers.l2).toBe("deepseek-v4.1-flash");
});
