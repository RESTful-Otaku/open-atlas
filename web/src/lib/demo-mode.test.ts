import { describe, expect, test } from "bun:test";

import { isDemoModeRequested } from "./demo-mode";

describe("isDemoModeRequested", () => {
  test("returns false without window", () => {
    expect(isDemoModeRequested()).toBe(false);
  });
});
