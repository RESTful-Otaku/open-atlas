import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";

describe("debounce-raf", () => {
  let rafCalls: Array<() => void> = [];
  let rafCounter = 0;
  let timeoutCalls: Array<() => void> = [];
  let timeoutCounter = 0;

  beforeEach(() => {
    rafCalls = [];
    rafCounter = 0;
    timeoutCalls = [];
    timeoutCounter = 0;
    // @ts-ignore
    globalThis.requestAnimationFrame = (cb: () => void) => {
      rafCounter++;
      rafCalls.push(cb);
      return rafCounter;
    };
    // @ts-ignore
    globalThis.cancelAnimationFrame = (id: number) => {
      const idx = rafCalls.findIndex((_, i) => i + 1 === id);
      if (idx !== -1) rafCalls[idx] = undefined as unknown as () => void;
    };
    // @ts-ignore
    globalThis.setTimeout = (cb: () => void, _ms: number) => {
      timeoutCounter++;
      timeoutCalls.push(cb);
      return timeoutCounter;
    };
    // @ts-ignore
    globalThis.clearTimeout = (id: number) => {
      timeoutCalls = [];
      timeoutCounter = 0;
    };
  });

  afterEach(() => {
    // @ts-ignore
    delete globalThis.requestAnimationFrame;
    // @ts-ignore
    delete globalThis.cancelAnimationFrame;
    // @ts-ignore
    delete globalThis.setTimeout;
    // @ts-ignore
    delete globalThis.clearTimeout;
  });

  describe("rafCoalesce", () => {
    test("schedules a single rAF and calls the callback", async () => {
      const { rafCoalesce } = await import("./debounce-raf");
      const fn = mock(() => {});
      rafCoalesce(fn)();
      expect(rafCalls.length).toBe(1);
      rafCalls[0]();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("coalesces multiple calls into a single rAF", async () => {
      const { rafCoalesce } = await import("./debounce-raf");
      const fn = mock(() => {});
      const c = rafCoalesce(fn);
      c();
      c();
      c();
      expect(rafCalls.length).toBe(1);
    });

    test("cancel allows re-scheduling", async () => {
      const { rafCoalesce } = await import("./debounce-raf");
      const fn = mock(() => {});
      const c = rafCoalesce(fn);
      c();
      c.cancel();
      const prevCount = rafCalls.length;
      c();
      expect(rafCalls.length).toBe(prevCount + 1);
    });

    test("calling cancel after rAF fired is safe", async () => {
      const { rafCoalesce } = await import("./debounce-raf");
      const fn = mock(() => {});
      const c = rafCoalesce(fn);
      c();
      rafCalls[0]();
      expect(fn).toHaveBeenCalledTimes(1);
      expect(() => c.cancel()).not.toThrow();
    });
  });

  describe("debounce", () => {
    test("delays invocation by the given ms", async () => {
      const { debounce } = await import("./debounce-raf");
      const fn = mock(() => {});
      const d = debounce(fn, 100);
      d();
      expect(timeoutCalls.length).toBe(1);
      expect(fn).not.toHaveBeenCalled();
      timeoutCalls[0]();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("resets the timer on successive calls", async () => {
      const { debounce } = await import("./debounce-raf");
      const fn = mock(() => {});
      const d = debounce(fn, 100);
      d();
      const firstTimerCount = timeoutCounter;
      d();
      expect(timeoutCalls.length).toBe(1);
      timeoutCalls[0]();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("cancel prevents pending callback from firing", async () => {
      const { debounce } = await import("./debounce-raf");
      const fn = mock(() => {});
      const d = debounce(fn, 100);
      d();
      d.cancel();
      expect(timeoutCalls.length).toBe(0);
    });

    test("passes arguments to the debounced function", async () => {
      const { debounce } = await import("./debounce-raf");
      const fn = mock(() => {});
      const d = debounce(fn, 50);
      d("hello", 42);
      timeoutCalls[0]();
      expect(fn).toHaveBeenCalledWith("hello", 42);
    });
  });
});
