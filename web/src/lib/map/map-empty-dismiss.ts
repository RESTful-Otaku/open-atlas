const KEY = "openatlas-map-empty-hint-dismissed";

export function isMapEmptyHintDismissed(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissMapEmptyHint(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* private mode */
  }
}

export function resetMapEmptyHintDismiss(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* */
  }
}
