import { describe, expect, test } from "vitest";

import {
  clampCardPosition,
  compactMapCardInsets,
  HOVER_CARD_SIZE_COMPACT,
} from "./event-map-hover";

describe("clampCardPosition", () => {
  test("respects bottom inset so card stays above nav zone", () => {
    const { top } = clampCardPosition(
      200,
      400,
      390,
      700,
      300,
      HOVER_CARD_SIZE_COMPACT.h,
      14,
      { bottom: 80, right: 72, top: 8, left: 8 },
    );
    expect(top + HOVER_CARD_SIZE_COMPACT.h + 80).toBeLessThanOrEqual(700);
  });
});

describe("compactMapCardInsets", () => {
  test("includes bottom padding beyond nav fallback", () => {
    const insets = compactMapCardInsets();
    expect(insets.bottom).toBeGreaterThan(68);
    expect(insets.right).toBe(80);
  });
});
