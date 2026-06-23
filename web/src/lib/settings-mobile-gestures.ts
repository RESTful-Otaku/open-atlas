

const SWIPE_BACK_MIN_PX = 56;
const SWIPE_MAX_ANGLE_RATIO = 1.4;

export type SettingsSwipeHandlers = {
  ontouchstart: (e: TouchEvent) => void;
  ontouchend: (e: TouchEvent) => void;
  ontouchcancel: () => void;
};

export function settingsSwipeBack(
  canGoBack: () => boolean,
  onBack: () => void,
): SettingsSwipeHandlers {
  let startX = 0;
  let startY = 0;

  return {
    ontouchstart(e: TouchEvent) {
      if (!canGoBack() || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
    },
    ontouchend(e: TouchEvent) {
      if (!canGoBack()) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (dx < SWIPE_BACK_MIN_PX) return;
      if (Math.abs(dy) * SWIPE_MAX_ANGLE_RATIO > Math.abs(dx)) return;
      onBack();
    },
    ontouchcancel() {
      startX = 0;
      startY = 0;
    },
  };
}
