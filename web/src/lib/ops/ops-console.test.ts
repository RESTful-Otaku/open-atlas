import { describe, expect, test } from "bun:test";

import {
  clearOpsLogForTests,
  getOpsLogLines,
  appendOpsLog,
  trimOpsLog,
  type LogLine,
} from "../observability/log-stream";
import { parsePrometheusCounters } from "../observability/prometheus";

describe("parsePrometheusCounters", () => {
  test("parses counter lines and ignores comments", () => {
    const text = `
# HELP openatlas_ingest_events_accepted_total Events accepted
# TYPE openatlas_ingest_events_accepted_total counter
openatlas_ingest_events_accepted_total 42
openatlas_ingest_events_fetched_total 100
unknown_metric 1
`;
    const counters = parsePrometheusCounters(text);
    expect(counters.openatlas_ingest_events_accepted_total).toBe(42);
    expect(counters.openatlas_ingest_events_fetched_total).toBe(100);
    expect(counters.openatlas_ingest_events_rejected_total).toBeUndefined();
  });
});

describe("trimOpsLog", () => {
  test("keeps newest lines when over cap", () => {
    const lines: LogLine[] = Array.from({ length: 10 }, (_, i) => ({
      ts: `2020-01-01T00:00:0${i}.000Z`,
      level: "info",
      source: "test",
      message: String(i),
    }));
    const trimmed = trimOpsLog(lines, 4);
    expect(trimmed).toHaveLength(4);
    expect(trimmed.map((l) => l.message)).toEqual(["6", "7", "8", "9"]);
  });
});

describe("ops log ring buffer", () => {
  test("append trims to OPS_LOG_MAX_LINES", () => {
    clearOpsLogForTests();
    for (let i = 0; i < 520; i++) {
      appendOpsLog("info", "test", `line-${i}`);
    }
    expect(getOpsLogLines().length).toBeLessThanOrEqual(500);
    expect(getOpsLogLines().at(-1)?.message).toBe("line-519");
    clearOpsLogForTests();
  });
});
