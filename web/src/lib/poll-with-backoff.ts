export type BackoffPollHandle = {
  start: () => void;
  stop: () => void;
  reset: () => void;
  pollNow: () => void;
};

export type BackoffPollOptions = {
  /** Human-readable label for logs */
  name: string;
  /** Interval between polls when no failures are occurring (ms) */
  intervalMs: number;
  /** Base backoff delay for the first retry (ms). Default: intervalMs */
  baseBackoffMs?: number;
  /** Maximum backoff delay (ms). Default: 300_000 (5 min) */
  maxBackoffMs?: number;
  /** Consecutive failures before a user-visible notification is fired. Default: 3 */
  notifyAfterFailures?: number;
  /** Called with `true` when backoff starts, `false` when it recovers */
  onBackoffChange?: (backingOff: boolean, failures: number, nextPollMs: number) => void;
};

export function createBackoffPoll(
  fn: () => Promise<boolean>,
  opts: BackoffPollOptions,
): BackoffPollHandle {
  const {
    name,
    intervalMs,
    baseBackoffMs = intervalMs,
    maxBackoffMs = 300_000,
    notifyAfterFailures = 3,
    onBackoffChange,
  } = opts;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let consecutiveFailures = 0;
  let wasBackingOff = false;

  function nextDelay(): number {
    if (consecutiveFailures === 0) return intervalMs;
    const delay = Math.min(
      maxBackoffMs,
      baseBackoffMs * 2 ** (consecutiveFailures - 1),
    );
    return delay;
  }

  function isBackingOff(): boolean {
    return consecutiveFailures >= notifyAfterFailures;
  }

  async function tick(): Promise<void> {
    if (!running) return;
    timer = undefined;
    try {
      const ok = await fn();
      if (ok) {
        const was = isBackingOff();
        consecutiveFailures = 0;
        if (was) {
          console.debug(`openatlas backoff: ${name} recovered`);
          if (onBackoffChange) onBackoffChange(false, 0, intervalMs);
          wasBackingOff = false;
        }
      } else {
        consecutiveFailures += 1;
        const nowBackingOff = isBackingOff();
        if (nowBackingOff && !wasBackingOff) {
          console.debug(`openatlas backoff: ${name} entering backoff after ${consecutiveFailures} failures`);
          if (onBackoffChange) onBackoffChange(true, consecutiveFailures, nextDelay());
          wasBackingOff = true;
        }
      }
    } catch (e) {
      consecutiveFailures += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.debug(`openatlas backoff: ${name} threw — ${msg}`);
      const nowBackingOff = isBackingOff();
      if (nowBackingOff && !wasBackingOff) {
        if (onBackoffChange) onBackoffChange(true, consecutiveFailures, nextDelay());
        wasBackingOff = true;
      }
    }
    schedule();
  }

  function schedule(): void {
    if (!running) return;
    const delay = nextDelay();
    timer = setTimeout(tick, delay);
  }

  function start(): void {
    if (running) return;
    running = true;
    consecutiveFailures = 0;
    wasBackingOff = false;
    tick();
  }

  function stop(): void {
    running = false;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function reset(): void {
    const was = isBackingOff();
    consecutiveFailures = 0;
    if (was) {
      if (onBackoffChange) onBackoffChange(false, 0, intervalMs);
      wasBackingOff = false;
    }
  }

  function pollNow(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    tick();
  }

  return { start, stop, reset, pollNow };
}
