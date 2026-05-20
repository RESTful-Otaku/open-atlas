import { describe, expect, test } from "bun:test";

import {
  OPS_LOG_MAX_LINES,
  appendOpsLog,
  clearOpsLogForTests,
  getOpsLogLines,
  trimOpsLog,
} from "./log-stream";

describe("ops log stream", () => {
  test("trimOpsLog keeps newest lines", () => {
    const lines = Array.from({ length: 600 }, (_, i) => ({
      ts: new Date(i).toISOString(),
      level: "info" as const,
      source: "test",
      message: String(i),
    }));
    const trimmed = trimOpsLog(lines, 500);
    expect(trimmed).toHaveLength(500);
    expect(trimmed[0]?.message).toBe("100");
    expect(trimmed[499]?.message).toBe("599");
  });

  test("appendOpsLog enforces max buffer size", () => {
    clearOpsLogForTests();
    for (let i = 0; i < OPS_LOG_MAX_LINES + 50; i++) {
      appendOpsLog("info", "test", `line-${i}`);
    }
    const lines = getOpsLogLines();
    expect(lines.length).toBe(OPS_LOG_MAX_LINES);
    expect(lines[0]?.message).toBe("line-50");
    expect(lines[lines.length - 1]?.message).toBe(
      `line-${OPS_LOG_MAX_LINES + 49}`,
    );
    clearOpsLogForTests();
  });
});
