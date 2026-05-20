import { describe, expect, test } from "bun:test";
import {
  formatUtcTimeLabel,
  scrubPercent,
  solarPhaseForMin,
} from "./solar-time-scrub";

describe("solar-time-scrub", () => {
  test("formatUtcTimeLabel pads hours and minutes", () => {
    expect(formatUtcTimeLabel(0)).toBe("00:00");
    expect(formatUtcTimeLabel(90)).toBe("01:30");
    expect(formatUtcTimeLabel(1439)).toBe("23:59");
  });

  test("solarPhaseForMin picks coarse phases", () => {
    expect(solarPhaseForMin(120).icon).toBe("moon");
    expect(solarPhaseForMin(360).icon).toBe("sunrise");
    expect(solarPhaseForMin(720).icon).toBe("sun");
    expect(solarPhaseForMin(1080).icon).toBe("sunset");
  });

  test("scrubPercent maps ends", () => {
    expect(scrubPercent(0)).toBe(0);
    expect(scrubPercent(1439)).toBeCloseTo(100, 5);
  });
});
