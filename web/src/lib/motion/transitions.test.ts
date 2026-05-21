import { describe, expect, test } from "vitest";

import {
  MOTION_SETTINGS_FOLD_MS,
  settingsFoldTransition,
} from "./transitions";

describe("settingsFoldTransition", () => {
  test("desktop variant uses longer duration than default", () => {
    const base = settingsFoldTransition();
    const desktop = settingsFoldTransition({ desktop: true });
    expect(desktop.slide.duration).toBeGreaterThan(base.slide.duration);
    expect(desktop.slide.duration).toBe(MOTION_SETTINGS_FOLD_MS + 40);
  });
});
