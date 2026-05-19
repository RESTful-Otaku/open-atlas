export type RafCoalescedFn = (() => void) & { cancel: () => void };

/**
 * Run `fn` at most once per animation frame (trailing coalesce).
 * Call `.cancel()` on teardown so work does not run after unmount.
 */
export function rafCoalesce(fn: () => void): RafCoalescedFn {
  let scheduled = false;
  let rafId = 0;
  const coalesced = (() => {
    if (scheduled) return;
    scheduled = true;
    rafId = requestAnimationFrame(() => {
      scheduled = false;
      rafId = 0;
      fn();
    });
  }) as RafCoalescedFn;
  coalesced.cancel = () => {
    if (rafId) cancelAnimationFrame(rafId);
    scheduled = false;
    rafId = 0;
  };
  return coalesced;
}

export type DebouncedFn<T extends unknown[]> = ((...args: T) => void) & {
  cancel: () => void;
};

/**
 * Run `fn` at most once per `ms` (trailing edge). Call `.cancel()` on teardown.
 */
export function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  ms: number,
): DebouncedFn<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = ((...args: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, ms);
  }) as DebouncedFn<T>;
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return debounced;
}
