import { describe, expect, test } from "bun:test";

import {
  connectionErrorDisplay,
  connectionErrorGuide,
  connectionErrorHint,
} from "./connection-errors";

describe("connection-errors", () => {
  test("returns null for empty input", () => {
    expect(connectionErrorGuide(null)).toBeNull();
    expect(connectionErrorGuide("  ")).toBeNull();
    expect(connectionErrorHint(undefined)).toBeNull();
  });

  test("classifies subscription failures", () => {
    const g = connectionErrorGuide("subscription error: ORDER BY not allowed");
    expect(g?.kind).toBe("subscription");
    expect(g?.remediation).toContain("SELECT *");
  });

  test("classifies unreachable / websocket errors", () => {
    const g = connectionErrorGuide("WebSocket closed before connect");
    expect(g?.kind).toBe("unreachable");
    expect(connectionErrorHint("ECONNREFUSED 127.0.0.1:3000")).toContain(
      "SpacetimeDB",
    );
  });

  test("connectionErrorDisplay preserves raw message", () => {
    const d = connectionErrorDisplay("database openatlas-staging not found");
    expect(d?.raw).toContain("not found");
    expect(d?.summary).toBeTruthy();
    expect(d?.remediation).toContain("Settings");
  });

  test("unknown errors still get remediation", () => {
    const g = connectionErrorGuide("something unexpected");
    expect(g?.kind).toBe("unknown");
    expect(g?.remediation).toContain("Reconnect");
  });
});
