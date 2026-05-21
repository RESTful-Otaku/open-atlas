import { describe, expect, test } from "bun:test";
import {
  COMPACT_LAYOUT_MQ,
  isNativeApp,
  isMobileLayout,
  MOBILE_LAYOUT_MQ,
  TABLET_LAYOUT_MQ,
} from "./mobile-layout";

describe("mobile-layout", () => {
  test("breakpoints match documented ranges", () => {
    expect(MOBILE_LAYOUT_MQ).toBe("(max-width: 768px)");
    expect(TABLET_LAYOUT_MQ).toBe("(min-width: 769px) and (max-width: 1024px)");
    expect(COMPACT_LAYOUT_MQ).toBe("(max-width: 1024px)");
  });

  test("isNativeApp is false without window.Capacitor", () => {
    expect(isNativeApp()).toBe(false);
  });

  test("layout flags are false before bootstrap in test runtime", () => {
    expect(isMobileLayout()).toBe(false);
  });
});
