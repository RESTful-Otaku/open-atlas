import { describe, expect, test } from "bun:test";

import { ingestMetricsSnapshotToCounters, parsePrometheusCounters } from "./prometheus";

describe("parsePrometheusCounters", () => {
  test("parses counter lines and ignores comments", () => {
    const text = `
# HELP openatlas_ingest_events_fetched_total fetched
# TYPE openatlas_ingest_events_fetched_total counter
openatlas_ingest_events_fetched_total 42
openatlas_ingest_events_accepted_total 7
unknown_metric 99
`.trim();
    const out = parsePrometheusCounters(text);
    expect(out.openatlas_ingest_events_fetched_total).toBe(42);
    expect(out.openatlas_ingest_events_accepted_total).toBe(7);
    expect(out).not.toHaveProperty("unknown_metric");
  });

  test("returns empty object for blank input", () => {
    expect(parsePrometheusCounters("")).toEqual({});
  });
});

describe("ingestMetricsSnapshotToCounters", () => {
  test("maps /status ingest_metrics fields to Prometheus names", () => {
    const out = ingestMetricsSnapshotToCounters({
      events_fetched: 10,
      events_accepted: 8,
      events_duplicate: 1,
      events_rejected: 1,
      events_transport_error: 0,
      batch_calls: 2,
      batch_fallback_calls: 0,
    });
    expect(out.openatlas_ingest_events_fetched_total).toBe(10);
    expect(out.openatlas_ingest_batch_calls_total).toBe(2);
  });
});
