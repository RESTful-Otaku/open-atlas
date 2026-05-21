import type { NotifyLevel } from "./notify-types";
import { isCompactLayout } from "../mobile-layout";

const DEFAULT_TIMEOUT_MS = 5_000;
const COMPACT_TIMEOUT_MS = 3_500;
const MAX_VISIBLE = 6;
const MAX_VISIBLE_COMPACT = 2;

export type ToastItem = {
  id: string;
  level: NotifyLevel;
  code: string;
  title: string;
  message: string;
  detail?: string;
  action?: string;
};

export const toasts = $state({
  items: [] as ToastItem[],
});

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Code + dedupe key → last shown ms */
const recentToast = new Map<string, number>();
const DEDUPE_WINDOW_MS = 3_000;

function makeId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @returns true if a toast was added (or scheduled)
 */
export function pushToast(
  t: Omit<ToastItem, "id"> & {
    id?: string;
    timeoutMs?: number;
    dedupeKey?: string;
  },
): boolean {
  const id = t.id ?? makeId();
  const key = t.dedupeKey ?? t.code;
  const now = Date.now();
  const last = recentToast.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) {
    return false;
  }
  recentToast.set(key, now);
  for (const k of recentToast.keys()) {
    if (now - (recentToast.get(k) ?? 0) > DEDUPE_WINDOW_MS * 3) {
      recentToast.delete(k);
    }
  }

  const compact = isCompactLayout();
  const timeoutMs =
    t.timeoutMs ?? (compact ? COMPACT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  const maxVisible = compact ? MAX_VISIBLE_COMPACT : MAX_VISIBLE;
  const item: ToastItem = {
    id,
    level: t.level,
    code: t.code,
    title: t.title,
    message: t.message,
    detail: t.detail,
    action: t.action,
  };
  toasts.items = [...toasts.items, item].slice(-maxVisible);

  if (timeoutMs > 0) {
    const tmr = setTimeout(() => {
      dismissToast(id);
    }, timeoutMs);
    timers.set(id, tmr);
  }
  return true;
}

export function dismissToast(id: string): void {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
  toasts.items = toasts.items.filter((i) => i.id !== id);
}
