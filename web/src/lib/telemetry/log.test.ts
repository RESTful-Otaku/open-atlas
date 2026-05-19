import { describe, expect, test } from "bun:test";

import { log } from "./log";

describe("telemetry/log", () => {
  test("log function is exported and callable", () => {
    expect(typeof log).toBe("function");
    log("test", "debug", "noop", { ok: true });
  });
});
