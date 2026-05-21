import { describe, expect, test } from "vitest";

import { settingsSwipeBack } from "./settings-mobile-gestures";

function touchEnd(dx: number, dy = 0): TouchEvent {
  const touch = {
    clientX: 100 + dx,
    clientY: 200 + dy,
  } as Touch;
  return {
    changedTouches: [touch],
  } as TouchEvent;
}

function touchStart(): TouchEvent {
  const touch = { clientX: 100, clientY: 200 } as Touch;
  return { touches: [touch] } as TouchEvent;
}

describe("settingsSwipeBack", () => {
  test("calls onBack on sufficiently horizontal right swipe", () => {
    let backs = 0;
    const h = settingsSwipeBack(() => true, () => {
      backs += 1;
    });
    h.ontouchstart(touchStart());
    h.ontouchend(touchEnd(80));
    expect(backs).toBe(1);
  });

  test("ignores swipe when canGoBack is false", () => {
    let backs = 0;
    const h = settingsSwipeBack(() => false, () => {
      backs += 1;
    });
    h.ontouchstart(touchStart());
    h.ontouchend(touchEnd(80));
    expect(backs).toBe(0);
  });

  test("ignores mostly vertical gesture", () => {
    let backs = 0;
    const h = settingsSwipeBack(() => true, () => {
      backs += 1;
    });
    h.ontouchstart(touchStart());
    h.ontouchend(touchEnd(80, 200));
    expect(backs).toBe(0);
  });
});
