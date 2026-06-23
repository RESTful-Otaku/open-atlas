import { appendNotifyLog } from "./notify-log.svelte";
import { pushToast } from "./toast-state.svelte";
import type { PushNotifyInput } from "./notify-types";
import { NOTIFY_CODES } from "./notify-codes";

export type { NotifyLogEntry } from "./notify-log.svelte";
export { notifyLog, appendNotifyLog } from "./notify-log.svelte";
export { dismissToast, toasts } from "./toast-state.svelte";
export type { PushNotifyInput, NotifyLevel } from "./notify-types";
export { NOTIFY_CODES, type NotifyCode } from "./notify-codes";


export function notify(o: PushNotifyInput): void {
  const toast = o.toast !== false;
  appendNotifyLog({
    level: o.level,
    code: o.code,
    title: o.title,
    message: o.message,
    detail: o.detail,
    action: o.action,
    source: o.source,
  });
  if (!toast) return;
  const shown = pushToast({
    level: o.level,
    code: o.code,
    title: o.title,
    message: o.message,
    detail: o.detail,
    action: o.action,
    timeoutMs: o.timeoutMs,
    dedupeKey: o.dedupeKey ?? o.code,
  });
  if (!shown) {
  }
}

export function notifyInfo(
  p: Omit<PushNotifyInput, "level">,
): void {
  notify({ ...p, level: "info" });
}
export function notifySuccess(
  p: Omit<PushNotifyInput, "level">,
): void {
  notify({ ...p, level: "success" });
}
export function notifyWarning(
  p: Omit<PushNotifyInput, "level">,
): void {
  notify({ ...p, level: "warning" });
}
export function notifyError(
  p: Omit<PushNotifyInput, "level">,
): void {
  notify({ ...p, level: "error" });
}


export function notifyStdbMessage(
  code: (typeof NOTIFY_CODES)[keyof typeof NOTIFY_CODES] | string,
  title: string,
  message: string,
  detail?: string,
  action = "If this persists, check that SpacetimeDB is running and the module is published.",
): void {
  notifyError({
    code,
    title,
    message,
    detail,
    action,
    source: "spacetimedb",
    dedupeKey: `${code}:${detail ?? message}`,
  });
}
