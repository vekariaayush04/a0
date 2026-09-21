import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { webDistStatus } from "../src/daemon/webdist";

test("webDistStatus reports missing for an empty dist dir", () => {
  const dir = mkdtempSync(join(tmpdir(), "a0-webdist-"));
  try {
    expect(webDistStatus(dir)).toBe("missing");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("webDistStatus reports ok once index.html exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "a0-webdist-"));
  try {
    writeFileSync(join(dir, "index.html"), "<!doctype html>");
    expect(webDistStatus(dir)).toBe("ok");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
